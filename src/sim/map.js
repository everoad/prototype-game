// 맵 만들기: 맵 자료(src/sim/maps/*.js)를 읽어 지형 칸·거점·구역을 만든다. 편 0 = 낮은 z, 편 1 = z' = depth − z.
// 지형 칸: 0 들판, 1 숲, 2 언덕, 3 물, 4 여울.
import { TEST_MAP } from './maps/test.js';

export const FIELD = 0, FOREST = 1, HILL = 2, WATER = 3, FORD = 4;

// 칸·수비대·생산·성벽이 없는 "점": 승점과 작은 땅(2026-11-09). 승점만의 규칙(사기·승점 수·처음 생산 방향)은 kind === 'vp'로 따로 본다.
export const isPoint = st => st.kind === 'vp' || st.kind === 'land';

const id = (key, side) => (key === 'hq' ? `hq${side}` : `${key[0]}${side}${key[1]}`);

// 거점 차례: 편 0 거점 → 편 1 거점 → 승점 → 편 0 땅 → 편 1 땅 → 길목(거점 번호 goalId·origin이 전과 같게 땅은 뒤에 붙인다).
export function buildMap(rules, def = TEST_MAP) {
  const { width, depth, cell } = def;
  const cols = width / cell, rows = depth / cell;
  const terrain = new Uint8Array(cols * rows);
  for (const [t, x0, x1, z0, z1] of def.paint) {
    for (let r = Math.floor(z0 / cell); r < Math.ceil(z1 / cell); r++)
      for (let c = Math.floor(x0 / cell); c < Math.ceil(x1 / cell); c++) terrain[r * cols + c] = t;
  }
  const flip = (side, z) => (side === 0 ? z : depth - z);

  const strongholds = [];
  for (const side of [0, 1])
    for (const d of def.side0)
      strongholds.push({ id: id(d.key, side), side, kind: d.kind, x: d.x, z: flip(side, d.z), radius: d.radius, slots: d.slots });
  for (const v of def.vps) strongholds.push({ id: v.id, side: null, kind: 'vp', x: v.x, z: def.vpLine, radius: def.vpRadius, slots: 0 });
  const R = rules.lands.radius;
  for (const side of [0, 1])
    for (const l of def.lands0 ?? [])
      strongholds.push({ id: id(l.key, side), side, kind: 'land', landKind: l.landKind, x: l.x, z: flip(side, l.z), radius: R, slots: 0 });
  for (const c of def.chokes ?? []) strongholds.push({ id: c.id, side: null, kind: 'land', landKind: 'choke', x: c.x, z: c.z, radius: R, slots: 0 });

  const sectors = [];
  for (const side of [0, 1])
    for (const s of def.sectors)
      sectors.push({ id: `s${side}-${s.name}`, side, x0: s.x0, x1: s.x1, z: side === 0 ? def.vpLine - def.segmentBack : def.vpLine + def.segmentBack });

  const speeds = [rules.terrain.field, rules.terrain.forest, rules.terrain.hill, 0, rules.terrain.ford];
  const cellOf = (x, z) => {
    if (x < 0 || z < 0 || x >= width || z >= depth) return -1;
    return Math.floor(z / cell) * cols + Math.floor(x / cell);
  };
  const walkable = (x, z) => { const i = cellOf(x, z); return i >= 0 && terrain[i] !== WATER; };
  const speedMult = (x, z) => { const i = cellOf(x, z); return i < 0 ? 0 : speeds[terrain[i]]; };

  return { name: def.name, width, depth, cell, cols, rows, terrain, strongholds, sectors, vpLine: def.vpLine, cellOf, walkable, speedMult, routes: def.routes };
}
