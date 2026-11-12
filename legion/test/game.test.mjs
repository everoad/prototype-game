// 게임 판(2단계): 군단 영지 지도 + 괴물 소굴 + 양쪽 시작 군대(병종마다 쐐기 하나). 시범 행동으로 땅을 잡아 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { makeApi, actionRunner } from '../src/sim/labs.js';
import { setupGame, demoActions } from '../src/sim/game.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';

const counts = (w, side) => { const n = [0, 0, 0, 0, 0], s = w.soldiers; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side) n[s.type[i]]++; return n; };
const region = (w, role) => w.map.regions.find(g => g.role === role && g.z < 400);

test('게임 판: 양쪽 시작 군대는 병종마다 쐐기 하나, 소굴 열일곱', () => {
  const w = createWorld({ map: 'legion' });
  setupGame(w);
  const a = counts(w, 0), b = counts(w, 1);
  assert.deepEqual([a[INFANTRY], a[SPEAR], a[ARCHER], a[CAVALRY]], [150, 150, 150, 63]);
  assert.deepEqual([b[INFANTRY], b[SPEAR], b[ARCHER], b[CAVALRY]], [300, 250, 135, 86]);
  assert.equal(w.camps.length, 17);
  const s = w.soldiers;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] < 2) assert.ok(w.map.walkable(s.x[i], s.z[i]));
});

test('게임 판: 성채 둘, 시작 자원', () => {
  const w = createWorld({ map: 'legion' });
  setupGame(w);
  const cit = w.buildings.filter(b => b.type === 'citadel');
  assert.deepEqual(cit.map(b => [b.side, b.x, b.z, b.done]), [[0, 600, 48, true], [1, 600, 752, true]]);
  assert.equal(w.map.walkable(600, 48), false);
  assert.equal(w.map.walkable(600, 752), false);
  for (const h of w.map.homes) assert.equal(w.map.walkable(w.map.regions[h].x, w.map.regions[h].z), true, '본진 깃발 자리');
  for (const S of w.sides) assert.deepEqual([S.gold, S.wood, S.mana], [400, 300, 0]);
});

test('시범: 캐고 짓고 뽑는다', () => {
  const w = createWorld({ map: 'legion' });
  setupGame(w);
  const api = makeApi({ createWorld, step, spawn, applyOrder }), due = actionRunner(demoActions(w, api)), s = w.soldiers, S = w.sides[0];
  let trained = 0, worst = 0;
  assert.doesNotThrow(() => {
    while (w.time < 240) {
      due(w, api); step(w);
      trained += w.events.filter(e => e.kind === 'trained' && e.side === 0).length;
      worst = Math.min(worst, S.gold, S.wood, S.mana);
      if (S.pop > S.popCap + 1e-6 && w.tick % 10 === 1) assert.fail(`인구 ${S.pop} > 상한 ${S.popCap}`);
    }
  });
  const done = type => w.buildings.filter(b => b.side === 0 && b.type === type && b.done).length;
  assert.ok(done('goldmine') >= 3, `금광 ${done('goldmine')}`);
  assert.ok(done('lumbermill') >= 2, `벌목소 ${done('lumbermill')}`);
  assert.equal(done('barracks'), 1);
  assert.ok(trained >= 3, `뽑은 쐐기 ${trained}`);
  const n = counts(w, 0);
  assert.ok(n[INFANTRY] + n[SPEAR] >= 600, `보병 ${n[INFANTRY]} + 방패병 ${n[SPEAR]}`);
  for (const role of ['gold', 'forest', 'fort']) assert.equal(w.territory[region(w, role).id].owner, 0, role);
  assert.ok(worst >= -1e-6, `자원 최저 ${worst}`);
});

test('시범(옛 땅 시범): 금광 지대·숲·앞 요새를 잡고 마나 샘 소굴과 싸운다', () => {
  const w = createWorld({ map: 'legion' });
  setupGame(w);
  const api = makeApi({ createWorld, step, spawn, applyOrder }), due = actionRunner(demoActions(w, api));
  const ley = w.camps.find(c => c.region === region(w, 'ley').id), s = w.soldiers;
  const leyAlive = () => ley.ids.filter((i, k) => s.alive[i] && s.serial[i] === ley.serials[k]).length, ley0 = leyAlive();
  assert.doesNotThrow(() => { while (w.time < 150) { due(w, api); step(w); } });
  for (const role of ['gold', 'forest', 'fort']) assert.equal(w.territory[region(w, role).id].owner, 0, role);
  assert.ok(leyAlive() < ley0, `마나 샘 소굴 ${ley0} → ${leyAlive()}`);
});
