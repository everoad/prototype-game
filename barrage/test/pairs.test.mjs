// 맞물리는 짝(한 판의 뼈대 설계 §6): "매번 다른 조합"의 맛은 카드끼리 맞물릴 때 난다. 새 기능이 아니라 확인 항목 —
// 아래 짝이 실제로 맞물리는지 본다. 안 맞물리는 짝은 고치기 전에 사용자에게 알린다(todo로 남긴 시험이 그것이다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { spawnMob } from '../src/sim/foes.js';
import { storeAdd } from '../src/sim/store.js';
import { idle, ticks } from './helpers.mjs';

const T = RULES.tries, WR = RULES.weapons, M = RULES.mobs, S = RULES.store;
const of = (ev, t) => ev.filter(e => e.type === t);
const play = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, typeof input === 'function' ? input(w, k) : input); ev.push(...drainEvents(w)); } return ev; };
function fight(tries, gear = 'none', ai = false) {
  const w = createWorld({ ai, store: true, gear, tries });
  w.boss.away = true; w.shots.nextAt = 1e9;
  return w;
}
const dummy = (w, dx, dz) => { const m = spawnMob(w, 'totem', w.player.x + dx, w.player.z + dz, 0); m.hp = m.maxHp = 1e6; return m; };
const give = (w, n, perfect = false) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: 12, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const lost = m => m.maxHp - m.hp;

test('꿰뚫는 던지기 + 빔: 한 줄의 적 둘이 던진 탄과 빔의 한 방을 같이 맞는다', () => {
  const w = fight('always,lance', 'beam'), a = dummy(w, 4, 0), b = dummy(w, 8, 0), off = dummy(w, 5, 3.5);
  w.weapons.next.beam = 1e9;
  give(w, 1); step(w, idle); drainEvents(w);
  play(w, 1 / 120 + 1e-9, { ...idle, throw: true });
  play(w, 2);
  const orb = S.dmg[0] * T.lance.mul * T.always.throwMul, beam = WR.salvo.beam.dur * WR.salvo.beam.dps;
  for (const [name, m] of [['앞', a], ['뒤', b]]) assert.ok(Math.abs(lost(m) - (orb + beam)) < WR.salvo.beam.dps * RULES.dt * 3, `${name}의 적 ${lost(m)} ≠ ${orb + beam}`);
  assert.equal(lost(off), 0, '줄 밖의 적이 맞음');
  assert.ok(Math.abs(w.stats.dmg.throw - 2 * orb) < 1e-6, '던진 탄이 둘을 다 뚫지 못함');
});

test('오라 + 산탄: 붙은 적은 오라와 붙은 산탄을 같이 맞고, 먼 적은 오라가 안 닿고 산탄도 약하다', () => {
  const hit = d => {
    const w = fight('always,orbit', 'burst'), m = dummy(w, d, 0);
    give(w, 2); step(w, idle); drainEvents(w);
    const ev = play(w, T.always.burstEvery + 0.6);
    return { lost: lost(m), orbit: of(ev, 'orbitHit').length, pellets: of(ev, 'weaponHit').filter(e => e.kind === 'burst').length };
  };
  const near = hit(1.8), far = hit(8);
  assert.ok(near.orbit > 0, '붙은 적에 오라가 안 닿음');
  assert.equal(far.orbit, 0, '먼 적에 오라가 닿음');
  assert.ok(near.pellets > 0 && far.pellets > 0);
  assert.ok(near.lost / near.pellets > 5 * (far.lost / far.pellets), `붙은 한 발 값 ${near.lost / near.pellets} vs 먼 ${far.lost / far.pellets}`);
});

test('지뢰 + 돌격병: 돌진해 오는 길에 놓은 지뢰를 달려와 밟는다', () => {
  const w = fight('always,mine', 'none', true), p = w.player, x0 = p.x, C = M.charger;
  const m = spawnMob(w, 'charger', x0 + 6.5, p.z, 0);
  m.nextAt = 1e9;   // 지뢰가 깔릴 때까지 세워 둔다
  give(w, 1); step(w, idle); drainEvents(w);
  p.x = p.px = x0 + 3;   // 길 가운데에 놓고
  step(w, { ...idle, orb: true });
  assert.equal(w.tries.mines.length, 1);
  p.x = p.px = x0;       // 제자리로 돌아와 기다린다
  play(w, T.mine.arm + 0.05);
  m.nextAt = w.time;
  const hp = m.hp;
  const ev = play(w, C.warn + 0.8, x => ({ ...idle, mz: m.state === 'dash' ? 1 : 0, dodge: m.state === 'dash' && x.player.dodge.until < x.time }));
  assert.equal(of(ev, 'mineBoom').length, 1, '돌격병이 지뢰를 밟지 않음');
  assert.ok(Math.abs((hp - m.hp) - S.dmg[0] * T.mine.mul * T.always.throwMul) < 1e-6, `지뢰 피해 ${hp - m.hp}`);
});

// 자리 바꾸기는 "겨눈 적"(= 가장 가까운 적)과만 바뀐다. 심지를 켠 자폭병이 바로 그 가장 가까운 적이라 먼 적과는 바꿀 수 없고,
// 자폭병과 바꾸면 둘 사이 거리가 그대로여서 나는 여전히 폭발 안에 있다 — 지금 규칙으로는 맞물리지 않는다(사용자에게 알렸다. 고치는 길: 누른 쪽의 적을 고른다).
test('자리 바꾸기 + 자폭병: 심지를 켠 자폭병 곁에서 먼 적과 자리를 바꾸면 그 적이 폭발에 다치고 나는 빠져나온다', { todo: '자리 바꾸기가 가장 가까운 적만 고른다 — 사용자 결정 대기' }, () => {
  const w = fight('always,swap', 'none', true), p = w.player, Bm = M.bomber;
  const far = dummy(w, 7, 0);
  const b = spawnMob(w, 'bomber', p.x + 1.2, p.z, 0);
  b.nextAt = w.time;
  play(w, 0.2);
  assert.equal(b.state, 'windup');
  step(w, { ...idle, move1: true });
  assert.ok(of(drainEvents(w), 'swap').length === 1);
  play(w, Bm.fuse + 0.2);
  assert.equal(p.hp, RULES.player.hp, '자리를 바꿨는데 폭발에 맞음');
  assert.ok(lost(far) >= Bm.mobDmg - 1e-6, '자리를 바꾼 적이 폭발에 다치지 않음');
});
