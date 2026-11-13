// 6-1단계 최종 검토(새 눈 검토자)에서 나온 것: 공격 명령·어택땅의 사제, 공격 무리 다시 서기의 특수 병종, 기사 쐐기의 기병 규칙,
// 포위 뒤 틀린 알림·겹친 알림, 몸 병종 찾기를 한 틱에 한 번.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INFANTRY, CAVALRY, ARCHER, PRIEST, KNIGHT, MAGE, GOLEM } from '../src/sim/rules.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, rebuildGrid } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { relink, stepSiege } from '../src/sim/territory.js';
import { anyBody } from '../src/sim/combat.js';

const block = (w, side, t, n, cx, z, cols = 30, gap = 1) => { const ids = []; for (let k = 0; k < n; k++) ids.push(spawn(w.soldiers, side, t, cx - (Math.min(n, cols) - 1) * gap / 2 + (k % cols) * gap, z - (side === 0 ? 1 : -1) * Math.floor(k / cols) * gap, w.rules)); return ids; };
function closest(w, priests, foes) {
  const s = w.soldiers;
  let best = Infinity;
  for (const p of priests) if (s.alive[p]) for (const f of foes) if (s.alive[f]) best = Math.min(best, Math.hypot(s.x[p] - s.x[f], s.z[p] - s.z[f]));
  return best;
}
function priestScene(mode) {
  const w = createWorld(), s = w.soldiers;
  const inf = block(w, 0, INFANTRY, 90, 600, 200), priests = block(w, 0, PRIEST, 10, 600, 186, 10, 1.4);
  const foes = block(w, 1, INFANTRY, 180, 600, 262);
  rebuildGrid(s);
  const deep = foes[foes.length - 15];                              // 뒷줄 적(앞줄은 금방 쓰러져 명령이 일찍 끝난다)
  const target = mode === 'foe' ? { kind: 'foe', id: deep, serial: s.serial[deep] } : { kind: 'point', x: 600, z: 340 };
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...inf, ...priests] }, target, engage: mode === 'amove' }).ok);
  let min = Infinity;
  for (let k = 0; k < 400; k++) { step(w); min = Math.min(min, closest(w, priests, foes)); }
  return { w, priests, min };
}

test('공격 명령으로 보낸 사제는 적에게 가지 않고 뒤에 선다', () => {
  const { w, priests, min } = priestScene('foe');
  assert.ok(min >= 6, `가장 가까이 간 거리 ${min.toFixed(1)} m`);
  assert.equal(priests.filter(i => w.soldiers.alive[i]).length, 10);
});

test('어택땅으로 보낸 사제는 싸움이 붙으면 목적지로 뚫고 가지 않는다', () => {
  const { w, priests, min } = priestScene('amove');
  assert.ok(min >= 6, `가장 가까이 간 거리 ${min.toFixed(1)} m`);
  assert.equal(priests.filter(i => w.soldiers.alive[i]).length, 10);
});

test('공격 무리가 다시 설 때 기사·마법사·골렘도 자리를 받는다', () => {
  const w = createWorld(), s = w.soldiers, ids = {};
  const put = (t, n, z) => { ids[t] = []; for (let k = 0; k < n; k++) ids[t].push(spawn(s, 0, t, 590 + (k % 20), z - Math.floor(k / 20), w.rules)); };
  put(INFANTRY, 60, 200); put(CAVALRY, 20, 190); put(KNIGHT, 20, 185); put(MAGE, 20, 180); put(GOLEM, 4, 175); put(ARCHER, 20, 170);
  const foe = spawn(s, 1, INFANTRY, 600, 250, w.rules);
  rebuildGrid(s);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: Object.values(ids).flat() }, target: { kind: 'foe', id: foe, serial: s.serial[foe] } });
  for (let k = 0; k < 1600 && !w.squads[0]?.formed; k++) step(w);
  assert.ok(w.squads[0]?.formed, '무리가 섰다');
  for (const t of [KNIGHT, MAGE, GOLEM]) assert.ok(ids[t].filter(i => s.alive[i]).every(i => !Number.isNaN(s.restFacing[i])), `병종 ${t}`);
});

test('기사 쐐기는 기병처럼: 적을 보면 진형째 박지 않고 풀려서 하나하나 사냥한다', () => {
  const w = createWorld(), s = w.soldiers;
  const knights = block(w, 0, KNIGHT, 40, 600, 230, 10, 2);
  block(w, 1, INFANTRY, 50, 600, 285, 10, 1.2);
  rebuildGrid(s);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: knights }, target: { kind: 'point', x: 600, z: 330 }, engage: true }).ok);
  let charged = false;
  for (let k = 0; k < 40; k++) { step(w); if (w.groups.some(g => g.cls === 'knight' && g.charging)) charged = true; }
  assert.equal(charged, false);
  assert.ok(knights.every(i => s.group[i] < 0), '풀렸다');
});

test('우리 땅이 포위로 넘어가도 "적 땅을 포위했다"가 잘못 뜨지 않는다', () => {
  const w = createWorld({ map: 'legion' }), T = w.territory, R = w.map.regions, h0 = w.map.homes[0], h1 = w.map.homes[1];
  const ours = [h0, ...R[h0].neighbors];                            // 덩어리는 우리 본진 쪽 땅과 맞닿지 않아야 끊긴 땅이다
  const pocket = R.find(g => g.id !== h1 && !g.neighbors.includes(h1) && !ours.some(x => x === g.id || g.neighbors.includes(x))).id;
  for (const g of R) T[g.id].owner = g.id === h0 || g.id === pocket || R[h0].neighbors.includes(g.id) ? 0 : 1;
  relink(w);
  let flipped = false;
  for (let k = 0; k < 200 && !flipped; k++) flipped = stepSiege(w, 0.5);
  assert.ok(flipped && T[pocket].owner === 1);
  assert.equal(w.notices.filter(n => n.kind === 'encircle').length, 0);
});

test('포위로 얻은 땅: 땅 알림은 포위 알림 하나, 사건에는 얻음과 잃음이 함께', () => {
  const w = createWorld({ map: 'legion' }), T = w.territory, R = w.map.regions, h1 = w.map.homes[1];
  const pocket = R.find(g => g.mirror && g.id !== h1 && !g.neighbors.includes(h1));   // 적 본진과 맞닿지 않은 적 땅 하나
  for (const g of R) T[g.id].owner = g.id === h1 || g.id === pocket.id ? 1 : 0;
  relink(w);
  let flipped = false;
  for (let k = 0; k < 200 && !flipped; k++) { w.events.length = 0; flipped = stepSiege(w, 0.5); }
  assert.ok(flipped && T[pocket.id].owner === 0);
  assert.equal(w.notices.filter(n => n.kind === 'land').length, 0);
  assert.equal(w.notices.filter(n => n.kind === 'siegeGain').length, 1);
  assert.ok(w.events.some(e => e.kind === 'gain' && e.region === pocket.id && e.side === 0));
  assert.ok(w.events.some(e => e.kind === 'lose' && e.region === pocket.id && e.side === 1));
});

test('몸 병종 찾기는 한 틱에 한 번(같은 틱 두 번째 부름은 기억한 답)', () => {
  const w = createWorld(), s = w.soldiers, g = spawn(s, 0, GOLEM, 600, 200, w.rules);
  w.tick = 7;
  assert.equal(anyBody(w), true);
  s.alive[g] = 0;
  assert.equal(anyBody(w), true, '같은 틱');
  w.tick = 8;
  assert.equal(anyBody(w), false, '다음 틱');
});
