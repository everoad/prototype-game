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

test('원거리 보스는 떼어 낸 뒤에도 같은 판(떼기 전 해시)', () => {
  assert.equal(scripted({ seed: 1, phase: 1 }), '7200|-9.317589|-6.500000|999999802|0.377932|1.606190|4941|8|0.676629999|11|b-5.211383,-2.778285|');
  assert.equal(scripted({ seed: 2, phase: 2 }), '7200|-2.633400|-6.500000|999999733|4.488201|2.251821|1035|0|0.405368554|21|b4.521551,-0.978983|');
});

test('boss 옵션: dragon·ranged, 모르는 값은 ranged', () => {
  assert.equal(createWorld({}).opts.boss, 'ranged');
  assert.equal(createWorld({ boss: 'dragon' }).opts.boss, 'dragon');
  assert.equal(createWorld({ boss: 'ranged' }).opts.boss, 'ranged');
  assert.equal(createWorld({ boss: 'hydra' }).opts.boss, 'ranged');
});

// 마지막 검토(모아 던지기): 무기를 켠 기본 판이 달라졌었다(한 틱에 패링 둘이면 산탄 부채가 어긋남) — 넣기 전(d34d004) 해시로 못 박는다
test('기본 판은 모아 던지기를 넣은 뒤에도 같다(무기 켬)', () => {
  assert.equal(scripted({ seed: 1, gear: 'all' }), '7200|-9.317589|-6.500000|999999802|0.377932|1.606190|4584.5714285713875|8|0.676629999|11|b-5.211383,-2.778285|');
  const some = seed => {
    const w = createWorld({ seed, gear: 'burst' }), bot = createBot('some', seed);
    w.player.hp = 1e9;
    for (let k = 0; k < 95 * 120 && !w.result; k++) { step(w, bot(w)); drainEvents(w); }
    return stateHash(w);
  };
  assert.equal(some(2), '11400|5.668272|5.216052|999999968|-2.933475|0.608237|765|21|0.729434861|11||');
  assert.equal(some(3), '10954|-2.331807|0.622250|999999925|6.139927|-0.465360|0|83|0.332833502|11||');
});
