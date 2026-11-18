// 모드 고르기(2026-11-18 — 사용자: "지금까지 나온 모드들 정리해서 … 점점 url이 많아지니까 찾기가 어려워지네. esc 눌렀을 때 도움말에서 선택하거나"):
// 멈춤 화면에서 캐릭터 · 판 · 일섬의 형태 · 무기 · 더 켤 것 · 연습 장면을 고르면 그 주소로 연다. 여기서는 순수한 부분만 본다 —
// 지금 주소에서 고른 것을 읽고(readModes), 고른 것에서 주소를 만든다(modeQuery). 그 주소는 worldOptions가 같은 판으로 읽어야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODE_GROUPS, readModes, modeQuery, shownGroups, shownItems } from '../src/view/modes.js';
import { worldOptions } from '../src/view/query.js';
import { TRIES, BASE_TRIES } from '../src/sim/tries.js';
import { LABS } from '../src/sim/labs.js';
import { RULES } from '../src/sim/rules.js';

const Q = s => new URLSearchParams(s);
const opt = sel => worldOptions(Q(modeQuery(sel)), () => 0);
const base = () => readModes(Q(''));

test('주소가 비어 있으면 기본 판이다: 사수 · 보스전(수호자) · 더 켠 것 없음', () => {
  assert.deepEqual(base(), { char: 'gunner', board: 'boss', slash: '', gear: '', try: [], mark: [], lab: '' });
  assert.equal(modeQuery(base()), '', '기본 판의 주소에는 아무것도 붙지 않는다');
});

test('지금 주소에서 고른 것을 읽는다', () => {
  assert.deepEqual(readModes(Q('char=sword&slash=chain')), { char: 'sword', board: 'boss', slash: 'chain', gear: '', try: [], mark: [], lab: '' });
  assert.deepEqual(readModes(Q('stage=2&char=sword&slash=deep&seed=7')), { char: 'sword', board: 'stage2', slash: 'deep', gear: '', try: [], mark: [], lab: '' });
  assert.deepEqual(readModes(Q('boss=dragon&gear=all&try=bubble,sky')), { char: 'gunner', board: 'dragon', slash: '', gear: 'all', try: ['sky', 'bubble'], mark: [], lab: '' });
  assert.equal(readModes(Q('lab=melee')).lab, 'melee');
  assert.deepEqual(readModes(Q('char=nope&slash=nope&stage=9&try=nope,dash&lab=nope')), { char: 'gunner', board: 'boss', slash: '', gear: '', try: ['dash'], mark: [], lab: '' }, '모르는 값은 기본으로');
});

test('고른 것에서 만든 주소는 같은 판으로 열린다', () => {
  let o = opt({ ...base(), char: 'sword', slash: 'chain' });
  assert.equal(o.char, 'sword'); assert.deepEqual(o.forms, { slash: 'chain' }); assert.equal(o.stage, null);
  o = opt({ ...base(), char: 'sword', board: 'stage2', slash: 'deep' });
  assert.equal(o.stage, 2); assert.deepEqual(o.forms, { slash: 'deep' });
  o = opt({ ...base(), board: 'dragon', gear: 'all', try: ['bubble', 'dash'] });
  assert.equal(o.boss, 'dragon'); assert.equal(o.gear, 'all');
  assert.deepEqual(o.tries.split(',').sort(), [...BASE_TRIES, 'bubble', 'dash'].sort());
  o = opt({ ...base(), lab: 'melee' });
  assert.equal(o.lab, 'melee');
});

test('읽은 것을 다시 주소로 만들면 같은 것이 읽힌다(왕복)', () => {
  for (const q of ['', 'char=sword&slash=chain', 'stage=1&char=sword&slash=deep', 'boss=dragon&gear=all', 'stage=2&try=sky,swap', 'lab=parry', 'char=sword&boss=dragon&try=bubble']) {
    const sel = readModes(Q(q));
    assert.deepEqual(readModes(Q(modeQuery(sel))), sel, q);
  }
});

test('맞지 않는 것은 주소에 넣지 않는다: 사수에게 일섬의 형태 · 검사나 스테이지에 무기 고르기 · 스테이지에 보스 보호막 · 검사에게 탄 기술', () => {
  assert.equal(modeQuery({ ...base(), slash: 'chain' }), '', '사수에게는 일섬이 없다');
  assert.ok(!modeQuery({ ...base(), char: 'sword', gear: 'all' }).includes('gear'), '검사는 무기를 들지 않는다');
  assert.ok(!modeQuery({ ...base(), board: 'stage1', gear: 'all' }).includes('gear'), '스테이지의 무기는 카드로 얻는다');
  assert.ok(!modeQuery({ ...base(), board: 'stage1', try: ['bubble'] }).includes('bubble'), '보호막은 보스전의 것');
  const q = modeQuery({ ...base(), char: 'sword', try: ['mine', 'orbit', 'lance', 'dash'] });
  assert.ok(q.includes('dash') && !q.includes('mine') && !q.includes('orbit') && !q.includes('lance'), q);
  assert.equal(modeQuery({ ...base(), lab: 'parry', board: 'stage2', gear: 'all' }), 'lab=parry', '연습 장면은 판 · 무기를 듣지 않는다');
});

test('보이는 것: 지금 고른 것에 맞는 갈래와 칸만 — 검사에게만 일섬의 형태, 사수 보스전에만 무기', () => {
  const ids = sel => shownGroups(sel).map(g => g.id);
  assert.deepEqual(ids(base()), ['char', 'board', 'gear', 'try', 'lab']);
  assert.deepEqual(ids({ ...base(), char: 'sword' }), ['char', 'board', 'slash', 'mark', 'try', 'lab']);
  assert.deepEqual(ids({ ...base(), board: 'stage1' }), ['char', 'board', 'try', 'lab']);
  assert.deepEqual(ids({ ...base(), lab: 'parry' }), ['char', 'lab'], '연습 장면을 고르면 판 · 무기 · 더 켜기는 숨는다');
  const tryOf = sel => shownItems(MODE_GROUPS.find(g => g.id === 'try'), sel).map(i => i[0]);
  assert.ok(tryOf(base()).includes('bubble') && tryOf(base()).includes('mine'));
  assert.ok(!tryOf({ ...base(), board: 'stage1' }).includes('bubble'));
  assert.ok(!tryOf({ ...base(), char: 'sword' }).includes('mine'));
});

test('목록은 실제로 있는 것만 가리킨다: 실험 · 연습 장면 · 스테이지 · 형태. 칸마다 이름이 있다', () => {
  const g = id => MODE_GROUPS.find(x => x.id === id);
  for (const [v] of g('try').items) assert.ok(TRIES.includes(v) && !BASE_TRIES.includes(v), v);
  for (const [v] of g('lab').items) assert.ok(v === '' || !!LABS[v], v);
  for (const [v] of g('slash').items) assert.ok(v === '' || Object.hasOwn(RULES.sword.forms.slash, v), v);
  for (const [v] of g('board').items) if (v.startsWith('stage')) assert.ok(RULES.stage.list[Number(v.slice(5))], v);
  for (const grp of MODE_GROUPS) { assert.equal(typeof grp.title, 'string'); for (const [v, name] of grp.items) assert.ok(typeof v === 'string' && typeof name === 'string' && name.length > 0, `${grp.id}.${v}`); }
});

test('지금 주소의 다른 옵션 가운데 소리 끔(mute)만 가지고 간다 — seed 같은 것은 버린다', () => {
  assert.equal(modeQuery({ ...base(), char: 'sword' }, Q('mute=1&seed=9&heal=1')), 'char=sword&mute=1');
  assert.equal(modeQuery(base(), Q('seed=9')), '');
});

// ── 자국 카드(검사 — sim/marks.js)
import { MARK_CARDS } from '../src/sim/marks.js';
test('자국 카드: 검사에게만 뜨고, 쓰는 카드(터뜨리는 회전)는 남기는 카드(긋는 칼)를 고른 뒤에만 뜬다', () => {
  const g = MODE_GROUPS.find(x => x.id === 'mark');
  assert.deepEqual(g.items.map(i => i[0]), MARK_CARDS, '목록은 실제 카드와 같다');
  const items = sel => shownItems(g, sel).map(i => i[0]);
  assert.deepEqual(items({ ...base(), char: 'sword' }), ['cut']);
  assert.deepEqual(items({ ...base(), char: 'sword', mark: ['cut'] }), ['cut', 'pop']);
  assert.ok(!shownGroups(base()).some(x => x.id === 'mark'), '사수에게는 없다');
});

test('자국 카드: 주소로 오가고, 남기는 카드 없이 고른 쓰는 카드는 주소에 넣지 않는다', () => {
  assert.deepEqual(readModes(Q('char=sword&mark=cut,pop')).mark, ['cut', 'pop']);
  assert.equal(modeQuery({ ...base(), char: 'sword', mark: ['cut', 'pop'] }), 'char=sword&mark=cut,pop');
  assert.equal(modeQuery({ ...base(), char: 'sword', mark: ['pop'] }), 'char=sword');
  assert.equal(modeQuery({ ...base(), mark: ['cut'] }), '', '사수에게는 없다');
  assert.equal(opt({ ...base(), char: 'sword', slash: 'chain', mark: ['cut', 'pop'] }).marks, 'cut,pop');
  const sel = readModes(Q('stage=1&char=sword&slash=chain&mark=cut,pop'));
  assert.deepEqual(readModes(Q(modeQuery(sel))), sel);
});

