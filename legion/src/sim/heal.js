// 사제(6-1단계, 설계서 §7 "6단계 설계" — 영지 사제 방식): rules.heal.every틱마다
// ① 고치기: 둘레 healRange m 안 같은 편 산 병사 가운데 체력 몫이 가장 낮은(1 아래) 하나를 heal × every × dt만큼(최대 체력까지, 고친 즉시 다음 사제가 본다).
// ② 움직임: 명령 없이 서 있는 사제는 자리(postX/Z = 마지막 명령 자리) 둘레 leash m 안의 가장 다친 우리 편 쪽으로 고칠 거리 끝까지만 다가가고,
//    다친 이가 없으면 자리로 돌아온다 — 앞줄 16 m 뒤에 머물게. 건물은 고치지 않는다.
//    둘레(aggro m)에 적이 있으면 끈의 가운데는 사제 자신이다(leash + 고칠 거리 안의 다친 이에게, 한 번에 leash까지) — 다친 이가 없으면 그대로 선다.
//    어택땅 쐐기가 싸움에서 풀리면 자리가 싸움 너머 목적지라, 자리로 가면 싸움을 뚫고 갔다(6-1단계 최종 검토). 싸움이 끝나면 다시 자리로 간다.
import { forEachNear, STATE, ORDER, GOAL } from './soldiers.js';
import { nearestEnemy } from './combat.js';

export function stepHeal(w) {
  const R = w.rules, H = R.heal;
  if (w.tick % H.every !== 0) return;
  const s = w.soldiers, units = R.units, amount = H.every * R.dt;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    const u = units[s.side[i]][s.type[i]];
    if (!(u.heal > 0) || s.state[i] === STATE.ROUT || s.state[i] === STATE.FLEE) continue;
    const side = s.side[i], xi = s.x[i], zi = s.z[i];
    // ① 고치기
    const j = mostHurt(s, units, side, xi, zi, u.healRange, xi, zi, Infinity);
    if (j >= 0) {
      s.hp[j] = Math.min(units[side][s.type[j]].hp, s.hp[j] + u.heal * amount);
      if (w.fx.length < 8000) w.fx.push({ kind: 'heal', x: s.x[j], z: s.z[j], r: 0, t: w.time });
    }
    // ② 움직임(보내는 중·쐐기 행군 중이면 건너뛴다)
    if (s.order[i] !== ORDER.NONE || s.wedge[i]) continue;
    const fight = nearestEnemy(s, i, R.behavior.aggro) >= 0;
    const px = fight ? xi : s.postX[i], pz = fight ? zi : s.postZ[i], reach = fight ? H.leash + u.healRange : H.leash;
    const k = mostHurt(s, units, side, px, pz, reach, px, pz, reach);
    let gx = fight ? xi : px, gz = fight ? zi : pz;                  // 다친 이가 없으면: 싸움 중엔 그대로, 아니면 자리로
    if (k >= 0) {
      const dx = xi - s.x[k], dz = zi - s.z[k], d = Math.hypot(dx, dz);
      if (d > u.healRange) { const keep = u.healRange - 1; gx = s.x[k] + dx / d * keep; gz = s.z[k] + dz / d * keep; }
      else { gx = xi; gz = zi; }
      const ox = gx - px, oz = gz - pz, od = Math.hypot(ox, oz);
      if (od > H.leash) { gx = px + ox / od * H.leash; gz = pz + oz / od * H.leash; }   // 끈 밖으로는 안 간다
    }
    s.goalKind[i] = GOAL.POINT; s.goalId[i] = -1; s.goalX[i] = gx; s.goalZ[i] = gz;
  }
}

// (cx, cz) 둘레 r m 안 같은 편 산 병사 가운데 체력 몫이 가장 낮은(1 아래) 병사, 없으면 −1. lim이 유한하면 (lx, lz)에서 lim m 안만.
function mostHurt(s, units, side, cx, cz, r, lx, lz, lim) {
  let best = -1, bs = 1;
  const r2 = r * r, l2 = lim * lim;
  forEachNear(s, cx, cz, r, j => {
    if (!s.alive[j] || s.side[j] !== side) return;
    if ((s.x[j] - cx) ** 2 + (s.z[j] - cz) ** 2 > r2 || (s.x[j] - lx) ** 2 + (s.z[j] - lz) ** 2 > l2) return;
    const share = s.hp[j] / units[side][s.type[j]].hp;
    if (share < bs - 1e-9) { bs = share; best = j; }
  });
  return best;
}
