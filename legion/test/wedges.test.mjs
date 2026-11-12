// 쐐기가 적 앞에서 풀릴 때(사용자 2026-11-10 영상 "적에 거의 붙을 때 와장창 흩어진다 — 자연스러운 게 아니라"):
// 풀린 순간 병사들은 가던 쪽 그대로 적에게 붙는다 — 승점 둘레 제각각 자리로 걷거나 몸을 휙 돌리지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { setGoal } from '../src/sim/world.js';
import { applyOrder } from '../src/sim/orders.js';

// 홍수 시험 장면 spawnWedgeClashLab 그대로(승점 vpC로 보내기 → 그 자리 점 + engage): 우리 창 100이 (600, 400)으로 싸우며 가고, 창 고블린 120 쐐기가 맞은편에서 온다.
function wedgeClash(w) {
  const s = w.soldiers;
  const block = (side, n, x, z) => {
    const ids = [];
    for (let k = 0; k < n; k++) {
      const id = spawn(s, side, 0, x + (k % 10) * 1.4, z + Math.floor(k / 10) * 1.4 * (side ? 1 : -1), w.rules);
      setGoal(w, [id], { kind: 'point', x: s.x[id], z: s.z[id] });
      s.state[id] = STATE.FRONT;
      ids.push(id);
    }
    return ids;
  };
  const ours = block(0, 100, 560, 300), foes = block(1, 120, 560, 470);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 600, z: 400 }, engage: true });
  applyOrder(w, { kind: 'send', side: 1, from: { kind: 'ids', ids: foes }, target: { kind: 'point', x: 570, z: 280 }, engage: true });
  return { ours, foes };
}

test('쐐기가 적 앞에서 풀린 0.25초 뒤 병사들은 가던 쪽으로 걷고 그쪽을 본다(제각각 흩어지지 않는다)', () => {
  const w = createWorld({ seed: 1, scenario: 'empty' }), s = w.soldiers, { ours } = wedgeClash(w);
  let heading = null, broke = false;
  for (let t = 0; t < 40 * 20 && !broke; t++) {
    step(w);
    const g = w.groups.find(x => x.side === 0);
    if (g) heading = g.heading; else broke = heading !== null;
  }
  assert.ok(broke, '쐐기가 풀렸다');
  for (let k = 0; k < 5; k++) step(w);                              // 0.25초
  const off = a => Math.abs(Math.atan2(Math.sin(a - heading), Math.cos(a - heading))) > Math.PI / 3;
  const live = ours.filter(i => s.alive[i]);
  const walkOff = live.filter(i => Math.hypot(s.vx[i], s.vz[i]) > 0.5 && off(Math.atan2(s.vz[i], s.vx[i]))).length;
  const faceOff = live.filter(i => off(s.facing[i])).length;
  assert.ok(walkOff <= 5, `가던 쪽에서 60° 넘게 어긋나 걷는 병사 ${walkOff}/${live.length}`);
  assert.ok(faceOff <= 5, `60° 넘게 돌아선 병사 ${faceOff}/${live.length}`);
});
