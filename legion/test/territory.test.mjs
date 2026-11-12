// 점령과 이어짐(설계서 §4 땅 — 영지 규칙): 깃발 원 안에 한 편만 있으면 잡는다, 이웃한 땅만, 적 땅은 먼저 중립으로,
// 소굴이 살아 있으면 못 잡는다, 본진에서 제 땅으로 이어진 땅만 이어짐.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { killSoldier } from '../src/sim/combat.js';
import { spawnCamps } from '../src/sim/camps.js';
import { relink } from '../src/sim/territory.js';
import { INFANTRY } from '../src/sim/rules.js';

const legion = () => createWorld({ map: 'legion' });
const region = (w, i, j) => w.map.regions.find(g => g.i === i && g.j === j);
const block = (w, side, n, x, z, type = INFANTRY) => Array.from({ length: n }, (_, k) => spawn(w.soldiers, side, type, x - 8.4 + (k % 15) * 1.2, z - 5 + Math.floor(k / 15) * 1.2, w.rules));
const until = (w, sec, cond) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) { step(w); if (cond()) return w.time; } return null; };
const run = (w, sec) => until(w, sec, () => false);

test('처음: 본진만 제 편 땅이고 이어져 있다', () => {
  const w = legion(), T = w.territory;
  assert.equal(T.length, 25);
  for (const g of w.map.regions) {
    const t = T[g.id];
    if (g.home >= 0) { assert.equal(t.owner, g.home); assert.equal(t.connected[g.home], true); }
    else { assert.equal(t.owner, -1); assert.deepEqual(t.connected, [false, false]); }
  }
});

test('이웃한 중립 땅은 깃발에 서면 잡힌다 — 보병 150명이면 약 7초, 한 명이면 약 20초', () => {
  const w = legion(), gold = region(w, 1, 0);
  block(w, 0, 150, gold.x, gold.z);
  const t = until(w, 8, () => w.territory[gold.id].owner === 0);
  assert.ok(t !== null, '8초 안에 잡지 못했다');
  const w1 = legion(), g1 = region(w1, 1, 0);
  w1.rules.units[0][INFANTRY].speed = 0;
  spawn(w1.soldiers, 0, INFANTRY, g1.x, g1.z, w1.rules);
  run(w1, 19);
  assert.equal(w1.territory[g1.id].owner, -1, '19초엔 아직');
  run(w1, 2);
  assert.equal(w1.territory[g1.id].owner, 0, '21초엔 편 0');
});

test('이웃하지 않은 땅은 못 잡는다', () => {
  const w = legion(), center = region(w, 2, 2);
  block(w, 0, 150, center.x, center.z);
  run(w, 30);
  assert.equal(w.territory[center.id].owner, -1);
});

test('적 땅은 먼저 중립이 되고 그다음 우리 것', () => {
  const w = legion(), gold = region(w, 1, 0), t = w.territory[gold.id];
  t.owner = 1; t.hold = 1; relink(w);
  block(w, 0, 150, gold.x, gold.z);
  const seen = [];
  until(w, 20, () => { for (const e of w.events) if ((e.kind === 'lose' || e.kind === 'gain') && e.region === gold.id) seen.push(`${e.kind}${e.side}`); return t.owner === 0; });
  assert.deepEqual(seen, ['lose1', 'gain0']);
  assert.equal(t.owner, 0);
});

test('두 편이 함께 서면 겨룸 — 진전 없음', () => {
  const w = legion(), gold = region(w, 1, 0), t = w.territory[gold.id];
  w.rules.units[0][INFANTRY].speed = 0; w.rules.units[1][INFANTRY].speed = 0;
  block(w, 0, 20, gold.x, gold.z - 6);
  block(w, 1, 20, gold.x, gold.z + 8);
  run(w, 10);
  assert.equal(t.prog, 0);
  assert.equal(t.owner, -1);
  assert.equal(t.contested, true);
});

test('소굴이 살아 있으면 깃발 원이 비어도 못 잡는다', () => {
  const w = legion(), s = w.soldiers;
  spawnCamps(w);
  const ley = region(w, 0, 0), gold = region(w, 1, 0), camp = w.camps.find(c => c.region === ley.id);
  for (const u of w.rules.units[2]) u.speed = 0;
  for (const i of camp.ids) { s.x[i] = s.px[i] = ley.x + 80; s.z[i] = s.pz[i] = ley.z + (i % 10); }
  w.territory[gold.id].owner = 0; w.territory[gold.id].hold = 1; relink(w);
  block(w, 0, 150, ley.x, ley.z);
  run(w, 30);
  assert.equal(w.territory[ley.id].owner, -1, '소굴이 살아 있는 동안');
  for (const i of camp.ids) killSoldier(w, i);
  assert.ok(until(w, 8, () => w.territory[ley.id].owner === 0) !== null, '소굴을 쓰러뜨린 뒤 8초 안에');
});

test('끊긴 땅: 가운데를 잃으면 그 너머는 이어지지 않는다', () => {
  const w = legion(), T = w.territory, fort = region(w, 2, 1), ruins = region(w, 1, 1), home = w.map.homes[0];
  assert.ok(w.map.regions[home].neighbors.includes(fort.id) && fort.neighbors.includes(ruins.id) && !w.map.regions[home].neighbors.includes(ruins.id));
  T[fort.id].owner = 0; T[ruins.id].owner = 0; relink(w);
  assert.equal(T[ruins.id].connected[0], true);
  T[fort.id].owner = -1; relink(w);
  assert.equal(T[ruins.id].connected[0], false);
  assert.equal(T[home].connected[0], true);
});

test('달아나는 병사는 세지 않는다', () => {
  const w = legion(), gold = region(w, 1, 0), s = w.soldiers;
  w.rules.units[0][INFANTRY].speed = 0;
  for (const i of block(w, 0, 150, gold.x, gold.z)) s.state[i] = STATE.FLEE;
  run(w, 10);
  assert.equal(w.territory[gold.id].owner, -1);
});

test('시험장 지도에는 땅이 없다', () => {
  const w = createWorld();
  assert.equal(w.territory, null);
  run(w, 1);
});
