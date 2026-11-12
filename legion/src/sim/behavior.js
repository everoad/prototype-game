// 판단(설계서 §6.3 우선순위): 어그로 반경 안 적에게 붙는다.
// (옛 판의 구역 병사 규칙 — 정면으로 남아 120 m 안 적 무리로 다가가기, 자리로 돌아오기, 승점 선 너머 쫓기 한도, 기병의 사냥 돌기 — 는
// 구역과 함께 뺐다. 점으로 보낸 병사는 그 길을 지나지 않았다.)
// 다치고 둘러싸이면 몇 초 달아난다(국지 무너짐). 행군 중인 쐐기의 병사는 달려들지 않는다(§6.4).
// 판단은 병사마다 2틱에 한 번(번호 짝·홀).
import { nearestEnemy, bestRangedTarget, rangeOf } from './combat.js';
import { ARCHER } from './rules.js';
import { STATE, ORDER } from './soldiers.js';

const SEARCH_EVERY = 8;      // 대상이 없는 병사가 새 적을 찾는 틱 간격(병사마다 엇갈림) — 반지름 40 m 찾기가 가장 비싸다
const ORDER_ARRIVED = 10;    // 이동 명령: 자기 자리에서 이만큼 안이면 도착(명령이 풀리고 원래대로 싸운다) m
const ORDER_STALL = 4;       // 명령: 이만큼 동안 목표에 1 m도 가까워지지 못하면(붐빔·막힘) 도착한 것으로 보고 푼다 s

export function stepBehavior(w) {
  const s = w.soldiers, b = w.rules.behavior, parity = w.tick & 1;
  const cw = w._chaseW && w._chaseW.length >= s.capacity ? w._chaseW : (w._chaseW = new Float32Array(s.capacity));   // 적마다 그를 노리는 우리 무게(쫓는 수 한도)
  cw.fill(0, 0, s.count);
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.target[i] >= 0) cw[s.target[i]] += w.rules.units[s.side[i]][s.type[i]].weight;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    if (s.state[i] === STATE.ROUT) {
      if (w.time >= s.routUntil[i]) { s.state[i] = STATE.FRONT; s.target[i] = -1; }
      continue;
    }
    if (w.rules.units[s.side[i]][s.type[i]].worker) { if (s.order[i]) orderedThink(w, i); s.target[i] = -1; s.rtarget[i] = -1; continue; }   // 광부(3단계): 적을 노리지 않고 달아나지도 않는다
    if ((i + w.tick) % b.routCheckEvery === 0 && maybeRout(w, i)) continue;
    if ((i & 1) !== parity) continue;
    if (s.state[i] === STATE.FLEE) { s.target[i] = -1; continue; }
    if (s.order[i] && orderedThink(w, i)) continue;                  // 명령(사용자 2026-11-08 "B"): 이동 중엔 새 적을 찾지 않는다
    if (s.group[i] >= 0 && s.state[i] === STATE.MARCH) { s.target[i] = -1; s.rtarget[i] = -1; continue; }   // 행군 중인 쐐기
    const u = w.rules.units[s.side[i]][s.type[i]], ranged = u.range > w.rules.melee.reach * 2;
    if (u.catapult) { s.target[i] = -1; s.rtarget[i] = -1; continue; }   // 투석기: 쫓지도 치지도 않는다 — 과녁은 catapult.js
    if (ranged && (i + w.tick) % b.rangedScanEvery < 2) {         // 원거리: 사거리 안 맞쏘기 순서로 목표
      const rt = s.rtarget[i];
      const rng = rangeOf(w, i);
      // 화살 비(casts.js): 원 안 과녁만 — 원 안에 닿는 적이 없으면 평소대로
      const rain = s.volleyUntil[i] > w.time ? { x: s.volleyX[i], z: s.volleyZ[i], r: w.rules.orders.radius } : null;
      const keep = rt >= 0 && s.alive[rt] && (s.x[rt] - s.x[i]) ** 2 + (s.z[rt] - s.z[i]) ** 2 <= rng * rng && (!rain || (s.x[rt] - rain.x) ** 2 + (s.z[rt] - rain.z) ** 2 <= rain.r * rain.r);
      if (!keep) { const inRain = rain ? bestRangedTarget(w, i, rng, rain) : -1; s.rtarget[i] = inRain >= 0 ? inRain : bestRangedTarget(w, i, rng); }
      if (s.type[i] === ARCHER && maybeKite(w, i)) continue;   // 거점 진형 궁수는 물러나지 않는다
    }
    const t = s.target[i];
    if (!ranged) {                                                     // 1) 바로 옆의 적부터(노리던 먼 적을 버린다) — 거점으로 가는 기병도 그대로(2026-11-10 막아 봤더니 도는 횟수는 그대로이고 선 끝 돌기가 줄었다)
      const close = nearestEnemy(s, i, b.closeSwitch);
      if (close >= 0 && close !== t) { aim(w, i, close); continue; }
    }
    if (s.leaveUntil[i] > w.time) {                                    // 보낸 병사가 빠지는 중: 붙은 적만 끝내고 목표로
      if (!(t >= 0 && s.alive[t] && Math.hypot(s.x[t] - s.x[i], s.z[t] - s.z[i]) <= b.closeSwitch * 1.5)) s.target[i] = -1;
      continue;
    }
    if (t >= 0 && s.alive[t] && s.side[t] !== s.side[i] && Math.hypot(s.x[t] - s.x[i], s.z[t] - s.z[i]) <= b.aggro && !runningCav(w, i, t)) continue;
    if ((i + w.tick) % SEARCH_EVERY > 1 && !(s.pressUntil[i] > w.time)) { aim(w, i, -1); continue; }   // 적 앞에서 막 풀린 쐐기 병사는 틱마다 찾는다(groups.js press)
    aim(w, i, nearestChase(w, i, b.aggro));
  }
}

// 명령받은 병사(soldiers.js ORDER). 아직 가는 중이면 true — 새 적을 찾지도 쫓지도 않고 쏘지도 않는다(닿은 적은 싸움에서 저절로 친다;
// 걸으며 쏘기는 같은 날 뺐다 — 사용자 "이동하면서 공격할 수 있는 게 문제"). 도착했으면(공격이면 그 적과 맞붙음, 원거리는 사거리 안) 명령을 풀고 false.
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
    // 도착: 원거리는 사거리 안(멈춰 쏜다), 근접은 그 적과 맞붙었을 때(closeSwitch 안) — 25 m에서 끝내던 것은 마지막 구간에서
    // 그 적 둘레의 다른 적에게 샜다(사용자 2026-11-09 "중간에 적군 있으면 타겟이 바뀐다"). 그 적이 죽으면 그 자리에 선다.
    const d = Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]);
    const arrived = !ok || (ranged ? d <= rangeOf(w, i) : s.contact[i] === f || d <= b.closeSwitch);
    if (loose && arrived) {
      s.order[i] = ORDER.NONE;
      s.goalX[i] = s.x[i]; s.goalZ[i] = s.z[i];                     // 그 자리를 지킨다(적이 죽었으면 거기 선다)
      if (ok) { if (ranged) s.rtarget[i] = f; else s.target[i] = f; }
      return false;
    }
  } else if (loose && Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]) <= ORDER_ARRIVED) { s.order[i] = ORDER.NONE; return false; }
  s.target[i] = -1; s.rtarget[i] = -1;
  return true;
}

// ---- 쫓기(2026-11-09) ----
// 과녁을 바꾼다 — 적마다 노리는 무게(w._chaseW)도 같이 고친다.
function aim(w, i, j) {
  const s = w.soldiers, old = s.target[i];
  if (old === j) return;
  const wt = w.rules.units[s.side[i]][s.type[i]].weight, cw = w._chaseW;
  if (old >= 0) cw[old] -= wt;
  if (j >= 0) cw[j] += wt;
  s.target[i] = j;
}
// 창·보병(기병 아님)이 노리기엔 달리는 기병인가: cavNear m 밖에서 제 빠르기 × cavSlow보다 빠르면.
function runningCav(w, i, j) {
  const s = w.soldiers, C = w.rules.behavior.chase, uj = w.rules.units[s.side[j]][s.type[j]];
  if (!uj.charges || w.rules.units[s.side[i]][s.type[i]].charges) return false;
  return (s.x[j] - s.x[i]) ** 2 + (s.z[j] - s.z[i]) ** 2 > C.cavNear * C.cavNear && s.vx[j] * s.vx[j] + s.vz[j] * s.vz[j] > (uj.speed * C.cavSlow) ** 2;
}
// 새로 노려도 되나: 달리는 기병이 아니고, 그 적을 노리는 무게가 한도(그 적 무게 × capRatio) 안 — 손에 닿는 적은 한도와 상관없이.
function canChase(w, i, j, d) {
  if (runningCav(w, i, j)) return false;
  const s = w.soldiers, r = w.rules;
  if (s.target[i] === j || d <= r.melee.reach * 1.5) return true;
  return w._chaseW[j] + r.units[s.side[i]][s.type[i]].weight <= r.behavior.chase.capRatio * r.units[s.side[j]][s.type[j]].weight + 1e-9;
}
// rad m 안에서 노려도 되는 가장 가까운 적, 없으면 −1.
function nearestChase(w, i, rad) {
  const s = w.soldiers, cs = s.cellSize, side = s.side[i];
  let best = -1, bd = rad * rad;
  const c0 = Math.max(0, Math.floor((s.x[i] - rad) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((s.x[i] + rad) / cs));
  const r0 = Math.max(0, Math.floor((s.z[i] - rad) / cs)), r1 = Math.min(s.grows - 1, Math.floor((s.z[i] + rad) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (!s.alive[j] || s.side[j] === side) continue;
        const d2 = (s.x[j] - s.x[i]) ** 2 + (s.z[j] - s.z[i]) ** 2;
        if (d2 >= bd || !canChase(w, i, j, Math.sqrt(d2))) continue;
        bd = d2; best = j;
      }
  return best;
}

// 달아날 때 섞는 제 편 쪽(z): 편 0 = −z, 편 1 = +z, 중립(편 2)은 적이 양쪽이라 섞지 않는다(맞은편 소굴이 같게 — 2단계 최종 검토).
const homeDir = side => (side === 0 ? -1 : side === 1 ? 1 : 0);

// 국지 무너짐: 8 m 안 적 무게가 우리(자기 포함)의 routRatio배 이상이고 체력이 routHp 아래면 routSeconds 동안 달아난다.
function maybeRout(w, i) {
  const s = w.soldiers, b = w.rules.behavior;
  if (s.state[i] === STATE.FLEE || s.wedge[i] || s.drumUntil[i] > w.time) return false;   // 버텨라·돌격 북: 물러나지 않음
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
  const l = Math.hypot(dx, dz) || 1, home = homeDir(s.side[i]);
  dx = dx / l * 0.5; dz = dz / l * 0.5 + home * 0.5;
  const l2 = Math.hypot(dx, dz) || 1;
  s.state[i] = STATE.ROUT; s.target[i] = -1;
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
        const uj = r.units[s.side[j]][s.type[j]], melee = !uj.worker && uj.range <= r.melee.reach * 2;   // 광부는 위협도 지킴도 아니다(3단계 최종 검토)
        if (s.side[j] !== s.side[i] && melee && d <= rad) foe = j;
        if (s.side[j] === s.side[i] && melee && d <= b.kiteFriend) friend = true;
      }
  if (foe < 0 || friend) return false;
  const home = homeDir(s.side[i]);
  let dx = s.x[i] - s.x[foe], dz = s.z[i] - s.z[foe];
  const l = Math.hypot(dx, dz) || 1;
  dx = dx / l * 0.5; dz = dz / l * 0.5 + home * 0.5;
  const l2 = Math.hypot(dx, dz) || 1;
  s.state[i] = STATE.ROUT; s.target[i] = -1;
  s.routUntil[i] = w.time + b.kiteSeconds;
  s.routX[i] = s.x[i] + dx / l2 * b.kiteDistance; s.routZ[i] = s.z[i] + dz / l2 * b.kiteDistance;
  return true;
}
