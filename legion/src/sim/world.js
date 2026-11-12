// 세상 하나와 한 틱의 차례(계획서 Task 3):
// ① 명령 ③ 판단(+ 소굴 끈) ④ 걸음·밀기·되돌리기 ⑤ 싸움 ⑦ 시야 ⑥ 점령·이어짐(지도에 지역이 있을 때) ⑧ 사건 정리(② 생산은 3단계에서 새로).
import { makeRules } from './rules.js';
import { makeRng } from './rng.js';
import { buildMap, MAPS } from './map.js';
import { createSoldiers, rebuildGrid, hash01, GOAL, STATE, ORDER } from './soldiers.js';
import { computeField } from './flowfield.js';
import { stepMovement, clampTurns, nearestWalkable } from './movement.js';
import { stepSquads } from './squads.js';
import { stepBehavior } from './behavior.js';
import { stepCombat } from './combat.js';
import { applyOrder } from './orders.js';
import { stepGroups } from './groups.js';
import { stepVision } from './vision.js';
import { stepCasts } from './casts.js';
import { stepCatapults } from './catapult.js';
import { stepCamps } from './camps.js';
import { makeTerritory, relink, stepTerritory } from './territory.js';
import { makeSide, stepEconomy } from './economy.js';
import { stepWorkers } from './workers.js';
import { stepBuildings } from './buildings.js';
import { stepQueues } from './produce.js';
import { stepStrikes } from './strikes.js';

const NOTICE_EVERY = 20, NOTICE_KEEP = 60;   // 알림 정리: 틱 간격, 남겨 두는 초

// scenario는 옛 인자(받아도 무시). map = 지도 이름(maps/*.js — 1단계는 'lab' 하나).
export function createWorld({ knobs = {}, seed = 1, map: mapName = 'lab' } = {}) {
  const rules = makeRules(knobs);
  if (!MAPS[mapName]) throw new Error(`모르는 지도 ${mapName}`);
  const map = buildMap(rules, MAPS[mapName]);
  const capacity = Math.ceil(rules.cap * 3) + 2000;
  const soldiers = createSoldiers(capacity, map, rules.movement.cellSize);
  const w = {
    rules, map, rng: makeRng(seed), seed, tick: 0, time: 0, acc: 0,
    sides: [0, 1].map(() => makeSide(rules)),            // 자원·수입률·인구(economy.js), 지휘 스킬 다시 쓰기(casts.js)
    soldiers, events: [], deaths: [], shots: [], boulders: [],   // boulders: 나는 투석기 돌(catapult.js)
    result: null,
    casts: [],                                          // 건 지휘 스킬의 원 { side, order, x, z, r, at, until }(화면이 그린다, casts.js)
    notices: [],                                        // 화면 알림 { side, kind, at, … }(catapult.js 결과 알림)
    pendingOrders: [], controllers: [null, null], groups: [], nextGroupId: 0, squads: [], camps: [], campIndex: [],   // camps: 괴물 소굴(camps.js), campIndex[지역 id] = 그 소굴
    fields: { points: [] },
    buildings: [], buildingById: new Map(), nextBuildingId: 1, nextCrew: 0, nextUnit: 0,   // 건물(buildings.js) — id는 1부터(−1 = 없음), nextCrew: 광부 조 번호(workers.js), nextUnit: 부대 번호(units.js)
    depositUse: new Int32Array(map.deposits.length).fill(-1),     // 자원 자리마다 그 위 건물 id
  };
  // "그 자리" 흐름장. 건물이 길을 바꿨으면(map.version) 다시 계산한다 — 한 틱에 rules.build.fieldBudget개까지, 넘으면 그 틱은 옛 흐름장.
  w.pointField = id => {
    const p = w.fields.points[id];
    if (!p) return null;
    if (p.version !== w.map.version) refreshField(w, p);
    return p.field;
  };
  w.territory = makeTerritory(map);                    // 지역 땅 상태(territory.js) — 시험장 지도는 null
  if (w.territory) relink(w);
  return w;
}

export function step(w, orders = []) {
  if (w.result) return;                                 // 끝난 판(성채가 무너졌다)
  w.events.length = 0;
  while (w.shots.length && w.shots[0].t < w.time - 0.5) w.shots.shift();
  for (const c of w.controllers) if (c) w.pendingOrders.push(...c.think(w));
  for (const o of [...orders, ...w.pendingOrders]) {    // ① 명령
    const r = applyOrder(w, o);
    if (!r.ok) w.events.push({ kind: 'rejected', order: o, reason: r.reason });
  }
  w.pendingOrders.length = 0;
  stepCasts(w);                                         // 끝난 지휘 스킬의 원 지우기
  rebuildGrid(w.soldiers);
  stepBehavior(w);                                      // ③
  stepCamps(w);                                         // 소굴 끈(끌려 나간 괴물은 돌아간다)
  stepWorkers(w);                                       // 광부: 건물 곁이면 짓기·고치기를 센다
  stepGroups(w);
  stepSquads(w);                                        // 조용해진 공격 무리는 진형으로 선다
  stepMovement(w);                                      // ④
  rebuildGrid(w.soldiers);
  stepCatapults(w);                                     // 투석기 돌(맞닿음은 앞 틱 싸움에서)
  stepCombat(w);                                        // ⑤
  stepStrikes(w);                                       // 건물 피해(strikes.js)
  clampTurns(w);                                        // 도는 빠르기 한계(movement.js)
  stepVision(w);                                        // ⑦ 시야(4틱마다)
  stepTerritory(w);                                     // ⑥ 점령·이어짐(capture.every틱마다)
  stepEconomy(w);                                       // 수입·인구(economy.every틱마다 다시 셈)
  stepBuildings(w);                                     // 짓기 진행
  stepQueues(w);                                        // 생산 줄(produce.js)
  if (w.tick % NOTICE_EVERY === 0 && w.notices.length) w.notices = w.notices.filter(n => !(w.time - n.at > NOTICE_KEEP));   // 오래된 알림 지우기(화면이 틱마다 훑는다)
  w.tick++;
  w.time = w.tick * w.rules.dt;
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

// 병사들의 목표를 정한다(점·적). 명령(ORDER)은 지운다 — 적(foe)이면 ATTACK.
// 보내기(orders.js send)는 이 뒤에 MOVE를 건다.
export function setGoal(w, ids, target) {
  const s = w.soldiers;
  for (const i of ids) {
    s.order[i] = ORDER.NONE;
    s.restFacing[i] = NaN; s.pressUntil[i] = 0;
    if (target.kind === 'foe') {                                  // 적 병사 공격(사용자 2026-11-08): 그 적의 자리로, 죽었으면 마지막 자리로
      const f = target.id, ok = f >= 0 && f < s.count && s.alive[f] && s.serial[f] === target.serial;
      s.goalKind[i] = GOAL.POINT; s.goalId[i] = -1; s.goalX[i] = ok ? s.x[f] : target.x; s.goalZ[i] = ok ? s.z[f] : target.z;
      s.order[i] = ORDER.ATTACK; s.orderFoe[i] = f; s.orderSerial[i] = target.serial; s.orderBest[i] = Infinity; s.orderAt[i] = w.time;
    } else if (target.kind === 'point') {
      // 그 자리(사용자 2026-11-08): 한 점에 엉기지 않게 반지름 r 원 안 자기 자리(병사 번호로 고정). field = 그 점의 흐름장(강을 돈다).
      const r = target.r ?? 0, a = hash01(i * 7 + 3) * Math.PI * 2, rr = r * Math.sqrt(hash01(i * 11 + 5));
      let gx = target.x + Math.cos(a) * rr, gz = target.z + Math.sin(a) * rr;
      const R = target.ring;                                      // 건물 공격(3단계): 온 쪽을 가운데로 둘레 띠의 ¾ 위 제 자리
      if (R) { const a0 = Math.atan2(target.z - R.z, target.x - R.x), ar = a0 + (hash01(i * 7 + 3) - 0.5) * Math.PI * 1.5, rad = R.r0 + (R.r1 - R.r0) * hash01(i * 11 + 5); gx = R.x + Math.cos(ar) * rad; gz = R.z + Math.sin(ar) * rad; }
      if (!w.map.walkable(gx, gz)) { gx = target.x; gz = target.z; }
      s.goalKind[i] = GOAL.POINT; s.goalId[i] = target.field ?? -1; s.goalX[i] = gx; s.goalZ[i] = gz;
    }
    if (s.state[i] === STATE.FRONT) s.state[i] = STATE.MARCH;
  }
}

// "그 자리"로 보낸 병사가 따라갈 흐름장. 같은 칸(4 m)이면 다시 쓰고, 없으면 만든다. 돌려주는 값 = w.pointField(id)의 id.
export function pointFieldId(w, x, z) {
  const cell = w.map.cellOf(x, z), list = w.fields.points;
  const k = list.findIndex(p => p.cell === cell);
  if (k >= 0) return k;
  list.push({ cell, x, z, field: fieldTo(w.map, x, z), version: w.map.version });   // x, z: 흐름장이 이끄는 점(movement가 그 점을 지났나 본다)
  return list.length - 1;
}

// 그 점으로 가는 흐름장 — 점이 건물에 덮였으면 가장 가까운 걸을 수 있는 칸으로.
function fieldTo(map, x, z) {
  const [tx, tz] = map.walkable(x, z) ? [x, z] : nearestWalkable(map, x, z);
  return computeField(map, [{ x: tx, z: tz }]);
}

function refreshField(w, p) {
  if (w._fieldTick !== w.tick) { w._fieldTick = w.tick; w._fieldSpent = 0; }
  if (w._fieldSpent >= w.rules.build.fieldBudget) return;
  w._fieldSpent++;
  p.field = fieldTo(w.map, p.x, p.z);
  p.version = w.map.version;
}

