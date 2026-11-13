// 투석기(설계서 2026-11-09-flood-catapult-design.md §2): reload초에 한 발, 돌은 flight초 날아 떨어진 자리에 피해를 준다.
// 과녁: 보이는 적 병사 가운데 둘레 aimRadius m에 적이 가장 많은 자리(군단 영지 1단계 — 거점·성벽 과녁은 옛 판과 함께 뺐다).
// minRange 안은 못 쏘고, 근접 적이 닿아 있으면 쏘지 않는다. 돌이 떨어질 때 둘레를 다시 본다 — 비킨 병사는 안 맞는다.
import { STATE, forEachNear } from './soldiers.js';
import { SIEGE } from './rules.js';
import { canSee } from './vision.js';
import { damageMult, killSoldier, nearestEnemy } from './combat.js';
import { damageBuilding } from './strikes.js';

export function stepCatapults(w) {
  const s = w.soldiers, r = w.rules, C = r.catapult;
  for (let k = w.boulders.length - 1; k >= 0; k--) {               // 떨어진 돌
    const b = w.boulders[k];
    if (b.t1 > w.time + 1e-9) continue;
    w.boulders.splice(k, 1);
    land(w, b);
  }
  for (let i = 0; i < s.count; i++) {                               // 쏘기
    if (!s.alive[i]) continue;
    const u = r.units[s.side[i]][s.type[i]];
    if (!u.catapult || s.state[i] === STATE.ROUT || w.time < s.fireAt[i] + C.reload - 1e-9 || w.time < s.aimNext[i] - 1e-9) continue;
    if (s.vx[i] * s.vx[i] + s.vz[i] * s.vz[i] > C.still * C.still || fighterTouching(w, i)) continue;   // 걸으면서 쏘지 않는다(사용자 2026-11-08), 근접 적이 닿아 있으면 못 쏜다(광부는 빼고 — 3단계)
    const aim = aimAt(w, i, u);
    if (!aim) { s.aimNext[i] = w.time + C.retry; continue; }        // 과녁이 없으면 retry초 뒤에 다시 본다(사거리 100 m 훑기가 틱마다 돌지 않게)
    s.fireAt[i] = w.time;
    s.facing[i] = Math.atan2(aim.z - s.z[i], aim.x - s.x[i]);   // 과녁 쪽을 본다(화면·옆뒤 판정)
    w.boulders.push({ side: s.side[i], x0: s.x[i], z0: s.z[i], x1: aim.x, z1: aim.z, t0: w.time, t1: w.time + C.flight, from: i, fromSerial: s.serial[i] });
    w.events.push({ kind: 'boulderFire', side: s.side[i], from: i, x: aim.x, z: aim.z });
  }
}

// 손이 닿는 거리(melee.reach)에 싸우는 적(광부·사제 아님)이 있나. 싸우지 않는 병종이 없으면 nearestEnemy와 같다.
function fighterTouching(w, i) {
  const s = w.soldiers, units = w.rules.units, reach = w.rules.melee.reach, j = nearestEnemy(s, i, reach);
  if (j < 0 || !units[s.side[j]][s.type[j]].noncombat) return j >= 0;
  let hit = false;
  forEachNear(s, s.x[i], s.z[i], reach, q => {
    if (s.alive[q] && s.side[q] !== s.side[i] && !units[s.side[q]][s.type[q]].noncombat && (s.x[q] - s.x[i]) ** 2 + (s.z[q] - s.z[i]) ** 2 <= reach * reach) { hit = true; return false; }
  });
  return hit;
}

// 과녁 자리 { x, z } 또는 null.
function aimAt(w, i, u) {
  const s = w.soldiers, C = w.rules.catapult, side = s.side[i], x = s.x[i], z = s.z[i];
  const cands = [];                                                 // 보이는 적 병사
  const r2 = u.range * u.range, m2 = u.minRange * u.minRange;
  forEachNear(s, x, z, u.range, j => {
    if (!s.alive[j] || s.side[j] === side) return;
    const d2 = (s.x[j] - x) ** 2 + (s.z[j] - z) ** 2;
    if (d2 > r2 || d2 < m2 || !canSee(w, side, s.x[j], s.z[j])) return;
    cands.push(j);
  });
  if (!cands.length) return buildingAim(w, i, u);                  // 병사 과녁이 없으면 보이는 적 건물(3단계)
  const stride = Math.max(1, Math.ceil(cands.length / C.aimSample)), a2 = C.aimRadius * C.aimRadius;
  let top = -1, tn = -1;
  for (let n = 0; n < cands.length; n += stride) {
    const j = cands[n];
    let c = 0;
    forEachNear(s, s.x[j], s.z[j], C.aimRadius, q => { if (s.alive[q] && s.side[q] !== side && (s.x[q] - s.x[j]) ** 2 + (s.z[q] - s.z[j]) ** 2 <= a2) c++; });
    if (c > tn) { tn = c; top = j; }
  }
  return { x: s.x[top], z: s.z[top] };
}

// 사거리(minRange ~ range + 건물 반지름) 안 보이는 적 건물 가운데 가장 가까운 것의 가운데, 없으면 null.
function buildingAim(w, i, u) {
  const s = w.soldiers, side = s.side[i];
  let best = null, bd = Infinity;
  for (const b of w.buildings) {
    if (!b.alive || b.side === side || b.side > 1) continue;
    const d = Math.hypot(b.x - s.x[i], b.z - s.z[i]);
    if (d < u.minRange || d > u.range + b.r || d >= bd || !canSee(w, side, b.x, b.z)) continue;
    bd = d; best = { x: b.x, z: b.z };
  }
  return best;
}

function land(w, b) {
  const s = w.soldiers, C = w.rules.catapult;
  const near = [], R2 = C.splash * C.splash;                        // 병사: 둘레 splash m의 가까운 적 splashMax명
  forEachNear(s, b.x1, b.z1, C.splash, j => {
    if (!s.alive[j] || s.side[j] === b.side) return;
    const d2 = (s.x[j] - b.x1) ** 2 + (s.z[j] - b.z1) ** 2;
    if (d2 <= R2) near.push([d2, j]);
  });
  near.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const [, j] of near.slice(0, C.splashMax)) {
    const from = Math.atan2(b.z0 - s.z[j], b.x0 - s.x[j]);         // 돌이 날아온 쪽(옆·뒤·방패)
    const ang = Math.abs(((from - s.facing[j]) * 180 / Math.PI + 540) % 360 - 180);
    s.hp[j] -= C.soldierHit * damageMult({ atkSide: b.side, atkType: SIEGE, tgtSide: s.side[j], tgtType: s.type[j], angleDeg: ang, guardDeg: ang, ranged: true, tgtElite: s.elite[j] === 1 }, w.rules);
    if (s.hp[j] <= 0) killSoldier(w, j);
  }
  for (const bd of [...w.buildings]) if (bd.alive && bd.side !== b.side && bd.side < 2 && Math.hypot(bd.x - b.x1, bd.z - b.z1) <= bd.r + C.splash) damageBuilding(w, bd, C.buildingHit);   // 적 건물(3단계)
  w.events.push({ kind: 'boulderLand', side: b.side, x: b.x1, z: b.z1, wall: false });
}
