// 건물·광부 조 그리기 자료(3단계 계획 Task 8 — three 없이 셈만): 건물 위 띠(체력·일)와 광부 조 표식 자리.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { addBuilding } from '../src/sim/buildings.js';
import { spawnCrew } from '../src/sim/workers.js';
import { killSoldier } from '../src/sim/combat.js';
import { barsOf } from '../src/view/buildingBars.js';
import { crewMarks } from '../src/view/crewMarks.js';

const fake = (o = {}) => ({ done: true, hp: 1000, maxHp: 1000, progress: 1, queue: [], lastHit: -1e9, ...o });

test('건물 띠: 멀쩡하고 한가하면 없고, 다치면 체력, 짓거나 뽑거나 연구하면 일', () => {
  assert.deepEqual(barsOf(fake(), 0), { hp: null, work: null, kind: null });
  assert.deepEqual(barsOf(fake({ hp: 500 }), 0), { hp: 0.5, work: null, kind: null });
  assert.deepEqual(barsOf(fake({ done: false, progress: 0.3, hp: 370 }), 0), { hp: null, work: 0.3, kind: 'build' });
  const t = barsOf(fake({ queue: [{ kind: 'unit', key: 'infantry', left: 10, total: 25, started: true }] }), 0);
  assert.equal(t.kind, 'train');
  assert.ok(Math.abs(t.work - 0.6) < 1e-9);
  assert.equal(barsOf(fake({ queue: [{ kind: 'research', key: 'longbow', left: 30, total: 40, started: true }] }), 0).kind, 'research');
  assert.deepEqual(barsOf(fake({ queue: [{ kind: 'unit', key: 'infantry', left: 25, total: 25, started: false }] }), 0), { hp: null, work: 0, kind: 'train' });
  assert.equal(barsOf(fake({ done: false, progress: 0.3, hp: 200, lastHit: 5 }), 6).hp, 0.2, '짓다가 맞으면 체력도');
});

test('광부 조 표식: 조마다 가운데·수·쉬는 중인가, 죽은 광부는 빼고 다 죽은 조는 없다', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers;
  const a = spawnCrew(w, 0, 650, 120, 0), b = spawnCrew(w, 0, 700, 120, 0), c = spawnCrew(w, 0, 750, 120, 0);
  spawnCrew(w, 1, 650, 680, 0);
  const bar = addBuilding(w, 0, 'barracks', 700, 160);
  for (const i of b) s.job[i] = bar.id;
  killSoldier(w, a[0]); killSoldier(w, a[1]);
  for (const i of c) killSoldier(w, i);
  const marks = crewMarks(w, 0);
  assert.equal(marks.length, 2);
  const [ma, mb] = marks;
  assert.deepEqual([ma.crew, ma.n, ma.idle], [s.crew[a[2]], 8, true]);
  assert.deepEqual([mb.crew, mb.n, mb.idle], [s.crew[b[0]], 10, false]);
  assert.ok(Math.abs(mb.x - 700) < 0.01 && Math.abs(mb.z - 120) < 0.01);
  assert.equal(crewMarks(w, 1).length, 1);
});
