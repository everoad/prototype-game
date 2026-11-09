// 금 명령(설계서 2026-11-09-flood-gold-orders-design.md): 땅에 원을 찍어 거는 명령 다섯 — 값·다시 쓰기·걸리는 병사·효과.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, kill, STATE, ORDER, GOAL } from '../src/sim/soldiers.js';
import { updateVision, canSee } from '../src/sim/vision.js';
import { SPEAR, ARCHER, INFANTRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';
import { castOrder, castTargets, CASTS } from '../src/sim/casts.js';
import { desiredVelocity } from '../src/sim/movement.js';

const run = (w, sec) => { for (let k = 0; k < Math.round(sec * 20); k++) step(w); };
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
function block(w, n, x, z, { side = 0, type = SPEAR, cols = 10 } = {}) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const id = spawn(w.soldiers, side, type, x + (k % cols) * 1.4, z + Math.floor(k / cols) * 1.4, w.rules);
    setGoal(w, [id], { kind: 'point', x: x + (k % cols) * 1.4, z: z + Math.floor(k / cols) * 1.4 });
    w.soldiers.state[id] = STATE.FRONT;
    ids.push(id);
  }
  return ids;
}

test('금이 모자라면 명령을 못 건다', () => {
  const w = empty(); w.sides[0].gold = 10;
  const r = castOrder(w, { kind: 'cast', side: 0, order: 'march', x: 300, z: 300 });
  assert.equal(r.ok, false); assert.equal(r.reason, '금이 모자라다'); assert.equal(w.sides[0].gold, 10);
});

test('걸면 금이 빠지고, 다시 쓰기 동안 같은 명령은 못 쓰고 다른 명령은 쓴다', () => {
  const w = empty(); w.sides[0].gold = 500;
  assert.ok(castOrder(w, { kind: 'cast', side: 0, order: 'march', x: 300, z: 300 }).ok);
  assert.equal(w.sides[0].gold, 440);
  const again = castOrder(w, { kind: 'cast', side: 0, order: 'march', x: 300, z: 300 });
  assert.equal(again.ok, false); assert.match(again.reason, /^다시 쓰기 \d+초$/);
  assert.ok(castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 300, z: 300 }).ok);
  run(w, 90.1);
  assert.ok(castOrder(w, { kind: 'cast', side: 0, order: 'march', x: 300, z: 300 }).ok);
});

test('원 안 우리 병사만 걸린다(원 밖·적·달아나는 병사 빼고)', () => {
  const w = empty();
  const inside = block(w, 20, 300, 300), outside = block(w, 10, 400, 300), foes = block(w, 10, 310, 310, { side: 1 });
  w.soldiers.state[inside[0]] = STATE.FLEE;
  const { ids } = castTargets(w, 0, 'drum', 305, 303);
  assert.deepEqual(new Set(ids), new Set(inside.slice(1)));
  assert.ok(!outside.some(i => ids.includes(i)) && !foes.some(i => ids.includes(i)));
});

test('쐐기는 가운데가 원 안일 때만 통째로 걸린다', () => {
  const w = empty();
  const ids = block(w, 60, 300, 200, { type: INFANTRY });
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 300, z: 600 } });
  run(w, 1);
  const grp = w.groups.find(g => g.members.includes(ids[0]));
  const live = grp.members.filter(i => w.soldiers.alive[i] && w.soldiers.group[i] === grp.id);
  // 쐐기 가운데(grp.x, z = 끝점)에서 가장 먼 멤버 쪽으로: 가운데가 원 안(R − 5) / 가운데는 원 밖이지만 그 멤버는 원 안(R + δ)
  const s = w.soldiers, R = w.rules.orders.radius;
  const far0 = live.reduce((a, i) => (Math.hypot(s.x[i] - grp.x, s.z[i] - grp.z) > Math.hypot(s.x[a] - grp.x, s.z[a] - grp.z) ? i : a), live[0]);
  const dMax = Math.hypot(s.x[far0] - grp.x, s.z[far0] - grp.z), ux = (s.x[far0] - grp.x) / dMax, uz = (s.z[far0] - grp.z) / dMax, d = Math.min(5, dMax / 2);
  const near = castTargets(w, 0, 'march', grp.x + ux * (R - 5), grp.z + uz * (R - 5));
  assert.ok(live.every(i => near.ids.includes(i)) && near.groups.includes(grp), '가운데가 원 안 — 통째로');
  const fx = grp.x + ux * (R + d), fz = grp.z + uz * (R + d);
  assert.ok(Math.hypot(s.x[far0] - fx, s.z[far0] - fz) <= R, '그 멤버는 원 안에 있다');
  const far = castTargets(w, 0, 'march', fx, fz);
  assert.ok(live.every(i => !far.ids.includes(i)) && !far.groups.includes(grp), '가운데가 원 밖 — 하나도 안 걸린다');
});

test('판이 끝나면 명령을 못 건다', () => {
  const w = empty(); w.sides[0].gold = 500; w.result = { winner: 1, reason: 'test' };
  assert.equal(castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 300, z: 300 }).ok, false);
});

test('applyOrder가 cast를 casts.js로 넘기고 원을 남긴다', () => {
  const w = empty(); w.sides[0].gold = 500;
  assert.ok(applyOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 300, z: 300 }).ok);
  assert.equal(w.casts.length, 1); assert.equal(w.casts[0].r, 50); assert.equal(w.casts[0].until, w.time + w.rules.orders.drum.seconds);
});

// ---- Task 2: 강행군·전쟁 북 ----
const centroid = (w, ids) => { const s = w.soldiers, a = ids.filter(i => s.alive[i]); return { x: a.reduce((k, i) => k + s.x[i], 0) / a.length, z: a.reduce((k, i) => k + s.z[i], 0) / a.length }; };

test('강행군: 행군하는 쐐기가 2배로 걷는다', () => {
  const go = cast => {
    const w = empty(); w.sides[0].gold = 500;
    const ids = block(w, 30, 300, 200, { type: INFANTRY });
    applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 300, z: 700 } });
    run(w, 1); const c0 = centroid(w, ids);
    if (cast) assert.ok(castOrder(w, { kind: 'cast', side: 0, order: 'march', x: c0.x, z: c0.z }).ok);
    run(w, 15); return centroid(w, ids).z - c0.z;
  };
  const ratio = go(true) / go(false);
  assert.ok(ratio > 1.8 && ratio < 2.2, `비 ${ratio.toFixed(2)}`);
});

test('강행군: 쐐기 밖 병사도 빠르고, 20초 뒤 원래대로', () => {
  const w = empty(); w.sides[0].gold = 500;
  const [i] = block(w, 1, 300, 100); setGoal(w, [i], { kind: 'point', x: 300, z: 790 });
  run(w, 2); let z = w.soldiers.z[i]; run(w, 2); const base = w.soldiers.z[i] - z;
  castOrder(w, { kind: 'cast', side: 0, order: 'march', x: w.soldiers.x[i], z: w.soldiers.z[i] });
  z = w.soldiers.z[i]; run(w, 2); const fast = w.soldiers.z[i] - z;
  assert.ok(fast / base > 1.8, `빠르기 ${(fast / base).toFixed(2)}`);
  assert.ok(w.soldiers.marchUntil[i] > w.time);
  run(w, 18.1); assert.ok(w.soldiers.marchUntil[i] <= w.time);
});

test('돌격 북: 걸린 병사의 화력 ×1.3', () => {
  const dealt = drum => {                                        // 첫 타(1초에 한 번)만 — 밀어내기 전에 잰다
    const w = empty(); w.sides[0].gold = 500;
    block(w, 10, 300, 300); const foes = block(w, 10, 300, 301, { side: 1 });   // 닿는 거리(1.2 m) 안
    if (drum) castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 305, z: 300 });
    const hp0 = foes.reduce((a, i) => a + w.soldiers.hp[i], 0);
    run(w, 1.05);
    return hp0 - foes.reduce((a, i) => a + Math.max(0, w.soldiers.hp[i]), 0);
  };
  const ratio = dealt(true) / dealt(false);
  assert.ok(Math.abs(ratio - 1.3) < 0.05, `비 ${ratio.toFixed(2)}`);
});

test('돌격 북: 근접으로 맞은 적이 밀려나 줄이 앞으로 나간다', () => {
  const shift = drum => {
    const w = empty(); w.sides[0].gold = 500;
    block(w, 30, 300, 300, { type: INFANTRY }); const foes = block(w, 30, 300, 304.4, { side: 1, type: INFANTRY });
    if (drum) castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 306, z: 302 });
    const z0 = centroid(w, foes).z; run(w, 5); return centroid(w, foes).z - z0;
  };
  const d = shift(true) - shift(false);
  assert.ok(d > 3, `적 줄이 더 밀려난 거리 ${d.toFixed(1)} m`);
});

test('돌격 북: 걸린 병사는 무너지지 않는다(안 걸리면 무너질 자리)', () => {
  const routs = drum => {
    const w = empty(); w.sides[0].gold = 500;
    const ours = block(w, 5, 300, 300); for (const i of ours) w.soldiers.hp[i] = 100;   // 체력 60% 아래
    block(w, 40, 300, 302, { side: 1 });
    if (drum) castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 302, z: 300 });
    let n = 0; for (let k = 0; k < 40; k++) { step(w); n += ours.filter(i => w.soldiers.alive[i] && w.soldiers.state[i] === STATE.ROUT).length; }
    return n;
  };
  assert.ok(routs(false) > 0, '북이 없으면 무너지는 자리다');
  assert.equal(routs(true), 0);
});

test('돌격 북이 걸린 궁수도 근접 적이 오면 뒷걸음질한다', () => {
  const w = empty(); w.sides[0].gold = 500;
  const [a] = block(w, 1, 300, 300, { type: ARCHER }); block(w, 5, 300, 306, { side: 1 });
  castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 300, z: 300 });
  const z0 = w.soldiers.z[a]; run(w, 2);
  assert.ok(z0 - w.soldiers.z[a] > 3, `물러난 거리 ${(z0 - w.soldiers.z[a]).toFixed(1)}`);
});

// ---- Task 3: 화살 비 ----
// 서 있는 과녁: 몬스터 쪽(mirror라 사람 표) 보병이 움직이지도 치지도 않고 죽지도 않는다.
const targets = (w, n, x, z) => { w.rules.units[1][INFANTRY].speed = 0; w.rules.units[1][INFANTRY].dps = 0;
  const ids = block(w, n, x, z, { side: 1, type: INFANTRY }); for (const i of ids) w.soldiers.hp[i] = 1e6; return ids; };
// sec초 동안 새로 나간 그 편 화살(w.shots는 0.5초 지난 것을 지우므로 틱마다 센다).
function countShots(w, sec, side) {
  const out = [];
  for (let k = 0; k < sec * 20; k++) { const seen = new Set(w.shots); step(w); for (const sh of w.shots) if (!seen.has(sh) && sh.side === side) out.push(sh); }
  return out;
}

test('화살 비: 범위 안 서 있는 궁수만 걸린다', () => {
  const w = empty();
  const near = block(w, 5, 300, 220, { type: ARCHER });             // 가운데(300,300)에서 80 m — 걸림
  const far = block(w, 5, 300, 195, { type: ARCHER });              // 105 m — 안 걸림
  const ordered = block(w, 5, 320, 240, { type: ARCHER }); for (const i of ordered) w.soldiers.order[i] = ORDER.MOVE;
  const { ids } = castTargets(w, 0, 'volley', 300, 300);
  assert.ok(near.every(i => ids.includes(i)), '범위 안 서 있는 궁수');
  assert.ok(!far.some(i => ids.includes(i)), '범위 밖');
  assert.ok(!ordered.some(i => ids.includes(i)), '명령받고 가는 궁수');
});

test('화살 비: 원 안 적만, 0.5초마다 쏜다 / 원 안에 닿는 적이 없으면 평소대로', () => {
  const shots = (inCircle) => {
    const w = empty(); w.sides[0].gold = 500;
    block(w, 10, 300, 300, { type: ARCHER, cols: 5 });              // x 300~305.6, z 300~301.4
    targets(w, 5, 300, 265);                                        // 뒤 35 m — 원 밖(가장 가까운 적)
    const b = targets(w, 5, 300, 338);                              // 앞 37~38 m — 원(가운데 300,350) 안
    if (!inCircle) for (const i of b) kill(w.soldiers, i);
    castOrder(w, { kind: 'cast', side: 0, order: 'volley', x: 300, z: 350 });
    run(w, 1);
    const mine = countShots(w, 4, 0);
    return { n: mine.length, toB: mine.filter(sh => sh.z2 > 320).length };
  };
  const on = shots(true), off = shots(false);
  assert.equal(on.toB, on.n, '모두 원 안(앞 적)으로');
  assert.ok(on.n >= 70 && on.n <= 90, `화살 비 4초 ${on.n}발(10명 × 2발/초)`);
  assert.ok(off.n >= 35 && off.n <= 45, `평소 4초 ${off.n}발`);
});

test('보내면 화살 비가 풀린다', () => {
  const w = empty(); w.sides[0].gold = 500;
  const ids = block(w, 5, 300, 300, { type: ARCHER });
  castOrder(w, { kind: 'cast', side: 0, order: 'volley', x: 300, z: 340 });
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 300, z: 200 } });
  assert.ok(ids.every(i => w.soldiers.volleyUntil[i] === 0));
});

// ---- Task 4: 긴급 징집(정찰은 2026-11-09에 뺐다) ----
test('정찰 명령은 없다 — 명령은 넷(사용자 2026-11-09: 직접 부대를 돌려 정찰하는 판단이 없어진다)', () => {
  const w = empty(); w.sides[0].gold = 500;
  assert.deepEqual(CASTS, ['march', 'drum', 'volley', 'levy']);
  assert.equal(castOrder(w, { kind: 'cast', side: 0, order: 'scout', x: 600, z: 600 }).reason, '모르는 명령');
  assert.equal(w.sides[0].gold, 500);
});

test('긴급 징집: 경보가 없는 거점이면 거절', () => {
  const w = empty(); w.sides[0].gold = 500;
  const r = castOrder(w, { kind: 'cast', side: 0, order: 'levy', stronghold: 'f0L' });
  assert.equal(r.ok, false); assert.equal(r.reason, '경보가 뜬 우리 거점에만');
  assert.equal(castOrder(w, { kind: 'cast', side: 0, order: 'levy', stronghold: 'f1L' }).reason, '우리 거점이 아니다');
});

test('긴급 징집: 경보가 뜬 거점에 보병 150명이 서고, 다시 쓰기는 편마다', () => {
  const w = empty(); w.sides[0].gold = 500;
  for (const id of ['f0L', 'f0R']) w.sides[0].alerts.push({ kind: 'attacked', stronghold: id, since: w.time, last: w.time });
  const before = w.soldiers.count, r = castOrder(w, { kind: 'cast', side: 0, order: 'levy', stronghold: 'f0L' });
  assert.ok(r.ok); assert.equal(r.count, 150);
  const st = w.strongholds.find(x => x.id === 'f0L'), s = w.soldiers, made = [];
  for (let i = before; i < s.count; i++) if (s.alive[i]) made.push(i);
  assert.equal(made.length, 150);
  assert.ok(made.every(i => s.type[i] === INFANTRY && s.goalKind[i] === GOAL.STRONGHOLD && Math.hypot(s.x[i] - st.x, s.z[i] - st.z) <= st.radius));
  assert.match(castOrder(w, { kind: 'cast', side: 0, order: 'levy', stronghold: 'f0R' }).reason, /^다시 쓰기/);
});

// ---- 최종 검토에서 고친 것 ----
test('강행군: 서 있는 병사에 걸고 보내도 새 쐐기가 2배로 걷는다', () => {
  const go = cast => {
    const w = empty(); w.sides[0].gold = 500;
    const ids = block(w, 30, 300, 200, { type: INFANTRY }), c0 = centroid(w, ids);
    if (cast) assert.ok(castOrder(w, { kind: 'cast', side: 0, order: 'march', x: c0.x, z: c0.z }).ok);
    applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 300, z: 700 } });
    run(w, 1); const c1 = centroid(w, ids); run(w, 15); return centroid(w, ids).z - c1.z;
  };
  const ratio = go(true) / go(false);
  assert.ok(ratio > 1.8 && ratio < 2.2, `비 ${ratio.toFixed(2)}`);
});

test('강행군: 행군 쐐기에 걸고 다른 곳으로 다시 보내도 빠르다', () => {
  const go = cast => {
    const w = empty(); w.sides[0].gold = 500;
    const ids = block(w, 30, 300, 200, { type: INFANTRY });
    applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 300, z: 700 } });
    run(w, 1); const c0 = centroid(w, ids);
    if (cast) castOrder(w, { kind: 'cast', side: 0, order: 'march', x: c0.x, z: c0.z });
    applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 500, z: 700 } });
    run(w, 1); const c1 = centroid(w, ids); run(w, 15); const c2 = centroid(w, ids);
    return Math.hypot(c2.x - c1.x, c2.z - c1.z);
  };
  const ratio = go(true) / go(false);
  assert.ok(ratio > 1.8 && ratio < 2.2, `비 ${ratio.toFixed(2)}`);
});

test('강행군: 정면 병사가 적 무리로 다가갈 때(쫓기)도 빠르다', () => {
  const w = empty();
  const [i] = block(w, 1, 300, 300); const s = w.soldiers;
  s.hasPursuit[i] = 1; s.pursuitX[i] = 300; s.pursuitZ[i] = 380; s.target[i] = -1;
  const base = Math.hypot(...desiredVelocity(w, i));
  s.marchUntil[i] = w.time + 60;
  const fast = Math.hypot(...desiredVelocity(w, i));
  assert.ok(base > 0 && Math.abs(fast / base - w.rules.orders.march.speedMult) < 1e-6, `${base} → ${fast}`);
});

// ---- 결과 알림(개발용, 2026-11-09): 효과가 끝나면 무엇을 했는지 ----
const resultOf = (w, order) => w.notices.find(n => n.kind === 'castResult' && n.side === 0 && n.order === order);

test('결과 알림: 화살 비가 끝나면 쓰러뜨린 적과 피해가 나온다', () => {
  const w = empty(); w.sides[0].gold = 500;
  w.rules.units[1][INFANTRY].speed = 0; w.rules.units[1][INFANTRY].dps = 0;
  block(w, 10, 300, 300, { type: ARCHER, cols: 5 });
  const foes = block(w, 5, 300, 338, { side: 1, type: INFANTRY }); for (const i of foes) w.soldiers.hp[i] = 30;
  castOrder(w, { kind: 'cast', side: 0, order: 'volley', x: 300, z: 350 });
  run(w, 9); assert.equal(resultOf(w, 'volley'), undefined, '끝나기 전에는 없다');
  run(w, 1.2);
  const n = resultOf(w, 'volley');
  assert.ok(n, '끝나면 나온다'); assert.equal(n.kills, 5); assert.ok(n.damage >= 150, `피해 ${n.damage}`); assert.equal(n.count, 10);
});

test('결과 알림: 돌격 북 — 밀어낸 횟수와 피해', () => {
  const w = empty(); w.sides[0].gold = 500;
  block(w, 30, 300, 300, { type: INFANTRY }); block(w, 30, 300, 304.4, { side: 1, type: INFANTRY });
  castOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 306, z: 302 });
  run(w, 15.2);
  const n = resultOf(w, 'drum');
  assert.ok(n && n.pushed > 0 && n.damage > 0, JSON.stringify(n));
});

test('결과 알림: 강행군 — 평소보다 더 간 거리', () => {
  const w = empty(); w.sides[0].gold = 500;
  const [i] = block(w, 1, 300, 100); setGoal(w, [i], { kind: 'point', x: 300, z: 790 });
  run(w, 2);
  castOrder(w, { kind: 'cast', side: 0, order: 'march', x: w.soldiers.x[i], z: w.soldiers.z[i] });
  run(w, 20.2);
  const n = resultOf(w, 'march'), u = w.rules.units[0][SPEAR].speed;   // 20초 동안 (×2 − ×1) × 빠르기
  assert.ok(n && n.count === 1 && Math.abs(n.extra - u * 20) < u * 3, JSON.stringify(n));
});
