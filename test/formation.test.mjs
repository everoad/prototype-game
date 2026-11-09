// 거점 수비 진형(설계서 2026-11-09-flood-stronghold-formation-design.md): 창 바깥 → 궁수 바로 뒤 → 보병 → 기병, 바깥 고리 창은 쫓지 않고 꽂는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';

const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
const run = (w, sec) => { for (let k = 0; k < Math.round(sec * 20); k++) step(w); };
const st = (w, id) => w.strongholds.find(x => x.id === id);
function standAt(w, id, n, type, side = 0) {
  const s0 = st(w, id), ids = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 10 + (k % 5) * 3;
    const i = spawn(w.soldiers, side, type, s0.x + Math.cos(a) * r, s0.z + Math.sin(a) * r, w.rules);
    ids.push(i);
  }
  setGoal(w, ids, { kind: 'stronghold', id });
  return ids;
}
const meanR = (w, ids, id) => { const s = w.soldiers, c = st(w, id), a = ids.filter(i => s.alive[i]); return a.reduce((q, i) => q + Math.hypot(s.x[i] - c.x, s.z[i] - c.z), 0) / a.length; };

test('진형: 창 0.8R, 궁수는 창 바로 뒤, 보병 0.55R, 기병 0.4R', () => {
  const w = empty();
  const sp = standAt(w, 'f0L', 40, SPEAR), ar = standAt(w, 'f0L', 30, ARCHER), inf = standAt(w, 'f0L', 30, INFANTRY), cav = standAt(w, 'f0L', 10, CAVALRY);
  run(w, 10);
  const r = { sp: meanR(w, sp, 'f0L'), ar: meanR(w, ar, 'f0L'), inf: meanR(w, inf, 'f0L'), cav: meanR(w, cav, 'f0L') };
  assert.ok(Math.abs(r.sp - 48) < 3, JSON.stringify(r)); assert.ok(Math.abs(r.ar - 46) < 3 && r.ar < r.sp, JSON.stringify(r));
  assert.ok(Math.abs(r.inf - 33) < 3, JSON.stringify(r)); assert.ok(Math.abs(r.cav - 24) < 3, JSON.stringify(r));
});

test('진형: 창이 없으면 보병이 바깥 고리에 선다', () => {
  const w = empty();
  const inf = standAt(w, 'f0L', 40, INFANTRY);
  run(w, 10);
  assert.ok(Math.abs(meanR(w, inf, 'f0L') - 48) < 3, `${meanR(w, inf, 'f0L')}`);
});

test('진형: 승점에 선 병력엔 진형이 없고, 보낸 병사는 진형에서 빠진다', () => {
  const w = empty();
  const vp = standAt(w, 'vpC', 20, SPEAR), sp = standAt(w, 'f0L', 20, SPEAR);
  run(w, 3);
  assert.ok(vp.every(i => w.soldiers.fmRole[i] === 0), '승점은 진형 없음');
  assert.ok(sp.some(i => w.soldiers.fmRole[i] !== 0), '거점은 진형');
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: sp }, target: { kind: 'point', x: 350, z: 380 } });
  assert.ok(sp.every(i => w.soldiers.fmRole[i] === 0), '보내면 역할이 풀린다');
});

test('진형: 거점으로 가는 중인(원 밖) 병사는 진형에 들지 않는다', () => {
  const w = empty(), c = st(w, 'f0L'), s = w.soldiers, ids = [];
  for (let k = 0; k < 10; k++) ids.push(spawn(s, 0, SPEAR, c.x + (k % 5) * 1.4, c.z + c.radius + 60 + Math.floor(k / 5) * 1.4, w.rules));
  setGoal(w, ids, { kind: 'stronghold', id: 'f0L' });
  run(w, 2.1);                                                   // 자리 나누기 한 번
  const out = ids.filter(i => Math.hypot(s.x[i] - c.x, s.z[i] - c.z) > c.radius);
  assert.ok(out.length > 5, `아직 원 밖 ${out.length}`);
  assert.ok(out.every(i => s.fmRole[i] === 0), '원 밖은 진형 역할 없음');
});

// ---- Task 2: 진형 안의 싸움과 꽂힘 ----
// 서 있는 과녁: 움직이지도 치지도 않고 죽지도 않는다(몬스터 편, mirror라 사람 표)
function targets(w, n, x, z) {
  w.rules.units[1][INFANTRY].speed = 0; w.rules.units[1][INFANTRY].dps = 0;
  const ids = [];
  for (let k = 0; k < n; k++) { const i = spawn(w.soldiers, 1, INFANTRY, x + (k % 5) * 1.4, z + Math.floor(k / 5) * 1.4, w.rules); w.soldiers.hp[i] = 1e6; setGoal(w, [i], { kind: 'point', x: w.soldiers.x[i], z: w.soldiers.z[i] }); w.soldiers.state[i] = STATE.FRONT; ids.push(i); }
  return ids;
}

test('바깥 고리 창은 원 밖 30 m의 적에게 나가지 않고, 안쪽 보병은 나간다', () => {
  const w = empty(), c = st(w, 'f0L');
  const sp = standAt(w, 'f0L', 40, SPEAR), inf = standAt(w, 'f0L', 30, INFANTRY);
  run(w, 8);
  targets(w, 10, c.x - 3, c.z + c.radius + 30);                 // 원 밖 30 m(위쪽)
  run(w, 10);                                                    // 보병 3.75 m/s: 안쪽 고리 33 m → 원 60 m에 7초 남짓
  assert.ok(Math.abs(meanR(w, sp, 'f0L') - 48) < 3, `창 ${meanR(w, sp, 'f0L').toFixed(1)}`);
  const out = inf.filter(i => Math.hypot(w.soldiers.x[i] - c.x, w.soldiers.z[i] - c.z) > c.radius).length;
  assert.ok(out > 5, `원 밖으로 나간 보병 ${out}`);
});

test('진형 궁수는 근접 적이 붙어도 뒷걸음질하지 않는다', () => {
  const w = empty(), c = st(w, 'f0L');
  const ar = standAt(w, 'f0L', 10, ARCHER);
  run(w, 8);
  const a = ar[0], s = w.soldiers;
  for (let k = 0; k < 4; k++) { const i = spawn(s, 1, SPEAR, s.x[a] + 4 + k * 1.2, s.z[a], w.rules); setGoal(w, [i], { kind: 'point', x: s.x[a], z: s.z[a] }); }
  let routed = 0;
  for (let k = 0; k < 60; k++) { step(w); if (s.state[a] === STATE.ROUT) routed++; }
  assert.equal(routed, 0); void c;
});

test('달려온 적 기병이 바깥 고리 창에 꽂힌다(피해 60, 1초 못 침, 창마다 2초에 한 번)', () => {
  const w = empty(), c = st(w, 'f0L');
  standAt(w, 'f0L', 60, SPEAR);
  run(w, 8);
  const s = w.soldiers, cav = [];
  for (let k = 0; k < 6; k++) { const i = spawn(s, 1, CAVALRY, c.x - 10 + k * 4, c.z + 110, w.rules); setGoal(w, [i], { kind: 'point', x: c.x - 10 + k * 4, z: c.z }); cav.push(i); }
  const hits = [];
  for (let k = 0; k < 20 * 12; k++) {
    const hp0 = cav.map(i => s.hp[i]);
    step(w);
    for (const e of w.events) if (e.kind === 'impale') {
      const j = cav.indexOf(e.cav);
      hits.push({ ...e, t: w.time, lost: hp0[j] - (s.alive[e.cav] ? s.hp[e.cav] : 0), stag: s.staggerUntil[e.cav] - w.time });
    }
  }
  assert.ok(hits.length > 0, '꽂힘이 있다');
  for (const h of hits) {
    assert.ok(h.lost >= 60 - 1e-6 || !s.alive[h.cav], `피해 60(${h.lost})`);
    assert.ok(h.stag >= 1 - w.rules.dt - 1e-6, `1초 못 침(${h.stag.toFixed(2)})`);
  }
  const bySpear = new Map(); for (const x of hits) { const p = bySpear.get(x.spear); if (p !== undefined) assert.ok(x.t - p >= 2 - 1e-6, '같은 창은 2초에 한 번'); bySpear.set(x.spear, x.t); }
});

// ---- 최종 검토(2026-11-09) ----
function stillTargets(w, side, type, n, x, z) {             // 움직이지도 치지도 않고 죽지도 않는 과녁
  w.rules.units[side][type].speed = 0; w.rules.units[side][type].dps = 0;
  const s = w.soldiers, ids = [];
  for (let k = 0; k < n; k++) { const i = spawn(s, side, type, x + (k % 5) * 1.4, z + Math.floor(k / 5) * 1.4, w.rules); s.hp[i] = 1e6; setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); s.state[i] = STATE.FRONT; ids.push(i); }
  return ids;
}

test('바깥 고리는 원 안으로 뚫고 들어온 적을 친다(설계서 §3)', () => {
  const w = empty(), c = st(w, 'f0L'), s = w.soldiers;
  const ring = standAt(w, 'f0L', 40, INFANTRY);                  // 창이 없으니 보병이 바깥 고리
  run(w, 8);
  const foes = stillTargets(w, 1, ARCHER, 5, c.x - 3, c.z - 3);   // 거점 가운데
  run(w, 3);
  const chasing = ring.filter(i => foes.includes(s.target[i])).length;
  assert.ok(chasing >= 10, `원 안 적을 노리는 고리 병사 ${chasing}`);
});

test('쏘고 있는 진형 궁수는 넘친 수비대로 빠지지 않고, 쐐기로 빠진 병사는 진형 역할이 바로 풀린다', () => {
  const w = empty(), c = st(w, 'f0L'), s = w.soldiers;
  const inf = standAt(w, 'f0L', 60, INFANTRY), ar = standAt(w, 'f0L', 40, ARCHER);
  for (const i of [...inf, ...ar]) s.state[i] = STATE.GARRISON;
  stillTargets(w, 1, INFANTRY, 10, c.x - 3, c.z + c.radius + 8);    // 원 밖 8 m — 위쪽 궁수 사거리 안
  run(w, 8.5);
  w.production = true; w.rules.levy.stronghold = 0; w.rules.levy.hq = 0;
  let stale = 0, shooting = 0, releasedShooting = 0;
  for (let k = 0; k < 200; k++) {
    const busy = ar.filter(i => s.alive[i] && s.group[i] < 0 && s.rtarget[i] >= 0);
    shooting = Math.max(shooting, busy.length);
    step(w);
    releasedShooting += busy.filter(i => s.group[i] >= 0).length;
    for (const i of [...inf, ...ar]) if (s.alive[i] && s.group[i] >= 0 && s.fmRole[i]) stale++;
  }
  assert.ok(shooting > 0, '쏘는 궁수가 있다(시험이 헛돌지 않게)');
  assert.equal(releasedShooting, 0, '쏘던 궁수가 쐐기로 빠졌다');
  assert.ok([...inf, ...ar].some(i => s.group[i] >= 0), '넘친 병사는 쐐기로 빠진다(시험이 헛돌지 않게)');
  assert.equal(stale, 0, '쐐기에 든 병사는 진형 역할이 없다');
});

test('거점을 잃거나 진형을 끄면 진형 역할이 다음 틱에 풀린다', () => {
  const w = empty(), s = w.soldiers;
  const a = standAt(w, 'f0L', 20, SPEAR), b = standAt(w, 'f0R', 20, SPEAR);
  run(w, 2.1);
  assert.ok(a.every(i => s.fmRole[i]) && b.every(i => s.fmRole[i]), '진형');
  st(w, 'f0L').owner = 1;
  step(w); step(w);
  assert.ok(a.every(i => !s.fmRole[i]), '잃은 거점');
  w.rules.formation.enabled = false;
  step(w); step(w);
  assert.ok(b.every(i => !s.fmRole[i]), '진형 끔');
});

test('적 거점·작은 땅에 선 우리 병력엔 진형이 없다', () => {
  const w = empty(), s = w.soldiers;
  const land = w.strongholds.find(x => x.kind === 'land');
  land.owner = 0;
  const e = standAt(w, 'f1L', 10, SPEAR), l = standAt(w, land.id, 10, SPEAR);
  run(w, 2.1);
  assert.ok([...e, ...l].every(i => !s.fmRole[i]));
});

test('바깥 고리가 여러 겹이어도 궁수 자리는 가장 안쪽 창 겹보다 안쪽', () => {
  const w = empty(), c = st(w, 'f0L'), s = w.soldiers;
  const sp = standAt(w, 'f0L', 800, SPEAR), ar = standAt(w, 'f0L', 20, ARCHER);
  run(w, 2.05);
  const gr = i => Math.hypot(s.goalX[i] - c.x, s.goalZ[i] - c.z);
  const spMin = Math.min(...sp.map(gr)), arMax = Math.max(...ar.map(gr));
  assert.ok(arMax < spMin, `궁수 ${arMax.toFixed(1)} · 창 가장 안쪽 ${spMin.toFixed(1)}`);
});
