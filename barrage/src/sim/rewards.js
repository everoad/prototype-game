// 보상(§4.4.2, §4.6, §4.7): 반격 기회(과열 사격 + 보스 경직), 완전 패링 반격(자동: 붙기 → 일제 사격 → 뒤로 튀기), 회복 변형.
import { emit } from './events.js';
import { clampToBoard } from './geom.js';
import { damageBoss, addStagger, separateBodies } from './boss.js';

const stun = (w, sec) => { w.boss.stunUntil = Math.max(w.boss.stunUntil ?? -1, w.time + sec); };

// 금 탄 패링 · 빨강 아슬아슬 회피 · 근접 금 마무리 패링(콤보를 다 받지 못했을 때).
export function openCounterChance(w, src) {
  const C = w.rules.counter;
  w.player.overdriveUntil = w.time + C.overdrive;
  stun(w, C.bossStun);
  emit(w, 'counterChance', { src });
}

// 회복 변형(?heal=1)에서만: 완벽 패링·완전 패링 반격.
export function healOn(w) {
  if (!w.opts.heal) return;
  const p = w.player, before = p.hp;
  p.hp = Math.min(w.rules.player.hp, p.hp + w.rules.heal.amount);
  if (p.hp > before) emit(w, 'heal', { amount: p.hp - before });
}

export const autoActive = w => !!w.player.auto && w.time < w.player.autoUntil;

// 콤보 마지막 타에서 다 받아냈으면. 보스는 곧바로 경직(새 탄 없음).
export function startFullCounter(w) {
  const F = w.rules.fullCounter, p = w.player, b = w.boss;
  const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz) || 1;
  p.auto = { stage: 'in', start: w.time, fromX: p.x, fromZ: p.z, toX: b.x + dx / d * F.standOff, toZ: b.z + dz / d * F.standOff, buffered: null };
  p.autoUntil = w.time + F.dashIn + F.volley + F.back;
  stun(w, F.dashIn + F.volley + F.back);
  emit(w, 'fullCounter', { stage: 'in', x: p.x, z: p.z });
}

// 자동 반격 한 틱(플레이어 이동은 sim이 한다). 누른 패링·회피는 마지막 하나를 기억했다가 끝나는 틱에 낸다.
export function stepAuto(w, input) {
  const F = w.rules.fullCounter, R = w.rules, p = w.player, b = w.boss, a = p.auto;
  if (input.parry) a.buffered = 'parry';
  if (input.dodge) a.buffered = 'dodge';
  const t = w.time + R.dt - a.start;
  if (a.stage === 'in') {
    const u = Math.min(1, t / F.dashIn);
    [p.x, p.z] = clampToBoard(R, a.fromX + (a.toX - a.fromX) * u, a.fromZ + (a.toZ - a.fromZ) * u, R.player.bodyR);
    separateBodies(w);
    if (t >= F.dashIn - 1e-9) {
      a.stage = 'volley';
      emit(w, 'fullCounter', { stage: 'volley', x: p.x, z: p.z });
      damageBoss(w, F.dmg, 'counter');
      addStagger(w, F.stagger);
      stun(w, w.rules.counter.bossStun + F.volley + F.back);
      healOn(w);
    }
  } else if (a.stage === 'volley') {
    if (t >= F.dashIn + F.volley - 1e-9) {
      a.stage = 'back';
      a.awayBase = Math.atan2(p.z - b.z, p.x - b.x);   // 기준은 튀기 시작할 때 한 번 — 매 틱 다시 재면 보스 둘레를 돈다
      emit(w, 'fullCounter', { stage: 'back', x: p.x, z: p.z });
    }
  } else {
    // 뒤로 튀기: 보스 반대쪽 기준, 이동 키로 ±steerDeg까지 틀기. 난간·보스 몸에서 미끄러진다.
    let away = a.awayBase;
    const mx = input.mx || 0, mz = input.mz || 0;
    if (mx !== 0 || mz !== 0) {
      let diff = Math.atan2(mz, mx) - away;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const lim = F.steerDeg * Math.PI / 180;
      away += Math.max(-lim, Math.min(lim, diff));
    }
    const k = F.backDist / F.back * R.dt;
    [p.x, p.z] = clampToBoard(R, p.x + Math.cos(away) * k, p.z + Math.sin(away) * k, R.player.bodyR);
    separateBodies(w);
  }
  // 끝나는 틱: 기억한 누름을 미리 받기에 넣어 다음 틱에 나가게
  if (w.time + R.dt >= p.autoUntil - 1e-9) {
    if (a.buffered === 'parry') p.buffer.parryUntil = w.time + R.dt + R.player.buffer;
    if (a.buffered === 'dodge') p.buffer.dodgeUntil = w.time + R.dt + R.player.buffer;
    p.auto = null;
  }
}
