// 나는 용(세 번째 보스 — 설계 2026-11-19-barrage-wyrm-design.md, 주소 boss=dragon2). 수치는 RULES.dragon2.
// 사용자 2026-11-19: "각 보스마다 정체성이 있어야 돼 … 용을 표현하는 공격", "맵 크기도 크게 키우고 … 보스가 빠르게 거리를 벌렸다가 좁혔다가", "수호자처럼 휙 돌게".
// 용의 몸(dragonBody.js · 화면의 상자 용)을 그대로 쓰고, 판(넓다) · 두뇌(짜인 차례) · 대표 공격이 다르다. 지금의 용(dragon.js)과 수호자는 한 틱도 바뀌지 않는다.
// 차례: 땅(머리 패턴이나 발톱 → 불 뿜기) → 하늘(날아오르기 → 불줄 → 급강하) → 땅 … 떠 있는 동안(boss.air)은 맞지도 겨눠지지도 않는다.
// 상태: idle(숨) → windup → pattern / melee(발톱) / retreat(물러나기) → inhale(들이켬) → breath(불 뿜기)
//       takeoff(떠오름) → aim(줄을 잡고 떠 있음) → strafe(줄을 따라 날며 불줄) → diveAim(내 자리로 급강하) → land(추스름) · 끼어듦(bossCore: 그로기 · 깨어남 · 단계)
import { emit } from './events.js';
import { K } from './rules.js';
import { clampToBoard, inCircle } from './geom.js';
import { spawnBullet, clearBullets } from './bullets.js';
import { PATTERNS, startPattern, windupColor, addLane } from './patterns.js';
import { updateCombo, resolveHit } from './melee.js';
import { reach } from './beams.js';
import { dist, between, setState, cancelAll, settleRed, updateRuns, interrupts, startMelee } from './bossCore.js';
import { turnToward, updateMouth } from './dragonBody.js';
import { separateBodies } from './boss.js';

const DEG = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toPlayer = w => Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x);
const ease = u => u * u * (3 - 2 * u);
const TURNING = new Set(['idle', 'windup', 'pattern', 'inhale', 'land', 'wake']);   // 이 상태에서는 몸이 나를 쫓아 휙 돈다

// 이 판의 규칙: 바탕 규칙에 판 크기와 시작 자리만 바꾼 것(나머지는 같은 값을 같이 쓴다 — 수치 패널도 그대로 듣는다)
export const wyrmRules = r => ({ ...r, board: r.dragon2.board, start: r.dragon2.start });

export function initDragon2(w) {
  const b = w.boss, B = w.rules.brain, D = w.rules.dragon2;
  Object.assign(b, {
    kind: 'dragon', wyrm: true, hp: D.hp, maxHp: D.hp,
    state: 'idle', stateAt: 0, breathUntil: D.rest[0], phase: 1, last: null, lastPattern: null,
    redTimes: [], redPending: null, redSince: 0, stunUntil: -1, wasDown: null, run: null, runs: [], mainRun: null, calmUntil: -1,
    alt: 0, air: false, act: null, queue: [...D.opening], fires: [],   // alt = 떠 있는 높이(화면 · 해시), air = 떠 있다, act = 하는 공격, queue = 앞으로 할 것, fires = 깔린 불 원
  });
  if (w.opts.phase === 2) { b.hp = b.maxHp * B.phaseAt; b.phase = 2; }
  updateMouth(w);
}

// 하던 것을 내려놓는다(그로기 · 단계 넘어감): 땅으로, 깔린 불 원도 거둔다(화면 목록은 cancelAll이 비운다)
function drop(w) { const b = w.boss; b.act = null; b.queue.length = 0; b.fires.length = 0; b.alt = 0; b.air = false; }

function enterPhase2(w) {
  const b = w.boss;
  b.phase = 2;
  drop(w); cancelAll(w);
  clearBullets(w, 0, 0, Infinity);
  emit(w, 'phase', { n: 2, x: b.x, z: b.z });
  setState(w, 'phaseChange');
}

function rest(w, extra = 0) { const b = w.boss; b.act = null; b.breathUntil = w.time + between(w, w.rules.dragon2.rest) + extra; setState(w, 'idle'); }

// 땅에서 할 것을 한 바퀴 채운다: 붙어 있으면 발톱 아니면 머리 패턴 → 불 뿜기 → (2단계는 머리 패턴 하나 더) → 날기
function refill(w) {
  const b = w.boss, D = w.rules.dragon2;
  b.queue.push(dist(w) < D.near ? 'claws' : 'head', 'breath');
  if (b.phase === 2) b.queue.push('head');
  b.queue.push('flight');
}

function next(w) {
  const b = w.boss, D = w.rules.dragon2;
  if (!b.queue.length) refill(w);
  const what = b.queue.shift();
  b.last = what;
  if (what === 'breath') return dist(w) < D.breath.from ? startRetreat(w) : startInhale(w);
  if (what === 'flight') return startTakeoff(w);
  if (what === 'claws') { b.next = { melee: w.rng.next() < w.rules.brain.comboB ? 'B' : 'A' }; return startMelee(w); }
  const pool = D.patterns[b.phase - 1].filter(id => id !== b.lastPattern), id = pool[w.rng.int(pool.length)];
  b.lastPattern = id; b.next = { pattern: id };
  emit(w, 'windup', { color: windupColor(id), kind: 'pattern', id, sparse: false });
  setState(w, 'windup');
}

// 물러나기: 지금 자리에서 여덟 방향으로 dist만큼 간 자리(판 안으로 자름) 가운데 나에게서 가장 먼 곳으로 날갯짓 한 번에
function startRetreat(w) {
  const b = w.boss, R = w.rules, T = R.dragon2.retreat, p = w.player;
  let best = null, bd = -1;
  for (let k = 0; k < 8; k++) {
    const a = toPlayer(w) + Math.PI + (k - 3.5) * Math.PI / 4;
    const [x, z] = clampToBoard(R, b.x + Math.cos(a) * T.dist, b.z + Math.sin(a) * T.dist, R.boss.r), d = Math.hypot(x - p.x, z - p.z);
    if (d > bd) { bd = d; best = [x, z]; }
  }
  b.act = { kind: 'retreat', fx: b.x, fz: b.z, tx: best[0], tz: best[1] };
  emit(w, 'wyrmRetreat', { x: b.x, z: b.z, tx: best[0], tz: best[1] });
  setState(w, 'retreat');
}

function startInhale(w) { const b = w.boss; b.act = { kind: 'inhale' }; emit(w, 'wyrmInhale', { x: b.x, z: b.z }); setState(w, 'inhale'); }

function startTakeoff(w) {
  const b = w.boss;
  b.air = true; b.act = { kind: 'fly', pass: 0 };
  emit(w, 'wyrmTakeoff', { x: b.x, z: b.z });
  setState(w, 'takeoff');
}

// 불줄 하나를 잡는다: 지금 자리에서 나를 지나 판 끝까지. 줄을 따라 빨간 원을 미리 깔고(용이 그 위를 지나는 때에 터진다), warn초 떠 있다가 날아간다.
function startPass(w) {
  const b = w.boss, R = w.rules, F = R.dragon2.fly, S = F.strip, p = w.player;
  const inset = { hx: R.board.hx - R.boss.r, hz: R.board.hz - R.boss.r };
  let a = Math.hypot(p.x - b.x, p.z - b.z) > 2 ? toPlayer(w) : b.face, len = reach(inset, b.x, b.z, a);
  if (len < S.minLen) { a = Math.atan2(-b.z, -b.x); len = reach(inset, b.x, b.z, a); }   // 벽을 보고 섰고 줄이 아주 짧다: 판 가운데 쪽으로 긋는다(그 밖에는 짧아도 내 자리를 지나는 줄)
  const ux = Math.cos(a), uz = Math.sin(a);
  let k = 0;
  for (let d = S.step / 2; d <= len; d += S.step, k++) {
    const area = { kind: 'fire', shape: 'circle', x: b.x + ux * d, z: b.z + uz * d, face: a, R: S.R, half: Math.PI, color: 'red', warn: S.warn + d / F.speed, born: w.time, hit: false, ember: k % S.ember.every === S.ember.every - 1 };
    w.floorAreas.push(area); b.fires.push(area);
  }
  b.face = a;
  b.act = { kind: 'fly', pass: b.act.pass, sx: b.x, sz: b.z, angle: a, len, T0: w.time + S.warn };
  emit(w, 'wyrmStrip', { x: b.x, z: b.z, angle: a, len, pass: b.act.pass });
  setState(w, 'aim');
}

// 급강하를 잡는다: 내 자리의 원(흰 · 빨강). 자리를 굳히기 전까지 나를 따라온다.
function startDive(w) {
  const b = w.boss, R = w.rules, V = R.dragon2.dive, p = w.player;
  const color = w.rng.next() < V.white ? 'white' : 'red';
  const [x, z] = clampToBoard(R, p.x, p.z, R.boss.r);
  const area = { kind: 'dive', shape: 'circle', x, z, face: 0, R: V.R, half: Math.PI, color, warn: V.warn, born: w.time, hit: false };
  w.floorAreas.push(area);
  b.act = { kind: 'dive', area, fx: b.x, fz: b.z };
  emit(w, 'wyrmDiveAim', { x, z, color });
  setState(w, 'diveAim');
}

// 내려앉는 순간: 원 안이면 판정(흰 = 받아칠 수 있다 · 빨강 = 구르기만), 그 자리에서 반대 색 고리가 퍼진다(빨>흰 · 흰>빨 두 박자)
function land(w) {
  const b = w.boss, R = w.rules, V = R.dragon2.dive, p = w.player, A = b.act.area;
  b.x = A.x; b.z = A.z; b.alt = 0; b.air = false; A.hit = true;
  if (A.color === 'red') w.redHitAt = w.time;
  let outcome = 'miss';
  if (inCircle(p.x, p.z, R.player.bodyR, A.x, A.z, A.R)) outcome = resolveHit(w, { color: A.color, src: R.src.dive, dmg: V.dmg, stagger: V.stagger, kindName: 'dive', x: A.x, z: A.z }).outcome;
  emit(w, 'wyrmLand', { x: b.x, z: b.z, color: A.color, outcome });
  separateBodies(w);
  const ring = A.color === 'red' ? 'white' : 'red';
  // 고리는 원의 바깥에서 시작한다 — 원 안에서 급강하를 받아낸(또는 맞은) 사람을 같은 틱에 또 치지 않는다. 원 밖으로 비켜선 사람에게 가는 두 번째 박자다
  w.waves.push({ x: b.x, z: b.z, r: V.R + R.player.bodyR * 2 + R.floor.wave.thick + 0.1, color: ring, born: w.time, hitDone: false, gapAngle: null, arc: null });
  emit(w, 'waveStart', { color: ring, x: b.x, z: b.z });
  b.fires.push(A);   // 원은 잠깐 남았다가 걷힌다(updateFires)
  b.act = null;
  setState(w, 'land');
}

// 깔린 불 원: 때가 되면 터진다(안에 있으면 빨강 판정) · 불씨(양옆으로 흘러나오는 느린 탄) · 잠깐 뒤 걷는다
function updateFires(w) {
  const b = w.boss, R = w.rules, S = R.dragon2.fly.strip, p = w.player;
  for (let k = b.fires.length - 1; k >= 0; k--) {
    const a = b.fires[k];
    if (!a.hit && w.time >= a.born + a.warn - 1e-9) {
      a.hit = true;
      w.redHitAt = w.time;
      emit(w, 'fireBoom', { x: a.x, z: a.z, R: a.R });
      if (inCircle(p.x, p.z, R.player.bodyR, a.x, a.z, a.R)) resolveHit(w, { color: 'red', src: R.src.strafe, dmg: S.dmg, stagger: [0, 0], kindName: 'fire', x: a.x, z: a.z });
      if (a.ember) for (const s of [1, -1]) {   // 원의 가장자리에서 줄 바깥쪽으로(줄 위에 선 사람의 발밑에서 생기지 않게)
        const ang = a.face + s * Math.PI / 2, id = spawnBullet(w, K.NORMAL, a.x + Math.cos(ang) * a.R, a.z + Math.sin(ang) * a.R, ang, S.ember.speed, R.src.strafe);
        if (id >= 0) { w.bullets.ttl[id] = w.time + S.ember.life; emit(w, 'fire', { kind: K.NORMAL, x: w.bullets.x[id], z: w.bullets.z[id], id, src: R.src.strafe }); }
      }
    }
    if (a.hit && w.time >= a.born + a.warn + S.linger) { b.fires.splice(k, 1); const i = w.floorAreas.indexOf(a); if (i >= 0) w.floorAreas.splice(i, 1); }
  }
}

export function thinkDragon2(w) {
  const b = w.boss, R = w.rules, D = R.dragon2, B = R.brain, p = w.player, now = w.time;
  if (!w.opts.ai || w.result) return;
  if (b.dead) { b.alt = 0; b.air = false; setState(w, 'dead'); return; }
  if (!b.air && interrupts(w, enterPhase2)) { if (b.state === 'groggy' || b.state === 'stun') drop(w); updateMouth(w); return; }
  updateRuns(w);
  updateFires(w);
  if (TURNING.has(b.state)) turnToward(w, D.turn);
  const since = now - b.stateAt;
  switch (b.state) {
    case 'wake':
      if (since >= B.wake) rest(w, B.wakeBreath);
      break;
    case 'idle':
      if (now >= b.breathUntil) next(w);
      break;
    case 'windup':
      if (since >= B.windup) { b.runs.push(startPattern(w, b.next.pattern, {})); b.run = b.runs.at(-1); b.mainRun = b.run; setState(w, 'pattern'); }
      break;
    case 'pattern': {
      const r = b.mainRun;
      if (!r || r.done || r.t >= PATTERNS[r.id].length(w, r) - B.overlap) { b.mainRun = null; rest(w); }
      break;
    }
    case 'melee':
      if (updateCombo(w)) { settleRed(w); rest(w); }
      break;
    case 'retreat': {
      const T = D.retreat, u = Math.min(1, since / T.sec), e = ease(u), a = b.act;
      b.x = a.fx + (a.tx - a.fx) * e; b.z = a.fz + (a.tz - a.fz) * e;
      b.alt = Math.sin(Math.PI * u) * T.hop;
      b.face = toPlayer(w);
      if (u >= 1) { b.alt = 0; startInhale(w); }
      break;
    }
    case 'inhale':
      if (since >= D.breath.inhale) {
        b.act = { kind: 'breath', angle: toPlayer(w), until: now + D.breath.dur[b.phase - 1], nextAt: now };
        b.face = b.act.angle;
        emit(w, 'wyrmBreath', { x: b.x, z: b.z, angle: b.act.angle });
        setState(w, 'breath');
      }
      break;
    case 'breath': {
      const Br = D.breath, a = b.act, lim = Br.sweep[b.phase - 1] * DEG * R.dt, d = wrap(toPlayer(w) - a.angle);
      a.angle = wrap(a.angle + Math.max(-lim, Math.min(lim, d)));   // 줄기는 정한 빠르기까지만 나를 쫓는다 — 가까이서 돌면 따돌린다
      b.face = a.angle;
      updateMouth(w);
      while (now >= a.nextAt - 1e-9) {
        a.nextAt += Br.every;
        for (let k = 0; k < Br.n; k++) {
          const ang = a.angle + (w.rng.next() * 2 - 1) * Br.spreadDeg * DEG, sp = Br.speed * (Br.vary[0] + w.rng.next() * (Br.vary[1] - Br.vary[0]));
          if (Math.hypot(b.mouth.x - p.x, b.mouth.z - p.z) < R.dragon.mouthGuard) continue;   // 입 바로 앞에 선 사람 위에서는 생기지 않는다(용과 같다)
          const id = spawnBullet(w, K.NORMAL, b.mouth.x, b.mouth.z, ang, sp, R.src.breath);
          if (id >= 0) emit(w, 'fire', { kind: K.NORMAL, x: b.mouth.x, z: b.mouth.z, id, src: R.src.breath });
        }
      }
      // 끝에 금 한 발(조준 차선 — 연발과 같다): 줄기를 따돌린 사람이 받아칠 것
      if (!a.gold && now >= a.until - R.lanes.goldWarn - 1e-9) { a.gold = true; addLane(w, { id: R.src.breath }, K.GOLD, toPlayer(w), true, Br.speed); }
      if (now >= a.until) { emit(w, 'wyrmBreathEnd', { x: b.x, z: b.z }); rest(w); }
      break;
    }
    case 'takeoff': {
      const u = Math.min(1, since / D.fly.rise);
      b.alt = ease(u) * D.fly.alt;
      if (u >= 1) startPass(w);
      break;
    }
    case 'aim':
      b.alt = D.fly.alt;
      if (now >= b.act.T0 - 1e-9) setState(w, 'strafe');
      break;
    case 'strafe': {
      const a = b.act, d = Math.min(a.len, D.fly.speed * (now - a.T0));
      b.x = a.sx + Math.cos(a.angle) * d; b.z = a.sz + Math.sin(a.angle) * d; b.alt = D.fly.alt;
      if (d >= a.len - 1e-9) { a.pass++; if (a.pass < D.fly.passes[b.phase - 1]) startPass(w); else startDive(w); }
      break;
    }
    case 'diveAim': {
      const V = D.dive, a = b.act, A = a.area, T = A.born + A.warn;
      if (now < T - V.lockBefore) [A.x, A.z] = clampToBoard(R, p.x, p.z, R.boss.r);
      const u = Math.min(1, (now - A.born) / (A.warn - V.drop));   // 원 위로 날아와서 → 마지막 drop초에 내리꽂는다
      b.x = a.fx + (A.x - a.fx) * ease(u); b.z = a.fz + (A.z - a.fz) * ease(u);
      if (Math.hypot(A.x - b.x, A.z - b.z) > 0.5) b.face = Math.atan2(A.z - b.z, A.x - b.x);
      const fall = Math.max(0, (now - (T - V.drop)) / V.drop);
      b.alt = D.fly.alt * (1 - fall * fall);
      if (now >= T - 1e-9) land(w);
      break;
    }
    case 'land':
      if (since >= D.land) rest(w);
      break;
    default:
      rest(w);
  }
  updateMouth(w);
}
