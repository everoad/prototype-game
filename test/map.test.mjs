import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { buildMap } from '../src/sim/map.js';
import { waterCellCenter } from './helpers.mjs';

const m = buildMap(makeRules());

test('편 0 거점 자리 (§2.1)', () => {
  const s0 = m.strongholds.filter(s => s.side === 0);
  assert.deepEqual(s0.find(s => s.kind === 'hq'), { id: 'hq0', side: 0, kind: 'hq', x: 600, z: 60, radius: 80, slots: 4 });
  assert.deepEqual(s0.filter(s => s.kind === 'front').map(s => [s.x, s.z]), [[350, 250], [850, 250]]);
  assert.deepEqual(s0.filter(s => s.kind === 'rear').map(s => [s.x, s.z]), [[250, 150], [950, 150]]);
});

test('편 1은 위아래로 뒤집은 자리, 승점 3곳', () => {
  assert.equal(m.strongholds.find(s => s.id === 'hq1').z, 740);
  assert.deepEqual(m.strongholds.filter(s => s.kind === 'vp').map(s => [s.x, s.z, s.radius]), [[250, 400, 60], [600, 400, 60], [950, 400, 60]]);
  assert.deepEqual(m.strongholds.filter(s => s.kind !== 'vp').map(s => s.id).sort(),
    ['f0L', 'f0R', 'f1L', 'f1R', 'hq0', 'hq1', 'r0L', 'r0R', 'r1L', 'r1R']);
});

test('구역 선분은 구역 가운데 60%, 승점 선에서 10 m', () => {
  assert.deepEqual(m.sectors.filter(s => s.side === 0).map(s => [s.x0, s.x1, s.z]), [[60, 360, 390], [470, 730, 390], [840, 1140, 390]]);
  assert.deepEqual(m.sectors.filter(s => s.side === 1).map(s => s.z), [410, 410, 410]);
  assert.deepEqual(m.sectors.filter(s => s.side === 0).map(s => s.id), ['s0-left', 's0-center', 's0-right']);
});

test('지형: 이음매는 숲·언덕, 여울이 있고, 물은 못 걷는다', () => {
  assert.ok([1, 2].includes(m.terrain[m.cellOf(420, 400)]));
  assert.ok(m.terrain.some(t => t === 4));
  assert.equal(m.walkable(...waterCellCenter(m)), false);
  assert.equal(m.walkable(600, 300), true);
  assert.equal(m.walkable(-5, 300), false);
  assert.equal(m.speedMult(420, 400) < 1, true);
});
