// Task 7: 순간 돌진(피해 없음, 3.1 U에서 멈춤, 도착 때 탄 지우기)과 근접 장판·근접 패링.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet, liveCount } from '../src/sim/bullets.js';
import { startRush, updateRush, startCombo, updateCombo } from '../src/sim/melee.js';
import { clampToBoard } from '../src/sim/geom.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const gap = w => Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
const stopAt = () => RULES.boss.r + RULES.player.bodyR + RULES.rush.gap;   // 3.1

function rushUntilArrive(w, combo = 'A', input = () => idle, each = null) {
  startRush(w, combo);
  for (let k = 0; k < ticks(3); k++) { if (updateRush(w)) return true; step(w, input(w)); each?.(w); }
  return false;
}

test('돌진은 피해가 없고 가운데 3.1 U에서 멈춘다', () => {
  const w = quietWorld();
  assert.ok(rushUntilArrive(w));
  assert.ok(Math.abs(gap(w) - stopAt()) < 0.05, `거리 ${gap(w)}`);
  assert.equal(w.player.hp, RULES.player.hp);
  const ev = drainEvents(w).map(e => e.type);
  assert.ok(ev.includes('rushStart') && ev.includes('rushArrive'));
  assert.ok(!ev.includes('hurt'));
});

test('움츠림은 첫 타의 색으로 번쩍인다', () => {
  const w = quietWorld();
  startRush(w, 'B');
  const wu = drainEvents(w).find(e => e.type === 'windup');
  assert.deepEqual([wu.color, wu.kind], ['white', 'rush']);
});

test('돌진이 도착해도 판의 적 탄은 그대로다(사용자 2026-11-17 "탄막이 없어지는 건 과하다")', () => {
  const w = quietWorld();
  for (let k = 0; k < 5; k++) spawnBullet(w, K.NORMAL, 8, -6 + k, 0, 0);
  assert.equal(liveCount(w), 5);
  assert.ok(rushUntilArrive(w));
  assert.equal(liveCount(w), 5);
});

test('모서리에 몰린 플레이어를 밀어도 판 안, 보스 몸 밖', () => {
  const w = quietWorld();
  w.player.x = -9.5; w.player.z = 6.5; w.boss.x = 8.4; w.boss.z = -5.4;
  const check = w => {
    const [cx, cz] = clampToBoard(RULES, w.player.x, w.player.z, RULES.player.bodyR);
    assert.equal(w.player.x, cx); assert.equal(w.player.z, cz);
    assert.ok(gap(w) >= RULES.boss.r + RULES.player.bodyR - 1e-6, `겹침 ${gap(w)}`);
  };
  // 플레이어가 돌진해 오는 보스 쪽으로 걸어 들어가 부딪힌다
  assert.ok(rushUntilArrive(w, 'A', () => ({ ...idle, mx: 0.7, mz: -0.7 }), check));
  for (let k = 0; k < ticks(0.5); k++) { step(w, { ...idle, mx: -0.7, mz: 0.7 }); check(w); }
});

test('같은 종류 타의 예고 시간은 콤보와 무관하게 같다', () => {
  const warns = combo => {
    const w = quietWorld(); w.boss.x = w.player.x + stopAt(); const out = {};
    startCombo(w, combo);
    for (let k = 0; k < ticks(4); k++) {
      for (const a of w.melee.areas) (out[a.kind] ??= new Set()).add(a.warn);
      if (updateCombo(w)) break; step(w, idle);
    }
    return out;
  };
  const a = warns('A'), b = warns('B');
  assert.equal(a.swing.size, 1); assert.deepEqual([...a.swing], [...b.swing]);
  assert.deepEqual([...a.swing], [RULES.melee.swing.warn]);
  assert.deepEqual([...b.slam], [RULES.melee.slam.warn]);
});

test('근접 장판을 깔 때마다 그 타의 색으로 번쩍인다', () => {
  const w = quietWorld(); w.boss.x = w.player.x + stopAt();
  startCombo(w, 'A');
  const colors = [];
  for (let k = 0; k < ticks(4); k++) {
    for (const e of drainEvents(w)) if (e.type === 'windup' && e.kind === 'melee') colors.push(e.color);
    if (updateCombo(w)) break; step(w, idle);
  }
  assert.deepEqual(colors, ['white', 'white', 'gold']);
});

test('빨간 내려찍기는 장판 가운데서도 걸어서 빠져나간다', () => {
  const m = RULES.melee.slam; assert.ok((m.warn - 0.2) * RULES.player.speed >= m.R + RULES.player.bodyR);
});

test('가만히 있으면 근접에 맞는다', () => {
  const w = quietWorld(); w.boss.x = w.player.x + stopAt();
  startCombo(w, 'A');
  for (let k = 0; k < ticks(0.7); k++) { updateCombo(w); step(w, idle); }
  assert.ok(drainEvents(w).some(e => e.type === 'hurt' && e.src === RULES.src.combo));
  assert.equal(w.melee.taken, false);
});

test('흰 휘두르기 패링 = 무력화 12, 완벽 20, 보스 0.4 U 밀림', () => {
  for (const [lead, stagger, perfect] of [[0.2, RULES.melee.stagger.normal, false], [0.05, RULES.melee.stagger.perfect, true]]) {
    const w = quietWorld(); w.boss.x = w.player.x + stopAt();
    startCombo(w, 'A');
    const hitAt = ticks(RULES.melee.swing.warn), pressAt = hitAt - ticks(lead);
    let bx0 = null;
    for (let k = 0; k <= hitAt + 2; k++) {
      updateCombo(w);
      if (k === hitAt - 1) bx0 = w.boss.x;
      step(w, { ...idle, parry: k === pressAt });
    }
    const ev = drainEvents(w);
    const p = ev.find(e => e.type === 'parry');
    assert.ok(p, `${lead}초 앞 누름: 패링 없음`);
    assert.deepEqual([p.kind, p.perfect, p.first, p.chain], ['melee', perfect, true, 1]);
    assert.equal(w.boss.stagger, stagger);
    assert.ok(Math.abs((w.boss.x - bx0) - RULES.melee.push) < 1e-6, `밀림 ${w.boss.x - bx0}`);
    assert.ok(!ev.some(e => e.type === 'hurt'));
    assert.ok(!ev.some(e => e.type === 'parryFail'));
    assert.equal(w.melee.taken, true);
  }
});
