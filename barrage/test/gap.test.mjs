// 검사의 틈(2026-11-18 — 사용자: "돌진한 뒤에 보스 패턴을 보고 피할지 연계를 할지 결정을 하는 순간이 필요하다"):
// 일섬으로 건너편에 선 뒤, 다음 키를 누를 때까지 판 전체가 느리게 흐른다(가장 길게는 max초). 그동안 나를 덮는 예고의 색을 읽어 준다.
// 화면 쪽의 일이다 — 판정은 바뀌지 않는다(판 전체의 시간이 늘어질 뿐).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeFx } from '../src/view/timeFx.js';
import { gapWanted, isDecision, threatAt, flurryWanted, flurryOver, volleyGap } from '../src/view/gap.js';
import { LOOK } from '../src/view/look.js';
import { step, drainEvents } from '../src/sim/world.js';
import { storeAdd } from '../src/sim/store.js';
import { quietWorld, idle, ticks } from './helpers.mjs';

const G = LOOK.sword.gap;

test('틈: 열려 있는 동안 느리게 흐르고, 닫으면 바로 제 빠르기로 돌아온다 — 가장 길게는 max초', () => {
  const t = createTimeFx(LOOK);
  assert.equal(t.gapOpen(1), false);
  t.gap(1, 0.2, 0.7);
  assert.equal(t.scaleAt(1.1), 0.2); assert.equal(t.gapOpen(1.1), true);
  t.endGap(1.3);
  assert.equal(t.scaleAt(1.31), 1); assert.equal(t.gapOpen(1.31), false);
  t.gap(2, 0.2, 0.7);
  assert.equal(t.scaleAt(2.69), 0.2);
  assert.equal(t.scaleAt(2.71), 1, '누르지 않아도 max초 뒤에는 풀린다');
});

test('틈이 정지·느려짐과 겹치면 더 느린 쪽이 이긴다. reset은 틈도 닫는다', () => {
  const t = createTimeFx(LOOK);
  t.gap(1, 0.2, 0.7);
  t.hitstop(1.1, 0.05, { override: true });
  assert.equal(t.scaleAt(1.12), 0);
  t.slow(1.2, 0.5, 0.2);
  assert.equal(t.scaleAt(1.25), 0.2);
  t.endGap(1.26);
  assert.equal(t.scaleAt(1.27), 0.5, '틈이 닫혀도 걸려 있던 느려짐은 남는다');
  t.gap(3, 0.2, 0.7); t.reset();
  assert.equal(t.scaleAt(3.1), 1);
});

// 검사 판: 보스가 d U 앞에 서 있다
function sw(d = 5) {
  const w = quietWorld({ char: 'sword' });
  w.boss.x = w.player.x + d; w.boss.z = w.player.z; w.player.blade.cutAt = 1e9; w.player.swords = null;
  return w;
}
const give = (w, n) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect: false, gold: false, stagger: 0, x: 0, z: 0, kind: 'bullet' }); drainEvents(w); };
// 일섬을 누르고 돌진이 끝나는 틱까지 돌린다(그 틱의 사건을 돌려준다). keys = { 틱: 입력 }
function slashEnd(w, keys = {}) {
  for (let k = 0; k < ticks(0.5); k++) {
    step(w, k === 0 ? { ...idle, throw: true } : keys[k] ?? idle);
    const ev = drainEvents(w);
    if (ev.some(e => e.type === 'bladeEnd')) return ev;
  }
  throw new Error('일섬이 끝나지 않았다');
}

test('틈이 열리는 때: 일섬으로 건너편에 섰고, 미리 눌러 둔 다음 스킬이 없고, 곁에 살아 있는 적이 있을 때', () => {
  const w = sw(5); give(w, 2);
  assert.equal(gapWanted(w, [], G), false);
  assert.equal(gapWanted(w, slashEnd(w), G), true);
});

test('가는 동안 다음 스킬을 미리 눌러 뒀으면 틈은 열리지 않는다(이미 정했다)', () => {
  const w = sw(5); give(w, 2);
  const ev = slashEnd(w, { 12: { ...idle, spin: true } });
  assert.equal(gapWanted(w, ev, G), false);
});

test('벤 적이 죽어 곁에 아무도 없으면 틈은 열리지 않는다(정할 것이 없다)', () => {
  const w = sw(5); give(w, 1);
  const ev = slashEnd(w);
  w.boss.dead = true;
  assert.equal(gapWanted(w, ev, G), false);
});

test('틈을 닫는 키: 스킬 · 회피 · 패링(걷는 것은 닫지 않는다)', () => {
  assert.equal(isDecision({ ...idle, mx: 1 }), false);
  for (const k of ['parry', 'dodge', 'throw', 'spin', 'orb']) assert.equal(isDecision({ ...idle, [k]: true }), true, k);
});

test('읽어 줄 예고: 나를 덮는 근접 예고 가운데 가장 먼저 닿는 것의 색과 남은 시간 — 없으면 null', () => {
  const w = sw(3), p = w.player;
  assert.equal(threatAt(w), null);
  w.melee.areas.push({ kind: 'slam', shape: 'circle', x: p.x, z: p.z, R: 2, color: 'red', warn: 0.45, born: w.time, hit: false });
  w.melee.areas.push({ kind: 'swing', shape: 'sector', x: p.x - 1, z: p.z, face: 0, R: 4, half: Math.PI / 3, color: 'white', warn: 0.2, born: w.time, hit: false });
  const t = threatAt(w);
  assert.equal(t.color, 'white', '먼저 닿는 쪽');
  assert.ok(Math.abs(t.left - 0.2) < 1e-9);
  w.melee.areas[1].hit = true;
  assert.equal(threatAt(w).color, 'red');
  w.melee.areas[0].x = p.x + 9;
  assert.equal(threatAt(w), null, '나를 덮지 않는 예고는 읽지 않는다');
});

// ── 회전 베기: 난무가 펼쳐지기 전의 느려짐(2026-11-18 — 사용자: "i도 난무 펼쳐지기 전에 좀 길게 슬로우 거는 것도 괜찮을 것 같다 — 연출상")
test('난무 앞의 느려짐: 회전 베기의 검 타격이 열릴 때 시작하고, 첫 검이 베는 순간 끝난다 — 잇달아 쓸 때는 every초에 한 번만', () => {
  const strike = [{ type: 'bladeSpin', hits: 1 }, { type: 'swordsStrike', skill: 'spin', total: 10 }];
  assert.equal(flurryWanted(strike, 5, -1e9, G.spin), true);
  assert.equal(flurryWanted([{ type: 'bladeSpin', hits: 0 }], 5, -1e9, G.spin), false, '맞히지 못한 회전 베기에는 없다(검 타격이 열리지 않는다)');
  assert.equal(flurryWanted([{ type: 'swordsStrike', skill: 'slash', total: 10 }], 5, -1e9, G.spin), false, '회전 베기만');
  assert.equal(flurryWanted(strike, 5, 5 - G.spin.every / 2, G.spin), false, '바로 앞에 한 번 걸었으면 건너뛴다');
  assert.equal(flurryOver([{ type: 'swordHit', skill: 'spin', k: 0 }]), true);
  assert.equal(flurryOver([{ type: 'swordHit', skill: 'slash', k: 0 }, { type: 'swordStab' }]), false);
});

test('난무 앞의 느려짐은 실제 판에서 첫 검이 베기 전에 열린다(같은 장에 겹치지 않는다)', () => {
  const w = quietWorld({ char: 'sword' });
  w.boss.x = w.player.x + 3; w.boss.z = w.player.z; w.player.blade.cutAt = 1e9;
  give(w, 1);
  step(w, { ...idle, spin: true });
  const first = drainEvents(w);
  assert.equal(flurryWanted(first, 0, -1e9, G.spin), true);
  assert.equal(flurryOver(first), false, '첫 검은 아직 베지 않았다');
  let n = 0, over = false;
  for (; n < ticks(0.3) && !over; n++) { step(w, idle); over = flurryOver(drainEvents(w)); }
  assert.ok(over && n >= 2, `첫 검까지 ${n}틱`);
});

// ── 마무리: 연사가 터지기 전의 느려짐(2026-11-18 — 사용자: "O 스킬도 너무 순식간에 지나가서 어딘가 슬로우를 넣고 싶다")
test('연사 앞의 느려짐: 검 타격이 열린 마무리에서 내가 착지할 때 시작하고, 첫 검이 꽂히는 순간 끝난다', () => {
  let s = volleyGap(false, [{ type: 'bladeFinish', n: 2 }, { type: 'swordsStrike', skill: 'finish' }]);
  assert.deepEqual(s, { pending: true, open: false, close: false }, '튕겨 나오는 동안은 아직');
  s = volleyGap(s.pending, [{ type: 'bladeEnd', skill: 'finish' }]);
  assert.deepEqual(s, { pending: false, open: true, close: false }, '착지');
  s = volleyGap(s.pending, [{ type: 'swordHit', skill: 'finish', k: 0 }]);
  assert.equal(s.close, true);
  assert.equal(volleyGap(false, [{ type: 'bladeEnd', skill: 'finish' }]).open, false, '검 타격이 열리지 않은 마무리(벤 적이 다 죽었다)에는 없다');
  assert.equal(volleyGap(true, [{ type: 'bladeEnd', skill: 'slash' }]).open, false);
  assert.deepEqual(volleyGap(true, [{ type: 'swordsClear' }]), { pending: false, open: false, close: true }, '처형·방 넘어가기로 거둬지면 기다리던 것도 지운다');
});

test('실제 판: 마무리의 첫 검은 착지한 뒤에 꽂힌다(그 사이가 느려지는 틈이다)', () => {
  const w = quietWorld({ char: 'sword' });
  w.boss.x = w.player.x + 3; w.boss.z = w.player.z; w.player.blade.cutAt = 1e9;
  give(w, 2);
  let pending = false, opened = null, closed = null;
  for (let k = 0; k < ticks(0.6) && closed == null; k++) {
    step(w, k === 0 ? { ...idle, orb: true } : idle);
    const s = volleyGap(pending, drainEvents(w));
    pending = s.pending;
    if (s.open) opened = k;
    if (s.close) closed = k;
  }
  assert.ok(opened != null && closed != null, `열림 ${opened} · 닫힘 ${closed}`);
  assert.ok(closed - opened >= 4, `착지와 첫 검 사이 ${closed - opened}틱 — 느려질 틈이 있어야 한다`);
});
