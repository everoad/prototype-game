// 군단 영지 지도(설계서 §5, 확정 그림 2026-11-13-legion-map.svg): 지역 25곳, 위아래 뒤집기 대칭, 이웃, 다각형.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { buildMap, FIELD, HILL } from '../src/sim/map.js';
import { LEGION_MAP } from '../src/sim/maps/legion.js';
import { regionPolygon, ROLE_NAMES, LAND_UNITS } from '../src/sim/regions.js';

const m = buildMap(makeRules(), LEGION_MAP);
const R = m.regions;
const byIJ = (i, j) => R.find(g => g.i === i && g.j === j);
const area = poly => Math.abs(poly.reduce((a, [x, z], k) => { const [x2, z2] = poly[(k + 1) % poly.length]; return a + x * z2 - x2 * z; }, 0)) / 2;
const inside = (poly, x, z) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, za] = poly[a], [xb, zb] = poly[b]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c; } return c; };

test('지역 25곳, 본진 둘은 (2,0)·(2,4)', () => {
  assert.equal(R.length, 25);
  const h0 = R[m.homes[0]], h1 = R[m.homes[1]];
  assert.deepEqual([h0.i, h0.j, h0.x, h0.z, h0.home], [2, 0, 600, 70, 0]);
  assert.deepEqual([h1.i, h1.j, h1.x, h1.z, h1.home], [2, 4, 600, 730, 1]);
  assert.equal(R.filter(g => g.home >= 0).length, 2);
});

test('편 1 절반은 위아래로 뒤집은 같은 판', () => {
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) assert.equal(m.terrain[r * m.cols + c], m.terrain[(m.rows - 1 - r) * m.cols + c], `칸 ${c},${r}`);
  for (const g of R) {
    const t = R[g.twin];
    assert.deepEqual([t.role, t.camp, t.land, t.x, t.z], [g.role, g.camp, g.land, g.x, 800 - g.z], `${g.name} ${g.i},${g.j}`);
    if (g.j === 2) { assert.equal(g.twin, g.id); assert.equal(g.z, 400); }
  }
});

test('가운데 줄은 좌우로도 대칭', () => {
  for (let i = 0; i < 5; i++) {
    const a = byIJ(i, 2), b = byIJ(4 - i, 2);
    assert.equal(a.x + b.x, 1200);
    assert.deepEqual([a.role, a.camp], [b.role, b.camp]);
  }
});

test('깃발은 들판·언덕 위, 둘레 12 m에 막힌 칸이나 숲이 없다', () => {
  for (const g of R) for (let dz = -12; dz <= 12; dz += 2) for (let dx = -12; dx <= 12; dx += 2) {
    if (dx * dx + dz * dz > 144) continue;
    const t = m.terrain[m.cellOf(g.x + dx, g.z + dz)];
    assert.ok(t === FIELD || t === HILL, `${g.name}(${g.i},${g.j}) 둘레 ${dx},${dz}: 지형 ${t}`);
  }
});

test('이웃: 서로 맞물리고 모두 이어져 있다, 본진 곁 금광·숲·앞 요새에는 소굴이 없다', () => {
  for (const a of R) for (const b of a.neighbors) assert.ok(R[b].neighbors.includes(a.id), `${a.id}↔${b}`);
  const seen = new Set([m.homes[0]]), q = [m.homes[0]];
  while (q.length) for (const n of R[q.shift()].neighbors) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.equal(seen.size, 25);
  const home = R[m.homes[0]], near = home.neighbors.map(n => R[n]);
  for (const role of ['gold', 'forest', 'fort']) {
    const g = near.find(x => x.role === role);
    assert.ok(g, `본진 곁에 ${role}`);
    assert.equal(g.camp, null, `${role}에 소굴이 없다`);
  }
});

test('바깥 좌표의 지역은 −1', () => {
  assert.equal(m.regionAt(1200, 400), -1);
  assert.equal(m.regionAt(600, 800), -1);
  assert.equal(m.regionAt(-1, 10), -1);
  assert.equal(m.regionAt(NaN, 10), -1);
  assert.equal(m.regionAt(10, Infinity), -1);
  assert.ok(m.regionAt(1199.9, 799.9) >= 0);
});

test('지역 다각형은 깃발을 품고 넓이 합이 판 넓이', () => {
  let sum = 0;
  for (const g of R) {
    const p = regionPolygon(m, g.id);
    sum += area(p);
    assert.ok(inside(p, g.x, g.z), `${g.name} 깃발이 제 다각형 안`);
    assert.ok(area(regionPolygon(m, g.id, 6)) < area(p));
  }
  assert.ok(Math.abs(sum - 960000) <= 1, `넓이 합 ${sum}`);
});

test('이름과 특수 병종 땅', () => {
  assert.equal(R[m.homes[0]].name, '본진');
  assert.equal(ROLE_NAMES.volcano, '화산');
  assert.equal(byIJ(0, 1).land, 'volcano');
  assert.equal(LAND_UNITS.volcano, '용');
  assert.equal(byIJ(1, 0).land, null);
});
