// 카메라 셈(4단계 계획 Task 2, 사용자 2026-11-13 "QE 화면 회전도 마우스 휠키로 상하좌우"): 가운데 끌기 = 회전(좌우)·기울기(상하, 30~70°).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbit, cameraOffset, CAMERA } from '../src/view/camMath.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test('가로로 끌면 돈다', () => {
  const c = orbit({ yaw: 0, pitch: 45 }, 100, 0);
  near(c.yaw, 35 * Math.PI / 180);
  assert.equal(c.pitch, 45);
  assert.deepEqual([CAMERA.pitchStart, CAMERA.pitchMin, CAMERA.pitchMax], [45, 30, 70]);
});

test('세로로 끌면 기울고 30~70°에 묶인다(아래로 끌면 더 내려다본다)', () => {
  near(orbit({ yaw: 0, pitch: 45 }, 0, 100).pitch, 60);
  assert.equal(orbit({ yaw: 0, pitch: 45 }, 0, 1000).pitch, 70);
  assert.equal(orbit({ yaw: 0, pitch: 45 }, 0, -1000).pitch, 30);
});

test('카메라 자리: 45°면 뒤로 높이만큼, 70°면 더 가깝게', () => {
  const a = cameraOffset({ h: 300, yaw: 0, pitch: 45 });
  near(a.x, 0); near(a.z, -300); assert.equal(a.y, 300);
  near(Math.abs(cameraOffset({ h: 300, yaw: 0, pitch: 70 }).z), 300 / Math.tan(70 * Math.PI / 180));
  near(Math.abs(cameraOffset({ h: 300, yaw: 0, pitch: 70 }).z), 109.19, 0.01);
});

test('yaw −45°(시작 시점)에서 자리', () => {
  const a = cameraOffset({ h: 300, yaw: -Math.PI / 4, pitch: 45 });
  near(a.x, 212.13, 0.01); near(a.z, -212.13, 0.01);
});
