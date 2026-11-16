// 원거리 재설계 마지막 검토에서 나온 것들 — 고치기 전에 실패하는 시험.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { addStagger } from '../src/sim/boss.js';
import { startSlam, startWave, updateFloor } from '../src/sim/floor.js';
import { startLaser, clearBeams } from '../src/sim/beams.js';
import { resolveHit } from '../src/sim/melee.js';
import { createBot } from '../src/sim/bot.js';
import { LOOK } from '../src/view/look.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

function brainWorld(opts = {}) {
  const w = createWorld({ seed: 3, ...opts });
  w.player.invulnUntil = 1e9;
  w.boss.hp = w.boss.maxHp = 1e9;
  if (opts.phase === 2) w.boss.hp = 0.4e9;
  return w;
}
// 보스 쪽으로 다가가고 물러나기를 번갈아 하는 손(가까운 거리 고르기를 끌어낸다)
function closeInput(w, k, near = 2.3, far = 12, every = 1.3) {
  const p = w.player, b = w.boss, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
  const ph = Math.floor(k / ticks(every)) % 2;
  if (ph === 0 && d > near) return { ...idle, mx: dx / d, mz: dz / d };
  if (ph === 1 && d < far) return { ...idle, mx: -dx / d, mz: -dz / d };
  return idle;
}
// 일정 거리를 지키는 손
function holdInput(w, at) {
  const p = w.player, b = w.boss, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
  return d > at + 0.2 ? { ...idle, mx: dx / d, mz: dz / d } : d < at - 0.2 ? { ...idle, mx: -dx / d, mz: -dz / d } : idle;
}

test('파도가 닿기 전에는 다음 주 패턴 준비가 없다', () => {
  let waves = 0;
  for (const seed of [1, 2, 3]) {
    const w = brainWorld({ seed });
    let pending = 0;
    for (let k = 0; k < ticks(150); k++) {
      step(w, idle);
      for (const e of drainEvents(w)) {
        if (e.type === 'waveStart') { pending++; waves++; }
        if (e.type === 'waveHit') pending = Math.max(0, pending - 1);
        if (e.type === 'windup' && e.kind === 'pattern') assert.equal(pending, 0, `seed ${seed} ${e.t.toFixed(2)}: 파도가 오는 중에 패턴 ${e.id}`);
      }
    }
  }
  assert.ok(waves >= 5, `파도 ${waves}`);
});

test('가까이서 바로 하는 근접 콤보 동안 주 패턴 탄이 없다', () => {
  let combos = 0;
  for (const seed of [1, 2, 3, 4]) {
    for (const phase of [1, 2]) {
      const w = brainWorld({ seed, phase });
      let inCombo = false;
      for (let k = 0; k < ticks(90); k++) {
        step(w, closeInput(w, k));
        for (const e of drainEvents(w)) {
          if (e.type === 'meleeStart') {
            inCombo = true; combos++;
            const b = w.bullets;
            for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] >= 1 && b.src[i] <= 8) assert.fail(`seed ${seed}/${phase} ${e.t.toFixed(2)}: 콤보 시작에 패턴 ${b.src[i]} 탄`);
          }
          if (inCombo && e.type === 'fire' && e.src >= 1 && e.src <= 8) assert.fail(`seed ${seed}/${phase} ${e.t.toFixed(2)}: 콤보 중 패턴 ${e.src} 탄`);
        }
        if (inCombo && w.boss.state !== 'melee' && w.boss.state !== 'meleeWait') inCombo = false;
      }
    }
  }
  assert.ok(combos >= 10, `콤보 ${combos}`);
});

test('난간 앞에서도 보스가 떨며 멈추지 않는다', () => {
  let moving = 0, stuck = 0, flips = 0;
  for (const seed of [1, 2, 3]) {
    const w = brainWorld({ seed });
    const hist = [];
    let dir = w.boss.orbitDir;
    for (let k = 0; k < ticks(90); k++) {
      step(w, holdInput(w, 5)); drainEvents(w);
      const b = w.boss;
      if (b.orbitDir !== dir) { flips++; dir = b.orbitDir; }
      hist.push([b.x, b.z, ['idle', 'windup', 'pattern'].includes(b.state)]);
      if (hist.length > 120) hist.shift();
      if (hist.length === 120 && hist.every(h => h[2])) { moving++; if (Math.hypot(b.x - hist[0][0], b.z - hist[0][1]) < 0.3) stuck++; }
    }
  }
  // 고친 뒤 seed 묶음마다 2.7~3.3%(레이저가 길어진 뒤), 고치기 전 버그는 9~16% — 5%면 버그는 잡고 흔들림엔 안 걸린다
  assert.ok(stuck / moving < 0.05, `멈춤 ${(stuck / moving * 100).toFixed(1)}%`);
  assert.ok(flips / 270 < 1.5, `방향 바꿈 초당 ${(flips / 270).toFixed(1)}`);
});

test('깨어난 뒤 1초 동안 바탕 탄막·구슬도 쏘지 않는다', () => {
  const calm = RULES.brain.wake + RULES.brain.wakeBreath;
  let wakes = 0;
  for (const phase of [1, 2]) {
    const w = brainWorld({ phase });
    let wakeAt = -1e9;
    for (let k = 0; k < ticks(60); k++) {
      if (k % ticks(9) === ticks(4)) addStagger(w, 1000);
      step(w, idle);
      for (const e of drainEvents(w)) {
        if (e.type === 'wake') { wakeAt = e.t; wakes++; }
        if ((e.type === 'fire' || e.type === 'orbFire') && e.t < wakeAt + calm - 1e-9) assert.fail(`${phase}단계: 깨어난 뒤 ${(e.t - wakeAt).toFixed(2)}초에 ${e.type} src ${e.src}`);
      }
    }
  }
  assert.ok(wakes >= 6, `깨어남 ${wakes}`);
});

test('패링할 수 없는 것은 흰·금으로 번쩍이지 않는다', () => {
  const C = LOOK.colors, banned = [C.white, C.gold, C.goldRim].map(c => c.toLowerCase());
  for (const k of ['orbFlash', 'beamCore', 'beamTip']) {
    assert.ok(C[k], `${k} 색 없음`);
    assert.ok(!banned.includes(C[k].toLowerCase()), `${k} = ${C[k]}`);
  }
});

test('걷기 봇은 나선(패턴 5)에서 유독 많이 맞지 않는다', () => {
  let runs = 0, hits = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = createWorld({ seed, phase: 2, pattern: 5 }), bot = createBot('walk', seed);
    w.player.hp = w.player.maxHp = 1e9;
    for (let k = 0; k < ticks(40); k++) {
      step(w, bot(w));
      for (const e of drainEvents(w)) {
        if (e.type === 'windup' && e.kind === 'pattern') runs++;
        if (e.type === 'hurt' && e.src === 5) hits++;
      }
    }
  }
  assert.ok(hits / runs <= 0.25, `나선 ${hits}/${runs} = ${(hits / runs).toFixed(2)}`);
});

test('뛰는 동안은 쏘지 않는다', () => {
  let hops = 0;
  for (const phase of [1, 2]) {
    const w = brainWorld({ phase });
    for (let k = 0; k < ticks(120); k++) {
      step(w, idle);
      for (const e of drainEvents(w)) {
        if (e.type === 'hop') hops++;
        if ((e.type === 'fire' || e.type === 'orbFire') && w.boss.state === 'hop') assert.fail(`${phase}단계 ${e.t.toFixed(2)}: 뛰는 중 ${e.type} src ${e.src}`);
      }
    }
  }
  assert.ok(hops >= 5, `뛰기 ${hops}`);
});

test('쌍둥이 구슬은 한 틱에 같이 쏘지 않는다(쉰 뒤에도 엇갈림 유지)', () => {
  const w = brainWorld({ phase: 2 });
  const at = [[], []];
  for (let k = 0; k < ticks(120); k++) { step(w, idle); for (const e of drainEvents(w)) if (e.type === 'orbFire') at[e.k].push(Math.round(e.t * 120)); }
  const same = at[0].filter(t => at[1].includes(t)).length;
  assert.ok(at[0].length > 20);
  assert.ok(same / at[0].length < 0.1, `같은 틱 ${same}/${at[0].length}`);
});

test('구석에 몰린 플레이어를 박치기가 몸 너머로 순간이동시키지 않는다', () => {
  const w = quietWorld();
  // 판 모서리에 몰린 플레이어에게 대각선으로 들이받는다(검토 재현: seed 2, 23.23초)
  w.boss.x = 5; w.boss.z = -2.5; w.player.x = RULES.board.hx - RULES.player.bodyR; w.player.z = -(RULES.board.hz - RULES.player.bodyR);
  startSlam(w, 'red');
  let maxJump = 0, done = false;
  for (let k = 0; k < ticks(2) && !done; k++) {
    const x0 = w.player.x, z0 = w.player.z;
    done = updateFloor(w); step(w, idle);
    maxJump = Math.max(maxJump, Math.hypot(w.player.x - x0, w.player.z - z0));
  }
  assert.ok(done, '박치기가 끝나지 않음');
  assert.ok(maxJump < 1.0, `한 틱에 ${maxJump.toFixed(2)} U`);
  assert.ok(Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) >= RULES.boss.r + RULES.player.bodyR - 1e-6, '몸이 겹친 채');
});

test('무적이라 맞지 않았으면 resolveHit은 hurt가 아니다', () => {
  const w = quietWorld(); w.player.invulnUntil = 1e9;
  const res = resolveHit(w, { color: 'red', src: RULES.src.slam, dmg: 22, stagger: [0, 0], kindName: 'slam' });
  assert.equal(res.outcome, 'immune');
  assert.equal(w.player.hp, RULES.player.hp);
});

test('쏘던 레이저가 끊기면 laserCut을 알린다(소리를 멈출 수 있게)', () => {
  const w = quietWorld(); w.boss.x = w.player.x + 8;
  startLaser(w, null);
  for (let k = 0; k < ticks(RULES.laser.aim + 0.1); k++) step(w, idle);
  drainEvents(w);
  clearBeams(w);
  assert.ok(drainEvents(w).some(e => e.type === 'laserCut'));
  clearBeams(w);
  assert.ok(!drainEvents(w).some(e => e.type === 'laserCut'), '빔이 없으면 알리지 않는다');
});

test('흰 파도를 받아내면 그 자리에 고리가 끊긴다', () => {
  const w = quietWorld(); w.boss.x = 0; w.boss.z = 0; w.player.x = -8; w.player.z = 0;
  startWave(w, 'white');
  let done = false;
  for (let k = 0; k < ticks(2); k++) {
    if (!done) done = updateFloor(w);
    const v = w.waves[0];
    const gap = v ? Math.hypot(w.player.x - v.x, w.player.z - v.z) - RULES.player.bodyR - v.r : 1;
    step(w, { ...idle, parry: !!v && gap > 0 && gap < RULES.floor.wave.speed * 0.1 && !w.player.parry.active });
    if (w.waves[0]?.hitDone) break;
  }
  const v = w.waves[0];
  assert.ok(v && v.hitDone);
  assert.ok(Number.isFinite(v.gapAngle), '끊긴 자리 없음');
  assert.ok(Math.abs(v.gapAngle - Math.PI) < 0.2 || Math.abs(v.gapAngle + Math.PI) < 0.2, `끊긴 각 ${v.gapAngle}`);
});

test('파도에서 달아나도 빨간 빠른 공격은 3초에 2번까지', () => {
  for (const seed of [1, 3, 4]) {   // 검토 재현: 이 seed들에서 파도@126.88 레이저@126.91 내려찍기@129.44 등
    const w = brainWorld({ seed });
    const reds = [];
    let slamRed = false;
    for (let k = 0; k < ticks(135); k++) {
      // 평소엔 보스에 붙어 있다가(약 3 U) 파도가 오면 파도 가운데 반대쪽으로 달아난다
      const p = w.player, b = w.boss, wave = w.waves.find(v => !v.hitDone);
      let inp = idle;
      if (wave || w.floor?.kind === 'wave') {
        const cx = wave ? wave.x : b.x, cz = wave ? wave.z : b.z, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) || 1;
        inp = { ...idle, mx: dx / d, mz: dz / d };
      } else {
        const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
        if (d > 3.2) inp = { ...idle, mx: dx / d, mz: dz / d }; else if (d < 2.6) inp = { ...idle, mx: -dx / d, mz: -dz / d };
      }
      step(w, inp);
      for (const e of drainEvents(w)) {
        if (e.type === 'slamStart') slamRed = e.color === 'red';
        if ((e.type === 'slamHit' || e.type === 'slamWall') && slamRed) { reds.push(e.t); slamRed = false; }
        if (e.type === 'waveHit' && e.color === 'red') reds.push(e.t);
        if (e.type === 'laserFire') reds.push(e.t);
        if (e.type === 'meleeHit' && e.color === 'red') reds.push(e.t);
      }
    }
    reds.sort((a, b) => a - b);
    for (let i = 0; i + 2 < reds.length; i++) assert.ok(reds[i + 2] - reds[i] > RULES.floor.redWindow - 1e-6, `seed ${seed}: ${reds.slice(i, i + 3).map(t => t.toFixed(2))}`);
  }
});
