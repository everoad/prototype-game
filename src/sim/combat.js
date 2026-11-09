// 싸움(설계서 §6.1·§6.2): 피해 계산(순수 함수), 원거리 목표 고르기, 한 틱의 때리기·쏘기.
import { kill, STATE } from './soldiers.js';
import { ARCHER, CAVALRY } from './rules.js';
import { buildingTarget } from './production.js';
import { BUFF } from './generals.js';

const DEG = 180 / Math.PI;

export function damagePerSecond(o, rules) {
  const a = rules.units[o.atkSide][o.atkType];
  if (o.building) return a.dps * (a.siege ? rules.buildingDamage.siege : rules.buildingDamage.other) * (o.aura ?? 1);
  let dps = a.dps * (o.aura ?? 1);
  if (o.charging) dps *= rules.charge.mult;
  if (!(o.unbraced && a.holdsLine)) for (const [atk, tgt, m] of rules.counters) {   // 버티지 못하는 창은 상성 없음
    if (atk !== o.atkType || tgt !== o.tgtType) continue;
    dps *= o.tgtElite && a.holdsLine && tgt === CAVALRY ? rules.elite.spearCounter : (m ?? rules.counterMult);   // 중기병은 창 벽에 덜 다친다
  }
  const ang = Math.abs(o.angleDeg ?? 0);
  const wall = o.ranged && o.tgtElite && rules.units[o.tgtSide][o.tgtType].holdsLine;   // 방패벽 창병
  const guard = Math.abs(o.guardDeg ?? ang);   // 방패는 guardDeg(적 쪽으로 든 방패) 기준, 옆·뒤 배율은 몸이 보는 쪽(angleDeg) 기준
  if (o.ranged && rules.units[o.tgtSide][o.tgtType].shield && guard <= rules.shield.halfAngleDeg) dps *= wall ? rules.elite.shieldMult : rules.shield.mult;   // 방패(창병·보병)
  else if (wall) dps *= rules.elite.allRound;
  if (ang >= rules.flank.rearMinDeg) dps *= rules.flank.rear;
  else if (ang > rules.flank.frontMaxDeg) dps *= rules.flank.side;
  return dps;
}

// 원거리 목표: 적 궁수 > 공성병 > 기병 > 그 밖, 같으면 가까운 쪽(맞쏘기 우선, §6.1).
const PRIORITY = { [ARCHER]: 0, [CAVALRY]: 2 };
export function pickRangedTarget(cands, rules) {
  let best = -1, bp = Infinity, bd = Infinity;
  cands.forEach((c, k) => {
    const p = PRIORITY[c.type] ?? 3;
    if (p < bp || (p === bp && c.dist < bd)) { best = k; bp = p; bd = c.dist; }
  });
  return best;
}

// 맞는 쪽이 보는 방향과, 맞는 쪽에서 때리는 쪽으로 가는 방향 사이의 각(도, 0~180).
export function hitAngleDeg(s, attacker, target) {
  const toA = Math.atan2(s.z[attacker] - s.z[target], s.x[attacker] - s.x[target]);
  let d = toA - s.facing[target];
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) * DEG;
}

// 원거리용 각: 맞붙어 싸우거나 달아나는 병사는 보는 쪽 기준, 그 밖에는 방패를 적 쪽(편 0은 +z)으로 든다고 본다
// (사용자 2026-11-07: 옆으로 걷는 방패벽 창이 적 쪽에서 온 바위를 옆구리로 맞았다 — 피해의 67%가 옆·뒤).
export function guardAngleDeg(s, attacker, target) {
  if (s.inContact[target] || s.state[target] === STATE.ROUT) return hitAngleDeg(s, attacker, target);
  const toA = Math.atan2(s.z[attacker] - s.z[target], s.x[attacker] - s.x[target]);
  let d = toA - (s.side[target] === 0 ? Math.PI / 2 : -Math.PI / 2);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) * DEG;
}

// 가장 가까운 적(반지름 r 안). 없으면 −1.
export function nearestEnemy(s, i, r) {
  let best = -1, bd = r * r;
  const xi = s.x[i], zi = s.z[i], side = s.side[i];
  const cs = s.cellSize, gc = s.gcols, head = s.head, next = s.next, X = s.x, Z = s.z, S = s.side, A = s.alive;
  const c0 = Math.max(0, Math.floor((xi - r) / cs)), c1 = Math.min(gc - 1, Math.floor((xi + r) / cs));
  const r0 = Math.max(0, Math.floor((zi - r) / cs)), r1 = Math.min(s.grows - 1, Math.floor((zi + r) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = head[rr * gc + cc]; j !== -1; j = next[j]) {
        if (S[j] === side || !A[j]) continue;
        const dx = X[j] - xi, dz = Z[j] - zi, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = j; }
      }
  return best;
}

// 반지름 r 안 적 가운데 원거리 순서로 가장 좋은 목표(없으면 −1). circle = { x, z, r }이면 그 원 안 적만(화살 비, casts.js).
export function bestRangedTarget(w, i, r, circle = null) {
  const s = w.soldiers, side = s.side[i], xi = s.x[i], zi = s.z[i], r2 = r * r, cs = s.cellSize, cr2 = circle ? circle.r * circle.r : 0;
  const c0 = Math.max(0, Math.floor((xi - r) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((xi + r) / cs));
  const r0 = Math.max(0, Math.floor((zi - r) / cs)), r1 = Math.min(s.grows - 1, Math.floor((zi + r) / cs));
  let best = -1, bp = Infinity, bd = Infinity;
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (s.side[j] === side || !s.alive[j]) continue;
        const dx = s.x[j] - xi, dz = s.z[j] - zi, d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        if (circle && (s.x[j] - circle.x) ** 2 + (s.z[j] - circle.z) ** 2 > cr2) continue;
        const p = PRIORITY[s.type[j]] ?? 3;
        if (p < bp || (p === bp && d2 < bd)) { best = j; bp = p; bd = d2; }
      }
  return best;
}

export const isRanged = (rules, side, type) => rules.units[side][type].range > rules.melee.reach * 2;

// 병사 i의 사거리(장궁수는 +rangeBonus).
export const rangeOf = (w, i) => {
  const s = w.soldiers, u = w.rules.units[s.side[i]][s.type[i]];
  return u.range + (s.elite[i] && s.type[i] === ARCHER ? w.rules.elite.rangeBonus : 0);
};

// 한 틱: 근접은 닿은 적을 1초마다 치고, 원거리는 사거리 안 목표(behavior가 고른 rtarget)를 1초마다 쏜다.
// 피해는 모았다가 한꺼번에 깎는다. 쐐기 충격·기병 돌격의 첫 타는 바로 들어가 ×2, 맞은 적은 밀려난다.
export function stepCombat(w) {
  const s = w.soldiers, r = w.rules, dt = r.dt, reach = r.melee.reach, interval = r.melee.interval;
  const dmg = w._dmg && w._dmg.length >= s.capacity ? w._dmg : (w._dmg = new Float32Array(s.capacity));
  dmg.fill(0, 0, s.count);
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    if (s.state[i] === STATE.ROUT) { s.inContact[i] = 0; continue; }   // 달아나는 병사는 치지 않는다
    const u = r.units[s.side[i]][s.type[i]];
    const bf = s.buff[i], aura = bf ? (bf & BUFF.AURA ? r.general.aura : 1) * (bf & BUFF.CHARGE ? r.general.chargeMult : 1) : 1;   // 장수 기운·돌격
    const t = nearestEnemy(s, i, reach);
    s.inContact[i] = t >= 0 ? 1 : 0;
    s.contact[i] = t;
    if (u.holdsLine) s.braced[i] = infantryNear(w, i, r.melee.brace) ? 0 : 1;
    s.contactHold[i] = t >= 0 && r.units[s.side[t]][s.type[t]].holdsLine && s.braced[t] ? 1 : 0;   // 버티는 창에만 막힌다
    s.hitTimer[i] += dt;
    if (s.staggerUntil[i] > w.time) { s.hitTimer[i] = Math.min(s.hitTimer[i], interval); continue; }   // 돌격에 흔들려 못 친다
    if (u.siege && hitBuilding(w, i, u, interval)) continue;          // 공성병은 사거리 안 건물·성벽이 먼저
    const ranged = u.range > reach * 2;
    if (ranged && t < 0) {                                           // 원거리: 쏘기(근접 적이 닿으면 못 쏜다)
      const rt = s.rtarget[i];
      const rng = rangeOf(w, i);
      if (rt < 0 || !s.alive[rt] || (s.x[rt] - s.x[i]) ** 2 + (s.z[rt] - s.z[i]) ** 2 > rng * rng) { s.hitTimer[i] = Math.min(s.hitTimer[i], interval); continue; }
      s.facing[i] = Math.atan2(s.z[rt] - s.z[i], s.x[rt] - s.x[i]);
      // 화살 비(casts.js): 원 안 과녁이면 쏘는 간격 ÷ fireMult — 한 발 피해(interval × 화력)는 그대로라 1초 피해가 그만큼 는다
      const rain = s.volleyUntil[i] > w.time && (s.x[rt] - s.volleyX[i]) ** 2 + (s.z[rt] - s.volleyZ[i]) ** 2 <= r.orders.radius ** 2;
      const shotEvery = rain ? interval / r.orders.volley.fireMult : interval;
      if (s.hitTimer[i] + 1e-9 < shotEvery) continue;
      if (cavalryNear(w, i, r.charge.scare)) { s.hitTimer[i] = Math.min(s.hitTimer[i], interval); continue; }   // 기병이 덮치면 못 쏜다
      s.hitTimer[i] -= shotEvery;
      const tu = r.units[s.side[rt]][s.type[rt]];
      const dodge = tu.charges && s.vx[rt] * s.vx[rt] + s.vz[rt] * s.vz[rt] > (tu.speed * 0.6) ** 2 ? r.charge.dodge : 1;   // 달리는 기병은 반만 맞는다
      const hit = dodge * interval * damagePerSecond({ atkSide: s.side[i], atkType: s.type[i], tgtSide: s.side[rt], tgtType: s.type[rt], angleDeg: hitAngleDeg(s, i, rt), guardDeg: guardAngleDeg(s, i, rt), ranged: true, charging: false, building: false, aura, tgtElite: s.elite[rt] === 1 }, r);
      dmg[rt] += hit;
      if (w.stats) note(w, i, rt, hit, true);
      if (u.splash > 0) splash(w, dmg, i, rt, interval * (u.splashShare ?? 1), aura);
      if (w.shots.length < 8000) w.shots.push({ x1: s.x[i], z1: s.z[i], x2: s.x[rt], z2: s.z[rt], side: s.side[i], t: w.time });
      continue;
    }
    if (t < 0) {
      // 적 거점 원 안에서 싸울 적이 없으면 건물을 친다(×0.05, §6.2)
      if (s.target[i] < 0 && (i + w.tick) % 4 === 0 && hitBuilding(w, i, u, interval, 4)) continue;
      s.hitTimer[i] = Math.min(s.hitTimer[i], interval); continue;
    }
    s.facing[i] = Math.atan2(s.z[t] - s.z[i], s.x[t] - s.x[i]);   // 맞붙은 상대를 본다
    // 쐐기 충격, 또는 기병 돌격(30 m 넘게 달린 뒤 첫 타, 10초에 한 번)
    const charge = u.charges && s.runDist[i] >= r.charge.runMeters && w.time - s.lastCharge[i] >= r.charge.cooldown;
    const impact = s.chargeHit[i] === 1 || charge;
    if (!impact && s.hitTimer[i] + 1e-9 < interval) continue;
    s.hitTimer[i] = impact ? 0 : s.hitTimer[i] - interval;
    if (charge) { s.lastCharge[i] = w.time; s.runDist[i] = 0; s.staggerUntil[t] = w.time + r.charge.staggerSeconds; }
    const mhit = interval * (ranged ? r.melee.caughtRanged : 1) * damagePerSecond({
      atkSide: s.side[i], atkType: s.type[i], tgtSide: s.side[t], tgtType: s.type[t],
      angleDeg: hitAngleDeg(s, i, t), ranged: false, charging: impact, building: false, aura, unbraced: !s.braced[i], tgtElite: s.elite[t] === 1,
    }, r);
    dmg[t] += mhit;
    if (w.stats) note(w, i, t, mhit, false);
    if (impact) {                                                    // 맞은 적은 밀려난다
      s.chargeHit[i] = 0;
      const dx = s.x[t] - s.x[i], dz = s.z[t] - s.z[i], l = Math.hypot(dx, dz) || 1, k = r.group.knockback;
      const nx = s.x[t] + dx / l * k, nz = s.z[t] + dz / l * k;
      if (w.map.walkable(nx, nz)) { s.x[t] = nx; s.z[t] = nz; }
    }
  }
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || dmg[i] === 0) continue;
    s.hp[i] -= dmg[i] * (s.buff[i] & BUFF.HOLD || s.drumUntil[i] > w.time ? r.general.holdTaken : 1);   // 버텨라·전쟁 북: 받는 피해 ×0.7
    if (s.hp[i] <= 0) {
      w.deaths.push({ x: s.x[i], z: s.z[i], side: s.side[i], type: s.type[i], t: w.time });
      if (w.stats) w.stats.kills.push({ side: s.side[i], type: s.type[i], by: w.stats.lastHit[i], t: w.time });
      if (w.stats?.onDeath) w.stats.onDeath(i);
      kill(s, i);
    }
  }
}

// 투척꾼 바위: 목표 둘레 반지름 안의 다른 적에게도 피해(splashShare만큼).
// 범위 피해: 맞은 자리 둘레 splash m의 가까운 splashMax명(사용자 2026-11-07: 빽빽한 줄에서 바위 하나가 열 명 넘게 쳤다)에게
// scale(= 간격 × splashShare)만큼. 맞는 사람마다 자기 방패·방향·상성·달리는 기병 피하기를 따진다(사용자 2026-11-07: 방패벽 창이 옆 궁수 몫의 바위를 방패 없이 맞았다).
function splash(w, dmg, from, center, scale, aura) {
  const s = w.soldiers, r = w.rules, u = r.units[s.side[from]][s.type[from]], side = s.side[from], rad = u.splash, max = u.splashMax ?? Infinity;
  const cs = s.cellSize, x = s.x[center], z = s.z[center], r2 = rad * rad;
  const c0 = Math.max(0, Math.floor((x - rad) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((x + rad) / cs));
  const r0 = Math.max(0, Math.floor((z - rad) / cs)), r1 = Math.min(s.grows - 1, Math.floor((z + rad) / cs));
  const near = [];
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j]) {
        if (j === center || !s.alive[j] || s.side[j] === side) continue;
        const d2 = (s.x[j] - x) ** 2 + (s.z[j] - z) ** 2;
        if (d2 <= r2) near.push([d2, j]);
      }
  if (near.length > max) near.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < Math.min(max, near.length); k++) {
    const j = near[k][1], tu = r.units[s.side[j]][s.type[j]];
    const dodge = tu.charges && s.vx[j] * s.vx[j] + s.vz[j] * s.vz[j] > (tu.speed * 0.6) ** 2 ? r.charge.dodge : 1;
    const hit = scale * dodge * damagePerSecond({ atkSide: side, atkType: s.type[from], tgtSide: s.side[j], tgtType: s.type[j], angleDeg: hitAngleDeg(s, from, j), guardDeg: guardAngleDeg(s, from, j), ranged: true, charging: false, building: false, aura, tgtElite: s.elite[j] === 1 }, r);
    dmg[j] += hit;
    if (w.stats) note(w, from, j, hit, true);
  }
}

// 건물 치기: 공성병은 사거리(+원 반지름 절반) 안, 그 밖은 적 거점 원 안에서. 성벽이 먼저. 탄 건물은 주인 사기 −2.
// every: 이 병사의 판단이 몇 틱마다인지(그만큼 피해를 몰아 준다).
function hitBuilding(w, i, u, interval, every = 1) {
  const s = w.soldiers, r = w.rules;
  for (const st of w.strongholds) {
    if (st.owner === null || st.owner === s.side[i] || st.kind === 'vp') continue;
    const d = Math.hypot(s.x[i] - st.x, s.z[i] - st.z);
    if (d > (u.siege ? st.radius * 0.5 + u.range : st.radius)) continue;
    const bt = buildingTarget(st);
    if (!bt) continue;
    s.facing[i] = Math.atan2(st.z - s.z[i], st.x - s.x[i]);
    st.hitAt = w.time;                                              // 경보 '공격받음'
    s.hitTimer[i] += r.dt * (every - 1);
    if (s.hitTimer[i] + 1e-9 < interval) return true;
    s.hitTimer[i] -= interval;
    const hit = interval * damagePerSecond({ atkSide: s.side[i], atkType: s.type[i], building: true, aura: 1 }, r);
    if (bt.wall === 'hq') { st.wallHp = Math.max(0, st.wallHp - hit); if (st.wallHp === 0) w.events.push({ kind: 'wallDown', stronghold: st.id }); }
    else {
      const b = st.slots[bt.slot];
      b.hp -= hit;
      if (b.hp <= 0) w.burnBuilding(st, bt.slot);
    }
    if (u.siege && w.shots.length < 8000) w.shots.push({ x1: s.x[i], z1: s.z[i], x2: st.x, z2: st.z, side: s.side[i], t: w.time });
    return true;
  }
  return false;
}

// 측정(w.stats가 있을 때만): 피해 표 dmg['편종류>편종류'], 맞은 병사의 마지막 공격자 lastHit(편×4 + 종류, 원거리면 +8).
function note(w, i, t, hit, ranged) {
  const st = w.stats, s = w.soldiers;
  const key = `${s.side[i]}${s.type[i]}>${s.side[t]}${s.type[t]}`;
  st.dmg[key] = (st.dmg[key] ?? 0) + hit;
  st.lastHit[t] = s.side[i] * 4 + s.type[i] + (ranged ? 8 : 0);
  if (st.dealt) st.dealt[i] += hit;
}

// 반지름 r 안에 기병이 아닌 적이 있나(버팀이 버티지 못하는가).
function infantryNear(w, i, r) {
  const s = w.soldiers, units = w.rules.units, side = s.side[i], xi = s.x[i], zi = s.z[i], r2 = r * r, cs = s.cellSize;
  const c0 = Math.max(0, Math.floor((xi - r) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((xi + r) / cs));
  const r0 = Math.max(0, Math.floor((zi - r) / cs)), r1 = Math.min(s.grows - 1, Math.floor((zi + r) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j])
        if (s.side[j] !== side && s.alive[j] && !units[s.side[j]][s.type[j]].charges && (s.x[j] - xi) ** 2 + (s.z[j] - zi) ** 2 <= r2) return true;
  return false;
}

// 반지름 r 안에 적 기병(돌격 병종)이 있나.
function cavalryNear(w, i, r) {
  const s = w.soldiers, units = w.rules.units, side = s.side[i], xi = s.x[i], zi = s.z[i], r2 = r * r, cs = s.cellSize;
  const c0 = Math.max(0, Math.floor((xi - r) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((xi + r) / cs));
  const r0 = Math.max(0, Math.floor((zi - r) / cs)), r1 = Math.min(s.grows - 1, Math.floor((zi + r) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j])
        if (s.side[j] !== side && s.alive[j] && units[s.side[j]][s.type[j]].charges && (s.x[j] - xi) ** 2 + (s.z[j] - zi) ** 2 <= r2) return true;
  return false;
}
