// Task 15: 지표·각본 봇·자동 대전(설계서 §10.4·§10.5). 조작이 바뀌어(장수 → 고르고 보내기, 공성 없음) 봇 ①·③을 바꿨다 — 실행 기록 Ruling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOne, judge, BOTS } from '../src/sim/autobattle.js';
import { makeStats } from '../src/sim/stats.js';
import { createWorld, step } from '../src/sim/world.js';

test('한 판 보고서에 판정에 쓰는 값이 다 있다', () => {
  const rep = runOne({ seed: 1, scale: 0.05, vs: 'standard', limit: 180 });
  for (const k of ['seed', 'winner', 'reason', 'endTime', 'endedBeforePressure', 'draw', 'morale5min', 'raids', 'raidWins', 'raidMoraleSwing',
    'collapses', 'alive', 'fighting', 'emptyFrontPct', 'contactLifetime', 'buildMix', 'unitMix', 'decisions']) assert.ok(k in rep, k);
  assert.ok(rep.endTime > 0 && rep.endTime <= 180);
  assert.equal(rep.reason === 'timeout', rep.endTime >= 180 - 1e-6);
  assert.ok(rep.alive.length >= 10, '10초마다 살아 있는 병사 수');
  assert.equal(Object.keys(rep.emptyFrontPct).length, 6, '두 편 구역 셋씩');
});

test('각본 봇 일곱이 모두 판을 돈다', () => {
  assert.deepEqual(Object.keys(BOTS), ['blob', 'cavHq', 'poke', 'demolish', 'turtle', 'archers', 'noCav']);
  for (const name of Object.keys(BOTS)) {
    const rep = runOne({ seed: 2, scale: 0.05, vs: name, limit: 60 });
    assert.ok(rep.endTime > 0, name);
  }
});

test('봇 ①(덩어리)은 처음에 우리 병력을 한 덩어리로 적 본진에 보낸다', () => {
  const rep = runOne({ seed: 3, scale: 0.05, vs: 'blob', limit: 10, keepOrders: true });
  const big = rep.orders.filter(o => o.side === 0 && o.kind === 'send' && o.from.kind === 'ids' && o.target.id === 'hq1');
  assert.ok(big.length > 0 && big[0].from.ids.length > 50, `덩어리 보내기(${big[0]?.from.ids.length ?? 0}명)`);
});

test('봇 ⑦(기병 없음)은 마구간을 짓지 않고 본진 마구간도 헌다', () => {
  const rep = runOne({ seed: 4, scale: 0.05, vs: 'noCav', limit: 240, keepOrders: true });
  assert.ok(!rep.orders.some(o => o.side === 0 && o.kind === 'build' && o.building === 'stable'));
  assert.ok(rep.orders.some(o => o.side === 0 && o.kind === 'demolish'), '본진 마구간 철거');
});

test('결정 수: 30초 안에 같은 거점의 화살표를 다시 바꾸면 앞의 것은 세지 않는다', () => {
  const w = createWorld({ seed: 1, scenario: 'battle' });
  w.metrics = makeStats({ seed: 1 });
  const arrow = id => step(w, [{ kind: 'arrow', side: 0, from: 'f0L', target: { kind: 'sector', id } }]);   // 명령은 틱 안에서(사건이 그 틱에 보인다)
  arrow('s0-center');
  for (let k = 0; k < 10 * 20; k++) step(w);
  arrow('s0-right');                                            // 10초 뒤에 바꿈 → 앞의 것은 잡일
  for (let k = 0; k < 40 * 20; k++) step(w);
  const rep = w.metrics.finish(w);
  assert.equal(rep.decisions[0], 1);
});

test('판정 표: §10.5 기준 2·4·5·6·7을 통과/실패와 값으로', () => {
  const reps = [1, 2].map(seed => runOne({ seed, scale: 0.05, vs: 'standard', limit: 120 }));
  const rows = judge(reps, 'standard');
  for (const r of rows) { assert.ok(r.criterion && 'value' in r && typeof r.pass === 'boolean', JSON.stringify(r)); }
  assert.ok(['2', '4', '5', '6'].every(c => rows.some(r => r.criterion.startsWith(c))));
  const botRows = judge([runOne({ seed: 1, scale: 0.05, vs: 'archers', limit: 60 })], 'archers');
  assert.ok(botRows.some(r => r.criterion.startsWith('7')));
});
