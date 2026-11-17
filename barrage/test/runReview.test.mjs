// 한 판의 뼈대 — 전체 검토(2026-11-17 밤)와 영상 확인에서 나온 것들. 하나에 시험 하나.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { spawnMob, hurtFoe } from '../src/sim/foes.js';
import { storeAdd } from '../src/sim/store.js';
import { kitCards, kitAll } from '../src/sim/cards.js';
import { tryKey, gameTries } from '../src/sim/tries.js';
import { createBot } from '../src/sim/bot.js';
import { recordable } from '../src/view/records.js';
import { idle, ticks } from './helpers.mjs';

const M = RULES.mobs, St = RULES.stage, T = RULES.tries, WR = RULES.weapons, P = RULES.player;
const of = (ev, t) => ev.filter(e => e.type === t);
const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≠ ${b}`);
const play = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, typeof input === 'function' ? input(w, k) : input); ev.push(...drainEvents(w)); } return ev; };
const put = (w, x, z) => { const p = w.player; p.x = p.px = x; p.z = p.pz = z; };
const give = (w, n, perfect = false) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: 12, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const stage = (opts = {}) => { const w = createWorld({ stage: 1, tries: 'always,vary,snipe', ai: false, ...opts }); w.shots.nextAt = 1e9; drainEvents(w); return w; };
const room = (opts = {}) => { const w = createWorld({ store: true, ...opts }); w.boss.away = true; w.shots.nextAt = 1e9; return w; };
const killAll = w => { for (const m of w.enemies) if (!m.dead) { m.bornAt = Math.min(m.bornAt, w.time); hurtFoe(w, m, 1e9, 'shot'); } };
const wipe = w => { const ev = []; for (let g = 0; g < 10 && w.stage.phase === 'fight'; g++) { if (w.stage.surviveUntil != null) w.stage.surviveUntil = w.time; killAll(w); step(w, idle); ev.push(...drainEvents(w)); } return ev; };
const stand = (w, r, sec = St.pickHold + 0.05) => { put(w, r.x, r.z); return play(w, sec); };   // 자리에 올라서서 잠깐 선다
const away = w => { put(w, -8, 0); step(w, idle); drainEvents(w); };

// ── 줍기: 지나가기만 해서는 주워지지 않는다(영상에서 찾음 — 가운데 자리의 보급이 저절로 주워졌다)
test('고르는 자리는 그 위에 pickHold초 서 있어야 주워진다 — 지나가기만 해서는 안 주워진다', () => {
  const w = stage();
  wipe(w); play(w, St.rewardDelay + 0.05);
  const r = w.stage.rewards[1];
  put(w, r.x, r.z);
  play(w, St.pickHold - 0.05);
  assert.equal(w.stage.phase, 'reward', '서자마자 주워짐');
  away(w);
  put(w, r.x, r.z); play(w, St.pickHold * 0.5); away(w);   // 지나가기
  assert.equal(w.stage.phase, 'reward', '지나가기만 했는데 주워짐');
  const ev = stand(w, r);
  assert.equal(w.stage.phase, 'door');
  assert.equal(of(ev, 'rewardPick').length, 1);
  assert.ok(St.pickHold >= 0.2 && St.pickHold <= 0.6);
});

test('방이 정리될 때 밟고 서 있던 자리는 한 번 벗어나야 주워진다', () => {
  const w = stage();
  put(w, St.rewardAt[1][0], St.rewardAt[1][1]);   // 판 가운데(보급 자리)에 서서 방을 끝낸다
  wipe(w);
  play(w, St.rewardDelay + St.pickHold + 1);
  assert.equal(w.stage.phase, 'reward', '서 있기만 했는데 보급이 주워짐');
  away(w);
  stand(w, w.stage.rewards[1]);
  assert.equal(w.stage.phase, 'door');
});

test('봇은 판 가운데에서 방을 끝내도 고르려던 카드를 줍는다(보급을 저절로 줍지 않는다)', () => {
  for (const seed of [3, 5, 8]) {
    const w = createWorld({ seed, stage: 1, tries: gameTries(null) }), bot = createBot('user', seed);
    w.player.invulnUntil = 1e9;
    let pick = null;
    for (let k = 0; k < ticks(30) && !pick; k++) {
      if (w.stage.phase === 'fight') { put(w, 0, 0); for (const m of w.enemies) m.dead = true; }   // 가운데에 선 채 방이 끝난다
      step(w, bot(w));
      pick = of(drainEvents(w), 'rewardPick')[0] ?? null;
    }
    assert.ok(pick, `seed ${seed}: 줍지 못함`);
    assert.equal(pick.kind, 'card', `seed ${seed}: 체력이 가득인데 ${pick.kind}을 주움`);
    assert.equal(w.weapons.on.length, 2);
  }
  // 손대지 않은 판(seed 3): 영상에서 봇이 가운데를 지나다 방패를 집었다
  const w = createWorld({ seed: 3, stage: 1, tries: gameTries(null) }), bot = createBot('user', 3);
  let pick = null;
  for (let k = 0; k < ticks(60) && !pick && !w.result; k++) { step(w, bot(w)); pick = of(drainEvents(w), 'rewardPick')[0] ?? null; }
  assert.ok(pick && pick.kind === 'card', `seed 3: ${pick ? pick.kind + ':' + pick.what : '줍지 못함'}`);
});

// ── 검토 1: 방을 정리한 뒤에도 밀물이 돌았다(예고가 지워진 채 덮쳤다)
test('방을 정리하면 방의 특징도 꺼진다 — 고르는 동안 밀물이 덮치지 않는다', () => {
  const w = createWorld({ stage: 2, room: 4, ai: false }), p = w.player, Ti = T.tide;
  w.shots.nextAt = 1e9; p.invulnUntil = 1e9;
  assert.equal(w.stage.feature, 'tide');
  let warned = false;
  for (let k = 0; k < ticks(Ti.first + 0.5) && !warned; k++) { step(w, idle); warned = drainEvents(w).some(e => e.type === 'tideWarn'); }
  assert.ok(warned, '예고가 뜨지 않음');
  wipe(w);   // 예고가 떠 있는 동안 방을 끝낸다
  assert.equal(w.stage.phase, 'reward');
  p.invulnUntil = -1;
  const hp = p.hp, ev = play(w, Ti.warn + Ti.every + Ti.warn + 1);
  assert.equal(of(ev, 'tideHit').length, 0, '방이 끝났는데 밀물이 덮침');
  assert.equal(of(ev, 'tideWarn').length, 0);
  assert.equal(p.hp, hp);
  assert.equal(w.floorAreas.filter(a => a.kind === 'tide').length, 0);
  assert.equal(w.stage.feature, null);
});

// ── 검토 2: 폭탄이 정예의 체력을 절반씩 깎았다(두 번이면 방이 3초에 끝났다)
test('폭탄은 정예의 체력을 elite.bombShare만큼만 깎는다(여느 몬스터는 bombShare)', () => {
  const w = room({ ai: false }), p = w.player;
  const el = spawnMob(w, 'charger', p.x + 6, p.z, 0, { elite: true }), m = spawnMob(w, 'shooter', p.x + 6, p.z + 3, 0);
  step(w, idle);
  p.stock.bomb = 1;
  step(w, { ...idle, bomb: true });
  near(el.maxHp - el.hp, el.maxHp * M.elite.bombShare, 1e-6, '정예');
  near(m.maxHp - m.hp, m.maxHp * M.bombShare, 1e-6, '여느 몬스터');
  assert.ok(M.elite.bombShare <= 0.1, '폭탄 두세 번에 정예 방이 끝난다');
});

// ── 검토 3: 정예 돌격병이 그려진 흰 줄 밖에서 맞혔다(몸은 1.5배인데 줄은 그대로였다)
test('정예 돌격병의 돌진 줄은 몸만큼 넓다', () => {
  const w = room(), p = w.player;
  const el = spawnMob(w, 'charger', p.x + 5, p.z, 0, { elite: true });
  el.nextAt = w.time;
  for (let k = 0; k < ticks(2) && el.state !== 'windup'; k++) step(w, idle);
  assert.equal(el.state, 'windup');
  near(el.area.width, M.charger.width * M.elite.r);
  assert.ok(el.area.width / 2 >= el.r, '줄이 몸보다 좁다');
});

// ── 검토 4: 이동기 첫 칸을 바꾸면 남은 카드가 L에서 K로 말없이 옮겨 갔다
test('바꿔 끼우면 새 카드는 버린 카드의 칸에 들어간다 — 남은 카드의 키가 바뀌지 않는다', () => {
  const w = stage({ kit: ['missile', 'dash', 'sky'] });
  assert.equal(tryKey(w, 'sky'), 'move2');
  wipe(w); play(w, St.rewardDelay + 0.05);
  w.stage.rewards[2].what = 'swap';
  stand(w, w.stage.rewards[2]);
  assert.equal(w.stage.phase, 'replace');
  const held = w.stage.rewards.find(r => r.kind === 'held' && r.what === 'dash');
  away(w);
  const ev = stand(w, held);
  assert.equal(w.stage.phase, 'door');
  assert.deepEqual(kitCards(w, 'move'), ['swap', 'sky']);
  assert.equal(tryKey(w, 'sky'), 'move2', '남은 갈고리의 키가 바뀜');
  assert.equal(tryKey(w, 'swap'), 'move1');
  const g = of(ev, 'cardGain')[0];
  assert.deepEqual([g.id, g.slot, g.key], ['swap', 0, 'K']);
});

// ── 검토 5: 늘 나가는 사격은 평타처럼 기둥에 막힌다(설계 §7) — 한 방만 기둥을 지난다
test('늘 나가는 무기는 기둥에 막히고, 한 방은 기둥을 지난다', () => {
  const [cx, cz] = T.pillars.at[0], behind = (tries, gear) => {
    const w = room({ ai: false, tries, gear });
    put(w, cx - 3, cz);
    const m = spawnMob(w, 'totem', cx + 3, cz, 0); m.hp = m.maxHp = 1e6;
    for (const g of Object.keys(w.weapons.next)) w.weapons.next[g] = 0;
    return { w, m };
  };
  for (const gear of ['beam', 'burst', 'drone']) {
    const a = behind('always,pillars', gear), b = behind('always', gear);
    play(a.w, 4); play(b.w, 4);
    assert.ok(b.m.hp < b.m.maxHp, `${gear}: 기둥이 없는데 안 맞음(시험이 뜻이 없다)`);
    assert.equal(a.m.hp, a.m.maxHp, `${gear}: 기둥 뒤의 적이 맞음`);
  }
  const s = behind('always,pillars', 'beam');
  s.w.weapons.next.beam = 1e9;
  give(s.w, 2); step(s.w, idle); drainEvents(s.w);
  play(s.w, 1 / 120 + 1e-9, { ...idle, throw: true }); play(s.w, 2);
  assert.ok(s.w.stats.dmg.salvo > 0, '한 방이 기둥에 막힘');
});

// ── 검토 6: 자폭병이 저희끼리 낸 피해가 무기 몫으로 적혀 스테이지 2의 무기 몫이 부풀었다
test('자폭병이 터져 다른 몬스터에게 낸 피해는 무기 몫이 아니다(mob으로 적는다)', () => {
  const w = room(), p = w.player, Bm = M.bomber;
  const b = spawnMob(w, 'bomber', p.x + 1.2, p.z, 0), t = spawnMob(w, 'totem', p.x + 2.4, p.z, 0);
  b.nextAt = w.time; p.invulnUntil = 1e9;
  play(w, Bm.fuse + 0.5);
  assert.ok(t.hp < t.maxHp, '곁의 몬스터가 다치지 않음');
  assert.equal(w.stats.dmg.weapon, 0, '무기 몫으로 적힘');
  assert.ok(w.stats.dmg.mob >= Bm.mobDmg - 1e-6);
});

// ── 받아친 자폭병: 정예에게는 체력의 몫으로(체력 30배짜리에게 220은 티가 안 난다 — 정예에게 던져 넣는 그림이 서지 않는다)
test('튕겨 보낸 자폭병은 정예의 체력을 elite.returnShare만큼 깎는다', () => {
  const w = room(), p = w.player, Bm = M.bomber;
  const el = spawnMob(w, 'charger', p.x + 4.5, p.z, 0, { elite: true });
  el.nextAt = 1e9; el.state = 'held';
  const b = spawnMob(w, 'bomber', p.x + 1.2, p.z, 0);
  b.nextAt = w.time;
  let pressed = false;
  const ev = play(w, Bm.fuse + 1.2, x => { const go = !pressed && b.state === 'windup' && x.time >= b.stateAt + Bm.fuse - RULES.parry.perfect - 0.03; if (go) pressed = true; return { ...idle, parry: go }; });
  assert.equal(of(ev, 'bomberReturn').length, 1);
  near(el.maxHp - el.hp, el.maxHp * M.elite.returnShare, 1e-6, '정예가 잃은 체력');
  assert.ok(el.maxHp * M.elite.returnShare > Bm.mobDmg);
});

// ── 구제 창(폭탄을 쥔 채 체력 0): 자폭병이 죽지 못해 틱마다 다시 터졌다
test('자폭병의 폭발에 체력이 0이 되어도(구제 창) 폭발은 한 번뿐이다', () => {
  const w = room(), p = w.player, Bm = M.bomber;
  p.hp = 10; p.stock.bomb = 1;
  const b = spawnMob(w, 'bomber', p.x + 1.2, p.z, 0);
  b.nextAt = w.time;
  const ev = play(w, Bm.fuse + RULES.bomb.rescue + 0.5);
  assert.equal(of(ev, 'meleeHit').length, 1, `폭발 ${of(ev, 'meleeHit').length}번`);
});

// ── 등급의 시간: 카드를 고르며 망설인 시간은 세지 않는다(망설여지는 것이 목표인데 시계가 재촉하면 안 된다)
test('싸운 시간(playSec)만 센다 — 고르는 동안은 흐르지 않는다', () => {
  const w = stage();
  play(w, 2);
  near(w.stage.playSec, 2, 0.02, '싸운 시간');
  wipe(w);
  const at = w.stage.playSec;
  play(w, 5);
  near(w.stage.playSec, at, 1e-9, '고르는 동안 시간이 흐름');
  stand(w, w.stage.rewards[1]);
  put(w, RULES.board.hx - P.bodyR, 0); step(w, idle);
  assert.equal(w.stage.room, 1);
  play(w, 1);
  near(w.stage.playSec, at + 1, 0.05, '다음 방에서 다시 흐른다');
});

// ── 봇: 탄 칸 카드를 끼면 다섯 칸을 채운 뒤 던진다
test('봇은 탄 칸 +1을 끼면 네 칸에서 던지지 않고 다섯 칸을 채운다', () => {
  const mk = n => {
    const w = stage({ kit: ['missile', 'cap'] }), bot = createBot('1', 1);
    play(w, M.appear + 0.2);
    give(w, n);
    let used = false;
    for (let k = 0; k < ticks(0.5) && !used; k++) { const i = bot(w); used = !!i.throw || !!i.hold; step(w, { ...i, mx: 0, mz: 0, throw: false, hold: false }); }
    return used;
  };
  assert.equal(mk(4), false, '네 칸(가득이 아님)에서 던짐');
  assert.equal(mk(5), true, '다섯 칸을 채우고도 던지지 않음');
});

test('기록이 남는 판: 시점·탄 높이 같은 화면 옵션은 붙어도 된다', () => {
  const q = s => new URLSearchParams(s);
  assert.equal(recordable(q('stage=1&pitch=60&bh=0.9')), true);
  assert.equal(recordable(q('stage=1&speed=2')), false);
  assert.ok(kitAll(stage()).length === 1);
});
