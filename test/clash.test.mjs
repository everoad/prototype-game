import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duelWorld, timeUntilBothDead, clashWorld, runSeconds, contactPairs, deepIntruders } from './helpers.mjs';

test('창병 1 대 1, 마주 보면 둘 다 약 60초에 죽는다 (600 ÷ 10)', async () => {
  const w = await duelWorld();
  const t = timeUntilBothDead(w);
  assert.ok(t >= 55 && t <= 65, `t = ${t}`);
});

test('600 대 600: 20초 안에 맞닿고, 승점 선 너머 120 m(밀어붙이기 한도)를 넘어간 병사가 없다', async () => {
  const c = await clashWorld(600, 600);
  runSeconds(c, 20);
  assert.ok(contactPairs(c) >= 100, `contact ${contactPairs(c)}`);
  runSeconds(c, 10);
  assert.equal(deepIntruders(c, 120 - 10), 0);   // 선분은 승점 선에서 10 m, 한도는 승점 선 + 120 m (§6.3a)
});
