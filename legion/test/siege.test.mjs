// 포위(6-1단계 계획 Task 7, 영지 규칙): 성채와 끊긴 우리 땅 덩어리의 둘레가 모두 적 땅이면 60초 뒤 덩어리째 적에게.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { relink } from '../src/sim/territory.js';
import { siegeText } from '../src/view/panel.js';

const run = (w, sec) => { for (let k = 0, n = Math.round(sec / w.rules.dt); k < n; k++) step(w); };
function pocket(pick) {   // 편 1 쪽 땅 하나를 편 0의 끊긴 땅으로, 이웃은 모두 편 1로
  const w = createWorld({ map: 'legion' }), T = w.territory, g = w.map.regions.find(pick);
  T[g.id].owner = 0; T[g.id].hold = 1;
  for (const n of g.neighbors) { T[n].owner = 1; T[n].hold = 1; }
  relink(w);
  return { w, g };
}

test('둘레가 모두 적이면 60초 뒤 적 땅, 알림이 자리와 함께', () => {
  const { w, g } = pocket(x => x.mirror && x.role === 'fort');
  run(w, 59);
  assert.equal(w.territory[g.id].owner, 0);
  assert.ok(w.notices.some(n => n.kind === 'encircled' && n.x === g.x && n.z === g.z));
  assert.equal(siegeText(w.territory[g.id], w.rules), '포위 1초');
  run(w, 2);
  assert.equal(w.territory[g.id].owner, 1);
  assert.ok(w.notices.some(n => n.kind === 'siegeLost'));
  assert.equal(siegeText(w.territory[g.id], w.rules), '');
});

test('판 가장자리 덩어리도 같고, 둘레에 중립이 하나라도 있으면 시계 0', () => {
  const edge = pocket(x => x.mirror && x.i === 0 && x.j === 3);
  run(edge.w, 61);
  assert.equal(edge.w.territory[edge.g.id].owner, 1);
  const open = pocket(x => x.mirror && x.role === 'fort');
  open.w.territory[open.g.neighbors[0]].owner = -1; relink(open.w);
  run(open.w, 61);
  assert.equal(open.w.territory[open.g.id].owner, 0);
  assert.equal(open.w.territory[open.g.id].siege, 0);
});

test('다시 이어지면 시계 0', () => {
  const { w, g } = pocket(x => x.mirror && x.role === 'fort');
  run(w, 30);
  for (const r of w.map.regions) if (!r.mirror) { w.territory[r.id].owner = 0; w.territory[r.id].hold = 1; }
  for (const n of g.neighbors) { w.territory[n].owner = 0; }
  relink(w);
  run(w, 1);
  assert.equal(w.territory[g.id].siege, 0);
});
