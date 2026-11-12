// 자원 자리(3단계 계획 Task 1): 지도 표의 금·목재·마나 자리. 편 1 쪽은 위아래로 뒤집어 저절로, 가운데 줄은 좌우로도 대칭.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { buildMap, FIELD, HILL, FOREST } from '../src/sim/map.js';
import { LEGION_MAP } from '../src/sim/maps/legion.js';

const m = buildMap(makeRules(), LEGION_MAP);
const D = m.deposits;
const count = list => { const n = { gold: 0, wood: 0, mana: 0 }; for (const d of list) n[d.kind]++; return n; };

test('자원 자리 64곳: 편 0 쪽 금 14·목재 10·마나 4, 가운데 줄 금 2·목재 2·마나 4', () => {
  assert.equal(D.length, 64);
  const row = d => m.regions[d.region].j;                         // 가운데 제단의 마나 자리는 z 350·450이라 z가 아니라 지역 줄로 센다
  assert.deepEqual(count(D.filter(d => row(d) < 2)), { gold: 14, wood: 10, mana: 4 });
  assert.deepEqual(count(D.filter(d => row(d) === 2)), { gold: 2, wood: 2, mana: 4 });
  assert.deepEqual(count(D.filter(d => row(d) > 2)), { gold: 14, wood: 10, mana: 4 });
  for (const d of D) if (row(d) < 2) assert.ok(d.z < 400); else if (row(d) > 2) assert.ok(d.z > 400);
  D.forEach((d, k) => assert.equal(d.id, k));
  for (let k = 1; k < D.length; k++) assert.ok(D[k].region >= D[k - 1].region, 'id 차례는 지역 차례');
});

test('본진에는 금 2·목재 2·마나 1', () => {
  for (const h of m.homes) assert.deepEqual(count(D.filter(d => d.region === h)), { gold: 2, wood: 2, mana: 1 });
});

test('맞은편 자리는 위아래로 뒤집은 같은 자리, 가운데 줄은 좌우로도 대칭', () => {
  const has = (region, kind, x, z) => D.some(o => o.region === region && o.kind === kind && Math.abs(o.x - x) < 1e-9 && Math.abs(o.z - z) < 1e-9);
  for (const d of D) {
    const g = m.regions[d.region];
    assert.ok(has(g.twin, d.kind, d.x, 800 - d.z), `${g.name} ${d.kind} (${d.x}, ${d.z})의 맞은편`);
    if (g.j === 2) {
      const mirror = m.regions.find(o => o.j === 2 && o.i === 4 - g.i);
      assert.ok(has(mirror.id, d.kind, 1200 - d.x, d.z), `${g.name} ${d.kind} (${d.x}, ${d.z})의 좌우 짝`);
    }
  }
});

test('자리 둘레 6 m는 제 지역의 걸을 수 있는 땅', () => {
  for (const d of D) {
    const g = m.regions[d.region];
    for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
      if (dx * dx + dz * dz > 36) continue;
      const c = m.cellOf(d.x + dx, d.z + dz), t = m.terrain[c];
      assert.ok(c >= 0, `${g.name} ${d.kind} 판 밖`);
      assert.ok(t === FIELD || t === HILL || (d.kind === 'wood' && t === FOREST), `${g.name} ${d.kind} (${d.x}, ${d.z}) 둘레 ${dx},${dz}: 지형 ${t}`);
      assert.equal(m.regionOf[c], d.region, `${g.name} ${d.kind} 둘레가 다른 지역`);
    }
    assert.ok(Math.hypot(d.x - g.x, d.z - g.z) >= 44 - 1e-9, `${g.name} ${d.kind}: 깃발에서 ${Math.hypot(d.x - g.x, d.z - g.z).toFixed(1)} m`);
    assert.ok(d.x >= 12 && d.z >= 12 && d.x <= 1188 && d.z <= 788, `${g.name} ${d.kind}: 가장자리`);
    for (const o of D) if (o !== d) assert.ok(Math.hypot(o.x - d.x, o.z - d.z) >= 18, `${g.name} ${d.kind}와 ${m.regions[o.region].name} ${o.kind}가 가깝다`);
  }
});

test('시험장 지도에는 자원 자리가 없다', () => {
  assert.deepEqual(buildMap(makeRules()).deposits, []);
});
