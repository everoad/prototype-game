// 일반 스테이지(설계 2026-11-17-barrage-stage-design.md): 적 목록·몬스터·방 흐름.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnMob, hurtFoe } from '../src/sim/foes.js';
import { storeAdd } from '../src/sim/store.js';
import { GEAR } from '../src/sim/weapons.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { hurtPlayer } from '../src/sim/player.js';
import { restartRoom } from '../src/sim/stage.js';
import { quietWorld, idle, run, ticks } from './helpers.mjs';

const of = (ev, type) => ev.filter(e => e.type === type);
const count = (w, kind) => { const b = w.bullets; let n = 0; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.kind[i] === kind) n++; return n; };
// 일반 방처럼: 보스는 자리에 없고 몬스터만(두뇌는 꺼 둠 — 몸만 본다). 플레이어는 (-6, 0)
function room(opts = {}) {
  const w = quietWorld({ store: true, ...opts });
  w.boss.away = true;
  return w;
}
const mob = (w, kind, dx, dz) => spawnMob(w, kind, w.player.x + dx, w.player.z + dz, 0);
const give = (w, n, perfect = true) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: 14, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const finite = (o, path) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v)) finite(v, `${path}.${k}`); else for (const x of [].concat(v).flat(9)) if (typeof x === 'number') assert.ok(Number.isFinite(x), `${path}.${k} = ${v}`); } };

test('몬스터 수치는 모두 유한한 수', () => { finite(RULES.mobs, 'mobs'); });

// ── Task 1: 적 목록
test('가장 가까운 몬스터를 겨누고 몸도 그쪽을 본다', () => {
  const w = room();
  const far = mob(w, 'shooter', 8, 0), near = mob(w, 'shooter', 0, 4);
  step(w, idle); step(w, idle);
  assert.equal(w.aim, near);
  assert.ok(Math.abs(w.player.face - Math.PI / 2) < 1e-6, `보는 쪽 ${w.player.face}`);
  near.dead = true;
  step(w, idle); step(w, idle);
  assert.equal(w.aim, far);
});

test('평타는 길에 있는 어느 몬스터에게든 맞고, 죽으면 mobDeath — 판은 끝나지 않는다', () => {
  const w = room();
  const a = mob(w, 'shooter', 4, 0);
  const off = 12 * Math.PI / 180, b = mob(w, 'shooter', Math.cos(off) * 7, Math.sin(off) * 7);   // 겨눈 것(a)보다 멀지만 바깥 알갱이의 길 위
  const ev = []; for (let k = 0; k < ticks(1.5); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.ok(a.hp < a.maxHp, '겨눈 몬스터가 안 맞음');
  assert.ok(b.hp < b.maxHp, '길 위의 다른 몬스터가 안 맞음');
  a.hp = 1;
  for (let k = 0; k < ticks(0.5); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  assert.equal(a.dead, true);
  assert.equal(of(ev, 'mobDeath').length, 1);
  assert.equal(w.result, null);
});

test('살아 있는 적이 없으면 쏘지 않는다(판이 깨지지 않는다)', () => {
  const w = room({ gear: 'all' });
  w.weapons.chargeUntil = 1e9;
  run(w, 1);
  assert.equal(w.stats.shotsFired, 0);
  assert.equal(w.weapons.missiles.length + w.weapons.pellets.length, 0);
  assert.equal(w.aim, null);
});

test('등장 예고 중인 몬스터는 겨누지도 맞지도 않는다', () => {
  const w = room();
  const m = spawnMob(w, 'shooter', w.player.x + 4, w.player.z, 0.5);
  run(w, 0.3);
  assert.equal(w.aim, null); assert.equal(m.hp, m.maxHp);
  run(w, 0.6);
  assert.equal(w.aim, m); assert.ok(m.hp < m.maxHp);
});

test('던진 탄은 겨눈 적이 죽으면 다음 적으로 가고, 적이 없으면 사라진다', () => {
  const w = room();
  w.shots.nextAt = 1e9;
  const a = mob(w, 'shooter', 4, 0), b = mob(w, 'shooter', 0, 6);
  a.hp = 50;
  give(w, 3);
  step(w, { ...idle, throw: true });
  run(w, 1.5);
  const per = RULES.store.dmg[1] * (1 + 2 * RULES.store.bonus);
  assert.equal(a.dead, true);
  assert.ok(Math.abs((b.maxHp - b.hp) - 2 * per) < 1e-6 || b.dead, `둘째 몬스터가 받은 피해 ${b.maxHp - b.hp}`);
  b.dead = true;
  give(w, 2);
  step(w, { ...idle, throw: true });
  run(w, 1.5);
  assert.equal(count(w, K.REFLECT), 0);
});

test('폭탄은 모든 몬스터에게 피해를 준다', () => {
  const w = room();
  w.shots.nextAt = 1e9;
  const a = mob(w, 'shooter', 4, 0), b = mob(w, 'charger', -3, 5);
  step(w, { ...idle, bomb: true });
  assert.ok(Math.abs((a.maxHp - a.hp) - a.maxHp * RULES.mobs.bombShare) < 1e-6);
  assert.ok(Math.abs((b.maxHp - b.hp) - b.maxHp * RULES.mobs.bombShare) < 1e-6);
});

test('플레이어는 몬스터 몸을 지나가지 못한다', () => {
  const w = room();
  w.shots.nextAt = 1e9;
  const m = mob(w, 'shield', 2, 0);
  run(w, 1, { ...idle, mx: 1, mz: 0 });
  const d = Math.hypot(w.player.x - m.x, w.player.z - m.z);
  assert.ok(d >= m.r + RULES.player.bodyR - 1e-6, `겹침 ${d}`);
});

test('hurtFoe: 몬스터는 체력만 깎이고 0이면 죽는다. 같은 seed면 방도 같은 판', () => {
  const w = room();
  const m = mob(w, 'mortar', 5, 0);
  assert.equal(hurtFoe(w, m, 40, 'shot'), 40);
  assert.equal(m.hp, m.maxHp - 40);
  hurtFoe(w, m, 1e6, 'shot');
  assert.equal(m.dead, true);
  const play = () => { const x = room({ seed: 9 }); mob(x, 'shooter', 5, 1); mob(x, 'charger', 3, -4); for (let k = 0; k < ticks(8); k++) { const a = k / 200; step(x, { mx: Math.cos(a), mz: Math.sin(a), parry: k % 41 === 0, dodge: k % 333 === 0 }); drainEvents(x); } return stateHash(x); };
  assert.equal(play(), play());
});

// ── Task 2: 몬스터 넷(두뇌를 켠 방 — 평타는 꺼 둔다)
const M = RULES.mobs, P = RULES.player;
function live(opts = {}) {
  const w = createWorld({ store: true, ...opts });
  w.boss.away = true; w.shots.nextAt = 1e9;
  return w;
}
// 바로 움직이게: 등장 예고 없이 놓고 첫 공격 시각도 지금
const now = (w, kind, dx, dz) => { const m = mob(w, kind, dx, dz); m.nextAt = w.time; return m; };
const play = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, typeof input === 'function' ? input(w, k) : input); ev.push(...drainEvents(w)); } return ev; };
const dP = (w, m) => Math.hypot(m.x - w.player.x, m.z - w.player.z);

test('사수: 가까우면 물러나고 멀면 다가와 거리를 지킨다', () => {
  const w = live();
  const near = now(w, 'shooter', 2.5, 0); near.nextAt = 1e9;
  play(w, 2);
  assert.ok(dP(w, near) >= M.shooter.keep[0] - 0.05, `가까운 사수 거리 ${dP(w, near)}`);
  const w2 = live();
  const far = now(w2, 'shooter', 14, 0); far.nextAt = 1e9;
  play(w2, 3);
  assert.ok(dP(w2, far) <= M.shooter.keep[1] + 0.05, `먼 사수 거리 ${dP(w2, far)}`);
});

test('사수: 흰 번쩍임 warn초 뒤 세 발 — 가운데 흰, 양옆 보라', () => {
  const w = live();
  const m = now(w, 'shooter', 6, 0);
  const ev = play(w, M.shooter.warn + 0.05);
  const wind = of(ev, 'mobWindup');
  assert.equal(wind.length, 1); assert.equal(wind[0].color, 'white'); assert.equal(wind[0].id, m.id);
  const fired = of(ev, 'fire').filter(e => e.src === RULES.src.shooter);
  assert.deepEqual(fired.map(e => e.kind), [K.NORMAL, K.WHITE, K.NORMAL]);
  assert.equal(of(ev, 'mobFire').length, 1);
  assert.ok(m.nextAt > w.time + M.shooter.every * 0.8, '다음 발까지 쉰다');
});

test('돌격병: 줄 예고 뒤 들이받는다 — 서 있으면 dmg', () => {
  const w = live();
  const m = now(w, 'charger', 5, 0);
  step(w, idle);
  const lane = w.floorAreas.find(a => a.owner === m.id);
  assert.ok(lane && lane.shape === 'lane' && lane.color === 'white', '줄 예고가 없음');
  const ev = play(w, M.charger.warn + 0.6);
  assert.equal(w.player.hp, P.hp - M.charger.dmg);
  assert.equal(of(ev, 'mobChargeHit')[0].outcome, 'hurt');
  assert.equal(w.floorAreas.filter(a => a.owner === m.id).length, 0, '돌진이 끝나면 줄을 거둔다');
});

test('돌격병: 몸을 패링하면 한 칸 모이고 체력이 parryShare만큼 깎이며 튕겨 난다 — 멈춤 없음', () => {
  const w = live();
  const m = now(w, 'charger', 5, 0);
  const ev = play(w, M.charger.warn + 0.6, x => ({ ...idle, parry: m.state === 'dash' && dP(x, m) < 2.2 }));
  assert.equal(w.player.hp, P.hp);
  assert.equal(w.player.store.length, 1);
  assert.ok(Math.abs(m.hp - m.maxHp * (1 - M.charger.parryShare)) < 1e-6, `체력 ${m.hp}`);
  assert.ok(dP(w, m) > m.r + P.bodyR + 0.5, '튕겨 나지 않음');
  assert.equal(m.state, 'idle');
  assert.ok(m.nextAt <= w.time + M.charger.rest + 1e-6, '쉬는 시간은 여느 때와 같다(경직 없음)');
  assert.equal(of(ev, 'counterChance').length, 0);
});

test('돌격병: 줄 밖으로 걸어 나가면 안 맞는다', () => {
  const w = live();
  now(w, 'charger', 5, 0);
  const t0 = w.time;
  const ev = play(w, M.charger.warn + 0.8, x => ({ ...idle, mz: x.time - t0 >= M.charger.warn - M.charger.lockBefore ? 1 : 0 }));
  assert.equal(w.player.hp, P.hp);
  assert.equal(of(ev, 'mobChargeHit').length, 0);
});

test('포격병: 빨간 원 n개 — 서 있으면 dmg, 걸으면 안 맞는다', () => {
  const w = live();
  const m = now(w, 'mortar', 8, 0);
  const ev = play(w, 0.3 + M.mortar.gap * (M.mortar.n - 1) + 0.05);
  const shells = w.floorAreas.filter(a => a.owner === m.id);
  assert.equal(shells.length, M.mortar.n);
  assert.ok(shells.every(a => a.shape === 'circle' && a.color === 'red'));
  assert.equal(of(ev, 'mobWindup')[0].color, 'red');
  play(w, M.mortar.warn + 0.3);
  assert.equal(w.player.hp, P.hp - M.mortar.dmg);
  assert.equal(w.floorAreas.filter(a => a.owner === m.id).length, 0, '떨어진 원은 거둔다');
  const w2 = live();
  w2.player.z = -6;   // 난간에 막히지 않게 아래 끝에서 위로 걷는다
  now(w2, 'mortar', 8, 6);
  play(w2, 2, { ...idle, mz: 1 });
  assert.equal(w2.player.hp, P.hp);
});

test('포격병: 구르기로 넘겨도 반격 기회는 없고, 포격병이 죽어도 쏜 포탄은 떨어진다', () => {
  const w = live();
  now(w, 'mortar', 8, 0);
  play(w, 0.35);
  const land = w.floorAreas[0].born + M.mortar.warn;
  const ev = play(w, 1.2, x => ({ ...idle, mx: -1, dodge: Math.abs(x.time - (land - 0.05)) < 0.5 * RULES.dt }));
  assert.equal(of(ev, 'counterChance').length, 0);
  const w2 = live();
  const m2 = now(w2, 'mortar', 8, 0);
  play(w2, 0.35);
  hurtFoe(w2, m2, 1e6, 'shot');
  play(w2, M.mortar.warn + 0.2);
  assert.equal(w2.player.hp, P.hp - M.mortar.dmg);
});

test('방패병: 앞에서 온 평타는 막히고(mobBlock) 뒤에서는 맞는다. 받아친 탄은 앞에서도 맞는다', () => {
  const w = room();
  const m = mob(w, 'shield', 5, 0);
  const ev = play(w, 1);
  assert.equal(m.hp, m.maxHp);
  assert.ok(of(ev, 'mobBlock').length > 0);
  m.face = 0;   // 등을 돌렸다
  play(w, 1);
  assert.ok(m.hp < m.maxHp, '뒤에서 쏜 평타가 안 맞음');
  const w2 = room(); w2.shots.nextAt = 1e9;
  const m2 = mob(w2, 'shield', 5, 0);
  give(w2, 2);
  step(w2, { ...idle, throw: true });
  play(w2, 1.5);
  assert.ok(m2.hp < m2.maxHp, '던진 탄이 방패에 막힘');
});

test('방패병: 초당 turn°만 돌고, 다가와 흰 휘두르기 — 서 있으면 dmg, 패링하면 한 칸', () => {
  const w = live();
  const m = now(w, 'shield', 6, 0); m.nextAt = 1e9;
  m.face = 0.3;   // 플레이어 반대쪽을 보고 시작
  play(w, 1);
  const turned = Math.abs(Math.atan2(Math.sin(m.face - 0.3), Math.cos(m.face - 0.3))) * 180 / Math.PI;
  assert.ok(Math.abs(turned - M.shield.turn) < 1.5, `1초에 돈 각 ${turned}`);
  const w2 = live();
  const m2 = now(w2, 'shield', 2, 0);
  step(w2, idle);
  const sw = w2.floorAreas.find(a => a.owner === m2.id);
  assert.ok(sw && sw.shape === 'sector' && sw.color === 'white', '휘두르기 예고가 없음');
  play(w2, M.shield.warn + 0.3);
  assert.equal(w2.player.hp, P.hp - M.shield.dmg);
  assert.equal(w2.floorAreas.filter(a => a.owner === m2.id).length, 0);
  const w3 = live();
  now(w3, 'shield', 2, 0);
  const t0 = w3.time;
  play(w3, M.shield.warn + 0.3, x => ({ ...idle, parry: Math.abs(x.time - (t0 + M.shield.warn - 0.05)) < 0.5 * RULES.dt }));
  assert.equal(w3.player.hp, P.hp);
  assert.equal(w3.player.store.length, 1);
});

test('등장 예고 동안은 공격도 맞음도 없고, 죽으면 깔던 예고를 거둔다', () => {
  const w = live();
  const a = spawnMob(w, 'charger', w.player.x + 5, w.player.z), b = spawnMob(w, 'shooter', w.player.x + 6, w.player.z + 3);
  const ev = play(w, M.appear - 0.05);
  assert.equal(of(ev, 'mobWindup').length, 0);
  assert.equal(hurtFoe(w, a, 50, 'shot'), 0);
  assert.equal(w.floorAreas.length, 0);
  a.nextAt = b.nextAt = 1e9;
  play(w, 0.1);
  a.nextAt = w.time;
  step(w, idle);
  assert.equal(w.floorAreas.length, 1);
  hurtFoe(w, a, 1e6, 'shot');
  step(w, idle);
  assert.equal(w.floorAreas.length, 0);
});

test('몬스터는 서로 겹치지 않고 플레이어 몸 안으로 들어오지 않는다', () => {
  const w = live();
  const a = now(w, 'shield', 4, 0.1), b = now(w, 'shield', 4, -0.1);
  a.nextAt = b.nextAt = 1e9;
  play(w, 4);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r - 0.05, '몬스터끼리 겹침');
  for (const m of [a, b]) assert.ok(dP(w, m) >= m.r + P.bodyR - 1e-6, `플레이어와 겹침 ${dP(w, m)}`);
});

test('일반 방에서 가득 찬 채 근접을 받아쳐도 자리에 없는 보스의 무력화는 쌓이지 않는다', () => {
  const w = live();
  give(w, RULES.store.cap);
  const m = now(w, 'shield', 2, 0);
  const t0 = w.time;
  play(w, M.shield.warn + 0.3, x => ({ ...idle, parry: Math.abs(x.time - (t0 + M.shield.warn - 0.05)) < 0.5 * RULES.dt }));
  assert.equal(w.player.hp, P.hp);
  assert.equal(w.boss.stagger, 0);
  assert.ok(m.hp > 0);
});

// ── Task 3: 방 흐름(정리 → 보상 → 문 → 다음 방 → 보스, 죽으면 그 방 다시)
const St = RULES.stage;
const stageWorld = (opts = {}) => createWorld({ stage: 1, ai: false, ...opts });
const kinds = w => w.enemies.map(m => m.kind).sort().join(',');
const kill = (w, m) => { m.bornAt = Math.min(m.bornAt, w.time); hurtFoe(w, m, 1e9, 'shot'); };
const killAll = w => { for (const m of w.enemies) if (!m.dead) kill(w, m); };
const put = (w, x, z) => { const p = w.player; p.x = p.px = x; p.z = p.pz = z; };
// 묶음이 몇 개든 방을 비운다(수치를 고쳐도 시험이 그대로 서게)
const wipe = w => { const ev = []; let guard = 0; while (w.stage.phase === 'fight' && guard++ < 10) { killAll(w); step(w, idle); ev.push(...drainEvents(w)); } return ev; };
const waveKinds = wave => wave.flatMap(([kind, n]) => Array(n).fill(kind)).sort().join(',');
const ROOMS = RULES.stage.list[1].rooms;
// 방 하나를 끝까지: 다 잡고 → 보상(kind) 줍고 → 문으로
function clearRoom(w, pick = 'heal') {
  const ev = wipe(w);
  ev.push(...play(w, St.rewardDelay + 0.05));
  const r = w.stage.rewards.find(x => x.kind === pick) ?? w.stage.rewards[0];
  put(w, r.x, r.z);
  step(w, idle); ev.push(...drainEvents(w));
  put(w, RULES.board.hx - P.bodyR, 0);
  step(w, idle); ev.push(...drainEvents(w));
  return ev;
}

test('스테이지 수치는 모두 유한한 수', () => { finite(RULES.stage, 'stage'); });

test('스테이지 시작: 무기 없음·사용권 1·1·모은 탄 0, 보스는 자리에 없고 방 1의 첫 묶음이 나온다', () => {
  const w = stageWorld();
  const ev = drainEvents(w);
  assert.equal(w.opts.store, true);
  assert.deepEqual(w.weapons.on, []);
  assert.deepEqual(w.player.stock, { shield: 1, bomb: 1 });
  assert.equal(w.player.store.length, 0); assert.equal(w.player.hp, P.hp);
  assert.equal(w.boss.away, true);
  assert.equal(w.stage.room, 0); assert.equal(w.stage.phase, 'fight');
  assert.equal(kinds(w), waveKinds(ROOMS[0][0]));
  assert.ok(w.enemies.every(m => m.kind === 'shooter'), '방 1은 사수만');
  assert.deepEqual(of(ev, 'roomStart').map(e => [e.room, e.of]), [[1, ROOMS.length + 1]]);
  for (const m of w.enemies) assert.ok(dP(w, m) >= St.minSpawn - 1e-6, `너무 가까이 나옴 ${dP(w, m)}`);
  for (let i = 0; i < w.enemies.length; i++) for (let j = i + 1; j < w.enemies.length; j++) assert.ok(Math.hypot(w.enemies[i].x - w.enemies[j].x, w.enemies[i].z - w.enemies[j].z) > 1.5, '같은 자리에 둘');
  assert.equal(createWorld().stage, null);
});

test('다 잡으면 적 탄이 사라지고 보상 셋(무기·사용권·체력)이 뜬다', () => {
  const w = stageWorld();
  drainEvents(w);
  spawnBullet(w, K.NORMAL, 0, 5, 0, 0.1, 1); spawnBullet(w, K.WHITE, 0, -5, 0, 0.1, 1);
  w.floorAreas.push({ kind: 'shell', shape: 'circle', x: 0, z: 0, R: 1, color: 'red', warn: 9, born: 0, owner: 1 });
  const ev = wipe(w);
  assert.equal(of(ev, 'roomClear').length, 1);
  assert.equal(w.bullets.live, 0);
  assert.equal(w.floorAreas.length, 0);
  assert.equal(w.stage.phase, 'reward');
  assert.deepEqual(w.stage.rewards.map(r => r.kind), ['weapon', 'charge', 'heal']);
  assert.ok(GEAR.includes(w.stage.rewards[0].what));
  assert.ok(['shield', 'bomb'].includes(w.stage.rewards[1].what));
});

test('보상은 잠깐 뒤부터 주울 수 있고, 하나 고르면 나머지는 사라지며 문이 열린다', () => {
  const w = stageWorld();
  wipe(w);
  const r = w.stage.rewards[0];
  put(w, r.x, r.z);
  step(w, idle);
  assert.equal(w.stage.phase, 'reward', '뜨자마자 주워짐');
  const ev = play(w, St.rewardDelay + 0.05);
  assert.deepEqual(w.weapons.on, [r.what]);
  assert.equal(w.stage.rewards.length, 0);
  assert.equal(w.stage.phase, 'door');
  assert.equal(of(ev, 'rewardPick')[0].kind, 'weapon');
  assert.equal(of(ev, 'doorOpen').length, 1);
});

test('사용권 보상은 +1(최대 chargeMax), 체력 보상은 +heal(최대 체력까지)', () => {
  const w = stageWorld();
  w.player.hp = 40;
  clearRoom(w, 'heal');
  assert.equal(w.player.hp, 40 + St.heal);
  const before = { ...w.player.stock };
  clearRoom(w, 'charge');
  assert.equal(w.player.stock.shield + w.player.stock.bomb, before.shield + before.bomb + 1);
  const w2 = stageWorld();
  w2.player.hp = P.hp - 5;
  clearRoom(w2, 'heal');
  assert.equal(w2.player.hp, P.hp);
});

test('문에 들어가면 다음 방: 플레이어는 왼쪽, 상태는 이어지고, 방 2의 첫 묶음이 나온다', () => {
  const w = stageWorld();
  w.player.hp = 55; give(w, 2); w.player.stock.bomb = 0;
  const ev = clearRoom(w, 'weapon');
  assert.equal(w.stage.room, 1); assert.equal(w.stage.phase, 'fight');
  assert.deepEqual([w.player.x, w.player.z], RULES.start.player);
  assert.equal(w.player.hp, 55); assert.equal(w.player.store.length, 2); assert.equal(w.player.stock.bomb, 0);
  assert.equal(w.weapons.on.length, 1);
  assert.equal(kinds(w), waveKinds(ROOMS[1][0]));
  assert.ok(w.enemies.some(m => m.kind === 'charger'), '방 2에는 돌격병이 있다');
  assert.deepEqual(of(ev, 'roomStart').map(e => e.room), [2]);
  assert.equal(w.stage.door, null);
});

test('문은 고르기 전에는 없고, 문 옆 난간에 서 있어도 지나가지 않는다', () => {
  const w = stageWorld();
  wipe(w);
  put(w, RULES.board.hx - P.bodyR, 0);
  play(w, 1);
  assert.equal(w.stage.room, 0);
  const w2 = stageWorld();
  wipe(w2); play(w2, St.rewardDelay + 0.05);
  const r = w2.stage.rewards[2]; put(w2, r.x, r.z); step(w2, idle);
  put(w2, RULES.board.hx - P.bodyR, St.door.halfZ + 1);
  play(w2, 0.5);
  assert.equal(w2.stage.room, 0, '문 밖 난간에서 넘어감');
});

test('둘째 묶음은 남은 몬스터가 nextWaveAt마리 이하로 줄어야 나온다(등장 예고를 거쳐)', () => {
  const w = stageWorld();
  clearRoom(w); clearRoom(w);
  assert.equal(w.stage.room, 2);
  const [first, second] = ROOMS[2], n0 = w.enemies.length, n1 = waveKinds(second).split(',').length;
  assert.equal(kinds(w), waveKinds(first));
  for (let k = 0; k < n0 - St.nextWaveAt - 1; k++) kill(w, w.enemies[k]);
  play(w, 0.2);
  assert.equal(w.enemies.length, n0, '아직 많이 남았는데 둘째 묶음이 나옴');
  kill(w, w.enemies[n0 - St.nextWaveAt - 1]);
  play(w, 0.1);
  assert.equal(w.enemies.length, n0 + n1);
  assert.equal(w.enemies.slice(n0).map(m => m.kind).sort().join(','), waveKinds(second));
  assert.equal(w.stage.phase, 'fight');
  for (const m of w.enemies.slice(n0)) assert.ok(m.bornAt > w.time, '둘째 묶음도 등장 예고를 거친다');
});

test('방 셋 뒤에는 보스가 나타난다: 두뇌는 여는 순서부터, 일반 방의 것은 남지 않고, 이기면 win', () => {
  const w = stageWorld();
  clearRoom(w); clearRoom(w);
  const ev = clearRoom(w);
  const b = w.boss;
  assert.equal(w.stage.room, 3); assert.equal(w.stage.phase, 'boss');
  assert.equal(b.away, false); assert.equal(b.dead, false);
  assert.equal(of(ev, 'bossEnter').length, 1);
  assert.ok(Math.abs(b.maxHp - RULES.boss.hp * RULES.store.bossHp * St.bossHp) < 1e-6 && b.hp === b.maxHp);
  assert.deepEqual([b.x, b.z], RULES.start.boss);
  assert.equal(b.opening, 0); assert.equal(b.phase, 1);
  assert.ok(b.breathUntil >= w.time, '숨이 방 넘어온 시각부터가 아님');
  assert.equal(w.enemies.length, 0); assert.equal(w.bullets.live, 0);
  step(w, idle);
  assert.equal(w.aim, b);
  hurtFoe(w, b, 1e9, 'shot', { raw: true });
  assert.equal(w.result, 'win');
});

test('스테이지에서는 보스 방에서도 아이템이 나오지 않는다', () => {
  const w = createWorld({ stage: 1 });
  w.player.invulnUntil = 1e9;
  clearRoom(w); clearRoom(w); clearRoom(w);
  assert.equal(w.stage.phase, 'boss');
  w.player.invulnUntil = 1e9;
  const ev = play(w, RULES.items.every + 3);
  assert.equal(of(ev, 'itemSpawn').length, 0);
  assert.equal(w.items.length, 0);
});

test('죽고 restartRoom: 들어설 때 상태 그대로, 새 몬스터, 이전 시도의 탄·장판은 없다', () => {
  const w = stageWorld();
  w.player.hp = 70; give(w, 2);
  clearRoom(w, 'weapon');
  const gear = [...w.weapons.on];
  w.player.stock.bomb = 0; w.player.stock.shield = 0; w.player.store.length = 0; w.weapons.on = [...GEAR];
  kill(w, w.enemies[0]);
  spawnBullet(w, K.NORMAL, 0, 5, 0, 0.1, 1);
  w.floorAreas.push({ kind: 'shell', shape: 'circle', x: 0, z: 0, R: 1, color: 'red', warn: 9, born: 0, owner: 1 });
  put(w, 3, 3);
  w.player.invulnUntil = -1;
  hurtPlayer(w, 999, 1, 0, 0);
  assert.equal(w.result, 'lose');
  drainEvents(w);
  restartRoom(w);
  const ev = drainEvents(w);
  assert.equal(w.result, null);
  assert.equal(w.stage.room, 1); assert.equal(w.stage.phase, 'fight');
  assert.equal(w.player.hp, 70); assert.equal(w.player.store.length, 2);
  assert.deepEqual(w.player.stock, { shield: 1, bomb: 1 });
  assert.deepEqual(w.weapons.on, gear);
  assert.deepEqual([w.player.x, w.player.z], RULES.start.player);
  assert.equal(kinds(w), waveKinds(ROOMS[1][0])); assert.ok(w.enemies.every(m => !m.dead && m.hp === m.maxHp));
  assert.equal(w.bullets.live, 0); assert.equal(w.floorAreas.length, 0);
  assert.equal(of(ev, 'roomRetry')[0].room, 2);
  assert.equal(w.stage.retries, 1);
  play(w, 1);
  assert.equal(w.result, null);
});

test('보스 방에서 죽고 다시 하면 보스도 처음부터', () => {
  const w = stageWorld();
  clearRoom(w); clearRoom(w); clearRoom(w);
  w.boss.hp = 100; w.boss.phase = 2; w.boss.x = 0;
  w.player.stock.bomb = 0;
  hurtPlayer(w, 999, 1, 0, 0);
  restartRoom(w);
  assert.equal(w.boss.hp, w.boss.maxHp); assert.equal(w.boss.phase, 1); assert.equal(w.boss.away, false);
  assert.deepEqual([w.boss.x, w.boss.z], RULES.start.boss);
  assert.equal(w.stage.phase, 'boss'); assert.equal(w.result, null);
  step(w, idle);
  assert.equal(w.aim, w.boss);
});

test('무기를 다 가졌으면 그 칸은 체력, 사용권이 둘 다 가득이면 그 칸도 체력', () => {
  const w = stageWorld();
  w.weapons.on = [...GEAR]; w.player.stock = { shield: St.chargeMax, bomb: St.chargeMax };
  wipe(w);
  assert.deepEqual(w.stage.rewards.map(r => r.kind), ['heal', 'heal', 'heal']);
  const w2 = stageWorld();
  w2.player.stock = { shield: St.chargeMax, bomb: 1 };
  wipe(w2);
  assert.equal(w2.stage.rewards[1].what, 'bomb');
});

test('같은 seed면 스테이지도 같은 판(몬스터가 움직이는 방에서)', () => {
  const run1 = () => { const w = createWorld({ stage: 1, seed: 5 }); for (let k = 0; k < ticks(10); k++) { const a = k / 150; step(w, { mx: Math.cos(a), mz: Math.sin(a), parry: k % 37 === 0, dodge: k % 301 === 0 }); drainEvents(w); } return stateHash(w); };
  assert.equal(run1(), run1());
});

// ── 실험 스테이지(?stage=2): 자폭병 · 보호탑 · 버티기 방
test('자폭병: 달려와 붙으면 심지(빨간 원) 뒤 터진다 — 원 안의 플레이어와 다른 몬스터가 다친다', () => {
  const w = live(), Bm = M.bomber;
  const m = now(w, 'bomber', 6, 0), near = mob(w, 'shield', 1.2, 1.2);
  near.nextAt = 1e9;
  const ev = play(w, 6 / Bm.speed + Bm.fuse + 0.3);
  assert.equal(of(ev, 'mobWindup').filter(e => e.id === m.id)[0].color, 'red');
  assert.equal(m.dead, true);
  assert.equal(w.player.hp, P.hp - Bm.dmg);
  assert.ok(Math.abs((near.maxHp - near.hp) - Bm.mobDmg) < 1e-6, `곁의 몬스터 피해 ${near.maxHp - near.hp}`);
  assert.equal(w.floorAreas.filter(a => a.owner === m.id).length, 0);
});

test('자폭병: 걸어서 원 밖으로 나가면 안 맞고, 죽여도 chain초 뒤 그 자리에서 터져 곁의 몬스터를 다치게 한다', () => {
  const w = live(), Bm = M.bomber;
  const m = now(w, 'bomber', 4, 0);
  play(w, 4, () => ({ ...idle, mx: m.state === 'windup' ? -1 : 0 }));   // 심지가 붙으면 걸어서 물러난다
  assert.equal(m.dead, true);
  assert.equal(w.player.hp, P.hp);
  const w2 = live();
  const b2 = now(w2, 'bomber', 7, 0), other = mob(w2, 'shooter', 7.5, 1);
  b2.nextAt = other.nextAt = 1e9; b2.state = 'held';   // 제자리에 세워 둔다
  hurtFoe(w2, b2, 1e9, 'shot');
  assert.equal(other.hp, other.maxHp);
  const ev = play(w2, Bm.chain + 0.1);
  assert.ok(Math.abs((other.maxHp - other.hp) - Bm.mobDmg) < 1e-6 || other.dead, `연쇄 피해 ${other.maxHp - other.hp}`);
  assert.ok(of(ev, 'meleeHit').some(e => e.shape === 'circle'));
});

test('보호탑: 둘레의 몬스터는 평타에 다치지 않고(던진 탄은 통한다), 탑이 죽으면 풀린다', () => {
  const w = room();
  const t = mob(w, 'totem', 6, 3), s = mob(w, 'shooter', 4, 0);
  assert.ok(Math.hypot(t.x - s.x, t.z - s.z) < M.totem.aura);
  const ev = play(w, 1.2);
  assert.equal(s.hp, s.maxHp, '보호받는 몬스터가 평타에 다침');
  assert.ok(of(ev, 'mobBlock').length > 0);
  w.shots.nextAt = 1e9;
  give(w, 2);
  step(w, { ...idle, throw: true });
  play(w, 1.5);
  assert.ok(s.hp < s.maxHp, '던진 탄이 보호에 막힘');
  const hp = s.hp;
  hurtFoe(w, t, 1e9, 'shot');
  assert.equal(t.dead, true, '탑은 평타에 다친다');
  w.shots.nextAt = 0;
  play(w, 1.2);
  assert.ok(s.hp < hp, '탑이 죽었는데 보호가 남음');
});

test('버티기 방: 몬스터가 cap까지 꾸준히 나오고, 시간이 다 되면 남은 몬스터가 사라지며 방이 정리된다', () => {
  const w = createWorld({ stage: 2, ai: false }), rooms = RULES.stage.list[2].rooms, k = rooms.findIndex(r => !Array.isArray(r)), R2 = rooms[k];
  assert.ok(k >= 0, '실험 스테이지에 버티기 방이 없음');
  for (let n = 0; n < k; n++) clearRoom(w);
  assert.equal(w.stage.room, k);
  assert.ok(w.stage.surviveUntil > w.time);
  let most = 0;
  const ev = [];
  for (let n = 0; n < ticks(R2.survive - 1); n++) { step(w, idle); ev.push(...drainEvents(w)); most = Math.max(most, w.enemies.filter(m => !m.dead).length); }
  assert.equal(w.stage.phase, 'fight');
  assert.ok(most >= 4 && most <= R2.cap + 3, `한때 가장 많은 수 ${most}`);
  assert.ok(of(ev, 'mobSpawn').length >= 6);
  ev.push(...play(w, 1.2));
  assert.equal(of(ev, 'roomClear').length, 1);
  assert.equal(w.enemies.filter(m => !m.dead).length, 0);
});

test('보스가 없는 스테이지는 끝 방을 정리하면 이긴다', () => {
  const w = createWorld({ stage: 2, ai: false }), rooms = RULES.stage.list[2].rooms;
  assert.equal(RULES.stage.list[2].boss, null);
  assert.equal(w.stage.of, rooms.length);
  for (let n = 0; n < rooms.length - 1; n++) clearRoom(w);
  assert.equal(w.result, null);
  if (Array.isArray(rooms.at(-1))) wipe(w); else play(w, rooms.at(-1).survive + 1.5);
  assert.equal(w.result, 'win');
});

// ── 마지막 검토에서 나온 것들
test('돌격병: 난간에 닿으면 돌진이 끝난다 — 줄 밖 난간에 서 있으면 안 맞는다', () => {
  const w = live();
  put(w, 5, 6.5);
  const m = spawnMob(w, 'charger', 2, 3, 0); m.nextAt = w.time;
  const t0 = w.time, lock = M.charger.warn - M.charger.lockBefore;
  const ev = play(w, M.charger.warn + 1.2, x => ({ ...idle, mx: x.time - t0 >= lock && x.time - t0 < lock + 0.35 ? 1 : 0 }));
  assert.equal(of(ev, 'mobChargeHit').length, 0, '줄 밖에서 맞음');
  assert.equal(w.player.hp, P.hp);
  assert.ok(m.x < 6.5, `난간을 타고 미끄러짐 x = ${m.x}`);
});

test('겨눌 적이 없어도 날던 미사일은 곧게 날다 사라지고, 적 없이 던진 산탄은 다음 적에게 쏟아지지 않는다', () => {
  const w = room({ gear: 'all' });
  w.shots.nextAt = 1e9;
  const m = mob(w, 'shooter', 9, 0);
  w.weapons.chargeUntil = 1e9;
  play(w, 0.2);
  assert.ok(w.weapons.missiles.length > 0, '미사일이 안 나감');
  m.dead = true;
  w.weapons.chargeUntil = -1;
  const at = w.weapons.missiles.map(q => q.x + q.z);
  play(w, 0.3);
  assert.ok(w.weapons.missiles.every((q, k) => Math.abs(q.x + q.z - at[k]) > 0.5), '미사일이 허공에 멈춤');
  play(w, RULES.weapons.missile.life + 1);
  assert.equal(w.weapons.missiles.length + w.weapons.pellets.length, 0);
  give(w, 2);
  step(w, { ...idle, throw: true });
  play(w, 0.2);
  assert.equal(w.weapons.throwFans, 0, '적 없이 던진 산탄 몫이 남음');
  mob(w, 'shooter', 6, 0);
  play(w, 0.1);
  assert.equal(w.weapons.pellets.length, 0);
});

test('방에서 제자리 회피는 겨눈 적의 반대쪽으로 구른다(자리에 없는 보스가 아니라)', () => {
  const w = room(); w.shots.nextAt = 1e9;
  put(w, 8, 0);
  spawnMob(w, 'shooter', 7.8, 2.4, 0);
  step(w, idle);
  step(w, { ...idle, dodge: true });
  assert.ok(w.player.dodge.dirZ < -0.9, `구른 쪽 (${w.player.dodge.dirX}, ${w.player.dodge.dirZ})`);
});

test('방의 평타는 mobHit만 낸다(bossHit과 겹치지 않는다)', () => {
  const w = room();
  mob(w, 'shooter', 4, 0);
  const ev = play(w, 1);
  assert.ok(of(ev, 'mobHit').length > 0);
  assert.equal(of(ev, 'bossHit').length, 0);
});

test('구제 창(체력 0) 동안에는 몬스터도 다치지 않는다 — 방을 깨고 죽는 일이 없다', () => {
  const w = room();
  const m = mob(w, 'shooter', 4, 0);
  w.player.dyingAt = w.time + 1;
  assert.equal(hurtFoe(w, m, 50, 'shot'), 0);
  assert.equal(m.hp, m.maxHp);
});

test('방을 정리하면 판의 적 탄이 반짝이며 사라지고(clear 사건), 던진 합계도 비운다', () => {
  const w = stageWorld();
  drainEvents(w);
  spawnBullet(w, K.NORMAL, 0, 5, 0, 0.1, 1); spawnBullet(w, K.NORMAL, 0, -5, 0, 0.1, 1);
  w.player.throwSum = 100;
  const ev = wipe(w);
  assert.ok(of(ev, 'clear').some(e => e.n === 2), '반짝임 사건이 없음');
  assert.equal(w.player.throwSum, 0);
});

test('다시 하기와 방 넘어가기: 날던 평타가 남지 않고, 구르며 문에 들어가도 새 방에서는 서 있다', () => {
  const w = stageWorld();
  w.shots.nextAt = 0;
  play(w, 1.5);
  assert.ok(w.shots.alive.some(a => a), '평타가 안 나감');
  w.player.stock.bomb = 0;
  hurtPlayer(w, 999, 1, 0, 0);
  restartRoom(w);
  assert.ok(!w.shots.alive.some(a => a), '다시 한 방에 지난 평타가 남음');
  w.shots.nextAt = 1e9;
  wipe(w); play(w, St.rewardDelay + 0.05);
  const r = w.stage.rewards[2]; put(w, r.x, r.z); step(w, idle);
  put(w, RULES.board.hx - P.bodyR - 1.5, 0);
  step(w, { ...idle, mx: 1, dodge: true });
  for (let k = 0; k < ticks(0.2) && w.stage.room === 0; k++) step(w, { ...idle, mx: 1 });
  assert.equal(w.stage.room, 1);
  play(w, 0.3);
  assert.deepEqual([w.player.x, w.player.z], RULES.start.player, '구르던 것이 새 방에서 이어짐');
});

test('room 옵션: 그 방에서 시작한다(연습용) — 범위를 넘으면 끝 방', () => {
  const w = createWorld({ stage: 1, room: 3, ai: false });
  assert.equal(w.stage.room, 2); assert.equal(kinds(w), waveKinds(ROOMS[2][0]));
  assert.equal(w.player.hp, P.hp);
  const b = createWorld({ stage: 1, room: 99, ai: false });
  assert.equal(b.stage.phase, 'boss'); assert.equal(b.boss.away, false);
  assert.equal(createWorld({ stage: 1, ai: false }).stage.room, 0);
});

// 사용자 2026-11-17: "방패병을 없애야 — 패링할 거리도 없는데 튼튼하기만 해서 게임이 늘어진다"
test('어느 스테이지의 방에도 방패병은 나오지 않는다', () => {
  for (const [id, def] of Object.entries(RULES.stage.list)) for (const [k, room] of def.rooms.entries()) {
    const kinds = Array.isArray(room) ? room.flat().map(e => e[0]) : room.pool.flat().map(e => e[0]);
    assert.ok(!kinds.includes('shield'), `스테이지 ${id} 방 ${k + 1}에 방패병`);
  }
});
