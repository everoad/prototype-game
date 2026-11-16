// 모아 던지기(설계 §4.11, 변형 ?store=1): 받은 탄을 모았다가(최대 4) U로 한 번에 — 피해·무력화·회복. 맞아도 유지, 막아 주지 않음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { resolveHit } from '../src/sim/melee.js';
import { addStagger } from '../src/sim/boss.js';
import { hurtPlayer } from '../src/sim/player.js';
import { startExecute } from '../src/sim/execute.js';
import { storeAdd } from '../src/sim/store.js';
import { createInputMap } from '../src/view/inputMap.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const S = RULES.store;
const press = { ...idle, parry: true }, toss = { ...idle, throw: true };
const of = (ev, type) => ev.filter(e => e.type === type);
const count = (w, kind) => { const b = w.bullets; let n = 0; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.kind[i] === kind) n++; return n; };
// 모아 던지기 판: 보스는 오른쪽 9 U에 서 있고 평타는 끈다(보스 체력을 던진 탄만으로 본다)
function sw(opts = {}) {
  const w = quietWorld({ store: true, ...opts });
  w.boss.x = w.player.x + 9; w.boss.z = w.player.z;
  w.shots.nextAt = 1e9;
  return w;
}
// 흰(또는 금) 탄 하나를 받아친다. lead = 누른 뒤 탄이 패링 원에 닿기까지(0.05 = 완벽, 0.2 = 보통)
function catchOne(w, lead = 0.05, kind = K.WHITE, angle = Math.PI / 2) {
  const t0 = 0.375, p = w.player, d = RULES.player.parryR + RULES.bullets.r[kind] + RULES.bullets.parrySpeed * (t0 + lead);
  spawnBullet(w, kind, p.x + Math.cos(angle) * d, p.z + Math.sin(angle) * d, angle + Math.PI, 14);
  const ev = [];
  const go = (sec, input = idle) => { for (let k = 0; k < ticks(sec); k++) { step(w, input); ev.push(...drainEvents(w)); } };
  go(t0); step(w, press); ev.push(...drainEvents(w)); go(lead + 0.3);
  return ev;
}
const give = (w, n, perfect = true) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: perfect ? RULES.reflect.staggerPerfect : RULES.reflect.staggerNormal, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };   // 넣은 사건은 비운다

test('모아 던지기 수치는 모두 유한한 수', () => {
  for (const [k, v] of Object.entries(S)) for (const x of [].concat(v)) assert.ok(Number.isFinite(x), `store.${k} = ${v}`);
  for (const [k, v] of Object.entries(RULES.bot.user)) assert.ok(Number.isFinite(v), `bot.user.${k} = ${v}`);
});

test('기본 판은 모으지 않는다(받으면 지금처럼 되튄다)', () => {
  const w = quietWorld();
  assert.equal(w.opts.store, false); assert.equal(w.opts.hard, false);
  w.boss.x = w.player.x + 9; w.boss.z = w.player.z;
  const ev = catchOne(w);
  assert.equal(of(ev, 'parry').length, 1);
  assert.equal(of(ev, 'storeAdd').length, 0);
  assert.equal(w.player.store.length, 0);
});

test('받으면 모인다: 되튄 탄·피해·무력화 없음', () => {
  const w = sw(), hp = w.boss.hp;
  const ev = catchOne(w, 0.05);
  assert.equal(of(ev, 'parry').length, 1);
  assert.deepEqual(w.player.store, [{ perfect: true, gold: false, stagger: RULES.reflect.staggerPerfect }]);
  assert.equal(of(ev, 'storeAdd')[0].n, 1);
  assert.equal(count(w, K.REFLECT), 0);
  assert.equal(w.boss.hp, hp); assert.equal(w.boss.stagger, 0);
  catchOne(w, 0.2);
  assert.deepEqual(w.player.store[1], { perfect: false, gold: false, stagger: RULES.reflect.staggerNormal });
});

test('가득 찬 뒤 받은 탄은 지금처럼 바로 날아가 피해·무력화(회복 없음)', () => {
  const w = sw(), hp = w.boss.hp;
  give(w, S.cap);
  w.player.hp = 50;
  const ev = catchOne(w, 0.2);
  assert.equal(w.player.store.length, S.cap);
  assert.equal(of(ev, 'storeAdd').length, 0);
  run(w, 1);
  assert.equal(hp - w.boss.hp, RULES.reflect.dmgNormal);
  assert.equal(w.boss.stagger, RULES.reflect.staggerNormal);
  assert.equal(w.player.hp, 50);
});

test('네 번째가 모이면 full', () => {
  const w = sw();
  give(w, S.cap - 1);
  const ev = catchOne(w);
  assert.equal(of(ev, 'storeAdd')[0].full, true);
});

test('근접·장판 패링도 한 칸(무력화는 모은 탄이 든다), 가득이면 바로 무력화', () => {
  const w = sw();
  step(w, press);
  const res = resolveHit(w, { color: 'white', src: RULES.src.combo, dmg: 15, stagger: [12, 20] });
  assert.equal(res.outcome, 'perfect');
  assert.deepEqual(w.player.store, [{ perfect: true, gold: false, stagger: 20 }]);
  assert.equal(w.boss.stagger, 0);
  give(w, S.cap - 1);
  run(w, 0.5); step(w, press);
  resolveHit(w, { color: 'white', src: RULES.src.combo, dmg: 15, stagger: [12, 20] });
  assert.equal(w.player.store.length, S.cap);
  assert.equal(w.boss.stagger, 20);
});

test('던지기: 그 틱에 회복, n발이 0.06초 간격으로 날아가 피해·무력화 × 배율', () => {
  const w = sw(), hp = w.boss.hp;
  give(w, 2, true); give(w, 1, false);
  w.player.hp = 50;
  step(w, toss);
  const ev = drainEvents(w), t = of(ev, 'throw')[0], mul = 1 + S.bonus * 2;
  assert.equal(w.player.hp, 50 + 2 * S.heal[1] + S.heal[0]);
  assert.equal(t.n, 3); assert.equal(t.heal, 2 * S.heal[1] + S.heal[0]);
  assert.equal(w.player.store.length, 0);
  assert.equal(count(w, K.REFLECT), 3);
  const holds = []; for (let i = 0; i < w.bullets.cap; i++) if (w.bullets.alive[i]) holds.push(+(w.bullets.holdUntil[i] - t.t).toFixed(3));
  assert.deepEqual(holds.sort(), [0, S.every, 2 * S.every]);
  const ev2 = []; for (let k = 0; k < ticks(1.5); k++) { step(w, idle); ev2.push(...drainEvents(w)); }
  const want = (2 * S.dmg[1] + S.dmg[0]) * mul;
  assert.ok(Math.abs(hp - w.boss.hp - want) < 1e-6, `피해 ${hp - w.boss.hp} 기대 ${want}`);
  assert.ok(Math.abs(w.boss.stagger - (2 * RULES.reflect.staggerPerfect + RULES.reflect.staggerNormal) * mul) < 1e-6);
  const hits = of(ev2, 'throwHit');
  assert.equal(hits.length, 3);
  assert.deepEqual(hits.map(h => h.last), [false, false, true]);
  assert.ok(Math.abs(hits[2].total - want) < 1e-6);
  assert.equal(w.stats.throws, 1); assert.equal(w.stats.healed, t.heal);
  assert.ok(Math.abs(w.stats.dmg.throw - want) < 1e-6);
});

test('회복은 최대 체력까지', () => {
  const w = sw();
  give(w, 4);
  w.player.hp = RULES.player.hp - 3;
  step(w, toss);
  assert.equal(w.player.hp, RULES.player.hp);
  assert.equal(of(drainEvents(w), 'throw')[0].heal, 3);
});

test('0개·처형·자동 반격·구제 창에서는 던지지 않는다', () => {
  const empty = sw();
  step(empty, toss);
  assert.equal(of(drainEvents(empty), 'denied').filter(e => e.what === 'throw').length, 1);
  const dying = sw(); give(dying, 2); dying.player.dyingAt = 1; dying.player.hp = 50;
  step(dying, toss); assert.equal(dying.player.store.length, 2); assert.equal(dying.player.hp, 50, '구제 창인데 회복');
  const auto = sw(); give(auto, 2); auto.player.auto = { stage: 'back', start: 0, awayBase: 0, buffered: null }; auto.player.autoUntil = 1; auto.player.hp = 50;
  step(auto, toss); assert.equal(auto.player.store.length, 2); assert.equal(auto.player.hp, 50, '자동 반격 중인데 회복');
  const ex = sw(); give(ex, 2); ex.player.hp = 50;
  ex.boss.x = ex.player.x + 3; addStagger(ex, 100); startExecute(ex);
  step(ex, toss); assert.equal(ex.player.store.length, 2); assert.equal(ex.player.hp, 50, '처형 중인데 회복');
});

test('금 탄: 반격 기회는 받는 순간 그대로, 저절로 던지지 않는다', () => {
  const w = sw();
  give(w, 2);
  const ev = catchOne(w, 0.05, K.GOLD);
  assert.equal(of(ev, 'counterChance').length, 1);
  assert.equal(of(ev, 'throw').length, 0);
  assert.equal(w.player.store.length, 3);
  assert.deepEqual(w.player.store[2], { perfect: true, gold: true, stagger: RULES.reflect.staggerGold });
});

test('맞아도 모은 탄은 그대로', () => {
  const w = sw();
  give(w, 3);
  hurtPlayer(w, 10, 1, 0, 0);
  assert.equal(w.player.store.length, 3);
});

test('hard: 받는 피해 ×1.3', () => {
  const a = quietWorld(), b = quietWorld({ hard: true });
  hurtPlayer(a, 10, 1, 0, 0); hurtPlayer(b, 10, 1, 0, 0);
  assert.equal(a.player.hp, RULES.player.hp - 10);
  assert.ok(Math.abs(b.player.hp - (RULES.player.hp - 10 * S.hard)) < 1e-9);
});

test('무기: 스킬 게이지는 안 차고 U는 일제 사격이 아니다, 가동은 그대로, 산탄은 던질 때', () => {
  const w = sw({ gear: 'all' });
  const ev = catchOne(w);
  assert.equal(w.weapons.gauge, 0);
  assert.ok(w.weapons.chargeUntil > 0, '받아도 무기가 깨어나지 않음');
  assert.equal(ev.filter(e => e.type === 'weaponFire' && e.kind === 'burst').length, 0);
  give(w, 1);
  w.weapons.gauge = 6;
  step(w, { ...toss, skill: 'missile' });
  const ev2 = drainEvents(w);
  assert.equal(of(ev2, 'weaponSkill').length, 0);
  assert.equal(ev2.filter(e => e.type === 'weaponFire' && e.kind === 'burst').length, 2 * RULES.weapons.burst.n);
});

test('던진 탄이 날아가는 중 보스가 죽어도 판이 깨지지 않는다', () => {
  const w = sw();
  give(w, 4);
  w.boss.hp = 120;
  step(w, toss);
  run(w, 1.5);
  assert.equal(w.result, 'win');
});

test('같은 seed면 모아 던지기 판도 같다(해시에 모은 수)', () => {
  const play = () => {
    const w = createWorld({ seed: 7, store: true, gear: 'all' });
    w.player.hp = w.player.maxHp = 1e9;
    for (let k = 0; k < 40 * 120; k++) { const a = k / 240; step(w, { mx: Math.cos(a), mz: Math.sin(a), parry: k % 37 === 0, dodge: k % 401 === 0, throw: k % 500 === 499 }); drainEvents(w); }
    return w;
  };
  const a = play(), b = play();
  assert.equal(stateHash(a), stateHash(b));
  const w = sw(), h0 = stateHash(w); give(w, 1);
  assert.notEqual(stateHash(w), h0);
});

test('KeyU = 던지기(누른 순간 한 번)', () => {
  const m = createInputMap(0);
  m.keyDown('KeyU', 0);
  assert.equal(m.take().throw, true);
  m.keyDown('KeyU', 5);   // 자동 반복
  assert.equal(m.take().throw, false);
});

// ── 마지막 검토로 고친 것
test('구제 창 동안 닿은 던진 탄은 사라지지 않고 기다린다(피해 0으로 버려지지 않게)', () => {
  const w = sw(), hp = w.boss.hp;
  give(w, 4);
  step(w, toss);
  w.player.dyingAt = w.time + 10;   // 구제 창이 열려 있는 동안
  w.player.stock.bomb = 0;
  for (let k = 0; k < ticks(1); k++) { w.player.dyingAt = w.time + 10; step(w, idle); drainEvents(w); }
  assert.equal(count(w, K.REFLECT), 4, '탄이 먹힘');
  assert.equal(w.boss.hp, hp); assert.equal(w.boss.stagger, 0);
  w.player.dyingAt = null;
  run(w, 0.3);
  assert.ok(Math.abs(hp - w.boss.hp - 4 * S.dmg[1] * (1 + 3 * S.bonus)) < 1e-6);
});

test('던진 탄들이 겹쳐 날아가도 합계는 다 더한 값', () => {
  const w = sw(), hp = w.boss.hp;
  give(w, 2); step(w, toss);
  const ev = []; for (let k = 0; k < ticks(0.33); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(of(ev, 'throwHit').length, 1, '첫 발만 맞은 때여야 한다');
  give(w, 2); step(w, toss);
  for (let k = 0; k < ticks(1.5); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  const hits = of(ev, 'throwHit');
  assert.equal(hits.length, 4);
  assert.ok(Math.abs(Math.max(...hits.map(h => h.total)) - (hp - w.boss.hp)) < 1e-6, `합계 ${hits.map(h => h.total)} 실제 ${hp - w.boss.hp}`);
});

test('던진 탄이 날아가는 중 그로기가 와도 나머지가 다 맞는다(그로기 배율까지)', () => {
  const w = sw();
  give(w, 4);
  w.boss.stagger = 70;
  step(w, toss);
  const ev = []; for (let k = 0; k < ticks(1.5); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(of(ev, 'groggy').length, 1);
  assert.equal(of(ev, 'throwHit').length, 4);
  assert.ok(Math.abs(w.stats.dmg.throw - 4 * S.dmg[1] * (1 + 3 * S.bonus)) < 1e-6);
  assert.ok(w.stats.dmg.groggy > 0, '그로기 뒤 맞은 탄에 배율이 없음');
});

test('멈춘 동안 누른 U는 버린다', () => {
  const m = createInputMap(0);
  m.keyDown('KeyU', 0);
  m.clearPresses();
  assert.equal(m.take().throw, false);
});
