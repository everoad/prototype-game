// Task 10: 상황 되풀이 장면 — 한 상황만 되풀이, 체력이 1 밑으로 안 내려감, 모르는 이름이면 보통 판.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { K } from '../src/sim/rules.js';
import { LABS } from '../src/sim/labs.js';
import { idle, ticks } from './helpers.mjs';

function play(w, sec) {
  const ev = [];
  for (let k = 0; k < ticks(sec); k++) { step(w, idle); ev.push(...drainEvents(w)); }
  return ev;
}

test('parry 장면은 1초마다 흰 탄 한 발', () => {
  const w = createWorld({ lab: 'parry' });
  assert.deepEqual([w.player.x, w.player.z, w.boss.x, w.boss.z], [-2, 0, 6, 0]);
  const whites = play(w, 5).filter(e => e.type === 'fire' && e.kind === K.WHITE).length;
  assert.ok(whites >= 4 && whites <= 6, `흰 탄 ${whites}`);
});

test('장면에서는 체력이 1 밑으로 내려가지 않는다', () => {
  const w = createWorld({ lab: 'stream' });
  const ev = play(w, 20);
  assert.ok(ev.filter(e => e.type === 'hurt').length >= 3);
  assert.ok(w.player.hp >= 1);
  assert.equal(w.result, null);
});

test('여섯 장면 모두 20초 동안 무언가를 한다', () => {
  for (const name of Object.keys(LABS)) {
    const w = createWorld({ lab: name });
    const ev = play(w, 20);
    const acts = ev.filter(e => ['fire', 'lane', 'rushStart', 'meleeHit'].includes(e.type)).length;
    assert.ok(acts > 3, `${name}: ${acts}`);
    if (name === 'graze') assert.equal(ev.filter(e => e.type === 'fire' && e.kind === K.WHITE).length, 0);
    if (name === 'melee' || name === 'rush') assert.ok(ev.some(e => e.type === 'meleeHit'));
    if (name === 'rush') assert.ok(ev.filter(e => e.type === 'rushStart').length >= 2);
  }
});

test('모르는 장면 이름이면 보통 판', () => {
  const w = createWorld({ lab: 'nope' });
  assert.equal(w.opts.lab, null);
  const ev = play(w, 14);
  assert.ok(ev.some(e => e.type === 'rushStart'), '보통 판의 여는 순서(돌진)가 없다');
});
