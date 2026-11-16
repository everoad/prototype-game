// 패링(§4.4): 누르면 0.25초 창(앞 0.12초 = 완벽). 창 동안 패링 원에 들어온 흰·금 탄은 몇 발이든 되튄 탄이 된다.
// 받은 탄은 그 자리에 0.06초 멈췄다가 보스로 날아간다 — sim은 화면을 멈추지 않는다. 보통·빨간 탄은 패링과 무관하게 맞는다.
import { K } from './rules.js';
import { emit } from './events.js';
import { segCircle } from './geom.js';
import { isDodging } from './player.js';
import { killBullet } from './bullets.js';
import { damageBoss, addStagger } from './boss.js';
import { openCounterChance, healOn } from './rewards.js';

export const parryActive = w => { const q = w.player.parry; return q.active && w.time < q.startedAt + w.rules.parry.window; };
export const parryAge = w => w.time - w.player.parry.startedAt;

// 누름: 되면 창을 열고 parryStart(받든 못 받든). 못 쓰는 순간(경직·회피·자동 반격·창이 열려 있음)이면 0.1초 기억 + denied.
export function tryParry(w, input) {
  const p = w.player, q = p.parry, b = p.buffer, r = w.rules;
  if (input.parry) b.parryUntil = w.time + r.player.buffer;
  if (!(w.time <= b.parryUntil)) return false;
  const busy = isDodging(w) || w.time < q.failUntil || w.time < p.autoUntil || parryActive(w);
  if (busy) {
    if (input.parry) emit(w, 'denied', { what: 'parry', why: 'busy' });
    return false;
  }
  b.parryUntil = -1;
  q.startedAt = w.time; q.active = true; q.caught = 0;
  emit(w, 'parryStart', { x: p.x, z: p.z });
  return true;
}

// 창 동안 패링 원에 들어온 흰·금 탄 → 되튄 탄(그 자리에 멈춤).
export function catchBullets(w) {
  if (!parryActive(w)) return;
  const b = w.bullets, p = w.player, q = p.parry, R = w.rules;
  const perfect = parryAge(w) <= R.parry.perfect + 1e-9;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    const k = b.kind[i];
    if (k !== K.WHITE && k !== K.GOLD) continue;
    if (!segCircle(b.px[i], b.pz[i], b.x[i], b.z[i], p.x, p.z, R.player.parryR + b.r[i])) continue;
    const gold = k === K.GOLD;
    b.kind[i] = K.REFLECT; b.gold[i] = gold ? 1 : 0; b.perfect[i] = perfect ? 1 : 0;
    b.r[i] = R.bullets.r[K.REFLECT];
    b.holdUntil[i] = w.time + R.reflect.hold;
    b.vx[i] = 0; b.vz[i] = 0;
    q.caught++;
    w.stats.parries++; if (perfect) w.stats.perfects++;
    emit(w, 'parry', { kind: 'bullet', perfect, gold, first: q.caught === 1, chain: q.caught, x: b.x[i], z: b.z[i] });
    if (perfect) healOn(w);
    if (gold) openCounterChance(w, 'goldBullet');
  }
}

// 창이 끝났는데 받은 것이 없으면 0.25초 경직.
export function endParry(w) {
  const q = w.player.parry;
  if (!q.active || w.time < q.startedAt + w.rules.parry.window) return;
  q.active = false;
  if (q.caught === 0) {
    q.failUntil = w.time + w.rules.parry.failRecovery;
    emit(w, 'parryFail');
  }
}

// 되튄 탄이 보스 몸에 닿음: 피해 + 무력화(금 20 / 완벽 14 / 보통 8).
export function hitBossReflects(w) {
  const b = w.bullets, boss = w.boss, R = w.rules;
  if (boss.dead) return;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.kind[i] !== K.REFLECT || w.time < b.holdUntil[i]) continue;
    if (!segCircle(b.px[i], b.pz[i], b.x[i], b.z[i], boss.x, boss.z, R.boss.r + b.r[i])) continue;
    const perfect = !!b.perfect[i], gold = !!b.gold[i], x = b.x[i], z = b.z[i];
    killBullet(w, i);
    const dmg = perfect ? R.reflect.dmgPerfect : R.reflect.dmgNormal;
    emit(w, 'reflectHit', { x, z, perfect, gold, dmg });
    damageBoss(w, dmg, 'reflect');
    addStagger(w, gold ? R.reflect.staggerGold : perfect ? R.reflect.staggerPerfect : R.reflect.staggerNormal);
    if (boss.dead) return;
  }
}
