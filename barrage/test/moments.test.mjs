// 큰 고비와 상태 연출(사용자 2026-11-16 "전반적으로 연출 보강"): 2단계 넘어감 · 승리 · 패배 · 반격 기회(과열) · 체력 위태.
// 화면과 소리만 — 판정은 그대로(사건에 자리만 더 실린다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeel } from '../src/view/feel.js';
import { createTimeFx } from '../src/view/timeFx.js';
import { resultAlpha } from '../src/view/hud.js';
import { LOOK } from '../src/view/look.js';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { hurtPlayer } from '../src/sim/player.js';
import { damageBoss } from '../src/sim/boss.js';
import { RULES } from '../src/sim/rules.js';
import { idle } from './helpers.mjs';

function fake(name, calls) {
  return new Proxy({}, { get: (_, m) => (...args) => { calls.push([`${name}.${String(m)}`, ...args]); return 0.06; } });
}
function rig() {
  const calls = [], timeFx = createTimeFx(LOOK);
  const spyTime = { hitstop: (...a) => { calls.push(['timeFx.hitstop', ...a.slice(1)]); return timeFx.hitstop(...a); }, slow: (...a) => { calls.push(['timeFx.slow', ...a.slice(1)]); return timeFx.slow(...a); }, scaleAt: t => timeFx.scaleAt(t) };
  const feel = createFeel({ timeFx: spyTime, camera: fake('camera', calls), fx: fake('fx', calls), sfx: fake('sfx', calls), actors: fake('actors', calls), hud: fake('hud', calls), LOOK });
  return { feel, calls, has: n => calls.filter(c => c[0] === n) };
}
const ev = (type, data = {}, t = 0) => ({ type, t, ...data });
const finite = (o, path) => { for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) assert.ok(Number.isFinite(x), `${path}.${k} = ${v}`); };

test('연출 수치는 모두 유한한 수', () => {
  for (const k of ['phase', 'death', 'playerDeath', 'result', 'lowHp', 'overdrive']) finite(LOOK.feel[k], `LOOK.feel.${k}`);
  for (const n of ['heartbeat', 'shatter']) assert.ok(Number.isFinite(LOOK.sound.db[n]), `소리 ${n}`);
  for (const c of ['board2', 'grid2', 'railTop2']) assert.ok(/^#[0-9a-f]{6}$/i.test(LOOK.colors[c]), c);
});

test('사건에 자리가 실린다: 2단계 넘어감 = 보스 자리, 죽음 = 플레이어 자리', () => {
  const w = createWorld({ seed: 2 });
  w.player.invulnUntil = 1e9;
  damageBoss(w, w.boss.maxHp * 0.6, 'shot');
  step(w, idle);
  const ph = drainEvents(w).find(e => e.type === 'phase');
  assert.ok(ph && Number.isFinite(ph.x) && Number.isFinite(ph.z), JSON.stringify(ph));
  const d = createWorld({ seed: 2, ai: false });
  d.player.stock.bomb = 0;
  hurtPlayer(d, 1e6, 1, 0, 0);
  const pd = drainEvents(d).find(e => e.type === 'playerDeath');
  assert.ok(pd && pd.x === d.player.x && pd.z === d.player.z, JSON.stringify(pd));
});

test('2단계 넘어감: 정지·당김·자주 파편과 가장자리·큰 글자·보스 몸 부풂·포효', () => {
  const { feel, has } = rig(), P = LOOK.feel.phase;
  feel.handle([ev('phase', { n: 2, x: 3, z: 1 })], 1);
  assert.deepEqual(has('timeFx.hitstop')[0].slice(1, 2), [P.stop]);
  assert.equal(has('camera.punch').length, 1);
  assert.ok(has('fx.burst').some(c => c[1] === 3 && c[2] === 1 && c[3] === 'purple'));
  assert.ok(has('fx.edge').some(c => c[1] === 'purple'));
  assert.ok(has('hud.banner').some(c => c[2] === '2단계'));
  assert.equal(has('actors.bossPulse').length, 1);
  assert.ok(has('sfx.play').some(c => c[1] === 'roar'));
});

test('승리: 카메라 당김·금빛 가장자리, 그 뒤 파편이 몇 번 더 터진다', () => {
  const { feel, has } = rig(), D = LOOK.feel.death;
  feel.handle([ev('bossDeath', { x: 4, z: 0 })], 10);
  assert.equal(has('camera.hold').length, 1);
  assert.ok(has('fx.edge').some(c => c[1] === 'gold'));
  const before = has('fx.burst').length;
  feel.handle([], 10 + D.chunks[0] + 0.01);
  assert.ok(has('fx.burst').length > before, '첫 파편이 안 터짐');
  assert.ok(has('sfx.play').some(c => c[1] === 'shatter'));
  feel.handle([], 10 + D.chunks.at(-1) + D.finalAfter + 0.01);
  assert.ok(has('fx.burst').length >= before + D.chunks.length + 1, '마지막 파편이 안 터짐');
});

test('패배: 느려짐·청록 파편·붉은 가장자리, 플레이어가 사라진다', () => {
  const { feel, has } = rig();
  feel.handle([ev('playerDeath', { x: -2, z: 1 })], 5);
  assert.equal(has('timeFx.slow').length, 1);
  assert.ok(has('fx.burst').some(c => c[1] === -2 && c[2] === 1 && c[3] === 'cyan'));
  assert.ok(has('fx.edge').some(c => c[1] === 'red'));
  assert.equal(has('actors.playerDown').length, 1);
});

test('체력 위태(25% 이하): 심장 소리가 박자마다 한 번, 끝난 판·넉넉한 체력에선 없음', () => {
  const { feel, has } = rig(), L = LOOK.feel.lowHp, max = RULES.player.hp;
  const w = { player: { hp: max * L.at - 1 }, rules: RULES, result: null };
  const beats = () => has('sfx.play').filter(c => c[1] === 'heartbeat').length;
  feel.tick(w, 1); assert.equal(beats(), 1);
  feel.tick(w, 1 + L.beat * 0.5); assert.equal(beats(), 1);
  feel.tick(w, 1 + L.beat + 0.01); assert.equal(beats(), 2);
  feel.tick({ ...w, player: { hp: max } }, 10); assert.equal(beats(), 2);
  feel.tick({ ...w, result: 'lose' }, 20); assert.equal(beats(), 2);
  feel.tick({ ...w, player: { hp: 0 } }, 30); assert.equal(beats(), 2);
});

test('결과 화면은 늦게 뜬다: 승리 1.6초·패배 1.0초 뒤 서서히', () => {
  const R = LOOK.feel.result;
  assert.equal(resultAlpha(null, 5, R), 0);
  assert.equal(resultAlpha('win', R.winDelay - 0.01, R), 0);
  assert.ok(Math.abs(resultAlpha('win', R.winDelay + R.fade / 2, R) - 0.5) < 1e-9);
  assert.equal(resultAlpha('win', R.winDelay + R.fade + 1, R), 1);
  assert.equal(resultAlpha('lose', R.loseDelay - 0.01, R), 0);
  assert.equal(resultAlpha('lose', R.loseDelay + R.fade, R), 1);
});

// ── 남은 연출(사용자 2026-11-16 "4번 먼저"): 탄 발사 박자 · 보스 체력 구간 · 무기 가동 · 시작 장면
import { K } from '../src/sim/rules.js';
import { createIntro } from '../src/view/intro.js';

test('남은 연출 수치는 모두 유한한 수', () => {
  for (const k of ['volley', 'bossChunks', 'aura', 'intro']) finite(LOOK.feel[k], `LOOK.feel.${k}`);
  for (const n of ['puff', 'puffBg', 'gearSleep']) assert.ok(Number.isFinite(LOOK.sound.db[n]), `소리 ${n}`);
  for (const b of ['ranged', 'dragon']) assert.ok(typeof LOOK.names[b] === 'string' && LOOK.names[b].length > 0, `이름 ${b}`);
});

test('보라·빨강 탄 발사: 한 묶음에 한 번 낮은 소리와 발사 자리 불꽃(짧은 간격은 건너뜀), 바탕 탄막은 더 작게', () => {
  const { feel, has } = rig(), V = LOOK.feel.volley;
  const puffs = n => has('sfx.play').filter(c => c[1] === n).length;
  feel.handle([ev('fire', { kind: K.NORMAL, x: 1, z: 0, src: 1 }), ev('fire', { kind: K.NORMAL, x: 1, z: 1, src: 1 }), ev('fire', { kind: K.WHITE, x: 1, z: 2, src: 1 })], 1);
  assert.equal(puffs('puff'), 1);
  assert.equal(puffs('ping'), 1);
  assert.equal(has('fx.spark').filter(c => c[3] === 'purple').length, 1);
  assert.equal(has('actors.bossKick').length, 1);
  feel.handle([ev('fire', { kind: K.NORMAL, x: 1, z: 0, src: 1 })], 1 + V.gap * 0.5);
  assert.equal(puffs('puff'), 1, '너무 촘촘히 울림');
  feel.handle([ev('fire', { kind: K.RED, x: 1, z: 0, src: 3 })], 1 + V.gap + 0.01);
  assert.equal(puffs('puff'), 2);
  feel.handle([ev('fire', { kind: K.NORMAL, x: 0, z: 0, src: RULES.src.background })], 3);
  assert.equal(puffs('puffBg'), 1);
  assert.equal(has('actors.bossKick').length, 2, '바탕 탄막에 몸이 튐');
});

test('보스 체력 75%·25%를 지날 때 파편이 떨어진다(처음 값·2단계 시작에는 없음)', () => {
  const { feel, has } = rig();
  const w = r => ({ player: { hp: 90, x: 0, z: 0 }, boss: { hp: r * 100, maxHp: 100, x: 5, z: 0 }, rules: RULES, result: null, time: 0 });
  const n = () => has('sfx.play').filter(c => c[1] === 'shatter').length;
  feel.tick(w(0.5), 1); assert.equal(n(), 0, '처음 값에서 터짐');
  const b = rig(), m = () => b.has('sfx.play').filter(c => c[1] === 'shatter').length;
  b.feel.tick(w(1), 1); b.feel.tick(w(0.8), 2); assert.equal(m(), 0);
  b.feel.tick(w(0.74), 3); assert.equal(m(), 1);
  assert.ok(b.has('fx.burst').some(c => c[1] === 5 && c[3] === 'purple'));
  b.feel.tick(w(0.7), 4); assert.equal(m(), 1);
  b.feel.tick(w(0.24), 5); assert.equal(m(), 2);
});

test('무기 가동: 켜진 동안 몸에서 청록 알갱이가 오르고, 꺼질 때 소리가 한 번', () => {
  const { feel, has } = rig(), A = LOOK.feel.aura;
  const w = (until, t) => ({ player: { hp: 90, x: 0, z: 0 }, boss: { hp: 100, maxHp: 100, x: 5, z: 0 }, rules: RULES, result: null, time: t, weapons: { on: ['missile', 'burst'], chargeUntil: until } });
  feel.tick(w(3, 1), 10); feel.tick(w(3, 1.1), 10 + A.every + 0.01);
  assert.equal(has('fx.rise').length, 2);
  assert.equal(has('sfx.play').filter(c => c[1] === 'gearSleep').length, 0);
  feel.tick(w(3, 3.1), 12); feel.tick(w(3, 3.2), 12.1);
  assert.equal(has('sfx.play').filter(c => c[1] === 'gearSleep').length, 1);
  assert.equal(has('fx.rise').length, 2, '꺼졌는데 알갱이');
});

test('시작 장면: 1초쯤 판이 멈춰 있고, 아무 키나 누르면 건너뛴다. 연습·봇·녹화에는 없다(길이 0)', () => {
  const I = LOOK.feel.intro, a = createIntro(I.sec);
  assert.equal(a.active(5), true);
  assert.equal(a.active(5 + I.sec - 0.01), true);
  assert.equal(a.active(5 + I.sec + 0.01), false);
  assert.equal(a.active(5.1), false, '끝난 뒤 다시 켜짐');
  const b = createIntro(I.sec);
  assert.equal(b.active(1), true); b.skip(); assert.equal(b.active(1.1), false);
  assert.equal(createIntro(0).active(0), false);
});
