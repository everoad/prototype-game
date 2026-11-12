// 길: 지형 + 건물이 막은 칸. 목표 칸마다 흐름장(다익스트라 거리)을 만들어 두고 같은 목표면 다시 쓴다.
// 막힘 없이 곧게 보이면(곧은 선 검사) 흐름장 없이 바로 간다.
import { GRASS } from './map.js';

export function createPaths(map) {
  const n = map.cols * map.rows;
  const p = { map, occ: new Uint16Array(n), cache: new Map(), version: 0, maxCache: 96 };
  return p;
}

export const passable = (p, i) => i >= 0 && p.map.terrain[i] === GRASS && p.occ[i] === 0;

// 건물이 놓이거나 무너지면 칸을 막고/풀고 흐름장을 버린다.
export function stampBuilding(p, x, z, r, delta) {
  const { map } = p, c0 = Math.floor((x - r) / map.cell), c1 = Math.floor((x + r) / map.cell);
  const r0 = Math.floor((z - r) / map.cell), r1 = Math.floor((z + r) / map.cell);
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
    if (cc < 0 || rr < 0 || cc >= map.cols || rr >= map.rows) continue;
    const cx = (cc + 0.5) * map.cell, cz = (rr + 0.5) * map.cell;
    if ((cx - x) ** 2 + (cz - z) ** 2 <= (r + map.cell * 0.35) ** 2) p.occ[rr * map.cols + cc] += delta;
  }
  p.cache.clear();
  p.version++;
}

// 막힌 칸이면 가까운 열린 칸(나선으로 찾기).
export function nearestOpen(p, i) {
  if (passable(p, i)) return i;
  const { cols, rows } = p.map, c = i % cols, r = (i / cols) | 0;
  for (let rad = 1; rad < 40; rad++)
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      if (passable(p, rr * cols + cc)) return rr * cols + cc;
    }
  return -1;
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// 열린 칸 표(지형 + 건물) — 건물이 바뀔 때만 다시 만든다.
function openTable(p) {
  if (p.openVer === p.version && p.open) return p.open;
  const n = p.map.cols * p.map.rows, open = p.open ?? new Uint8Array(n), terr = p.map.terrain, occ = p.occ;
  for (let i = 0; i < n; i++) open[i] = terr[i] === GRASS && occ[i] === 0 ? 1 : 0;
  p.open = open; p.openVer = p.version;
  return open;
}

// 목표 칸까지의 거리장. Float32Array(칸 수), 갈 수 없으면 Infinity.
export function fieldTo(p, goalCell) {
  const g = nearestOpen(p, goalCell);
  if (g < 0) return null;
  const hit = p.cache.get(g);
  if (hit) { p.cache.delete(g); p.cache.set(g, hit); return hit; }   // 최근 쓴 것을 뒤로
  const { cols, rows } = p.map, n = cols * rows, open = openTable(p);
  const dist = new Float32Array(n).fill(Infinity);
  const heap = p.heap ?? (p.heap = new Heap(n));
  heap.size = 0;
  dist[g] = 0; heap.push(g, 0);
  const D2 = Math.SQRT2;
  while (heap.size) {
    const k = heap.keys[0], i = heap.pop(), d = dist[i];
    if (k > d) continue;                                     // 낡은 것
    const c = i % cols, up = i >= cols, dn = i < n - cols, lf = c > 0, rt = c < cols - 1;
    const relax = (j, nd) => { if (open[j] && nd < dist[j]) { dist[j] = nd; heap.push(j, nd); } };
    if (rt) relax(i + 1, d + 1);
    if (lf) relax(i - 1, d + 1);
    if (dn) relax(i + cols, d + 1);
    if (up) relax(i - cols, d + 1);
    if (rt && dn && open[i + 1] && open[i + cols]) relax(i + cols + 1, d + D2);
    if (lf && dn && open[i - 1] && open[i + cols]) relax(i + cols - 1, d + D2);
    if (rt && up && open[i + 1] && open[i - cols]) relax(i - cols + 1, d + D2);
    if (lf && up && open[i - 1] && open[i - cols]) relax(i - cols - 1, d + D2);
  }
  const field = { goal: g, dist };
  p.cache.set(g, field);
  if (p.cache.size > p.maxCache) p.cache.delete(p.cache.keys().next().value);
  return field;
}

// 목표 칸을 k×k 칸 묶음의 가운데로 — 가까운 목표끼리 같은 흐름장을 쓴다.
export function snapCell(p, i, k) {
  const { cols, rows } = p.map, c = i % cols, r = (i / cols) | 0;
  const cc = Math.min(cols - 1, Math.floor(c / k) * k + (k >> 1)), rr = Math.min(rows - 1, Math.floor(r / k) * k + (k >> 1));
  return rr * cols + cc;
}

// 흐름장에서 (x, z)가 갈 방향(단위 벡터). 이웃 8칸 중 거리가 가장 줄어드는 쪽.
export function flowDir(p, field, x, z) {
  const { map } = p, i = map.cellOf(x, z);
  if (i < 0) return null;
  const { cols, rows } = map, c = i % cols, r = (i / cols) | 0;
  let best = -1, bd = field.dist[i];
  if (!(bd < Infinity)) {                                    // 막힌 칸에 밀려 들어갔다: 가장 가까운 열린 이웃으로
    bd = Infinity;
  }
  for (const [dc, dr] of DIRS) {
    const cc = c + dc, rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
    const j = rr * cols + cc;
    if (dc && dr && (!passable(p, r * cols + cc) || !passable(p, rr * cols + c))) continue;
    if (field.dist[j] < bd) { bd = field.dist[j]; best = j; }
  }
  if (best < 0) return null;
  const tx = ((best % cols) + 0.5) * map.cell, tz = (((best / cols) | 0) + 0.5) * map.cell;
  const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

// (x0,z0)→(x1,z1) 곧은 선이 막힌 칸을 안 지나나(반 칸 간격으로 본다). rad > 0이면 양옆도.
export function clearLine(p, x0, z0, x1, z1, rad = 0) {
  const { map } = p, len = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(len / (map.cell * 0.5));
  const nx = len ? -(z1 - z0) / len : 0, nz = len ? (x1 - x0) / len : 0;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (!passable(p, map.cellOf(x, z))) return false;
    if (rad && (!passable(p, map.cellOf(x + nx * rad, z + nz * rad)) || !passable(p, map.cellOf(x - nx * rad, z - nz * rad)))) return false;
  }
  return true;
}

class Heap {
  constructor(n) { this.ids = new Int32Array(n * 2); this.keys = new Float32Array(n * 2); this.size = 0; }
  push(id, k) {
    if (this.size >= this.ids.length) { const a = new Int32Array(this.ids.length * 2); a.set(this.ids); this.ids = a; const b = new Float32Array(this.keys.length * 2); b.set(this.keys); this.keys = b; }
    let i = this.size++;
    while (i > 0) { const pa = (i - 1) >> 1; if (this.keys[pa] <= k) break; this.ids[i] = this.ids[pa]; this.keys[i] = this.keys[pa]; i = pa; }
    this.ids[i] = id; this.keys[i] = k;
  }
  pop() {
    const top = this.ids[0], lastId = this.ids[--this.size], lastK = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastK) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.ids[i] = lastId; this.keys[i] = lastK;
    return top;
  }
}
