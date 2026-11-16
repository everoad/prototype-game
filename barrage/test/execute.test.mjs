// 그로기 처형(§5.8): 그로기 동안 보스 곁에서 패링 키 → 달려듦·붙어 쏘기·큰 한 발·물러남.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { addStagger, bossGroggy } from '../src/sim/boss.js';
import { canExecute, executeActive } from '../src/sim/execute.js';
import { isInvuln } from '../src/sim/player.js';
import { clampToBoard } from '../src/sim/geom.js';
import { createBot } from '../src/sim/bot.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const press = { ...idle, parry: true };
// 보스를 플레이어 곁(3.5 U)에 두고 그로기로 만든다
function groggyNear(opts = {}, gap = 3.5) {
  const w = quietWorld(opts);
  w.boss.x = w.player.x + gap; w.boss.z = w.player.z;
  addStagger(w, RULES.stagger.max);
  drainEvents(w);
  return w;
}
// 처형이 끝날 때까지(최대 sec초) 돌리고 사건을 모은다
function runOut(w, sec = 2, input = () => idle) {
  const ev = [];
  for (let k = 0; k < ticks(sec); k++) { step(w, input(w, k)); ev.push(...drainEvents(w)); if (ev.some(e => e.type === 'executeEnd')) break; }
  return ev;
}
const of = (ev, t) => ev.filter(e => e.type === t);

test('그로기 중 곁에서 누르면 처형: 최대 체력의 share만큼, 끝나면 그로기도 끝', () => {
  const w = groggyNear();
  const hp0 = w.boss.hp;
  assert.ok(canExecute(w));
  step(w, press);
  const ev = [...drainEvents(w), ...runOut(w)];
  assert.equal(of(ev, 'executeStart').length, 1);
  assert.equal(of(ev, 'executeShot').length, RULES.execute.shots.length);
  assert.equal(of(ev, 'executeFinal').length, 1);
  assert.equal(of(ev, 'executeEnd').length, 1);
  assert.ok(Math.abs((hp0 - w.boss.hp) - RULES.execute.share * w.boss.maxHp) < 1e-6, `${hp0 - w.boss.hp}`);
  assert.ok(!bossGroggy(w), '그로기가 이어짐');
  assert.ok(!executeActive(w));
  assert.equal(of(ev, 'parryStart').length, 0, '처형 누름이 패링으로도 나감');
});

test('멀리서 누르면 평소 패링', () => {
  const w = groggyNear({}, 9);
  assert.ok(!canExecute(w));
  step(w, press);
  const ev = drainEvents(w);
  assert.equal(of(ev, 'executeStart').length, 0);
  assert.equal(of(ev, 'parryStart').length, 1);
});

test('그로기가 아니면 처형 없음', () => {
  const w = quietWorld(); w.boss.x = w.player.x + 3.5;
  assert.ok(!canExecute(w));
  step(w, press);
  assert.equal(of(drainEvents(w), 'executeStart').length, 0);
});

test('3초가 지나도 처형이 끝날 때까지 그로기·무적이 이어진다', () => {
  const w = groggyNear();
  for (let k = 0; k < ticks(RULES.stagger.groggy - 0.2); k++) step(w, idle);
  drainEvents(w);
  step(w, press);
  assert.equal(of(drainEvents(w), 'executeStart').length, 1);
  let ended = false;
  for (let k = 0; k < ticks(2) && !ended; k++) {
    step(w, idle);
    ended = drainEvents(w).some(e => e.type === 'executeEnd');
    if (!ended) { assert.ok(bossGroggy(w), `${w.time.toFixed(2)}: 그로기가 먼저 끝남`); assert.ok(isInvuln(w), `${w.time.toFixed(2)}: 무적 아님`); }
  }
  assert.ok(ended);
});

test('처형은 시간표대로 final + back초에 끝난다', () => {
  const w = groggyNear(); step(w, press); const t0 = w.time; drainEvents(w);
  const len = of(runOut(w), 'executeEnd')[0].t - t0;
  assert.ok(Math.abs(len - (RULES.execute.final + RULES.execute.back)) < 0.02, `${len}`);
});

test('마지막 한 발로 보스가 죽으면 이김이고 처형이 남지 않는다', () => {
  const w = groggyNear();
  w.boss.hp = RULES.execute.share * w.boss.maxHp * 0.5;
  step(w, press);
  const ev = [...drainEvents(w), ...runOut(w)];
  assert.equal(w.result, 'win');
  assert.ok(!executeActive(w));
  assert.equal(of(ev, 'executeEnd').length, 1);
});

test('처형 중 누른 회피는 끝난 뒤 하나만 나간다', () => {
  const w = groggyNear();
  step(w, press); drainEvents(w);
  const ev = runOut(w, 2, (w, k) => ({ ...idle, dodge: k % 10 === 3 }));
  assert.equal(of(ev, 'dodge').length, 0, '처형 중 회피가 나감');
  for (let k = 0; k < ticks(0.3); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(of(ev, 'dodge').length, 1);
});

test('난간 앞에서 처형해도 둘 다 판 안, 몸이 겹치지 않는다', () => {
  const R = RULES, w = quietWorld();
  w.boss.x = R.board.hx - R.boss.r; w.boss.z = R.board.hz - R.boss.r;
  w.player.x = w.boss.x - 3; w.player.z = w.boss.z - 1;
  addStagger(w, R.stagger.max); drainEvents(w);
  step(w, press);
  assert.ok(executeActive(w));
  for (let k = 0; k < ticks(1.2); k++) {
    step(w, idle); drainEvents(w);
    const p = w.player, b = w.boss;
    assert.deepEqual(clampToBoard(R, p.x, p.z, R.player.bodyR), [p.x, p.z]);
    assert.deepEqual(clampToBoard(R, b.x, b.z, R.boss.r), [b.x, b.z]);
    assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= R.boss.r + R.player.bodyR - 1e-6, `${w.time.toFixed(2)} 겹침`);
  }
});

test('숙련 봇은 연습 장면에서 처형한다', () => {
  const w = createWorld({ seed: 1, lab: 'execute' }), bot = createBot('1', 1);
  let n = 0;
  for (let k = 0; k < ticks(12); k++) { step(w, bot(w)); n += of(drainEvents(w), 'executeStart').length; }
  assert.ok(n >= 2, `처형 ${n}번`);
});

// ── 처형 검토에서 나온 것들
test('처형 중 다른 피해(날아가던 탄)로 보스가 죽어도 처형이 남지 않는다', () => {
  const w = groggyNear();
  for (let k = 0; k < 3; k++) step(w, idle);   // 쏜 탄이 날아가는 중
  drainEvents(w);
  w.boss.hp = 4;
  step(w, press);
  const ev = drainEvents(w);
  // 화면(main.js)은 이긴 뒤 판을 더 돌리지 않는다 — 이긴 그 틱에 처형이 끝나 있어야 한다
  for (let k = 0; k < ticks(0.5) && !w.result; k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(w.result, 'win');
  assert.ok(of(ev, 'executeFinal').length === 0, '처형 큰 한 발 전에 죽어야 이 경우');
  assert.ok(!executeActive(w), '처형이 남음');
  assert.equal(of(ev, 'executeEnd').length, 1);
});

test('처형으로 체력이 절반 아래가 되어도 2단계는 처형이 끝난 뒤에 온다', () => {
  const w = createWorld({ seed: 3 }); w.player.invulnUntil = 1e9;
  for (let k = 0; k < 30; k++) step(w, idle);
  w.boss.x = w.player.x + 3.5; w.boss.z = w.player.z; w.boss.hp = 0.51 * w.boss.maxHp;
  addStagger(w, RULES.stagger.max); step(w, idle); drainEvents(w);
  step(w, press);
  const ev = [...drainEvents(w)];
  for (let k = 0; k < ticks(3); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  const end = of(ev, 'executeEnd')[0], ph = of(ev, 'phase')[0];
  assert.ok(end && ph, '처형 끝·2단계가 다 있어야');
  assert.ok(ph.t >= end.t, `2단계 ${ph.t} 처형 끝 ${end.t}`);
});

test('처형 중 누른 패링은 끝난 뒤 나가지 않는다(회피는 나간다)', () => {
  const w = groggyNear();
  step(w, press); drainEvents(w);
  const ev = runOut(w, 2, (w, k) => ({ ...idle, parry: k % 10 === 3 }));
  for (let k = 0; k < ticks(0.3); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(of(ev, 'parryStart').length, 0);
  assert.equal(of(ev, 'parryFail').length, 0);
});

test('구르며 미리 누른 패링도 곁에 닿으면 처형이 된다', () => {
  const w = groggyNear({}, 9);
  const toward = { ...idle, mx: 1, mz: 0 };
  const ev = [];
  for (let k = 0; k < ticks(0.5); k++) {
    const t = k * RULES.dt;
    step(w, { ...toward, dodge: k === 0, parry: Math.abs(t - 0.2) < 1e-9 });
    ev.push(...drainEvents(w));
  }
  assert.equal(of(ev, 'executeStart').length, 1, JSON.stringify(ev.map(e => e.type)));
  assert.equal(of(ev, 'parryStart').length, 0);
});

test('연습 장면: 처형 뒤 다음 그로기까지 잠깐 쉬고, 보스는 죽지 않는다', () => {
  const w = createWorld({ seed: 1, lab: 'execute' }), bot = createBot('1', 1);
  let lastEnd = null, gaps = [];
  for (let k = 0; k < ticks(60); k++) {
    step(w, bot(w));
    for (const e of drainEvents(w)) {
      if (e.type === 'executeEnd') lastEnd = e.t;
      if (e.type === 'groggy' && lastEnd != null) { gaps.push(e.t - lastEnd); lastEnd = null; }
    }
  }
  assert.ok(gaps.length >= 5, `그로기 ${gaps.length}`);
  assert.ok(Math.min(...gaps) >= 1.0 - 1e-6, `가장 짧은 쉼 ${Math.min(...gaps)}`);
  assert.equal(w.result, null);
  assert.ok(w.boss.hp >= 1);
});

test('큰 한 발 사건에 처형 피해 합계가 실린다', () => {
  const w = groggyNear();
  step(w, press);
  const ev = [...drainEvents(w), ...runOut(w)];
  const f = of(ev, 'executeFinal')[0];
  assert.ok(Math.abs(f.total - RULES.execute.share * w.boss.maxHp) < 1e-6, JSON.stringify(f));
});
