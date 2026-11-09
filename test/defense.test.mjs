// 설계서 §3.5·§7.3: 수비대 채우기·끈, 집에 남음, 건물 막힘, 막아라, 경보.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overwhelmed } from '../src/sim/defense.js';
import { applyOrder } from '../src/sim/orders.js';
import { STATE } from '../src/sim/soldiers.js';
import { ARCHER } from '../src/sim/rules.js';
import { runSeconds, defenseWorld, garrisonWeight, enemyAt, chasedBy, pulledWeight, clearEnemies, enemyWeightAt, alertsOf, producedCount } from './helpers.mjs';

test('막힘 기준: 적 무게가 max(5, 우리 무게)를 넘을 때', () => {
  assert.equal(overwhelmed(6, 0), true);
  assert.equal(overwhelmed(5, 0), false);
  assert.equal(overwhelmed(20, 25), false);
});

test('수비대가 차고, 원 + 40 m 밖은 쫓지 않고, 막아라는 지휘 한도만큼 끌어왔다가 10초 뒤 돌려보낸다', () => {
  const w = defenseWorld();                                   // 뒤 거점 r0L, 수비대 0
  w.rules.formation.enabled = false;                          // 수비대 규칙 자체를 본다(창만 선 수비대는 진형에선 바깥 고리라 쫓지 않는다 — formation.test)
  runSeconds(w, 20);
  assert.ok(garrisonWeight(w, 'r0L') >= 60, `수비대 ${garrisonWeight(w, 'r0L')}`);
  const far = enemyAt(w, 'r0L', 120);
  runSeconds(w, 3);
  assert.equal(chasedBy(w, far), 0);                          // 원 + 40 = 100 m 밖
  const near = enemyAt(w, 'r0L', 90);
  runSeconds(w, 2);
  assert.ok(chasedBy(w, near) > 0, '100 m 안의 적은 수비대가 쫓는다');
  const r = applyOrder(w, { kind: 'holdTheLine', side: 0, stronghold: 'r0L' });
  assert.ok(r.ok, r.reason);
  assert.ok(Math.abs(pulledWeight(w, 'r0L') - 500) <= 1.6, `끌어온 무게 ${pulledWeight(w, 'r0L')}`);
  clearEnemies(w, 'r0L');
  runSeconds(w, 11);
  assert.equal(pulledWeight(w, 'r0L'), 0);
});

test('둘레 적이 더 많으면 새 병사는 집에 남고, 경보가 뜬다', () => {
  const w = defenseWorld();
  runSeconds(w, 20);
  enemyWeightAt(w, 'r0L', 80, 40);                            // 원 밖 20 m(둘레 안)에 적 무게 40 — 수비대 60보다 적다
  runSeconds(w, 1);
  assert.ok(!alertsOf(w, 0).some(a => a.stronghold === 'r0L' && a.kind === 'attacked'), '원 밖 적은 공격 경보가 아니다');
  enemyWeightAt(w, 'r0L', 30, 200);                           // 원 안에 200 — 넘친다
  runSeconds(w, 0.5);                                         // 훑기는 0.25초마다
  const before = w.soldiers.count;
  runSeconds(w, 4);
  const s = w.soldiers;
  let marched = 0;
  for (let i = before; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && s.group[i] >= 0) marched++;
  assert.equal(marched, 0, '넘치면 새 병사가 쐐기에 서지 않는다');
  assert.ok(alertsOf(w, 0).some(a => a.stronghold === 'r0L' && a.kind === 'attacked'));
});

test('건물 둘레 20 m가 막히면 그 건물은 바꾸지 않고, 막힘 경보가 뜬다', () => {
  const w = defenseWorld();
  const st = w.strongholds.find(x => x.id === 'r0L');
  st.slots[0] = { kind: 'archery', level: 1, hp: w.rules.buildings.hp };
  runSeconds(w, 30);
  const archers = producedCount(w, 'r0L', ARCHER);
  assert.ok(archers > 0);
  enemyWeightAt(w, 'r0L', 0, 300, { slot: 0 });               // 사격장 바로 위에 적 무게 300(수비대·집에 남은 병사보다 많다)
  runSeconds(w, 0.5);
  const atBlock = producedCount(w, 'r0L', ARCHER);
  runSeconds(w, 20);
  assert.equal(producedCount(w, 'r0L', ARCHER), atBlock, '막힌 사격장은 궁수를 내지 않는다');
  assert.ok(alertsOf(w, 0).some(a => a.stronghold === 'r0L' && a.kind === 'blocked'));
});
