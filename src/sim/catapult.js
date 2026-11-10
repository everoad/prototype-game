// 투석기(설계서 2026-11-09-flood-catapult-design.md §2): reload초에 한 발, 돌은 flight초 날아 떨어진 자리에 피해를 준다.
// 과녁: ① 사거리 안 적 거점(가운데 구역 = 반지름의 절반)의 성벽 → 건물, ② 아니면 보이는 적 병사 가운데 둘레 aimRadius m에 적이 가장 많은 자리.
// minRange 안은 못 쏘고, 근접 적이 닿아 있으면 쏘지 않는다. 돌이 떨어질 때 다시 본다 — 그 사이 과녁 거점이 우리 것이 됐으면 치지 않고, 비킨 병사는 안 맞는다.
import { STATE, forEachNear } from './soldiers.js';
import { SIEGE } from './rules.js';
import { isPoint } from './map.js';
import { canSee } from './vision.js';
import { buildingTarget } from './production.js';
import { damageMult, killSoldier, nearestEnemy } from './combat.js';

const RESULT_IDLE = 60;   // 산 투석기 무리가 마지막으로 쏜 뒤 이만큼 지나면 결과 알림(개발용)

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
    if (s.vx[i] * s.vx[i] + s.vz[i] * s.vz[i] > C.still * C.still || nearestEnemy(s, i, r.melee.reach) >= 0) continue;   // 걸으면서 쏘지 않는다(사용자 2026-11-08), 근접 적이 닿아 있으면 못 쏜다
    const aim = aimAt(w, i, u);
    if (!aim) { s.aimNext[i] = w.time + C.retry; continue; }        // 과녁이 없으면 retry초 뒤에 다시 본다(사거리 100 m 훑기가 틱마다 돌지 않게)
    s.fireAt[i] = w.time;
    s.facing[i] = Math.atan2(aim.z - s.z[i], aim.x - s.x[i]);   // 과녁 쪽을 본다(화면·옆뒤 판정)
    const batch = w.catapultBatches.find(B => B.ids.some((id, n) => id === i && B.serials[n] === s.serial[i])) ?? null;
    if (batch) batch.lastShot = w.time;
    w.boulders.push({ side: s.side[i], x0: s.x[i], z0: s.z[i], x1: aim.x, z1: aim.z, t0: w.time, t1: w.time + C.flight, from: i, fromSerial: s.serial[i], stronghold: aim.st?.id ?? null, batch });
    w.events.push({ kind: 'boulderFire', side: s.side[i], from: i, x: aim.x, z: aim.z });
  }
  for (let k = w.catapultBatches.length - 1; k >= 0; k--) {        // 산 무리의 결과(개발용 알림)
    const B = w.catapultBatches[k];
    const alive = B.ids.some((id, n) => s.alive[id] && s.serial[id] === B.serials[n]);
    const idle = B.lastShot > -1e9 && w.time - B.lastShot >= RESULT_IDLE;
    if (alive && !idle) continue;
    if (w.boulders.some(b => b.batch === B)) continue;              // 날고 있는 돌이 떨어진 뒤에
    w.catapultBatches.splice(k, 1);
    w.notices.push({ side: B.side, kind: 'castResult', order: 'catapult', count: B.ids.length, wall: B.wall, buildings: B.buildings, kills: B.kills, at: w.time });
  }
}

// 과녁 자리 { x, z, st? } 또는 null.
function aimAt(w, i, u) {
  const s = w.soldiers, C = w.rules.catapult, side = s.side[i], x = s.x[i], z = s.z[i];
  let best = null, bd = Infinity;
  for (const st of w.strongholds) {                                 // ① 적 거점
    if (st.owner === null || st.owner === side || isPoint(st)) continue;
    const d = Math.hypot(st.x - x, st.z - z);
    if (d > st.radius * 0.5 + u.range || d < u.minRange || d >= bd || !buildingTarget(st)) continue;
    bd = d; best = { x: st.x, z: st.z, st };
  }
  if (best) return best;
  const cands = [];                                                 // ② 보이는 적 병사
  const r2 = u.range * u.range, m2 = u.minRange * u.minRange;
  forEachNear(s, x, z, u.range, j => {
    if (!s.alive[j] || s.side[j] === side) return;
    const d2 = (s.x[j] - x) ** 2 + (s.z[j] - z) ** 2;
    if (d2 > r2 || d2 < m2 || !canSee(w, side, s.x[j], s.z[j])) return;
    cands.push(j);
  });
  if (!cands.length) return null;
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

function land(w, b) {
  const s = w.soldiers, C = w.rules.catapult;
  if (b.stronghold) {                                               // 거점: 그때도 쏜 편의 적이고 칠 건물이 있을 때만
    const st = w.strongholds.find(x => x.id === b.stronghold), bt = st && st.owner !== null && st.owner !== b.side ? buildingTarget(st) : null;
    let wall = false;
    if (bt) {
      st.hitAt = w.time;                                            // 경보 '공격받음'
      let done;                                                     // 실제로 깎은 체력(남은 것보다 많이 세지 않는다)
      if (bt.wall === 'hq') {
        wall = true;
        done = Math.min(C.buildingHit, st.wallHp);
        st.wallHp = Math.max(0, st.wallHp - C.buildingHit);
        if (st.wallHp === 0) w.events.push({ kind: 'wallDown', stronghold: st.id });
      } else {
        const slot = st.slots[bt.slot];
        wall = slot.kind === 'wall';
        done = Math.min(C.buildingHit, Math.max(0, slot.hp));
        slot.hp -= C.buildingHit;
        if (slot.hp <= 0) w.burnBuilding(st, bt.slot);
      }
      if (b.batch) { if (wall) b.batch.wall += done; else b.batch.buildings += done; }
    }
    w.events.push({ kind: 'boulderLand', side: b.side, x: b.x1, z: b.z1, wall });
    return;
  }
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
    if (w.stats) w.stats.lastHit[j] = b.side * 4 + SIEGE + 8;      // 지표: 누가 쓰러뜨렸나(combat.js note와 같은 꼴)
    if (s.hp[j] <= 0) { killSoldier(w, j); if (b.batch) b.batch.kills++; }
  }
  w.events.push({ kind: 'boulderLand', side: b.side, x: b.x1, z: b.z1, wall: false });
}
