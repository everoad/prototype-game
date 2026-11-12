// 부대 지정(4단계 계획 Task 5, 설계서 §4 키 배치: 숫자 = 고르기, Ctrl+숫자 = 지정, Shift+숫자 = 더하기): 병사 번호와 태어난 차례로 기억한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { spawn, kill } from '../src/sim/soldiers.js';
import { remember } from '../src/view/select.js';
import { createGroups } from '../src/view/controlGroups.js';
import { INFANTRY, ARCHER } from '../src/sim/rules.js';

const block = (w, side, type, n, x, z) => Array.from({ length: n }, (_, k) => spawn(w.soldiers, side, type, x + (k % 10) * 1.2, z + Math.floor(k / 10) * 1.2, w.rules));
const sorted = a => [...a].sort((x, y) => x - y);

test('지정·고르기: 그 병사들이 돌아온다', () => {
  const w = createWorld(), g = createGroups(), ids = block(w, 0, INFANTRY, 20, 500, 200);
  g.set(1, remember(w, ids));
  assert.deepEqual(sorted(g.get(w, 0, 1).ids), sorted(ids));
  assert.deepEqual(g.get(w, 0, 2).ids, []);
});

test('더하기는 겹치지 않게 합친다', () => {
  const w = createWorld(), g = createGroups(), a = block(w, 0, INFANTRY, 10, 500, 200), b = block(w, 0, ARCHER, 10, 520, 200);
  g.set(3, remember(w, a));
  g.add(3, remember(w, [...a.slice(0, 5), ...b]));
  assert.deepEqual(sorted(g.get(w, 0, 3).ids), sorted([...a, ...b]));
});

test('죽은 병사와 번호를 물려받은 새 병사는 빠진다', () => {
  const w = createWorld(), s = w.soldiers, g = createGroups(), ids = block(w, 0, INFANTRY, 10, 500, 200);
  g.set(1, remember(w, ids));
  kill(s, ids[4]);
  const heir = spawn(s, 0, INFANTRY, 600, 200, w.rules);
  assert.equal(heir, ids[4], '번호를 물려받았다');
  const got = g.get(w, 0, 1);
  assert.equal(got.ids.length, 9);
  assert.ok(!got.ids.includes(heir));
  assert.equal(g.list(w, 0).find(x => x.n === 1).count, 9);
});

test('다 죽은 칸은 목록에서 빠지고 get은 빈 목록, 남의 편은 빠진다', () => {
  const w = createWorld(), s = w.soldiers, g = createGroups(), ids = block(w, 0, INFANTRY, 5, 500, 200), foes = block(w, 1, INFANTRY, 5, 500, 300);
  g.set(2, remember(w, ids));
  g.set(4, remember(w, foes));
  for (const i of ids) kill(s, i);
  assert.deepEqual(g.get(w, 0, 2).ids, []);
  assert.deepEqual(g.get(w, 0, 4).ids, []);
  assert.deepEqual(g.list(w, 0), []);
});

test('가운데와 이름', () => {
  const w = createWorld(), g = createGroups(), inf = block(w, 0, INFANTRY, 150, 500, 200), arch = block(w, 0, ARCHER, 10, 600, 200);
  g.set(5, remember(w, [...inf, ...arch]));
  assert.deepEqual(g.list(w, 0), [{ n: 5, count: 160, name: '인간 보병' }]);
  const s = w.soldiers, all = [...inf, ...arch], cx = all.reduce((a, i) => a + s.x[i], 0) / all.length, cz = all.reduce((a, i) => a + s.z[i], 0) / all.length;
  const c = g.center(w, 0, 5);
  assert.ok(Math.abs(c.x - cx) < 1e-6 && Math.abs(c.z - cz) < 1e-6);
  assert.equal(g.center(w, 0, 6), null);
});

test('한 병사가 두 칸에 들 수 있다', () => {
  const w = createWorld(), g = createGroups(), ids = block(w, 0, INFANTRY, 5, 500, 200);
  g.set(1, remember(w, ids)); g.set(2, remember(w, ids.slice(0, 2)));
  assert.equal(g.get(w, 0, 1).ids.length, 5);
  assert.equal(g.get(w, 0, 2).ids.length, 2);
  assert.deepEqual(g.list(w, 0).map(x => x.n), [1, 2]);
});
