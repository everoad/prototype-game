// Task 3: 회피 — 앞이 빠른 곡선, 충전, 잠김 신호, 미리 받기, 무적·아슬아슬, 끝나면 바로 걷기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const press = { ...idle, dodge: true };
const count = (ev, type) => ev.filter(e => e.type === type).length;

test('회피는 0.25초에 5 U, 절반 시간에 70%', () => {
  const w = quietWorld(); const x0 = w.player.x;
  step(w, { ...idle, mx: 1, dodge: true }); run(w, RULES.dodge.dur / 2 - RULES.dt);
  assert.ok(Math.abs((w.player.x - x0) - 3.5) < 0.1, `절반 시간 ${w.player.x - x0}`);
  run(w, RULES.dodge.dur / 2);
  assert.ok(Math.abs((w.player.x - x0) - 5) < 0.05, `끝 ${w.player.x - x0}`);
});

test('충전 2회, 하나당 3초; 충전이 없으면 denied', () => {
  const w = quietWorld();
  step(w, press); run(w, 0.3);
  step(w, press); run(w, 0.3);
  drainEvents(w);
  step(w, press);
  let ev = drainEvents(w);
  assert.equal(count(ev, 'dodge'), 0);
  const d = ev.find(e => e.type === 'denied');
  assert.deepEqual([d.what, d.why], ['dodge', 'charges']);
  run(w, RULES.dodge.recharge - 0.6 + 0.05);   // 첫 회피에서 3초 조금 넘게
  step(w, press);
  ev = drainEvents(w);
  assert.equal(count(ev, 'dodge'), 1);
});

test('회피 중에 누른 회피는 0.1초 안이면 끝나자마자 나간다', () => {
  const end = RULES.dodge.dur;
  for (const [before, expect] of [[0.08, 2], [0.15, 1]]) {
    const w = quietWorld();
    step(w, press);
    const n = ticks(end - before) - 1;
    for (let k = 0; k < n; k++) step(w, idle);
    step(w, press);                                   // 끝 before초 전 누름
    const mid = drainEvents(w);
    assert.equal(mid.find(e => e.type === 'denied')?.why, 'busy');
    run(w, 0.3);
    const ev = [...mid, ...drainEvents(w)];
    assert.equal(count(ev, 'dodge'), expect, `끝 ${before}초 전 누름`);
  }
});

test('무적 동안 겹친 탄은 맞지 않고 아슬아슬', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.NORMAL, p.x, p.z + 3, -Math.PI / 2, 12);    // 마주 오는 탄 — 회피 무적 중 판정 점을 지나감
  step(w, { ...idle, mz: 1, dodge: true });                      // 탄 쪽으로 굴러 마주 지나감
  run(w, 0.3);
  const ev = drainEvents(w);
  assert.equal(count(ev, 'hurt'), 0);
  assert.equal(count(ev, 'nearMiss'), 1);
  assert.equal(ev.find(e => e.type === 'nearMiss').red, false);
});

test('빨간 탄을 아슬아슬 넘기면 red', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.RED, p.x, p.z + 3.5, -Math.PI / 2, 18);
  step(w, { ...idle, mz: 1, dodge: true });
  run(w, 0.3);
  const nm = drainEvents(w).filter(e => e.type === 'nearMiss');
  assert.ok(nm.some(e => e.red));
});

test('입력이 없으면 보스 반대쪽으로 구른다', () => {
  const w = quietWorld(); const x0 = w.player.x;
  assert.ok(w.boss.x > w.player.x);
  step(w, press); run(w, 0.3);
  assert.ok(w.player.x < x0);
});

test('회피가 끝난 틱부터 바로 걷는다', () => {
  const w = quietWorld();
  step(w, { ...idle, mx: 1, dodge: true });
  for (let k = 1; k < ticks(RULES.dodge.dur); k++) step(w, idle);
  const x0 = w.player.x;
  step(w, { ...idle, mz: 1 });
  assert.equal(w.player.x, x0);
  assert.ok(Math.abs(w.player.z - RULES.player.speed * RULES.dt) < 1e-9);
});
