// Task 4: 보스 몸(단단함·미끄러짐), 자동 사격(가까울수록 많이 맞음), 무력화·그로기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet, liveCount } from '../src/sim/bullets.js';
import { damageBoss, addStagger, bossGroggy } from '../src/sim/boss.js';
import { clampToBoard } from '../src/sim/geom.js';
import { quietWorld, idle, run } from './helpers.mjs';

const gap = w => Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
const minGap = () => RULES.boss.r + RULES.player.bodyR - 1e-6;

test('1초에 60발을 쏜다', () => {
  const w = quietWorld();
  run(w, 1.0);
  assert.equal(w.stats.shotsFired, 60);
});

test('가까울수록 많이 맞는다', () => {
  const rate = d => {
    const w = quietWorld(); w.player.x = w.boss.x - d; w.player.z = w.boss.z;
    run(w, 2.0);
    return w.stats.shotsHit / w.stats.shotsFired;   // 끝에 날던 몇 발은 아직 안 닿았다(3 U면 몇 %)
  };
  assert.ok(rate(3) > 0.95, `3 U ${rate(3)}`);
  assert.ok(rate(14) < 0.75, `14 U ${rate(14)}`);
  assert.ok(rate(3) > rate(8) && rate(8) > rate(14));
});

test('회피 중에는 쏘지 않는다', () => {
  const w = quietWorld();
  run(w, 0.2); drainEvents(w);
  step(w, { ...idle, dodge: true });
  run(w, RULES.dodge.dur - RULES.dt);
  assert.equal(drainEvents(w).filter(e => e.type === 'shoot').length, 0);
  run(w, 0.2);
  assert.ok(drainEvents(w).some(e => e.type === 'shoot'));
});

test('보스 몸을 지나갈 수 없고 둘레를 따라 미끄러진다', () => {
  const w = quietWorld(); w.boss.x = 0; w.boss.z = 0; w.player.x = -4; w.player.z = 0.3;
  const trail = [];
  for (let k = 0; k < 240; k++) {
    step(w, { ...idle, mx: 1 });
    assert.ok(gap(w) >= minGap(), `틱 ${k} 겹침 ${gap(w)}`);
    trail.push([w.player.x, w.player.z]);
  }
  // 마지막 1초에도 계속 움직인다(둘레를 따라 돌아 나감)
  const a = trail[trail.length - 120], b = trail[trail.length - 1];
  assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) > 1, '멈춤');
});

test('보스 몸과 난간 사이에 끼어도 판 안, 몸 밖', () => {
  const w = quietWorld(); const hz = RULES.board.hz;
  w.boss.x = 0; w.boss.z = -hz + 1.8;          // 난간과 몸 사이 틈 0.2 U(몸 지름 1보다 좁음)
  w.player.x = -4; w.player.z = -hz + 0.5;
  step(w, { ...idle, mx: 1, dodge: true });
  for (let k = 0; k < 60; k++) {
    step(w, { ...idle, mx: 1 });
    const [cx, cz] = clampToBoard(RULES, w.player.x, w.player.z, RULES.player.bodyR);
    assert.equal(w.player.x, cx); assert.equal(w.player.z, cz);
    assert.ok(gap(w) >= minGap(), `틱 ${k} 겹침 ${gap(w)}`);
  }
});

test('무력화 100이면 그로기 3초, 탄이 지워지고 피해 1.5배', () => {
  const w = quietWorld();
  spawnBullet(w, K.NORMAL, 8, 6, 0, 0);
  addStagger(w, 100);
  assert.ok(bossGroggy(w));
  assert.equal(liveCount(w), 0);
  assert.equal(w.boss.stagger, 0);
  assert.ok(drainEvents(w).some(e => e.type === 'groggy'));
  const hp = w.boss.hp;
  damageBoss(w, 10, 'reflect');
  assert.equal(w.boss.hp, hp - 15);
  assert.equal(w.stats.dmg.groggy, 5);
  run(w, RULES.stagger.groggy + 0.05);
  assert.ok(!bossGroggy(w));
});

test('쏘기만으로는 무력화가 차지 않는다', () => {
  const w = quietWorld(); w.player.x = w.boss.x - 3;
  run(w, 10);
  assert.equal(w.boss.stagger, 0);
  assert.ok(w.boss.hp < RULES.boss.hp);
});

test('체력 0이면 이기고 더 쏘지 않는다', () => {
  const w = quietWorld();
  damageBoss(w, RULES.boss.hp, 'shot');
  assert.equal(w.result, 'win');
  drainEvents(w);
  run(w, 0.5);
  assert.equal(drainEvents(w).filter(e => e.type === 'shoot').length, 0);
});
