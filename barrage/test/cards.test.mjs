// 카드와 칸(한 판의 뼈대 설계 §6): 낀 것(kit) — 무기 2 · 탄 기술 1 · 이동기 2 · 몸. 카드의 효과는 실험 틀을 판 중에 켜고 끄는 것으로 낸다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { CARDS, GROUPS, giveCard, dropCard, kitCards, kitAll, kitFull, kitSnapshot, kitRestore, drawPicks } from '../src/sim/cards.js';
import { setTry, tryKey } from '../src/sim/tries.js';
import { storeAdd } from '../src/sim/store.js';
import { createPlayer } from '../src/sim/player.js';
import { idle } from './helpers.mjs';

const of = (ev, type) => ev.filter(e => e.type === type);
const stage = (opts = {}) => { const w = createWorld({ stage: 1, tries: 'always,vary,snipe', ai: false, ...opts }); drainEvents(w); return w; };
const orb = w => storeAdd(w, { perfect: false, gold: false, stagger: 12, x: w.player.x, z: w.player.z, kind: 'bullet' });

test('카드 13장이 네 갈래에 있다', () => {
  const n = {};
  for (const c of Object.values(CARDS)) n[c.group] = (n[c.group] || 0) + 1;
  assert.deepEqual(n, { weapon: 4, orb: 3, move: 3, body: 3 });
  assert.deepEqual(GROUPS, ['weapon', 'orb', 'move', 'body']);
  assert.ok(Number.isFinite(RULES.cards.slots.weapon) && Number.isFinite(RULES.cards.supplyBelow));
});

test('스테이지는 미사일 하나를 들고 시작한다 — 낀 것이 없는 판은 kit이 없다', () => {
  const w = stage();
  assert.deepEqual(kitCards(w, 'weapon'), ['missile']);
  assert.deepEqual(kitAll(w), ['missile']);
  assert.equal(createWorld().kit ?? null, null);
  assert.equal(createWorld({ tries: 'always' }).kit ?? null, null, '보스전에는 kit이 없다');
});

test('무기는 둘까지 — 셋째는 끼워지지 않고 아무것도 바뀌지 않는다', () => {
  const w = stage();
  assert.equal(giveCard(w, 'burst'), true);
  assert.equal(kitFull(w, 'weapon'), true);
  const ev = drainEvents(w);
  assert.equal(of(ev, 'cardGain').length, 1);
  assert.equal(of(ev, 'cardGain')[0].group, 'weapon');
  assert.equal(giveCard(w, 'beam'), false);
  assert.deepEqual(w.weapons.on, ['missile', 'burst']);
  assert.equal(of(drainEvents(w), 'cardGain').length, 0);
});

test('탄 기술 카드는 그 실험을 켜고, 빼면 끈다. 탄 기술은 한 칸', () => {
  const w = stage();
  assert.equal(giveCard(w, 'lance'), true);
  assert.equal(w.tries.on.lance, true);
  assert.ok(w.tries.lanceLast, '꿰뚫는 던지기의 상태가 없다');
  assert.equal(kitFull(w, 'orb'), true);
  assert.equal(giveCard(w, 'orbit'), false);
  assert.ok(!w.tries.on.orbit);
  dropCard(w, 'lance');
  assert.ok(!w.tries.on.lance);
  assert.equal(w.tries.lanceLast, null);
  assert.deepEqual(kitCards(w, 'orb'), []);
  assert.equal(of(drainEvents(w), 'cardDrop').length, 1);
});

test('갈고리를 끼면 말뚝이 서고 빼면 사라진다(끌려가던 줄도 놓는다)', () => {
  const w = stage();
  assert.equal(w.tries.anchors.length, 0);
  giveCard(w, 'sky');
  assert.equal(w.tries.anchors.length, RULES.tries.rope.anchors.length);
  step(w, { ...idle, mx: 1, move1: true });
  assert.ok(w.tries.rope.to, '줄이 안 걸림');
  dropCard(w, 'sky');
  assert.equal(w.tries.anchors.length, 0);
  assert.equal(w.tries.rope.to, null);
});

test('이동기는 얻은 차례대로 K, L — 키 없는 카드도 칸을 차지한다', () => {
  const w = stage();
  giveCard(w, 'dash');
  assert.equal(of(drainEvents(w), 'cardGain')[0].key, null);
  giveCard(w, 'sky');
  const g = of(drainEvents(w), 'cardGain')[0];
  assert.equal(g.key, 'L'); assert.equal(g.slot, 1);
  assert.equal(tryKey(w, 'sky'), 'move2');
  assert.equal(kitFull(w, 'move'), true);
  assert.equal(giveCard(w, 'swap'), false);
  const w2 = stage();
  giveCard(w2, 'swap');
  assert.equal(of(drainEvents(w2), 'cardGain')[0].key, 'K');
  giveCard(w2, 'sky');
  assert.equal(tryKey(w2, 'swap'), 'move1'); assert.equal(tryKey(w2, 'sky'), 'move2');
  const w3 = stage();
  giveCard(w3, 'mine');
  assert.equal(of(drainEvents(w3), 'cardGain')[0].key, 'O');
});

test('탄 칸 +1: 다섯 칸까지 모인다', () => {
  const w = stage(), p = w.player;
  assert.equal(p.storeCap, RULES.store.cap);
  giveCard(w, 'cap');
  assert.equal(p.storeCap, RULES.store.cap + RULES.cards.capPlus);
  for (let k = 0; k < 5; k++) assert.equal(orb(w), true, `${k + 1}번째`);
  assert.equal(orb(w), false);
  assert.equal(of(drainEvents(w), 'storeAdd').pop().full, true);
});

test('회피 충전 +1: 셋까지 차고 셋을 다 쓸 수 있다', () => {
  const w = stage(), p = w.player;
  assert.equal(p.dodge.max, RULES.dodge.charges);
  giveCard(w, 'charge');
  assert.equal(p.dodge.max, RULES.dodge.charges + RULES.cards.chargePlus);
  assert.equal(p.dodge.charges, RULES.dodge.charges + RULES.cards.chargePlus);
});

test('몸 카드는 칸 제한이 없고, 가진 카드를 또 끼울 수 없다', () => {
  const w = stage();
  assert.equal(giveCard(w, 'cap'), true); assert.equal(giveCard(w, 'charge'), true); assert.equal(giveCard(w, 'graze'), true);
  assert.equal(kitFull(w, 'body'), false);
  assert.equal(w.tries.on.graze, true);
  assert.equal(giveCard(w, 'cap'), false);
  assert.equal(w.player.storeCap, RULES.store.cap + RULES.cards.capPlus, '두 번 올라감');
  assert.equal(giveCard(w, 'missile'), false, '가진 무기');
  assert.equal(giveCard(w, 'nope'), false);
  assert.deepEqual(kitAll(w), ['missile', 'cap', 'charge', 'graze']);
});

test('스냅샷으로 되돌리면 효과가 한 벌만 남는다', () => {
  const w = stage(), R = w.rules;
  giveCard(w, 'cap'); giveCard(w, 'sky');
  const snap = kitSnapshot(w);
  giveCard(w, 'charge'); dropCard(w, 'sky'); giveCard(w, 'swap');
  // 다시 하기처럼: 몸을 새로 만든 뒤 되돌린다
  const fresh = createPlayer(R), p = w.player;
  for (const k of Object.keys(p)) delete p[k];
  Object.assign(p, fresh);
  kitRestore(w, snap);
  assert.equal(p.storeCap, R.store.cap + R.cards.capPlus);
  assert.equal(p.dodge.max, R.dodge.charges);
  assert.equal(p.dodge.charges, R.dodge.charges);
  assert.equal(w.tries.anchors.length, R.tries.rope.anchors.length, '말뚝이 한 벌이 아니다');
  assert.equal(w.tries.on.sky, true);
  assert.ok(!w.tries.on.swap, '되돌리기 전에 낀 카드가 남았다');
  assert.deepEqual(kitAll(w), ['missile', 'sky', 'cap']);
  kitRestore(w, snap);
  assert.equal(p.storeCap, R.store.cap + R.cards.capPlus, '두 번 되돌리면 두 번 올라간다');
  assert.equal(w.tries.anchors.length, R.tries.rope.anchors.length);
});

test('처음부터 들 카드를 줄 수 있다(kit 옵션) — 시작 무기 대신 그것만 든다', () => {
  const w = stage({ kit: ['burst', 'sky', 'cap'] });
  assert.deepEqual(kitAll(w), ['burst', 'sky', 'cap']);
  assert.deepEqual(w.weapons.on, ['burst']);
  assert.equal(w.player.storeCap, RULES.store.cap + 1);
  assert.deepEqual(kitAll(stage({ kit: 'none' })), [], '무기 없이');
  assert.deepEqual(kitAll(stage({ kit: 'beam,drone,missile' })), ['beam', 'drone'], '무기는 둘까지만');
});

test('setTry: 판 중에 켜고 끈다 — 밀물은 켠 때부터 first초 뒤, 끄면 깔린 예고를 거둔다', () => {
  const w = createWorld({ ai: false, store: true });
  assert.equal(w.tries, null);
  for (let k = 0; k < 240; k++) step(w, idle);
  setTry(w, 'tide', true);
  assert.ok(w.tries && w.tries.on.tide);
  assert.ok(Math.abs(w.tries.tide.nextAt - (w.time + RULES.tries.tide.first)) < 1e-9);
  for (let k = 0; k < Math.round((RULES.tries.tide.first + 0.1) / RULES.dt); k++) step(w, idle);
  assert.equal(w.floorAreas.filter(a => a.kind === 'tide').length, 1);
  setTry(w, 'tide', false);
  assert.equal(w.floorAreas.filter(a => a.kind === 'tide').length, 0);
  assert.ok(!w.tries.on.tide);
  setTry(w, 'pillars', true);
  assert.equal(w.tries.pillars.length, RULES.tries.pillars.at.length);
  w.tries.pillars[0].hp = 1;
  setTry(w, 'pillars', false); setTry(w, 'pillars', true);
  assert.equal(w.tries.pillars[0].hp, RULES.tries.pillars.hp, '다시 켜면 새것');
  setTry(w, 'nope', true);
  assert.deepEqual(w.tries.names, ['pillars']);
});

test('낀 것은 판의 상태다 — 해시에 들어가고, 같은 seed면 같은 판', () => {
  const a = stage(), b = stage();
  assert.equal(stateHash(a), stateHash(b));
  giveCard(b, 'lance');
  assert.notEqual(stateHash(a), stateHash(b));
});

// ── 고르는 순간에 뜨는 셋: [카드, 보급, 카드]
const groupOf = r => CARDS[r.what].group;
test('뽑기: 카드 둘은 갈래가 다르고 가진 것은 안 나온다. 방 1 뒤에는 무기 카드가 낀다', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = stage({ seed, kit: seed % 2 ? ['missile'] : ['missile', 'lance', 'dash', 'cap'] });
    for (const room of [0, 1, 2, 3]) {
      const [a, s, b] = drawPicks(w, room);
      assert.equal(a.kind, 'card'); assert.equal(b.kind, 'card'); assert.notEqual(s.kind, 'card');
      assert.notEqual(groupOf(a), groupOf(b), `seed ${seed} 방 ${room}: 같은 갈래`);
      assert.ok(!kitAll(w).includes(a.what) && !kitAll(w).includes(b.what), '가진 카드가 나옴');
      if (room === 0) assert.equal(groupOf(a), 'weapon', `seed ${seed}: 방 1 뒤에 무기가 없다`);
    }
  }
});

test('뽑기: 같은 seed면 같은 카드, 무기가 아닌 갈래도 첫 자리에 나온다', () => {
  const draw = seed => { const w = stage({ seed }); return [1, 2, 3].map(r => drawPicks(w, r).map(x => x.what).join(',')).join('|'); };
  assert.equal(draw(7), draw(7));
  const firsts = new Set();
  for (let seed = 1; seed <= 30; seed++) firsts.add(groupOf(drawPicks(stage({ seed }), 2)[0]));
  assert.ok(firsts.size >= 3, `첫 자리에 나온 갈래 ${[...firsts]}`);
});

test('뽑기: 남은 갈래가 하나면 그 갈래에서 둘, 카드가 한 장 남으면 카드 하나 + 보급 둘, 없으면 보급 셋', () => {
  const w = stage(), S = w.rules.cards.slots, keep = { ...S };
  S.weapon = 9; S.orb = 9; S.move = 9;
  try {
    for (const id of Object.keys(CARDS)) if (CARDS[id].group !== 'body') giveCard(w, id);
    let p = drawPicks(w, 1);
    assert.deepEqual([p[0].kind, p[2].kind], ['card', 'card']);
    assert.deepEqual([groupOf(p[0]), groupOf(p[2])], ['body', 'body']);
    assert.notEqual(p[0].what, p[2].what);
    giveCard(w, 'cap'); giveCard(w, 'charge');
    p = drawPicks(w, 1);
    assert.deepEqual(p.map(x => x.kind === 'card' ? x.what : 'supply'), ['graze', 'supply', 'supply']);
    giveCard(w, 'graze');
    assert.ok(drawPicks(w, 0).every(x => x.kind !== 'card'));
  } finally { Object.assign(S, keep); }
});

test('보급: 체력이 80% 아래면 회복, 아니면 적게 가진 사용권(같으면 방패), 둘 다 가득이면 회복', () => {
  const w = stage(), p = w.player, R = w.rules, mid = () => drawPicks(w, 1)[1];
  p.hp = R.player.hp * R.cards.supplyBelow - 0.5;
  assert.deepEqual(mid(), { kind: 'heal', what: 'heal' });
  p.hp = R.player.hp * R.cards.supplyBelow;
  p.stock = { shield: 1, bomb: 1 };
  assert.deepEqual(mid(), { kind: 'charge', what: 'shield' });
  p.stock = { shield: 2, bomb: 1 };
  assert.deepEqual(mid(), { kind: 'charge', what: 'bomb' });
  p.stock = { shield: R.stage.chargeMax, bomb: 2 };
  assert.deepEqual(mid(), { kind: 'charge', what: 'bomb' });
  p.stock = { shield: R.stage.chargeMax, bomb: R.stage.chargeMax };
  assert.deepEqual(mid(), { kind: 'heal', what: 'heal' });
});
