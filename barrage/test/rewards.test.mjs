// Task 8: 반격 기회(과열), 완전 패링 반격(붙기 → 일제 사격 → 뒤로 튀기), 회복 변형.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { startCombo, updateCombo } from '../src/sim/melee.js';
import { startFullCounter } from '../src/sim/rewards.js';
import { clampToBoard } from '../src/sim/geom.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const FC = () => RULES.fullCounter;
const autoLen = () => FC().dashIn + FC().volley + FC().back;
const gap = w => Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
const stopAt = () => RULES.boss.r + RULES.player.bodyR + RULES.rush.gap;

// 콤보를 돌리며 parryOn[i]가 참인 타는 타격 0.05초 전에 패링을 누른다. 사건을 모아 돌려준다.
function playCombo(w, combo, parryOn, { input = () => idle, extra = 1.5 } = {}) {
  const M = RULES.melee, list = RULES.combos[combo];
  // 타격 시각(콤보 시작 기준): 장판 → 예고 → 타격 → active + recover → 다음 장판
  const hits = []; let t = 0;
  for (const [kind] of list) { t += M[kind].warn; hits.push(t); t += M.active + M.recover; }
  const press = new Set(hits.filter((_, i) => parryOn[i]).map(h => ticks(h) - ticks(0.05)));
  startCombo(w, combo);
  const ev = [];
  for (let k = 0; k < ticks(hits.at(-1) + extra); k++) {
    updateCombo(w);
    step(w, { ...input(w, k), parry: press.has(k) });
    ev.push(...drainEvents(w));
  }
  return ev;
}
const of = (ev, type) => ev.filter(e => e.type === type);

test('금 탄 패링 → 과열 2.85초 동안 쏘기 피해 2배', () => {
  const w = quietWorld(); w.player.x = w.boss.x - 4;
  const p = w.player;
  // 금 탄을 플레이어 쪽으로(6.4 U 밖에서), 닿기 0.05초 전 패링
  spawnBullet(w, K.GOLD, p.x, p.z + 7, -Math.PI / 2, 14);
  const reach = (7 - RULES.player.parryR - RULES.bullets.r[K.GOLD]) / RULES.bullets.parrySpeed;
  run(w, reach - 0.05); step(w, { ...idle, parry: true }); run(w, 0.1);
  assert.equal(of(drainEvents(w), 'counterChance').length, 1);
  const od0 = w.stats.dmg.overdrive;
  run(w, 1);
  assert.ok(w.stats.dmg.overdrive > od0, '과열 중 늘어난 피해 없음');
  run(w, RULES.counter.overdrive);   // 과열이 끝난 뒤
  const od1 = w.stats.dmg.overdrive, shot1 = w.stats.dmg.shot;
  run(w, 1);
  assert.equal(w.stats.dmg.overdrive, od1);
  assert.ok(w.stats.dmg.shot > shot1);
});

test('콤보 A를 다 받으면 자동 반격이 0.8초 안에 끝나고 보스와 5 U쯤 벌어진다', () => {
  const w = quietWorld(); w.player.x = -2; w.player.z = 0; w.boss.x = -2 + stopAt(); w.boss.z = 0;
  const ev = playCombo(w, 'A', [true, true, true], { extra: autoLen() + 0.3 });
  const fc = of(ev, 'fullCounter');
  assert.deepEqual(fc.map(e => e.stage), ['in', 'volley', 'back']);
  assert.ok(fc[2].t - fc[0].t <= autoLen() + 1e-6);
  assert.equal(of(ev, 'counterChance').length, 0, '완전 패링이면 반격 기회 대신 자동 반격');
  assert.equal(w.stats.dmg.counter, FC().dmg);
  assert.ok(gap(w) >= FC().standOff + FC().backDist - 0.6, `거리 ${gap(w)}`);
  assert.equal(of(ev, 'hurt').length, 0);
});

test('뒤로 튀기 방향은 이동 키로 ±90°까지만 틀린다', () => {
  const w = quietWorld(); w.player.x = -2; w.boss.x = -2 + stopAt();
  startFullCounter(w);
  run(w, autoLen(), { ...idle, mx: 1 });   // 보스 쪽으로 키를 눌러도(자동 반격이 끝나는 틱까지)
  const standX = w.boss.x - FC().standOff;
  assert.ok(w.player.x <= standX + 1e-6, `보스 쪽으로 감 ${w.player.x} > ${standX}`);
  assert.ok(gap(w) >= FC().standOff + 1, '거의 안 벌어짐');
});

test('모서리에서 뒤로 튀어도 판 안에 남는다', () => {
  const w = quietWorld(); w.player.x = -9; w.player.z = 6; w.boss.x = -9 + 2.2; w.boss.z = 6 - 2.2;
  startFullCounter(w);
  for (let k = 0; k < ticks(autoLen() + 0.1); k++) {
    step(w, { ...idle, mx: -1, mz: 1 });
    const [cx, cz] = clampToBoard(RULES, w.player.x, w.player.z, RULES.player.bodyR);
    assert.equal(w.player.x, cx); assert.equal(w.player.z, cz);
    assert.ok(gap(w) >= RULES.boss.r + RULES.player.bodyR - 1e-6);
  }
});

test('자동 반격 중 누른 회피는 끝나는 틱에 나간다', () => {
  const w = quietWorld(); w.player.x = -2; w.boss.x = -2 + stopAt();
  startFullCounter(w); drainEvents(w);
  const n = ticks(autoLen());
  for (let k = 0; k < n + 3; k++) step(w, { ...idle, dodge: k === Math.floor(n / 2) });
  const d = of(drainEvents(w), 'dodge');
  assert.equal(d.length, 1);
  assert.ok(d[0].t >= autoLen() - 1e-6 && d[0].t <= autoLen() + 2 * RULES.dt, `회피 시각 ${d[0].t}`);
});

test('한 타라도 맞으면 자동 반격 없음, 금 마무리만 받으면 반격 기회', () => {
  const w = quietWorld(); w.boss.x = w.player.x + stopAt();
  const ev = playCombo(w, 'A', [false, true, true]);
  assert.equal(of(ev, 'fullCounter').length, 0);
  assert.equal(of(ev, 'counterChance').length, 1);
});

test('장판 밖으로 걸어 나가도 자동 반격은 없다', () => {
  const w = quietWorld(); w.boss.x = w.player.x + stopAt();
  // 첫 타 동안 보스에게서 멀어졌다가 돌아온다
  const ev = playCombo(w, 'A', [false, true, true], { input: (w, k) => (k < ticks(0.5) ? { ...idle, mx: -1 } : k < ticks(0.75) ? { ...idle, mx: 1 } : idle) });
  assert.equal(of(ev, 'fullCounter').length, 0);
});

test('heal 변형에서만 완벽 패링이 체력 3을 돌려준다', () => {
  for (const heal of [false, true]) {
    const w = quietWorld({ heal }); const p = w.player;
    p.hp = 50;
    spawnBullet(w, K.WHITE, p.x, p.z + 7, -Math.PI / 2, 14);
    const reach = (7 - RULES.player.parryR - RULES.bullets.r[K.WHITE]) / RULES.bullets.parrySpeed;
    run(w, reach - 0.05); step(w, { ...idle, parry: true }); run(w, 0.1);
    assert.equal(p.hp, heal ? 50 + RULES.heal.amount : 50);
  }
});
