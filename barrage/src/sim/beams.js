// 쓸어내는 레이저(§5.4 패턴 8, 빨강 = 회피만): 조준선(발사 lockBefore 전까지 플레이어를 따라옴) → 빔이 한쪽으로 sweepDeg를 sweepSec에 쓴다.
// 빔 = 보스 자리에서 판 끝까지 선분. 판정 점이 빔 폭 안이면 맞음, 구르기 무적이면 아슬아슬(새 빨강이면 반격 기회).
import { K } from './rules.js';
import { emit } from './events.js';
import { hurtPlayer, dodgeOverlap, isInvuln } from './player.js';
import { openCounterChance } from './rewards.js';
import { headAim } from './dragonBody.js';

// 빔이 나오는 곳: 용이면 입, 아니면 보스 몸 가운데
const origin = b => (b.mouth ? [b.mouth.x, b.mouth.z] : [b.x, b.z]);

export function startLaser(w, run) {
  const L = w.rules.laser, b = w.boss, [ox, oz] = origin(b);
  const a = headAim(w, ox, oz);
  const beam = { x: ox, z: oz, angle: a, base: a, dir: w.rng.next() < 0.5 ? -1 : 1, born: w.time, fireAt: w.time + L.aim, endAt: w.time + L.aim + L.sweepSec, run: run?.id ?? 8, fired: false, len: 0 };
  w.beams.push(beam);
  emit(w, 'laserAim', { x: b.x, z: b.z, angle: a, dir: beam.dir });
  return beam;
}

// (x, z)에서 angle 쪽으로 판 끝까지 거리
export function reach(board, x, z, a) {
  const dx = Math.cos(a), dz = Math.sin(a);
  let t = 60;
  if (dx > 1e-9) t = Math.min(t, (board.hx - x) / dx); else if (dx < -1e-9) t = Math.min(t, (-board.hx - x) / dx);
  if (dz > 1e-9) t = Math.min(t, (board.hz - z) / dz); else if (dz < -1e-9) t = Math.min(t, (-board.hz - z) / dz);
  return Math.max(0, t);
}

export function updateBeams(w) {
  const L = w.rules.laser, b = w.boss, p = w.player, R = w.rules;
  for (let k = w.beams.length - 1; k >= 0; k--) {
    const m = w.beams[k];
    [m.x, m.z] = origin(b);   // 빔은 보스 몸(용이면 입)에서 나온다(보스는 쏘며 움직인다)
    if (w.time < m.fireAt - L.lockBefore) { m.base = headAim(w, m.x, m.z); m.angle = m.base; }
    if (w.time >= m.fireAt && !m.fired) { m.fired = true; emit(w, 'laserFire', { x: m.x, z: m.z, angle: m.base, dir: m.dir }); }
    if (w.time >= m.fireAt) {
      const u = Math.min(1, (w.time - m.fireAt) / L.sweepSec);
      m.angle = m.base + m.dir * L.sweepDeg * Math.PI / 180 * u;
    }
    m.len = reach(R.board, m.x, m.z, m.angle);
    if (m.fired && w.time < m.endAt) {
      const ux = Math.cos(m.angle), uz = Math.sin(m.angle);
      const t = Math.max(0, Math.min(m.len, (p.x - m.x) * ux + (p.z - m.z) * uz));
      const d = Math.hypot(p.x - (m.x + ux * t), p.z - (m.z + uz * t));
      if (d <= L.width / 2 + R.player.hitR) {
        if (isInvuln(w)) { if (dodgeOverlap(w, K.RED)) openCounterChance(w, 'redDodge'); }
        else hurtPlayer(w, L.dmg, R.src.laser, p.x, p.z);
      }
    }
    if (w.time >= m.endAt) { w.beams.splice(k, 1); emit(w, 'laserEnd'); }
  }
}

// 끊기(멈춤·그로기·단계): 쏘던 빔이 있었으면 laserCut(화면이 지글 소리를 멈춘다)
export function clearBeams(w) {
  if (w.beams.some(m => m.fired && w.time < m.endAt)) emit(w, 'laserCut');
  w.beams.length = 0;
}
