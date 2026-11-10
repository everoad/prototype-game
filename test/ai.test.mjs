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
import { spawn as spawnG, STATE as STATEG, kill as killG, GOAL as GOALG } from '../src/sim/soldiers.js';
import { ARCHER as ARCHERG, INFANTRY as INFANTRYG } from '../src/sim/rules.js';
import { makeAi as makeAiG, raidTarget } from '../src/sim/ai.js';
import { makeRng as makeRngG } from '../src/sim/rng.js';
import { makeBot } from '../src/sim/bots.js';
import { SIEGE as SIEGEG, CAVALRY as CAVALRYG } from '../src/sim/rules.js';
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
  for (const st of w.strongholds) if (st.kind === 'land' && st.side === 0) { st.owner = 1; st.gauge = -100; }   // 기습할 땅이 없게(땅 목표면 공성병을 안 산다 — 작은 땅 2026-11-09)
  Object.assign(ai.state.raid, { phase: 'wait', at: w.time });  // 지금 기습을 모으기 시작
  w.sides[1].gold = 0;
  castsDuring(w, 2, 1);
  assert.equal(ai.state.raid.phase, 'gather', '모으는 중');
  w.sides[1].gold = 160;                                         // 공성병 값(150)이 막 될 만큼 — 건물이 먼저 쓰면 못 산다
  let bought = false;
  for (let k = 0; k < 40 && !bought; k++) { stepG(w); bought = w.events.some(e => e.kind === 'siegeBuy' && e.side === 1); }
  assert.ok(bought, '공성병을 샀다');
});

// ---- 작은 땅(계획서 2026-11-09-flood-small-lands Task 3) ----
const sendsTo = (w, sec, side) => { const out = []; for (let k = 0; k < Math.round(sec * 20); k++) { stepG(w); for (const e of w.events) if (e.kind === 'send' && e.side === side) out.push(e.target?.id); } return out; };

test('AI는 판 초반에 길목을 먹으러 보낸다', () => {
  const w = createWorldG({ seed: 1, scenario: 'battle' });
  w.controllers[1] = makeAiG(1, { personality: 'careful' }, makeRngG(3));
  const to = sendsTo(w, 40, 1);
  assert.ok(to.includes('cL') || to.includes('cR'), JSON.stringify(to));
});

test('AI는 땅 경보에 막아라가 아니라 가까운 거점에서 보낸다', () => {
  const w = aiOnSide1();
  blockG(w, 20, 77, 577);                                        // 우리 보병이 적 가장자리 땅 e1L(80,580)에
  const r1L = w.strongholds.find(x => x.id === 'r1L'), ids = blockG(w, 60, r1L.x - 7, r1L.z - 3, { side: 1, cols: 10 });
  setGoalG(w, ids, { kind: 'stronghold', id: 'r1L' });           // r1L에 서 있는 병력(수비대 아님)
  let held = 0; const to = [];
  for (let k = 0; k < 6 * 20; k++) { stepG(w); for (const e of w.events) { if (e.kind === 'send' && e.side === 1) to.push(e.target?.id); if (e.kind === 'rejected' && e.order.kind === 'holdTheLine' && e.order.side === 1) held++; } }
  assert.ok(to.includes('e1L'), JSON.stringify(to));
  assert.equal(held, 0, '땅에 막아라를 걸지 않는다');
});

test('AI 기습 후보에 땅이 들어간다', () => {
  const w = createWorldG({ seed: 1, scenario: 'battle' });
  const ai = makeAiG(1, { personality: 'raider' }, makeRngG(3));
  w.controllers[1] = ai; stepG(w);
  const plan = raidTarget(w, ai.state, w.strongholds.find(x => x.id === 'r1L'));
  assert.equal(plan?.st.kind, 'land', JSON.stringify(plan && plan.st.id));
});

// ---- 작은 땅 최종 검토에서 고친 것 ----
// 병사가 가는 거점 id: 행군 쐐기에 있으면 쐐기의 목표, 아니면 자기 목표(거점일 때)
const headingTo = (w, i) => { const s = w.soldiers; if (s.group[i] >= 0) { const g = w.groups.find(x => x.id === s.group[i]); return g?.target?.kind === 'stronghold' ? g.target.id : null; } return s.goalKind[i] === 2 ? w.strongholds[s.goalId[i]]?.id : null; };
const goalIs = (w, ids, id) => ids.filter(i => w.soldiers.alive[i] && headingTo(w, i) === id);
const standAt = (w, id, n) => { const st = w.strongholds.find(x => x.id === id), ids = blockG(w, n, st.x - 7, st.z - 3, { side: 1, cols: 10 }); setGoalG(w, ids, { kind: 'stronghold', id }); return ids; };

test('AI 땅 지키기는 기습을 모으는 거점의 병력을 빼 가지 않는다', () => {
  const w = aiOnSide1(); stepG(w);
  const ai = w.controllers[1];
  Object.assign(ai.state.raid, { phase: 'gather', source: 'r1L', since: w.time, want: 9999, siegeDone: true, land: false });
  const raiders = standAt(w, 'r1L', 60), others = standAt(w, 'f1L', 60);
  blockG(w, 20, 77, 577);                                        // 우리 보병이 e1L에
  for (let k = 0; k < 6 * 20; k++) stepG(w);
  assert.equal(goalIs(w, raiders, 'e1L').length, 0, '기습 거점 병력은 그대로');
  assert.ok(goalIs(w, others, 'e1L').length > 0, '다른 거점에서 간다');
});

test('AI가 한 판단에 두 땅을 지키면 같은 병사를 두 번 보내지 않는다', () => {
  const w = aiOnSide1();
  const cL = w.strongholds.find(x => x.id === 'cL'); cL.owner = 1; cL.gauge = -100;
  const near = standAt(w, 'r1L', 60); standAt(w, 'f1L', 60);
  blockG(w, 20, 77, 577); blockG(w, 20, 77, 397);               // e1L과 cL에 동시에
  for (let k = 0; k < 6 * 20; k++) stepG(w);
  const s = w.soldiers, toE = [], toC = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 1) { const h = headingTo(w, i); if (h === 'e1L') toE.push(i); if (h === 'cL') toC.push(i); }
  assert.ok(toE.length > 0 && toC.length > 0, `e1L ${toE.length}명, cL ${toC.length}명`);
  void near;
});

test('땅용으로 모은 기습은 보낼 때 거점으로 목표를 바꾸지 않는다', () => {
  const w = createWorldG({ seed: 1, scenario: 'battle' });
  const ai = makeAiG(1, { personality: 'raider' }, makeRngG(3));
  w.controllers[1] = ai; stepG(w);
  const src = w.strongholds.find(x => x.id === 'r1L');
  assert.ok(raidTarget(w, ai.state, src, { land: true }).st.kind === 'land');
  for (const st of w.strongholds) if (st.kind === 'land' && st.side === 0) { st.owner = 1; st.gauge = -100; }   // 칠 적 땅이 없다
  assert.equal(raidTarget(w, ai.state, src, { land: true }), null, '땅 기습이면 땅만 고른다');
  assert.notEqual(raidTarget(w, ai.state, src, { land: false })?.st.kind, 'land');
});

// ---- 리뷰에서 미룬 작은 것(2026-11-09) ----
const levyFoes = w => { const st = w.strongholds.find(x => x.id === 'f1L'); blockG(w, 200, st.x - 14, st.z - 7, { cols: 20 }); };

test('AI 긴급 징집은 안 보이는 적을 세지 않는다', () => {
  const w = aiOnSide1();
  w.rules.vision.stronghold = 1; w.rules.vision.soldier = 1;     // 거점·병사 시야를 거의 없앤다 — 가운데 칸 밖 적이 안 보인다
  const st = w.strongholds.find(x => x.id === 'f1L');
  blockG(w, 200, st.x + 20, st.z - 7, { cols: 20 });             // 원 안, 가운데 8 m 칸 밖
  assert.ok(!castsDuring(w, 6, 1).includes('levy'));
});

test('AI가 기습용 공성 값을 잡아 둔 동안에도 긴급 징집은 쓴다', () => {
  const w = aiOnSide1(); stepG(w);
  const ai = w.controllers[1];
  Object.assign(ai.state.raid, { phase: 'gather', source: 'r1L', since: w.time, want: 9999, siegeDone: false, land: false });
  w.sides[1].gold = w.rules.orders.levy.cost + 10;               // 징집은 되고 공성(150)까지는 안 되는 금
  levyFoes(w);
  assert.ok(castsDuring(w, 6, 1).includes('levy'));
});

test('AI는 한 판단에 강행군을 한 번만 건다(거절될 두 번째에 금을 잡지 않는다)', () => {
  const w = aiOnSide1();
  const cL = w.strongholds.find(x => x.id === 'cL'); cL.owner = 1; cL.gauge = -100;
  standAt(w, 'r1L', 60); standAt(w, 'f1L', 60);
  blockG(w, 20, 77, 577); blockG(w, 20, 77, 397);                // e1L과 cL에 동시에(땅 지키기 둘)
  const ai = w.controllers[1], per = [];
  w.controllers[1] = { think: ww => { const o = ai.think(ww); per.push(o.filter(x => x.kind === 'cast' && x.order === 'march').length); return o; } };
  for (let k = 0; k < 6 * 20; k++) stepG(w);
  assert.ok(Math.max(...per) <= 1, JSON.stringify(per.filter(Boolean)));
});

test('AI 몰림 판단은 공성병 무게까지 더한 전체에서 본다', () => {
  const w = aiOnSide1();
  for (const st of w.strongholds) if (st.owner === 1 && st.kind !== 'land') { blockG(w, 12, st.x - 7, st.z - 50, { type: CAVALRYG }); blockG(w, 120, st.x - 14, st.z - 60, { type: SIEGEG, cols: 20 }); }
  for (let i = 0; i < w.soldiers.count; i++) if (w.soldiers.side[i] === 0) w.soldiers.hp[i] = 1e6;
  w.rules.units[0][CAVALRYG].speed = 0; w.rules.units[0][SIEGEG].speed = 0;
  for (let k = 0; k < 40 * 20; k++) stepG(w);
  assert.notEqual(w.controllers[1].state.counterType, CAVALRYG, '공성병이 대부분인데 기병 몰림으로 봤다');
});

test('거북이 봇은 보내지 않으니 강행군도 걸지 않는다', () => {
  const w = aiOnSide1();
  w.controllers[1] = makeBot('turtle', 1, makeRngG(3));
  standAt(w, 'r1L', 60); standAt(w, 'f1L', 60);
  blockG(w, 20, 77, 577);                                        // e1L 경보 → 땅 지키기
  assert.ok(!castsDuring(w, 6, 1).includes('march'));
});

test('AI는 맞붙은 우리가 밀리는 곳에 돌격 북을 쓴다', () => {
  const w = createWorldG({ scenario: 'empty', seed: 1, knobs: { mirror: true, scale: 0.2 } });   // 규모 0.2 → 맞붙은 우리 20명 넘으면
  w.controllers[1] = makeAiG(1, { personality: 'careful' }, makeRngG(3)); w.sides[1].gold = 2000;
  blockG(w, 40, 600, 500, { side: 1 });
  blockG(w, 120, 597, 502.5, { side: 0, cols: 15 });
  assert.ok(castsDuring(w, 4, 1).includes('drum'));
});

test('AI는 모은 기습을 보낼 때 강행군을 건다', () => {
  const w = createWorldG({ seed: 1, scenario: 'battle' });
  const ai = makeAiG(1, { personality: 'raider' }, makeRngG(3));
  w.controllers[1] = ai; stepG(w);
  w.sides[1].gold = 1000;
  Object.assign(ai.state.raid, { phase: 'gather', source: 'r1L', since: w.time, want: 1, siegeDone: true, land: false });
  standAt(w, 'r1L', 30);
  const cast = castsDuring(w, 3, 1);
  assert.ok(cast.includes('march'), JSON.stringify(cast));
});

// ---- 투석기(계획서 2026-11-09-flood-catapult Task 4) ----
test('AI는 자기 거점을 치는 적 투석기에 병력을 보낸다(쏜 투석기는 3초 동안 보인다)', () => {
  const w = aiOnSide1(), s = w.soldiers;
  const f = w.strongholds.find(x => x.id === 'f1L'); f.slots[f.slotCount] = { kind: 'wall', level: 1, hp: w.rules.buildings.wall.hp, building: false };
  standAt(w, 'r1L', 60); standAt(w, 'f1L', 60);
  const cats = [];
  for (let k = 0; k < 3; k++) { const i = spawnG(s, 0, SIEGEG, f.x - 3 + k * 3, f.z - 115, w.rules); setGoalG(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); cats.push(i); }
  let hunted = false;
  for (let k = 0; k < 6 * 20 && !hunted; k++) { stepG(w); hunted = w.events.some(e => e.kind === 'send' && e.side === 1 && e.target?.kind === 'foe' && cats.includes(e.target.id)); }
  assert.ok(hunted, '투석기로 보낸 AI 병력이 없다');
});

test('AI가 투석기를 잡은 뒤 남은 병력은 거점으로 돌아간다', () => {
  const w = aiOnSide1(), s = w.soldiers;
  const f = w.strongholds.find(x => x.id === 'f1L'); f.slots[f.slotCount] = { kind: 'wall', level: 1, hp: w.rules.buildings.wall.hp, building: false };
  standAt(w, 'r1L', 60); standAt(w, 'f1L', 60);
  const cats = [];
  for (let k = 0; k < 3; k++) { const i = spawnG(s, 0, SIEGEG, f.x - 3 + k * 3, f.z - 115, w.rules); setGoalG(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); cats.push(i); }
  const ai = w.controllers[1]; let hunters = null;
  w.controllers[1] = { think: ww => { const o = ai.think(ww); for (const x of o) if (x.kind === 'send' && x.target?.kind === 'foe' && !hunters) hunters = x.from.ids; return o; } };
  for (let k = 0; k < 6 * 20 && !hunters; k++) stepG(w);
  assert.ok(hunters, '투석기로 보냈다');
  for (const i of cats) killG(s, i);
  for (let k = 0; k < 10 * 20; k++) stepG(w);
  const home = hunters.filter(i => s.alive[i] && (s.goalKind[i] === GOALG.STRONGHOLD || (s.group[i] >= 0 && w.groups.find(g => g.id === s.group[i])?.target.kind === 'stronghold')));
  assert.ok(home.length >= hunters.filter(i => s.alive[i]).length * 0.8, `거점으로 가는 병력 ${home.length}/${hunters.filter(i => s.alive[i]).length}`);
});

// ---- AI 투석기 쓰기(2026-11-09 사용자 "쓰게 해줘"): 기습 두 번에 한 번은 거점, 투석기는 먼저 출발 ----
function raidAt(raidNo, prep) {
  const w = createWorldG({ seed: 1, scenario: 'battle' });
  const ai = makeAiG(1, { personality: 'raider' }, makeRngG(3));
  w.controllers[1] = ai; stepG(w);
  prep?.(w);
  ai.state.raidNo = raidNo;
  Object.assign(ai.state.raid, { phase: 'wait', at: w.time });
  return { w, ai };
}

test('AI 기습은 두 번에 한 번 거점을 노린다(칠 땅이 있어도)', () => {
  const go = n => { const { w, ai } = raidAt(n); for (let k = 0; k < 40 && ai.state.raid.phase !== 'gather'; k++) stepG(w); return ai.state.raid; };
  const a = go(0), b = go(1);
  assert.equal(a.phase, 'gather'); assert.equal(a.land, true, '첫 기습은 땅');
  assert.equal(b.phase, 'gather'); assert.equal(b.land, false, '두 번째는 거점');
});

test('AI 거점 기습: 산 투석기가 나오면 본대보다 먼저 목표 거점으로 보낸다', () => {
  const { w, ai } = raidAt(1, ww => { for (const st of ww.strongholds) if (st.kind === 'land' && st.side === 0) { st.owner = 1; st.gauge = -100; } ww.sides[1].gold = 1000; });
  const log = [];
  w.controllers[1] = { think: ww => { const o = ai.think(ww); for (const x of o) if (x.kind === 'send') log.push({ t: ww.time, x, siege: x.from.kind === 'ids' && x.from.ids.every(i => ww.soldiers.type[i] === SIEGEG) }); return o; } };
  for (let k = 0; k < 60 * 20; k++) stepG(w);
  const cat = log.find(e => e.siege), body = log.find(e => e.x.from.kind === 'stronghold' && e.x.target.kind === 'stronghold');
  assert.ok(cat, `투석기를 따로 보내지 않았다: ${JSON.stringify(log.map(e => [Math.round(e.t), e.x.from.kind, e.x.target.kind]))}`);
  assert.equal(cat.x.target.kind, 'stronghold');
  assert.ok(!body || body.t > cat.t + 1, '본대는 그 뒤에 떠난다');
});

