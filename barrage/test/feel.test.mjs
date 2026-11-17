// Task 14: sim 사건 → 시간·카메라·연출·소리(순수). 부른 것을 적는 가짜 객체로 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeel } from '../src/view/feel.js';
import { createTimeFx } from '../src/view/timeFx.js';
import { LOOK } from '../src/view/look.js';
import { K } from '../src/sim/rules.js';

// 모든 메서드 부름을 calls에 적는 가짜
function fake(name, calls) {
  return new Proxy({}, { get: (_, m) => (...args) => { calls.push([`${name}.${String(m)}`, ...args]); return 0.06; } });
}
function rig() {
  const calls = [];
  const timeFx = createTimeFx(LOOK);
  const spyTime = { hitstop: (...a) => { calls.push(['timeFx.hitstop', ...a.slice(1)]); return timeFx.hitstop(...a); }, slow: (...a) => { calls.push(['timeFx.slow', ...a.slice(1)]); return timeFx.slow(...a); }, scaleAt: n => timeFx.scaleAt(n) };
  const feel = createFeel({ timeFx: spyTime, camera: fake('camera', calls), fx: fake('fx', calls), sfx: fake('sfx', calls), actors: fake('actors', calls), hud: fake('hud', calls), LOOK });
  const has = n => calls.filter(c => c[0] === n);
  return { feel, calls, has };
}
const ev = (type, data = {}, t = 0) => ({ type, t, ...data });

test('패링을 누르면 받은 것이 없어도 고리와 소리가 난다', () => {
  const { feel, has } = rig();
  feel.handle([ev('parryStart', { x: 0, z: 0 })], 1);
  assert.equal(has('actors.ringFlash').length, 1);
  assert.ok(has('sfx.play').some(c => c[1] === 'swish'));
});

test('탄 패링은 화면을 멈추지 않는다', () => {
  const { feel, has } = rig();
  feel.handle([ev('parry', { kind: 'bullet', perfect: false, gold: false, first: true, chain: 1, x: 0, z: 0 })], 1);
  assert.equal(has('timeFx.hitstop').length, 0);
  assert.equal(has('camera.shake').length, 1);
});

test('한 창의 뒤 발은 흔들림 없이 음높이만 오른다', () => {
  const { feel, has } = rig();
  feel.handle([ev('parry', { kind: 'bullet', perfect: false, gold: false, first: false, chain: 2, x: 0, z: 0 })], 1);
  assert.equal(has('camera.shake').length, 0);
  const clang = has('sfx.play').find(c => c[1] === 'clang');
  assert.equal(clang[2].detune, 200);
});

test('완벽 탄 패링: 첫 번은 정지 0.05 + 느려짐, 0.6초 안 두 번째는 둘 다 없음', () => {
  const { feel, has } = rig();
  const perfect = ev('parry', { kind: 'bullet', perfect: true, gold: false, first: true, chain: 1, x: 0, z: 0 });
  feel.handle([perfect], 1);
  assert.deepEqual(has('timeFx.hitstop').map(c => c[1]), [LOOK.feel.perfectBullet.stop]);
  assert.equal(has('timeFx.slow').length, 1);
  feel.handle([perfect], 1.4);
  assert.equal(has('timeFx.hitstop').length, 1);
  assert.equal(has('timeFx.slow').length, 1);
});

test('근접 패링은 정지 0.06, 완벽 0.09', () => {
  const { feel, has } = rig();
  feel.handle([ev('parry', { kind: 'melee', perfect: false, gold: false, first: true, chain: 1, x: 0, z: 0 })], 1);
  feel.handle([ev('parry', { kind: 'melee', perfect: true, gold: false, first: true, chain: 1, x: 0, z: 0 })], 5);
  assert.deepEqual(has('timeFx.hitstop').map(c => c[1]), [0.06, 0.09]);
});

test('같은 틱의 흰 탄 여러 발은 핑 한 번', () => {
  const { feel, has } = rig();
  feel.handle([ev('fire', { kind: K.WHITE }, 0.5), ev('fire', { kind: K.WHITE }, 0.5), ev('fire', { kind: K.NORMAL }, 0.5)], 1);
  assert.equal(has('sfx.play').filter(c => c[1] === 'ping').length, 1);
});

test('잠긴 누름은 틱 소리와 표시가 난다', () => {
  const { feel, has } = rig();
  feel.handle([ev('denied', { what: 'dodge', why: 'charges' })], 1);
  assert.ok(has('sfx.play').some(c => c[1] === 'tick'));
  assert.equal(has('hud.shakePips').length, 1);
  feel.handle([ev('denied', { what: 'parry', why: 'busy' })], 2);
  assert.equal(has('actors.dim').length, 1);
});

test('맞으면 정지·흔들림·붉은 가장자리·맞힌 자리 표시', () => {
  const { feel, has } = rig();
  feel.handle([ev('hurt', { dmg: 10, src: 1, bx: 1, bz: 2 })], 1);
  assert.equal(has('timeFx.hitstop')[0][1], LOOK.feel.hurt.stop);
  assert.equal(has('camera.shake')[0][1], LOOK.feel.hurt.shakePx);
  assert.ok(has('fx.edge').length === 1 && has('fx.hitMarker').length === 1);
});

test('맞은 알갱이 수만큼 굵은 타격음(1/12초 묶음)', () => {
  const { feel, has } = rig();
  feel.handle(Array.from({ length: 5 }, () => ev('bossHit', { x: 0, z: 0 })), 1);
  feel.handle([], 1 + 0.1);
  feel.handle([ev('bossHit', { x: 0, z: 0 })], 2);
  feel.handle([], 2.1);
  const hits = has('sfx.play').map(c => c[1]).filter(n => /^hit\d$/.test(n));
  assert.deepEqual(hits, ['hit3', 'hit1']);
});

// ── 원거리 재설계 Task 5: 장판 공격·레이저·구슬의 손맛
test('박치기 패링 = 근접 패링과 같은 정지 0.06·쇳소리 한 번 + 크게 튕김', () => {
  const { feel, has } = rig();
  // sim은 같은 틱에 parry(근접) → slamHit 차례로 낸다
  feel.handle([ev('parry', { kind: 'melee', perfect: false, gold: false, first: true, chain: 1, x: 0, z: 0, attack: 'slam' }), ev('slamHit', { outcome: 'parry', color: 'white', x: 1, z: 0 })], 1);
  assert.deepEqual(has('timeFx.hitstop').map(c => c[1]), [LOOK.feel.parryMelee.stop]);
  assert.equal(has('sfx.play').filter(c => c[1] === 'clang').length, 1);
  assert.ok(has('actors.bossJolt').some(c => c[2] >= LOOK.feel.slamParry.jolt));
});

test('박치기가 난간에 부딪히면 흔들림·먼지·쿵', () => {
  const { feel, has } = rig();
  feel.handle([ev('slamWall', { color: 'red', x: 9, z: 0 })], 1);
  assert.equal(has('camera.shake').length, 1);
  assert.equal(has('fx.dust').length, 1);
  assert.ok(has('sfx.play').some(c => c[1] === 'slamWall'));
});

test('레이저: 조준 = 모으는 소리, 발사 = 지글 소리', () => {
  const { feel, has } = rig();
  feel.handle([ev('laserAim', { x: 0, z: 0, angle: 0, dir: 1 })], 1);
  feel.handle([ev('laserFire', { x: 0, z: 0, angle: 0, dir: 1 })], 2);
  const names = has('sfx.play').map(c => c[1]);
  assert.deepEqual(names, ['laserCharge', 'laserBeam']);
  assert.equal(has('camera.shake').length, 1);
});

test('파도 시작은 쿵·먼지, 구슬 발사는 작은 소리, 뛰기는 휙', () => {
  const { feel, has } = rig();
  feel.handle([ev('waveStart', { color: 'white', x: 0, z: 0 }), ev('orbFire', { x: 1, z: 1, k: 0 }), ev('hop', { x: 0, z: 0 })], 1);
  const names = has('sfx.play').map(c => c[1]);
  assert.deepEqual(names, ['slam', 'orb', 'whoosh']);
  assert.equal(has('fx.dust').length, 1);
});

// 마지막 검토: 끊긴 레이저 소리, 박치기 길 먼지
test('쏘던 레이저가 끊기면 지글 소리를 멈춘다', () => {
  const { feel, has } = rig();
  feel.handle([ev('laserCut')], 1);
  assert.ok(has('sfx.stop').some(c => c[1] === 'laserBeam'));
});

test('박치기가 지나간 길을 따라 먼지가 인다', () => {
  const { feel, has } = rig();
  feel.handle([ev('slamStart', { color: 'red', x: 0, z: 0, angle: 0 })], 1);
  feel.handle([ev('slamWall', { color: 'red', x: 9, z: 0 })], 1.3);
  assert.ok(has('fx.dust').length >= 1 + LOOK.feel.slamWall.dustLine, `먼지 ${has('fx.dust').length}`);
});

// 그로기 처형 연출(§5.8, 영화처럼)
test('처형 시작: 검은 띠·카메라 당김·정적(소리 없음)', () => {
  const r = rig();
  r.feel.handle([ev('executeStart', { x: 0, z: 0, bx: 3, bz: 0 })], 1);
  assert.ok(r.has('hud.letterbox').some(c => c[2] === true));
  assert.equal(r.has('camera.hold').length, 1);
  assert.equal(r.has('sfx.duck').length, 1);
  assert.equal(r.has('sfx.play').length, 0, '정적인데 소리가 남');
});

test('큰 한 발: 정지·흔들림·처형 소리·느려짐', () => {
  const r = rig();
  r.feel.handle([ev('executeStart', { x: 0, z: 0, bx: 3, bz: 0 })], 1);
  r.feel.handle([ev('executeFinal', { x: 0.6, z: 0, bx: 3, bz: 0, dmg: 600 })], 1.5);
  assert.ok(r.has('timeFx.hitstop').some(c => c[1] === LOOK.feel.execute.stop));
  assert.ok(r.has('camera.shake').length >= 1);
  assert.ok(r.has('sfx.play').some(c => c[1] === 'execute'));
  assert.equal(r.has('timeFx.slow').length, 1);
});

test('붙어 쏘기는 발마다 음이 오른다', () => {
  const r = rig();
  r.feel.handle([ev('executeStart', { x: 0, z: 0, bx: 3, bz: 0 })], 1);
  for (let i = 0; i < 3; i++) r.feel.handle([ev('executeShot', { i, x: 0.6, z: 0, bx: 3, bz: 0 })], 1.2 + i * 0.1);
  const det = r.has('sfx.play').filter(c => c[1] === 'execShot').map(c => c[2].detune);
  assert.equal(det.length, 3);
  assert.ok(det[0] < det[1] && det[1] < det[2], JSON.stringify(det));
});

test('처형이 끝나면 띠가 빠진다', () => {
  const r = rig();
  r.feel.handle([ev('executeStart', { x: 0, z: 0, bx: 3, bz: 0 })], 1);
  r.feel.handle([ev('executeEnd', { x: -2, z: 0 })], 2);
  assert.ok(r.has('hud.letterbox').some(c => c[2] === false));
});

test('큰 한 발: 금·흰 섬광과 처형 피해 합계 숫자', () => {
  const r = rig();
  r.feel.handle([ev('executeStart', { x: 0, z: 0, bx: 3, bz: 0 })], 1);
  r.feel.handle([ev('executeFinal', { x: 0.6, z: 0, bx: 3, bz: 0, dmg: 420, total: 600 })], 1.5);
  const flashes = r.has('fx.flashAt').map(c => c[3]);
  assert.ok(flashes.includes('gold') && flashes.includes('white'), JSON.stringify(flashes));
  assert.ok(r.has('fx.number').some(c => c[3] === 600), JSON.stringify(r.has('fx.number')));
});

// 방패·폭탄·아이템(§4.9)
test('폭탄: 짧은 정지·크게 흔들림·폭발 소리, 구제면 청록 가장자리 더', () => {
  const r = rig();
  r.feel.handle([ev('bomb', { x: 0, z: 0, bx: 5, bz: 0, dmg: 300 })], 1);
  assert.ok(r.has('timeFx.hitstop').some(c => c[1] === LOOK.feel.bomb.stop));
  assert.ok(r.has('camera.shake').length >= 1);
  assert.ok(r.has('sfx.play').some(c => c[1] === 'bomb'));
  const d = rig();
  d.feel.handle([ev('deathbomb', { x: 0, z: 0, hp: 10 }), ev('bomb', { x: 0, z: 0, bx: 5, bz: 0, dmg: 300 })], 1);
  assert.ok(d.has('fx.edge').some(c => c[1] === 'cyan'));
});

test('방패 켬·막음·아이템 줍기 소리', () => {
  const r = rig();
  r.feel.handle([ev('shieldOn', { x: 0, z: 0 }), ev('shieldBlock', { x: 1, z: 0 }), ev('itemPick', { kind: 'bomb', x: 0, z: 0 })], 1);
  const names = r.has('sfx.play').map(c => c[1]);
  assert.ok(names.includes('shield') && names.includes('shieldBlock') && names.includes('pickup'), JSON.stringify(names));
});

test('방패·폭탄을 못 쓰면 틱 소리와 사용권 칸 흔들림(몸은 어두워지지 않음)', () => {
  const r = rig();
  r.feel.handle([ev('denied', { what: 'bomb', why: 'stock' })], 1);
  assert.ok(r.has('sfx.play').some(c => c[1] === 'tick'));
  assert.equal(r.has('actors.dim').length, 0);
  assert.ok(r.has('hud.shakeStock').some(c => c[2] === 'bomb'));
});

// 보조 무기(§4.10): 소리는 작게, 칼날이 지운 탄은 불꽃만
test('무기 발사 소리와 켜고 끄기 소리', () => {
  const r = rig();
  r.feel.handle([ev('weaponFire', { kind: 'missile', x: 0, z: 0, angle: 0 }), ev('weaponFire', { kind: 'drone', x: 0, z: 0, angle: 0 }), ev('weaponFire', { kind: 'beam', x: 0, z: 0, angle: 0 })], 1);
  const names = r.has('sfx.play').map(c => c[1]);
  assert.ok(names.includes('missile') && names.includes('drone') && names.includes('beam'), JSON.stringify(names));
  const g = rig();
  g.feel.handle([ev('gearToggle', { kind: 'drone', on: false })], 1);
  assert.ok(g.has('sfx.play').some(c => c[1] === 'tick'));
});

// 처형 연출 수치가 주석에 먹혀 없어졌던 일(2026-11-16) — 모든 값이 숫자인지
test('연출 수치는 모두 유한한 숫자(처형·폭탄·방패)', () => {
  const need = { execute: ['hold', 'holdSec', 'duckDb', 'duckSec', 'stop', 'shakePx', 'shakeSec', 'slow', 'slowSec', 'edgeSec', 'burst', 'number', 'shotCent', 'shotShake', 'shotShakeSec'],
    bomb: ['stop', 'shakePx', 'shakeSec', 'punch', 'punchSec', 'burst', 'rescueEdge'] };
  for (const [k, keys] of Object.entries(need)) for (const f of keys) assert.ok(Number.isFinite(LOOK.feel[k][f]), `LOOK.feel.${k}.${f} = ${LOOK.feel[k][f]}`);
});

test('무기 명중: 미사일은 청록으로 터지고, 작은 탄(드론·산탄)은 작은 청록 불꽃', () => {
  const r = rig();
  r.feel.handle([ev('weaponHit', { kind: 'missile', x: 3, z: 0 })], 1);
  assert.ok(r.has('fx.burst').some(c => c[3] === 'cyan' && c[4] === LOOK.guns.missile.hitBurst));
  const r2 = rig();
  r2.feel.handle([ev('weaponHit', { kind: 'drone', x: 3, z: 0 })], 1);
  assert.ok(r2.has('fx.spark').some(c => c[3] === 'cyan'));
  assert.equal(r2.has('fx.burst').length, 0);
});

// 평타·무기 연출(사용자 2026-11-17 "기본 공격이나 무기도 좀 더 화려했으면")
test('산탄 부채 하나에 부채꼴 불티 한 번, 미사일·드론은 쏠 때 작은 불꽃', () => {
  const r = rig();
  r.feel.handle([ev('weaponFire', { kind: 'burst', x: 0, z: 0, angle: 0.1 }, 5), ev('weaponFire', { kind: 'burst', x: 0, z: 0, angle: 0.2 }, 5), ev('weaponFire', { kind: 'burst', x: 0, z: 0, angle: 0.3 }, 5)], 1);
  assert.equal(r.has('fx.fan').length, 1);
  r.feel.handle([ev('weaponFire', { kind: 'missile', x: 1, z: 2, angle: 0 }, 6), ev('weaponFire', { kind: 'drone', x: 1, z: 2, angle: 0 }, 6)], 1.1);
  assert.equal(r.has('fx.spark').filter(c => c[3] === 'cyan').length, 2);
});

test('평타·무기로 조금씩 깎인 피해는 적마다 모아 every초마다 숫자 하나 — 큰 한 방(던지기·저격)은 세지 않는다', () => {
  const r = rig(), Gn = LOOK.guns.number;
  const m = { id: 7, hp: 300, maxHp: 300, x: 2, z: 1, dead: false, bornAt: 0 };
  const w = { time: 1, enemies: [m], boss: { away: true }, player: { x: 0, z: 0 }, stats: {}, weapons: null, result: null };
  let now = 1;
  r.feel.tick(w, now);
  for (let k = 0; k < 10; k++) { m.hp -= 3; now += Gn.every / 20; w.time = now; r.feel.tick(w, now); }
  assert.equal(r.has('fx.number').length, 0, 'every초가 되기 전');
  m.hp -= Gn.big + 10;   // 던지기 한 방
  for (let k = 0; k < 12; k++) { m.hp -= 3; now += Gn.every / 20; w.time = now; r.feel.tick(w, now); }
  const nums = r.has('fx.number');
  assert.equal(nums.length, 1);
  assert.equal(nums[0][3], 3 * 20, '큰 한 방을 빼고 every초 동안 깎인 합');
  assert.equal(nums[0][4], 'cyan');
});

test('빔이 켜져 있는 동안 겨눈 적 자리에 불티가 튄다', () => {
  const r = rig(), Gb = LOOK.guns.beam;
  const w = { time: 1, enemies: [], boss: { away: true }, aim: { x: 4, z: -2 }, player: { x: 0, z: 0 }, stats: {}, weapons: { on: ['beam'], chargeUntil: -1, beamUntil: 1.3 }, result: null };
  r.feel.tick(w, 1);
  r.feel.tick(w, 1 + Gb.sparkEvery / 2);
  r.feel.tick(w, 1 + Gb.sparkEvery * 1.1);
  const sp = r.has('fx.spark').filter(c => c[1] === 4 && c[2] === -2);
  assert.equal(sp.length, 2);
  w.time = 1.4;
  r.feel.tick(w, 1.4);
  assert.equal(r.has('fx.spark').filter(c => c[1] === 4).length, 2, '빔이 꺼지면 멈춘다');
});

// 패링으로 깨어나는 무기·무기 스킬(§4.10)
test('무기가 깨어나면 작은 차임, 무기 스킬은 종류별 소리와 흔들림, 못 쓰면 틱', () => {
  const r = rig();
  r.feel.handle([ev('weaponWake', { x: 0, z: 0 })], 1);
  r.feel.handle([ev('weaponSkill', { kind: 'missile', x: 0, z: 0 }), ev('weaponSkill', { kind: 'beam', x: 0, z: 0 }), ev('weaponSkill', { kind: 'drone', x: 0, z: 0 })], 2);
  const names = r.has('sfx.play').map(c => c[1]);
  for (const n of ['gearWake', 'salvo', 'bigBeam', 'swarm']) assert.ok(names.includes(n), `${n}: ${JSON.stringify(names)}`);
  assert.ok(r.has('camera.shake').length >= 3);
  const d = rig();
  d.feel.handle([ev('denied', { what: 'skill', why: 'gauge', kind: 'beam' })], 1);
  assert.ok(d.has('sfx.play').some(c => c[1] === 'tick'));
  assert.ok(d.has('hud.shakeStock').some(c => c[2] === 'skill'));
  assert.equal(d.has('actors.dim').length, 0);
});

// ── 모아 던지기(§4.11): 모이는 소리, 던지는 큰 순간, 회복 빛, 마지막 한 발
test('모일 때: 탄이 몸으로 빨려 들어오고, 쌓인 수만큼 음이 오른다. 가득이면 따로 울린다', () => {
  const { feel, has } = rig(), X = LOOK.feel.store;
  feel.handle([ev('storeAdd', { x: 1, z: 2, px: 0, pz: 0, n: 3, full: false })], 1);
  const s = has('sfx.play').find(c => c[1] === 'store');
  assert.equal(s[2].detune, 2 * X.storeCent);
  assert.equal(has('fx.tracer').length, 1);
  assert.ok(!has('sfx.play').some(c => c[1] === 'storeFull'));
  feel.handle([ev('storeAdd', { x: 1, z: 2, px: 0, pz: 0, n: 4, full: true })], 2);
  assert.ok(has('sfx.play').some(c => c[1] === 'storeFull'));
});

test('던지기 = 큰 순간: 정지·흔들림·소리, 회복이 있으면 초록 숫자·가장자리·소리', () => {
  const { feel, has } = rig(), X = LOOK.feel.store;
  feel.handle([ev('throw', { x: 0, z: 0, n: 3, heal: 10, mul: 1.2 })], 1);
  assert.deepEqual(has('timeFx.hitstop')[0].slice(1, 2), [X.stop]);
  assert.equal(has('camera.shake').length, 1);
  assert.ok(has('sfx.play').some(c => c[1] === 'throw'));
  assert.ok(has('sfx.play').some(c => c[1] === 'heal'));
  assert.ok(has('fx.number').some(c => c[3] === '+10' && c[4] === 'heal'));
  assert.ok(has('fx.edge').some(c => c[1] === 'heal'));
  assert.equal(has('fx.rise').length, 1);
  const none = rig();
  none.feel.handle([ev('throw', { x: 0, z: 0, n: 1, heal: 0, mul: 1 })], 1);
  assert.ok(!none.has('sfx.play').some(c => c[1] === 'heal'));
  assert.equal(none.has('fx.number').length, 0);
});

test('던진 탄 명중: 발마다 음이 오르고, 마지막 한 발에 정지·흔들림·합계 숫자', () => {
  const { feel, has } = rig(), X = LOOK.feel.store;
  feel.handle([ev('throwHit', { x: 5, z: 0, dmg: 180, last: false, total: 180, perfect: true })], 1);
  assert.equal(has('timeFx.hitstop').length, 0);
  assert.equal(has('fx.number').length, 0);
  assert.ok(has('sfx.play').some(c => c[1] === 'throwHit'));
  feel.handle([ev('throwHit', { x: 5, z: 0, dmg: 180, last: true, total: 540, perfect: true })], 1.1);
  assert.deepEqual(has('timeFx.hitstop')[0].slice(1, 2), [X.lastStop]);
  assert.ok(has('fx.number').some(c => c[3] === 540 && c[5] === X.number));
  assert.ok(has('sfx.play').some(c => c[1] === 'throwBoom'));
  assert.ok(has('camera.shake').length >= 1);
});

test('던질 것이 없을 때 U = 칸이 흔들린다', () => {
  const { feel, has } = rig();
  feel.handle([ev('denied', { what: 'throw', why: 'empty' })], 1);
  assert.ok(has('hud.shakeStock').some(c => c[2] === 'store'));
});

test('모아 던지기 연출 수치는 모두 유한한 수, 소리 음량이 있다', () => {
  for (const [k, v] of Object.entries(LOOK.feel.store)) assert.ok(Number.isFinite(v), `LOOK.feel.store.${k} = ${v}`);
  for (const n of ['store', 'storeFull', 'throw', 'throwHit', 'throwBoom', 'heal']) assert.ok(Number.isFinite(LOOK.sound.db[n]), `소리 ${n}`);
  assert.ok(/^#[0-9a-f]{6}$/i.test(LOOK.colors.heal));
});

test('되받아친 포탄: 흰 원에서 포격병까지 청록 줄이 긋고 포격병 자리에서 터지며 피해 숫자가 뜬다', () => {
  const r = rig();
  r.feel.handle([ev('shellReturn', { id: 3, x: 1, z: 2, tx: 7, tz: -1, dmg: 130 })], 1);
  const tr = r.has('fx.tracer');
  assert.equal(tr.length, 1);
  assert.deepEqual(tr[0].slice(1, 6), [1, 2, 7, -1, 'cyan']);
  assert.ok(r.has('fx.burst').some(c => c[1] === 7 && c[2] === -1 && c[3] === 'cyan'));
  assert.ok(r.has('fx.number').some(c => c[1] === 7 && c[3] === 130));
});

// ── 한 판의 뼈대 §6: 줍는 순간의 연출 — 카드가 어디에 들어갔고 어느 키인지 설명 없이 알게
test('카드를 주우면 그 칸으로 선이 그어지고(hud.cardGain) 소리가 난다', () => {
  const { feel, has } = rig();
  feel.handle([ev('cardGain', { id: 'burst', group: 'weapon', slot: 1, key: null, x: 2, z: 3 })], 1);
  const g = has('hud.cardGain');
  assert.equal(g.length, 1);
  assert.deepEqual([g[0][2].group, g[0][2].slot, g[0][2].x, g[0][2].z], ['weapon', 1, 2, 3]);
  assert.ok(has('sfx.play').length >= 1);
});

test('키가 있는 카드는 키와 이름이 배너로 뜬다, 키가 없는 카드는 이름만', () => {
  const { feel, has } = rig();
  feel.handle([ev('cardGain', { id: 'sky', group: 'move', slot: 0, key: 'K', x: 0, z: 0 })], 1);
  assert.equal(has('hud.banner')[0][2], `K — ${LOOK.names.card.sky}`);
  const r2 = rig();
  r2.feel.handle([ev('cardGain', { id: 'dash', group: 'move', slot: 1, key: null, x: 0, z: 0 })], 1);
  assert.equal(r2.has('hud.banner')[0][2], LOOK.names.card.dash);
  for (const id of ['missile', 'burst', 'beam', 'drone', 'lance', 'mine', 'orbit', 'sky', 'swap', 'dash', 'cap', 'charge', 'graze']) {
    assert.ok(LOOK.names.card[id], `${id}의 이름이 없다`);
    assert.ok(LOOK.names.cardLine[id], `${id}의 한 줄 설명이 없다`);
  }
});

test('바꿔 끼우기가 시작되면 그 갈래 칸이 깜빡이고, 무르거나 고르면 멈춘다', () => {
  const { feel, has } = rig();
  feel.handle([ev('replaceStart', { id: 'beam', group: 'weapon', x: 0, z: 0 })], 1);
  assert.deepEqual(has('hud.blinkGroup').map(c => c[1]), ['weapon']);
  feel.handle([ev('replaceCancel', { x: 0, z: 0 })], 2);
  assert.deepEqual(has('hud.blinkGroup').map(c => c[1]), ['weapon', null]);
  feel.handle([ev('replaceStart', { id: 'beam', group: 'weapon', x: 0, z: 0 })], 3);
  feel.handle([ev('rewardPick', { kind: 'card', what: 'beam', x: 0, z: 0, dropped: 'missile' })], 4);
  assert.deepEqual(has('hud.blinkGroup').map(c => c[1]), ['weapon', null, 'weapon', null]);
});

test('정예가 나오면 이름이 배너로 뜬다', () => {
  const { feel, has } = rig();
  feel.handle([ev('eliteSpawn', { id: 3, kind: 'charger', x: 0, z: 0 })], 1);
  assert.ok(has('hud.banner')[0][2].includes(LOOK.names.mob.charger));
});

// ── 한 판의 뼈대 §7 "한 방의 연출" · §5 자폭병 연출
const salvo = (n, how = 'throw', kinds = ['missile'], full = false) => ev('salvo', { kinds, n, x: 0, z: 0, angle: 0, how, full });
const sparkSum = (has, name) => has(name).reduce((s, c) => s + (typeof c.at(-1) === 'number' ? c.at(-1) : 1), 0);

test('한 방에는 무기가 끼어든다는 신호(섬광과 소리)가 난다 — 무기마다 제 모습', () => {
  const { feel, has } = rig();
  feel.handle([salvo(1, 'throw', ['missile', 'burst', 'beam'])], 1);
  assert.ok(has('fx.burst').length >= 1, '신호 섬광이 없다');
  assert.ok(has('sfx.play').length >= 1, '소리가 없다');
  assert.equal(has('fx.fan').length, 1, '산탄의 넓은 부채');
  assert.equal(has('camera.punch').length, 1, '빔의 화면 밀림');
});

test('한 칸보다 네 칸의 연출이 크다', () => {
  const a = rig(), b = rig();
  a.feel.handle([salvo(1)], 1); b.feel.handle([salvo(4)], 1);
  const small = a.has('fx.burst')[0].at(-1), big = b.has('fx.burst')[0].at(-1);
  assert.ok(big > small, `섬광 세기 ${small} → ${big}`);
  assert.ok(Math.abs(small - LOOK.feel.salvo.flash[0]) < 1e-9 && Math.abs(big - LOOK.feel.salvo.flash[1]) < 1e-9);
});

test('다 쓴 한 방은 느려지고 흔들린다, 한 칸은 아니다', () => {
  const a = rig(), b = rig();
  a.feel.handle([salvo(1, 'throw', ['missile'], false)], 1);
  assert.equal(a.has('timeFx.slow').length, 0); assert.equal(a.has('camera.shake').length, 0);
  b.feel.handle([salvo(4, 'throw', ['missile'], true)], 1);
  assert.equal(b.has('timeFx.slow').length, 1); assert.equal(b.has('camera.shake').length, 1);
});

test('저격의 한 방은 느려짐·흔들림·밀림을 더하지 않는다(저격의 연출이 주인공) — 무기의 모습만 얹는다', () => {
  const { feel, has } = rig();
  feel.handle([salvo(4, 'snipe', ['burst', 'beam'], true)], 1);
  assert.equal(has('timeFx.slow').length, 0); assert.equal(has('camera.shake').length, 0); assert.equal(has('camera.punch').length, 0);
  assert.equal(has('fx.fan').length, 1);
  feel.handle([ev('weaponHit', { kind: 'burst', x: 1, z: 0, salvo: true }, 1)], 1.01);
  assert.equal(has('timeFx.hitstop').length, 0, '저격의 한 방이 화면을 멈춤');
});

test('산탄의 한 방이 맞으면 아주 잠깐 멈춘다(한 방에 한 번) — 늘 나가는 산탄은 멈추지 않는다', () => {
  const { feel, has } = rig();
  feel.handle([salvo(2, 'throw', ['burst'])], 1);
  feel.handle([ev('weaponHit', { kind: 'burst', x: 1, z: 0, salvo: true }, 1), ev('weaponHit', { kind: 'burst', x: 1, z: 0, salvo: true }, 1)], 1.02);
  feel.handle([ev('weaponHit', { kind: 'burst', x: 1, z: 0, salvo: true }, 1.03)], 1.05);
  assert.equal(has('timeFx.hitstop').length, 1);
  const r2 = rig();
  r2.feel.handle([ev('weaponHit', { kind: 'burst', x: 1, z: 0 }, 1)], 1);
  assert.equal(r2.has('timeFx.hitstop').length, 0);
});

test('한 방의 발사 사건마다 소리를 내지 않는다(미사일 열두 발 = 소리 한 번)', () => {
  const { feel, has } = rig();
  const shots = Array.from({ length: 12 }, (_, k) => ev('weaponFire', { kind: 'missile', x: 0, z: 0, angle: k / 10, salvo: true }, 1));
  feel.handle([...shots, salvo(3)], 1);
  assert.ok(has('sfx.play').filter(c => c[1] === 'missile').length <= 1, `미사일 소리 ${has('sfx.play').filter(c => c[1] === 'missile').length}번`);
});

test('자폭병을 받아치면 날아가는 길에 줄이 나고, 떨어진 자리에서 크게 터진다. 셋 이상 잡은 폭발만 느려진다', () => {
  const { feel, has } = rig();
  feel.handle([ev('bomberBounce', { id: 1, x: 0, z: 0, tx: 4, tz: 1, perfect: false })], 1);
  const tr = has('fx.tracer');
  assert.equal(tr.length, 1);
  assert.deepEqual(tr[0].slice(1, 5), [0, 0, 4, 1]);
  feel.handle([ev('bomberReturn', { id: 1, x: 4, z: 1, kills: 2, dmg: 440, perfect: false })], 1.3);
  assert.ok(has('fx.burst').some(c => c[1] === 4 && c[2] === 1), '떨어진 자리의 폭발이 없다');
  assert.ok(has('fx.number').some(c => c[3] === 440));
  assert.equal(has('timeFx.slow').length, 0, '둘 잡았는데 느려짐');
  feel.handle([ev('bomberReturn', { id: 2, x: 4, z: 1, kills: 3, dmg: 660, perfect: true })], 2);
  assert.equal(has('timeFx.slow').length, 1);
  assert.equal(LOOK.feel.bomber.multi, 3);
});

// ── 전체 검토에서 나온 것(화면)
test('정예 방에 들어설 때 정예의 이름이 방 번호 배너에 지워지지 않는다', () => {
  const { feel, has } = rig();
  feel.handle([ev('eliteSpawn', { id: 3, kind: 'charger', x: 0, z: 0 }), ev('roomStart', { room: 3, of: 5, boss: false, kind: 'elite', feature: null })], 1);
  const last = has('hud.banner').at(-1);
  assert.ok(last[2].includes(LOOK.names.mob.charger), `마지막 배너 "${last[2]}"`);
});

test('방을 다시 시작하면 깜빡이던 칸이 멈춘다', () => {
  const { feel, has } = rig();
  feel.handle([ev('replaceStart', { id: 'beam', group: 'weapon', x: 0, z: 0 })], 1);
  feel.handle([ev('roomStart', { room: 2, of: 5, boss: false, kind: 'fight', feature: null })], 2);
  assert.equal(has('hud.blinkGroup').at(-1)[1], null);
});

test('한 방의 크기는 칸 수에 따라 — 네 칸을 넘으면(탄 칸 +1) 가장 큰 값에서 멈춘다', () => {
  const a = rig(), b = rig();
  a.feel.handle([ev('salvo', { kinds: ['missile'], n: 4, x: 0, z: 0, angle: 0, how: 'throw', full: false })], 1);
  b.feel.handle([ev('salvo', { kinds: ['missile'], n: 5, x: 0, z: 0, angle: 0, how: 'throw', full: true })], 1);
  assert.equal(a.has('fx.burst')[0].at(-1), b.has('fx.burst')[0].at(-1));
  assert.ok(Number.isFinite(LOOK.feel.salvo.span));
});

// ── 검사(sim/sword.js): 스킬 셋의 연출
test('검사의 사건: 벨 때마다 청록 불꽃과 숫자, 스킬마다 제 소리, 마무리는 화면이 흔들린다', () => {
  const { feel, has } = rig();
  feel.handle([ev('bladeSlash', { x0: 0, z0: 0, x1: 4, z1: 0, heal: 4 }), ev('bladeHit', { skill: 'slash', id: 0, x: 2, z: 0, dmg: 420 })], 1);
  feel.handle([ev('bladeSpin', { x: 0, z: 0, R: 2.8, n: 1, hits: 1, heal: 0 }), ev('bladeFinish', { x: 0, z: 0, angle: 0, n: 3, dmg: 765, hits: 1, dirX: -1, dirZ: 0, heal: 12 }), ev('bladeHit', { skill: 'finish', id: 0, x: 2, z: 0, dmg: 765 })], 1.5);
  const played = has('sfx.play').map(c => c[1]);
  for (const s of ['slash', 'spin', 'finish']) assert.ok(played.includes(s), `${s} 소리`);
  assert.ok(has('fx.burst').some(c => c[3] === 'cyan'));
  assert.ok(has('fx.number').some(c => c[3] === 420 && c[4] === 'cyan'));
  assert.ok(has('fx.number').some(c => c[3] === 765 && c[5] > has('fx.number').find(c2 => c2[3] === 420)[5]), '마무리의 숫자가 더 크다');
  assert.equal(has('camera.shake').length, 1);
  assert.ok(has('fx.number').some(c => c[3] === '+12' && c[4] === 'heal'), '칸을 써서 회복한 만큼');
  assert.ok(!has('fx.burst').some(c => c[3] === 'white'), '흰색은 받아칠 것에만 쓴다');
});

test('닿는 거리 밖에서 누른 일섬·칸 없이 누른 스킬은 칸을 흔든다(몸이 어두워지지 않는다)', () => {
  const { feel, has } = rig();
  feel.handle([ev('denied', { what: 'slash', why: 'far' }), ev('denied', { what: 'spin', why: 'empty' }), ev('denied', { what: 'finish', why: 'empty' })], 1);
  assert.equal(has('hud.shakeStock').filter(c => c[2] === 'store').length, 3);
  assert.equal(has('actors.dim').length, 0);
});

test('빗나간 베기(피해 0)에는 불꽃도 숫자도 없다', () => {
  const { feel, has } = rig();
  feel.handle([ev('bladeHit', { skill: 'spin', id: 3, x: 1, z: 0, dmg: 0 })], 1);
  assert.equal(has('fx.burst').length, 0); assert.equal(has('fx.number').length, 0);
});

test('칼바람: 낼 때마다 좌우가 다른 높이의 소리, 맞힌 자리마다 불티 — 화면은 흔들리지 않는다', () => {
  const { feel, has } = rig();
  feel.handle([ev('bladeWave', { x: 0, z: 0, angle: 0, side: 1 }), ev('bladeWave', { x: 0, z: 0, angle: 0, side: -1 }), ev('waveHit', { x: 3, z: 0, angle: 0, side: 1 })], 1);
  const waves = has('sfx.play').filter(c => c[1] === 'wave');
  assert.equal(waves.length, 2);
  assert.notEqual(waves[0][2].detune, waves[1][2].detune);
  const sprays = has('fx.spray').filter(c => c[1] === 3 && c[4] === 'cyan');
  assert.equal(sprays.length, 1, '맞힌 자리에만');
  assert.equal(sprays[0][3], 0, '칼바람이 가던 쪽으로 튄다');
  assert.equal(has('camera.shake').length, 0);
});

// ── 이기어검(sim/swords.js — 설계 2026-11-17-barrage-flying-swords-design.md §6)
const swordHits = (sid, skill, total, orbs) => [...Array(total).keys()].map(k => ev('swordHit', { sid, skill, k, total, id: 0, x: 0, z: 0, dmg: 6, sum: 6 * (k + 1), last: k === total - 1, orbs }));

test('이기어검: 찌르기의 소리와 불티는 1초에 perSec번까지만', () => {
  const { feel, has } = rig();
  for (let i = 0; i < 30; i++) feel.handle([ev('swordStab', { x: 0, z: 0, dmg: 2.6 })], 1 + i / 30);   // 열다섯 자루가 1초에 서른 번
  const n = has('sfx.play').filter(c => c[1] === 'stab').length;
  assert.ok(n >= 5 && n <= LOOK.sword.swords.sound.perSec + 1, `${n}번`);
});

test('이기어검: 스킬 타격은 화면을 멈추지 않는다 — 칸 셋 이상을 턴 마무리의 마지막 검만', () => {
  const { feel, has } = rig();
  swordHits(1, 'spin', 15, 1).forEach((e, k) => feel.handle([e], 1 + k * 0.013));
  swordHits(2, 'finish', 10, 2).forEach((e, k) => feel.handle([e], 2 + k * 0.03));
  assert.equal(has('timeFx.hitstop').length, 0, '난무와 두 칸 마무리는 멈추지 않는다');
  assert.equal(has('camera.shake').length, 1, '마무리의 마지막 검에서 한 번 흔들린다');
  swordHits(3, 'finish', 10, 3).forEach((e, k) => feel.handle([e], 3 + k * 0.03));
  assert.equal(has('timeFx.hitstop').length, 1, '칸 셋을 턴 마무리의 마지막 검 하나');
});

test('이기어검: 스킬 타격의 소리는 검마다가 아니라 올라가는 음 몇 개, 숫자는 합계 하나', () => {
  const { feel, has } = rig();
  swordHits(1, 'spin', 15, 1).forEach((e, k) => feel.handle([e], 1 + k * 0.013));
  const notes = has('sfx.play').filter(c => c[1] === 'ching');
  assert.equal(notes.length, LOOK.sword.swords.sound.notes);
  assert.ok(notes.at(-1)[2].detune > notes[0][2].detune, '음이 올라간다');
  const nums = has('fx.number');
  assert.equal(nums.length, 1); assert.equal(nums[0][3], 90);
});

test('이기어검: 검이 낸 맞음(quiet)에는 맞은 불티를 겹쳐 내지 않는다(제 불티와 소리는 찌르기·타격 사건이 낸다)', () => {
  const { feel, has } = rig();
  feel.handle([ev('mobHit', { id: 1, x: 0, z: 0, quiet: true })], 1);
  assert.equal(has('fx.spark').length, 0);
  feel.handle([ev('mobHit', { id: 1, x: 0, z: 0 })], 1.1);
  assert.equal(has('fx.spark').length, 1);
});

test('이기어검: 마지막 검이 헛돌아도 그때까지의 합계 숫자는 뜬다(벤 것이 없으면 안 뜬다)', () => {
  const { feel, has } = rig();
  feel.handle([ev('swordMiss', { sid: 1, skill: 'spin', k: 9, total: 10, last: true, sum: 25.6, x: 1, z: 2 })], 1);
  assert.equal(has('fx.number').length, 1); assert.equal(has('fx.number')[0][3], 26);
  feel.handle([ev('swordMiss', { sid: 2, skill: 'spin', k: 9, total: 10, last: true, sum: 0, x: null, z: null })], 2);
  feel.handle([ev('swordMiss', { sid: 3, skill: 'spin', k: 4, total: 10, last: false, sum: 12, x: 1, z: 2 })], 3);
  assert.equal(has('fx.number').length, 1);
});

// ── 검사: 벤 느낌과 스킬 강조(2026-11-18 — 사용자: "베거나 찌르는 느낌이 없다 · 스킬을 썼다는 강조를")
test('일섬: 떠날 때 잔상과 가장자리 빛, 처음 베는 순간 잠깐 느려지고 화면이 당겨진다 — 지나가며 벤 적마다 되풀이하지 않는다', () => {
  const { feel, has } = rig();
  feel.handle([ev('bladeSlash', { x0: 0, z0: 0, x1: 6, z1: 0, perfect: false, heal: 2 })], 1);
  assert.equal(has('actors.dashTrail').length, 1);
  assert.equal(has('fx.edge').filter(c => c[1] === 'cyan').length, 1);
  assert.equal(has('timeFx.slow').length, 0, '아직 베지 않았다');
  feel.handle([ev('bladeHit', { skill: 'slash', id: 1, x: 2, z: 0, dmg: 100 })], 1.05);
  feel.handle([ev('bladeHit', { skill: 'slash', id: 0, x: 4, z: 0, dmg: 280 })], 1.08);
  assert.equal(has('timeFx.slow').length, 1);
  assert.equal(has('camera.punch').length, 1);
  const sprays = has('fx.spray');
  assert.equal(sprays.length, 2, '벤 자리마다');
  assert.ok(sprays.every(c => c[3] === 0 && c[4] === 'cyan'), '내가 지나간 쪽으로 튄다');
});

test('회전 베기: 맞힌 것이 있을 때만 느려지고 당겨진다 — 불티는 나에게서 바깥으로 튄다', () => {
  const { feel, has } = rig();
  feel.handle([ev('bladeSpin', { x: 0, z: 0, R: 2.8, n: 1, perfect: false, hits: 0, heal: 2 })], 1);
  assert.equal(has('timeFx.slow').length, 0); assert.equal(has('camera.punch').length, 0);
  feel.handle([ev('bladeHit', { skill: 'spin', id: 0, x: 0, z: 2, dmg: 260 }), ev('bladeSpin', { x: 0, z: 0, R: 2.8, n: 1, perfect: false, hits: 1, heal: 2 })], 2);
  assert.equal(has('timeFx.slow').length, 1); assert.equal(has('camera.punch').length, 1);
  assert.ok(Math.abs(has('fx.spray')[0][3] - Math.PI / 2) < 1e-9, '같은 묶음에서 뒤에 오는 회전 베기의 자리를 미리 읽는다');
});

test('마무리: 튕겨 나오는 잔상과 가장자리 빛은 늘, 느려지는 것은 칸 둘 이상을 털었을 때만', () => {
  const one = rig();
  one.feel.handle([ev('bladeFinish', { x: 0, z: 0, angle: 0, n: 1, perfect: false, dmg: 170, hits: 1, dirX: -1, dirZ: 0, heal: 2 })], 1);
  assert.equal(one.has('actors.dashTrail').length, 1); assert.equal(one.has('fx.edge').length, 1);
  assert.equal(one.has('timeFx.slow').length, 0);
  const three = rig();
  three.feel.handle([ev('bladeFinish', { x: 0, z: 0, angle: 0, n: 3, perfect: false, dmg: 510, hits: 1, dirX: -1, dirZ: 0, heal: 6 })], 1);
  assert.equal(three.has('timeFx.slow').length, 1);
});

test('연달아 쓴 스킬은 느려짐을 겹쳐 쌓지 않는다(일섬 · 회전 베기는 앞의 느려짐과 가까우면 건너뛴다)', () => {
  const { feel, has } = rig();
  feel.handle([ev('bladeSlash', { x0: 0, z0: 0, x1: 6, z1: 0, perfect: false, heal: 2 }), ev('bladeHit', { skill: 'slash', id: 0, x: 3, z: 0, dmg: 280 })], 1);
  feel.handle([ev('bladeHit', { skill: 'spin', id: 0, x: 4, z: 0, dmg: 260 }), ev('bladeSpin', { x: 6, z: 0, R: 2.8, n: 1, perfect: false, hits: 1, heal: 2 })], 1.15);
  const slows = has('timeFx.slow');
  assert.equal(slows.length, 2);
  assert.ok(slows.every(c => c[3] && c[3].skipIfWithin > 0), '겹치지 않게 사이를 둔다');
});

test('이기어검: 보스를 찌를 때 몸이 움찔한다(소리와 같은 상한으로) — 불티는 화면의 검이 스치는 자리에서 따로 낸다', () => {
  const { feel, has } = rig();
  for (let i = 0; i < 30; i++) feel.handle([ev('swordStab', { id: 0, x: 0, z: 0, fromX: -3, fromZ: 0, dmg: 2.6 })], 1 + i / 30);
  const n = has('actors.bossJolt').length;
  assert.ok(n >= 5 && n <= LOOK.sword.swords.sound.perSec + 1, `${n}번`);
  assert.equal(has('fx.spark').length, 0);
  feel.handle([ev('swordStab', { id: 3, x: 0, z: 0, fromX: -3, fromZ: 0, dmg: 2.6 })], 5);
  assert.equal(has('actors.bossJolt').length, n, '몬스터를 찌를 때는 보스가 움찔하지 않는다');
});
