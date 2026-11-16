// Task 6: 탄막 패턴 7개와 차선 — 준비 색, 조준 차선 고정, 흰·금 한 속도와 0.4초 규칙, 탄 벽 빈틈, sparse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { PATTERNS, startPattern, updatePattern, windupColor } from '../src/sim/patterns.js';
import { quietWorld, idle } from './helpers.mjs';

// 패턴을 끝까지(또는 maxSec까지) 돌린다. 틱마다 onTick(w)을 부른다.
function runPattern(w, id, { sparse = false, maxSec = 6, onTick = null } = {}) {
  const run = startPattern(w, id, { sparse });
  for (let k = 0; k < maxSec / RULES.dt && !updatePattern(w, run); k++) { step(w, idle); onTick?.(w, run); }
  onTick?.(w, run);   // 끝난 틱(updatePattern 안)에 낸 사건까지
  return run;
}
const fires = ev => ev.filter(e => e.type === 'fire');

test('준비 번쩍임 색은 다음 위협 색', () => {
  assert.equal(windupColor(1), 'white'); assert.equal(windupColor(2), 'gold'); assert.equal(windupColor(3), 'red');
  assert.equal(windupColor(6), 'gold'); assert.equal(windupColor(7), 'white');
});

test('조준 차선은 발사 0.2초 전까지 따라오고 그 뒤 고정', () => {
  const w = quietWorld();
  const run = startPattern(w, 3);
  const tick = sec => { for (let k = 0; k < Math.round(sec / RULES.dt); k++) { updatePattern(w, run); step(w, idle); } };
  tick(0.1);
  const lane = w.lanes[0]; const a0 = lane.angle;
  w.player.z += 2; tick(0.3);          // 0.4초: 아직 따라옴
  const a1 = lane.angle;
  assert.notEqual(a1, a0);
  tick(0.15);                          // 0.55초: 고정됨(경고 0.7 − 0.2)
  const a2 = lane.angle;
  w.player.z -= 3; tick(0.1);
  assert.equal(lane.angle, a2);
});

test('모든 패턴의 흰·금 탄은 14 U/s이고 패링 원까지 0.4초 넘게 걸린다(가까우면 멈췄다 출발)', () => {
  let special = 0;
  for (const id of Object.keys(PATTERNS).map(Number)) {
    for (const d of [3, 7, 12]) {
      const w = quietWorld(); w.boss.x = w.player.x + d; w.boss.z = 0;
      runPattern(w, id, {
        onTick: w => {
          for (const e of fires(drainEvents(w))) {
            if (e.kind !== K.WHITE && e.kind !== K.GOLD) continue;
            special++;
            const sp = Math.hypot(w.bullets.vx[e.id], w.bullets.vz[e.id]);
            assert.ok(Math.abs(sp - RULES.bullets.parrySpeed) < 1e-9, `패턴 ${id} 속도 ${sp}`);
            const dist = Math.hypot(e.x - w.player.x, e.z - w.player.z), hold = Math.max(0, w.bullets.holdUntil[e.id] - w.time);
            const arrive = hold + Math.max(0, dist - RULES.player.parryR) / RULES.bullets.parrySpeed;
            assert.ok(arrive >= 0.4 - 2 * RULES.dt, `패턴 ${id} 거리 ${d}: ${arrive}초`);
          }
        },
      });
    }
  }
  assert.ok(special > 20, `흰·금 탄 ${special}발`);
});

test('탄 벽에는 늘 비어 있는 빈틈이 하나 있다', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const w = quietWorld({ seed }); w.boss.x = 4; w.boss.z = 1;
    const run = startPattern(w, 7);
    updatePattern(w, run);
    const b = w.bullets, ax = w.player.x - w.boss.x, az = w.player.z - w.boss.z, n = Math.hypot(ax, az);
    const tx = -az / n, tz = ax / n;   // 줄 방향
    const items = [];
    for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] === 7) items.push({ s: (b.x[i] - w.boss.x) * tx + (b.z[i] - w.boss.z) * tz, kind: b.kind[i] });
    const solid = items.filter(o => o.kind !== K.WHITE).map(o => o.s).sort((p, q) => p - q);
    const gaps = [];
    for (let k = 1; k < solid.length; k++) if (solid[k] - solid[k - 1] > 1.6) gaps.push([solid[k - 1], solid[k]]);
    assert.equal(gaps.length, 2, `seed ${seed} 빈칸 ${JSON.stringify(gaps)}`);
    const inside = ([lo, hi]) => items.filter(o => o.s > lo && o.s < hi);
    const contents = gaps.map(inside);
    assert.ok(contents.some(c => c.length === 0), '비어 있는 빈틈 없음');
    assert.ok(contents.some(c => c.length > 0 && c.every(o => o.kind === K.WHITE)), '흰 탄으로 막힌 빈틈 없음');
    assert.ok(run.wallLine && run.wallLine.length === 4);
  }
});

test('sparse면 발 수가 절반', () => {
  for (const id of Object.keys(PATTERNS).map(Number)) {
    const count = sparse => { const w = quietWorld(); let n = 0; runPattern(w, id, { sparse, onTick: w => { n += fires(drainEvents(w)).length; } }); return n; };
    const full = count(false), half = count(true);
    assert.ok(half <= full * 0.65 && half >= full * 0.3, `패턴 ${id}: ${half}/${full}`);
  }
});

test('쪼개지는 구슬은 터지기 전에 흰 조각 방향을 표시한다', () => {
  const w = quietWorld();
  let marked = false;
  runPattern(w, 4, { onTick: (w, run) => { if (!run.burst && run.marks?.length === 2) marked = true; } });
  assert.ok(marked);
});

// 조사 보고서(2026-11-16): 보스에 붙어 있으면 쪼개지는 구슬의 흰 조각이 보통 탄으로 바뀌어 사라졌다 — 받아칠 탄 보장
test('보스에 붙어 있어도 쪼개지는 구슬의 흰 조각은 흰 탄으로 나온다', () => {
  for (const d of [4.5, 5.5]) {
    const w = quietWorld(); w.boss.x = w.player.x + d; w.boss.z = 0;
    let whites = 0;
    runPattern(w, 4, { onTick: w => { for (const e of fires(drainEvents(w))) if (e.kind === K.WHITE) whites++; } });
    assert.equal(whites, RULES.patterns[4].whites, `거리 ${d}: 흰 조각 ${whites}`);
  }
});
