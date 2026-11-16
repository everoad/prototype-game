// 주소 옵션 → 판 옵션. 모아 던지기(§4.11)가 기본 규칙(사용자 2026-11-17 "store=1을 기본으로 하자"), ?store=0 = 예전 방식.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldOptions } from '../src/view/query.js';

const opts = s => worldOptions(new URLSearchParams(s));

test('아무것도 안 붙이면 모아 던지기 판(무기 다 켬, 원거리 보스, hard 꺼짐)', () => {
  const o = opts('');
  assert.equal(o.store, true); assert.equal(o.hard, false);
  assert.equal(o.gear, 'all'); assert.equal(o.boss, 'ranged'); assert.equal(o.seed, 1); assert.equal(o.phase, 1);
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
  assert.equal(o.stage, null); assert.equal(o.gear, 'all');
});
