// 검사 첫 판의 전체 검토(2026-11-17)에서 나온 것 — 고치기 전에 먼저 실패하는 것을 본 시험들.
// 살아 있는 보스·기둥이 일섬 중인 몸을 밀어내던 것, 처형이 일섬의 베기를 삼키던 것, 말없이 사라지던 누름, 칼자국 선이 다음 움직임을 따라가던 것.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { gameTries } from '../src/sim/tries.js';
import { storeAdd } from '../src/sim/store.js';
import { separateBodies } from '../src/sim/boss.js';
import { isSword, bladeMoving } from '../src/sim/sword.js';
import { isDodging, hurtPlayer } from '../src/sim/player.js';
import { restartRoom } from '../src/sim/stage.js';
import { spawnMob } from '../src/sim/foes.js';
import { createBot } from '../src/sim/bot.js';
import { lineFollows } from '../src/view/swordView.js';
import { LOOK } from '../src/view/look.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const Sw = RULES.sword, Fi = Sw.finish;
function sw(d = 5, opts = {}) {
  const w = quietWorld({ char: 'sword', ...opts });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.shots.nextAt = 1e9; w.player.blade.cutAt = 1e9;
  return w;
}
const give = (w, n, perfect = true) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: perfect ? RULES.reflect.staggerPerfect : RULES.reflect.staggerNormal, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const U = { ...idle, throw: true }, I = { ...idle, spin: true }, O = { ...idle, orb: true };
const of = (ev, type) => ev.filter(e => e.type === type);
const tick = (w, input = idle) => { step(w, input); return drainEvents(w); };
function room(opts = {}) {
  const w = createWorld({ char: 'sword', stage: 1, seed: 1, tries: gameTries(null), ai: false, ...opts });
  w.shots.nextAt = 1e9; w.player.blade.cutAt = 1e9;
  return w;
}
// 줄에서 벗어난 거리
const offLine = (m, x, z) => { const dx = m.x1 - m.x0, dz = m.z1 - m.z0, len = Math.hypot(dx, dz) || 1; return Math.abs((x - m.x0) * dz - (z - m.z0) * dx) / len; };

// ── 일섬은 몸을 지나간다 — 보스 쪽에서 부르는 몸끼리 판정과 기둥도 밀어내지 않는다
test('일섬으로 가는 중에는 몸끼리 판정이 밀어내지 않는다(보스의 움직임이 부르는 것 포함)', () => {
  const w = sw(5); give(w, 1);
  tick(w, U);
  for (let k = 0; k < 9; k++) tick(w);   // 보스 몸 안까지
  const p = w.player, x = p.x, z = p.z;
  assert.ok(Math.hypot(p.x - w.boss.x, p.z - w.boss.z) < RULES.boss.r + RULES.player.bodyR, '보스 몸과 겹친 자리');
  separateBodies(w);
  assert.equal(p.x, x); assert.equal(p.z, z);
});

test('일섬은 엄폐 기둥도 지나간다 — 가는 동안 줄에서 벗어나지 않는다', () => {
  const w = sw(5, { tries: 'pillars' }); give(w, 1);
  const [cx, cz] = RULES.tries.pillars.at[0];
  w.player.x = w.player.px = cx - 2.5; w.player.z = w.player.pz = cz + 0.4; w.boss.x = cx + 2.5; w.boss.z = cz + 0.4;   // 줄이 기둥 가운데를 비껴 지난다(밀리면 옆으로 벗어난다)
  tick(w, U);
  let n = 0;
  while (bladeMoving(w) && n++ < 40) { const m = w.player.blade.move; tick(w); assert.ok(offLine(m, w.player.x, w.player.z) < 1e-6, `틱 ${n}: 줄에서 ${offLine(m, w.player.x, w.player.z).toFixed(3)} U`); }
  assert.ok(n > 5);
});

test('살아 있는 보스와의 판: 일섬으로 가는 동안 몸이 줄을 벗어나지 않는다(봇 판 두 개)', () => {
  let slashes = 0;
  for (const seed of [3, 7]) {
    const w = createWorld({ char: 'sword', seed, tries: gameTries(null) }), bot = createBot('user', seed);
    for (let k = 0; k < 120 * 45 && !w.result; k++) {
      const before = w.player.blade.move;
      step(w, bot(w)); drainEvents(w);
      if (before && before.kind === 'slash') { slashes++; assert.ok(offLine(before, w.player.x, w.player.z) < 1e-6 || !w.player.blade.move, `seed ${seed} ${w.time.toFixed(2)}초: 줄에서 ${offLine(before, w.player.x, w.player.z).toFixed(2)} U`); }
    }
  }
  assert.ok(slashes > 20, `일섬 틱 ${slashes}`);
});

// ── 처형이 일섬을 끊어도 겨눈 적은 맞는다
test('가는 중에 처형이 시작돼도 일섬의 베기는 들어간다(칸만 쓰고 사라지지 않는다)', () => {
  const w = sw(5); give(w, 2);
  w.boss.groggyUntil = w.time + 3;
  const hp0 = w.boss.hp;
  tick(w, U); for (let k = 0; k < 4; k++) tick(w);
  assert.equal(w.stats.dmg.blade, 0, '아직 닿기 전');
  tick(w, { ...idle, parry: true }); tick(w);
  assert.ok(w.execute);
  assert.ok(w.stats.dmg.blade >= RULES.store.dmg[1] * Sw.slash.dmg - 1e-9, `${w.stats.dmg.blade}`);
  assert.ok(hp0 - w.boss.hp >= RULES.store.dmg[1] * Sw.slash.dmg - 1e-9);
});

// ── 말없이 사라지는 누름이 없다
test('기억해 둔 일섬이 나갈 때 닿는 거리 밖이면 거절 신호가 난다', () => {
  const w = sw(3); give(w, 2);
  tick(w, I); run(w, 0.1);   // lock이 끝나기 0.15초 전(기억하는 0.2초 안)에 누른다
  const ev = [...tick(w, U)];
  w.boss.x += 30;   // lock이 끝나기 전에 멀어졌다(판 밖이어도 된다 — 서 있기만 하는 보스)
  for (let k = 0; k < ticks(Sw.spin.lock) + 2; k++) ev.push(...tick(w));
  assert.deepEqual(of(ev, 'denied').map(e => [e.what, e.why]), [['slash', 'far']]);
  assert.equal(w.player.store.length, 1);
});

test('튕겨 나오기 시작할 때 누른 회피도 선 뒤에 나간다', () => {
  const w = sw(RULES.boss.r + 2); give(w, 1);
  w.player.x = w.player.px = 0; w.boss.x = RULES.boss.r + 2;
  tick(w, O); tick(w, { ...idle, dodge: true });
  run(w, Fi.back + 0.03);
  assert.equal(isDodging(w), true);
});

// ── 검토에서 빠졌다고 한 시험들
test('몬스터 배율은 실제로 곱해진다(지금 값이 1이어도)', () => {
  const mob = Sw.mob; Sw.mob = 1.5;
  try {
    const w = room(); give(w, 1);
    const m = w.enemies[0]; m.x = m.px = w.player.x + 1.5; m.z = m.pz = w.player.z; m.bornAt = -1; m.hp = m.maxHp = 5000;
    tick(w, I);
    assert.ok(Math.abs(m.maxHp - m.hp - RULES.store.dmg[1] * Sw.spin.dmg * 1.5) < 1e-9, `${m.maxHp - m.hp}`);
  } finally { Sw.mob = mob; }
});

test('베기는 방패병의 방패를 지난다(받아친 탄으로 벤다)', () => {
  const w = room(); give(w, 1);
  const p = w.player, m = spawnMob(w, 'shield', p.x + 1.8, p.z, 0);
  m.bornAt = -1; m.face = Math.PI;   // 방패가 나를 본다
  const hp0 = m.hp;
  tick(w, I);
  assert.ok(m.hp < hp0 || m.dead);
});

test('튕겨 나오는 중에도 패링이 열린다', () => {
  const w = sw(RULES.boss.r + 2); give(w, 1);
  w.player.x = w.player.px = 0; w.boss.x = RULES.boss.r + 2;
  tick(w, O);
  const ev = tick(w, { ...idle, parry: true });
  assert.equal(of(ev, 'parryStart').length, 1);
});

test('처형 중에는 스킬이 나가지 않고 칸도 그대로다', () => {
  const w = sw(RULES.boss.r + 1.5); give(w, 2);
  w.boss.groggyUntil = w.time + 3;
  tick(w, { ...idle, parry: true });
  assert.ok(w.execute);
  const ev = tick(w, I);
  assert.deepEqual(of(ev, 'denied').map(e => [e.what, e.why]), [['spin', 'busy']]);
  assert.equal(w.player.store.length, 2);
});

test('스테이지에서 죽고 그 방을 다시 해도 검사다(무기 없음 · 약한 사격 · 스킬)', () => {
  const w = room(); give(w, 1);
  w.player.stock.bomb = 0;
  w.player.hp = 1; hurtPlayer(w, 50, 1, 0, 0);
  assert.equal(w.result, 'lose');
  restartRoom(w);
  assert.equal(isSword(w), true);
  assert.deepEqual(w.weapons.on, []);
  assert.deepEqual(w.player.blade, { move: null, lockUntil: -1, want: null, wantUntil: -1, cuts: [], cutAt: 0, cutN: 0, charge: 0 });
  give(w, 1);
  const ev = tick(w, I);
  assert.equal(of(ev, 'bladeSpin').length, 1);
});

test('주소로 지뢰 실험을 켜도 검사의 O는 마무리만 낸다', () => {
  const w = sw(RULES.boss.r + 2, { tries: 'mine' }); give(w, 2);
  const ev = tick(w, O);
  assert.equal(of(ev, 'bladeFinish').length, 1);
  assert.equal(of(ev, 'mineSet').length, 0);
  assert.equal(w.tries.mines.length, 0);
});

// ── 칼자국 선(화면): 제 움직임만 따라간다
test('칼자국 선은 제 움직임이 가는 동안만 몸을 따라간다 — 다음 일섬·판이 끝난 뒤에는 따라가지 않는다', () => {
  const m1 = { kind: 'slash' }, m2 = { kind: 'slash' }, line = { live: 'slash', move: m1 };
  assert.equal(lineFollows(line, m1, null), true);
  assert.equal(lineFollows(line, m2, null), false, '이어서 나간 다음 일섬');
  assert.equal(lineFollows(line, null, null), false, '움직임이 끝났다');
  assert.equal(lineFollows(line, m1, 'win'), false, '베어서 판이 끝났다 — 선이 굳어 남지 않게');
  assert.equal(lineFollows({ live: null, move: m1 }, m1, null), false);
});

test('칼자국 그리기의 수치는 LOOK.sword에 있다', () => {
  const V = LOOK.sword;
  for (const v of [V.sweep.seg, V.trail.thin, V.mark.y, V.mark.pulse[0], V.mark.pulse[1]]) assert.ok(Number.isFinite(v));
});
