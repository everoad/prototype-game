// 뽑기(6-1단계 계획 Task 6): 마법탑, 땅 = 병종(그 역할 땅을 가졌고 이어져야), 땅을 잃거나 건물 땅이 끊기면 생산·연구 시계가 멈춘다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { relink } from '../src/sim/territory.js';
import { ownsLand, landWhy, pauseWhy } from '../src/sim/lands.js';
import { buildingButtons, queueText, buildButtons } from '../src/view/panel.js';
import { PRIEST, INFANTRY } from '../src/sim/rules.js';
import { spawn } from '../src/sim/soldiers.js';

const run = (w, sec) => { for (let k = 0, n = Math.round(sec / w.rules.dt); k < n; k++) step(w); };
const rich = w => Object.assign(w.sides[0], { gold: 9000, wood: 9000, mana: 9000 });
const setOwn = (w, ids, side) => { for (const id of ids) Object.assign(w.territory[id], { owner: side, hold: side >= 0 ? 1 : 0 }); relink(w); };
const ley = w => w.map.regions.find(g => g.land === 'ley' && !g.mirror);
const row0 = w => w.map.regions.filter(g => !g.mirror && g.j === 0).map(g => g.id);
function base() {
  const w = createWorld({ map: 'legion' }); rich(w);
  const home = w.map.regions[w.map.homes[0]];
  addBuilding(w, 0, 'citadel', home.x, home.z - 22, { done: true });
  const tower = addBuilding(w, 0, 'magetower', home.x + 60, home.z, { done: true });
  return { w, tower };
}

test('마법탑: 짓기 메뉴 일곱째, 병영이 먼저, 마법사·사제', () => {
  const { w } = base();
  assert.equal(w.rules.buildMenu[6], 'magetower');
  assert.deepEqual(w.rules.buildings.magetower.trains, ['mage', 'priest']);
  assert.ok(w.rules.buildings.stable.trains.includes('knight') && w.rules.buildings.workshop.trains.includes('golem'));
  const btn = buildButtons(w, 0).find(x => x.type === 'magetower');
  assert.equal(btn.name, '마법탑');
  assert.match(btn.why, /병영/);
});

test('땅 = 병종: 마나 샘이 없으면 마법사 거절(아무것도 안 바뀜), 사제는 땅 없이', () => {
  const { w, tower } = base(), gold = w.sides[0].gold;
  assert.equal(ownsLand(w, 0, 'ley'), false);
  const r = applyOrder(w, { kind: 'train', side: 0, building: tower.id, unit: 'mage' });
  assert.deepEqual(r, { ok: false, reason: '마나 샘 땅이 있어야 한다' });
  assert.equal(w.sides[0].gold, gold); assert.equal(tower.queue.length, 0);
  assert.equal(buildingButtons(w, tower).find(x => x.key === 'mage').why, '마나 샘 땅이 있어야 한다');
  assert.ok(applyOrder(w, { kind: 'train', side: 0, building: tower.id, unit: 'priest' }).ok);
  setOwn(w, row0(w), 0);
  assert.equal(ownsLand(w, 0, 'ley'), true);
  assert.equal(landWhy(w, 0, 'mage'), '');
  assert.ok(applyOrder(w, { kind: 'train', side: 0, building: tower.id, unit: 'mage' }).ok);
});

test('땅을 잃으면 멈추고(알림 한 번) 되찾으면 이어 간다', () => {
  const { w, tower } = base();
  setOwn(w, row0(w), 0);
  applyOrder(w, { kind: 'train', side: 0, building: tower.id, unit: 'mage' });
  run(w, 5);
  const left = tower.queue[0].left;
  setOwn(w, [ley(w).id], -1);
  run(w, 3);
  assert.equal(tower.queue[0].left, left);
  assert.equal(pauseWhy(w, tower, tower.queue[0]), '마나 샘 땅이 있어야 한다');
  assert.equal(w.notices.filter(n => n.kind === 'paused').length, 1);
  assert.match(queueText(w, tower)[0], /멈춤: 마나 샘 땅이 있어야 한다/);
  setOwn(w, [ley(w).id], 0);
  run(w, 1);
  assert.ok(tower.queue[0].left < left);
});

test('건물 땅이 남의 땅이면 연구·생산 모두 멈춘다', () => {
  const { w } = base();
  const g = w.map.regions.find(x => x.role === 'gold' && !x.mirror);
  setOwn(w, [g.id], 0);
  const bar = addBuilding(w, 0, 'barracks', g.x + 40, g.z, { done: true });
  applyOrder(w, { kind: 'research', side: 0, building: bar.id, key: 'longbow' });
  setOwn(w, [g.id], -1);
  const left = bar.queue[0].left;
  run(w, 2);
  assert.equal(bar.queue[0].left, left);
  assert.equal(pauseWhy(w, bar, bar.queue[0]), '땅이 끊겼다');
});

test('멈춘 줄 취소: 시작한 병사 항목이면 값과 인구를 돌려준다', () => {
  const { w, tower } = base();
  setOwn(w, row0(w), 0);
  applyOrder(w, { kind: 'train', side: 0, building: tower.id, unit: 'mage' });
  run(w, 1);
  const S = w.sides[0], pop = S.pop, mana = S.mana;
  assert.ok(tower.queue[0].started);
  setOwn(w, [ley(w).id], -1);
  run(w, 1);
  assert.equal(S.pop, pop, '멈춰도 인구를 놓지도 더 잡지도 않는다');
  assert.ok(applyOrder(w, { kind: 'cancel', side: 0, building: tower.id, index: 0 }).ok);
  assert.ok(S.pop < pop && S.mana > mana);
});

test('나온 부대와 섞어 보내기(사제·보병)가 진형을 깨지 않는다', () => {
  const { w, tower } = base();
  applyOrder(w, { kind: 'train', side: 0, building: tower.id, unit: 'priest' });
  run(w, 26);
  const s = w.soldiers, ids = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && s.type[i] === PRIEST) ids.push(i);
  assert.equal(ids.length, 10);
  const home = w.map.regions[w.map.homes[0]];
  for (let k = 0; k < 30; k++) ids.push(spawn(s, 0, INFANTRY, home.x - 15 + k, home.z + 40, w.rules));
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: home.x, z: home.z + 120 } });
  assert.ok(r.ok);
  run(w, 3);
  for (const i of ids) assert.ok(Number.isFinite(s.x[i]) && Number.isFinite(s.z[i]));
});
