// 생산 줄(설계서 §4 "생산", 3단계 계획 Task 5): 한 번에 쐐기 하나(병종 무게 그대로 — 사용자 "한 번에 많이 나온다고 너무 비싸게만 하지 말아 줘").
// 값은 줄에 넣을 때 한 번, 인구는 줄 맨 앞이 시작할 때 잡아 두고(reserved) 나오면 병사 무게로 바뀐다. 나온 쐐기는 건물 앞에 진형째 서고, 집결지가 있으면 이동으로 간다.
import { spawn, forEachNear } from './soldiers.js';
import { setGoal } from './world.js';
import { applyOrder } from './orders.js';
import { formationOffsets, classOf } from './groups.js';
import { nearestWalkable } from './movement.js';
import { removeBuilding } from './buildings.js';
import { spawnCrew } from './workers.js';
import { costOf, canPay, pay, lack } from './economy.js';
import { newUnit } from './units.js';
import { landWhy, pauseWhy } from './lands.js';

const fail = reason => ({ ok: false, reason });
const POP_ALERT = 10;   // 인구 가득 알림 간격 s

// 한 번에 나오는 것: { type, n, weight } — n = count, 없으면 그 병종 쐐기 무게(group.weightByClass) ÷ 병사 무게.
export function batchOf(rules, side, key) {
  const t = rules.train[key], u = rules.units[side][t.type];
  const n = t.count ?? Math.round(rules.group.weightByClass[key] / u.weight);
  return { type: t.type, n, weight: n * u.weight };
}

// 쐐기 하나를 (tipX, tipZ)가 끝이 되게 heading 쪽을 보고 세운다. 걸을 수 없는 자리는 가장 가까운 걸을 수 있는 칸. 병사마다 제 자리가 목표.
export function spawnWedge(w, side, type, n, tipX, tipZ, heading, elite = false) {
  const s = w.soldiers, offs = formationOffsets(classOf(type), n, w.rules.group), c = Math.cos(heading), sn = Math.sin(heading), ids = [];
  for (const o of offs) {
    let x = tipX + c * o.f - sn * o.l, z = tipZ + sn * o.f + c * o.l;
    if (!w.map.walkable(x, z)) [x, z] = nearestWalkable(w.map, x, z);
    const i = spawn(s, side, type, x, z, w.rules);
    s.facing[i] = s.pfacing[i] = heading;
    s.elite[i] = elite ? 1 : 0;
    setGoal(w, [i], { kind: 'point', x, z });
    ids.push(i);
  }
  newUnit(w, ids);                                                   // 쐐기 하나 = 부대 하나(4단계)
  return ids;
}

// 건물 앞 자리: 집결지(없으면 판 가운데) 쪽으로 r + gap + depth m. 끝이 걸을 수 없거나 그 진형 자리에 우리 병사가 이미 서 있으면 45°씩 돌려 보고,
// 한 바퀴 돌아도 없으면 한 진형 더 멀리 — 집결지 없이 연달아 나온 쐐기가 한 자리에 겹쳐 서지 않게(3단계 최종 검토). → { x, z, heading }
const CROWD = 5;   // 진형 자리에 우리 병사가 이보다 적으면 빈 자리로 본다
function exitPoint(w, b, depth, half) {
  const tx = b.rally?.x ?? w.map.width / 2, tz = b.rally?.z ?? w.map.depth / 2, a0 = Math.atan2(tz - b.z, tx - b.x), s = w.soldiers;
  let best = null, bn = Infinity;
  for (let ring = 0; ring < 3; ring++) for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const a = a0 + k * Math.PI / 4, d = b.r + w.rules.produce.gap + depth + ring * (depth + w.rules.produce.gap * 2);
    const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
    if (!w.map.walkable(x, z)) continue;
    const cx = x - Math.cos(a) * depth / 2, cz = z - Math.sin(a) * depth / 2, R = Math.max(depth / 2, half) + 1;
    let n = 0;
    forEachNear(s, cx, cz, R, j => { if (s.alive[j] && s.side[j] === b.side && (s.x[j] - cx) ** 2 + (s.z[j] - cz) ** 2 <= R * R) n++; });
    if (n < CROWD) return { x, z, heading: a };
    if (n < bn) { bn = n; best = { x, z, heading: a }; }
  }
  if (best) return best;
  const [x, z] = nearestWalkable(w.map, b.gate.x, b.gate.z);
  return { x, z, heading: a0 };
}

// 줄 맨 앞이 다 되면 내보낸다.
function release(w, b, item) {
  const R = w.rules, batch = batchOf(R, b.side, item.key);
  let ids;
  if (batch.type === R.units[b.side].findIndex(u => u.worker)) {
    const p = exitPoint(w, b, 2, 3);
    ids = spawnCrew(w, b.side, p.x, p.z, p.heading);
  } else {
    const offs = formationOffsets(classOf(batch.type), batch.n, R.group), depth = Math.max(0, ...offs.map(o => -o.f)), half = Math.max(0, ...offs.map(o => Math.abs(o.l)));
    const p = exitPoint(w, b, depth, half), elite = Object.entries(R.research ?? {}).some(([k, r]) => r.type === batch.type && w.sides[b.side].research.has(k));   // 연구한 병종은 강화로(Task 6)
    ids = spawnWedge(w, b.side, batch.type, batch.n, p.x, p.z, p.heading, elite);
  }
  w.events.push({ kind: 'trained', side: b.side, building: b.id, ids });
  if (b.rally) applyOrder(w, { kind: 'send', side: b.side, from: { kind: 'ids', ids }, target: { kind: 'point', x: b.rally.x, z: b.rally.z } });
}

// 틱마다: 다 지은 건물의 줄 맨 앞 하나만 나아간다. 병사 항목은 인구·병사 자리가 되어야 시작한다(값은 이미 냈다).
export function stepQueues(w) {
  const R = w.rules, dt = R.dt, s = w.soldiers;
  for (const b of [...w.buildings]) {
    if (!b.alive || !b.done) continue;
    const item = b.queue[0];
    if (!item) { b.pausedWhy = ''; continue; }
    const S = w.sides[b.side];
    const why = pauseWhy(w, b, item);                                // 땅을 잃거나 건물 땅이 끊기면 멈춤(6-1단계) — 시작 전이면 인구도 잡지 않는다
    if (why !== b.pausedWhy) {
      b.pausedWhy = why;
      if (why && b.side === 0) w.notices.push({ side: 0, kind: 'paused', text: `${itemName(R, b.side, item)} 멈춤 — ${why}`, at: w.time, x: b.x, z: b.z });
    }
    if (why) continue;
    if (item.kind === 'unit' && !item.started) {
      const batch = batchOf(R, b.side, item.key), room = s.free.length + s.capacity - s.count >= batch.n;
      if (S.pop + batch.weight > S.popCap + 1e-9 || !room) {
        if (b.side === 0 && !(w.time - (S.popAlertAt ?? -1e9) < POP_ALERT)) { S.popAlertAt = w.time; w.notices.push({ side: 0, kind: 'pop', text: room ? '인구가 가득 찼다' : '병사 자리가 가득 찼다', at: w.time, x: b.x, z: b.z }); }
        continue;
      }
      item.started = true; item.weight = batch.weight; S.reserved += batch.weight; S.pop += batch.weight;
    }
    item.left -= dt;
    if (item.left > 1e-9) continue;
    b.queue.shift();
    if (item.kind === 'unit') { S.reserved -= item.weight; release(w, b, item); }
    else finishResearch(w, b, item);
  }
}

const itemName = (R, side, item) => (item.kind === 'unit' ? R.units[side][R.train[item.key].type].name : R.research[item.key].name);
const own = (w, o) => { const b = w.buildingById.get(o.building); return b && b.alive && b.side === o.side ? b : null; };

// { kind: 'train', side, building, unit }
export function trainOrder(w, o) {
  const b = own(w, o), R = w.rules;
  if (!b) return fail('건물이 없다');
  if (!b.done) return fail('아직 짓는 중이다');
  if (!R.train[o.unit] || !b.def.trains?.includes(o.unit)) return fail('여기서 못 뽑는다');
  const lw = landWhy(w, o.side, o.unit);                             // 땅 = 병종(6-1단계)
  if (lw) return fail(lw);
  if (b.queue.length >= R.queueMax) return fail('생산 줄이 가득 찼다');
  const S = w.sides[o.side], c = costOf(R.train[o.unit]);
  if (!canPay(S, c)) return fail(lack(S, c));
  pay(S, c);
  const t = R.train[o.unit].time;
  b.queue.push({ kind: 'unit', key: o.unit, left: t, total: t, started: false });
  return { ok: true };
}

// { kind: 'research', side, building, key } — 줄에 넣고 값을 낸다. 같은 연구는 편마다 한 번(하는 중이면 다시 못 건다).
export function researchOrder(w, o) {
  const b = own(w, o), R = w.rules;
  if (!b) return fail('건물이 없다');
  if (!b.done) return fail('아직 짓는 중이다');
  if (!R.research[o.key] || !b.def.research?.includes(o.key)) return fail('여기서 못 한다');
  const S = w.sides[o.side];
  if (S.research.has(o.key) || S.researching.has(o.key)) return fail('이미 했거나 하는 중이다');
  if (b.queue.length >= R.queueMax) return fail('생산 줄이 가득 찼다');
  const c = costOf(R.research[o.key]);
  if (!canPay(S, c)) return fail(lack(S, c));
  pay(S, c);
  S.researching.add(o.key);
  const t = R.research[o.key].time;
  b.queue.push({ kind: 'research', key: o.key, left: t, total: t, started: true });
  return { ok: true };
}

// 연구가 끝났다: 그 편의 그 병종 모두 강화, 그 뒤 뽑는 병사도(release).
function finishResearch(w, b, item) {
  const S = w.sides[b.side], r = w.rules.research[item.key], s = w.soldiers;
  S.researching.delete(item.key);
  S.research.add(item.key);
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === b.side && s.type[i] === r.type) s.elite[i] = 1;
  if (b.side === 0) w.notices.push({ side: 0, kind: 'research', text: `${r.name} 연구 완료`, at: w.time, x: b.x, z: b.z });
}

// { kind: 'cancel', side, building, index? } — 짓는 중이면 건물째(값 전부), 다 지었으면 줄의 index번째(없으면 마지막).
export function cancelOrder(w, o) {
  const b = own(w, o), R = w.rules, S = w.sides[o.side];
  if (!b) return fail('건물이 없다');
  if (!b.done) { pay(S, costOf(b.def), -1); removeBuilding(w, b); return { ok: true }; }
  const k = o.index ?? b.queue.length - 1;
  if (!Number.isInteger(k) || k < 0 || k >= b.queue.length) return fail('취소할 것이 없다');
  const [item] = b.queue.splice(k, 1);
  if (item.kind === 'unit') {
    pay(S, costOf(R.train[item.key]), -1);
    if (item.started) { S.reserved -= item.weight; S.pop -= item.weight; }
  } else { pay(S, costOf(R.research[item.key]), -1); S.researching.delete(item.key); }
  return { ok: true };
}

// { kind: 'rally', side, building, x?, z? } — x가 없으면 집결지를 지운다.
export function rallyOrder(w, o) {
  const b = own(w, o);
  if (!b) return fail('건물이 없다');
  if (!b.def.trains) return fail('여기서는 아무것도 나오지 않는다');
  if (o.x == null) { b.rally = null; return { ok: true }; }
  if (!Number.isFinite(o.x) || !Number.isFinite(o.z) || !w.map.walkable(o.x, o.z)) return fail('갈 수 없는 곳');
  b.rally = { x: o.x, z: o.z };
  return { ok: true };
}
