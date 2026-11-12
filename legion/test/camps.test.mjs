// 괴물 소굴(설계서 §4·§5, 확정 그림): 지역마다 세기 표대로 편 2 괴물이 깃발 둘레를 지킨다. 끌려 나가면 돌아간다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, ORDER } from '../src/sim/soldiers.js';
import { killSoldier } from '../src/sim/combat.js';
import { spawnCamps, campAlive } from '../src/sim/camps.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';

const run = (w, sec, each = null) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) { step(w); if (each && each()) return true; } return false; };
const game = () => { const w = createWorld({ map: 'legion' }); spawnCamps(w); return w; };
const region = (w, i, j) => w.map.regions.find(g => g.i === i && g.j === j);
const campOf = (w, g) => w.camps.find(c => c.region === g.id);
const countTypes = (w, camp) => { const n = [0, 0, 0, 0, 0]; for (const i of camp.ids) n[w.soldiers.type[i]]++; return n; };

test('소굴 구성은 세기 표대로, 모두 편 2이고 걸을 수 있는 땅에 선다', () => {
  const w = game(), s = w.soldiers;
  const volcano = campOf(w, region(w, 0, 1));
  const n = countTypes(w, volcano);
  assert.deepEqual([n[INFANTRY], n[SPEAR], n[ARCHER], n[CAVALRY]], [40, 20, 15, 0]);
  assert.equal(campOf(w, region(w, 2, 2)).ids.length, 210);
  for (const c of w.camps) for (const i of c.ids) {
    assert.equal(s.side[i], 2);
    assert.ok(w.map.walkable(s.x[i], s.z[i]), `${w.map.regions[c.region].name} 소굴 병사가 막힌 땅에`);
  }
});

test('맞은편 소굴은 위아래로 뒤집은 같은 자리', () => {
  const w = game();
  for (const c of w.camps) {
    const g = w.map.regions[c.region], t = campOf(w, w.map.regions[g.twin]);
    const key = ([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`;
    const a = c.spots.map(key).sort(), b = t.spots.map(([x, z]) => key([x, 800 - z])).sort();
    assert.deepEqual(a, b, g.name);
  }
});

test('본진 곁(금광·숲·앞 요새)에는 소굴이 없다', () => {
  const w = game();
  for (const [i, j] of [[1, 0], [3, 0], [2, 1], [1, 4], [3, 4], [2, 3]]) assert.equal(campOf(w, region(w, i, j)), undefined, `${i},${j}`);
  assert.equal(w.camps.length, 17);
});

test('다가온 적과 싸운다', () => {
  const w = game(), s = w.soldiers, ley = region(w, 0, 0), camp = campOf(w, ley);
  for (let k = 0; k < 30; k++) spawn(s, 0, INFANTRY, ley.x - 10 + (k % 10) * 1.2, ley.z + 25 + Math.floor(k / 10) * 1.2, w.rules);
  const fought = run(w, 10, () => camp.ids.some(i => s.alive[i] && s.inContact[i]));
  assert.ok(fought, '소굴 병사가 맞닿았다');
});

test('끌려 나간 소굴 괴물은 leash를 넘으면 제 자리로 돌아간다', () => {
  const w = game(), s = w.soldiers, camp = campOf(w, region(w, 0, 0));
  const k = camp.ids.findIndex(i => s.type[i] === CAVALRY), i = camp.ids[k], [x, z] = camp.spots[k];
  s.x[i] = x; s.z[i] = z + 70; s.px[i] = s.x[i]; s.pz[i] = s.z[i];
  const back = run(w, 30, () => Math.hypot(s.x[i] - x, s.z[i] - z) <= 10 && s.order[i] === ORDER.NONE);   // 10 m = behavior.js 도착
  assert.ok(back, `돌아오지 못했다(${Math.hypot(s.x[i] - x, s.z[i] - z).toFixed(1)} m, 명령 ${s.order[i]})`);
});

test('소굴이 남았나', () => {
  const w = game(), ley = region(w, 0, 0), camp = campOf(w, ley);
  assert.equal(campAlive(w, ley.id), true);
  for (const i of camp.ids) killSoldier(w, i);
  assert.equal(campAlive(w, ley.id), false);
  assert.equal(campAlive(w, region(w, 1, 0).id), false);   // 소굴 없는 땅
});
