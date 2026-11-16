// 두 보스가 같이 쓰는 두뇌 부분(bossCore.js) — 떼어 낸 뒤에도 원거리 보스 판이 그대로인지, boss 옵션.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash } from '../src/sim/world.js';
import { createBot } from '../src/sim/bot.js';

// 정해진 손: 원을 그리며 걷고, 37틱마다 패링, 401틱마다 회피. 죽지 않게(두뇌의 고르기를 오래 본다).
function scripted(opts, sec = 60) {
  const w = createWorld(opts);
  w.player.hp = w.player.maxHp = 1e9;
  for (let k = 0; k < sec * 120; k++) {
    const a = k / 240;
    step(w, { mx: Math.cos(a), mz: Math.sin(a), parry: k % 37 === 0, dodge: k % 401 === 0 });
    drainEvents(w);
  }
  return stateHash(w);
}

// 해시는 규칙을 일부러 바꿀 때만 다시 찍는다. 2026-11-17 다시 찍음(두 번): 빨강 회피의 반격 기회·흰 박치기 패링의 경직, 이어서 콤보 자동 반격·근접전 탄 지우기를 뺐다(사용자 "너무 과하다").
test('원거리 보스 판은 고정된 해시와 같다(코드만 고칠 땐 달라지면 안 된다)', () => {
  assert.equal(scripted({ seed: 1, phase: 1 }), '7200|-5.812592|-6.500000|999999723|4.385143|5.257547|5184|25|0.762396097|11|b1.429137,-2.214287|');
  assert.equal(scripted({ seed: 2, phase: 2 }), '7200|-9.317589|-6.500000|999999758|-2.459578|2.787396|1365|25|0.139139084|21|b4.521551,-0.978983|');
});

test('boss 옵션: dragon·ranged, 모르는 값은 ranged', () => {
  assert.equal(createWorld({}).opts.boss, 'ranged');
  assert.equal(createWorld({ boss: 'dragon' }).opts.boss, 'dragon');
  assert.equal(createWorld({ boss: 'ranged' }).opts.boss, 'ranged');
  assert.equal(createWorld({ boss: 'hydra' }).opts.boss, 'ranged');
});

// 마지막 검토(모아 던지기): 무기를 켠 기본 판이 달라졌었다(한 틱에 패링 둘이면 산탄 부채가 어긋남) — 그래서 무기를 켠 판도 못 박아 둔다
test('무기를 켠 판도 고정된 해시와 같다(한 틱에 패링 둘이 겹치는 판 포함)', () => {
  assert.equal(scripted({ seed: 1, gear: 'all' }), '7200|-5.812592|-6.500000|999999723|4.385143|5.257547|4584.1428571428005|25|0.762396097|11|b1.429137,-2.214287|');
  const some = seed => {
    const w = createWorld({ seed, gear: 'burst' }), bot = createBot('some', seed);
    w.player.hp = 1e9;
    for (let k = 0; k < 95 * 120 && !w.result; k++) { step(w, bot(w)); drainEvents(w); }
    return stateHash(w);
  };
  assert.equal(some(2), '11400|5.512304|4.424187|999999934|7.570432|4.006925|708|18|0.196899492|21||');
  assert.equal(some(3), '11400|-5.042690|-3.751232|999999960|-3.634552|4.558992|846.5|19|0.282922237|12||');
});
