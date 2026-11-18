// 탄막 패턴 7개(§5.2)와 빨강·금 탄 차선(§5.1). 패턴 = 데이터(번호·단계·거리 묶음·섞이는 색) + 내뿜기.
// startPattern → run, updatePattern(w, run)을 틱마다 부르면 정한 때에 탄을 낸다. 끝나면 true.
// 탄을 낼 때마다 fire { kind, x, z, id }(흰·금 발사 소리), 차선을 깔 때 lane.
import { K } from './rules.js';
import { emit } from './events.js';
import { spawnBullet, killBullet } from './bullets.js';
import { startLaser } from './beams.js';
import { headAim } from './dragonBody.js';

const D = Math.PI / 180;
// 겨눔: 용이면 입에서 겨눔 한계 안으로(설계 용 §3), 아니면 보스 가운데에서 플레이어 쪽
const aimAt = w => { const o = w.boss.mouth; return o ? headAim(w, o.x, o.z) : Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x); };

// 보스 몸(용이면 입)에서 a 쪽으로 탄 하나.
function shoot(w, run, kind, a, speed, from = null) {
  const m = w.rules.patterns.muzzle, o = w.boss.mouth;
  const x = from ? from[0] : o ? o.x : w.boss.x + Math.cos(a) * m, z = from ? from[1] : o ? o.z : w.boss.z + Math.sin(a) * m;
  if (o && Math.hypot(x - w.player.x, z - w.player.z) < w.rules.dragon.mouthGuard) return -1;   // 용 머리 밑(입 바로 앞)의 플레이어 위에서는 탄이 생기지 않는다 — 피할 틈 없이 맞지 않게
  const id = spawnBullet(w, kind, x, z, a, speed, run.id);
  if (id >= 0) emit(w, 'fire', { kind: w.bullets.kind[id], x, z, id, src: run.id });
  return id;
}

// 차선: 조준이면 발사 lockBefore 전까지 플레이어를 따라가고 그 뒤 고정. warn이 끝나면 그 각도로 쏜다.
function addLane(w, run, kind, angle, aimed, speed) {
  const L = w.rules.lanes, m = w.rules.patterns.muzzle, o = w.boss.mouth;
  const lane = { x: o ? o.x : w.boss.x, z: o ? o.z : w.boss.z, angle, aimed, warn: kind === K.RED ? L.redWarn : L.goldWarn, lockBefore: L.lockBefore, born: w.time, kind, speed, src: run.id, off: o ? 0 : m };
  w.lanes.push(lane);
  emit(w, 'lane', { kind, x: lane.x, z: lane.z, angle, aimed });
  return lane;
}

export function updateLanes(w) {
  for (let k = w.lanes.length - 1; k >= 0; k--) {
    const l = w.lanes[k], age = w.time - l.born;
    if (l.aimed && age < l.warn - l.lockBefore) l.angle = headAim(w, l.x, l.z);   // 용이면 겨눔 한계 안
    if (age >= l.warn) {
      const from = [l.x + Math.cos(l.angle) * l.off, l.z + Math.sin(l.angle) * l.off];
      shoot(w, { id: l.src }, l.kind, l.angle, l.speed, from);
      w.lanes.splice(k, 1);
    }
  }
}

// 정한 때(times)마다 fn(차례)를 부른다.
function due(run, t, times, fn) {
  while (run.k < times.length && t >= times[run.k] - 1e-9) fn(run.k++);
}

// 고리에서 흰 탄 자리 n개를 난수로 고른다(빈틈 칸은 빼고).
function pickSlots(w, total, skip, n) {
  const out = new Set();
  for (let guard = 0; out.size < n && guard < 100; guard++) { const s = w.rng.int(total); if (!skip.has(s)) out.add(s); }
  return out;
}

export const PATTERNS = {
  1: {
    id: 1, name: '조준 부채', phases: [1, 2], ranges: ['mid', 'far'], colors: [K.NORMAL, K.WHITE],
    length: w => w.rules.patterns[1].volleys.at(-1),
    emit(w, run, t) {
      const P = w.rules.patterns[1], n = run.sparse ? P.nSparse : P.n;
      due(run, t, P.volleys, () => {
        const a0 = aimAt(w), half = (n - 1) / 2, step = n > 1 ? P.spreadDeg * D / (n - 1) : 0;
        for (let i = 0; i < n; i++) shoot(w, run, i === half ? K.WHITE : K.NORMAL, a0 + (i - half) * step, P.speed);
      });
      return run.k >= P.volleys.length;
    },
  },
  2: {
    id: 2, name: '고리 터짐', phases: [1, 2], ranges: ['near', 'mid'], colors: [K.NORMAL, K.WHITE, K.GOLD],
    length: w => w.rules.patterns[2].rings.at(-1),
    emit(w, run, t) {
      const P = w.rules.patterns[2], n = run.sparse ? P.nSparse : P.n, gapN = run.sparse ? P.gapSparse : P.gapSlots;
      const [wLo, wHi] = run.sparse ? P.whitesSparse : P.whites, stepA = 2 * Math.PI / n;
      if (run.gap === undefined) run.gap = w.rng.int(n);
      // 마지막 고리의 금 1발 — 고정 차선(경고가 끝나는 때가 마지막 고리와 같게)
      if (!run.goldLane && t >= P.rings[P.rings.length - 1] - w.rules.lanes.goldWarn - 1e-9) {
        run.goldLane = true;
        const last = P.rings.length - 1, slot = (run.gap + Math.floor(n / 2)) % n;
        addLane(w, run, K.GOLD, slot * stepA + last * P.twistDeg * D + 0.5 * stepA, false, P.speed);
      }
      due(run, t, P.rings, k => {
        const twist = k * P.twistDeg * D, skip = new Set();
        for (let g = 0; g < gapN; g++) skip.add((run.gap + g) % n);
        const whites = pickSlots(w, n, skip, wLo + w.rng.int(wHi - wLo + 1));
        for (let s = 0; s < n; s++) if (!skip.has(s)) shoot(w, run, whites.has(s) ? K.WHITE : K.NORMAL, s * stepA + twist, P.speed);
      });
      return run.k >= P.rings.length && w.lanes.every(l => l.src !== 2);
    },
  },
  3: {
    id: 3, name: '빨간 창', phases: [1, 2], ranges: ['mid', 'far'], colors: [K.RED],
    length: (w, run) => (run?.sparse ? w.rules.patterns[3].atSparse : w.rules.patterns[3].at).at(-1) + w.rules.lanes.redWarn,
    emit(w, run, t) {
      const P = w.rules.patterns[3], at = run.sparse ? P.atSparse : P.at;
      due(run, t, at, () => addLane(w, run, K.RED, aimAt(w), true, P.speed));
      return run.k >= at.length && w.lanes.every(l => l.src !== 3);
    },
  },
  4: {
    id: 4, name: '쪼개지는 구슬', phases: [1, 2], ranges: ['mid', 'far'], colors: [K.NORMAL, K.WHITE],
    length: (w, run) => (run?.burst ? run.t : w.rules.patterns[4].burstAt),
    emit(w, run, t) {
      const P = w.rules.patterns[4], b = w.bullets, n = run.sparse ? P.nSparse : P.n, nw = run.sparse ? P.whitesSparse : P.whites;
      if (run.orb === undefined) {
        run.dir = aimAt(w);
        run.orb = shoot(w, run, K.NORMAL, run.dir, P.speed);
        if (run.orb >= 0) b.r[run.orb] = P.r;
        run.burst = false;
      }
      if (run.burst) return true;
      const o = run.orb;
      if (o < 0 || !b.alive[o]) return true;   // 구슬이 지워졌다(맞힘·판 밖)
      // 흰 조각이 갈 방향 = 조각 방향 중 플레이어 쪽에 가장 가까운 nw개 → 화면이 구슬에 점으로 표시
      const toP = Math.atan2(w.player.z - b.z[o], w.player.x - b.x[o]);
      const dirs = Array.from({ length: n }, (_, i) => run.dir + i * 2 * Math.PI / n);
      const near = dirs.map((a, i) => [Math.abs(Math.atan2(Math.sin(a - toP), Math.cos(a - toP))), i]).sort((p, q) => p[0] - q[0]).slice(0, nw).map(e => e[1]);
      run.marks = near.map(i => dirs[i]);
      const d = Math.hypot(w.player.x - b.x[o], w.player.z - b.z[o]);
      if ((d <= P.burstDist && t >= P.minTravel) || t >= P.burstAt) {   // 조금은 날아가야 구슬로 읽힌다
        const at = [b.x[o], b.z[o]];
        run.burst = true;
        for (let i = 0; i < n; i++) shoot(w, run, near.includes(i) ? K.WHITE : K.NORMAL, dirs[i], P.fragSpeed, at);
        killBullet(w, o);
        return true;
      }
      return t >= P.maxSec;
    },
  },
  5: {
    id: 5, name: '나선', phases: [2], ranges: ['mid'], colors: [K.NORMAL, K.WHITE],
    length: w => w.rules.patterns[5].dur,
    emit(w, run, t) {
      const P = w.rules.patterns[5], every = run.sparse ? P.everySparse : P.every;
      if (run.a === undefined) { run.a = aimAt(w); run.shot = 0; }
      while (run.shot * every <= Math.min(t, P.dur) + 1e-9) {
        for (let arm = 0; arm < P.arms; arm++) {
          const a = run.a + run.shot * P.stepDeg * D + arm * 2 * Math.PI / P.arms;
          shoot(w, run, (run.shot % P.whiteEvery === P.whiteEvery - 1) ? K.WHITE : K.NORMAL, a, P.speed);
        }
        run.shot++;
      }
      return t >= P.dur;
    },
  },
  6: {
    id: 6, name: '연발', phases: [2], ranges: ['mid', 'far'], colors: [K.NORMAL, K.GOLD],
    length: w => w.rules.patterns[6].dur,
    emit(w, run, t) {
      const P = w.rules.patterns[6], every = run.sparse ? P.everySparse : P.every;
      if (run.shot === undefined) run.shot = 0;
      while (run.shot * every < P.dur - 1e-9 && run.shot * every <= t + 1e-9) { shoot(w, run, K.NORMAL, aimAt(w), P.speed); run.shot++; }
      if (!run.goldLane && t >= P.dur - w.rules.lanes.goldWarn - 1e-9) { run.goldLane = true; addLane(w, run, K.GOLD, aimAt(w), true, P.speed); }
      return t >= P.dur && w.lanes.every(l => l.src !== 6);
    },
  },
  7: {
    id: 7, name: '탄 벽', phases: [2], ranges: ['mid', 'far'], colors: [K.NORMAL, K.WHITE, K.RED],
    length: () => 0.05,
    emit(w, run, t) {
      const P = w.rules.patterns[7];
      if (!run.wallLine) buildWall(w, run, P);
      return t >= P.maxSec || !anyAlive(w, 7);
    },
  },
};

function anyAlive(w, src) {
  const b = w.bullets;
  for (let i = 0; i < b.cap; i++) if (b.alive[i] && b.src[i] === src) return true;
  return false;
}

// 탄 벽: 보스를 지나고 보스→플레이어에 수직인 줄. 가까운 빈틈(플레이어 쪽 ±nearGap)은 흰 탄으로 막고, 먼 빈틈은 비운다. 빨간 토막 섞음.
function buildWall(w, run, P) {
  const bx = w.boss.x, bz = w.boss.z, a = aimAt(w), tx = -Math.sin(a), tz = Math.cos(a);
  const hx = w.rules.board.hx, hz = w.rules.board.hz, spacing = run.sparse ? P.spacingSparse : P.spacing;
  // 줄이 판 안에 있는 s 범위
  let lo = -40, hi = 40;
  for (const [o, d, h] of [[bx, tx, hx], [bz, tz, hz]]) {
    if (Math.abs(d) < 1e-9) continue;
    const s1 = (-h - o) / d, s2 = (h - o) / d;
    lo = Math.max(lo, Math.min(s1, s2)); hi = Math.min(hi, Math.max(s1, s2));
  }
  run.wallLine = [bx + tx * lo, bz + tz * lo, bx + tx * hi, bz + tz * hi];
  const side = w.rng.next() < 0.5 ? -1 : 1;
  let near = side * P.nearGap, far = -side * (P.farGap[0] + w.rng.next() * (P.farGap[1] - P.farGap[0]));
  // 판 밖으로 나간 빈틈은 안으로 당긴다
  const fit = s => Math.max(lo + P.gap, Math.min(hi - P.gap, s));
  near = fit(near); far = fit(far);
  if (Math.abs(far - near) < P.gap * 2) far = fit(near - side * P.gap * 3);
  const inGap = (s, c) => Math.abs(s - c) < P.gap / 2;
  // 빨간 토막 자리(빈틈과 겹치지 않게)
  const reds = [];
  for (let k = 0; k < P.reds; k++) {
    for (let guard = 0; guard < 20; guard++) {
      const c = lo + 1 + w.rng.next() * (hi - lo - 2);
      if (Math.abs(c - near) > P.gap * 1.5 && Math.abs(c - far) > P.gap * 1.5) { reds.push(c); break; }
    }
  }
  const redAt = s => reds.some(c => Math.abs(s - c) < P.redLen * spacing / 2);
  for (let s = lo + spacing / 2; s < hi; s += spacing) {
    if (inGap(s, near) || inGap(s, far)) continue;
    shoot(w, run, redAt(s) ? K.RED : K.NORMAL, a, P.speed, [bx + tx * s, bz + tz * s]);
  }
  // 막는 흰 탄(가까운 빈틈 가운데에 plugWhites발)
  const wg = P.gap / (P.plugWhites + 1);
  for (let k = 0; k < P.plugWhites; k++) shoot(w, run, K.WHITE, a, P.speed, [bx + tx * (near - P.gap / 2 + wg * (k + 1)), bz + tz * (near - P.gap / 2 + wg * (k + 1))]);
}

// 쓸어내는 레이저(§5.4 패턴 8) — 빔은 beams.js가 돌린다
PATTERNS[8] = {
  id: 8, name: '쓸어내는 레이저', phases: [1, 2], ranges: ['mid', 'far'], colors: [K.RED],
  length: w => w.rules.laser.aim + w.rules.laser.sweepSec,
  emit(w, run) { if (!run.beam) run.beam = startLaser(w, run); return w.time >= run.beam.endAt - 1e-9; },
};

export function startPattern(w, id, { sparse = false } = {}) {
  return { id, t: 0, start: w.time, sparse, done: false, k: 0 };
}

export function updatePattern(w, run) {
  if (run.done) return true;
  run.t = w.time - run.start;
  run.done = !!PATTERNS[run.id].emit(w, run, run.t);
  return run.done;
}

// 준비 번쩍임 색 = 다음 위협 색: 금 > 흰 > 빨강뿐 > 자주(§5.1).
export function windupColor(id) {
  const c = PATTERNS[id].colors;
  if (c.includes(K.GOLD)) return 'gold';
  if (c.includes(K.WHITE)) return 'white';
  if (c.includes(K.RED)) return 'red';
  return 'purple';
}
