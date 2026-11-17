// 검사(근접 캐릭터 — 설계 2026-11-17-barrage-sword-design.md): 주소 char=sword로 여는 두 번째 캐릭터.
// 약한 자동 사격 · 무기 없음 · 받아쳐 모은 칸을 스킬로 쓴다(U 일섬 · I 회전 베기 · O 마무리). 사수 판은 그대로다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { gameTries } from '../src/sim/tries.js';
import { storeAdd } from '../src/sim/store.js';
import { isSword, slashLanding, bladeMoving, spinReach, finishReach } from '../src/sim/sword.js';
import { isInvuln, hurtPlayer, isDodging } from '../src/sim/player.js';
import { restartRoom } from '../src/sim/stage.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const Sw = RULES.sword;
// 검사 판: 보스는 오른쪽 d U에 서 있고 평타는 끈다(보스 체력을 스킬만으로 본다)
function sw(d = 5, opts = {}) {
  const w = quietWorld({ char: 'sword', ...opts });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.shots.nextAt = 1e9; w.player.blade.cutAt = 1e9;
  w.player.swords = null;   // 이기어검은 끈다 — 여기서는 스킬 본체만 본다(검은 swords.test.mjs)
  return w;
}
const give = (w, n, perfect = true) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: perfect ? RULES.reflect.staggerPerfect : RULES.reflect.staggerNormal, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };

// ── 캐릭터 옵션과 검사의 몸
test('검사 수치는 모두 유한한 수', () => {
  const walk = (o, path) => { for (const [k, v] of Object.entries(o)) { if (Array.isArray(v) && typeof v[0] === 'string') continue; if (v && typeof v === 'object') walk(v, `${path}.${k}`); else assert.ok(Number.isFinite(v), `${path}.${k} = ${v}`); } };
  walk(Sw, 'sword');
});

test('기본은 사수 — char를 안 주거나 모르는 값이면 gunner', () => {
  assert.equal(createWorld({ ai: false }).opts.char, 'gunner');
  assert.equal(createWorld({ ai: false, char: 'nope' }).opts.char, 'gunner');
  assert.equal(isSword(createWorld({ ai: false })), false);
  assert.equal(isSword(createWorld({ ai: false, char: 'sword' })), true);
});

test('검사 판: 모아 받기가 켜지고, gear를 줘도 무기가 없다', () => {
  const w = createWorld({ char: 'sword', gear: 'all', store: false, ai: false });
  assert.equal(w.opts.store, true);
  assert.deepEqual(w.weapons.on, []);
});

test('검사 판(스테이지): 시작 무기가 없고 저격이 켜지지 않는다 — 늘 나가는 무기 판의 배율(보스·몬스터)은 그대로', () => {
  const g = createWorld({ stage: 1, tries: gameTries(null), ai: false }), w = createWorld({ char: 'sword', stage: 1, tries: gameTries(null), ai: false });
  assert.deepEqual(g.weapons.on, ['missile'], '사수는 그대로 시작 무기를 든다');
  assert.deepEqual(w.weapons.on, []);
  assert.equal(w.tries.snipe, null);
  assert.ok(w.tries.on.always && w.tries.on.vary);
  assert.equal(w.enemies.length, g.enemies.length);
  assert.equal(w.enemies[0].maxHp, g.enemies[0].maxHp);
  const gb = createWorld({ tries: gameTries(null), store: true, ai: false }), wb = createWorld({ char: 'sword', tries: gameTries(null), ai: false });
  assert.equal(wb.boss.maxHp, gb.boss.maxHp, '보스 체력은 캐릭터와 무관하다');
});

// 기본 공격(칼바람)과 둘레의 시험은 swordWave.test.mjs

test('검사 판에서 U는 던지기가 아니다 — 닿지 않는 거리에서 눌러도 칸이 그대로다', () => {
  const w = sw(12); give(w, 3);
  step(w, { ...idle, throw: true }); run(w, 0.3);
  assert.equal(w.player.store.length, 3);
  assert.equal(w.stats.throws, 0);
});

test('사수 판 통계에는 blade가 0으로만 있다', () => {
  const w = quietWorld({ store: true });
  w.boss.x = w.player.x + 3; w.boss.z = w.player.z;
  run(w, 1);
  assert.equal(w.stats.dmg.blade, 0);
  assert.deepEqual(w.stats.blade, { slash: 0, spin: 0, finish: 0 });
  assert.ok(w.stats.total > 0);
});

// ── 스킬 틀과 회전 베기(I)
const U = { ...idle, throw: true }, I = { ...idle, spin: true }, O = { ...idle, orb: true };
const of = (ev, type) => ev.filter(e => e.type === type);
const tick = (w, input = idle) => { step(w, input); return drainEvents(w); };
// 스테이지 1의 첫 방(검사) — 몬스터는 아직 등장 전. place로 하나씩 곁에 세운다
function room(opts = {}) {
  const w = createWorld({ char: 'sword', stage: 1, seed: 1, tries: gameTries(null), ai: false, ...opts });
  w.shots.nextAt = 1e9; w.player.blade.cutAt = 1e9;
  return w;
}
const place = (w, k, x, z) => { const m = w.enemies[k]; m.x = m.px = x; m.z = m.pz = z; m.bornAt = -1; return m; };

test('회전 베기: 한 칸을 쓰고, 닿는 적을 그 틱에 벤다 — 칸의 피해 × spin.dmg, 무너짐 × spin.stag, 회복은 칸마다', () => {
  const w = sw(RULES.boss.r + Sw.spin.R - 0.1); give(w, 2);
  w.player.hp = 50; const hp0 = w.boss.hp;
  const ev = tick(w, I);
  assert.equal(w.player.store.length, 1);
  assert.ok(Math.abs(hp0 - w.boss.hp - RULES.store.dmg[1] * Sw.spin.dmg) < 1e-9);
  assert.ok(Math.abs(w.boss.stagger - RULES.reflect.staggerPerfect * Sw.spin.stag) < 1e-9);
  assert.equal(w.player.hp, 50 + RULES.store.heal[1]);
  assert.equal(of(ev, 'bladeSpin').length, 1);
  assert.deepEqual(of(ev, 'bladeHit').map(e => [e.skill, e.id]), [['spin', 0]]);
  assert.equal(w.stats.dmg.blade, hp0 - w.boss.hp);
  assert.equal(w.stats.blade.spin, 1);
});

test('회전 베기: 닿는 적이 없으면 나가지 않는다(칸은 그대로, 거절 신호) — 거리는 몸 표면까지 spin.R', () => {
  const w = sw(RULES.boss.r + Sw.spin.R + 0.1); give(w, 1, false);
  w.player.hp = 50; const hp0 = w.boss.hp;
  const ev = tick(w, I);
  assert.equal(w.player.store.length, 1, '칸이 날아가지 않는다');
  assert.equal(w.boss.hp, hp0);
  assert.equal(w.player.hp, 50, '헛쳐서 회복하지도 않는다');
  assert.equal(of(ev, 'bladeSpin').length, 0);
  assert.deepEqual(of(ev, 'denied').map(e => [e.what, e.why]), [['spin', 'far']]);
  assert.equal(w.stats.blade.spin, 0);
  assert.equal(spinReach(w), false);
  w.boss.x -= 0.2;
  assert.equal(spinReach(w), true);
  assert.equal(of(tick(w, I), 'bladeSpin')[0].hits, 1);
});

test('회전 베기 뒤 lock 동안은 다음 스킬이 기다렸다가 나간다(누름을 buffer만큼 기억) — 한 번 누름에 한 번만', () => {
  const w = sw(3); give(w, 3);
  tick(w, I); run(w, 0.1);
  tick(w, I);
  assert.equal(w.player.store.length, 2, 'lock 안: 아직');
  run(w, Sw.spin.lock - 0.1);
  assert.equal(w.player.store.length, 1, '기억한 누름이 lock이 끝나는 틱에 나간다');
  run(w, 1);
  assert.equal(w.player.store.length, 1);
});

test('기억은 buffer까지만: lock이 끝나기 훨씬 전에 누른 것은 버려진다', () => {
  const w = sw(3); give(w, 3);
  const lock = Sw.spin.lock; Sw.spin.lock = 0.5;
  try { tick(w, I); tick(w, I); run(w, 1); assert.equal(w.player.store.length, 2); } finally { Sw.spin.lock = lock; }
});

test('칸이 없으면 나가지 않고 거절 신호만(누른 그 틱에 한 번)', () => {
  const w = sw(3);
  const ev = [...tick(w, I), ...tick(w), ...tick(w)];
  assert.deepEqual(of(ev, 'denied').map(e => [e.what, e.why]), [['spin', 'empty']]);
  assert.equal(of(ev, 'bladeSpin').length, 0);
});

test('못 쓰는 때(구제 창 · 판이 끝남)에는 나가지 않고 칸도 그대로다', () => {
  for (const block of [w => { w.player.dyingAt = w.time + 1; }, w => { w.result = 'lose'; }]) {
    const w = sw(3); give(w, 2); block(w);
    const ev = tick(w, I);
    assert.equal(w.player.store.length, 2);
    assert.deepEqual(of(ev, 'denied').map(e => e.why), ['busy']);
  }
});

test('몬스터에게는 피해 × sword.mob, 둘레의 적을 모두 벤다', () => {
  const w = room(); give(w, 1);
  const p = w.player, a = place(w, 0, p.x + 1.5, p.z), b = place(w, 1, p.x, p.z + 2), c = place(w, 2, p.x - 6, p.z);
  for (const m of [a, b, c]) m.hp = m.maxHp = 5000;   // 한 번에 죽지 않게(피해가 남은 체력에서 잘리지 않는다)
  const ev = tick(w, I), want = RULES.store.dmg[1] * Sw.spin.dmg * Sw.mob;
  for (const m of [a, b]) assert.ok(Math.abs(m.maxHp - m.hp - want) < 1e-9, `${m.maxHp - m.hp}`);
  assert.equal(c.hp, c.maxHp);
  assert.equal(of(ev, 'bladeHit').length, 2);
});

test('회전 베기 직후에도 패링이 나가고 걷기가 듣는다', () => {
  const w = sw(3); give(w, 1);
  tick(w, I);
  const x0 = w.player.x, ev = tick(w, { ...idle, parry: true, mx: -1 });
  assert.equal(of(ev, 'parryStart').length, 1);
  assert.ok(w.player.x < x0);
});

test('사수 판에서는 I·O가 검사 스킬을 내지 않는다', () => {
  const w = quietWorld({ store: true }); give(w, 2);
  const ev = [...tick(w, I), ...tick(w, O)];
  assert.equal(ev.filter(e => e.type.startsWith('blade')).length, 0);
  assert.equal(w.player.store.length, 2);
});

// ── 일섬(U)
const far = RULES.boss.r + RULES.player.bodyR + Sw.slash.past;   // 건너편에 서는 거리(보스 가운데에서)

test('일섬: 한 칸을 쓰고 겨눈 적을 지나 건너편에 선다 — 칸의 피해 × slash.dmg, 무너짐 × slash.stag', () => {
  const w = sw(5); give(w, 2);
  const hp0 = w.boss.hp, bx = w.boss.x, ev = [...tick(w, U)];
  for (let k = 0; k < ticks(Sw.slash.dur) + 1; k++) ev.push(...tick(w));
  assert.equal(w.player.store.length, 1);
  assert.ok(Math.abs(w.player.x - (bx + far)) < 1e-6 && Math.abs(w.player.z - w.boss.z) < 1e-6, `${w.player.x}`);
  assert.ok(Math.abs(hp0 - w.boss.hp - RULES.store.dmg[1] * Sw.slash.dmg) < 1e-9);
  assert.ok(Math.abs(w.boss.stagger - RULES.reflect.staggerPerfect * Sw.slash.stag) < 1e-9);
  assert.equal(of(ev, 'bladeSlash').length, 1);
  assert.deepEqual(of(ev, 'bladeHit').map(e => e.skill), ['slash']);
  assert.deepEqual(of(ev, 'bladeEnd').map(e => e.skill), ['slash']);
  assert.equal(w.stats.blade.slash, 1);
  assert.equal(bladeMoving(w), false);
});

test('닿는 거리: 몸 표면까지 slash.reach — 밖이면 나가지 않고 칸도 그대로(거절 far)', () => {
  const w = sw(RULES.boss.r + Sw.slash.reach + 0.2); give(w, 1);
  tick(w);
  assert.equal(slashLanding(w), null);
  const ev = tick(w, U);
  assert.deepEqual(of(ev, 'denied').map(e => [e.what, e.why]), [['slash', 'far']]);
  assert.equal(w.player.store.length, 1);
  w.boss.x -= 0.4;
  const land = slashLanding(w);
  assert.ok(land && Math.abs(land.x - (w.boss.x + far)) < 1e-9);
  assert.equal(slashLanding(quietWorld({ store: true })), null, '사수 판에는 설 자리가 없다');
});

test('일섬의 무적: 가는 동안 + 선 뒤 after — 그 뒤에는 맞는다', () => {
  const w = sw(5); give(w, 1); tick(w, U);
  run(w, Sw.slash.dur / 2);
  assert.equal(isInvuln(w), true);
  assert.equal(hurtPlayer(w, 10, 1, 0, 0), false);
  run(w, Sw.slash.dur / 2 + Sw.slash.after - 0.03);
  assert.equal(isInvuln(w), true);
  run(w, 0.06);
  assert.equal(isInvuln(w), false);
});

test('가는 동안 이동 입력은 듣지 않고, 패링은 열린다', () => {
  const w = sw(5); give(w, 1); tick(w, U);
  const x0 = w.player.x, ev = tick(w, { ...idle, mz: 1, parry: true });
  assert.equal(w.player.z, w.boss.z);
  assert.ok(w.player.x > x0);
  assert.equal(of(ev, 'parryStart').length, 1);
});

test('줄 위의 적을 모두 한 번씩 벤다 — 건너편은 겨눈 적 기준', () => {
  const w = room(); give(w, 1);
  const p = w.player, x0 = p.x, a = place(w, 0, p.x + 3, p.z), b = place(w, 1, p.x + 5, p.z), c = place(w, 2, p.x + 3, p.z + 4);
  const ev = [...tick(w, U)]; for (let k = 0; k < ticks(Sw.slash.dur) + 2; k++) ev.push(...tick(w));
  const want = RULES.store.dmg[1] * Sw.slash.dmg * Sw.mob;
  assert.equal(of(ev, 'bladeHit').length, 2);
  for (const m of [a, b]) assert.ok(m.dead || Math.abs(m.maxHp - m.hp - want) < 1e-9, `${m.maxHp - m.hp}`);
  assert.equal(c.hp, c.maxHp);
  assert.ok(p.x > x0 + 3 + a.r, '겨눈 적(가까운 쪽)의 건너편');
});

test('겨눈 적이 그 사이 움직여도 반드시 맞는다', () => {
  const w = sw(5); give(w, 1);
  const hp0 = w.boss.hp;
  tick(w, U); w.boss.z += 4;
  run(w, Sw.slash.dur + 0.05);
  assert.ok(Math.abs(hp0 - w.boss.hp - RULES.store.dmg[1] * Sw.slash.dmg) < 1e-9);
});

test('연달아 누르면 건너편에서 다시 지나온다(누름 기억)', () => {
  const w = sw(5); give(w, 2);
  tick(w, U); run(w, 0.05); tick(w, U); run(w, 0.6);
  assert.equal(w.player.store.length, 0);
  assert.equal(w.stats.blade.slash, 2);
  assert.ok(w.player.x < w.boss.x);
});

test('보스가 난간에 붙어 있으면 판 안에서 멈추고 몸과 겹치지 않는다', () => {
  const w = sw(5); give(w, 1);
  w.boss.x = RULES.board.hx - RULES.boss.r; w.player.x = w.player.px = w.boss.x - 5;
  const hp0 = w.boss.hp;
  tick(w, U); run(w, 0.5);
  const d = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
  assert.ok(d >= RULES.boss.r + RULES.player.bodyR - 1e-6, `${d}`);
  assert.ok(Math.abs(w.player.x) <= RULES.board.hx - RULES.player.bodyR + 1e-9 && Math.abs(w.player.z) <= RULES.board.hz - RULES.player.bodyR + 1e-9);
  assert.ok(w.boss.hp < hp0);
});

test('가는 중에 처형이 시작되면 일섬은 거기서 끝난다(끝점으로 튀지 않는다)', () => {
  const w = sw(5); give(w, 2);
  w.boss.groggyUntil = w.time + 3;
  tick(w, U); for (let k = 0; k < 4; k++) tick(w);
  tick(w, { ...idle, parry: true }); tick(w);
  assert.ok(w.execute, '처형이 시작됐다');
  assert.equal(w.player.blade.move, null);
  run(w, 1.2);
  assert.equal(w.execute, null);
  assert.ok(w.player.x < w.boss.x, '일섬의 끝점(건너편)으로 옮겨지지 않았다');
});

test('가는 중에 누른 회피는 기억했다가 선 뒤에 나간다', () => {
  const w = sw(5); give(w, 1);
  tick(w, U); run(w, Sw.slash.dur - 0.05);
  tick(w, { ...idle, dodge: true });
  assert.equal(isDodging(w), false);
  run(w, 0.07);
  assert.equal(isDodging(w), true);
});

test('방을 넘어가면 하던 움직임은 끊긴다', () => {
  const w = room(); give(w, 1);
  place(w, 0, w.player.x + 3, w.player.z);
  tick(w, U); tick(w);
  assert.equal(bladeMoving(w), true);
  restartRoom(w);
  assert.equal(bladeMoving(w), false);
  const [sx, sz] = RULES.start.player;
  tick(w);
  assert.ok(Math.abs(w.player.x - sx) < 1e-9 && Math.abs(w.player.z - sz) < 1e-9);
});

// ── 마무리(O)
const Fi = Sw.finish;
// 판 가운데에 서고 보스는 오른쪽 d U(튕길 자리가 난간에 막히지 않게)
function mid(d = RULES.boss.r + 2) {
  const w = sw(d);
  w.player.x = w.player.px = 0; w.boss.x = d;
  return w;
}

test('마무리: 남은 칸을 다 쓰고 앞의 적을 한 번에 벤다 — 칸마다 피해 × finish.dmg, 무너짐 × finish.stag, 회복도 칸마다', () => {
  const w = mid(); give(w, 3);
  w.player.hp = 50; const hp0 = w.boss.hp;
  const ev = tick(w, O);
  assert.equal(w.player.store.length, 0);
  assert.ok(Math.abs(hp0 - w.boss.hp - 3 * RULES.store.dmg[1] * Fi.dmg) < 1e-9);
  assert.ok(Math.abs(w.boss.stagger - 3 * RULES.reflect.staggerPerfect * Fi.stag) < 1e-9);
  assert.equal(w.player.hp, 50 + 3 * RULES.store.heal[1]);
  const fin = of(ev, 'bladeFinish');
  assert.equal(fin.length, 1);
  assert.equal(fin[0].n, 3);
  assert.ok(Math.abs(fin[0].dmg - (hp0 - w.boss.hp)) < 1e-9);
  assert.deepEqual(of(ev, 'bladeHit').map(e => e.skill), ['finish']);
  assert.equal(w.stats.blade.finish, 1);
});

test('튕김: 이동 키가 없으면 겨눈 적의 반대쪽으로 backDist — 그동안 + after 무적', () => {
  const w = mid(); give(w, 1);
  const x0 = w.player.x, ev = [...tick(w, O)];
  run(w, Fi.back / 2);
  assert.equal(isInvuln(w), true);
  assert.equal(bladeMoving(w), true);
  for (let k = 0; k < ticks(Fi.back / 2) + 3; k++) ev.push(...tick(w));
  assert.ok(Math.abs(x0 - w.player.x - Fi.backDist) < 1e-6, `${x0 - w.player.x}`);
  assert.equal(w.player.z, 0);
  assert.deepEqual(of(ev, 'bladeEnd').map(e => e.skill), ['finish']);
  assert.equal(isInvuln(w), true, '선 뒤 after');
  run(w, Fi.after + 0.02);
  assert.equal(isInvuln(w), false);
});

test('튕김: 이동 키를 누르고 있으면 그쪽으로', () => {
  const w = mid(); give(w, 1);
  const x0 = w.player.x, z0 = w.player.z;
  tick(w, { ...O, mz: 1 });
  run(w, Fi.back + 0.02, { ...idle, mz: 1 });
  assert.ok(w.player.z - z0 >= Fi.backDist - 1e-6);
  assert.ok(Math.abs(w.player.x - x0) < 1e-6);
});

test('부채 밖(등 뒤)의 적은 맞지 않는다', () => {
  const w = room(); give(w, 2);
  const p = w.player, front = place(w, 0, p.x + 1.5, p.z), behind = place(w, 1, p.x - 2.2, p.z), side = place(w, 2, p.x + 1.2, p.z + 1.6);
  const ev = tick(w, O), want = 2 * RULES.store.dmg[1] * Fi.dmg * Sw.mob;
  assert.ok(front.dead || Math.abs(front.maxHp - front.hp - want) < 1e-9);
  assert.equal(behind.hp, behind.maxHp);
  assert.ok(side.dead || side.hp < side.maxHp, '옆 앞(부채 안)은 맞는다');
  assert.equal(of(ev, 'bladeFinish')[0].hits, 2);
});

test('마무리: 닿는 적이 없으면 나가지 않는다(칸은 그대로, 튕기지도 않는다)', () => {
  const w = mid(RULES.boss.r + Fi.R + 0.3); give(w, 2);
  w.player.hp = 50; const hp0 = w.boss.hp, x0 = w.player.x;
  const ev = tick(w, O);
  run(w, Fi.back + 0.05);
  assert.equal(w.player.store.length, 2, '칸이 날아가지 않는다');
  assert.equal(w.boss.hp, hp0);
  assert.equal(of(ev, 'bladeFinish').length, 0);
  assert.deepEqual(of(ev, 'denied').map(e => [e.what, e.why]), [['finish', 'far']]);
  assert.equal(w.player.hp, 50);
  assert.equal(w.player.x, x0);
  assert.equal(finishReach(w), false);
});

test('난간에 막히면 거기서 멈춘다', () => {
  const w = sw(); give(w, 1);
  const edge = -(RULES.board.hx - RULES.player.bodyR);
  w.player.x = w.player.px = edge; w.boss.x = edge + RULES.boss.r + 2;
  tick(w, O); run(w, Fi.back + 0.05);
  assert.ok(Math.abs(w.player.x - edge) < 1e-9);
});

test('튕기는 동안 걷기는 듣지 않고, 끝나면 듣는다', () => {
  const w = mid(); give(w, 1);
  tick(w, O); tick(w, { ...idle, mz: 1 });
  assert.equal(w.player.z, 0);
  run(w, Fi.back + 0.05); tick(w, { ...idle, mz: 1 });
  assert.ok(w.player.z > 0);
});

test('한 틱에 U·I·O를 같이 눌러도 하나만 나간다', () => {
  const w = sw(3); give(w, 3);
  const ev = [...tick(w, { ...idle, throw: true, spin: true, orb: true })]; for (let k = 0; k < 60; k++) ev.push(...tick(w));
  assert.equal(ev.filter(e => e.type === 'bladeSlash' || e.type === 'bladeSpin' || e.type === 'bladeFinish').length, 1);
  assert.equal(w.player.store.length, 2);
});

test('일섬 → 회전 베기 → 마무리를 연달아 눌러도 차례로 다 나간다', () => {
  const w = sw(5); give(w, 4);
  const ev = [...tick(w, U)];
  const go = sec => { for (let k = 0; k < ticks(sec); k++) ev.push(...tick(w)); };
  go(0.06); ev.push(...tick(w, I)); go(0.2); ev.push(...tick(w, I)); go(0.2); ev.push(...tick(w, O)); go(0.6);
  const order = ev.filter(e => ['bladeSlash', 'bladeSpin', 'bladeFinish'].includes(e.type)).map(e => e.type);
  assert.deepEqual(order, ['bladeSlash', 'bladeSpin', 'bladeSpin', 'bladeFinish']);
  assert.equal(w.player.store.length, 0);
  assert.equal(of(ev, 'bladeFinish')[0].n, 1);
});

test('검사는 숫자 키(시험용 무기 켜기)로도 무기를 들 수 없다', () => {
  const w = sw(5);
  for (const n of [1, 2, 3, 4]) tick(w, { ...idle, toggle: n });
  assert.deepEqual(w.weapons.on, []);
  const g = quietWorld({ store: true }); step(g, { ...idle, toggle: 1 });
  assert.deepEqual(g.weapons.on, ['missile'], '사수 판은 그대로');
});

// ── 이동기 카드와 스킬의 움직임(검사가 고를 수 있는 카드: 갈고리 · 자리 바꾸기)
test('갈고리로 끌려가다 일섬을 쓰면 줄을 놓는다 — 일섬의 길이 흐트러지지 않는다', () => {
  const w = sw(5, { tries: 'sky' }); give(w, 1);
  tick(w, { ...idle, move1: true, mx: -0.3, mz: -0.95 });
  assert.ok(w.tries.rope.to, '줄이 걸렸다');
  tick(w); tick(w, U); run(w, 0.4);
  assert.equal(w.tries.rope.to, null);
  const d = Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);   // 줄에 끌려 비껴난 자리에서 눌렀으니 건너편도 그 줄 위다 — 보스 가운데에서 far
  assert.ok(Math.abs(d - far) < 1e-6 && w.player.x > w.boss.x, `${w.player.x.toFixed(2)}, ${w.player.z.toFixed(2)}`);
});

test('일섬으로 가는 중에는 자리 바꾸기가 듣지 않는다', () => {
  const w = room({ kit: ['swap'] }); give(w, 1);
  const p = w.player, a = place(w, 0, p.x + 3, p.z);
  a.hp = a.maxHp = 5000;
  const ax = a.x;
  tick(w, U); tick(w);
  const ev = tick(w, { ...idle, move1: true });
  assert.equal(of(ev, 'swap').length, 0);
  run(w, 0.3);
  assert.ok(Math.abs(a.x - ax) < 0.5, '몬스터는 제자리(조금 걸었을 뿐)');
  assert.ok(p.x > ax + a.r, '나는 건너편에');
});
