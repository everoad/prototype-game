// 포격수(네 번째 보스 — 설계 2026-11-19-barrage-siege-design.md, 주소 boss=siege). 수치는 RULES.siege.
// 사용자 2026-11-19(정체성 이야기 앞의 말): "탄막 게임인 만큼 탄 종류나 패턴이 있어야 … 속도나 각도 같은 걸로 다양한 패턴", "다양한 패턴으로 탄 채울 기회를 줄 수 있다",
//   "맵 크기도 크게 키우고 보스가 엄청 멀리 떨어져서 … 유저가 다 피해서 다가오게 … 빠르게 거리를 벌렸다가 좁혔다가 하면 카메라도 줌인 줌아웃 쫙쫙".
// 수호자의 둥근 몸을 쓰고, 판(넓다) · 두뇌(짜인 차례) · 장면 여섯이 다르다. 지금의 보스 셋은 한 틱도 바뀌지 않는다.
// 장면(하나씩 혼자 나온다 — 바탕 탄막 없음):
//   walls  포격전      멀리 물러나 느린 탄의 벽을 겹겹이 보낸다. 벽마다 빈 곳 하나(멀다) · 흰 탄이 막은 틈 하나(가깝다) — 받아치며 곧게 가거나 빈 곳을 찾아 누빈다
//   pounce 덮치기      내 자리로 뛰어올라 떨어지고(흰 · 빨강) 바로 근접 콤보(2단계는 긴 콤보)
//   chain  색 순서 고리 빨>흰>흰>빨 같은 순서로 고리가 잇달아 퍼진다 — 구르기와 받아치기를 번갈아
//   whirl  회오리      판 가운데로 뛰어가 팔 여럿이 천천히 돈다 — 팔 사이에서 같이 돈다. 팔의 앞머리에 붙으면 흰 탄을 받는다
//   shells 터지는 포탄 포탄이 포물선으로 떨어져(빨간 원) 큰 탄 여섯으로, 그것이 다시 작은 탄의 고리로 터진다. 흰 탄만 떨어진 자리(눈)로 되돌아온다 — 불꽃의 한가운데로 들어가야 받는다
//   bombs  폭탄 밭     내 둘레에 빨간 원 수십 개가 한꺼번에 — 흰 원 하나(받아친다)와 빈 곳 하나
// 흰색에는 값이 있다(사용자: 흰 탄이 나를 찾아오면 "따라가서 대기"한다): 자리(눈 · 흰 원 · 팔의 앞머리)나 박자(고리 사이)를 치러야 받는다.
// 상태: idle(숨) → leap(도약) → walls / whirl · pounce → melee · chain · shells · bombs · 끼어듦(bossCore: 그로기 · 깨어남 · 단계)
// 장면은 수호자 + 장면 판(boss=ranged2 — brain.js)도 쓴다: initScenes · startScene · runScene · dropScene · updateFades. 장면이 끝나면 rest가 숨을 재고 idle로 돌린다.
import { emit } from './events.js';
import { K } from './rules.js';
import { clampToBoard, inCircle } from './geom.js';
import { spawnBullet, killBullet, clearBullets } from './bullets.js';
import { addLane } from './patterns.js';
import { updateCombo, resolveHit } from './melee.js';
import { dist, between, setState, cancelAll, settleRed, interrupts, startMelee } from './bossCore.js';
import { separateBodies } from './boss.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toPlayer = w => Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x);
const ease = u => u * u * (3 - 2 * u);
const circle = (kind, x, z, R, color, warn, now) => ({ kind, shape: 'circle', x, z, face: 0, R, half: Math.PI, color, warn, born: now, hit: false });

// 이 판의 규칙: 바탕 규칙에 판 크기와 시작 자리만 바꾼 것(나머지는 같은 값을 같이 쓴다 — 수치 패널도 그대로 듣는다)
export const siegeRules = r => ({ ...r, board: r.siege.board, start: r.siege.start });

// 장면이 쓰는 보스의 칸: alt = 뛰어오른 높이(화면 · 해시), lift = 뛰는 중(밑을 밀지 않는다), act = 하는 장면, queue = 앞으로 할 장면, fades = 터진 뒤 잠깐 남는 원
export function initScenes(b) { Object.assign(b, { alt: 0, lift: false, act: null, queue: [], fades: [] }); }
// 장면의 빨강을 수호자의 빨간 예산(bossCore.redOk)에 적는다 — 포격수는 예산을 쓰지 않는다(지금 그대로)
function noteRed(w) { if (w.boss.mix) w.boss.redTimes.push(w.time); }

export function initSiege(w) {
  const b = w.boss, B = w.rules.brain, S = w.rules.siege;
  Object.assign(b, {
    siege: true, hp: S.hp, maxHp: S.hp,
    state: 'idle', stateAt: 0, breathUntil: S.rest[0], phase: 1, last: null,
    redTimes: [], redPending: null, redSince: 0, stunUntil: -1, wasDown: null, run: null, runs: [], mainRun: null, calmUntil: -1,
    alt: 0, lift: false, act: null, queue: [...S.opening], fades: [],   // alt = 뛰어오른 높이(화면 · 해시), lift = 뛰는 중(밑을 밀지 않는다), act = 하는 장면, queue = 앞으로 할 장면, fades = 터진 뒤 잠깐 남는 원
  });
  if (w.opts.phase === 2) { b.hp = b.maxHp * B.phaseAt; b.phase = 2; }
}

function dropArea(w, a) { const i = w.floorAreas.indexOf(a); if (i >= 0) w.floorAreas.splice(i, 1); }
function fade(w, area, sec) { w.boss.fades.push({ area, until: w.time + sec }); }
export function updateFades(w) {
  const f = w.boss.fades;
  for (let k = f.length - 1; k >= 0; k--) if (w.time >= f[k].until - 1e-9) { dropArea(w, f[k].area); f.splice(k, 1); }
}
function fire(w, kind, x, z, angle, speed, src, extra = null) {
  const id = spawnBullet(w, kind, x, z, angle, speed, src);
  if (id >= 0) emit(w, 'fire', { kind, x, z, id, src, ...extra });
  return id;
}
// 느린 흰 탄: 흰 탄의 한 속도(bullets.parrySpeed) 대신 둘레의 보라 탄과 같은 빠르기로 — 벽에 박힌 채로, 팔의 앞머리에 붙은 채로 와야 뜻이 있다("일부러 느린 탄").
// 느려서 읽을 시간은 넉넉하니 가까이 생길 때의 멈춤(0.4초 규칙)도 두지 않는다.
function fireSlowWhite(w, x, z, angle, speed, src, extra = null) {
  const id = fire(w, K.WHITE, x, z, angle, speed, src, extra), B = w.bullets, sp = speed * (w.rules.bullets.speedMul ?? 1);
  if (id >= 0) { B.vx[id] = Math.cos(angle) * sp; B.vz[id] = Math.sin(angle) * sp; B.holdUntil[id] = 0; }
  return id;
}

// 하던 것을 내려놓는다(그로기 · 단계 넘어감): 땅으로, 깔린 원도 거둔다(화면 목록은 cancelAll이 비운다). 차례(queue)는 그대로 — 깨어나면 다음 장면부터 잇는다.
export function dropScene(w) { const b = w.boss; b.act = null; b.fades.length = 0; b.alt = 0; b.lift = false; }
const drop = dropScene;

function enterPhase2(w) {
  const b = w.boss;
  b.phase = 2;
  drop(w); cancelAll(w);
  clearBullets(w, 0, 0, Infinity);
  emit(w, 'phase', { n: 2, x: b.x, z: b.z });
  setState(w, 'phaseChange');
}

function rest(w, extra = 0) { const b = w.boss; b.act = null; b.breathUntil = w.time + between(w, w.rules.siege.rest) + extra; setState(w, 'idle'); }

function next(w) {
  const b = w.boss, S = w.rules.siege;
  if (!b.queue.length) b.queue.push(...S.cycle);
  const name = b.queue.shift();
  b.last = name;
  startScene(w, name);
}
// 그 장면을 시작한다(앞에 도약이 붙는 장면은 뛰기부터)
export function startScene(w, name) { emit(w, 'siegeScene', { name }); SCENES[name](w); }

// ── 도약: 한 번에 그 자리로(멀수록 조금 길게). 뛰는 동안은 떠 있어 밑을 밀지 않는다. 내려앉으면 then 장면을 시작한다.
function leap(w, tx, tz, then, carry = null) {   // carry = 내려앉아서 이어 갈 것(포격전의 남은 벽)
  const b = w.boss, L = w.rules.siege.leap, d = Math.hypot(tx - b.x, tz - b.z);
  if (d < L.min) return AFTER[then](w, carry);
  b.lift = true;
  b.act = { kind: 'leap', fx: b.x, fz: b.z, tx, tz, then, carry, sec: Math.max(L.sec[0], Math.min(L.sec[1], d / L.speed)) };
  emit(w, 'siegeLeap', { x: b.x, z: b.z, tx, tz, sec: b.act.sec });
  setState(w, 'leap');
}
// 물러날 자리: 판 네 변의 가운데(벽에서 inset) 가운데 나에게서 가장 먼 곳 — 거기서 쏘는 벽이 판을 가로지른다
function farSpot(w) {
  const R = w.rules, L = R.siege.leap, p = w.player, hx = R.board.hx - L.inset, hz = R.board.hz - L.inset;
  let best = null, bd = -1;
  for (const [x, z] of [[hx, 0], [-hx, 0], [0, hz], [0, -hz]]) { const d = Math.hypot(x - p.x, z - p.z); if (d > bd + 1e-9) { bd = d; best = [x, z]; } }
  return best;
}

// ── 포격전
function startWalls(w) {
  const b = w.boss, Wl = w.rules.siege.walls;
  b.act = { kind: 'walls', k: 0, nextAt: w.time + Wl.lead, lastAt: 0, side: w.rng.next() < 0.5 ? 1 : -1, hops: 0 };
  emit(w, 'windup', { color: 'white', kind: 'walls' });
  setState(w, 'walls');
}
// 다시 물러나 내려앉았다: 남은 벽을 잇는다
function resumeWalls(w, a) {
  const b = w.boss;
  a.nextAt = w.time + w.rules.siege.walls.hopLead;
  b.act = a;
  emit(w, 'windup', { color: 'white', kind: 'walls' });
  setState(w, 'walls');
}
// 벽 하나: 보스를 지나고 나를 향한 쪽에 수직인 줄. 줄 위의 자리는 내 쪽 줄에서 옆으로 잰 거리 s — 나는 s = 0에 있다.
function fireWall(w, a) {
  const b = w.boss, R = w.rules, Wl = R.siege.walls;
  const ang = toPlayer(w), tx = -Math.sin(ang), tz = Math.cos(ang);
  let lo = -60, hi = 60;   // 줄이 판 안에 있는 범위
  for (const [o, d, h] of [[b.x, tx, R.board.hx - 0.3], [b.z, tz, R.board.hz - 0.3]]) {
    if (Math.abs(d) < 1e-9) continue;
    const s1 = (-h - o) / d, s2 = (h - o) / d;
    lo = Math.max(lo, Math.min(s1, s2)); hi = Math.min(hi, Math.max(s1, s2));
  }
  const fit = (s, half) => Math.max(lo + half, Math.min(hi - half, s));
  const free = fit(a.side * between(w, Wl.far), Wl.gap / 2), plugAt = fit(-a.side * between(w, Wl.plug), Wl.plugGap / 2);
  const plug = a.k % Wl.whiteEvery === 0 && Math.abs(plugAt - free) >= Wl.gap / 2 + Wl.spacing ? plugAt : null;   // 흰 탄이 막은 틈은 몇 벽에 한 번
  for (let s = lo + Wl.spacing / 2; s < hi; s += Wl.spacing) {
    if (Math.abs(s - free) < Wl.gap / 2 || (plug != null && Math.abs(s - plug) < Wl.plugGap / 2)) continue;
    fire(w, K.NORMAL, b.x + tx * s, b.z + tz * s, ang, Wl.speed, R.src.walls);
  }
  if (plug != null) fireSlowWhite(w, b.x + tx * plug, b.z + tz * plug, ang, Wl.speed, R.src.walls);   // 흰 탄은 벽과 같이 온다
  emit(w, 'siegeWall', { x: b.x, z: b.z, angle: ang, free, plug, k: a.k, from: [b.x + tx * lo, b.z + tz * lo], to: [b.x + tx * hi, b.z + tz * hi] });
}

// ── 폭탄 밭
function startBombs(w) {
  const b = w.boss, Bm = w.rules.siege.bombs;
  b.act = { kind: 'bombs', k: 0, nextAt: w.time + Bm.gap, cells: null, white: null, hole: null, T: 0, born: 0, cx: 0, cz: 0 };
  emit(w, 'windup', { color: 'red', kind: 'bombs' });
  setState(w, 'bombs');
}
// 내게서 [lo, hi] 거리의 자리(벽에서 edge 안쪽). away = 이 각에서 apart 넘게 벌어진 쪽을 찾는다(못 찾으면 가장 벌어진 것). 판 구석이라 하나도 없으면 판 가운데 쪽.
function spotNear(w, [lo, hi], edge, away = null, apart = 0) {
  const R = w.rules, p = w.player;
  let best = null, bd = -1;
  for (let t = 0; t < 24; t++) {
    const ang = w.rng.next() * TAU, d = lo + w.rng.next() * (hi - lo), x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
    if (Math.abs(x) > R.board.hx - edge || Math.abs(z) > R.board.hz - edge) continue;
    const sep = away == null ? Infinity : Math.abs(wrap(ang - away));
    if (sep >= apart) return { x, z, ang };
    if (sep > bd) { bd = sep; best = { x, z, ang }; }
  }
  if (best) return best;
  const ang = Math.atan2(-p.z, -p.x), d = (lo + hi) / 2;
  return { x: p.x + Math.cos(ang) * d, z: p.z + Math.sin(ang) * d, ang };
}
function salvo(w, a) {
  const b = w.boss, R = w.rules, Bm = R.siege.bombs, p = w.player, now = w.time, warn = Bm.warn[b.phase - 1];
  const W = spotNear(w, Bm.at, Bm.edge), H = spotNear(w, Bm.at, Bm.edge, W.ang, Bm.apartDeg * DEG);
  const cx = p.x, cz = p.z, cells = [], hx = R.board.hx, hz = R.board.hz;
  const put = (x, z) => {   // 판을 조금 벗어난 자리는 판 끝으로 당긴다(벽 곁에 빈 틈이 남지 않게)
    if (Math.abs(x) > hx + Bm.R || Math.abs(z) > hz + Bm.R) return;
    cells.push(circle('bomb', Math.max(-hx, Math.min(hx, x)), Math.max(-hz, Math.min(hz, z)), Bm.R, 'red', warn, now));
  };
  // 벌집으로 깐다. 흰 원 · 빈 곳의 둘레(keep 안)는 비우고
  const rowH = Bm.step * Math.sqrt(3) / 2, n = Math.ceil(Bm.field / rowH);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = cx + i * Bm.step + (j & 1 ? Bm.step / 2 : 0), z = cz + j * rowH;
    if (Math.hypot(x - cx, z - cz) > Bm.field) continue;
    if (Math.hypot(x - W.x, z - W.z) < Bm.white.keep || Math.hypot(x - H.x, z - H.z) < Bm.hole.keep) continue;
    put(x, z);
  }
  // 그 둘레에 테를 두른다 — 흰 원과 빈 곳이 또렷한 동그라미로 남고, 그 밖에는 설 틈이 없다
  for (const [c, keep, other, otherKeep] of [[W, Bm.white.keep, H, Bm.hole.keep], [H, Bm.hole.keep, W, Bm.white.keep]]) {
    const m = Math.ceil(TAU * keep / (Bm.R * 1.35));
    for (let k = 0; k < m; k++) {
      const x = c.x + Math.cos(k * TAU / m) * keep, z = c.z + Math.sin(k * TAU / m) * keep;
      if (Math.hypot(x - other.x, z - other.z) < otherKeep) continue;
      put(x, z);
    }
  }
  const white = circle('bomb', W.x, W.z, Bm.white.R, 'white', warn, now);
  w.floorAreas.push(...cells, white);
  Object.assign(a, { cells, white, hole: { x: H.x, z: H.z }, T: now + warn, born: now, cx, cz });
  emit(w, 'siegeBombs', { x: cx, z: cz, n: cells.length, white: { x: W.x, z: W.z, R: Bm.white.R }, hole: { x: H.x, z: H.z }, T: a.T });
}
function blast(w, a) {
  const R = w.rules, Bm = R.siege.bombs, p = w.player, W = a.white, body = R.player.bodyR;
  let outcome = 'miss', red = false;
  w.redHitAt = w.time; noteRed(w);
  W.hit = true;
  if (inCircle(p.x, p.z, body, W.x, W.z, W.R)) outcome = resolveHit(w, { color: 'white', src: R.src.bombs, dmg: Bm.dmg, stagger: Bm.white.stagger, kindName: 'bomb', x: W.x, z: W.z }).outcome;
  for (const c of a.cells) {
    c.hit = true;
    if (!red && inCircle(p.x, p.z, body, c.x, c.z, c.R)) { red = true; resolveHit(w, { color: 'red', src: R.src.bombs, dmg: Bm.dmg, stagger: [0, 0], kindName: 'bomb', x: c.x, z: c.z }); }
  }
  emit(w, 'bombsBlast', { x: a.cx, z: a.cz, R: Bm.R, cells: a.cells.map(c => [c.x, c.z]), white: { x: W.x, z: W.z, R: W.R }, outcome });
  for (const c of a.cells) fade(w, c, Bm.linger);
  fade(w, W, Bm.linger);
  a.cells = null; a.white = null; a.k++; a.nextAt = w.time + Math.max(Bm.gap, Bm.linger);
}

// ── 색 순서 고리
function startChain(w) {
  const b = w.boss, R = w.rules, Ch = R.siege.chain, list = Ch.seqs[b.phase - 1], seq = list[w.rng.int(list.length)];
  const area = { ...circle('wave', b.x, b.z, R.boss.r + R.floor.wave.teleR, seq[0], Ch.warn, w.time), face: toPlayer(w) };
  w.floorAreas.push(area);
  b.act = { kind: 'chain', seq, k: 0, nextAt: w.time + Ch.warn, lastAt: 0, area };
  emit(w, 'windup', { color: seq[0], kind: 'wave' });
  emit(w, 'siegeChain', { x: b.x, z: b.z, seq });
  setState(w, 'chain');
}

// ── 회오리
function startWhirl(w) {
  const b = w.boss, Wh = w.rules.siege.whirl, arms = Wh.arms[b.phase - 1], T0 = w.time + Wh.windup, dur = Wh.dur[b.phase - 1];
  const ang = wrap(toPlayer(w) + Math.PI / arms), dir = w.rng.next() < 0.5 ? 1 : -1;   // 첫 팔은 나를 비껴서 — 나는 팔 사이의 한가운데에서 시작한다
  b.act = { kind: 'whirl', arms, ang, dir, T0, until: T0 + dur, flipAt: Wh.flip[b.phase - 1] ? T0 + dur / 2 : Infinity, flipped: false, nextAt: T0, nextWhite: T0 + Wh.white.every };
  b.face = ang;
  emit(w, 'windup', { color: 'purple', kind: 'whirl' });
  emit(w, 'siegeWhirl', { x: b.x, z: b.z, arms, dir });
  setState(w, 'whirl');
}

// ── 터지는 포탄
function startShells(w) {
  const b = w.boss;
  b.act = { kind: 'shells', k: 0, nextAt: w.time + 0.35, list: [] };
  emit(w, 'windup', { color: 'purple', kind: 'shells' });
  setState(w, 'shells');
}
// 포탄 하나를 쏘아 올린다: 떨어질 자리 = 내게서 at 거리, 보스 쪽 ± swingDeg(다가가는 쪽). 앞 포탄의 자리와 떨어지게.
function lob(w, a) {
  const b = w.boss, R = w.rules, Sh = R.siege.shells, p = w.player, now = w.time;
  const toB = Math.atan2(b.z - p.z, b.x - p.x), live = a.list.filter(s => s.stage !== 'done');
  let C = null;
  for (let t = 0; t < 20 && !C; t++) {
    const ang = toB + (w.rng.next() * 2 - 1) * (t < 10 ? Sh.swingDeg : 180) * DEG, d = between(w, Sh.at), x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
    if (Math.abs(x) > R.board.hx - Sh.edge || Math.abs(z) > R.board.hz - Sh.edge) continue;
    if (Math.hypot(x - b.x, z - b.z) < R.boss.r + Sh.impact.R + 0.5) continue;
    if (live.some(s => Math.hypot(x - s.x, z - s.z) < Sh.apart)) continue;
    C = { x, z };
  }
  if (!C) { const ang = Math.atan2(-p.z, -p.x); C = { x: p.x + Math.cos(ang) * Sh.at[0], z: p.z + Math.sin(ang) * Sh.at[0] }; }   // 구석에 몰려 자리가 없다: 판 가운데 쪽
  const area = circle('impact', C.x, C.z, Sh.impact.R, 'red', Sh.fly, now);
  w.floorAreas.push(area);
  a.list.push({ x: C.x, z: C.z, fx: b.x, fz: b.z, born: now, T: now + Sh.fly, stage: 'fly', area, mids: [], eye: null, T2: 0, T3: 0 });
  emit(w, 'shellLob', { x: b.x, z: b.z, tx: C.x, tz: C.z, sec: Sh.fly });
}
function landShell(w, s) {
  const R = w.rules, Sh = R.siege.shells, p = w.player, B = w.bullets, now = w.time;
  s.area.hit = true; w.redHitAt = now; noteRed(w);
  if (inCircle(p.x, p.z, R.player.bodyR, s.x, s.z, Sh.impact.R)) resolveHit(w, { color: 'red', src: R.src.shells, dmg: Sh.impact.dmg, stagger: [0, 0], kindName: 'shell', x: s.x, z: s.z });
  fade(w, s.area, Sh.impact.linger);
  // 큰 탄: 내 쪽은 늘 큰 탄 사이의 한가운데(나를 겨눈 것이 없다 — 곧장 걸어 들어갈 길이 난다)
  const toP = Math.atan2(p.z - s.z, p.x - s.x), i0 = w.rng.int(Sh.mids), every = Sh.back > 0 ? Math.round(Sh.mids / Sh.back) : 0;
  for (let i = 0; i < Sh.mids; i++) {
    const ang = toP + (i + 0.5) * TAU / Sh.mids, id = fire(w, K.NORMAL, s.x + Math.cos(ang) * 0.3, s.z + Math.sin(ang) * 0.3, ang, Sh.midSpeed, R.src.shells);
    if (id < 0) continue;
    B.r[id] = Sh.midR;
    s.mids.push({ id, born: now, back: every > 0 && ((i - i0 + Sh.mids) % Sh.mids) % every === 0 });   // back = 다시 터질 때 흰 탄을 눈으로 되돌려 보낸다
  }
  s.eye = circle('eye', s.x, s.z, Sh.eye.R, 'white', Sh.split + Sh.eye.lead, now);   // 눈: 판정이 없는 표시 — 흰 탄이 닿는 때에 다 찬다
  w.floorAreas.push(s.eye);
  s.stage = 'mids'; s.T2 = now + Sh.split;
  emit(w, 'shellLand', { x: s.x, z: s.z });
}
// 큰 탄이 다시 터진다: 작은 탄의 고리. 눈을 향한 한 발은 흰 탄(back인 것만) — 나머지는 그 한 발을 비워 눈으로는 보라 탄이 가지 않는다.
function splitShell(w, s) {
  const R = w.rules, Sh = R.siege.shells, B = w.bullets, now = w.time;
  for (const m of s.mids) {
    if (!B.alive[m.id] || B.born[m.id] !== m.born) continue;   // 그사이 지워진 큰 탄(맞힘 · 판 밖)
    const x = B.x[m.id], z = B.z[m.id], home = Math.atan2(s.z - z, s.x - x);
    killBullet(w, m.id);
    for (let j = 0; j < Sh.ring; j++) {
      if (j === 0 && !m.back) continue;
      fire(w, j === 0 ? K.WHITE : K.NORMAL, x, z, home + j * TAU / Sh.ring, Sh.ringSpeed, R.src.shells);
    }
    emit(w, 'shellBurst', { x, z, white: m.back });
  }
  s.stage = 'eye'; s.T3 = now + Sh.eye.lead;
}
function updateShells(w, a) {
  const Sh = w.rules.siege.shells, now = w.time;
  for (const s of a.list) {
    if (s.stage === 'fly' && now >= s.T - 1e-9) landShell(w, s);
    else if (s.stage === 'mids' && now >= s.T2 - 1e-9) splitShell(w, s);
    else if (s.stage === 'eye' && now >= s.T3 - 1e-9) { s.eye.hit = true; fade(w, s.eye, Sh.eye.linger); s.stage = 'done'; }
  }
}

// ── 덮치기
function startPounce(w) {
  const b = w.boss, R = w.rules, Pn = R.siege.pounce, p = w.player;
  const color = w.rng.next() < Pn.white ? 'white' : 'red';
  const [x, z] = clampToBoard(R, p.x, p.z, R.boss.r);
  const area = circle('pounce', x, z, Pn.R, color, Pn.warn, w.time);
  w.floorAreas.push(area);
  b.lift = true;
  b.act = { kind: 'pounce', area, fx: b.x, fz: b.z };
  emit(w, 'windup', { color, kind: 'pounce' });
  emit(w, 'siegePounce', { x, z, color });
  setState(w, 'pounce');
}
// 떨어지는 순간: 원 안이면 판정(흰 = 받아칠 수 있다 · 빨강 = 구르기만). 곧바로 근접 콤보.
function slam(w) {
  const b = w.boss, R = w.rules, Pn = R.siege.pounce, p = w.player, A = b.act.area;
  b.x = A.x; b.z = A.z; b.alt = 0; b.lift = false; A.hit = true;
  if (A.color === 'red') { w.redHitAt = w.time; noteRed(w); }
  let outcome = 'miss';
  if (inCircle(p.x, p.z, R.player.bodyR, A.x, A.z, A.R)) outcome = resolveHit(w, { color: A.color, src: R.src.pounce, dmg: Pn.dmg, stagger: Pn.stagger, kindName: 'pounce', x: A.x, z: A.z }).outcome;
  emit(w, 'siegeSlam', { x: b.x, z: b.z, color: A.color, outcome });
  separateBodies(w);
  fade(w, A, Pn.linger);
  if (w.result) return;
  const list = Pn.combos[b.phase - 1];
  b.act = null;
  b.next = { melee: list[w.rng.int(list.length)] };
  startMelee(w);
}

const SCENES = {
  walls: w => (dist(w) < w.rules.siege.walls.from ? leap(w, ...farSpot(w), 'walls') : startWalls(w)),
  whirl: w => leap(w, 0, 0, 'whirl'),
  pounce: startPounce, chain: startChain, shells: startShells, bombs: startBombs,
};
const AFTER = { walls: startWalls, whirl: startWhirl, more: resumeWalls };

// 장면의 한 틱. 보스의 상태가 장면의 것이 아니면 아무것도 하지 않고 false.
export function runScene(w) {
  const b = w.boss, R = w.rules, S = R.siege, now = w.time, since = now - b.stateAt;
  switch (b.state) {
    case 'leap': {
      const a = b.act, L = S.leap, u = Math.min(1, since / a.sec), e = ease(u);
      b.x = a.fx + (a.tx - a.fx) * e; b.z = a.fz + (a.tz - a.fz) * e;
      b.alt = 4 * L.hop * u * (1 - u);
      b.face = toPlayer(w);
      if (u >= 1) {
        b.x = a.tx; b.z = a.tz; b.alt = 0; b.lift = false; b.act = null;
        emit(w, 'siegeLand', { x: b.x, z: b.z });
        separateBodies(w);
        AFTER[a.then](w, a.carry);
      }
      break;
    }
    case 'walls': {
      const a = b.act, Wl = S.walls, n = Wl.n[b.phase - 1];
      b.face = toPlayer(w);
      if (a.k >= 1 && a.k < n && dist(w) < Wl.close) {   // 벽을 뚫고 다가왔다: 남은 벽은 쏘지 않는다 — 2단계에는 한 번 더 멀리 물러나 마저 쏜다
        if (a.hops < Wl.hops[b.phase - 1]) { a.hops++; leap(w, ...farSpot(w), 'more', a); } else rest(w);
        break;
      }
      if (a.k < n && now >= a.nextAt - 1e-9) {
        fireWall(w, a);
        a.k++; a.lastAt = now; a.nextAt += Wl.every; a.side = -a.side;
        if (b.phase === 2 && Wl.spearAfter.includes(a.k)) { addLane(w, { id: R.src.walls }, K.RED, toPlayer(w), true, Wl.spearSpeed); noteRed(w); }   // 느린 벽 사이로 빠른 창
      }
      if (a.k >= n && now >= a.lastAt + Wl.tail) rest(w);
      break;
    }
    case 'bombs': {
      const a = b.act, Bm = S.bombs, n = Bm.n[b.phase - 1];
      b.face = toPlayer(w);
      if (a.cells) { if (now >= a.T - 1e-9) blast(w, a); }
      else if (now >= a.nextAt - 1e-9) { if (a.k < n) salvo(w, a); else rest(w); }
      break;
    }
    case 'chain': {
      const a = b.act, Ch = S.chain;
      b.face = toPlayer(w);
      if (a.k < a.seq.length && now >= a.nextAt - 1e-9) {
        if (a.area) { dropArea(w, a.area); a.area = null; }
        const color = a.seq[a.k];
        w.waves.push({ x: b.x, z: b.z, r: R.boss.r, color, born: now, hitDone: false, gapAngle: null, arc: null });
        emit(w, 'waveStart', { color, x: b.x, z: b.z });
        if (color === 'red') noteRed(w);
        a.k++; a.lastAt = now; a.nextAt += Ch.gap[b.phase - 1];
        if (a.k < a.seq.length) emit(w, 'windup', { color: a.seq[a.k], kind: 'wave' });   // 다음 고리의 색으로 몸이 번쩍인다
      }
      if (a.k >= a.seq.length && now >= a.lastAt + Ch.end) rest(w);
      break;
    }
    case 'whirl': {
      const a = b.act, Wh = S.whirl, m = R.patterns.muzzle;
      if (now < a.T0 - 1e-9) break;
      if (!a.flipped && now >= a.flipAt - 1e-9) { a.flipped = true; a.dir = -a.dir; emit(w, 'siegeWhirlFlip', { x: b.x, z: b.z, dir: a.dir }); }
      a.ang = wrap(a.ang + a.dir * Wh.turn[b.phase - 1] * DEG * R.dt);
      b.face = a.ang;
      while (a.nextAt < a.until && now >= a.nextAt - 1e-9) {
        a.nextAt += Wh.every;
        for (let k = 0; k < a.arms; k++) { const ang = a.ang + k * TAU / a.arms; fire(w, K.NORMAL, b.x + Math.cos(ang) * m, b.z + Math.sin(ang) * m, ang, Wh.speed, R.src.whirl); }
      }
      if (a.nextWhite < a.until && now >= a.nextWhite - 1e-9) {   // 팔의 앞머리(도는 쪽으로 aheadDeg 앞)에서 흰 탄 — 팔과 같은 빠르기라 어느 거리에서도 팔의 바로 앞에 붙어 온다
        a.nextWhite += Wh.white.every;
        for (let k = 0; k < a.arms; k++) { const arm = a.ang + k * TAU / a.arms, ang = arm + a.dir * Wh.white.aheadDeg * DEG; fireSlowWhite(w, b.x + Math.cos(ang) * m, b.z + Math.sin(ang) * m, ang, Wh.speed, R.src.whirl, { arm }); }
      }
      if (now >= a.until) rest(w);
      break;
    }
    case 'shells': {
      const a = b.act, Sh = S.shells, n = Sh.n[b.phase - 1];
      b.face = toPlayer(w);
      if (a.k < n && now >= a.nextAt - 1e-9) { lob(w, a); a.k++; a.nextAt += Sh.gap[b.phase - 1]; }
      updateShells(w, a);
      if (a.k >= n && a.list.every(s => s.stage === 'done')) rest(w, Sh.end);
      break;
    }
    case 'pounce': {
      const a = b.act, Pn = S.pounce, A = a.area, T = A.born + A.warn, p = w.player;
      if (now < T - Pn.lockBefore) [A.x, A.z] = clampToBoard(R, p.x, p.z, R.boss.r);
      const u = Math.min(1, (now - A.born) / A.warn), e = ease(u);
      b.x = a.fx + (A.x - a.fx) * e; b.z = a.fz + (A.z - a.fz) * e;
      b.alt = 4 * Pn.hop * u * (1 - u);
      if (Math.hypot(A.x - b.x, A.z - b.z) > 0.3) b.face = Math.atan2(A.z - b.z, A.x - b.x);
      if (now >= T - 1e-9) slam(w);
      break;
    }
    default:
      return false;
  }
  return true;
}

export function thinkSiege(w) {
  const b = w.boss, B = w.rules.brain, now = w.time;
  if (!w.opts.ai || w.result) return;
  if (b.dead) { b.alt = 0; b.lift = false; setState(w, 'dead'); return; }
  updateFades(w);
  if (!b.lift && interrupts(w, enterPhase2)) { if (b.state === 'groggy' || b.state === 'stun') drop(w); return; }   // 뛰는 중에는 내려앉은 뒤에 끼어든다
  switch (b.state) {
    case 'wake':
      b.face = toPlayer(w);
      if (now - b.stateAt >= B.wake) rest(w, B.wakeBreath);
      break;
    case 'idle':
      b.face = toPlayer(w);
      if (now >= b.breathUntil) next(w);
      break;
    case 'melee':
      if (updateCombo(w)) { settleRed(w); rest(w); }
      break;
    default:
      if (!runScene(w)) rest(w);
  }
}
