// PC 조작(설계서 §5, 사용자 2026-11-08): 고른 병사 보내기, "그 자리"로 보내기, 곳을 눌러 고르는 병사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, kill, STATE, GOAL } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';
import { spawnGarrisons } from '../src/sim/production.js';
import { placeTroops, boxTroops, fortInfo } from '../src/view/select.js';

const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });

// (x, z) 둘레에 우리(또는 side) 병사 n명 — 구역 s0-left 소속으로 그 자리에 세운다.
function standAt(w, n, x, z, { side = 0, type = SPEAR, sector = 's0-left' } = {}) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const id = spawn(w.soldiers, side, type, x + (k % 8) * 1.6, z + Math.floor(k / 8) * 1.6, w.rules);
    if (side === 0) setGoal(w, [id], { kind: 'sector', id: sector });
    w.soldiers.state[id] = STATE.FRONT;
    ids.push(id);
  }
  return ids;
}

test('고른 병사 보내기: 우리 편·살아 있는·수비대 아닌 병사만 간다', () => {
  const w = empty();
  const ours = standAt(w, 10, 300, 300);
  const foe = standAt(w, 2, 300, 340, { side: 1 });
  const dead = standAt(w, 1, 300, 310)[0];
  kill(w.soldiers, dead);
  const guard = standAt(w, 1, 300, 312)[0];
  w.soldiers.state[guard] = STATE.GARRISON;
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...ours, ...foe, dead, guard] }, target: { kind: 'sector', id: 's0-center' } });
  assert.ok(r.ok, r.reason);
  assert.equal(r.count, 10);
  for (const i of ours) assert.ok(w.soldiers.group[i] >= 0, '우리 병사는 진형으로 간다');
  for (const i of [...foe, guard]) assert.equal(w.soldiers.group[i], -1);
  assert.equal(w.soldiers.state[guard], STATE.GARRISON);
});

test('행군 중인 쐐기에서 고른 병사는 그 쐐기에서 빠지고, 다 빠진 쐐기는 바로 지운다', () => {
  const w = empty();
  const a = standAt(w, 12, 300, 300), b = standAt(w, 12, 600, 300);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: a }, target: { kind: 'sector', id: 's0-center' } });
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: b }, target: { kind: 'sector', id: 's0-right' } });
  const ga = w.soldiers.group[a[0]], gb = w.soldiers.group[b[0]];
  assert.notEqual(ga, -1); assert.notEqual(gb, -1);
  // a 쐐기는 통째로, b 쐐기는 절반만 다시 보낸다
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...a, ...b.slice(0, 6)] }, target: { kind: 'sector', id: 's0-left' } });
  assert.ok(!w.groups.some(g => g.id === ga), '다 빠진 쐐기 a는 없다');
  const left = w.groups.find(g => g.id === gb);
  assert.ok(left, '쐐기 b는 남은 병사로 간다');
  assert.deepEqual([...left.members].sort((x, y) => x - y), b.slice(6).sort((x, y) => x - y));
  for (const i of [...a, ...b.slice(0, 6)]) assert.notEqual(w.soldiers.group[i], gb);
});

test('그 자리로 보내기: 한 점에 엉기지 않게 무리 크기에 맞춘 원 안에 흩어 선다', () => {
  const w = empty();
  const ids = standAt(w, 60, 300, 300, { type: ARCHER });
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 320, z: 220 } });
  assert.ok(r.ok, r.reason);
  run(w, 60);
  const s = w.soldiers;
  const spots = new Set(ids.map(i => `${s.goalX[i].toFixed(1)},${s.goalZ[i].toFixed(1)}`));
  assert.ok(spots.size > 50, `자리가 겹치지 않는다(${spots.size}/60)`);
  for (const i of ids) {
    assert.equal(s.goalKind[i], GOAL.POINT);
    assert.ok(Math.hypot(s.goalX[i] - 320, s.goalZ[i] - 220) < 20, '자리는 점 둘레 원 안');
  }
  const near = ids.filter(i => Math.hypot(s.x[i] - 320, s.z[i] - 220) < 25).length;
  assert.ok(near >= 55, `60초 뒤 그 자리에 섰다(${near}/60)`);
});

test('그 자리로 보낸 병사는 강을 돌아(여울로) 간다', () => {
  const w = empty();
  const ids = standAt(w, 16, 200, 300);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 100, z: 300 } }).ok);
  run(w, 150);
  const s = w.soldiers, near = ids.filter(i => Math.hypot(s.x[i] - 100, s.z[i] - 300) < 30).length;
  assert.ok(near >= 14, `강 건너 그 자리에 닿았다(${near}/16)`);
});

test('물 위 점으로는 보내지 않는다', () => {
  const w = empty();
  const ids = standAt(w, 4, 200, 300);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 140, z: 300 } });
  assert.equal(r.ok, false);
});

test('곳을 눌러 고르기: 승점은 원 안에 선 우리 병사(구역 소속이어도), 수비대·달아나는 병사·적은 빼고', () => {
  const w = empty();
  const inside = standAt(w, 10, 240, 380);                   // vpL(250, 400) 원 안, 구역 s0-left 소속
  const outside = standAt(w, 5, 250, 300);                   // 원 밖
  const flee = standAt(w, 1, 250, 395)[0];
  w.soldiers.state[flee] = STATE.FLEE;
  standAt(w, 3, 260, 410, { side: 1 });
  const got = placeTroops(w, 0, { kind: 'stronghold', id: 'vpL' });
  assert.deepEqual([...got].sort((a, b) => a - b), inside);
  assert.ok(!outside.some(i => got.includes(i)));
});

test('곳을 눌러 고르기: 우리 거점은 거기 서 있는 병사 + 앞에 모이는 쐐기, 수비대는 남는다', () => {
  const w = empty();
  spawnGarrisons(w);
  const st = w.strongholds.find(x => x.id === 'f0L');
  const standing = [];
  for (let k = 0; k < 6; k++) { const id = spawn(w.soldiers, 0, SPEAR, st.x + k, st.z, w.rules); setGoal(w, [id], { kind: 'stronghold', id: 'f0L' }); standing.push(id); }
  w.production = true;
  run(w, 8);                                                   // 생산 → 거점 앞에 모이는 쐐기
  const gathering = w.groups.filter(g => g.origin === w.strongholds.indexOf(st) && g.state === 'gather').flatMap(g => g.members);
  assert.ok(gathering.length > 0, '모이는 쐐기가 있다');
  const got = new Set(placeTroops(w, 0, { kind: 'stronghold', id: 'f0L' }));
  for (const i of [...standing, ...gathering]) if (w.soldiers.alive[i]) assert.ok(got.has(i));
  for (const i of got) assert.notEqual(w.soldiers.state[i], STATE.GARRISON);
});

test('네모로 고르기: 화면 네모 안의 우리 병사(수비대·달아나는 병사 빼고)', () => {
  const w = empty();
  const a = standAt(w, 8, 100, 100), b = standAt(w, 8, 500, 500);
  const guard = standAt(w, 1, 102, 101)[0];
  w.soldiers.state[guard] = STATE.GARRISON;
  standAt(w, 4, 101, 102, { side: 1 });
  const project = (x, z) => ({ x, y: z });                    // 시험: 땅 좌표 = 화면 좌표
  const got = boxTroops(w, 0, project, { x0: 90, y0: 90, x1: 130, y1: 130 });
  assert.deepEqual([...got].sort((x, y) => x - y), a);
  assert.ok(!b.some(i => got.includes(i)));
});

test('고른 병사가 죽고 그 번호를 새 병사가 받으면 새 병사는 고른 것이 아니다', async () => {
  const { remember, stillSelected } = await import('../src/view/select.js');
  const w = empty();
  const ids = standAt(w, 3, 300, 300);
  const sel = remember(w, ids);
  kill(w.soldiers, ids[1]);
  const reborn = spawn(w.soldiers, 0, SPEAR, 300, 300, w.rules);
  assert.equal(reborn, ids[1], '죽은 번호를 다시 쓴다');
  assert.deepEqual(stillSelected(w, 0, sel).ids, [ids[0], ids[2]]);
});

test('오른쪽 클릭 목표(사용자 2026-11-08): 누른 그 자리로 — 구역은 선 바로 위(15 m 안)만, 거점·승점은 원 안', async () => {
  const { rightClickTarget } = await import('../src/view/select.js');
  const w = empty();
  const sec = w.map.sectors.find(x => x.id === 's0-center');            // 선분 z = sec.z
  assert.deepEqual(rightClickTarget(w, 0, { x: 520, z: sec.z - 60 }), { kind: 'point', x: 520, z: sec.z - 60 }, '선에서 60 m 떨어진 곳은 그 자리');
  assert.deepEqual(rightClickTarget(w, 0, { x: 520, z: sec.z - 10 }), { kind: 'sector', id: 's0-center' }, '선 바로 위는 그 구역');
  assert.deepEqual(rightClickTarget(w, 0, { x: 600, z: 400 }), { kind: 'stronghold', id: 'vpC' }, '승점 원 안');
  assert.deepEqual(rightClickTarget(w, 0, { x: 300, z: 250 }), { kind: 'stronghold', id: 'f0L' }, '거점 원 안');
  assert.equal(rightClickTarget(w, 0, { x: 140, z: 300 }), null, '물 위');
  assert.deepEqual(rightClickTarget(w, 0, { x: 520, z: sec.z - 60 }, 80), { kind: 'sector', id: 's0-center' }, '생산 방향은 넓게(80 m) 잡는다');
});

test('오른쪽 클릭 목표(사용자 2026-11-08 "승점을 고르고 적 본진·거점을 누르면 맞으면서 그냥 걷는다", 2026-11-09 "거점 안의 적을 찍으면 근처 적을 따라간다"): 가운데 건물 둘레를 누르면 밑에 적 병사가 있어도 그 거점(어택땅), 그 밖은 원 안이어도 찍은 적 공격', async () => {
  const { sendTarget } = await import('../src/view/select.js');
  const w = empty();
  const hq = w.strongholds.find(x => x.id === 'hq1');
  const guard = spawn(w.soldiers, 1, SPEAR, hq.x + 2, hq.z, w.rules);   // 본진 가운데의 수비대 — 전에는 이 병사 "공격"이 되어 가는 길의 적을 다 무시했다
  assert.deepEqual(sendTarget(w, 0, { x: hq.x, z: hq.z }, guard, hq), { kind: 'stronghold', id: 'hq1' }, '가운데 건물 둘레(core)');
  const inner = spawn(w.soldiers, 1, SPEAR, hq.x + 50, hq.z, w.rules);   // 본진 원 안, 건물 둘레 밖
  assert.deepEqual(sendTarget(w, 0, { x: hq.x + 50, z: hq.z }, inner, null), { kind: 'foe', id: inner, serial: w.soldiers.serial[inner] }, '원 안이어도 찍은 적');
  const loose = spawn(w.soldiers, 1, SPEAR, 520, 320, w.rules);         // 거점·승점 원 밖의 적
  assert.deepEqual(sendTarget(w, 0, { x: 521, z: 320 }, loose), { kind: 'foe', id: loose, serial: w.soldiers.serial[loose] });
  assert.deepEqual(sendTarget(w, 0, { x: 600, z: 400 }, -1), { kind: 'stronghold', id: 'vpC' }, '적이 없으면 원래 목표');
});

// 성벽·건물 체력 보이기(사용자 2026-11-09 "지금도 건물 성벽 체력은 보여야 할 것 같다")
test('fortInfo: 본진 처음 성벽과 건물, 올린 성벽, 성벽 없는 거점', () => {
  const w = createWorld({ seed: 1, scenario: 'battle' }), st = id => w.strongholds.find(x => x.id === id);
  const hq = fortInfo(st('hq0'), w.rules);
  assert.deepEqual(hq.wall, { hp: 40000, max: 40000 });
  assert.deepEqual(hq.buildings.map(b => [b.kind, b.hp, b.max]), [['archery', 2000, 2000], ['stable', 2000, 2000]]);
  const f = st('f0L'); f.slots[f.slotCount] = { kind: 'wall', level: 2, hp: 15000 };
  assert.deepEqual(fortInfo(f, w.rules).wall, { hp: 15000, max: 40000 });
  const r = st('f0R');
  assert.equal(fortInfo(r, w.rules).wall, null); assert.deepEqual(fortInfo(r, w.rules).buildings, []);
  r.slots[r.slotCount] = { kind: 'wall', level: 1, hp: 10000, building: true };
  assert.equal(fortInfo(r, w.rules).wall, null, '짓는 중인 성벽은 아직 서 있지 않다');
});
