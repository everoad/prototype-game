// 설계서 §4: 장수·별동대 — 붙이기(지휘 한도), 기운, 돌격(기운 고정·쿨), 패주, 장수 화살표의 150 m 조건, 해산.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder } from '../src/sim/orders.js';
import { runSeconds, generalWorld, allNear, attachedWeight, auraWeight, auraOf, surround, isRouted, generalAt, newSoldierGoal, attachedIds } from './helpers.mjs';

test('붙이기·기운은 지휘 한도까지, 돌격은 기운을 15초 고정하고 60초 쿨, 홀로 둘러싸인 장수는 5초 뒤 패주(사기 −6)', () => {
  const w = generalWorld();                                     // 장수 g0a, 근처에 우리 창병 무게 700
  assert.ok(applyOrder(w, { kind: 'attach', side: 0, general: 'g0a', ids: allNear(w, 'g0a'), typeFilter: null }).ok);
  assert.ok(attachedWeight(w, 'g0a') <= 500 && attachedWeight(w, 'g0a') > 499 - 1.6, `붙은 무게 ${attachedWeight(w, 'g0a')}`);
  runSeconds(w, 1.1);
  assert.ok(auraWeight(w, 'g0a') <= 500 && auraWeight(w, 'g0a') > 400, `기운 무게 ${auraWeight(w, 'g0a')}`);
  assert.ok(applyOrder(w, { kind: 'charge', side: 0, general: 'g0a' }).ok);
  const fixed = [...auraOf(w, 'g0a')].sort((a, b) => a - b);
  runSeconds(w, 5);
  assert.deepEqual([...auraOf(w, 'g0a')].sort((a, b) => a - b), fixed);
  assert.equal(applyOrder(w, { kind: 'charge', side: 0, general: 'g0a' }).ok, false);   // 쿨
  surround(w, 'g0b', 1, 40);
  runSeconds(w, 5.1);
  assert.ok(isRouted(w, 'g0b'));
  assert.equal(w.sides[0].morale, 60 - 6);
  assert.equal(applyOrder(w, { kind: 'generalMove', side: 0, general: 'g0b', path: [{ x: 600, z: 200 }] }).ok, false);   // 패주 중엔 못 쓴다
});

test('장수 화살표: 장수가 우리 땅(거점·구역 선 150 m)에서 멀면 새 병사는 마지막 구역으로', () => {
  const w = generalWorld();
  applyOrder(w, { kind: 'arrow', side: 0, from: 'f0L', target: { kind: 'sector', id: 's0-left' } });   // "마지막 구역"(처음 방향은 승점이라 — 2026-11-08)
  const far = generalAt(w, 0, { x: 600, z: 600 });
  assert.ok(applyOrder(w, { kind: 'arrow', side: 0, from: 'f0L', target: { kind: 'general', id: far } }).ok);
  runSeconds(w, 2);
  assert.equal(newSoldierGoal(w, 'f0L').kind, 'sector');
  const near = generalAt(w, 0, { x: 360, z: 300 });
  applyOrder(w, { kind: 'arrow', side: 0, from: 'f0L', target: { kind: 'general', id: near } });
  runSeconds(w, 2);
  assert.equal(newSoldierGoal(w, 'f0L').kind, 'general');
});

test('길을 그리면 별동대가 장수를 따라가고, 해산하면 가장 가까운 구역 병사가 된다', () => {
  const w = generalWorld();
  applyOrder(w, { kind: 'attach', side: 0, general: 'g0a', ids: allNear(w, 'g0a'), typeFilter: null });
  assert.ok(applyOrder(w, { kind: 'generalMove', side: 0, general: 'g0a', path: [{ x: 600, z: 240 }, { x: 700, z: 240 }] }).ok);
  runSeconds(w, 60);
  const g = w.sides[0].generals.find(x => x.id === 'g0a'), s = w.soldiers, ids = attachedIds(w, 'g0a');
  assert.ok(Math.hypot(g.x - 700, g.z - 240) < 2, `장수 (${g.x.toFixed(0)}, ${g.z.toFixed(0)})`);
  const near = ids.filter(i => Math.hypot(s.x[i] - g.x, s.z[i] - g.z) < 30).length;
  assert.ok(near >= ids.length * 0.8, `장수 30 m 안 ${near}/${ids.length}`);
  assert.ok(applyOrder(w, { kind: 'dissolve', side: 0, general: 'g0a' }).ok);
  assert.equal(attachedIds(w, 'g0a').length, 0);
  assert.ok(ids.every(i => s.goalKind[i] === 1), '구역 병사');
});

