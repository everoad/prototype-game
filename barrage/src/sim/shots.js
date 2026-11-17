// 플레이어 자동 사격(§4.3): 늘 겨눈 적(보스, 일반 방에선 가장 가까운 몬스터 — foes.js) 가운데로, 5발 부채(±12°), 초당 12번. 가까울수록 많이 맞는다.
import { emit } from './events.js';
import { hitFoe, hurtFoe } from './foes.js';
import { isDodging } from './player.js';
import { isSword } from './sword.js';

export function createShots(cap) {
  const f = () => new Float64Array(cap);
  return { cap, next: 0, x: f(), z: f(), px: f(), pz: f(), vx: f(), vz: f(), left: f(), alive: new Uint8Array(cap), nextAt: 0 };
}

export function fireShots(w) {
  const s = w.shots, p = w.player, b = w.aim, S = w.rules.shots;
  if (w.result || !b || b.dead || w.execute || isSword(w)) return;   // 검사는 쏘지 않는다 — 기본 공격은 칼바람(sword.js)   // 처형 중엔 처형의 붙어 쏘기만. 겨눌 적이 없으면 쏘지 않는다
  if (isDodging(w)) { s.nextAt = Math.max(s.nextAt, w.time); return; }
  if (w.time + 1e-9 < s.nextAt) return;
  s.nextAt = Math.max(s.nextAt + 1 / S.rate, w.time + 1 / S.rate - 1e-9);
  const aim = Math.atan2(b.z - p.z, b.x - p.x), step = S.spreadDeg / ((S.pellets - 1) / 2) * Math.PI / 180;
  for (let k = 0; k < S.pellets; k++) {
    const a = aim + (k - (S.pellets - 1) / 2) * step;
    const i = s.next; s.next = (s.next + 1) % s.cap;   // 고리 버퍼: 사거리 16 U / 30 U/s ≈ 0.53초 < 160발 몫
    s.x[i] = s.px[i] = p.x; s.z[i] = s.pz[i] = p.z;
    s.vx[i] = Math.cos(a) * S.speed; s.vz[i] = Math.sin(a) * S.speed;
    s.left[i] = S.range; s.alive[i] = 1;
  }
  w.stats.shotsFired += S.pellets;
  emit(w, 'shoot', { x: p.x, z: p.z, angle: aim });
}

export function moveShots(w) {
  const s = w.shots, dt = w.rules.dt, S = w.rules.shots;
  for (let i = 0; i < s.cap; i++) {
    if (!s.alive[i]) continue;
    s.px[i] = s.x[i]; s.pz[i] = s.z[i];
    s.x[i] += s.vx[i] * dt; s.z[i] += s.vz[i] * dt; s.left[i] -= S.speed * dt;
    const f = hitFoe(w, s.px[i], s.pz[i], s.x[i], s.z[i]);
    if (f) {
      s.alive[i] = 0;
      w.stats.shotsHit++;
      hurtFoe(w, f, S.dmg * (w.tries ? w.tries.shotMul * w.tries.shotBase : 1), 'shot', { fromX: s.px[i], fromZ: s.pz[i] });   // 집중 사격·늘 나가는 무기(실험)
      if (f === w.boss) emit(w, 'bossHit', { x: s.x[i], z: s.z[i] });   // 몬스터는 hurtFoe가 mobHit을 낸다
      continue;
    }
    if (s.left[i] <= 0) s.alive[i] = 0;
  }
}
