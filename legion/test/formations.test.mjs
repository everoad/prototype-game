// 병종마다 진형(사용자 2026-11-06): 창병 = 쐐기, 기병 = 삼각형, 궁수·공성 = 가로로 긴 직사각형.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, SPEAR, ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';
import { formationOffsets, wedgeOffsets, classOf } from '../src/sim/groups.js';
import { createWorld } from '../src/sim/world.js';

const g = makeRules().group;
const rowWidths = offs => {
  const rows = new Map();
  for (const o of offs) rows.set(o.f, (rows.get(o.f) ?? 0) + 1);
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(e => e[1]);
};

test('병종마다 진형 무리가 따로다: 창·궁·기병·보병', () => {
  assert.deepEqual([SPEAR, ARCHER, CAVALRY, INFANTRY].map(classOf), ['spear', 'archer', 'cav', 'infantry']);
});

test('창병은 쐐기(끝 한 명, 2명씩 넓어져 15명 폭에서 멈춤), 기병은 삼각형(끝까지 넓어짐)', () => {
  assert.deepEqual(formationOffsets('spear', 200, g), wedgeOffsets(200, g));
  const cav = formationOffsets('cav', 64, g);
  assert.deepEqual(rowWidths(cav), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.ok(Math.max(...rowWidths(formationOffsets('cav', 400, g))) > g.maxWidth, '기병 삼각형은 폭 제한이 없다');
});

test('궁수는 앞이 평평한 가로 직사각형(폭이 깊이보다 몇 배)', () => {
  for (const [cls, n] of [['archer', 150]]) {
    const offs = formationOffsets(cls, n, g);
    const widths = rowWidths(offs);
    assert.ok(widths[0] >= 10 && widths[0] === Math.max(...widths), `${cls} 첫 줄 ${widths[0]}`);
    const xs = offs.map(o => o.l), fs = offs.map(o => o.f);
    const wide = Math.max(...xs) - Math.min(...xs), deep = Math.max(...fs) - Math.min(...fs);
    assert.ok(wide >= 3 * deep, `${cls} 폭 ${wide.toFixed(1)} 깊이 ${deep.toFixed(1)}`);
  }
});

