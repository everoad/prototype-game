// 카드와 칸(한 판의 뼈대 설계 §6): 방을 깰 때마다 고르는 것. 숫자가 아니라 싸우는 방식을 고른다 — 갈래마다 칸 수가 정해져 있다.
// 낀 것 w.kit = { orb: [탄 기술], move: [이동기 — 얻은 차례대로 K·L], body: [몸] }. 무기 칸은 w.weapons.on(GEAR 차례) 그대로 쓴다.
// 카드의 효과는 실험 틀(tries.js)을 판 중에 켜고 끄는 것으로 낸다(setTry). 몸 카드 둘(탄 칸·회피 충전)은 플레이어의 칸 수를 바꾼다.
// 스테이지가 끝나면 다 사라진다(다음 스테이지로 가져가지 않는다). 수치는 RULES.cards.
import { emit } from './events.js';
import { GEAR } from './weapons.js';
import { setTry, tryKey } from './tries.js';

export const GROUPS = ['weapon', 'orb', 'move', 'body'];

// try = 켜고 끌 실험 이름, key = 키가 필요한 카드(탄 기술 O · 이동기 K·L)
export const CARDS = {
  missile: { group: 'weapon' }, burst: { group: 'weapon' }, beam: { group: 'weapon' }, drone: { group: 'weapon' },
  lance: { group: 'orb', try: 'lance' }, mine: { group: 'orb', try: 'mine', key: true }, orbit: { group: 'orb', try: 'orbit' },
  sky: { group: 'move', try: 'sky', key: true }, swap: { group: 'move', try: 'swap', key: true }, dash: { group: 'move', try: 'dash' },
  cap: { group: 'body' }, charge: { group: 'body' }, graze: { group: 'body', try: 'graze' },
};

const KEY_NAME = { orb: 'O', move1: 'K', move2: 'L' };

export const kitCards = (w, group) => (group === 'weapon' ? [...w.weapons.on] : w.kit ? [...w.kit[group]] : []);
export const kitAll = w => GROUPS.flatMap(g => kitCards(w, g));
export const kitFull = (w, group) => group !== 'body' && kitCards(w, group).length >= w.rules.cards.slots[group];

// 스테이지를 시작할 때: 낀 것을 만든다. ids를 주면 지금 든 무기 대신 그것만 든다(도구·시험·주소 &kit=), 안 주면 든 무기 그대로
export function initKit(w, ids = null) {
  w.kit = { orb: [], move: [], body: [] };
  if (!ids) return;
  w.weapons.on = [];
  for (const id of ids) put(w, id, true);
}

// 끼운다. 칸이 찼거나 이미 가졌거나 모르는 카드면 false(아무것도 바꾸지 않는다). at = 끼울 칸(바꿔 끼울 때 버린 카드의 칸 — 남은 카드의 키가 바뀌지 않게), 없으면 맨 뒤
export function giveCard(w, id, at = null) { return put(w, id, false, at); }

function put(w, id, quiet, at = null) {
  const c = CARDS[id];
  if (!c || !w.kit || kitCards(w, c.group).includes(id) || kitFull(w, c.group)) return false;
  const W = w.weapons, C = w.rules.cards, p = w.player;
  if (c.group === 'weapon') {
    W.on = GEAR.filter(g => g === id || W.on.includes(g));
    W.next[id] = w.time + (w.rules.weapons[id].first ?? w.rules.weapons[id].every ?? 0);
  } else { const list = w.kit[c.group]; list.splice(at != null && at >= 0 && at <= list.length ? at : list.length, 0, id); }
  if (c.try) setTry(w, c.try, true);
  if (id === 'cap') p.storeCap += C.capPlus;
  if (id === 'charge') { p.dodge.max += C.chargePlus; p.dodge.charges += C.chargePlus; }
  if (!quiet) emit(w, 'cardGain', { id, group: c.group, slot: kitCards(w, c.group).indexOf(id), key: c.key ? KEY_NAME[tryKey(w, c.try)] : null, x: p.x, z: p.z });
  return true;
}

// 뺀다(효과도 거둔다). 갖고 있지 않으면 false
export function dropCard(w, id) {
  const c = CARDS[id];
  if (!c || !w.kit || !kitCards(w, c.group).includes(id)) return false;
  const slot = kitCards(w, c.group).indexOf(id), C = w.rules.cards, p = w.player;
  if (c.group === 'weapon') w.weapons.on = w.weapons.on.filter(g => g !== id);
  else w.kit[c.group] = w.kit[c.group].filter(x => x !== id);
  if (c.try) setTry(w, c.try, false);
  if (id === 'cap') { p.storeCap -= C.capPlus; p.store.length = Math.min(p.store.length, p.storeCap); }
  if (id === 'charge') { p.dodge.max -= C.chargePlus; p.dodge.charges = Math.min(p.dodge.charges, p.dodge.max); }
  emit(w, 'cardDrop', { id, group: c.group, slot });
  return true;
}

// 방에 들어설 때 적어 둘 것(무기는 스테이지의 스냅샷이 따로 적는다)
export const kitSnapshot = w => ({ orb: [...w.kit.orb], move: [...w.kit.move], body: [...w.kit.body] });

// 다시 하기: 몸을 새로 만든 뒤(탄 칸·회피 충전이 처음 값) 부른다. 지금 낀 것의 효과를 거두고 적어 둔 것을 처음부터 다시 낸다 — 효과가 한 벌만 남는다
export function kitRestore(w, snap) {
  const R = w.rules, p = w.player;
  for (const g of ['orb', 'move', 'body']) for (const id of w.kit[g]) if (CARDS[id].try) setTry(w, CARDS[id].try, false);
  w.kit = { orb: [], move: [], body: [] };
  p.storeCap = R.store.cap; p.dodge.max = R.dodge.charges; p.dodge.charges = Math.min(p.dodge.charges, p.dodge.max);
  for (const g of ['orb', 'move', 'body']) for (const id of snap[g]) put(w, id, true);
}

// 보급 하나(고르지 않는다 — 규칙으로 정해진다): 체력이 supplyBelow 아래면 회복, 아니면 방패·폭탄 가운데 적게 가진 쪽(같으면 방패), 둘 다 가득이면 회복.
// 쓸모없는 보급이 뜨지 않게 하려는 것이다.
export function supplyFor(w) {
  const p = w.player, R = w.rules, max = R.stage.chargeMax, s = p.stock.shield, b = p.stock.bomb;
  if (p.hp < R.player.hp * R.cards.supplyBelow || (s >= max && b >= max)) return { kind: 'heal', what: 'heal' };
  return { kind: 'charge', what: s <= b && s < max ? 'shield' : b < max ? 'bomb' : 'shield' };
}

// 방을 깨면 뜨는 셋: [카드, 보급, 카드]. 카드 둘은 서로 다른 갈래, 가진 카드는 안 나온다. 방 1 뒤(roomIndex 0)의 첫 카드는 무기.
// 남은 갈래가 하나면 그 갈래에서 둘, 카드가 모자라면 그 자리는 회복. 뽑기는 판 전용 난수만 쓴다(같은 seed면 같은 카드).
export function drawPicks(w, roomIndex) {
  const pick = list => list[Math.floor(w.rng.next() * list.length) % list.length];
  const left = g => Object.keys(CARDS).filter(id => CARDS[id].group === g && !kitCards(w, g).includes(id));
  const groups = GROUPS.filter(g => left(g).length), cards = [];
  if (groups.length) {
    const g1 = roomIndex === 0 && groups.includes('weapon') ? 'weapon' : pick(groups);
    cards.push(pick(left(g1)));
    const others = groups.filter(g => g !== g1), rest = left(g1).filter(id => id !== cards[0]);
    if (others.length) cards.push(pick(left(pick(others))));
    else if (rest.length) cards.push(pick(rest));
  }
  const card = id => (id ? { kind: 'card', what: id } : { kind: 'heal', what: 'heal' });
  return [card(cards[0]), supplyFor(w), card(cards[1])];
}
