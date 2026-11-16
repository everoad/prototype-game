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
