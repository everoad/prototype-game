// 방패·폭탄 — 아이템으로 얻는 사용권(§4.9): Q 방패(보라 탄만), E 폭탄(판 지움·무적·보스 4%), 맞는 순간 구제 0.15초.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { startLaser } from '../src/sim/beams.js';
import { addStagger } from '../src/sim/boss.js';
import { isInvuln } from '../src/sim/player.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const of = (ev, t) => ev.filter(e => e.type === t);
const alive = (w, kind) => { const b = w.bullets; let n = 0; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.kind[i] === kind) n++; return n; };

test('시작 사용권은 방패 1·폭탄 1', () => {
  const w = quietWorld();
  assert.deepEqual(w.player.stock, { shield: RULES.items.start.shield, bomb: RULES.items.start.bomb });
});

test('Q 방패: 둘레의 보라 탄만 지우고 흰·빨강은 남긴다', () => {
  const w = quietWorld(), p = w.player;
  spawnBullet(w, K.NORMAL, p.x + 1.0, p.z, 0, 0);
  const wi = spawnBullet(w, K.WHITE, p.x - 1.0, p.z, 0, 0);
  w.bullets.kind[wi] = K.WHITE;   // 가까이 생긴 흰 탄은 보통이 되는 0.4초 규칙을 시험에서만 비켜 간다
  spawnBullet(w, K.RED, p.x, p.z + 1.1, 0, 0);
  step(w, { ...idle, shield: true });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'shieldOn').length, 1);
  assert.equal(w.player.stock.shield, RULES.items.start.shield - 1);
  assert.equal(alive(w, K.NORMAL), 0);
  assert.equal(alive(w, K.WHITE), 1);
  assert.equal(alive(w, K.RED), 1);
  // 1.5초 뒤엔 꺼진다
  for (let k = 0; k < ticks(RULES.shield.sec + 0.05); k++) step(w, idle);
  spawnBullet(w, K.NORMAL, p.x + 1.0, p.z, 0, 0);
  step(w, idle);
  assert.equal(alive(w, K.NORMAL), 1);
});

test('E 폭탄: 판의 적 탄·차선·빔을 지우고 무적, 보스 체력 4%', () => {
  const w = quietWorld(), p = w.player;
  w.boss.x = p.x + 8;
  for (let k = 0; k < 6; k++) spawnBullet(w, K.NORMAL, -5 + k, 5, 0, 3);
  spawnBullet(w, K.WHITE, 5, -5, 0, 3);
  startLaser(w, null);
  w.lanes.push({ kind: K.RED, x: 0, z: 0, angle: 0, born: w.time, warn: 0.7, lockBefore: 0.2, speed: 18, off: 0, aimed: false, src: 3 });
  const hp0 = w.boss.hp;
  step(w, { ...idle, bomb: true });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'bomb').length, 1);
  assert.equal(alive(w, K.NORMAL) + alive(w, K.WHITE), 0);
  assert.equal(w.lanes.length, 0);
  assert.equal(w.beams.length, 0);
  assert.ok(Math.abs((hp0 - w.boss.hp) - RULES.bomb.share * w.boss.maxHp) < 1e-6, `${hp0 - w.boss.hp}`);
  assert.equal(w.player.stock.bomb, RULES.items.start.bomb - 1);
  for (let k = 0; k < ticks(RULES.bomb.invuln - 0.1); k++) { step(w, idle); assert.ok(isInvuln(w)); }
});

test('사용권이 없으면 아무 일 없고 denied', () => {
  const w = quietWorld(), p = w.player;
  p.stock.shield = 0; p.stock.bomb = 0;
  spawnBullet(w, K.NORMAL, p.x + 5, p.z, 0, 0);
  step(w, { ...idle, shield: true, bomb: true });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'bomb').length + of(ev, 'shieldOn').length, 0);
  assert.deepEqual(of(ev, 'denied').map(e => e.what).sort(), ['bomb', 'shield']);
  assert.equal(alive(w, K.NORMAL), 1);
});

test('25초마다 아이템이 생기고, 걸어 들어가면 줍고, 가득이면 못 줍고, 10초 뒤 사라진다', () => {
  const w = createWorld({ seed: 1 }); w.player.invulnUntil = 1e9; w.boss.hp = w.boss.maxHp = 1e9;
  const ev = [];
  for (let k = 0; k < ticks(RULES.items.every + 0.05); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(of(ev, 'itemSpawn').length, 1);
  const it = w.items[0];
  assert.ok(Math.hypot(it.x - w.boss.x, it.z - w.boss.z) >= RULES.items.minFromBoss - 1e-6);
  const before = w.player.stock[it.kind];
  w.player.x = it.x; w.player.z = it.z;
  step(w, idle); ev.push(...drainEvents(w));
  assert.equal(of(ev, 'itemPick').length, 1);
  assert.equal(w.player.stock[it.kind], before + 1);
  assert.equal(w.items.length, 0);
  // 다음 아이템: 가득이면 못 줍는다
  for (let k = 0; k < ticks(RULES.items.every); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(w.items.length, 1);
  const it2 = w.items[0];
  w.player.stock[it2.kind] = RULES.items.max;
  w.player.x = it2.x; w.player.z = it2.z;
  step(w, idle);
  assert.equal(w.items.length, 1, '가득인데 주움');
  for (let k = 0; k < ticks(RULES.items.life); k++) step(w, idle);
  assert.equal(w.items.length, 0, '10초 뒤 안 사라짐');
});

test('맞은 뒤 0.15초 안 폭탄은 그 한 대를 되돌린다(넘으면 폭탄만)', () => {
  for (const [lead, saved] of [[0.1, true], [0.25, false]]) {
    const w = quietWorld(), p = w.player;
    spawnBullet(w, K.NORMAL, p.x + 0.3, p.z, Math.PI, 5);
    let hurtAt = null, ev = [];
    for (let k = 0; k < ticks(1); k++) {
      const press = hurtAt != null && w.time >= hurtAt + lead - 1e-9 && !ev.some(e => e.type === 'bomb');
      step(w, { ...idle, bomb: press });
      const e = drainEvents(w); ev.push(...e);
      if (hurtAt == null && e.some(x => x.type === 'hurt')) hurtAt = w.time;
    }
    assert.ok(hurtAt != null);
    assert.equal(of(ev, 'bomb').length, 1);
    assert.equal(p.hp === RULES.player.hp, saved, `${lead}: 체력 ${p.hp}`);
    assert.equal(of(ev, 'deathbomb').length, saved ? 1 : 0);
  }
});

test('마지막 한 대도 0.15초 안 폭탄이면 산다(폭탄이 없으면 바로 짐)', () => {
  const play = (bombs, pressAfter) => {
    const w = quietWorld(), p = w.player;
    p.hp = 5; p.stock.bomb = bombs;
    spawnBullet(w, K.NORMAL, p.x + 0.3, p.z, Math.PI, 5);
    let hurtAt = null;
    for (let k = 0; k < ticks(1) && !w.result; k++) {
      const press = pressAfter != null && hurtAt != null && w.time >= hurtAt + pressAfter - 1e-9;
      step(w, { ...idle, bomb: press });
      if (hurtAt == null && drainEvents(w).some(x => x.type === 'hurt')) { hurtAt = w.time; if (bombs === 0) break; }
    }
    return w;
  };
  assert.equal(play(1, 0.1).result, null);
  assert.equal(play(1, 0.1).player.hp, 5);
  assert.equal(play(1, null).result, 'lose');
  assert.equal(play(0, null).result, 'lose');
});

test('처형 중 Q·E는 무시', () => {
  const w = quietWorld(); w.boss.x = w.player.x + 3.5;
  addStagger(w, RULES.stagger.max); drainEvents(w);
  step(w, { ...idle, parry: true });
  assert.ok(w.execute);
  step(w, { ...idle, bomb: true, shield: true });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'bomb').length + of(ev, 'shieldOn').length, 0);
  assert.deepEqual(w.player.stock, { shield: RULES.items.start.shield, bomb: RULES.items.start.bomb });
});

// ── 검토에서 나온 것들
import { startFullCounter } from '../src/sim/rewards.js';
import { framingPoints } from '../src/view/camMath.js';
import { LOOK } from '../src/view/look.js';

test('구제 창 동안(체력 0) 다른 피해로 보스를 끝낼 수 없다', () => {
  const w = quietWorld(), p = w.player;
  p.hp = 5; w.boss.x = p.x + 3;
  spawnBullet(w, K.NORMAL, p.x + 0.3, p.z, Math.PI, 5);
  for (let k = 0; k < ticks(1) && !w.result; k++) {
    step(w, idle);
    if (drainEvents(w).some(e => e.type === 'hurt')) w.boss.hp = 3;   // 쏘던 탄이면 끝낼 만한 체력
  }
  assert.equal(w.result, 'lose');
});

test('방패가 켜진 동안 Q는 사용권을 쓰지 않는다(폭탄 무적 동안 E도)', () => {
  const w = quietWorld(), p = w.player;
  p.stock.shield = 3; p.stock.bomb = 3;
  step(w, { ...idle, shield: true }); step(w, idle); step(w, { ...idle, shield: true });
  assert.equal(p.stock.shield, 2);
  step(w, { ...idle, bomb: true }); step(w, idle); step(w, { ...idle, bomb: true });
  assert.equal(p.stock.bomb, 2);
  const ev = drainEvents(w);
  assert.equal(of(ev, 'denied').filter(e => e.why === 'active').length, 2);
});

test('그로기 중 폭탄도 정확히 4%', () => {
  const w = quietWorld(); w.boss.x = w.player.x + 9;
  addStagger(w, RULES.stagger.max);
  const hp0 = w.boss.hp;
  step(w, { ...idle, bomb: true });
  assert.ok(Math.abs((hp0 - w.boss.hp) - RULES.bomb.share * w.boss.maxHp) < 1e-6, `${hp0 - w.boss.hp}`);
});

test('구제한 한 대는 맞은 수에서 빠진다', () => {
  const w = quietWorld(), p = w.player;
  spawnBullet(w, K.NORMAL, p.x + 0.3, p.z, Math.PI, 5);
  let hurt = false;
  for (let k = 0; k < ticks(0.5); k++) { step(w, { ...idle, bomb: hurt }); if (drainEvents(w).some(e => e.type === 'hurt')) hurt = true; else if (hurt) break; }
  assert.equal(w.stats.hits, 0);
  assert.equal(Object.values(w.stats.hitsByPattern).reduce((a, b) => a + b, 0), 0);
});

test('연습 장면에선 되돌릴 것이 없으면 구제가 아니다', () => {
  const w = createWorld({ lab: 'parry' }), p = w.player;
  p.hp = 1; p.invulnUntil = -1;
  spawnBullet(w, K.NORMAL, p.x + 0.3, p.z, Math.PI, 5);
  let hurt = false; const ev = [];
  for (let k = 0; k < ticks(0.5); k++) { step(w, { ...idle, bomb: hurt }); const e = drainEvents(w); ev.push(...e); if (e.some(x => x.type === 'hurt')) hurt = true; }
  assert.ok(hurt);
  assert.equal(of(ev, 'deathbomb').length, 0);
});

test('처형·자동 반격 중 Q·E는 denied(busy), 사용권은 그대로', () => {
  const w = quietWorld(); w.boss.x = w.player.x + 3.1;
  startFullCounter(w);
  step(w, { ...idle, bomb: true, shield: true });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'denied').filter(e => e.why === 'busy').length, 2);
  assert.deepEqual(w.player.stock, { shield: RULES.items.start.shield, bomb: RULES.items.start.bomb });
});

test('방패는 금·되튄 탄도 지우지 않는다', () => {
  const w = quietWorld(), p = w.player;
  const g = spawnBullet(w, K.GOLD, p.x + 1.0, p.z, 0, 0); w.bullets.kind[g] = K.GOLD;
  const r = spawnBullet(w, K.REFLECT, p.x - 1.0, p.z, 0, 0);
  step(w, { ...idle, shield: true });
  assert.equal(alive(w, K.GOLD), 1);
  assert.equal(alive(w, K.REFLECT), 1);
});

test('연습 장면·ai 끔에는 아이템이 생기지 않는다', () => {
  for (const w of [createWorld({ lab: 'execute' }), quietWorld()]) {
    for (let k = 0; k < ticks(RULES.items.every + 1); k++) step(w, idle);
    assert.equal(w.items.length, 0);
  }
});

test('살아 있는 아이템은 카메라가 담는다', () => {
  const w = quietWorld();
  w.items.push({ kind: 'bomb', x: -9, z: 6, born: 0 });
  assert.ok(framingPoints(w, LOOK).some(q => q.x === -9 && q.z === 6));
});

test('회복 변형: 구제 창 동안엔 회복되지 않는다(체력이 보이는 채 죽지 않게)', async () => {
  const { healOn } = await import('../src/sim/rewards.js');
  const w = quietWorld({ heal: true }), p = w.player;
  p.hp = 0; p.dyingAt = w.time + 0.1;
  healOn(w);
  assert.equal(p.hp, 0);
});
