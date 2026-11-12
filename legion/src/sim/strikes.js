// 건물 피해(3단계 계획 Task 7): 적 건물 둘레의 한가한 병사가 건물을 친다 — 근접은 가장자리에서 reach m 안, 원거리는 사거리 안,
// 화력 × 배율(근접 melee·원거리 ranged). 광부·투석기(돌은 catapult.js)·달아나는 병사·이동 명령 중·행군 쐐기·적 병사와 맞닿았거나 노리는 병사는 치지 않는다.
// 병사 하나는 한 번에 건물 하나만. 중립(편 2)에는 건물이 없고 중립 괴물은 건물을 치지 않는다.
import { forEachNear, STATE, ORDER } from './soldiers.js';
import { rangeOf } from './combat.js';
import { removeBuilding, buildingName } from './buildings.js';

const RANGE_PAD = 20;   // 훑는 반지름 = 건물 반지름 + 가장 긴 사거리(장궁 55) 근처 + 여유 — 사거리는 병사마다 다시 본다

export function stepStrikes(w) {
  const D = w.rules.buildingDamage;
  if (!w.buildings.length || w.tick % D.every !== 0) return;
  const s = w.soldiers, units = w.rules.units, dt = D.every * w.rules.dt, reach = w.rules.melee.reach;
  const used = w._struck && w._struck.length >= s.capacity ? w._struck : (w._struck = new Uint8Array(s.capacity));
  used.fill(0, 0, s.count);
  for (const b of [...w.buildings]) {
    if (!b.alive) continue;
    let dmg = 0;
    forEachNear(s, b.x, b.z, b.r + 40 + RANGE_PAD, j => {
      const side = s.side[j];
      if (used[j] || !s.alive[j] || side > 1 || side === b.side) return;
      const u = units[side][s.type[j]];
      if (u.worker || u.catapult || u.dps <= 0 || s.state[j] === STATE.ROUT || s.state[j] === STATE.FLEE || s.order[j] === ORDER.MOVE || s.wedge[j] || s.inContact[j] || s.target[j] >= 0 || s.rtarget[j] >= 0) return;
      const ranged = u.range > reach * 2, d = Math.hypot(s.x[j] - b.x, s.z[j] - b.z);
      if (d > b.r + (ranged ? rangeOf(w, j) : D.reach)) return;
      used[j] = 1;
      dmg += u.dps * (ranged ? D.ranged : D.melee) * dt;
    });
    if (dmg > 0) damageBuilding(w, b, dmg);
  }
}

// 건물에 피해. 0 이하면 무너진다. 편 0 건물이면 알림(공격받음은 alertEvery초에 한 번).
export function damageBuilding(w, b, amount) {
  if (!b.alive || !(amount > 0)) return;
  b.hp -= amount;
  b.lastHit = w.time;
  const name = buildingName(b.def, b.side);
  if (b.side === 0 && !(w.time - (b.alertAt ?? -1e9) < w.rules.buildingDamage.alertEvery)) { b.alertAt = w.time; w.notices.push({ side: 0, kind: 'attacked', text: `${name}이(가) 공격받고 있다`, at: w.time, x: b.x, z: b.z }); }
  if (b.hp > 0) return;
  b.hp = 0;
  if (b.side === 0) w.notices.push({ side: 0, kind: 'collapse', text: `${name}이(가) 무너졌다`, at: w.time, x: b.x, z: b.z });
  removeBuilding(w, b);
}
