// 보조 무기(§4.10): 여러 개를 다 끼고 전부 자동 — 공격 무기 4종(미사일·산탄·빔·드론), 숫자 1~4로 켜고 끔(시험용). 칼날·파동은 너무 세서 뺐다(사용자).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { addStagger } from '../src/sim/boss.js';
import { GEAR } from '../src/sim/weapons.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const of = (ev, t) => ev.filter(e => e.type === t);
const alive = (w, kind) => { const b = w.bullets; let n = 0; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.kind[i] === kind) n++; return n; };
// 보스를 오른쪽 d U에, 평타는 끄고(보스 체력 비교를 무기 피해만으로) 무기 하나만
function armed(gear, d = 8) {
  const w = quietWorld({ gear });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z;
  w.shots.nextAt = 1e9;   // 평타 끔
  w.boss.hp = w.boss.maxHp = 1e6;
  w.weapons.chargeUntil = 1e9;   // 무기 가동(패링으로 켜짐)을 시험에선 늘 켬
  return w;
}
const runFor = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, input); ev.push(...drainEvents(w)); } return ev; };

test('gear가 없으면 무기 없음, all이면 4종 모두(칼날·파동 없음)', () => {
  assert.deepEqual(quietWorld().weapons.on, []);
  assert.deepEqual(quietWorld({ gear: 'all' }).weapons.on, GEAR);
  assert.deepEqual(quietWorld({ gear: 'missile,beam' }).weapons.on, ['missile', 'beam']);
  assert.deepEqual(GEAR, ['missile', 'burst', 'beam', 'drone']);
  assert.deepEqual(quietWorld({ gear: 'orbit,pulse,beam' }).weapons.on, ['beam']);
});

test('미사일: 1.5초마다 2발, 보스를 따라가 맞힌다', () => {
  const w = armed('missile');
  const hp0 = w.boss.hp, ev = runFor(w, 3.2);
  assert.equal(of(ev, 'weaponFire').filter(e => e.kind === 'missile').length, 2 * RULES.weapons.missile.n + RULES.weapons.missile.n);
  assert.ok(of(ev, 'weaponHit').some(e => e.kind === 'missile'));
  assert.ok(w.boss.hp < hp0);
});

test('산탄: 패링에 성공할 때마다 보스 쪽으로 6발', () => {
  const w = armed('burst');
  const p = w.player, i = spawnBullet(w, K.WHITE, p.x + 7, p.z, Math.PI, 14);
  const ev = [];
  for (let k = 0; k < ticks(1); k++) {
    const b = w.bullets, d = b.alive[i] ? Math.hypot(b.x[i] - p.x, b.z[i] - p.z) : 99;
    step(w, { ...idle, parry: d < RULES.player.parryR + 14 * 0.05 && d > RULES.player.parryR && !w.player.parry.active });
    ev.push(...drainEvents(w));
  }
  assert.equal(of(ev, 'parry').length, 1);
  assert.equal(of(ev, 'weaponFire').filter(e => e.kind === 'burst').length, RULES.weapons.burst.n);
});

test('빔: 3초마다 잠깐 보스를 잇고 피해를 준다', () => {
  const w = armed('beam');
  const hp0 = w.boss.hp, ev = runFor(w, RULES.weapons.beam.every + 0.5);
  assert.equal(of(ev, 'weaponFire').filter(e => e.kind === 'beam').length, 1);
  assert.ok(Math.abs((hp0 - w.boss.hp) - RULES.weapons.beam.dps * RULES.weapons.beam.dur) < RULES.weapons.beam.dps * RULES.dt * 2, `${hp0 - w.boss.hp}`);
});

test('드론: 몸 곁에서 자주 보스에게 한 발(every마다)', () => {
  const w = armed('drone');
  const ev = runFor(w, 1.5);
  const n = of(ev, 'weaponFire').filter(e => e.kind === 'drone').length, want = Math.ceil(1.5 / RULES.weapons.drone.every - 1e-9);
  assert.ok(Math.abs(n - want) <= 1, `드론 ${n}발, 기대 ${want}`);
  assert.ok(of(ev, 'weaponHit').some(e => e.kind === 'drone'));
});

test('숫자 키로 무기를 켜고 끈다', () => {
  const w = armed('all');
  step(w, { ...idle, toggle: 1 });
  assert.ok(!w.weapons.on.includes('missile'));
  step(w, { ...idle, toggle: 1 });
  assert.ok(w.weapons.on.includes('missile'));
  assert.equal(of(drainEvents(w), 'gearToggle').length, 2);
});

test('처형 중엔 무기도 쉰다', () => {
  const w = armed('all', 3.5);
  addStagger(w, RULES.stagger.max); drainEvents(w);
  step(w, { ...idle, parry: true });
  assert.ok(w.execute);
  let fires = 0, guard = 0;
  while (w.execute && guard++ < 500) { step(w, idle); const e = drainEvents(w); if (w.execute) fires += of(e, 'weaponFire').length; }   // 끝나는 틱엔 다시 쏜다
  assert.equal(fires, 0);
});

// 탄 수를 늘리되 전체 피해량은 그대로(사용자: 공격 무기만, 탄 수·이펙트는 늘려도 됨)
test('공격 무기 초당 피해는 탄 수를 늘려도 예전과 같다', () => {
  const W = RULES.weapons;
  const dps = { missile: W.missile.n * W.missile.dmg / W.missile.every, drone: W.drone.dmg / W.drone.every, burstPerParry: W.burst.n * W.burst.dmg };
  assert.ok(W.missile.n >= 3 && W.burst.n >= 10 && W.drone.every <= 0.2, JSON.stringify({ m: W.missile.n, b: W.burst.n, d: W.drone.every }));
  assert.ok(Math.abs(dps.missile - 2 * 8 / 1.5) < 1.5, `미사일 ${dps.missile}`);
  assert.ok(Math.abs(dps.drone - 2 / 0.35) < 0.6, `드론 ${dps.drone}`);
  assert.ok(Math.abs(dps.burstPerParry - 30) < 1e-9, `산탄 ${dps.burstPerParry}`);
});

// ── 패링과 엮기(사용자 2026-11-16 "1번"): 무기는 패링 뒤에만 가동, 패링이 스킬 게이지를 채움, U·I·O 무기 스킬
const parryOnce = (w, perfect = false) => { w.stats.parries++; if (perfect) w.stats.perfects++; };

test('패링하지 않으면 공격 무기(미사일·빔·드론)는 쏘지 않는다', () => {
  const w = armed('all'); w.weapons.chargeUntil = -1;
  const ev = runFor(w, 3.5);
  assert.equal(of(ev, 'weaponFire').length, 0);
});

test('패링 뒤 3초(완벽이면 4.5초) 동안 무기가 가동된다', () => {
  for (const [perfect, sec] of [[false, RULES.weapons.charge.sec], [true, RULES.weapons.charge.perfectSec]]) {
    const w = armed('drone'); w.weapons.chargeUntil = -1;
    parryOnce(w, perfect);
    const ev = [];
    for (let k = 0; k < ticks(sec + 1); k++) { step(w, idle); for (const e of drainEvents(w)) ev.push({ ...e, at: w.time }); }
    const fires = ev.filter(e => e.type === 'weaponFire');
    assert.ok(fires.length > 3, `${perfect}: ${fires.length}`);
    assert.ok(Math.max(...fires.map(e => e.t)) <= sec + 1e-6, `${perfect}: 마지막 ${Math.max(...fires.map(e => e.t))}`);
    assert.ok(ev.some(e => e.type === 'weaponWake'));
  }
});

test('스킬 게이지: 패링 +1, 완벽 +2, 최대까지', () => {
  const w = armed('all'); const G = RULES.weapons.skill;
  parryOnce(w); step(w, idle);
  assert.equal(w.weapons.gauge, 1);
  parryOnce(w, true); step(w, idle);
  assert.equal(w.weapons.gauge, 3);
  for (let k = 0; k < 10; k++) { parryOnce(w, true); step(w, idle); }
  assert.equal(w.weapons.gauge, G.max);
});

test('U 미사일 일제 사격: 게이지를 쓰고 12발', () => {
  const w = armed('missile'); w.weapons.gauge = RULES.weapons.skill.cost; w.weapons.next.missile = 1e9;
  step(w, { ...idle, skill: 'missile' });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'weaponSkill').length, 1);
  assert.equal(of(ev, 'weaponFire').filter(e => e.kind === 'missile').length, RULES.weapons.skill.missile.n);
  assert.equal(w.weapons.gauge, 0);
});

test('I 굵은 빔: 1.5초 동안 큰 피해', () => {
  const w = armed('beam'); w.weapons.gauge = RULES.weapons.skill.cost; w.weapons.next.beam = 1e9;
  const hp0 = w.boss.hp;
  step(w, { ...idle, skill: 'beam' });
  runFor(w, RULES.weapons.skill.beam.dur + 0.2);
  const S = RULES.weapons.skill.beam;
  assert.ok(Math.abs((hp0 - w.boss.hp) - S.dps * S.dur) < S.dps * RULES.dt * 2, `${hp0 - w.boss.hp}`);
});

test('O 드론 연사: 4초 동안 훨씬 자주 쏜다', () => {
  const w = armed('drone'); w.weapons.gauge = RULES.weapons.skill.cost;
  step(w, { ...idle, skill: 'drone' });
  const n = of(runFor(w, 1), 'weaponFire').filter(e => e.kind === 'drone').length;
  assert.ok(n >= Math.floor(1 / RULES.weapons.skill.drone.every) - 2, `드론 ${n}발`);
});

test('게이지가 모자라거나 그 무기를 안 꼈으면 denied', () => {
  const w = armed('missile'); w.weapons.gauge = RULES.weapons.skill.cost - 1;
  step(w, { ...idle, skill: 'missile' });
  step(w, { ...idle, skill: 'beam' });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'weaponSkill').length, 0);
  assert.deepEqual(of(ev, 'denied').map(e => e.why), ['gauge', 'gear']);
});
