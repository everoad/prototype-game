// 원거리 재설계 Task 2: 바탕 탄막(흰·금 없음, 근접·그로기 중 멈춤), 쌍둥이 구슬(2단계), 쓸어내는 레이저, 탄 상한 600.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { startPattern, updatePattern } from '../src/sim/patterns.js';
import { addStagger } from '../src/sim/boss.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

function brainWorld(opts = {}) {
  const w = createWorld({ seed: 4, ...opts });
  w.player.invulnUntil = 1e9;
  w.boss.hp = w.boss.maxHp = 1e9;
  if (opts.phase === 2) w.boss.hp = w.boss.maxHp * RULES.brain.phaseAt - 1;
  return w;
}
const LAYER_SRC = new Set([RULES.src.background, RULES.src.orbs]);

test('바탕 탄막에는 흰·금이 없다', () => {
  const w = brainWorld({ phase: 2 });
  let n = 0;
  for (let k = 0; k < ticks(30); k++) {
    step(w, idle);
    for (const e of drainEvents(w)) if (e.type === 'fire' && LAYER_SRC.has(e.src)) { n++; assert.equal(e.kind, K.NORMAL); }
  }
  assert.ok(n > 50, `바탕·구슬 탄 ${n}`);
});

test('바탕 탄막은 근접 콤보·그로기 동안 멈춘다', () => {
  const w = brainWorld();
  let during = 0, groggyOnce = false;
  for (let k = 0; k < ticks(60); k++) {
    if (!groggyOnce && w.time > 20) { addStagger(w, 100); groggyOnce = true; }
    const st = w.boss.state;
    step(w, idle);
    for (const e of drainEvents(w)) if (e.type === 'fire' && e.src === RULES.src.background && (st === 'melee' || st === 'rush' || st === 'groggy')) during++;
  }
  assert.equal(during, 0);
});

test('쌍둥이 구슬은 2단계에만, 보스 둘레 2.5 U를 돌며 쏜다', () => {
  const one = brainWorld();
  let orb1 = 0;
  for (let k = 0; k < ticks(20); k++) { step(one, idle); orb1 += drainEvents(one).filter(e => e.type === 'orbFire').length; }
  assert.equal(orb1, 0);
  const two = brainWorld({ phase: 2 });
  let orb2 = 0;
  for (let k = 0; k < ticks(20); k++) {
    step(two, idle); orb2 += drainEvents(two).filter(e => e.type === 'orbFire').length;
    if (two.boss.orbs) for (const o of two.boss.orbs) assert.ok(Math.abs(Math.hypot(o.x - two.boss.x, o.z - two.boss.z) - RULES.layers.orbs.r) < 1e-6);
  }
  assert.ok(orb2 > 10, `구슬 탄 ${orb2}`);
});

test('레이저 조준은 발사 0.2초 전까지 따라오고, 빔은 40°를 0.8초에 쓴다', () => {
  const w = quietWorld(); const L = RULES.laser;
  const run = startPattern(w, 8);
  const tick = sec => { for (let k = 0; k < ticks(sec); k++) { updatePattern(w, run); step(w, idle); } };
  tick(0.1);
  const beam = w.beams[0], a0 = beam.angle;
  w.player.z += 2; tick(0.15);
  assert.notEqual(beam.angle, a0, '조준이 따라오지 않음');
  tick(L.aim - 0.25 - 0.2 + 0.05);   // 고정 뒤
  const locked = beam.angle; w.player.z -= 3; tick(0.05);
  assert.equal(beam.angle, locked);
  tick(L.aim - (w.time - beam.born) + 0.01);
  const start = beam.angle;
  tick(L.sweepSec - 0.03);
  const swept = Math.abs(beam.angle - start) * 180 / Math.PI;
  assert.ok(Math.abs(swept - L.sweepDeg) < 3, `쓴 각 ${swept}`);
});

test('빔에 닿으면 맞고, 구르기 무적이면 아슬아슬(빨강)', () => {
  // 맞음: 플레이어가 빔 쓰는 길 위에 서 있다
  const w = quietWorld();
  const run = startPattern(w, 8);
  const ev = [];
  for (let k = 0; k < ticks(RULES.laser.aim + RULES.laser.sweepSec + 0.1); k++) { updatePattern(w, run); step(w, idle); ev.push(...drainEvents(w)); }
  assert.ok(ev.some(e => e.type === 'hurt' && e.src === RULES.src.laser), '빔에 맞지 않음');
  // 아슬아슬: 빔이 켜질 때 구른다
  const v = quietWorld();
  const run2 = startPattern(v, 8);
  const ev2 = [];
  for (let k = 0; k < ticks(RULES.laser.aim + RULES.laser.sweepSec + 0.1); k++) {
    updatePattern(v, run2);
    const t = v.time - v.beams[0]?.born;
    step(v, { ...idle, dodge: Math.abs(t - RULES.laser.aim) < RULES.dt / 2, mx: 0, mz: 0 });
    ev2.push(...drainEvents(v));
  }
  assert.ok(ev2.some(e => e.type === 'nearMiss' && e.red), '아슬아슬 없음');
});

test('탄 600발이 차면 새 탄은 -1이고 판은 이어진다', () => {
  const w = quietWorld();
  assert.equal(RULES.bullets.cap, 600);
  for (let k = 0; k < 600; k++) assert.notEqual(spawnBullet(w, K.NORMAL, 9.5, 6.5, 0, 0), -1);
  assert.equal(spawnBullet(w, K.NORMAL, 9.5, 6.5, 0, 0), -1);
  for (let k = 0; k < 60; k++) step(w, idle);
});
