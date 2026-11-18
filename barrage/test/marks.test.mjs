// 자국(2026-11-18 — 설계 2026-11-18-barrage-run-growth-design.md §3 · §10): 검사의 연결 카드가 주고받는 재료.
// 적의 몸에 남는 칼자국 — keep초 남고, 한 적에 한 겹. 세기 = 그 자국을 남긴 베기의 value배. 시간이 다 되면 저절로 터진다.
// 가득인데 또 남기면 있던 것이 터지고 새로 남는다. 자국 난 적이 죽으면 가장 가까운 적(moveR 안)에게 옮겨 간다.
// 지금 있는 카드 둘(주소 mark=cut,pop — 시험판): 긋는 칼(cut) = 일섬으로 벤 적에게 자국 · 터뜨리는 회전(pop) = 회전 베기가 자국 난 적을 베면 pop배로 터진다.
// 카드를 들지 않은 판에는 자국이 없고 한 틱도 달라지지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { storeAdd } from '../src/sim/store.js';
import { spawnMob } from '../src/sim/foes.js';
import { markOn, MARK_CARDS } from '../src/sim/marks.js';
import { restartRoom } from '../src/sim/stage.js';
import { createBot } from '../src/sim/bot.js';
import { gameTries } from '../src/sim/tries.js';
import { worldOptions } from '../src/view/query.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const Sw = RULES.sword, M = Sw.marks, dt = RULES.dt;
// 검사 판: 보스가 오른쪽 d U에 서 있다. 평타와 이기어검은 끈다(스킬과 자국만 본다)
function sw(marks, { d = 5, forms = null } = {}) {
  const w = quietWorld({ char: 'sword', marks, forms });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.shots.nextAt = 1e9; w.player.blade.cutAt = 1e9; w.player.swords = null;
  return w;
}
// 방: 보스는 자리에 없고 맞아 주는 허수아비만 있다(at = [[dx, dz, hp], …])
function room(marks, at, opts = {}) {
  const w = sw(marks, opts); w.boss.away = true;
  const mobs = at.map(([dx, dz, hp = 1e6]) => { const m = spawnMob(w, 'totem', w.player.x + dx, w.player.z + dz, 0); m.hp = m.maxHp = hp; return m; });
  step(w, idle); drainEvents(w);
  return { w, mobs };
}
const give = (w, n, perfect = true) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: perfect ? RULES.reflect.staggerPerfect : RULES.reflect.staggerNormal, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const of = (ev, type) => ev.filter(e => e.type === type);
const wait = (w, sec) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, idle); ev.push(...drainEvents(w)); } return ev; };
const press = (w, key) => { step(w, { ...idle, [key]: true }); return drainEvents(w); };
function slashOnce(w) {
  const ev = [];
  for (let k = 0; k < ticks(0.5); k++) {
    step(w, k === 0 ? { ...idle, throw: true } : idle);
    const e = drainEvents(w); ev.push(...e);
    if (e.some(x => x.type === 'bladeEnd' && x.skill === 'slash')) return ev;
  }
  throw new Error('일섬이 나가지 않았다: ' + ev.filter(e => e.type === 'denied').map(e => e.why).join(','));
}
const slashDmg = ev => of(ev, 'bladeHit').filter(e => e.skill === 'slash')[0].dmg;

test('자국의 수치는 유한한 수이고, 카드 이름은 아는 것만 남는다', () => {
  for (const v of Object.values(M)) assert.ok(Number.isFinite(v));
  assert.deepEqual(MARK_CARDS, ['cut', 'pop']);
  assert.deepEqual(sw('cut, nope,pop').marks.cards, ['cut', 'pop']);
  assert.deepEqual(sw(['pop', 'cut']).marks.cards, ['cut', 'pop']);
});

test('카드를 들지 않은 판에는 자국이 없다 — 같은 입력이면 한 틱도 다르지 않고, 사수에게는 주어도 없다', () => {
  const run = marks => { const w = sw(marks); give(w, 2); slashOnce(w); wait(w, 0.3); press(w, 'spin'); wait(w, 5); return w; };
  assert.equal(sw(null).marks, null);
  assert.equal(sw('nope').marks, null);
  assert.equal(stateHash(run(null)), stateHash(run(undefined)));
  assert.ok(!stateHash(run(null)).includes('|m'));
  assert.equal(quietWorld({ marks: 'cut' }).marks, null);
});

test('긋는 칼: 일섬으로 벤 적에게 자국이 남는다 — keep초, 세기는 그 일섬의 value배', () => {
  const w = sw('cut'); give(w, 1);
  const ev = slashOnce(w), dmg = slashDmg(ev), leave = of(ev, 'markLeave');
  assert.equal(leave.length, 1);
  assert.equal(leave[0].id, 0, '보스');
  assert.ok(Math.abs(leave[0].value - dmg * M.value) < 1e-6, `세기 ${leave[0].value} / 일섬 ${dmg}`);
  const m = markOn(w, w.boss);
  assert.ok(m && Math.abs(m.until - (leave[0].t + M.keep)) < 1e-9);
  const base = sw(null); give(base, 1);
  assert.equal(of(slashOnce(base), 'markLeave').length, 0, '카드가 없으면 남지 않는다');
});

test('자국은 시간이 다 되면 저절로 터진다 — 그 세기만큼 다치고 자국은 사라진다', () => {
  const w = sw('cut'); give(w, 1);
  const value = of(slashOnce(w), 'markLeave')[0].value;
  const hp = w.boss.hp, ev = wait(w, M.keep + 3 * dt), pops = of(ev, 'markPop');
  assert.equal(pops.length, 1);
  assert.equal(pops[0].why, 'time');
  assert.ok(Math.abs(pops[0].dmg - value) < 1e-6 && Math.abs((hp - w.boss.hp) - value) < 1e-6);
  assert.equal(markOn(w, w.boss), null);
  assert.ok(Math.abs(w.stats.dmg.mark - value) < 1e-6, '피해 기록은 mark에 적는다');
  const early = sw('cut'); give(early, 1); slashOnce(early);
  assert.equal(of(wait(early, M.keep - 0.3), 'markPop').length, 0, '그 전에는 터지지 않는다');
});

test('가득인데 또 남기면 있던 것이 터지고 새로 남는다', () => {
  const w = sw('cut'); give(w, 2);
  const first = of(slashOnce(w), 'markLeave')[0];
  wait(w, 1);
  const ev = slashOnce(w), pops = of(ev, 'markPop'), leave = of(ev, 'markLeave');
  assert.equal(pops.length, 1); assert.equal(pops[0].why, 'renew');
  assert.ok(Math.abs(pops[0].dmg - first.value) < 1e-6);
  assert.equal(leave.length, 1);
  assert.ok(Math.abs(markOn(w, w.boss).until - (leave[0].t + M.keep)) < 1e-9, '새 자국은 시간이 새로 찬다');
});

test('자국 난 적이 죽으면 자국이 가장 가까운 적에게 옮겨 간다 — moveR 안에서, 남은 시간 그대로', () => {
  const { w, mobs: [a, b, far] } = room('cut', [[3, 0], [3, 3], [3, M.moveR + 6]]); give(w, 1);
  slashOnce(w);
  const m = markOn(w, a), until = m.until;
  assert.ok(m && !markOn(w, b));
  a.hp = 0; a.dead = true;
  const ev = wait(w, 3 * dt), mv = of(ev, 'markMove');
  assert.equal(mv.length, 1);
  assert.equal(mv[0].id, b.id, '가장 가까운 b로');
  assert.equal(markOn(w, a), null);
  assert.ok(markOn(w, b) && Math.abs(markOn(w, b).until - until) < 1e-9, '남은 시간은 그대로');
  b.hp = 0; b.dead = true;
  const ev2 = wait(w, 3 * dt);
  assert.equal(of(ev2, 'markMove').length, 0, `moveR(${M.moveR}) 밖의 적에게는 가지 않는다`);
  assert.equal(of(ev2, 'markGone').length, 1);
  assert.equal(markOn(w, far), null);
});

test('옮겨 간 자리의 적이 이미 자국을 지녔으면 있던 것이 터지고 새로 남는다', () => {
  const { w, mobs: [a, b] } = room('cut', [[3, 0], [3, 3]]); give(w, 1);
  slashOnce(w);
  w.marks.list.push({ foe: b, until: w.time + 2, value: 7 });   // b에게도 자국을 하나 둔다
  assert.ok(markOn(w, a) && markOn(w, b), '둘 다 자국');
  const va = markOn(w, a).value, vb = markOn(w, b).value, hp = b.hp;
  a.hp = 0; a.dead = true;
  const ev = wait(w, 3 * dt), pops = of(ev, 'markPop');
  assert.equal(pops.length, 1); assert.equal(pops[0].why, 'renew'); assert.equal(pops[0].id, b.id);
  assert.ok(Math.abs((hp - b.hp) - vb) < 1e-6);
  assert.ok(Math.abs(markOn(w, b).value - va) < 1e-6, '옮겨 온 자국이 남는다');
});

test('일섬이 그 적을 죽였으면 자국은 곧바로 곁의 적에게 옮겨 간다 — 방에서 자국이 버려지지 않는다', () => {
  const { w, mobs: [weak, b] } = room('cut', [[3, 0, 5], [3, 3]]); give(w, 1);
  const ev = [...slashOnce(w), ...wait(w, 3 * dt)];
  assert.equal(weak.dead, true);
  assert.equal(of(ev, 'markLeave').length, 1);
  assert.equal(of(ev, 'markMove').length, 1);
  const m = markOn(w, b);
  assert.ok(m, '곁의 b가 자국을 받았다');
  assert.ok(Math.abs(m.value - of(ev, 'markLeave')[0].value) < 1e-6);
  assert.ok(m.value > 5 * M.value, '세기는 남은 체력이 아니라 그 일섬의 세기로 친다');
});

test('터뜨리는 회전: 회전 베기가 자국 난 적을 베면 pop배로 터지고 자국이 없어진다', () => {
  const w = sw('cut,pop', { d: 3 }); give(w, 2);
  const value = of(slashOnce(w), 'markLeave')[0].value;
  wait(w, 0.3);
  const hp = w.boss.hp, ev = press(w, 'spin'), pops = of(ev, 'markPop'), spin = of(ev, 'bladeHit').filter(e => e.skill === 'spin')[0];
  assert.equal(of(ev, 'bladeSpin').length, 1);
  assert.equal(pops.length, 1); assert.equal(pops[0].why, 'spin');
  assert.ok(Math.abs(pops[0].dmg - value * M.pop) < 1e-6, `터진 값 ${pops[0].dmg} / 자국 ${value}`);
  assert.ok(Math.abs((hp - w.boss.hp) - (spin.dmg + value * M.pop)) < 1e-6, '회전 베기의 피해에 더해진다');
  assert.equal(markOn(w, w.boss), null);
  assert.equal(of(wait(w, M.keep + 0.2), 'markPop').length, 0, '이미 쓴 자국은 저절로 터지지 않는다');
});

test('터뜨리는 회전이 없으면 회전 베기는 자국을 건드리지 않는다', () => {
  const w = sw('cut', { d: 3 }); give(w, 2); slashOnce(w); wait(w, 0.3);
  assert.equal(of(press(w, 'spin'), 'markPop').length, 0);
  assert.ok(markOn(w, w.boss));
});

test('터뜨리는 회전: 회전 베기가 그 적을 죽였으면 터뜨리지 않고 자국이 옮겨 간다', () => {
  const { w, mobs: [a, b] } = room('cut,pop', [[2.2, 0, 800], [2.2, 2.5]]); give(w, 2);
  slashOnce(w);
  assert.ok(markOn(w, a) && !a.dead);
  a.hp = 1;
  const ev = [...wait(w, 0.3), ...press(w, 'spin'), ...wait(w, 3 * dt)];
  assert.equal(a.dead, true);
  assert.equal(of(ev, 'markPop').filter(e => e.why === 'spin' && e.id === a.id).length, 0);
  assert.ok(of(ev, 'markMove').length >= 1 || of(ev, 'markPop').some(e => e.id === b.id), '자국은 b에게 간다(b도 회전에 베였으면 거기서 터진다)');
});

test('잇는 일섬 + 긋는 칼: 번마다 자국이 남고, 세기는 그 번의 value배다', () => {
  const { w, mobs } = room('cut', [[3, 0], [3, 4], [-2, 4]], { forms: { slash: 'chain' } }); give(w, 1);
  const ev = [...slashOnce(w), ...slashOnce(w), ...slashOnce(w)];
  const leave = of(ev, 'markLeave'), hits = of(ev, 'bladeHit').filter(e => e.skill === 'slash');
  assert.equal(leave.length, 3);
  for (const m of mobs) assert.ok(markOn(w, m), '셋 다 자국');
  for (const l of leave) assert.ok(Math.abs(l.value - hits[0].dmg * M.value) < 1e-6, `자국 ${l.value} / 일섬 ${hits[0].dmg}`);
  const base = sw('cut'); give(base, 1);
  assert.ok(leave[0].value < of(slashOnce(base), 'markLeave')[0].value, '잇는 일섬의 자국은 기본보다 작다');
});

test('방을 다시 하거나 넘어가면 자국은 지워진다', () => {
  const w = createWorld({ char: 'sword', stage: 1, marks: 'cut', ai: false });
  for (let k = 0; k < ticks(4) && !w.enemies.length; k++) { step(w, idle); drainEvents(w); }
  const m = w.enemies.find(e => !e.dead);
  assert.ok(m, '방에 몬스터가 나왔다');
  w.marks.list.push({ foe: m, until: w.time + 3, value: 10 });
  restartRoom(w);
  assert.equal(w.marks.list.length, 0);
});

test('자국의 상태는 해시에 든다', () => {
  const a = sw('cut'), b = sw('cut'); give(a, 1); give(b, 1); slashOnce(a); slashOnce(b);
  assert.equal(stateHash(a), stateHash(b));
  assert.ok(stateHash(a).includes('|m'));
  const h = stateHash(a); a.marks.list[0].value += 1;
  assert.notEqual(stateHash(a), h);
});

test('주소: mark=cut,pop이 자국 카드를 켠다 — 검사에게만', () => {
  const opt = q => worldOptions(new URLSearchParams(q)).marks;
  assert.equal(opt('char=sword&mark=cut,pop'), 'cut,pop');
  assert.equal(opt('char=sword'), null);
  assert.equal(opt('mark=cut'), null, '사수에게는 없다');
});

test('봇 판에서 실제로 돈다: 긋고 터뜨리는 일이 일어나고, 같은 seed면 같은 판', () => {
  const run = () => {
    const w = createWorld({ char: 'sword', seed: 3, store: true, tries: gameTries(null), marks: 'cut,pop' }), bot = createBot('user', 3);
    const n = { leave: 0, spin: 0, time: 0 };
    for (let k = 0; k < ticks(60) && !w.result; k++) { step(w, bot(w)); for (const e of drainEvents(w)) { if (e.type === 'markLeave') n.leave++; if (e.type === 'markPop') n[e.why === 'spin' ? 'spin' : 'time']++; } }
    return { n, hash: stateHash(w), mark: w.stats.dmg.mark };
  };
  const a = run(), b = run();
  assert.equal(a.hash, b.hash);
  assert.ok(a.n.leave >= 2 && a.n.spin >= 1, JSON.stringify(a.n));
  assert.ok(a.mark > 0);
});
