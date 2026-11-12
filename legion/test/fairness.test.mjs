// 2단계 최종 검토에서 나온 것: 중립의 방패·달아나기 방향이 편에 치우치지 않는다, 바위 곁에서 병사가 붙박이지 않는다, 그리기 색 표가 편 셋을 덮는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, STATE, ORDER } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { spawnCamps } from '../src/sim/camps.js';
import { makeRules, ARCHER, INFANTRY, CAVALRY } from '../src/sim/rules.js';
import { SIDE_COLORS, SHOT_COLORS } from '../src/view/colors.js';

const run = (w, sec, each = null) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) { step(w); if (each && each()) return true; } return false; };

test('그리기 색 표(편 색·화살 색)는 편 셋을 덮는다', () => {
  const n = makeRules().units.length;
  assert.ok(SIDE_COLORS.length >= n);
  assert.ok(SHOT_COLORS.length >= n);
});

test('중립의 방패는 제 얼굴 쪽 — 가운데 소굴을 남·북에서 같은 궁수로 쏘면 피해가 같다', () => {
  const lost = side => {
    const w = createWorld({ map: 'legion', knobs: { mirror: true } });
    spawnCamps(w);
    const s = w.soldiers, g = w.map.regions.find(r => r.i === 2 && r.j === 2), camp = w.camps.find(c => c.region === g.id);
    for (const u of w.rules.units[2]) u.speed = 0;
    w.rules.units[2][ARCHER].dps = 0;
    const hp0 = camp.ids.reduce((a, i) => a + s.hp[i], 0), dir = side === 0 ? -1 : 1;
    for (let k = 0; k < 60; k++) spawn(s, side, ARCHER, g.x - 18 + (k % 30) * 1.2, g.z + dir * (38 + Math.floor(k / 30) * 1.2), w.rules);
    run(w, 30);
    return hp0 - camp.ids.reduce((a, i) => a + (s.alive[i] ? s.hp[i] : 0), 0);
  };
  const a = lost(0), b = lost(1);
  assert.ok(Math.abs(a - b) <= 0.05 * Math.max(a, b), `남 ${a.toFixed(0)} · 북 ${b.toFixed(0)}`);
});

test('달아나는 중립은 어느 편 쪽으로도 치우치지 않고 적에게서 곧장 멀어진다', () => {
  const flee = side => {
    const w = createWorld(), s = w.soldiers;
    for (const t of w.rules.units) t[INFANTRY].speed = 0;
    const g = spawn(s, 2, INFANTRY, 300, 300, w.rules), dir = side === 0 ? -1 : 1;
    s.hp[g] = w.rules.units[2][INFANTRY].hp * 0.3;
    for (let k = 0; k < 6; k++) spawn(s, side, INFANTRY, 297 + k * 1.2, 300 + dir * 1.5, w.rules);
    assert.ok(run(w, 3, () => s.state[g] === STATE.ROUT), '달아나기 시작');
    return s.routZ[g] - s.z[g];
  };
  const a = flee(0), b = flee(1);
  assert.ok(a > 0 && b < 0, `남쪽 적 → +z(${a.toFixed(2)}), 북쪽 적 → −z(${b.toFixed(2)})`);
  assert.ok(Math.abs(a + b) < 0.5, `대칭 ${a.toFixed(2)} / ${b.toFixed(2)}`);
});

test('바위를 건너 보낸 병사는 붙박이지 않고 모두 닿는다', () => {
  for (const [type, n, x0, z0, x1, z1] of [[INFANTRY, 150, 50, 196, 135, 196], [CAVALRY, 60, 450, 125, 540, 118]]) {
    const w = createWorld({ map: 'legion' }), s = w.soldiers, ids = [];
    for (let k = 0; k < n; k++) { const x = x0 + (k % 15 - 7) * 1.2, z = z0 + (Math.floor(k / 15) - 5) * 1.2; if (w.map.walkable(x, z)) ids.push(spawn(s, 0, type, x, z, w.rules)); }
    assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: x1, z: z1 } }).ok);
    run(w, 120);
    const far = ids.filter(i => Math.hypot(s.x[i] - x1, s.z[i] - z1) > 25);
    assert.equal(far.length, 0, `(${x0},${z0}) → (${x1},${z1}): 못 닿은 ${far.length}명, 예 ${far.slice(0, 2).map(i => `${s.x[i].toFixed(1)},${s.z[i].toFixed(1)}`).join(' ')}`);
  }
});

test('바위 곁으로 끌려 나간 소굴 괴물도 제 자리로 돌아간다', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers;
  spawnCamps(w);
  const volcano = w.map.regions.find(r => r.i === 0 && r.j === 1), camp = w.camps.find(c => c.region === volcano.id);
  let k = 0, bd = Infinity;
  camp.spots.forEach(([x, z], q) => { const d = Math.hypot(x - 134, z - 223); if (d < bd) { bd = d; k = q; } });
  const i = camp.ids[k], [x, z] = camp.spots[k];
  s.x[i] = s.px[i] = 76.5; s.z[i] = s.pz[i] = 187.6;
  const back = run(w, 40, () => Math.hypot(s.x[i] - x, s.z[i] - z) <= 10 && s.order[i] === ORDER.NONE);
  assert.ok(back, `(${s.x[i].toFixed(1)}, ${s.z[i].toFixed(1)}) 명령 ${s.order[i]}`);
});
