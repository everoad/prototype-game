// 모아 던지기(설계 §4.11, 변형 ?store=1): 받은 흰·금 탄과 받아낸 근접·장판 타를 바로 쓰지 않고 모았다가(최대 cap),
// U(input.throw)로 한 번에 던진다 — 누르는 순간 회복, 탄들은 every초 간격으로 보스에게 날아가 피해·무력화(n개면 × (1 + bonus × (n − 1))).
// 맞아도 잃지 않고 막아 주지도 않는다. 가득이면 storeAdd가 false — 부르는 쪽(parry.js·melee.js)이 지금 방식으로 처리한다.
// 던진 탄은 되튄 탄(K.REFLECT) 풀을 쓴다: thrown·mul·stag·last 칸을 parry.hitBossReflects가 읽는다.
import { K } from './rules.js';
import { emit } from './events.js';
import { spawnBullet } from './bullets.js';
import { executeActive } from './execute.js';
import { autoActive } from './rewards.js';

export const storeOn = w => !!w.opts.store;
export const storeRoom = w => storeOn(w) && w.player.store.length < w.rules.store.cap;

// 받은 것 하나를 모은다. stagger = 던질 때 줄 무력화(받을 때 값). 모았으면 true.
export function storeAdd(w, { perfect, gold, stagger, x, z, kind }) {
  if (!storeRoom(w)) return false;
  const p = w.player;
  p.store.push({ perfect: !!perfect, gold: !!gold, stagger });
  emit(w, 'storeAdd', { x, z, px: p.x, pz: p.z, n: p.store.length, full: p.store.length >= w.rules.store.cap, perfect: !!perfect, gold: !!gold, kind });
  return true;
}

export function throwStore(w, input) {
  if (!storeOn(w) || !input.throw) return;
  const p = w.player, S = w.rules.store, b = w.bullets;
  const busy = executeActive(w) || autoActive(w) || p.dyingAt != null || !!w.result || w.boss.dead;
  if (busy || p.store.length === 0) { emit(w, 'denied', { what: 'throw', why: busy ? 'busy' : 'empty' }); return; }
  const n = p.store.length, mul = 1 + S.bonus * (n - 1);
  // 회복은 누르는 순간(급할 때 바로 듣게), 최대 체력까지
  let heal = 0;
  for (const o of p.store) heal += o.perfect ? S.heal[1] : S.heal[0];
  const before = p.hp;
  p.hp = Math.min(w.rules.player.hp, p.hp + heal);
  // 탄: 몸 둘레에서 every초 간격으로 출발(멈춤이 끝나면 보스를 따라간다 — bullets.moveBullets)
  for (let k = 0; k < n; k++) {
    const o = p.store[k], a = k / n * Math.PI * 2;
    const i = spawnBullet(w, K.REFLECT, p.x + Math.cos(a) * S.orbitR, p.z + Math.sin(a) * S.orbitR, 0, 0);
    if (i < 0) continue;   // 풀이 가득(거의 없음): 그 한 발은 버린다
    b.vx[i] = 0; b.vz[i] = 0;
    b.perfect[i] = o.perfect ? 1 : 0; b.gold[i] = o.gold ? 1 : 0;
    b.thrown[i] = 1; b.mul[i] = mul; b.stag[i] = o.stagger; b.last[i] = k === n - 1 ? 1 : 0;
    b.holdUntil[i] = w.time + k * S.every;
  }
  p.store.length = 0;
  w.stats.throws++; w.stats.healed += p.hp - before;
  if (w.weapons) w.weapons.throwFans = n;   // 산탄은 던질 때(weapons.js)
  emit(w, 'throw', { x: p.x, z: p.z, n, heal: p.hp - before, mul });
}
