// 시험 도우미 — 시험 코드에 쓴 이름 그대로 둔다(계획서 Global Constraints).
import { step, createWorld, setGoal as setGoalOf } from '../src/sim/world.js';
import { kill, spawn as spawnOne, rebuildGrid as rebuildGridOf } from '../src/sim/soldiers.js';
import { updateVision as updateVisionOf } from '../src/sim/vision.js';

// ---- Task 5: 징집·사기 ----

export function aliveWeight(w, side) {
  const s = w.soldiers; let sum = 0;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side) sum += w.rules.units[side][s.type[i]].weight;
  return sum;
}
export function killWeight(w, side, weight) {
  const s = w.soldiers; let left = weight;
  for (let i = 0; i < s.count && left > 0; i++) if (s.alive[i] && s.side[i] === side) { left -= w.rules.units[side][s.type[i]].weight; kill(s, i); }
}
// ---- Task 6: 화살표 ----


// 앞 거점 f0L 출신 병사: MARCH 5, RALLY 5, FRONT 5 — 모두 왼쪽 구역으로.
export function pick(obj, ...keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// ---- Task 3: 작은 맵·병사 묶음 ----

// 10×10 칸(4 m) 시험 맵: 5번째 열이 물 벽(행 0~7), 행 8~9가 틈.
export function makeTinyMap() {
  const cols = 10, rows = 10, cell = 4;
  const terrain = new Uint8Array(cols * rows);
  for (let r = 0; r < 8; r++) terrain[r * cols + 5] = 3;
  const cellOf = (x, z) => (x < 0 || z < 0 || x >= cols * cell || z >= rows * cell) ? -1 : Math.floor(z / cell) * cols + Math.floor(x / cell);
  const walkable = (x, z) => { const i = cellOf(x, z); return i >= 0 && terrain[i] !== 3; };
  const speedMult = (x, z) => (walkable(x, z) ? 1 : 0);
  return { width: cols * cell, depth: rows * cell, cell, cols, rows, terrain, cellOf, walkable, speedMult };
}
export const idx = (c, r) => r * 10 + c;

export async function spawnBlock(w, side, type, n, at) {
  const { spawn } = await import('../src/sim/soldiers.js');
  const ids = [];
  const per = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) ids.push(spawn(w.soldiers, side, type, at.x + (i % per) * 1.2 - per * 0.6, at.z + Math.floor(i / per) * 1.2, w.rules));
  return ids;
}

export function allOf(w, side) {
  const s = w.soldiers, out = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side) out.push(i);
  return out;
}

export function countOnWater(w) {
  let n = 0;
  for (let i = 0; i < w.soldiers.count; i++) if (w.soldiers.alive[i] && !w.map.walkable(w.soldiers.x[i], w.soldiers.z[i])) n++;
  return n;
}

export function minNearestNeighbor(w, side, samples) {
  const ids = allOf(w, side);
  let min = Infinity;
  for (let k = 0; k < samples; k++) {
    const i = ids[(k * 7919) % ids.length];
    let best = Infinity;
    for (const j of ids) if (j !== i) best = Math.min(best, Math.hypot(w.soldiers.x[i] - w.soldiers.x[j], w.soldiers.z[i] - w.soldiers.z[j]));
    min = Math.min(min, best);
  }
  return min;
}

export function waterPoint(map) { return waterCellCenter(map); }

// ---- Task 4: 싸움 장면 ----

export async function duelWorld() {
  const { createWorld, setGoal } = await import('../src/sim/world.js');
  const { spawn } = await import('../src/sim/soldiers.js');
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const a = spawn(w.soldiers, 0, 0, 600, 300, w.rules);
  const b = spawn(w.soldiers, 1, 0, 600, 301, w.rules);
  setGoal(w, [a], { kind: 'point', x: 600, z: 300 });
  setGoal(w, [b], { kind: 'point', x: 600, z: 301 });
  w._duel = [a, b];
  return w;
}

export function runSeconds(w, sec) {
  const n = Math.round(sec / w.rules.dt);
  for (let i = 0; i < n; i++) step(w);
}

export function timeUntilBothDead(w) {
  const [a, b] = w._duel;
  for (let i = 0; i < 2400; i++) {
    step(w);
    if (!w.soldiers.alive[a] && !w.soldiers.alive[b]) return w.time;
  }
  return Infinity;
}

const LINE = [390, 410];   // 맞붙는 두 줄(옛 가운데 구역 선)
export async function clashWorld(n0, n1) {
  const { createWorld, setGoal } = await import('../src/sim/world.js');
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const a = await spawnBlock(w, 0, 0, n0, { x: 600, z: 360 });
  const b = await spawnBlock(w, 1, 0, n1, { x: 600, z: 410 });
  for (const i of a) setGoal(w, [i], { kind: 'point', x: w.soldiers.x[i], z: LINE[0] });   // 옛 구역 선(s0-center z 390, s1-center z 410) 위 제 x 자리
  for (const i of b) setGoal(w, [i], { kind: 'point', x: w.soldiers.x[i], z: LINE[1] });
  return w;
}

export function contactPairs(w) {
  const s = w.soldiers, reach = w.rules.melee.reach;
  let n = 0;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== 0) continue;
    for (let j = 0; j < s.count; j++) {
      if (!s.alive[j] || s.side[j] !== 1) continue;
      if (Math.hypot(s.x[i] - s.x[j], s.z[i] - s.z[j]) <= reach) { n++; break; }
    }
  }
  return n;
}

export function deepIntruders(w, margin) {
  const s = w.soldiers;
  const [z0, z1] = LINE;
  let n = 0;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    if (s.side[i] === 0 && s.z[i] > z1 + margin) n++;
    if (s.side[i] === 1 && s.z[i] < z0 - margin) n++;
  }
  return n;
}

// 맵에서 물(3) 칸 하나의 가운데 [x, z].
export function waterCellCenter(map) {
  for (let i = 0; i < map.terrain.length; i++) {
    if (map.terrain[i] === 3) {
      const c = i % map.cols, r = Math.floor(i / map.cols);
      return [(c + 0.5) * map.cell, (r + 0.5) * map.cell];
    }
  }
  throw new Error('물 칸이 없다');
}

// ---- Task 9: 병종 ----
const meanOf = a => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
export function meanDepthBehind(w, side, back, front) {
  const s = w.soldiers, zb = [], zf = [];
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== side) continue;
    if (s.type[i] === back) zb.push(s.z[i]);
    if (s.type[i] === front) zf.push(s.z[i]);
  }
  return side === 0 ? meanOf(zf) - meanOf(zb) : meanOf(zb) - meanOf(zf);
}
// 달리는 기병 하나가 서 있는 적 하나를 지나 먼 점(190 m 뒤)으로 달린다 — 그 적을 노리지 않는다. 닿은 동안 대부분 서 있으면 "멈춤".
export function trampleStops(_w, cavType, enemyType) {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true, damage: 0.01 } });
  const cav = spawnOne(w.soldiers, 0, cavType, 600, 270, w.rules);
  const foe = spawnOne(w.soldiers, 1, enemyType, 600, 310, w.rules);
  setGoalOf(w, [cav], { kind: 'point', x: 600, z: 500 });
  setGoalOf(w, [foe], { kind: 'point', x: 600, z: 310 });
  // 닿아 있는 동안 선 틱과 달린 틱을 센다(궁수는 물러나며 달아나고, 적 기병은 쫓아오니 자리로는 못 잰다)
  const s = w.soldiers, sp = w.rules.units[0][cavType].speed;
  let still = 0, moving = 0;
  for (let k = 0; k < 140; k++) { step(w); if (s.inContact[cav]) Math.hypot(s.vx[cav], s.vz[cav]) < sp * 0.5 ? still++ : moving++; }
  return still > moving;
}

export function chasedBy(w, e) {
  const s = w.soldiers; let n = 0;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] !== s.side[e] && s.target[i] === e) n++;
  return n;
}
export function alertsOf(w, side) { return w.sides[side].alerts; }

// ---- 기병 고침(2026-11-06) ----
// 기병 하나가 40 m 앞 혼자 선 궁수를 노린다(정상 피해). 궁수가 죽은 판 시각(30초 안에 못 죽이면 Infinity).
export function cavKillsLoneArcher() {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const cav = spawnOne(w.soldiers, 0, 2, 600, 270, w.rules);
  const foe = spawnOne(w.soldiers, 1, 1, 600, 310, w.rules);
  setGoalOf(w, [cav], { kind: 'point', x: 600, z: 330 });
  setGoalOf(w, [foe], { kind: 'point', x: 600, z: 310 });
  for (let k = 0; k < 600; k++) { step(w); if (!w.soldiers.alive[foe]) return w.time; }
  return Infinity;
}

export function visionWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  const m = w.map, c = Math.floor(600 / m.cell), r = Math.floor(320 / m.cell);
  m.terrain[r * m.cols + c] = 1; m.terrain[r * m.cols + c - 1] = 1;     // FOREST
  const ours = spawnOne(w.soldiers, 0, 0, 600, 300, w.rules);
  setGoalOf(w, [ours], { kind: 'point', x: 600, z: 300 });
  for (const z of [325, 320]) { const e = spawnOne(w.soldiers, 1, 0, 600, z, w.rules); setGoalOf(w, [e], { kind: 'point', x: 600, z }); }
  rebuildGridOf(w.soldiers);
  updateVisionOf(w);
  return w;
}

// 달리는 기병 하나가 서 있는 적 하나를 지나 먼 점으로 간다(그 적을 노리지 않는다). 7초 안에 적의 지금 자리를 5 m 넘게 지나치면 true.
export function passesThrough(cavType, enemyType) {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true, damage: 0.01 } });
  const cav = spawnOne(w.soldiers, 0, cavType, 600, 270, w.rules);
  const foe = spawnOne(w.soldiers, 1, enemyType, 600, 310, w.rules);
  setGoalOf(w, [cav], { kind: 'point', x: 600, z: 500 });
  setGoalOf(w, [foe], { kind: 'point', x: 600, z: 310 });
  for (let k = 0; k < 140; k++) { step(w); if (w.soldiers.z[cav] > w.soldiers.z[foe] + 5) return true; }
  return false;
}



// 그 거점의 수비대 무게: GARRISON 상태로 목표가 이 거점인 주인 편 병사
export function placeBlock(w, side, type, x, z, n) {
  const ids = [], per = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) ids.push(spawnOne(w.soldiers, side, type, x + (i % per) * 1.2 - per * 0.6, z + Math.floor(i / per) * 1.2 - per * 0.6, w.rules));
  for (const i of ids) setGoalOf(w, [i], { kind: 'point', x: w.soldiers.x[i], z: w.soldiers.z[i] });
  return ids;
}

export const sumHp = (w, ids) => ids.reduce((a, i) => a + (w.soldiers.alive[i] ? w.soldiers.hp[i] : 0), 0);
