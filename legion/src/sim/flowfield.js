// 흐름장: 목표 칸들에서 시작하는 격자 다익스트라(8방향). 걸음 비용 = 거리 ÷ 지형 속도 + 붐빔 비용.

const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];
const DC = DIRS.map(d => d[0]), DR = DIRS.map(d => d[1]), LEN = DIRS.map(d => d[2]);

function speedsOf(map) {
  if (map._speeds) return map._speeds;
  const sp = new Float32Array(map.cols * map.rows);
  for (let r = 0; r < map.rows; r++)
    for (let c = 0; c < map.cols; c++) sp[r * map.cols + c] = map.speedMult((c + 0.5) * map.cell, (r + 0.5) * map.cell);
  map._speeds = sp;
  return sp;
}

export function computeField(map, targets, costOf = () => 0) {
  const { cols, rows, cell } = map;
  const n = cols * rows, sp = speedsOf(map);
  // 64비트로 계산하고 칸마다 한 번만 꺼낸다(32비트 반올림이 "더 짧은 길"을 끝없이 만들던 문제 방지).
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const heap = new MinHeap(n);
  for (const t of targets) {
    const i = map.cellOf(t.x, t.z);
    if (i < 0 || sp[i] <= 0 || dist[i] === 0) continue;
    dist[i] = 0;
    heap.push(i, 0);
  }
  while (heap.size) {
    const i = heap.pop(), d = heap.lastKey;
    if (done[i]) continue;
    done[i] = 1;
    const c = i % cols, r = (i - c) / cols;
    for (let k = 0; k < 8; k++) {
      const dc = DC[k], dr = DR[k], len = LEN[k];
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (sp[j] <= 0) continue;
      if (dc && dr && (sp[r * cols + nc] <= 0 || sp[nr * cols + c] <= 0)) continue; // 모서리 자르기 금지
      if (done[j]) continue;
      const nd = d + len * cell / sp[j] + costOf(j);
      if (nd < dist[j]) { dist[j] = nd; heap.push(j, nd); }
    }
  }
  const out = Float32Array.from(dist);
  out.dir = directions(out, cols, rows);
  return out;
}

// 칸마다 내려가는 이웃의 방향 번호(−1 = 없음). fieldDir가 매번 이웃 여덟을 보지 않게 미리 계산한다.
function directions(field, cols, rows) {
  const dir = new Int8Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!isFinite(field[i]) || field[i] === 0) continue;
      let best = field[i], bk = -1;
      for (let k = 0; k < 8; k++) {
        const nc = c + DC[k], nr = r + DR[k];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const v = field[nr * cols + nc];
        if (v < best) { best = v; bk = k; }
      }
      dir[i] = bk;
    }
  return dir;
}
const UX = DIRS.map(d => d[0] / Math.hypot(d[0], d[1])), UZ = DIRS.map(d => d[1] / Math.hypot(d[0], d[1]));

// 흐름장을 n칸 앞까지 따라간 칸의 가운데. 여러 칸의 격자 방향(45° 단위)이 평균 나서 실제 길 방향이 된다.
export function fieldAim(field, map, x, z, n) {
  let i = map.cellOf(x, z);
  if (i < 0 || !field.dir) return null;
  const cols = map.cols;
  for (let k = 0; k < n; k++) {
    const d = field.dir[i];
    if (d < 0) break;
    const c = i % cols, r = (i - c) / cols;
    i = (r + DR[d]) * cols + (c + DC[d]);
  }
  const c = i % cols, r = (i - c) / cols;
  return { x: (c + 0.5) * map.cell, z: (r + 0.5) * map.cell };
}

// 흐름장을 따라 내려가는 방향(정규화). 목표 칸이거나 갈 수 없으면 {0,0}.
export function fieldDir(field, map, x, z) {
  const i = map.cellOf(x, z);
  if (i < 0 || !isFinite(field[i]) || field[i] === 0) return { dx: 0, dz: 0 };
  if (field.dir) { const k = field.dir[i]; return k < 0 ? { dx: 0, dz: 0 } : { dx: UX[k], dz: UZ[k] }; }
  const { cols, rows } = map;
  const c = i % cols, r = (i - c) / cols;
  let best = field[i], bx = 0, bz = 0;
  for (const [dc, dr] of DIRS) {
    const nc = c + dc, nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    const v = field[nr * cols + nc];
    if (v < best) { best = v; bx = dc; bz = dr; }
  }
  const len = Math.hypot(bx, bz);
  return len ? { dx: bx / len, dz: bz / len } : { dx: 0, dz: 0 };
}

class MinHeap {
  constructor(cap) { this.ids = new Int32Array(cap * 2 + 16); this.keys = new Float64Array(cap * 2 + 16); this.size = 0; this.lastKey = 0; }
  push(id, key) {
    if (this.size >= this.ids.length) this.grow();
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p]; i = p;
    }
    this.ids[i] = id; this.keys[i] = key;
  }
  pop() {
    const id = this.ids[0], key = this.keys[0];
    const lastId = this.ids[--this.size], lastKey = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastKey) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.ids[i] = lastId; this.keys[i] = lastKey;
    this.lastKey = key;
    return id;
  }
  grow() {
    const ids = new Int32Array(this.ids.length * 2), keys = new Float64Array(this.keys.length * 2);
    ids.set(this.ids); keys.set(this.keys); this.ids = ids; this.keys = keys;
  }
}
