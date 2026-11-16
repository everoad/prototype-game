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

test('콤보 A를 다 받아도 자동 반격은 없다 — 금 마무리 패링의 반격 기회만(사용자 2026-11-17 "빼자")', () => {
  const w = quietWorld(); w.player.x = -2; w.player.z = 0; w.boss.x = -2 + stopAt(); w.boss.z = 0;
  const x0 = w.player.x;
  const ev = playCombo(w, 'A', [true, true, true], { extra: autoLen() + 0.3 });
  assert.equal(of(ev, 'fullCounter').length, 0);
  assert.equal(of(ev, 'counterChance').length, 1);
  assert.equal(w.stats.dmg.counter, 0);
  assert.ok(Math.abs(w.player.x - x0) < 1e-9, '저절로 움직임');
  assert.equal(of(ev, 'hurt').length, 0);
});

test('콤보 B(흰·빨강)를 받고 굴러도 보스는 멈추지 않는다', () => {
  const w = quietWorld(); w.player.x = -2; w.player.z = 0; w.boss.x = -2 + stopAt(); w.boss.z = 0;
  const ev = playCombo(w, 'B', [true, false], { input: (w, k) => ({ ...idle, dodge: w.melee.areas.some(a => a.color === 'red' && !a.hit && a.born + a.warn - w.time < 0.05) && w.player.dodge.until < w.time, mx: -1, mz: 0 }) });
  assert.equal(of(ev, 'fullCounter').length, 0);
  assert.equal(of(ev, 'counterChance').length, 0);
  assert.ok(!(w.boss.stunUntil > 0), '보스가 경직됨');
});

// 아래 셋은 자동 반격 장치 자체의 시험이다(지금은 꺼져 있다 — RULES.fullCounter.on. 다시 켤 때를 위해 남긴다)
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

// 사용자 2026-11-17: "빨간 공격 회피·돌진 패링에 성공하면 탄막이 없어지고 보스도 한동안 그로기 — 너무 과하다. 그냥 회피 성공·패링 성공으로"
import { startSlam, startWave, updateFloor } from '../src/sim/floor.js';

test('빨간 탄을 구르기로 통과: 아슬아슬만 — 반격 기회·보스 경직·과열 없음', () => {
  const w = quietWorld(); const p = w.player;
  spawnBullet(w, K.RED, p.x, p.z + 3, -Math.PI / 2, 18);
  const ev = [];
  for (let k = 0; k < ticks(0.6); k++) { step(w, { ...idle, dodge: k === ticks(0.1), mx: 0, mz: 1 }); ev.push(...drainEvents(w)); }
  assert.ok(ev.some(e => e.type === 'nearMiss' && e.red), '아슬아슬이 안 남');
  assert.equal(of(ev, 'counterChance').length, 0);
  assert.equal(of(ev, 'hurt').length, 0);
  assert.ok(!(w.boss.stunUntil > 0), '보스가 경직됨');
  assert.ok(!(w.player.overdriveUntil > 0), '과열이 켜짐');
});

test('빨간 파도를 구르기로 넘겨도 반격 기회는 없다', () => {
  const w = quietWorld();
  w.boss.x = w.player.x + 5; w.boss.z = w.player.z;
  startWave(w, 'red');
  const ev = [];
  for (let k = 0; k < ticks(1.5); k++) {
    const v = w.waves[0], d = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
    const near = v && !v.hitDone && d - RULES.player.bodyR - v.r < RULES.floor.wave.speed * 0.05;
    step(w, { ...idle, dodge: !!near && w.player.dodge.until < w.time, mx: 1, mz: 0 });
    if (w.floor) updateFloor(w);
    ev.push(...drainEvents(w));
  }
  assert.equal(of(ev, 'waveHit')[0]?.outcome, 'roll');
  assert.equal(of(ev, 'counterChance').length, 0);
  assert.ok(!(w.boss.stunUntil > 0));
});
