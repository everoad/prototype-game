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
import { tryKey } from './tries.js';
import { CARDS, kitFull } from './cards.js';
import { isSword, slashLanding, bladeMoving, chainLive } from './sword.js';

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

// picks = 방마다 고를 것의 차례(갈래 이름이나 카드 id) — 한 판의 뼈대 §9의 기준 판 = 무기 → 탄 기술 → 이동기 → 몸.
// 그 방의 카드 가운데 차례에 맞는 첫 것을 줍는다(맞는 것이 없으면 다음 차례, 다 없으면 가운데 자리의 보급). 체력이 cards.supplyBelow 아래면 보급.
// 갈래로 고를 때 칸이 찬 갈래는 건너뛴다. 카드 id를 적었을 때만 바꿔 끼운다(첫 칸을 버린다).
// greedy = 체력이 낮아도 보급을 고르지 않는다(조합을 재는 도구용).
export function createBot(kind, seed, { picks = ['weapon', 'orb', 'move', 'body'], greedy = false } = {}) {
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
  let roomPick = null;   // 스테이지: 이 방에서 고를 것({ room, at: 자리 번호, entry: 쓴 차례, swap: 바꿔 끼울 것인가 })
  const left = [...picks];   // 아직 쓰지 않은 차례
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

  // 검사의 둘레(sword.js): 그 안에서는 적 탄이 느려진다 — 앞날을 내다볼 때도 그만큼 느리게 센다.
  // 탄 (x,z)가 T초 뒤 있을 자리. 둘레의 가운데는 처음 hold초는 (cx,cz)에 있고 그 뒤 (cvx,cvz)로 움직인다(내가 걸어갈 쪽).
  function drift(F, cx, cz, cvx, cvz, hold, x, z, vx, vz, T) {
    const n = Math.max(1, Math.ceil(T / 0.04)), h = T / n, R2 = F.R * F.R;
    for (let i = 0; i < n; i++) {
      const s = Math.max(0, i * h - hold), ox = cx + cvx * s, oz = cz + cvz * s;
      const k = (x - ox) * (x - ox) + (z - oz) * (z - oz) <= R2 ? F.slow : 1;
      x += vx * h * k; z += vz * h * k;
    }
    return [x, z];
  }
  // 둘레를 넣은 접촉까지 남은 시간(가만히 있을 때): 틱마다 밀어 본다(0.8초까지)
  function contactSlow(F, px, pz, x, z, vx, vz, rad, dt) {
    const R2 = F.R * F.R;
    for (let t = 0; t <= 0.8; t += dt) {
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 <= rad * rad) return t;
      const k = d2 <= R2 ? F.slow : 1;
      x += vx * dt * k; z += vz * dt * k;
    }
    return Infinity;
  }

  return function bot(w) {
    const R = w.rules, B0 = R.bot, p = w.player, now = w.time;
    const B = user ? (userB ??= { ...B0, react: B0.user.react, think: B0.user.think }) : B0;   // user: 늦게 보고 드물게 고쳐 움직인다
    userChance = B0.user.chance;
    const sword = isSword(w);   // 검사(sword.js): U·I·O가 스킬이다 — 던지기 판단 대신 아래의 스킬 판단
    const F = sword ? R.sword.field : null;   // 검사의 둘레(그 안의 탄은 느리다 — 내다보는 셈에 넣는다)
    snapshot(w, R);
    // 모아 던지기(§4.11): 던질 때
    let toss = false;
    if (w.opts.store && parries && p.store.length > 0 && !sword) {
      const S = R.store, n = p.store.length;
      let heal = 0; for (const o of p.store) heal += o.perfect ? S.heal[1] : S.heal[0];
      const free = p.dyingAt == null && !(p.auto && now < p.autoUntil);   // 못 던지는 때엔 누르지 않는다(틱 소리만 난다)
      const target = !w.boss.away || !!w.aim;   // 일반 방: 겨눌 적이 없으면 아낀다(다음 방으로 들고 간다)
      toss = free && target && (n >= p.storeCap || (n >= 2 && R.player.hp - p.hp >= heal) || bossGroggy(w) || p.hp <= R.player.hp * 0.25);
    }
    if (w.execute) return { mx: 0, mz: 0, parry: false, dodge: false, throw: false };
    if (sword && parries && canExecute(w) && p.store.length > 0 && p.dyingAt == null) return { mx: 0, mz: 0, parry: false, dodge: false, throw: false, spin: true };   // 검사: 처형 전에 남은 칸을 회전 베기로 몰아 쓴다(그로기 중 피해 1.5배)
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
        if (!roomPick || roomPick.room !== S.room) {
          roomPick = { room: S.room, at: 1, entry: null, swap: false };   // 기본 = 가운데 자리의 보급
          if (greedy || p.hp >= R.player.hp * R.cards.supplyBelow) for (const e of left) {
            const k = S.rewards.findIndex(r => r.kind === 'card' && (r.what === e || (CARDS[r.what].group === e && !kitFull(w, e))));
            if (k >= 0) { roomPick = { room: S.room, at: k, entry: e, swap: !!CARDS[e] }; break; }
          }
        }
        const r0 = S.rewards[roomPick.at] ?? S.rewards[1];
        goal = r0.armed ? r0 : { x: r0.x - B0.room.stepOff, z: r0.z };   // 뜰 때 밟고 있던 자리는 한 번 벗어나야 눌린다
      } else if (S.phase === 'replace' && S.rewards.length) {   // 칸이 찼다: 적어 둔 카드면 첫 칸을 버리고, 아니면 무른다 — 밟은 자리에서 한 번 벗어나야 눌린다
        const c = S.rewards.find(r => r.kind === 'cancel'), h = S.rewards.find(r => r.kind === 'held');
        const t = roomPick && roomPick.swap && h ? h : c;
        if (t === c && roomPick) { roomPick.at = 1; roomPick.entry = null; }   // 무른 뒤에는 보급
        goal = t.armed ? t : { x: c.x - B0.room.stepOff, z: c.z };
      } else if (S.phase === 'door' && S.door) {
        if (roomPick && roomPick.entry != null) { const k = left.indexOf(roomPick.entry); if (k >= 0) left.splice(k, 1); roomPick.entry = null; }   // 쓴 차례는 지운다
        goal = { x: S.door.x, z: S.door.z };
      }
    }

    // 패링: 받을 생각인 흰·금 탄이 lead초 뒤 패링 원에 닿으면 누른다
    if (parries && f && !parryActive(w) && !isDodging(w) && now >= p.parry.failUntil) {
      const [lo, hi] = B.parryLead;
      for (let k = 0; k < f.n && !parry; k++) {
        const kd = f.kind[k];
        if (kd !== K.WHITE && kd !== K.GOLD) continue;
        const pl = plan(`${f.id[k]}:${f.born[k]}`, true);
        if (!pl.parry) continue;
        let x = f.x[k] + f.vx[k] * lag, z = f.z[k] + f.vz[k] * lag;
        if (F) [x, z] = drift(F, p.x, p.z, 0, 0, 0, f.x[k], f.z[k], f.vx[k], f.vz[k], lag);
        const tc = F ? contactSlow(F, p.x, p.z, x, z, f.vx[k], f.vz[k], R.player.parryR + f.r[k], R.dt) : contact(p.x, p.z, x, z, f.vx[k], f.vz[k], R.player.parryR + f.r[k]);
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
        let x = f.x[k] + f.vx[k] * lag, z = f.z[k] + f.vz[k] * lag;
        if (F) [x, z] = drift(F, p.x, p.z, 0, 0, 0, f.x[k], f.z[k], f.vx[k], f.vz[k], lag);
        if ((F ? contactSlow(F, p.x, p.z, x, z, f.vx[k], f.vz[k], R.player.parryR + f.r[k], R.dt) : contact(p.x, p.z, x, z, f.vx[k], f.vz[k], R.player.parryR + f.r[k])) < B.look) hold = true;
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
      for (const [dx, dz] of DIRS) {
        let danger = 0, early = 0;
        for (let j = 1; j <= n; j++) {
          const t = look * j / n;
          const [qx, qz] = clampToBoard(R, p.x + dx * speed * t, p.z + dz * speed * t, R.player.bodyR);
          if (f) for (let k = 0; k < f.n; k++) {
            const kd = f.kind[k];
            if ((kd === K.WHITE || kd === K.GOLD) && plan(`${f.id[k]}:${f.born[k]}`, true).parry) continue;
            let x = f.x[k] + f.vx[k] * (lag + t), z = f.z[k] + f.vz[k] * (lag + t);
            if (F) { if (Math.abs(f.x[k] - p.x) > 14 || Math.abs(f.z[k] - p.z) > 14) continue; [x, z] = drift(F, p.x, p.z, dx * speed, dz * speed, lag, f.x[k], f.z[k], f.vx[k], f.vz[k], lag + t); }
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
          // 밀물(실험): 예고된 반쪽에 남아 있을수록 위험 — 일찍 건너간다
          if (w.tries && w.tries.tide && w.tries.tide.area && !w.tries.tide.area.hit && j === n) { const ta = w.tries.tide.area; if (qx * ta.side > -R.player.bodyR) danger += 12 + Math.abs(qx) * 2; }
          // 레이저 빔
          for (const m of seenBeams) if (beamAt(w, m, qx, qz, t, B.margin)) { danger += 10 * (n + 1 - j); if (j <= 2) early++; }
          if (away && goal) {   // 일반 방: 갈 곳(보상·문)이 있으면 그리로 — 첫 걸음의 거리로 잰다(멀리 내다보면 지나쳐서 제자리에 선다)
            if (j === 1) danger += Math.hypot(qx - goal.x, qz - goal.z) * B0.room.pull;
          } else if (j === n && away) {   // 아니면 가장 가까운 적과 거리를 지킨다
            const tgt = w.enemies.find(e => e.kind === 'totem' && !e.dead && now >= e.bornAt) ?? w.aim;   // 보호탑이 있으면 탑 곁으로(가장 가까운 적을 겨누니 다가가야 탑을 쏜다)
            // 검사는 받아칠 틈이 나는 거리(sword.room)에서 모으고 일섬으로 들어간다 — 가까이 서면 흰 탄을 볼 새가 없다
            // 지킬 거리: 산탄 하나만 들면 붙어 싸운다(붙을수록 세다 — keepBurst). 다른 무기와 같이 들면 여느 거리(붙으면 봇이 너무 맞는다)
            if (tgt) { const d = Math.hypot(qx - tgt.x, qz - tgt.z), [k0, k1] = tgt.kind === 'totem' ? B0.room.totem : w.tries && w.tries.on.always && w.weapons.on.length === 1 && w.weapons.on[0] === 'burst' ? B0.room.keepBurst : sword ? B0.sword.room : B0.room.keep; danger += (Math.max(0, k0 - d) + Math.max(0, d - k1)) * 0.6; }
            const edge = Math.min(R.board.hx - Math.abs(qx), R.board.hz - Math.abs(qz));
            if (edge < 1.5) danger += (1.5 - edge) * 1.0;
          } else if (j === n) {
            const db = Math.hypot(qx - w.boss.x, qz - w.boss.z);
            // 패링하는 봇은 돌진·근접 동안 달아나지 않고 붙어서 받는다(사람도 그렇다 — 달아나면 패링 기회가 사라진다)
            const duel = parries && (w.boss.state === 'rush' || w.boss.state === 'melee' || w.boss.state === 'meleeWait' || !!w.melee.combo);
            const [k0, k1] = parries && bossGroggy(w) ? B.execBand : duel ? B.duel : sword ? (p.store.length > 0 && Math.hypot(p.x - w.boss.x, p.z - w.boss.z) <= R.boss.r + R.sword.spin.R ? B0.sword.stay : B0.sword.keep) : w.boss.kind === 'dragon' ? Bz.keep : B.keep;   // 검사: 붙어서 칸이 남아 있으면 그대로 붙어 있는다(그 밖에는 사수와 같은 거리 — 더 가까이 서면 탄을 못 피한다)   // 용: 입이 앞으로 나와 있어 몸통에서 더 멀리   // 그로기면 다가가 처형
            if (zoneGoal && !duel && !bossGroggy(w)) {   // 용 판 목표 자리(용이 돌면 따라 돈다)
              const a = w.boss.face + zoneGoal.off, gx = w.boss.x + Math.cos(a) * zoneGoal.R, gz = w.boss.z + Math.sin(a) * zoneGoal.R;
              danger += Math.hypot(qx - gx, qz - gz) * Bz.pull;
            } else danger += (Math.max(0, k0 - db) + Math.max(0, db - k1)) * 0.6;
            const edge = Math.min(R.board.hx - Math.abs(qx), R.board.hz - Math.abs(qz));
            if (edge < 1.5) danger += (1.5 - edge) * 1.0;
          }
        }
        if (dx === 0 && dz === 0) stayDanger = danger;
        // 받을 흰 포탄 원(포격병): 떨어질 때 그 안에 서 있게 되는 쪽에 점수 — 빨간 원을 피한 뒤 걸어 들어가 받아친다
        if (parries) for (const a of seenAreas) {
          if (a.hit || a.kind !== 'shell' || a.color === 'red' || !plan(`area:${a.born}`, true).parry) continue;
          const tH = a.born + a.warn - now;
          if (tH < 0 || tH > look + B0.shell.ahead) continue;
          const tt = Math.min(look, tH), [ex, ez] = clampToBoard(R, p.x + dx * speed * tt, p.z + dz * speed * tt, R.player.bodyR);
          if (Math.hypot(ex - a.x, ez - a.z) <= a.R * B0.shell.inside) { danger -= B0.shell.pull; break; }
        }
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
    // 고르는 자리: 가까이 오면 그 위에 선다(pickHold초 서 있어야 주워진다 — 드물게 고쳐 움직이는 봇은 자리를 지나쳐 왔다 갔다 했다)
    if (away && goal && w.stage && (w.stage.phase === 'reward' || w.stage.phase === 'replace') && Math.hypot(goal.x - p.x, goal.z - p.z) <= R.stage.pickR * B0.room.stand) { mx = 0; mz = 0; }
    // 실험 기믹(?try=): 갈고리 = 서 있으면 맞거나 갈 곳(보상·문)이 멀 때 가는 쪽 말뚝으로, 돌진 베기 = 안전하고 충전이 가득일 때 가까운 적을 지나간다
    const keys = { orb: false, move1: false, move2: false };   // 탄 기술(O) · 이동기 1·2(K·L) — 그 실험이 쓰는 칸(tryKey)
    const X = w.tries;
    if (X && moves) {
      // 무적 없는 줄(rope)을 피하는 데 쓰면 탄 속으로 끌려가 더 맞는다(봇 판 4/10) — 멀리 갈 때만. 날아가는 줄(sky)은 피할 때도 쓴다
      if (X.on.sky && !X.rope.to && now >= X.rope.readyAt && (pinch || (goal && Math.hypot(goal.x - p.x, goal.z - p.z) > B0.room.ropeFar)) && (mx !== 0 || mz !== 0)) keys[tryKey(w, 'sky')] = true;
      const a = w.aim;
      const da = a && !a.dead ? Math.hypot(a.x - p.x, a.z - p.z) : Infinity;
      if (X.on.swap && w.boss.away && pinch && da < Infinity && now >= X.swapAt) keys[tryKey(w, 'swap')] = true;   // 자리 바꾸기: 서 있으면 맞을 때 겨눈 몬스터와
      if (X.on.mine && !toss && p.store.length >= 1 && X.mines.length < R.tries.mine.max && da < B0.room.mineFrom) keys[tryKey(w, 'mine')] = true;   // 지뢰: 적이 다가왔을 때 발밑에
      if (X.on.dash && dodges && !dodge && !parry && calm && a && !a.dead && p.dodge.charges >= p.dodge.max && !isDodging(w) && Math.hypot(a.x - p.x, a.z - p.z) < B0.room.dashFrom) {
        const d = Math.hypot(a.x - p.x, a.z - p.z) || 1;
        mx = (a.x - p.x) / d; mz = (a.z - p.z) / d; dodge = true;
      }
    }
    // 저격(실험): 가득 모았고 체력이 넉넉하면 던지는 대신 쏜다 — 잠깐 눌렀다 뗀다(선은 처음부터 겨눈 적을 향한다). 모자라면 던져서 회복
    let aimHold = false;
    if (X && X.on.snipe) {
      if (snipeLeft > 0) { snipeLeft--; aimHold = snipeLeft > 0; toss = false; }   // 마지막 틱은 뗀다(그 틱에 나간다)
      else if (toss && w.aim && p.store.length >= p.storeCap && p.hp >= R.player.hp * B0.snipe.hpAbove) { snipeLeft = B0.snipe.ticks; aimHold = true; toss = false; }
      if (aimHold) { mx = 0; mz = 0; }   // 조준점은 겨눈 적에 붙어 있다 — 고르지 않고 쏜다
    }
    // 검사의 스킬(확인·영상용 — 사람의 판단을 흉내 내지 못한다): 빨간 몸 공격이 임박하면 마무리로 빠지고, 닿으면 회전 베기로 몰아치다 마지막 칸은 마무리로 빠지고,
    // 칸이 enter만큼 모였고(방에서는 하나라도) 보스가 쏘는 중이 아니면 일섬으로 들어간다. 체력이 낮으면 칸이 덜 모였어도 들어가 베어서 회복한다(닿는 적이 없는 스킬은 나가지 않는다).
    let spinKey = false;
    if (sword && parries && chainLive(w) && p.dyingAt == null && !bladeMoving(w) && slashLanding(w)) toss = true;   // 잇는 일섬(sword.js의 형태): 이어지는 동안은 칸 없이 한 번 더 — 창이 닫히기 전에 누른다
    else if (sword && parries && p.store.length > 0 && p.dyingAt == null && !bladeMoving(w)) {
      const BS = B0.sword, Sw = R.sword, b = w.boss, a = w.aim && !w.aim.dead ? w.aim : null;
      const surf = a ? Math.hypot(a.x - p.x, a.z - p.z) - (a === b ? R.boss.r : a.r) : Infinity;
      const redSoon = seenAreas.some(ar => !ar.hit && ar.color === 'red' && ar.born + ar.warn - now <= BS.exitSec
        && (ar.shape === 'circle' ? inCircle(p.x, p.z, R.player.bodyR, ar.x, ar.z, ar.R) : inSector(p.x, p.z, R.player.bodyR, ar.x, ar.z, ar.R, ar.face, ar.half))) || waves.some(h => h.color === 'red' && h.t <= BS.exitSec);
      const shooting = !away && !bossGroggy(w) && now >= (b.stunUntil ?? -1) && (b.state === 'windup' || b.state === 'pattern' || b.state === 'patternWait' || (!!b.runs && b.runs.length > 0));
      const close = surf <= Sw.spin.R - BS.margin;
      if (redSoon && surf <= Sw.finish.R) { keys.orb = true; dodge = false; }
      else if (close && p.store.length === 1 && !bossGroggy(w) && !away) keys.orb = true;   // 붙어서 마지막 칸: 마무리로 치고 빠진다(칸 없이 곁에 남지 않는다)
      else if (close) spinKey = true;
      else if (slashLanding(w) && !shooting && (p.hp <= R.player.hp * BS.lowHp || (away ? p.store.length >= BS.enterRoom && calm : p.store.length >= BS.enter || bossGroggy(w)))) toss = true;
    }
    return { mx, mz, parry, dodge, skill, throw: toss, spin: spinKey, hold: aimHold, ...keys };
  };
}
