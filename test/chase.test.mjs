// 쫓기 규칙(사용자 2026-11-09 "벌레처럼 뭉치고, 기병이 왔다갔다하며 치고 창·보병이 따라다녀 아무것도 못 한다"):
// 창·보병은 달리는 기병을 쫓지 않고, 한 적을 쫓는 수는 그 적 무게의 capRatio배까지, 기병은 맞붙으면 그 적을 끝낼 때까지 남고, 도는 빠르기에 한계가 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE, ORDER } from '../src/sim/soldiers.js';
import { INFANTRY, CAVALRY, ARCHER } from '../src/sim/rules.js';

const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
function block(w, n, x, z, { side = 0, type = INFANTRY, cols = 10, gap = 1.4, still = false } = {}) {
  const s = w.soldiers, ids = [];
  for (let k = 0; k < n; k++) { const i = spawn(s, side, type, x + (k % cols) * gap, z + Math.floor(k / cols) * gap, w.rules); setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); s.state[i] = STATE.FRONT; if (still) s.hp[i] = 1e6; ids.push(i); }
  return ids;
}
const stillSide = (w, side, type) => { w.rules.units[side][type].speed = 0; w.rules.units[side][type].dps = 0; };

test('창·보병은 달리는 기병을 쫓지 않는다(서 있는 기병은 친다)', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 20, 300, 300);
  const [cav] = block(w, 1, 330, 200, { side: 1, type: CAVALRY }); s.hp[cav] = 1e6;
  setGoal(w, [cav], { kind: 'point', x: 330, z: 700 }); s.order[cav] = ORDER.MOVE; s.orderBest[cav] = Infinity; s.orderAt[cav] = w.time;   // 멀리서 달려와 옆 30 m를 지나간다(이동 명령 — 우리를 치러 오지 않는다)
  let chased = 0;
  for (let k = 0; k < 14 * 20; k++) { step(w); chased += ours.filter(i => s.target[i] === cav).length; }
  assert.equal(chased, 0, '달리는 기병을 노렸다');
  const w2 = empty(), s2 = w2.soldiers, ours2 = block(w2, 20, 300, 300);
  stillSide(w2, 1, CAVALRY);
  const [cav2] = block(w2, 1, 315, 315, { side: 1, type: CAVALRY, still: true });
  for (let k = 0; k < 60; k++) step(w2);
  assert.ok(ours2.some(i => s2.target[i] === cav2), '서 있는 기병은 친다');
});

test('한 적을 쫓는 병사는 그 적 무게의 capRatio(5)배까지', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 60, 300, 300);
  stillSide(w, 1, INFANTRY);
  const [foe] = block(w, 1, 307, 330, { side: 1, still: true });
  for (let k = 0; k < 60; k++) step(w);
  const on = ours.filter(i => s.target[i] === foe).length;
  const cap = w.rules.behavior.chase.capRatio;
  assert.ok(on >= 1 && on <= cap + 1, `그 적을 노리는 병사 ${on}(한도 ${cap})`);
});

test('기병은 고른 과녁과 맞붙어 싸우는 동안 다른 과녁(뒤 궁수)으로 떠나지 않는다(제자리에서 휙휙 돌지 않는다)', () => {
  const w = empty(), s = w.soldiers, sec = w.map.sectors.find(x => x.id === 's0-center');
  const zf = w.map.vpLine;                                         // 정면: 승점 선 위
  stillSide(w, 1, INFANTRY); stillSide(w, 1, ARCHER);
  block(w, 60, 590, zf, { side: 1, cols: 20, gap: 1.0, still: true });   // 맞붙을 적 줄
  const cav = [];
  for (let k = 0; k < 10; k++) { const i = spawn(s, 0, CAVALRY, 592 + k * 1.6, zf - 1.6, w.rules); cav.push(i); }
  setGoal(w, cav, { kind: 'sector', id: sec.id }); for (const i of cav) s.state[i] = STATE.FRONT;
  for (let k = 0; k < 2 * 20; k++) step(w);                         // 줄의 적을 골라 맞붙는다
  const fighting = cav.filter(i => s.target[i] >= 0 && s.inContact[i]);
  assert.ok(fighting.length >= 5, `맞붙어 싸우는 기병 ${fighting.length}`);
  const archers = block(w, 10, 595, zf + 30, { side: 1, type: ARCHER, still: true });   // 이제 뒤 30 m에 궁수(기병이 먼저 노리는 과녁)
  const prevF = cav.map(i => s.facing[i]); let flips = 0, leaves = 0;
  for (let k = 0; k < 10 * 20; k++) {
    step(w);
    for (const i of fighting) { if (archers.includes(s.target[i])) leaves++; }
    if (k % 5 === 0) cav.forEach((i, n) => { let d = Math.abs(s.facing[i] - prevF[n]) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; if (d > Math.PI / 2) flips++; prevF[n] = s.facing[i]; });
  }
  assert.equal(leaves, 0, '맞붙어 싸우던 기병이 궁수로 과녁을 바꿨다');
  assert.ok(flips <= cav.length, `0.25초 사이 90° 넘게 돈 횟수 ${flips}(기병 ${cav.length}기, 10초)`);
});

test('도는 빠르기: 기병은 한 틱(0.05초)에 9°(1초 180°)까지만 돈다', () => {
  const w = empty(), s = w.soldiers;
  const [c] = block(w, 1, 300, 300, { type: CAVALRY });
  s.facing[c] = 0; s.pfacing[c] = 0;                               // +x를 본다(앞 틱 방향도)
  stillSide(w, 1, INFANTRY);
  block(w, 1, 299, 300, { side: 1, still: true });                 // 바로 뒤(−x)에 붙은 적
  step(w);
  let d = Math.abs(s.facing[c]) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
  assert.ok(d <= 9 * Math.PI / 180 + 1e-6, `한 틱에 ${(d * 180 / Math.PI).toFixed(1)}° 돌았다`);
});

// ---- 창 피하기를 뺐다(사용자 2026-11-10 "부대 컨트롤이 가능해져서 없어도 될 것 같다") ----
import { SPEAR } from '../src/sim/rules.js';
test('기병은 다가오는 창을 피해 물러나지 않고, 닿은 창에서 튕겨 나가지 않는다', () => {
  const w = empty(), s = w.soldiers, sec = w.map.sectors.find(x => x.id === 's0-center');
  const cav = [];
  for (let k = 0; k < 5; k++) { const i = spawn(s, 0, CAVALRY, 600 + k * 2, sec.z - 40, w.rules); cav.push(i); }
  setGoal(w, cav, { kind: 'sector', id: sec.id }); for (const i of cav) s.state[i] = STATE.FRONT;
  for (let k = 0; k < 20; k++) step(w);
  const z0 = cav.map(i => s.z[i]);
  w.rules.units[1][SPEAR].dps = 0;
  const spears = block(w, 20, 596, sec.z - 25, { side: 1, type: SPEAR, still: true });   // 15 m 앞에 버티는 적 창
  setGoal(w, spears, { kind: 'point', x: 600, z: sec.z - 40 }); for (const i of spears) s.order[i] = ORDER.MOVE;   // 기병 쪽으로 걸어온다
  let backed = 0, bounced = 0;
  for (let k = 0; k < 6 * 20; k++) {
    const th = cav.map(i => s.throughUntil[i] > w.time);
    step(w);
    cav.forEach((i, n) => { if (!th[n] && s.throughUntil[i] > w.time && s.contactHold[i]) bounced++; if (z0[n] - s.z[i] > 10) backed++; });
  }
  assert.equal(bounced, 0, '닿은 창에서 튕겨 나갔다');
  assert.equal(backed, 0, '다가오는 창을 피해 물러났다');
});

// ---- 3초마다 과녁 다시 고르기를 뺐다(사용자 2026-11-10) ----
test('기병은 고른 과녁이 죽거나 멀어질 때까지 다른 과녁(더 좋은 궁수)으로 바꾸지 않는다', () => {
  const w = empty(), s = w.soldiers, sec = w.map.sectors.find(x => x.id === 's0-center'), zf = w.map.vpLine;
  stillSide(w, 1, INFANTRY); stillSide(w, 1, ARCHER);
  const [foe] = block(w, 1, 600, zf + 5, { side: 1, still: true });
  w.rules.units[0][CAVALRY].speed = 0;                             // 닿지 못하게(맞붙으면 붙은 과녁을 지키는 규칙이 따로 있다) — 과녁 고르기만 본다
  const cav = [];
  for (let k = 0; k < 4; k++) { const i = spawn(s, 0, CAVALRY, 590 + k * 3, zf - 20, w.rules); cav.push(i); }
  setGoal(w, cav, { kind: 'sector', id: sec.id }); for (const i of cav) s.state[i] = STATE.FRONT;
  for (let k = 0; k < 20; k++) step(w);
  const on = cav.filter(i => s.target[i] === foe);
  assert.ok(on.length >= 1, '그 보병을 골랐다');
  const archers = block(w, 6, 570, zf + 10, { side: 1, type: ARCHER, still: true });   // 이제 더 먼저 노릴 궁수가 40 m 안에
  let switched = 0;
  for (let k = 0; k < 8 * 20; k++) { step(w); for (const i of on) if (archers.includes(s.target[i])) switched++; }
  assert.equal(switched, 0, '고른 보병을 두고 궁수로 바꿨다');
});
