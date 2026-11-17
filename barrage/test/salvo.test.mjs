// 탄을 쓸 때의 한 방(한 판의 뼈대 설계 §7): 던지기(U)·저격(I)·지뢰(O)로 모은 탄을 쓰면 낀 무기가 모두 큰 한 방을 낸다 — 쓴 칸 수만큼.
// 한 방은 던진 탄처럼 방패·보호를 지나고, 피해 기록은 따로(salvo). always가 켜진 판에서만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { spawnMob, hurtFoe } from '../src/sim/foes.js';
import { storeAdd, throwMul } from '../src/sim/store.js';
import { weaponSalvo, gearShare } from '../src/sim/weapons.js';
import { parryShare } from '../src/sim/stats.js';
import { idle, ticks } from './helpers.mjs';

const WR = RULES.weapons, SV = WR.salvo, AL = RULES.tries.always, S = RULES.store;
const of = (ev, t) => ev.filter(e => e.type === t);
const play = (w, sec, input = idle) => { const ev = []; for (let k = 0; k < ticks(sec); k++) { step(w, typeof input === 'function' ? input(w, k) : input); ev.push(...drainEvents(w)); } return ev; };
// 일반 방처럼(보스 없음). 늘 나가는 사격은 꺼 둔다(next를 멀리) — 한 방만 잰다
function fight(gear, tries = 'always') {
  const w = createWorld({ ai: false, store: true, gear, tries });
  w.boss.away = true; w.shots.nextAt = 1e9;
  for (const g of Object.keys(w.weapons.next)) w.weapons.next[g] = 1e9;
  return w;
}
const dummy = (w, dx, dz, kind = 'totem') => { const m = spawnMob(w, kind, w.player.x + dx, w.player.z + dz, 0); m.hp = m.maxHp = 1e6; if (kind !== 'totem') { m.nextAt = 1e9; m.state = 'held'; } return m; };
const give = (w, n, perfect = false) => { for (let k = 0; k < n; k++) storeAdd(w, { perfect, gold: false, stagger: 12, x: w.player.x, z: w.player.z, kind: 'bullet' }); drainEvents(w); };
const toss = (w, sec = 3) => [...play(w, 1 / 120 + 1e-9, { ...idle, throw: true }), ...play(w, sec)];
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);

test('한 방 수치는 유한한 수', () => {
  const walk = (o, path) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${path}.${k}`); else for (const x of [].concat(v)) assert.ok(Number.isFinite(x), `${path}.${k}`); } };
  walk(SV, 'salvo');
  assert.ok(Number.isFinite(AL.throwMul) && AL.throwMul < 1);
});

test('던지면 낀 무기가 한 방을 낸다 — 무기가 없으면 한 방도 사건도 없다', () => {
  const w = fight('missile,beam');
  dummy(w, 5, 0); give(w, 2); step(w, idle); drainEvents(w);
  const ev = toss(w, 0.1);
  const sv = of(ev, 'salvo');
  assert.equal(sv.length, 1);
  assert.deepEqual(sv[0].kinds, ['missile', 'beam']); assert.equal(sv[0].n, 2); assert.equal(sv[0].how, 'throw');
  near(sv[0].angle, 0, 1e-6, '각도');
  const w0 = fight('none');
  dummy(w0, 5, 0); give(w0, 2); step(w0, idle); drainEvents(w0);
  const ev0 = toss(w0, 1);
  assert.equal(of(ev0, 'salvo').length, 0);
  assert.equal(of(ev0, 'weaponFire').length, 0);
  assert.equal(w0.stats.dmg.salvo, 0);
  assert.equal(of(ev0, 'throw').length, 1, '무기 없이도 던질 수는 있다');
});

test('한 방은 쓴 칸 수만큼 크다: 미사일은 칸마다 n발, 한 칸에 50', () => {
  for (const n of [1, 3]) {
    const w = fight('missile'), m = dummy(w, 6, 0);
    give(w, n); step(w, idle); drainEvents(w);
    const ev = toss(w, 0.02);
    assert.equal(of(ev, 'weaponFire').filter(e => e.kind === 'missile' && e.salvo).length, n * SV.missile.n);
    play(w, 3.5);
    near(w.stats.dmg.salvo, n * SV.missile.n * SV.missile.dmg, 1e-6, `${n}칸 미사일 한 방`);
    assert.ok(m.hp < m.maxHp);
  }
  near(SV.missile.n * SV.missile.dmg, 50, 1e-9);
});

test('산탄 한 방은 붙으면 한 칸에 100, 멀면 거의 0', () => {
  const at = d => { const w = fight('burst'); dummy(w, d, 0); give(w, 1); step(w, idle); drainEvents(w); toss(w, 1.5); return w.stats.dmg.salvo; };
  const close = at(1.6), far = at(9);
  assert.ok(close > 60 && close <= SV.burst.n * SV.burst.dmg + 1e-6, `붙은 산탄 한 방 ${close}`);
  assert.ok(far <= SV.burst.n * SV.burst.dmg * SV.burst.fall.mul[1] + 1e-6, `먼 산탄 한 방 ${far}`);
  near(SV.burst.n * SV.burst.dmg, 100, 1e-9);
});

test('빔 한 방은 줄 위의 적마다 한 칸에 80 — 쓴 칸 수만큼 오래', () => {
  const w = fight('beam'), a = dummy(w, 4, 0), b = dummy(w, 8, 0), off = dummy(w, 6, 3);
  give(w, 2); step(w, idle); drainEvents(w);
  toss(w, 2 * SV.beam.dur + 0.3);
  const thrown = w.stats.dmg.throw;
  const lostA = a.maxHp - a.hp, lostB = b.maxHp - b.hp;
  near(w.stats.dmg.salvo, 2 * 2 * SV.beam.dur * SV.beam.dps, SV.beam.dps * RULES.dt * 4, '빔 한 방 합');
  assert.ok(lostB > 0, '줄 위의 둘째 적이 안 맞음');
  near(lostA - thrown, lostB, 1e-6, '줄 위의 두 적(던진 탄은 겨눈 적에게만)');
  assert.equal(off.maxHp - off.hp, 0);
  near(SV.beam.dur * SV.beam.dps, 80, 1e-9);
});

test('드론 한 방은 한 칸에 50(잠깐 아주 빠르게 쏜다)', () => {
  const w = fight('drone'), m = dummy(w, 4, 0);
  give(w, 1); step(w, idle); drainEvents(w);
  const ev = toss(w, SV.drone.dur + 1);
  const shots = of(ev, 'weaponFire').filter(e => e.kind === 'drone' && e.salvo).length;
  near(shots, SV.drone.dur / SV.drone.every, 1.01, '난사 발 수');
  near(w.stats.dmg.salvo, shots * SV.drone.dmg, 1e-6);
  near(SV.drone.dur / SV.drone.every * SV.drone.dmg, 50, 1e-9);
  assert.ok(m.hp < m.maxHp);
});

test('무기 둘이면 한 방도 각각 two / 2배', () => {
  const w = fight('missile,drone'), m = dummy(w, 5, 0);
  near(gearShare(w), WR.two / 2, 1e-9);
  give(w, 1); step(w, idle); drainEvents(w);
  toss(w, 4);
  near(w.stats.dmg.salvo, (SV.missile.n * SV.missile.dmg + Math.round(SV.drone.dur / SV.drone.every) * SV.drone.dmg) * WR.two / 2, SV.drone.dmg * WR.two, '두 무기의 한 방');
  assert.ok(m.hp < m.maxHp);
});

test('한 방의 피해는 salvo로 따로 적히고 받아친 몫에 들어간다. 던지기의 바탕은 70 / 완벽 105', () => {
  const w = fight('missile'), m = dummy(w, 5, 0);
  near(throwMul(w), AL.throwMul, 1e-9);
  give(w, 1, false); give(w, 1, true); step(w, idle); drainEvents(w);
  toss(w, 4);
  near(w.stats.dmg.throw, (S.dmg[0] + S.dmg[1]) * AL.throwMul * (1 + S.bonus), 1e-6, '던진 탄의 바탕');
  near(S.dmg[0] * AL.throwMul, 70, 1e-9); near(S.dmg[1] * AL.throwMul, 105, 1e-9);
  near(w.stats.dmg.salvo, 2 * SV.missile.n * SV.missile.dmg, 1e-6);
  near(parryShare(w.stats), 1, 1e-9, '받아친 몫');
  near(m.maxHp - m.hp, w.stats.dmg.throw + w.stats.dmg.salvo, 1e-6);
});

test('always가 꺼진 판은 그대로: 바탕 100 / 150, 한 방 없음, 산탄은 던질 때 부채', () => {
  const w = fight('missile,burst', null), m = dummy(w, 5, 0);
  assert.equal(throwMul(w), 1);
  give(w, 1, false); step(w, idle); drainEvents(w);
  const ev = toss(w, 3);
  assert.equal(of(ev, 'salvo').length, 0);
  assert.equal(w.stats.dmg.salvo, 0);
  near(w.stats.dmg.throw, S.dmg[0], 1e-6);
  assert.equal(of(ev, 'weaponFire').filter(e => e.kind === 'burst').length, WR.burst.n, '예전 판의 산탄은 던질 때 부채 한 번');
  assert.ok(m.hp < m.maxHp);
});

test('한 방은 방패를 지난다 — 늘 나가는 사격은 방패에 막힌다', () => {
  const w = fight('missile'), sh = dummy(w, 5, 0, 'shield');
  sh.face = Math.PI;   // 방패가 나를 본다
  give(w, 1); step(w, idle); drainEvents(w);
  toss(w, 3.5);
  near(w.stats.dmg.salvo, SV.missile.n * SV.missile.dmg, 1e-6, '방패 앞의 한 방');
  const w2 = fight('missile'), sh2 = dummy(w2, 5, 0, 'shield');
  sh2.face = Math.PI;
  w2.weapons.next.missile = 0;
  const ev = play(w2, 2.5);
  assert.ok(of(ev, 'mobBlock').length > 0, '늘 나가는 미사일이 방패에 막히지 않음');
  assert.equal(w2.stats.dmg.weapon, 0);
});

test('저격의 한 방은 저격 줄로 나간다 — 빔은 그 줄에 고정된다', () => {
  const w = createWorld({ ai: false, store: true, gear: 'beam', tries: 'always,snipe' });
  w.boss.away = true; w.shots.nextAt = 1e9; w.weapons.next.beam = 1e9;
  const a = dummy(w, 5, 0), side = dummy(w, 0, 6);
  give(w, 2); step(w, idle); drainEvents(w);
  const ev = [...play(w, 0.05, { ...idle, hold: true }), ...play(w, 2 * SV.beam.dur + 0.3)];
  const sv = of(ev, 'salvo');
  assert.equal(of(ev, 'snipeFire').length, 1);
  assert.equal(sv.length, 1); assert.equal(sv[0].how, 'snipe'); assert.equal(sv[0].n, 2);
  near(sv[0].angle, of(ev, 'snipeFire')[0].angle, 1e-9, '한 방의 각도 = 저격 줄');
  near(w.stats.dmg.salvo, 2 * SV.beam.dur * SV.beam.dps, SV.beam.dps * RULES.dt * 3, '빔 한 방');
  near(w.stats.dmg.throw, 2 * S.dmg[0] * RULES.tries.snipe.mul * AL.throwMul, 1e-6, '저격의 바탕');
  assert.equal(side.maxHp - side.hp, 0, '줄 밖의 적이 맞음');
  assert.ok(a.hp < a.maxHp);
});

test('지뢰를 놓으면 한 칸어치 한 방 — 겨눌 적이 없으면 한 방은 없다(판은 그대로 돈다)', () => {
  const mk = () => { const w = createWorld({ ai: false, store: true, gear: 'missile', tries: 'always,mine' }); w.boss.away = true; w.shots.nextAt = 1e9; w.weapons.next.missile = 1e9; return w; };
  const w = mk(), m = dummy(w, 6, 0);
  give(w, 2); step(w, idle); drainEvents(w);
  const ev = [...play(w, 1 / 120 + 1e-9, { ...idle, orb: true }), ...play(w, 3.5)];
  assert.equal(of(ev, 'mineSet').length, 1);
  assert.deepEqual(of(ev, 'salvo').map(e => [e.n, e.how]), [[1, 'mine']]);
  near(w.stats.dmg.salvo, SV.missile.n * SV.missile.dmg, 1e-6);
  assert.ok(m.hp < m.maxHp);
  const w2 = mk();
  give(w2, 2); step(w2, idle); drainEvents(w2);
  const ev2 = [...play(w2, 1 / 120 + 1e-9, { ...idle, orb: true }), ...play(w2, 1)];
  assert.equal(of(ev2, 'mineSet').length, 1);
  assert.equal(of(ev2, 'salvo').length, 0);
  assert.equal(w2.weapons.missiles.length, 0);
});

test('겨눌 적이 없는 틱에 탄을 써도 판이 깨지지 않는다 — 한 방은 없고, 날던 것은 곧게 날다 사라진다', () => {
  const w = fight('missile,burst,beam,drone'), m = dummy(w, 6, 0);
  m.hp = m.maxHp = 50;
  give(w, 4); step(w, idle); drainEvents(w);
  play(w, 1 / 120 + 1e-9, { ...idle, throw: true });
  assert.ok(w.weapons.missiles.length > 0);
  hurtFoe(w, m, 1e9, 'shot');   // 한 방이 나는 사이 마지막 적이 죽는다
  give(w, 2);
  const ev = [...play(w, 1 / 120 + 1e-9, { ...idle, throw: true }), ...play(w, 4)];
  assert.equal(of(ev, 'salvo').length, 0, '겨눌 적이 없는데 한 방이 나감');
  assert.equal(w.weapons.missiles.length, 0); assert.equal(w.weapons.pellets.length, 0);
  const ok = v => typeof v !== 'number' || Number.isFinite(v);
  assert.ok(Object.values(w.player).every(ok), '플레이어 좌표가 깨짐');
  weaponSalvo(w, 2, NaN, 'throw'); weaponSalvo(w, 0, 0, 'throw');
  assert.equal(w.weapons.missiles.length, 0, '잘못된 각도·0칸으로 한 방이 나감');
});

test('방을 넘어가면 이어지던 한 방(굵은 빔·난사)이 남지 않는다', () => {
  const w = createWorld({ stage: 1, ai: false, tries: 'always', kit: ['beam', 'drone'] });
  w.shots.nextAt = 1e9;
  give(w, 4); step(w, idle); drainEvents(w);
  const m = w.enemies.find(e => !e.dead);
  m.bornAt = 0;
  step(w, idle);
  play(w, 1 / 120 + 1e-9, { ...idle, throw: true });
  assert.ok(w.weapons.salvoBeam && w.weapons.salvoBeam.until > w.time);
  for (let k = 0; k < 10 && w.stage.phase === 'fight'; k++) { for (const e of w.enemies) e.dead = true; step(w, idle); }   // 묶음을 다 비운다
  assert.equal(w.stage.phase, 'reward');
  play(w, RULES.stage.rewardDelay + 0.05);
  const r = w.stage.rewards[1], p = w.player;
  p.x = p.px = r.x; p.z = p.pz = r.z; play(w, RULES.stage.pickHold + 0.05);
  p.x = p.px = RULES.board.hx - RULES.player.bodyR; p.z = p.pz = 0; step(w, idle);
  assert.equal(w.stage.room, 1);
  assert.ok(!w.weapons.salvoBeam || w.weapons.salvoBeam.until <= w.time, '굵은 빔이 다음 방에 남음');
  assert.ok(w.weapons.salvoDroneUntil <= w.time, '난사가 다음 방에 남음');
});
