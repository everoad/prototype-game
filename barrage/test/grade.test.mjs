// 결과 화면의 등급과 최고 기록(한 판의 뼈대 설계 §5 "스테이지가 끝나면"): 같은 판을 더 잘 깨는 재미를 받친다.
// 등급 = 걸린 시간·맞은 횟수·다시 한 횟수. 최고 기록은 브라우저에 스테이지마다 한 줄 — 저장이 막혀도 판은 그대로 돈다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/sim/rules.js';
import { GRADES, gradeOf } from '../src/view/grade.js';
import { recordable, readBest, writeBest } from '../src/view/records.js';

const T = [['S', { sec: 240, hits: 4, retries: 0 }], ['A', { sec: 270, hits: 8, retries: 1 }], ['B', { sec: 320, hits: 14, retries: 3 }]];
const q = s => new URLSearchParams(s);
// 가짜 저장소
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m }; };
const broken = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };

test('등급 표는 스테이지마다 있고 위로 갈수록 빡빡하다(유한한 수)', () => {
  assert.deepEqual(GRADES, ['C', 'B', 'A', 'S']);
  for (const id of Object.keys(RULES.stage.list)) {
    const t = RULES.grade[id];
    assert.ok(Array.isArray(t) && t.length === 3, `스테이지 ${id}의 등급 표`);
    assert.deepEqual(t.map(r => r[0]), ['S', 'A', 'B']);
    for (const [, c] of t) for (const v of Object.values(c)) assert.ok(Number.isFinite(v));
    for (let k = 1; k < t.length; k++) for (const key of ['sec', 'hits', 'retries']) assert.ok(t[k][1][key] >= t[k - 1][1][key], `${id} ${key}`);
    assert.equal(t[0][1].retries, 0, 'S는 다시 하기가 없어야 한다');
  }
});

test('세 조건을 모두 채우는 가장 높은 등급', () => {
  assert.equal(gradeOf(T, { sec: 230, hits: 3, retries: 0 }), 'S');
  assert.equal(gradeOf(T, { sec: 240, hits: 4, retries: 0 }), 'S', '경계값은 그 등급');
  assert.equal(gradeOf(T, { sec: 240.5, hits: 4, retries: 0 }), 'A');
  assert.equal(gradeOf(T, { sec: 230, hits: 5, retries: 0 }), 'A', '맞은 횟수가 넘으면 한 단계 아래');
  assert.equal(gradeOf(T, { sec: 300, hits: 10, retries: 2 }), 'B');
  assert.equal(gradeOf(T, { sec: 400, hits: 0, retries: 0 }), 'C');
  assert.equal(gradeOf(T, { sec: 100, hits: 0, retries: 4 }), 'C');
});

test('다시 하기가 한 번이라도 있으면 S가 아니다', () => {
  assert.equal(gradeOf(T, { sec: 100, hits: 0, retries: 1 }), 'A');
  assert.equal(gradeOf(T, { sec: 100, hits: 0, retries: 2 }), 'B');
});

test('표가 없거나 값이 이상해도 던지지 않는다', () => {
  assert.equal(gradeOf(undefined, { sec: 1, hits: 0, retries: 0 }), 'C');
  assert.equal(gradeOf(T, { sec: NaN, hits: 0, retries: 0 }), 'C');
});

test('기록은 stage와 화면 옵션만 붙은 판에만 남긴다', () => {
  assert.equal(recordable(q('stage=1')), true);
  assert.equal(recordable(q('stage=2&mute=1&raf=timer&intro=0&ring=0')), true);
  for (const s of ['stage=1&try=fire', 'stage=1&room=2', 'stage=1&kit=burst', 'stage=1&seed=7', 'stage=1&bot=user', 'stage=1&speed=2', 'stage=1&hard=1', 'stage=1&gear=all', 'stage=1&heal=1', 'stage=1&store=0', 'stage=1&record=30'])
    assert.equal(recordable(q(s)), false, s);
  assert.equal(recordable(q('')), false, '스테이지가 아닌 판');
  assert.equal(recordable(q('mute=1')), false);
});

test('처음 깬 기록은 그대로 남고 둘 다 새 기록이다', () => {
  const st = mem();
  assert.equal(readBest(st, 1), null);
  const r = writeBest(st, 1, { sec: 250, grade: 'A' });
  assert.deepEqual(r.best, { sec: 250, grade: 'A' });
  assert.deepEqual(r.isNew, { sec: true, grade: true });
  assert.equal(r.prev, null);
  assert.deepEqual(readBest(st, 1), { sec: 250, grade: 'A' });
  assert.equal(readBest(st, 2), null, '스테이지마다 따로');
});

test('시간과 등급은 따로 최고를 지킨다', () => {
  const st = mem();
  writeBest(st, 1, { sec: 250, grade: 'A' });
  const r = writeBest(st, 1, { sec: 240, grade: 'B' });
  assert.deepEqual(r.best, { sec: 240, grade: 'A' });
  assert.deepEqual(r.isNew, { sec: true, grade: false });
  assert.deepEqual(r.prev, { sec: 250, grade: 'A' });
  const r2 = writeBest(st, 1, { sec: 260, grade: 'S' });
  assert.deepEqual(r2.best, { sec: 240, grade: 'S' });
  assert.deepEqual(r2.isNew, { sec: false, grade: true });
  const r3 = writeBest(st, 1, { sec: 240, grade: 'S' });
  assert.deepEqual(r3.isNew, { sec: false, grade: false }, '같은 기록은 새 기록이 아니다');
  assert.deepEqual(readBest(st, 1), { sec: 240, grade: 'S' });
});

test('저장소가 던지거나 없어도 읽기는 null, 쓰기는 결과를 돌려준다(판은 그대로 돈다)', () => {
  assert.equal(readBest(broken, 1), null);
  assert.equal(readBest(null, 1), null);
  const r = writeBest(broken, 1, { sec: 250, grade: 'B' });
  assert.deepEqual(r.best, { sec: 250, grade: 'B' });
  assert.deepEqual(r.isNew, { sec: true, grade: true });
  assert.deepEqual(writeBest(null, 1, { sec: 250, grade: 'B' }).best, { sec: 250, grade: 'B' });
});

test('깨진 값은 없는 것으로 친다', () => {
  const key = 'barrage.best.v1.stage1';
  for (const bad of ['{', '{"sec":"x"}', 'null', '[]', '"abc"', '{"sec":-5,"grade":"Z"}', ''])
    assert.equal(readBest(mem({ [key]: bad }), 1), null, bad);
  assert.deepEqual(readBest(mem({ [key]: '{"sec":200,"grade":"Z"}' }), 1), { sec: 200, grade: null }, '등급만 깨졌으면 시간은 살린다');
  const st = mem({ [key]: '{' });
  assert.deepEqual(writeBest(st, 1, { sec: 300, grade: 'C' }).best, { sec: 300, grade: 'C' });
  assert.deepEqual(readBest(st, 1), { sec: 300, grade: 'C' });
});

test('검사 판(char=sword)은 기록을 남기지 않는다 — 등급 문턱이 사수 기준이다', () => {
  assert.equal(recordable(new URLSearchParams('stage=1&char=sword')), false);
});
