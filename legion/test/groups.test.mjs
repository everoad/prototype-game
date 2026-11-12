import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, INFANTRY } from '../src/sim/rules.js';
import { wedgeOffsets } from '../src/sim/groups.js';
import { applyOrder } from '../src/sim/orders.js';
import { spawn } from '../src/sim/soldiers.js';
import { runSeconds } from './helpers.mjs';
import { createWorld } from '../src/sim/world.js';

const g = makeRules().group;

test('쐐기 모양: 맨 앞 한 명, 줄마다 2명씩 넓어져 최대 15명 폭 (설계서 §6.4)', () => {
  assert.deepEqual(wedgeOffsets(1, g), [{ f: 0, l: 0 }]);
  const four = wedgeOffsets(4, g);
  assert.deepEqual(four.map(o => o.f), [0, -g.rowGap, -g.rowGap, -g.rowGap]);
  assert.deepEqual(four.slice(1).map(o => o.l).sort((a, b) => a - b), [-g.lateral, 0, g.lateral]);
  const big = wedgeOffsets(200, g);
  assert.equal(big.length, 200);
  const rows = new Map();
  for (const o of big) rows.set(o.f, (rows.get(o.f) ?? 0) + 1);
  const widths = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(e => e[1]);
  assert.deepEqual(widths.slice(0, 8), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.ok(Math.max(...widths) === g.maxWidth);
});


test('쐐기 끝 60 m 안에 적이 오면 진형 그대로 달리고, 맞닿아야 풀린다 (사용자 2026-11-06)', () => {
  const w = sentWedge(600, 120, 600, 390);
  runSeconds(w, 2);
  const grp = w.groups.find(x => x.state === 'march');
  const ahead = { x: grp.x + Math.cos(grp.heading) * 50, z: grp.z + Math.sin(grp.heading) * 50 };
  spawn(w.soldiers, 1, 0, ahead.x, ahead.z, w.rules);
  runSeconds(w, 1);
  assert.equal(w.groups.includes(grp), true, '60 m 안이어도 아직 진형');
  assert.equal(grp.charging, true);
  let t = 0;
  while (w.groups.includes(grp) && t < 25) { runSeconds(w, 0.5); t += 0.5; }
  assert.equal(w.groups.includes(grp), false, '맞닿으면 풀린다');
});

// 보병 150명(쐐기 하나)을 (fx, fz)에 세우고 (tx, tz)로 싸우며 보낸다 — 홍수에서는 본진 징집으로 모인 쐐기였다(군단 영지에 징집이 없다).
function sentWedge(fx, fz, tx, tz) {
  const w = createWorld({ scenario: 'empty', seed: 1 }), ids = [];
  for (let k = 0; k < 150; k++) ids.push(spawn(w.soldiers, 0, INFANTRY, fx + (k % 15) * 1.0, fz + Math.floor(k / 15) * 1.0, w.rules));
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: tx, z: tz }, engage: true });
  return w;
}

// 대각선으로 가는 쐐기: 뒤 거점 자리(250,150) → 가운데(600,390)
function diagonalWorld() { return sentWedge(250, 150, 600, 390); }

test('대각선 행군: 쐐기가 격자 방향(45°)으로 계단식으로 꺾이지 않는다', () => {
  const w = diagonalWorld();
  runSeconds(w, 1);                                 // 보내자마자 출발
  const grp = w.groups.find(x => x.state === 'march');
  assert.ok(grp, '출발한 쐐기');
  // 같은 거리마다 잰다(빨리 걸으면 1초 사이 변화도 그만큼 크다): pace = 보병 빠르기 3·이동 배율 1일 때 1초가 걷는 거리의 몫
  const pace = 3 * w.rules.knobs.speed / w.rules.units[0][INFANTRY].speed;
  runSeconds(w, 4 * pace);                          // 출발 직후 한 번 도는 것은 빼고
  const hs = [];
  const every = pace / w.rules.knobs.speed;
  // 50번(약 130 m) = 대각선 구간. 그 뒤 길이 구역 선 쪽으로 한 번 꺾인다(52° → 65°, 빠르기 3에서도 61번째에) — 계단이 아니라 길의 굽이(2026-11-10 보병 3 → 3.5에서 60번 창이 그 굽이에 닿았다)
  for (let k = 0; k < 50 && w.groups.includes(grp); k++) { runSeconds(w, every); hs.push(grp.heading * 180 / Math.PI); }
  let worst = 0;
  for (let k = 1; k < hs.length; k++) worst = Math.max(worst, Math.abs(hs[k] - hs[k - 1]));
  assert.ok(hs.length >= 30, `행군 ${hs.length}초`);
  assert.ok(worst < 8, `보병 3 m 걸음 사이 가장 큰 방향 변화 ${worst.toFixed(1)}°`);
});

test('행군 중인 쐐기의 병사는 멈췄다 걷기를 반복하지 않는다', () => {
  const w = diagonalWorld();
  runSeconds(w, 4);                                 // 출발 뒤 4초(홍수: 26초에 출발해 30초)
  const grp = w.groups.find(x => x.state === 'march');
  const ids = grp.members.slice(0, 20);
  let stops = 0;
  for (let k = 0; k < 100; k++) {
    runSeconds(w, 0.1);
    for (const i of ids) if (Math.hypot(w.soldiers.vx[i], w.soldiers.vz[i]) < 0.5) stops++;
  }
  assert.ok(stops < 20, `멈춘 횟수 ${stops} / 2000`);
});
