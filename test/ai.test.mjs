// 적 AI(계획서 Task 14, 사용자 2026-11-07 "A: 이대로"로 고친 안): 계획 유지, 상성 건물은 30초 본 뒤, 막아라, 기습 보내기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSeconds, aiBattle, arrowsOf, aiWatchWorld, showCavalry, hasBuilding, aiDefenseWorld, enemyWeightAt, holdingAt, sendsDuring } from './helpers.mjs';

test('흐름 계획은 정한 뒤 45초 안에는 바꾸지 않는다', () => {
  const { w } = aiBattle(0.1, 3);
  runSeconds(w, 10);
  const first = arrowsOf(w, 1);
  assert.ok(Object.keys(first).length >= 4, `화살표 ${JSON.stringify(first)}`);
  runSeconds(w, 30);
  assert.deepEqual(arrowsOf(w, 1), first);
});

test('우리 기병을 30초 넘게 본 뒤에야 창 막사를 짓는다', () => {
  const { w } = aiWatchWorld();
  showCavalry(w, 100);
  runSeconds(w, 20);
  w.sides[1].gold = 400;
  runSeconds(w, 1);
  assert.equal(hasBuilding(w, 1, 'pikes'), false, '20초 만에는 바꾸지 않는다');
  runSeconds(w, 10);
  w.sides[1].gold = 400;
  runSeconds(w, 2);
  assert.equal(hasBuilding(w, 1, 'pikes'), true, '31초 넘게 보면 창 막사');
});

test('수비대로 못 막는 기습은 막아라, 수비대로 되는 것은 그냥 둔다', () => {
  const small = aiDefenseWorld();
  runSeconds(small.w, 1);
  enemyWeightAt(small.w, 'r1L', 20, 10);
  runSeconds(small.w, 4);
  assert.equal(holdingAt(small.w, 1, 'r1L'), false, '무게 10은 수비대(60)로 된다');

  const big = aiDefenseWorld();
  runSeconds(big.w, 1);
  enemyWeightAt(big.w, 'r1L', 20, 400);
  runSeconds(big.w, 4);
  assert.equal(holdingAt(big.w, 1, 'r1L'), true, '무게 400이면 막아라');
});

test('기습꾼 AI는 때가 되면 병력을 모았다가 우리 거점으로 보낸다', () => {
  const { w, ai } = aiBattle(0.1, 5, 'raider');
  runSeconds(w, 1);                                            // 첫 생각에서 기습 때를 정한다
  const due = ai.state.raid.at;
  assert.ok(due >= 0.6 * 180 - 1e-9 && due <= 0.6 * 300 + 1e-9, `첫 기습 때 ${due}`);
  const sends = sendsDuring(w, 1, due + w.rules.ai.raidGatherMax + 20);
  const raid = sends.find(e => e.from.kind === 'stronghold' && e.targetOwner === 0);   // 구역 깃발에서 미는 것(밀어 넣기)은 기습이 아니다
  assert.ok(raid, `우리 거점으로 간 보내기가 없다: ${JSON.stringify(sends.map(e => [Math.round(e.t), e.from.id, e.target.id]))}`);
  assert.ok(raid.t >= due, `기습 ${raid.t}초 < 정한 때 ${due}`);
});

// ---- 금 명령·공성(계획서 2026-11-09 Task 6) ----
import { createWorld as createWorldG, step as stepG, setGoal as setGoalG } from '../src/sim/world.js';
import { spawn as spawnG, STATE as STATEG } from '../src/sim/soldiers.js';
import { ARCHER as ARCHERG, INFANTRY as INFANTRYG } from '../src/sim/rules.js';
import { makeAi as makeAiG } from '../src/sim/ai.js';
import { makeRng as makeRngG } from '../src/sim/rng.js';
// sec초 동안 그 편이 건 금 명령(사건 — 징집 원은 1초 뒤 지워지므로 w.casts가 아니라 걸음마다 모은다)
const castsDuring = (w, sec, side) => { const out = []; for (let k = 0; k < Math.round(sec * 20); k++) { stepG(w); for (const e of w.events) if (e.kind === 'cast' && e.side === side) out.push(e.order); } return out; };
function blockG(w, n, x, z, { side = 0, type = INFANTRYG, cols = 10 } = {}) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const px = x + (k % cols) * 1.4, pz = z + Math.floor(k / cols) * 1.4, id = spawnG(w.soldiers, side, type, px, pz, w.rules);
    setGoalG(w, [id], { kind: 'point', x: px, z: pz }); w.soldiers.state[id] = STATEG.FRONT; ids.push(id);
  }
  return ids;
}
const aiOnSide1 = () => { const w = createWorldG({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  w.controllers[1] = makeAiG(1, { personality: 'careful' }, makeRngG(3)); w.sides[1].gold = 2000; return w; };   // 첫 생산 건물 넷(약 540)을 짓고도 남게

test('AI는 공격받는 거점이 밀리면 긴급 징집을 쓴다', () => {
  const w = aiOnSide1();
  const st = w.strongholds.find(x => x.id === 'f1L');
  blockG(w, 200, st.x - 14, st.z - 7, { cols: 20 });
  const cast = castsDuring(w, 6, 1);
  assert.ok(cast.includes('levy'), JSON.stringify(cast));
});

test('AI는 서 있는 궁수 앞에 적이 몰리면 화살 비를 쓴다', () => {
  const w = aiOnSide1();
  blockG(w, 30, 600, 500, { side: 1, type: ARCHERG });
  blockG(w, 60, 600, 465, { side: 0, type: INFANTRYG });
  const cast = castsDuring(w, 4, 1);
  assert.ok(cast.includes('volley'), JSON.stringify(cast));
});

test('AI는 기습을 모으는 동안 금을 잡아 두었다가 공성병을 산다', () => {
  const w = createWorldG({ seed: 1, scenario: 'battle' });
  const ai = makeAiG(1, { personality: 'raider' }, makeRngG(3));
  w.controllers[1] = ai;
  stepG(w);                                                      // init
  Object.assign(ai.state.raid, { phase: 'wait', at: w.time });  // 지금 기습을 모으기 시작
  w.sides[1].gold = 0;
  castsDuring(w, 2, 1);
  assert.equal(ai.state.raid.phase, 'gather', '모으는 중');
  w.sides[1].gold = 160;                                         // 공성병 값(150)이 막 될 만큼 — 건물이 먼저 쓰면 못 산다
  let bought = false;
  for (let k = 0; k < 40 && !bought; k++) { stepG(w); bought = w.events.some(e => e.kind === 'siegeBuy' && e.side === 1); }
  assert.ok(bought, '공성병을 샀다');
});
