// 중립 편 2(괴물 소굴, 설계서 §4): 사람·몬스터 모두의 적. 편 둘을 전제한 자리에서 깨지지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { canSee } from '../src/sim/vision.js';
import { SPEAR, ARCHER, INFANTRY, SIEGE } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
const put = (w, side, type, n, x, z, cols = 10, gap = 1.2) => Array.from({ length: n }, (_, k) => spawn(w.soldiers, side, type, x + (k % cols) * gap, z + Math.floor(k / cols) * gap, w.rules));
const hpSum = (w, ids) => ids.reduce((a, i) => a + (w.soldiers.alive[i] ? w.soldiers.hp[i] : 0), 0);

test('중립 표는 몬스터 표와 같고 편이 셋이다', () => {
  const w = createWorld();
  assert.equal(w.rules.units.length, 3);
  assert.deepEqual(w.rules.units[2].map(u => u.name), w.rules.units[1].map(u => u.name));
});

test('중립 고블린은 사람과도 몬스터와도 싸운다', () => {
  const w = createWorld(), s = w.soldiers;
  const [g] = put(w, 2, INFANTRY, 1, 300, 300), [h] = put(w, 0, SPEAR, 1, 300, 301.5), [m] = put(w, 1, INFANTRY, 1, 301.5, 300);
  const hp0 = [s.hp[g], s.hp[h], s.hp[m]];
  run(w, 10);
  assert.ok(s.hp[g] < hp0[0], '중립이 맞았다');
  assert.ok(s.hp[h] < hp0[1], '사람이 맞았다');
  assert.ok(s.hp[m] < hp0[2], '몬스터가 맞았다');
});

test('중립 투척꾼(원거리)이 쏘고 맞아도 멈추지 않는다', () => {
  const w = createWorld();
  put(w, 2, ARCHER, 5, 300, 300, 5);
  const ours = put(w, 0, INFANTRY, 20, 300, 330);
  const before = hpSum(w, ours);
  assert.doesNotThrow(() => run(w, 20));
  assert.ok(hpSum(w, ours) < before);
});

test('화살 비로 쓰러뜨린 중립은 편 0 화살 비의 처치로 센다', () => {
  const w = createWorld(), s = w.soldiers;
  put(w, 0, ARCHER, 40, 300, 300);
  w.rules.units[2][INFANTRY].speed = 0;
  const foes = put(w, 2, INFANTRY, 30, 300, 330);
  for (const i of foes) s.hp[i] = 1;
  assert.equal(applyOrder(w, { kind: 'cast', side: 0, order: 'volley', x: 305, z: 331 }).ok, true);
  const cast = w.casts.find(c => c.side === 0 && c.order === 'volley');
  assert.doesNotThrow(() => run(w, 10));
  assert.ok(cast.stats.kills >= 1, `처치 ${cast.stats.kills}`);
});

test('중립은 시야 판단에서 늘 본다', () => {
  const w = createWorld();
  put(w, 0, SPEAR, 1, 300, 300);
  run(w, 1);
  assert.equal(canSee(w, 2, 10, 10), true);
});

test('편 2는 지휘 스킬을 못 건다', () => {
  const w = createWorld();
  const r = applyOrder(w, { kind: 'cast', side: 2, order: 'drum', x: 300, z: 300 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, '중립은 스킬이 없다');
});

test('돌격 북으로 쓰러뜨린 중립은 그 북의 처치로 센다(편 0·편 1 모두)', () => {
  for (const side of [0, 1]) {
    const w = createWorld({ knobs: { mirror: true } }), s = w.soldiers;
    put(w, side, SPEAR, 30, 300, 300);
    w.rules.units[2][INFANTRY].speed = 0;
    for (const i of put(w, 2, INFANTRY, 30, 300, 301.5)) s.hp[i] = 1;
    assert.equal(applyOrder(w, { kind: 'cast', side, order: 'drum', x: 305, z: 301 }).ok, true);
    const cast = w.casts.find(c => c.side === side && c.order === 'drum');
    assert.doesNotThrow(() => run(w, 5));
    assert.ok(cast.stats.kills >= 1, `편 ${side} 북 처치 ${cast.stats.kills}`);
  }
});

test('투석기는 중립을 겨눠 쏜다', () => {
  const w = createWorld();
  put(w, 0, SIEGE, 1, 300, 300);
  w.rules.units[2][INFANTRY].speed = 0;
  put(w, 2, INFANTRY, 20, 300, 350, 5);
  let fired = 0;
  assert.doesNotThrow(() => { for (let k = 0; k < 300; k++) { step(w); fired += w.events.filter(e => e.kind === 'boulderFire').length; } });
  assert.ok(fired >= 1, `쏜 돌 ${fired}`);
});
