// 나는 용(세 번째 보스 — ?boss=dragon2, sim/dragon2.js). 사용자 2026-11-19:
//  "각 보스마다 정체성이 있어야 돼 … 용을 표현하는 공격", "맵 크기도 크게 키우고 … 보스가 빠르게 거리를 벌렸다가 좁혔다가", "용이 회전하는 속도가 너무 느려서 그냥 수호자처럼 휙 돌게".
// 여기서는 판정만 본다: 큰 판 · 휙 돌기 · 불 뿜기(줄기가 나를 쫓되 빠르기에 상한) · 날아오르기(떠 있는 동안은 맞지도 겨눠지지도 않는다) ·
// 불줄(지나가는 줄을 따라 빨간 원이 차례로 터진다) · 급강하(내 자리의 원 → 내려앉으며 반대 색 고리). 지금의 수호자와 용은 한 틱도 바뀌지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, drainEvents, stateHash, BOSSES } from '../src/sim/world.js';
import { RULES, K } from '../src/sim/rules.js';
import { hurtFoe } from '../src/sim/foes.js';
import { clearBullets } from '../src/sim/bullets.js';
import { idle } from './helpers.mjs';

const D2 = RULES.dragon2, DEG = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const open = (o = {}) => createWorld({ boss: 'dragon2', store: true, ...o });
// 그 사건이 나올 때까지 돈다(나온 틱의 사건 묶음을 돌려준다). 못 만나면 실패.
function until(w, type, maxSec = 40, input = idle, seen = null) {
  for (let k = 0; k < maxSec / RULES.dt; k++) {
    step(w, typeof input === 'function' ? input(w) : input);
    const ev = drainEvents(w);
    if (seen) seen.push(...ev);
    const hit = ev.find(e => e.type === type);
    if (hit) return hit;
    w.player.hp = RULES.player.hp;   // 시험이 보는 것은 차례와 판정 — 죽지 않게
  }
  assert.fail(`${type} 사건이 ${maxSec}초 안에 나오지 않았다`);
}
const runFor = (w, sec, input = idle, seen = null) => { for (let k = 0; k < Math.round(sec / RULES.dt); k++) { step(w, typeof input === 'function' ? input(w) : input); const ev = drainEvents(w); if (seen) seen.push(...ev); } };

test('큰 판에서 연다: 이 판만 넓고, 지금의 판 크기와 다른 보스는 그대로다', () => {
  assert.ok(BOSSES.includes('dragon2'));
  const w = open();
  assert.deepEqual(w.rules.board, D2.board);
  assert.ok(D2.board.hx >= 16 && D2.board.hz >= 11, '판이 넓다');
  assert.deepEqual(RULES.board, { hx: 10, hz: 7 }, '바탕 규칙은 그대로');
  assert.equal(createWorld({ boss: 'dragon' }).rules, RULES);
  assert.equal(createWorld({}).rules, RULES);
  assert.equal(w.boss.kind, 'dragon', '용의 몸을 쓴다');
  assert.ok(Math.abs(w.player.x) <= D2.board.hx && Math.abs(w.boss.x) <= D2.board.hx);
  assert.ok(Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z) > 14, '멀리 떨어져 시작한다');
});

test('휙 돈다: 등 뒤에 선 플레이어를 0.4초 안에 본다', () => {
  const w = open();
  const b = w.boss, p = w.player;
  b.face = 0; p.x = b.x - 8; p.z = b.z;   // 정반대
  runFor(w, 0.4);
  const d = Math.abs(wrap(Math.atan2(p.z - b.z, p.x - b.x) - b.face));
  assert.ok(d < 5 * DEG, `각 차 ${(d / DEG).toFixed(1)}도`);
});

test('불 뿜기: 들이켠 뒤 입에서 탄 줄기가 이어지고, 줄기의 방향은 정한 빠르기까지만 나를 쫓는다', () => {
  const w = open();
  until(w, 'wyrmBreath');
  const b = w.boss;
  assert.equal(b.state, 'breath');
  const a0 = b.act.angle, n0 = w.bullets.live;
  // 플레이어를 줄기의 옆 90도로 옮긴다 — 줄기는 한 번에 못 따라온다
  const d = 6; w.player.x = b.x + Math.cos(a0 + Math.PI / 2) * d; w.player.z = b.z + Math.sin(a0 + Math.PI / 2) * d;
  runFor(w, 0.5, idle);
  const turned = Math.abs(wrap(b.act ? b.act.angle - a0 : 0)) / DEG, lim = D2.breath.sweep[0] * 0.5;
  assert.ok(turned > lim * 0.6 && turned <= lim + 1e-6, `0.5초에 ${turned.toFixed(1)}도 돌았다(상한 ${lim})`);
  assert.ok(w.bullets.live > n0 + 10, '탄이 계속 나온다');
  let breath = 0; for (let i = 0; i < w.bullets.cap; i++) if (w.bullets.alive[i] && w.bullets.src[i] === RULES.src.breath) { breath++; assert.equal(w.bullets.kind[i], K.NORMAL); }
  assert.ok(breath > 10);
  until(w, 'wyrmBreathEnd', 8);
});

test('날아오르면 맞지도 겨눠지지도 않고, 몸끼리 밀지도 않는다. 내려앉으면 다시 싸운다', () => {
  const w = open();
  until(w, 'wyrmTakeoff');
  const b = w.boss;
  assert.equal(b.air, true);
  step(w, idle);
  assert.equal(w.aim, null); assert.equal(w.foeList.length, 0);
  const hp = b.hp;
  assert.equal(hurtFoe(w, b, 500, 'throw'), 0); assert.equal(b.hp, hp);
  runFor(w, D2.fly.rise + 0.05);
  assert.ok(b.alt > D2.fly.alt * 0.9, `높이 ${b.alt.toFixed(2)}`);
  w.player.x = b.x; w.player.z = b.z; step(w, idle);   // 바로 밑에 서도 밀려나지 않는다
  assert.ok(Math.hypot(w.player.x - b.x, w.player.z - b.z) < 0.5);
  until(w, 'wyrmLand', 20);
  assert.equal(b.air, false); assert.equal(b.alt, 0);
  step(w, idle);
  assert.equal(w.aim, b);
  assert.ok(hurtFoe(w, b, 100, 'throw') > 0);
});

test('불줄: 용이 지나갈 줄을 따라 빨간 원이 미리 깔리고 차례로 터진다 — 줄 위에 서 있으면 맞고, 비켜서면 안 맞는다', () => {
  for (const stay of [true, false]) {
    const w = open();
    const strip = until(w, 'wyrmStrip');
    const areas = w.floorAreas.filter(a => a.kind === 'fire');
    assert.ok(areas.length >= 5, `원 ${areas.length}개`);
    assert.ok(areas.every(a => a.color === 'red' && a.shape === 'circle'));
    const warns = areas.map(a => a.warn);
    assert.ok(Math.min(...warns) >= D2.fly.strip.warn - 1e-9, '첫 원도 예고 시간을 채운다');
    assert.ok(warns.every((v, i) => i === 0 || v > warns[i - 1]), '줄을 따라 차례로 터진다');
    // 줄 가운데의 원에 선다 / 줄에서 옆으로 멀리 비켜선다
    const mid = areas[Math.floor(areas.length / 2)], nx = -Math.sin(strip.angle), nz = Math.cos(strip.angle);
    const p = w.player;
    [p.x, p.z] = stay ? [mid.x, mid.z] : [mid.x + nx * (mid.R + 2.5), mid.z + nz * (mid.R + 2.5)];
    const hp0 = p.hp, seen = [];
    for (let k = 0; k < 3 / RULES.dt && w.floorAreas.some(a => a.kind === 'fire'); k++) { step(w, idle); seen.push(...drainEvents(w)); }
    assert.ok(seen.filter(e => e.type === 'fireBoom').length >= 5, '원마다 터진다');
    if (stay) assert.ok(p.hp < hp0, '줄 위에서는 맞는다'); else assert.equal(p.hp, hp0, '비켜서면 안 맞는다');
  }
});

test('불줄을 지날 때 용은 줄을 따라 날아간다(떠 있는 채로 판을 가로지른다)', () => {
  const w = open();
  const strip = until(w, 'wyrmStrip');
  const b = w.boss, x0 = b.x, z0 = b.z;
  runFor(w, D2.fly.strip.warn + 0.5);
  const moved = (b.x - x0) * Math.cos(strip.angle) + (b.z - z0) * Math.sin(strip.angle);
  assert.ok(moved > 6, `줄을 따라 ${moved.toFixed(1)} U`);
  assert.equal(b.air, true);
});

test('급강하: 내 자리에 원이 뜨고(자리 고정 전까지 따라온다), 떨어지는 순간 흰 원은 받아칠 수 있다 — 받아치면 칸이 찬다', () => {
  let tried = 0;
  for (let seed = 1; seed <= 12 && tried < 1; seed++) {
    const w = open({ seed });
    const aim = until(w, 'wyrmDiveAim');
    if (aim.color !== 'white') continue;
    tried++;
    const p = w.player, a = w.floorAreas.find(x => x.kind === 'dive');
    assert.ok(a && a.shape === 'circle' && a.color === 'white');
    p.x += 1.5; step(w, idle);
    assert.ok(Math.hypot(a.x - p.x, a.z - p.z) < 1e-6, '고정 전에는 내 자리를 따라온다');
    const n0 = p.store.length, hp0 = p.hp, T = a.born + a.warn;
    const seen = [];
    for (let k = 0; k < 2 / RULES.dt && !seen.some(e => e.type === 'wyrmLand'); k++) { step(w, { ...idle, parry: Math.abs(w.time - (T - 0.05)) < RULES.dt / 2 }); seen.push(...drainEvents(w)); }
    const land = seen.find(e => e.type === 'wyrmLand');
    assert.ok(land && (land.outcome === 'parry' || land.outcome === 'perfect'), `결과 ${land && land.outcome}`);
    assert.equal(p.hp, hp0); assert.equal(p.store.length, n0 + 1, '칸이 하나 찬다');
  }
  assert.equal(tried, 1, '흰 급강하가 나오는 시드가 있다');
});

test('급강하: 빨간 원 안에 서 있으면 맞고, 내려앉은 자리에서 반대 색 고리가 퍼진다', () => {
  let tried = 0;
  for (let seed = 1; seed <= 12 && tried < 1; seed++) {
    const w = open({ seed });
    const aim = until(w, 'wyrmDiveAim');
    if (aim.color !== 'red') continue;
    tried++;
    const p = w.player, hp0 = p.hp, seen = [];
    until(w, 'wyrmLand', 3, idle, seen);
    assert.ok(p.hp < hp0, '빨간 원 안에서는 맞는다');
    const b = w.boss;
    assert.ok(Math.hypot(b.x - p.x, b.z - p.z) >= RULES.boss.r + RULES.player.bodyR - 1e-6, '몸이 겹치지 않게 밀려난다');
    const wave = w.waves.at(-1);
    assert.ok(wave && wave.color === 'white', '빨간 급강하 뒤에는 흰 고리');
    assert.ok(Math.hypot(wave.x - b.x, wave.z - b.z) < 1e-6);
  }
  assert.equal(tried, 1, '빨간 급강하가 나오는 시드가 있다');
});

test('한 바퀴에 대표 공격이 다 나온다: 불 뿜기 → 날아오르기 → 불줄 → 급강하, 그리고 되풀이한다', () => {
  const w = open(), seen = [];
  runFor(w, 45, wd => { wd.player.hp = RULES.player.hp; return idle; }, seen);
  const order = seen.filter(e => ['wyrmBreath', 'wyrmTakeoff', 'wyrmStrip', 'wyrmDiveAim', 'wyrmLand'].includes(e.type)).map(e => e.type);
  for (const t of ['wyrmBreath', 'wyrmTakeoff', 'wyrmStrip', 'wyrmDiveAim', 'wyrmLand']) assert.ok(order.filter(x => x === t).length >= 2, `${t} ${order.filter(x => x === t).length}번`);
  const i = order.indexOf('wyrmTakeoff');
  assert.deepEqual(order.slice(i, i + 4), ['wyrmTakeoff', 'wyrmStrip', 'wyrmDiveAim', 'wyrmLand']);
  assert.ok(order.indexOf('wyrmBreath') < i, '처음에 불부터 뿜는다');
});

test('2단계에서는 불줄을 두 번 긋는다', () => {
  const w = open({ phase: 2 }), seen = [];
  until(w, 'wyrmLand', 40, idle, seen);
  assert.equal(seen.filter(e => e.type === 'wyrmStrip').length, D2.fly.passes[1]);
  assert.ok(D2.fly.passes[1] > D2.fly.passes[0]);
});

test('불씨: 불줄이 터진 자리에서 느린 탄이 옆으로 흘러나오고, 정한 시간이 지나면 사라진다', () => {
  const w = open();
  until(w, 'wyrmStrip');
  until(w, 'fireBoom', 3);
  runFor(w, 0.6);
  const b = w.bullets, E = D2.fly.strip.ember; let n = 0;
  for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] === RULES.src.strafe) { n++; assert.ok(Math.hypot(b.vx[i], b.vz[i]) <= E.speed + 1e-9, '느리다'); }
  assert.ok(n >= 2, `불씨 ${n}발`);
  runFor(w, E.life + 2.5);
  let left = 0; for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] === RULES.src.strafe) left++;
  assert.equal(left, 0, '수명이 지나면 없다');
});

test('같은 시드는 같은 판이다(결정적)', () => {
  const a = open({ seed: 7 }), b = open({ seed: 7 });
  for (let k = 0; k < 20 / RULES.dt; k++) { step(a, idle); step(b, idle); }
  assert.equal(stateHash(a), stateHash(b));
  assert.match(stateHash(a), /\|y/, '해시에 높이와 상태가 들어간다');
});

test('그로기가 되면 하던 공격을 거두고 땅에서 깨어난다', () => {
  const w = open();
  until(w, 'wyrmBreath');
  w.boss.stagger = RULES.stagger.max - 1;
  hurtFoe(w, w.boss, 1, 'throw');
  w.boss.groggyUntil = w.time + 1;   // 그로기로 민다
  runFor(w, 0.2);
  assert.equal(w.boss.state, 'groggy'); assert.equal(w.boss.act, null);
  const seen = [];
  runFor(w, 12, wd => { wd.player.hp = RULES.player.hp; return idle; }, seen);
  assert.ok(seen.some(e => e.type === 'wake'));
  assert.ok(seen.some(e => e.type.startsWith('wyrm')), '깨어난 뒤 다시 공격한다');
});

// ── 화면의 순수한 부분: 판 고르기 · 자세 · 카메라가 담을 것
import { MODE_GROUPS, readModes, modeQuery } from '../src/view/modes.js';
import { worldOptions } from '../src/view/query.js';
import { dragonPose } from '../src/view/dragonPose.js';
import { framingPoints } from '../src/view/camMath.js';
import { LOOK } from '../src/view/look.js';

test('판 고르기에 있고, 주소로 오간다', () => {
  const Q = s => new URLSearchParams(s);
  assert.ok(MODE_GROUPS.find(g => g.id === 'board').items.some(i => i[0] === 'dragon2'));
  const sel = readModes(Q('boss=dragon2&char=sword'));
  assert.equal(sel.board, 'dragon2');
  assert.equal(modeQuery(sel), 'boss=dragon2&char=sword');
  assert.equal(worldOptions(Q(modeQuery(sel)), () => 0).boss, 'dragon2');
  assert.ok(modeQuery({ ...sel, char: 'gunner', gear: 'all' }).includes('gear=all'), '보스전이라 무기를 고를 수 있다');
});

test('자세: 떠 있으면 다리를 접고, 내리꽂을 때는 머리부터 숙인다. 지금의 용은 그대로다', () => {
  const w = open();
  until(w, 'wyrmStrip'); runFor(w, D2.fly.strip.warn + 0.2);
  let P = dragonPose(w);
  assert.equal(w.boss.state, 'strafe'); assert.equal(P.tuck, 1); assert.ok(P.jaw === 1 && P.pitch > 0);
  until(w, 'wyrmDiveAim');
  runFor(w, D2.dive.warn - D2.dive.drop / 2);
  P = dragonPose(w);
  assert.equal(w.boss.state, 'diveAim'); assert.ok(P.pitch > 0.6, '머리부터'); assert.ok(P.tuck < 1);
  const old = dragonPose(createWorld({ boss: 'dragon' }));
  assert.equal(old.pitch, 0); assert.equal(old.tuck, 0);
});

test('카메라가 담을 것: 떠 있는 만큼 용의 여백이 넓어지고, 깔린 불 원이 다 들어간다', () => {
  const w = open(), wide = { ...LOOK, camera: { ...LOOK.camera, ...LOOK.camera.wide } };
  const r0 = framingPoints(w, wide)[1].r;
  until(w, 'wyrmStrip');
  const pts = framingPoints(w, wide), fires = w.floorAreas.filter(x => x.kind === 'fire');
  assert.ok(pts[1].r > r0 + 3, '뜬 높이만큼');
  for (const f of [fires[0], fires.at(-1)]) assert.ok(pts.some(q => q.x === f.x && q.z === f.z));
  assert.ok(LOOK.camera.wide.maxW > LOOK.camera.maxW);
});
