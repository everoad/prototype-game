// 수호자 + 장면(다섯 번째 판 — ?boss=ranged2, sim/brain.js가 sim/siege.js의 장면을 끼워 넣는다). 사용자 2026-11-19:
//  "신규 보스 패턴이랑 수호자를 섞으면 좋을 거 같아 — 수호자에 신규 패턴을 섞는 거지."
// 여기서는 판정만 본다: 큰 판 · 수호자의 여느 싸움(여는 순서 · 탄 패턴 · 장판 · 돌진 · 근접 · 바탕 탄막) 사이에 장면이 혼자 끼어드는 차례 · 그로기와 단계 넘어감 · 빨간 예산.
// 장면 하나하나의 판정은 siege.test.mjs가 본다. 지금의 수호자 · 용 · 나는 용 · 포격수는 한 틱도 바뀌지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash, BOSSES } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { addStagger } from '../src/sim/boss.js';
import { redOk } from '../src/sim/bossCore.js';
import { createBot } from '../src/sim/bot.js';
import { idle } from './helpers.mjs';
import { MODE_GROUPS, readModes, modeQuery } from '../src/view/modes.js';
import { worldOptions } from '../src/view/query.js';

const M = RULES.mix, S = RULES.siege, B = RULES.brain, dt = RULES.dt;
const open = (o = {}) => createWorld({ boss: 'ranged2', store: true, ...o });
const alive = w => { w.player.hp = RULES.player.hp; return idle; };   // 시험이 보는 것은 차례와 판정 — 죽지 않게
// 그 사건이 나올 때까지 돈다(나온 사건을 돌려준다). 못 만나면 실패. seen = 그동안의 사건을 모은다.
function until(w, type, { maxSec = 60, seen = null } = {}) {
  for (let k = 0; k < maxSec / dt; k++) {
    step(w, alive(w));
    const ev = drainEvents(w);
    if (seen) seen.push(...ev);
    const hit = ev.find(e => (typeof type === 'function' ? type(e) : e.type === type));
    if (hit) return hit;
  }
  assert.fail(`${type} 사건이 ${maxSec}초 안에 나오지 않았다`);
}
function runFor(w, sec, seen = null) {
  for (let k = 0; k < Math.round(sec / dt); k++) { step(w, alive(w)); const ev = drainEvents(w); if (seen) seen.push(...ev); }
}
// 2단계로 연 판(여는 순서가 없다)에서 그 장면만 바로 보게: 차례를 그 장면 하나로
const only = (name, o = {}) => { const w = open({ phase: 2, ...o }); w.boss.queue = [name]; return w; };
const SCENE_SRC = new Set([RULES.src.walls, RULES.src.bombs, RULES.src.whirl, RULES.src.shells, RULES.src.pounce]);

test('큰 판에서 여는 수호자: 몸 · 두뇌는 수호자의 것이고 판만 넓다 — 다른 판과 바탕 규칙은 그대로다', () => {
  assert.ok(BOSSES.includes('ranged2'));
  const w = open();
  assert.ok(w.boss.mix && !w.boss.siege && !w.boss.wyrm);
  assert.notEqual(w.boss.kind, 'dragon');
  assert.deepEqual(w.rules.board, M.board);
  assert.ok(M.board.hx >= 16 && M.board.hz >= 11, '판이 넓다');
  assert.equal(w.boss.maxHp, M.hp * RULES.store.bossHp);
  assert.equal(w.rules.brain, RULES.brain, '두뇌의 수치는 수호자의 것 그대로');
  assert.equal(w.rules.siege, RULES.siege, '장면의 수치는 포격수의 것 그대로');
  const d = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
  assert.ok(d >= B.keep[0] && d <= 14, '여는 순서는 수호자의 거리에서');
  assert.deepEqual(RULES.board, { hx: 10, hz: 7 }, '바탕 규칙은 그대로');
  const plain = createWorld({});
  assert.equal(plain.rules, RULES);
  assert.ok(!plain.boss.mix && plain.boss.act === undefined && plain.boss.queue === undefined, '지금의 수호자는 장면을 모른다');
  assert.equal(plain.boss.maxHp, RULES.boss.hp);
  assert.ok(!createWorld({ boss: 'ranged2', stage: 1 }).boss.mix, '스테이지는 지금 그대로');
  assert.ok(!createWorld({ boss: 'ranged2', lab: 'parry' }).boss.mix, '연습 장면도 지금 그대로');
  assert.ok(!createWorld({ boss: 'siege' }).boss.mix);
  for (const n of M.cycle) assert.ok(['walls', 'chain', 'whirl', 'shells', 'bombs'].includes(n), n);
  assert.equal(new Set(M.cycle).size, 5, '새 장면 다섯이 다 들어 있다(덮치기는 수호자의 돌진 · 박치기와 겹쳐 뺐다)');
});

test('여는 순서는 수호자 그대로(흰 탄 → 빨간 창 → 박치기 → 다가오기)이고, 그 뒤에 첫 장면이 나온다', () => {
  const w = open(), seen = [];
  const first = until(w, 'siegeScene', { maxSec: 30, seen });
  assert.equal(first.name, M.cycle[0]);
  assert.equal(w.boss.opening, B.opening.length, '여는 순서를 다 한 뒤');
  const ids = seen.filter(e => e.type === 'windup' && e.kind === 'pattern').map(e => e.id);
  assert.deepEqual(ids.slice(0, 2), [1, 3]);
  assert.ok(seen.some(e => e.type === 'meleeStart' || e.type === 'comboStart' || e.type === 'rushStart' || e.type === 'rush'), '다가와 근접까지 하고 나서');
  assert.ok(first.t > 4, '판을 열자마자 나오지 않는다');
});

test('차례: 장면은 정해진 순서로 돌고, 장면 사이마다 every초 넘게 수호자의 여느 공격이 있다', () => {
  const w = open(), seen = [];
  runFor(w, 150, seen);
  const names = seen.filter(e => e.type === 'siegeScene').map(e => e.name);
  assert.ok(names.length >= M.cycle.length + 2, `장면 ${names.length}번`);
  names.forEach((n, k) => assert.equal(n, M.cycle[k % M.cycle.length], `${k}번째 장면`));
  // 장면이 끝난 뒤 다음 장면까지: every초 넘게, 그 사이에 수호자의 공격(준비 · 근접)이 적어도 하나
  let end = null, between = 0;
  for (const e of seen) {
    if (e.type === 'sceneEnd') { end = e.t; between = 0; assert.equal(e.dropped, false); }
    else if (end != null && (e.type === 'windup' || e.type === 'meleeStart')) between++;
    else if (e.type === 'siegeScene' && end != null) {
      assert.ok(e.t - end >= M.every[0] - 1e-6, `장면 사이 ${(e.t - end).toFixed(2)}초`);
      assert.ok(between >= 1, '장면 사이에 수호자의 공격이 있다');
      end = null;
    }
  }
  assert.equal(seen.filter(e => e.type === 'sceneEnd').length >= names.length - 1, true);
});

test('장면은 혼자 나온다: 앞 패턴의 꼬리가 끝난 뒤에 시작하고, 하는 동안 수호자의 탄 패턴 · 바탕 탄막 · 구슬은 쉰다', () => {
  for (const phase of [1, 2]) {
    const w = open({ phase });
    let inScene = false, scenes = 0;
    for (let k = 0; k < 90 / dt; k++) {
      step(w, alive(w));
      for (const e of drainEvents(w)) {
        if (e.type === 'siegeScene') { inScene = true; scenes++; assert.equal(w.boss.runs.length, 0, '앞 패턴의 꼬리가 없다'); assert.equal(w.lanes.length, 0); }
        else if (e.type === 'sceneEnd') inScene = false;
        else if (inScene && e.type === 'fire') assert.ok(SCENE_SRC.has(e.src), `장면 중의 탄 출처 ${e.src}`);
        else if (inScene && e.type === 'orbFire') assert.fail('장면 중에 구슬이 쐈다');
        else if (inScene && e.type === 'windup') assert.ok(['walls', 'bombs', 'whirl', 'shells', 'wave'].includes(e.kind), `장면 중의 준비 ${e.kind}`);
      }
      if (inScene) assert.ok(w.boss.act, '장면 중에는 하는 장면이 있다');
    }
    assert.ok(scenes >= 4, `${phase}단계 장면 ${scenes}번`);
  }
});

test('장면을 하는 동안 수호자는 제자리 — 도약(회오리 · 포격전)만 몸을 옮긴다', () => {
  const w = only('bombs');
  until(w, 'siegeBombs');
  const x = w.boss.x, z = w.boss.z;
  until(w, 'bombsBlast');
  assert.ok(Math.hypot(w.boss.x - x, w.boss.z - z) < 1e-9);
  const w2 = only('whirl');
  const e = until(w2, 'siegeLeap');
  assert.ok(Math.abs(e.tx) < 1e-9 && Math.abs(e.tz) < 1e-9, '회오리는 판 가운데로 뛴다');
  runFor(w2, e.sec / 2);
  assert.ok(w2.boss.lift && w2.boss.alt > 1, '뛰는 동안 몸이 뜬다');
  const wh = until(w2, 'siegeWhirl');
  assert.equal(wh.arms, S.whirl.arms[1], '2단계의 수치를 쓴다');
  assert.ok(Math.hypot(w2.boss.x, w2.boss.z) < 1e-9 && w2.boss.alt === 0 && !w2.boss.lift);
});

test('포격전: 멀리 물러나 벽을 쏘고, 끝나면 수호자가 곧바로 달려든다(벌린 거리를 제 손으로 좁힌다)', () => {
  assert.deepEqual(M.rushAfter, ['walls']);
  const w = only('walls', { phase: 1 });
  w.boss.opening = B.opening.length;
  const seen = [];
  const leap = until(w, 'siegeLeap', { seen });
  assert.ok(Math.hypot(leap.tx - w.player.x, leap.tz - w.player.z) >= 14, '멀리');
  until(w, 'sceneEnd', { seen });
  assert.equal(seen.filter(e => e.type === 'siegeWall').length, S.walls.n[0]);
  assert.equal(w.boss.state, 'idle');
  assert.equal(w.boss.act, null);
  const far = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
  assert.ok(far > B.far, '아직 멀다');
  const after = [];
  until(w, 'rushStart', { maxSec: 2, seen: after });
  assert.ok(!after.some(e => e.type === 'windup' && e.kind === 'pattern'), '탄 패턴을 끼우지 않고 바로');
  until(w, 'rushArrive', { maxSec: 3 });
  assert.ok(Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) < 4, '곁에 와 있다');
  // 내가 이미 다가가 있으면(가까움) 달려들 것이 없다 — 가까울 때의 공격(근접 · 파도)을 한다
  const w2 = only('walls', { phase: 1 });
  w2.boss.opening = B.opening.length;
  until(w2, 'siegeWall');
  w2.player.x = w2.boss.x - Math.sign(w2.boss.x || 1) * 3; w2.player.z = w2.boss.z;
  until(w2, 'sceneEnd');
  const next = until(w2, e => e.type === 'rushStart' || e.type === 'meleeStart' || (e.type === 'windup' && e.kind !== 'walls'), { maxSec: 3 });
  assert.notEqual(next.type, 'rushStart');
  // 다른 장면 뒤에는 수호자가 여느 때처럼 고른다(달려들기를 정해 두지 않는다)
  const w3 = only('bombs', { phase: 1 });
  w3.boss.opening = B.opening.length;
  until(w3, 'sceneEnd');
  assert.ok(!w3.boss.chase);
});

test('그로기: 하던 장면을 거두고, 깨어나면 여느 싸움부터 — 다음 장면은 차례의 다음 것', () => {
  const w = only('bombs'), b = w.boss;
  b.queue = ['bombs', 'chain'];
  until(w, 'siegeBombs');
  assert.ok(w.floorAreas.some(a => a.kind === 'bomb'));
  addStagger(w, RULES.stagger.max);
  const seen = [];
  runFor(w, 0.05, seen);
  assert.equal(b.state, 'groggy');
  assert.equal(b.act, null);
  assert.ok(!w.floorAreas.some(a => a.kind === 'bomb'), '깔린 원을 거둔다');
  assert.ok(seen.some(e => e.type === 'sceneEnd' && e.dropped && e.name === 'bombs'));
  assert.ok(!seen.some(e => e.type === 'bombsBlast'));
  const t0 = w.time, seen2 = [];
  const next = until(w, 'siegeScene', { seen: seen2 });
  assert.equal(next.name, 'chain');
  assert.ok(next.t - t0 >= M.every[1] - 1e-6, '깨어나자마자 장면이 오지 않는다');
  assert.ok(seen2.some(e => e.type === 'windup' || e.type === 'meleeStart'), '그 사이에 여느 공격');
  // 뛰는 중의 그로기는 내려앉은 뒤에
  const w2 = only('whirl');
  const e = until(w2, 'siegeLeap');
  runFor(w2, e.sec / 2);
  addStagger(w2, RULES.stagger.max);
  runFor(w2, 2 * dt);
  assert.equal(w2.boss.state, 'leap');
  runFor(w2, e.sec / 2 + 0.05);
  assert.equal(w2.boss.state, 'groggy');
  assert.ok(w2.boss.alt === 0 && !w2.boss.lift && w2.boss.act === null);
});

test('단계 넘어감: 하던 장면을 거두고 2단계로 — 차례는 잇는다', () => {
  const w = open(), b = w.boss, seen = [];
  const first = until(w, 'siegeScene', { seen });
  b.hp = b.maxHp * B.phaseAt - 1;
  runFor(w, 0.05, seen);
  assert.equal(b.phase, 2);
  assert.equal(b.state, 'phaseChange');
  assert.equal(b.act, null);
  assert.ok(seen.some(e => e.type === 'sceneEnd' && e.dropped && e.name === first.name));
  assert.ok(seen.some(e => e.type === 'phase' && e.n === 2));
  assert.equal(w.floorAreas.length, 0);
  const next = until(w, 'siegeScene');
  assert.equal(next.name, M.cycle[1]);
});

test('빨간 예산: 장면의 빨강(고리 · 폭탄 밭 · 포탄)도 수호자의 예산에 적힌다 — 장면 바로 뒤에는 빨간 장판이 오지 않는다', () => {
  const w = only('chain', { phase: 1 }), b = w.boss;
  b.opening = B.opening.length;
  const seen = [];
  until(w, 'sceneEnd', { seen });
  const reds = seen.filter(e => e.type === 'waveStart' && e.color === 'red');
  assert.equal(reds.length, 2);
  for (const r of reds) assert.ok(b.redTimes.some(t => Math.abs(t - r.t) < 1e-6), '빨간 고리의 시각이 적혀 있다');
  assert.equal(redOk(w, w.time + 0.5), false, '예산이 찼다');
  assert.equal(redOk(w, w.time + 2 * RULES.floor.redWindow + 1), true, '창이 지나면 다시 된다');
  const w2 = only('bombs', { phase: 1 });
  w2.boss.opening = B.opening.length;
  const blast = until(w2, 'bombsBlast');
  assert.ok(w2.boss.redTimes.some(t => Math.abs(t - blast.t) < 1e-6));
  // 포격수는 예산을 쓰지 않는다(지금 그대로)
  const w3 = createWorld({ boss: 'siege', store: true });
  w3.boss.queue = ['chain'];
  const seen3 = [];
  until(w3, e => e.type === 'siegeScene' && e.name !== 'chain', { seen: seen3 });
  assert.equal(seen3.filter(e => e.type === 'waveStart' && e.color === 'red').length, 2);
  assert.equal(w3.boss.redTimes.length, 0);
});

test('같은 씨앗이면 같은 판이고, 봇이 끝까지 한다 — 탄 수는 넘치지 않는다', () => {
  const play = (seed, char) => {
    const w = open({ seed, char }), bot = createBot('user', seed), names = [];
    let most = 0;
    for (let k = 0; k < 60 / dt && !w.result; k++) {
      step(w, bot(w));
      for (const e of drainEvents(w)) if (e.type === 'siegeScene') names.push(e.name);
      most = Math.max(most, w.bullets.live);
    }
    return { hash: stateHash(w), names, most, w };
  };
  const a = play(3, 'sword'), b = play(3, 'sword'), c = play(4, 'sword'), g = play(3, 'gunner');
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  for (const r of [a, c, g]) {
    assert.ok(r.names.length >= 3, `장면 ${r.names.length}번`);
    assert.ok(r.most < RULES.bullets.cap * 0.9, `탄 ${r.most}`);
    assert.ok(Number.isFinite(r.w.player.x + r.w.boss.x + r.w.boss.hp));
  }
  assert.match(a.hash, /\|x/, '장면의 상태가 해시에 들어 있다');
  assert.doesNotMatch(stateHash(createWorld({ seed: 3 })), /\|x/);
});

test('판 고르기: "보스전 — 수호자 + 새 패턴"이 목록에 있고 주소와 오간다', () => {
  const board = MODE_GROUPS.find(g => g.id === 'board');
  assert.ok(board.items.some(i => i[0] === 'ranged2'));
  const sel = readModes(new URLSearchParams('boss=ranged2&char=sword'));
  assert.equal(sel.board, 'ranged2');
  assert.equal(modeQuery(sel), 'boss=ranged2&char=sword');
  assert.equal(worldOptions(new URLSearchParams(modeQuery(sel))).boss, 'ranged2');
  assert.equal(modeQuery({ ...sel, char: 'gunner', gear: 'all' }), 'boss=ranged2&gear=all', '보스전이라 무기 고르기가 듣는다');
  assert.equal(readModes(new URLSearchParams('')).board, 'boss');
});
