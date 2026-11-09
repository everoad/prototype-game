// 세상 하나와 한 틱의 차례(계획서 Task 3):
// ① 명령 ② 생산 ③ 판단 ④ 걸음·밀기·되돌리기 ⑤ 싸움 ⑥ 점령·사기 ⑦ 시야 ⑧ 사건 정리.
import { makeRules } from './rules.js';
import { makeRng } from './rng.js';
import { buildMap, isPoint } from './map.js';
import { createSoldiers, rebuildGrid, hash01, GOAL, STATE, ORDER } from './soldiers.js';
import { computeField } from './flowfield.js';
import { stepMovement } from './movement.js';
import { stepBehavior } from './behavior.js';
import { stepCombat } from './combat.js';
import { stepProduction, spawnStartArmies, spawnGarrisons } from './production.js';
import { stepCapture } from './capture.js';
import { stepMorale, checkEnd, applyMoraleEvent } from './morale.js';
import { applyOrder } from './orders.js';
import { stepGroups } from './groups.js';
import { stepDefense } from './defense.js';
import { stepGenerals, joinGeneral } from './generals.js';
import { stepVision } from './vision.js';
import { UPGRADES } from './orders.js';
import { stepCasts } from './casts.js';
import { stepSiege } from './siege.js';
import { stepFormation } from './formation.js';

const CROWD_FREE = 4;   // 한 칸(4 m)에 이만큼까지는 붐빔 비용 없음
const CROWD_COST = 1;   // 그 위로 한 명마다 m

export function createWorld({ knobs = {}, seed = 1, scenario = 'battle' } = {}) {
  const rules = makeRules(knobs);
  const map = buildMap(rules);
  const capacity = Math.ceil(rules.cap * 3) + 2000;
  const soldiers = createSoldiers(capacity, map, rules.movement.cellSize);
  const strongholds = map.strongholds.map(d => ({
    ...d, slotCount: d.slots, slots: Array.from({ length: d.slots + (isPoint(d) ? 0 : UPGRADES.length) }, () => null),   // 생산 칸 + 강화 칸(성벽·망루). 점(승점·땅)은 칸이 없다
    gauge: d.side === 0 ? 100 : d.side === 1 ? -100 : 0, owner: d.side, original: d.side,
    wallHp: 0, garrisonWeight: 0, levyAcc: 0, produced: 0, weightIn: [0, 0],
  }));
  const w = {
    rules, map, rng: makeRng(seed), seed, tick: 0, time: 0, acc: 0,
    sides: [0, 1].map(() => ({ gold: rules.gold.start, morale: rules.morale.start, generals: [], arrows: new Map(), alive: 0, alerts: [], cooldowns: {} })),   // cooldowns: 금 명령마다 다시 쓸 수 있는 때(casts.js)
    soldiers, strongholds, events: [], deaths: [], shots: [], moraleLog: [], result: null, hqLost: null, vpCount: [0, 0],
    casts: [],                                          // 건 금 명령의 원 { side, order, x, z, r, at, until }(화면이 그린다, casts.js)
    notices: [],                                        // 화면 알림 { side, kind: 'siegeReady', stronghold, ids, at }(siege.js)
    production: scenario === 'battle', pendingOrders: [], controllers: [null, null], groups: [], nextGroupId: 0, holds: [], generals: [],
    fields: { sector: map.sectors.map(() => null), stronghold: new Map(), points: [], cursor: 0 },
  };
  w.strongholdField = id => strongholdField(w, id);
  w.pointField = id => w.fields.points[id]?.field ?? null;
  w.ownerChanged = (st, old, nu) => onOwnerChange(w, st, old, nu);
  w.burnBuilding = (st, k) => burnBuilding(w, st, k);
  map.sectors.forEach((sec, k) => { w.fields.sector[k] = sectorField(w, sec, false); });
  if (scenario === 'battle') setupBattle(w);
  return w;
}

// 시작(설계서 §2.2): 세 구역에서 다가오는 대군, 차 있는 수비대, 본진 성벽.
function setupBattle(w) {
  for (const st of w.strongholds) if (st.kind === 'hq') {
    st.wallHp = w.rules.buildings.wall.hqHp;
    w.rules.start.hqBuildings.forEach((kind, k) => { st.slots[k] = { kind, level: 1, hp: w.rules.buildings.hp }; });   // §2.2 본진 사격장·마구간
  }
  spawnStartArmies(w);
  spawnGarrisons(w);
  // 장수는 세우지 않는다(설계서 §4, 사용자 2026-11-08 PC 조작 — 고르고 오른쪽 클릭). 판정 코드(generals.js)는 남겨 둔다.
}

// 거점 주인이 바뀌면 원래 주인이 사기를 잃는다(승점은 계속 깎는 쪽이라 사건이 없다).
function onOwnerChange(w, st, old, nu) {
  w.events.push({ kind: 'captured', stronghold: st.id, from: old, to: nu });
  if (old === null || isPoint(st)) return;                 // 점(승점·작은 땅)은 건물·사기와 상관없다
  st.slots.forEach((b, k) => { if (b) { burnBuilding(w, st, k, old); } });   // 빼앗기면 남은 건물이 모두 탄다(§3.3)
  if (st.kind !== 'hq') st.wallHp = 0;
  const kind = st.kind === 'hq' ? 'loseHq' : st.original === old ? (st.kind === 'front' ? 'loseFront' : 'loseRear') : 'loseCaptured';
  applyMoraleEvent(w, old, kind, st.id);
}

// 건물이 탄다: 칸이 비고, 주인이 사기 −2(§7.2).
export function burnBuilding(w, st, k, owner = st.owner) {
  const b = st.slots[k];
  if (!b) return;
  st.slots[k] = null;
  w.events.push({ kind: 'burned', stronghold: st.id, building: b.kind });
  if (owner !== null) applyMoraleEvent(w, owner, 'buildingBurned', `${st.id} ${b.kind}`);
}

export function step(w, orders = []) {
  w.events.length = 0;
  while (w.shots.length && w.shots[0].t < w.time - 0.5) w.shots.shift();
  for (const c of w.controllers) if (c) w.pendingOrders.push(...c.think(w));
  for (const o of [...orders, ...w.pendingOrders]) {    // ① 명령
    const r = applyOrder(w, o);
    if (!r.ok) w.events.push({ kind: 'rejected', order: o, reason: r.reason });
  }
  w.pendingOrders.length = 0;
  stepDefense(w);                                       // 수비 훑기·경보(앞 틱의 격자)
  stepProduction(w);                                    // ②
  stepCasts(w);                                         // 끝난 금 명령의 원 지우기
  stepSiege(w);                                         // 다 된 공성병
  stepFormation(w);                                     // 거점 수비 진형 자리(2초마다)
  rebuildGrid(w.soldiers);
  refreshOneField(w);
  stepGenerals(w);                                      // 장수 걷기·패주·별동대 자리·기운
  stepBehavior(w);                                      // ③
  stepGroups(w);
  stepMovement(w);                                      // ④
  rebuildGrid(w.soldiers);
  stepCombat(w);                                        // ⑤
  if (!w.result) {                                      // ⑥
    stepCapture(w, (st, old, nu) => onOwnerChange(w, st, old, nu));
    stepMorale(w);
  }
  checkEnd(w);
  stepVision(w);                                        // ⑦ 시야(4틱마다)
  w.tick++;
  w.time = w.tick * w.rules.dt;
  if (w.metrics) w.metrics.tick(w);                     // 지표(Task 15): 이 틱의 사건과 1초마다 표본(w.stats는 전투 측정 도구가 쓴다)
}

// 실제 흐른 시간만큼 틱을 돈다. 한 번에 maxSteps까지, 넘친 시간은 버린다(Review Focus 2).
export function advance(w, seconds, maxSteps = 5) {
  w.acc += seconds;
  const dt = w.rules.dt;
  let n = Math.floor(w.acc / dt + 1e-9);
  if (n > maxSteps) { n = maxSteps; w.acc = 0; } else w.acc -= n * dt;
  for (let k = 0; k < n; k++) step(w);
  return n;
}

// 병사들의 목표를 정한다. 구역이면 선분 위 자기 자리(병사 번호로 고정). 명령(ORDER)은 지운다 — 적(foe)이면 ATTACK.
// 보내기(orders.js send)는 이 뒤에 MOVE를 건다.
export function setGoal(w, ids, target) {
  const s = w.soldiers;
  if (target.kind === 'general') { for (const i of ids) s.fmRole[i] = 0; joinGeneral(w, ids, target.id); return; }   // 장수에게: 한도까지 붙고 넘치면 가까운 구역
  for (const i of ids) {
    s.order[i] = ORDER.NONE;
    s.fmRole[i] = 0;                                              // 목표가 바뀌면 진형 역할이 풀린다(formation.js가 다시 정한다)
    if (target.kind === 'foe') {                                  // 적 병사 공격(사용자 2026-11-08): 그 적의 자리로, 죽었으면 마지막 자리로
      const f = target.id, ok = f >= 0 && f < s.count && s.alive[f] && s.serial[f] === target.serial;
      s.goalKind[i] = GOAL.POINT; s.goalId[i] = -1; s.goalX[i] = ok ? s.x[f] : target.x; s.goalZ[i] = ok ? s.z[f] : target.z;
      s.order[i] = ORDER.ATTACK; s.orderFoe[i] = f; s.orderSerial[i] = target.serial; s.orderBest[i] = Infinity; s.orderAt[i] = w.time;
    } else if (target.kind === 'sector') {
      const k = w.map.sectors.findIndex(sec => sec.id === target.id);
      const sec = w.map.sectors[k];
      s.goalKind[i] = GOAL.SECTOR; s.goalId[i] = k;
      s.slotX[i] = slotOnSegment(sec, i);
      s.slotZ[i] = sec.z + (sec.side === 0 ? -1 : 1) * slotDepth(i);
      s.goalX[i] = s.slotX[i]; s.goalZ[i] = s.slotZ[i];
    } else if (target.kind === 'stronghold') {
      const k = w.strongholds.findIndex(st => st.id === target.id);
      const st = w.strongholds[k];
      const a = hash01(i * 7 + 3) * Math.PI * 2, rr = st.radius * 0.5 * Math.sqrt(hash01(i * 11 + 5));
      s.goalKind[i] = GOAL.STRONGHOLD; s.goalId[i] = k;
      s.goalX[i] = st.x + Math.cos(a) * rr; s.goalZ[i] = st.z + Math.sin(a) * rr;
    } else if (target.kind === 'point') {
      // 그 자리(사용자 2026-11-08): 한 점에 엉기지 않게 반지름 r 원 안 자기 자리(병사 번호로 고정). field = 그 점의 흐름장(강을 돈다).
      const r = target.r ?? 0, a = hash01(i * 7 + 3) * Math.PI * 2, rr = r * Math.sqrt(hash01(i * 11 + 5));
      let gx = target.x + Math.cos(a) * rr, gz = target.z + Math.sin(a) * rr;
      if (!w.map.walkable(gx, gz)) { gx = target.x; gz = target.z; }
      s.goalKind[i] = GOAL.POINT; s.goalId[i] = target.field ?? -1; s.goalX[i] = gx; s.goalZ[i] = gz;
    }
    if (s.state[i] === STATE.FRONT) s.state[i] = STATE.MARCH;
  }
}

// 선분 위 자리: 가운데(승점 쪽)로 몰린 종 모양(표준편차 = 폭 × SLOT_SPREAD). 가운데는 두꺼운 덩어리, 끝은 얇아 틈이 생긴다.
// 깊이: 선분에서 자기 쪽으로 반쪽 정규분포(표준편차 SLOT_DEPTH, 최대 SLOT_DEPTH_MAX) — 한 줄이 아니라 두께 있는 덩어리.
const SLOT_SPREAD = 0.22, SLOT_DEPTH = 9, SLOT_DEPTH_MAX = 28;
function slotDepth(i) {
  const u1 = Math.max(1e-6, hash01(i * 29 + 11)), u2 = hash01(i * 31 + 17);
  return Math.min(SLOT_DEPTH_MAX, Math.abs(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)) * SLOT_DEPTH);
}
function slotOnSegment(sec, i) {
  const u1 = Math.max(1e-6, hash01(i)), u2 = hash01(i * 13 + 7);
  const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const mid = (sec.x0 + sec.x1) / 2, half = (sec.x1 - sec.x0) / 2;
  return mid + Math.max(-half, Math.min(half, g * (sec.x1 - sec.x0) * SLOT_SPREAD));
}

function sectorField(w, sec, crowded) {
  const pts = [];
  for (let x = sec.x0; x <= sec.x1; x += w.map.cell) pts.push({ x, z: sec.z });
  return computeField(w.map, pts, crowded ? crowdCost(w) : undefined);
}

// "그 자리"로 보낸 병사가 따라갈 흐름장. 같은 칸(4 m)이면 다시 쓰고, 없으면 만든다. 돌려주는 값 = w.pointField(id)의 id.
export function pointFieldId(w, x, z) {
  const cell = w.map.cellOf(x, z), list = w.fields.points;
  const k = list.findIndex(p => p.cell === cell);
  if (k >= 0) return k;
  list.push({ cell, x, z, field: computeField(w.map, [{ x, z }]) });   // x, z: 흐름장이 이끄는 점(movement가 그 점을 지났나 본다)
  return list.length - 1;
}

function strongholdField(w, k) {
  let f = w.fields.stronghold.get(k);
  if (!f) {
    const st = w.strongholds[k];
    f = computeField(w.map, [{ x: st.x, z: st.z }]);
    w.fields.stronghold.set(k, f);
  }
  return f;
}

function crowdCost(w) {
  const s = w.soldiers, counts = s.cellCount;
  const same = s.cellSize === w.map.cell;
  return cell => {
    if (!same) return 0;
    const extra = counts[cell] - CROWD_FREE;
    return extra > 0 ? extra * CROWD_COST : 0;
  };
}

// 구역 흐름장을 붐빔 비용으로 다시 계산하되, 한 틱에 하나씩 돌아가며(보완 2, 2초마다 한 바퀴).
function refreshOneField(w) {
  const n = w.map.sectors.length;
  const every = Math.max(1, Math.floor(w.rules.fields.recomputeSeconds / w.rules.dt / n));
  if (w.tick % every !== 0) return;
  const k = w.fields.cursor;
  w.fields.sector[k] = sectorField(w, w.map.sectors[k], true);
  w.fields.cursor = (k + 1) % n;
}
