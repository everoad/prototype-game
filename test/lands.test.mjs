// 작은 땅(설계서 2026-11-09-flood-small-lands-design.md): 맵 자료 파일, 땅 10곳, 땅의 규칙.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { INFANTRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';
import { updateVision, canSee } from '../src/sim/vision.js';
import { rightClickTarget } from '../src/view/select.js';
import { makeStats } from '../src/sim/stats.js';
import { isPoint, FOREST, WATER, FORD } from '../src/sim/map.js';

const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
const st = (w, id) => w.strongholds.find(x => x.id === id);
const run = (w, sec) => { for (let k = 0; k < Math.round(sec * 20); k++) step(w); };
function block(w, n, x, z, side = 0, cols = 5) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const px = x + (k % cols) * 1.4 - 3, pz = z + Math.floor(k / cols) * 1.4 - 3, id = spawn(w.soldiers, side, INFANTRY, px, pz, w.rules);
    setGoal(w, [id], { kind: 'point', x: px, z: pz }); w.soldiers.state[id] = STATE.FRONT; ids.push(id);
  }
  return ids;
}
const own = (w, id, side) => { const s = st(w, id); s.owner = side; s.gauge = side === 0 ? 100 : side === 1 ? -100 : 0; };

test('맵 자료 파일로 만든 거점·승점·구역 자리가 전과 같다', () => {
  const w = empty(), m = w.map;
  assert.deepEqual(w.strongholds.slice(0, 13).map(x => x.id), ['hq0', 'f0L', 'f0R', 'r0L', 'r0R', 'hq1', 'f1L', 'f1R', 'r1L', 'r1R', 'vpL', 'vpC', 'vpR']);
  const at = id => { const s = st(w, id); return [s.x, s.z, s.radius]; };
  assert.deepEqual(at('hq0'), [600, 60, 80]); assert.deepEqual(at('f0L'), [350, 250, 60]); assert.deepEqual(at('r1R'), [950, 650, 60]); assert.deepEqual(at('vpC'), [600, 400, 60]);
  const sec = id => { const s = m.sectors.find(x => x.id === id); return [s.x0, s.x1, s.z]; };
  assert.deepEqual(sec('s0-left'), [160, 360, 390]); assert.deepEqual(sec('s1-right'), [840, 1040, 410]);   // 양 끝 100 m 비움(작은 땅 길목)
  assert.equal(m.terrain[m.cellOf(420, 400)], FOREST); assert.equal(m.terrain[m.cellOf(140, 300)], WATER); assert.equal(m.terrain[m.cellOf(140, 400)], FORD);
  assert.equal(m.width, 1200); assert.equal(m.depth, 800); assert.equal(m.routes.length, 4);
});

test('땅 10곳이 표대로 생기고 처음 주인이 맞다', () => {
  const w = empty(), lands = w.strongholds.filter(x => x.kind === 'land');
  assert.equal(lands.length, 10);
  const is = (id, x, z, landKind, owner) => { const s = st(w, id); assert.deepEqual([s.x, s.z, s.landKind, s.owner], [x, z, landKind, owner], id); };
  is('e0L', 80, 220, 'edge', 0); is('e0R', 1120, 220, 'edge', 0); is('k0L', 420, 70, 'deep', 0); is('k0R', 780, 70, 'deep', 0);
  is('e1L', 80, 580, 'edge', 1); is('k1L', 420, 730, 'deep', 1); is('k1R', 780, 730, 'deep', 1);
  is('cL', 80, 400, 'choke', null); is('cR', 1120, 400, 'choke', null);
  for (const s of lands) { assert.equal(s.radius, 30); assert.equal(s.slots.length, 0); assert.ok(isPoint(s)); }
  assert.ok(isPoint(st(w, 'vpC')) && !isPoint(st(w, 'f0L')));
});

// ---- Task 2: 땅의 규칙 ----
test('점령: 중립 길목을 혼자 15초에 먹고, 적 땅은 30초에 내 것이 된다', () => {
  const w = empty();
  block(w, 20, 80, 400);
  run(w, 14); assert.equal(st(w, 'cL').owner, null);
  run(w, 1.5); assert.equal(st(w, 'cL').owner, 0);
  const v = empty();
  block(v, 20, 80, 580);
  run(v, 29); assert.notEqual(st(v, 'e1L').owner, 0);
  run(v, 1.5); assert.equal(st(v, 'e1L').owner, 0);
});

test('금: 땅 주인이 1분에 표의 금을 더 번다', () => {
  const gain = withChoke => { const w = empty(); w.production = true; if (withChoke) own(w, 'cL', 0); const g0 = w.sides[0].gold; run(w, 60); return w.sides[0].gold - g0; };
  const d = gain(true) - gain(false);
  assert.ok(Math.abs(d - 20) < 0.5, `차이 ${d.toFixed(2)}`);
});

test('경보: 적이 우리 땅에 들어오면 공격받음, 땅에는 징집·막아라·공성·짓기가 안 된다', () => {
  const w = empty(); w.sides[0].gold = 999;
  block(w, 5, 80, 220, 1);
  run(w, 0.5);
  assert.ok(w.sides[0].alerts.some(a => a.kind === 'attacked' && a.stronghold === 'e0L'), JSON.stringify(w.sides[0].alerts));
  assert.equal(applyOrder(w, { kind: 'cast', side: 0, order: 'levy', stronghold: 'e0L' }).reason, '우리 거점이 아니다');
  assert.equal(applyOrder(w, { kind: 'holdTheLine', side: 0, stronghold: 'e0L' }).ok, false);
  assert.equal(applyOrder(w, { kind: 'buySiege', side: 0, stronghold: 'e0L' }).ok, false);
  assert.equal(applyOrder(w, { kind: 'build', side: 0, stronghold: 'e0L', slot: 0, building: 'archery' }).reason, '거점이 아니다');   // 칸이 없어서(없는 칸)가 아니라 땅이라서
});

test('땅을 잃어도 사기·승점 수가 그대로', () => {
  const w = empty();
  block(w, 20, 80, 220, 1);
  const m0 = w.sides[0].morale;
  run(w, 31);
  assert.equal(st(w, 'e0L').owner, 1, '땅을 잃었다');
  assert.equal(w.sides[0].morale, m0); assert.equal(w.moraleLog.length, 0); assert.deepEqual(w.vpCount, [0, 0]);
});

test('시야: 길목을 쥐면 둘레 200 m, 땅은 100 m', () => {
  const w = empty(); own(w, 'cL', 0);
  updateVision(w);
  assert.equal(canSee(w, 0, 80, 590), true, '길목에서 190 m');
  assert.equal(canSee(w, 0, 80, 70), false, '가장자리 땅에서 150 m');
  assert.equal(canSee(w, 0, 80, 140), true, '가장자리 땅에서 80 m');
});

test('오른쪽 클릭: 땅 원 안이면 그 땅(어택땅)', () => {
  const w = empty();
  assert.deepEqual(rightClickTarget(w, 0, { x: 85, z: 405 }), { kind: 'stronghold', id: 'cL' });
});

test('아무도 명령하지 않으면 60초 뒤에도 두 길목은 중립이다(정면 구역 끝이 길목에 닿지 않는다)', () => {
  const w = createWorld({ seed: 1, scenario: 'battle' });
  run(w, 60);
  assert.deepEqual(['cL', 'cR'].map(id => st(w, id).owner), [null, null]);
  for (const s of w.map.sectors) for (const id of ['cL', 'cR']) {
    const c = st(w, id), x = Math.max(s.x0, Math.min(s.x1, c.x));
    assert.ok(Math.hypot(c.x - x, c.z - s.z) > c.radius + 30, `${s.id}가 ${id}에서 ${Math.hypot(c.x - x, c.z - s.z).toFixed(0)} m`);
  }
});

// ---- 리뷰에서 미룬 작은 것(2026-11-09) ----
test('통계: 경유점으로 적 땅에 보낸 것은 거점 기습과 따로 센다', () => {
  const w = createWorld({ seed: 1, scenario: 'battle' });
  w.metrics = makeStats({ seed: 1 });
  const s = w.soldiers, ids = [];
  for (let i = 0; i < s.count && ids.length < 20; i++) if (s.alive[i] && s.side[i] === 0 && s.state[i] !== STATE.GARRISON) ids.push(i);
  const land = w.strongholds.find(x => x.kind === 'land' && x.owner === 1);
  step(w, [{ kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'stronghold', id: land.id }, via: [{ x: land.x, z: land.z - 60 }] }]);
  const rep = w.metrics.finish(w);
  assert.equal(rep.raids, 0); assert.equal(rep.landRaids, 1);
});
