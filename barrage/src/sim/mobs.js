// 일반 몬스터(스테이지 설계 §4): 하나에 규칙 하나. 모두 준비(몸 번쩍임 = 위협 색) 뒤 공격하고, 받아쳐도 판이 멈추지 않는다.
//  사수: 거리를 지키며 세 발(가운데 흰 = 받아칠 것, 양옆 보라).
//  돌격병: 줄을 깔고 그 줄로 들이받는다 — 몸을 패링하면 한 칸 모이고 돌격병이 크게 다치며 튕겨 난다.
//  포격병: 플레이어 자리에 빨간 원(걸어서 비킨다). 쏜 포탄은 포격병이 죽어도 떨어진다.
//  공격 다양화(?try=vary — 실험): 사수 세 발 → 넓은 부채 → 연사, 돌격병 연속 돌진, 포격병 줄 포격(RULES.tries.vary).
//  방패병: 앞의 방패(foes.shielded)로 평타·무기를 막으며 다가와 흰 휘두르기. 천천히 돈다.
// 장판은 w.floorAreas에 넣어 화면·봇이 꼴(줄·원·부채꼴)로 읽는다. 몸 타격 판정은 melee.resolveHit(패링·구르기·맞음).
import { K } from './rules.js';
import { emit } from './events.js';
import { spawnBullet } from './bullets.js';
import { clampToBoard, inCircle, inSector, slideOut } from './geom.js';
import { resolveHit } from './melee.js';
import { hurtFoe } from './foes.js';

const D = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toP = (w, m) => Math.atan2(w.player.z - m.z, w.player.x - m.x);
const distP = (w, m) => Math.hypot(w.player.x - m.x, w.player.z - m.z);
const set = (w, m, s) => { m.state = s; m.stateAt = w.time; };
const varied = w => (w.tries && w.tries.on.vary ? w.rules.tries.vary : null);   // 공격 다양화(실험): 몬스터가 공격을 돌아가며 쓴다. 차례 = (atkN + id) % 가짓수(몬스터마다 어긋난다)
const dropArea = (w, a) => { const k = w.floorAreas.indexOf(a); if (k >= 0) w.floorAreas.splice(k, 1); };

// (dx, dz) 쪽으로 speed만큼 걷는다. 판 안, 플레이어 몸 밖.
function walk(w, m, dx, dz, speed) {
  const d = Math.hypot(dx, dz);
  if (d < 1e-9) return;
  const R = w.rules, s = speed * R.dt;
  [m.x, m.z] = clampToBoard(R, m.x + dx / d * s, m.z + dz / d * s, m.r);
  [m.x, m.z] = slideOut(m.x, m.z, m.r, w.player.x, w.player.z, R.player.bodyR);
}

function shooter(w, m) {
  const S = w.rules.mobs.shooter, a = toP(w, m), d = distP(w, m);
  m.face = a;
  const V = varied(w), Vs = V && V.shooter;
  const one = (ang, kind) => {
    const x = m.x + Math.cos(ang) * m.r, z = m.z + Math.sin(ang) * m.r;
    const id = spawnBullet(w, kind, x, z, ang, S.bulletSpeed, w.rules.src.shooter);
    if (id >= 0) emit(w, 'fire', { kind, x, z, id, src: w.rules.src.shooter });
  };
  const done = () => {
    emit(w, 'mobFire', { id: m.id, kind: m.kind, x: m.x, z: m.z });
    m.nextAt = w.time + S.every * (S.jitter[0] + (S.jitter[1] - S.jitter[0]) * w.rng.next());
    set(w, m, 'idle');
  };
  if (m.state === 'windup') {
    if (w.time < m.stateAt + S.warn - 1e-9) return;
    const type = Vs ? (m.atkN + m.id) % 3 : 0;   // 0 세 발 · 1 넓은 부채 · 2 연사
    m.atkN++;
    if (type === 2) { m.burst = { left: Vs.streamN, at: w.time, ang: a }; set(w, m, 'burst'); }
    else {
      const hunt = !!w.tries && !!w.tries.on.hunt;   // 흰 탄 찾아가기(실험): 가운데는 보라, 그 양옆이 흰
      const n = type === 1 ? Vs.wideN : 3, half = (n - 1) / 2, stepA = (type === 1 ? Vs.wideDeg : S.spreadDeg) / (n - 1) * D;
      for (let k = 0; k < n; k++) one(a + (k - half) * stepA, (hunt ? Math.abs(k - half) === 1 : k === half) ? K.WHITE : K.NORMAL);
      done();
      return;
    }
  }
  if (m.state === 'burst') {   // 연사: 겨눈 줄 그대로 streamGap초마다 한 발 — 첫 발이 흰 탄(받고 바로 비킨다). 쏘는 동안은 선다
    const B = m.burst;
    if (w.time >= B.at - 1e-9) { one(B.ang, B.left === Vs.streamN ? K.WHITE : K.NORMAL); B.left--; B.at += Vs.streamGap; }
    if (B.left <= 0) done();
    return;
  }
  // 거리 지키기: 가까우면 물러나고 멀면 다가온다. 그 사이면 옆으로 천천히
  const side = m.id % 2 ? 1 : -1;
  if (d < S.keep[0]) walk(w, m, -Math.cos(a), -Math.sin(a), S.speed);
  else if (d > S.keep[1]) walk(w, m, Math.cos(a), Math.sin(a), S.speed);
  else walk(w, m, -Math.sin(a) * side, Math.cos(a) * side, S.speed * S.strafe);
  if (w.time >= m.nextAt) { set(w, m, 'windup'); emit(w, 'mobWindup', { id: m.id, kind: m.kind, color: 'white' }); }
}

// 돌격병이 지금 플레이어 쪽으로 줄을 깔고 준비에 들어간다(warn초 뒤 돌진)
function lineUp(w, m, warn) {
  const C = w.rules.mobs.charger, a = toP(w, m);
  m.warn = warn; m.face = a;
  m.area = { kind: 'charge', shape: 'lane', x: m.x, z: m.z, face: a, len: C.len, width: C.width, color: 'white', warn, born: w.time, hit: false, owner: m.id };
  w.floorAreas.push(m.area);
  set(w, m, 'windup');
  emit(w, 'mobWindup', { id: m.id, kind: m.kind, color: 'white' });
}

function charger(w, m) {
  const R = w.rules, C = R.mobs.charger, p = w.player, a = toP(w, m), d = distP(w, m);
  if (m.state === 'idle') {
    m.face = a;
    if (d > C.band[1]) walk(w, m, Math.cos(a), Math.sin(a), C.speed);
    else if (d < C.band[0]) walk(w, m, -Math.cos(a), -Math.sin(a), C.speed * C.backoff);
    if (w.time >= m.nextAt && d <= C.band[1] + C.slack) {
      const V = varied(w);
      m.double = !!V && (m.atkN + m.id) % 2 === 1;   // 공격 다양화: 두 번에 한 번 연속 돌진
      m.atkN++;
      lineUp(w, m, C.warn);
    }
    return;
  }
  if (m.state === 'windup') {
    const ar = m.area;
    if (w.time < m.stateAt + m.warn - C.lockBefore) { m.face = a; ar.face = a; }   // 고정 전까지 플레이어를 따라온다
    ar.x = m.x; ar.z = m.z;
    if (w.time < m.stateAt + m.warn - 1e-9) return;
    ar.hit = true; m.left = C.len; m.hitDone = false;
    set(w, m, 'dash');
    emit(w, 'mobDash', { id: m.id, x: m.x, z: m.z, angle: m.face });
    return;
  }
  if (m.state === 'dash') {
    const step = Math.min(C.dash * R.dt, m.left), x0 = m.x, z0 = m.z;
    const wx = x0 + Math.cos(m.face) * step, wz = z0 + Math.sin(m.face) * step;
    [m.x, m.z] = clampToBoard(R, wx, wz, m.r);
    m.left -= step;
    const blocked = Math.abs(m.x - wx) + Math.abs(m.z - wz) > 1e-9;   // 난간에 닿았다 — 난간을 타고 줄 밖으로 미끄러지지 않게 여기서 끝낸다
    if (!m.hitDone && Math.hypot(p.x - m.x, p.z - m.z) < m.r + R.player.bodyR) {
      m.hitDone = true;
      const res = resolveHit(w, { color: 'white', src: R.src.charger, dmg: C.dmg, stagger: C.stagger, kindName: 'charge', x: m.x, z: m.z });
      emit(w, 'mobChargeHit', { id: m.id, outcome: res.outcome, x: m.x, z: m.z });
      if (res.outcome === 'parry' || res.outcome === 'perfect') {   // 받아쳤다: 크게 다치고 튕겨 난다(판은 멈추지 않는다)
        [m.x, m.z] = clampToBoard(R, m.x - Math.cos(m.face) * C.bounce, m.z - Math.sin(m.face) * C.bounce, m.r);
        hurtFoe(w, m, m.maxHp * C.parryShare, 'reflect', { pierce: true });
        m.left = 0; m.double = false;   // 받아치면 연속 돌진도 끊긴다
      }
    }
    if (m.left <= 1e-9 || blocked) {
      dropArea(w, m.area); m.area = null;
      if (m.double && !m.dead) { m.double = false; lineUp(w, m, varied(w).charger.warn2); }   // 연속 돌진: 쉬지 않고 짧은 예고 뒤 한 번 더
      else { m.nextAt = w.time + C.rest; set(w, m, 'idle'); }
    }
  }
}

function mortar(w, m) {
  const Mo = w.rules.mobs.mortar, p = w.player;
  m.face = toP(w, m);
  if (m.state === 'idle') {
    if (w.time >= m.nextAt) {
      const V = varied(w);
      m.line = V && (m.atkN + m.id) % 2 === 1 ? { set: false, x: 0, z: 0, ux: 0, uz: 0 } : null;   // 공격 다양화: 두 번에 한 번 줄 포격
      m.atkN++; m.shots = 0;
      set(w, m, 'windup'); emit(w, 'mobWindup', { id: m.id, kind: m.kind, color: 'red' });
    }
    return;
  }
  // 준비 aim초 뒤부터 gap초 간격으로 n발: 첫 발은 플레이어 자리, 다음 발은 가는 쪽 lead초 앞
  const Ln = m.line, Vm = Ln ? w.rules.tries.vary.mortar : null, n = Ln ? Vm.lineN : Mo.n;
  const due = m.stateAt + Mo.aim + m.shots * (Ln ? Vm.lineGap : Mo.gap);
  if (w.time < due - 1e-9) return;
  let x, z;
  if (Ln) {   // 줄 포격: 첫 발 때 내 자리와 방향을 굳히고, 포격병 쪽 한 칸 앞에서 나를 지나 멀어지며 차례로
    if (!Ln.set) { const d = Math.hypot(p.x - m.x, p.z - m.z) || 1; Ln.set = true; Ln.x = p.x; Ln.z = p.z; Ln.ux = (p.x - m.x) / d; Ln.uz = (p.z - m.z) / d; }
    [x, z] = clampToBoard(w.rules, Ln.x + Ln.ux * (m.shots - 1) * Vm.lineStep, Ln.z + Ln.uz * (m.shots - 1) * Vm.lineStep, 0);
  } else {
    const vx = (p.x - p.px) / w.rules.dt, vz = (p.z - p.pz) / w.rules.dt, lead = m.shots === 0 ? 0 : Mo.lead;
    [x, z] = clampToBoard(w.rules, p.x + vx * lead, p.z + vz * lead, 0);
  }
  const area = { kind: 'shell', shape: 'circle', x, z, face: 0, R: Mo.R, half: Math.PI, color: 'red', warn: Mo.warn, born: w.time, hit: false, owner: m.id };
  w.floorAreas.push(area); w.mobAreas.push(area);
  emit(w, 'mobFire', { id: m.id, kind: m.kind, x: m.x, z: m.z, tx: x, tz: z });
  if (++m.shots >= n) { m.nextAt = w.time + Mo.every * (Mo.jitter[0] + (Mo.jitter[1] - Mo.jitter[0]) * w.rng.next()); set(w, m, 'idle'); }
}

function shield(w, m) {
  const R = w.rules, S = R.mobs.shield, p = w.player, a = toP(w, m), d = distP(w, m);
  if (m.state === 'windup') {   // 휘두르는 동안은 돌지 않는다
    const ar = m.area;
    if (w.time < m.stateAt + S.warn - 1e-9) return;
    if (!ar.hit) {
      ar.hit = true;
      emit(w, 'meleeHit', { shape: 'sector', color: 'white', x: ar.x, z: ar.z, mob: m.id });
      if (inSector(p.x, p.z, R.player.bodyR, ar.x, ar.z, ar.R, ar.face, ar.half)) resolveHit(w, { color: 'white', src: R.src.shieldMob, dmg: S.dmg, stagger: S.stagger, kindName: 'swing', x: m.x, z: m.z });
    }
    if (w.time >= m.stateAt + S.warn + R.mobs.linger - 1e-9) { dropArea(w, ar); m.area = null; m.nextAt = w.time + S.rest; set(w, m, 'idle'); }
    return;
  }
  const lim = S.turn * D * R.dt;
  m.face = wrap(m.face + Math.max(-lim, Math.min(lim, wrap(a - m.face))));
  if (d > S.reach * S.stopAt) walk(w, m, Math.cos(m.face), Math.sin(m.face), S.speed);
  if (d <= S.reach && w.time >= m.nextAt && Math.abs(wrap(a - m.face)) < S.swingHalfDeg * D) {
    m.area = { kind: 'swing', shape: 'sector', x: m.x, z: m.z, face: m.face, R: S.swingR, half: S.swingHalfDeg * D, color: 'white', warn: S.warn, born: w.time, hit: false, owner: m.id };
    w.floorAreas.push(m.area);
    set(w, m, 'windup');
    emit(w, 'mobWindup', { id: m.id, kind: m.kind, color: 'white' });
  }
}

// 자폭병(실험 스테이지): 달려와 trigger 안이면 서서 심지(빨간 원) → 터진다. 죽어도 chain초 뒤 그 자리에서 터진다(연쇄).
function boom(w, m) {
  const R = w.rules, Bm = R.mobs.bomber, p = w.player;
  m.boomed = true;
  if (m.area) { dropArea(w, m.area); m.area = null; }
  emit(w, 'meleeHit', { shape: 'circle', color: 'red', x: m.x, z: m.z, mob: m.id });
  if (inCircle(p.x, p.z, R.player.bodyR, m.x, m.z, Bm.R)) resolveHit(w, { color: 'red', src: R.src.bomber, dmg: Bm.dmg, stagger: [0, 0], kindName: 'boom', x: m.x, z: m.z });
  for (const o of w.enemies) if (o !== m && !o.dead && w.time >= o.bornAt && inCircle(o.x, o.z, o.r, m.x, m.z, Bm.R)) hurtFoe(w, o, Bm.mobDmg, 'weapon', { pierce: true });
  if (!m.dead) hurtFoe(w, m, m.hp + 1, 'weapon', { pierce: true });
}
const boomArea = (w, m, warn) => { m.area = { kind: 'boom', shape: 'circle', x: m.x, z: m.z, face: 0, R: w.rules.mobs.bomber.R, half: Math.PI, color: 'red', warn, born: w.time, hit: false, owner: m.id }; w.floorAreas.push(m.area); };
function bomber(w, m) {
  const Bm = w.rules.mobs.bomber, a = toP(w, m);
  if (m.state === 'windup') { if (w.time >= m.stateAt + Bm.fuse - 1e-9) boom(w, m); return; }
  if (m.state !== 'idle') return;
  m.face = a;
  if (distP(w, m) <= Bm.trigger) { boomArea(w, m, Bm.fuse); set(w, m, 'windup'); emit(w, 'mobWindup', { id: m.id, kind: m.kind, color: 'red' }); }
  else walk(w, m, Math.cos(a), Math.sin(a), Bm.speed);
}
function totem() {}   // 제자리 — 보호는 foes.warded가 본다

const THINK = { shooter, charger, mortar, shield, bomber, totem };

export function updateMobs(w) {
  if (!w.opts.ai || w.result) return;
  const R = w.rules, p = w.player;
  for (const m of w.enemies) {
    if (m.dead && m.kind === 'bomber' && !m.boomed) {   // 죽은 자폭병: chain초 뒤 그 자리에서 터진다
      const Bm = R.mobs.bomber;
      if (m.boomAt == null) { m.boomAt = w.time + Bm.chain; if (m.area) dropArea(w, m.area); boomArea(w, m, Bm.chain); }
      if (w.time >= m.boomAt - 1e-9) boom(w, m);
      continue;
    }
    if (m.dead) { if (m.area) { dropArea(w, m.area); m.area = null; } continue; }   // 죽으면 깔던 줄·휘두르기는 거둔다(쏜 포탄은 남는다)
    if (w.time < m.bornAt) continue;
    THINK[m.kind](w, m);
  }
  // 몬스터끼리 겹치지 않게(가볍게 밀어낸다)
  for (let i = 0; i < w.enemies.length; i++) for (let j = i + 1; j < w.enemies.length; j++) {
    const a = w.enemies[i], b = w.enemies[j];
    if (a.dead || b.dead || w.time < a.bornAt || w.time < b.bornAt || a.state === 'dash' || b.state === 'dash') continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-6, min = a.r + b.r;
    if (d >= min) continue;
    const push = (min - d) / 2;
    [a.x, a.z] = clampToBoard(R, a.x - dx / d * push, a.z - dz / d * push, a.r);
    [b.x, b.z] = clampToBoard(R, b.x + dx / d * push, b.z + dz / d * push, b.r);
  }
  // 떨어지는 포탄(빨간 원): 예고가 끝나는 순간 원 안이면 판정
  for (let k = w.mobAreas.length - 1; k >= 0; k--) {
    const ar = w.mobAreas[k], Mo = R.mobs.mortar;
    if (!ar.hit && w.time >= ar.born + ar.warn - 1e-9) {
      ar.hit = true;
      emit(w, 'meleeHit', { shape: 'circle', color: 'red', x: ar.x, z: ar.z, mob: ar.owner });
      if (inCircle(p.x, p.z, R.player.bodyR, ar.x, ar.z, ar.R)) resolveHit(w, { color: 'red', src: R.src.mortar, dmg: Mo.dmg, stagger: [0, 0], kindName: 'shell', x: ar.x, z: ar.z });
    }
    if (ar.hit && w.time >= ar.born + ar.warn + R.mobs.linger) { dropArea(w, ar); w.mobAreas.splice(k, 1); }
  }
}
