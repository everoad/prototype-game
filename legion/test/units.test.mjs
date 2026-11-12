// 부대(4단계 계획 Task 3, 설계서 §4 "부대 단위 — 병사 하나를 누르면 그 쐐기 전체"): 생산된 쐐기·시작 덩어리가 판 내내 부대로 남는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, kill } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { setupGame } from '../src/sim/game.js';
import { newUnit } from '../src/sim/units.js';
import { spawnCrew } from '../src/sim/workers.js';
import { unitTroops, boxUnits, sameTypeOnScreen } from '../src/view/select.js';
import { INFANTRY, ARCHER } from '../src/sim/rules.js';

const project = (x, z) => ({ x, y: z });                       // 화면 = 땅 좌표 그대로
const block = (w, side, type, n, x, z) => Array.from({ length: n }, (_, k) => spawn(w.soldiers, side, type, x + (k % 15) * 1.2, z + Math.floor(k / 15) * 1.2, w.rules));

test('게임 판: 시작 군대는 편마다 부대 넷, 광부는 부대 없음', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers;
  setupGame(w);
  for (const side of [0, 1]) {
    const units = new Set();
    for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side) {
      if (s.crew[i] >= 0) assert.equal(s.unit[i], -1, '광부');
      else units.add(s.unit[i]);
    }
    assert.equal(units.size, 4);
    assert.ok(![...units].includes(-1));
  }
});

test('생산된 쐐기는 새 부대 하나', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers;
  setupGame(w);
  const before = new Set(); for (let i = 0; i < s.count; i++) if (s.alive[i]) before.add(s.unit[i]);
  const bar = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  let ids = null;
  for (let k = 0; k < 600 && !ids; k++) { step(w); ids = w.events.find(e => e.kind === 'trained')?.ids ?? null; }
  assert.ok(ids);
  const u = s.unit[ids[0]];
  assert.ok(ids.every(i => s.unit[i] === u));
  assert.ok(!before.has(u));
});

test('병사 하나 → 그 부대 전체, 죽은 병사는 빼고', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers, ids = block(w, 0, INFANTRY, 150, 650, 150);
  newUnit(w, ids);
  assert.equal(unitTroops(w, ids[5]).length, 150);
  for (const i of ids.slice(0, 3)) kill(s, i);
  assert.equal(unitTroops(w, ids[5]).length, 147);
  const lone = spawn(s, 0, INFANTRY, 700, 200, w.rules);
  assert.deepEqual(unitTroops(w, lone), [lone]);
});

test('네모에 닿은 부대 전체, 광부가 섞이면 광부는 빠진다', () => {
  const w = createWorld({ map: 'legion' }), ids = block(w, 0, INFANTRY, 150, 650, 150), crew = spawnCrew(w, 0, 652, 140, 0);
  newUnit(w, ids);
  const corner = { x0: 648, y0: 148, x1: 652, y1: 152 };            // 부대 한 귀퉁이만
  assert.equal(boxUnits(w, 0, project, corner).length, 150);
  const both = boxUnits(w, 0, project, { x0: 645, y0: 135, x1: 655, y1: 152 });
  assert.equal(both.length, 150);
  assert.ok(!both.some(i => crew.includes(i)));
  assert.deepEqual(boxUnits(w, 0, project, { x0: 640, y0: 135, x1: 665, y1: 145 }).sort((a, b) => a - b), [...crew].sort((a, b) => a - b), '광부만이면 그 조');
});

test('두 번 누르기: 화면 안 같은 병종 부대 모두', () => {
  const w = createWorld({ map: 'legion' });
  const a = block(w, 0, INFANTRY, 150, 600, 150), b = block(w, 0, INFANTRY, 150, 650, 150), c = block(w, 0, INFANTRY, 150, 800, 150), arch = block(w, 0, ARCHER, 150, 600, 170);
  for (const ids of [a, b, c, arch]) newUnit(w, ids);
  const got = sameTypeOnScreen(w, 0, a[0], project, { x0: 590, y0: 140, x1: 700, y1: 200 });
  assert.equal(got.length, 300);
  assert.ok(!got.some(i => c.includes(i) || arch.includes(i)));
});
