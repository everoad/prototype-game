// 두 보스(원거리 보스 brain.js · 용 dragon.js)가 같이 쓰는 두뇌 부분:
// 상태 바꾸기, 하던 것 끊기, 빨간 예산(§5.6), 패턴 run 잇기, 숨, 끼어듦(단계·그로기·경직·깨어남).
import { emit } from './events.js';
import { bossGroggy } from './boss.js';
import { updatePattern } from './patterns.js';
import { clearBeams, reach } from './beams.js';
import { clearFloor } from './floor.js';
import { clearBullets } from './bullets.js';
import { startCombo } from './melee.js';

export const dist = w => Math.hypot(w.player.x - w.boss.x, w.player.z - w.boss.z);
export const between = (w, [lo, hi]) => lo + w.rng.next() * (hi - lo);
export const laserAt = w => w.time + w.rules.brain.windup + w.rules.laser.aim;

export function setState(w, s) { w.boss.state = s; w.boss.stateAt = w.time; }

// 하던 것을 모두 끊는다(패턴·차선·빔·장판 공격·파도·돌진·근접 장판). 이미 날아간 탄은 그대로. 오지 않을 빨간 예정도 지운다.
export function cancelAll(w) {
  const b = w.boss;
  b.run = null; b.runs.length = 0; b.mainRun = null;
  w.lanes.length = 0;
  clearBeams(w);
  clearFloor(w);
  w.melee.rush = null; w.melee.combo = null; w.melee.areas.length = 0;
  b.redTimes = b.redTimes.filter(t => t <= w.time);
  b.redPending = null;
}

// 패턴 run·차선·빔만 거둔다(근접 1:1 시작 때)
export function dropRuns(w) { const b = w.boss; b.run = null; b.runs.length = 0; b.mainRun = null; w.lanes.length = 0; clearBeams(w); }

// 빨간 예산: 타격 예정 T 둘레 ±(창 + 여유)에 이미 redMax개면 안 된다(이러면 어느 창에도 redMax개를 넘지 않는다).
export function redOk(w, T) {
  const F = w.rules.floor, b = w.boss, span = F.redWindow + F.redSlack;
  b.redTimes = b.redTimes.filter(t => t > w.time - span);
  return b.redTimes.filter(t => Math.abs(t - T) <= span).length < F.redMax;
}
// 예정해 둔 빨간 공격이 끝나면 예정 시각을 실제로 닿은 시각(w.redHitAt — floor.js·melee.js가 적음)으로 바꾼다.
// 플레이어가 달아나 파도·박치기가 늦게 닿아도 다음 고르기가 실제 시각으로 센다.
export function planRed(w, T) { const b = w.boss; b.redTimes.push(T); b.redPending = T; b.redSince = w.time; }
export function settleRed(w) {
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
export function budgetCombo(w, name, rush) {
  const R = w.rules, at = comboRedAt(R, name);
  if (at === null) return name;
  let run = Math.max(0, dist(w) - (R.boss.r + R.player.bodyR + R.rush.gap));
  if (rush && w.boss.kind === 'dragon') {   // 용은 보는 쪽으로 달리니 벽이 길을 줄인다
    const b = w.boss;
    run = Math.min(run, reach({ hx: R.board.hx - R.boss.r, hz: R.board.hz - R.boss.r }, b.x, b.z, b.face));
  }
  const lead = rush ? R.rush.crouch + run / R.rush.speed : 0;
  const T = w.time + lead + at;
  if (!redOk(w, T)) return 'A';
  planRed(w, T);
  return name;
}

// 가까이서 바로 하는 근접 콤보(주 패턴 run이 다 끝난 뒤, b.next.melee): 판의 탄을 지우고 1:1(§5.3 — 돌진 도착과 같다).
export function startMelee(w) {
  const b = w.boss;
  dropRuns(w);
  clearBullets(w, 0, 0, Infinity);
  const combo = budgetCombo(w, b.next.melee, false);
  emit(w, 'meleeStart', { combo });
  startCombo(w, combo);
  setState(w, 'melee');
}

// 돌고 있는 패턴 run들을 잇는다(끝난 것은 뺀다).
export function updateRuns(w) {
  const b = w.boss;
  for (let k = b.runs.length - 1; k >= 0; k--) if (updatePattern(w, b.runs[k])) b.runs.splice(k, 1);
  b.run = b.runs.at(-1) ?? null;
}

// 숨: fast = 2단계 새 패턴을 다 소개한 뒤(짧은 숨)
export function breathe(w, mul = 1, fast = false) {
  const B = w.rules.brain;
  w.boss.breathUntil = w.time + between(w, fast ? B.breath2 : B.breath) * mul;
  setState(w, 'idle');
}

// 끼어듦: 단계 넘어감 → 단계 쉼 → 그로기·경직 → 깨어남. 이 틱을 여기서 다뤘으면 true(부르는 쪽은 그대로 돌아간다).
export function interrupts(w, enterPhase2) {
  const b = w.boss, B = w.rules.brain;
  if (b.phase === 1 && b.hp <= b.maxHp * B.phaseAt && !w.execute) { enterPhase2(w); return true; }   // 처형 중이면 끝난 뒤(처형 → 포효 → 깨어남)
  if (b.state === 'phaseChange') { if (w.time >= b.stateAt + B.phasePause) breathe(w); return true; }
  const down = bossGroggy(w) ? 'groggy' : w.time < b.stunUntil ? 'stun' : null;
  if (down) {
    if (b.state !== down) { if (b.state !== 'groggy' && b.state !== 'stun') cancelAll(w); setState(w, down); }
    b.wasDown = down;
    return true;
  }
  if (b.wasDown) {
    if (b.wasDown === 'groggy') emit(w, 'groggyEnd');
    b.wasDown = null;
    emit(w, 'wake', { x: b.x, z: b.z });
    b.calmUntil = w.time + B.wake + B.wakeBreath;
    setState(w, 'wake');
    return true;
  }
  return false;
}
