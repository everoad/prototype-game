// 플레이어 자동 사격(§4.3): 늘 보스 가운데로, 5발 부채(±12°), 초당 12번. 가까울수록 많이 맞는다.
import { emit } from './events.js';
import { segCircle } from './geom.js';
import { damageBoss } from './boss.js';
import { isDodging } from './player.js';

export function createShots(cap) {
  const f = () => new Float64Array(cap);
  return { cap, next: 0, x: f(), z: f(), px: f(), pz: f(), vx: f(), vz: f(), left: f(), alive: new Uint8Array(cap), nextAt: 0 };
}

export function fireShots(w) {
  const s = w.shots, p = w.player, b = w.boss, S = w.rules.shots;
  if (w.result || b.dead || w.execute) return;   // 처형 중엔 처형의 붙어 쏘기만
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
  const s = w.shots, b = w.boss, dt = w.rules.dt, S = w.rules.shots, R = w.rules.boss.r;
  for (let i = 0; i < s.cap; i++) {
    if (!s.alive[i]) continue;
    s.px[i] = s.x[i]; s.pz[i] = s.z[i];
    s.x[i] += s.vx[i] * dt; s.z[i] += s.vz[i] * dt; s.left[i] -= S.speed * dt;
    if (!b.dead && segCircle(s.px[i], s.pz[i], s.x[i], s.z[i], b.x, b.z, R)) {
      s.alive[i] = 0;
      w.stats.shotsHit++;
      damageBoss(w, S.dmg, 'shot');
      emit(w, 'bossHit', { x: s.x[i], z: s.z[i] });
      continue;
    }
    if (s.left[i] <= 0) s.alive[i] = 0;
  }
}
