// 원거리 재설계 Task 3: 빠르고 멀리 닿는 장판 공격 — 몸통 박치기, 지면 파도, 검기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { startSlam, startWave, startSword, updateFloor } from '../src/sim/floor.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

// 장판 공격 하나를 끝까지(updateFloor가 true) 돌리고 사건을 모은다. input(w, k) 또는 객체.
function play(w, start, input = idle, extra = 1.5) {
  start(w);
  const ev = [];
  let done = false;
  for (let k = 0; k < ticks(3 + extra); k++) {
    if (!done) done = updateFloor(w);
    step(w, typeof input === 'function' ? input(w, k) : input);
    ev.push(...drainEvents(w));
    if (done && k > ticks(extra)) break;
  }
  return ev;
}
const of = (ev, t) => ev.filter(e => e.type === t);

test('박치기 줄은 발사 0.2초 전까지 따라오고 판 끝까지 간다', () => {
  const w = quietWorld();
  startSlam(w, 'red');
  const lane = w.floorAreas[0], a0 = lane.face;
  for (let k = 0; k < ticks(0.15); k++) { updateFloor(w); step(w, idle); }
  w.player.z += 2;
  for (let k = 0; k < ticks(0.1); k++) { updateFloor(w); step(w, idle); }
  assert.notEqual(lane.face, a0, '줄이 따라오지 않음');
  for (let k = 0; k < ticks(0.1); k++) { updateFloor(w); step(w, idle); }   // 고정 뒤
  const locked = lane.face; w.player.z -= 4;
  for (let k = 0; k < ticks(0.1); k++) { updateFloor(w); step(w, idle); }
  assert.equal(lane.face, locked);
  let done = false;
  for (let k = 0; k < ticks(2) && !done; k++) { done = updateFloor(w); step(w, idle); }
  assert.ok(done);
  // 판 끝(반지름만큼 앞)까지 갔다
  const e = Math.max(Math.abs(w.boss.x) - (RULES.board.hx - RULES.boss.r), Math.abs(w.boss.z) - (RULES.board.hz - RULES.boss.r));
  assert.ok(Math.abs(e) < 0.05, `난간까지 ${e}`);
});

test('줄 가운데서도 0.3초 걸으면 박치기 줄 밖으로 나간다', () => {
  const S = RULES.floor.slam; assert.ok((S.warn - 0.2) * RULES.player.speed >= S.width / 2 + RULES.player.bodyR);
});

test('흰 박치기 패링 = 보스가 멈추고 경직 1초, 무력화 20', () => {
  const w = quietWorld();
  const ev = play(w, w => startSlam(w, 'white'), (w, k) => {
    // 보스 몸이 닿기 0.05초 전 패링
    const d = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) - RULES.boss.r - RULES.player.bodyR;
    return { ...idle, parry: w.floor?.phase === 'dash' && d < RULES.floor.slam.speed * 0.05 && d > 0 && !w.player.parry.active };
  });
  const hit = of(ev, 'slamHit')[0];
  assert.ok(hit && (hit.outcome === 'parry' || hit.outcome === 'perfect'), JSON.stringify(hit));
  assert.equal(w.boss.stagger, RULES.floor.slam.stagger);
  assert.ok(w.boss.stunUntil >= hit.t + RULES.floor.slam.stun - 1e-6);
  assert.equal(of(ev, 'hurt').length, 0);
});

test('빨간 박치기: 가만히 있으면 맞고 판 안에 남는다, 구르기로 통과하면 아슬아슬', () => {
  const w = quietWorld();
  const ev = play(w, w => startSlam(w, 'red'));
  assert.equal(of(ev, 'slamHit')[0]?.outcome, 'hurt');
  assert.ok(of(ev, 'hurt').some(e => e.src === RULES.src.slam));
  assert.ok(Math.abs(w.player.x) <= RULES.board.hx - RULES.player.bodyR + 1e-9);
  const v = quietWorld();
  const ev2 = play(v, w => startSlam(w, 'red'), (w) => {
    const d = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) - RULES.boss.r - RULES.player.bodyR;
    return { ...idle, dodge: w.floor?.phase === 'dash' && d < 1.2 && d > 0 };
  });
  assert.equal(of(ev2, 'slamHit')[0]?.outcome, 'roll');
  assert.ok(of(ev2, 'nearMiss').some(e => e.red));
});

test('줄 밖으로 비키면 박치기를 피한다', () => {
  const w = quietWorld();
  const ev = play(w, w => startSlam(w, 'red'), (w) => ({ ...idle, mz: w.time > 0.21 ? 1 : 0 }));
  assert.equal(of(ev, 'hurt').length, 0);
});

test('보스가 난간 앞에서 박치기하면 바로 끝난다', () => {
  const w = quietWorld(); w.boss.x = RULES.board.hx - RULES.boss.r; w.player.x = w.boss.x - 4;
  w.boss.face = 0;
  startSlam(w, 'white');
  // 줄이 플레이어 쪽(−x)이 아니라 난간 쪽이 되도록 플레이어를 난간 너머로 둘 수는 없으니, 줄 길이로 본다
  w.player.x = RULES.board.hx - 0.5; w.player.z = 0;   // 플레이어가 보스 바로 뒤(난간 쪽)
  let done = false, n = 0;
  for (let k = 0; k < ticks(1.5) && !done; k++) { done = updateFloor(w); step(w, idle); n++; }
  assert.ok(done, '끝나지 않음');
});

test('지면 파도는 판 끝까지 닿는다 — 걸어서는 못 피한다', () => {
  const w = quietWorld(); w.boss.x = 0; w.boss.z = 0; w.player.x = -9.5; w.player.z = 6.5;
  const ev = play(w, w => startWave(w, 'red'), idle, 2.5);
  assert.ok(of(ev, 'hurt').some(e => e.src === RULES.src.wave));
});

test('흰 파도는 앞면이 닿을 때 패링하면 무력화 12', () => {
  const w = quietWorld(); w.boss.x = 0; w.boss.z = 0; w.player.x = -8; w.player.z = 0;
  const ev = play(w, w => startWave(w, 'white'), (w) => {
    const wv = w.waves[0];
    if (!wv) return idle;
    const gap = Math.hypot(w.player.x - wv.x, w.player.z - wv.z) - RULES.player.bodyR - wv.r;   // 앞면까지
    return { ...idle, parry: gap > 0 && gap < RULES.floor.wave.speed * 0.15 && !w.player.parry.active };
  }, 1.5);
  const h = of(ev, 'waveHit')[0];
  assert.ok(h && (h.outcome === 'parry' || h.outcome === 'perfect'), JSON.stringify(h));
  assert.ok(w.boss.stagger === RULES.floor.wave.stagger[0] || w.boss.stagger === RULES.floor.wave.stagger[1]);
});

test('검기는 12 U 앞까지 닿고 옆으로 조금 비켜서는 못 피한다', () => {
  const w = quietWorld(); w.boss.x = 4; w.boss.z = 0; w.player.x = -6; w.player.z = 0;   // 10 U 떨어짐
  const ev = play(w, w => startSword(w, 'red'), (w) => ({ ...idle, mz: w.time > 0.21 ? 1 : 0 }));
  assert.ok(of(ev, 'hurt').some(e => e.src === RULES.src.sword), '검기에 맞지 않음');
});

test('빨간 근접 내려찍기는 빨라져도 걸어서 빠져나간다', () => {
  const m = RULES.melee.slam; assert.ok((m.warn - 0.2) * RULES.player.speed >= m.R + RULES.player.bodyR);
});
