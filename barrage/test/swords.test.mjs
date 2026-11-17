// 이기어검(검사의 무기 — 설계 2026-11-17-barrage-flying-swords-design.md): 바탕 다섯 자루가 건너다니며 찌르고,
// 스킬이 맞을 때마다 다섯이 더 생겨(최대 열다섯) 가진 검이 모두 그 스킬에 나선다. 판정은 sim/swords.js가 시간으로 정한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { gameTries } from '../src/sim/tries.js';
import { restartRoom } from '../src/sim/stage.js';
import { createBot } from '../src/sim/bot.js';
import { labHand } from '../src/sim/labs.js';
import { RULES } from '../src/sim/rules.js';
import { storeAdd } from '../src/sim/store.js';
import { swordCount } from '../src/sim/swords.js';
import { spawnMob } from '../src/sim/foes.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const Sw = RULES.sword, Ss = Sw.swords, DT = RULES.dt;
const U = { ...idle, throw: true }, I = { ...idle, spin: true }, O = { ...idle, orb: true };

// 검사 판: 보스는 오른쪽 d U에 서 있다. 칼바람과 출격은 끈다(스킬 타격만 본다 — 출격은 타격이 끝나면 다시 켜지므로 피해는 출처로 센다)
function sw(d = 3, opts = {}) {
  const w = quietWorld({ char: 'sword', ...opts });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.player.blade.cutAt = 1e9;
  for (const s of w.player.swords.list) s.nextAt = 1e9;
  return w;
}
// 무너짐 값이 없는 칸(그로기의 피해 배율이 끼지 않게)
const give = (w, n) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect: false, gold: false, stagger: 0, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
// sec초 동안 돌리며 사건을 그 틱의 시각(t)과 함께 모은다. keys = { 틱 번호: 입력 }
function play(w, sec, keys = {}) {
  const out = [], n = ticks(sec);
  for (let k = 0; k < n; k++) { const t = w.time; step(w, keys[k] ?? idle); for (const e of drainEvents(w)) out.push({ ...e, t }); }
  return out;
}
const of = (ev, type) => ev.filter(e => e.type === type);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── Task 1: 묶음과 스킬 타격
test('검사 판은 검 다섯 자루로 시작하고, 사수 판에는 검이 없다', () => {
  assert.equal(swordCount(sw()), Ss.n);
  assert.equal(quietWorld().player.swords ?? null, null);
  assert.equal(swordCount(quietWorld()), 0);
});

test('회전 베기가 맞으면 열 자루가 되고, 열 자루가 모두 first ~ first + span 사이에 한 번씩 벤다(기록은 salvo)', () => {
  const w = sw(3); give(w, 1);
  const ev = play(w, 0.5, { 0: I });
  const t0 = of(ev, 'bladeSpin')[0].t, batch = of(ev, 'swordsBatch'), hits = of(ev, 'swordHit');
  assert.equal(batch.length, 1); assert.equal(batch[0].renewed, false); assert.equal(batch[0].n, Ss.n);
  assert.equal(swordCount(w), 2 * Ss.n);
  assert.equal(of(ev, 'swordsStrike')[0].total, 2 * Ss.n);
  assert.equal(hits.length, 2 * Ss.n);
  for (const h of hits) assert.ok(h.t >= t0 + Ss.spin.first - 1e-9 && h.t <= t0 + Ss.spin.first + Ss.spin.span + DT, `타격 시각 ${h.t - t0}`);
  assert.deepEqual(hits.map(h => h.k), [...Array(2 * Ss.n).keys()]);
  assert.equal(hits.at(-1).last, true); assert.equal(hits[0].last, false);
  assert.ok(near(w.stats.dmg.salvo, 2 * Ss.n * Ss.spin.dmg), `salvo ${w.stats.dmg.salvo}`);
  assert.ok(near(hits.at(-1).sum, 2 * Ss.n * Ss.spin.dmg));
});

test('헛친 회전 베기에는 묶음이 생기지 않는다', () => {
  const w = sw(10); give(w, 1);
  const ev = play(w, 0.5, { 0: I });
  assert.equal(of(ev, 'bladeSpin').length, 1);
  assert.equal(of(ev, 'swordsBatch').length, 0); assert.equal(of(ev, 'swordsStrike').length, 0);
  assert.equal(swordCount(w), Ss.n);
});

test('두 번째 스킬에 열다섯, 세 번째는 열다섯 그대로 — 가장 오래된 묶음의 시간만 새로 고친다', () => {
  const w = sw(3); give(w, 3);
  const gap = ticks(Sw.spin.lock + 0.05);
  const ev = play(w, 1.2, { 0: I, [gap]: I, [2 * gap]: I });
  const batches = of(ev, 'swordsBatch'), strikes = of(ev, 'swordsStrike');
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map(b => b.renewed), [false, false, true]);
  assert.equal(batches[2].batch, batches[0].batch, '가장 오래된 묶음을 새로 고친다');
  assert.deepEqual(strikes.map(s => s.total), [2 * Ss.n, 3 * Ss.n, 3 * Ss.n]);
  assert.equal(swordCount(w), Ss.max);
  const old = w.player.swords.batches.find(b => b.id === batches[0].batch);
  assert.ok(near(old.until, batches[2].t + Ss.keep, DT + 1e-9), `until ${old.until}`);
});

test('keep이 지나면 스킬 묶음이 식어 다섯 자루로 돌아온다', () => {
  const w = sw(3); give(w, 1);
  const ev = play(w, Ss.keep + 0.5, { 0: I });
  assert.equal(of(ev, 'swordsExpire').length, 1);
  assert.ok(near(of(ev, 'swordsExpire')[0].t, Ss.keep, 2 * DT));
  assert.equal(swordCount(w), Ss.n);
});

test('타격 중에 식을 때가 온 묶음은 그 타격을 마친 뒤에 식는다', () => {
  const w = sw(3); give(w, 2);
  const late = ticks(Ss.keep - 0.05);   // 첫 묶음이 식기 바로 전에 마무리(타격은 0.2초 뒤부터)
  const ev = play(w, Ss.keep + 1, { 0: I, [late]: O });
  const strike = of(ev, 'swordsStrike')[1], hits = of(ev, 'swordHit').filter(h => h.skill === 'finish'), gone = of(ev, 'swordsExpire');
  assert.equal(strike.total, 3 * Ss.n);
  assert.equal(hits.length, 3 * Ss.n, '식을 묶음의 검도 제 몫을 벤다');
  assert.ok(gone.length >= 1 && gone[0].t >= hits.at(-1).t - 1e-9, '타격이 끝난 뒤에 식는다');
});

test('일섬 바로 뒤의 회전 베기: 두 번째 타격은 첫 타격이 끝난 뒤에 시작하고, 둘 다 온전히 나간다', () => {
  const w = sw(5); give(w, 2);
  const ev = play(w, 1.0, { 0: U, [ticks(0.1)]: I });
  const [s1, s2] = of(ev, 'swordsStrike');
  assert.equal(s1.skill, 'slash'); assert.equal(s2.skill, 'spin');
  assert.ok(s2.startAt >= s1.startAt + s1.span - 1e-9, `겹친다: ${s1.startAt} + ${s1.span} > ${s2.startAt}`);
  const hits = of(ev, 'swordHit'), a = hits.filter(h => h.skill === 'slash'), b = hits.filter(h => h.skill === 'spin');
  assert.equal(a.length, 2 * Ss.n); assert.equal(b.length, 3 * Ss.n);
  assert.ok(a.at(-1).t <= b[0].t + 1e-9, '앞 타격이 끝까지 간 뒤에 다음 타격');
  assert.ok(near(w.stats.dmg.salvo, 2 * Ss.n * Ss.slash.dmg + 3 * Ss.n * Ss.spin.dmg), `salvo ${w.stats.dmg.salvo}`);
});

test('마무리: 타격은 벤 뒤 finish.first부터, 검 한 번의 피해 = finish.dmg × 쓴 칸 수', () => {
  const w = sw(3); give(w, 3);
  const ev = play(w, 1.0, { 0: O });
  const t0 = of(ev, 'bladeFinish')[0].t, hits = of(ev, 'swordHit');
  assert.equal(hits.length, 2 * Ss.n);
  assert.ok(hits[0].t >= t0 + Ss.finish.first - 1e-9, `너무 이르다: ${hits[0].t - t0}`);
  assert.ok(hits.at(-1).t <= t0 + Ss.finish.first + Ss.finish.span + DT);
  for (const h of hits) assert.ok(near(h.dmg, Ss.finish.dmg * 3), `검 한 번 ${h.dmg}`);
  assert.equal(hits[0].orbs, 3);
});

test('join이 0이면 새 다섯만 스킬에 나선다', () => {
  Ss.join = 0;
  try {
    const w = sw(3); give(w, 1);
    const ev = play(w, 0.5, { 0: I });
    assert.equal(of(ev, 'swordsStrike')[0].total, Ss.n);
    assert.equal(of(ev, 'swordHit').length, Ss.n);
    assert.equal(swordCount(w), 2 * Ss.n);
  } finally { Ss.join = 1; }
});

test('검의 타격은 무너짐을 올리지 않는다', () => {
  const w = sw(3); give(w, 1);
  play(w, 0.5, { 0: I });
  assert.ok(w.stats.dmg.salvo > 0);
  assert.equal(w.boss.stagger, 0);
});

// ── Task 2: 건너다니기(기본 공격 — 닿는 적이 있는 동안 돌아오지 않고 계속 찌른다)
// 보스가 d U에 서 있고 출격은 켜 둔 판(칼바람만 끈다)
function out(d = 4, opts = {}) {
  const w = quietWorld({ char: 'sword', ...opts });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.player.blade.cutAt = 1e9;
  return w;
}
// 보스 없는 방: 가만히 서 있고 죽지 않는 몬스터들(자리는 플레이어에게서 [dx, dz, 종류])
function room(spots) {
  const w = quietWorld({ char: 'sword' });
  w.boss.away = true; w.player.blade.cutAt = 1e9;
  const mobs = spots.map(([dx, dz, kind]) => { const m = spawnMob(w, kind ?? 'shooter', w.player.x + dx, w.player.z + dz, 0); m.hp = m.maxHp = 1e6; return m; });
  drainEvents(w);
  return { w, mobs };
}
// 검 하나(바탕 묶음의 k번)의 출격 사건만
const trail = (ev, k, batch = 0) => ev.filter(e => (e.type === 'swordSortie' || e.type === 'swordStab' || e.type === 'swordHome') && e.batch === batch && e.k === k);
const stabsOf = (ev, k) => trail(ev, k).filter(e => e.type === 'swordStab');

test('보스 하나: 다섯 자루가 모두 나가 돌아오지 않고, 검마다 beat에 한 번씩 계속 찌른다 — 자루마다 엇갈려서', () => {
  const w = out(4);
  const ev = play(w, 2.2);
  for (let k = 0; k < Ss.n; k++) assert.ok(near(trail(ev, k)[0].t, k * Ss.beat / Ss.n, DT + 1e-9), `${k}번이 떠난 때 ${trail(ev, k)[0].t}`);
  const s0 = trail(ev, 0);
  assert.equal(s0[0].type, 'swordSortie');
  assert.ok(s0.slice(1).every(e => e.type === 'swordStab'), '닿는 적이 있는 동안에는 돌아오지 않는다');
  s0.slice(1).forEach((e, i) => assert.ok(near(e.t, Ss.fly + i * Ss.beat, DT + 1e-9), `찌른 때 ${e.t}`));
  assert.deepEqual(s0.slice(1, 4).map(e => e.round), [false, true, true], '혼자인 적은 다른 쪽으로 돌아서 다시 찌른다');
  assert.ok(s0[1].next && s0[1].next.round && Number.isFinite(s0[1].next.fromX), '다음에 어디서 들어올지 알린다');
  const all = of(ev, 'swordStab');
  assert.equal(all.filter(e => e.t >= 1.09 && e.t < 2.09).length, Ss.n * Math.round(1 / Ss.beat), '1초에 자루마다 1 / beat번');
  assert.equal(of(ev, 'swordHome').length, 0);
  assert.ok(near(w.stats.dmg.weapon, all.length * Ss.stab), `weapon ${w.stats.dmg.weapon}`);
  assert.equal(w.player.store.length, 0); assert.equal(w.player.blade.charge, 0, '찌르기는 칸을 채우지 않는다');
});

test('사거리 밖이면 떠나지 않고, 들어오면 엇갈려 떠나고, 다시 벗어나면 모두 돌아온다', () => {
  const w = out(12);
  assert.equal(of(play(w, 1), 'swordSortie').length, 0);
  w.boss.x = w.player.x + 4;
  const t = of(play(w, 1), 'swordSortie').map(e => e.t);
  assert.equal(t.length, Ss.n);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= Ss.beat / Ss.n - 2 * DT, `간격 ${t[i] - t[i - 1]}`);
  w.boss.x = w.player.x + 12;
  const back = play(w, 1);
  assert.equal(of(back, 'swordHome').length, Ss.n);
  assert.ok(of(back, 'swordHome').every(e => !e.blocked));
  assert.equal(of(play(w, 1), 'swordStab').length, 0);
});

test('몬스터 둘: 두 적 사이를 계속 오가며 찌른다', () => {
  const { w, mobs: [a, b] } = room([[2.5, 0], [4.5, 0]]);
  const stabs = stabsOf(play(w, 2.5), 0).slice(0, 4);
  assert.deepEqual(stabs.map(e => e.id), [a.id, b.id, a.id, b.id]);
  assert.ok(stabs.every(e => !e.round));
});

test('다음 적이 hopR보다 멀면 건너가지 않고 그 적을 돌아서 계속 찌른다', () => {
  const { w, mobs: [a] } = room([[2.5, 0], [2.5 + Ss.hopR + 2, 0]]);
  const stabs = stabsOf(play(w, 2), 0).slice(0, 3);
  assert.deepEqual(stabs.map(e => e.id), [a.id, a.id, a.id]);
  assert.deepEqual(stabs.map(e => e.round), [false, true, true]);
});

test('몬스터 넷: 한 바퀴 도는 동안 같은 적을 두 번 찌르지 않는다', () => {
  const { w } = room([[2.5, 0], [4, 1.5], [4, -1.5], [5.5, 0]]);
  const ids = stabsOf(play(w, 3), 0).slice(0, 4).map(e => e.id);
  assert.equal(new Set(ids).size, 4, `${ids}`);
});

test('끈: 사거리 밖의 적은 사거리 안의 적에게서 한 다리(hopR) 안일 때만 찌른다', () => {
  const { w, mobs: [a, b, c] } = room([[2.5, 0], [7.5, 0], [12, 0]]);
  const ids = new Set(of(play(w, 4), 'swordStab').map(e => e.id));
  assert.ok(ids.has(a.id) && ids.has(b.id), '한 다리 건너의 적까지는 간다');
  assert.ok(!ids.has(c.id), '두 다리 건너의 적은 찌르지 않는다(검이 혼자 방을 치우지 않는다)');
});

test('몬스터에게는 검사의 몬스터 배율을 따른다', () => {
  const keep = Sw.mob; Sw.mob = 1.5;
  try {
    const { w } = room([[2.5, 0]]);
    assert.ok(near(of(play(w, 0.3), 'swordStab')[0].dmg, Ss.stab * 1.5));
  } finally { Sw.mob = keep; }
});

test('기둥이 검이 온 줄을 가로막으면 찌르지 못하고 돌아와 rest초 쉰다', () => {
  const w = out(6, { tries: 'pillars' }), [cx, cz] = RULES.tries.pillars.at[0];
  w.player.x = w.player.px = cx - 3; w.player.z = w.player.pz = cz; w.boss.x = cx + 3; w.boss.z = cz;
  const ev = play(w, Ss.rest + 1);
  assert.equal(of(ev, 'swordStab').length, 0);
  assert.ok(of(ev, 'swordHome').length > 0 && of(ev, 'swordHome').every(e => e.blocked));
  const goes = trail(ev, 0).filter(e => e.type === 'swordSortie').map(e => e.t);
  assert.ok(goes.length >= 2 && goes[1] - goes[0] >= Ss.rest, `막힌 검이 다시 나간 때 ${goes}`);
  assert.equal(w.stats.dmg.weapon, 0);
});

test('방패병의 앞에서는 막혀서 돌아온다(돌아서 다시 찌르지 않는다)', () => {
  const { w } = room([[2.5, 0, 'shield']]);
  const ev = play(w, 1);
  assert.equal(of(ev, 'swordStab').length, 0);
  assert.ok(of(ev, 'swordHome').length > 0 && of(ev, 'swordHome').every(e => e.blocked));
  assert.equal(w.stats.dmg.weapon, 0);
});

test('방패는 검이 온 줄로 본다: 건너온 쪽을 보고 있으면 막히고, 다른 쪽을 보고 있으면 맞는다', () => {
  const front = room([[2.5, 0], [4.5, 0, 'shield']]);
  front.mobs[1].face = Math.PI;   // 건너오는 쪽(앞 적 쪽)을 본다
  const a = trail(play(front.w, 1), 0);
  assert.deepEqual(a.slice(0, 3).map(e => e.type), ['swordSortie', 'swordStab', 'swordHome']);
  assert.equal(a[1].id, front.mobs[0].id); assert.equal(a[2].blocked, true);
  const side = room([[2.5, 0], [4.5, 0, 'shield']]);
  side.mobs[1].face = Math.PI / 2;   // 옆을 본다
  const b = stabsOf(play(side.w, 1.5), 0);
  assert.deepEqual(b.slice(0, 2).map(e => e.id), [side.mobs[0].id, side.mobs[1].id]);
  assert.ok(b[1].dmg > 0);
});

test('검이 가는 사이에 죽은 적: 곁의 다른 적으로 바꾸고, 없으면 그냥 돌아온다', () => {
  const two = room([[2.5, 0], [4.5, 0]]);
  const ev = play(two.w, 2 * DT);
  two.mobs[0].dead = true;
  ev.push(...play(two.w, 1));
  assert.equal(stabsOf(ev, 0)[0].id, two.mobs[1].id);
  const one = room([[2.5, 0]]);
  const ev1 = play(one.w, 2 * DT);
  one.mobs[0].dead = true;
  ev1.push(...play(one.w, 1));
  assert.deepEqual(trail(ev1, 0).map(e => e.type), ['swordSortie', 'swordHome']);
});

test('스킬 타격 동안에는 출격이 없고(하던 출격도 버린다), 끝나면 다시 엇갈려 시작한다', () => {
  const w = out(3); give(w, 1);
  const before = play(w, 0.2);
  assert.ok(of(before, 'swordSortie').length > 0);
  const ev = play(w, 1.5, { 0: I });
  const end = of(ev, 'swordHit').at(-1).t;   // 마지막 검이 벤 때 — 그 뒤로는 검이 풀려난다
  const moves = ev.filter(e => e.type === 'swordSortie' || e.type === 'swordStab');
  assert.ok(moves.length > 0);
  assert.ok(moves.every(e => e.t >= end - 1e-9), `타격 중에 출격: ${moves[0].t} < ${end}`);
  const t = of(ev, 'swordSortie').map(e => e.t);
  assert.equal(t.length, 2 * Ss.n);
  for (let i = 1; i < t.length; i++) assert.ok(near(t[i] - t[i - 1], Ss.beat / (2 * Ss.n), DT + 1e-9), `열 자루의 간격 ${t[i] - t[i - 1]}`);
});

// ── Task 3: 거두기 · 해시 · 봇 판
test('처형이 시작되면 남은 타격과 출격을 거두고 스킬 묶음이 사라진다', () => {
  const w = out(3); give(w, 1);
  w.boss.groggyUntil = w.time + 3;
  const ev = play(w, 0.05, { 0: I });   // 회전 베기 → 열 자루, 타격은 이제 막 시작
  assert.equal(swordCount(w), 2 * Ss.n);
  ev.push(...play(w, 0.3, { 0: { ...idle, parry: true } }));
  assert.ok(of(ev, 'executeStart').length > 0 || w.execute || of(ev, 'swordsClear').length > 0, '처형이 시작됐다');
  assert.equal(of(ev, 'swordsClear').length, 1, '한 번만 알린다');
  assert.equal(swordCount(w), Ss.n);
  assert.equal(w.player.swords.strikes.length, 0);
  const cleared = of(ev, 'swordsClear')[0].t;
  assert.equal(ev.filter(e => (e.type === 'swordHit' || e.type === 'swordStab') && e.t > cleared).length, 0, '거둔 뒤에는 베지 않는다');
});

test('방을 다시 시작하면(들어서면) 검은 다섯 자루로 돌아오고 하던 일은 없다', () => {
  const w = createWorld({ char: 'sword', stage: 1, seed: 1, tries: gameTries(null), ai: false });
  const p = w.player, m = w.enemies[0];
  m.x = m.px = p.x + 2; m.z = m.pz = p.z; m.bornAt = -1; m.hp = m.maxHp = 1e6;
  give(w, 1);
  play(w, 0.1, { 0: I });
  assert.equal(swordCount(w), 2 * Ss.n);
  restartRoom(w);
  assert.equal(swordCount(w), Ss.n);
  assert.equal(w.player.swords.strikes.length, 0);
  assert.ok(w.player.swords.list.every(s => !s.leg && s.nextAt >= w.time - 1e-9));
});

test('판이 끝나면 검은 더 베지 않는다', () => {
  const w = out(4);
  play(w, 0.5);
  w.result = 'win';
  const ev = play(w, 2);
  assert.equal(ev.filter(e => e.type === 'swordStab' || e.type === 'swordSortie').length, 0);
});

test('검의 상태는 검사 판의 해시에 들어가고, 같은 판을 두 번 돌리면 해시가 같다', () => {
  const a = out(3), b = out(3);
  assert.equal(stateHash(a), stateHash(b));
  give(b, 1); give(a, 1);
  a.player.swords.busyUntil = 9;
  assert.notEqual(stateHash(a), stateHash(b), '검의 상태가 다르면 해시가 다르다');
  const once = () => { const w = createWorld({ char: 'sword', seed: 7, tries: gameTries(null) }), bot = createBot('user', 7); for (let k = 0; k < ticks(20) && !w.result; k++) step(w, bot(w)); return stateHash(w); };
  assert.equal(once(), once());
  assert.ok(!stateHash(quietWorld()).includes('|w'), '사수 판의 해시에는 검이 없다');
});

test('봇이 수호자 한 판을 끝까지 돌려도 탈이 없고, 검이 찌르기(weapon)와 스킬 타격(salvo)으로 피해를 낸다', () => {
  const w = createWorld({ char: 'sword', seed: 3, tries: gameTries(null) }), bot = createBot('user', 3);
  let most = 0;
  for (let k = 0; k < ticks(150) && !w.result; k++) { step(w, bot(w)); drainEvents(w); most = Math.max(most, swordCount(w)); }
  assert.ok(w.stats.dmg.weapon > 0, `weapon ${w.stats.dmg.weapon}`);
  assert.ok(w.stats.dmg.salvo > 0, `salvo ${w.stats.dmg.salvo}`);
  assert.ok(most > Ss.n && most <= Ss.max, `가장 많을 때 ${most}`);
  assert.ok(swordCount(w) >= Ss.n);
});

// ── 가지 전체 검토에서 나온 것(2026-11-17)
test('스킬이 벤 적이 그 자리에서 다 죽었으면 검 타격은 열리지 않는다 — 묶음만 생기고 검은 곧장 다른 적을 찌른다', () => {
  const { w, mobs: [a, b] } = room([[2, 0], [4, 0]]);
  a.hp = 1; give(w, 1);
  const ev = play(w, 1.0, { 0: I });
  assert.equal(a.dead, true);
  assert.equal(of(ev, 'swordsBatch').length, 1); assert.equal(swordCount(w), 2 * Ss.n);
  assert.equal(of(ev, 'swordsStrike').length, 0, '죽은 적에게는 타격을 열지 않는다');
  assert.equal(of(ev, 'swordMiss').length, 0); assert.equal(of(ev, 'swordHit').length, 0);
  const first = of(ev, 'swordStab').find(e => e.id === b.id);
  assert.ok(first && first.t <= Ss.fly + Ss.beat, `곁의 적을 찌르기까지 ${first && first.t}`);
});

test('일섬이 지나가며 죽인 적 뒤에 살아남은 적이 있으면 타격은 그 적에게 열린다', () => {
  const { w, mobs: [a, b] } = room([[2, 0], [3.6, 0]]);
  a.hp = 1; give(w, 1);
  const ev = play(w, 1.0, { 0: U });
  assert.equal(a.dead, true); assert.equal(b.dead, false);
  const strike = of(ev, 'swordsStrike');
  assert.equal(strike.length, 1); assert.ok(strike[0].ids.includes(b.id));
  const hits = of(ev, 'swordHit');
  assert.equal(hits.length, 2 * Ss.n); assert.ok(hits.every(h => h.id === b.id));
  assert.ok(hits[0].t >= of(ev, 'bladeHit').find(e => e.id === b.id).t + Ss.slash.first - 1e-9, '살아남은 적을 벤 때부터 센다');
});

test('마무리의 검은 겨눈 적을 친다 — 알리는 첫 적(ids[0])도 그 적이다', () => {
  const { w, mobs: [far, nearer] } = room([[2.6, 0.5], [1.8, -0.4]]);   // 먼저 놓인 적이 더 멀다(목록의 차례와 겨눈 적이 다르다)
  give(w, 1);
  const ev = play(w, 1.0, { 0: O });
  const strike = of(ev, 'swordsStrike')[0], hits = of(ev, 'swordHit');
  assert.equal(hits.length, 2 * Ss.n);
  assert.ok(hits.every(h => h.id === nearer.id), '겨눈 적(가장 가까운 적)만 친다');
  assert.equal(strike.ids[0], nearer.id); assert.ok(strike.ids.includes(far.id));
  assert.ok(near(strike.x, nearer.x) && near(strike.z, nearer.z));
});

test('처형이 시작된 틱부터는 검이 베지 않는다(같은 틱의 타격도 없다)', () => {
  const w = out(3); give(w, 1);
  w.boss.groggyUntil = w.time + 3;
  const ev = []; let tExec = null;
  const keys = { 0: I, 6: { ...idle, parry: true } };
  for (let k = 0; k < ticks(0.5); k++) { const t = w.time; step(w, keys[k] ?? idle); for (const e of drainEvents(w)) ev.push({ ...e, t }); if (tExec == null && w.execute) tExec = t; }
  assert.ok(tExec != null, '처형이 시작됐다');
  assert.equal(ev.filter(e => (e.type === 'swordHit' || e.type === 'swordStab' || e.type === 'swordSortie') && e.t >= tExec - 1e-9).length, 0);
  assert.equal(swordCount(w), Ss.n);
});

test('같은 틱에 앞의 검이 죽인 적을 찌르러 온 검은 막힌 것이 아니다 — 곁의 다른 적으로 간다', () => {
  const { w, mobs: [a, b] } = room([[2.5, 0], [4.5, 0]]);
  a.hp = 1;
  w.player.swords.list[1].nextAt = w.player.swords.list[0].nextAt;   // 두 자루가 같은 틱에 같은 적을 찌른다
  const ev = play(w, 1.2);
  assert.equal(a.dead, true);
  assert.equal(of(ev, 'swordHome').filter(e => e.blocked).length, 0, '죽은 적에게 막혀 돌아와 쉬지 않는다');
  assert.equal(stabsOf(ev, 1)[0].id, b.id);
});

test('묶음이 식으면 남은 검은 다시 고르게 엇갈려 찌른다', () => {
  const w = out(3); give(w, 1);
  const ev = play(w, Ss.keep + 2.2, { 0: I });
  const gone = of(ev, 'swordsExpire')[0].t;
  const t = of(ev, 'swordStab').filter(e => e.t >= gone + Ss.beat).map(e => e.t);
  assert.ok(t.length >= 10);
  for (let i = 1; i < t.length; i++) assert.ok(near(t[i] - t[i - 1], Ss.beat / Ss.n, 2 * DT + 1e-9), `다섯 자루의 간격 ${(t[i] - t[i - 1]).toFixed(3)}`);
});

test('타격 중에 적이 죽어 마지막 검이 헛돌아도, 그때까지의 합계는 마지막 사건이 알려 준다', () => {
  const { w, mobs: [a] } = room([[2, 0]]);
  a.hp = 100 * Sw.spin.dmg + Ss.spin.dmg * 3.5;   // 회전 베기 본체(보통 칸 100 × spin.dmg) 뒤에 검 네 번이면 죽는다
  give(w, 1);
  const ev = play(w, 1.0, { 0: I });
  const hits = of(ev, 'swordHit'), miss = of(ev, 'swordMiss');
  assert.equal(hits.length, 4); assert.equal(miss.length, 2 * Ss.n - 4);
  assert.equal(miss.at(-1).last, true);
  assert.ok(near(miss.at(-1).sum, hits.at(-1).sum) && miss.at(-1).sum > 0);
  assert.ok(Number.isFinite(miss.at(-1).x));
});

// ── Task 5: 움직임을 보는 연습 장면과 정해진 손
function clipRun(lab, clip, sec) {
  const w = createWorld({ char: 'sword', lab, clip }), ev = [];
  for (let k = 0; k < ticks(sec); k++) { const t = w.time; step(w, labHand(w)); for (const e of drainEvents(w)) ev.push({ ...e, t }); }
  return { w, ev };
}

test('연습 장면 swords: 보스는 가만히 서 있고 칸이 늘 가득하며, 정해진 손대로 스킬이 나간다', () => {
  const w0 = createWorld({ char: 'sword', lab: 'swords', clip: 'burst' }), x0 = w0.boss.x;
  const { w, ev } = clipRun('swords', 'burst', 2.6);
  assert.equal(w.boss.x, x0);
  assert.equal(w.player.store.length, w.player.storeCap);
  assert.deepEqual(of(ev, 'swordsStrike').slice(0, 3).map(e => e.skill), ['slash', 'spin', 'finish']);
  assert.equal(w.boss.stagger, 0, '연습 장면의 칸은 무너짐을 주지 않는다(그로기가 끼지 않게)');
  assert.equal(w.result, null);
});

test('연습 장면 swords: clip이 없으면 가만히 서서 건너다니기만 하고, idle이면 보스가 멀어 검이 떠 있기만 한다', () => {
  const chain = clipRun('swords', null, 2);
  assert.ok(of(chain.ev, 'swordStab').length > 0); assert.equal(of(chain.ev, 'swordsStrike').length, 0);
  const idle = clipRun('swords', 'idle', 5.5);
  assert.equal(of(idle.ev, 'swordSortie').length, 0);
  assert.ok(Math.hypot(idle.w.player.x - (-4), idle.w.player.z) > 0.5, '걷고 구른다');
});

test('연습 장면 swordmobs: 몬스터 넷이 가만히 서 있고 죽지 않으며, 검이 그 사이를 건너다닌다', () => {
  const { w, ev } = clipRun('swordmobs', null, 4);
  assert.equal(w.enemies.length, 4);
  assert.ok(w.enemies.every(m => !m.dead && m.x === m.px && m.z === m.pz));
  assert.ok(new Set(of(ev, 'swordStab').map(e => e.id)).size >= 3);
  assert.equal(w.result, null);
});
