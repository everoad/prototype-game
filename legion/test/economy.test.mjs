// 자원·수입·인구(3단계 계획 Task 3): 성채 기본 수입, 본진과 이어진 제 땅의 채굴기 수입, 인구(무게)와 상한.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { setupGame } from '../src/sim/game.js';
import { addBuilding } from '../src/sim/buildings.js';
import { relink } from '../src/sim/territory.js';
import { recount, costOf, canPay, pay, lack, RES, RES_NAMES } from '../src/sim/economy.js';
import { INFANTRY, ARCHER } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
const region = (w, i, j) => w.map.regions.find(g => g.i === i && g.j === j);
const own = (w, g, side = 0) => { w.territory[g.id].owner = side; relink(w); };
const withCitadel = () => { const w = createWorld({ map: 'legion' }); addBuilding(w, 0, 'citadel', 600, 48, { done: true }); return w; };
const mineOn = (w, g, type = 'goldmine', kind = 'gold', done = true) => {
  const d = w.map.deposits.find(o => o.region === g.id && o.kind === kind);
  return addBuilding(w, 0, type, d.x, d.z, { done, deposit: d.id });
};

test('시작 자원과 성채 수입', () => {
  const w = createWorld({ map: 'legion' });
  setupGame(w);
  const S = w.sides[0];
  assert.deepEqual([S.gold, S.wood, S.mana], [400, 300, 0]);
  run(w, 10);
  assert.ok(Math.abs(S.gold - 440) <= 0.5 && Math.abs(S.wood - 320) <= 0.5 && Math.abs(S.mana - 5) <= 0.5, `금 ${S.gold} 목재 ${S.wood} 마나 ${S.mana}`);
  assert.deepEqual(w.sides[1].rate, { gold: 4, wood: 2, mana: 0.5 });
});

test('금광은 이어진 제 땅에서만 수입 — 땅이 중립이 되면 멈추고 되찾으면 돌아온다', () => {
  const w = withCitadel(), gold = region(w, 1, 0);
  own(w, gold);
  mineOn(w, gold);
  recount(w);
  assert.equal(w.sides[0].rate.gold, 7);
  own(w, gold, -1); recount(w);
  assert.equal(w.sides[0].rate.gold, 4);
  own(w, gold, 0); recount(w);
  assert.equal(w.sides[0].rate.gold, 7);
});

test('끊긴 땅의 채굴기는 수입이 없다', () => {
  const w = withCitadel(), volcano = region(w, 0, 1);
  assert.ok(!volcano.neighbors.includes(w.map.homes[0]));
  own(w, volcano);
  assert.equal(w.territory[volcano.id].connected[0], false);
  mineOn(w, volcano);
  recount(w);
  assert.equal(w.sides[0].rate.gold, 4);
});

test('짓는 중인 채굴기는 수입이 없다', () => {
  const w = withCitadel(), gold = region(w, 1, 0);
  own(w, gold);
  mineOn(w, gold, 'goldmine', 'gold', false);
  recount(w);
  assert.equal(w.sides[0].rate.gold, 4);
});

test('인구 = 산 병사 무게 + 잡아 둔 몫', () => {
  const w = withCitadel(), s = w.soldiers;
  for (let k = 0; k < 10; k++) { spawn(s, 0, INFANTRY, 650 + k * 2, 150, w.rules); spawn(s, 0, ARCHER, 650 + k * 2, 155, w.rules); }
  spawn(s, 1, INFANTRY, 650, 600, w.rules);
  recount(w);
  assert.ok(Math.abs(w.sides[0].pop - 16) < 1e-9, `인구 ${w.sides[0].pop}`);
  w.sides[0].reserved = 5;
  recount(w);
  assert.ok(Math.abs(w.sides[0].pop - 21) < 1e-9);
});

test('인구 상한 = 800 + 이어진 땅 150 + 마을 300, 최대 4000', () => {
  const w = withCitadel(), cap = () => { recount(w); return w.sides[0].popCap; };
  assert.equal(cap(), 800);
  own(w, region(w, 1, 0)); own(w, region(w, 3, 0));
  assert.equal(cap(), 1100);
  own(w, region(w, 4, 0));                                        // 말 목장 마을(숲과 이웃)
  assert.equal(w.territory[region(w, 4, 0).id].connected[0], true);
  assert.equal(cap(), 1550);
  own(w, region(w, 4, 3));                                        // 맞은편 마을 — 끊겼다
  assert.equal(w.territory[region(w, 4, 3).id].connected[0], false);
  assert.equal(cap(), 1550);
  w.rules.economy.pop.max = 1000;
  assert.equal(cap(), 1000);
});

test('성채가 없으면 기본 수입과 기본 인구가 없다', () => {
  const w = createWorld({ map: 'legion' });
  recount(w);
  assert.deepEqual(w.sides[0].rate, { gold: 0, wood: 0, mana: 0 });
  assert.equal(w.sides[0].popCap, 0);
});

test('값 치르기', () => {
  assert.deepEqual(RES, ['gold', 'wood', 'mana']);
  assert.deepEqual(RES_NAMES, { gold: '금', wood: '목재', mana: '마나' });
  const S = { gold: 100, wood: 50, mana: 0 }, c = costOf({ gold: 60, wood: 50 });
  assert.deepEqual(c, { gold: 60, wood: 50, mana: 0 });
  assert.equal(canPay(S, c), true);
  pay(S, c);
  assert.deepEqual(S, { gold: 40, wood: 0, mana: 0 });
  assert.equal(canPay(S, c), false);
  assert.equal(lack(S, c), '금이 모자라다');
  assert.equal(lack({ gold: 99, wood: 0, mana: 0 }, c), '목재가 모자라다');
  assert.equal(lack({ gold: 99, wood: 99, mana: 0 }, costOf({ mana: 1 })), '마나가 모자라다');
  assert.equal(lack({ gold: 99, wood: 99, mana: 0 }, c), '');
  pay(S, c, -1);
  assert.deepEqual(S, { gold: 100, wood: 50, mana: 0 });
});
