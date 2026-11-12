import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duelWorld, timeUntilBothDead, clashWorld, runSeconds, contactPairs, deepIntruders } from './helpers.mjs';

test('창병 1 대 1, 마주 보면 둘 다 약 60초에 죽는다 (600 ÷ 10)', async () => {
  const w = await duelWorld();
  const t = timeUntilBothDead(w);
  assert.ok(t >= 55 && t <= 65, `t = ${t}`);
});

test('600 대 600: 20초 안에 맞닿고, 제 줄(점 목표)을 지키는 병사가 맞은편 줄 너머 110 m 밖으로 쓸려 가지 않는다', async () => {
  const c = await clashWorld(600, 600);
  runSeconds(c, 20);
  assert.ok(contactPairs(c) >= 100, `contact ${contactPairs(c)}`);
  runSeconds(c, 10);
  assert.equal(deepIntruders(c, 120 - 10), 0);   // 홍수에서는 밀어붙이기 한도(승점 선 + 120 m) 시험 — 군단 영지에는 한도가 없어 점 목표 병사가 제자리 둘레에 남는지만 본다
});
