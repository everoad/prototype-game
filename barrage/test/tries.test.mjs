// 실험 기믹(?try=…): 갈고리 이동 · 엄폐 기둥 · 불 장판 · 돌진 베기 · 꿰뚫는 던지기. 꺼져 있으면 판은 그대로(고정 해시 시험이 지킨다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { spawnMob } from '../src/sim/foes.js';
import { storeAdd } from '../src/sim/store.js';
import { parseTries, TRIES } from '../src/sim/tries.js';
import { worldOptions } from '../src/view/query.js';
import { createInputMap } from '../src/view/inputMap.js';
import { idle, ticks } from './helpers.mjs';

const T = RULES.tries, P = RULES.player;
const of = (ev, type) => ev.filter(e => e.type === type);
const play = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, typeof input === 'function' ? input(w, k) : input); ev.push(...drainEvents(w)); } return ev; };
const boss = (tries, opts = {}) => { const w = createWorld({ ai: false, store: true, tries, ...opts }); w.shots.nextAt = 1e9; return w; };
const room = tries => { const w = boss(tries); w.boss.away = true; return w; };
const give = (w, n) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect: true, gold: false, stagger: 14, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const finite = (o, path) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v)) finite(v, `${path}.${k}`); else for (const x of [].concat(v).flat(9)) if (typeof x === 'number') assert.ok(Number.isFinite(x), `${path}.${k} = ${v}`); } };

test('실험 수치는 유한한 수, 이름은 아는 것만 남는다', () => {
  finite(T, 'tries');
  assert.deepEqual(parseTries('rope, nope,fire'), ['rope', 'fire']);
  assert.deepEqual(parseTries('all'), TRIES);
  assert.deepEqual(parseTries(null), []);
  assert.equal(createWorld().tries, null);
});

test('I·F 키는 실험 행동(act) 누름이다', () => {
  const m = createInputMap(0);
  m.keyDown('KeyF', 0);
  assert.equal(m.take().act, true);
  assert.equal(m.take().act, false);
});

test('실험을 켜도 같은 seed면 같은 판', () => {
  const run1 = () => { const w = createWorld({ seed: 4, store: true, tries: 'all' }); for (let k = 0; k < ticks(8); k++) { const a = k / 170; step(w, { mx: Math.cos(a), mz: Math.sin(a), parry: k % 43 === 0, dodge: k % 277 === 0, act: k % 190 === 0, throw: k % 500 === 0 }); drainEvents(w); } return stateHash(w); };
  assert.equal(run1(), run1());
});

// ── 갈고리
test('갈고리: 가는 쪽 말뚝으로 빠르게 끌려가 말뚝 앞에서 멈춘다. 다시 쓰기까지 cooldown', () => {
  const w = boss('rope'), p = w.player;
  step(w, { ...idle, mx: 1, act: true });
  const ev = drainEvents(w), a = w.tries.rope.to;
  assert.equal(of(ev, 'ropeStart').length, 1);
  assert.ok(a && a.x > p.x, '가는 쪽(오른쪽) 말뚝이 아님');
  const d1 = Math.hypot(a.x - p.x, a.z - p.z), t = (d1 - T.rope.stopAt) / T.rope.speed;
  play(w, t * 0.5);
  const mid = Math.hypot(a.x - p.x, a.z - p.z);
  assert.ok(Math.abs(mid - (d1 - T.rope.speed * t * 0.5)) < 0.5, `절반 시간에 남은 거리 ${mid}`);
  const ev2 = play(w, t * 0.5 + 0.1);
  assert.equal(of(ev2, 'ropeEnd').length, 1);
  assert.ok(Math.abs(Math.hypot(a.x - p.x, a.z - p.z) - T.rope.stopAt) < 0.4, `멈춘 거리 ${Math.hypot(a.x - p.x, a.z - p.z)}`);
  step(w, { ...idle, mx: -1, act: true });
  assert.equal(of(drainEvents(w), 'ropeStart').length, 0, '쉬는 시간 안에 또 걸림');
  play(w, T.rope.cooldown);
  step(w, { ...idle, mx: -1, act: true });
  assert.equal(of(drainEvents(w), 'ropeStart').length, 1);
});

test('갈고리: 끌려가는 동안 무적이 아니고, 구르면 줄을 놓는다', () => {
  const w = boss('rope'), p = w.player;
  step(w, { ...idle, mx: 1, act: true });
  assert.ok(w.tries.rope.to, '줄이 안 걸림');
  spawnBullet(w, K.NORMAL, p.x + 1.5, p.z, Math.PI, 2, 1);
  const to = w.tries.rope.to, b = w.bullets;
  for (let i = 0; i < b.cap; i++) if (b.alive[i]) { const d = Math.hypot(to.x - p.x, to.z - p.z); b.x[i] = b.px[i] = p.x + (to.x - p.x) / d * 1.5; b.z[i] = b.pz[i] = p.z + (to.z - p.z) / d * 1.5; b.vx[i] = b.vz[i] = 0; }
  play(w, 0.3);
  assert.ok(p.hp < P.hp, '끌려가며 탄을 지나쳤는데 안 맞음');
  const w2 = boss('rope');
  step(w2, { ...idle, mx: 1, act: true });
  const ev = play(w2, 0.1, (x, k) => ({ ...idle, dodge: k === 2, mz: 1 }));
  assert.equal(w2.tries.rope.to, null);
  assert.equal(of(ev, 'ropeEnd')[0].cut, true);
});

test('날아가는 갈고리(sky): 끌려가는 동안은 맞지 않고, 내리면 다시 맞는다', () => {
  const w = boss('sky'), p = w.player;
  step(w, { ...idle, mx: 1, act: true });
  const to = w.tries.rope.to, b = w.bullets;
  assert.ok(to, '줄이 안 걸림');
  spawnBullet(w, K.NORMAL, p.x, p.z, 0, 0, 1);
  for (let i = 0; i < b.cap; i++) if (b.alive[i]) { const d = Math.hypot(to.x - p.x, to.z - p.z); b.x[i] = b.px[i] = p.x + (to.x - p.x) / d * 1.5; b.z[i] = b.pz[i] = p.z + (to.z - p.z) / d * 1.5; }
  play(w, 0.3);
  assert.equal(p.hp, P.hp, '공중에서 맞음');
  play(w, 1);
  assert.equal(w.tries.rope.to, null);
  spawnBullet(w, K.NORMAL, p.x + 1, p.z, Math.PI, 8, 1);
  play(w, 0.4);
  assert.ok(p.hp < P.hp, '내린 뒤에도 무적');
});

// ── 엄폐 기둥
test('기둥: 보라 탄과 내 평타를 막고, 던진 탄은 넘어가며, 몸은 지나가지 못한다', () => {
  const w = boss('pillars'), p = w.player, c = w.tries.pillars[0];
  p.x = p.px = c.x - 3; p.z = p.pz = c.z; w.boss.x = c.x + 4; w.boss.z = c.z;
  spawnBullet(w, K.NORMAL, c.x + 2, c.z, Math.PI, 12, 1);
  const ev = play(w, 0.6);
  assert.equal(p.hp, P.hp);
  assert.ok(of(ev, 'pillarBlock').some(e => e.enemy));
  assert.equal(w.bullets.live, 0);
  w.shots.nextAt = 0;
  const hp = w.boss.hp, ev2 = play(w, 1);
  assert.equal(w.boss.hp, hp, '기둥 뒤 보스가 평타에 맞음');
  assert.ok(of(ev2, 'pillarBlock').some(e => !e.enemy));
  w.shots.nextAt = 1e9;
  give(w, 2);
  step(w, { ...idle, throw: true });
  play(w, 1.2);
  assert.ok(w.boss.hp < hp, '던진 탄이 기둥에 막힘');
  play(w, 1.5, { ...idle, mx: 1 });
  assert.ok(Math.hypot(p.x - c.x, p.z - c.z) >= c.r + P.bodyR - 1e-6, '기둥 안으로 들어감');
});

test('기둥: 흰 탄은 지나가고(받아칠 것은 남는다), hp발 막으면 무너진다', () => {
  const w = boss('pillars'), p = w.player, c = w.tries.pillars[0], n0 = w.tries.pillars.length;
  p.x = p.px = c.x - 3; p.z = p.pz = c.z; w.boss.x = c.x + 6; w.boss.z = c.z;
  p.invulnUntil = 1e9;
  spawnBullet(w, K.WHITE, c.x + 2, c.z, Math.PI, 12, 1);
  play(w, 0.25);
  assert.equal(w.bullets.live, 1, '흰 탄이 기둥에 막힘');
  for (let k = 0; k < T.pillars.hp; k++) { spawnBullet(w, K.NORMAL, c.x + 1.5, c.z, Math.PI, 12, 1); step(w, idle); step(w, idle); step(w, idle); }
  const ev = play(w, 0.3);
  assert.equal(w.tries.pillars.length, n0 - 1);
  assert.ok(!w.tries.pillars.includes(c));
});

// ── 불 장판
test('불 장판: 빨간 원이 떨어진 자리가 sec초 타고, 안에 선 플레이어와 몬스터가 탄다', () => {
  const w = room('fire'), p = w.player;
  const m = spawnMob(w, 'shield', p.x + 8, p.z, 0);
  w.mobAreas.push({ kind: 'shell', shape: 'circle', x: m.x, z: m.z, face: 0, R: 1.3, half: Math.PI, color: 'red', warn: 0.05, born: w.time, hit: false, owner: 99 });
  w.floorAreas.push(w.mobAreas[0]);
  w.opts.ai = true; m.nextAt = 1e9; m.face = 0;   // 포탄 판정이 돌게 두뇌를 켠다(방패병은 제자리)
  const ev = play(w, 0.2);
  assert.equal(of(ev, 'fireStart').length, 1);
  assert.equal(w.tries.fires.length, 1);
  const hp0 = m.hp;
  m.x = w.tries.fires[0].x; m.z = w.tries.fires[0].z;
  w.opts.ai = false;
  play(w, 2);
  assert.ok(m.hp < hp0 - T.fire.mobDps, `몬스터가 덜 탐 ${hp0 - m.hp}`);
  p.x = p.px = w.tries.fires[0].x; p.z = p.pz = w.tries.fires[0].z + 3;
  play(w, 0.6);
  assert.equal(p.hp, P.hp, '불 밖에서 탐');
  p.x = p.px = w.tries.fires[0].x; p.z = p.pz = w.tries.fires[0].z;
  play(w, 0.6);
  assert.equal(p.hp, P.hp - T.fire.dmg);
  play(w, T.fire.sec);
  assert.equal(w.tries.fires.length, 0);
});

// ── 돌진 베기
test('돌진 베기: 회피로 적의 몸을 지나가면 한 번 피해를 주고 반대편에 선다', () => {
  const w = room('dash'), p = w.player;
  const m = spawnMob(w, 'shooter', p.x + 2, p.z, 0);
  const ev = play(w, 0.5, (x, k) => ({ ...idle, mx: 1, dodge: k === 0 }));
  assert.equal(of(ev, 'dashHit').length, 1);
  assert.ok(Math.abs((m.maxHp - m.hp) - T.dash.dmg) < 1e-6);
  assert.ok(p.x > m.x, '적을 지나가지 못함');
  const w2 = room(null), m2 = spawnMob(w2, 'shooter', w2.player.x + 2, w2.player.z, 0);
  play(w2, 0.5, (x, k) => ({ ...idle, mx: 1, dodge: k === 0 }));
  assert.equal(m2.hp, m2.maxHp);
  assert.ok(w2.player.x < m2.x, '실험이 꺼졌는데 적을 지나감');
});

test('돌진 베기: 보스의 몸도 지나가며 벤다', () => {
  const w = boss('dash'), p = w.player;
  w.boss.x = p.x + 3; w.boss.z = p.z;
  const hp = w.boss.hp;
  play(w, 0.5, (x, k) => ({ ...idle, mx: 1, dodge: k === 0 }));
  assert.ok(Math.abs((hp - w.boss.hp) - T.dash.dmg) < 1e-6, `피해 ${hp - w.boss.hp}`);
});

// ── 꿰뚫는 던지기
test('꿰뚫는 던지기: 던진 탄이 곧게 날며 줄 선 적을 모두 뚫는다(한 적에 한 번씩)', () => {
  const w = room('lance'), p = w.player;
  const a = spawnMob(w, 'shield', p.x + 3, p.z, 0), b = spawnMob(w, 'shield', p.x + 6, p.z, 0), c = spawnMob(w, 'shield', p.x + 4, p.z + 5, 0);
  for (const m of [a, b, c]) m.hp = m.maxHp = 5000;
  give(w, 2);
  step(w, idle);
  step(w, { ...idle, throw: true });
  play(w, 2);
  const per = RULES.store.dmg[1] * (1 + RULES.store.bonus) * T.lance.mul;
  assert.ok(Math.abs((a.maxHp - a.hp) - 2 * per) < 1e-6, `앞 적 ${a.maxHp - a.hp}`);
  assert.ok(Math.abs((b.maxHp - b.hp) - 2 * per) < 1e-6, `뒤 적 ${b.maxHp - b.hp}`);
  assert.equal(c.hp, c.maxHp, '줄 밖의 적이 맞음');
  assert.equal(w.bullets.live, 0, '판 밖으로 나가 사라져야 한다');
  assert.equal(p.throwSum, 0);
});

// ── 3차: 지뢰 · 오라 · 수정 · 자리 바꾸기 · 집중 사격 · 스침 모으기
test('지뢰: 모은 탄 하나를 발밑에 놓고(회복 없음), 적의 몸이 닿으면 둘레의 적이 다친다', () => {
  const w = room('mine'), p = w.player;
  step(w, { ...idle, act: true });
  assert.equal(of(drainEvents(w), 'denied').length, 1, '모은 탄 없이 놓임');
  give(w, 2);
  const hp = (p.hp = 50);
  step(w, { ...idle, act: true });
  assert.equal(p.store.length, 1); assert.equal(w.tries.mines.length, 1); assert.equal(p.hp, hp);
  const mine = w.tries.mines[0];
  play(w, 1, { ...idle, mx: -1 });
  assert.equal(w.tries.mines.length, 1, '아무도 안 밟았는데 터짐');
  const a = spawnMob(w, 'shield', mine.x + 0.4, mine.z, 0), b = spawnMob(w, 'shooter', mine.x + 1.5, mine.z + 0.5, 0), far = spawnMob(w, 'shooter', mine.x + 6, mine.z, 0);
  const ev = play(w, 0.1);
  assert.equal(of(ev, 'mineBoom').length, 1);
  assert.equal(w.tries.mines.length, 0);
  const dmg = RULES.store.dmg[1] * T.mine.mul;
  assert.ok(Math.abs((a.maxHp - a.hp) - dmg) < 1e-6 && Math.abs((b.maxHp - b.hp) - dmg) < 1e-6, `피해 ${a.maxHp - a.hp}, ${b.maxHp - b.hp}`);
  assert.equal(far.hp, far.maxHp);
});

test('오라: 모은 탄이 있는 동안 가까운 적이 깎이고, 없으면 아무 일 없다', () => {
  const w = room('orbit'), p = w.player;
  const m = spawnMob(w, 'shield', p.x + 1.6, p.z, 0); m.hp = m.maxHp = 5000;
  play(w, 1);
  assert.equal(m.hp, m.maxHp);
  give(w, 2);
  play(w, 1);
  const lost = m.maxHp - m.hp;
  assert.ok(Math.abs(lost - T.orbit.dps * 2) <= T.orbit.dps * 2 * T.orbit.tick + 1e-6, `1초에 ${lost}`);
  m.x = p.x + 6;
  const hp = m.hp;
  play(w, 0.5);
  assert.equal(m.hp, hp, '멀리 있는 적이 깎임');
});

test('수정: 곁에서 패링을 누르면 둘레의 보라 탄이 흰 탄으로 바뀐다. 한 번 쓰면 rest초 쉰다', () => {
  const w = boss('crystal'), p = w.player, c = w.tries.crystals[0], b = w.bullets;
  p.x = p.px = c.x - 1.5; p.z = p.pz = c.z;
  for (const [dx, dz] of [[3, 0], [-3, 1], [0, -3]]) spawnBullet(w, K.NORMAL, c.x + dx, c.z + dz, 0, 0.01, 1);
  spawnBullet(w, K.NORMAL, c.x + T.crystal.R + 3, c.z, 0, 0.01, 1);
  spawnBullet(w, K.RED, c.x + 2, c.z + 2, 0, 0.01, 1);
  const count = k => { let n = 0; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.kind[i] === k) n++; return n; };
  step(w, { ...idle, parry: true });
  const ev = drainEvents(w);
  assert.equal(of(ev, 'crystalPulse')[0].n, 3);
  assert.equal(count(K.WHITE), 3); assert.equal(count(K.NORMAL), 1); assert.equal(count(K.RED), 1);
  play(w, 1);
  spawnBullet(w, K.NORMAL, c.x + 3, c.z, 0, 0.01, 1);
  step(w, { ...idle, parry: true });
  assert.equal(of(drainEvents(w), 'crystalPulse').length, 0, '쉬는 중에 또 울림');
  play(w, T.crystal.rest);
  step(w, { ...idle, parry: true });
  assert.equal(of(drainEvents(w), 'crystalPulse').length, 1);
});

test('자리 바꾸기: 겨눈 몬스터와 자리를 바꾸고 잠깐 무적, cooldown 동안은 못 쓴다. 보스와는 못 바꾼다', () => {
  const w = room('swap'), p = w.player;
  const m = spawnMob(w, 'shooter', p.x + 7, p.z + 2, 0);
  step(w, idle);
  const [px, pz, mx, mz] = [p.x, p.z, m.x, m.z];
  step(w, { ...idle, act: true });
  assert.equal(of(drainEvents(w), 'swap').length, 1);
  assert.ok(Math.hypot(p.x - mx, p.z - mz) < 1e-6 && Math.hypot(m.x - px, m.z - pz) < 1e-6);
  assert.ok(p.invulnUntil > w.time);
  step(w, { ...idle, act: true });
  assert.equal(of(drainEvents(w), 'swap').length, 0);
  play(w, T.swap.cooldown);
  step(w, { ...idle, act: true });
  assert.equal(of(drainEvents(w), 'swap').length, 1);
  const w2 = boss('swap'), bx = w2.boss.x;
  step(w2, idle); step(w2, { ...idle, act: true });
  assert.equal(w2.boss.x, bx);
});

test('집중 사격: after초 서 있으면 평타가 mul배, 움직이면 바로 풀린다', () => {
  const run1 = tries => { const w = room(tries); w.shots.nextAt = 0; const m = spawnMob(w, 'shield', w.player.x + 5, w.player.z, 0); m.face = 0; m.hp = m.maxHp = 5000; play(w, 3); return m.maxHp - m.hp; };
  const base = run1(null), focused = run1('focus');
  assert.ok(focused > base * 1.6, `집중 ${focused} · 보통 ${base}`);
  const w = room('focus');
  play(w, T.focus.after + 0.05);
  assert.equal(w.tries.shotMul, T.focus.mul);
  step(w, { ...idle, mx: 1 });
  assert.equal(w.tries.shotMul, 1);
});

test('스침 모으기: per번 스치면 한 칸 모인다', () => {
  const w = boss('graze'), p = w.player;
  w.stats.grazes += T.graze.per - 1;
  step(w, idle);
  assert.equal(p.store.length, 0);
  w.stats.grazes += 1;
  step(w, idle);
  assert.equal(p.store.length, 1);
  assert.equal(p.store[0].perfect, false);
});

// ── 4차(보스전 기믹): 보호막 · 밀물
test('보호막: 보스가 막을 두르면 평타·무기는 막히고 던진 탄만 통한다. 던진 탄 hits발이면 깨진다', () => {
  const w = boss('bubble'), p = w.player, b = w.boss, Bu = T.bubble;
  w.shots.nextAt = 0;
  const ev = play(w, Bu.first + 0.1);
  assert.equal(of(ev, 'bubbleOn').length, 1);
  const hp = b.hp, ev2 = play(w, 1);
  assert.equal(b.hp, hp, '막 안의 보스가 평타에 다침');
  assert.ok(of(ev2, 'mobBlock').length > 0);
  w.shots.nextAt = 1e9;
  give(w, Bu.hits);
  step(w, { ...idle, throw: true });
  const ev3 = play(w, 1.5);
  assert.ok(b.hp < hp, '던진 탄이 막에 막힘');
  assert.equal(of(ev3, 'bubbleBreak').length, 1);
  assert.equal(w.tries.bubble.on, false);
  w.shots.nextAt = 0;
  const hp2 = b.hp;
  play(w, 1);
  assert.ok(b.hp < hp2, '막이 깨졌는데 평타가 안 통함');
});

test('보호막: 깨지 못해도 sec초 뒤 걷히고, every초 뒤 다시 두른다', () => {
  const w = boss('bubble'), Bu = T.bubble;
  play(w, Bu.first + 0.1);
  assert.equal(w.tries.bubble.on, true);
  const ev = play(w, Bu.sec + 0.1);
  assert.equal(w.tries.bubble.on, false);
  assert.equal(of(ev, 'bubbleOff').length, 1);
  const ev2 = play(w, Bu.every + 0.1);
  assert.equal(of(ev2, 'bubbleOn').length, 1);
});

test('밀물: 판의 반쪽에 빨간 예고가 깔리고 warn초 뒤 그 반쪽에 선 플레이어가 다친다 — 건너가면 안 맞는다', () => {
  const w = boss('tide'), p = w.player, Ti = T.tide;
  play(w, Ti.first + 0.05);
  const a = w.floorAreas.find(x => x.kind === 'tide');
  assert.ok(a && a.color === 'red' && a.shape === 'lane', '예고가 없음');
  const side = a.x < 0 ? -1 : 1;   // 왼쪽 반(−) 또는 오른쪽 반(+)
  p.x = p.px = side * 5; p.z = p.pz = 0; w.boss.x = -side * 8;
  play(w, Ti.warn + 0.1);
  assert.equal(p.hp, P.hp - Ti.dmg);
  play(w, Ti.linger + 0.05);
  assert.equal(w.floorAreas.filter(x => x.kind === 'tide').length, 0, '지나간 밀물이 남음');
  const w2 = boss('tide'), p2 = w2.player;
  play(w2, Ti.first + 0.05);
  const a2 = w2.floorAreas.find(x => x.kind === 'tide'), side2 = a2.x < 0 ? -1 : 1;
  p2.x = p2.px = -side2 * 3; w2.boss.x = side2 * 8;
  play(w2, Ti.warn + 0.1);
  assert.equal(p2.hp, P.hp);
});

// ── 5차(사용자 2026-11-17 "무기는 기본으로 나가고 패링하면 강화" · "흰 탄을 찾아가서 받기"): always · hunt
import { startPattern, updatePattern } from '../src/sim/patterns.js';
import { createBot } from '../src/sim/bot.js';

const fires = (ev, kind) => of(ev, 'weaponFire').filter(e => e.kind === kind).length;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const aliveIds = w => { const out = []; for (let i = 0; i < w.bullets.cap; i++) if (w.bullets.alive[i]) out.push(i); return out; };

test('늘 나가는 무기: 받아치지 않아도 쏜다 — 꺼져 있으면 지금처럼 패링 뒤에만', () => {
  const w = boss('always', { gear: 'missile' });
  assert.ok(fires(play(w, 2), 'missile') >= RULES.weapons.missile.n, '받아치지 않으니 미사일이 안 나감');
  const w0 = boss(null, { gear: 'missile' });
  assert.equal(fires(play(w0, 2), 'missile'), 0);
});

test('늘 나가는 무기: 패링하면 과열 — 가동 시간(charge.sec) 동안 over배 자주 쏘고, 끝나면 기본 박자로 돌아온다', () => {
  const A = T.always, Wr = RULES.weapons, M = Wr.missile;
  const base = boss('always', { gear: 'missile' });
  const nBase = fires(play(base, Wr.charge.sec), 'missile');
  const hot = boss('always', { gear: 'missile' });
  hot.stats.parries++;
  const ev = play(hot, Wr.charge.sec);
  assert.equal(of(ev, 'weaponWake').length, 1, '과열을 알리지 않음');
  const more = Math.floor((A.over - 1) * Wr.charge.sec / M.every) * M.n;
  assert.ok(more >= M.n, 'over가 너무 작아 시험이 뜻이 없음');
  assert.ok(fires(ev, 'missile') >= nBase + more, `과열 ${fires(ev, 'missile')}발, 기본 ${nBase}발`);
  const after = fires(play(hot, Wr.charge.sec), 'missile');
  assert.ok(after <= nBase + M.n, `과열이 끝난 뒤 ${after}발`);
});

test('늘 나가는 무기: 산탄은 burstEvery초마다 부채 — 던질 때 따로 나가지 않는다', () => {
  const A = T.always, Bu = RULES.weapons.burst;
  const w = boss('always', { gear: 'burst' });
  const n0 = fires(play(w, A.burstEvery * 2 + 0.1), 'burst');
  assert.ok(n0 >= Bu.n * 2 && n0 <= Bu.n * 3, `부채 ${n0 / Bu.n}번`);
  give(w, 3);
  step(w, { ...idle, throw: true });
  const n1 = fires(play(w, A.burstEvery * 0.9), 'burst');
  assert.ok(n1 <= Bu.n, `던진 뒤 부채 ${n1 / Bu.n}번`);
});

test('늘 나가는 무기: 보스 체력이 bossHp배 — 스테이지 보스 방도', () => {
  const A = T.always, hp = RULES.boss.hp * RULES.store.bossHp;
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
  near(boss('always').boss.maxHp, hp * A.bossHp);
  const w = createWorld({ stage: 1, room: 4, tries: 'always' });   // 스테이지 1의 방 4 = 보스 방
  near(w.boss.maxHp, hp * RULES.stage.bossHp * A.bossHp);
  near(w.boss.hp, w.boss.maxHp);
});

test('늘 나가는 무기: 스테이지는 start 무기 하나를 들고 시작한다', () => {
  const w = createWorld({ stage: 1, ai: false, tries: 'always' });
  assert.deepEqual(w.weapons.on, [T.always.start]);
  assert.ok(fires(play(w, RULES.mobs.appear + 2), T.always.start) > 0, '방에서 무기가 안 나감');
  assert.deepEqual(createWorld({ stage: 1, ai: false }).weapons.on, []);
});

test('흰 탄 찾아가기: 조준 부채는 나를 겨눈 가운데 탄이 보라, 그 양옆이 흰색이다', () => {
  const w = boss('hunt'), b = w.bullets, P1 = RULES.patterns[1], stepA = P1.spreadDeg / (P1.n - 1) * Math.PI / 180;
  updatePattern(w, startPattern(w, 1));
  const ids = aliveIds(w), aim = Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x);
  assert.equal(ids.length, P1.n);
  const kindAt = Object.fromEntries(ids.map(i => [Math.round(wrap(Math.atan2(b.vz[i], b.vx[i]) - aim) / stepA), b.kind[i]]));
  assert.equal(kindAt[0], K.NORMAL, '나를 겨눈 탄이 받아칠 탄');
  assert.equal(kindAt[1], K.WHITE); assert.equal(kindAt[-1], K.WHITE);
  assert.equal(ids.filter(i => b.kind[i] === K.WHITE).length, 2);
});

test('흰 탄 찾아가기: 사수의 세 발은 가운데가 보라, 양옆이 흰색이다', () => {
  const w = createWorld({ store: true, tries: 'hunt' });
  w.boss.away = true; w.shots.nextAt = 1e9;
  const m = spawnMob(w, 'shooter', w.player.x + 6, w.player.z, 0);
  m.nextAt = w.time;
  const fired = of(play(w, RULES.mobs.shooter.warn + 0.05), 'fire').filter(e => e.src === RULES.src.shooter);
  assert.deepEqual(fired.map(e => e.kind), [K.WHITE, K.NORMAL, K.WHITE]);
});

test('흰 탄 찾아가기: 쪼개지는 구슬은 내 쪽 조각이 보라, 그 다음으로 가까운 조각들이 흰색이다', () => {
  const w = boss('hunt'), b = w.bullets, P4 = RULES.patterns[4], p = w.player;
  const run = startPattern(w, 4);
  for (let k = 0; k < ticks(P4.maxSec + 1); k++) { updatePattern(w, run); if (run.burst) break; step(w, idle); }
  assert.ok(run.burst, '구슬이 터지지 않음');
  const ids = aliveIds(w), toP = Math.atan2(p.z - b.z[ids[0]], p.x - b.x[ids[0]]);
  const byNear = ids.map(i => [Math.abs(wrap(Math.atan2(b.vz[i], b.vx[i]) - toP)), b.kind[i]]).sort((x, y) => x[0] - y[0]).map(e => e[1]);
  assert.equal(byNear[0], K.NORMAL, '내 쪽 조각이 받아칠 탄');
  for (let k = 1; k <= P4.whites; k++) assert.equal(byNear[k], K.WHITE, `${k}번째로 가까운 조각`);
  assert.equal(byNear.filter(k => k === K.WHITE).length, P4.whites);
});

test('흰 탄 찾아가기: 봇은 옆으로 지나갈 흰 탄의 길로 들어가 받아친다 — 꺼져 있으면 쫓지 않는다', () => {
  const tryIt = tries => {
    const w = createWorld({ ai: false, store: true, tries }), p = w.player, bot = createBot('1', 3);
    w.shots.nextAt = 1e9;
    for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));   // 반응 지연만큼 판을 먼저 본다
    spawnBullet(w, K.WHITE, p.x + 10, p.z + 1.6, Math.PI, 9, RULES.src.shooter);   // 1.6 U 옆을 지나갈 흰 탄(패링 원 0.8 U 밖)
    for (let k = 0; k < ticks(1.6); k++) step(w, bot(w));
    return w.stats.parries;
  };
  assert.equal(tryIt('hunt'), 1);
  assert.equal(tryIt(null), 0);
});

test('늘 나가는 무기: 몬스터 체력이 mobHp배(무기가 늘 깎는 만큼 — 방이 쉬워지지 않게)', () => {
  const w = room('always'), m = spawnMob(w, 'shooter', 0, 0, 0);
  assert.ok(Math.abs(m.maxHp - RULES.mobs.shooter.hp * T.always.mobHp) < 1e-6 && m.hp === m.maxHp, `체력 ${m.hp}/${m.maxHp}`);
  assert.equal(spawnMob(room(null), 'shooter', 0, 0, 0).maxHp, RULES.mobs.shooter.hp);
});

// ── 사용자 2026-11-17 "지금도 기본 공격이나 무기 데미지가 너무 낮은 것 같다": always의 피해 배율과 몬스터 수
test('늘 나가는 무기: 평타 피해가 shot배', () => {
  const dealt = tries => {
    const w = room(tries), m = spawnMob(w, 'shooter', w.player.x + 2, w.player.z, 0);
    w.shots.nextAt = 0;
    play(w, 1);
    return m.maxHp - m.hp;
  };
  const a = dealt('always'), b = dealt(null);
  assert.ok(b > 20, `평타가 안 맞음(${b})`);
  assert.ok(Math.abs(a / b - T.always.shot) < 0.05, `배율 ${a / b}`);
});

test('늘 나가는 무기: 무기 피해가 mul배 — 빔(이어 맞는 것)과 미사일(날아가 맞는 것)', () => {
  const A = T.always, Wr = RULES.weapons;
  const beam = boss('always', { gear: 'beam' }), hp0 = beam.boss.hp;
  play(beam, Wr.beam.every + Wr.beam.dur + 0.1);
  const want = Wr.beam.dps * Wr.beam.dur * A.mul;
  assert.ok(Math.abs(hp0 - beam.boss.hp - want) <= Wr.beam.dps * A.mul * RULES.dt * 2, `빔 ${hp0 - beam.boss.hp}, 바란 값 ${want}`);
  const mis = boss('always', { gear: 'missile' });
  mis.boss.x = mis.boss.px = mis.player.x + 5; mis.boss.z = mis.boss.pz = mis.player.z;
  play(mis, Wr.missile.every - 0.05);   // 둘째 묶음이 나가기 전
  assert.ok(Math.abs(mis.stats.dmg.weapon - Wr.missile.n * Wr.missile.dmg * A.mul) < 1e-6, `미사일 ${mis.stats.dmg.weapon}`);
});

test('늘 나가는 무기: 스테이지 묶음의 몬스터 수가 crowd배(올림) — 빨리 죽는 만큼 많이 온다', () => {
  const wave = RULES.stage.list[1].rooms[0][0], n0 = wave.reduce((s, [, n]) => s + n, 0);
  const n1 = wave.reduce((s, [, n]) => s + Math.ceil(n * T.always.crowd), 0);
  assert.ok(n1 > n0, 'crowd가 1이라 시험이 뜻이 없음');
  assert.equal(createWorld({ stage: 1, ai: false, tries: 'always' }).enemies.length, n1);
  assert.equal(createWorld({ stage: 1, ai: false }).enemies.length, n0);
});

// ── 저격(사용자 2026-11-17 "I를 꾹 누르면 시간이 느려지고 제자리에서 저격 자세, WASD로 조준, 놓으면 강력한 공격" — 조준선은 일단 8방향 그대로)
const Sn = T.snipe, hold = { ...idle, hold: true };
const orbDmg = n => n * RULES.store.dmg[1] * Sn.mul;   // give()는 완벽 패링으로 모은 탄을 준다

test('저격: 모은 탄을 들고 I를 누르고 있으면 저격 자세 — 조준점이 겨눈 적에 붙어 따라가고, 방향 키는 몸도 조준점도 옮기지 않는다', () => {
  const w = room('snipe'), p = w.player, sn = w.tries.snipe;
  const m = spawnMob(w, 'shield', p.x + 5, p.z + 2, 0);
  give(w, 2);
  const ev = play(w, 0.05, hold);
  assert.equal(of(ev, 'snipeStart').length, 1);
  assert.equal(sn.on, true);
  assert.ok(Math.hypot(sn.rx - m.x, sn.rz - m.z) < 1e-9, '조준점이 겨눈 적 위에서 시작하지 않음');
  const x0 = p.x, z0 = p.z;
  play(w, 0.1, { ...hold, mx: 0, mz: 1 });
  assert.equal(p.x, x0); assert.equal(p.z, z0);
  assert.ok(Math.hypot(sn.rx - m.x, sn.rz - m.z) < 1e-9, '방향 키가 조준점을 옮김');
  m.x = m.px = p.x + 4; m.z = m.pz = p.z - 3;   // 적이 움직였다
  play(w, 0.03, hold);
  assert.ok(Math.hypot(sn.rx - m.x, sn.rz - m.z) < 1e-9, '조준점이 고른 적을 따라가지 않음');
  assert.ok(Math.abs(sn.angle - Math.atan2(m.z - p.z, m.x - p.x)) < 1e-9, '선이 몸에서 고른 적을 향하지 않음');
});

test('저격: 떼면 선 위의 적을 모두 뚫는다 — 칸마다 던지기 피해 × mul, 회복 없음, 모은 탄을 다 쓴다', () => {
  const w = room('snipe'), p = w.player;
  const a = spawnMob(w, 'shield', p.x + 3, p.z, 0), b = spawnMob(w, 'shield', p.x + 6.5, p.z, 0), c = spawnMob(w, 'shield', p.x + 4, p.z + 3, 0);
  give(w, 1);
  p.hp = 40;
  play(w, 0.1, { ...hold, mx: 1, mz: 0 });
  const ev = play(w, 0.05);   // 뗀다
  const fire = of(ev, 'snipeFire');
  assert.equal(fire.length, 1); assert.equal(fire[0].n, 1); assert.equal(fire[0].hits, 2);
  assert.ok(Math.abs(a.maxHp - a.hp - orbDmg(1)) < 1e-6, `앞의 적 ${a.maxHp - a.hp}`);   // 방패도 뚫는다(받아친 탄)
  assert.ok(Math.abs(b.maxHp - b.hp - orbDmg(1)) < 1e-6, `뒤의 적 ${b.maxHp - b.hp}`);
  assert.equal(c.hp, c.maxHp, '선 밖의 적이 맞음');
  assert.equal(p.store.length, 0);
  assert.equal(p.hp, 40);
  assert.equal(w.tries.snipe.on, false);
});

test('저격: 보스도 맞는다(던진 탄으로 센다)', () => {
  const w = boss('snipe'), hp0 = w.boss.hp;
  give(w, 2);
  play(w, 0.05, hold);
  play(w, 0.05);
  assert.ok(Math.abs(hp0 - w.boss.hp - orbDmg(2)) < 1e-6, `보스 ${hp0 - w.boss.hp}`);
  assert.ok(Math.abs(w.stats.dmg.throw - orbDmg(2)) < 1e-6);
});

test('저격: 모은 탄이 min칸보다 적으면 못 쓴다 — 거절은 한 번만 알린다', () => {
  const w = room('snipe');
  spawnMob(w, 'shield', w.player.x + 4, w.player.z, 0);
  const ev = play(w, 0.3, hold);
  assert.equal(w.tries.snipe.on, false);
  assert.equal(of(ev, 'denied').filter(e => e.what === 'snipe').length, 1);
});

test('저격: 회피를 누르면 그만두고 탄은 남는다. 키를 뗐다 다시 눌러야 다시 든다', () => {
  const w = room('snipe'), p = w.player;
  spawnMob(w, 'shield', p.x + 4, p.z, 0);
  give(w, 2);
  play(w, 0.1, hold);
  const ev = play(w, 0.02, (w2, k) => ({ ...hold, dodge: k === 0 }));
  assert.equal(of(ev, 'snipeCancel').length, 1);
  assert.equal(of(ev, 'snipeFire').length, 0);
  assert.equal(p.store.length, 2);
  play(w, RULES.dodge.dur + 0.3, hold);
  assert.equal(w.tries.snipe.on, false, '누른 채로는 다시 들지 않는다');
  play(w, 0.02);
  play(w, 0.05, hold);
  assert.equal(w.tries.snipe.on, true);
});

test('저격: 누르고만 있으면 hold초에 저절로 나간다. 조준 중에는 던지기(U)가 먹지 않는다', () => {
  const w = room('snipe'), p = w.player;
  const m = spawnMob(w, 'shield', p.x + 4, p.z, 0);
  give(w, 1);
  const ev0 = play(w, Sn.hold - 0.05, { ...hold, throw: true });
  assert.equal(of(ev0, 'throw').length, 0);
  assert.equal(p.store.length, 1);
  const ev = play(w, 0.1, hold);
  assert.equal(of(ev, 'snipeFire').length, 1);
  assert.ok(m.hp < m.maxHp);
  assert.equal(of(play(w, 0.3, hold), 'snipeStart').length, 0, '누른 채로 다시 시작함');
});

test('I·F를 누르고 있는 동안 hold가 켜진다', () => {
  const m = createInputMap(0);
  assert.equal(m.take().hold, false);
  m.keyDown('KeyI', 0);
  assert.equal(m.take().hold, true); assert.equal(m.take().hold, true);
  m.keyUp('KeyI');
  assert.equal(m.take().hold, false);
});

test('저격: 봇은 가득 모았고 체력이 넉넉하면 던지는 대신 저격하고, 체력이 모자라면 던져서 회복한다', () => {
  const run = hp => {
    const w = room('snipe'), p = w.player, bot = createBot('1', 2);
    spawnMob(w, 'shield', p.x + 5, p.z, 0);
    for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));
    drainEvents(w);
    p.hp = hp;
    give(w, RULES.store.cap);
    const ev = [];
    for (let k = 0; k < ticks(0.5); k++) { step(w, bot(w)); ev.push(...drainEvents(w)); }
    return { snipe: of(ev, 'snipeFire').length, toss: of(ev, 'throw').length };
  };
  assert.deepEqual(run(P.hp), { snipe: 1, toss: 0 });
  assert.deepEqual(run(P.hp * 0.4), { snipe: 0, toss: 1 });
});

import { restartRoom } from '../src/sim/stage.js';
test('저격: 조준하다 죽어서 방을 다시 하면 자세가 풀려 있다(들고 온 탄이 저절로 나가지 않는다)', () => {
  const w = createWorld({ stage: 1, ai: false, tries: 'snipe' }), p = w.player;
  play(w, RULES.mobs.appear + 0.1);
  give(w, 2);
  play(w, 0.05, hold);
  assert.equal(w.tries.snipe.on, true);
  w.result = 'lose';
  restartRoom(w);
  assert.equal(w.tries.snipe.on, false);
  assert.equal(of(play(w, 0.1), 'snipeFire').length, 0);
});

// ── 공격 다양화(사용자 2026-11-17 "일반 적군 공격 패턴도 너무 단조로워"): vary — 사수·돌격병·포격병에 공격을 하나씩 더
const V = T.vary, Mb = RULES.mobs;
const liveRoom = tries => { const w = createWorld({ store: true, tries }); w.boss.away = true; w.shots.nextAt = 1e9; return w; };
// 바로 공격하게 놓고, 이번 공격이 차례의 type번째가 되게 맞춘다(차례 = (atkN + id) % mod — 몬스터마다 어긋나게)
const ready = (w, kind, dx, dz, type, mod) => { const m = spawnMob(w, kind, w.player.x + dx, w.player.z + dz, 0); m.nextAt = w.time; m.atkN = ((type - m.id) % mod + mod) % mod; return m; };
const shooterShots = (w, sec) => of(play(w, sec), 'fire').filter(e => e.src === RULES.src.shooter);
const velAngle = (w, e) => Math.atan2(w.bullets.vz[e.id], w.bullets.vx[e.id]);

test('공격 다양화: 사수는 세 발 → 넓은 부채 → 연사를 돌아가며 쏜다', () => {
  const w = liveRoom('vary'), m = ready(w, 'shooter', 6, 0, 0, 3), S = Mb.shooter, Vs = V.shooter;
  assert.deepEqual(shooterShots(w, S.warn + 0.05).map(e => e.kind), [K.NORMAL, K.WHITE, K.NORMAL]);
  m.nextAt = w.time;
  const wide = shooterShots(w, S.warn + 0.05), mid = (Vs.wideN - 1) / 2;
  assert.equal(wide.length, Vs.wideN);
  assert.deepEqual(wide.map(e => e.kind), wide.map((e, k) => (k === mid ? K.WHITE : K.NORMAL)));
  assert.ok(Math.abs(Math.abs(wrap(velAngle(w, wide.at(-1)) - velAngle(w, wide[0]))) - Vs.wideDeg * Math.PI / 180) < 1e-6, '부채 너비');
  m.nextAt = w.time;
  const first = shooterShots(w, S.warn + 0.02);
  assert.equal(first.length, 1, '연사는 한 발씩 나간다');
  const rest = shooterShots(w, Vs.streamGap * (Vs.streamN - 1) + 0.05), all = [...first, ...rest];
  assert.deepEqual(all.map(e => e.kind), all.map((e, k) => (k === 0 ? K.WHITE : K.NORMAL)), '첫 발이 흰 탄(받고 바로 비킨다)');
  assert.equal(all.length, Vs.streamN);
  for (const e of all) assert.ok(Math.abs(wrap(velAngle(w, e) - velAngle(w, all[0]))) < 1e-9, '연사는 한 줄로 간다');
  assert.equal(m.state, 'idle');
  m.nextAt = w.time;
  assert.equal(shooterShots(w, S.warn + 0.05).length, 3, '다시 세 발');
});

test('공격 다양화: 흰 탄 찾아가기와 같이 켜면 넓은 부채도 가운데가 보라, 그 양옆이 흰색', () => {
  const w = liveRoom('vary,hunt'), m = ready(w, 'shooter', 6, 0, 1, 3), mid = (V.shooter.wideN - 1) / 2;
  const wide = shooterShots(w, Mb.shooter.warn + 0.05);
  assert.deepEqual(wide.map(e => e.kind), wide.map((e, k) => (Math.abs(k - mid) === 1 ? K.WHITE : K.NORMAL)));
});

test('공격 다양화: 돌격병은 두 번에 한 번 연속 돌진 — 첫 돌진이 끝나면 쉬지 않고 짧은 예고(warn2) 뒤 한 번 더', () => {
  const w = liveRoom('vary'), C = Mb.charger, m = ready(w, 'charger', 5, 0, 1, 2), at = [];
  for (let k = 0; k < ticks(C.warn + V.charger.warn2 + 2 * C.len / C.dash + 0.4); k++) { step(w, idle); if (of(drainEvents(w), 'mobDash').length) at.push(w.time); }
  assert.equal(at.length, 2, `돌진 ${at.length}번`);
  assert.ok(at[1] - at[0] <= C.len / C.dash + V.charger.warn2 + 0.03, `둘째 돌진까지 ${at[1] - at[0]}초`);
  assert.ok(at[1] - at[0] >= V.charger.warn2 - 1e-6, '둘째 돌진에 예고가 없음');
  play(w, C.len / C.dash + 0.1);
  assert.equal(m.state, 'idle');
  // 다음 차례는 한 번만
  m.nextAt = w.time;
  assert.equal(of(play(w, C.warn + 2 * C.len / C.dash + V.charger.warn2 + 0.4), 'mobDash').length, 1);
});

test('공격 다양화: 연속 돌진의 첫 돌진을 받아치면 둘째는 없다', () => {
  const w = liveRoom('vary'), C = Mb.charger, m = ready(w, 'charger', 5, 0, 1, 2);
  const dP = () => Math.hypot(m.x - w.player.x, m.z - w.player.z);
  const ev = play(w, C.warn + V.charger.warn2 + 2 * C.len / C.dash + 0.4, () => ({ ...idle, parry: m.state === 'dash' && dP() < 2.2 }));
  assert.equal(w.player.store.length, 1, '받아치지 못함');
  assert.equal(of(ev, 'mobDash').length, 1);
});

test('공격 다양화: 포격병은 두 번에 한 번 줄 포격 — 포격병에서 나를 지나는 줄에 원 lineN개가 lineStep 간격으로 차례로 떨어진다', () => {
  const w = liveRoom('vary'), p = w.player, Mo = Mb.mortar, Vm = V.mortar;
  p.x = p.px = 0; p.z = p.pz = 0;
  ready(w, 'mortar', 6, 0, 1, 2);
  play(w, Mo.aim + Vm.lineGap * (Vm.lineN - 1) + 0.05);
  const shells = w.floorAreas.filter(a => a.kind === 'shell').sort((a, b) => a.born - b.born);
  assert.equal(shells.length, Vm.lineN);
  for (const s of shells) assert.ok(Math.abs(s.z) < 1e-6, '줄에서 벗어남');
  for (let k = 1; k < shells.length; k++) {
    assert.ok(Math.abs(shells[k - 1].x - shells[k].x - Vm.lineStep) < 1e-6, `간격 ${shells[k - 1].x - shells[k].x}`);   // 포격병 쪽에서 나를 지나 멀어진다
    assert.ok(Math.abs(shells[k].born - shells[k - 1].born - Vm.lineGap) < RULES.dt + 1e-9);
  }
  assert.ok(shells.some(s => Math.abs(s.x) < 1e-6), '내 자리에 떨어지는 원이 없음');
  // 다음 차례는 지금처럼 n발
  play(w, Mo.warn + 0.3);
  const m2 = w.enemies[0]; m2.nextAt = w.time;
  play(w, Mo.aim + Mo.gap * (Mo.n - 1) + 0.05);
  assert.equal(w.floorAreas.filter(a => a.kind === 'shell').length, Mo.n);
});

test('공격 다양화: 꺼져 있으면 차례가 없다(지금 그대로)', () => {
  const w = liveRoom(null), m = ready(w, 'shooter', 6, 0, 1, 3);
  assert.equal(shooterShots(w, Mb.shooter.warn + 0.05).length, 3);
});

// WASD = 지금 고른 적에서 누른 쪽의 가장 가까운 적(입력은 그쪽의 바닥 방향 pickX·pickZ를 한 틱 준다)
const pickTo = (w, dx, dz) => { step(w, { ...hold, pickX: dx, pickZ: dz }); drainEvents(w); };

test('저격: WASD로 적을 고른다 — 지금 고른 적에서 누른 쪽(±45°)의 가장 가까운 적에 조준점이 붙고, 그쪽에 없으면 그대로다', () => {
  const w = room('snipe'), p = w.player, sn = w.tries.snipe;
  const at = (dx, dz) => spawnMob(w, 'shield', p.x + dx, p.z + dz, 0);
  const a = at(2, 0), b = at(5, 0.5), c = at(2, 3), d = at(2.5, -3), e = at(-2.5, 0.3), far = at(8, 0.2);
  const on = m => Math.hypot(sn.rx - m.x, sn.rz - m.z) < 1e-9;
  give(w, 1);
  play(w, 0.02, hold);
  assert.ok(on(a), '가장 가까운 적에서 시작');
  pickTo(w, 1, 0); assert.ok(on(b), '오른쪽: 더 먼 적(far)이 아니라 가까운 적');
  pickTo(w, 0, 1); assert.ok(on(b), '그쪽에 적이 없으면 그대로');
  pickTo(w, -1, 0); assert.ok(on(a), '왼쪽: 가까운 쪽부터');
  pickTo(w, 0, 1); assert.ok(on(c));
  pickTo(w, 0, -1); assert.ok(on(a), '아래쪽: 줄 위의 가까운 적');
  pickTo(w, 0, -1); assert.ok(on(d));
  pickTo(w, 0, 1); pickTo(w, -1, 0); assert.ok(on(e));
  play(w, 0.02);   // 뗀다
  assert.ok(e.hp < e.maxHp, '고른 적이 안 맞음');
  for (const m of [a, b, c, d, far]) assert.equal(m.hp, m.maxHp);
});

test('저격: 고른 적이 죽으면 조준점은 가장 가까운 적으로 간다', () => {
  const w = room('snipe'), p = w.player, sn = w.tries.snipe;
  const a = spawnMob(w, 'shield', p.x + 3, p.z, 0), b = spawnMob(w, 'shield', p.x + 5, p.z + 2, 0);
  give(w, 1);
  play(w, 0.02, hold);
  pickTo(w, 1, 0);
  b.dead = true; b.diedAt = w.time;
  play(w, 0.02, hold);
  assert.ok(Math.hypot(sn.rx - a.x, sn.rz - a.z) < 1e-9);
});

test('방향 키를 누른 순간 한 번, 화면에서 그쪽의 바닥 방향이 pickX·pickZ로 나간다', () => {
  const yaw = 0.6, m = createInputMap(yaw), near = (i, x, z) => assert.ok(Math.abs(i.pickX - x) < 1e-12 && Math.abs(i.pickZ - z) < 1e-12, `(${i.pickX}, ${i.pickZ})`);
  assert.deepEqual([m.take().pickX, m.take().pickZ], [0, 0]);
  m.keyDown('KeyD', 0);
  const i = m.take();
  near(i, Math.cos(yaw), -Math.sin(yaw));
  near(i, i.mx, i.mz);   // 이동의 오른쪽과 같은 방향
  assert.deepEqual([m.take().pickX, m.take().pickZ], [0, 0], '누르고 있어도 한 번만');
  m.keyDown('KeyD', 0);   // 자동 반복
  assert.equal(m.take().pickX, 0);
  m.keyUp('KeyD'); m.keyDown('ArrowLeft', 0);
  near(m.take(), -Math.cos(yaw), Math.sin(yaw));
  m.keyUp('ArrowLeft'); m.keyDown('KeyW', 0);
  const up = m.take();
  near(up, -Math.sin(yaw), -Math.cos(yaw));
  near(up, up.mx, up.mz);   // 이동의 위쪽과 같은 방향
  m.keyUp('KeyW'); m.keyDown('KeyS', 0);
  near(m.take(), Math.sin(yaw), Math.cos(yaw));
});


// ── 기본 판으로 올린 것(사용자 2026-11-17 "1, 3번부터 하자"): 주소 없이 열면 always·vary·snipe가 켜진다. sim의 createWorld 기본값은 그대로(예전 판)
import { BASE_TRIES, gameTries } from '../src/sim/tries.js';
test('기본 판: 주소에 try가 없으면 올린 셋이 켜지고, ?try=는 거기에 더한다', () => {
  const opt = q => worldOptions(new URLSearchParams(q)).tries;
  assert.deepEqual(BASE_TRIES, ['always', 'vary', 'snipe']);
  assert.deepEqual(gameTries(null), TRIES.filter(t => BASE_TRIES.includes(t)));
  assert.equal(opt(''), gameTries(null).join(','));
  assert.equal(opt('stage=1'), gameTries(null).join(','));
  assert.deepEqual(gameTries('rope, nope,dash'), TRIES.filter(t => BASE_TRIES.includes(t) || t === 'rope' || t === 'dash'));
  assert.equal(opt('try=hunt'), gameTries('hunt').join(','));
  assert.ok(gameTries('hunt').includes('hunt') && gameTries('hunt').includes('always'));
});

test('기본 판: ?try=none은 아무것도 켜지 않고(예전 판), -이름은 그것만 뺀다. 연습 장면에는 기본으로 켜지 않는다', () => {
  const opt = q => worldOptions(new URLSearchParams(q)).tries;
  assert.equal(opt('try=none'), null);
  assert.deepEqual(gameTries('-snipe'), TRIES.filter(t => BASE_TRIES.includes(t) && t !== 'snipe'));
  assert.deepEqual(gameTries('-snipe,hunt'), TRIES.filter(t => (BASE_TRIES.includes(t) && t !== 'snipe') || t === 'hunt'));
  assert.deepEqual(gameTries('all'), TRIES);
  assert.equal(opt('lab=parry'), null);
  assert.equal(opt('lab=parry&try=rope'), 'rope');
  assert.equal(createWorld().tries, null, 'sim의 기본값은 그대로');
});
