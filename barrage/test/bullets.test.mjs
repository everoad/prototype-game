// Task 2: 적 탄 — 흰·금 한 속도, 0.4초 규칙, 선분 판정, 맞음, 스침, 상한.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet, liveCount } from '../src/sim/bullets.js';
import { quietWorld, idle, run, types } from './helpers.mjs';

test('흰·금 탄은 주는 속도와 무관하게 14 U/s', () => {
  const w = quietWorld();
  const id = spawnBullet(w, K.WHITE, 0, 0, 0, 30);
  assert.equal(w.bullets.vx[id], RULES.bullets.parrySpeed);
  const g = spawnBullet(w, K.GOLD, 0, 0, Math.PI / 2, 5);
  assert.ok(Math.abs(w.bullets.vz[g] - RULES.bullets.parrySpeed) < 1e-9);
});

test('플레이어에게서 6.4 U 안에 생기는 흰·금 탄은 보통 탄이 된다', () => {
  const w = quietWorld(); const p = w.player;
  const near = spawnBullet(w, K.WHITE, p.x + 6.0, p.z, Math.PI, 14);
  const far = spawnBullet(w, K.GOLD, p.x + 6.5, p.z, Math.PI, 14);
  assert.equal(w.bullets.kind[near], K.NORMAL); assert.equal(w.bullets.kind[far], K.GOLD);
});

test('빠른 탄도 판정 점을 건너뛰지 않는다', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.NORMAL, p.x, p.z - 3, Math.PI / 2, 60);
  run(w, 0.2);
  const ev = types(w);
  assert.equal(ev.filter(t => t === 'hurt').length, 1);
  assert.equal(w.player.hp, RULES.player.hp - RULES.bullets.dmg[K.NORMAL]);
});

test('맞으면 1초 무적, 둘레 2.5 U 탄이 지워진다', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.NORMAL, p.x + 1, p.z, Math.PI, 20);           // 곧 맞힘
  const keepNear = spawnBullet(w, K.NORMAL, p.x, p.z + 2.6, 0, 0.0001);
  const goNear = spawnBullet(w, K.NORMAL, p.x, p.z + 2.4, 0, 0.0001);
  run(w, 0.1);
  const hp = w.player.hp;
  assert.equal(hp, RULES.player.hp - RULES.bullets.dmg[K.NORMAL]);
  assert.equal(w.bullets.alive[goNear], 0, '2.4 U 탄은 지워져야 한다');
  assert.equal(w.bullets.alive[keepNear], 1, '2.6 U 탄은 남아야 한다');
  run(w, 0.4);
  spawnBullet(w, K.NORMAL, p.x + 1, p.z, Math.PI, 20);             // 0.5초째 또 닿음
  run(w, 0.1);
  assert.equal(w.player.hp, hp, '무적 중에는 체력 그대로');
});

test('맞은 다음 틱에도 움직인다', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.NORMAL, p.x + 0.5, p.z, Math.PI, 30);
  for (let k = 0; k < 10 && !types(w).includes('hurt'); k++) step(w, idle);
  const x0 = w.player.x;
  step(w, { ...idle, mx: -1 });
  assert.ok(Math.abs((x0 - w.player.x) - RULES.player.speed * RULES.dt) < 1e-9);
});

test('스침은 탄마다 한 번, 맞은 탄과 무적 중에는 없다', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.NORMAL, p.x + 0.5, p.z - 4, Math.PI / 2, 10);   // 0.5 U 옆을 지나감
  spawnBullet(w, K.NORMAL, p.x + 1.0, p.z - 4, Math.PI / 2, 10);   // 1.0 U 옆
  run(w, 1);
  let ev = types(w);
  assert.equal(ev.filter(t => t === 'graze').length, 1);
  assert.equal(ev.filter(t => t === 'hurt').length, 0);
  // 맞는 탄은 스침이 아니다
  spawnBullet(w, K.NORMAL, p.x, p.z - 4, Math.PI / 2, 10);
  run(w, 1);
  ev = types(w);
  assert.equal(ev.filter(t => t === 'hurt').length, 1);
  assert.equal(ev.filter(t => t === 'graze').length, 0);
  // 무적 중(방금 맞음)에는 스침 없음
  spawnBullet(w, K.NORMAL, p.x + 0.5, p.z - 1, Math.PI / 2, 10);
  w.player.invulnUntil = w.time + 1;
  run(w, 0.5);
  assert.equal(types(w).filter(t => t === 'graze').length, 0);
  assert.equal(w.stats.grazes, 1);
});

test('상한 400발을 넘으면 -1', () => {
  const w = quietWorld();
  for (let k = 0; k < RULES.bullets.cap; k++) assert.notEqual(spawnBullet(w, K.NORMAL, 9, 6, 0, 0), -1);
  assert.equal(liveCount(w), RULES.bullets.cap);
  assert.equal(spawnBullet(w, K.NORMAL, 9, 6, 0, 0), -1);
});
