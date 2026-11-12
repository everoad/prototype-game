// 투석기(설계서 2026-11-09-flood-catapult-design.md): 맞붙어 싸우지 않고, 사거리 100 m에서 돌을 쏜다(사기·성벽 치기는 군단 영지에서 빠졌다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { SIEGE, INFANTRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';

const empty = (knobs = {}) => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true, ...knobs } });
const run = (w, sec, each) => { for (let k = 0; k < Math.round(sec * 20); k++) { step(w); each?.(); } };
const st = (w, id) => ({ f0L: { x: 350, z: 250 }, f1L: { x: 350, z: 550 } })[id];   // 옛 거점 자리(홍수 시험 지도)
const catapults = (w, side) => { const s = w.soldiers, out = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.type[i] === SIEGE) out.push(i); return out; };
function stillFoe(w, x, z, type = INFANTRY) {                     // 움직이지도 치지도 않고 죽지도 않는 적
  w.rules.units[1][type].speed = 0; w.rules.units[1][type].dps = 0;
  const s = w.soldiers, i = spawn(s, 1, type, x, z, w.rules);
  s.hp[i] = 1e6; setGoal(w, [i], { kind: 'point', x, z }); s.state[i] = STATE.FRONT;
  return i;
}
function buy(w, id = 'f0L') { const c = st(w, id); return mine(w, 3, c.x - 3, c.z); }   // 그 거점 가운데에 세 대(투석기 사기는 빠졌다 — 3단계에서 공방 생산)

// ---- 몸 ----
test('제자리에 선 투석기는 옆의 적을 쫓지 않는다', () => {
  const w = empty(), cat = buy(w), s = w.soldiers, c = st(w, 'f0L');
  const x0 = cat.map(i => s.x[i]), z0 = cat.map(i => s.z[i]);
  stillFoe(w, c.x + 30, c.z);
  let picked = 0, far = 0;
  run(w, 10, () => { for (const [k, i] of cat.entries()) { if (s.target[i] >= 0 || s.rtarget[i] >= 0) picked++; far = Math.max(far, Math.hypot(s.x[i] - x0[k], s.z[i] - z0[k])); } });
  assert.equal(picked, 0, '과녁을 고르지 않는다'); assert.ok(far < 50, `움직인 거리 ${far.toFixed(0)}`);
});

test('투석기에 적 병사 공격 명령을 주면 사거리(100 m)에서 멈춘다', () => {
  const w = empty(), cat = buy(w), s = w.soldiers, c = st(w, 'f0L');
  const foe = stillFoe(w, c.x, c.z + 130);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: cat }, target: { kind: 'foe', id: foe, serial: s.serial[foe] } }).ok);
  let closest = Infinity;
  run(w, 40, () => { for (const i of cat) closest = Math.min(closest, Math.hypot(s.x[i] - s.x[foe], s.z[i] - s.z[foe])); });
  assert.ok(closest >= 90, `가장 가까이 ${closest.toFixed(0)} m`);
});

test('투석기는 맞닿은 적을 근접으로 치지 않는다', () => {
  const w = empty(), s = w.soldiers, [c] = mine(w, 1, 300, 200);   // 한 대만(다른 투석기는 떨어진 자리에서 돌로 칠 수 있다)
  const foe = stillFoe(w, s.x[c] + 1, s.z[c]);
  run(w, 10);
  assert.equal(s.hp[foe], 1e6);
});

// ---- Task 3: 쏘기와 돌 ----
import { ARCHER } from '../src/sim/rules.js';
import { kill } from '../src/sim/soldiers.js';
const mine = (w, n, x, z, side = 0) => { const s = w.soldiers, ids = []; for (let k = 0; k < n; k++) { const i = spawn(s, side, SIEGE, x + k * 3, z, w.rules); setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); ids.push(i); } return ids; };
const eventsDuring = (w, sec, kind) => { const out = []; for (let k = 0; k < Math.round(sec * 20); k++) { step(w); for (const e of w.events) if (e.kind === kind) out.push({ ...e, t: w.time }); } return out; };

test('돌은 쏜 뒤 2초에 떨어진다', () => {
  const w = empty();
  mine(w, 1, 600, 250);
  stillFoe(w, 600, 300);                                          // 50 m(시야 안) — 홍수에서는 성벽 거점을 쏴서 쟀다
  const fire = eventsDuring(w, 1, 'boulderFire'), land = eventsDuring(w, 3, 'boulderLand');
  assert.equal(fire.length, 1); assert.ok(land.length >= 1);
  assert.ok(Math.abs(land[0].t - fire[0].t - w.rules.catapult.flight) < 0.051, `${fire[0].t} → ${land[0].t}`);
});

test('돌은 떨어진 자리 둘레 3 m의 적만 맞힌다 — 그 사이 비킨 적은 안 맞는다', () => {
  const w = empty(), s = w.soldiers;
  mine(w, 1, 300, 200);
  const foes = []; for (let k = 0; k < 5; k++) foes.push(stillFoe(w, 299 + (k % 3), 250 + Math.floor(k / 3), ARCHER));
  for (const i of foes) s.hp[i] = 1000;
  const fire = eventsDuring(w, 1, 'boulderFire');
  assert.equal(fire.length, 1, '쐈다');
  s.x[foes[0]] += 10; s.x[foes[1]] += 10;                         // 쏜 뒤 둘이 비킨다
  eventsDuring(w, 2.5, 'boulderLand');
  assert.equal(s.hp[foes[0]], 1000); assert.equal(s.hp[foes[1]], 1000);
  for (const i of foes.slice(2)) assert.ok(s.hp[i] < 1000 && 1000 - s.hp[i] <= 40 * 1.5 + 1e-6, `잃은 체력 ${1000 - s.hp[i]}`);
});

test('12 m 안의 적은 못 쏘고, 맞닿은 적이 있으면 쏘지 않는다', () => {
  const w = empty(), s = w.soldiers;
  const [a] = mine(w, 1, 300, 200);
  stillFoe(w, 300, 208);
  assert.equal(eventsDuring(w, 6, 'boulderFire').length, 0, '8 m 앞만 있으면 안 쏜다');
  const w2 = empty(), s2 = w2.soldiers;
  const [b] = mine(w2, 1, 300, 200);
  stillFoe(w2, 300, 201); stillFoe(w2, 300, 250);                 // 붙은 적 + 50 m 적
  assert.equal(eventsDuring(w2, 6, 'boulderFire').length, 0, '붙은 적이 있으면 안 쏜다');
  void a; void b; void s; void s2;
});

// ---- 최종 검토(2026-11-09) ----
import { GOAL } from '../src/sim/soldiers.js';

test('걸어가는 투석기는 쏘지 않는다(서야 쏜다)', () => {
  const w = empty(), s = w.soldiers;
  const [c] = mine(w, 1, 300, 200);
  for (let k = 0; k < 6; k++) stillFoe(w, 350 + k, 260);           // 지나가는 길 옆 50~60 m
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [c] }, target: { kind: 'point', x: 300, z: 400 } }).ok);
  let moving = 0;
  for (let k = 0; k < 20 * 20; k++) { step(w); if (Math.hypot(s.vx[c], s.vz[c]) > 0.5) for (const e of w.events) if (e.kind === 'boulderFire') moving++; }
  assert.equal(moving, 0, '걸으면서 쏜 돌');
});

