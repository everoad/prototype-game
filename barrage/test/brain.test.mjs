// Task 9: 보스 두뇌 — 여는 순서, 연달아 금지, 멀면 돌진, 깨어난 뒤 숨, 2단계 새 패턴 하나씩, pattern 옵션.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { addStagger } from '../src/sim/boss.js';
import { idle, ticks } from './helpers.mjs';

// 보스가 생각하는 판. 플레이어는 맞지 않게(두뇌만 본다), 보스 체력은 아주 크게(단계·죽음이 끼지 않게).
function brainWorld(opts = {}) {
  const w = createWorld({ seed: 3, ...opts });
  w.player.invulnUntil = 1e9;
  w.boss.hp = w.boss.maxHp = 1e9;
  return w;
}
// 고른 것 차례: 패턴 준비(windup kind pattern) = 패턴 번호, rushStart = 'rush', 근접 바로 = 'melee'
function play(w, sec, each = null) {
  const picks = [], ev = [];
  for (let k = 0; k < ticks(sec); k++) {
    each?.(w, k);
    step(w, idle);
    for (const e of drainEvents(w)) {
      ev.push(e);
      if (e.type === 'windup' && e.kind === 'pattern') picks.push({ id: e.id, sparse: e.sparse, t: e.t });
      if (e.type === 'rushStart') picks.push({ id: 'rush', t: e.t, combo: e.combo });
      if (e.type === 'meleeStart') picks.push({ id: 'melee', t: e.t });
      if (e.type === 'slamStart') picks.push({ id: 'slam', t: e.t, color: e.color });
      if (e.type === 'windup' && e.kind === 'wave') picks.push({ id: 'wave', t: e.t, color: e.color });
      if (e.type === 'swordStart') picks.push({ id: 'sword', t: e.t, color: e.color });
    }
  }
  return { picks, ev };
}

test('여는 순서: 패턴 1 → 패턴 3 → 흰 박치기 → 다가오기 A', () => {
  const w = brainWorld();
  const { picks, ev } = play(w, 16);
  assert.deepEqual(picks.slice(0, 4).map(p => p.id), [1, 3, 'slam', 'rush']);
  assert.equal(picks[2].color, 'white');
  assert.equal(picks[3].combo, 'A');
  const wu = ev.filter(e => e.type === 'windup' && e.kind === 'pattern');
  assert.deepEqual(wu.slice(0, 2).map(e => e.color), ['white', 'red']);
});

test('같은 공격은 연달아 나오지 않는다', () => {
  const w = brainWorld();
  const { picks } = play(w, 180);
  assert.ok(picks.length > 30, `고른 수 ${picks.length}`);
  for (let k = 1; k < picks.length; k++) assert.notEqual(picks[k].id, picks[k - 1].id, `${k}번째에 ${picks[k].id} 연달아`);
});

test('멀리 2초 넘게 있으면 돌진·박치기가 잦아진다', () => {
  const rushes = place => {
    const w = brainWorld();
    const { picks } = play(w, 60, place);
    return picks.filter(p => p.id === 'rush' || p.id === 'slam').length;
  };
  const far = rushes(w => { w.player.x = w.boss.x > 0 ? -9.5 : 9.5; w.player.z = w.boss.z > 0 ? -6.5 : 6.5; });
  const mid = rushes(w => {
    const a = Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x);
    let x = w.boss.x + Math.cos(a) * 6, z = w.boss.z + Math.sin(a) * 6;
    if (Math.abs(x) > 9.5 || Math.abs(z) > 6.5) { x = w.boss.x - Math.cos(a) * 6; z = w.boss.z - Math.sin(a) * 6; }
    w.player.x = Math.max(-9.5, Math.min(9.5, x)); w.player.z = Math.max(-6.5, Math.min(6.5, z));
  });
  assert.ok(far > mid, `멀리 ${far} vs 6 U ${mid}`);
});

test('그로기에서 깨어난 뒤 1.0초 안에는 공격 준비가 없다', () => {
  const w = brainWorld();
  play(w, 3);
  addStagger(w, 100);
  const { ev } = play(w, RULES.stagger.groggy + 2);
  const end = ev.find(e => e.type === 'groggyEnd');
  assert.ok(end, 'groggyEnd 없음');
  assert.equal(ev.filter(e => e.type === 'wake').length, 1);
  const attacks = ev.filter(e => (e.type === 'windup' || e.type === 'rushStart' || e.type === 'meleeStart') && e.t > ev.find(x => x.type === 'groggy')?.t - 1);
  assert.ok(attacks.every(e => e.t >= end.t + 1.0 - 1e-6 || e.t < ev.find(x => x.type === 'groggy').t), `깨어난 뒤 ${attacks.map(e => (e.t - end.t).toFixed(2))}`);
});

test('2단계: 탄을 지우고 새 패턴을 하나씩 성기게', () => {
  const w = brainWorld();
  play(w, 2);
  w.boss.hp = w.boss.maxHp * RULES.brain.phaseAt - 1;
  const { picks, ev } = play(w, 40);
  const ph = ev.find(e => e.type === 'phase');
  assert.ok(ph && ph.n === 2);
  assert.ok(ev.some(e => e.type === 'clear' && e.r === Infinity && Math.abs(e.t - ph.t) < 0.02));
  const after = picks.filter(p => p.t > ph.t);
  assert.ok(after.length >= 5, `2단계 고르기 ${after.length}`);
  assert.deepEqual([after[0], after[2], after[4]].map(p => [p.id, p.sparse]), [[5, true], [6, true], [7, true]]);
  for (const k of [1, 3]) assert.ok(after[k].id !== 7 && !(typeof after[k].id === 'number' && after[k].sparse), `${k}번째 ${JSON.stringify(after[k])}`);
});

test('pattern 옵션이면 그 패턴만 되풀이', () => {
  const w = brainWorld({ pattern: 4 });
  const { picks } = play(w, 20);
  assert.ok(picks.length >= 4);
  assert.ok(picks.every(p => p.id === 4), JSON.stringify(picks.map(p => p.id)));
});

test('ai가 꺼져 있으면 아무것도 하지 않는다', () => {
  const w = brainWorld({ ai: false });
  const { picks } = play(w, 5);
  assert.equal(picks.length, 0);
});

// ── 원거리 재설계 Task 1: 박자와 움직임
import { clampToBoard as clampB } from '../src/sim/geom.js';
import { PATTERNS as PAT } from '../src/sim/patterns.js';

function trace(w, sec, each = null) {
  const rows = [], ev = [];
  for (let k = 0; k < ticks(sec); k++) {
    const x0 = w.boss.x, z0 = w.boss.z, st = w.boss.state;
    each?.(w, k);
    step(w, idle);
    rows.push({ st, d: Math.hypot(w.boss.x - x0, w.boss.z - z0), t: w.time });
    ev.push(...drainEvents(w));
  }
  return { rows, ev };
}
const speedIn = (rows, st) => { const r = rows.filter(q => q.st === st); return r.reduce((a, q) => a + q.d, 0) / (r.length * RULES.dt || 1); };

test('쏘는 동안에도 보스가 움직인다', () => {
  const w = brainWorld();
  const { rows } = trace(w, 40);
  assert.ok(speedIn(rows, 'pattern') > 0.5, `패턴 중 속도 ${speedIn(rows, 'pattern')}`);
});

test('준비 동안은 절반 빠르기', () => {
  const w = brainWorld({ pattern: 1 });   // 패턴만 되풀이(장판·근접 없음)
  const { rows } = trace(w, 40);
  const ratio = speedIn(rows, 'windup') / speedIn(rows, 'pattern');
  assert.ok(ratio > 0.3 && ratio < 0.7, `비 ${ratio}`);
});

test('보스는 늘 판 안, 플레이어 몸 밖', () => {
  const w = brainWorld();
  trace(w, 180, w => {
    const [cx, cz] = clampB(RULES, w.boss.x, w.boss.z, RULES.boss.r);
    assert.ok(Math.abs(cx - w.boss.x) < 1e-9 && Math.abs(cz - w.boss.z) < 1e-9, `판 밖 ${w.boss.x},${w.boss.z}`);
    assert.ok(Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) >= RULES.boss.r + RULES.player.bodyR - 1e-6);
  });
});

test('다음 준비는 앞 패턴 끝 0.3초 전에 시작할 수 있다', () => {
  const w = brainWorld({ pattern: 1 });
  const { ev } = trace(w, 60);
  const wind = ev.filter(e => e.type === 'windup' && e.kind === 'pattern').map(e => e.t);
  const fires = ev.filter(e => e.type === 'fire' && e.src === 1).map(e => e.t);   // 패턴 1의 탄만(바탕 탄막 빼고)
  // 어떤 준비 시각 뒤에도(앞 패턴의) 탄이 아직 나오는 경우가 있다
  const overlapped = wind.slice(1).some(t => fires.some(f => f > t && f < t + RULES.brain.windup - 1e-9));
  assert.ok(overlapped, '겹친 준비가 없다');
});

test('패턴 사이 숨은 짧다(1단계)', () => {
  const w = brainWorld({ pattern: 1 });
  const { ev } = trace(w, 60);
  const wind = ev.filter(e => e.type === 'windup' && e.kind === 'pattern').map(e => e.t);
  const len = PAT[1].length(w, {});
  for (let k = 1; k < wind.length; k++) {
    const gap = wind[k] - wind[k - 1] - RULES.brain.windup - len;
    assert.ok(gap <= RULES.brain.breath[1] + RULES.brain.hop.sec - RULES.brain.overlap + 1e-6, `${k}번째 사이 ${gap}`);
  }
});

test('가끔 옆으로 뛴다', () => {
  const w = brainWorld({ pattern: 1 });
  const { ev } = trace(w, 120);
  assert.ok(ev.filter(e => e.type === 'hop').length >= 3);
});

// ── 원거리 재설계 Task 4: 빨간 예산, 장판 공격은 주 패턴과 안 겹침, 끊기
import { addStagger as addStag } from '../src/sim/boss.js';

// 빨간 빠른 공격이 실제로 닿는(또는 지나가는) 시각
function redMoments(ev) {
  const out = [];
  let slamRed = false;
  for (const e of ev) {
    if (e.type === 'slamStart') slamRed = e.color === 'red';
    if ((e.type === 'slamHit' || e.type === 'slamWall') && slamRed) { out.push(e.t); slamRed = false; }
    if (e.type === 'waveHit' && e.color === 'red') out.push(e.t);
    if (e.type === 'laserFire') out.push(e.t);
    if (e.type === 'meleeHit' && e.color === 'red') out.push(e.t);
  }
  return out.sort((a, b) => a - b);
}

test('빨간 빠른 공격은 어느 3초 안에도 2번까지', () => {
  let total = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const w = createWorld({ seed }); w.player.invulnUntil = 1e9; w.boss.hp = w.boss.maxHp = 1e9;
    const { ev } = play(w, 240);
    const t = redMoments(ev); total += t.length;
    for (let i = 0; i + 2 < t.length; i++) assert.ok(t[i + 2] - t[i] > RULES.floor.redWindow - 1e-6, `seed ${seed}: ${t[i].toFixed(2)} ${t[i + 1].toFixed(2)} ${t[i + 2].toFixed(2)}`);
  }
  assert.ok(total > 20, `빨간 빠른 공격 ${total}번`);
});

test('장판 공격은 주 패턴과 겹치지 않는다', () => {
  const w = brainWorld();
  for (let k = 0; k < ticks(120); k++) {
    step(w, idle);
    for (const e of drainEvents(w)) if (e.type === 'slamStart' || e.type === 'swordStart' || (e.type === 'windup' && e.kind === 'wave')) assert.equal(w.boss.runs.length, 0, `${e.type} ${e.t}`);
  }
});

test('그로기가 끝나면 빔·파도·차선이 남아 있지 않다', () => {
  const w = brainWorld();
  let checked = 0;
  for (let k = 0; k < ticks(90); k++) {
    if (k % ticks(9) === ticks(4)) addStag(w, 100);
    step(w, idle);
    for (const e of drainEvents(w)) if (e.type === 'groggyEnd') { checked++; assert.equal(w.beams.length + w.waves.length + w.lanes.length + w.floorAreas.length, 0); }
  }
  assert.ok(checked >= 3);
});

// 사용자 2026-11-16 "레이저가 너무 피하기 힘들다 — 주변 탄막도 많은데 광역까지": 레이저는 혼자, 더 느리게
import { createBot as makeBot } from '../src/sim/bot.js';

test('레이저가 켜진 동안(조준~쓸기)은 다른 탄이 새로 나오지 않는다', () => {
  let lasers = 0;
  for (const phase of [1, 2]) {
    const w = brainWorld({ seed: 2, phase });
    for (let k = 0; k < ticks(150); k++) {
      const on = w.beams.length > 0;
      step(w, idle);
      for (const e of drainEvents(w)) {
        if (e.type === 'laserAim') lasers++;
        if (on && w.beams.length > 0 && (e.type === 'fire' || e.type === 'orbFire')) assert.fail(`${phase}단계 ${e.t.toFixed(2)}: 레이저 중 ${e.type} src ${e.src}`);
      }
    }
  }
  assert.ok(lasers >= 4, `레이저 ${lasers}번`);
});

test('걷기만 해도 레이저는 대개 비킨다(맞는 비율 0.2 이하)', () => {
  let runs = 0, hits = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = createWorld({ seed, pattern: 8 }), bot = makeBot('walk', seed);
    w.player.hp = 1e9;
    for (let k = 0; k < ticks(30); k++) {
      step(w, bot(w));
      for (const e of drainEvents(w)) { if (e.type === 'laserAim') runs++; if (e.type === 'hurt' && e.src === 8) hits++; }
    }
  }
  assert.ok(runs >= 10);
  assert.ok(hits / runs <= 0.2, `레이저 ${hits}/${runs} = ${(hits / runs).toFixed(2)}`);
});
