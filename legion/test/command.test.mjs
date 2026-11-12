// 명령(사용자 2026-11-08 "B" — 토탈 워처럼): 땅에 보내면 이동만(가는 길에 새 적을 찾지 않고, 닿은 적만 저절로 친다),
// 적 병사에게 보내면 그 적을 친다(궁수는 사거리에서 서서 쏜다). 이동 중엔 쏘지 않는다(같은 날 사용자: 걸으며 쏘기가 문제). 도착하면 원래대로 싸운다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';

// 적을 제자리에 세우기: 그 병종 빠르기 0(홍수에서는 수비대 상태로 세웠다 — 군단 영지에 수비대가 없다).
const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };
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
const centroid = (w, ids) => { const s = w.soldiers, a = ids.filter(i => s.alive[i]); return { x: a.reduce((k, i) => k + s.x[i], 0) / a.length, z: a.reduce((k, i) => k + s.z[i], 0) / a.length, n: a.length }; };

test('맞붙어 싸우던 병사를 뒤로 보내면 빠져나와 간다(이동 먼저 — 적이 따라와도 멈춰 싸우지 않는다)', () => {
  const w = empty();
  const ours = block(w, 30, 300, 300);
  block(w, 30, 300, 305, { side: 1 });
  run(w, 3);                                                     // 맞붙음
  assert.ok(ours.filter(i => w.soldiers.inContact[i]).length > 5, '맞붙어 있다');
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 180 } }).ok);
  run(w, 25);
  const s = w.soldiers, alive = ours.filter(i => s.alive[i]);
  const away = alive.filter(i => s.z[i] < 230).length;
  assert.ok(away >= alive.length * 0.8, `살아남은 ${alive.length}명 중 ${away}명이 빠져나왔다`);
});

test('땅으로 보낸 병사는 가는 길 옆 30 m의 적에게 달려들지 않는다', () => {
  const w = empty();
  const ours = block(w, 30, 200, 250);
  const foes = block(w, 20, 300, 285, { side: 1 });             // 가는 길(z 250) 옆 30여 m
  w.rules.units[1][SPEAR].speed = 0;   // 적은 제자리(쫓아오지 않게 — 우리가 새는지만 본다)
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 420, z: 250 } });
  run(w, 80);                                                    // 220 m ÷ 쐐기 빠르기 약 3.2 m/s ≈ 70초
  const c = centroid(w, ours);
  assert.ok(Math.hypot(c.x - 420, c.z - 250) < 25, `목적지에 닿았다(가운데 ${c.x.toFixed(0)},${c.z.toFixed(0)})`);
});

test('이동 명령 중인 궁수는 쏘지 않는다 — 걸으며 쏘기 없음(사용자 2026-11-08: 이동하면서 공격하는 게 문제)', () => {
  const w = empty();
  const archers = block(w, 20, 200, 250, { type: ARCHER });
  const foes = block(w, 20, 300, 280, { side: 1, cols: 10 });   // 지나가는 길에서 30 m 옆
  const hp0 = foes.reduce((k, i) => k + w.soldiers.hp[i], 0);
  w.rules.units[1][SPEAR].speed = 0;   // 적은 제자리
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: archers }, target: { kind: 'point', x: 400, z: 250 } });
  run(w, 30);
  const s = w.soldiers, hp1 = foes.reduce((k, i) => k + (s.alive[i] ? s.hp[i] : 0), 0);
  assert.equal(hp1, hp0, '지나가며 쏘지 않았다');
});

test('궁수에게 적을 공격하라고 하면 사거리 안에 들자마자 서서 쏜다(붙으러 가지 않는다)', () => {
  const w = empty(), s = w.soldiers;
  const archers = block(w, 20, 300, 200, { type: ARCHER });
  const foes = block(w, 10, 300, 280, { side: 1 });
  w.rules.units[1][SPEAR].speed = 0;
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: archers }, target: { kind: 'foe', id: foes[0], serial: s.serial[foes[0]] } }).ok);
  run(w, 30);
  const hp = foes.reduce((k, i) => k + (s.alive[i] ? s.hp[i] : 0), 0), hp0 = 10 * w.rules.units[1][0].hp;
  const near = archers.filter(i => s.alive[i]).map(i => Math.min(...foes.filter(f => s.alive[f]).map(f => Math.hypot(s.x[i] - s.x[f], s.z[i] - s.z[f])))), closest = Math.min(...near);
  assert.ok(hp < hp0 - 300, `쐈다(적 체력 ${hp0} → ${hp.toFixed(0)})`);
  assert.ok(closest > 15, `사거리에서 섰다(가장 가까운 궁수 ${closest.toFixed(0)} m)`);
});

test('적 하나를 쳐서 쓰러뜨린 뒤 병사들이 그 한 점으로 모이지 않는다', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 30, 300, 200);
  const foe = block(w, 1, 300, 260, { side: 1 })[0];
  w.rules.units[1][SPEAR].speed = 0; s.hp[foe] = 1;
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'foe', id: foe, serial: s.serial[foe] } }).ok);
  run(w, 40);
  assert.equal(s.alive[foe], 0);
  const c = centroid(w, ours), spread = ours.reduce((k, i) => k + Math.hypot(s.x[i] - c.x, s.z[i] - c.z), 0) / ours.length;
  const at = ours.filter(i => Math.hypot(s.x[i] - 300, s.z[i] - 260) < 3).length;
  assert.ok(spread > 1.5 && at < 12, `한 점에 겹치지 않았다(가운데에서 평균 ${spread.toFixed(1)} m, 쓰러진 자리 3 m 안 ${at}명)`);   // 30명 보통 진형 ≈ 평균 2.5 m. 고치기 전 버그는 거의 30명이 한 점에 — 빠르기 3이면 7명, 창 3.5면 8명(같은 퍼짐 2.0 m)이라 한도 8 → 12
});

test('"그 자리"로 보낸 큰 무리도 가운데에 갇히지 않고 넓게 선다', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 300, 300, 200, { cols: 30 });
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 600, z: 220 } }).ok);
  run(w, 150);
  const away = ours.filter(i => Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]) > 6).length;
  assert.ok(away <= ours.length * 0.15, `자리에서 6 m 넘게 떨어진 병사 ${away}/${ours.length}`);
});
test('적 병사에게 보내면(공격) 그 적을 쫓아가 친다 — 싸우는 중 기병을 돌려 적 궁수 치기', () => {
  const w = empty();
  const cav = block(w, 20, 300, 260, { type: CAVALRY });
  block(w, 30, 300, 300, { side: 1 });                           // 기병 앞을 막는 적 창
  const archers = block(w, 20, 460, 360, { side: 1, type: ARCHER });
  run(w, 2);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: cav }, target: { kind: 'foe', id: archers[5], serial: w.soldiers.serial[archers[5]] } });
  assert.ok(r.ok, r.reason);
  run(w, 25);
  const s = w.soldiers, near = cav.filter(i => s.alive[i] && Math.hypot(s.x[i] - 470, s.z[i] - 365) < 30).length;
  const deadArchers = archers.filter(i => !s.alive[i]).length;
  assert.ok(near >= 10, `기병이 적 궁수에게 갔다(${near}명)`);
  assert.ok(deadArchers >= 5, `적 궁수를 베었다(${deadArchers}명)`);
});

test('도착하면 원래대로 싸운다(이동 명령이 풀린다)', () => {
  const w = empty();
  const ours = block(w, 20, 200, 250);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 250 } });
  run(w, 40);
  block(w, 10, 300, 285, { side: 1 });                           // 도착한 뒤 35 m 앞에 적
  run(w, 10);
  const s = w.soldiers, fighting = ours.filter(i => s.alive[i] && (s.target[i] >= 0 || s.inContact[i])).length;
  assert.ok(fighting >= 10, `도착한 병사는 다가온 적과 싸운다(${fighting}명)`);
});

test('없는 적·우리 편에게는 공격 명령을 못 낸다', () => {
  const w = empty();
  const ours = block(w, 5, 200, 250), mate = block(w, 1, 220, 250)[0];
  assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'foe', id: mate, serial: w.soldiers.serial[mate] } }).ok, false);
  assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'foe', id: 99999, serial: 1 } }).ok, false);
});

test('Shift+오른쪽 이어 가기(append): 가던 쐐기를 풀지 않고 지금 목적지를 경유점으로 돌리고 새 목적지로 간다', () => {
  const w = empty();
  const ours = block(w, 30, 200, 200);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 200 } });
  run(w, 2);
  const s = w.soldiers, gid = s.group[ours[0]], grp = w.groups.find(g => g.id === gid);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 320 }, append: true });
  assert.ok(r.ok, r.reason); assert.equal(r.count, 30);
  assert.ok(w.groups.includes(grp), '같은 쐐기');
  assert.equal(grp.via.length, 1);
  assert.ok(Math.hypot(grp.via[0].x - 300, grp.via[0].z - 200) < 1, '전 목적지가 경유점');
  assert.equal(grp.target.kind, 'point'); assert.equal(grp.target.z, 320);
  let nearFirst = Infinity;
  for (let k = 0; k < 90 * 20; k++) { step(w); const c = centroid(w, ours); nearFirst = Math.min(nearFirst, Math.hypot(c.x - 300, c.z - 200)); }
  const c = centroid(w, ours);
  assert.ok(nearFirst < 25, `경유점을 지났다(가장 가까이 ${nearFirst.toFixed(0)} m)`);
  assert.ok(Math.hypot(c.x - 300, c.z - 320) < 25, `새 목적지에 닿았다(${c.x.toFixed(0)},${c.z.toFixed(0)})`);
});

test('이어 갈 쐐기가 없으면(이미 도착) append는 거절 — 화면은 새로 보낸다', () => {
  const w = empty();
  const ours = block(w, 10, 200, 200);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 320 }, append: true });
  assert.equal(r.ok, false);
});

test('싸우며(engage) 보낸 병력은 전처럼 싸우며 간다 — 명령 없음, 쐐기는 돌격한다(사용자 2026-11-08)', () => {
  const w = empty();
  const ours = block(w, 30, 200, 250);
  const foes = block(w, 20, 300, 285, { side: 1 });
  w.rules.units[1][SPEAR].speed = 0;
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 420, z: 250 }, engage: true });
  assert.ok(r.ok);
  const s = w.soldiers;
  assert.equal(ours.filter(i => s.order[i]).length, 0, '이동 명령이 없다');
  const grp = w.groups.find(g => g.id === s.group[ours[0]]);
  assert.ok(grp && !grp.order, '쐐기도 명령 없음(가는 길에 돌격·멈춤)');
  run(w, 40);
  const fighting = ours.filter(i => s.alive[i] && (s.target[i] >= 0 || s.inContact[i])).length;
  assert.ok(fighting >= 10, `길 옆 적과 싸운다(${fighting}명)`);
});

test('engage로 보낸 쐐기도 Shift 이어 가기가 된다', () => {
  const w = empty();
  const ours = block(w, 30, 200, 200);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 200 }, engage: true });
  run(w, 2);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 300, z: 320 }, append: true, engage: true });
  assert.ok(r.ok, r.reason);
  const grp = w.groups.find(g => g.id === w.soldiers.group[ours[0]]);
  assert.equal(grp.via.length, 1); assert.equal(grp.order, false);
});

test('싸우며 가던 쐐기에 Shift로 땅을 이으면 이동만으로 바뀐다', () => {
  const w = empty(), s = w.soldiers;
  const a = block(w, 10, 250, 300);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: a }, target: { kind: 'point', x: 350, z: 250 }, engage: true });
  run(w, 1);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: a }, target: { kind: 'point', x: 250, z: 200 }, append: true }).ok);
  const grp = w.groups.find(g => g.members.includes(a[0]));
  assert.equal(grp.order, true);
  assert.equal(a.filter(i => s.order[i]).length, 10);
});

test('어택땅으로 보내면 가는 길 옆 40 m 안의 적과 싸운다 — 쐐기가 옆의 적을 그냥 지나치지 않는다(사용자 2026-11-08)', () => {
  const w = empty(), s = w.soldiers;
  const ours = [];
  for (let k = 0; k < 30; k++) { const id = spawn(s, 0, SPEAR, 240 + (k % 10) * 1.4, 390 + Math.floor(k / 10) * 1.4, w.rules); setGoal(w, [id], { kind: 'point', x: 250, z: 400 }); ours.push(id); }
  const foes = block(w, 20, 280, 330, { side: 1 });             // vpL → f0L(350,250) 길의 옆 30여 m
  w.rules.units[1][SPEAR].speed = 0;            // 적은 제자리
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 350, z: 250 }, engage: true }).ok);
  let fought = 0;
  for (let k = 0; k < 40 * 20; k++) { step(w); fought = Math.max(fought, ours.filter(i => s.alive[i] && (s.inContact[i] || s.target[i] >= 0)).length); }
  const dead = foes.filter(i => !s.alive[i]).length;
  assert.ok(fought >= 10, `길 옆 적에게 붙었다(가장 많을 때 ${fought}명)`);
  assert.ok(dead >= 5, `적을 쓰러뜨렸다(${dead}명)`);
});

test('이동 명령이 남아 있던 병사도 어택땅으로 보내면 명령이 지워진다', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 20, 240, 390);
  for (const i of ours) s.order[i] = 1;                         // 전에 땅으로 보내 놓고 자리에 못 닿아 남은 이동 명령
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 350, z: 250 }, engage: true }).ok);
  assert.equal(ours.filter(i => s.order[i]).length, 0);
});

test('자리에 못 닿고 막혀 서 버린 병사의 이동 명령은 몇 초 뒤 풀린다(붐비는 자리·막힌 길)', () => {
  const w = empty(), s = w.soldiers;
  const id = spawn(s, 0, SPEAR, 170, 300, w.rules);
  setGoal(w, [id], { kind: 'point', x: 100, z: 300 });            // 강 건너(흐름장 없이 곧장 → 물가에서 막힘)
  s.order[id] = 1;
  run(w, 15);
  assert.equal(s.order[id], 0, `막힌 채 남은 명령은 풀린다(지금 ${s.x[id].toFixed(0)},${s.z[id].toFixed(0)})`);
});

test('어택땅: 뒤·옆 40 m 안의 적을 두고 떠나지 않고 싸운 뒤 간다', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 30, 300, 300);
  const foes = block(w, 20, 300, 330, { side: 1 });             // 목적지(f0L 350,250) 반대쪽 30 m 뒤
  w.rules.units[1][SPEAR].speed = 0;
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 350, z: 250 }, engage: true }).ok);
  let fought = 0;
  for (let k = 0; k < 30 * 20; k++) { step(w); fought = Math.max(fought, ours.filter(i => s.alive[i] && (s.inContact[i] || s.target[i] >= 0)).length); }
  const dead = foes.filter(i => !s.alive[i]).length;
  assert.ok(fought >= 15, `뒤의 적과 싸웠다(가장 많을 때 ${fought}명)`);
  assert.ok(dead >= 5, `적을 쓰러뜨렸다(${dead}명 — 창끼리라 느리다)`);
});

test('어택땅: 맞붙어 있던 병사는 붙은 적을 끝낸 뒤 15 m 옆의 적을 두고 떠나지 않는다(20초 "붙은 적만" 규칙 없음)', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 20, 300, 300);
  const touching = block(w, 20, 300, 302.5, { side: 1, type: INFANTRY });   // 붙은 적은 보병 — 아래에서 창(others)만 세운다(홍수: others만 수비대)
  const others = block(w, 20, 300, 318, { side: 1 });
  w.rules.units[1][SPEAR].speed = 0;
  run(w, 1);
  assert.ok(ours.filter(i => s.inContact[i]).length > 5, '맞붙어 있다');
  for (const i of touching) s.hp[i] = 1;                         // 붙은 적은 곧 쓰러진다
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 350, z: 250 }, engage: true }).ok);
  run(w, 10);
  const alive = ours.filter(i => s.alive[i]), stayed = alive.filter(i => s.inContact[i] || s.target[i] >= 0).length;
  assert.ok(stayed >= alive.length * 0.6, `살아남은 ${alive.length}명 중 ${stayed}명이 옆의 적과 싸운다`);
});

test('적 병사를 공격하러 가는 길을 적이 막으면 꿰뚫고 지나가지 않고 막은 적과 싸운다(사용자 2026-11-08 "길목에 적이 있는데 관통하고 지나간다")', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 20, 600, 300, { type: INFANTRY });
  const wall = block(w, 45, 594, 330, { side: 1, type: INFANTRY, cols: 15 });   // 길을 막은 보병 세 줄(z 330~332.8)
  const archer = block(w, 1, 606, 380, { side: 1, type: ARCHER })[0];
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'foe', id: archer, serial: s.serial[archer] } }).ok);
  const hp0 = wall.reduce((a, i) => a + s.hp[i], 0);
  run(w, 15);
  const standing = wall.filter(i => s.alive[i]).length, through = ours.filter(i => s.alive[i] && s.z[i] > 336).length;
  assert.ok(standing > 20, `막은 적이 아직 서 있다(${standing})`);
  assert.ok(through <= 2, `막은 적을 지나간 병사 ${through}명`);
  assert.ok(wall.reduce((a, i) => a + (s.alive[i] ? s.hp[i] : 0), 0) < hp0, '막은 적과 싸웠다');
});

test('근접 공격 명령은 찍은 적과 맞붙을 때까지 이어진다 — 마지막 25 m에서 그 적 둘레의 다른 적에게 새지 않는다(사용자 2026-11-09 "중간에 적군 있으면 타겟이 바뀐다")', () => {
  const w = empty(), s = w.soldiers;
  const cav = block(w, 10, 297, 240, { type: CAVALRY, cols: 5 });
  w.rules.units[1][ARCHER].speed = 0; w.rules.units[1][ARCHER].dps = 0;
  const foe = block(w, 1, 300, 330, { side: 1, type: ARCHER })[0]; s.hp[foe] = 1e6;
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; block(w, 1, 300 + Math.cos(a) * 6, 330 + Math.sin(a) * 6, { side: 1, type: INFANTRY }); }   // 그 적 둘레 6 m의 보병
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: cav }, target: { kind: 'foe', id: foe, serial: s.serial[foe] } }).ok);
  const touched = new Set();
  for (let k = 0; k < 12 * 20; k++) { step(w); for (const i of cav) if (s.alive[i] && s.contact[i] === foe) touched.add(i); }
  assert.ok(touched.size >= 5, `찍은 적에 닿은 기병 ${touched.size}/10`);
});

