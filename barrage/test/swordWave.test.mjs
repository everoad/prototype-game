// 검사 시험판 2(사용자 2026-11-17 "탄이 느려지는 둘레고 기본공격에 게이지를 조금씩 채우게 해서 스킬을 자주 쓰게"):
// 기본 공격 = 사거리가 있는 칼바람(안쪽에 서게 한다) · 맞힌 칼바람이 칸을 채운다 · 내 둘레에 들어온 적 탄이 느려진다(안쪽에서도 읽을 시간이 난다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { gameTries } from '../src/sim/tries.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const Sw = RULES.sword, Wv = Sw.wave, Fd = Sw.field;
// 검사 판: 보스는 오른쪽 d U(가운데끼리)에 서 있다. 칼바람은 그대로 나간다
function sw(d, opts = {}) {
  const w = quietWorld({ char: 'sword', ...opts });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z;
  w.player.swords = null;   // 이기어검은 끈다 — 여기서는 칼바람만 본다(검은 swords.test.mjs)
  return w;
}
const of = (ev, type) => ev.filter(e => e.type === type);
const go = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, input); ev.push(...drainEvents(w)); } return ev; };
const reach = RULES.boss.r + Wv.range + Wv.r;   // 칼바람이 닿는 거리(보스 가운데까지)

// ── 칼바람
test('검사는 탄을 쏘지 않고 every초마다 칼바람을 낸다', () => {
  const w = sw(5), ev = go(w, 2);
  assert.equal(w.stats.shotsFired, 0);
  const n = of(ev, 'bladeWave').length;
  assert.ok(Math.abs(n - 2 / Wv.every) <= 1, `${n}번`);
  assert.equal(of(ev, 'shoot').length, 0);
});

test('칼바람은 사거리까지만 닿는다 — 안이면 한 번에 wave.dmg, 밖이면 0', () => {
  const near = sw(reach - 0.3), far = sw(reach + 0.3);
  const hp = near.boss.hp;
  go(near, 2); go(far, 2);
  assert.equal(far.boss.hp, hp, '사거리 밖');
  const lost = hp - near.boss.hp, waves = Math.round(lost / Wv.dmg);
  assert.ok(waves >= 3 && Math.abs(lost - waves * Wv.dmg) < 1e-6, `${lost}`);
  assert.ok(Math.abs(near.stats.dmg.shot - lost) < 1e-6, '기본 공격의 피해로 적힌다');
});

test('칼바람은 줄 위의 적을 모두 지나가며 한 번씩만 벤다', () => {
  const w = createWorld({ char: 'sword', stage: 1, seed: 1, tries: gameTries(null), ai: false });
  w.player.swords = null;   // 이기어검은 끈다(칼바람의 피해만 본다)
  const p = w.player, a = w.enemies[0], b = w.enemies[1];
  for (const [m, x] of [[a, p.x + 2.5], [b, p.x + 4.5]]) { m.x = m.px = x; m.z = m.pz = p.z; m.bornAt = -1; m.hp = m.maxHp = 5000; }
  step(w, idle);   // 한 번 나간다
  w.player.blade.cutAt = 1e9;   // 그 뒤로는 내지 않는다
  go(w, 0.6);
  assert.ok(Math.abs(a.maxHp - a.hp - Wv.dmg) < 1e-9, `${a.maxHp - a.hp}`);
  assert.ok(Math.abs(b.maxHp - b.hp - Wv.dmg) < 1e-9, `${b.maxHp - b.hp}`);
  assert.equal(w.player.blade.cuts.length, 0, '사거리 끝에서 사라진다');
});

test('구르는 동안 · 스킬이 몸을 움직이는 동안 · 겨눌 적이 없으면 칼바람이 나가지 않는다', () => {
  const w = sw(5);
  const ev = go(w, 0.2, { ...idle, dodge: true, mx: -1 });
  assert.ok(of(ev, 'bladeWave').length <= 1);
  const lone = quietWorld({ char: 'sword' }); lone.boss.dead = true;
  assert.equal(of(go(lone, 1), 'bladeWave').length, 0);
});

// ── 맞힌 칼바람이 칸을 채운다
test('계속 맞히면 wave.charge초에 한 칸 — 보통 칸(완벽 아님, 무너짐은 보통 값)이 든다', () => {
  const w = sw(5);
  go(w, Wv.charge - 0.6);
  assert.equal(w.player.store.length, 0);
  assert.ok(w.player.blade.charge > 0.7 && w.player.blade.charge < 1);
  const ev = go(w, 1.4);
  assert.equal(w.player.store.length, 1);
  assert.deepEqual(w.player.store[0], { perfect: false, gold: false, stagger: RULES.reflect.staggerNormal });
  assert.equal(of(ev, 'storeAdd').length, 1);
});

test('사거리 밖이면 차지 않고, 칸이 가득이면 더 차지 않는다', () => {
  const far = sw(reach + 1);
  go(far, Wv.charge + 1);
  assert.equal(far.player.store.length, 0); assert.equal(far.player.blade.charge, 0);
  const w = sw(5);
  go(w, Wv.charge * (RULES.store.cap + 2));
  assert.equal(w.player.store.length, RULES.store.cap);
  assert.ok(w.player.blade.charge <= 1);
});

// ── 탄이 느려지는 둘레
const flight = (w, i, sec) => { const b = w.bullets, x0 = b.x[i]; run(w, sec); return Math.abs(b.x[i] - x0); };
function bulletAt(w, kind, dist, speed = 8) {   // 내 오른쪽 dist U에서 바깥으로(멀어지는 쪽) 나는 탄 — 맞지 않게
  const p = w.player;
  return spawnBullet(w, kind, p.x + dist, p.z + 0.01, 0, speed);
}

test('내 둘레(field.R) 안의 적 탄은 field.slow배로 느려진다 — 밖의 탄은 그대로', () => {
  const w = sw(40); w.player.blade.cutAt = 1e9;
  const inside = bulletAt(w, K.NORMAL, 1.0), outside = bulletAt(w, K.NORMAL, Fd.R + 1);
  const v = Math.hypot(w.bullets.vx[inside], w.bullets.vz[inside]);
  const dIn = flight(w, inside, 0.1), dOut = Math.abs(w.bullets.x[outside] - (w.player.x + Fd.R + 1));
  assert.ok(Math.abs(dIn - v * 0.1 * Fd.slow) < 1e-6, `${dIn}`);
  assert.ok(Math.abs(dOut - v * 0.1) < 1e-6, `${dOut}`);
});

test('흰·금·빨강도 느려지고, 받아친 탄(되튄 탄)은 느려지지 않는다', () => {
  for (const kind of [K.WHITE, K.GOLD, K.RED]) {
    const w = sw(40); w.player.blade.cutAt = 1e9;
    const i = bulletAt(w, kind, 2.0); w.bullets.holdUntil[i] = 0;
    const v = Math.hypot(w.bullets.vx[i], w.bullets.vz[i]);
    assert.ok(Math.abs(flight(w, i, 0.05) - v * 0.05 * Fd.slow) < 1e-6, `kind ${kind}`);
  }
  const w = sw(40); w.player.blade.cutAt = 1e9;
  const i = bulletAt(w, K.REFLECT, 1.0); w.bullets.vx[i] = 8; w.bullets.vz[i] = 0;
  const x0 = w.bullets.x[i]; step(w, idle);
  assert.ok(Math.abs(w.bullets.x[i] - x0 - RULES.bullets.reflectSpeed * RULES.dt) < 1e-6, `되튄 탄은 제 속도로(보스 쪽으로) 난다: ${w.bullets.x[i] - x0}`);
});

test('사수 판에는 둘레가 없다 — 곁의 탄도 제 속도다', () => {
  const w = quietWorld({ store: true }); w.boss.x = w.player.x + 40; w.shots.nextAt = 1e9;
  const i = bulletAt(w, K.NORMAL, 1.0), v = Math.hypot(w.bullets.vx[i], w.bullets.vz[i]);
  assert.ok(Math.abs(flight(w, i, 0.1) - v * 0.1) < 1e-6);
});

test('같은 seed의 검사 판은 같은 판이다(칼바람·둘레가 있어도)', () => {
  const play = () => { const w = createWorld({ char: 'sword', seed: 5, tries: gameTries(null) }); for (let k = 0; k < 120 * 8; k++) step(w, { ...idle, mx: Math.sin(k / 40), mz: Math.cos(k / 55) }); return stateHash(w); };
  assert.equal(play(), play());
});

// ── 빠른 칼바람(사용자 2026-11-17 "검 기본 공격도 빠르게 나가게 — 채우는 게이지를 그만큼 나누고. 지금은 너무 허전하다")
test('칼바람은 빠르게 나간다(1초에 여덟 번쯤) — 초당 피해와 칸이 차는 속도는 그대로다', () => {
  assert.ok(Wv.every <= 0.13, `every ${Wv.every}`);
  assert.ok(Math.abs(Wv.dmg / Wv.every - 30) < 0.5, `초당 ${Wv.dmg / Wv.every}`);
  assert.equal(Wv.charge, 6);
});

test('칼바람은 좌우로 번갈아 벤다(보이는 모양 — 판정은 같다)', () => {
  const w = sw(5), sides = [];
  for (let k = 0; k < ticks(0.6); k++) { step(w, idle); for (const c of w.player.blade.cuts) if (!sides.includes(c)) sides.push(c); }
  const s = sides.map(c => c.side);
  assert.ok(s.length >= 4);
  for (let k = 1; k < s.length; k++) assert.equal(s[k], -s[k - 1]);
  assert.ok(s.every(v => v === 1 || v === -1));
});

// ── 쌍검의 칼바람(사용자 2026-11-17 "주무기는 쌍검만 — 쌍검 공격도 쌍검답게 연출이나 이펙트 수정": 칼바람이 곧 쌍검의 공격이다. 날아가는 것은 그대로 두고 연출을 키운다)
test('칼바람은 어느 쪽 칼이 냈는지(side)를 알리고, 맞힌 자리(적 몸 표면)를 waveHit으로 알린다 — 화면이 엇갈린 칼자국을 낸다', () => {
  const w = sw(5), ev = go(w, 0.5), waves = of(ev, 'bladeWave'), hits = of(ev, 'waveHit');
  assert.ok(waves.length >= 3);
  for (let k = 1; k < waves.length; k++) assert.equal(waves[k].side, -waves[k - 1].side);
  assert.ok(hits.length >= 2);
  for (const h of hits) {
    assert.ok(Math.abs(Math.hypot(h.x - w.boss.x, h.z - w.boss.z) - RULES.boss.r) < 1e-6);
    assert.ok(h.x < w.boss.x, '칼바람이 온 쪽');
    assert.ok((h.side === 1 || h.side === -1) && Number.isFinite(h.angle));
  }
});
