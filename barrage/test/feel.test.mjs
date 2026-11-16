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
