// 플레이어: 이동(가속·관성 없음, §4.2), 판 가두기, 맞음(경직·밀림 없음, §4.1), 회피(§4.5), 입력 미리 받기, 무적 판정.
import { clampToBoard } from './geom.js';
import { emit } from './events.js';
import { clearBullets } from './bullets.js';
import { K } from './rules.js';

export function createPlayer(rules) {
  const [x, z] = rules.start.player;
  return {
    x, z, px: x, pz: z, hp: rules.player.hp, face: 0, invulnUntil: -1, autoUntil: -1, overdriveUntil: 0,
    dodge: { startedAt: -1, until: -1, dirX: 0, dirZ: 0, fromX: x, fromZ: z, f: 0, charges: rules.dodge.charges, rechargeAt: [], near: false, nearRed: false },
    buffer: { parryUntil: -1, dodgeUntil: -1 },
    parry: { startedAt: -1, active: false, caught: 0, failUntil: -1 },
  };
}

// 회피 거리 비율: 앞 절반 시간에 front(0.7), 끝에 1. f(u) = (4·front − 1)·u − (4·front − 2)·u²
export function dodgeCurve(rules, u) {
  const a = 4 * rules.dodge.front;
  return (a - 1) * u - (a - 2) * u * u;
}

export const isDodging = w => w.time < w.player.dodge.until;
export const dodgeInvuln = w => { const d = w.player.dodge; return d.startedAt >= 0 && w.time < d.startedAt + w.rules.dodge.invuln; };

// 무적: 회피 무적 · 맞은 뒤 무적 · 자동 반격 중(Task 8이 autoUntil을 씀).
export function isInvuln(w) {
  const p = w.player;
  return w.time < p.invulnUntil || w.time < p.autoUntil || dodgeInvuln(w);
}

// 틱마다: 충전 돌려받기 → 회피 중이면 회피를 잇고(이동 입력 무시), 아니면 회피를 해 보고, 안 되면 걷는다.
export function updatePlayer(w, input) {
  const d = w.player.dodge;
  while (d.rechargeAt.length && w.time >= d.rechargeAt[0]) { d.rechargeAt.shift(); d.charges++; }
  // tryDodge는 회피 중이어도 부른다 — 누름을 기억하고(미리 받기) 잠김 신호(denied)를 내야 해서.
  if (tryDodge(w, input) || isDodging(w)) { stepDodge(w); return; }
  movePlayer(w, input);
}

// 누르면 그 틱부터 최고 속도, 떼면 그 틱에 선다. 대각선은 길이 1로 맞춘다.
export function movePlayer(w, input) {
  const p = w.player, r = w.rules;
  let mx = input.mx || 0, mz = input.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (mx === 0 && mz === 0) return;
  const step = r.player.speed * r.dt;
  [p.x, p.z] = clampToBoard(r, p.x + mx * step, p.z + mz * step, r.player.bodyR);
}

// 회피 시작. 못 쓰는 순간의 누름은 0.1초 기억하고, 누른 그 틱에 denied를 낸다(잠긴 누름에도 반응, §4.2).
export function tryDodge(w, input) {
  const p = w.player, b = p.buffer, d = p.dodge, r = w.rules;
  if (input.dodge) b.dodgeUntil = w.time + r.player.buffer;
  if (!(w.time <= b.dodgeUntil)) return false;
  const busy = isDodging(w) || w.time < p.autoUntil;
  if (busy || d.charges <= 0) {
    if (input.dodge) emit(w, 'denied', { what: 'dodge', why: busy ? 'busy' : 'charges' });
    return false;
  }
  b.dodgeUntil = -1;
  let dx = input.mx || 0, dz = input.mz || 0;
  if (dx === 0 && dz === 0) { dx = p.x - w.boss.x; dz = p.z - w.boss.z; }
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) { dx = -1; dz = 0; } else { dx /= len; dz /= len; }
  d.charges--; d.rechargeAt.push(w.time + r.dodge.recharge);
  Object.assign(d, { startedAt: w.time, until: w.time + r.dodge.dur, dirX: dx, dirZ: dz, fromX: p.x, fromZ: p.z, f: 0, near: false, nearRed: false });
  emit(w, 'dodge', { x: p.x, z: p.z, dirX: dx, dirZ: dz });
  return true;
}

// 곡선대로 이번 틱 몫만큼 간다(난간에서는 축마다 잘려 미끄러진다).
function stepDodge(w) {
  const p = w.player, d = p.dodge, r = w.rules;
  const u = Math.min(1, (w.time + r.dt - d.startedAt) / r.dodge.dur);
  const f = dodgeCurve(r, u), k = (f - d.f) * r.dodge.dist;
  d.f = f;
  [p.x, p.z] = clampToBoard(r, p.x + d.dirX * k, p.z + d.dirZ * k, r.player.bodyR);
}

// 회피 무적 중 판정 점에 탄이 겹침 = 아슬아슬(회피 한 번에 한 번, 빨간 탄이 뒤에 오면 red로 한 번 더).
export function dodgeOverlap(w, kind) {
  if (!dodgeInvuln(w)) return false;
  const d = w.player.dodge, red = kind === K.RED;
  if (d.near && (!red || d.nearRed)) return false;
  d.near = true; if (red) d.nearRed = true;
  emit(w, 'nearMiss', { red });
  return red;
}

// 맞음: 무적이면 무시. 체력 깎기, 무적 1초, 둘레 탄 지우기. 경직·밀림은 없다 — 다음 틱에도 입력대로 움직인다.
// src = 낸 패턴 번호 1~7, 근접 8. (bx, bz) = 맞힌 탄(또는 보스) 자리 — 화면이 0.3초 표시한다.
export function hurtPlayer(w, dmg, src, bx, bz) {
  if (isInvuln(w)) return false;
  const p = w.player, P = w.rules.player;
  p.hp = Math.max(w.opts.lab ? 1 : 0, p.hp - dmg);   // 장면에서는 1 밑으로 내려가지 않는다
  p.invulnUntil = w.time + P.hurtInvuln;
  w.stats.hits++;
  w.stats.hitsByPattern[src] = (w.stats.hitsByPattern[src] || 0) + 1;
  emit(w, 'hurt', { dmg, src, bx, bz });
  clearBullets(w, p.x, p.z, P.hurtClearR);
  if (p.hp <= 0 && !w.result) { w.result = 'lose'; emit(w, 'playerDeath'); }
  return true;
}
