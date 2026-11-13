// 쐐기 진형(설계서 §6.4): 보낸 병사가 병종마다 쐐기를 이뤄 끝이 흐름장을 따라 가고,
// 적이 60 m 안에 오면 진형 그대로 달려 맞닿을 때 푼다(사용자 2026-11-06: "부딪칠 때까지 쭉 달렸으면").
import { GOAL, STATE } from './soldiers.js';
import { fieldDir, fieldAim } from './flowfield.js';
import { setGoal } from './world.js';
import { rangeOf } from './combat.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY, SIEGE, WORKER, MAGE, PRIEST, KNIGHT, GOLEM } from './rules.js';

export const FRONT_ORDER = { [INFANTRY]: 0, [SPEAR]: 0, [GOLEM]: 0, [CAVALRY]: 1, [KNIGHT]: 1, [ARCHER]: 2, [MAGE]: 2, [SIEGE]: 3, [PRIEST]: 3, [WORKER]: 3 };   // 쐐기 앞에서부터(6-1단계: 모든 병종)
const CLASS = { [CAVALRY]: 'cav', [INFANTRY]: 'infantry', [ARCHER]: 'archer', [SIEGE]: 'siege', [MAGE]: 'mage', [PRIEST]: 'priest', [KNIGHT]: 'knight', [GOLEM]: 'golem' };
export const classOf = type => CLASS[type] ?? 'spear';
const CAV_LIKE = new Set(['cav', 'knight']);   // 기병 진형 규칙(돌격하며 풀지 않음·적을 보면 풀려 사냥)을 따르는 갈래 — 기사는 기병 규칙 그대로(6-1단계 최종 검토)

// 맨 앞 (0,0), 줄 k의 폭 = min(1 + 2k, maxWidth). f = 앞(+)/뒤(−), l = 왼(−)/오른(+).
export function wedgeOffsets(n, g) {
  const out = [];
  for (let k = 0; out.length < n; k++) {
    const width = Math.min(1 + 2 * k, g.maxWidth);
    for (let j = 0; j < width && out.length < n; j++) {
      const slot = j === 0 ? 0 : (j % 2 ? -(j + 1) / 2 : j / 2);   // 가운데부터 좌우로
      out.push({ f: k === 0 ? 0 : -k * g.rowGap, l: slot * g.lateral });
    }
  }
  return out;
}

// 병종 진형의 자리(f = 앞(+)/뒤(−), l = 왼(−)/오른(+)): 창 = 쐐기, 기병 = 삼각형(줄마다 2명씩 끝까지 넓어짐),
// 궁수·공성 = 가로 직사각형(한 줄 width명, 마지막 줄은 가운데 맞춤).
export function formationOffsets(cls, n, g) {
  const sh = g.shape[cls] ?? g.shape.spear;
  if (sh.kind === 'wedge') return wedgeOffsets(n, g);
  const out = [];
  for (let k = 0; out.length < n; k++) {
    if (sh.kind === 'triangle') {
      for (let j = 0; j < 1 + 2 * k && out.length < n; j++) out.push({ f: -k * sh.rowGap, l: (j === 0 ? 0 : (j % 2 ? -(j + 1) / 2 : j / 2)) * sh.lateral });
    } else {
      const width = Math.min(sh.width, n - out.length);
      for (let j = 0; j < width; j++) out.push({ f: -k * sh.rowGap, l: (j - (width - 1) / 2) * sh.lateral });
    }
  }
  return out;
}

// 목표의 한 점(구역은 선분 가운데, 거점은 가운데).
export function targetPoint(w, t) {
  if (t.kind === 'point') return { x: t.x, z: t.z };
  if (t.kind === 'foe') {                                         // 적 병사: 살아 있으면 지금 자리(마지막 자리로 기억), 죽었으면 마지막 자리
    const s = w.soldiers, f = t.id;
    if (f >= 0 && f < s.count && s.alive[f] && s.serial[f] === t.serial) { t.x = s.x[f]; t.z = s.z[f]; }
    return { x: t.x, z: t.z };
  }
  throw new Error(`모르는 목표 ${t.kind}`);
}

function fieldOf(w, t) {
  if (t.kind === 'point') return t.field >= 0 ? w.pointField(t.field) : null;
  if (t.kind === 'foe') return null;                              // 움직이는 적에게는 곧장
  return null;
}

export function joinGroup(w, grp, id) {
  const s = w.soldiers;
  let at = grp.members.length;                       // 병종 순서대로(창 → 기병 → 궁 → 공성) 앞에서부터
  while (at > 0 && FRONT_ORDER[s.type[grp.members[at - 1]]] > FRONT_ORDER[s.type[id]]) at--;
  grp.members.splice(at, 0, id);
  grp.weight += w.rules.units[s.side[id]][s.type[id]].weight;
  s.group[id] = grp.id;
  s.goalKind[id] = GOAL.POINT; s.goalId[id] = -1;
  s.state[id] = STATE.MARCH;
  placeMembers(w, grp);
}

// 서 있던 병사를 목표로 보낸다(사용자 2026-11-07 "A"): 병종마다, 가는 쪽에서 본 옆으로 늘어선 순서대로 무게 weightByClass씩 끊어
// 그 무리 가운데에서 바로 행군하는 진형을 만든다. 맞붙은 병사는 진형에 끼지 않고 목표만 바꿔, 붙은 적만 끝내고 간다(leaveSeconds).
export function sendTroops(w, ids, target, via = null, ordered = true, attackMove = false) {
  const s = w.soldiers, r = w.rules, g = r.group, p = targetPoint(w, target);
  const free = [], busy = [];
  for (const i of ids) (s.inContact[i] ? busy : free).push(i);
  setGoal(w, busy, target);
  if (!attackMove) for (const i of busy) s.leaveUntil[i] = w.time + r.behavior.leaveSeconds;   // 붙은 적만 끝내고 간다(11-07 "A"). 어택땅이면 원래대로 가까운 적과 싸운 뒤 간다(사용자 2026-11-08)
  if (!free.length) return;
  let cx = 0, cz = 0;
  for (const i of free) { cx += s.x[i]; cz += s.z[i]; }
  cx /= free.length; cz /= free.length;
  const len = Math.hypot(p.x - cx, p.z - cz) || 1, ax = -(p.z - cz) / len, az = (p.x - cx) / len;   // 옆 방향
  const byClass = {};
  for (const i of free) (byClass[classOf(s.type[i])] ??= []).push(i);
  for (const [cls, list] of Object.entries(byClass)) {
    list.sort((a, b) => (s.x[a] * ax + s.z[a] * az) - (s.x[b] * ax + s.z[b] * az));
    const per = g.weightByClass[cls] ?? g.weight;
    for (let k = 0; k < list.length;) {
      const part = [];
      let wt = 0;
      while (k < list.length && (wt < per - 1e-9 || !part.length)) { const i = list[k++]; part.push(i); wt += r.units[s.side[i]][s.type[i]].weight; }
      let x = 0, z = 0;
      for (const i of part) { x += s.x[i]; z += s.z[i]; }
      x /= part.length; z /= part.length;
      const p0 = via ? via[0] : p;
      const grp = { id: w.nextGroupId++, side: s.side[part[0]], cls, target: { ...target }, members: [], weight: 0, state: 'march', x, z, heading: Math.atan2(p0.z - z, p0.x - x), vx: 0, vz: 0, charging: false, foe: null, via: via ? via.map(q => ({ ...q })) : null, sent: true, order: ordered, attackMove };   // sent: 보낸 쐐기(Shift 이어 가기), order: 이동 명령(가는 길에 돌격·멈춤 없음)
      w.groups.push(grp);
      for (const i of part) { s.state[i] = STATE.MARCH; joinGroup(w, grp, i); }
    }
  }
}

// 병사를 쐐기(모이는 중이든 행군 중이든)에서 떼어 낸다. 남은 병사가 없는 쐐기는 바로 지운다(빈 쐐기가 정리 주기까지 걸어가지 않게).
export function detachFromGroups(w, ids) {
  const s = w.soldiers, touched = new Set();
  for (const i of ids) if (s.group[i] >= 0) { touched.add(s.group[i]); s.group[i] = -1; s.wedge[i] = 0; }
  if (!touched.size) return;
  for (const grp of [...w.groups]) {
    if (!touched.has(grp.id)) continue;
    grp.members = grp.members.filter(i => s.alive[i] && s.group[i] === grp.id);
    grp.weight = grp.members.reduce((a, i) => a + w.rules.units[s.side[i]][s.type[i]].weight, 0);
    if (!grp.members.length) w.groups.splice(w.groups.indexOf(grp), 1);
  }
}

// 자리 = 끝 + 쐐기 모양을 방향대로 돌린 것. 행군 중이면 쐐기 속도(ffx, ffz)와 방향도 병사에게 준다.
function placeMembers(w, grp) {
  const s = w.soldiers, offs = formationOffsets(grp.cls, grp.members.length, w.rules.group);
  const c = Math.cos(grp.heading), sn = Math.sin(grp.heading), moving = grp.state === 'march';
  grp.members.forEach((id, n) => {
    const o = offs[n];
    s.goalX[id] = grp.x + c * o.f - sn * o.l;
    s.goalZ[id] = grp.z + sn * o.f + c * o.l;
    s.wedge[id] = moving ? 1 : 0;
    s.ffx[id] = moving ? grp.vx : 0; s.ffz[id] = moving ? grp.vz : 0;
    if (moving) s.facing[id] = grp.heading;
  });
}

function dissolve(w, grp, charge) {
  const s = w.soldiers, g = w.rules.group;
  const ids = grp.members.filter(i => s.alive[i] && s.group[i] === grp.id);
  for (const i of ids) { s.group[i] = -1; s.wedge[i] = 0; }
  setGoal(w, ids, grp.target);
  ids.forEach((i, n) => {
    s.state[i] = STATE.MARCH;
    if (charge) {
      s.chargeUntil[i] = w.time + g.chargeSeconds;
      if (n < g.impactFront) s.chargeHit[i] = 1;     // 쐐기 앞 몇 명: 첫 타 바로 ×2, 맞은 적 밀려남
    }
  });
  // 적 앞에서 풀렸으면(둘레 aggro m에 적): press.seconds초 동안 노릴 적이 없는 병사는 목표 둘레 제각각 자리로 흩어지지 않고
  // 가던 쪽으로 press.ahead m 밀고 들어가 선다(줄 진형은 제자리). 그동안 적은 틱마다 찾는다(behavior.js) — 사용자 2026-11-10 영상
  if (enemyNear(w, grp.side, grp.x, grp.z, w.rules.behavior.aggro)) {
    const P = g.press, ahead = g.shape[grp.cls]?.kind === 'line' ? 0 : P.ahead, c = Math.cos(grp.heading), sn = Math.sin(grp.heading);
    for (const i of ids) {
      const px = s.x[i] + c * ahead, pz = s.z[i] + sn * ahead, ok = w.map.walkable(px, pz);
      s.pressUntil[i] = w.time + P.seconds; s.pressX[i] = ok ? px : s.x[i]; s.pressZ[i] = ok ? pz : s.z[i];
    }
  }
  w.groups.splice(w.groups.indexOf(grp), 1);
}

// 반지름 r 안 가장 가까운 적의 자리(없으면 null). heading을 주면 그 방향 ±chargeConeDeg 안의 적만.
function enemyNear(w, side, x, z, r, heading) {
  const s = w.soldiers, cs = s.cellSize, cone = heading === undefined ? -2 : Math.cos(w.rules.group.chargeConeDeg * Math.PI / 180);
  const hx = heading === undefined ? 0 : Math.cos(heading), hz = heading === undefined ? 0 : Math.sin(heading);
  let best = null, bd = r * r;
  const c0 = Math.max(0, Math.floor((x - r) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((x + r) / cs));
  const r0 = Math.max(0, Math.floor((z - r) / cs)), r1 = Math.min(s.grows - 1, Math.floor((z + r) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j])
        if (s.alive[j] && s.side[j] !== side) {
          const d = (s.x[j] - x) ** 2 + (s.z[j] - z) ** 2;
          if (d > bd || (cone > -2 && (s.x[j] - x) * hx + (s.z[j] - z) * hz < cone * Math.sqrt(d))) continue;
          bd = d; best = { x: s.x[j], z: s.z[j] };
        }
  return best;
}

export function stepGroups(w) {
  const s = w.soldiers, r = w.rules, g = r.group, dt = r.dt;
  for (const grp of [...w.groups]) {
    if (w.tick % g.cleanEvery === 0) {
      grp.members = grp.members.filter(i => s.alive[i] && s.group[i] === grp.id);
      grp.weight = grp.members.reduce((a, i) => a + r.units[s.side[i]][s.type[i]].weight, 0);
      if (!grp.members.length) { w.groups.splice(w.groups.indexOf(grp), 1); continue; }
      placeMembers(w, grp);
    }
    // 행군: 끝이 흐름장을 lookaheadCells 칸 앞까지 따라가 본 점을 향하고(격자 45° 계단 방지), 방향은 1초에 turnRate까지만 튼다.
    // 적이 chargeDistance 안에 오면 진형 그대로 그 적을 향해 chargeSpeed배로 달리고, 병사 하나라도 맞닿으면 푼다.
    const line = g.shape[grp.cls]?.kind === 'line';
    // 경유점이 남았으면 그 점으로 곧장 가고, 보이는 적에게 돌진하거나 풀리지 않는다. 닿아도 진형째 밀고 지나가고(닿은 병사는 손에 닿는 적을 친다),
    // 맞닿은 병사가 viaStuck 몫을 넘으면 그때 푼다.
    if (grp.via?.length && Math.hypot(grp.via[0].x - grp.x, grp.via[0].z - grp.z) < g.arriveDistance) grp.via.shift();
    const routing = grp.via?.length > 0, quiet = routing || grp.order;   // 명령받은 쐐기(사용자 2026-11-08 "B")도 경유점 쐐기처럼: 돌격·멈춤 없이 간다
    const touching = grp.members.reduce((a, i) => a + (s.alive[i] && s.inContact[i] ? 1 : 0), 0);
    if (touching > (quiet ? g.viaStuck * grp.members.length : 0)) { dissolve(w, grp, !line && !CAV_LIKE.has(grp.cls)); continue; }
    const p = routing ? grp.via[0] : targetPoint(w, grp.target);
    if (!quiet && (w.tick + grp.id) % g.lookEvery === 0) {
      if (line) {                                                          // 직사각형: 사거리 + lineStop 안에 적이 오면 서서 풀린다
        let range = r.melee.reach;
        for (const i of grp.members) if (s.alive[i]) range = Math.max(range, rangeOf(w, i));
        if (enemyNear(w, grp.side, grp.x, grp.z, range + g.lineStop, grp.heading)) { dissolve(w, grp, false); continue; }
      }
      grp.foe = line ? null : enemyNear(w, grp.side, grp.x, grp.z, g.chargeDistance, grp.heading);
      // 어택땅(거점으로 보낸 쐐기, 사용자 2026-11-08 "여전히 적군 무시하고 이동"): 앞이 아닌 쪽이라도 어그로 반경 안에 적이 있으면 풀려서 싸운 뒤 간다
      if (!grp.foe && grp.attackMove && enemyNear(w, grp.side, grp.x, grp.z, r.behavior.aggro)) { dissolve(w, grp, false); continue; }
      if (grp.foe && CAV_LIKE.has(grp.cls)) { dissolve(w, grp, false); continue; }   // 기병·기사는 하나하나 사냥한다(창 벽에 진형째 박지 않게)
      if (grp.foe) grp.charging = true;
    }
    let arrive = g.arriveDistance;                                     // 원거리(궁수·투석기) 쐐기의 적 공격: 그 적이 사거리 안이면 서서 푼다(투석기 2026-11-09 — 20 m까지 걸어 들어갔다)
    if (line && grp.target.kind === 'foe') for (const i of grp.members) if (s.alive[i]) arrive = Math.max(arrive, rangeOf(w, i));
    if (!routing && !grp.charging && Math.hypot(p.x - grp.x, p.z - grp.z) < arrive) { dissolve(w, grp, grp.target.kind === 'foe' && !line); continue; }   // 적에게 닿으면 돌격하며 푼다
    let aim;
    if (grp.charging && grp.foe) aim = grp.foe;
    else if (routing) aim = p;
    else {
      const field = fieldOf(w, grp.target);
      aim = field ? fieldAim(field, w.map, grp.x, grp.z, g.lookaheadCells) : null;
      if (!aim || Math.hypot(aim.x - grp.x, aim.z - grp.z) < 1) aim = p;
    }
    const want = Math.atan2(aim.z - grp.z, aim.x - grp.x);
    let turn = want - grp.heading;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    const maxTurn = g.turnRateDeg * Math.PI / 180 * dt;
    grp.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    // 강행군(casts.js)은 병사에 붙는다: 쐐기는 모든 멤버에게 강행군이 남아 있을 때만 빠르다(쐐기를 새로 짜도 이어지고, 늦게 낀 병사를 끌고 가지 않는다). 돌진과 겹치면 큰 쪽 하나.
    let slowest = Infinity, march = Infinity;
    for (const i of grp.members) if (s.alive[i]) { slowest = Math.min(slowest, r.units[s.side[i]][s.type[i]].speed); march = Math.min(march, s.marchUntil[i]); }
    const v = (isFinite(slowest) ? slowest : 3) * (g.speedFactorByClass?.[grp.cls] ?? g.speedFactor) * Math.max(grp.charging ? g.chargeSpeed : 1, isFinite(march) && march > w.time ? r.orders.march.speedMult : 1) * w.map.speedMult(grp.x, grp.z);
    grp.vx = Math.cos(grp.heading) * v; grp.vz = Math.sin(grp.heading) * v;
    const nx = grp.x + grp.vx * dt, nz = grp.z + grp.vz * dt;
    if (w.map.walkable(nx, nz)) { grp.x = nx; grp.z = nz; }
    else {
      // 막히면(앞을 내다본 점이 물 건너편) 흐름장의 바로 앞 방향으로 비킨다. 그 걸음이 모서리를 잘라 물로 들어가면 벽을 따라 미끄러진다.
      // 전에는 비킨 걸음을 확인하지 않아 쐐기 가운데가 물에 빠져 거기 박혔다(2026-11-08, "그 자리"로 강 건너 보내기에서 찾음).
      const f = fieldOf(w, grp.target), d = f ? fieldDir(f, w.map, grp.x, grp.z) : { dx: 0, dz: 0 };
      const sx = grp.x + d.dx * v * dt, sz = grp.z + d.dz * v * dt;
      if (w.map.walkable(sx, sz)) { grp.x = sx; grp.z = sz; }
      else if (d.dx && w.map.walkable(sx, grp.z)) grp.x = sx;
      else if (d.dz && w.map.walkable(grp.x, sz)) grp.z = sz;
    }
    placeMembers(w, grp);
  }
}
