// 화면 판 글(3단계 계획 Task 9 — three 없이 셈만): 자원 줄, 값 글, 짓기 단추, 건물 판 단추, 생산 줄 글.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { setupGame } from '../src/sim/game.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { resourceText, costText, buildButtons, buildingButtons, queueText } from '../src/view/panel.js';

const game = () => { const w = createWorld({ map: 'legion' }); setupGame(w); return w; };

test('자원 줄: 자원과 초당 수입, 인구(올림)/상한', () => {
  const w = game(), pop = Math.ceil(w.sides[0].pop);
  assert.ok(pop >= 498 && pop <= 499, `시작 인구 ${pop}`);
  assert.equal(resourceText(w, 0), `금 400 (+4.0) · 목재 300 (+2.0) · 마나 0 (+0.5) · 인구 ${pop}/800`);
});

test('값 글: 0인 자원은 뺀다', () => {
  assert.equal(costText({ gold: 150, wood: 150, mana: 0 }), '금 150 · 목재 150');
  assert.equal(costText({ gold: 0, wood: 0, mana: 100 }), '마나 100');
  assert.equal(costText({ gold: 0, wood: 0, mana: 0 }), '');
});

test('짓기 단추: 메뉴 차례, 못 고르는 까닭', () => {
  const w = game(), list = buildButtons(w, 0);
  assert.deepEqual(list.map(b => b.type), w.rules.buildMenu);
  assert.deepEqual(list.map(b => b.name), ['금광', '벌목소', '마나 우물', '병영', '마구간', '공방', '마법탑']);
  const shop = list.find(b => b.type === 'workshop');
  assert.deepEqual([shop.ok, shop.why], [false, '병영이(가) 먼저 있어야 한다']);
  assert.deepEqual(list.find(b => b.type === 'barracks').cost, { gold: 150, wood: 150, mana: 0 });
  assert.equal(list.find(b => b.type === 'barracks').ok, true);
  w.sides[0].gold = 0;
  assert.equal(buildButtons(w, 0).find(b => b.type === 'barracks').why, '금이 모자라다');
  assert.equal(buildButtons(w, 1)[0].name, '금 구덩이');
});

test('건물 판 단추: 생산과 연구, 연구 중이면 까닭', () => {
  const w = game(), b = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  Object.assign(w.sides[0], { gold: 2000, wood: 2000, mana: 500 });
  let list = buildingButtons(w, b);
  assert.deepEqual(list.map(x => `${x.kind}:${x.key}`), ['train:infantry', 'train:spear', 'train:archer', 'research:shieldwall', 'research:longbow']);
  assert.deepEqual(list.map(x => x.name), ['인간 보병', '드워프 방패병', '엘프 궁수', '방패벽', '장궁']);
  assert.deepEqual([list[0].cost, list[0].time, list[0].n, list[0].ok], [{ gold: 200, wood: 100, mana: 0 }, 25, 150, true]);
  applyOrder(w, { kind: 'research', side: 0, building: b.id, key: 'shieldwall' });
  list = buildingButtons(w, b);
  assert.deepEqual([list[3].ok, list[3].why], [false, '이미 했거나 하는 중이다']);
  w.sides[0].mana = 0;
  assert.equal(buildingButtons(w, b)[4].why, '마나가 모자라다');
  const cit = w.buildings.find(x => x.type === 'citadel' && x.side === 0);
  assert.deepEqual(buildingButtons(w, cit).map(x => [x.key, x.name, x.n]), [['worker', '드워프 광부', 10]]);
  assert.deepEqual(buildingButtons(w, addBuilding(w, 0, 'stable', 520, 128)), [], '짓는 중');
});

test('생산 줄 글: 맨 앞은 남은 초, 인구 대기면 그렇게', () => {
  const w = game(), b = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  Object.assign(w.sides[0], { gold: 2000, wood: 2000, mana: 500 });
  for (const unit of ['infantry', 'spear']) applyOrder(w, { kind: 'train', side: 0, building: b.id, unit });
  applyOrder(w, { kind: 'research', side: 0, building: b.id, key: 'longbow' });
  for (let k = 0; k < 260; k++) step(w);                              // 13초
  assert.deepEqual(queueText(w, b), ['인간 보병 12초', '드워프 방패병', '장궁']);
  w.rules.economy.pop.base = 0;
  for (let k = 0; k < 260; k++) step(w);
  assert.deepEqual(queueText(w, b), ['드워프 방패병 (인구 대기)', '장궁']);
});
