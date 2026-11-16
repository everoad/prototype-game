// 용의 두뇌(설계 용 §5): 내가 선 자리(앞·옆·뒤)가 다음 공격을 정한다. 끼어듦·빨간 예산·run 잇기·숨은 bossCore.
// 상태: idle(숨) → windup → pattern → idle … / patternWait(입이 하나 — 앞 머리 공격의 run이 다 끝나길 기다림)
//       turn(옆·뒤 멀 때 돌기, 최대 turnMax초 → 앞이면 다음 고르기, 아니면 포효) / floorWait → floor(활공·포효·꼬리·날갯짓) /
//       rush(덮치기) → melee / meleeWait → melee(발톱) · 끼어듦(stun·groggy → wake · phaseChange · dead)
// 몸 돌기 빠르기는 상태로 정한다: 가만히·돌기·기다림·깨어남 = free, 준비·패턴·장판·근접 = busy, 빔이 있거나 덮치기 달리기 중이면 0.
import { emit } from './events.js';
import { clearBullets } from './bullets.js';
import { PATTERNS, startPattern, windupColor } from './patterns.js';
import { startRush, updateRush, startCombo, updateCombo } from './melee.js';
import { startSlam, startWave, startWing, startTail, updateFloor } from './floor.js';
import { dist, between, laserAt, setState, cancelAll, dropRuns, redOk, planRed, settleRed, budgetCombo, updateRuns, breathe as breatheCore, interrupts, startMelee } from './bossCore.js';
import { turnToward, updateMouth, walkDragon, zoneOf } from './dragonBody.js';

const FREE = new Set(['idle', 'turn', 'patternWait', 'floorWait', 'meleeWait', 'wake']);
const WALKING = new Set(['idle', 'windup', 'pattern', 'patternWait']);
const LASER = 8, WING_WALL = 7;
const isHead = id => id !== WING_WALL;   // 패턴 7(날개 탄 벽)만 머리가 아니다
const headBusy = w => w.boss.runs.length > 0;   // 앞 패턴 run이 남음(날개 탄 벽도 — 벽과 머리 공격이 겹치면 2단계가 너무 빽빽했다, 봇 판)
const FLOOR = ['slam', 'wave', 'tail', 'wing'];
const ZONE_ATTACKS = new Set(['tail', 'wing']);
// 고른 것의 이름(연달아 금지): 패턴 번호 · 'rush' · 'melee' · 'slam' · 'wave' · 'tail' · 'wing' · 'turn'
const nameOf = pick => pick.pattern ?? (pick.approach ? 'rush' : pick.melee ? 'melee' : pick.turn ? 'turn' : FLOOR.find(k => pick[k]));

export function initDragon(w) {
  const b = w.boss, B = w.rules.brain, D = w.rules.dragon;
  Object.assign(b, {
    kind: 'dragon', hp: D.hp, maxHp: D.hp,
    state: 'idle', stateAt: 0, breathUntil: B.breath[0], phase: 1, last: null, opening: 0, zoneRun: 0,
    farFor: 0, floorAt: B.floorEvery[0], redTimes: [], redPending: null, redSince: 0, picks2: 0, introduced: [], stunUntil: -1, wasDown: null, run: null, runs: [], calmUntil: -1,
  });
  if (w.opts.phase === 2) { b.hp = b.maxHp * B.phaseAt; enterPhase2(w, false); }
  if (w.opts.pattern) b.opening = D.brain.opening.length;
  updateMouth(w);
}

function enterPhase2(w, announce = true) {
  const b = w.boss;
  b.phase = 2; b.picks2 = 0; b.introduced = [];
  b.opening = w.rules.dragon.brain.opening.length;
  b.floorAt = w.time + w.rules.brain.floorEvery[1];
  if (announce) {
    cancelAll(w);
    clearBullets(w, 0, 0, Infinity);
    emit(w, 'phase', { n: 2, x: b.x, z: b.z });
    setState(w, 'phaseChange');
  }
}

export function turnRate(w) {
  const b = w.boss, T = w.rules.dragon.turn;
  if (w.beams.length) return 0;                                    // 브레스: 머리가 쓸고 몸은 서 있다
  const r = w.melee.rush, f = w.floor, S = w.rules.floor.slam;
  if (r && (r.locked || r.phase === 'dash')) return 0;             // 덮치기: 방향을 고정한 뒤·달리기
  if (f && f.kind === 'slam' && (f.phase === 'dash' || w.time >= f.born + S.warn - S.lockBefore - 1e-9)) return 0;   // 활공: 줄을 고정한 뒤·달리기
  return FREE.has(b.state) ? T.free : T.busy;
}

// 숨: 2단계 새 패턴을 다 소개한 뒤엔 짧게
function breathe(w, mul = 1) {
  const b = w.boss;
  breatheCore(w, mul, b.phase === 2 && b.introduced.length >= w.rules.dragon.brain.intro2.length);
}

// 다음 할 일(설계 용 §5 차례): 여는 순서 → 가까움(자리별) → 멀리 오래 → 장판 시계 → 앞 = 패턴 → 옆·뒤 멀면 돌기
export function pickDragon(w) {
  const b = w.boss, R = w.rules, D = R.dragon, DB = D.brain, B = R.brain, d = dist(w), zone = zoneOf(w);
  if (w.opts.pattern) return { pattern: w.opts.pattern };
  if (b.opening < DB.opening.length) return { ...DB.opening[b.opening++] };
  const combo = () => (w.rng.next() < B.comboB ? 'B' : 'A');
  const color = kind => { const r = w.rng.next(), [wh, rd] = B.colors; return r < wh ? 'white' : r < wh + rd ? 'red' : kind === 'slam' ? 'gold' : 'white'; };
  const roar = () => ({ wave: color('wave') });
  const comboLast = b.last === 'rush' || b.last === 'melee';
  const fresh = list => list.filter(k => (k === 'approach' ? !comboLast : k !== b.last));
  const pickOf = k => (k === 'approach' ? { approach: combo() } : { [k]: color(k) });
  // 1. 가까움: 앞 = 발톱 또는 포효, 옆 = 그쪽 날갯짓, 뒤 = 꼬리(둘 다 zoneRepeat번까지 연달아, 그다음은 포효 — 쉬는 자리 없음)
  if (d < D.near) {
    if (zone === 'front') {
      const wave = comboLast ? true : b.last === 'wave' ? false : w.rng.next() < DB.nearWave;
      return wave ? roar() : { melee: combo() };
    }
    if (b.zoneRun >= D.zoneRepeat) return roar();
    return zone === 'back' ? { tail: color('tail') } : { wing: color('wing'), side: zone === 'left' ? 1 : -1 };
  }
  // 2. 멀리 오래: 앞이면 활공 돌진 또는 덮치기, 아니면 돌기
  if (b.farFor > B.farHold && w.rng.next() < B.farChance) {
    b.farFor = 0;
    if (zone !== 'front') return { turn: true };
    const opts = fresh(['slam', 'approach']);
    if (opts.length) return pickOf(opts[w.rng.int(opts.length)]);
  }
  // 3. 장판 시계: 앞이면 활공·포효·덮치기, 옆·뒤면 포효(보는 쪽으로 가는 공격은 헛나가니까)
  if (w.time >= b.floorAt) {
    if (zone !== 'front') return roar();
    const opts = fresh(['slam', 'wave', 'approach']);
    return pickOf(opts[w.rng.int(opts.length)]);
  }
  // 5. 옆·뒤, 멀다: 돈다
  if (zone !== 'front') return { turn: true };
  // 4. 앞: 패턴(2단계 새 패턴은 앞 패턴 고르기 1·3번째에 하나씩 성기게)
  if (b.phase === 2) {
    b.picks2++;
    const slot = [1, 3].indexOf(b.picks2);
    if (slot >= 0 && slot < DB.intro2.length) { b.introduced.push(DB.intro2[slot]); return { pattern: DB.intro2[slot], sparse: true }; }
  }
  const range = d > D.far ? 'far' : 'mid', laser = redOk(w, laserAt(w));
  const ok = id => PATTERNS[id].phases.includes(b.phase) && (b.phase === 1 || !DB.intro2.includes(id) || b.introduced.includes(id)) && id !== b.last && (id !== LASER || laser);
  let pool = DB.patterns.filter(id => ok(id) && PATTERNS[id].ranges.includes(range));
  if (!pool.length) pool = DB.patterns.filter(ok);
  return { pattern: pool[w.rng.int(pool.length)] };
}

function startNext(w) {
  const b = w.boss, B = w.rules.brain, pick = pickDragon(w), name = nameOf(pick);
  if (name === 'turn') { setState(w, 'turn'); return; }   // 돌기는 연달아 셈에 넣지 않는다
  b.last = name;
  b.zoneRun = ZONE_ATTACKS.has(name) ? b.zoneRun + 1 : 0;
  if (pick.approach || FLOOR.includes(name)) b.floorAt = w.time + B.floorEvery[b.phase - 1];
  if (pick.pattern) {
    b.next = pick;
    // 입이 하나: 머리 공격은 앞 run이 다 끝난 뒤 준비(날개 탄 벽만 앞 꼬리와 겹친다)
    if (isHead(pick.pattern) && headBusy(w)) setState(w, 'patternWait');
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
    b.next = { kind: name, color: pick[name], side: pick.side };
    setState(w, 'floorWait');
    if (!b.runs.length) startFloor(w);
  }
}

function beginWindup(w) {
  const b = w.boss, pick = b.next;
  if (pick.pattern === LASER) b.redTimes.push(laserAt(w));
  emit(w, 'windup', { color: windupColor(pick.pattern), kind: 'pattern', id: pick.pattern, sparse: !!pick.sparse });
  setState(w, 'windup');
}

// 장판 공격 시작(주 패턴 run이 다 끝난 뒤). 빨강이 예산을 넘으면 흰으로.
function startFloor(w) {
  const b = w.boss, R = w.rules, F = R.floor, { kind, side } = b.next;
  let { color } = b.next;
  if (color === 'red') {
    const gap = Math.max(0, dist(w) - (R.boss.r + R.player.bodyR));
    const T = w.time + (kind === 'slam' ? F.slam.warn + gap / F.slam.speed : kind === 'tail' ? R.dragon.tail.warn : (kind === 'wing' ? R.dragon.wing.warn : F.wave.warn) + gap / F.wave.speed);
    if (redOk(w, T)) planRed(w, T); else color = 'white';
  }
  if (kind === 'slam') startSlam(w, color);
  else if (kind === 'tail') startTail(w, color);
  else if (kind === 'wing') startWing(w, color, side);
  else startWave(w, color);
  setState(w, 'floor');
}

export function thinkDragon(w) {
  const b = w.boss, R = w.rules, D = R.dragon, B = R.brain;
  if (!w.opts.ai || w.result) return;
  if (b.dead) { setState(w, 'dead'); return; }
  b.farFor = dist(w) > D.far ? b.farFor + R.dt : 0;
  if (interrupts(w, enterPhase2)) { updateMouth(w); return; }
  updateRuns(w);
  turnToward(w, turnRate(w));
  if (WALKING.has(b.state)) walkDragon(w);
  updateMouth(w);
  switch (b.state) {
    case 'wake':
      if (w.time >= b.stateAt + B.wake) { b.breathUntil = w.time + Math.max(B.wakeBreath, between(w, B.breath)); setState(w, 'idle'); }
      return;
    case 'idle':
      if (w.time >= b.breathUntil) startNext(w);
      return;
    case 'turn':
      if (zoneOf(w) === 'front') startNext(w);
      else if (w.time >= b.stateAt + D.turnMax - 1e-9) {   // 1초 돌아도 앞이 아니면 포효(온 고리 — 어디든 닿는다)
        const r = w.rng.next(), [wh, rd] = B.colors;
        b.last = 'wave'; b.zoneRun = 0; b.floorAt = w.time + B.floorEvery[b.phase - 1];
        b.next = { kind: 'wave', color: r < wh ? 'white' : r < wh + rd ? 'red' : 'white' };
        setState(w, 'floorWait');
        if (!b.runs.length) startFloor(w);
      }
      return;
    case 'windup':
      if (w.time >= b.stateAt + B.windup) { b.runs.push(startPattern(w, b.next.pattern, { sparse: !!b.next.sparse })); b.run = b.runs.at(-1); b.mainRun = b.run; setState(w, 'pattern'); }
      return;
    case 'pattern': {
      const r = b.mainRun, len = r ? PATTERNS[r.id].length(w, r) : 0;
      const overlap = r && r.id === LASER ? 0 : B.overlap;
      if (!r || r.done || r.t >= len - overlap) { const sparse = r?.sparse; b.mainRun = null; breathe(w, sparse ? B.sparseBreathMul : 1); }
      return;
    }
    case 'patternWait':
      if (!headBusy(w)) beginWindup(w);
      return;
    case 'floorWait':
      if (!b.runs.length) startFloor(w);
      return;
    case 'meleeWait':
      if (!b.runs.length) startMelee(w);
      return;
    case 'floor':
      if (updateFloor(w)) { settleRed(w); breathe(w); b.breathUntil += D.recover; }   // 큰 몸 공격 뒤엔 몸을 추스른다(쏠 틈)
      return;
    case 'rush':
      if (updateRush(w)) { dropRuns(w); startCombo(w, b.combo); setState(w, 'melee'); }
      return;
    case 'melee':
      if (updateCombo(w)) { settleRed(w); breathe(w); b.breathUntil += D.recover; }
      return;
    default:
      breathe(w);
  }
}
