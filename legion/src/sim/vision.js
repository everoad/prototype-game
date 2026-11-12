// 시야(홍수 설계서 §7.3): 편마다 8 m 칸 격자 두 장 — 들판 시야, 숲 속 시야(숲 칸 대상은 15 m 안).
// 보는 것: 병사(rules.vision.soldier m — 군단 영지 1단계에는 거점·망루·장수 시야가 없다), 보는 쪽이 언덕 칸이면 ×1.5.
// 병사는 같은 칸에 있으면 한 번만 찍는다(칸 가운데에서). rules.vision.everyTicks마다 다시 계산한다.
import { HILL, FOREST } from './map.js';

export function sightRange(kind, onHill, rules) {
  const v = rules.vision;
  return v[kind] * (onHill ? v.hillMult : 1);
}

// 반지름(m) → 칸 오프셋 목록(칸 가운데끼리 거리 ≤ 반지름). 반지름마다 한 번 만든다.
const offsetCache = new Map();
function offsets(radius, cell) {
  const key = `${radius}/${cell}`;
  let list = offsetCache.get(key);
  if (!list) {
    list = [];
    const n = Math.ceil(radius / cell);
    for (let dr = -n; dr <= n; dr++) for (let dc = -n; dc <= n; dc++) if (Math.hypot(dc, dr) * cell <= radius + 1e-9) list.push([dc, dr]);
    offsetCache.set(key, list);
  }
  return list;
}

function makeGrids(w) {
  const cell = w.rules.vision.cell, cols = Math.ceil(w.map.width / cell), rows = Math.ceil(w.map.depth / cell);
  const grid = () => [new Uint8Array(cols * rows), new Uint8Array(cols * rows)];
  return { cell, cols, rows, open: grid(), forest: grid(), occupied: new Uint8Array(cols * rows), tick: -1 };
}

const terrainAt = (map, x, z) => { const i = map.cellOf(x, z); return i >= 0 ? map.terrain[i] : 0; };

// 한 관찰자를 (x, z)에서 찍는다: 들판 반지름 r, 숲 반지름 rf.
function stamp(V, side, x, z, r, rf) {
  const c0 = Math.floor(x / V.cell), r0 = Math.floor(z / V.cell);
  for (const [dc, dr] of offsets(r, V.cell)) {
    const c = c0 + dc, rr = r0 + dr;
    if (c >= 0 && rr >= 0 && c < V.cols && rr < V.rows) V.open[side][rr * V.cols + c] = 1;
  }
  for (const [dc, dr] of offsets(rf, V.cell)) {
    const c = c0 + dc, rr = r0 + dr;
    if (c >= 0 && rr >= 0 && c < V.cols && rr < V.rows) V.forest[side][rr * V.cols + c] = 1;
  }
}

export function updateVision(w) {
  const V = w.vision ?? (w.vision = makeGrids(w));
  const s = w.soldiers, r = w.rules, vr = r.vision, map = w.map;
  for (const side of [0, 1]) {
    V.open[side].fill(0); V.forest[side].fill(0); V.occupied.fill(0);
    for (let i = 0; i < s.count; i++) {                                     // 병사: 칸마다 한 번
      if (!s.alive[i]) continue;
      if (s.side[i] !== side) {                                             // 방금 쏜 적 투석기는 보인다(돌이 어디서 오는지 — 투석기 2026-11-09)
        if (w.time - s.fireAt[i] <= r.catapult.reveal && r.units[s.side[i]][s.type[i]].catapult) stamp(V, side, s.x[i], s.z[i], r.catapult.revealRadius, r.catapult.revealRadius);
        continue;
      }
      const c = Math.floor(s.x[i] / V.cell), rr = Math.floor(s.z[i] / V.cell);
      if (c < 0 || rr < 0 || c >= V.cols || rr >= V.rows) continue;
      const k = rr * V.cols + c;
      if (V.occupied[k]) continue;
      V.occupied[k] = 1;
      const x = (c + 0.5) * V.cell, z = (rr + 0.5) * V.cell, hill = terrainAt(map, x, z) === HILL;
      stamp(V, side, x, z, sightRange('soldier', hill, r), vr.forestSeen);
    }
    for (const b of w.buildings ?? []) if (b.alive && b.side === side) stamp(V, side, b.x, b.z, b.def.sight, vr.forestSeen);   // 건물 시야(3단계, 짓는 중에도)
  }
  V.tick = w.tick;
}

export function stepVision(w) {
  if (!w.vision || w.tick % w.rules.vision.everyTicks === 0) updateVision(w);
}

// side 편이 (x, z)를 보나. 대상 자리가 숲이면 숲 시야로 본다.
export function canSee(w, side, x, z) {
  const V = w.vision;
  if (!V || side > 1) return true;                                          // 중립(편 2)은 시야 격자가 없다 — 늘 본다
  const c = Math.floor(x / V.cell), r = Math.floor(z / V.cell);
  if (c < 0 || r < 0 || c >= V.cols || r >= V.rows) return false;
  const k = r * V.cols + c;
  return (terrainAt(w.map, x, z) === FOREST ? V.forest[side][k] : V.open[side][k]) === 1;
}

export function visibleEnemies(w, side) {
  const s = w.soldiers, out = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] !== side && canSee(w, side, s.x[i], s.z[i])) out.push(i);
  return out;
}

