// 시범 봇(§9) — 게임 기능이 아니라 확인·영상·수치 맞추기용 도구.
// 사람처럼: 0.2초 전 탄 모습을 보고 그만큼 앞으로 내다본다(그 사이 생긴 탄은 모름), 플레이어 둘레 10 U 안만 본다, 패링 타이밍이 흔들린다.
// 종류: '1' 숙련 · 'some' 가끔 패링(기회 절반, ±0.08초) · 'dodge' 패링 안 함 · 'walk' 패링·회피 안 함 · 'turtle' 서서 패링만.
// 장판 공격(박치기 줄·파도·검기)과 레이저도 본다: 흰·금은 닿기 직전 패링, 걸어서 못 피하는 빨강(파도 등)은 닿기 dodgeLead초 전 구르기,
// 박치기 줄·검기·빔은 움직임 셈의 위험에 넣는다(비킬 수 없으면 구른다).
import { K } from './rules.js';
import { makeRng } from './rng.js';
import { clampToBoard, inSector, inCircle } from './geom.js';
import { isDodging } from './player.js';
import { parryActive } from './parry.js';
import { canExecute } from './execute.js';
import { bossGroggy } from './boss.js';

const DIRS = [[0, 0]];
for (let i = 0; i < 16; i++) DIRS.push([Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);

// ── 몸으로 받는 위협(장판 공격·파도·빔). 모두 지금부터 몇 초 뒤인지로 센다.
// 박치기: 보스 몸(반지름 boss.r)이 줄 위 (qx,qz)의 몸과 겹치는 [들어옴, 나감], 줄 밖이거나 이미 지났으면 null
function slamSpan(w, qx, qz) {
  const f = w.floor, R = w.rules, F = R.floor.slam, a = f.area, b = w.boss, now = w.time;
  if (f.hitDone) return null;
  const ux = Math.cos(a.face), uz = Math.sin(a.face), body = R.boss.r + R.player.bodyR;
  const dx = qx - a.x, dz = qz - a.z, s = dx * ux + dz * uz, lat = Math.abs(-dx * uz + dz * ux);
  if (lat >= body || s < -body) return null;
  const half = Math.sqrt(body * body - lat * lat), sIn = s - half;
  let t0;
  if (f.phase === 'warn') t0 = f.born + F.warn - now + Math.max(0, sIn) / F.speed;
  else { const sb = (b.x - a.x) * ux + (b.z - a.z) * uz; if (sb > s + half) return null; t0 = Math.max(0, sIn - sb) / F.speed; }
  return [t0, t0 + 2 * half / F.speed];
}
// 파도: 앞면이 (qx,qz)의 몸에 닿기까지(퍼지는 것 + 아직 예고 중인 것). [{ t, color, key }]
function waveHits(w, qx, qz, react) {
  const R = w.rules, F = R.floor.wave, out = [], body = R.player.bodyR;
  for (const v of w.waves) {
    if (v.hitDone) continue;
    const d = Math.hypot(qx - v.x, qz - v.z);
    if (d + body < v.r - F.thick) continue;   // 이미 지나감
    out.push({ t: Math.max(0, (d - body - v.r) / F.speed), color: v.color, key: `wave:${Math.round(v.born * 120)}` });
  }
  const f = w.floor;
  if (f && f.kind === 'wave' && !f.wave && f.born <= w.time - react + 1e-9) {
    const d = Math.hypot(qx - w.boss.x, qz - w.boss.z), at = f.born + F.warn;
    out.push({ t: at - w.time + Math.max(0, d - body - R.boss.r) / F.speed, color: f.color, key: `wave:${Math.round(at * 120)}` });
  }
  return out;
}
// 빔: 지금부터 t초 뒤 (qx,qz)가 빔 폭(+ 여유) 안인가
function beamAt(w, m, qx, qz, t, margin) {
  const L = w.rules.laser, T = w.time + t;
  if (T < m.fireAt || T >= m.endAt) return false;
  const a = m.base + m.dir * L.sweepDeg * Math.PI / 180 * Math.min(1, (T - m.fireAt) / L.sweepSec);
  const ux = Math.cos(a), uz = Math.sin(a), s = (qx - m.x) * ux + (qz - m.z) * uz;
  if (s < 0) return false;
  return Math.abs(-(qx - m.x) * uz + (qz - m.z) * ux) < L.width / 2 + w.rules.player.hitR + margin;
}

export function createBot(kind, seed) {
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  const parries = kind === '1' || kind === 'some' || kind === 'turtle';
  const moves = kind !== 'turtle';
  const dodges = kind === '1' || kind === 'some' || kind === 'dodge';
  const jitterMax = kind === 'some' ? 0.08 : 0.04;
  let ring = null, head = 0, frames = 0, nextThink = 0, mx = 0, mz = 0;
  const plans = new Map();   // 기회(탄 id·생긴 때 / 장판 born) → { parry: bool, jitter }

  function snapshot(w, R) {
    if (!ring) {
      const n = Math.round(R.bot.react / R.dt) + 1, cap = w.bullets.cap;
      ring = Array.from({ length: n }, () => ({ n: 0, t: 0, x: new Float64Array(cap), z: new Float64Array(cap), vx: new Float64Array(cap), vz: new Float64Array(cap), r: new Float64Array(cap), kind: new Uint8Array(cap), id: new Int32Array(cap), born: new Float64Array(cap) }));
    }
    const f = ring[head], b = w.bullets, p = w.player, reach = R.bot.sight + 6;
    f.n = 0; f.t = w.time;
    for (let i = 0; i < b.cap; i++) {
      if (!b.alive[i] || b.kind[i] === K.REFLECT) continue;
      if (Math.abs(b.x[i] - p.x) > reach || Math.abs(b.z[i] - p.z) > reach) continue;
      const k = f.n++;
      f.x[k] = b.x[i]; f.z[k] = b.z[i]; f.vx[k] = b.vx[i]; f.vz[k] = b.vz[i]; f.r[k] = b.r[i]; f.kind[k] = b.kind[i]; f.id[k] = i; f.born[k] = b.born[i];
    }
    head = (head + 1) % ring.length; frames++;
  }
  // 반응 지연만큼 지난 모습(없으면 null)
  const delayed = () => (frames >= ring.length ? ring[head] : null);

  function plan(key, isParryable) {
    let pl = plans.get(key);
    if (!pl) {
      pl = { parry: parries && isParryable && (kind !== 'some' || rng.next() < 0.5), jitter: (rng.next() * 2 - 1) * jitterMax };
      plans.set(key, pl);
      if (plans.size > 2000) plans.delete(plans.keys().next().value);
    }
    return pl;
  }

  // 접촉까지 남은 시간(가만히 있을 때): |(x,z) + v t − p| = rad
  function contact(px, pz, x, z, vx, vz, rad) {
    const dx = x - px, dz = z - pz, a = vx * vx + vz * vz, bq = 2 * (dx * vx + dz * vz), c = dx * dx + dz * dz - rad * rad;
    if (c <= 0) return 0;
    if (a < 1e-9) return Infinity;
    const disc = bq * bq - 4 * a * c;
    if (disc < 0) return Infinity;
    const t = (-bq - Math.sqrt(disc)) / (2 * a);
    return t >= 0 ? t : Infinity;
  }

  return function bot(w) {
    const R = w.rules, B = R.bot, p = w.player, now = w.time;
    snapshot(w, R);
    if (w.execute) return { mx: 0, mz: 0, parry: false, dodge: false };
    if (parries && canExecute(w)) return { mx: 0, mz: 0, parry: true, dodge: false };   // 그로기 곁 = 처형
    const f = delayed();
    const lag = f ? now - f.t : 0;
    let parry = false, dodge = false;
    // 근접 장판 + 검기(부채). 박치기 줄·파도 예고 원은 아래에서 따로 센다.
    const seenAreas = [...w.melee.areas, ...w.floorAreas.filter(a => a.kind === 'sword')].filter(a => a.born <= now - B.react + 1e-9);
    const slamOn = !!w.floor && w.floor.kind === 'slam' && w.floor.born <= now - B.react + 1e-9;
    const slamKey = slamOn ? `slam:${Math.round(w.floor.born * 120)}` : null;
    const slamParry = slamOn && w.floor.color !== 'red' && plan(slamKey, true).parry;
    const waves = waveHits(w, p.x, p.z, B.react);
    const seenBeams = w.beams.filter(m => m.born <= now - B.react + 1e-9);
    const seenLanes = w.lanes.filter(l => l.born <= now - B.react + 1e-9);

    // 패링: 받을 생각인 흰·금 탄이 lead초 뒤 패링 원에 닿으면 누른다
    if (parries && f && !parryActive(w) && !isDodging(w) && now >= p.parry.failUntil) {
      const [lo, hi] = B.parryLead;
      for (let k = 0; k < f.n && !parry; k++) {
        const kd = f.kind[k];
        if (kd !== K.WHITE && kd !== K.GOLD) continue;
        const pl = plan(`${f.id[k]}:${f.born[k]}`, true);
        if (!pl.parry) continue;
        const x = f.x[k] + f.vx[k] * lag, z = f.z[k] + f.vz[k] * lag;
        const tc = contact(p.x, p.z, x, z, f.vx[k], f.vz[k], R.player.parryR + f.r[k]);
        if (tc >= lo + pl.jitter && tc <= hi + pl.jitter) parry = true;
      }
      for (const a of seenAreas) {
        if (parry || a.hit || a.color === 'red') continue;
        const pl = plan(`area:${a.born}`, true);
        if (!pl.parry) continue;
        const tH = a.born + a.warn - now;
        const inside = a.shape === 'circle' ? inCircle(p.x, p.z, R.player.bodyR, a.x, a.z, a.R) : inSector(p.x, p.z, R.player.bodyR, a.x, a.z, a.R, a.face, a.half);
        if (inside && tH >= lo + pl.jitter && tH <= hi + pl.jitter) parry = true;
      }
      // 흰·금 박치기·파도: 몸에 닿기 lead초 전
      if (!parry && slamParry) {
        const sp = slamSpan(w, p.x, p.z), j = plan(slamKey, true).jitter;
        if (sp && sp[0] >= lo + j && sp[0] <= hi + j) parry = true;
      }
      for (const h of waves) {
        if (parry || h.color === 'red') continue;
        const pl = plan(h.key, true);
        if (pl.parry && h.t >= lo + pl.jitter && h.t <= hi + pl.jitter) parry = true;
      }
    }

    // 받을 흰·금 탄이 곧 오면(가만히 있을 때 0.5초 안) 그 길을 지킨다 — 위험하지 않은 한
    let hold = false;
    if (parries && f) {
      for (let k = 0; k < f.n && !hold; k++) {
        const kd = f.kind[k];
        if ((kd !== K.WHITE && kd !== K.GOLD) || !plan(`${f.id[k]}:${f.born[k]}`, true).parry) continue;
        const x = f.x[k] + f.vx[k] * lag, z = f.z[k] + f.vz[k] * lag;
        if (contact(p.x, p.z, x, z, f.vx[k], f.vz[k], R.player.parryR + f.r[k]) < B.look) hold = true;
      }
      // 받을 흰·금 근접 타가 곧 오고 지금 장판 안이면 그 자리를 지킨다(걸어 나가면 패링 기회가 사라진다)
      for (const a of seenAreas) {
        if (hold || a.hit || a.color === 'red' || !plan(`area:${a.born}`, true).parry) continue;
        const inside = a.shape === 'circle' ? inCircle(p.x, p.z, R.player.bodyR, a.x, a.z, a.R) : inSector(p.x, p.z, R.player.bodyR, a.x, a.z, a.R, a.face, a.half);
        if (inside && a.born + a.warn - now < B.look) hold = true;
      }
      // 받을 박치기가 곧 오면 줄 위에서 기다린다
      if (!hold && slamParry) { const sp = slamSpan(w, p.x, p.z); if (sp && sp[0] < B.look) hold = true; }
    }

    // 움직임: 정한 간격마다 17가지 중 위험이 가장 작은 것
    if (moves && now >= nextThink - 1e-9) {
      nextThink = now + B.think;
      let best = Infinity, bestDir = DIRS[0], bestEarly = 0, stayDanger = Infinity;
      const look = B.look, n = B.samples, speed = R.player.speed;
      for (const [dx, dz] of DIRS) {
        let danger = 0, early = 0;
        for (let j = 1; j <= n; j++) {
          const t = look * j / n;
          const [qx, qz] = clampToBoard(R, p.x + dx * speed * t, p.z + dz * speed * t, R.player.bodyR);
          if (f) for (let k = 0; k < f.n; k++) {
            const kd = f.kind[k];
            if ((kd === K.WHITE || kd === K.GOLD) && plan(`${f.id[k]}:${f.born[k]}`, true).parry) continue;
            const x = f.x[k] + f.vx[k] * (lag + t), z = f.z[k] + f.vz[k] * (lag + t);
            if (Math.abs(x - qx) > 2 || Math.abs(z - qz) > 2) continue;
            const d = Math.hypot(x - qx, z - qz), lim = R.player.hitR + f.r[k] + B.margin;
            if (d < lim) { danger += 10 * (n + 1 - j); if (j <= 2) early++; } else if (d < lim + 0.5) danger += 0.4;
          }
          for (const l of seenLanes) {
            const tf = l.born + l.warn - now;
            if (t < tf) continue;
            const s = l.speed * (t - tf) + l.off, x = l.x + Math.cos(l.angle) * s, z = l.z + Math.sin(l.angle) * s;
            if (l.kind === K.GOLD && parries) continue;
            const d = Math.hypot(x - qx, z - qz);
            if (d < R.player.hitR + R.bullets.r[l.kind] + B.margin) { danger += 10 * (n + 1 - j); if (j <= 2) early++; }
          }
          for (const a of seenAreas) {
            if (a.hit) continue;
            const tH = a.born + a.warn - now;
            if (Math.abs(t - tH) > look / n / 2 + 1e-9) continue;
            if (a.color !== 'red' && plan(`area:${a.born}`, true).parry) continue;
            const inside = a.shape === 'circle' ? inCircle(qx, qz, R.player.bodyR, a.x, a.z, a.R) : inSector(qx, qz, R.player.bodyR, a.x, a.z, a.R, a.face, a.half);
            if (inside) { danger += 30; if (tH < 0.17) early++; }
          }
          // 박치기 줄: 그때 보스 몸이 그 자리를 지나가면
          if (slamOn && !slamParry) {
            const sp = slamSpan(w, qx, qz), hw = look / n / 2;
            if (sp && t >= sp[0] - hw && t <= sp[1] + hw) { danger += 30; if (sp[0] < 0.17) early++; }
          }
          // 레이저 빔
          for (const m of seenBeams) if (beamAt(w, m, qx, qz, t, B.margin)) { danger += 10 * (n + 1 - j); if (j <= 2) early++; }
          if (j === n) {
            const db = Math.hypot(qx - w.boss.x, qz - w.boss.z);
            // 패링하는 봇은 돌진·근접 동안 달아나지 않고 붙어서 받는다(사람도 그렇다 — 달아나면 패링 기회가 사라진다)
            const duel = parries && (w.boss.state === 'rush' || w.boss.state === 'melee' || w.boss.state === 'meleeWait' || !!w.melee.combo);
            const [k0, k1] = parries && bossGroggy(w) ? B.execBand : duel ? B.duel : B.keep;   // 그로기면 다가가 처형
            danger += (Math.max(0, k0 - db) + Math.max(0, db - k1)) * 0.6;
            const edge = Math.min(R.board.hx - Math.abs(qx), R.board.hz - Math.abs(qz));
            if (edge < 1.5) danger += (1.5 - edge) * 1.0;
          }
        }
        if (dx === 0 && dz === 0) stayDanger = danger;
        if (danger < best - 1e-9) { best = danger; bestDir = [dx, dz]; bestEarly = early; }
      }
      if (hold && stayDanger < 10) { bestDir = DIRS[0]; bestEarly = 0; }
      mx = bestDir[0]; mz = bestDir[1];
      if (dodges && bestEarly > 0 && p.dodge.charges > 0 && !isDodging(w)) dodge = true;
    }
    if (!moves) { mx = 0; mz = 0; }
    // 걸어서 못 피하는 빨간 파도(또는 받지 않을 흰 파도): 닿기 dodgeLead초 전 구르기
    if (dodges && !dodge && !parry && p.dodge.charges > 0 && !isDodging(w)) {
      for (const h of waves) if ((h.color === 'red' || !plan(h.key, true).parry) && h.t <= B.dodgeLead) dodge = true;
    }
    return { mx, mz, parry, dodge };
  };
}
