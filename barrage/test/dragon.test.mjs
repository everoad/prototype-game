// 두 번째 보스 — 몸을 돌리는 용(설계 2026-11-16-barrage-dragon-design.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { zoneOf, headAim } from '../src/sim/dragonBody.js';
import { turnRate } from '../src/sim/dragon.js';
import { startPattern, updatePattern, updateLanes } from '../src/sim/patterns.js';
import { updateBeams } from '../src/sim/beams.js';
import { startSlam, startTail, startWing, updateFloor } from '../src/sim/floor.js';
import { startRush, updateRush } from '../src/sim/melee.js';
import { budgetCombo } from '../src/sim/bossCore.js';
import { addStagger } from '../src/sim/boss.js';
import { K } from '../src/sim/rules.js';
import { stateHash } from '../src/sim/world.js';
import { idle, ticks } from './helpers.mjs';

const D = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// 용 판: 플레이어는 맞지 않게, 용 체력은 크게. 용은 (bx, 0)에서 face 쪽을 본다.
function dragonWorld({ face = Math.PI, bx = 6, px = -6, pz = 0, ...opts } = {}) {
  const w = createWorld({ seed: 3, boss: 'dragon', ...opts });
  w.player.invulnUntil = 1e9;
  w.boss.hp = w.boss.maxHp = 1e9;
  w.boss.x = w.boss.px = bx; w.boss.z = w.boss.pz = 0; w.boss.face = face;
  w.player.x = w.player.px = px; w.player.z = w.player.pz = pz;
  return w;
}
// 플레이어를 용 둘레 (각 deg, 거리 d)에 둔다(용이 보는 쪽 기준)
function place(w, deg, d) {
  const a = w.boss.face + deg * D;
  w.player.x = w.player.px = w.boss.x + Math.cos(a) * d; w.player.z = w.player.pz = w.boss.z + Math.sin(a) * d;
}
function run(w, sec, each) { for (let k = 0; k < ticks(sec); k++) { each?.(w, k); step(w, idle); drainEvents(w); } }

test('용 수치는 모두 유한한 수(줄 가운데 주석이 값을 삼키지 않음)', () => {
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path}.${k} = ${v}`);
      else if (v && typeof v === 'object') walk(v, `${path}.${k}`);
    }
  };
  walk(RULES.dragon, 'dragon');
  assert.equal(RULES.src.tail, 15); assert.equal(RULES.src.wing, 16);
});

test('용 판: 체력은 RULES.dragon.hp, 입이 있다', () => {
  const w = createWorld({ boss: 'dragon' });
  assert.equal(w.boss.maxHp, RULES.dragon.hp);
  assert.equal(w.boss.kind, 'dragon');
  assert.ok(w.boss.mouth);
});

test('몸 돌기 상한: 가만히 1초에 90°까지', () => {
  const w = dragonWorld({ face: 0 });   // 플레이어가 바로 뒤 12 U(180°) — 걷지 않고 돈다(숨 → 돌기)
  w.boss.opening = RULES.dragon.brain.opening.length;
  run(w, 1);
  assert.ok(Math.abs(Math.abs(wrap(w.boss.face)) - RULES.dragon.turn.free * D) < 1.5 * D, `돈 각 ${wrap(w.boss.face) / D}°`);
});

test('몸 돌기 빠르기: 가만히·돌기·기다림 90, 준비·패턴·장판·근접 45, 빔이 있으면 0', () => {
  const w = dragonWorld({ ai: false }), T = RULES.dragon.turn;
  for (const s of ['idle', 'turn', 'patternWait', 'floorWait', 'meleeWait', 'wake']) { w.boss.state = s; assert.equal(turnRate(w), T.free, s); }
  for (const s of ['windup', 'pattern', 'floor', 'rush', 'melee']) { w.boss.state = s; assert.equal(turnRate(w), T.busy, s); }
  w.beams.push({}); assert.equal(turnRate(w), 0);
});

test('자리: 49° 앞, 51° 옆, 129° 옆, 131° 뒤, 왼·오른', () => {
  const w = dragonWorld({ face: 0.3 });
  const at = deg => { place(w, deg, 6); return zoneOf(w); };
  assert.equal(at(0), 'front'); assert.equal(at(49), 'front'); assert.equal(at(-49), 'front');
  assert.equal(at(51), 'left'); assert.equal(at(129), 'left');
  assert.equal(at(-51), 'right'); assert.equal(at(-129), 'right');
  assert.equal(at(131), 'back'); assert.equal(at(-131), 'back'); assert.equal(at(180), 'back');
});

test('입은 보는 쪽 2.6 U', () => {
  const w = dragonWorld({ face: Math.PI, px: -6 });
  run(w, 0.05);
  const b = w.boss, m = b.mouth;
  assert.ok(Math.abs(m.x - (b.x + Math.cos(b.face) * RULES.dragon.mouthAt)) < 1e-9);
  assert.ok(Math.abs(m.z - (b.z + Math.sin(b.face) * RULES.dragon.mouthAt)) < 1e-9);
});

test('걷기: 앞쪽 반 · 9 U 넘게면 1.5 U/s로 다가옴', () => {
  const w = dragonWorld({ face: Math.PI, bx: 6, px: -8 });   // 앞 14 U
  run(w, 1);
  assert.ok(Math.abs((6 - w.boss.x) - RULES.dragon.walk.speed[0]) < 0.05, `걸은 거리 ${6 - w.boss.x}`);
});

test('걷기: 뒤쪽 반이면 걷지 않고 돈다, 가까우면 서 있고 뒤로 걷지 않음', () => {
  const back = dragonWorld({ face: 0, bx: 6, px: -6 });   // 바로 뒤 12 U
  run(back, 0.4);
  assert.ok(Math.hypot(back.boss.x - 6, back.boss.z) < 1e-9, '뒤쪽 반인데 걸음');
  assert.ok(Math.abs(wrap(back.boss.face)) > 20 * D, '돌지 않음');
  const near = dragonWorld({ face: Math.PI, bx: 6, px: 1 });   // 앞 5 U
  run(near, 1);
  assert.ok(Math.hypot(near.boss.x - 6, near.boss.z) < 1e-9, '가까운데 움직임');
});

test('머리 겨눔: 옆 90°의 플레이어엔 face+60°, 앞 30°면 그대로', () => {
  const w = dragonWorld({ face: 0 });
  place(w, 90, 7);
  const m = w.boss.mouth;
  assert.ok(Math.abs(wrap(headAim(w, m.x, m.z) - RULES.dragon.aimCone * D)) < 1e-9);
  place(w, -90, 7);
  assert.ok(Math.abs(wrap(headAim(w, m.x, m.z) + RULES.dragon.aimCone * D)) < 1e-9);
  place(w, 20, 8);
  const want = Math.atan2(w.player.z - m.z, w.player.x - m.x);
  assert.ok(Math.abs(wrap(headAim(w, m.x, m.z) - want)) < 1e-9);
});

test('원거리 보스엔 mouth 없음', () => {
  const w = createWorld({ seed: 3 });
  w.player.invulnUntil = 1e9;
  for (let k = 0; k < ticks(3); k++) { step(w, idle); drainEvents(w); }
  assert.equal(w.boss.mouth ?? null, null);
});

// ── 머리 공격은 입에서(Task 3)
const alive = w => { const b = w.bullets, out = []; for (let i = 0; i < b.cap; i++) if (b.alive[i]) out.push(i); return out; };
function headWorld(deg = 0, d = 8) {
  const w = dragonWorld({ face: Math.PI, ai: false });
  place(w, deg, d);
  run(w, 0);   // 입 자리는 initDragon이 둔다
  return w;
}

test('용 패턴 1: 탄이 입에서 생김', () => {
  const w = headWorld();
  updatePattern(w, startPattern(w, 1));
  const ids = alive(w), m = w.boss.mouth;
  assert.ok(ids.length > 0);
  for (const i of ids) assert.ok(Math.hypot(w.bullets.x[i] - m.x, w.bullets.z[i] - m.z) < 1e-6, '입 밖에서 생김');
});

test('옆(90°)의 플레이어엔 face±60°로 겨눔', () => {
  const w = headWorld(90, 7);
  updatePattern(w, startPattern(w, 1));
  const white = alive(w).find(i => w.bullets.kind[i] === K.WHITE);
  const a = Math.atan2(w.bullets.vz[white], w.bullets.vx[white]);
  assert.ok(Math.abs(wrap(a - (w.boss.face + RULES.dragon.aimCone * D))) < 1e-6, `가운데 흰 탄 ${(a - w.boss.face) / D}°`);
});

test('불 창 차선이 입에서, 겨눔 한계 안', () => {
  const w = headWorld(90, 7);
  updatePattern(w, startPattern(w, 3));
  const l = w.lanes[0], m = w.boss.mouth;
  assert.ok(Math.hypot(l.x - m.x, l.z - m.z) < 1e-9);
  updateLanes(w);
  assert.ok(Math.abs(wrap(l.angle - (w.boss.face + RULES.dragon.aimCone * D))) < 1e-6, `차선 ${(l.angle - w.boss.face) / D}°`);
});

test('브레스 빔이 입에서 나옴', () => {
  const w = headWorld(-90, 7);
  updatePattern(w, startPattern(w, 8));
  updateBeams(w);
  const m = w.beams[0];
  assert.ok(Math.hypot(m.x - w.boss.mouth.x, m.z - w.boss.mouth.z) < 1e-9);
  assert.ok(Math.abs(wrap(m.base - (w.boss.face - RULES.dragon.aimCone * D))) < 1e-6);
});

test('lab + 용 = 지금 연습 장면 그대로(입 없음)', () => {
  const a = createWorld({ seed: 4, lab: 'parry', boss: 'dragon' }), b = createWorld({ seed: 4, lab: 'parry' });
  for (let k = 0; k < ticks(3); k++) { step(a, idle); step(b, idle); drainEvents(a); drainEvents(b); }
  assert.equal(a.boss.mouth ?? null, null);
  assert.equal(stateHash(a), stateHash(b));
});

// ── 꼬리·날갯짓·몸 공격 방향(Task 4). 두뇌는 끄고(ai: false) 장판 공격 하나만 손으로 돌린다.
function bodyWorld(deg, d) {
  const w = dragonWorld({ face: Math.PI, ai: false });
  w.player.invulnUntil = -1;
  place(w, deg, d);
  return w;
}
// 틱마다 step(입력) + updateFloor(두뇌 대신). parryAt초에 패링 키.
function floorRun(w, sec, parryAt = null) {
  for (let k = 0; k < ticks(sec); k++) {
    step(w, { ...idle, parry: parryAt != null && k === ticks(parryAt) });
    if (w.floor) updateFloor(w);
    drainEvents(w);
  }
}

test('꼬리: 뒤 4 U의 플레이어는 맞고 앞 4 U는 안 맞음', () => {
  const back = bodyWorld(180, 4), hp = back.player.hp;
  startTail(back, 'red');
  floorRun(back, 0.6);
  assert.equal(hp - back.player.hp, RULES.dragon.tail.dmg);
  assert.equal(back.stats.hitsByPattern[RULES.src.tail], 1);
  const front = bodyWorld(0, 4), hp2 = front.player.hp;
  startTail(front, 'red');
  floorRun(front, 0.6);
  assert.equal(front.player.hp, hp2);
});

test('흰 꼬리 패링 = 무력화 12', () => {
  const w = bodyWorld(170, 4);
  startTail(w, 'white');
  floorRun(w, 0.6, 0.3);   // 타격 0.45초 — 0.15초 전 누름 = 보통 패링
  assert.equal(w.boss.stagger, RULES.dragon.tail.stagger[0]);
  assert.equal(w.stats.parries, 1);
});

test('날갯짓: 그쪽 반원 플레이어는 파도에 맞고 반대쪽은 안전', () => {
  const left = bodyWorld(90, 4), hp = left.player.hp;
  startWing(left, 'red', 1);
  floorRun(left, 1.0);
  assert.equal(hp - left.player.hp, RULES.floor.wave.dmg);
  assert.equal(left.stats.hitsByPattern[RULES.src.wing], 1);
  const other = bodyWorld(-90, 4), hp2 = other.player.hp;
  startWing(other, 'red', 1);
  floorRun(other, 1.0);
  assert.equal(other.player.hp, hp2);
});

test('용 활공 줄은 옆 90°의 플레이어로 순간에 돌지 않음', () => {
  const w = bodyWorld(90, 7), face = w.boss.face;
  startSlam(w, 'white');
  assert.ok(Math.abs(wrap(w.floor.area.face - face)) < 1e-9);
  updateFloor(w);
  assert.ok(Math.abs(wrap(w.floor.area.face - face)) < 1e-9);
});

test('용 덮치기는 보는 쪽으로, 목표가 난간 밖으로 안 나감', () => {
  const w = dragonWorld({ face: 0, bx: 7, ai: false });
  place(w, 30, 8);   // 앞 30°에 플레이어 — 몸은 돌지 않으니 보는 쪽(+x, 난간)으로 달린다
  startRush(w, 'A');
  for (let k = 0; k < ticks(1) && w.melee.rush; k++) { step(w, idle); updateRush(w); drainEvents(w); }
  const R = RULES;
  assert.ok(w.boss.x <= R.board.hx - R.boss.r + 1e-9, `판 밖 ${w.boss.x}`);
  assert.ok(Math.abs(w.boss.z) < 1e-9, '보는 쪽이 아닌 데로 달림');
});

test('원거리 박치기·발톱은 지금처럼 플레이어 쪽', () => {
  const w = createWorld({ seed: 3, ai: false });
  w.player.x = w.player.px = 0; w.player.z = w.player.pz = 5;
  startSlam(w, 'white');
  const want = Math.atan2(5 - w.boss.z, 0 - w.boss.x);
  assert.ok(Math.abs(wrap(w.floor.area.face - want)) < 1e-9);
});

// ── 용의 두뇌: 자리로 고르기(Task 5)
// 고른 것: 패턴 준비 = 번호, 'rush' · 'melee' · 'slam' · 'wave' · 'wing' · 'tail' · 'turn'(돌기 시작)
function picks(w, sec, each = null) {
  const out = [], ev = [];
  let wasTurn = false;
  for (let k = 0; k < ticks(sec); k++) {
    each?.(w, k);
    step(w, idle);
    if (w.boss.state === 'turn' && !wasTurn) out.push({ id: 'turn', t: w.time });
    wasTurn = w.boss.state === 'turn';
    for (const e of drainEvents(w)) {
      ev.push(e);
      if (e.type === 'windup' && e.kind === 'pattern') out.push({ id: e.id, sparse: e.sparse, t: e.t });
      if (e.type === 'rushStart') out.push({ id: 'rush', t: e.t, combo: e.combo });
      if (e.type === 'meleeStart') out.push({ id: 'melee', t: e.t });
      if (e.type === 'slamStart') out.push({ id: 'slam', t: e.t, color: e.color });
      if (e.type === 'windup' && e.kind === 'wave') out.push({ id: 'wave', t: e.t, color: e.color });
      if (e.type === 'wingStart') out.push({ id: 'wing', t: e.t, side: e.side });
      if (e.type === 'tailStart') out.push({ id: 'tail', t: e.t });
    }
  }
  return { out, ev };
}
// 여는 순서를 건너뛴 용 판
function brainDragon(opts = {}) { const w = dragonWorld(opts); w.boss.opening = RULES.dragon.brain.opening.length; return w; }
const hold = (deg, d) => w => place(w, deg, d);   // 플레이어를 용 기준 자리에 붙들어 둔다(용이 돌아도)

test('여는 순서: 1 → 3 → 흰 활공 → 덮치기 A', () => {
  const w = dragonWorld();
  const { out } = picks(w, 16);
  assert.deepEqual(out.slice(0, 4).map(p => p.id), [1, 3, 'slam', 'rush']);
  assert.equal(out[2].color, 'white');
  assert.equal(out[3].combo, 'A');
});

test('가까운 뒤 → 꼬리, 가까운 옆 → 그쪽 날개, 가까운 앞 → 발톱 또는 포효', () => {
  assert.equal(picks(brainDragon(), 1, hold(180, 3.5)).out[0].id, 'tail');
  const left = picks(brainDragon(), 1, hold(90, 3.5)).out[0];
  assert.equal(left.id, 'wing'); assert.equal(left.side, 1);
  const right = picks(brainDragon(), 1, hold(-90, 3.5)).out[0];
  assert.equal(right.id, 'wing'); assert.equal(right.side, -1);
  for (const seed of [1, 2, 3, 4]) assert.ok(['melee', 'wave'].includes(picks(brainDragon({ seed }), 1, hold(0, 3.5)).out[0].id));
});

test('꼬리 두 번 뒤 세 번째는 포효', () => {
  const { out } = picks(brainDragon(), 8, hold(180, 3.5));
  assert.deepEqual(out.slice(0, 3).map(p => p.id), ['tail', 'tail', 'wave']);
});

test('옆 7 U에 머물면 돌기 → 1초 안에 앞이 되면 머리 패턴, 아니면 포효', () => {
  const w = brainDragon();
  place(w, 90, 7);   // 한 번만 둔다 — 용이 돌아 앞에 들어온다
  const a = picks(w, 1.5).out;
  assert.equal(a[0].id, 'turn');
  assert.equal(typeof a[1].id, 'number');
  assert.ok(a[1].t - a[0].t < RULES.dragon.turnMax, '1초 안에 앞이 되지 않음');
  const b = picks(brainDragon(), 1.5, hold(90, 7)).out;   // 늘 옆
  assert.equal(b[0].id, 'turn'); assert.equal(b[1].id, 'wave');
  assert.ok(Math.abs(b[1].t - b[0].t - RULES.dragon.turnMax) < 0.05);
});

test('머리 공격 뒤 다음 머리 준비는 앞 run이 다 끝난 뒤', () => {
  let heads = 0;
  for (const phase of [1, 2]) {
    const w = brainDragon({ phase });
    for (let k = 0; k < ticks(60); k++) {
      hold(0, 8)(w); w.boss.floorAt = Infinity;   // 머리 공격만(장판 시계 끔 — 활공이 용을 난간으로 데려가면 앞 8 U가 판 밖이 된다)
      step(w, idle);
      for (const e of drainEvents(w)) if (e.type === 'windup' && e.kind === 'pattern' && e.id !== 7) { heads++; assert.ok(w.boss.runs.every(r => r.id === 7), `${phase}단계 ${e.t.toFixed(2)} 패턴 ${e.id}: 머리 run이 남음`); }   // 날개 탄 벽(7)은 입이 아니라 남아도 된다
    }
  }
  assert.ok(heads > 20, `머리 공격 ${heads}번`);
});

test('경계 50°에 서 있어도 고른 공격은 그 순간 자리 그대로', () => {
  const w = brainDragon();
  const { out } = picks(w, 0.6, (w, k) => place(w, k < ticks(0.3) ? 55 : 45, 3.5));   // 옆에서 고른 뒤 앞으로 들어옴
  assert.equal(out[0].id, 'wing'); assert.equal(out[0].side, 1);
  assert.ok(!out.some(p => p.id === 'melee'), '날갯짓 예고 중 발톱으로 바뀜');
});

test('꼬리 예고 중 그로기 → 장판 지움, 깨어난 뒤 1초 안엔 공격 없음', () => {
  const w = brainDragon();
  let tailAt = null;
  picks(w, 1, (w) => { place(w, 180, 3.5); if (w.floor?.kind === 'tail' && tailAt == null) { tailAt = w.time; addStagger(w, 100); } });
  assert.ok(tailAt != null, '꼬리가 안 나옴');
  assert.equal(w.floor, null); assert.equal(w.floorAreas.length, 0);
  const { out, ev } = picks(w, RULES.stagger.groggy + 2, hold(180, 3.5));
  const end = ev.find(e => e.type === 'groggyEnd');
  assert.ok(end);
  assert.ok(out.every(p => p.id === 'turn' || p.t >= end.t + RULES.brain.wake + RULES.brain.wakeBreath - 1e-6), out.map(p => `${p.id}@${(p.t - end.t).toFixed(2)}`).join(' '));
});

test('2단계: 6·7을 하나씩 성기게 소개, 구슬 없음', () => {
  const w = dragonWorld({ phase: 2 });
  const { out } = picks(w, 60, (w) => { hold(0, 8)(w); assert.equal(w.boss.orbs ?? null, null); });
  assert.deepEqual(out.filter(p => p.sparse).map(p => p.id), [6, 7]);
  assert.ok(!out.some(p => p.id === 5), '나선(5)은 용이 안 씀');
});

test('?pattern=1 + 용 = 그 패턴만, 입에서', () => {
  const w = dragonWorld({ pattern: 1 });
  let fires = 0, mouth = null;
  const { out } = picks(w, 6, w => { hold(0, 8)(w); mouth = { ...w.boss.mouth }; });
  assert.ok(out.length >= 3 && out.every(p => p.id === 1));
  // 탄이 입에서: 틱 앞의 입 자리(탄은 그 틱의 두뇌가 입을 옮기기 전에 생긴다)
  const w2 = dragonWorld({ pattern: 1 });
  for (let k = 0; k < ticks(6); k++) {
    hold(0, 8)(w2); mouth = { ...w2.boss.mouth };
    step(w2, idle);
    for (const e of drainEvents(w2)) if (e.type === 'fire' && e.src === 1) { fires++; assert.ok(Math.hypot(e.x - mouth.x, e.z - mouth.z) < 1e-6, `입 밖 ${e.x},${e.z}`); }
  }
  assert.ok(fires > 10);
});

// 빨간 빠른 공격이 실제로 닿는(또는 지나가는) 시각(원거리 보스 시험과 같은 셈 + 꼬리)
function redMoments(ev) {
  const out = [];
  let slamRed = false;
  for (const e of ev) {
    if (e.type === 'slamStart') slamRed = e.color === 'red';
    if ((e.type === 'slamHit' || e.type === 'slamWall') && slamRed) { out.push(e.t); slamRed = false; }
    if (e.type === 'waveHit' && e.color === 'red') out.push(e.t);
    if (e.type === 'laserFire') out.push(e.t);
    if (e.type === 'meleeHit' && e.color === 'red') out.push(e.t);
  }
  return out.sort((a, b) => a - b);
}
// 용 둘레를 앞·옆·뒤로, 가깝게·멀게 도는 손(자리를 고루 거친다)
const roam = (w, k) => { const t = k / 120; place(w, 180 * Math.sin(t / 3), Math.floor(t / 6) % 2 ? 7.5 : 3.5); };

test('빨간 빠른 공격은 어느 3초 안에도 2번까지(용)', () => {
  let total = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const w = dragonWorld({ seed });
    const { ev } = picks(w, 180, roam);
    const t = redMoments(ev); total += t.length;
    for (let i = 0; i + 2 < t.length; i++) assert.ok(t[i + 2] - t[i] > RULES.floor.redWindow - 1e-6, `seed ${seed}: ${t[i].toFixed(2)} ${t[i + 1].toFixed(2)} ${t[i + 2].toFixed(2)}`);
  }
  assert.ok(total > 15, `빨간 빠른 공격 ${total}번`);
});

test('같은 seed = 같은 판(용)', () => {
  const a = dragonWorld({ seed: 5 }), b = dragonWorld({ seed: 5 });
  picks(a, 30, roam); picks(b, 30, roam);
  assert.equal(stateHash(a), stateHash(b));
});

// ── 마지막 검토로 고친 것
test('몸 공격 방향을 고정한 뒤엔 몸도 돌지 않는다(활공 0.2초 전·달리기, 덮치기 고정 뒤)', () => {
  const w = dragonWorld({ ai: false }), F = RULES.floor.slam;
  w.boss.state = 'floor';
  w.floor = { kind: 'slam', phase: 'warn', born: w.time - (F.warn - F.lockBefore) + 0.05, area: {} };
  assert.equal(turnRate(w), RULES.dragon.turn.busy, '고정 전');
  w.floor.born = w.time - (F.warn - F.lockBefore) - 0.01;
  assert.equal(turnRate(w), 0, '고정 뒤');
  w.floor.phase = 'dash'; assert.equal(turnRate(w), 0, '달리기');
  w.floor = null; w.boss.state = 'rush'; w.melee.rush = { phase: 'crouch', locked: true };
  assert.equal(turnRate(w), 0, '덮치기 고정 뒤');
});

test('덮치기는 뒤로 미끄러지지 않는다(플레이어가 멈추는 거리보다 가까워도)', () => {
  const w = dragonWorld({ face: Math.PI, ai: false });
  place(w, 0, 2.5);
  const x0 = w.boss.x, z0 = w.boss.z, f = w.boss.face;
  startRush(w, 'A');
  for (let k = 0; k < ticks(1) && w.melee.rush; k++) { step(w, idle); updateRush(w); drainEvents(w); }
  assert.ok((w.boss.x - x0) * Math.cos(f) + (w.boss.z - z0) * Math.sin(f) >= -1e-9, '뒤로 감');
});

test('벽 앞 활공(길이 0)은 그 자리에서 slamWall, 판 안', () => {
  const w = dragonWorld({ face: 0, bx: RULES.board.hx - RULES.boss.r - 0.05, ai: false });
  place(w, 0, 0.1);
  const ev = [];
  startSlam(w, 'red');
  for (let k = 0; k < ticks(1) && w.floor; k++) { step(w, idle); updateFloor(w); ev.push(...drainEvents(w)); }
  assert.ok(ev.some(e => e.type === 'slamWall'));
  assert.ok(w.boss.x <= RULES.board.hx - RULES.boss.r + 1e-9);
});

test('날개 탄 벽이 남아 있으면 다음 머리 공격은 벽이 끝난 뒤(2단계 밀도 — 봇 판으로 정함)', () => {
  const w = dragonWorld({ pattern: 1, phase: 2 });
  const wall = startPattern(w, 7); updatePattern(w, wall);
  w.boss.runs.push(wall);
  let at = null;
  for (let k = 0; k < ticks(6) && at == null; k++) { hold(0, 8)(w); step(w, idle); for (const e of drainEvents(w)) if (e.type === 'windup' && e.id === 1) at = w.time; }
  assert.ok(at != null, '머리 공격이 안 나옴');
  assert.ok(!w.boss.runs.includes(wall), '벽이 남았는데 머리 준비');
});

test('벽에 막힌 덮치기는 빨간 타격 예정을 실제 달릴 거리로 센다', () => {
  const R = RULES, w = dragonWorld({ face: 0, bx: R.board.hx - R.boss.r - 0.5, ai: false });
  place(w, 30, 12);   // 플레이어는 멀지만 보는 쪽(벽)으로는 0.5 U밖에 못 달린다
  w.rng.next = () => 0.99;   // 콤보 B 그대로(예산 안)
  assert.equal(budgetCombo(w, 'B', true), 'B');
  let redAt = 0;
  for (const [kind, color] of R.combos.B) { redAt += R.melee[kind].warn; if (color === 'red') break; redAt += R.melee.active + R.melee.recover; }
  const want = w.time + R.rush.crouch + 0.5 / R.rush.speed + redAt;
  assert.ok(Math.abs(w.boss.redTimes.at(-1) - want) < 0.03, `예정 ${w.boss.redTimes.at(-1) - w.time} 기대 ${want - w.time}`);
});

test('입 바로 앞의 플레이어 위에서는 탄이 생기지 않는다', () => {
  const w = dragonWorld({ face: Math.PI, ai: false });
  run(w, 0);
  const m = w.boss.mouth;
  w.player.x = w.player.px = m.x - 0.3; w.player.z = w.player.pz = m.z;
  const r = startPattern(w, 2); updatePattern(w, r);
  for (const i of alive(w)) assert.ok(Math.hypot(w.bullets.x[i] - w.player.x, w.bullets.z[i] - w.player.z) >= RULES.dragon.mouthGuard - 1e-9, '플레이어 위에서 생김');
});
