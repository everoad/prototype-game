// Task 11: 시범 봇 — 숙련 패링, 0.2초 반응, walk는 누르지 않음, 같은 seed = 같은 판.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { spawnBullet } from '../src/sim/bullets.js';
import { createBot } from '../src/sim/bot.js';
import { quietWorld, ticks } from './helpers.mjs';
import { makeRng } from '../src/sim/rng.js';

test('숙련 봇은 홀로 오는 흰 탄을 패링한다', () => {
  const w = quietWorld(); const p = w.player;
  w.boss.x = p.x + 9;                      // 봇이 머무는 거리(8~10 U) — 거리 맞추려 걷지 않게
  const bot = createBot('1', 1);
  for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));   // 반응 지연만큼 판을 먼저 본다
  drainEvents(w);
  spawnBullet(w, K.WHITE, p.x, p.z + 7, -Math.PI / 2, 14);
  const ev = [];
  for (let k = 0; k < ticks(1.2); k++) { step(w, bot(w)); ev.push(...drainEvents(w)); }
  assert.equal(ev.filter(e => e.type === 'parry').length, 1);
  assert.equal(ev.filter(e => e.type === 'hurt').length, 0);
});

test('0.2초 전에 생긴 탄에는 아직 반응하지 않는다', () => {
  const a = quietWorld(), b = quietWorld();
  const botA = createBot('1', 1), botB = createBot('1', 1);
  for (let k = 0; k < ticks(0.5); k++) { step(a, botA(a)); step(b, botB(b)); }
  // b에만 플레이어 옆으로 날아오는 탄
  spawnBullet(b, K.NORMAL, b.player.x - 3, b.player.z, 0, 10);
  for (let k = 0; k < ticks(0.1); k++) {
    const ia = botA(a), ib = botB(b);
    assert.deepEqual(ib, ia, `${k}틱째 반응함`);
    step(a, ia); step(b, ib);
  }
});

test('walk 봇은 패링·회피를 누르지 않는다', () => {
  const w = createWorld({ seed: 2 }); const bot = createBot('walk', 2);
  for (let k = 0; k < ticks(30) && !w.result; k++) {
    const i = bot(w);
    assert.equal(i.parry, false); assert.equal(i.dodge, false);
    step(w, i);
  }
});

test('turtle 봇은 움직이지 않는다', () => {
  const w = createWorld({ seed: 2 }); const bot = createBot('turtle', 2);
  for (let k = 0; k < ticks(10) && !w.result; k++) { const i = bot(w); assert.equal(i.mx, 0); assert.equal(i.mz, 0); step(w, i); }
});

test('같은 seed면 봇 판도 같다', () => {
  const runOnce = () => { const w = createWorld({ seed: 5 }); const bot = createBot('1', 5); for (let k = 0; k < ticks(60) && !w.result; k++) step(w, bot(w)); return stateHash(w); };
  assert.equal(runOnce(), runOnce());
});

test('숙련 봇은 가만히 있는 것보다 오래 버틴다', () => {
  const life = kind => {
    const w = createWorld({ seed: 4 }); const bot = kind ? createBot(kind, 4) : () => ({ mx: 0, mz: 0, parry: false, dodge: false });
    let k = 0; for (; k < ticks(90) && !w.result; k++) step(w, bot(w));
    return { t: k * RULES.dt, hits: w.stats.hits, parries: w.stats.parries };
  };
  const still = life(null), skilled = life('1');
  assert.ok(skilled.hits < still.hits || skilled.t > still.t * 1.5, `가만히 ${JSON.stringify(still)} 숙련 ${JSON.stringify(skilled)}`);
  assert.ok(skilled.parries > 3, `패링 ${skilled.parries}`);
});

// ── 원거리 재설계 Task 6: 봇이 장판 공격·레이저를 본다(두뇌 없이 공격 하나씩)
import { startSlam, startWave, startSword, updateFloor } from '../src/sim/floor.js';
import { startLaser } from '../src/sim/beams.js';

function face(start, kind = '1', setup = null, sec = 3.5) {
  const w = quietWorld(); w.boss.x = w.player.x + 9; setup?.(w);
  const bot = createBot(kind, 1);
  for (let k = 0; k < ticks(0.3); k++) step(w, bot(w));   // 반응 지연만큼 판을 먼저 본다
  drainEvents(w);
  start(w);
  const ev = []; let done = false;
  for (let k = 0; k < ticks(sec); k++) { if (!done) done = updateFloor(w); step(w, bot(w)); ev.push(...drainEvents(w)); }
  return { w, ev };
}
const hurtBy = (ev, src) => ev.filter(e => e.type === 'hurt' && e.src === src).length;

test('숙련 봇은 흰 파도를 패링한다', () => {
  const { ev } = face(w => startWave(w, 'white'));
  const h = ev.find(e => e.type === 'waveHit');
  assert.ok(h && (h.outcome === 'parry' || h.outcome === 'perfect'), JSON.stringify(h));
});

test('숙련 봇은 빨간 파도를 구르기로 넘긴다', () => {
  const { ev } = face(w => startWave(w, 'red'));
  assert.equal(ev.find(e => e.type === 'waveHit')?.outcome, 'roll');
  assert.equal(hurtBy(ev, RULES.src.wave), 0);
});

test('숙련 봇은 빨간 박치기 줄에서 비켜난다', () => {
  const { ev } = face(w => startSlam(w, 'red'));
  assert.equal(hurtBy(ev, RULES.src.slam), 0);
});

test('숙련 봇은 흰 박치기를 패링한다', () => {
  const { ev } = face(w => startSlam(w, 'white'));
  const h = ev.find(e => e.type === 'slamHit');
  assert.ok(h && (h.outcome === 'parry' || h.outcome === 'perfect'), JSON.stringify(h));
});

test('숙련 봇은 빨간 검기를 맞지 않는다', () => {
  const { ev } = face(w => startSword(w, 'red'));
  assert.equal(hurtBy(ev, RULES.src.sword), 0);
});

test('숙련 봇은 레이저를 맞지 않는다', () => {
  let n = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const { ev } = face(w => { w.rng = makeRng(seed); startLaser(w, null); }, '1', null, 2);
    n += hurtBy(ev, RULES.src.laser);
  }
  assert.equal(n, 0);
});

test('패링하는 봇은 스킬 게이지가 차면 무기 스킬을 쓴다', () => {
  const w = createWorld({ seed: 1, gear: 'all' }); w.player.invulnUntil = 1e9; w.boss.hp = w.boss.maxHp = 1e9;
  const bot = createBot('1', 1);
  let skills = 0;
  for (let k = 0; k < ticks(60); k++) { step(w, bot(w)); skills += drainEvents(w).filter(e => e.type === 'weaponSkill').length; }
  assert.ok(skills >= 2, `스킬 ${skills}번`);
});

// ── 용(설계 용 §9): 봇이 꼬리·날갯짓을 보고, 용 판에선 옆·뒤로도 돌아간다
import { startTail, startWing } from '../src/sim/floor.js';
import { zoneOf } from '../src/sim/dragonBody.js';

// 용 하나(두뇌 없이), 플레이어를 용 기준 (deg, d)에 두고 공격 하나
function dragonFace(start, deg, d, kind = '1', sec = 2) {
  const w = createWorld({ ai: false, boss: 'dragon' });
  w.boss.x = w.boss.px = 2; w.boss.z = w.boss.pz = 0; w.boss.face = 0;
  const put = () => { const a = deg * Math.PI / 180; w.player.x = w.player.px = 2 + Math.cos(a) * d; w.player.z = w.player.pz = Math.sin(a) * d; };
  put();
  const bot = createBot(kind, 1);
  for (let k = 0; k < ticks(0.3); k++) { step(w, bot(w)); put(); }
  drainEvents(w);
  start(w);
  const ev = []; let done = false;
  for (let k = 0; k < ticks(sec); k++) { if (!done) done = updateFloor(w); step(w, bot(w)); ev.push(...drainEvents(w)); }
  return { w, ev };
}

test('숙련 봇은 흰 꼬리를 패링한다', () => {
  const { w, ev } = dragonFace(w => startTail(w, 'white'), 180, 4);
  assert.equal(hurtBy(ev, RULES.src.tail), 0);
  assert.ok(w.stats.parries >= 1, `패링 ${w.stats.parries}`);
});

test('숙련 봇은 빨간 날갯짓을 구르기로 넘긴다', () => {
  const { ev } = dragonFace(w => startWing(w, 'red', 1), 90, 4);
  assert.equal(ev.find(e => e.type === 'waveHit')?.outcome, 'roll');
  assert.equal(hurtBy(ev, RULES.src.wing), 0);
});

test('숙련 봇은 날갯짓 반원 밖에선 구르지 않는다', () => {
  const { ev } = dragonFace(w => startWing(w, 'red', 1), -90, 4);
  assert.equal(ev.filter(e => e.type === 'dodge').length, 0);
});

test('용 판 60초에 봇이 옆·뒤에 8% 넘게 머묾', () => {
  let side = 0, all = 0;
  for (const seed of [1, 2]) {
    const w = createWorld({ seed, boss: 'dragon' }), bot = createBot('1', seed);
    w.player.hp = w.player.maxHp = 1e9;
    for (let k = 0; k < ticks(60) && !w.result; k++) { step(w, bot(w)); drainEvents(w); all++; if (zoneOf(w) !== 'front') side++; }
  }
  assert.ok(side / all > 0.08, `옆·뒤 ${(side / all * 100).toFixed(0)}%`);
});

// ── 모아 던지기(§4.11): 봇이 던진다 · 사용자 판에 맞춘 봇 user
import { storeAdd } from '../src/sim/store.js';
const stocked = (n, hp) => {
  const w = createWorld({ ai: false, store: true });
  for (let k = 0; k < n; k++) storeAdd(w, { perfect: true, gold: false, stagger: 14, x: 0, z: 0, kind: 'bullet' });
  if (hp != null) w.player.hp = hp;
  return w;
};

test('모아 던지기 판: 패링하는 봇은 가득이면, 또는 회복이 버려지지 않을 만큼 깎였으면 던진다', () => {
  const bot = () => createBot('1', 1);
  assert.equal(bot()(stocked(RULES.store.cap)).throw, true, '가득인데 안 던짐');
  assert.equal(bot()(stocked(2)).throw, false, '체력이 꽉 찼는데 던짐');
  assert.equal(bot()(stocked(2, RULES.player.hp - 2 * RULES.store.heal[1])).throw, true, '깎였는데 안 던짐');
  assert.equal(bot()(stocked(0, 10)).throw, false);
  const plain = createWorld({ ai: false });
  assert.ok(!createBot('1', 1)(plain).throw, '기본 판에서 던짐');
  assert.ok(!createBot('walk', 1)(stocked(RULES.store.cap)).throw, '패링 안 하는 봇이 던짐');
  const auto = stocked(RULES.store.cap); auto.player.auto = { stage: 'back', start: 0, awayBase: 0, buffered: null }; auto.player.autoUntil = 1;
  assert.ok(!createBot('1', 1)(auto).throw, '자동 반격 중에 누름(못 던지는데 틱 소리만 난다)');
  const dying = stocked(RULES.store.cap); dying.player.dyingAt = 1;
  assert.ok(!createBot('1', 1)(dying).throw, '구제 창에서 누름');
});

test('user 봇은 숙련 봇보다 많이 맞는다(사람 손에 맞춘 잣대)', () => {
  const play = kind => {
    let hits = 0, parries = 0;
    for (const seed of [1, 2, 3]) {
      const w = createWorld({ seed, gear: 'all' }), bot = createBot(kind, seed);
      w.player.hp = 1e9; w.boss.hp = w.boss.maxHp = 1e9;
      for (let k = 0; k < ticks(60); k++) { step(w, bot(w)); drainEvents(w); }
      hits += w.stats.hits; parries += w.stats.parries;
    }
    return { hits, parries };
  };
  const u = play('user'), s = play('1');
  assert.ok(u.hits > s.hits + 5, `맞음 user ${u.hits} 숙련 ${s.hits}`);
  assert.ok(u.parries >= 24, `user 패링 ${u.parries}(3판)`);
});

// 스테이지(Task 5): 방에서의 봇
test('스테이지: 봇이 방 1을 깨고 보상을 주워 문으로 다음 방에 간다', async () => {
  const w = createWorld({ stage: 1, seed: 2 }), bot = createBot('1', 2);
  w.player.invulnUntil = 1e9;   // 방 흐름만 본다
  for (let k = 0; k < ticks(150) && w.stage.room === 0 && !w.result; k++) { step(w, bot(w)); drainEvents(w); }
  assert.equal(w.result, null);
  assert.equal(w.stage.room, 1, `방 1에 머묾(단계 ${w.stage.phase}, 남은 적 ${w.enemies.filter(m => !m.dead).length})`);
});

test('스테이지: 걷기만 하는 봇도 포격 원에서 걸어 나온다', async () => {
  const { spawnMob } = await import('../src/sim/foes.js');
  const w = createWorld({ store: true, seed: 3 }), bot = createBot('walk', 3);
  w.boss.away = true; w.shots.nextAt = 1e9;
  spawnMob(w, 'mortar', 5, 0, 0);
  let shells = 0;
  for (let k = 0; k < ticks(16); k++) { step(w, bot(w)); for (const e of drainEvents(w)) if (e.type === 'mobFire') shells++; }
  assert.ok(shells >= 6, `포탄 ${shells}`);
  assert.equal(w.stats.hitsByPattern[RULES.src.mortar] ?? 0, 0);
});

test('스테이지: 패링하는 봇은 돌격병의 몸을 받아치고, 패링 안 하는 봇은 줄에서 비킨다', async () => {
  const { spawnMob } = await import('../src/sim/foes.js');
  const room = kind => { const w = createWorld({ store: true, seed: 4 }), bot = createBot(kind, 4); w.boss.away = true; w.shots.nextAt = 1e9; const m = spawnMob(w, 'charger', 3, 0, 0); return { w, bot, m }; };
  const a = room('1');
  for (let k = 0; k < ticks(12) && !a.m.dead; k++) { step(a.w, a.bot(a.w)); drainEvents(a.w); }
  assert.ok(a.m.dead || a.m.hp <= a.m.maxHp * 0.5, `돌격병 체력 ${a.m.hp}`);
  assert.equal(a.w.stats.hitsByPattern[RULES.src.charger] ?? 0, 0);
  const b = room('dodge');
  let dashes = 0;
  for (let k = 0; k < ticks(14); k++) { step(b.w, b.bot(b.w)); for (const e of drainEvents(b.w)) if (e.type === 'mobDash') dashes++; }
  assert.ok(dashes >= 3, `돌진 ${dashes}`);
  assert.ok((b.w.stats.hitsByPattern[RULES.src.charger] ?? 0) <= 1, `맞음 ${b.w.stats.hitsByPattern[RULES.src.charger]}`);
});

// 한 판의 뼈대 §5: 자폭병의 흰 심지 원은 받아칠 것이다
test('봇이 자폭병의 흰 원을 받아친다(튕겨 보낸다)', async () => {
  const { spawnMob } = await import('../src/sim/foes.js');
  let bounced = 0, games = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const w = createWorld({ seed, store: true });
    w.boss.away = true; w.shots.nextAt = 1e9;
    const bot = createBot('1', seed);
    const m = spawnMob(w, 'bomber', w.player.x + 4, w.player.z, 0);
    m.nextAt = w.time;
    games++;
    for (let k = 0; k < Math.round(4 / RULES.dt); k++) { step(w, bot(w)); if (drainEvents(w).some(e => e.type === 'bomberBounce')) { bounced++; break; } }
  }
  assert.ok(bounced >= games - 1, `받아친 판 ${bounced}/${games}`);
});

// ── 한 판의 뼈대 §9: 봇의 카드 고르기(기준 판 = 무기 → 탄 기술 → 이동기 → 몸, 체력이 80% 아래면 보급)
// 방을 비우고(몬스터를 다 지운다) 봇이 줍고 문으로 갈 때까지 돌린다. 돌려주는 것 = 주운 것(rewardPick 사건)
async function pickWith(w, bot, sec = 25) {
  const { CARDS } = await import('../src/sim/cards.js');
  const room = w.stage.room, picks = [];
  for (let k = 0; k < Math.round(sec / RULES.dt) && w.stage.room === room && w.stage.phase !== 'boss'; k++) {
    if (w.stage.phase === 'fight') { if (w.stage.surviveUntil != null) w.stage.surviveUntil = w.time; for (const m of w.enemies) m.dead = true; }
    step(w, bot(w));
    for (const e of drainEvents(w)) if (e.type === 'rewardPick') picks.push(e);
  }
  return { picks, CARDS };
}
const stageOf = (opts = {}) => createWorld({ stage: 1, tries: 'always,vary,snipe', ...opts });

test('봇은 방 1 뒤에 무기 카드를 줍고, 그 뒤로 탄 기술 → 이동기 → 몸 차례를 따른다(없으면 다음 차례)', async () => {
  const { kitAll } = await import('../src/sim/cards.js');
  for (const seed of [1, 2, 3]) {
    const w = stageOf({ seed }), bot = createBot('user', seed);
    w.player.invulnUntil = 1e9;
    const got = [];
    for (let r = 0; r < 4; r++) { const { picks, CARDS } = await pickWith(w, bot); assert.equal(picks.length, 1, `seed ${seed} 방 ${r + 1}에서 줍지 못함`); got.push(picks[0].kind === 'card' ? CARDS[picks[0].what].group : 'supply'); }
    assert.equal(got[0], 'weapon', `seed ${seed}: 방 1 뒤 ${got[0]}`);
    assert.equal(w.weapons.on.length, 2);
    assert.ok(got.slice(1).every(g => g !== 'weapon'), `seed ${seed}: 무기 칸이 찼는데 무기를 고름 ${got}`);
    assert.equal(new Set(got.filter(g => g !== 'supply')).size, got.filter(g => g !== 'supply').length, `seed ${seed}: 같은 갈래를 두 번 ${got}`);
    assert.ok(kitAll(w).length >= 3, `seed ${seed}: 낀 것 ${kitAll(w)}`);
    assert.equal(w.stage.phase, 'boss');
  }
});

test('봇은 체력이 80% 아래면 보급을 줍는다', async () => {
  const w = stageOf({ seed: 4 }), bot = createBot('user', 4);
  w.player.hp = RULES.player.hp * 0.5; w.player.invulnUntil = 1e9;
  const { picks } = await pickWith(w, bot);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].kind, 'heal');
});

test('봇의 picks: 갈래 차례를 바꾸거나 카드 이름을 적을 수 있다 — 적은 카드는 칸이 차 있으면 첫 칸을 버리고 낀다', async () => {
  const w = stageOf({ seed: 5 }), bot = createBot('user', 5, { picks: ['body', 'move'] });
  w.player.invulnUntil = 1e9;
  const a = await pickWith(w, bot);
  assert.notEqual(a.picks[0].kind === 'card' ? a.CARDS[a.picks[0].what].group : 'supply', 'weapon', 'picks에 없는 무기를 고름');
  const w2 = stageOf({ seed: 6, kit: ['missile', 'burst'] });
  w2.player.invulnUntil = 1e9;
  for (let k = 0; k < 10 && w2.stage.phase === 'fight'; k++) { for (const m of w2.enemies) m.dead = true; step(w2, { mx: 0, mz: 0, parry: false, dodge: false }); }
  const want = w2.stage.rewards[0].what;   // 방 1 뒤의 첫 카드는 무기 — 칸은 이미 찼다
  const bot2 = createBot('user', 6, { picks: [want] });
  const b = await pickWith(w2, bot2);
  assert.equal(b.picks.length, 1);
  assert.equal(b.picks[0].what, want);
  assert.equal(b.picks[0].dropped, 'missile', '첫 칸을 버리지 않음');
  assert.deepEqual([...w2.weapons.on].sort(), ['burst', want].sort());
});

test('갈래로 고를 때 칸이 찬 갈래는 건너뛴다 — 바꿔 끼우기에 들어가지 않고 문이 열린다', async () => {
  const w = stageOf({ seed: 7, kit: ['missile', 'burst'] }), bot = createBot('user', 7, { picks: ['weapon'] });
  w.player.invulnUntil = 1e9;
  let replaced = false;
  const room = w.stage.room;
  for (let k = 0; k < Math.round(25 / RULES.dt) && w.stage.room === room; k++) {
    if (w.stage.phase === 'fight') for (const m of w.enemies) m.dead = true;
    step(w, bot(w));
    if (w.stage.phase === 'replace') replaced = true;
    drainEvents(w);
  }
  assert.equal(replaced, false);
  assert.equal(w.stage.room, room + 1, '문으로 가지 못함');
  assert.deepEqual(w.weapons.on, ['missile', 'burst']);
});

test('봇이 낀 갈고리를 K(이동기 칸)로 쓴다', () => {
  let used = 0;
  for (let seed = 1; seed <= 3 && !used; seed++) {
    const w = stageOf({ seed, kit: ['missile', 'sky'] }), bot = createBot('user', seed);
    for (let k = 0; k < Math.round(40 / RULES.dt) && !w.result && !used; k++) {
      const input = bot(w);
      step(w, input);
      if (drainEvents(w).some(e => e.type === 'ropeStart')) { used++; assert.equal(input.move1, true, '줄이 걸린 틱에 K를 누르지 않음'); }
    }
  }
  assert.ok(used > 0, '40초 동안 갈고리를 한 번도 쓰지 않음');
});

test('봇의 greedy: 체력이 낮아도 보급 대신 차례대로 카드를 줍는다(조합을 재는 도구용)', async () => {
  const w = stageOf({ seed: 4 }), bot = createBot('user', 4, { greedy: true });
  w.player.hp = RULES.player.hp * 0.5; w.player.invulnUntil = 1e9;
  const { picks } = await pickWith(w, bot);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].kind, 'card');
});

// 한 판의 뼈대 §9: 무기의 차이 — 산탄을 든 봇은 붙어 싸운다(붙을수록 센 무기라서)
test('산탄을 든 봇은 미사일을 든 봇보다 가까이 선다', () => {
  const dist = kit => {
    const all = [];
    for (const seed of [1, 2, 3]) {
      const w = stageOf({ seed, kit }), bot = createBot('user', seed);
      w.player.invulnUntil = 1e9;
      for (let k = 0; k < Math.round(14 / RULES.dt) && w.stage.phase === 'fight'; k++) { step(w, bot(w)); drainEvents(w); if (k % 12 === 0 && w.aim && !w.aim.dead) all.push(Math.hypot(w.aim.x - w.player.x, w.aim.z - w.player.z)); }
    }
    all.sort((a, b) => a - b);
    return all[Math.floor(all.length / 2)];
  };
  const burst = dist(['burst']), missile = dist(['missile']);
  assert.ok(burst < missile - 1, `산탄 ${burst.toFixed(2)} U · 미사일 ${missile.toFixed(2)} U`);
  assert.ok(burst <= RULES.bot.room.keepBurst[1] + 0.8, `산탄을 든 봇의 거리 ${burst.toFixed(2)}`);
});
