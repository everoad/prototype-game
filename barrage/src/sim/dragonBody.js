// 용의 몸(설계 §3): 몸 돌기(상한), 자리(앞·옆·뒤), 입, 머리 겨눔 한계, 몸 공격 방향, 걷기.
// 원거리 보스에도 불리는 것(headAim·bodyFace)은 boss.kind가 'dragon'이 아니면 지금 규칙(플레이어 쪽) 그대로다.
import { clampToBoard } from './geom.js';
import { separateBodies } from './boss.js';

const D = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toPlayer = (w, x, z) => Math.atan2(w.player.z - z, w.player.x - x);
export const isDragon = w => w.boss.kind === 'dragon';

// 용이 보는 쪽에서 플레이어 쪽까지 각 차(라디안, 반시계 +)
export const zoneDelta = w => wrap(toPlayer(w, w.boss.x, w.boss.z) - w.boss.face);

// b.face를 플레이어 쪽으로 — 초당 degPerSec까지
export function turnToward(w, degPerSec) {
  const b = w.boss, d = wrap(toPlayer(w, b.x, b.z) - b.face), lim = degPerSec * D * w.rules.dt;
  b.face = wrap(b.face + Math.max(-lim, Math.min(lim, d)));
}

// 자리: 'front' | 'left' | 'right' | 'back'(왼쪽 = 보는 쪽에서 반시계)
export function zoneOf(w) {
  const Z = w.rules.dragon.zone, d = zoneDelta(w), ad = Math.abs(d);
  if (ad <= Z.front * D) return 'front';
  if (ad >= Z.back * D) return 'back';
  return d > 0 ? 'left' : 'right';
}

export function updateMouth(w) {
  const b = w.boss, at = w.rules.dragon.mouthAt;
  b.mouth ??= { x: 0, z: 0 };
  b.mouth.x = b.x + Math.cos(b.face) * at; b.mouth.z = b.z + Math.sin(b.face) * at;
}

// 머리 탄 겨눔: (fromX, fromZ)에서 플레이어 쪽, 용이면 보는 쪽 ± aimCone 안으로 자른다
export function headAim(w, fromX, fromZ) {
  const a = toPlayer(w, fromX, fromZ);
  if (!isDragon(w)) return a;
  const b = w.boss, lim = w.rules.dragon.aimCone * D, d = wrap(a - b.face);
  return wrap(b.face + Math.max(-lim, Math.min(lim, d)));
}

// 몸 공격(활공·덮치기·발톱) 방향: 용이면 보는 쪽(순간에 돌지 않음), 아니면 플레이어 쪽
export const bodyFace = w => (isDragon(w) ? w.boss.face : toPlayer(w, w.boss.x, w.boss.z));

// 걷기: 플레이어가 앞쪽 반이고 walk.from U보다 멀면 보는 쪽으로(뒤로 걷지 않음)
export function walkDragon(w) {
  const b = w.boss, R = w.rules, Wk = R.dragon.walk;
  if (Math.abs(zoneDelta(w)) > Math.PI / 2) return;
  if (Math.hypot(w.player.x - b.x, w.player.z - b.z) <= Wk.from) return;
  const s = Wk.speed[b.phase - 1] * R.dt;
  [b.x, b.z] = clampToBoard(R, b.x + Math.cos(b.face) * s, b.z + Math.sin(b.face) * s, R.boss.r);
  separateBodies(w);
}
