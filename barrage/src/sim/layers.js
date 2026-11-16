// 두 겹 탄막의 아래 겹(§5.4): 바탕 고리(1·2단계) + 느린 나선(2단계), 2단계 쌍둥이 구슬. 모두 보통 탄 — 받아칠 것은 주 패턴에만.
// 근접 콤보(1:1)·멈춤·그로기·단계 넘어감·깨어남(과 그 뒤 숨)·뛰기 동안은 쉰다. 연습 장면·ai 끔에는 없다.
import { K } from './rules.js';
import { emit } from './events.js';
import { spawnBullet } from './bullets.js';
import { bossGroggy } from './boss.js';

const QUIET = new Set(['stun', 'groggy', 'phaseChange', 'dead', 'rush', 'melee', 'wake', 'hop']);
export function layersOn(w) {
  const b = w.boss;
  return !!w.opts.ai && !w.opts.lab && !b.dead && !w.result && !QUIET.has(b.state) && !bossGroggy(w) && w.time >= (b.stunUntil ?? -1) && w.time >= (b.calmUntil ?? -1);
}

function fire(w, src, x, z, a, speed) {
  const id = spawnBullet(w, K.NORMAL, x, z, a, speed, src);
  if (id >= 0) emit(w, 'fire', { kind: K.NORMAL, x, z, id, src });
}

export function updateLayers(w) {
  const b = w.boss, L = w.rules.layers, S = w.rules.src, m = w.rules.patterns.muzzle;
  const St = L.start, half = L.orbs.every / 2;
  b.layer ??= { nextRing: w.time + St.ring, ringA: 0, nextSpiral: 0, spiralA: 0, orbA: 0, nextOrb: [w.time + St.orb, w.time + St.orb + half] };
  const Ly = b.layer;
  // 구슬 자리는 2단계 내내(쉴 때도) 보스를 따라 돈다 — 화면이 그린다
  if (b.phase === 2) {
    Ly.orbA += L.orbs.spin * w.rules.dt;
    b.orbs ??= [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    for (let k = 0; k < 2; k++) { const a = Ly.orbA + k * Math.PI; b.orbs[k].x = b.x + Math.cos(a) * L.orbs.r; b.orbs[k].z = b.z + Math.sin(a) * L.orbs.r; }
  } else b.orbs = null;
  if (!layersOn(w)) {
    const t = w.time + L.resume;
    Ly.nextRing = Math.max(Ly.nextRing, t); Ly.nextSpiral = Math.max(Ly.nextSpiral, t);
    Ly.nextOrb[0] = Math.max(Ly.nextOrb[0], t); Ly.nextOrb[1] = Math.max(Ly.nextOrb[1], t + half);
    return;
  }
  const P = b.phase === 2 ? L.bg2 : L.bg1;
  if (w.time >= Ly.nextRing) {
    Ly.nextRing = w.time + P.every; Ly.ringA += Math.PI / P.n;
    for (let i = 0; i < P.n; i++) { const a = Ly.ringA + i * 2 * Math.PI / P.n; fire(w, S.background, b.x + Math.cos(a) * m, b.z + Math.sin(a) * m, a, P.speed); }
  }
  if (b.phase === 2) {
    if (w.time >= Ly.nextSpiral) {
      Ly.nextSpiral = w.time + P.spiralEvery; Ly.spiralA += P.spiralStepDeg * Math.PI / 180;
      fire(w, S.background, b.x + Math.cos(Ly.spiralA) * m, b.z + Math.sin(Ly.spiralA) * m, Ly.spiralA, P.spiralSpeed);
    }
    for (let k = 0; k < 2; k++) {
      if (w.time < Ly.nextOrb[k]) continue;
      Ly.nextOrb[k] = w.time + L.orbs.every;
      Ly.nextOrb[1 - k] = Math.max(Ly.nextOrb[1 - k], w.time + half);
      const o = b.orbs[k], a = Math.atan2(w.player.z - o.z, w.player.x - o.x);
      fire(w, S.orbs, o.x, o.z, a, L.orbs.speed);
      emit(w, 'orbFire', { x: o.x, z: o.z, k });
    }
  }
}
