// 이기어검 그리기(view/swordsView.js): three.js 없이 — 그리는 물건은 가짜로 두고, 검의 자리와 맡은 일만 본다.
// 판을 한 틱씩 돌리며 그 사건을 화면에 먹인다(main.js의 한 장과 같은 차례).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { LOOK } from '../src/view/look.js';
import { labHand } from '../src/sim/labs.js';
import { restartRoom } from '../src/sim/stage.js';
import { gameTries } from '../src/sim/tries.js';
import { createSwordsView, strikeOrder } from '../src/view/swordsView.js';
import { idle, ticks } from './helpers.mjs';

const v3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
class Geo { rotateX() { return this; } translate() { return this; } }
const THREE = {
  Shape: class { moveTo() {} lineTo() {} closePath() {} },
  ShapeGeometry: Geo, PlaneGeometry: Geo,
  MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); this.color = { set() {} }; this.opacity = 1; } },
  Mesh: class { constructor(g, m) { this.material = m; this.position = v3(); this.rotation = { y: 0 }; this.scale = v3(); } },
  Group: class { constructor() { this.position = v3(); this.rotation = { y: 0 }; this.scale = v3(); this.visible = true; } add() {} },
};
function rig() {
  const shots = new Set(), view = { THREE, layers: { shots: { add: m => shots.add(m), remove: m => shots.delete(m) } } };
  return { view, shots, sv: createSwordsView(view, LOOK) };
}
function frames(w, r, sec, input) {
  for (let k = 0; k < ticks(sec); k++) { step(w, input(w)); r.sv.onEvents(drainEvents(w), 0, w); r.sv.update(w, 1); }
}

test('스킬 타격을 맡은 검은 그 몫을 반드시 내려놓는다 — 타격이 다 끝난 뒤에 밀린 몫이 남지 않는다', () => {
  const w = createWorld({ char: 'sword', lab: 'swords', clip: 'slash' }), r = rig();
  frames(w, r, 6, labHand);
  assert.equal(w.player.swords.strikes.length, 0);
  assert.deepEqual(r.sv.peek().filter(s => s.jobs > 0).map(s => `${s.b}:${s.k}`), [], '몫이 밀린 검(그 뒤의 타격에 나서지 못한다)');
});

test('화면의 검 수는 판과 같고, 자리는 늘 판 안팎의 유한한 값이다(몰아 쓰기 6초)', () => {
  const w = createWorld({ char: 'sword', lab: 'swords', clip: 'burst' }), r = rig();
  for (let k = 0; k < ticks(6); k++) {
    step(w, labHand(w)); r.sv.onEvents(drainEvents(w), 0, w); r.sv.update(w, 1);
    assert.equal(r.sv.count(), w.player.swords.list.length);
    for (const s of r.sv.peek()) assert.ok(Math.abs(s.x) < 40 && Math.abs(s.z) < 40, `검 ${s.b}:${s.k}의 자리 ${s.x}, ${s.z}`);
  }
  assert.ok(r.shots.size < 200, `그리는 물건 ${r.shots.size}`);
});

test('방을 다시 시작하면 검은 곧 다섯 자루로 돌아와 나를 따라온다(결과 화면에서 흐른 시간에 끌려가지 않는다)', () => {
  const w = createWorld({ char: 'sword', stage: 1, seed: 1, tries: gameTries(null), ai: false }), r = rig(), p = w.player, m = w.enemies[0];
  m.x = m.px = p.x + 2; m.z = m.pz = p.z; m.bornAt = -1; m.hp = m.maxHp = 1e6;
  p.store.push({ perfect: false, gold: false, stagger: 0 });
  frames(w, r, 0.3, w2 => (w2.tick === 0 ? { ...idle, spin: true } : idle));
  assert.equal(r.sv.count(), 10);
  w.result = 'lose';
  for (let k = 0; k < 480; k++) { r.view.simTime = w.time + k / 120; r.sv.onEvents([], 0, w); r.sv.update(w, 1); }   // 결과 화면 4초(그리기용 시각은 흐른다)
  restartRoom(w);
  for (const e of w.enemies) e.bornAt = 1e9;   // 새로 놓인 몬스터는 아직 나오지 않은 것으로(검이 나가지 않고 떠 있기만 하게)
  frames(w, r, 1, () => ({ ...idle, mx: 1 }));
  const now = r.sv.peek();
  assert.equal(now.length, 5, '식은 묶음의 검이 남아 있지 않다');
  for (const s of now) assert.ok(Math.hypot(s.x - p.x, s.z - p.z) < 4, `검 ${s.b}:${s.k}이 ${Math.hypot(s.x - p.x, s.z - p.z).toFixed(1)} U 떨어져 있다`);
});

test('타격의 차례: 가까운 검이 먼저, 새 다섯은 마지막(가운데 자루가 맨 끝) — 마무리는 멀리 있던 검, 내 곁의 검(가까운 순), 새 다섯', () => {
  const S = (name, o) => ({ name, fresh: false, far: false, dFoe: 0, dMe: 0, k: 0, ...o });
  const spin = [S('new0', { fresh: true, k: 0 }), S('new2', { fresh: true, k: 2 }), S('away', { dFoe: 5 }), S('close', { dFoe: 1 })];
  assert.deepEqual(strikeOrder(spin, 'spin').map(s => s.name), ['close', 'away', 'new0', 'new2']);
  const fin = [S('new2', { fresh: true, k: 2 }), S('mine', { dMe: 1, dFoe: 6 }), S('out', { far: true, dFoe: 1, dMe: 9 }), S('mine2', { dMe: 3, dFoe: 2 })];
  assert.deepEqual(strikeOrder(fin, 'finish').map(s => s.name), ['out', 'mine', 'mine2', 'new2']);
});
