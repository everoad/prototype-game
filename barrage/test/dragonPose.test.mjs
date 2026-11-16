// 용 자세(설계 용 §7): sim 상태 → 몸 부위 자세(순수 함수). 화면은 이 값을 따라 상자를 움직인다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { startTail, startWing, updateFloor } from '../src/sim/floor.js';
import { startPattern, updatePattern } from '../src/sim/patterns.js';
import { updateBeams } from '../src/sim/beams.js';
import { addStagger } from '../src/sim/boss.js';
import { dragonPose, neckYaw } from '../src/view/dragonPose.js';
import { idle, ticks } from './helpers.mjs';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function quietDragon(deg = 180, d = 4) {
  const w = createWorld({ ai: false, boss: 'dragon' });
  w.player.invulnUntil = 1e9;
  const a = w.boss.face + deg * Math.PI / 180;
  w.player.x = w.player.px = w.boss.x + Math.cos(a) * d; w.player.z = w.player.pz = w.boss.z + Math.sin(a) * d;
  return w;
}
const tick = (w, n = 1) => { for (let k = 0; k < n; k++) { step(w, idle); if (w.floor) updateFloor(w); drainEvents(w); } };

test('꼬리 예고면 꼬리를 감고, 타격 뒤엔 반대쪽으로 휘두름', () => {
  const w = quietDragon();
  startTail(w, 'white');
  tick(w, ticks(0.3));
  assert.ok(dragonPose(w).tail > 0.5, `예고 ${dragonPose(w).tail}`);
  tick(w, ticks(0.17));
  assert.ok(dragonPose(w).tail < 0, `타격 뒤 ${dragonPose(w).tail}`);
});

test('왼쪽 날갯짓 예고면 왼 날개만 듦', () => {
  const w = quietDragon(90);
  startWing(w, 'white', 1);
  tick(w, ticks(0.3));
  const p = dragonPose(w);
  assert.ok(p.wingL > 0.5 && p.wingR === 0, JSON.stringify(p));
});

test('머리 패턴 준비면 머리를 들고 입을 벌림', () => {
  const w = quietDragon(0, 8);
  w.boss.state = 'windup'; w.boss.stateAt = w.time - 0.2; w.boss.next = { pattern: 1 };
  const p = dragonPose(w);
  assert.ok(p.headLift > 0.5 && p.jaw > 0.5, JSON.stringify(p));
});

test('브레스 쓸기 중 머리 돌림 = 빔 각 − 보는 쪽', () => {
  const w = quietDragon(0, 8);
  updatePattern(w, startPattern(w, 8));
  for (let k = 0; k < ticks(0.9); k++) { step(w, idle); updateBeams(w); drainEvents(w); }
  const m = w.beams[0];
  assert.ok(m && w.time >= m.fireAt, '빔이 아직 안 나옴');
  assert.ok(Math.abs(wrap(dragonPose(w).headYaw - (m.angle - w.boss.face))) < 1e-9);
});

test('그로기면 엎드림', () => {
  const w = quietDragon();
  addStagger(w, 100);
  assert.equal(dragonPose(w).down, 1);
});

test('목 돌림 부호: 보스 무리(rotation.y = −face) 안에서 머리가 빔 쪽을 본다', () => {
  const face = 0.7, beam = 1.2, phi = neckYaw({ headYaw: beam - face }) - face;   // three: rotation.y φ면 +x가 (cos φ, −sin φ)를 본다
  assert.ok(Math.abs(Math.cos(phi) - Math.cos(beam)) < 1e-9 && Math.abs(-Math.sin(phi) - Math.sin(beam)) < 1e-9, `머리 ${Math.atan2(-Math.sin(phi), Math.cos(phi))} 빔 ${beam}`);
});
