// 포격수(네 번째 보스 — ?boss=siege, sim/siege.js). 사용자 2026-11-19(정체성 이야기 앞의 말 — 탄의 종류와 패턴, 거리와 카메라):
//  "탄 하나가 나가다가 탄이 터지면서 사방으로 작은 탄들이 나간다든지, 탄을 사방으로 연달아 쏘는데 회오리처럼 돌아가면서 쏴서 플레이어도 강제로 같이 돌게",
//  "원형 장판도 짧은 간격으로 연달아 오는데 빨>흰>흰>빨 … 회피와 탄 채우는 기회", "한 번에 수십 발을 터트리는데 중간에 흰색 폭탄 … 편하게 갈 거면 그냥 빈 곳으로",
//  "맵 크기도 크게 키우고 보스가 엄청 멀리 떨어져서 … 유저가 다 피해서 다가오게 … 빠르게 거리를 벌렸다가 좁혔다가", "일부러 느린 탄".
// 여기서는 판정만 본다: 큰 판 · 짜인 차례 · 도약 · 장면 여섯(포격전 · 덮치기 · 색 순서 고리 · 회오리 · 터지는 포탄 · 폭탄 밭). 지금의 보스 셋은 한 틱도 바뀌지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash, BOSSES } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { addStagger } from '../src/sim/boss.js';
import { createBot } from '../src/sim/bot.js';
import { idle } from './helpers.mjs';
import { MODE_GROUPS, readModes, modeQuery } from '../src/view/modes.js';
import { worldOptions } from '../src/view/query.js';
import { framingPoints } from '../src/view/camMath.js';
import { LOOK } from '../src/view/look.js';

const S = RULES.siege, DEG = Math.PI / 180, dt = RULES.dt;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const open = (o = {}) => createWorld({ boss: 'siege', store: true, ...o });
// 그 장면만 보게: 차례를 그 장면 하나로 바꿔 연다
const only = (name, o = {}) => { const w = open(o); w.boss.queue = [name]; return w; };
const input = (w, i) => (typeof i === 'function' ? i(w) : i);
// 그 사건이 나올 때까지 돈다(나온 사건을 돌려준다). 못 만나면 실패. seen = 그동안의 사건을 모은다.
function until(w, type, { maxSec = 40, by = idle, seen = null, keepAlive = true } = {}) {
  for (let k = 0; k < maxSec / dt; k++) {
    step(w, input(w, by));
    const ev = drainEvents(w);
    if (seen) seen.push(...ev);
    const hit = ev.find(e => (typeof type === 'function' ? type(e) : e.type === type));
    if (hit) return hit;
    if (keepAlive) w.player.hp = RULES.player.hp;   // 시험이 보는 것은 차례와 판정 — 죽지 않게
  }
  assert.fail(`${type} 사건이 ${maxSec}초 안에 나오지 않았다`);
}
function runFor(w, sec, by = idle, seen = null) {
  for (let k = 0; k < Math.round(sec / dt); k++) { step(w, input(w, by)); const ev = drainEvents(w); if (seen) seen.push(...ev); }
}
// 그 출처의 살아 있는 탄 번호들
function bulletsOf(w, src, pred = null) {
  const b = w.bullets, out = [];
  for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] === src && (!pred || pred(i))) out.push(i);
  return out;
}
const hurts = seen => seen.filter(e => e.type === 'hurt');
const toward = (w, x, z, stop = 0.15) => { const p = w.player, d = Math.hypot(x - p.x, z - p.z); return d < stop ? idle : { ...idle, mx: (x - p.x) / d, mz: (z - p.z) / d }; };

test('큰 판에서 연다: 이 판만 넓고, 다른 보스와 바탕 규칙은 그대로다', () => {
  assert.ok(BOSSES.includes('siege'));
  const w = open();
  assert.deepEqual(w.rules.board, S.board);
  assert.ok(S.board.hx >= 16 && S.board.hz >= 11, '판이 넓다');
  assert.deepEqual(RULES.board, { hx: 10, hz: 7 }, '바탕 규칙은 그대로');
  assert.equal(createWorld({}).rules, RULES);
  assert.equal(createWorld({ boss: 'dragon' }).rules, RULES);
  assert.ok(w.boss.siege && !w.boss.wyrm);
  assert.notEqual(w.boss.kind, 'dragon', '둥근 몸(수호자의 몸)을 쓴다');
  assert.equal(w.boss.maxHp, S.hp * RULES.store.bossHp);
  assert.ok(Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) > 14, '멀리 떨어져 시작한다');
  assert.ok(!createWorld({ boss: 'siege', stage: 1 }).boss.siege, '스테이지는 지금 그대로');
  assert.ok(!createWorld({ boss: 'siege', lab: 'parry' }).boss.siege, '연습 장면도 지금 그대로');
});

test('차례가 짜여 있다: 포격전으로 열고 덮치기 → 고리 → 회오리 → 포탄 → 폭탄 밭 → 포격전을 되풀이한다', () => {
  const w = open(), seen = [];
  runFor(w, 5, w2 => { w2.player.hp = RULES.player.hp; return idle; }, seen);
  for (let k = 0; k < 75 / dt; k++) { step(w, idle); seen.push(...drainEvents(w)); w.player.hp = RULES.player.hp; }
  const names = seen.filter(e => e.type === 'siegeScene').map(e => e.name);
  assert.deepEqual(names.slice(0, 1 + S.cycle.length), [...S.opening, ...S.cycle].slice(0, 1 + S.cycle.length));
  assert.ok(names.length > 1 + S.cycle.length, '한 바퀴를 돌고 되풀이한다');
  assert.equal(names[1 + S.cycle.length], S.cycle[0]);
  for (const n of ['walls', 'pounce', 'chain', 'whirl', 'shells', 'bombs']) assert.ok(S.cycle.includes(n), n);
});

test('도약: 한 번에 멀리 뛴다 — 뛰는 동안 몸이 뜨고 밑을 밀지 않으며, 내려앉으면 다시 단단하다', () => {
  const w = only('walls');
  const b = w.boss, p = w.player;
  p.x = b.x - 4; p.z = b.z;   // 가까이 붙어 있으면 포격전 앞에 먼저 물러난다
  const e = until(w, 'siegeLeap');
  assert.ok(Math.hypot(e.tx - p.x, e.tz - p.z) >= 14, `물러난 자리가 멀다(${Math.hypot(e.tx - p.x, e.tz - p.z).toFixed(1)} U)`);
  assert.ok(Math.abs(e.tx) <= S.board.hx && Math.abs(e.tz) <= S.board.hz);
  let top = 0;
  p.x = (e.x + e.tx) / 2; p.z = (e.z + e.tz) / 2;   // 뛰는 길 한가운데에 선다
  const at = [p.x, p.z];
  const land = until(w, 'siegeLand', { maxSec: 2, by: w2 => { top = Math.max(top, w2.boss.alt); return idle; } });
  assert.ok(top > 1.5, `떠오른다(높이 ${top.toFixed(2)})`);
  assert.deepEqual([p.x, p.z], at, '밑에 선 사람을 밀지 않는다');
  assert.equal(b.alt, 0);
  assert.ok(!b.lift);
  assert.ok(Math.hypot(b.x - e.tx, b.z - e.tz) < 1e-6 && Math.hypot(land.x - e.tx, land.z - e.tz) < 1e-6);
  assert.ok(land.t - e.t <= S.leap.sec[1] + dt, '빠르다');
});

test('포격전: 느린 탄의 벽 — 빈 곳 하나와 흰 탄이 막은 틈 하나가 내 양옆에 있고, 벽 전체가 한 빠르기로 나에게 온다', () => {
  const w = only('walls');
  const p = w.player, b = w.boss, Wl = S.walls;
  const e = until(w, 'siegeWall');
  const ids = bulletsOf(w, RULES.src.walls), B = w.bullets;
  const tx = -Math.sin(e.angle), tz = Math.cos(e.angle), lat = i => (B.x[i] - e.x) * tx + (B.z[i] - e.z) * tz;
  assert.ok(Math.abs(wrap(e.angle - Math.atan2(p.z - b.z, p.x - b.x))) < 1e-6, '벽은 나를 향해 온다');
  assert.ok(ids.length >= 20, `탄 ${ids.length}발`);
  const lats = ids.map(lat);
  assert.ok(Math.max(...lats) - Math.min(...lats) >= 18, '벽이 판을 가로지른다');
  const sp = Wl.speed * RULES.bullets.speedMul;
  for (const i of ids) {
    assert.ok(Math.abs(Math.hypot(B.vx[i], B.vz[i]) - sp) < 1e-9, '벽의 탄은 모두 같은 느린 빠르기(흰 탄도)');
    assert.ok(Math.abs(wrap(Math.atan2(B.vz[i], B.vx[i]) - e.angle)) < 1e-9);
  }
  assert.ok(sp <= 5, '느리다');
  const whites = ids.filter(i => B.kind[i] === K.WHITE);
  assert.equal(whites.length, 1, '흰 탄 하나');
  assert.ok(Math.abs(lat(whites[0]) - e.plug) < 1e-6, '흰 탄은 막힌 틈의 한가운데');
  for (const i of ids) {
    if (B.kind[i] !== K.WHITE) assert.ok(Math.abs(lat(i) - e.plug) >= Wl.plugGap / 2 - 1e-9, '막힌 틈에는 흰 탄뿐');
    assert.ok(Math.abs(lat(i) - e.free) >= Wl.gap / 2 - 1e-9, '빈 곳에는 아무것도 없다');
  }
  assert.ok(e.free * e.plug < 0, '빈 곳과 막힌 틈은 서로 반대쪽');
  // 다음 벽에는 흰 탄이 없다 — 빈 곳 하나뿐
  const e2 = until(w, 'siegeWall');
  const ids2 = bulletsOf(w, RULES.src.walls, i => B.born[i] === e2.t);
  assert.equal(e2.plug, null);
  assert.equal(ids2.filter(i => B.kind[i] === K.WHITE).length, 0);
  assert.ok(Wl.whiteEvery >= 2);
  assert.ok(Math.abs(e2.t - e.t - Wl.every) < dt + 1e-9 && Wl.every * sp <= 3, '벽은 촘촘히 잇달아 온다');
  assert.ok(Math.abs(e.free) >= Wl.far[0] - 1e-9 && Math.abs(e.free) <= Wl.far[1] + 1e-9, '빈 곳은 걸어가야 하는 거리');
  assert.ok(Math.abs(e.plug) >= Wl.plug[0] - 1e-9 && Math.abs(e.plug) <= Wl.plug[1] + 1e-9, '흰 탄은 내 곁');
  assert.ok(Math.abs(e.plug) < Math.abs(e.free));
});

test('포격전: 벽은 정한 수만큼 오고, 빈 곳은 벽마다 반대쪽으로 바뀐다. 2단계에는 벽 사이로 빨간 창이 꽂힌다', () => {
  const count = phase => {
    const w = only('walls', { phase }), seen = [];
    w.boss.queue.push('chain');
    until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen });
    return seen;
  };
  const s1 = count(1), walls1 = s1.filter(e => e.type === 'siegeWall');
  assert.equal(walls1.length, S.walls.n[0]);
  for (let k = 1; k < walls1.length; k++) assert.ok(walls1[k].free * walls1[k - 1].free < 0, '빈 곳이 번갈아 바뀐다');
  assert.equal(s1.filter(e => e.type === 'lane').length, 0);
  const s2 = count(2);
  assert.equal(s2.filter(e => e.type === 'siegeWall').length, S.walls.n[1]);
  assert.ok(S.walls.n[1] > S.walls.n[0]);
  const lanes = s2.filter(e => e.type === 'lane' && e.kind === K.RED);
  assert.equal(lanes.length, S.walls.spearAfter.length, '빨간 창');
});

test('포격전: 2단계에는 다가오면 한 번 다시 멀리 물러나 남은 벽을 마저 쏜다', () => {
  assert.deepEqual(S.walls.hops, [0, 1]);
  const w = only('walls', { phase: 2 }), seen = [], b = w.boss, p = w.player;
  w.boss.queue.push('chain');
  until(w, 'siegeWall', { seen });
  p.x = b.x - (S.walls.close - 1); p.z = b.z;
  const hop = until(w, 'siegeLeap', { maxSec: 0.1, seen });
  assert.ok(Math.hypot(hop.tx - p.x, hop.tz - p.z) >= 14, '다시 멀리');
  until(w, 'siegeLand', { maxSec: 1, seen });
  const again = until(w, 'siegeWall', { maxSec: S.walls.hopLead + 0.1, seen });
  assert.equal(again.k, 1, '세던 벽을 잇는다');
  p.x = b.x + (b.x > 0 ? -1 : 1) * (S.walls.close - 1); p.z = b.z;
  until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen });
  assert.equal(seen.filter(e => e.type === 'siegeLeap').length, 1, '한 번만 물러난다');
  assert.ok(seen.filter(e => e.type === 'siegeWall').length < S.walls.n[1]);
});

test('포격전: 다가오면 끝난다 — 벽을 뚫고 가까이 붙으면 남은 벽을 쏘지 않는다', () => {
  const w = only('walls'), seen = [];
  w.boss.queue.push('chain');
  until(w, 'siegeWall', { seen });
  const b = w.boss, p = w.player;
  p.x = b.x - (S.walls.close - 1); p.z = b.z;
  until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen });
  assert.ok(seen.filter(e => e.type === 'siegeWall').length < S.walls.n[0]);
});

test('폭탄 밭: 내 둘레에 빨간 원 수십 개가 한꺼번에 깔리고, 흰 원 하나와 빈 곳 하나가 닿을 거리에 있다', () => {
  const w = only('bombs'), Bm = S.bombs, p = w.player;
  const e = until(w, 'siegeBombs');
  const cells = w.floorAreas.filter(a => a.kind === 'bomb'), reds = cells.filter(a => a.color === 'red'), whites = cells.filter(a => a.color === 'white');
  assert.ok(reds.length >= 20, `빨간 원 ${reds.length}개`);
  assert.equal(whites.length, 1);
  assert.equal(e.n, reds.length);
  const W = whites[0];
  assert.ok(Math.hypot(W.x - e.white.x, W.z - e.white.z) < 1e-9);
  for (const a of cells) {
    assert.ok(Math.abs(a.x) <= S.board.hx && Math.abs(a.z) <= S.board.hz, '판 안');
    assert.ok(Math.abs(a.born + a.warn - e.T) < 1e-9, '모두 같은 순간에 터진다');
  }
  for (const a of reds) {
    assert.ok(Math.hypot(a.x - W.x, a.z - W.z) >= Bm.white.keep - 1e-9, '흰 원 곁에는 빨간 원이 없다');
    assert.ok(Math.hypot(a.x - e.hole.x, a.z - e.hole.z) >= Bm.hole.keep - 1e-9, '빈 곳에는 빨간 원이 없다');
  }
  const dW = Math.hypot(W.x - p.x, W.z - p.z), dH = Math.hypot(e.hole.x - p.x, e.hole.z - p.z);
  assert.ok(dW >= Bm.at[0] - 1e-9 && dW <= Bm.at[1] + 1e-9, '흰 원까지 걸어갈 거리');
  assert.ok(dH >= Bm.at[0] - 1e-9 && dH <= Bm.at[1] + 1e-9, '빈 곳까지 걸어갈 거리');
  assert.ok(dW <= (Bm.warn[0] - 0.4) * RULES.player.speed && dH <= (Bm.warn[0] - 0.4) * RULES.player.speed, '0.4초 늦게 보고도 걸어서 닿는다');
  const apart = Math.abs(wrap(Math.atan2(W.z - p.z, W.x - p.x) - Math.atan2(e.hole.z - p.z, e.hole.x - p.x)));
  assert.ok(apart >= Bm.apartDeg * DEG - 1e-9, '흰 원과 빈 곳은 서로 다른 쪽');
  // 그 밖의 자리는 어디에 서도 맞는다: 밭 안쪽의 점들(흰 원 · 빈 곳에서 떨어진)은 모두 빨간 원에 닿는다
  const hitAt = (x, z) => reds.some(a => Math.hypot(a.x - x, a.z - z) <= a.R + RULES.player.bodyR);
  let open2 = 0, n = 0;
  for (let x = e.x - Bm.field + 2; x <= e.x + Bm.field - 2; x += 0.25) for (let z = e.z - Bm.field + 2; z <= e.z + Bm.field - 2; z += 0.25) {
    if (Math.hypot(x - e.x, z - e.z) > Bm.field - 2 || Math.abs(x) > S.board.hx - 0.5 || Math.abs(z) > S.board.hz - 0.5) continue;
    if (Math.hypot(x - W.x, z - W.z) <= W.R + RULES.player.bodyR + 0.7 || Math.hypot(x - e.hole.x, z - e.hole.z) <= Bm.hole.keep - Bm.R + 0.4) continue;
    n++; if (!hitAt(x, z)) open2++;
  }
  assert.ok(n > 300);
  assert.equal(open2, 0, '빈 곳과 흰 원 말고는 설 자리가 없다');
  assert.ok(!hitAt(e.hole.x, e.hole.z), '빈 곳의 가운데는 안전하다');
});

test('폭탄 밭: 빈 곳에 서면 안 맞고, 빨간 원에 서면 맞고, 흰 원 안에서 받아치면 칸이 찬다(안 받으면 맞는다)', () => {
  const play = (where, parry) => {
    const w = only('bombs'), seen = [], p = w.player;
    const e = until(w, 'siegeBombs');
    const reds = w.floorAreas.filter(a => a.kind === 'bomb' && a.color === 'red');
    const at = where === 'hole' ? e.hole : where === 'white' ? e.white : reds[0];
    p.x = at.x; p.z = at.z;
    const n0 = p.store.length;
    const blast = until(w, 'bombsBlast', { maxSec: 3, seen, keepAlive: false, by: w2 => ({ ...idle, parry: parry && Math.abs(w2.time - (e.T - 0.06)) < dt / 2 }) });
    return { hurt: hurts(seen).length, got: p.store.length - n0, blast, w };
  };
  assert.equal(play('hole', false).hurt, 0);
  const red = play('red', false);
  assert.equal(red.hurt, 1);
  assert.equal(red.w.stats.hitsByPattern[RULES.src.bombs], 1);
  const white = play('white', true);
  assert.equal(white.hurt, 0);
  assert.equal(white.got, 1, '받아치면 칸이 찬다');
  assert.ok(white.blast.outcome === 'parry' || white.blast.outcome === 'perfect');
  assert.equal(play('white', false).hurt, 1, '흰 원도 받아치지 않으면 맞는다');
  assert.ok(red.blast.cells.length >= 20, '터지는 자리들을 화면에 알린다');
});

test('폭탄 밭: 정한 수만큼 잇달아 깔리고(2단계는 더 많이 · 더 빨리), 터진 원은 곧 걷힌다', () => {
  const count = phase => {
    const w = only('bombs', { phase }), seen = [];
    w.boss.queue.push('chain');
    until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen });
    assert.equal(w.floorAreas.filter(a => a.kind === 'bomb').length, 0, '남은 원이 없다');
    return seen.filter(e => e.type === 'siegeBombs');
  };
  const a = count(1), b = count(2);
  assert.equal(a.length, S.bombs.n[0]);
  assert.equal(b.length, S.bombs.n[1]);
  assert.ok(S.bombs.n[1] > S.bombs.n[0] && S.bombs.warn[1] < S.bombs.warn[0]);
  assert.ok(a[1].t >= a[0].T, '앞의 것이 터진 뒤에 다음 것이 깔린다');
});

test('색 순서 고리: 정한 색 순서로 고리가 잇달아 퍼진다 — 빨강은 둘까지', () => {
  for (const phase of [1, 2]) for (let seed = 1; seed <= 6; seed++) {
    const w = only('chain', { phase, seed }), seen = [];
    w.boss.queue.push('pounce');
    const e = until(w, 'siegeChain', { seen });
    assert.ok(S.chain.seqs[phase - 1].some(q => q.join() === e.seq.join()), e.seq.join('>'));
    assert.ok(e.seq.filter(c => c === 'red').length <= RULES.dodge.charges, '구르기 충전으로 넘길 수 있는 만큼만');
    assert.ok(e.seq.includes('white') && e.seq.includes('red'));
    until(w, e2 => e2.type === 'siegeScene' && e2.name === 'pounce', { seen });
    const waves = seen.filter(x => x.type === 'waveStart');
    assert.deepEqual(waves.map(x => x.color), e.seq);
    for (let k = 1; k < waves.length; k++) assert.ok(Math.abs(waves[k].t - waves[k - 1].t - S.chain.gap[phase - 1]) < dt + 1e-9, '고른 간격');
  }
  assert.ok(S.chain.seqs[0].some(q => q.join('>') === 'red>white>white>red') && S.chain.seqs[0].some(q => q.join('>') === 'red>white>red>white'), '사용자가 든 두 순서');
});

test('색 순서 고리: 빨강은 옆으로 굴러 넘기고 흰색은 받아치면 한 대도 안 맞고 흰 고리 수만큼 칸이 찬다', () => {
  const w = only('chain'), seen = [], p = w.player, b = w.boss, F = RULES.floor.wave;
  p.x = b.x - 7; p.z = b.z;
  w.boss.queue.push('pounce');
  const e = until(w, 'siegeChain');
  const by = w2 => {
    for (const v of w2.waves) {
      if (v.hitDone) continue;
      const tHit = (Math.hypot(p.x - v.x, p.z - v.z) - RULES.player.bodyR - v.r) / F.speed;
      if (tHit < 0) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (v.color === 'red' && tHit <= 0.05) return { ...idle, dodge: true, mx: -(v.z - p.z) / d, mz: (v.x - p.x) / d };   // 고리를 따라 옆으로(뒤로 구르면 무적이 끝난 뒤에 닿는다)
      if (v.color === 'white' && tHit <= 0.08) return { ...idle, parry: true };
    }
    return idle;
  };
  until(w, e2 => e2.type === 'siegeScene' && e2.name === 'pounce', { seen, by, keepAlive: false });
  assert.equal(hurts(seen).length, 0);
  assert.equal(p.store.length, Math.min(p.storeCap, e.seq.filter(c => c === 'white').length));
});

test('회오리: 판 가운데로 뛰어가 팔 여럿이 천천히 돈다 — 시작할 때 나는 팔 사이에 있고, 흰 탄은 팔의 앞쪽에서 나온다', () => {
  const w = only('whirl'), Wh = S.whirl, b = w.boss, p = w.player, seen = [];
  const e = until(w, 'siegeWhirl', { seen });
  assert.ok(seen.some(x => x.type === 'siegeLeap'), '가운데로 뛴다');
  assert.ok(Math.hypot(b.x, b.z) < 0.5, '판 가운데');
  assert.equal(e.arms, Wh.arms[0]);
  const a = b.act, toP = Math.atan2(p.z - b.z, p.x - b.x);
  for (let k = 0; k < e.arms; k++) assert.ok(Math.abs(wrap(a.ang + k * 2 * Math.PI / e.arms - toP)) >= Math.PI / e.arms - 1e-6, '첫 팔은 나를 비껴 있다');
  runFor(w, Wh.windup + 0.02);
  const ang0 = a.ang;
  runFor(w, 1);
  assert.ok(Math.abs(Math.abs(wrap(a.ang - ang0)) - Wh.turn[0] * DEG) < 0.5 * DEG, `1초에 ${Wh.turn[0]}도 돈다`);
  assert.equal(Math.sign(wrap(a.ang - ang0)), a.dir);
  // 한 번에 팔 수만큼 나온다(같은 틱에 생긴 보라 탄) · 느리다
  const B = w.bullets, purple = bulletsOf(w, RULES.src.whirl, i => B.kind[i] === K.NORMAL);
  const born = {}; for (const i of purple) born[B.born[i]] = (born[B.born[i]] ?? 0) + 1;
  assert.ok(Object.values(born).every(n => n === e.arms));
  assert.ok(Math.abs(Math.hypot(B.vx[purple[0]], B.vz[purple[0]]) - Wh.speed * RULES.bullets.speedMul) < 1e-9);
  assert.ok(Wh.turn[0] * DEG * 12 < RULES.player.speed, '12 U 거리에서도 걸어서 같이 돌 수 있는 빠르기');
  // 흰 탄: 그 틱의 팔보다 도는 쪽으로 aheadDeg 앞
  const fired = [];
  const first = until(w, x => x.type === 'fire' && x.kind === K.WHITE && x.src === RULES.src.whirl, { maxSec: Wh.white.every + 0.2, seen: fired });
  const whites = fired.filter(x => x.type === 'fire' && x.kind === K.WHITE && x.src === RULES.src.whirl && x.t === first.t);
  assert.equal(whites.length, e.arms, '팔마다 흰 탄 하나');
  for (const f of whites) assert.ok(Math.abs(wrap(Math.atan2(B.vz[f.id], B.vx[f.id]) - f.arm - a.dir * Wh.white.aheadDeg * DEG)) < 1e-6, '팔의 앞쪽');
});

test('회오리: 팔 사이에서 같이 돌면 끝까지 안 맞는다. 2단계에는 팔이 늘고 도는 쪽이 한 번 뒤집힌다', () => {
  const w = only('whirl'), Wh = S.whirl, b = w.boss, p = w.player, seen = [];
  w.boss.queue.push('chain');
  until(w, 'siegeWhirl');
  const a = b.act, v = Wh.speed * RULES.bullets.speedMul, om = Wh.turn[0] * DEG, R0 = 8;
  // 내 거리에 지금 와 있는 팔의 각 = (r / v)초 전에 쏜 각. 그 사이(틈의 한가운데)를 따라 걷는다.
  const by = w2 => {
    if (b.act !== a) return idle;
    const r = Math.hypot(p.x - b.x, p.z - b.z), back = Math.min(Math.max(0, w2.time - a.T0), r / v);
    const armAt = a.ang - a.dir * om * back, mid = armAt + Math.PI / e0.arms;
    const cur = Math.atan2(p.z - b.z, p.x - b.x), k = Math.round((cur - mid) / (2 * Math.PI / e0.arms));
    const want = mid + k * 2 * Math.PI / e0.arms;
    return toward(w2, b.x + Math.cos(want) * R0, b.z + Math.sin(want) * R0);
  };
  const e0 = { arms: Wh.arms[0] };
  until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen, by, keepAlive: false });
  assert.equal(hurts(seen).length, 0, '같이 돌면 안 맞는다');
  assert.ok(seen.filter(e => e.type === 'fire' && e.src === RULES.src.whirl).length > 100, '탄은 쏟아진다');
  assert.equal(seen.filter(e => e.type === 'siegeWhirlFlip').length, 0, '1단계는 뒤집지 않는다');
  // 가만히 서 있으면 쓸린다
  const w0 = only('whirl'), seen0 = [];
  w0.boss.queue.push('chain');
  until(w0, e => e.type === 'siegeScene' && e.name === 'chain', { seen: seen0, keepAlive: false });
  assert.ok(hurts(seen0).length >= 1, '서 있으면 팔에 쓸린다');
  // 2단계
  const w2 = only('whirl', { phase: 2 }), seen2 = [];
  w2.boss.queue.push('chain');
  const e2 = until(w2, 'siegeWhirl', { seen: seen2 });
  assert.equal(e2.arms, Wh.arms[1]);
  until(w2, e => e.type === 'siegeScene' && e.name === 'chain', { seen: seen2 });
  assert.equal(seen2.filter(e => e.type === 'siegeWhirlFlip').length, 1, '한 번 뒤집힌다');
});

test('터지는 포탄: 내 앞쪽에 빨간 원이 뜨고 포탄이 포물선으로 떨어진다 — 떨어진 자리에서 큰 탄 여섯이 퍼지되 나를 겨눈 것은 없다', () => {
  const w = only('shells'), Sh = S.shells, p = w.player, b = w.boss, B = w.bullets;
  const e = until(w, 'shellLob');
  const A = w.floorAreas.find(a => a.kind === 'impact');
  assert.ok(A && A.color === 'red' && Math.hypot(A.x - e.tx, A.z - e.tz) < 1e-9);
  const d = Math.hypot(e.tx - p.x, e.tz - p.z);
  assert.ok(d >= Sh.at[0] - 1e-9 && d <= Sh.at[1] + 1e-9, `내게서 ${d.toFixed(1)} U`);
  const off = Math.abs(wrap(Math.atan2(e.tz - p.z, e.tx - p.x) - Math.atan2(b.z - p.z, b.x - p.x)));
  assert.ok(off <= Sh.swingDeg * DEG + 1e-9, '보스 쪽으로 다가가는 자리');
  assert.ok(Math.abs(e.sec - Sh.fly) < 1e-9);
  const land = until(w, 'shellLand', { maxSec: Sh.fly + 0.1 });
  assert.ok(Math.abs(land.t - e.t - Sh.fly) < dt + 1e-9, '정한 시간 뒤에 떨어진다');
  const mids = bulletsOf(w, RULES.src.shells, i => B.born[i] === land.t);
  assert.equal(mids.length, Sh.mids);
  const toP = Math.atan2(p.z - e.tz, p.x - e.tx);
  for (const i of mids) {
    assert.ok(Math.abs(B.r[i] - Sh.midR) < 1e-9, '큰 탄');
    assert.equal(B.kind[i], K.NORMAL);
    assert.ok(Math.abs(wrap(Math.atan2(B.vz[i], B.vx[i]) - toP)) >= Math.PI / Sh.mids - 1e-6, '나를 겨눈 것은 없다(내 쪽은 큰 탄 사이의 한가운데)');
  }
  const eye = w.floorAreas.find(a => a.kind === 'eye');
  assert.ok(eye && eye.color === 'white' && Math.hypot(eye.x - e.tx, eye.z - e.tz) < 1e-9, '떨어진 자리에 흰 표시(눈)가 뜬다');
});

test('터지는 포탄: 떨어지는 자리에 서 있으면 맞는다', () => {
  const w = only('shells'), seen = [], p = w.player;
  const e = until(w, 'shellLob');
  w.boss.act.k = 99;   // 이 한 발만 본다
  p.x = e.tx; p.z = e.tz;
  until(w, 'shellLand', { seen, keepAlive: false });
  assert.equal(hurts(seen).length, 1);
  assert.equal(w.stats.hitsByPattern[RULES.src.shells], 1);
});

test('터지는 포탄: 큰 탄이 다시 터져 작은 탄의 고리가 된다 — 흰 탄만 떨어진 자리로 되돌아오고, 그 자리(눈)에 들어가 받아치면 안 맞고 칸이 찬다', () => {
  const w = only('shells'), Sh = S.shells, p = w.player, B = w.bullets, seen = [];
  const e = until(w, 'shellLob');
  w.boss.act.k = 99;   // 이 한 발만 본다
  const land = until(w, 'shellLand');
  const n0 = p.store.length;
  // 떨어지자마자 곧장 걸어 들어가 선다. 흰 탄이 닿을 때 받아친다.
  const by = w2 => {
    for (let i = 0; i < B.cap; i++) if (B.alive[i] && B.kind[i] === K.WHITE && w2.time >= B.holdUntil[i] && Math.hypot(B.x[i] - p.x, B.z[i] - p.z) <= RULES.player.parryR + B.r[i] + RULES.bullets.parrySpeed * 0.06) return { ...toward(w2, e.tx, e.tz), parry: true };
    return toward(w2, e.tx, e.tz);
  };
  const bursts = [];
  runFor(w, Sh.split + 0.02, by, seen);
  bursts.push(...seen.filter(x => x.type === 'shellBurst'));
  assert.equal(bursts.length, Sh.mids, '큰 탄마다 다시 터진다');
  assert.ok(Math.abs(bursts[0].t - land.t - Sh.split) < dt + 1e-9);
  const small = bulletsOf(w, RULES.src.shells, i => B.born[i] === bursts[0].t);
  const whites = small.filter(i => B.kind[i] === K.WHITE), purple = small.filter(i => B.kind[i] === K.NORMAL);
  assert.equal(whites.length, Sh.back, '되돌아오는 흰 탄');
  assert.equal(purple.length, Sh.mids * (Sh.ring - 1), '나머지는 보라');
  for (const i of whites) assert.ok(Math.abs(wrap(Math.atan2(B.vz[i], B.vx[i]) - Math.atan2(e.tz - B.z[i], e.tx - B.x[i]))) < 0.02, '흰 탄은 떨어진 자리를 향한다');
  // 눈 안은 고요하다: 보라 탄은 어느 것도 떨어진 자리 가까이를 지나지 않는다
  for (const i of purple) {
    const sp = Math.hypot(B.vx[i], B.vz[i]), ux = B.vx[i] / sp, uz = B.vz[i] / sp, rx = e.tx - B.x[i], rz = e.tz - B.z[i];
    const along = rx * ux + rz * uz, miss = along <= 0 ? Math.hypot(rx, rz) : Math.abs(rx * uz - rz * ux);
    assert.ok(miss >= 1.5, `보라 탄이 눈을 ${miss.toFixed(2)} U 비껴 간다`);
  }
  runFor(w, 1.2, by, seen);
  assert.equal(hurts(seen).length, 0, '눈으로 걸어 들어가 받아치는 동안 안 맞는다');
  assert.equal(p.store.length - n0, Sh.back, '받아친 만큼 칸이 찬다');
  assert.ok(!w.floorAreas.some(a => a.kind === 'eye' || a.kind === 'impact'), '표시는 걷힌다');
});

test('터지는 포탄: 정한 수만큼 쏘고(2단계는 더 많이), 다음 포탄은 앞 포탄의 자리에서 떨어져 떨어진다', () => {
  const lobs = phase => {
    const w = only('shells', { phase }), seen = [];
    w.boss.queue.push('chain');
    until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen });
    return seen.filter(e => e.type === 'shellLob');
  };
  const a = lobs(1), b = lobs(2);
  assert.equal(a.length, S.shells.n[0]);
  assert.equal(b.length, S.shells.n[1]);
  assert.ok(S.shells.n[1] > S.shells.n[0]);
  for (const list of [a, b]) for (let k = 1; k < list.length; k++) assert.ok(Math.hypot(list[k].tx - list[k - 1].tx, list[k].tz - list[k - 1].tz) >= S.shells.apart - 1e-9, '눈끼리 겹치지 않는다');
});

// 흰 덮치기 · 빨간 덮치기가 나오는 시드를 찾는다
function pounceOf(color, o = {}) {
  for (let seed = 1; seed <= 40; seed++) {
    const w = only('pounce', { seed, ...o });
    const e = until(w, 'siegePounce');
    if (e.color === color) return { w, e };
  }
  assert.fail(`${color} 덮치기가 나오는 시드를 못 찾았다`);
}

test('덮치기: 내 자리에 원이 뜨고(굳기 전까지 따라온다) 보스가 뛰어올라 그 자리에 떨어진다 — 흰 원은 받아치면 칸이 찬다', () => {
  const { w, e } = pounceOf('white'), Pn = S.pounce, p = w.player, b = w.boss;
  const A = w.floorAreas.find(a => a.kind === 'pounce');
  assert.ok(A && A.color === 'white' && Math.abs(A.R - Pn.R) < 1e-9);
  p.x += 3; p.z += 2;
  runFor(w, 0.2);
  assert.ok(Math.hypot(A.x - p.x, A.z - p.z) < 1e-6, '원이 나를 따라온다');
  let top = 0;
  runFor(w, Pn.warn - Pn.lockBefore - 0.2 + 0.02, w2 => { top = Math.max(top, w2.boss.alt); return idle; });
  const locked = [A.x, A.z], n0 = p.store.length, T = e.t + Pn.warn, seen = [];
  const slam = until(w, 'siegeSlam', { maxSec: 1, seen, keepAlive: false, by: w2 => { top = Math.max(top, w2.boss.alt); return { ...idle, parry: Math.abs(w2.time - (T - 0.06)) < dt / 2 }; } });
  assert.ok(top > 2, `뛰어오른다(높이 ${top.toFixed(2)})`);
  assert.ok(Math.hypot(slam.x - locked[0], slam.z - locked[1]) < 1e-9, '굳은 자리에 떨어진다');
  assert.ok(Math.abs(slam.t - T) < dt + 1e-9);
  assert.ok(slam.outcome === 'parry' || slam.outcome === 'perfect');
  assert.equal(p.store.length - n0, 1);
  assert.equal(hurts(seen).length, 0);
  assert.equal(b.alt, 0);
  assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= RULES.boss.r + RULES.player.bodyR - 1e-6, '내려앉으면 몸이 다시 단단하다');
});

test('덮치기: 빨간 원 안에 서 있으면 맞고, 굳은 뒤 비켜서면 안 맞는다. 내려앉으면 바로 근접 콤보가 이어진다', () => {
  const a = pounceOf('red'), seenA = [];
  until(a.w, 'siegeSlam', { seen: seenA, keepAlive: false });
  assert.equal(hurts(seenA).length, 1);
  assert.equal(a.w.stats.hitsByPattern[RULES.src.pounce], 1);
  const b = pounceOf('red'), seenB = [], p = b.w.player;
  runFor(b.w, S.pounce.warn - S.pounce.lockBefore + 0.02);
  const A = b.w.floorAreas.find(x => x.kind === 'pounce');
  p.x = A.x + (A.x > 0 ? -1 : 1) * (S.pounce.R + 2.5);
  const slam = until(b.w, 'siegeSlam', { seen: seenB, keepAlive: false });
  assert.equal(slam.outcome, 'miss');
  assert.equal(hurts(seenB).length, 0);
  const m = seenB.find(x => x.type === 'meleeStart');
  assert.ok(m && S.pounce.combos[0].includes(m.combo), '1단계의 콤보');
  assert.equal(b.w.boss.state, 'melee');
});

test('덮치기: 2단계의 콤보는 길다 — 흰 둘, 빨간 내려찍기, 흰 하나, 금 마무리', () => {
  assert.deepEqual(S.pounce.combos[1], ['duel']);
  assert.deepEqual(RULES.combos.duel.map(h => h[1]), ['white', 'white', 'red', 'white', 'gold']);
  const { w } = pounceOf('white', { phase: 2 }), seen = [];
  const m = until(w, 'meleeStart', { seen });
  assert.equal(m.combo, 'duel');
  w.boss.queue.push('chain');
  until(w, e => e.type === 'siegeScene' && e.name === 'chain', { seen });
  assert.equal(seen.filter(e => e.type === 'meleeHit').length, RULES.combos.duel.length, '다섯 타');
});

test('2단계: 체력이 반이면 넘어간다 — 하던 것을 거두고 판의 탄을 지운 뒤 차례를 잇는다', () => {
  const w = only('whirl'), b = w.boss, seen = [];
  b.queue.push('shells', 'bombs');
  until(w, 'siegeWhirl');
  runFor(w, S.whirl.windup + 1);
  assert.ok(w.bullets.live > 10);
  b.hp = b.maxHp * RULES.brain.phaseAt - 1;
  const ph = until(w, 'phase', { maxSec: 0.1, seen });
  assert.equal(ph.n, 2);
  assert.equal(b.phase, 2);
  assert.equal(w.bullets.live, 0);
  assert.equal(b.act, null);
  const next = until(w, 'siegeScene', { seen });
  assert.equal(next.name, 'shells', '차례는 이어진다(처음으로 돌아가지 않는다)');
});

test('그로기가 되면 하던 공격과 깔린 원을 거두고, 깨어나서 차례를 잇는다', () => {
  const w = only('bombs'), b = w.boss;
  b.queue.push('chain');
  until(w, 'siegeBombs');
  assert.ok(w.floorAreas.length > 20);
  addStagger(w, RULES.stagger.max);
  runFor(w, 0.05);
  assert.equal(b.state, 'groggy');
  assert.equal(w.floorAreas.length, 0);
  assert.equal(b.act, null);
  assert.equal(b.alt, 0);
  const next = until(w, 'siegeScene', { maxSec: RULES.stagger.groggy + 3 });
  assert.equal(next.name, 'chain');
  // 뛰는 중에 그로기가 차면 내려앉은 뒤에 쓰러진다(공중에서 멈추지 않는다)
  const w2 = only('whirl');
  until(w2, 'siegeLeap');
  runFor(w2, 0.1);
  addStagger(w2, RULES.stagger.max);
  runFor(w2, 0.03);
  assert.ok(w2.boss.lift && w2.boss.state === 'leap');
  until(w2, 'siegeLand', { maxSec: 1 });
  runFor(w2, 0.03);
  assert.equal(w2.boss.state, 'groggy');
  assert.equal(w2.boss.alt, 0);
});

test('같은 시드는 같은 판이다(결정적) — 봇이 60초를 쳐도 터지지 않는다', () => {
  const play = (seed, char) => {
    const w = open({ seed, char }), bot = createBot('user', seed);
    let dmg = 0;
    for (let k = 0; k < 60 / dt && !w.result; k++) step(w, bot(w));
    dmg = w.boss.maxHp - w.boss.hp;
    return { hash: stateHash(w), dmg, w };
  };
  const a = play(3, 'gunner'), b = play(3, 'gunner'), c = play(4, 'gunner'), s = play(3, 'sword');
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.ok(a.dmg > 500, `사수 봇이 깎은 체력 ${Math.round(a.dmg)}`);
  assert.ok(s.dmg > 500, `검사 봇이 깎은 체력 ${Math.round(s.dmg)}`);
  assert.ok(a.hash.includes('|q'), '해시에 이 보스의 상태가 든다');
});

test('탄 수: 한 바퀴를 도는 동안 탄 풀이 넘치지 않는다', () => {
  for (const phase of [1, 2]) {
    const w = open({ phase });
    let max = 0;
    for (let k = 0; k < 70 / dt; k++) { step(w, idle); drainEvents(w); w.player.hp = RULES.player.hp; max = Math.max(max, w.bullets.live); }
    assert.ok(max < RULES.bullets.cap * 0.9, `${phase}단계 가장 많을 때 ${max}발`);
    assert.ok(max > 100, '탄막이다');
  }
});

test('판 고르기에 있고, 주소로 오간다', () => {
  const Q = s => new URLSearchParams(s);
  assert.ok(MODE_GROUPS.find(g => g.id === 'board').items.some(i => i[0] === 'siege'));
  const sel = readModes(Q('boss=siege&char=sword'));
  assert.equal(sel.board, 'siege');
  assert.equal(modeQuery(sel), 'boss=siege&char=sword');
  assert.equal(worldOptions(Q('boss=siege')).boss, 'siege');
  assert.ok(createWorld(worldOptions(Q('boss=siege'))).boss.siege);
  assert.equal(readModes(Q('boss=dragon2')).board, 'dragon2', '나는 용은 그대로');
  assert.ok(LOOK.names.siege);
});

test('카메라가 담을 것: 깔린 폭탄 밭 · 포탄이 떨어질 자리 · 덮칠 자리가 다 들어간다', () => {
  const w = only('bombs');
  until(w, 'siegeBombs');
  const pts = framingPoints(w, LOOK), cells = w.floorAreas.filter(a => a.kind === 'bomb');
  for (const c of cells) assert.ok(pts.some(q => Math.abs(q.x - c.x) < 1e-9 && Math.abs(q.z - c.z) < 1e-9));
  const w2 = only('shells');
  const e = until(w2, 'shellLob');
  assert.ok(framingPoints(w2, LOOK).some(q => Math.abs(q.x - e.tx) < 1e-9 && Math.abs(q.z - e.tz) < 1e-9));
  const w3 = only('pounce');
  const e3 = until(w3, 'siegePounce');
  assert.ok(framingPoints(w3, LOOK).some(q => Math.abs(q.x - e3.x) < 1e-9 && Math.abs(q.z - e3.z) < 1e-9));
});

test('카메라: 큰 판에서는 판 끝의 아이템 하나가 화면을 끝까지 빼지 않는다(내 곁의 것만 담는다)', () => {
  const wide = { ...LOOK, camera: { ...LOOK.camera, ...LOOK.camera.wide } };
  const w = open(), p = w.player;
  w.items.push({ kind: 'bomb', x: p.x + 30, z: p.z, born: 0 }, { kind: 'shield', x: p.x + 5, z: p.z + 3, born: 0 });
  const pts = framingPoints(w, wide);
  assert.ok(!pts.some(q => Math.abs(q.x - (p.x + 30)) < 1e-9), '먼 아이템은 담지 않는다');
  assert.ok(pts.some(q => Math.abs(q.x - (p.x + 5)) < 1e-9 && Math.abs(q.z - (p.z + 3)) < 1e-9), '가까운 아이템은 담는다');
  assert.ok(framingPoints(w, LOOK).some(q => Math.abs(q.x - (p.x + 30)) < 1e-9), '지금의 판(작은 판)의 값으로는 그대로 다 담는다');
});
