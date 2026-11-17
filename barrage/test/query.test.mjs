// 주소 옵션 → 판 옵션. 모아 던지기(§4.11)가 기본 규칙(사용자 2026-11-17 "store=1을 기본으로 하자"), ?store=0 = 예전 방식.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldOptions } from '../src/view/query.js';

const opts = s => worldOptions(new URLSearchParams(s));

test('아무것도 안 붙이면 모아 던지기 판(무기는 미사일 + 산탄 — 무기 칸 둘, 원거리 보스, hard 꺼짐). 예전 판(?try=none)은 무기 넷', () => {
  const o = opts('');
  assert.equal(o.store, true); assert.equal(o.hard, false);
  assert.equal(o.gear, 'missile,burst'); assert.equal(o.boss, 'ranged'); assert.equal(o.seed, 1); assert.equal(o.phase, 1);
  assert.equal(opts('try=none').gear, 'all'); assert.equal(opts('try=-always').gear, 'all');
  assert.equal(opts('try=fire').gear, 'missile,burst'); assert.equal(opts('boss=dragon').gear, 'missile,burst');
});

test('?store=0이면 예전 방식(받자마자 날아감), ?store=1은 그대로 모아 던지기', () => {
  assert.equal(opts('store=0').store, false);
  assert.equal(opts('store=1').store, true);
});

test('다른 옵션은 그대로: hard · boss · lab(무기 없음) · pattern · phase · seed', () => {
  const o = opts('hard=1&boss=dragon&phase=2&seed=7&pattern=3');
  assert.equal(o.hard, true); assert.equal(o.boss, 'dragon'); assert.equal(o.phase, 2); assert.equal(o.seed, 7); assert.equal(o.pattern, 3);
  assert.equal(opts('lab=parry').gear, 'none'); assert.equal(opts('lab=parry').lab, 'parry');
  assert.equal(opts('gear=missile').gear, 'missile');
  assert.equal(opts('heal=1').heal, true);
});

test('?stage=1이면 스테이지: 모아 던지기는 늘 켜지고 무기 없이 시작한다', () => {
  const o = opts('stage=1&store=0');
  assert.equal(o.stage, 1); assert.equal(o.store, true); assert.equal(o.gear, 'none');
  assert.equal(opts('').stage, null);
  assert.equal(opts('stage=1&gear=beam').gear, 'beam');
});

test('모르는 스테이지 번호는 보스전 그대로(무기도 그대로)', () => {
  const o = opts('stage=99');
  assert.equal(o.stage, null); assert.equal(o.gear, 'missile,burst');
});

// 한 판의 뼈대: 스테이지는 판마다 다른 카드가 뜨게 seed를 새로 뽑는다(주소에 seed가 없을 때)
test('스테이지에 seed가 없으면 판마다 새 seed, 주면 그 값, 보스전은 1', () => {
  const q = s => new URLSearchParams(s);
  assert.equal(worldOptions(q('stage=1'), () => 0.25).seed, 1 + Math.floor(0.25 * 1e9));
  assert.notEqual(worldOptions(q('stage=1'), () => 0.25).seed, worldOptions(q('stage=1'), () => 0.75).seed);
  assert.equal(worldOptions(q('stage=1&seed=7'), () => 0.25).seed, 7);
  assert.equal(worldOptions(q(''), () => 0.25).seed, 1);
  assert.equal(worldOptions(q('lab=parry'), () => 0.25).seed, 1);
  assert.ok(Number.isInteger(worldOptions(q('stage=2')).seed));
});

test('&kit=카드,카드 — 처음부터 들 카드(스테이지에서만)', () => {
  const q = s => new URLSearchParams(s);
  assert.deepEqual(worldOptions(q('stage=1&kit=burst,sky')).kit, ['burst', 'sky']);
  assert.deepEqual(worldOptions(q('stage=1&kit=none')).kit, ['none']);
  assert.equal(worldOptions(q('stage=1')).kit, null);
  assert.equal(worldOptions(q('kit=burst')).kit, null, '보스전에는 없다');
});

test('char=sword → 검사, 그 밖에는 사수', () => {
  assert.equal(opts('char=sword').char, 'sword');
  assert.equal(opts('stage=1&char=sword').char, 'sword');
  assert.equal(opts('').char, 'gunner');
  assert.equal(opts('char=wizard').char, 'gunner');
});
