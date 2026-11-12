import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { buildMap } from '../src/sim/map.js';
import { waterCellCenter } from './helpers.mjs';

const m = buildMap(makeRules());

test('시험장 지도 지형: 이음매는 숲·언덕, 여울이 있고, 물은 못 걷는다', () => {
  assert.ok([1, 2].includes(m.terrain[m.cellOf(420, 400)]));
  assert.ok(m.terrain.some(t => t === 4));
  assert.equal(m.walkable(...waterCellCenter(m)), false);
  assert.equal(m.walkable(600, 300), true);
  assert.equal(m.walkable(-5, 300), false);
  assert.equal(m.speedMult(420, 400) < 1, true);
});

// ---- 2단계: 바위 지형과 원·다각형 칠하기 ----
import { ROCK, FIELD, FOREST } from '../src/sim/map.js';
import { computeField } from '../src/sim/flowfield.js';

const tiny = paint => buildMap(makeRules(), { name: 'tiny', width: 200, depth: 200, cell: 4, paint });

test('바위 칸은 못 지나가고 빠르기 0', () => {
  const t = tiny([{ kind: ROCK, circle: [100, 100, 10] }]);
  assert.equal(t.walkable(100, 100), false);
  assert.equal(t.speedMult(100, 100), 0);
  assert.equal(t.walkable(100, 115), true);
});

test('원·다각형 칠하기는 칸 가운데로 판단하고 뒤 항목이 덮는다', () => {
  const t = tiny([{ kind: FOREST, poly: [[0, 0], [40, 0], [40, 40], [0, 40]] }, { kind: FIELD, circle: [20, 20, 8] }]);
  assert.equal(t.terrain[t.cellOf(20, 20)], FIELD);
  assert.equal(t.terrain[t.cellOf(2, 2)], FOREST);
  assert.equal(t.terrain[t.cellOf(39, 39)], FOREST);
  assert.equal(t.terrain[t.cellOf(41, 20)], FIELD);
});

test('흐름장은 바위를 돌아간다', () => {
  const t = tiny([{ kind: ROCK, poly: [[80, 0], [120, 0], [120, 160], [80, 160]] }]);
  const f = computeField(t, [{ x: 180, z: 20 }]);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let c = Math.floor(20 / 4), r = Math.floor(20 / 4), maxZ = 0;
  for (let k = 0; k < 1000 && f[r * t.cols + c] > 0; k++) {
    const d = f.dir[r * t.cols + c];
    assert.ok(d >= 0, '길이 끊겼다');
    c += DIRS[d][0]; r += DIRS[d][1];
    assert.notEqual(t.terrain[r * t.cols + c], ROCK, '바위 칸을 밟았다');
    maxZ = Math.max(maxZ, (r + 0.5) * 4);
  }
  assert.equal(f[r * t.cols + c], 0, '목표에 닿았다');
  assert.ok(maxZ > 160, `바위 위로 돌아갔다(가장 높은 z ${maxZ})`);
});
