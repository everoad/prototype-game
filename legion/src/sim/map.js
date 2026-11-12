// 맵 만들기: 맵 자료(src/sim/maps/*.js)를 읽어 지형 칸을 만든다. 자료에 지역 표(half)가 있으면 지역(regions.js)도 붙인다. 편 0 = 낮은 z.
// 지형 칸: 0 들판, 1 숲, 2 언덕, 3 물, 4 여울, 5 바위.
import { LAB_MAP } from './maps/lab.js';
import { LEGION_MAP } from './maps/legion.js';
import { makeRegions, assignRegions } from './regions.js';

export const MAPS = { lab: LAB_MAP, legion: LEGION_MAP };

export { FIELD, FOREST, HILL, WATER, FORD, ROCK } from './terrain.js';
import { WATER, ROCK } from './terrain.js';

export function buildMap(rules, def = LAB_MAP) {
  const { width, depth, cell } = def;
  const { cols, rows, terrain } = paintTerrain(def);
  const map = { name: def.name, width, depth, cell, cols, rows, terrain, ...terrainQueries(rules, def, terrain) };
  if (def.half) {
    map.regions = makeRegions(def);
    map.regionOf = assignRegions(map.regions, cols, rows, cell);
    map.regionAt = (x, z) => { const i = map.cellOf(x, z); return i >= 0 ? map.regionOf[i] : -1; };   // NaN 자리도 −1
    map.homes = [map.regions.find(g => g.home === 0).id, map.regions.find(g => g.home === 1).id];
  }
  map.deposits = def.deposits && map.regions ? spreadDeposits(map.regions, def.deposits) : [];
  return map;
}

// 자원 자리 표를 지역 차례로 펼친다: 편 0 쪽 지역(j < 2)의 맞은편은 (dx, −dz), 가운데 줄은 표 그대로. → [{ id, kind, x, z, region }]
function spreadDeposits(regions, table) {
  const out = [];
  for (const g of regions) {
    const jj = g.j < 2 || g.j === 2 ? g.j : 4 - g.j, list = table[`${g.i},${jj}`] ?? [], flip = g.j > 2 ? -1 : 1;
    for (const [kind, dx, dz] of list) out.push({ id: out.length, kind, x: g.x + dx, z: g.z + flip * dz, region: g.id });
  }
  return out;
}

// 지형 칸 칠하기(차례로, 뒤 항목이 덮는다): 옛 네모 [종류, x0, x1, z0, z1](시험장 지도), { kind, circle: [x, z, r] }, { kind, poly: [[x, z], …] }.
// 원·다각형은 칸 가운데가 안에 들면 칠한다.
function paintTerrain(def) {
  const { width, depth, cell } = def;
  const cols = width / cell, rows = depth / cell;
  const terrain = new Uint8Array(cols * rows);
  const shapes = def.mirrorPaint ? def.paint.flatMap(p => (p.mid ? [p] : [p, mirrorShape(p, depth)])) : def.paint;   // 맞은편은 위아래로 뒤집어 바로 뒤에(같은 차례로 덮이게)
  for (const p of shapes) {
    if (Array.isArray(p)) {
      const [t, x0, x1, z0, z1] = p;
      for (let r = Math.floor(z0 / cell); r < Math.ceil(z1 / cell); r++)
        for (let c = Math.floor(x0 / cell); c < Math.ceil(x1 / cell); c++) terrain[r * cols + c] = t;
      continue;
    }
    const inside = shapeTest(p);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (inside((c + 0.5) * cell, (r + 0.5) * cell)) terrain[r * cols + c] = p.kind;
  }
  return { cols, rows, terrain };
}

// 위아래로 뒤집은 모양(z → depth − z).
const mirrorShape = (p, depth) => (p.circle ? { ...p, circle: [p.circle[0], depth - p.circle[1], p.circle[2]] } : { ...p, poly: p.poly.map(([x, z]) => [x, depth - z]) });

// 모양 안인가: 원은 거리, 다각형은 짝홀 광선법.
export function shapeTest(p) {
  if (p.circle) { const [cx, cz, r] = p.circle; return (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < r * r; }
  const poly = p.poly;
  return (x, z) => {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, za] = poly[a], [xb, zb] = poly[b];
      if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) inside = !inside;
    }
    return inside;
  };
}

// 지형 묻기. blocked = 칸을 막은 건물 수(3단계 — 막힌 칸은 물처럼 못 지나가고 빠르기 0), version = 막힘이 바뀐 횟수(흐름장이 낡았나 본다).
function terrainQueries(rules, def, terrain) {
  const { width, depth, cell } = def, cols = width / cell, rows = depth / cell;
  const speeds = [rules.terrain.field, rules.terrain.forest, rules.terrain.hill, 0, rules.terrain.ford, rules.terrain.rock];
  const blocked = new Uint8Array(cols * rows);
  const cellOf = (x, z) => {
    if (x < 0 || z < 0 || x >= width || z >= depth) return -1;
    return Math.floor(z / cell) * cols + Math.floor(x / cell);
  };
  const walkable = (x, z) => { const i = cellOf(x, z); return i >= 0 && terrain[i] !== WATER && terrain[i] !== ROCK && !blocked[i]; };
  const speedMult = (x, z) => { const i = cellOf(x, z); return i < 0 || blocked[i] ? 0 : speeds[terrain[i]]; };
  const q = { cellOf, walkable, speedMult, blocked, version: 0 };
  // 칸 가운데가 (x, z)에서 r 안인 칸마다 delta(건물 하나 = 1). 흐름장 빠르기 캐시를 지운다.
  q.block = function block(x, z, r, delta) {
    const c0 = Math.max(0, Math.floor((x - r) / cell)), c1 = Math.min(cols - 1, Math.floor((x + r) / cell));
    const r0 = Math.max(0, Math.floor((z - r) / cell)), r1 = Math.min(rows - 1, Math.floor((z + r) / cell));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      if (((cc + 0.5) * cell - x) ** 2 + ((rr + 0.5) * cell - z) ** 2 > r * r) continue;
      const i = rr * cols + cc;
      blocked[i] = Math.max(0, blocked[i] + delta);
    }
    this.version++;
    this._speeds = null;
  };
  return q;
}

