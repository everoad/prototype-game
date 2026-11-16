// 순간 돌진과 근접(§5.3). 돌진은 거리 좁히기(피해 없음) — 도착 순간 판의 적 탄을 모두 지워 근접 맞받기는 탄 없는 1:1.
// 근접 장판: 깔 때마다 그 타의 색으로 windup, 타격 순간 몸 원으로 판정 — 패링(흰·금) / 아슬아슬(빨강, 회피 무적) / 맞음.
// w.melee.taken = 이 콤보를 다 받아냈나(Task 8 완전 패링 반격이 읽는다).
import { emit } from './events.js';
import { clearBullets } from './bullets.js';
import { inSector, inCircle, clampToBoard } from './geom.js';
import { hurtPlayer, dodgeInvuln, dodgeOverlap } from './player.js';
import { parryActive, parryAge } from './parry.js';
import { addStagger, separateBodies } from './boss.js';
import { K } from './rules.js';
import { openCounterChance, startFullCounter, healOn } from './rewards.js';

const D = Math.PI / 180;
const COLOR_KIND = { white: K.WHITE, gold: K.GOLD, red: K.RED };

export function startRush(w, combo) {
  const R = w.rules;
  const first = R.combos[combo][0][1];
  w.melee.rush = { combo, start: w.time, phase: 'crouch', tx: w.player.x, tz: w.player.z, locked: false };
  emit(w, 'windup', { color: first, kind: 'rush' });
  emit(w, 'rushStart', { x: w.boss.x, z: w.boss.z, combo });
}

// 움츠림 → 고정 → 돌진 → 도착(true).
export function updateRush(w) {
  const m = w.melee, r = m.rush, R = w.rules, b = w.boss;
  if (!r) return true;
  const t = w.time - r.start;
  if (r.phase === 'crouch') {
    if (!r.locked && t < R.rush.crouch - R.rush.lockBefore) { r.tx = w.player.x; r.tz = w.player.z; }
    else r.locked = true;
    if (t < R.rush.crouch) return false;
    const dx = r.tx - b.x, dz = r.tz - b.z, d = Math.hypot(dx, dz) || 1;
    const stop = R.boss.r + R.player.bodyR + R.rush.gap;
    [r.sx, r.sz] = clampToBoard(R, r.tx - dx / d * stop, r.tz - dz / d * stop, R.boss.r);
    b.face = Math.atan2(dz, dx);
    r.phase = 'dash';
  }
  // 돌진: 한 틱에 speed·dt만큼, 길에 걸린 플레이어는 밀어낸다.
  const dx = r.sx - b.x, dz = r.sz - b.z, d = Math.hypot(dx, dz), stepLen = R.rush.speed * R.dt;
  if (d > stepLen) { b.x += dx / d * stepLen; b.z += dz / d * stepLen; separateBodies(w); return false; }
  b.x = r.sx; b.z = r.sz;
  separateBodies(w);
  m.rush = null;
  clearBullets(w, 0, 0, Infinity);
  emit(w, 'rushArrive', { x: b.x, z: b.z });
  return true;
}

export function startCombo(w, combo) {
  w.melee.combo = { name: combo, list: w.rules.combos[combo], i: -1, next: w.time, endAt: Infinity };
  w.melee.taken = true;
  w.melee.areas.length = 0;
}

function spawnArea(w, kind, color) {
  const M = w.rules.melee[kind], b = w.boss;
  const face = Math.atan2(w.player.z - b.z, w.player.x - b.x);
  b.face = face;
  const off = kind === 'slam' ? M.offset : 0;
  const area = { kind, shape: kind === 'slam' ? 'circle' : 'sector', x: b.x + Math.cos(face) * off, z: b.z + Math.sin(face) * off, face, R: M.R, half: (M.halfDeg ?? 180) * D, color, warn: M.warn, born: w.time, hit: false };
  w.melee.areas.push(area);
  emit(w, 'windup', { color, kind: 'melee', shape: area.shape });
  return area;
}

// 몸으로 받는 타격 하나의 판정(근접 콤보·검기·박치기·지면 파도가 같이 쓴다):
// 회피 무적 → 빨강이면 아슬아슬(roll, 새 빨강이면 newRed) / 패링 창 + 흰·금 → 패링(무력화, 완벽이면 회복) / 아니면 맞음.
// 금 패링의 반격 기회·완전 패링 반격은 부르는 쪽이 정한다(outcome으로).
export function resolveHit(w, { color, src, dmg, stagger, kindName = 'melee', last = false, x, z }) {
  const p = w.player, R = w.rules, kind = COLOR_KIND[color];
  if (dodgeInvuln(w)) {
    if (kind === K.RED) return { outcome: 'roll', newRed: dodgeOverlap(w, K.RED), kind };
    return { outcome: 'dodged', kind };
  }
  if (kind !== K.RED && parryActive(w)) {
    const perfect = parryAge(w) <= R.parry.perfect + 1e-9, gold = kind === K.GOLD;
    p.parry.caught++;
    w.stats.parries++; if (perfect) w.stats.perfects++;
    emit(w, 'parry', { kind: 'melee', perfect, gold, first: true, chain: 1, x: p.x, z: p.z, last, attack: kindName });
    addStagger(w, perfect ? stagger[1] : stagger[0]);
    if (perfect) healOn(w);
    return { outcome: perfect ? 'perfect' : 'parry', kind };
  }
  const hurt = hurtPlayer(w, dmg, src, x ?? w.boss.x, z ?? w.boss.z);
  return { outcome: hurt ? 'hurt' : 'immune', kind };   // immune = 맞은 뒤 무적·자동 반격 중이라 아무 일 없음
}

// 근접 콤보 타격 순간: 장판 안이면 resolveHit. 장판 밖이면 맞지 않지만 "다 받아냄"은 깨진다.
// 마지막 타에서 다 받아냈으면 완전 패링 반격, 아니면 금 마무리 패링·빨강 아슬아슬이 반격 기회를 연다.
function strike(w, a) {
  const p = w.player, R = w.rules, b = w.boss, c = w.melee.combo;
  const last = !!c && c.i === c.list.length - 1;
  a.hit = true;
  if (a.color === 'red') w.redHitAt = w.time;   // 빨간 예산이 실제 시각으로 센다(brain.settleRed)
  emit(w, 'meleeHit', { shape: a.shape, color: a.color, x: a.x, z: a.z });
  const inside = a.shape === 'circle' ? inCircle(p.x, p.z, R.player.bodyR, a.x, a.z, a.R) : inSector(p.x, p.z, R.player.bodyR, a.x, a.z, a.R, a.face, a.half);
  let res = { outcome: 'miss' };
  if (!inside) w.melee.taken = false;
  else {
    res = resolveHit(w, { color: a.color, src: R.src.combo, dmg: R.melee[a.kind].dmg, stagger: [R.melee.stagger.normal, R.melee.stagger.perfect], last });
    if (res.outcome === 'parry' || res.outcome === 'perfect') {
      // 보스를 플레이어 반대쪽으로 밀어낸다
      const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
      [b.x, b.z] = clampToBoard(R, b.x + dx / d * R.melee.push, b.z + dz / d * R.melee.push, R.boss.r);
    } else if (res.outcome !== 'roll') w.melee.taken = false;
  }
  const parried = res.outcome === 'parry' || res.outcome === 'perfect';
  if (last && w.melee.taken) startFullCounter(w);
  else if (parried && res.kind === K.GOLD) openCounterChance(w, 'goldMelee');
  else if (res.outcome === 'roll' && res.newRed) openCounterChance(w, 'redDodge');
}

// 콤보: 장판 → 예고 → 타격 → active 동안 남김 → recover → 다음 장판. 마지막 뒤 gapAfter(빈틈)가 끝나면 true.
export function updateCombo(w) {
  const m = w.melee, c = m.combo, M = w.rules.melee;
  if (!c) return true;
  for (const a of m.areas) if (!a.hit && w.time >= a.born + a.warn - 1e-9) {
    strike(w, a);
    c.next = w.time + M.active + M.recover;
    if (c.i === c.list.length - 1) { c.endAt = w.time + M.active + M.gapAfter; c.lastDone = true; }
  }
  for (let k = m.areas.length - 1; k >= 0; k--) { const a = m.areas[k]; if (a.hit && w.time >= a.born + a.warn + M.active) m.areas.splice(k, 1); }
  if (w.result) return true;
  if (!c.lastDone && w.time >= c.next - 1e-9 && m.areas.length === 0) {
    c.i++;
    const [kind, color] = c.list[c.i];
    spawnArea(w, kind, color);
    c.next = Infinity;
  }
  if (w.time >= c.endAt - 1e-9) { m.combo = null; return true; }
  return false;
}
