// 기병이 궁수를 사냥한다(사용자 2026-11-06: "궁병한테 다가가다가 다 죽고, 다가가도 궁병이 죽지도 않고, 판단도 안 좋다").
// 시험장: 기병 100(무게 160) 대 궁수 300(무게 180), 사람 병종끼리. 느린 시험(각 2~3초).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/world.js';
import { cavLab } from '../tools/cavlab.mjs';

function run(kind, seconds) {
  const lab = cavLab(kind), s = lab.w.soldiers;
  let stuck = 0;
  for (let k = 0; k < seconds * 20; k++) {
    step(lab.w);
    if (k % 20 === 0) for (const i of lab.cav) if (s.alive[i] && s.inContact[i] && s.contactHold[i]) stuck++;
  }
  const alive = ids => ids.filter(i => s.alive[i]).length;
  return { cav: alive(lab.cav), archers: alive(lab.archers), stuck };
}

test('혼자 선 궁수 300: 기병 100이 60초 안에 90% 넘게 베고, 절반 넘게 살아남는다', () => {
  const r = run('open', 60);
  assert.ok(r.archers <= 30, `궁수 ${r.archers}/300`);
  assert.ok(r.cav >= 50, `기병 ${r.cav}/100`);
});

test('망치와 모루: 우리 창이 적 창을 붙잡은 동안 기병은 창 벽에 박지 않고 돌아 들어가 90초 안에 궁수 3분의 1을 벤다', () => {
  const r = run('anvil', 90);                                // 고치기 전: 궁수 299/300, 기병 10/100, 막힘 890
  assert.ok(r.archers <= 200, `궁수 ${r.archers}/300`);
  assert.ok(r.cav >= 40, `기병 ${r.cav}/100`);
  assert.ok(r.stuck < 400, `창 벽에 막힌 기병·초 ${r.stuck}`);
});
