// 공성병 사기(설계서 2026-11-09-flood-gold-orders-design.md §2): 거점에서 금 150에 10명, 20초 뒤 그 거점에 선다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, kill } from '../src/sim/soldiers.js';
import { noticeTroops } from '../src/view/select.js';
import { SIEGE } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';
import { buySiege } from '../src/sim/siege.js';
import { damagePerSecond } from '../src/sim/combat.js';
import { makeStats } from '../src/sim/stats.js';
import { makeAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const run = (w, sec) => { for (let k = 0; k < Math.round(sec * 20); k++) step(w); };
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
const countType = (w, side, type) => { const s = w.soldiers; let n = 0; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.type[i] === type) n++; return n; };

test('투석기: 20초 뒤 3대가 그 거점에 나오고 알림이 뜬다', () => {
  const w = empty(); w.sides[0].gold = 500;
  assert.ok(applyOrder(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' }).ok);
  assert.equal(w.sides[0].gold, 350);
  run(w, 19); assert.equal(countType(w, 0, SIEGE), 0);
  run(w, 1.1); assert.equal(countType(w, 0, SIEGE), 3);
  const st = w.strongholds.find(x => x.id === 'f0L'), s = w.soldiers;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.type[i] === SIEGE) assert.ok(Math.hypot(s.x[i] - st.x, s.z[i] - st.z) <= st.radius);
  const n = w.notices.find(x => x.kind === 'siegeReady');
  assert.equal(n.stronghold, 'f0L'); assert.equal(n.ids.length, 3); assert.equal(n.side, 0);
});

test('사는 중이면 그 거점에서 또 못 사고, 금이 모자라거나 판이 끝나면 못 산다', () => {
  const w = empty(); w.sides[0].gold = 200;
  assert.ok(buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' }).ok);
  assert.equal(buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' }).reason, '이미 사는 중');
  assert.equal(buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'f0R' }).reason, '금이 모자라다');
  assert.equal(buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'f1L' }).reason, '우리 거점이 아니다');
  w.sides[0].gold = 500; w.result = { winner: 1 };
  assert.equal(buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'f0R' }).ok, false);
});

test('사는 동안 거점을 빼앗기면 아무에게도 나오지 않는다', () => {
  const w = empty(); w.sides[0].gold = 500;
  buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' });
  w.strongholds.find(x => x.id === 'f0L').owner = 1;
  run(w, 21);
  assert.equal(countType(w, 0, SIEGE) + countType(w, 1, SIEGE), 0);
});

test('투석기는 근접·화살 화력이 없고 건물에는 돌 한 발 350으로 친다(catapult.js)', () => {
  const w = empty();
  assert.equal(damagePerSecond({ atkSide: 0, atkType: SIEGE, building: true, aura: 1 }, w.rules), 0);
  assert.equal(w.rules.units[0][SIEGE].catapult, true); assert.equal(w.rules.units[1][SIEGE].catapult, true);
  assert.equal(w.rules.catapult.buildingHit, 350);
});

test('투석기가 있는 판을 1분 돌려도 지표·AI 기억이 숫자다', () => {
  const w = createWorld({ seed: 1, scenario: 'battle' });
  w.metrics = makeStats({ seed: 1 });
  w.controllers[1] = makeAi(1, { personality: 'aggressive' }, makeRng(5));
  w.sides[0].gold = 500; assert.ok(buySiege(w, { kind: 'buySiege', side: 0, stronghold: 'hq0' }).ok);
  run(w, 60);
  assert.equal(countType(w, 0, SIEGE), 3);
  const bad = [], walk = (o, p) => { if (typeof o === 'number') { if (!Number.isFinite(o)) bad.push(p); } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${p}.${k}`); };
  walk(w.metrics.finish(w), '');                                 // null(승자 없음 등)은 원래 있다 — NaN·무한만 본다
  assert.deepEqual(bad, [], '지표에 NaN 없음');
  assert.ok(w.controllers[1].state.mem.vis.every(Number.isFinite));
  const s = w.soldiers; for (let i = 0; i < s.count; i++) if (s.alive[i]) assert.ok(Number.isFinite(s.x[i] + s.z[i]), '자리가 숫자');
});

// ---- 리뷰에서 미룬 작은 것(2026-11-09) ----
test('병사 자리가 꽉 차서 공성병이 못 나오면 값을 돌려준다', () => {
  const w = empty(); w.sides[0].gold = 500;
  assert.ok(applyOrder(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' }).ok);
  const s = w.soldiers; s.count = s.capacity; s.free.length = 0;   // 자리가 꽉 찼다
  run(w, 20.1);
  assert.equal(w.sides[0].gold, 500);
});

test('공성병 알림: 그 사이 죽은 번호를 새 병사가 물려받으면 고르지 않는다', () => {
  const w = empty(); w.sides[0].gold = 500;
  applyOrder(w, { kind: 'buySiege', side: 0, stronghold: 'f0L' });
  run(w, 20.1);
  const n = w.notices.find(x => x.kind === 'siegeReady'), s = w.soldiers, gone = n.ids[0];
  kill(s, gone);
  const j = spawn(s, 0, SIEGE, 300, 300, w.rules);
  assert.equal(j, gone, '번호를 물려받았다');
  const picked = noticeTroops(w, n);
  assert.equal(picked.length, 2); assert.ok(!picked.includes(gone));
});
