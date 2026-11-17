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
import { restartRoom, roomKind } from '../src/sim/stage.js';
import { CARDS, giveCard, kitAll, kitCards } from '../src/sim/cards.js';
import { createBot } from '../src/sim/bot.js';
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

test('포격병: 원 n개(마지막만 흰색) — 서 있으면 dmg, 걸으면 안 맞는다', () => {
  const w = live();
  const m = now(w, 'mortar', 8, 0);
  const ev = play(w, 0.3 + M.mortar.gap * (M.mortar.n - 1) + 0.05);
  const shells = w.floorAreas.filter(a => a.owner === m.id);
  assert.equal(shells.length, M.mortar.n);
  assert.ok(shells.every(a => a.shape === 'circle'));
  assert.deepEqual([...shells].sort((a, b) => a.born - b.born).map(a => a.color), [...Array(M.mortar.n - 1).fill('red'), 'white'], '마지막 포탄만 받아칠 수 있다');
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
const wipe = w => { const ev = []; let guard = 0; while (w.stage.phase === 'fight' && guard++ < 10) { if (w.stage.surviveUntil != null) w.stage.surviveUntil = w.time; killAll(w); step(w, idle); ev.push(...drainEvents(w)); } return ev; };
const toBoss = w => { const ev = []; while (w.stage.phase !== 'boss') ev.push(...clearRoom(w)); return ev; };   // 방을 다 지나 보스 방까지
const waveKinds = wave => wave.flatMap(([kind, n]) => Array(n).fill(kind)).sort().join(',');
const ROOMS = RULES.stage.list[1].rooms;
// 방 하나를 끝까지: 다 잡고 → 하나 줍고 → 문으로. pick = 'supply'(가운데 자리의 보급) · 'card'(첫 카드) · 종류 이름
function clearRoom(w, pick = 'supply') {
  const ev = wipe(w);
  ev.push(...play(w, St.rewardDelay + 0.05));
  const r = pick === 'supply' ? w.stage.rewards[1] : w.stage.rewards.find(x => x.kind === pick) ?? w.stage.rewards[0];
  put(w, r.x, r.z);
  ev.push(...play(w, St.pickHold + 0.05));   // 자리 위에 잠깐 서야 주워진다
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

test('다 잡으면 적 탄이 사라지고 카드 둘과 보급 하나가 뜬다(가운데가 보급)', () => {
  const w = stageWorld();
  drainEvents(w);
  spawnBullet(w, K.NORMAL, 0, 5, 0, 0.1, 1); spawnBullet(w, K.WHITE, 0, -5, 0, 0.1, 1);
  w.floorAreas.push({ kind: 'shell', shape: 'circle', x: 0, z: 0, R: 1, color: 'red', warn: 9, born: 0, owner: 1 });
  const ev = wipe(w);
  assert.equal(of(ev, 'roomClear').length, 1);
  assert.equal(w.bullets.live, 0);
  assert.equal(w.floorAreas.length, 0);
  assert.equal(w.stage.phase, 'reward');
  assert.deepEqual(w.stage.rewards.map(r => r.kind), ['card', 'charge', 'card']);
  assert.ok(GEAR.includes(w.stage.rewards[0].what), '방 1 뒤의 첫 카드는 무기');
  assert.notEqual(CARDS[w.stage.rewards[2].what].group, 'weapon', '두 카드는 갈래가 다르다');
  assert.equal(w.stage.rewards[1].what, 'shield', '사용권이 같으면 방패');
  assert.deepEqual(w.stage.rewards.map(r => [r.x, r.z]), St.rewardAt);
});

test('보상은 잠깐 뒤부터 주울 수 있고, 하나 고르면 나머지는 사라지며 문이 열린다', () => {
  const w = stageWorld();
  wipe(w);
  const r = w.stage.rewards[0];
  step(w, idle);
  put(w, r.x, r.z);
  play(w, St.pickHold + 0.05);
  assert.equal(w.stage.phase, 'reward', '뜨자마자 주워짐');
  const ev = play(w, St.rewardDelay + 0.05);
  assert.deepEqual(w.weapons.on, [r.what]);
  assert.equal(w.stage.rewards.length, 0);
  assert.equal(w.stage.phase, 'door');
  assert.equal(of(ev, 'rewardPick')[0].kind, 'card');
  assert.equal(of(ev, 'cardGain')[0].id, r.what);
  assert.equal(of(ev, 'doorOpen').length, 1);
});

test('보급: 체력이 80% 아래면 회복(+heal, 최대 체력까지), 그 위면 사용권 +1(적게 가진 쪽)', () => {
  const w = stageWorld();
  w.player.hp = 40;
  clearRoom(w);
  assert.equal(w.player.hp, 40 + St.heal);
  w.player.hp = P.hp; w.player.stock = { shield: 2, bomb: 1 };
  clearRoom(w);
  assert.deepEqual(w.player.stock, { shield: 2, bomb: 2 });
  const w2 = stageWorld();
  w2.player.hp = P.hp * RULES.cards.supplyBelow - 1;
  wipe(w2);
  assert.equal(w2.stage.rewards[1].kind, 'heal');
  const w3 = stageWorld();
  w3.player.hp = P.hp * RULES.cards.supplyBelow;
  wipe(w3);
  assert.equal(w3.stage.rewards[1].kind, 'charge', '딱 80%면 사용권');
  const w4 = stageWorld();
  w4.player.hp = P.hp - 5; w4.player.stock = { shield: St.chargeMax, bomb: St.chargeMax };
  clearRoom(w4);
  assert.equal(w4.player.hp, P.hp, '사용권이 가득이면 회복 — 최대 체력까지');
});

test('문에 들어가면 다음 방: 플레이어는 왼쪽, 상태는 이어지고, 방 2의 첫 묶음이 나온다', () => {
  const w = stageWorld();
  w.player.hp = 55; give(w, 2); w.player.stock.bomb = 0;
  const ev = clearRoom(w, 'card');
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
  const r = w2.stage.rewards[2]; put(w2, r.x, r.z); play(w2, St.pickHold + 0.05);
  put(w2, RULES.board.hx - P.bodyR, St.door.halfZ + 1);
  play(w2, 0.5);
  assert.equal(w2.stage.room, 0, '문 밖 난간에서 넘어감');
});

test('둘째 묶음은 남은 몬스터가 nextWaveAt마리 이하로 줄어야 나온다(등장 예고를 거쳐)', () => {
  const w = stageWorld();
  clearRoom(w);
  assert.equal(w.stage.room, 1);
  const [first, second] = ROOMS[1], n0 = w.enemies.length, n1 = waveKinds(second).split(',').length;
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

test('방 넷 뒤에는 보스가 나타난다: 두뇌는 여는 순서부터, 일반 방의 것은 남지 않고, 이기면 win', () => {
  const w = stageWorld();
  const ev = toBoss(w);
  const b = w.boss;
  assert.equal(w.stage.room, ROOMS.length); assert.equal(ROOMS.length, 4); assert.equal(w.stage.phase, 'boss');
  assert.equal(b.away, false); assert.equal(b.dead, false);
  assert.equal(of(ev, 'bossEnter').length, 1);
  assert.ok(Math.abs(b.maxHp - RULES.boss.hp * RULES.store.bossHp * St.bossHp * (RULES.stage.list[1].bossHp ?? 1)) < 1e-6 && b.hp === b.maxHp);   // 스테이지마다 보스 체력 배율(list[id].bossHp)
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
  toBoss(w);
  assert.equal(w.stage.phase, 'boss');
  w.player.invulnUntil = 1e9;
  const ev = play(w, RULES.items.every + 3);
  assert.equal(of(ev, 'itemSpawn').length, 0);
  assert.equal(w.items.length, 0);
});

test('죽고 restartRoom: 들어설 때 상태 그대로, 새 몬스터, 이전 시도의 탄·장판은 없다', () => {
  const w = stageWorld();
  w.player.hp = 70; give(w, 2);
  clearRoom(w, 'card');
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
  toBoss(w);
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

test('카드를 다 가졌고 사용권도 가득이면 셋 다 회복, 사용권 자리가 남았으면 가운데는 사용권', () => {
  const all = Object.keys(CARDS);
  const w = stageWorld();
  w.rules.cards.slots.weapon = 9; w.rules.cards.slots.orb = 9; w.rules.cards.slots.move = 9;
  try {
    for (const id of all) giveCard(w, id);
    assert.equal(kitAll(w).length, all.length);
    w.player.stock = { shield: St.chargeMax, bomb: St.chargeMax };
    wipe(w);
    assert.deepEqual(w.stage.rewards.map(r => r.kind), ['heal', 'heal', 'heal']);
  } finally { w.rules.cards.slots.weapon = 2; w.rules.cards.slots.orb = 1; w.rules.cards.slots.move = 2; }
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
test('자폭병: 달려와 붙으면 심지(흰 원 — 받아칠 수 있다) 뒤 터진다 — 받아치지 않으면 원 안의 플레이어와 다른 몬스터가 다친다', () => {
  const w = live(), Bm = M.bomber;
  const m = now(w, 'bomber', 6, 0), near = mob(w, 'shield', 1.2, 1.2);
  near.nextAt = 1e9;
  const ev = play(w, 6 / Bm.speed + Bm.fuse + 0.3);
  assert.equal(of(ev, 'mobWindup').filter(e => e.id === m.id)[0].color, 'white');
  assert.equal(m.dead, true);
  assert.equal(w.player.hp, P.hp - Bm.dmg);
  assert.equal(of(ev, 'bomberBounce').length, 0);
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
  const w = createWorld({ stage: 1, ai: false }), rooms = RULES.stage.list[1].rooms, k = rooms.findIndex(r => roomKind(r) === 'survive'), R2 = rooms[k];
  assert.equal(k, 2, '스테이지 1의 방 3이 버티기 방');
  assert.equal(R2.survive, 40);
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

test('보스가 없는 스테이지는 끝 방을 정리하면 이긴다(지금 스테이지 둘은 모두 보스가 있다)', () => {
  RULES.stage.list[9] = { rooms: [[[['shooter', 1]]], [[['shooter', 1]]]], boss: null };
  try {
    const w = createWorld({ stage: 9, ai: false });
    assert.equal(w.stage.of, 2);
    clearRoom(w);
    assert.equal(w.result, null);
    wipe(w);
    assert.equal(w.result, 'win');
  } finally { delete RULES.stage.list[9]; }
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
  const r = w.stage.rewards[2]; put(w, r.x, r.z); play(w, St.pickHold + 0.05);
  put(w, RULES.board.hx - P.bodyR - 1.5, 0);
  step(w, { ...idle, mx: 1, dodge: true });
  for (let k = 0; k < ticks(0.2) && w.stage.room === 0; k++) step(w, { ...idle, mx: 1 });
  assert.equal(w.stage.room, 1);
  play(w, 0.3);
  assert.deepEqual([w.player.x, w.player.z], RULES.start.player, '구르던 것이 새 방에서 이어짐');
});

test('room 옵션: 그 방에서 시작한다(연습용) — 범위를 넘으면 끝 방', () => {
  const w = createWorld({ stage: 1, room: 2, ai: false });
  assert.equal(w.stage.room, 1); assert.equal(kinds(w), waveKinds(ROOMS[1][0]));
  assert.equal(w.player.hp, P.hp);
  const b = createWorld({ stage: 1, room: 99, ai: false });
  assert.equal(b.stage.phase, 'boss'); assert.equal(b.boss.away, false);
  assert.equal(createWorld({ stage: 1, ai: false }).stage.room, 0);
});

// 사용자 2026-11-17: "방패병을 없애야 — 패링할 거리도 없는데 튼튼하기만 해서 게임이 늘어진다"
test('어느 스테이지의 방에도 방패병은 나오지 않는다', () => {
  for (const [id, def] of Object.entries(RULES.stage.list)) for (const [k, room] of def.rooms.entries()) {
    const kinds = wavesIn(room).flat().map(e => e[0]);
    assert.ok(!kinds.includes('shield'), `스테이지 ${id} 방 ${k + 1}에 방패병`);
  }
});

// 사용자 2026-11-17: "포탑들이 패링은 안 되는데 튼튼하고, 포탑들만 남았을 때 위협적이지 않아서 게임을 늘어지게 만든다" → 포탄 하나를 되받아칠 수 있게
// 빨간 원이 떨어질 때까지는 밖에 있다가 흰 원에 들어간다(서 있으면 두 원이 같은 자리다). press = 흰 원이 떨어지기 0.05초 전에 패링을 누를지
function mortarVolley(w, m) {
  play(w, M.mortar.aim + M.mortar.gap * (M.mortar.n - 1) + 0.02);
  const shells = w.floorAreas.filter(a => a.owner === m.id).sort((a, b) => a.born - b.born), white = shells.at(-1);
  return { shells, white, land: white.born + white.warn, redDone: shells.at(-2).born + shells.at(-2).warn + 0.02 };
}
const inWhite = (w, v, press) => play(w, 1.5, x => {
  const p = x.player, out = x.time < v.redDone;
  p.x = p.px = v.white.x; p.z = p.pz = v.white.z + (out ? 4 : 0);
  return { ...idle, parry: press && Math.abs(x.time - (v.land - 0.05)) < 0.5 * RULES.dt };
});

test('포격병: 흰 원 안에서 받아치면 한 칸 모이고, 포탄이 되돌아가 포격병이 체력의 parryShare를 잃는다', () => {
  const w = live(), p = w.player, m = now(w, 'mortar', 8, 0);
  const v = mortarVolley(w, m);
  assert.equal(v.white.color, 'white');
  const ev = inWhite(w, v, true);
  assert.equal(p.hp, P.hp);
  assert.equal(p.store.length, 1);
  assert.ok(Math.abs(m.maxHp - m.hp - m.maxHp * M.mortar.parryShare) < 1e-6, `포격병 체력 ${m.hp}/${m.maxHp}`);
  const back = of(ev, 'shellReturn');
  assert.equal(back.length, 1);
  assert.equal(back[0].id, m.id);
  assert.equal(of(ev, 'counterChance').length, 0, '판은 멈추지 않는다');
});

test('포격병: 흰 원 안에서 받아치지 않으면 맞는다', () => {
  const w = live(), m = now(w, 'mortar', 8, 0);
  const ev = inWhite(w, mortarVolley(w, m), false);
  assert.equal(w.player.hp, P.hp - M.mortar.dmg);
  assert.equal(of(ev, 'shellReturn').length, 0);
  assert.equal(m.hp, m.maxHp);
});

test('포격병: 죽은 뒤 떨어진 흰 포탄은 받아치면 모이기만 한다(되돌아갈 곳이 없다)', () => {
  const w = live(), m = now(w, 'mortar', 8, 0);
  const v = mortarVolley(w, m);
  hurtFoe(w, m, 1e6, 'shot');
  const ev = inWhite(w, v, true);
  assert.equal(w.player.store.length, 1);
  assert.equal(of(ev, 'shellReturn').length, 0);
});

test('포격병을 두 번 되받아치면 죽는다(체력의 절반씩)', () => {
  const w = live(), m = now(w, 'mortar', 8, 0);
  inWhite(w, mortarVolley(w, m), true);
  m.nextAt = w.time;
  inWhite(w, mortarVolley(w, m), true);
  assert.ok(m.dead, `남은 체력 ${m.hp}`);
});

test('봇은 빨간 원을 피한 뒤 흰 포탄 원으로 들어가 받아친다', () => {
  let got = 0;
  for (const seed of [1, 2, 3]) {
    const w = live({ seed }), m = now(w, 'mortar', 7, 0), bot = createBot('1', seed);
    for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));
    m.nextAt = w.time;
    for (let k = 0; k < ticks(M.mortar.aim + M.mortar.gap * (M.mortar.n - 1) + M.mortar.warn + 0.3); k++) step(w, bot(w));
    assert.equal(w.player.hp, P.hp, `seed ${seed}: 포탄에 맞음`);
    if (m.hp < m.maxHp) got++;
  }
  assert.ok(got >= 2, `세 판 가운데 ${got}판만 되받아침`);
});

// ── 움직임을 요구하는 몬스터(사용자 2026-11-17 "가만히 서서 패링만 기다린다, 좀 더 움직임을 요구해야"): 장벽병 · 회전포
const bulletsOf = (w, src) => { const b = w.bullets, out = []; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] === src) out.push(i); return out; };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

test('장벽병: 겨눈 쪽으로 촘촘한 탄 벽 — 빈틈 하나, 빈틈 양 끝만 흰 탄이고 나를 겨눈 탄은 보라다', () => {
  const w = live(), Wl = M.waller, b = w.bullets, p = w.player;
  const m = now(w, 'waller', 7, 0);
  const ev = play(w, Wl.warn + 0.03);
  assert.equal(of(ev, 'mobWindup').filter(e => e.id === m.id)[0].color, 'white');
  const ids = bulletsOf(w, RULES.src.waller);
  assert.equal(ids.length, Wl.n - Wl.gap);
  const aim = Math.atan2(p.z - m.z, p.x - m.x), stepA = Wl.arcDeg / (Wl.n - 1) * Math.PI / 180;
  const slot = i => Math.round(wrapA(Math.atan2(b.vz[i], b.vx[i]) - aim) / stepA);
  const kindAt = new Map(ids.map(i => [slot(i), b.kind[i]]));
  assert.equal(kindAt.get(0), K.NORMAL, '나를 겨눈 탄이 비었거나 흰 탄');
  const half = (Wl.n - 1) / 2, missing = [];
  for (let s = -half; s <= half; s++) if (!kindAt.has(s)) missing.push(s);
  assert.equal(missing.length, Wl.gap);
  assert.equal(missing.at(-1) - missing[0], Wl.gap - 1, '빈틈이 한 덩어리가 아님');
  const whites = [...kindAt].filter(([, k]) => k === K.WHITE).map(([s]) => s).sort((x, y) => x - y);
  assert.deepEqual(whites, [missing[0] - 1, missing.at(-1) + 1], '흰 탄은 빈틈 양 끝');
  const offDeg = Math.abs((missing[0] + missing.at(-1)) / 2) * Wl.arcDeg / (Wl.n - 1);
  assert.ok(offDeg >= Wl.gapAt[0] - 3 && offDeg <= Wl.gapAt[1] + 3, `빈틈이 겨눈 줄에서 ${offDeg}°`);
});

test('장벽병: 서 있으면 벽에 맞고, 빈틈으로 걸어가면 안 맞는다', () => {
  const w = live(), Wl = M.waller, p = w.player;
  const m = now(w, 'waller', 7, 0); m.nextAt = w.time;
  play(w, Wl.warn + 7 / (Wl.bulletSpeed * RULES.bullets.speedMul) + 0.4);
  assert.ok(p.hp < P.hp, '서 있었는데 안 맞음');
  const w2 = live(), p2 = w2.player, m2 = now(w2, 'waller', 7, 0);
  play(w2, Wl.warn + 0.03);
  m2.nextAt = 1e9;
  const gap = m2.gapAngle, d = Math.hypot(p2.x - m2.x, p2.z - m2.z), gx = m2.x + Math.cos(gap) * d, gz = m2.z + Math.sin(gap) * d;
  play(w2, 7 / (Wl.bulletSpeed * RULES.bullets.speedMul) + 0.5, () => { const dx = gx - p2.x, dz = gz - p2.z, l = Math.hypot(dx, dz); return l > 0.15 ? { ...idle, mx: dx / l, mz: dz / l } : idle; });
  assert.equal(p2.hp, P.hp, '빈틈으로 갔는데 맞음');
});

test('회전포: 예고 뒤 on초 동안 팔 arms개가 돌면서 쏜다 — burst발 쏘고 skip발 쉬며, 묶음 안에서 whiteEvery발마다 흰 탄, 그 뒤 rest초 쉰다', () => {
  const w = live(), Sp = M.spinner, b = w.bullets, src = RULES.src.spinner;
  const m = now(w, 'spinner', 7, 0);
  w.player.hp = w.player.maxHp = 1e9;   // 서서 맞아도 판이 끝나지 않게
  const fired = sec => of(play(w, sec), 'fire').filter(e => e.src === src);
  const two = fired(Sp.warn + Sp.shotEvery + 0.02);   // 첫 두 발 차례
  assert.equal(m.state, 'spin');
  assert.equal(two.length, Sp.arms * 2);
  const first = two.slice(0, Sp.arms), second = two.slice(Sp.arms);
  assert.ok(first.every(e => e.kind === K.WHITE), '묶음의 첫 발이 흰 탄이 아님');
  assert.ok(second.every(e => e.kind === K.NORMAL));
  const ang = e => Math.atan2(b.vz[e.id], b.vx[e.id]);
  assert.ok(Math.abs(Math.abs(wrapA(ang(second[0]) - ang(first[0]))) - Sp.turnDeg * Math.PI / 180 * Sp.shotEvery) < 1e-6, '한 발마다 turnDeg × shotEvery만큼 돈다');
  if (Sp.arms === 2) assert.ok(Math.abs(Math.abs(wrapA(ang(first[1]) - ang(first[0]))) - Math.PI) < 1e-6, '두 팔은 마주 본다');
  const rest = fired(Sp.on + 0.1), all = [...two, ...rest];
  assert.equal(m.state, 'idle');
  const slots = Math.ceil(Sp.on / Sp.shotEvery - 1e-9), cyc = Sp.burst + Sp.skip;
  let shots = 0, whites = 0;
  for (let k = 0; k < slots; k++) { const ph = k % cyc; if (ph < Sp.burst) { shots++; if (ph % Sp.whiteEvery === 0) whites++; } }
  assert.equal(all.length, shots * Sp.arms, `쏜 탄 ${all.length}발`);
  assert.equal(all.filter(e => e.kind === K.WHITE).length, whites * Sp.arms, '흰 탄 수');
  assert.equal(fired(Sp.rest - 0.3).length, 0, '쉬는 동안 쏨');
});

test('새 몬스터의 수치는 유한한 수이고, 스테이지 1에 둘 다 나온다', () => {
  finite(M.waller, 'waller'); finite(M.spinner, 'spinner');
  const kinds = RULES.stage.list[1].rooms.flatMap(wavesIn).flat(2).filter(x => typeof x === 'string');
  assert.ok(kinds.includes('waller') && kinds.includes('spinner'), kinds.join(','));
});

// ── 독립 검토(2026-11-17 밤)에서 나온 것
test('검토: 장벽병의 흰 탄과 빈틈은 어느 판에서도 겨눈 줄에 오지 않는다(서 있으면 늘 보라에 맞는다)', () => {
  const Wl = M.waller;
  for (let seed = 1; seed <= 80; seed++) {
    const w = live({ seed }), b = w.bullets, p = w.player, m = now(w, 'waller', 7, 0);
    play(w, Wl.warn + 0.03);
    const aim = Math.atan2(p.z - m.z, p.x - m.x), stepA = Wl.arcDeg / (Wl.n - 1) * Math.PI / 180;
    const mid = bulletsOf(w, RULES.src.waller).find(i => Math.round(wrapA(Math.atan2(b.vz[i], b.vx[i]) - aim) / stepA) === 0);
    assert.ok(mid != null && b.kind[mid] === K.NORMAL, `seed ${seed}: 겨눈 줄의 탄이 ${mid == null ? '없음' : '흰 탄'}`);
  }
});

// ── 한 판의 뼈대(설계 2026-11-17-barrage-run-design.md §6): 고르는 순간 — 카드 둘 + 보급 하나, 바꿔 끼우기
const away = w => put(w, -8, 0);   // 자리 셋에서 먼 곳
const offerOf = w => { wipe(w); play(w, St.rewardDelay + 0.05); return w.stage.rewards.map(r => ({ kind: r.kind, what: r.what, x: r.x, z: r.z })); };
const stepOn = (w, r) => { put(w, r.x, r.z); return play(w, St.pickHold + 0.05); };   // 자리에 올라서서 잠깐 선다

test('카드를 주우면 끼워지고 문이 열린다 — 나머지 둘은 사라진다', () => {
  const w = stageWorld(), offer = offerOf(w), c = offer[2];
  const ev = stepOn(w, c);
  assert.ok(kitAll(w).includes(c.what));
  assert.equal(w.stage.phase, 'door'); assert.equal(w.stage.rewards.length, 0);
  assert.equal(of(ev, 'rewardPick')[0].what, c.what);
  assert.ok(!kitAll(w).includes(offer[0].what));
});

test('칸이 찬 갈래의 카드를 밟으면 바꿔 끼우기 — 밟은 자리는 무르기, 나머지 자리에 낀 카드', () => {
  const w = stageWorld({ kit: ['missile', 'burst'] }), offer = offerOf(w), c = offer[0];
  assert.equal(CARDS[c.what].group, 'weapon');
  const ev = stepOn(w, c);
  assert.equal(w.stage.phase, 'replace');
  assert.deepEqual(of(ev, 'replaceStart').map(e => [e.id, e.group]), [[c.what, 'weapon']]);
  assert.deepEqual(w.stage.rewards.map(r => r.kind).sort(), ['cancel', 'held', 'held']);
  const cancel = w.stage.rewards.find(r => r.kind === 'cancel');
  assert.deepEqual([cancel.x, cancel.z], [c.x, c.z]);
  assert.deepEqual(w.stage.rewards.filter(r => r.kind === 'held').map(r => r.what).sort(), ['burst', 'missile']);
  assert.deepEqual(w.weapons.on, ['missile', 'burst'], '고르기 전에는 그대로');
  assert.equal(w.stage.door, null);
});

test('밟고 선 채로는 무르기가 눌리지 않는다. 나갔다 돌아와 밟으면 처음 셋이 다시 뜬다', () => {
  const w = stageWorld({ kit: ['missile', 'burst'] }), offer = offerOf(w), c = offer[0];
  stepOn(w, c);
  play(w, 0.5);
  assert.equal(w.stage.phase, 'replace', '서 있기만 했는데 물러짐');
  away(w); step(w, idle);
  const ev = stepOn(w, c);
  assert.equal(w.stage.phase, 'reward');
  assert.equal(of(ev, 'replaceCancel').length, 1);
  assert.deepEqual(w.stage.rewards.map(r => ({ kind: r.kind, what: r.what, x: r.x, z: r.z })), offer);
  play(w, 0.5);
  assert.equal(w.stage.phase, 'reward', '무른 자리에 서 있기만 했는데 다시 바꿔 끼우기로 감');
  assert.deepEqual(w.weapons.on, ['missile', 'burst']);
});

test('무르기를 세 번 되풀이해도 자리 셋과 낀 것이 그대로다', () => {
  const w = stageWorld({ kit: ['missile', 'burst'] }), offer = offerOf(w), c = offer[0];
  for (let k = 0; k < 3; k++) {
    away(w); step(w, idle);
    stepOn(w, c);
    assert.equal(w.stage.phase, 'replace', `${k + 1}번째`);
    away(w); step(w, idle);
    stepOn(w, c);
    assert.equal(w.stage.phase, 'reward', `${k + 1}번째 무르기`);
  }
  assert.deepEqual(w.stage.rewards.map(r => ({ kind: r.kind, what: r.what, x: r.x, z: r.z })), offer);
  assert.deepEqual(kitAll(w), ['missile', 'burst']);
  away(w); step(w, idle);
  stepOn(w, offer[1]);
  assert.equal(w.stage.phase, 'door', '무른 뒤 보급을 주울 수 없다');
});

test('낀 카드를 밟으면 그것이 빠지고 새 카드가 들어간다 — 문이 열린다', () => {
  const w = stageWorld({ kit: ['missile', 'burst'] }), offer = offerOf(w), c = offer[0];
  stepOn(w, c);
  const held = w.stage.rewards.find(r => r.what === 'missile');
  play(w, 0.2);
  away(w); step(w, idle); drainEvents(w);
  const ev = stepOn(w, held);
  assert.deepEqual([...w.weapons.on].sort(), ['burst', c.what].sort());
  assert.equal(w.stage.phase, 'door'); assert.equal(w.stage.rewards.length, 0);
  assert.deepEqual(of(ev, 'cardDrop').map(e => e.id), ['missile']);
  assert.deepEqual(of(ev, 'cardGain').map(e => e.id), [c.what]);
  assert.equal(of(ev, 'rewardPick')[0].what, c.what);
  assert.equal(of(ev, 'doorOpen').length, 1);
});

test('탄 기술은 한 칸이라 바꿀 것이 하나다. 한 틱에 두 자리에 닿아도 하나만 듣는다', () => {
  const w = stageWorld({ kit: ['missile', 'lance'] });
  offerOf(w);
  w.stage.rewards[2].what = 'orbit';
  stepOn(w, w.stage.rewards[2]);
  assert.equal(w.stage.phase, 'replace');
  assert.deepEqual(w.stage.rewards.map(r => r.kind).sort(), ['cancel', 'held']);
  assert.equal(w.stage.rewards.find(r => r.kind === 'held').what, 'lance');
  const w2 = stageWorld({ kit: ['missile', 'burst'] }), c = offerOf(w2)[0];
  stepOn(w2, c);
  away(w2); step(w2, idle); drainEvents(w2);
  for (const r of w2.stage.rewards) { r.x = 3; r.z = 3; }   // 세 자리를 한곳에 겹쳐 놓는다
  put(w2, 3, 3);
  const ev = play(w2, St.pickHold + 0.05);
  assert.equal(of(ev, 'cardDrop').length + of(ev, 'replaceCancel').length, 1, '한 틱에 둘이 들음');
  assert.equal(w2.weapons.on.length, 2);
});

test('다음 방에서 죽어 다시 하면 고른 카드를 든 채 그 방부터 — 방 안에서 생긴 것은 없어지고 효과는 한 벌', () => {
  const w = stageWorld({ kit: ['missile', 'burst'] }), c = offerOf(w)[0];
  stepOn(w, c);
  const held = w.stage.rewards.find(r => r.what === 'missile');
  away(w); step(w, idle); stepOn(w, held);
  put(w, RULES.board.hx - P.bodyR, 0); step(w, idle);
  assert.equal(w.stage.room, 1);
  const kit = kitAll(w);
  assert.ok(!kit.includes('missile') && kit.includes(c.what));
  giveCard(w, 'sky'); giveCard(w, 'cap'); giveCard(w, 'charge');   // 방 안에서 생겼다 치고
  w.player.stock.bomb = 0;
  hurtPlayer(w, 999, 1, 0, 0);
  restartRoom(w);
  assert.deepEqual(kitAll(w), kit, '버린 카드가 살아나거나 방 안에서 얻은 것이 남았다');
  assert.equal(w.player.storeCap, RULES.store.cap); assert.equal(w.player.dodge.max, RULES.dodge.charges); assert.equal(w.player.dodge.charges, RULES.dodge.charges);
  assert.equal(w.tries.anchors.length, 0); assert.ok(!w.tries.on.sky);
  const w2 = stageWorld({ kit: ['missile', 'sky', 'cap'] });
  for (let k = 0; k < 5; k++) storeAdd(w2, { perfect: false, gold: false, stagger: 12, x: 0, z: 0, kind: 'bullet' });
  clearRoom(w2);
  assert.equal(w2.player.store.length, 5);
  w2.player.stock.bomb = 0;
  hurtPlayer(w2, 999, 1, 0, 0);
  restartRoom(w2); restartRoom(w2);
  assert.equal(w2.player.storeCap, RULES.store.cap + 1, '다시 할 때마다 탄 칸이 늘어난다');
  assert.equal(w2.player.store.length, 5, '들어설 때 모은 탄 다섯');
  assert.equal(w2.tries.anchors.length, RULES.tries.rope.anchors.length, '말뚝이 한 벌이 아니다');
  assert.deepEqual(kitAll(w2), ['missile', 'sky', 'cap']);
});

test('방을 넘어가면 놓인 지뢰와 끌려가던 줄이 남지 않는다', () => {
  const w = stageWorld({ kit: ['missile', 'mine', 'sky'] });
  give(w, 2);
  step(w, { ...idle, orb: true });
  assert.equal(w.tries.mines.length, 1);
  wipe(w); play(w, St.rewardDelay + 0.05);
  stepOn(w, w.stage.rewards[1]);
  put(w, RULES.board.hx - P.bodyR - 3, 0);
  step(w, { ...idle, mx: 1, move1: true });
  put(w, RULES.board.hx - P.bodyR, 0); step(w, idle);
  assert.equal(w.stage.room, 1);
  assert.equal(w.tries.mines.length, 0); assert.equal(w.tries.rope.to, null);
  assert.deepEqual(kitCards(w, 'orb'), ['mine']);
});

// ── 한 판의 뼈대 §5: 방 넷 + 보스, 방의 종류(전투·버티기·정예), 방의 특징(기둥·밀물), 스테이지 2의 용
const wavesIn = room => (Array.isArray(room) ? room : room.waves ?? room.pool ?? [room.with]);
const stage2 = (opts = {}) => createWorld({ stage: 2, ai: false, ...opts });
const toRoom = (w, n) => { while (w.stage.room < n) clearRoom(w); return w; };

test('스테이지 둘 다 방 넷 + 보스. 방 3이 특수 방(버티기 · 정예), 방 4에 방의 특징(기둥 · 밀물)', () => {
  for (const id of [1, 2]) {
    const def = RULES.stage.list[id], w = createWorld({ stage: id, ai: false });
    assert.equal(def.rooms.length, 4); assert.equal(w.stage.of, 5);
    assert.deepEqual(def.rooms.map(roomKind), id === 1 ? ['fight', 'fight', 'survive', 'fight'] : ['fight', 'fight', 'elite', 'fight']);
    assert.equal(def.rooms[3].feature, id === 1 ? 'pillars' : 'tide');
    assert.equal(def.boss, id === 1 ? 'ranged' : 'dragon');
  }
});

test('어느 스테이지의 방에도 방패병·보호탑이 나오지 않는다 — 방에 나오는 것은 모두 받아칠 거리가 있다', () => {
  const ok = ['shooter', 'charger', 'mortar', 'waller', 'spinner', 'bomber'];
  for (const def of Object.values(RULES.stage.list)) for (const room of def.rooms) {
    for (const wave of wavesIn(room)) for (const [kind] of wave) assert.ok(ok.includes(kind), `방에 ${kind}`);
    if (room.elite) assert.ok(ok.includes(room.elite), `정예 ${room.elite}`);
  }
});

test('방 4에 들어서면 기둥이 서고 보스 방에 들어서면 사라진다. 다시 하면 새것 한 벌', () => {
  const w = stageWorld();
  assert.equal(w.stage.feature ?? null, null);
  assert.ok(!w.tries || w.tries.pillars.length === 0);
  toRoom(w, 3);
  assert.equal(w.stage.feature, 'pillars');
  assert.equal(w.tries.pillars.length, RULES.tries.pillars.at.length);
  w.tries.pillars[0].hp = 1; w.tries.pillars.pop();
  w.player.stock.bomb = 0;
  hurtPlayer(w, 999, 1, 0, 0);
  restartRoom(w);
  assert.equal(w.tries.pillars.length, RULES.tries.pillars.at.length, '기둥이 한 벌이 아니다');
  assert.ok(w.tries.pillars.every(c => c.hp === RULES.tries.pillars.hp), '부서지던 기둥이 그대로');
  clearRoom(w);
  assert.equal(w.stage.phase, 'boss');
  assert.equal(w.tries.pillars.length, 0); assert.equal(w.stage.feature, null);
  assert.ok(!w.tries.on.pillars);
});

test('스테이지 2의 방 4는 밀물 — 예고는 방에 들어선 뒤 first초에 처음 뜨고, 보스 방에는 없다', () => {
  const w = stage2();
  toRoom(w, 3);
  assert.equal(w.stage.feature, 'tide');
  const t0 = w.time, Ti = RULES.tries.tide;
  w.player.invulnUntil = 1e9;
  let at = null;
  for (let k = 0; k < ticks(Ti.first + 0.5) && at == null; k++) { step(w, idle); if (of(drainEvents(w), 'tideWarn').length) at = w.time - t0; }
  assert.ok(at != null && Math.abs(at - Ti.first) < 0.05, `밀물 첫 예고 ${at}`);
  clearRoom(w);
  assert.equal(w.stage.phase, 'boss');
  assert.equal(w.tries.tide, null);
  assert.equal(w.floorAreas.filter(a => a.kind === 'tide').length, 0);
});

test('정예 방: 큰 몬스터 하나(몸·체력이 크다)와 졸개 — 졸개는 every초마다 cap 미만일 때만 더 나온다', () => {
  const w = stage2(), room = RULES.stage.list[2].rooms[2], E = RULES.mobs.elite;
  toRoom(w, 2);
  const ev = drainEvents(w);
  const elites = w.enemies.filter(m => m.elite);
  assert.equal(elites.length, 1);
  const el = elites[0], M0 = RULES.mobs[room.elite];
  assert.equal(el.kind, room.elite);
  assert.ok(Math.abs(el.r - M0.r * E.r) < 1e-9 && Math.abs(el.maxHp - M0.hp * E.hp) < 1e-6, `r ${el.r} hp ${el.maxHp}`);
  const n0 = waveKinds(room.with).split(',').length;
  assert.equal(w.enemies.length, 1 + n0);
  for (const m of w.enemies) if (!m.elite) kill(w, m);
  w.player.invulnUntil = 1e9;
  const more = play(w, room.every + 0.2);
  assert.equal(of(more, 'mobSpawn').length, n0, '졸개가 다시 나오지 않음');
  assert.equal(w.stage.phase, 'fight');
  for (let k = 0; k < 6; k++) play(w, room.every + 0.1);
  assert.ok(w.enemies.filter(m => !m.dead && !m.elite).length <= room.cap - 1 + n0, `졸개 ${w.enemies.filter(m => !m.dead && !m.elite).length}`);
  assert.ok(ev || true);
});

test('정예가 죽으면 졸개가 사라지고(자폭병은 터지지 않는다) 방이 정리된다', () => {
  const w = stage2();
  toRoom(w, 2);
  drainEvents(w);
  const el = w.enemies.find(m => m.elite), n = w.enemies.filter(m => !m.elite).length;
  assert.ok(n > 0);
  kill(w, el);
  const ev = play(w, 1);
  assert.equal(of(ev, 'roomClear').length, 1);
  assert.equal(w.stage.phase, 'reward');
  assert.equal(w.enemies.filter(m => !m.dead).length, 0);
  assert.equal(of(ev, 'meleeHit').length, 0, '사라지는 자폭병이 터짐');
  assert.equal(w.player.hp, P.hp);
});

test('정예 돌격병은 받아쳐도 최대 체력의 elite.parryShare만 잃는다(두 번에 죽지 않는다)', () => {
  const w = live(), p = w.player, E = RULES.mobs.elite, C = RULES.mobs.charger;
  const m = spawnMob(w, 'charger', p.x + 5, p.z, 0, { elite: true });
  m.nextAt = w.time;
  let got = null;
  for (let k = 0; k < ticks(6) && !got; k++) {
    const close = m.state === 'dash' && Math.hypot(p.x - m.x, p.z - m.z) < m.r + P.bodyR + C.dash * RULES.dt * 3;
    step(w, { ...idle, parry: close });
    got = of(drainEvents(w), 'mobChargeHit')[0] ?? null;
  }
  assert.ok(got && (got.outcome === 'parry' || got.outcome === 'perfect'), `받아치지 못함 ${JSON.stringify(got)}`);
  assert.ok(Math.abs((m.maxHp - m.hp) - m.maxHp * E.parryShare) < 1e-6, `잃은 체력 ${m.maxHp - m.hp} / ${m.maxHp}`);
  assert.ok(E.parryShare < C.parryShare);
  assert.ok(Math.abs(m.r - C.r * E.r) < 1e-9);
});

test('방을 정리한 뒤에는 죽은 자폭병이 터지지 않는다(고르는 동안 맞지 않는다)', () => {
  const w = stage2();
  drainEvents(w);
  const b = w.enemies.find(m => m.kind === 'bomber');
  assert.ok(b);
  put(w, b.x + 0.5, b.z);
  w.player.invulnUntil = -1;
  const ev = [...wipe(w), ...play(w, RULES.mobs.bomber.chain + 0.3)];
  assert.equal(w.stage.phase, 'reward');
  assert.equal(of(ev, 'meleeHit').length, 0, '방을 정리한 뒤 터짐');
  assert.equal(w.player.hp, P.hp);
});

test('스테이지 2의 보스 방에는 용이 나온다 — 체력 가득, 시각 칸은 모두 유한, 방 넘어온 시각부터 숨', () => {
  const w = stage2();
  const ev = toBoss(w), b = w.boss;
  assert.equal(b.kind, 'dragon'); assert.equal(b.away, false);
  assert.ok(Math.abs(b.maxHp - RULES.dragon.hp * RULES.store.bossHp * St.bossHp * (RULES.stage.list[2].bossHp ?? 1)) < 1e-6 && b.hp === b.maxHp, `체력 ${b.hp}/${b.maxHp}`);
  for (const [k, v] of Object.entries(b)) if (typeof v === 'number') assert.ok(!Number.isNaN(v), `보스의 ${k}가 NaN`);
  assert.ok(b.breathUntil >= w.time);
  assert.deepEqual(of(ev, 'roomStart').pop().kind, 'dragon');
  w.player.invulnUntil = 1e9;
  play(w, 3);
  assert.equal(w.result, null);
  for (const [k, v] of Object.entries(b)) if (typeof v === 'number') assert.ok(!Number.isNaN(v), `3초 뒤 보스의 ${k}가 NaN`);
  w.player.stock.bomb = 0; w.player.invulnUntil = -1;
  hurtPlayer(w, 999, 1, 0, 0);
  restartRoom(w);
  assert.equal(w.boss.kind, 'dragon'); assert.equal(w.boss.hp, w.boss.maxHp);
  hurtFoe(w, w.boss, 1e9, 'shot', { raw: true });
  assert.equal(w.result, 'win');
  const w1 = stageWorld();
  toBoss(w1);
  assert.notEqual(w1.boss.kind, 'dragon', '스테이지 1의 보스는 수호자');
});

// ── 한 판의 뼈대 §5: 자폭병 — 받아치면 튕겨 나가 다른 적 곁에서 터진다(사용자 2026-11-17)
const Bm = M.bomber;
// 자폭병을 dx 앞에 세워 심지를 켜게 하고, 터지는 순간에 맞춰 패링을 누른다(lead초 앞서). 돌려주는 것 = 그동안의 사건
function fuse(w, m, lead = 0.04, sec = 3) {
  let pressed = false;
  return play(w, sec, x => {
    const go = !pressed && m.state === 'windup' && x.time >= m.stateAt + Bm.fuse - lead - 1e-9;
    if (go) pressed = true;
    return { ...idle, parry: go };
  });
}

test('자폭병: 살아서 켠 심지 원은 흰색, 죽어서 터지는 원은 빨강', () => {
  const w = live();
  const m = now(w, 'bomber', 1.2, 0);
  play(w, 0.1);
  assert.equal(m.state, 'windup');
  assert.equal(m.area.color, 'white');
  const w2 = live(), d = now(w2, 'bomber', 6, 0);
  d.nextAt = 1e9; d.state = 'held';
  hurtFoe(w2, d, 1e9, 'shot');
  play(w2, 0.05);
  assert.equal(d.area.color, 'red');
});

test('자폭병: 원 안에서 받아치면 터지지 않고 탄 한 칸이 모이며, 튕겨 나간다', () => {
  const w = live(), p = w.player;
  const m = now(w, 'bomber', 1.2, 0);
  const ev = fuse(w, m, 0.04, Bm.fuse + 0.15);
  assert.equal(p.hp, P.hp, '받아쳤는데 맞음');
  assert.equal(p.store.length, 1);
  const b = of(ev, 'bomberBounce');
  assert.equal(b.length, 1); assert.equal(b[0].id, m.id);
  assert.equal(of(ev, 'meleeHit').length, 0, '받아쳤는데 그 자리에서 터짐');
  assert.equal(w.floorAreas.filter(a => a.owner === m.id).length, 0, '심지 원이 남음');
});

test('자폭병: 튕겨 나간 자폭병은 가까운 다른 적에게 날아가 그 곁에서 터진다 — 받아친 피해(reflect)', () => {
  const w = live(), p = w.player;
  const m = now(w, 'bomber', 1.2, 0), s = mob(w, 'totem', 5, 0.5), far = mob(w, 'totem', -1, 6.5);
  s.nextAt = far.nextAt = 1e9; s.state = far.state = 'held';
  const before = w.stats.dmg.reflect;
  const ev = fuse(w, m, RULES.parry.perfect + 0.03, Bm.fuse + 1.2);   // 완벽 창을 지나 받는다(보통 패링)
  assert.equal(of(ev, 'bomberBounce')[0].perfect, false);
  const r = of(ev, 'bomberReturn');
  assert.equal(r.length, 1, '튕겨서 터지지 않음');
  assert.equal(m.dead, true);
  assert.ok(Math.abs((s.maxHp - s.hp) - Bm.mobDmg) < 1e-6, `가까운 적의 피해 ${s.maxHp - s.hp}`);
  assert.equal(far.hp, far.maxHp, '먼 적까지 다침');
  assert.ok(w.stats.dmg.reflect - before >= Bm.mobDmg - 1e-6, '받아친 피해로 적히지 않음');
  assert.ok(Math.hypot(r[0].x - s.x, r[0].z - s.z) <= s.r + m.r + Bm.fly.speed * RULES.dt + 1e-6, `터진 자리가 적 곁이 아님 ${Math.hypot(r[0].x - s.x, r[0].z - s.z)}`);
  assert.equal(r[0].kills, 0);
  assert.equal(p.hp, P.hp);
});

test('자폭병: 튕겨서 터진 폭발은 플레이어를 다치게 하지 않는다. 완벽 패링이면 mobDmg × perfectMul', () => {
  const w = live(), p = w.player;
  const m = now(w, 'bomber', 1.2, 0), s = mob(w, 'totem', 2.4, 0);   // 적이 바로 곁 — 폭발 반지름 안에 플레이어가 있다
  s.nextAt = 1e9; s.state = 'held';
  const ev = fuse(w, m, 0.01, Bm.fuse + 1);
  const b = of(ev, 'bomberBounce')[0];
  assert.ok(b && b.perfect, '완벽 패링이 아님');
  assert.equal(of(ev, 'bomberReturn')[0].perfect, true);
  assert.ok(Math.hypot(p.x - of(ev, 'bomberReturn')[0].x, p.z - of(ev, 'bomberReturn')[0].z) < Bm.R, '플레이어가 폭발 밖에 있다(시험이 뜻이 없다)');
  assert.equal(p.hp, P.hp, '되돌려 보낸 폭발에 맞음');
  assert.ok(Math.abs((s.maxHp - s.hp) - Bm.mobDmg * Bm.fly.perfectMul) < 1e-6, `완벽 피해 ${s.maxHp - s.hp}`);
});

test('자폭병: 다른 적이 없으면 플레이어 반대쪽으로 dist만큼 가서 터진다', () => {
  const w = live(), p = w.player;
  const m = now(w, 'bomber', 1.2, 0);
  const ev = fuse(w, m, 0.04, Bm.fuse + 1);
  const r = of(ev, 'bomberReturn')[0];
  assert.ok(r, '터지지 않음');
  assert.ok(r.x > p.x + 1.2 + Bm.fly.dist - 0.5 && Math.abs(r.z - p.z) < 0.5, `터진 자리 ${r.x}, ${r.z}`);
  assert.equal(m.dead, true);
  assert.equal(w.enemies.filter(e => !e.dead).length, 0);
});

test('자폭병: 회피 중이면 안 맞고 그 자리에서 터진다(튕겨 나가지 않는다)', () => {
  const w = live(), p = w.player;
  const m = now(w, 'bomber', 1.2, 0), s = mob(w, 'totem', 2.4, 1);
  s.nextAt = 1e9; s.state = 'held';
  let rolled = false;
  const ev = play(w, Bm.fuse + 0.4, x => { const go = !rolled && m.state === 'windup' && x.time >= m.stateAt + Bm.fuse - 0.05; if (go) rolled = true; return { ...idle, dodge: go, mz: go ? 1 : 0 }; });
  assert.equal(p.hp, P.hp);
  assert.equal(of(ev, 'bomberBounce').length, 0);
  assert.equal(of(ev, 'meleeHit').length, 1);
  assert.ok(s.hp < s.maxHp, '제자리 폭발이 곁의 적을 다치게 하지 않음');
});

test('자폭병: 날아가는 동안은 겨눠지지도 맞지도 않고, 한 번만 터진다 — 폭발에 죽은 다른 자폭병은 연쇄로 터진다', () => {
  const w = live(), p = w.player;
  const m = now(w, 'bomber', 1.2, 0), s = mob(w, 'totem', 6, 0), b2 = mob(w, 'bomber', 6.2, 1);
  s.nextAt = b2.nextAt = 1e9; s.state = b2.state = 'held';
  let seen = false;
  const ev = [];
  for (let k = 0; k < ticks(Bm.fuse + 2); k++) {
    const go = m.state === 'windup' && w.time >= m.stateAt + Bm.fuse - 0.04 - 1e-9;
    step(w, { ...idle, parry: go });
    ev.push(...drainEvents(w));
    if (m.flying) {
      if (seen) assert.ok(!w.foeList.includes(m), '날아가는 자폭병이 적 목록에 있다');   // 튕겨 난 다음 틱부터(적 목록은 틱 처음에 한 번 짠다)
      seen = true;
      assert.equal(hurtFoe(w, m, 50, 'shot'), 0, '날아가는 자폭병이 다침');
    }
  }
  assert.ok(seen, '날아가는 틱이 없었다');
  assert.equal(of(ev, 'bomberReturn').length, 1);
  assert.equal(b2.dead, true, '곁의 자폭병이 폭발에 죽지 않음');
  assert.equal(of(ev, 'bomberReturn')[0].kills, 1);
  assert.equal(of(ev, 'meleeHit').length, 1, '죽은 자폭병의 연쇄 폭발은 한 번');
  assert.equal(of(ev, 'mobDeath').filter(e => e.id === m.id).length, 1);
});

test('자폭병: 날아가는 중 버티기 방이 끝나면 터지지 않고 사라진다. 날아가는 자폭병만 남으면 터진 뒤 방이 정리된다', () => {
  const w = createWorld({ stage: 1, room: 3 }), p = w.player;
  w.shots.nextAt = 1e9; p.invulnUntil = -1;
  for (const e of w.enemies) e.dead = true;
  w.stage.nextSpawnAt = 1e9;
  const m = spawnMob(w, 'bomber', p.x + 1.2, p.z, 0);
  m.nextAt = w.time;
  let out = false;
  const ev = [];
  for (let k = 0; k < ticks(3) && w.stage.phase === 'fight'; k++) {
    const go = m.state === 'windup' && w.time >= m.stateAt + Bm.fuse - 0.04 - 1e-9;
    step(w, { ...idle, parry: go });
    ev.push(...drainEvents(w));
    if (m.flying && !out) { out = true; w.stage.surviveUntil = w.time; }   // 날아가는 틱에 시간이 다 됐다
  }
  assert.ok(out, '날아가지 않음');
  assert.equal(w.stage.phase, 'reward');
  assert.equal(of(ev, 'bomberReturn').length, 0, '방이 끝났는데 터짐');
  ev.push(...play(w, 1));
  assert.equal(of(ev, 'bomberReturn').length + of(ev, 'meleeHit').length, 0);
  const w2 = createWorld({ stage: 2 });
  w2.shots.nextAt = 1e9;
  for (const e of w2.enemies) e.dead = true;
  w2.stage.wave = 99;
  const b = spawnMob(w2, 'bomber', w2.player.x + 1.2, w2.player.z, 0);
  b.nextAt = w2.time;
  const ev2 = fuse(w2, b, 0.04, Bm.fuse + 1.5);
  assert.equal(of(ev2, 'bomberReturn').length, 1);
  assert.equal(of(ev2, 'roomClear').length, 1, '날아간 자폭병이 터진 뒤 방이 정리되지 않음');
});
