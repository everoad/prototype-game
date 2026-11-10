// 투석기(설계서 2026-11-09-flood-catapult-design.md): 금 150에 3대, 맞붙어 싸우지 않고, 사거리 100 m에서 돌을 쏜다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { SIEGE, INFANTRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';

const empty = (knobs = {}) => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true, ...knobs } });
const run = (w, sec, each) => { for (let k = 0; k < Math.round(sec * 20); k++) { step(w); each?.(); } };
const st = (w, id) => w.strongholds.find(x => x.id === id);
const catapults = (w, side) => { const s = w.soldiers, out = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.type[i] === SIEGE) out.push(i); return out; };
function stillFoe(w, x, z, type = INFANTRY) {                     // 움직이지도 치지도 않고 죽지도 않는 적
  w.rules.units[1][type].speed = 0; w.rules.units[1][type].dps = 0;
  const s = w.soldiers, i = spawn(s, 1, type, x, z, w.rules);
  s.hp[i] = 1e6; setGoal(w, [i], { kind: 'point', x, z }); s.state[i] = STATE.FRONT;
  return i;
}
function buy(w, id = 'f0L') { w.sides[0].gold = 500; assert.ok(applyOrder(w, { kind: 'buySiege', side: 0, stronghold: id }).ok); run(w, 20.1); return catapults(w, 0); }

// ---- Task 2: 몸과 사기 ----
test('투석기: 금 150에 20초 뒤 3대(규모 0.2면 1대)', () => {
  assert.equal(buy(empty()).length, 3);
  assert.equal(buy(empty({ scale: 0.2 })).length, 1);
});

test('우리 거점에 선 투석기는 옆의 적을 쫓지 않는다', () => {
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
import { wallStanding } from '../src/sim/production.js';
import { ARCHER } from '../src/sim/rules.js';
import { kill } from '../src/sim/soldiers.js';
const mine = (w, n, x, z, side = 0) => { const s = w.soldiers, ids = []; for (let k = 0; k < n; k++) { const i = spawn(s, side, SIEGE, x + k * 3, z, w.rules); setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); ids.push(i); } return ids; };
const walled = (w, id) => { const t = st(w, id); t.slots[t.slotCount] = { kind: 'wall', level: 1, hp: w.rules.buildings.wall.hp, building: false }; return t; };
const eventsDuring = (w, sec, kind) => { const out = []; for (let k = 0; k < Math.round(sec * 20); k++) { step(w); for (const e of w.events) if (e.kind === kind) out.push({ ...e, t: w.time }); } return out; };

test('투석기 3대가 앞 거점 성벽(20,000)을 돌 피해대로 깬다(350이면 약 78초)', () => {
  const w = empty(), t = walled(w, 'f1L');
  mine(w, 3, t.x - 3, t.z - 70);
  let downAt = null;
  for (let k = 0; k < 120 * 20 && downAt === null; k++) { step(w); if (!wallStanding(t)) downAt = w.time; }
  const C = w.rules.catapult, rounds = Math.ceil(Math.ceil(w.rules.buildings.wall.hp / C.buildingHit) / 3), expect = C.flight + C.reload * (rounds - 1);   // 3대가 같이 쏘므로 한 번에 3발
  assert.ok(downAt !== null && Math.abs(downAt - expect) < 1.5, `성벽이 깨진 때 ${downAt} (계산 ${expect})`);
  assert.ok(expect > 70 && expect < 85, `350이면 약 78초 — 지금 ${expect}`);
});

test('돌은 쏜 뒤 2초에 떨어진다', () => {
  const w = empty(), t = walled(w, 'f1L');
  mine(w, 1, t.x, t.z - 70);
  const fire = eventsDuring(w, 0.5, 'boulderFire'), land = eventsDuring(w, 3, 'boulderLand');
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

test('사거리 안에 적 거점이 있으면 병사보다 성벽부터 친다', () => {
  const w = empty(), t = walled(w, 'f1L');
  const [c] = mine(w, 1, t.x, t.z - 70);
  stillFoe(w, w.soldiers.x[c], w.soldiers.z[c] + 40);
  const land = eventsDuring(w, 3, 'boulderLand');
  assert.ok(land.length >= 1 && Math.hypot(land[0].x - t.x, land[0].z - t.z) < 1, JSON.stringify(land[0]));
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

test('돌이 나는 사이 과녁 거점이 우리 것이 되면 그 건물을 치지 않고, 떨어진 자리의 우리 병사는 안 맞는다', () => {
  const w = empty(), t = walled(w, 'f1L'), k = t.slotCount;
  mine(w, 1, t.x, t.z - 70);
  assert.equal(eventsDuring(w, 0.5, 'boulderFire').length, 1);
  t.owner = 0;
  eventsDuring(w, 2.5, 'boulderLand');
  assert.equal(t.slots[k].hp, w.rules.buildings.wall.hp, '우리 것이 된 거점 성벽은 그대로');
  const w2 = empty(), s2 = w2.soldiers;
  mine(w2, 1, 300, 200);
  for (let n = 0; n < 4; n++) stillFoe(w2, 299 + n, 250);
  const ours = spawn(s2, 0, ARCHER, 300.5, 250.5, w2.rules); setGoal(w2, [ours], { kind: 'point', x: 300.5, z: 250.5 }); const hp0 = s2.hp[ours];
  eventsDuring(w2, 3, 'boulderLand');
  assert.equal(s2.hp[ours], hp0, '우리 병사는 안 맞는다');
});

test('산 투석기 무리가 다 부서지면 결과 알림이 한 번 뜬다', () => {
  const w = empty(), t = walled(w, 'f1L'), s = w.soldiers;
  w.sides[0].gold = 500; applyOrder(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' }); run(w, 20.1);
  const cat = catapults(w, 0);
  cat.forEach((i, n) => { s.x[i] = t.x - 3 + n * 3; s.z[i] = t.z - 70; setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); });
  run(w, 8);
  for (const i of cat) kill(s, i);
  run(w, 0.5);
  const notes = () => w.notices.filter(n => n.kind === 'castResult' && n.order === 'catapult');
  assert.equal(notes().length, 1); assert.ok(notes()[0].wall > 0, JSON.stringify(notes()[0]));
  run(w, 1); assert.equal(notes().length, 1, '한 번만');
});

// ---- 최종 검토(2026-11-09) ----
import { GOAL } from '../src/sim/soldiers.js';

test('거점으로 보낸 투석기는 성벽이 사거리에 들면 멈춰서 쏜다(원 안으로 걸어 들어가지 않는다)', () => {
  const w = empty(), t = walled(w, 'f1L'), s = w.soldiers;
  const cats = mine(w, 3, t.x - 3, t.z - 200);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: cats }, target: { kind: 'stronghold', id: 'f1L' } }).ok);
  let closest = Infinity, shots = 0;
  for (let k = 0; k < 90 * 20; k++) { step(w); for (const e of w.events) if (e.kind === 'boulderFire') shots++; for (const i of cats) closest = Math.min(closest, Math.hypot(s.x[i] - t.x, s.z[i] - t.z)); }
  assert.ok(closest >= t.radius * 0.5 + w.rules.units[0][SIEGE].range - 15, `가운데에서 가장 가까이 ${closest.toFixed(0)} m`);
  assert.ok(shots > 10, `쏜 돌 ${shots}`);
});

test('걸어가는 투석기는 쏘지 않는다(서야 쏜다)', () => {
  const w = empty(), s = w.soldiers;
  const [c] = mine(w, 1, 300, 200);
  for (let k = 0; k < 6; k++) stillFoe(w, 350 + k, 260);           // 지나가는 길 옆 50~60 m
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [c] }, target: { kind: 'point', x: 300, z: 400 } }).ok);
  let moving = 0;
  for (let k = 0; k < 20 * 20; k++) { step(w); if (Math.hypot(s.vx[c], s.vz[c]) > 0.5) for (const e of w.events) if (e.kind === 'boulderFire') moving++; }
  assert.equal(moving, 0, '걸으면서 쏜 돌');
});

test('돌이 나는 사이 투석기 번호가 새 병사에게 넘어가도 결과 알림은 그 무리 것만 센다', () => {
  const w = empty(), t = walled(w, 'f1L'), s = w.soldiers;
  w.sides[0].gold = 500; applyOrder(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' }); run(w, 20.1);
  const cat = catapults(w, 0);
  cat.forEach((i, n) => { s.x[i] = t.x - 3 + n * 3; s.z[i] = t.z - 70; setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); });
  let fired = false;
  for (let k = 0; k < 40 && !fired; k++) { step(w); fired = w.events.some(e => e.kind === 'boulderFire'); }
  assert.ok(fired);
  for (const i of cat) kill(s, i);
  const reborn = cat.map(() => spawn(s, 0, SIEGE, 300, 300, w.rules));   // 같은 번호를 물려받는다
  assert.deepEqual([...reborn].sort(), [...cat].sort());
  run(w, 3);                                                       // 날던 돌이 떨어진다
  const notes = w.notices.filter(n => n.kind === 'castResult' && n.order === 'catapult');
  assert.equal(notes.length, 1, '물려받은 병사가 살아 있어도 무리는 끝났다');
  assert.equal(notes[0].wall, 3 * w.rules.catapult.buildingHit, '날던 돌 셋만');
});
