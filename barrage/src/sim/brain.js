// 보스 두뇌(§5): 상태 기계와 고르기.
// 상태: idle(숨) → [hop] → windup → pattern → idle … / rush → melee → idle / melee(가까울 때 바로)
//       floorWait(주 패턴 꼬리가 끝나길 기다림) → floor(박치기·파도·검기, 파도는 플레이어에 닿을 때까지) → idle
//       meleeWait(꼬리 기다림, 제자리) → melee(탄을 지우고 1:1) → idle
//       끼어듦: stun(반격 기회·자동 반격) · groggy → wake(0.4초) → 숨 0.6초 이상 · phaseChange · dead
// 박자(§5.5): 앞 패턴이 끝나기 overlap초 전부터 숨을 재고, 그 뒤 다음 준비 — 앞 run은 runs 목록에서 끝까지 돈다.
// 움직임(§5.2): 쏘는 동안에도 플레이어 둘레를 돌며 거리를 맞춘다(준비 중 절반, 근접·장판·멈춤 중엔 안 움직임).
// 빨간 예산(§5.6): 빨간 빠른 공격(빨간 박치기·파도·검기, 레이저, 빨간 내려찍기)은 어느 redWindow초 안에도 redMax번까지 —
//   고를 때 타격 예정 시각을 어림해 redTimes에 적고, 넘치면 빨강 → 흰(장판) · 다른 패턴(레이저) · 콤보 A(콤보 B)로 바꾼다.
import { emit } from './events.js';
import { clampToBoard } from './geom.js';
import { clearBullets } from './bullets.js';
import { bossGroggy, separateBodies } from './boss.js';
import { PATTERNS, startPattern, updatePattern, windupColor } from './patterns.js';
import { startRush, updateRush, startCombo, updateCombo } from './melee.js';
import { clearBeams } from './beams.js';
import { startSlam, startWave, startSword, updateFloor, clearFloor } from './floor.js';

const dist = w => Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
const between = (w, [lo, hi]) => lo + w.rng.next() * (hi - lo);

export function initBrain(w) {
  const b = w.boss, B = w.rules.brain;
  Object.assign(b, {
    state: 'idle', stateAt: 0, breathUntil: B.breath[0], phase: 1, last: null, opening: 0,
    farFor: 0, floorAt: B.floorEvery[0], redTimes: [], redPending: null, redSince: 0, picks2: 0, introduced: [], stunUntil: -1, wasDown: null, run: null, runs: [],
    orbitDir: 1, flipAt: between(w, B.flip), flipOk: 0, hopUntil: -1, hopX: 0, hopZ: 0, calmUntil: -1,
  });
  if (w.opts.phase === 2) { b.hp = Math.min(b.hp, b.maxHp * B.phaseAt); enterPhase2(w, false); }
  if (w.opts.pattern) b.opening = B.opening.length;
}

function setState(w, s) { w.boss.state = s; w.boss.stateAt = w.time; }

// 하던 것을 모두 끊는다(패턴·차선·빔·장판 공격·파도·돌진·근접 장판). 이미 날아간 탄은 그대로. 오지 않을 빨간 예정도 지운다.
function cancelAll(w) {
  const b = w.boss;
  b.run = null; b.runs.length = 0; b.mainRun = null;
  w.lanes.length = 0;
  clearBeams(w);
  clearFloor(w);
  w.melee.rush = null; w.melee.combo = null; w.melee.areas.length = 0;
  b.redTimes = b.redTimes.filter(t => t <= w.time);
  b.redPending = null;
}

// 빨간 예산: 타격 예정 T 둘레 ±(창 + 여유)에 이미 redMax개면 안 된다(이러면 어느 창에도 redMax개를 넘지 않는다).
function redOk(w, T) {
  const F = w.rules.floor, b = w.boss, span = F.redWindow + F.redSlack;
  b.redTimes = b.redTimes.filter(t => t > w.time - span);
  return b.redTimes.filter(t => Math.abs(t - T) <= span).length < F.redMax;
}
// 예정해 둔 빨간 공격이 끝나면 예정 시각을 실제로 닿은 시각(w.redHitAt — floor.js·melee.js가 적음)으로 바꾼다.
// 플레이어가 달아나 파도·박치기가 늦게 닿아도 다음 고르기가 실제 시각으로 센다.
function plan(w, T) { const b = w.boss; b.redTimes.push(T); b.redPending = T; b.redSince = w.time; }
function settleRed(w) {
  const b = w.boss;
  if (b.redPending == null) return;
  const i = b.redTimes.indexOf(b.redPending);
  if (i >= 0 && (w.redHitAt ?? -1) >= b.redSince) b.redTimes[i] = w.redHitAt;
  b.redPending = null;
}
// 콤보 시작부터 첫 빨간 타까지(없으면 null)
function comboRedAt(R, name) {
  let t = 0;
  for (const [kind, color] of R.combos[name]) { t += R.melee[kind].warn; if (color === 'red') return t; t += R.melee.active + R.melee.recover; }
  return null;
}
// 콤보 B가 예산을 넘으면 A. rush면 웅크림 + 달리기 시간만큼 늦게 닿는다.
function budgetCombo(w, name, rush) {
  const R = w.rules, at = comboRedAt(R, name);
  if (at === null) return name;
  const lead = rush ? R.rush.crouch + Math.max(0, dist(w) - (R.boss.r + R.player.bodyR + R.rush.gap)) / R.rush.speed : 0;
  const T = w.time + lead + at;
  if (!redOk(w, T)) return 'A';
  plan(w, T);
  return name;
}
const laserAt = w => w.time + w.rules.brain.windup + w.rules.laser.aim;

function enterPhase2(w, announce = true) {
  const b = w.boss;
  b.phase = 2; b.picks2 = 0; b.introduced = [];
  b.opening = w.rules.brain.opening.length;   // 2단계는 여는 순서를 끝낸다(새 패턴 소개가 그 자리를 잇는다)
  b.floorAt = w.time + w.rules.brain.floorEvery[1];
  if (announce) {
    cancelAll(w);
    clearBullets(w, 0, 0, Infinity);
    emit(w, 'phase', { n: 2 });
    setState(w, 'phaseChange');
  }
}

const FLOOR = ['slam', 'wave', 'sword'];
// 고른 것의 이름(연달아 금지에 쓴다): 패턴 번호 · 'rush'(다가오기) · 'melee' · 'slam' · 'wave' · 'sword'
const nameOf = pick => pick.pattern ?? (pick.approach ? 'rush' : pick.melee ? 'melee' : FLOOR.find(k => pick[k]));

// 다음 할 일을 고른다: { pattern, sparse? } | { approach: 'A'|'B' } | { melee: 'A'|'B' } | { slam|wave|sword: 색 }.
export function pickNext(w) {
  const b = w.boss, B = w.rules.brain, d = dist(w);
  if (w.opts.pattern) return { pattern: w.opts.pattern };
  if (b.opening < B.opening.length) return { ...B.opening[b.opening++] };
  if (b.phase === 2) {
    b.picks2++;
    const slot = [1, 3, 5].indexOf(b.picks2);
    if (slot >= 0 && slot < B.intro2.length) { b.introduced.push(B.intro2[slot]); return { pattern: B.intro2[slot], sparse: true }; }
  }
  const combo = () => (w.rng.next() < B.comboB ? 'B' : 'A');
  const color = kind => { const r = w.rng.next(), [wh, rd] = B.colors; return r < wh ? 'white' : r < wh + rd ? 'red' : kind === 'slam' ? 'gold' : 'white'; };
  const pickOf = k => (k === 'approach' ? { approach: combo() } : { [k]: color(k) });
  const comboLast = b.last === 'rush' || b.last === 'melee';   // 콤보 뒤 콤보도 연달아로 본다
  const fresh = list => list.filter(k => (k === 'approach' ? !comboLast : k !== b.last));
  // 멀리 오래 있으면 박치기 또는 다가오기
  if (b.farFor > B.farHold && w.rng.next() < B.farChance) {
    b.farFor = 0;
    const opts = fresh(['slam', 'approach']);
    if (opts.length) return pickOf(opts[w.rng.int(opts.length)]);
  }
  // 가까우면 근접 콤보 또는 지면 파도
  if (d < B.near) {
    const wave = comboLast ? true : b.last === 'wave' ? false : w.rng.next() < B.nearWave;
    return wave ? { wave: color('wave') } : { melee: combo() };
  }
  // 장판 시계: 박치기·파도·검기·다가오기 중 하나
  if (w.time >= b.floorAt) {
    const opts = fresh(['slam', 'wave', 'sword', 'approach']);
    return pickOf(opts[w.rng.int(opts.length)]);
  }
  const range = d > B.far ? 'far' : 'mid';
  const laser = redOk(w, laserAt(w));
  const ok = id => {
    const P = PATTERNS[id];
    return P.phases.includes(b.phase) && (b.phase === 1 || !B.intro2.includes(id) || b.introduced.includes(id)) && id !== b.last && (id !== 8 || laser);
  };
  let pool = Object.keys(PATTERNS).map(Number).filter(id => ok(id) && PATTERNS[id].ranges.includes(range));
  if (!pool.length) pool = Object.keys(PATTERNS).map(Number).filter(ok);
  return { pattern: pool[w.rng.int(pool.length)] };
}

function startNext(w) {
  const b = w.boss, B = w.rules.brain, pick = pickNext(w), name = nameOf(pick);
  b.last = name;
  if (pick.approach || FLOOR.includes(name)) b.floorAt = w.time + B.floorEvery[b.phase - 1];
  if (pick.pattern) {
    b.next = pick;
    if (pick.pattern === 8) b.redTimes.push(laserAt(w));
    b.face = Math.atan2(w.player.z - b.z, w.player.x - b.x);
    emit(w, 'windup', { color: windupColor(pick.pattern), kind: 'pattern', id: pick.pattern, sparse: !!pick.sparse });
    setState(w, 'windup');
  } else if (pick.approach) {
    b.combo = budgetCombo(w, pick.approach, true);
    startRush(w, b.combo);
    setState(w, 'rush');
  } else if (pick.melee) {
    b.next = { melee: pick.melee };
    setState(w, 'meleeWait');
    if (!b.runs.length) startMelee(w);
  } else {
    b.next = { kind: name, color: pick[name] };
    setState(w, 'floorWait');
    if (!b.runs.length) startFloor(w);
  }
}

// 가까이서 바로 하는 근접 콤보(주 패턴 run이 다 끝난 뒤): 판의 탄을 지우고 1:1(§5.3 — 돌진 도착과 같다).
function startMelee(w) {
  const b = w.boss;
  dropRuns(w);
  clearBullets(w, 0, 0, Infinity);
  const combo = budgetCombo(w, b.next.melee, false);
  emit(w, 'meleeStart', { combo });
  startCombo(w, combo);
  setState(w, 'melee');
}
// 패턴 run·차선·빔만 거둔다(근접 1:1 시작 때)
function dropRuns(w) { const b = w.boss; b.run = null; b.runs.length = 0; b.mainRun = null; w.lanes.length = 0; clearBeams(w); }

// 장판 공격 시작(주 패턴 run이 다 끝난 뒤). 빨강이 예산을 넘으면 흰으로.
function startFloor(w) {
  const b = w.boss, R = w.rules, F = R.floor, { kind } = b.next;
  let { color } = b.next;
  if (color === 'red') {
    const gap = Math.max(0, dist(w) - (R.boss.r + R.player.bodyR));
    const T = w.time + F[kind].warn + (kind === 'slam' ? gap / F.slam.speed : kind === 'wave' ? gap / F.wave.speed : 0);
    if (redOk(w, T)) plan(w, T); else color = 'white';
  }
  if (kind === 'slam') startSlam(w, color); else if (kind === 'wave') startWave(w, color); else startSword(w, color);
  setState(w, 'floor');
}

function breathe(w, mul = 1) {
  const b = w.boss, B = w.rules.brain;
  const allIn = b.phase === 2 && b.introduced.length >= B.intro2.length && b.picks2 >= 5;
  b.breathUntil = w.time + between(w, allIn ? B.breath2 : B.breath) * mul;
  setState(w, 'idle');
}

// 둘레 돌기: 접선 orbit U/s + 반지름 쪽 radial U/s까지(keep 거리). mul = 준비 중 절반.
// 난간에 막혀(또는 접선과 물러서기가 난간을 따라 서로 지워져) 돌기 빠르기의 절반도 못 가면: 먼저 물러서기를 접고, 그래도 막히면 방향을 바꾼다(flipCooldown초에 한 번까지).
const MOVING = new Set(['idle', 'windup', 'pattern', 'wake', 'floorWait']);
function moveBoss(w, mul = 1) {
  const b = w.boss, B = w.rules.brain, R = w.rules, p = w.player, dt = R.dt * mul;
  if (w.time >= b.flipAt) { b.orbitDir = -b.orbitDir; b.flipAt = w.time + between(w, B.flip); }
  const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const radial = d > B.keep[1] ? B.radial : d < B.keep[0] ? -B.radial : 0;
  const orbit = B.orbit[b.phase - 1] * b.orbitDir;
  const x0 = b.x, z0 = b.z, half = Math.abs(orbit) * dt * 0.5;
  const go = rad => clampToBoard(R, x0 + (-uz * orbit + ux * rad) * dt, z0 + (ux * orbit + uz * rad) * dt, R.boss.r);
  [b.x, b.z] = go(radial);
  if (radial < 0 && Math.hypot(b.x - x0, b.z - z0) < half) [b.x, b.z] = go(0);   // 물러설 곳이 없으면(난간·모서리) 물러서기를 접고 돈다
  if (Math.hypot(b.x - x0, b.z - z0) < half && w.time >= b.flipOk) {
    b.orbitDir = -b.orbitDir; b.flipAt = w.time + between(w, B.flip); b.flipOk = w.time + B.flipCooldown;
  }
  b.face = Math.atan2(p.z - b.z, p.x - b.x);
  separateBodies(w);
}

// 옆으로 뛰기: 플레이어를 보는 방향에 수직으로, 돌던 쪽으로
function startHop(w) {
  const b = w.boss, B = w.rules.brain, p = w.player;
  const a = Math.atan2(p.z - b.z, p.x - b.x), side = b.orbitDir, dist = between(w, B.hop.dist);
  b.hopX = -Math.sin(a) * side * dist / B.hop.sec; b.hopZ = Math.cos(a) * side * dist / B.hop.sec;
  b.hopUntil = w.time + B.hop.sec;
  emit(w, 'hop', { x: b.x, z: b.z });
  setState(w, 'hop');
}

// 돌고 있는 패턴 run들을 잇는다(끝난 것은 뺀다). 맨 마지막 run이 끝나기 overlap초 전이면 true.
function updateRuns(w) {
  const b = w.boss;
  for (let k = b.runs.length - 1; k >= 0; k--) if (updatePattern(w, b.runs[k])) b.runs.splice(k, 1);
  b.run = b.runs.at(-1) ?? null;
}

export function thinkBoss(w) {
  const b = w.boss, B = w.rules.brain;
  if (!w.opts.ai || w.result) return;
  if (b.dead) { setState(w, 'dead'); return; }
  b.farFor = dist(w) > B.far ? b.farFor + w.rules.dt : 0;
  // 끼어듦: 단계 넘어감 → 그로기 → 경직
  if (b.phase === 1 && b.hp <= b.maxHp * B.phaseAt) { enterPhase2(w); return; }
  if (b.state === 'phaseChange') { if (w.time >= b.stateAt + B.phasePause) breathe(w); return; }
  const down = bossGroggy(w) ? 'groggy' : w.time < b.stunUntil ? 'stun' : null;
  if (down) {
    if (b.state !== down) { if (b.state !== 'groggy' && b.state !== 'stun') cancelAll(w); setState(w, down); }
    b.wasDown = down;
    return;
  }
  if (b.wasDown) {
    if (b.wasDown === 'groggy') emit(w, 'groggyEnd');
    b.wasDown = null;
    emit(w, 'wake', { x: b.x, z: b.z });
    b.calmUntil = w.time + B.wake + B.wakeBreath;
    setState(w, 'wake');
    return;
  }
  updateRuns(w);
  if (MOVING.has(b.state)) moveBoss(w, b.state === 'windup' ? B.windupMoveMul : 1);
  switch (b.state) {
    case 'wake':
      if (w.time >= b.stateAt + B.wake) { b.breathUntil = w.time + Math.max(B.wakeBreath, between(w, B.breath)); setState(w, 'idle'); }
      return;
    case 'idle':
      // 뛰는 동안은 쏘지 않으니 앞 패턴 꼬리가 다 끝났을 때만 뛴다(§5.2)
      if (w.time >= b.breathUntil) { if (!b.runs.length && w.rng.next() < B.hop.chance) startHop(w); else startNext(w); }
      return;
    case 'hop': {
      const R = w.rules;
      [b.x, b.z] = clampToBoard(R, b.x + b.hopX * R.dt, b.z + b.hopZ * R.dt, R.boss.r);
      separateBodies(w);
      b.face = Math.atan2(w.player.z - b.z, w.player.x - b.x);
      if (w.time >= b.hopUntil) startNext(w);
      return;
    }
    case 'windup':
      if (w.time >= b.stateAt + B.windup) { b.runs.push(startPattern(w, b.next.pattern, { sparse: !!b.next.sparse })); b.run = b.runs.at(-1); b.mainRun = b.run; setState(w, 'pattern'); }
      return;
    case 'pattern': {
      // 앞 패턴이 끝나기 overlap초 전(또는 끝남)이면 숨을 잰다 — 다음 준비가 앞 패턴 꼬리와 겹친다
      const r = b.mainRun, len = r ? PATTERNS[r.id].length(w, r) : 0;
      if (!r || r.done || r.t >= len - B.overlap) { const sparse = r?.sparse; b.mainRun = null; breathe(w, sparse ? B.sparseBreathMul : 1); }
      return;
    }
    case 'floorWait':
      if (!b.runs.length) startFloor(w);
      return;
    case 'meleeWait':
      if (!b.runs.length) startMelee(w);
      return;
    case 'floor':
      if (updateFloor(w)) { settleRed(w); breathe(w); }
      return;
    case 'rush':
      if (updateRush(w)) { dropRuns(w); startCombo(w, b.combo); setState(w, 'melee'); }   // 도착 = 탄 지움(updateRush) + 1:1
      return;
    case 'melee':
      if (updateCombo(w)) { settleRed(w); breathe(w); }
      return;
    default:
      breathe(w);
  }
}
