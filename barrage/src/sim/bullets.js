// 적 탄 풀(구조형 배열 + 빈자리 목록): 생기기(흰·금 한 속도, 0.4초 규칙), 움직이기, 판정 점 맞음(선분), 스침, 지우기.
// 되튄 탄(K.REFLECT)도 같은 풀에 있다 — 보스를 따라가고, 맞힘은 Task 5(parry.js)가 다룬다.
import { K } from './rules.js';
import { emit } from './events.js';
import { hurtPlayer, isInvuln, dodgeOverlap } from './player.js';
import { openCounterChance } from './rewards.js';

export function createBullets(cap) {
  const f = () => new Float64Array(cap), u = () => new Uint8Array(cap);
  const free = new Int32Array(cap);
  for (let i = 0; i < cap; i++) free[i] = cap - 1 - i;   // 0번부터 꺼낸다
  return {
    cap, live: 0, free, nFree: cap,
    x: f(), z: f(), px: f(), pz: f(), vx: f(), vz: f(), r: f(), born: f(), holdUntil: f(),
    kind: u(), src: u(), alive: u(), perfect: u(), grazed: u(), gold: u(),
    thrown: u(), last: u(), mul: f(), stag: f(),   // 모아 던진 탄(§4.11): 배율·무력화·마지막 발
  };
}

const parryable = kind => kind === K.WHITE || kind === K.GOLD;

// 탄 하나를 낸다. 흰·금은 주는 속도와 무관하게 parrySpeed. 0.4초 규칙(§4.4): 플레이어 패링 원까지 0.4초 안에 닿을 자리에서 생기면
// 색을 지킨 채 그 자리에 잠깐 멈췄다(hold) 출발해 0.4초를 맞춘다 — 받아칠 탄이 사라지지 않게(예전엔 보통 탄으로 바꿨다).
export function spawnBullet(w, kind, x, z, angle, speed, src = 0) {
  const b = w.bullets, R = w.rules.bullets;
  if (b.nFree === 0) return -1;
  let hold = 0;
  speed *= R.speedMul ?? 1;   // 적 탄 전체 속도 배율(보라·빨강); 흰·금은 아래에서 한 속도로
  if (parryable(kind)) {
    speed = R.parrySpeed;
    const p = w.player, d = Math.hypot(x - p.x, z - p.z);
    if (d < R.minParrySpawn) hold = R.parryLead - Math.max(0, d - w.rules.player.parryR) / R.parrySpeed;
  }
  const i = b.free[--b.nFree];
  b.x[i] = b.px[i] = x; b.z[i] = b.pz[i] = z;
  b.vx[i] = Math.cos(angle) * speed; b.vz[i] = Math.sin(angle) * speed;
  b.r[i] = R.r[kind]; b.kind[i] = kind; b.src[i] = src;
  b.born[i] = w.time; b.holdUntil[i] = hold > 0 ? w.time + hold : 0; b.perfect[i] = 0; b.grazed[i] = 0; b.gold[i] = 0; b.thrown[i] = 0; b.last[i] = 0; b.mul[i] = 1; b.stag[i] = 0;
  b.alive[i] = 1; b.live++;
  return i;
}

export function killBullet(w, i) {
  const b = w.bullets;
  if (!b.alive[i]) return;
  b.alive[i] = 0; b.live--;
  b.free[b.nFree++] = i;
}

export const liveCount = w => w.bullets.live;

// 움직이기: 멈춤(holdUntil) 동안은 그 자리(가까이 생긴 흰·금 탄, 받은 탄). 되튄 탄은 멈춤이 끝나면 보스를 향해 방향을 다시 잡는다. 판 밖 + 1 U면 지운다.
export function moveBullets(w) {
  const b = w.bullets, dt = w.rules.dt, hx = w.rules.board.hx + 1, hz = w.rules.board.hz + 1;
  const boss = w.aim === undefined ? w.boss : w.aim, rs = w.rules.bullets.reflectSpeed;   // 겨눈 적(foes.js) — 보스전에선 늘 보스
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i]) continue;
    b.px[i] = b.x[i]; b.pz[i] = b.z[i];
    if (w.time < b.holdUntil[i]) continue;
    const LL = w.tries ? w.tries.lanceLast : null;   // 꿰뚫는 던지기(실험): 던진 탄은 놓일 때 한 번만 겨누고 곧게 난다
    if (b.kind[i] === K.REFLECT && LL && b.thrown[i]) {
      if (b.vx[i] === 0 && b.vz[i] === 0) { const a = boss ? Math.atan2(boss.z - b.z[i], boss.x - b.x[i]) : w.player.face; b.vx[i] = Math.cos(a) * rs; b.vz[i] = Math.sin(a) * rs; LL[i] = 0; }
    } else if (b.kind[i] === K.REFLECT) {
      if (boss) { const dx = boss.x - b.x[i], dz = boss.z - b.z[i], d = Math.hypot(dx, dz) || 1; b.vx[i] = dx / d * rs; b.vz[i] = dz / d * rs; }
      else if (b.vx[i] === 0 && b.vz[i] === 0) { killBullet(w, i); continue; }   // 겨눌 적이 없다(방 정리 뒤): 날던 것은 곧게 가다 판 밖에서, 멈춰 있던 것은 여기서 사라진다
    }
    b.x[i] += b.vx[i] * dt; b.z[i] += b.vz[i] * dt;
    if (b.x[i] < -hx || b.x[i] > hx || b.z[i] < -hz || b.z[i] > hz) killBullet(w, i);
  }
}

// 판정 점 맞음(지난 자리→지금 자리 선분)과 스침. 스침 = 맞지 않고 가장 가까이 지나간 틱에 grazeR + 탄 반지름 안, 탄마다 한 번.
export function hitPlayerBullets(w) {
  const b = w.bullets, p = w.player, P = w.rules.player, dmg = w.rules.bullets.dmg;
  const inv = isInvuln(w);
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.kind[i] === K.REFLECT) continue;
    const x0 = b.px[i], z0 = b.pz[i], dx = b.x[i] - x0, dz = b.z[i] - z0, len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((p.x - x0) * dx + (p.z - z0) * dz) / len2 : 1;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = x0 + dx * t - p.x, qz = z0 + dz * t - p.z, d = Math.hypot(qx, qz), r = b.r[i];
    if (d <= P.hitR + r) {
      if (inv) { onInvulnOverlap(w, i); continue; }
      const x = b.x[i], z = b.z[i], k = b.kind[i], src = b.src[i];
      killBullet(w, i);
      hurtPlayer(w, dmg[k], src, x, z);
      if (w.result) return;
      continue;
    }
    if (!b.grazed[i] && !inv && t < 1 && d <= P.grazeR + r) {
      b.grazed[i] = 1;
      w.stats.grazes++;
      emit(w, 'graze', { x: x0 + dx * t, z: z0 + dz * t });
    }
  }
}

// 무적 중 판정 점에 겹친 탄 — 회피 무적이면 아슬아슬(player.js).
function onInvulnOverlap(w, i) { if (dodgeOverlap(w, w.bullets.kind[i])) openCounterChance(w, 'redDodge'); }

// (x,z) 둘레 r 안의 적 탄을 지운다(되튄 탄은 남김). r = Infinity면 전부.
export function clearBullets(w, x, z, r) {
  const b = w.bullets;
  let n = 0;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.kind[i] === K.REFLECT) continue;
    if (r !== Infinity && Math.hypot(b.x[i] - x, b.z[i] - z) > r) continue;
    killBullet(w, i); n++;
  }
  emit(w, 'clear', { x, z, r, n });
  return n;
}
