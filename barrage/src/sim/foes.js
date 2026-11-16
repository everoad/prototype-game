// 적 목록(스테이지 설계 §7): 쏘기·무기·되튄 탄·던진 탄이 "보스 하나" 대신 이 목록을 겨누고 맞힌다.
// 보스전·보스 방에서는 목록 = 보스 하나(동작·수치가 예전과 같다 — 고정 해시 시험), 일반 방(boss.away)에서는 살아 있고 등장한 몬스터들.
// w.aim = 플레이어에게 가장 가까운 적(틱 처음에 한 번, 없으면 null). 보스전에서는 늘 보스(죽었어도 — 부르는 쪽이 dead를 본다).
import { emit } from './events.js';
import { segCircle } from './geom.js';
import { damageBoss } from './boss.js';
import { addDamage } from './stats.js';

export const isAway = w => !!w.boss.away;
export const foeR = (w, f) => f.r ?? w.rules.boss.r;

// 틱 처음에 한 번: 적 목록과 겨눌 적
export function refreshFoes(w) {
  if (!isAway(w)) { w.foeList = w.bossOnly ??= [w.boss]; w.aim = w.boss; return; }
  const p = w.player, list = w.foeList === w.bossOnly || !w.foeList ? [] : w.foeList;
  list.length = 0;
  let best = null, bd = Infinity;
  for (const e of w.enemies) {
    if (e.dead || w.time < e.bornAt) continue;
    list.push(e);
    const d = (e.x - p.x) * (e.x - p.x) + (e.z - p.z) * (e.z - p.z);
    if (d < bd) { bd = d; best = e; }
  }
  w.foeList = list; w.aim = best;
}

// 선분(x0,z0)→(x1,z1)에 처음 닿는 살아 있는 적(pad = 탄 반지름). 없으면 null.
export function hitFoe(w, x0, z0, x1, z1, pad = 0) {
  let best = null, bd = Infinity;
  for (const f of w.foeList) {
    if (f.dead) continue;
    if (!segCircle(x0, z0, x1, z1, f.x, f.z, foeR(w, f) + pad)) continue;
    const d = (f.x - x0) * (f.x - x0) + (f.z - z0) * (f.z - z0);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// 적 하나에게 피해. 보스면 damageBoss(과열·그로기 배율, raw = 그대로), 몬스터면 체력을 깎고 0이면 죽는다.
// from = 탄이 온 자리(방패병의 방패 판정), pierce = 받아친 탄(방패를 뚫는다). 준 피해를 돌려준다(막혔으면 0).
export function hurtFoe(w, f, amount, src, { raw = false, pierce = false, fromX = null, fromZ = null } = {}) {
  if (f === w.boss) {
    const bub = w.tries && w.tries.bubble && w.tries.bubble.on ? w.tries.bubble : null;   // 보호막(실험): 던진 탄만 통하고, 던진 탄 hits발이면 깨진다
    if (bub && src !== 'throw') { emit(w, 'mobBlock', { id: 0, x: f.x, z: f.z }); return 0; }
    if (bub && --bub.hp <= 0) { bub.on = false; bub.nextAt = w.time + w.rules.tries.bubble.every; emit(w, 'bubbleBreak', { x: f.x, z: f.z }); }
    return damageBoss(w, amount, src, raw);
  }
  if (f.dead || w.time < f.bornAt || w.player.dyingAt != null) return 0;   // 구제 창(체력 0) 동안엔 방을 깰 수 없다(보스와 같다)
  if (!pierce && fromX != null && (shielded(w, f, fromX, fromZ) || warded(w, f))) { emit(w, 'mobBlock', { id: f.id, x: f.x, z: f.z }); return 0; }
  const dealt = Math.min(f.hp, amount);
  f.hp -= dealt;
  addDamage(w.stats, src, dealt);
  if (f.hp <= 1e-9) { f.hp = 0; f.dead = true; f.diedAt = w.time; emit(w, 'mobDeath', { id: f.id, kind: f.kind, x: f.x, z: f.z }); }
  else emit(w, 'mobHit', { id: f.id, x: f.x, z: f.z });
  return dealt;
}

// 방패병: 보는 쪽 ± arcDeg 안에서 온 것은 방패가 막는다
export function shielded(w, f, fromX, fromZ) {
  if (f.kind !== 'shield') return false;
  const a = Math.atan2(fromZ - f.z, fromX - f.x), d = Math.atan2(Math.sin(a - f.face), Math.cos(a - f.face));
  return Math.abs(d) <= w.rules.mobs.shield.arcDeg * Math.PI / 180;
}

// 보호탑(실험 스테이지): 살아 있는 탑의 둘레 aura 안 몬스터는 평타·무기에 다치지 않는다(탑 자신은 다친다)
export function warded(w, f) {
  if (f.kind === 'totem') return false;
  const A = w.rules.mobs.totem.aura;
  for (const t of w.enemies) if (t.kind === 'totem' && !t.dead && w.time >= t.bornAt && Math.hypot(t.x - f.x, t.z - f.z) <= A) return true;
  return false;
}

// 몬스터 하나를 판에 놓는다(delay초 뒤 등장 — 그동안은 자리 표시만, 겨누지도 맞지도 않는다)
export function spawnMob(w, kind, x, z, delay = w.rules.mobs.appear) {
  const M = w.rules.mobs[kind];
  // 첫 공격은 등장 뒤 제각각(같은 종류가 한 박자에 쏘면 패링 한 번에 다 받힌다)
  const hp = M.hp * (w.tries && w.tries.on.always ? w.rules.tries.always.mobHp : 1);   // 늘 나가는 무기(실험): 무기가 늘 깎는 만큼 더 버틴다
  const m = { id: w.mobSeq = (w.mobSeq ?? 0) + 1, kind, x, z, px: x, pz: z, r: M.r, hp, maxHp: hp, atkN: 0, face: Math.atan2(w.player.z - z, w.player.x - x), dead: false, bornAt: w.time + delay, state: 'idle', stateAt: w.time + delay, nextAt: w.time + delay + (kind === 'bomber' || kind === 'totem' ? 0 : w.rules.mobs.first * w.rng.next()) };
  w.enemies.push(m);
  emit(w, 'mobSpawn', { id: m.id, kind, x, z, delay });
  return m;
}
