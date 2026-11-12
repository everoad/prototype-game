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
// ---- 3초마다 과녁 다시 고르기를 뺐다(사용자 2026-11-10) ----
