// 검사 스킬의 형태(2026-11-18 — 설계 2026-11-18-barrage-run-growth-design.md §3. 사용자: "같은 스킬이더라도 설정에 따라 동작을 다르게 —
// 일섬을 예로 들자면 한 번밖에 못 쓰지만 지금처럼 세거나, 한 칸으로 2~3번 쓸 수 있지만 약하거나").
// 아직 카드가 아니다 — 주소 옵션(slash=chain | deep) 뒤에서 손으로 확인하는 시험판이다. 형태를 주지 않으면 한 틱도 달라지지 않는다.
//  잇는 일섬(chain — 여럿에게): 한 칸으로 n번까지. 선 뒤 window초 안에 U를 다시 누르면 칸 없이 한 번 더. 한 번의 세기는 dmg배.
//  깊은 일섬(deep — 하나에게): 한 칸에 한 번, 세기와 무너짐이 dmg배·stag배. 선 뒤 lock초 동안은 다른 스킬이 기다린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { storeAdd } from '../src/sim/store.js';
import { spawnMob } from '../src/sim/foes.js';
import { slashLanding, chainLive } from '../src/sim/sword.js';
import { worldOptions } from '../src/view/query.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const Sw = RULES.sword, F = Sw.forms.slash, dt = RULES.dt;
// 검사 판: 보스가 오른쪽 d U에 서 있다. 평타와 이기어검은 끈다(스킬 본체만 본다) — swords = true면 검을 둔다
function sw(form, { d = 5, swords = false } = {}) {
  const w = quietWorld({ char: 'sword', forms: form ? { slash: form } : null });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.shots.nextAt = 1e9; w.player.blade.cutAt = 1e9;
  if (!swords) w.player.swords = null;
  return w;
}
// 방: 보스는 자리에 없고 맞아 주는 허수아비만 있다(at = [[dx, dz], …])
function room(form, at) {
  const w = sw(form); w.boss.away = true;
  const mobs = at.map(([dx, dz]) => { const m = spawnMob(w, 'totem', w.player.x + dx, w.player.z + dz, 0); m.hp = m.maxHp = 1e6; return m; });
  step(w, idle); drainEvents(w);
  return { w, mobs };
}
const give = (w, n, perfect = true) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: perfect ? RULES.reflect.staggerPerfect : RULES.reflect.staggerNormal, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const press = (w, key = 'throw') => { step(w, { ...idle, [key]: true }); return drainEvents(w); };
// U를 누르고 그 일섬이 끝나는 틱까지 돌린다(사건을 돌려준다). 나가지 않았으면 던진다
function slashOnce(w) {
  const ev = [];
  for (let k = 0; k < ticks(0.5); k++) {
    step(w, k === 0 ? { ...idle, throw: true } : idle);
    const e = drainEvents(w); ev.push(...e);
    if (e.some(x => x.type === 'bladeEnd' && x.skill === 'slash')) return ev;
  }
  throw new Error('일섬이 나가지 않았다: ' + ev.filter(e => e.type === 'denied').map(e => e.why).join(','));
}
const wait = (w, sec) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, idle); ev.push(...drainEvents(w)); } return ev; };
const of = (ev, type) => ev.filter(e => e.type === type);

test('형태의 수치는 유한한 수이고, 잇는 일섬은 두 번 이상 · 한 번의 세기는 지금보다 약하다', () => {
  for (const v of Object.values(F.chain)) assert.ok(Number.isFinite(v));
  for (const v of Object.values(F.deep)) assert.ok(Number.isFinite(v));
  assert.ok(F.chain.n >= 2 && F.chain.dmg < 1 && F.chain.dmg * F.chain.n > 1, '나눠 쓰면 합은 한 번보다 크다');
  assert.ok(F.deep.dmg > 1 && F.deep.stag > 1);
});

test('형태를 주지 않으면 지금 그대로다 — 한 칸에 한 번, 같은 입력이면 같은 판', () => {
  const run = form => { const w = sw(form, { swords: true }); give(w, 2); slashOnce(w); wait(w, 0.3); slashOnce(w); wait(w, 0.5); return w; };
  assert.equal(stateHash(run(null)), stateHash(run(undefined)));
  assert.equal(stateHash(run(null)), stateHash(run('nope')), '모르는 형태는 없는 것과 같다');
  const w = sw(null); give(w, 1); slashOnce(w);
  assert.equal(chainLive(w), false);
  assert.equal(of(press(w), 'denied')[0]?.why, 'empty');
});

test('잇는 일섬: 한 칸으로 n번 — 첫 번만 칸을 쓰고, 선 뒤 window초 안에 U를 다시 누르면 칸 없이 나간다', () => {
  const w = sw('chain'); give(w, 1);
  const first = of(slashOnce(w), 'bladeSlash')[0];
  assert.equal(w.player.store.length, 0, '첫 번에 한 칸');
  assert.deepEqual([first.form, first.k, first.of, first.free], ['chain', 1, F.chain.n, false]);
  assert.equal(chainLive(w), true);
  for (let k = 2; k <= F.chain.n; k++) {
    const e = of(slashOnce(w), 'bladeSlash')[0];
    assert.deepEqual([e.k, e.free], [k, true], `${k}번째`);
    assert.equal(e.heal, 0, '칸을 쓰지 않았으니 회복도 없다');
  }
  assert.equal(w.stats.blade.slash, F.chain.n);
  assert.equal(chainLive(w), false, 'n번을 다 썼다');
  assert.equal(of(press(w), 'denied')[0]?.why, 'empty');
});

test('잇는 일섬: 한 번의 세기와 무너짐은 지금의 dmg배 · stag배 — 받은 칸이 완벽이면 이어지는 것도 완벽 값이다', () => {
  const once = form => { const w = sw(form); give(w, 1); const hp = w.boss.hp, st = w.boss.stagger; slashOnce(w); const a = [hp - w.boss.hp, w.boss.stagger - st]; return { w, a }; };
  const base = once(null), ch = once('chain');
  assert.ok(base.a[0] > 0 && base.a[1] > 0);
  assert.ok(Math.abs(ch.a[0] - base.a[0] * F.chain.dmg) < 1e-6, `피해 ${ch.a[0]} / 기본 ${base.a[0]}`);
  assert.ok(Math.abs(ch.a[1] - base.a[1] * F.chain.stag) < 1e-6, `무너짐 ${ch.a[1]} / 기본 ${base.a[1]}`);
  const hp = ch.w.boss.hp; slashOnce(ch.w);
  assert.ok(Math.abs((hp - ch.w.boss.hp) - ch.a[0]) < 1e-6, '둘째도 첫째와 같은 세기');
});

test('잇는 일섬: window초가 지나면 끝난다 — 칸이 없으면 거절, 칸이 있으면 새로 한 칸을 쓰고 다시 n번', () => {
  const w = sw('chain'); give(w, 1); slashOnce(w);
  wait(w, F.chain.window + 2 * dt);
  assert.equal(chainLive(w), false);
  assert.equal(of(press(w), 'denied')[0]?.why, 'empty');
  give(w, 2);
  const e = of(slashOnce(w), 'bladeSlash')[0];
  assert.deepEqual([e.k, e.free], [1, false]);
  assert.equal(w.player.store.length, 1, '새 묶음은 칸을 쓴다');
  const w2 = sw('chain'); give(w2, 2); slashOnce(w2); slashOnce(w2);
  assert.equal(w2.player.store.length, 1, '이어지는 동안은 칸이 남아 있어도 쓰지 않는다');
});

test('잇는 일섬: 창은 선 때부터 센다 — 가는 동안의 시간은 빼지 않는다', () => {
  const w = sw('chain'); give(w, 1); slashOnce(w);
  wait(w, F.chain.window - 3 * dt);
  assert.equal(chainLive(w), true);
  assert.equal(of(slashOnce(w), 'bladeSlash')[0].k, 2);
});

test('잇는 일섬: 다음 일섬은 이번 묶음에서 아직 안 벤 가까운 적으로 간다', () => {
  const { w, mobs: [a, b, c] } = room('chain', [[3, 0], [3, 4], [-2, 4]]);
  give(w, 1);
  assert.equal(slashLanding(w).target, a, '첫 번은 겨눈 적(가장 가까운 적)');
  slashOnce(w);
  assert.equal(slashLanding(w).target, b, '건너편에 선 뒤 가장 가까운 것은 방금 벤 a지만, 안 벤 b로 간다');
  slashOnce(w);
  assert.equal(slashLanding(w).target, c);
  slashOnce(w);
  for (const m of [a, b, c]) assert.ok(m.hp < m.maxHp, '셋 다 한 번씩 베였다');
});

test('잇는 일섬: 안 벤 적이 닿는 거리에 없으면 방금 벤 적이 아닌 가까운 적으로, 적이 하나뿐이면 같은 적을 되지나간다', () => {
  const two = room('chain', [[3, 0], [3, 4]]); give(two.w, 1);
  slashOnce(two.w); slashOnce(two.w);
  assert.equal(slashLanding(two.w).target, two.mobs[0], '둘을 다 벴으면 방금 벤 b가 아니라 a로 돌아간다');
  const w = sw('chain'); give(w, 1);
  const x0 = w.player.x; slashOnce(w);
  assert.ok(w.player.x > w.boss.x, '건너편에 섰다');
  assert.equal(slashLanding(w).target, w.boss);
  slashOnce(w);
  assert.ok(w.player.x < w.boss.x && Math.abs(w.player.x - x0) < 3, '되지나가 처음 쪽에 선다');
});

test('잇는 일섬: 닿는 적이 없으면 이어지는 일섬도 나가지 않는다(창은 그대로 흐른다)', () => {
  const { w, mobs: [a] } = room('chain', [[3, 0]]); give(w, 1); slashOnce(w);
  a.dead = true; step(w, idle); drainEvents(w);
  assert.equal(slashLanding(w), null);
  assert.equal(of(press(w), 'denied')[0]?.why, 'far');
});

test('잇는 일섬: 검 묶음은 첫 번에만 생기고, 검의 타격은 매번 swords배의 세기로 나선다', () => {
  const C = Sw.swords;
  const w = sw('chain', { swords: true }); give(w, 1);
  const ev = [...slashOnce(w), ...slashOnce(w), ...slashOnce(w), ...wait(w, 1.2)];
  assert.equal(of(ev, 'swordsBatch').length, 1, '묶음은 한 번');
  assert.equal(of(ev, 'swordsStrike').length, F.chain.n, '타격은 번마다');
  const hits = of(ev, 'swordHit');
  assert.ok(hits.length >= F.chain.n * C.n);
  const base = sw(null, { swords: true }); give(base, 1);
  const hb = of([...slashOnce(base), ...wait(base, 0.6)], 'swordHit');
  assert.ok(hb.length >= C.n && hb[0].dmg > 0);
  for (const h of hits) assert.ok(Math.abs(h.dmg - hb[0].dmg * F.chain.swords) < 1e-6, `검 한 번 ${h.dmg} / 기본 ${hb[0].dmg}`);
});

test('깊은 일섬: 한 칸에 한 번, 세기와 무너짐이 dmg배 · stag배', () => {
  const once = form => { const w = sw(form); give(w, 1); const hp = w.boss.hp, st = w.boss.stagger; const e = of(slashOnce(w), 'bladeSlash')[0]; return { w, e, a: [hp - w.boss.hp, w.boss.stagger - st] }; };
  const base = once(null), deep = once('deep');
  assert.ok(Math.abs(deep.a[0] - base.a[0] * F.deep.dmg) < 1e-6, `피해 ${deep.a[0]} / 기본 ${base.a[0]}`);
  assert.ok(Math.abs(deep.a[1] - base.a[1] * F.deep.stag) < 1e-6, `무너짐 ${deep.a[1]} / 기본 ${base.a[1]}`);
  assert.deepEqual([deep.e.form, deep.e.k, deep.e.of, deep.e.free], ['deep', 1, 1, false]);
  assert.equal(chainLive(deep.w), false);
  assert.equal(of(press(deep.w), 'denied')[0]?.why, 'empty');
});

test('깊은 일섬: 선 뒤 lock초 동안은 다른 스킬이 기다린다 — 그동안의 누름은 버려지지 않고 풀리는 틱에 나간다', () => {
  const w = sw('deep', { d: 3 }); give(w, 2); slashOnce(w);
  const ev = press(w, 'spin');
  assert.equal(of(ev, 'bladeSpin').length, 0, '선 틱 바로 뒤에는 아직');
  assert.equal(of(ev, 'denied').length, 0, '거절이 아니라 기다림');
  let n = 1;
  for (; n < ticks(1); n++) { step(w, idle); if (of(drainEvents(w), 'bladeSpin').length) break; }
  assert.ok(n < ticks(1), '기억한 회전 베기가 끝내 나가지 않았다');
  assert.ok(Math.abs(n * dt - F.deep.lock) <= 3 * dt, `선 뒤 ${(n * dt).toFixed(3)}초에 나갔다(lock ${F.deep.lock})`);
  const base = sw(null, { d: 3 }); give(base, 2); slashOnce(base);
  assert.equal(of(press(base, 'spin'), 'bladeSpin').length, 1, '형태가 없으면 서자마자 나간다');
});

test('형태의 상태는 해시에 든다(잇는 동안 다르다) — 사수 판과 형태 없는 검사 판의 해시는 그대로', () => {
  const a = sw('chain'), b = sw('chain'); give(a, 1); give(b, 1);
  slashOnce(a); slashOnce(b);
  assert.equal(stateHash(a), stateHash(b));
  wait(b, F.chain.window + 2 * dt); wait(a, F.chain.window + 2 * dt);
  assert.equal(stateHash(a), stateHash(b));
  const c = sw('chain'); give(c, 1); slashOnce(c);
  const h0 = stateHash(c); c.player.blade.chain.left--;
  assert.notEqual(stateHash(c), h0, '남은 횟수가 다르면 해시가 다르다');
  assert.ok(!stateHash(sw(null)).includes('|n'), '형태가 없으면 해시에 흔적이 없다');
});

test('주소: slash=chain · deep이 형태를 고른다 — 검사에게만, 모르는 값은 없는 것으로', () => {
  const opt = q => worldOptions(new URLSearchParams(q)).forms;
  assert.deepEqual(opt('char=sword&slash=chain'), { slash: 'chain' });
  assert.deepEqual(opt('char=sword&slash=deep'), { slash: 'deep' });
  assert.equal(opt('char=sword'), null);
  assert.equal(opt('char=sword&slash=nope'), null);
  assert.equal(quietWorld({ forms: { slash: 'chain' } }).forms, null, '사수는 형태가 없다');
  assert.deepEqual(quietWorld({ char: 'sword', forms: { slash: 'chain' } }).forms, { slash: 'chain' });
});

// ── 화면 · 정해진 손 · 봇
import { LOOK } from '../src/view/look.js';
import { createWorld } from '../src/sim/world.js';
import { createBot } from '../src/sim/bot.js';
import { labHand } from '../src/sim/labs.js';
import { gameTries } from '../src/sim/tries.js';

test('보이기: 형태마다 HUD에 뜰 이름이 있고, 틈의 안내에 잇는 말이 있다', () => {
  for (const k of Object.keys(F)) assert.equal(typeof LOOK.sword.formNames[k], 'string', k);
  assert.equal(typeof LOOK.sword.gap.labels.chain, 'string');
  for (const v of Object.values(LOOK.sword.forms.deep).flat()) assert.ok(Number.isFinite(v));
});

test('정해진 손 forms: 잇는 일섬을 켠 판에서는 일섬 여섯 번 가운데 넷이 칸 없이 나가고, 형태가 없으면 여섯 번 다 칸을 쓴다', () => {
  const run = forms => {
    const w = createWorld({ char: 'sword', lab: 'swords', clip: 'forms', forms });
    const ev = []; for (let k = 0; k < ticks(6.5); k++) { step(w, labHand(w)); ev.push(...drainEvents(w)); }
    return of(ev, 'bladeSlash');
  };
  const ch = run({ slash: 'chain' });
  assert.equal(ch.length, 6);
  assert.deepEqual(ch.map(e => e.k), [1, 2, 3, 1, 2, 3]);
  assert.equal(ch.filter(e => e.free).length, 4);
  assert.equal(run(null).filter(e => e.free).length, 0);
  assert.equal(run({ slash: 'deep' }).length, 6);
});

test('봇: 잇는 일섬이 이어지는 동안은 칸이 없어도 U를 다시 누른다 — 형태가 없으면 그런 일섬은 없다', () => {
  const run = forms => {
    const w = createWorld({ char: 'sword', seed: 3, store: true, tries: gameTries(null), forms }), bot = createBot('user', 3);
    let free = 0, all = 0;
    for (let k = 0; k < ticks(60) && !w.result; k++) { step(w, bot(w)); for (const e of drainEvents(w)) if (e.type === 'bladeSlash') { all++; if (e.free) free++; } }
    return { free, all };
  };
  const ch = run({ slash: 'chain' });
  assert.ok(ch.free >= 4, `칸 없이 나간 일섬 ${ch.free} / ${ch.all}`);
  assert.equal(run(null).free, 0);
});
