// 시범 봇(§9) — 게임 기능이 아니라 확인·영상·수치 맞추기용 도구.
// 사람처럼: 0.2초 전 탄 모습을 보고 그만큼 앞으로 내다본다(그 사이 생긴 탄은 모름), 플레이어 둘레 10 U 안만 본다, 패링 타이밍이 흔들린다.
// 종류: '1' 숙련 · 'some' 가끔 패링(기회 절반, ±0.08초) · 'dodge' 패링 안 함 · 'walk' 패링·회피 안 함 · 'turtle' 서서 패링만 ·
//       'user' 사용자 판에 맞춘 봇(패링은 정확하지만 기회의 일부만, 탄은 늦게 보고 드물게 고쳐 움직여 더 맞는다 — RULES.bot.user).
// 모아 던지기(§4.11) 판에서는 패링하는 봇이 던진다: 가득이거나, 회복이 버려지지 않을 만큼 깎였거나, 보스가 그로기거나, 체력이 위태로울 때.
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
// 날갯짓 파도(arc)는 그 반원 안만 닿는다
const inArc = (arc, cx, cz, qx, qz) => !arc || Math.abs(Math.atan2(Math.sin(Math.atan2(qz - cz, qx - cx) - arc.face), Math.cos(Math.atan2(qz - cz, qx - cx) - arc.face))) <= arc.half;
// 파도: 앞면이 (qx,qz)의 몸에 닿기까지(퍼지는 것 + 아직 예고 중인 것). [{ t, color, key }]
function waveHits(w, qx, qz, react) {
  const R = w.rules, F = R.floor.wave, out = [], body = R.player.bodyR;
  for (const v of w.waves) {
    if (v.hitDone || !inArc(v.arc, v.x, v.z, qx, qz)) continue;
    const d = Math.hypot(qx - v.x, qz - v.z);
    if (d + body < v.r - F.thick) continue;   // 이미 지나감
    out.push({ t: Math.max(0, (d - body - v.r) / F.speed), color: v.color, key: `wave:${Math.round(v.born * 120)}` });
  }
  const f = w.floor;
  if (f && f.kind === 'wave' && !f.wave && f.born <= w.time - react + 1e-9 && inArc(f.arc, w.boss.x, w.boss.z, qx, qz)) {
    const d = Math.hypot(qx - w.boss.x, qz - w.boss.z), at = f.born + f.area.warn;
    out.push({ t: at - w.time + Math.max(0, d - body - R.boss.r) / F.speed, color: f.color, key: `wave:${Math.round(at * 120)}` });
  }
  return out;
}
// 돌격병의 줄(스테이지): 돌격병 몸이 줄 위 (qx,qz)의 몸과 겹치는 [들어옴, 나감] — 줄 밖이거나 이미 지났으면 null
function chargeSpan(w, a, m, qx, qz) {
  const R = w.rules, C = R.mobs.charger, body = m.r + R.player.bodyR, ux = Math.cos(a.face), uz = Math.sin(a.face);
  const dx = qx - a.x, dz = qz - a.z, s = dx * ux + dz * uz, lat = Math.abs(-dx * uz + dz * ux);
  if (lat >= body || s < -body || s > a.len + body) return null;
  const half = Math.sqrt(body * body - lat * lat), sIn = s - half;
  let t0;
  if (m.state === 'windup') t0 = m.stateAt + (a.warn ?? C.warn) - w.time + Math.max(0, sIn) / C.dash;
  else if (m.state === 'dash') { const sb = (m.x - a.x) * ux + (m.z - a.z) * uz; if (sb > s + half) return null; t0 = Math.max(0, sIn - sb) / C.dash; }
  else return null;
  return [t0, t0 + 2 * half / C.dash];
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

// 흰 탄 찾아가기: (ux, uz)로 look초 걷고 선다면, 받을 탄 가운데 하나라도 ahead초 안에 within 안으로 지나가는가
function meets(f, wants, lag, px, pz, ux, uz, look, HB) {
  for (const k of wants) {
    const vx = f.vx[k], vz = f.vz[k], x0 = f.x[k] + vx * lag - px, z0 = f.z[k] + vz * lag - pz;
    // 걷는 동안: 서로의 속도 차로 가장 가까운 때
    const dvx = vx - ux, dvz = vz - uz, dd = dvx * dvx + dvz * dvz;
    const t1 = dd > 0 ? Math.max(0, Math.min(look, -(x0 * dvx + z0 * dvz) / dd)) : 0;
    if (Math.hypot(x0 + dvx * t1, z0 + dvz * t1) <= HB.within) return true;
    // 선 뒤: 탄의 길에서 가장 가까운 때(ahead초 안)
    const x1 = x0 + dvx * look, z1 = z0 + dvz * look, vv = vx * vx + vz * vz;
    const t2 = vv > 0 ? Math.max(0, Math.min(HB.ahead, -(x1 * vx + z1 * vz) / vv)) : 0;
    if (Math.hypot(x1 + vx * t2, z1 + vz * t2) <= HB.within) return true;
  }
  return false;
}

export function createBot(kind, seed) {
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  const user = kind === 'user';
  const parries = kind === '1' || kind === 'some' || kind === 'turtle' || user;
  const moves = kind !== 'turtle';
  const dodges = kind === '1' || kind === 'some' || kind === 'dodge' || user;
  const jitterMax = kind === 'some' ? 0.08 : 0.04;
  let ring = null, head = 0, frames = 0, nextThink = 0, mx = 0, mz = 0, skillTurn = 0;
  let zoneGoal = null, lastBossState = null;   // 용 판: 머리 공격이 끝날 때 가끔 옆·뒤로 돌아간다({ off, R, until })
  const plans = new Map();   // 기회(탄 id·생긴 때 / 장판 born) → { parry: bool, jitter }
  let snipeLeft = 0;   // 저격(실험): 누르고 있을 남은 틱
  let pinch = false, calm = false;   // 실험 기믹: 서 있으면 맞는다(갈고리로 비킨다) / 지금 자리가 안전함
  let roomPick = null;   // 스테이지: 이 방에서 고를 보상({ room, kind })
  let userChance = 0.5, userB = null;   // user 봇: 받는 기회 몫과 규칙 묶음(판 규칙에서 한 번 읽는다)

  function snapshot(w, R) {
    if (!ring) {
      const n = Math.round((user ? R.bot.user.react : R.bot.react) / R.dt) + 1, cap = w.bullets.cap;
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
      pl = { parry: parries && isParryable && (kind === 'some' ? rng.next() < 0.5 : !user || rng.next() < userChance), jitter: (rng.next() * 2 - 1) * jitterMax };
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
    const R = w.rules, B0 = R.bot, p = w.player, now = w.time;
    const B = user ? (userB ??= { ...B0, react: B0.user.react, think: B0.user.think }) : B0;   // user: 늦게 보고 드물게 고쳐 움직인다
    userChance = B0.user.chance;
    snapshot(w, R);
    // 모아 던지기(§4.11): 던질 때
    let toss = false;
    if (w.opts.store && parries && p.store.length > 0) {
      const S = R.store, n = p.store.length;
      let heal = 0; for (const o of p.store) heal += o.perfect ? S.heal[1] : S.heal[0];
      const free = p.dyingAt == null && !(p.auto && now < p.autoUntil);   // 못 던지는 때엔 누르지 않는다(틱 소리만 난다)
      const target = !w.boss.away || !!w.aim;   // 일반 방: 겨눌 적이 없으면 아낀다(다음 방으로 들고 간다)
      toss = free && target && (n >= S.cap || (n >= 2 && R.player.hp - p.hp >= heal) || bossGroggy(w) || p.hp <= R.player.hp * 0.25);
    }
    if (w.execute) return { mx: 0, mz: 0, parry: false, dodge: false, throw: false };
    if (parries && canExecute(w)) return { mx: 0, mz: 0, parry: !toss, dodge: false, throw: toss };   // 그로기 곁 = (모은 것부터 던지고) 처형
    const f = delayed();
    const lag = f ? now - f.t : 0;
    // 용 판 자리 정하기(설계 용 §9): 가까이서 받은 공격(발톱·장판)이 끝나면 chance꼴로 옆(±90°)이나 뒤(180°) 목표 자리를 sec초 지킨다.
    // 이미 붙어 있을 때만 — 머리 공격 중에 멀리서 옆으로 돌면 조준 탄에 맞는다(봇 판에서 확인)
    const Bz = B.zone, bs = w.boss.state, near = Math.hypot(p.x - w.boss.x, p.z - w.boss.z) < Bz.from;
    if (moves && w.boss.kind === 'dragon' && bs === 'idle' && (lastBossState === 'floor' || lastBossState === 'melee') && near && !zoneGoal && rng.next() < Bz.chance) {
      const pickSide = rng.next(), off = pickSide < 1 / 3 ? Math.PI / 2 : pickSide < 2 / 3 ? -Math.PI / 2 : Math.PI;
      zoneGoal = { off, R: Bz.R[0] + rng.next() * (Bz.R[1] - Bz.R[0]), until: now + Bz.sec[0] + rng.next() * (Bz.sec[1] - Bz.sec[0]) };
    }
    lastBossState = bs;
    if (zoneGoal && now >= zoneGoal.until) zoneGoal = null;
    let parry = false, dodge = false;
    // 근접 장판 + 검기(부채). 박치기 줄·파도 예고 원은 아래에서 따로 센다.
    const seenAreas = [...w.melee.areas, ...w.floorAreas.filter(a => a.kind === 'sword' || a.kind === 'tail' || a.kind === 'shell' || a.kind === 'swing' || a.kind === 'boom')].filter(a => a.born <= now - B.react + 1e-9);   // 부채꼴 장판(검기·꼬리)
    const slamOn = !!w.floor && w.floor.kind === 'slam' && w.floor.born <= now - B.react + 1e-9;
    const slamKey = slamOn ? `slam:${Math.round(w.floor.born * 120)}` : null;
    const slamParry = slamOn && w.floor.color !== 'red' && plan(slamKey, true).parry;
    const waves = waveHits(w, p.x, p.z, B.react);
    const seenBeams = w.beams.filter(m => m.born <= now - B.react + 1e-9);
    const seenLanes = w.lanes.filter(l => l.born <= now - B.react + 1e-9);
    // 스테이지의 일반 방: 돌격 줄(받을 생각이면 줄 위에서 기다려 몸을 받아친다), 갈 곳(보상·문)
    const away = !!w.boss.away, charges = [];
    if (away) for (const a of w.floorAreas) {
      if (a.kind !== 'charge' || a.born > now - B.react + 1e-9) continue;
      const m = w.enemies.find(e => e.id === a.owner);
      if (m && !m.dead) charges.push({ a, m, key: `charge:${a.owner}:${Math.round(a.born * 120)}` });
    }
    let goal = null;
    if (away && w.stage) {
      const S = w.stage;
      if (S.phase === 'reward' && S.rewards.length) {
        if (!roomPick || roomPick.room !== S.room) roomPick = { room: S.room, kind: p.hp <= R.player.hp * B0.room.healBelow ? 'heal' : S.rewards[0].kind };
        goal = S.rewards.find(r => r.kind === roomPick.kind) ?? S.rewards[0];
      } else if (S.phase === 'door' && S.door) goal = { x: S.door.x, z: S.door.z };
    }

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
      for (const c of charges) {   // 돌격병 몸: 닿기 lead초 전
        const pl = plan(c.key, true);
        if (parry || !pl.parry) continue;
        const sp = chargeSpan(w, c.a, c.m, p.x, p.z);
        if (sp && sp[0] >= lo + pl.jitter && sp[0] <= hi + pl.jitter) parry = true;
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
      for (const c of charges) { if (hold || !plan(c.key, true).parry) continue; const sp = chargeSpan(w, c.a, c.m, p.x, p.z); if (sp && sp[0] < B.look) hold = true; }
    }

    // 움직임: 정한 간격마다 17가지 중 위험이 가장 작은 것
    if (moves && now >= nextThink - 1e-9) {
      nextThink = now + B.think;
      let best = Infinity, bestDir = DIRS[0], bestEarly = 0, stayDanger = Infinity;
      const look = B.look, n = B.samples, speed = R.player.speed;
      // 흰 탄 찾아가기(실험): 받을 흰·금 탄 가운데 곧(ahead초 안) 곁을 지나갈 것 — 그 길로 들어서는 쪽에 점수를 준다
      const HB = B0.hunt, wants = [];
      if (parries && f && w.tries && w.tries.on.hunt) for (let k = 0; k < f.n; k++) {
        const kd = f.kind[k];
        if ((kd === K.WHITE || kd === K.GOLD) && plan(`${f.id[k]}:${f.born[k]}`, true).parry) wants.push(k);
      }
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
          // 돌격병의 줄(받지 않을 때): 그때 몸이 그 자리를 지나가면
          for (const c of charges) {
            if (plan(c.key, true).parry) continue;
            const sp = chargeSpan(w, c.a, c.m, qx, qz), hw = look / n / 2;
            if (sp && t >= sp[0] - hw && t <= sp[1] + hw) { danger += 30; if (sp[0] < 0.17) early++; }
          }
          // 불 장판(실험): 타는 자리는 밟지 않는다
          if (w.tries && w.tries.fires.length && j <= 3) for (const fr of w.tries.fires) if (Math.hypot(qx - fr.x, qz - fr.z) <= fr.r + B.margin) danger += 12;
          // 밀물(실험): 예고된 반쪽에 남아 있을수록 위험 — 일찍 건너간다
          if (w.tries && w.tries.tide && w.tries.tide.area && !w.tries.tide.area.hit && j === n) { const ta = w.tries.tide.area; if (qx * ta.side > -R.player.bodyR) danger += 12 + Math.abs(qx) * 2; }
          // 레이저 빔
          for (const m of seenBeams) if (beamAt(w, m, qx, qz, t, B.margin)) { danger += 10 * (n + 1 - j); if (j <= 2) early++; }
          if (away && goal) {   // 일반 방: 갈 곳(보상·문)이 있으면 그리로 — 첫 걸음의 거리로 잰다(멀리 내다보면 지나쳐서 제자리에 선다)
            if (j === 1) danger += Math.hypot(qx - goal.x, qz - goal.z) * B0.room.pull;
          } else if (j === n && away) {   // 아니면 가장 가까운 적과 거리를 지킨다
            const tgt = w.enemies.find(e => e.kind === 'totem' && !e.dead && now >= e.bornAt) ?? w.aim;   // 보호탑이 있으면 탑 곁으로(가장 가까운 적을 겨누니 다가가야 탑을 쏜다)
            if (tgt) { const d = Math.hypot(qx - tgt.x, qz - tgt.z), [k0, k1] = tgt.kind === 'totem' ? B0.room.totem : B0.room.keep; danger += (Math.max(0, k0 - d) + Math.max(0, d - k1)) * 0.6; }
            const edge = Math.min(R.board.hx - Math.abs(qx), R.board.hz - Math.abs(qz));
            if (edge < 1.5) danger += (1.5 - edge) * 1.0;
          } else if (j === n) {
            const db = Math.hypot(qx - w.boss.x, qz - w.boss.z);
            // 패링하는 봇은 돌진·근접 동안 달아나지 않고 붙어서 받는다(사람도 그렇다 — 달아나면 패링 기회가 사라진다)
            const duel = parries && (w.boss.state === 'rush' || w.boss.state === 'melee' || w.boss.state === 'meleeWait' || !!w.melee.combo);
            const [k0, k1] = parries && bossGroggy(w) ? B.execBand : duel ? B.duel : w.boss.kind === 'dragon' ? Bz.keep : B.keep;   // 용: 입이 앞으로 나와 있어 몸통에서 더 멀리   // 그로기면 다가가 처형
            if (zoneGoal && !duel && !bossGroggy(w)) {   // 용 판 목표 자리(용이 돌면 따라 돈다)
              const a = w.boss.face + zoneGoal.off, gx = w.boss.x + Math.cos(a) * zoneGoal.R, gz = w.boss.z + Math.sin(a) * zoneGoal.R;
              danger += Math.hypot(qx - gx, qz - gz) * Bz.pull;
            } else danger += (Math.max(0, k0 - db) + Math.max(0, db - k1)) * 0.6;
            const edge = Math.min(R.board.hx - Math.abs(qx), R.board.hz - Math.abs(qz));
            if (edge < 1.5) danger += (1.5 - edge) * 1.0;
          }
        }
        if (dx === 0 && dz === 0) stayDanger = danger;
        if (wants.length && meets(f, wants, lag, p.x, p.z, dx * speed, dz * speed, look, HB)) danger -= HB.pull;
        if (danger < best - 1e-9) { best = danger; bestDir = [dx, dz]; bestEarly = early; }
      }
      if (hold && stayDanger < 10) { bestDir = DIRS[0]; bestEarly = 0; }
      mx = bestDir[0]; mz = bestDir[1];
      if (dodges && bestEarly > 0 && p.dodge.charges > 0 && !isDodging(w)) dodge = true;
      pinch = stayDanger >= 10 && best < stayDanger; calm = stayDanger < 5;   // pinch = 서 있으면 맞는데 비킬 길이 있다
    }
    if (!moves) { mx = 0; mz = 0; }
    // 걸어서 못 피하는 빨간 파도(또는 받지 않을 흰 파도): 닿기 dodgeLead초 전 구르기
    if (dodges && !dodge && !parry && p.dodge.charges > 0 && !isDodging(w)) {
      for (const h of waves) if ((h.color === 'red' || !plan(h.key, true).parry) && h.t <= B.dodgeLead) dodge = true;
    }
    // 무기 스킬(§4.10): 패링하는 봇은 게이지가 차면 낀 무기 스킬을 돌아가며 쓴다(시범용)
    let skill = null;
    const Wp = w.weapons, SK = R.weapons.skill;
    if (parries && Wp && Wp.gauge >= SK.cost) {
      const owned = ['missile', 'beam', 'drone'].filter(g => Wp.on.includes(g));
      if (owned.length) { skill = owned[skillTurn % owned.length]; skillTurn++; }
    }
    // 실험 기믹(?try=): 갈고리 = 서 있으면 맞거나 갈 곳(보상·문)이 멀 때 가는 쪽 말뚝으로, 돌진 베기 = 안전하고 충전이 가득일 때 가까운 적을 지나간다
    let act = false;
    const X = w.tries;
    if (X && moves) {
      // 무적 없는 줄(rope)을 피하는 데 쓰면 탄 속으로 끌려가 더 맞는다(봇 판 4/10) — 멀리 갈 때만. 날아가는 줄(sky)은 피할 때도 쓴다
      if ((X.on.rope || X.on.sky) && !X.rope.to && now >= X.rope.readyAt && ((X.on.sky && pinch) || (goal && Math.hypot(goal.x - p.x, goal.z - p.z) > B0.room.ropeFar)) && (mx !== 0 || mz !== 0)) act = true;
      const a = w.aim;
      const da = a && !a.dead ? Math.hypot(a.x - p.x, a.z - p.z) : Infinity;
      if (X.on.swap && w.boss.away && pinch && da < Infinity && now >= X.swapAt) act = true;   // 자리 바꾸기: 서 있으면 맞을 때 겨눈 몬스터와
      if (X.on.mine && !toss && p.store.length >= 1 && X.mines.length < R.tries.mine.max && da < B0.room.mineFrom) act = true;   // 지뢰: 적이 다가왔을 때 발밑에
      if (X.on.dash && dodges && !dodge && !parry && calm && a && !a.dead && p.dodge.charges >= R.dodge.charges && !isDodging(w) && Math.hypot(a.x - p.x, a.z - p.z) < B0.room.dashFrom) {
        const d = Math.hypot(a.x - p.x, a.z - p.z) || 1;
        mx = (a.x - p.x) / d; mz = (a.z - p.z) / d; dodge = true;
      }
    }
    // 저격(실험): 가득 모았고 체력이 넉넉하면 던지는 대신 쏜다 — 잠깐 눌렀다 뗀다(선은 처음부터 겨눈 적을 향한다). 모자라면 던져서 회복
    let aimHold = false;
    if (X && X.on.snipe) {
      if (snipeLeft > 0) { snipeLeft--; aimHold = snipeLeft > 0; toss = false; }   // 마지막 틱은 뗀다(그 틱에 나간다)
      else if (toss && w.aim && p.store.length >= R.store.cap && p.hp >= R.player.hp * B0.snipe.hpAbove) { snipeLeft = B0.snipe.ticks; aimHold = true; toss = false; }
      if (aimHold) { mx = 0; mz = 0; }   // 조준점은 겨눈 적에 붙어 있다 — 고르지 않고 쏜다
    }
    return { mx, mz, parry, dodge, skill, throw: toss, act, hold: aimHold };
  };
}
