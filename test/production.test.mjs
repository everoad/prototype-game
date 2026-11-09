// 설계서 §3.1·§3.3: 금, 건물 짓기·올리기·철거, 건물이 바꾸는 징집, 빼앗기면 탄다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, CAVALRY, ARCHER } from '../src/sim/rules.js';
import { conversionShares } from '../src/sim/production.js';
import { applyOrder } from '../src/sim/orders.js';
import { buildWorld, runSeconds, producedCount, putEnemyInCircle, captureBy, buildingsAt } from './helpers.mjs';

const b = (kind, level = 1) => ({ kind, level });
const round3 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));

test('바꾸기 몫(거점 특화, 사용자 2026-11-07): 없으면 보병뿐, 생산 건물 하나면 80%(사격장만 50%, 사용자 2026-11-08), 둘이면 몫대로 나눠 합 80%까지', () => {
  const r = makeRules();
  assert.deepEqual(conversionShares([], r), { 0: 0, 1: 0, 2: 0, 3: 1 });
  assert.deepEqual(round3(conversionShares([b('archery')], r)), { 0: 0, 1: 0.5, 2: 0, 3: 0.5 });   // 궁수가 늘 절반쯤 남았다(사용자 2026-11-08)
  assert.deepEqual(round3(conversionShares([b('pikes')], r)), { 0: 0.8, 1: 0, 2: 0, 3: 0.2 });
  assert.deepEqual(round3(conversionShares([b('pikes'), b('stable')], r)), { 0: 0.4, 1: 0, 2: 0.4, 3: 0.2 });
  assert.deepEqual(round3(conversionShares([b('archery'), b('stable')], r)), { 0: 0, 1: 0.308, 2: 0.492, 3: 0.2 }, '0.5 + 0.8을 합 0.8로 줄인다');
  assert.deepEqual(round3(conversionShares([b('archery'), b('stable'), b('wall'), b('tower')], r)), { 0: 0, 1: 0.308, 2: 0.492, 3: 0.2 }, '성벽·망루는 몫이 없다');
});

test('마구간 하나인 앞 거점은 1분에 기병 350 × 0.8 ÷ 1.6명', () => {
  const w = buildWorld();
  runSeconds(w, 60);
  assert.ok(Math.abs(producedCount(w, 'f0L', CAVALRY) - 350 * 0.8 / 1.6) <= 1, `기병 ${producedCount(w, 'f0L', CAVALRY)}`);
});

test('수입: 1분에 본진 60·거점 30·승점 20, 짓기는 값을 내고 25초 뒤 돈다, 모자라면 못 짓는다', () => {
  const w = buildWorld();                                    // 편 0: f0L·f0R(거점 둘) → 1분 60
  for (const st of w.strongholds) if (st.kind === 'vp') st.radius = 0;   // 기병 80% 거점의 병사가 승점을 먼저 잡아 수입이 섞이지 않게
  const g0 = w.sides[0].gold;
  runSeconds(w, 60);
  assert.ok(Math.abs(w.sides[0].gold - g0 - 60) < 1e-6, `금 ${w.sides[0].gold - g0}`);
  const before = w.sides[0].gold;
  assert.equal(applyOrder(w, { kind: 'build', side: 0, stronghold: 'f0L', slot: 1, building: 'archery' }).ok, true);
  assert.equal(w.sides[0].gold, before - 120);
  runSeconds(w, 20);
  assert.equal(producedCount(w, 'f0L', ARCHER), 0, '짓는 중에는 궁수가 안 나온다');
  runSeconds(w, 20);
  assert.ok(producedCount(w, 'f0L', ARCHER) > 0);
  w.sides[0].gold = 10;
  assert.equal(applyOrder(w, { kind: 'build', side: 0, stronghold: 'f0R', slot: 1, building: 'stable' }).ok, false);
});

test('성벽·망루는 칸 뒤 강화 칸에만 짓고 올리기는 값 ×1.5, 철거는 반값·원 안에 적이 있으면 못 한다', () => {
  const w = buildWorld();
  w.sides[0].gold = 1000;
  const st = w.strongholds.find(x => x.id === 'f0L');
  assert.equal(applyOrder(w, { kind: 'build', side: 0, stronghold: 'f0L', slot: 1, building: 'wall' }).ok, false, '생산 칸에 성벽 안 됨');
  assert.equal(applyOrder(w, { kind: 'build', side: 0, stronghold: 'f0L', slot: st.slotCount + 1, building: 'wall' }).ok, false, '망루 칸에 성벽 안 됨');
  assert.equal(applyOrder(w, { kind: 'build', side: 0, stronghold: 'f0L', slot: st.slotCount, building: 'wall' }).ok, true);
  st.slots[st.slotCount].building = false;
  const g1 = w.sides[0].gold;
  assert.equal(applyOrder(w, { kind: 'upgrade', side: 0, stronghold: 'f0L', slot: st.slotCount }).ok, true);
  assert.equal(w.sides[0].gold, g1 - 180);
  const goldBefore = w.sides[0].gold;
  assert.equal(applyOrder(w, { kind: 'demolish', side: 0, stronghold: 'f0L', slot: 0 }).ok, true);
  assert.equal(w.sides[0].gold, goldBefore + 75);
  putEnemyInCircle(w, 'f0R');
  assert.equal(applyOrder(w, { kind: 'demolish', side: 0, stronghold: 'f0R', slot: 0 }).ok, false);
});

test('빼앗기면 건물이 모두 타고(건물마다 −2), 빼앗은 거점의 화살표는 구역으로 못 건다', () => {
  const w = buildWorld();
  const moraleBefore = w.sides[0].morale, n = buildingsAt(w, 'f0R');
  assert.ok(n > 0);
  captureBy(w, 'f0R', 1);
  assert.equal(w.sides[0].morale, moraleBefore - 6 - 2 * n);
  assert.equal(buildingsAt(w, 'f0R'), 0);
  assert.equal(applyOrder(w, { kind: 'arrow', side: 1, from: 'f0R', target: { kind: 'sector', id: 's1-left' } }).ok, false);
  assert.equal(applyOrder(w, { kind: 'arrow', side: 1, from: 'f0R', target: { kind: 'stronghold', id: 'f0R' } }).ok, true);
});

test('처음 생산 방향(사용자 2026-11-08): 거점·본진의 새 병사는 x가 가장 가까운 승점으로 간다', async () => {
  const { createWorld } = await import('../src/sim/world.js');
  const { arrowOf } = await import('../src/sim/production.js');
  const w = createWorld({ scenario: 'battle', seed: 1 });
  const goal = id => arrowOf(w, w.strongholds.find(s => s.id === id));
  assert.deepEqual(goal('hq0'), { kind: 'stronghold', id: 'vpC' });
  assert.deepEqual(goal('f0L'), { kind: 'stronghold', id: 'vpL' });
  assert.deepEqual(goal('r0L'), { kind: 'stronghold', id: 'vpL' });
  assert.deepEqual(goal('f0R'), { kind: 'stronghold', id: 'vpR' });
  assert.deepEqual(goal('r0R'), { kind: 'stronghold', id: 'vpR' });
  assert.deepEqual(goal('hq1'), { kind: 'stronghold', id: 'vpC' });   // 같은 규칙(AI는 제 화살표를 따로 건다)
});

test('시작 대군(사용자 2026-11-08): 우리 편은 구역마다 가장 가까운 승점으로, 적 AI 편은 구역 선으로', async () => {
  const { createWorld } = await import('../src/sim/world.js');
  const w = createWorld({ scenario: 'battle', seed: 1 });
  const ours = w.groups.filter(g => g.side === 0), theirs = w.groups.filter(g => g.side === 1);
  assert.ok(ours.length > 0 && theirs.length > 0);
  const vpFor = x => ['vpL', 'vpC', 'vpR'][x < 420 ? 0 : x < 780 ? 1 : 2];
  for (const g of ours) assert.deepEqual(g.target, { kind: 'stronghold', id: vpFor(g.x) }, `우리 쐐기 x ${g.x.toFixed(0)}`);
  for (const g of theirs) assert.equal(g.target.kind, 'sector');
});
