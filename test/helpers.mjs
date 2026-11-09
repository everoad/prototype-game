// 시험 도우미 — 시험 코드에 쓴 이름 그대로 둔다(계획서 Global Constraints).
import { step, createWorld, setGoal as setGoalOf } from '../src/sim/world.js';
import { kill, spawn as spawnOne, rebuildGrid as rebuildGridOf } from '../src/sim/soldiers.js';
import { updateVision as updateVisionOf } from '../src/sim/vision.js';
import { spawnMixedClash } from '../src/sim/scenarios.js';
import { buildingPos as buildingPosOf } from '../src/sim/defense.js';
import { spawnGarrisons, arrowOf as arrowOfStronghold } from '../src/sim/production.js';
import { addGeneral as addGeneralOf } from '../src/sim/generals.js';
import { makeAi as makeAiOf } from '../src/sim/ai.js';
import { makeRng as makeRngOf } from '../src/sim/rng.js';

// ---- Task 5: 징집·사기 ----

// 본진 hq0만 우리 것이고 다른 거점은 주인이 없는 빈 세상(징집만 본다). 수비대는 처음부터 차 있다(§2.2).
function onlyHq0(w) {
  for (const st of w.strongholds) if (st.id !== 'hq0') { st.owner = null; st.gauge = 0; }
  spawnGarrisons(w);
  w.production = true;
  return w;
}
export function levyOnlyWorld() { return onlyHq0(createWorld({ scenario: 'empty', seed: 1 })); }
export function capWorld(cap) { return onlyHq0(createWorld({ scenario: 'empty', seed: 1, knobs: { scale: cap / 10000, production: 10000 / cap } })); }
export function producedWeight(w, id) { return w.strongholds.find(s => s.id === id).produced; }
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

const STATE_NAMES = ['MARCH', 'RALLY', 'FRONT', 'GARRISON', 'ATTACHED', 'FLEE'];

// 앞 거점 f0L 출신 병사: MARCH 5, RALLY 5, FRONT 5 — 모두 왼쪽 구역으로.
export function arrowWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  const from = w.strongholds.findIndex(s => s.id === 'f0L');
  for (let k = 0; k < 15; k++) {
    const id = spawnOne(w.soldiers, 0, 0, 350 + k, 260, w.rules);
    w.soldiers.origin[id] = from;
    setGoalOf(w, [id], { kind: 'sector', id: 's0-left' });
    w.soldiers.state[id] = k < 5 ? 0 : k < 10 ? 1 : 2;
  }
  return w;
}
export function countGoal(w, fromId, sectorId, states) {
  const s = w.soldiers;
  const from = w.strongholds.findIndex(x => x.id === fromId), sec = w.map.sectors.findIndex(x => x.id === sectorId);
  let n = 0;
  for (let i = 0; i < s.count; i++)
    if (s.alive[i] && s.origin[i] === from && s.goalKind[i] === 1 && s.goalId[i] === sec && states.includes(STATE_NAMES[s.state[i]])) n++;
  return n;
}
export function nearestOwnStronghold(w, side, sectorId) {
  const sec = w.map.sectors.find(x => x.id === sectorId);
  const mx = (sec.x0 + sec.x1) / 2;
  let best = null, bd = Infinity;
  for (const st of w.strongholds) {
    if (st.owner !== side || st.kind === 'vp') continue;
    const d = Math.hypot(st.x - mx, st.z - sec.z);
    if (d < bd) { bd = d; best = st; }
  }
  return { x: best.x, z: best.z };
}

export function bothAtZeroSameTick() {
  const w = createWorld({ seed: 1 });
  w.sides[0].morale = 0; w.sides[1].morale = 0;
  step(w);
  return w;
}

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

export function fractionNear(w, side, kind, id, r) {
  const sec = w.map.sectors.find(s => s.id === id);
  const ids = allOf(w, side);
  let near = 0;
  for (const i of ids) {
    const x = Math.max(sec.x0, Math.min(sec.x1, w.soldiers.x[i]));
    if (Math.hypot(w.soldiers.x[i] - x, w.soldiers.z[i] - sec.z) <= r) near++;
  }
  return near / ids.length;
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

export async function clashWorld(n0, n1) {
  const { createWorld, setGoal } = await import('../src/sim/world.js');
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const a = await spawnBlock(w, 0, 0, n0, { x: 600, z: 360 });
  const b = await spawnBlock(w, 1, 0, n1, { x: 600, z: 410 });
  setGoal(w, a, { kind: 'sector', id: 's0-center' });
  setGoal(w, b, { kind: 'sector', id: 's1-center' });
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
  const z0 = w.map.sectors.find(x => x.id === 's0-center').z, z1 = w.map.sectors.find(x => x.id === 's1-center').z;
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
export function roleWorld(weightPerSide) {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  spawnMixedClash(w, weightPerSide, 'center');
  return w;
}
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
export function fractionNearSegmentEnds(w, side, type, r) {
  const s = w.soldiers, sec = w.map.sectors.find(x => x.side === side && x.id.endsWith('center'));
  const enemy = w.map.sectors.find(x => x.side !== side && x.id.endsWith('center'));
  let n = 0, near = 0;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== side || s.type[i] !== type) continue;
    n++;
    const ends = Math.min(Math.abs(s.x[i] - sec.x0), Math.abs(s.x[i] - sec.x1)) <= r || s.x[i] < sec.x0 || s.x[i] > sec.x1;
    const behind = side === 0 ? s.z[i] > enemy.z : s.z[i] < enemy.z;
    if (ends || behind) near++;
  }
  return n ? near / n : 0;
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

// ---- Task 8: 건물 ----
// 편 0: 앞 거점 f0L(마구간)·f0R(사격장)만 쥔 세상. 다른 거점은 주인 없음. 징집이 돈다.
export function buildWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  for (const st of w.strongholds) {
    if (st.id === 'f0L' || st.id === 'f0R') continue;
    st.owner = null; st.gauge = 0;
  }
  const at = id => w.strongholds.find(s => s.id === id);
  at('f0L').slots[0] = { kind: 'stable', level: 1, hp: w.rules.buildings.hp };
  at('f0R').slots[0] = { kind: 'archery', level: 1, hp: w.rules.buildings.hp };
  w.production = true;
  return w;
}
export function producedCount(w, id, type) { return w.strongholds.find(s => s.id === id).producedByType?.[type] ?? 0; }
export function putEnemyInCircle(w, id) {
  const st = w.strongholds.find(s => s.id === id);
  spawnOne(w.soldiers, 1 - st.owner, 0, st.x + 5, st.z, w.rules);
  step(w);
}
export function captureBy(w, id, side) {
  const st = w.strongholds.find(s => s.id === id);
  const old = st.owner;
  st.owner = side; st.gauge = side === 0 ? 100 : -100;
  w.ownerChanged(st, old, side);
}
export function buildingsAt(w, id) { return w.strongholds.find(s => s.id === id).slots.filter(Boolean).length; }

// ---- Task 10: 수비 ----
// 편 0: 뒤 거점 r0L만 쥐고 수비대 0, 징집이 돈다. 왼쪽 구역에 우리 창병 무게 700이 서 있다(막아라가 끌어올 병력).
export function defenseWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  for (const st of w.strongholds) if (st.id !== 'r0L') { st.owner = null; st.gauge = 0; }
  const sec = w.map.sectors.find(x => x.id === 's0-left');
  const ids = [];
  for (let k = 0; k < 700; k++) ids.push(spawnOne(w.soldiers, 0, 0, sec.x0 + (k % 100) * 1.2, sec.z - 10 - Math.floor(k / 100) * 1.2, w.rules));
  setGoalOf(w, ids, { kind: 'sector', id: 's0-left' });
  w.production = true;
  return w;
}
const stOf = (w, id) => w.strongholds.find(s => s.id === id);
export function garrisonWeight(w, id) {
  const s = w.soldiers, k = w.strongholds.indexOf(stOf(w, id)); let sum = 0;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.state[i] === 3 && s.goalId[i] === k && s.returnTo[i] < 0) sum += w.rules.units[s.side[i]][s.type[i]].weight;
  return sum;
}
export function pulledWeight(w, id) {
  const s = w.soldiers, k = w.strongholds.indexOf(stOf(w, id)); let sum = 0;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.goalId[i] === k && s.returnTo[i] >= 0) sum += w.rules.units[s.side[i]][s.type[i]].weight;
  return sum;
}
// 거점 가운데에서 +x 쪽으로 d m에 적 창병 하나(제자리에 선다).
export function enemyAt(w, id, d) {
  const st = stOf(w, id);
  const e = spawnOne(w.soldiers, 1 - st.owner, 0, st.x + d, st.z, w.rules);
  setGoalOf(w, [e], { kind: 'point', x: st.x + d, z: st.z });
  return e;
}
// 적 창병 무게 weight를 거점 가운데에서 +x 쪽 d m(at.slot이면 그 건물 자리)에 모아 세운다.
export function enemyWeightAt(w, id, d, weight, at = {}) {
  const st = stOf(w, id);
  let x = st.x + d, z = st.z;
  if (at.slot !== undefined) ({ x, z } = buildingPosOf(st, at.slot));
  const ids = [];
  const n = Math.ceil(weight / w.rules.units[1 - st.owner][0].weight - 1e-9);   // 몬스터 고블린은 무게 0.5
  const cols = Math.ceil(Math.sqrt(n)), half = (cols - 1) * 0.45;                // 네모 덩어리
  for (let k = 0; k < n; k++) ids.push(spawnOne(w.soldiers, 1 - st.owner, 0, x + (k % cols) * 0.9 - half, z + Math.floor(k / cols) * 0.9 - half, w.rules));
  setGoalOf(w, ids, { kind: 'point', x, z });
  return ids;
}
export function chasedBy(w, e) {
  const s = w.soldiers; let n = 0;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] !== s.side[e] && s.target[i] === e) n++;
  return n;
}
export function clearEnemies(w, id) {
  const st = stOf(w, id), s = w.soldiers;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] !== st.owner) kill(s, i);
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

// ---- Task 12: 장수 ----
// 빈 세상(생산 없음). 편 0 장수 g0a(600, 300) 둘레에 우리 창병 무게 700, 장수 g0b(900, 330)는 홀로.
export function generalWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  addGeneralOf(w, 0, 600, 300, 'g0a');
  addGeneralOf(w, 0, 900, 330, 'g0b');
  for (let k = 0; k < 700; k++) {
    const id = spawnOne(w.soldiers, 0, 0, 600 + (k % 35) * 1.1 - 19, 290 - Math.floor(k / 35) * 1.1, w.rules);
    setGoalOf(w, [id], { kind: 'sector', id: 's0-center' });
    w.soldiers.state[id] = 2;
  }
  return w;
}
const genOf = (w, id) => w.generals.find(g => g.id === id);
export function allNear(w, id, r = 80) {
  const g = genOf(w, id), s = w.soldiers, out = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === g.side && Math.hypot(s.x[i] - g.x, s.z[i] - g.z) <= r) out.push(i);
  return out;
}
const weightOf = (w, ids) => [...ids].reduce((a, i) => a + w.rules.units[w.soldiers.side[i]][w.soldiers.type[i]].weight, 0);
export function attachedIds(w, id) {
  const k = w.generals.indexOf(genOf(w, id)), s = w.soldiers, out = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.general[i] === k) out.push(i);
  return out;
}
export function attachedWeight(w, id) { return weightOf(w, attachedIds(w, id)); }
export function auraOf(w, id) { return genOf(w, id).aura; }
export function auraWeight(w, id) { return weightOf(w, auraOf(w, id)); }
// 장수 둘레 20 m에 side 편 무게 weight를 세운다(제자리).
export function surround(w, id, side, weight) {
  const g = genOf(w, id), n = Math.ceil(weight / w.rules.units[side][0].weight - 1e-9), ids = [];
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, x = g.x + Math.cos(a) * 20, z = g.z + Math.sin(a) * 20;
    const e = spawnOne(w.soldiers, side, 0, x, z, w.rules);
    setGoalOf(w, [e], { kind: 'point', x, z });
    ids.push(e);
  }
  return ids;
}
export function isRouted(w, id) { return w.time < genOf(w, id).routedUntil; }
let extraGenerals = 0;
export function generalAt(w, side, p) { const id = `gx${extraGenerals++}`; addGeneralOf(w, side, p.x, p.z, id); return id; }
export function newSoldierGoal(w, id) { return arrowOfStronghold(w, w.strongholds.find(s => s.id === id)); }

// ---- Task 13: 시야 ----
// 빈 세상: 우리 병사 (600,300), 적 병사 (600,325) 들판과 (600,320) 숲(그 4 m 칸만 숲으로 칠함). 시야를 한 번 계산해 둔다.
export function visionWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  const m = w.map, c = Math.floor(600 / m.cell), r = Math.floor(320 / m.cell);
  m.terrain[r * m.cols + c] = 1; m.terrain[r * m.cols + c - 1] = 1;     // FOREST
  const ours = spawnOne(w.soldiers, 0, 0, 600, 300, w.rules);
  setGoalOf(w, [ours], { kind: 'point', x: 600, z: 300 });
  for (const z of [325, 320]) { const e = spawnOne(w.soldiers, 1, 0, 600, z, w.rules); setGoalOf(w, [e], { kind: 'point', x: 600, z }); }
  for (const st of w.strongholds) if (st.kind !== 'vp' && st.id !== 'f0L' && st.id !== 'f1L') st.owner = null;   // 거점 시야는 f0L만
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

// ---- Task 14: 적 AI ----
// 편 1 = 판단 다섯 가지 AI. 규모 scale의 실제 판(편 0은 조종 없음 — 기본 화살표).
export function aiBattle(scale, seed, personality = 'aggressive') {
  const w = createWorld({ seed, knobs: { scale }, scenario: 'battle' });
  const ai = makeAiOf(1, { personality, difficulty: 'normal' }, makeRngOf(seed * 31 + 7));
  w.controllers[1] = ai;
  return { w, ai };
}
export function arrowsOf(w, side) { return Object.fromEntries([...w.sides[side].arrows].map(([k, v]) => [k, `${v.kind}:${v.id}`])); }
// 빈 세상: 몬스터 앞 거점에 사격장·뒤 거점에 마구간이 이미 서 있고 금 0, 생산은 멈춰 있다(건물 판단만 본다).
export function aiWatchWorld(personality = 'aggressive') {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  for (const st of w.strongholds) if (st.owner === 1 && st.kind !== 'hq') st.slots[0] = { kind: st.kind === 'front' ? 'archery' : 'stable', level: 1, hp: w.rules.buildings.hp };
  w.sides[1].gold = 0;
  const ai = makeAiOf(1, { personality, difficulty: 'normal' }, makeRngOf(5));
  w.controllers[1] = ai;
  return { w, ai };
}
// 우리 기병 n이 몬스터 앞 거점 f1L 가운데에서 80 m 앞(우리 쪽)에 서 있다 — 거점 시야(100 m) 안.
export function showCavalry(w, n) {
  const st = stOf(w, 'f1L'), ids = [];
  for (let k = 0; k < n; k++) ids.push(spawnOne(w.soldiers, 0, 2, st.x - 8 + (k % 10) * 1.6, st.z - 80 - Math.floor(k / 10) * 1.6, w.rules));
  for (const i of ids) setGoalOf(w, [i], { kind: 'point', x: w.soldiers.x[i], z: w.soldiers.z[i] });
  return ids;
}
export function hasBuilding(w, side, kind) { return w.strongholds.some(st => st.owner === side && st.slots.some(b => b && b.kind === kind)); }
// 편 1(AI)은 뒤 거점 r1L만 쥐고 수비대가 차 있다. 왼쪽 구역에 몬스터 창 고블린 무게 700이 서 있다(막아라가 끌어올 병력).
export function aiDefenseWorld() {
  const w = createWorld({ scenario: 'empty', seed: 1 });
  for (const st of w.strongholds) if (st.id !== 'r1L') { st.owner = null; st.gauge = 0; }
  const sec = w.map.sectors.find(x => x.id === 's1-left'), ids = [];
  const n = Math.round(700 / w.rules.units[1][0].weight);
  for (let k = 0; k < n; k++) ids.push(spawnOne(w.soldiers, 1, 0, sec.x0 + (k % 200) * 0.9 + 20, sec.z + 10 + Math.floor(k / 200) * 0.9, w.rules));
  setGoalOf(w, ids, { kind: 'sector', id: 's1-left' });
  spawnGarrisons(w);
  w.production = true;
  const ai = makeAiOf(1, { personality: 'careful', difficulty: 'normal' }, makeRngOf(9));
  w.controllers[1] = ai;
  return { w, ai };
}
export function holdingAt(w, side, id) { return w.holds.some(h => h.side === side && w.strongholds[h.stronghold].id === id); }
// sec초를 돌며 편 side가 낸 '보내기' 사건을 모은다(판 시각과 그때 목표 거점의 주인을 붙여).
export function sendsDuring(w, side, sec) {
  const out = [];
  for (let k = 0, n = Math.round(sec / w.rules.dt); k < n && !w.result; k++) {
    step(w);
    for (const e of w.events) if (e.kind === 'send' && e.side === side)
      out.push({ ...e, t: w.time, targetOwner: e.target.kind === 'stronghold' ? stOf(w, e.target.id).owner : null });
  }
  return out;
}
