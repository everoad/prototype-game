// 보스 두뇌(§5): 상태 기계와 고르기.
// 상태: idle(숨) → [hop] → windup → pattern → idle … / rush → melee → idle / melee(가까울 때 바로)
//       floorWait(주 패턴 꼬리가 끝나길 기다림) → floor(박치기·파도·검기, 파도는 플레이어에 닿을 때까지) → idle
//       meleeWait(꼬리 기다림, 제자리) → melee(탄을 지우고 1:1) → idle
//       끼어듦: stun(반격 기회·자동 반격) · groggy → wake(0.4초) → 숨 0.6초 이상 · phaseChange · dead
// 박자(§5.5): 앞 패턴이 끝나기 overlap초 전부터 숨을 재고, 그 뒤 다음 준비 — 앞 run은 runs 목록에서 끝까지 돈다.
// 움직임(§5.2): 쏘는 동안에도 플레이어 둘레를 돌며 거리를 맞춘다(준비 중 절반, 근접·장판·멈춤 중엔 안 움직임).
// 수호자 + 장면(boss=ranged2 — initMix, 수치 RULES.mix): 여는 순서가 끝나면 every초마다 장면(siege.js) 하나가 혼자 끼어든다 —
//   idle → sceneWait(앞 패턴의 꼬리 · 차선이 끝나길 기다림) → 장면(siege.js의 상태들) → idle(숨) → 여느 싸움. 그로기 · 단계 넘어감은 하던 장면을 거둔다(차례는 잇는다).
//   장면을 하는 동안 장판 시계는 멈추고 바탕 탄막은 쉰다(layers.js). 지금의 수호자(b.mix가 없다)는 한 틱도 바뀌지 않는다.
// 빨간 예산(§5.6): 빨간 빠른 공격(빨간 박치기·파도·검기, 레이저, 빨간 내려찍기)은 어느 redWindow초 안에도 redMax번까지 —
//   고를 때 타격 예정 시각을 어림해 redTimes에 적고, 넘치면 빨강 → 흰(장판) · 다른 패턴(레이저) · 콤보 A(콤보 B)로 바꾼다.
import { emit } from './events.js';
import { clampToBoard } from './geom.js';
import { clearBullets } from './bullets.js';
import { separateBodies } from './boss.js';
import { PATTERNS, startPattern, windupColor } from './patterns.js';
import { startRush, updateRush, startCombo, updateCombo } from './melee.js';
import { startSlam, startWave, startSword, updateFloor } from './floor.js';
import { dist, between, laserAt, setState, cancelAll, dropRuns, redOk, planRed, settleRed, budgetCombo, updateRuns, breathe as breatheCore, interrupts, startMelee } from './bossCore.js';
import { initScenes, startScene, runScene, dropScene, updateFades } from './siege.js';

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

// 수호자 + 장면: 수호자의 두뇌에 장면의 칸을 더한다. scene = 하는(방금 한) 장면의 이름, sceneAt = 이때부터 다음 장면을 할 수 있다, sceneFrom = 장면을 시작한 때.
export const mixRules = r => ({ ...r, board: r.mix.board, start: r.mix.start });   // 판 크기와 시작 자리만 바꾼 것(나머지는 같은 값을 같이 쓴다)
export function initMix(w) {
  const b = w.boss;
  b.hp = b.maxHp = w.rules.mix.hp;
  initBrain(w);
  initScenes(b);
  Object.assign(b, { mix: true, scene: null, sceneAt: 0, sceneFrom: 0, chase: false });   // chase = 다음 고르기는 다가오기(멀리 물러났던 장면 뒤)
}
const sceneDue = w => { const b = w.boss; return b.opening >= w.rules.brain.opening.length && !w.opts.pattern && w.time >= b.sceneAt; };
function beginScene(w) {
  const b = w.boss;
  if (!b.queue.length) b.queue.push(...w.rules.mix.cycle);
  b.scene = b.queue.shift(); b.sceneFrom = w.time;
  startScene(w, b.scene);
}
// 장면이 끝났다(dropped = 그로기 · 단계 넘어감이 거뒀다): 다음 장면은 every초 뒤부터. 제대로 끝난 장면만큼 장판 시계를 늦춘다(장면 동안은 멈춘 셈).
function endScene(w, dropped) {
  const b = w.boss;
  b.sceneAt = w.time + w.rules.mix.every[b.phase - 1];
  if (!dropped) { b.floorAt += w.time - b.sceneFrom; b.chase = w.rules.mix.rushAfter.includes(b.scene); }
  emit(w, 'sceneEnd', { name: b.scene, dropped });
}

function enterPhase2(w, announce = true) {
  const b = w.boss;
  b.phase = 2; b.picks2 = 0; b.introduced = [];
  b.opening = w.rules.brain.opening.length;   // 2단계는 여는 순서를 끝낸다(새 패턴 소개가 그 자리를 잇는다)
  b.floorAt = w.time + w.rules.brain.floorEvery[1];
  if (announce) {
    cancelAll(w);
    clearBullets(w, 0, 0, Infinity);
    emit(w, 'phase', { n: 2, x: b.x, z: b.z });
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
  if (b.chase) { b.chase = false; if (d >= B.near) return { approach: combo() }; }   // 수호자 + 장면: 멀리 물러났던 장면(포격전) 뒤에는 곧바로 달려든다
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
    // 레이저는 혼자(사용자 "주변 탄막도 많은데 광역까지"): 앞 패턴 꼬리가 다 끝난 뒤 준비
    if (pick.pattern === LASER && b.runs.length) setState(w, 'patternWait');
    else beginWindup(w);
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

const LASER = 8;
function beginWindup(w) {
  const b = w.boss, pick = b.next;
  if (pick.pattern === LASER) b.redTimes.push(laserAt(w));
  b.face = Math.atan2(w.player.z - b.z, w.player.x - b.x);
  emit(w, 'windup', { color: windupColor(pick.pattern), kind: 'pattern', id: pick.pattern, sparse: !!pick.sparse });
  setState(w, 'windup');
}

// 장판 공격 시작(주 패턴 run이 다 끝난 뒤). 빨강이 예산을 넘으면 흰으로.
function startFloor(w) {
  const b = w.boss, R = w.rules, F = R.floor, { kind } = b.next;
  let { color } = b.next;
  if (color === 'red') {
    const gap = Math.max(0, dist(w) - (R.boss.r + R.player.bodyR));
    const T = w.time + F[kind].warn + (kind === 'slam' ? gap / F.slam.speed : kind === 'wave' ? gap / F.wave.speed : 0);
    if (redOk(w, T)) planRed(w, T); else color = 'white';
  }
  if (kind === 'slam') startSlam(w, color); else if (kind === 'wave') startWave(w, color); else startSword(w, color);
  setState(w, 'floor');
}

// 숨: 2단계 새 패턴을 다 소개한 뒤엔 짧게
function breathe(w, mul = 1) {
  const b = w.boss, B = w.rules.brain;
  breatheCore(w, mul, b.phase === 2 && b.introduced.length >= B.intro2.length && b.picks2 >= 5);
}

// 둘레 돌기: 접선 orbit U/s + 반지름 쪽 radial U/s까지(keep 거리). mul = 준비 중 절반.
// 난간에 막혀(또는 접선과 물러서기가 난간을 따라 서로 지워져) 돌기 빠르기의 절반도 못 가면: 먼저 물러서기를 접고, 그래도 막히면 방향을 바꾼다(flipCooldown초에 한 번까지).
const MOVING = new Set(['idle', 'windup', 'pattern', 'wake', 'floorWait', 'patternWait', 'sceneWait']);
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

export function thinkBoss(w) {
  const b = w.boss, B = w.rules.brain;
  if (!w.opts.ai || w.result) return;
  if (b.dead) { if (b.mix) dropScene(w); setState(w, 'dead'); return; }
  b.farFor = dist(w) > B.far ? b.farFor + w.rules.dt : 0;
  if (b.mix) updateFades(w);
  if (!b.lift && interrupts(w, enterPhase2)) {   // 단계 넘어감 → 그로기 → 경직 → 깨어남(bossCore). 장면의 도약 중(lift)에는 내려앉은 뒤에 끼어든다
    if (b.act) { dropScene(w); endScene(w, true); }
    return;
  }
  updateRuns(w);
  if (b.act) {   // 장면을 하는 동안(수호자 + 장면): 장면의 한 틱 — 끝나면 siege.js의 rest가 숨을 재고 idle로 돌려놓는다
    if (!runScene(w)) dropScene(w);
    if (!b.act) endScene(w, false);
    return;
  }
  if (MOVING.has(b.state)) moveBoss(w, b.state === 'windup' ? B.windupMoveMul : 1);
  switch (b.state) {
    case 'wake':
      if (w.time >= b.stateAt + B.wake) { b.breathUntil = w.time + Math.max(B.wakeBreath, between(w, B.breath)); setState(w, 'idle'); }
      return;
    case 'idle':
      // 뛰는 동안은 쏘지 않으니 앞 패턴 꼬리가 다 끝났을 때만 뛴다(§5.2)
      if (w.time >= b.breathUntil) {
        if (b.mix && sceneDue(w)) setState(w, 'sceneWait');
        else if (!b.runs.length && w.rng.next() < B.hop.chance) startHop(w); else startNext(w);
      }
      return;
    case 'sceneWait':   // 장면은 혼자 나온다: 앞 패턴의 꼬리와 차선이 다 끝난 뒤에
      if (!b.runs.length && !w.lanes.length) beginScene(w);
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
      const overlap = r && r.id === LASER ? 0 : B.overlap;   // 레이저 뒤엔 겹치지 않는다(쓸기가 끝나야 다음 준비)
      if (!r || r.done || r.t >= len - overlap) { const sparse = r?.sparse; b.mainRun = null; breathe(w, sparse ? B.sparseBreathMul : 1); }
      return;
    }
    case 'floorWait':
      if (!b.runs.length) startFloor(w);
      return;
    case 'patternWait':
      if (!b.runs.length) beginWindup(w);
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
