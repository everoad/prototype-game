// HUD 상태 줄의 병사 수(1단계 Task 7 — 편·병종별 산 병사). 화면 없이 글만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { killSoldier } from '../src/sim/combat.js';
import { SPEAR, ARCHER, INFANTRY } from '../src/sim/rules.js';
import { countsText, landText } from '../src/view/hud.js';

test('상태 줄: 편마다 산 병사와 병종별 수(있는 병종만), 싸우는 병사 수', () => {
  const w = createWorld({ seed: 1 }), s = w.soldiers;
  const put = (side, type, n) => Array.from({ length: n }, (_, k) => spawn(s, side, type, 300 + k * 2, 300 + side * 100, w.rules));
  const spears = put(0, SPEAR, 3);
  put(0, ARCHER, 2);
  put(1, INFANTRY, 4);
  killSoldier(w, spears[0]);
  s.inContact[spears[1]] = 1;
  assert.equal(countsText(w), '우리 4(드워프 방패병 2 · 엘프 궁수 2) : 적 4(고블린 4) · 싸우는 중 1 : 0');
});

test('상태 줄: 중립이 있으면 끝에 중립 수', () => {
  const w = createWorld({ seed: 1 }), s = w.soldiers;
  spawn(s, 0, SPEAR, 300, 300, w.rules);
  for (let k = 0; k < 3; k++) spawn(s, 2, INFANTRY, 400 + k * 2, 400, w.rules);
  assert.equal(countsText(w), '우리 1(드워프 방패병 1) : 적 0 · 싸우는 중 0 : 0 · 중립 3');
});

test('상태 줄 땅 수: 지역이 있는 지도에서만', () => {
  const w = createWorld({ map: 'legion' });
  assert.equal(landText(w), ' · 땅 우리 1 : 적 1');
  w.territory[w.map.regions.find(g => g.role === 'gold').id].owner = 0;
  assert.equal(landText(w), ' · 땅 우리 2 : 적 1');
  assert.equal(landText(createWorld()), '');
});

// ---- 3단계(자원 줄) ----
import { resourceLine } from '../src/view/hud.js';
import { setupGame } from '../src/sim/game.js';
import { addBuilding } from '../src/sim/buildings.js';

test('자원 줄: 자원·인구와 광부 조 수(쉬는 조)', () => {
  const w = createWorld({ map: 'legion' });
  setupGame(w);
  const pop = Math.ceil(w.sides[0].pop);
  assert.equal(resourceLine(w), `금 400 (+4.0) · 목재 300 (+2.0) · 마나 0 (+0.5) · 인구 ${pop}/800 · 광부 조 3(쉬는 조 3)`);
  const s = w.soldiers, bar = addBuilding(w, 0, 'barracks', 700, 160);
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && s.crew[i] === s.crew.find((c, j) => s.alive[j] && s.side[j] === 0 && c >= 0)) s.job[i] = bar.id;
  assert.ok(resourceLine(w).endsWith('광부 조 3(쉬는 조 2)'));
  assert.equal(resourceLine(createWorld()), '');
});
