// 방패·폭탄 — 아이템으로 얻는 사용권(§4.9). 패링으로 늘지 않는다(사용자).
//  Q 방패: shield.sec초 동안 둘레 shield.r에 닿는 보라 탄만 지운다(흰·금·빨강·장판·레이저는 그대로 — 패링을 대신하지 않음).
//  E 폭탄: 판의 적 탄·차선·빔을 지우고 bomb.invuln초 무적, 보스에게 최대 체력의 bomb.share 피해(무력화 없음).
//  맞는 순간 구제: 맞은 뒤 bomb.rescue초 안에 폭탄이면 그 한 대를 없던 일로(마지막 한 대면 그동안 죽음을 미룬다 — player.js).
//  아이템: 보스전엔 items.every초마다 하나(보스에서 minFromBoss U 넘게, 방패·폭탄 번갈아, life초 뒤 사라짐). 걸어 들어가면 줍는다(가득이면 못 주움).
//  아이템 자리는 따로 된 난수(itemRng) — 보스 두뇌의 난수 차례를 바꾸지 않는다.
import { K } from './rules.js';
import { emit } from './events.js';
import { makeRng } from './rng.js';
import { clearBullets, killBullet } from './bullets.js';
import { clearBeams } from './beams.js';
import { damageBoss } from './boss.js';
import { isAway, hurtFoe } from './foes.js';

export const freshStock = R => ({ shield: R.items.start.shield, bomb: R.items.start.bomb });

// 누름(Q·E). 처형·자동 반격 중엔 무시. 미뤄 둔 죽음(구제 창)이 지나면 여기서 끝낸다.
export function useItems(w, input) {
  const p = w.player, R = w.rules;
  const busy = !!w.execute || (!!p.auto && w.time < p.autoUntil);
  if (!w.result) {
    // 누름마다 반응한다(§6): 못 쓰면 denied — 처형·자동 반격 중(busy), 이미 켜진 방패·폭탄 무적 중(active, 사용권 안 씀), 사용권 없음(stock)
    const why = (what, active) => (busy ? 'busy' : active ? 'active' : p.stock[what] <= 0 ? 'stock' : null);
    if (input.shield) {
      const no = why('shield', w.time < p.shieldUntil);
      if (no) emit(w, 'denied', { what: 'shield', why: no });
      else { p.stock.shield--; p.shieldUntil = w.time + R.shield.sec; emit(w, 'shieldOn', { x: p.x, z: p.z }); }
    }
    if (input.bomb) {
      const no = why('bomb', w.time < (p.bombUntil ?? -1));
      if (no) emit(w, 'denied', { what: 'bomb', why: no });
      else { p.stock.bomb--; fireBomb(w); }
    }
  }
  if (p.dyingAt != null && w.time >= p.dyingAt - 1e-9 && !w.result) {
    p.dyingAt = null;
    w.result = 'lose';
    emit(w, 'playerDeath', { x: w.player.x, z: w.player.z });
  }
}

function fireBomb(w) {
  const p = w.player, R = w.rules, b = w.boss, h = p.lastHurt;
  if (h && !h.rescued && h.dmg > 0 && w.time - h.t <= R.bomb.rescue + 1e-9) {   // 되돌릴 것이 있을 때만(연습 장면 1 체력이면 없음)
    h.rescued = true;
    p.hp = Math.min(R.player.hp, p.hp + h.dmg);
    p.dyingAt = null;
    w.stats.hits--; if (w.stats.hitsByPattern[h.src]) w.stats.hitsByPattern[h.src]--;   // 없던 일 = 맞은 수에서도 뺀다
    emit(w, 'deathbomb', { x: p.x, z: p.z, hp: h.dmg });
  }
  clearBullets(w, p.x, p.z, Infinity);
  w.lanes.length = 0;
  clearBeams(w);
  p.invulnUntil = Math.max(p.invulnUntil, w.time + R.bomb.invuln);
  p.bombUntil = w.time + R.bomb.invuln;
  let dmg = 0;
  if (isAway(w)) { for (const f of [...w.foeList]) dmg += hurtFoe(w, f, R.mobs.bombShare * f.maxHp, 'bomb', { pierce: true }); }   // 일반 방: 모든 몬스터에게 최대 체력의 몫
  else dmg = damageBoss(w, R.bomb.share * b.maxHp, 'bomb', true);   // 정확히 share(그로기 배율 없음)
  emit(w, 'bomb', { x: p.x, z: p.z, bx: isAway(w) ? p.x : b.x, bz: isAway(w) ? p.z : b.z, dmg });
}

// 방패: 탄이 움직인 뒤, 맞기 전에 부른다
export function shieldBullets(w) {
  const p = w.player, R = w.rules, b = w.bullets;
  if (!(w.time < p.shieldUntil)) return;
  for (let i = 0; i < b.cap; i++) {
    if (!b.alive[i] || b.kind[i] !== K.NORMAL) continue;
    const dx = b.x[i] - p.x, dz = b.z[i] - p.z, r = R.shield.r + b.r[i];
    if (dx * dx + dz * dz > r * r) continue;
    emit(w, 'shieldBlock', { x: b.x[i], z: b.z[i] });
    killBullet(w, i);
  }
}

// 아이템 생김·줍기·사라짐(본판만 — 연습 장면·ai 끔에는 생기지 않는다)
export function updateItemSpawns(w) {
  const p = w.player, R = w.rules, I = R.items, b = w.boss;
  for (let k = w.items.length - 1; k >= 0; k--) {
    const it = w.items[k];
    if (w.time >= it.born + I.life - 1e-9) { w.items.splice(k, 1); emit(w, 'itemGone', { kind: it.kind, x: it.x, z: it.z }); continue; }
    if (Math.hypot(p.x - it.x, p.z - it.z) <= I.pickR && p.stock[it.kind] < I.max) {
      p.stock[it.kind]++;
      w.items.splice(k, 1);
      emit(w, 'itemPick', { kind: it.kind, x: it.x, z: it.z });
    }
  }
  if (!w.opts.ai || w.opts.lab || w.result || w.stage) return;   // 스테이지에서는 나오지 않는다(사용권은 방에서 얻은 것뿐)
  w.itemNext ??= I.every;
  if (w.time < w.itemNext - 1e-9) return;
  w.itemNext = w.time + I.every;
  w.itemRng ??= makeRng((w.seed ^ 0x5eed17) >>> 0);
  const kind = (w.itemFlip = !w.itemFlip) ? 'shield' : 'bomb';
  const hx = R.board.hx - 1, hz = R.board.hz - 1;
  let x = 0, z = 0;
  for (let guard = 0; guard < 30; guard++) {
    x = (w.itemRng.next() * 2 - 1) * hx; z = (w.itemRng.next() * 2 - 1) * hz;
    if (Math.hypot(x - b.x, z - b.z) >= I.minFromBoss) break;
  }
  w.items.push({ kind, x, z, born: w.time });
  emit(w, 'itemSpawn', { kind, x, z });
}
