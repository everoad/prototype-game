// Task 5: 패링 — 누름 사건, 창·완벽, 여러 발, 탄 멈춤, 실패 경직, 되튐 피해·무력화.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const press = { ...idle, parry: true };
const of = (ev, type) => ev.filter(e => e.type === type);

// 플레이어 쪽으로 오는 흰 탄: 플레이어에서 dist만큼, 각 a 쪽에 둔다(0.4초 규칙 때문에 6.4 U 넘게).
function incoming(w, kind, dist, a) {
  const p = w.player;
  return spawnBullet(w, kind, p.x + Math.cos(a) * dist, p.z + Math.sin(a) * dist, a + Math.PI, 14);
}
// 패링 원(0.8) + 탄 반지름에 닿는 데 걸리는 시간
const reach = (dist, kind) => (dist - RULES.player.parryR - RULES.bullets.r[kind]) / RULES.bullets.parrySpeed;

test('누르면 받은 것이 없어도 parryStart가 난다', () => {
  const w = quietWorld();
  step(w, press);
  assert.equal(of(drainEvents(w), 'parryStart').length, 1);
});

test('창 0.25초 동안 패링 원에 들어온 흰 탄은 몇 발이든 되튄다', () => {
  const w = quietWorld();
  const t0 = 0.375;
  // 누른 뒤 0.05·0.1·0.2초에 원에 닿는 거리
  const d = [0.05, 0.1, 0.2].map(t => RULES.player.parryR + RULES.bullets.r[K.WHITE] + RULES.bullets.parrySpeed * (t0 + t));
  const ids = [incoming(w, K.WHITE, d[0], Math.PI / 2), incoming(w, K.WHITE, d[1], -Math.PI / 2), incoming(w, K.WHITE, d[2], 0)];
  ids.forEach(i => assert.equal(w.bullets.kind[i], K.WHITE));
  run(w, t0);
  step(w, press);
  run(w, 0.3);
  const ev = drainEvents(w);
  const parries = of(ev, 'parry');
  assert.equal(parries.length, 3);
  assert.deepEqual(parries.map(e => e.first), [true, false, false]);
  assert.deepEqual(parries.map(e => e.chain), [1, 2, 3]);
  assert.equal(of(ev, 'hurt').length, 0);
  ids.forEach(i => assert.equal(w.bullets.kind[i], K.REFLECT));
});

test('앞 0.12초 안이면 완벽', () => {
  const w = quietWorld();
  const t0 = 0.4;
  const d = [0.1, 0.2].map(t => RULES.player.parryR + RULES.bullets.r[K.WHITE] + RULES.bullets.parrySpeed * (t0 + t));
  incoming(w, K.WHITE, d[0], Math.PI / 2); incoming(w, K.WHITE, d[1], 0);   // 먼 탄은 +x 쪽(판 안)
  run(w, t0); step(w, press); run(w, 0.3);
  assert.deepEqual(of(drainEvents(w), 'parry').map(e => e.perfect), [true, false]);
});

test('받은 탄은 0.06초 제자리에 멈췄다가 보스로 날아간다', () => {
  const w = quietWorld();
  const id = incoming(w, K.WHITE, 7, Math.PI / 2);
  run(w, reach(7, K.WHITE) - 0.05);
  step(w, press);
  let caughtAt = null;
  for (let k = 0; k < ticks(0.2) && caughtAt === null; k++) { step(w, idle); if (w.bullets.kind[id] === K.REFLECT) caughtAt = [w.bullets.x[id], w.bullets.z[id]]; }
  assert.ok(caughtAt, '받지 못함');
  run(w, 0.05);
  assert.deepEqual([w.bullets.x[id], w.bullets.z[id]], caughtAt);
  run(w, 0.05);
  const dBefore = Math.hypot(caughtAt[0] - w.boss.x, caughtAt[1] - w.boss.z);
  const dNow = Math.hypot(w.bullets.x[id] - w.boss.x, w.bullets.z[id] - w.boss.z);
  assert.ok(dNow < dBefore - 0.2, '보스 쪽으로 움직이지 않음');
});

test('보통·빨간 탄은 패링 중에도 맞는다', () => {
  for (const kind of [K.NORMAL, K.RED]) {
    const w = quietWorld(); const p = w.player;
    spawnBullet(w, kind, p.x, p.z + 2, -Math.PI / 2, 10);
    step(w, press);
    run(w, 0.25);
    assert.equal(of(drainEvents(w), 'hurt').length, 1, `kind ${kind}`);
  }
});

test('한 발도 못 받으면 0.25초 경직, 그동안 누르면 denied; 받으면 바로 다시 누를 수 있다', () => {
  const w = quietWorld();
  step(w, press); run(w, RULES.parry.window + RULES.dt);
  let ev = drainEvents(w);
  assert.equal(of(ev, 'parryFail').length, 1);
  step(w, press);
  ev = drainEvents(w);
  assert.equal(of(ev, 'parryStart').length, 0);
  assert.equal(of(ev, 'denied')[0]?.why, 'busy');
  run(w, RULES.parry.failRecovery + 0.05);
  step(w, press);
  assert.equal(of(drainEvents(w), 'parryStart').length, 1);
  // 받은 창이 끝나면 경직 없이 바로
  const v = quietWorld();
  incoming(v, K.WHITE, 7, Math.PI / 2);
  run(v, reach(7, K.WHITE) - 0.05); step(v, press); run(v, RULES.parry.window);
  drainEvents(v);
  step(v, press);
  ev = drainEvents(v);
  assert.equal(of(ev, 'parryFail').length, 0);
  assert.equal(of(ev, 'parryStart').length, 1);
});

test('되튄 탄이 보스에 맞으면 피해와 무력화', () => {
  const R = RULES.reflect;
  for (const [kind, lead, dmg, stagger] of [[K.WHITE, 0.2, R.dmgNormal, R.staggerNormal], [K.WHITE, 0.05, R.dmgPerfect, R.staggerPerfect], [K.GOLD, 0.2, R.dmgNormal, R.staggerGold]]) {
    const w = quietWorld();
    incoming(w, kind, 7, Math.PI / 2);
    run(w, reach(7, kind) - lead);
    step(w, press);
    run(w, 1.2);
    const hits = of(drainEvents(w), 'reflectHit');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].dmg, dmg);
    assert.equal(w.stats.dmg.reflect, dmg);
    assert.equal(w.boss.stagger, stagger);
  }
});
