// Task 11: 시범 봇 — 숙련 패링, 0.2초 반응, walk는 누르지 않음, 같은 seed = 같은 판.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { createBot } from '../src/sim/bot.js';
import { quietWorld, ticks } from './helpers.mjs';
import { makeRng } from '../src/sim/rng.js';

test('숙련 봇은 홀로 오는 흰 탄을 패링한다', () => {
  const w = quietWorld(); const p = w.player;
  w.boss.x = p.x + 9;                      // 봇이 머무는 거리(8~10 U) — 거리 맞추려 걷지 않게
  const bot = createBot('1', 1);
  for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));   // 반응 지연만큼 판을 먼저 본다
  drainEvents(w);
  spawnBullet(w, K.WHITE, p.x, p.z + 7, -Math.PI / 2, 14);
  const ev = [];
  for (let k = 0; k < ticks(1.2); k++) { step(w, bot(w)); ev.push(...drainEvents(w)); }
  assert.equal(ev.filter(e => e.type === 'parry').length, 1);
  assert.equal(ev.filter(e => e.type === 'hurt').length, 0);
});

test('0.2초 전에 생긴 탄에는 아직 반응하지 않는다', () => {
  const a = quietWorld(), b = quietWorld();
  const botA = createBot('1', 1), botB = createBot('1', 1);
  for (let k = 0; k < ticks(0.5); k++) { step(a, botA(a)); step(b, botB(b)); }
  // b에만 플레이어 옆으로 날아오는 탄
  spawnBullet(b, K.NORMAL, b.player.x - 3, b.player.z, 0, 10);
  for (let k = 0; k < ticks(0.1); k++) {
    const ia = botA(a), ib = botB(b);
    assert.deepEqual(ib, ia, `${k}틱째 반응함`);
    step(a, ia); step(b, ib);
  }
});

test('walk 봇은 패링·회피를 누르지 않는다', () => {
  const w = createWorld({ seed: 2 }); const bot = createBot('walk', 2);
  for (let k = 0; k < ticks(30) && !w.result; k++) {
    const i = bot(w);
    assert.equal(i.parry, false); assert.equal(i.dodge, false);
    step(w, i);
  }
});

test('turtle 봇은 움직이지 않는다', () => {
  const w = createWorld({ seed: 2 }); const bot = createBot('turtle', 2);
  for (let k = 0; k < ticks(10) && !w.result; k++) { const i = bot(w); assert.equal(i.mx, 0); assert.equal(i.mz, 0); step(w, i); }
});

test('같은 seed면 봇 판도 같다', () => {
  const runOnce = () => { const w = createWorld({ seed: 5 }); const bot = createBot('1', 5); for (let k = 0; k < ticks(60) && !w.result; k++) step(w, bot(w)); return stateHash(w); };
  assert.equal(runOnce(), runOnce());
});

test('숙련 봇은 가만히 있는 것보다 오래 버틴다', () => {
  const life = kind => {
    const w = createWorld({ seed: 4 }); const bot = kind ? createBot(kind, 4) : () => ({ mx: 0, mz: 0, parry: false, dodge: false });
    let k = 0; for (; k < ticks(90) && !w.result; k++) step(w, bot(w));
    return { t: k * RULES.dt, hits: w.stats.hits, parries: w.stats.parries };
  };
  const still = life(null), skilled = life('1');
  assert.ok(skilled.hits < still.hits || skilled.t > still.t * 1.5, `가만히 ${JSON.stringify(still)} 숙련 ${JSON.stringify(skilled)}`);
  assert.ok(skilled.parries > 3, `패링 ${skilled.parries}`);
});

// ── 원거리 재설계 Task 6: 봇이 장판 공격·레이저를 본다(두뇌 없이 공격 하나씩)
import { startSlam, startWave, startSword, updateFloor } from '../src/sim/floor.js';
import { startLaser } from '../src/sim/beams.js';

function face(start, kind = '1', setup = null, sec = 3.5) {
  const w = quietWorld(); w.boss.x = w.player.x + 9; setup?.(w);
  const bot = createBot(kind, 1);
  for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));   // 반응 지연만큼 판을 먼저 본다
  drainEvents(w);
  start(w);
  const ev = []; let done = false;
  for (let k = 0; k < ticks(sec); k++) { if (!done) done = updateFloor(w); step(w, bot(w)); ev.push(...drainEvents(w)); }
  return { w, ev };
}
const hurtBy = (ev, src) => ev.filter(e => e.type === 'hurt' && e.src === src).length;

test('숙련 봇은 흰 파도를 패링한다', () => {
  const { ev } = face(w => startWave(w, 'white'));
  const h = ev.find(e => e.type === 'waveHit');
  assert.ok(h && (h.outcome === 'parry' || h.outcome === 'perfect'), JSON.stringify(h));
});

test('숙련 봇은 빨간 파도를 구르기로 넘긴다', () => {
  const { ev } = face(w => startWave(w, 'red'));
  assert.equal(ev.find(e => e.type === 'waveHit')?.outcome, 'roll');
  assert.equal(hurtBy(ev, RULES.src.wave), 0);
});

test('숙련 봇은 빨간 박치기 줄에서 비켜난다', () => {
  const { ev } = face(w => startSlam(w, 'red'));
  assert.equal(hurtBy(ev, RULES.src.slam), 0);
});

test('숙련 봇은 흰 박치기를 패링한다', () => {
  const { ev } = face(w => startSlam(w, 'white'));
  const h = ev.find(e => e.type === 'slamHit');
  assert.ok(h && (h.outcome === 'parry' || h.outcome === 'perfect'), JSON.stringify(h));
});

test('숙련 봇은 빨간 검기를 맞지 않는다', () => {
  const { ev } = face(w => startSword(w, 'red'));
  assert.equal(hurtBy(ev, RULES.src.sword), 0);
});

test('숙련 봇은 레이저를 맞지 않는다', () => {
  let n = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const { ev } = face(w => { w.rng = makeRng(seed); startLaser(w, null); }, '1', null, 2);
    n += hurtBy(ev, RULES.src.laser);
  }
  assert.equal(n, 0);
});
