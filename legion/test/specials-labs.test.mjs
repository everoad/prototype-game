// 특수 병종 시험 장면(6-1단계 계획 Task 9): 황금이 아닌 장면 여섯, 사제가 있으면 같은 싸움에서 더 산다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABS, makeApi, actionRunner, goldenLabs } from '../src/sim/labs.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';

const NEW = ['mages', 'priestsOn', 'priestsOff', 'knights', 'golems', 'specials'];
function play(name, sec = LABS[name].seconds) {
  const w = createWorld({ seed: 1 }), api = makeApi({ createWorld, step, spawn, applyOrder }), due = actionRunner(LABS[name].setup(w, api));
  while (w.time < sec) { due(w, api); step(w); }
  return w;
}
const aliveOf = (w, side) => { let n = 0; for (let i = 0; i < w.soldiers.count; i++) if (w.soldiers.alive[i] && w.soldiers.side[i] === side) n++; return n; };

test('새 장면 여섯은 황금이 아니다(황금 아홉 그대로)', () => {
  for (const n of NEW) assert.equal(LABS[n].golden, false, n);
  assert.equal(goldenLabs().length, 9);
});

test('사제가 있으면 같은 싸움에서 더 많이 산다', () => {
  assert.ok(aliveOf(play('priestsOn', 40), 0) > aliveOf(play('priestsOff', 40), 0));
});

test('보여 주기 장면(?showcase=1): 우리 특수 병종이 뽑혀 나오고 몬스터 특수 부대 넷이 선다', async () => {
  const { setupGame, showcaseActions } = await import('../src/sim/game.js');
  const w = createWorld({ map: 'legion', seed: 1 });
  setupGame(w);
  const api = makeApi({ createWorld, step, spawn, applyOrder }), due = actionRunner(showcaseActions(w, api));
  while (w.time < 50) { due(w, api); step(w); }
  const kinds = side => { const set = new Set(); for (let i = 0; i < w.soldiers.count; i++) if (w.soldiers.alive[i] && w.soldiers.side[i] === side && w.soldiers.type[i] >= 6) set.add(w.soldiers.type[i]); return [...set].sort(); };
  assert.deepEqual(kinds(1), [6, 7, 8, 9]);
  assert.deepEqual(kinds(0), [6, 8, 9], '50초면 마법사·기사·골렘(사제는 마법사 다음)');
});
