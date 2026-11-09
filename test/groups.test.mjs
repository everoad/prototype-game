import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { wedgeOffsets } from '../src/sim/groups.js';
import { applyOrder } from '../src/sim/orders.js';
import { spawn } from '../src/sim/soldiers.js';
import { spawnGarrisons } from '../src/sim/production.js';
import { levyOnlyWorld, runSeconds } from './helpers.mjs';

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

const hqIndex = w => w.strongholds.findIndex(s => s.id === 'hq0');
const groupsOf = (w, state) => w.groups.filter(x => x.origin === hqIndex(w) && x.state === state);

test('본진 앞에 무게 150이 모이면 쐐기가 출발한다 (600/분 → 15초)', () => {
  const w = levyOnlyWorld();
  runSeconds(w, 13);
  assert.equal(groupsOf(w, 'march').length, 0);
  assert.equal(groupsOf(w, 'gather').length, 1);
  runSeconds(w, 4);
  assert.equal(groupsOf(w, 'march').length, 1);
});

test('화살표를 바꾸면 모이는 쐐기만 따르고, 출발한 쐐기는 원래 목표로 간다', () => {
  const w = levyOnlyWorld();
  runSeconds(w, 20);                               // 하나 출발, 다음 것이 모이는 중
  const marching = groupsOf(w, 'march')[0], gathering = groupsOf(w, 'gather')[0];
  assert.equal(marching.target.id, 'vpC');                    // 처음 생산 방향 = 가장 가까운 승점(사용자 2026-11-08)
  assert.equal(applyOrder(w, { kind: 'arrow', side: 0, from: 'hq0', target: { kind: 'sector', id: 's0-right' } }).ok, true);
  assert.equal(marching.target.id, 'vpC');
  assert.equal(gathering.target.id, 's0-right');
});

test('쐐기 끝 60 m 안에 적이 오면 진형 그대로 달리고, 맞닿아야 풀린다 (사용자 2026-11-06)', () => {
  const w = levyOnlyWorld();
  runSeconds(w, 16);
  const grp = groupsOf(w, 'march')[0];
  const ahead = { x: grp.x + Math.cos(grp.heading) * 50, z: grp.z + Math.sin(grp.heading) * 50 };
  spawn(w.soldiers, 1, 0, ahead.x, ahead.z, w.rules);
  runSeconds(w, 1);
  assert.equal(w.groups.includes(grp), true, '60 m 안이어도 아직 진형');
  assert.equal(grp.charging, true);
  let t = 0;
  while (w.groups.includes(grp) && t < 25) { runSeconds(w, 0.5); t += 0.5; }
  assert.equal(w.groups.includes(grp), false, '맞닿으면 풀린다');
});

// 대각선으로 가는 쐐기: 뒤 거점 r0L(250,150) → 가운데 구역(600,390)
function diagonalWorld() {
  const w = levyOnlyWorld();
  for (const st of w.strongholds) { if (st.id === 'r0L') { st.owner = 0; st.gauge = 100; } if (st.id === 'hq0') { st.owner = null; st.gauge = 0; } }
  w.sides[0].arrows.set('r0L', { kind: 'sector', id: 's0-center' });
  spawnGarrisons(w);                                // r0L 수비대도 처음부터 차 있다
  return w;
}

test('대각선 행군: 쐐기가 격자 방향(45°)으로 계단식으로 꺾이지 않는다', () => {
  const w = diagonalWorld();
  runSeconds(w, 27);                                // 350/분 → 약 26초에 출발
  const grp = w.groups.find(x => x.state === 'march');
  assert.ok(grp, '출발한 쐐기');
  runSeconds(w, 4);                                 // 출발 직후 한 번 도는 것은 빼고
  const hs = [];
  const every = 1 / w.rules.knobs.speed;             // 같은 거리마다 잰다(빨리 걸으면 1초 사이 변화도 그만큼 크다)
  for (let k = 0; k < 60 && w.groups.includes(grp); k++) { runSeconds(w, every); hs.push(grp.heading * 180 / Math.PI); }
  let worst = 0;
  for (let k = 1; k < hs.length; k++) worst = Math.max(worst, Math.abs(hs[k] - hs[k - 1]));
  assert.ok(hs.length >= 30, `행군 ${hs.length}초`);
  assert.ok(worst < 8, `보병 3 m 걸음 사이 가장 큰 방향 변화 ${worst.toFixed(1)}°`);
});

test('행군 중인 쐐기의 병사는 멈췄다 걷기를 반복하지 않는다', () => {
  const w = diagonalWorld();
  runSeconds(w, 30);
  const grp = w.groups.find(x => x.state === 'march');
  const ids = grp.members.slice(0, 20);
  let stops = 0;
  for (let k = 0; k < 100; k++) {
    runSeconds(w, 0.1);
    for (const i of ids) if (Math.hypot(w.soldiers.vx[i], w.soldiers.vz[i]) < 0.5) stops++;
  }
  assert.ok(stops < 20, `멈춘 횟수 ${stops} / 2000`);
});
