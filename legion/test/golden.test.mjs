// 싸움이 홍수와 같다(설계 2026-11-13-legion-design.md §7 1단계): 시험 장면을 군단 영지 모듈로 돌린 요약이
// 홍수 모듈로 기록한 test/golden/expected.json(tools/golden-record.mjs)과 정확히 같아야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runLab, goldenLabs } from '../src/sim/labs.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';

const mods = { createWorld, step, spawn, applyOrder };
const expected = JSON.parse(readFileSync(new URL('./golden/expected.json', import.meta.url)));
for (const name of goldenLabs()) {
  test(`황금: ${name}가 홍수와 같다`, () => assert.deepEqual(runLab(name, mods), expected[name]));
}
test('황금: 같은 장면 두 번은 같다', () => assert.deepEqual(runLab('wedges', mods), runLab('wedges', mods)));
