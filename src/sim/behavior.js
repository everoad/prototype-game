// 판단(설계서 §6.3 우선순위). 지금은 4·5단: 어그로 반경 안 적에게 붙는다.
// 구역 병사는 자리에 묶이지 않는다(§6.3a): 한 번 싸우면 정면(FRONT)이 되어 자리로 돌아가지 않고, 40 m 안 적이 없으면
// 120 m 안 적 무리(20 m 칸 지도)로 다가간다. 승점 선 너머 advanceCap m 밖의 적은 쫓지 않는다. 그 밖의 목표(거점·점)는 leash m 끈.
// 다치고 둘러싸이면 몇 초 달아난다(국지 무너짐). 행군 중인 쐐기의 병사는 달려들지 않는다(§6.4).
// 판단은 병사마다 2틱에 한 번(번호 짝·홀).
import { nearestEnemy, bestRangedTarget, hitAngleDeg, rangeOf } from './combat.js';
import { CAVALRY, ARCHER } from './rules.js';
import { STATE, GOAL, ORDER } from './soldiers.js';
import { garrisonReach } from './defense.js';
import { FM, fmMember } from './formation.js';
import { attachedThink, BUFF } from './generals.js';

const SEARCH_EVERY = 8;      // 대상이 없는 병사가 새 적을 찾는 틱 간격(병사마다 엇갈림) — 반지름 40 m 찾기가 가장 비싸다
const ORDER_ARRIVED = 10;    // 이동 명령: 자기 자리에서 이만큼 안이면 도착(명령이 풀리고 원래대로 싸운다) m
const ORDER_ENGAGE = 25;     // 공격 명령: 그 적이 이만큼 안이면 그 적을 노리고 명령이 풀린다 m
const ORDER_STALL = 4;       // 명령: 이만큼 동안 목표에 1 m도 가까워지지 못하면(붐빔·막힘) 도착한 것으로 보고 푼다 s

export function stepBehavior(w) {
  const s = w.soldiers, b = w.rules.behavior, parity = w.tick & 1;
  if (w.tick % 10 === 0 || !w.coarse) buildCoarse(w);
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    if (s.fmRole[i] && !fmMember(w, i)) s.fmRole[i] = 0;              // 쐐기에 듦·거점을 잃음·진형 끔: 다음 자리 나누기를 기다리지 않는다
    if (s.state[i] === STATE.ROUT) {
      if (w.time >= s.routUntil[i]) { s.state[i] = STATE.FRONT; s.target[i] = -1; }
      continue;
    }
    if ((i + w.tick) % b.routCheckEvery === 0 && maybeRout(w, i)) continue;
    if ((i & 1) !== parity) continue;
    if (s.state[i] === STATE.FLEE) { s.target[i] = -1; continue; }
    if (s.order[i] && orderedThink(w, i)) continue;                  // 명령(사용자 2026-11-08 "B"): 이동 중엔 새 적을 찾지 않는다
    if (s.group[i] >= 0 && s.state[i] === STATE.MARCH) { s.target[i] = -1; s.rtarget[i] = -1; continue; }   // 행군 중인 쐐기
    if (s.state[i] === STATE.ATTACHED) { attachedThink(w, i, nearestEnemy, bestRangedTarget); continue; }   // 우선순위 1: 장수에 붙은 병사
    const u = w.rules.units[s.side[i]][s.type[i]], ranged = u.range > w.rules.melee.reach * 2;
    if (ranged && (i + w.tick) % b.rangedScanEvery < 2) {         // 원거리: 사거리 안 맞쏘기 순서로 목표
      const rt = s.rtarget[i];
      const rng = rangeOf(w, i);
      // 화살 비(casts.js): 원 안 과녁만 — 원 안에 닿는 적이 없으면 평소대로
      const rain = s.volleyUntil[i] > w.time ? { x: s.volleyX[i], z: s.volleyZ[i], r: w.rules.orders.radius } : null;
      const keep = rt >= 0 && s.alive[rt] && (s.x[rt] - s.x[i]) ** 2 + (s.z[rt] - s.z[i]) ** 2 <= rng * rng && (!rain || (s.x[rt] - rain.x) ** 2 + (s.z[rt] - rain.z) ** 2 <= rain.r * rain.r);
      if (!keep) { const inRain = rain ? bestRangedTarget(w, i, rng, rain) : -1; s.rtarget[i] = inRain >= 0 ? inRain : bestRangedTarget(w, i, rng); }
      if (s.type[i] === ARCHER && s.state[i] !== STATE.GARRISON && !(s.buff[i] & BUFF.HOLD) && !s.fmRole[i] && maybeKite(w, i)) continue;   // 거점 진형 궁수는 물러나지 않는다
    }
    if (s.fmRole[i]) { formationThink(w, i); continue; }                // 거점 수비 진형(formation.js)
    if (s.state[i] === STATE.GARRISON) { garrisonThink(w, i); continue; }
    const sector = s.goalKind[i] === GOAL.SECTOR;
    if (u.charges && sector) { cavalryThink(w, i); continue; }
    const t = s.target[i];
    if (!ranged) {                                                     // 1) 바로 옆의 적부터(노리던 먼 적을 버린다)
      const close = nearestEnemy(s, i, b.closeSwitch);
      if (close >= 0 && close !== t && allowed(w, i, close)) { s.target[i] = close; if (sector) s.state[i] = STATE.FRONT; s.hasPursuit[i] = 0; continue; }
    }
    if (s.leaveUntil[i] > w.time) {                                    // 보낸 병사가 빠지는 중: 붙은 적만 끝내고 목표로
      if (!(t >= 0 && s.alive[t] && Math.hypot(s.x[t] - s.x[i], s.z[t] - s.z[i]) <= b.closeSwitch * 1.5)) s.target[i] = -1;
      continue;
    }
    if (t >= 0 && s.alive[t] && s.side[t] !== s.side[i] && Math.hypot(s.x[t] - s.x[i], s.z[t] - s.z[i]) <= b.aggro && allowed(w, i, t)) continue;
    if ((i + w.tick) % SEARCH_EVERY > 1) { s.target[i] = -1; continue; }
    const e = nearestEnemy(s, i, b.aggro);
    s.target[i] = e >= 0 && allowed(w, i, e) ? e : -1;
    if (s.target[i] >= 0) { if (sector) s.state[i] = STATE.FRONT; s.hasPursuit[i] = 0; s.idleAt[i] = -1; }
    else if (sector && s.state[i] === STATE.FRONT) { pursue(w, i); if (s.hasPursuit[i]) s.idleAt[i] = -1; else regroup(w, i); }
  }
}

// 명령받은 병사(soldiers.js ORDER). 아직 가는 중이면 true — 새 적을 찾지도 쫓지도 않고 쏘지도 않는다(닿은 적은 싸움에서 저절로 친다;
// 걸으며 쏘기는 같은 날 뺐다 — 사용자 "이동하면서 공격할 수 있는 게 문제"). 도착했으면(공격이면 그 적이 25 m 안, 원거리는 사거리 안) 명령을 풀고 false.
// 공격이 끝나면 그 자리가 목표가 된다 — 쓰러진 적의 한 점으로 모두 모이지 않게.
function orderedThink(w, i) {
  const s = w.soldiers, b = w.rules.behavior, u = w.rules.units[s.side[i]][s.type[i]], ranged = u.range > w.rules.melee.reach * 2;
  const loose = s.group[i] < 0;                                     // 쐐기 안이면 도착은 쐐기가 정한다
  if (!loose) { s.orderBest[i] = Infinity; s.orderAt[i] = w.time; }
  else {                                                            // 막혀 서 버리면(붐비는 승점에서 자리에 못 닿음 등) 푼다 — 안 그러면 명령이 남아 적을 계속 무시했다
    const d = Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]);
    if (d < s.orderBest[i] - 1) { s.orderBest[i] = d; s.orderAt[i] = w.time; }
    else if (w.time - s.orderAt[i] > ORDER_STALL) { s.order[i] = ORDER.NONE; return false; }
  }
  if (s.order[i] === ORDER.ATTACK) {
    const f = s.orderFoe[i], ok = f >= 0 && s.alive[f] && s.serial[f] === s.orderSerial[i];
    if (ok && loose) { s.goalX[i] = s.x[f]; s.goalZ[i] = s.z[f]; }
    const engage = ranged ? rangeOf(w, i) : ORDER_ENGAGE;
    if (loose && (!ok || Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]) <= engage)) {
      s.order[i] = ORDER.NONE; s.hasPursuit[i] = 0;
      s.goalX[i] = s.x[i]; s.goalZ[i] = s.z[i];                     // 그 자리를 지킨다(적이 죽었으면 거기 선다)
      if (ok) { if (ranged) s.rtarget[i] = f; else s.target[i] = f; }
      return false;
    }
  } else if (loose && Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]) <= ORDER_ARRIVED) { s.order[i] = ORDER.NONE; return false; }
  s.target[i] = -1; s.rtarget[i] = -1; s.hasPursuit[i] = 0;
  return true;
}

// 120 m 안에 적이 없는 정면 병사: regroupSeconds 동안 서 있었고 자기 자리에서 regroupDistance m 넘게 멀면 자리(구역 선)로 걸어 돌아온다.
// 자리 가까이에서는 그대로 선다(밀어붙인 자리). 돌아오는 길에 적이 40 m 안에 오면 다시 싸운다.
function regroup(w, i) {
  const s = w.soldiers, b = w.rules.behavior;
  if (s.idleAt[i] < 0) { s.idleAt[i] = w.time; return; }
  if (w.time - s.idleAt[i] < b.regroupSeconds) return;
  s.idleAt[i] = -1;
  if (Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]) > b.regroupDistance) s.state[i] = STATE.MARCH;
}

// 구역 병사: 승점 선 너머 advanceCap m 안의 적만. 그 밖(거점·점으로 가는 병사): 어그로 반경 안이면 모두(3 — 가는 길에도 싸운다).
function allowed(w, i, e) {
  const s = w.soldiers, b = w.rules.behavior;
  if (s.goalKind[i] === GOAL.SECTOR) return s.side[i] === 0 ? s.z[e] <= w.map.vpLine + b.advanceCap : s.z[e] >= w.map.vpLine - b.advanceCap;
  return true;
}

// 20 m 칸마다 편별 무게(쫓기 판단용), 10틱마다.
function buildCoarse(w) {
  const s = w.soldiers, cell = w.rules.behavior.pursuitCell;
  const cols = Math.ceil(w.map.width / cell), rows = Math.ceil(w.map.depth / cell);
  const grid = () => [new Float32Array(cols * rows), new Float32Array(cols * rows)];
  const fc = w.rules.behavior.lineCell, fcols = Math.ceil(w.map.width / fc), frows = Math.ceil(w.map.depth / fc);
  if (!w.coarse) w.coarse = { cell, cols, rows, weight: grid(), line: grid(), prey: grid(), fine: { cell: fc, cols: fcols, rows: frows, line: [new Float32Array(fcols * frows), new Float32Array(fcols * frows)] } };   // 모든 무게 · 버팀 · 원거리·공성 · 8 m 버팀
  const c = w.coarse, reach = w.rules.melee.reach;
  for (const m of [c.weight, c.line, c.prey, c.fine.line]) { m[0].fill(0); m[1].fill(0); }
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.state[i] === STATE.ROUT) continue;
    const cc = Math.floor(s.x[i] / cell), rr = Math.floor(s.z[i] / cell);
    if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
    const u = w.rules.units[s.side[i]][s.type[i]], k = rr * cols + cc;
    c.weight[s.side[i]][k] += u.weight;
    if (u.holdsLine) {
      c.line[s.side[i]][k] += u.weight;
      const fcc = Math.floor(s.x[i] / c.fine.cell), frr = Math.floor(s.z[i] / c.fine.cell);
      if (fcc >= 0 && frr >= 0 && fcc < c.fine.cols && frr < c.fine.rows) c.fine.line[s.side[i]][frr * c.fine.cols + fcc] += u.weight;
    }
    else if (u.range > reach * 2 || u.siege) c.prey[s.side[i]][k] += u.weight;
  }
}

// 40 m 안 적이 없는 정면 병사: 120 m 안 가장 가까운 적 칸으로 다가간다(없으면 그 자리에 선다).
function pursue(w, i) {
  const s = w.soldiers, b = w.rules.behavior, c = w.coarse, foe = c.weight[1 - s.side[i]];
  const reach = Math.ceil(b.pursuit / c.cell), c0 = Math.floor(s.x[i] / c.cell), r0 = Math.floor(s.z[i] / c.cell);
  const cap = s.side[i] === 0 ? w.map.vpLine + b.advanceCap : w.map.vpLine - b.advanceCap;
  let best = Infinity, bx = 0, bz = 0;
  for (let rr = Math.max(0, r0 - reach); rr <= Math.min(c.rows - 1, r0 + reach); rr++)
    for (let cc = Math.max(0, c0 - reach); cc <= Math.min(c.cols - 1, c0 + reach); cc++) {
      if (foe[rr * c.cols + cc] <= 0) continue;
      const x = (cc + 0.5) * c.cell, z = (rr + 0.5) * c.cell;
      if (s.side[i] === 0 ? z > cap : z < cap) continue;
      const d = Math.hypot(x - s.x[i], z - s.z[i]);
      if (d <= b.pursuit && d < best) { best = d; bx = x; bz = z; }
    }
  s.hasPursuit[i] = best < Infinity ? 1 : 0;
  s.pursuitX[i] = bx; s.pursuitZ[i] = bz;
}

// 국지 무너짐: 8 m 안 적 무게가 우리(자기 포함)의 routRatio배 이상이고 체력이 routHp 아래면 routSeconds 동안 달아난다.
function maybeRout(w, i) {
  const s = w.soldiers, b = w.rules.behavior;
  if (s.state[i] === STATE.GARRISON || s.state[i] === STATE.FLEE || s.wedge[i] || (s.buff[i] & BUFF.HOLD) || s.drumUntil[i] > w.time) return false;   // 버텨라·돌격 북: 물러나지 않음
  const maxHp = w.rules.units[s.side[i]][s.type[i]].hp;
  if (s.hp[i] >= maxHp * b.routHp) return false;
  if (w.time < s.routUntil[i] + b.routCooldown) return false;   // 돌아온 뒤 잠깐은 다시 달아나지 않는다
  const rad = b.routRadius, r2 = rad * rad, cs = s.cellSize;
  let friend = 0, enemy = 0, ex = 0, ez = 0;
  const c0 = Math.max(0, Math.floor((s.x[i] - rad) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((s.x[i] + rad) / cs));
  const r0 = Math.max(0, Math.floor((s.z[i] - rad) / cs)), r1 = Math.min(s.grows - 1, Math.floor((s.z[i] + rad) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (!s.alive[j] || s.state[j] === STATE.ROUT) continue;
        const dx = s.x[j] - s.x[i], dz = s.z[j] - s.z[i];
        if (dx * dx + dz * dz > r2) continue;
        const wt = w.rules.units[s.side[j]][s.type[j]].weight;
        if (s.side[j] === s.side[i]) friend += wt; else { enemy += wt; ex += s.x[j] * wt; ez += s.z[j] * wt; }
      }
  if (enemy === 0 || enemy < b.routRatio * friend) return false;
  // 적 무게 중심에서 멀어지는 쪽과 우리 쪽(편 0 = −z)을 반씩 섞은 방향으로 routDistance m
  let dx = s.x[i] - ex / enemy, dz = s.z[i] - ez / enemy;
  const l = Math.hypot(dx, dz) || 1, home = s.side[i] === 0 ? -1 : 1;
  dx = dx / l * 0.5; dz = dz / l * 0.5 + home * 0.5;
  const l2 = Math.hypot(dx, dz) || 1;
  s.state[i] = STATE.ROUT; s.target[i] = -1; s.hasPursuit[i] = 0;
  s.routUntil[i] = w.time + b.routSeconds;
  s.routX[i] = s.x[i] + dx / l2 * b.routDistance; s.routZ[i] = s.z[i] + dz / l2 * b.routDistance;
  return true;
}

// 궁수 물러나기: 10 m 안에 적 근접이 있고 8 m 안에 우리 근접이 없으면 2초 동안 15 m 물러난다(§6.3, 결정 유지).
function maybeKite(w, i) {
  const s = w.soldiers, b = w.rules.behavior, r = w.rules;
  if (w.time < s.routUntil[i] + b.kiteCooldown) return false;
  const rad = b.kiteMelee, cs = s.cellSize;
  let foe = -1, friend = false;
  const c0 = Math.max(0, Math.floor((s.x[i] - rad) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((s.x[i] + rad) / cs));
  const r0 = Math.max(0, Math.floor((s.z[i] - rad) / cs)), r1 = Math.min(s.grows - 1, Math.floor((s.z[i] + rad) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (!s.alive[j] || j === i) continue;
        const d = Math.hypot(s.x[j] - s.x[i], s.z[j] - s.z[i]);
        const melee = r.units[s.side[j]][s.type[j]].range <= r.melee.reach * 2;
        if (s.side[j] !== s.side[i] && melee && d <= rad) foe = j;
        if (s.side[j] === s.side[i] && melee && d <= b.kiteFriend) friend = true;
      }
  if (foe < 0 || friend) return false;
  const home = s.side[i] === 0 ? -1 : 1;
  let dx = s.x[i] - s.x[foe], dz = s.z[i] - s.z[foe];
  const l = Math.hypot(dx, dz) || 1;
  dx = dx / l * 0.5; dz = dz / l * 0.5 + home * 0.5;
  const l2 = Math.hypot(dx, dz) || 1;
  s.state[i] = STATE.ROUT; s.target[i] = -1; s.hasPursuit[i] = 0;
  s.routUntil[i] = w.time + b.kiteSeconds;
  s.routX[i] = s.x[i] + dx / l2 * b.kiteDistance; s.routZ[i] = s.z[i] + dz / l2 * b.kiteDistance;
  return true;
}

// 기병(§6.3, 사용자 2026-11-06 고침): 사냥꾼이다. 차례대로
//   ① 40 m 안 원거리·공성 ② 80 m 안 원거리·공성 무리(20 m 칸) — 둘 다 가는 길에 적 창 벽이 없을 때만
//   ③ 40 m 안 버팀 아닌 적(적 기병 등) ④ 우리와 맞붙어 옆·뒤를 보인 버팀(창이 다가오기만 하면 피해 돈다)
//   ⑤ 없으면: 자기 구역 선에서 40 m 넘게 뒤면 그냥 구역으로 가고, 가까우면 선분 끝의 틈으로 ㄱ자로 돌아 적 선 뒤로,
//      적 선 뒤에 들어가면 구역 가운데 쪽으로 훑는다.
// 고른 목표는 decisionHold초 지킨다.
function cavalryThink(w, i) {
  const s = w.soldiers, b = w.rules.behavior;
  const t = s.target[i];
  if (t >= 0 && s.alive[t] && w.time < s.holdUntil[i] && Math.hypot(s.x[t] - s.x[i], s.z[t] - s.z[i]) <= b.huntRange * 1.2) return;
  // 고른 길(먹잇감 칸·돌기)은 decisionHold초 지킨다 — 닿았거나 40 m 안에 노릴 적이 생기면 다시 고른다(0.4초마다 본다)
  const going = t < 0 && s.hasPursuit[i] && w.time < s.holdUntil[i] && Math.hypot(s.pursuitX[i] - s.x[i], s.pursuitZ[i] - s.z[i]) > b.flankReach;
  if (going && (i + w.tick) % 8 > 1) return;
  const e = cavTarget(w, i);
  s.target[i] = e;
  if (e >= 0) { s.state[i] = STATE.FRONT; s.hasPursuit[i] = 0; s.holdUntil[i] = w.time + b.decisionHold; return; }
  if (going) return;
  s.holdUntil[i] = w.time + b.decisionHold;
  if (evadeSpears(w, i)) return;                                  // 다가오는 창은 피한다
  const herd = preyCell(w, i);
  if (herd) { s.hasPursuit[i] = 1; s.pursuitX[i] = herd.x; s.pursuitZ[i] = herd.z; s.state[i] = STATE.FRONT; return; }
  const sec = w.map.sectors[s.goalId[i]], dir = s.side[i] === 0 ? 1 : -1;
  const holdX = s.slotX[i], holdZ = sec.z - dir * b.aggro;                                       // 기다리는 자리: 우리 선 40 m 뒤(창 무리에 걸어 들어가지 않게)
  if ((sec.z - s.z[i]) * dir > b.aggro + 1 || !preyAhead(w, s.side[i], sec)) {
    if (Math.hypot(holdX - s.x[i], holdZ - s.z[i]) > 2) { s.hasPursuit[i] = 1; s.pursuitX[i] = holdX; s.pursuitZ[i] = holdZ; s.state[i] = STATE.FRONT; }
    else s.hasPursuit[i] = 0;
    return;
  }
  const enemyZ = w.map.vpLine + dir * (w.map.vpLine - sec.z + b.flankBeyond), mid = (sec.x0 + sec.x1) / 2;
  const left = s.x[i] < mid;
  const fx = left ? sec.x0 - b.flankOutside : sec.x1 + b.flankOutside;
  let px = fx, pz = enemyZ;
  if ((s.z[i] - (enemyZ - dir * b.flankReach)) * dir > 0) px = mid;                              // 적 선 뒤: 가운데 쪽으로 훑는다
  else if (Math.abs(s.x[i] - fx) > b.flankReach) pz = sec.z - dir * b.aggro;                      // 먼저 우리 쪽 40 m 뒤에서 옆으로(ㄱ자) — 적 궁수 사거리 밖
  if (Math.hypot(px - s.x[i], pz - s.z[i]) > b.flankReach) { s.hasPursuit[i] = 1; s.pursuitX[i] = px; s.pursuitZ[i] = pz; s.state[i] = STATE.FRONT; }
  else s.hasPursuit[i] = 0;   // 다 돌았는데 노릴 게 없으면 선다(창 무리로 다가가지 않는다)
}

// 기병: 우리와 맞붙지 않은 적 버팀(창)이 evadeRange m 안에 오면 그 반대로 evadeDistance m 물러난다(궁수 물러나기와 같은 꼴).
function evadeSpears(w, i) {
  const s = w.soldiers, r = w.rules, b = r.behavior, rad = b.evadeRange, cs = s.cellSize;
  let best = -1, bd = rad * rad;
  const c0 = Math.max(0, Math.floor((s.x[i] - rad) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((s.x[i] + rad) / cs));
  const r0 = Math.max(0, Math.floor((s.z[i] - rad) / cs)), r1 = Math.min(s.grows - 1, Math.floor((s.z[i] + rad) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (!s.alive[j] || s.side[j] === s.side[i] || !r.units[s.side[j]][s.type[j]].holdsLine) continue;
        if (!s.braced[j]) continue;                                      // 우리 보병과 맞붙어 버티지 못하는 창은 위협이 아니다
        const d2 = (s.x[j] - s.x[i]) ** 2 + (s.z[j] - s.z[i]) ** 2;
        if (d2 < bd) { bd = d2; best = j; }
      }
  if (best < 0) return false;
  const dx = s.x[i] - s.x[best], dz = s.z[i] - s.z[best], l = Math.hypot(dx, dz) || 1;
  s.target[i] = -1; s.hasPursuit[i] = 1; s.state[i] = STATE.FRONT;
  s.pursuitX[i] = Math.max(2, Math.min(w.map.width - 2, s.x[i] + dx / l * b.evadeDistance));
  s.pursuitZ[i] = Math.max(2, Math.min(w.map.depth - 2, s.z[i] + dz / l * b.evadeDistance));
  s.holdUntil[i] = w.time + 1;
  return true;
}

// 그 구역 앞쪽(선분 ±100 m, 적 선 너머 200 m 안)에 적 원거리·공성이 있나 — 없으면 기병은 돌아 들어갈 까닭이 없다.
function preyAhead(w, side, sec) {
  const c = w.coarse, prey = c.prey[1 - side], dir = side === 0 ? 1 : -1;
  const c0 = Math.max(0, Math.floor((sec.x0 - 100) / c.cell)), c1 = Math.min(c.cols - 1, Math.floor((sec.x1 + 100) / c.cell));
  const za = sec.z, zb = sec.z + dir * 200, r0 = Math.max(0, Math.floor(Math.min(za, zb) / c.cell)), r1 = Math.min(c.rows - 1, Math.floor(Math.max(za, zb) / c.cell));
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (prey[rr * c.cols + cc] > 0) return true;
  return false;
}

// (x0,z0) → (x1,z1) 길에 적 버팀(창) 무게가 lineBlock 넘게 든 8 m 칸이 있나(앞 3 m·끝 6 m는 빼고 4 m마다 본다).
function lineBlocked(w, side, x0, z0, x1, z1) {
  const c = w.coarse.fine, foe = c.line[1 - side], lim = w.rules.behavior.lineBlock;
  const d = Math.hypot(x1 - x0, z1 - z0);
  for (let k = 3; k < d - 6; k += 4) {
    const x = x0 + (x1 - x0) * k / d, z = z0 + (z1 - z0) * k / d;
    const cc = Math.floor(x / c.cell), rr = Math.floor(z / c.cell);
    if (cc >= 0 && rr >= 0 && cc < c.cols && rr < c.rows && foe[rr * c.cols + cc] > lim) return true;
  }
  return false;
}

// 80 m 안에서 가장 가까운, 막히지 않은 적 원거리·공성 무리 칸의 가운데(없으면 null).
function preyCell(w, i) {
  const s = w.soldiers, c = w.coarse, b = w.rules.behavior, prey = c.prey[1 - s.side[i]];
  const reach = Math.ceil(b.huntRange / c.cell), c0 = Math.floor(s.x[i] / c.cell), r0 = Math.floor(s.z[i] / c.cell);
  const cap = s.side[i] === 0 ? w.map.vpLine + b.advanceCap : w.map.vpLine - b.advanceCap;
  let best = null, bd = Infinity;
  for (let rr = Math.max(0, r0 - reach); rr <= Math.min(c.rows - 1, r0 + reach); rr++)
    for (let cc = Math.max(0, c0 - reach); cc <= Math.min(c.cols - 1, c0 + reach); cc++) {
      if (prey[rr * c.cols + cc] <= 0) continue;
      const x = (cc + 0.5) * c.cell, z = (rr + 0.5) * c.cell, d = Math.hypot(x - s.x[i], z - s.z[i]);
      if (d > b.huntRange || d >= bd || (s.side[i] === 0 ? z > cap : z < cap)) continue;
      if (lineBlocked(w, s.side[i], s.x[i], s.z[i], x, z)) continue;
      bd = d; best = { x, z };
    }
  return best;
}

function cavTarget(w, i) {
  const s = w.soldiers, r = w.rules, rad = r.behavior.aggro, cs = s.cellSize, side = s.side[i];
  let best = -1, bp = Infinity, bd = Infinity;
  const c0 = Math.max(0, Math.floor((s.x[i] - rad) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((s.x[i] + rad) / cs));
  const r0 = Math.max(0, Math.floor((s.z[i] - rad) / cs)), r1 = Math.min(s.grows - 1, Math.floor((s.z[i] + rad) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (!s.alive[j] || s.side[j] === side) continue;
        const d2 = (s.x[j] - s.x[i]) ** 2 + (s.z[j] - s.z[i]) ** 2;
        if (d2 > rad * rad || !allowed(w, i, j)) continue;
        const ty = s.type[j], u = r.units[s.side[j]][ty], holds = u.holdsLine;
        const p = u.range > r.melee.reach * 2 || u.siege ? 0 : !holds ? 1 : 2;
        if (p > bp || (p === bp && d2 >= bd)) continue;
        if (holds && s.braced[j]) continue;                                    // 창은 우리 보병과 맞붙어 버티지 못할 때만(망치와 모루, 나안)
        if (p === 0 && lineBlocked(w, side, s.x[i], s.z[i], s.x[j], s.z[j])) continue;   // 창 벽 너머 궁수는 돌아서 간다
        best = j; bp = p; bd = d2;
      }
  return best;
}

// 거점 수비 진형(설계서 2026-11-09-flood-stronghold-formation-design.md §3): 바깥 고리(창)는 쫓지 않고 outerReach m 안 적만,
// 궁수는 근접 과녁 없이 제자리에서 쏘고(원거리 과녁은 위에서 고른다), 안쪽·가운데 고리는 수비대처럼 원 + 40 m 안 적에게 나갔다가 제자리로.
// 바깥 고리는 원 안으로 뚫고 들어온 적도 친다 — 그 병사에서 거점 반지름 R 안의 적만(한 명이 들어와도 맞은편 고리까지 무너지지 않게).
function formationThink(w, i) {
  const s = w.soldiers, role = s.fmRole[i], reach = w.rules.formation.outerReach;
  if (role === FM.ARCHER) { s.target[i] = -1; return; }
  if (role === FM.OUTER) {
    const st = w.strongholds[s.goalId[i]], R2 = st.radius * st.radius;
    const d2 = j => (s.x[j] - s.x[i]) ** 2 + (s.z[j] - s.z[i]) ** 2;
    const inside = j => (s.x[j] - st.x) ** 2 + (s.z[j] - st.z) ** 2 <= R2;
    const t = s.target[i];
    if (t >= 0 && s.alive[t] && s.side[t] !== s.side[i] && (d2(t) <= reach * reach || (inside(t) && d2(t) <= R2))) return;
    s.target[i] = nearestEnemy(s, i, reach);
    if (s.target[i] >= 0 || !st.nearIds || !(st.weightNear?.[1 - s.side[i]] > 0) || (i + w.tick) % 4 > 1) return;
    let best = -1, bd = R2;
    for (const j of st.nearIds) {
      if (!s.alive[j] || s.side[j] === s.side[i] || !inside(j)) continue;
      const d = d2(j);
      if (d <= bd) { bd = d; best = j; }
    }
    s.target[i] = best;
    return;
  }
  garrisonThink(w, i);
}

// 수비대(§6.3 우선순위 3): 거점 원 + 40 m 안의 적에게 달려든다(우리 건물을 치는 적도 이 안에 있다 — 공성 사거리 45 m).
// 그 밖으로는 쫓지 않는다. 집에서 멀면(막아라로 돌아오는 중) 적을 고르지 않고 집으로 걷는다(맞닿으면 싸움은 저절로).
function garrisonThink(w, i) {
  const s = w.soldiers, st = w.strongholds[s.goalId[i]];
  if (!st) { s.target[i] = -1; return; }
  const reach = garrisonReach(w, st), r2 = reach * reach;
  const inReach = j => (s.x[j] - st.x) ** 2 + (s.z[j] - st.z) ** 2 <= r2;
  if ((s.x[i] - st.x) ** 2 + (s.z[i] - st.z) ** 2 > (reach + 20) ** 2) { s.target[i] = -1; return; }
  const t = s.target[i];
  if (t >= 0 && s.alive[t] && s.side[t] !== s.side[i] && inReach(t)) return;
  s.target[i] = -1;
  if ((i + w.tick) % 4 > 1 || !st.nearIds) return;
  let best = -1, bd = Infinity;
  for (const j of st.nearIds) {
    if (!s.alive[j] || s.side[j] === s.side[i] || !inReach(j)) continue;
    const d = (s.x[j] - s.x[i]) ** 2 + (s.z[j] - s.z[i]) ** 2;
    if (d < bd) { bd = d; best = j; }
  }
  s.target[i] = best;
}
