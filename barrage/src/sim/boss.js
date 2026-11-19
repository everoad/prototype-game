// 보스 몸: 피해(과열·그로기 배율과 출처 기록), 무력화·그로기, 단단한 몸(플레이어를 밀어냄).
// 상태 기계·고르기·움직임은 Task 9가 더한다.
import { emit } from './events.js';
import { addDamage } from './stats.js';
import { clearBullets } from './bullets.js';
import { slideOut, clampToBoard } from './geom.js';

export function createBoss(rules) {
  const [x, z] = rules.start.boss;
  return { x, z, px: x, pz: z, face: Math.PI, hp: rules.boss.hp, maxHp: rules.boss.hp, stagger: 0, groggyUntil: -1, state: 'idle', run: null, dead: false };
}

export const bossGroggy = w => w.time < w.boss.groggyUntil;

// 피해: 과열 중 쏘기는 2배(늘어난 몫 = overdrive), 그로기 중엔 1.5배(늘어난 몫 = groggy). 체력 0 = 이김.
// raw = 배율 없이 그대로(처형 — 정해진 몫을 정확히).
export function damageBoss(w, amount, src, raw = false) {
  const b = w.boss;
  if (b.dead) return 0;
  if (b.air) return 0;   // 떠 있는 용(dragon2.js)은 맞지 않는다
  if (w.player.dyingAt != null) return 0;   // 구제 창(체력 0) 동안엔 쏘던 탄으로 이길 수 없다 — 폭탄은 창을 먼저 닫고 친다
  let total = amount;
  addDamage(w.stats, src, amount);
  if (!raw && src === 'shot' && w.time < w.player.overdriveUntil) {
    const extra = amount * (w.rules.counter.overdriveMul - 1);
    addDamage(w.stats, 'overdrive', extra); total += extra;
  }
  if (!raw && bossGroggy(w)) {
    const extra = total * (w.rules.stagger.groggyMul - 1);
    addDamage(w.stats, 'groggy', extra); total += extra;
  }
  b.hp = Math.max(w.opts.lab ? 1 : 0, b.hp - total);   // 연습 장면에선 끝나지 않는다(플레이어와 같게)
  if (b.hp <= 0) {
    b.dead = true;
    if (!w.result) w.result = 'win';
    emit(w, 'bossDeath', { x: b.x, z: b.z });
  }
  return total;
}

// 무력화: 다 차면 그로기 3초, 막대 0, 판의 적 탄 전부 지움. 그로기 중에는 차지 않는다.
export function addStagger(w, amount) {
  const b = w.boss, S = w.rules.stagger;
  if (b.dead || b.away || b.air || bossGroggy(w)) return;   // 자리에 없는 보스(일반 방)에게는 쌓이지 않는다
  b.stagger += amount;
  if (b.stagger >= S.max) {
    b.stagger = 0;
    b.groggyUntil = w.time + S.groggy;
    clearBullets(w, 0, 0, Infinity);
    emit(w, 'groggy', { x: b.x, z: b.z });
  }
}

// 몸끼리: 플레이어 몸이 보스 몸에 겹치면 둘레로 밀어낸다(닿아도 피해 없음). 난간과 몸 사이에 끼면 난간을 따라 비껴 나간다.
export function separateBodies(w) {
  const p = w.player, b = w.boss, r = w.rules, pr = r.player.bodyR, R = r.boss.r;
  if (b.air || b.lift) return;   // 떠 있는 용(dragon2.js) · 뛰어오른 포격수(siege.js)의 밑은 지나다닌다
  if (p.blade.move && p.blade.move.kind === 'slash') return;   // 검사의 일섬(sword.js)은 몸을 지나간다 — 보스가 움직이며 부르는 판정도 밀어내지 않는다(선 틱부터 다시 민다)
  if (b.away) {   // 일반 방(스테이지): 보스는 없고 몬스터 몸이 단단하다
    for (let k = 0; k < 2; k++) for (const e of w.enemies) {
      if (e.dead || w.time < e.bornAt) continue;
      [p.x, p.z] = slideOut(p.x, p.z, pr, e.x, e.z, e.r);
      [p.x, p.z] = clampToBoard(r, p.x, p.z, pr);
    }
    return;
  }
  for (let k = 0; k < 3; k++) {
    [p.x, p.z] = slideOut(p.x, p.z, pr, b.x, b.z, R);
    [p.x, p.z] = clampToBoard(r, p.x, p.z, pr);
  }
  const min = R + pr, dx = p.x - b.x, dz = p.z - b.z;
  if (dx * dx + dz * dz >= min * min - 1e-9) return;
  // 끼었다: 난간에 붙은 축은 그대로 두고, 다른 축으로 몸 밖까지 비껴 간다.
  const hx = r.board.hx - pr, hz = r.board.hz - pr;
  if (Math.abs(Math.abs(p.z) - hz) < 1e-6) {
    const s = Math.sign(dx) || -1, need = Math.sqrt(Math.max(0, min * min - dz * dz)) + 1e-6;
    p.x = b.x + s * need;
    if (Math.abs(p.x) > hx) p.x = b.x - s * need;
  } else {
    const s = Math.sign(dz) || -1, need = Math.sqrt(Math.max(0, min * min - dx * dx)) + 1e-6;
    p.z = b.z + s * need;
    if (Math.abs(p.z) > hz) p.z = b.z - s * need;
  }
  [p.x, p.z] = clampToBoard(r, p.x, p.z, pr);
}
