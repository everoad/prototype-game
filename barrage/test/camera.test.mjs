// Task 13: 둘 다 담는, 가만히 있는 카메라 — 틀 잡기(순수 셈).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { makeRng } from '../src/sim/rng.js';
import { LOOK } from '../src/view/look.js';
import { screenOf, framingPoints, frameTarget, stepFrame, floorOf } from '../src/view/camMath.js';

const CAM = LOOK.camera;
const base = (aspect = 16 / 9, pitchDeg = 45) => ({ yawDeg: CAM.yawDeg, pitchDeg, aspect, LOOK, board: RULES.board });
const inside = (f, p, o) => {
  const s = screenOf(p.x, p.z, o.yawDeg, o.pitchDeg), H = f.width / o.aspect;
  return Math.abs(s.sx - f.sx) <= f.width / 2 + 1e-6 && Math.abs(s.sy - f.sy) <= H / 2 + 1e-6;
};

test('화면 좌표와 바닥 좌표는 서로 되돌아간다', () => {
  for (const [x, z] of [[0, 0], [3, -2], [-9, 6.5]]) {
    const s = screenOf(x, z, CAM.yawDeg, 45), back = floorOf(s.sx, s.sy, CAM.yawDeg, 45);
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.z - z) < 1e-9);
  }
});

test('플레이어와 보스가 늘 화면 안', () => {
  const rng = makeRng(7), hx = RULES.board.hx - 0.5, hz = RULES.board.hz - 0.5;
  for (const aspect of [16 / 9, 0.75, 2.4]) for (const pitch of CAM.pitches) {
    const o = base(aspect, pitch);
    for (let k = 0; k < 200; k++) {
      const P = { x: (rng.next() * 2 - 1) * hx, z: (rng.next() * 2 - 1) * hz, r: CAM.playerMargin };
      const B = { x: (rng.next() * 2 - 1) * hx, z: (rng.next() * 2 - 1) * hz, r: CAM.bossMargin + RULES.boss.r };
      const f = frameTarget([P, B], o);
      assert.ok(inside(f, P, o) && inside(f, B, o), `비율 ${aspect} 기울기 ${pitch} ${k}: ${JSON.stringify([P, B, f])}`);
    }
  }
});

test('가로는 22~34 U', () => {
  const o = base();
  const near = frameTarget([{ x: 0, z: 0, r: 3 }, { x: 0.5, z: 0, r: 3.6 }], o);
  const far = frameTarget([{ x: -9.5, z: 6.5, r: 3 }, { x: 9.5, z: -6.5, r: 3.6 }], o);
  assert.equal(near.width, CAM.minW);
  assert.ok(far.width <= CAM.maxW + 1e-9 && far.width > CAM.minW);
});

const pts = [{ x: 0, z: 0, r: 3 }, { x: 5, z: 0, r: 3.6 }];
test('목표가 조금만 다르면 움직이지 않는다', () => {
  const o = base(), cur = { ...frameTarget(pts, o), narrowT: 0 };
  const ideal = { ...cur, sx: cur.sx + 0.5, width: cur.width + 1.0 };
  const next = stepFrame(cur, ideal, pts, 1 / 60, o);
  assert.deepEqual([next.sx, next.sy, next.width], [cur.sx, cur.sy, cur.width]);
});

test('좁히기는 1.0초 머문 뒤에야 시작한다', () => {
  const o = base();
  let cur = { ...frameTarget(pts, o), narrowT: 0 }; cur.width = 30;
  const ideal = { ...cur, width: 25 };
  for (let k = 0; k < 54; k++) cur = stepFrame(cur, ideal, pts, 1 / 60, o);   // 0.9초
  assert.equal(cur.width, 30);
  for (let k = 0; k < 18; k++) cur = stepFrame(cur, ideal, pts, 1 / 60, o);   // 1.2초
  assert.ok(cur.width < 30);
});

test('점이 화면을 벗어나면 그 걸음에 바로 움직인다', () => {
  const o = base();
  const cur = { sx: 0, sy: 0, width: 22, narrowT: 0 };
  const far = [{ x: -9.5, z: 6.5, r: 3 }, { x: 9.5, z: -6.5, r: 3.6 }];
  const ideal = frameTarget(far, o);
  const next = stepFrame(cur, ideal, far, 1 / 60, o);
  assert.ok(next.width > cur.width);
});

test('넓힐 때는 빠르게, 좁힐 때는 느리게', () => {
  const o = base();
  const grow = stepFrame({ sx: 0, sy: 0, width: 26, narrowT: 0 }, { sx: 0, sy: 0, width: 32 }, pts, 0.1, o).width - 26;
  const shrink = 32 - stepFrame({ sx: 0, sy: 0, width: 32, narrowT: 5 }, { sx: 0, sy: 0, width: 26 }, pts, 0.1, o).width;
  assert.ok(grow > shrink * 2, `넓힘 ${grow} 좁힘 ${shrink}`);
});

test('빨간 차선 끝도 틀에 들어간다', () => {
  const w = createWorld({ ai: false });
  w.lanes.push({ x: w.boss.x, z: w.boss.z, angle: Math.PI / 2, aimed: false, warn: 0.7, lockBefore: 0.2, born: 0, kind: K.RED, speed: 18, src: 3, off: 1.2 });
  const p = framingPoints(w, LOOK);
  assert.ok(p.length >= 4);
  const end = p[p.length - 1];
  assert.ok(Math.abs(end.z - (RULES.board.hz)) < 1e-6 || Math.abs(end.z - RULES.board.hz) < 1.01, JSON.stringify(end));
  const o = base(), f = frameTarget(p, o);
  for (const q of p) assert.ok(inside(f, q, o), JSON.stringify(q));
});

// 원거리 재설계 Task 5: 박치기 줄 끝·빔 끝도 담는다
test('박치기 줄 끝과 레이저 빔 끝을 담는다', () => {
  const w = createWorld({ seed: 1 });
  w.boss.x = 6; w.boss.z = 0; w.player.x = 2; w.player.z = 0;
  w.floorAreas.push({ kind: 'slam', shape: 'lane', x: 6, z: 0, face: Math.PI, len: 15.5, width: 3.2, color: 'red', warn: 0.5, born: 0, hit: false });
  w.beams.push({ x: 6, z: 0, angle: Math.PI / 2, base: Math.PI / 2, dir: 1, len: RULES.board.hz, fired: false });
  const p = framingPoints(w, LOOK);
  assert.ok(p.some(q => Math.abs(q.x - (6 - 15.5)) < 1e-6 && Math.abs(q.z) < 1e-6), '줄 끝 없음');
  assert.ok(p.some(q => Math.abs(q.x - 6) < 1e-6 && Math.abs(q.z - RULES.board.hz) < 1e-6), '빔 끝 없음');
});
