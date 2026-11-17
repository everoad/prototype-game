// 멈춤 화면의 안내(사용자 2026-11-17 "알아보기 쉽게 표로 — 다른 사람한테 공유해서 할 만한가 확인해 보게"):
// 처음 보는 사람이 읽고 바로 할 수 있게 — 하는 법 몇 줄, 조작 표(왼손·오른손), 색의 뜻, 지금 낀 카드. 판의 종류에 맞는 줄만 고른다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { gameTries } from '../src/sim/tries.js';
import { guide } from '../src/view/guide.js';
import { LOOK } from '../src/view/look.js';

const keysOf = rows => rows.map(r => r.keys.join('+'));
const stage = (opts = {}) => createWorld({ stage: 1, tries: gameTries(null), ai: false, ...opts });
const bossOnly = (opts = {}) => createWorld({ store: true, tries: gameTries(null), gear: 'missile,burst', ai: false, ...opts });

test('스테이지: 왼손 = 이동·회피·방패·폭탄, 오른손 = 패링·던지기·저격·탄 기술·이동기', () => {
  const g = guide(stage(), LOOK);
  assert.deepEqual(keysOf(g.left), ['W+A+S+D', 'Space', 'Q', 'E']);
  assert.deepEqual(keysOf(g.right), ['J', 'U', 'I', 'O', 'K+L']);
  assert.ok(keysOf(g.misc).includes('Esc') && keysOf(g.misc).includes('F4') && keysOf(g.misc).includes('R'));
  for (const r of [...g.left, ...g.right, ...g.misc]) assert.ok(r.text && r.text.length <= 34, `"${r.text}" — 표의 한 줄은 짧게`);
});

test('하는 법은 서너 줄이고 받아치기 · 던지기 · 피하기를 다 말한다', () => {
  const g = guide(stage(), LOOK);
  assert.ok(g.how.length >= 3 && g.how.length <= 5, `${g.how.length}줄`);
  const all = g.how.join(' ');
  for (const word of ['J', 'U', 'Space']) assert.ok(all.includes(word), `하는 법에 ${word}가 없다`);
  assert.ok(g.goal.includes('보스'), '목표를 말한다');
});

test('색의 뜻 넷: 흰·금 = 받아친다, 빨강 = 피한다, 보라 = 비킨다, 청록 = 내 것', () => {
  const g = guide(stage(), LOOK);
  assert.deepEqual(g.colors.map(c => c.color), ['white', 'red', 'normal', 'cyan']);
  for (const c of g.colors) { assert.ok(LOOK.colors[c.color], `${c.color} 색이 없다`); assert.ok(c.text); }
});

test('낀 카드가 이름과 한 줄 설명으로 나온다 — 키가 있는 카드는 그 키와 함께', () => {
  const g = guide(stage({ kit: ['missile', 'burst', 'mine', 'dash', 'sky', 'cap'] }), LOOK);
  assert.deepEqual(g.cards.map(c => c.name), ['미사일', '산탄', '지뢰', '돌진 베기', '갈고리', '탄 칸 +1']);
  assert.deepEqual(g.cards.map(c => c.key), [null, null, 'O', null, 'L', null]);
  assert.ok(g.cards.every(c => c.line && c.group));
  assert.deepEqual(guide(bossOnly(), LOOK).cards, [], '보스전에는 카드가 없다');
});

test('보스전만 여는 판: 카드로 얻는 키(O · K·L)와 방 다시(R)는 빼고, 목표가 다르다', () => {
  const g = guide(bossOnly(), LOOK);
  assert.deepEqual(keysOf(g.right), ['J', 'U', 'I']);
  assert.ok(!keysOf(g.misc).includes('R'));
  assert.ok(g.goal && g.goal !== guide(stage(), LOOK).goal);
});

test('예전 방식(?store=0): 던지기·저격 대신 무기 스킬 U·I·O', () => {
  const g = guide(createWorld({ store: false, gear: 'all', ai: false }), LOOK);
  assert.deepEqual(keysOf(g.right), ['J', 'U+I+O']);
});

test('실험으로 켠 갈고리·지뢰도 제 키가 표에 나온다', () => {
  const g = guide(createWorld({ store: true, tries: 'always,snipe,sky,mine', ai: false }), LOOK);
  assert.deepEqual(keysOf(g.right), ['J', 'U', 'I', 'O', 'K+L']);
});
