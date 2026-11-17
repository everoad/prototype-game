// 보조 무기(§4.10): 낀 무기는 모두 자동. 공격 무기만 — 미사일·산탄(패링 연계)·빔·드론. 숫자 1~4(input.toggle)로 켜고 끈다(시험용).
// 탄을 지우는 방어 무기(칼날·파동)는 너무 세서 뺐다(사용자) — 탄은 패링·회피로 대한다. 처형 중·판이 끝나면 쉰다.
// 패링과 엮기: 공격 무기(미사일·빔·드론)는 패링 뒤 charge.sec초만 가동(받아칠수록 무기가 깨어난다), 산탄은 패링 그 자체.
// 패링이 스킬 게이지를 채우고(+1, 완벽 +2), U·I·O로 그 무기의 스킬(미사일 일제 사격·굵은 빔·드론 연사)을 쓴다(게이지 cost칸).
// 투사체는 수가 적어(초당 몇 발) 객체 배열로 둔다: w.weapons.missiles / pellets.
import { emit } from './events.js';
import { hitFoe, hurtFoe, foeR } from './foes.js';
import { segCircle } from './geom.js';

export const GEAR = ['missile', 'burst', 'beam', 'drone'];

export function parseGear(gear) {
  if (gear === 'all') return [...GEAR];
  if (Array.isArray(gear)) return GEAR.filter(g => gear.includes(g));
  if (typeof gear === 'string' && gear && gear !== 'none') { const list = gear.split(',').map(s => s.trim()); return GEAR.filter(g => list.includes(g)); }
  return [];
}

export function createWeapons(rules, gear) {
  const on = parseGear(gear), next = {};
  for (const g of GEAR) next[g] = rules.weapons[g].first ?? rules.weapons[g].every ?? 0;
  return { on, next, missiles: [], pellets: [], droneA: 0, beamUntil: -1, parries: 0, perfects: 0, chargeUntil: -1, gauge: 0, skillBeamUntil: -1, frenzyUntil: -1, throwFans: 0, salvoBeam: null, salvoDroneUntil: -1, salvoDroneAt: 0 };
}

const has = (W, g) => W.on.includes(g);
const always = w => (w.tries && w.tries.on.always ? w.rules.tries.always : null);

// 무기를 둘 넘게 들면 각 무기의 피해 몫(two / 낀 수). always가 꺼진 판은 늘 1
export const gearShare = w => { const n = w.weapons.on.length; return always(w) && n > 1 ? w.rules.weapons.two / n : 1; };

// 산탄의 거리 배율: 날아간 거리 near까지 mul[0], far부터 mul[1], 그 사이는 곧게 잇는다
export function fallMul(F, dist) {
  if (dist <= F.near) return F.mul[0];
  if (dist >= F.far) return F.mul[1];
  return F.mul[0] + (F.mul[1] - F.mul[0]) * (dist - F.near) / (F.far - F.near);
}

// 드론이 쏠 적: 내가 겨눈 적이 아닌 적 가운데 플레이어에게 가장 가까운 적(적이 하나면 그 적)
function flank(w) {
  const p = w.player;
  let best = null, bd = Infinity;
  for (const f of w.foeList) {
    if (f.dead || f === w.aim) continue;
    const d = (f.x - p.x) * (f.x - p.x) + (f.z - p.z) * (f.z - p.z);
    if (d < bd) { bd = d; best = f; }
  }
  return best ?? w.aim;
}

// 기둥(실험 틀 — 방의 특징): 늘 나가는 사격은 평타처럼 막힌다(한 판의 뼈대 §7). 한 방은 던진 탄처럼 지난다.
const pillarsOf = w => (w.tries ? w.tries.pillars : []);
const pillarHit = (w, x0, z0, x1, z1) => pillarsOf(w).some(c => segCircle(x0, z0, x1, z1, c.x, c.z, c.r));
// (x, z)에서 angle 쪽으로 뻗은 줄이 첫 기둥에 닿기까지의 길이(len을 넘지 않는다)
export function pillarReach(w, x, z, angle, len) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  let reach = len;
  for (const c of pillarsOf(w)) {
    const dx = c.x - x, dz = c.z - z, along = dx * ca + dz * sa, off2 = dx * dx + dz * dz - along * along;
    if (along <= 0 || off2 >= c.r * c.r) continue;
    reach = Math.min(reach, Math.max(0, along - Math.sqrt(c.r * c.r - off2)));
  }
  return reach;
}
// 늘 나가는 빔이 닿는 길이(화면도 이 길이로 그린다)
export const beamReach = (w, angle) => pillarReach(w, w.player.x, w.player.z, angle, w.rules.weapons.beam.len);

// 몸에서 angle 쪽으로 len만큼 뻗은 줄(굵기 width) 위의 적 모두에게 피해(빔)
function lineHurt(w, angle, len, width, amount, src, opts) {
  const p = w.player, x1 = p.x + Math.cos(angle) * len, z1 = p.z + Math.sin(angle) * len;
  for (const f of [...w.foeList]) if (!f.dead && segCircle(p.x, p.z, x1, z1, f.x, f.z, foeR(w, f) + width / 2)) hurtFoe(w, f, amount, src, opts);
}

function toggle(w, n) {
  const W = w.weapons, g = GEAR[n - 1];
  if (!g) return;
  if (has(W, g)) W.on = W.on.filter(x => x !== g);
  else { W.on = GEAR.filter(x => x === g || W.on.includes(x)); W.next[g] = w.time + (w.rules.weapons[g].first ?? w.rules.weapons[g].every ?? 0); }
  emit(w, 'gearToggle', { kind: g, on: has(W, g) });
}

// fall = 거리 배율(산탄 — always 판에서만 준다), far = 처음 사거리(날아간 거리 = far − left)
function pellet(w, kind, x, z, a, P, src, fall = null) {
  w.weapons.pellets.push({ kind, x, z, px: x, pz: z, vx: Math.cos(a) * P.speed, vz: Math.sin(a) * P.speed, left: P.range ?? 16, far: P.range ?? 16, dmg: P.dmg, src, fall });
}

// 탄을 쓸 때의 한 방(한 판의 뼈대 §7): 낀 무기마다 n칸어치. angle = 나가는 쪽, how = 'throw'·'snipe'·'mine'(저격이면 빔이 그 줄에 고정된다).
// always가 켜진 판에서만. 무기가 없거나 n이 0이거나 각도가 수가 아니면 아무것도 하지 않는다(사건도 없다).
// 미사일·작은 탄은 w.weapons의 목록에 얹고(salvo 표시 — 방패를 지나고 피해 기록이 따로다), 굵은 빔·난사는 시각으로 적어 updateWeapons가 돌린다.
export function weaponSalvo(w, n, angle, how) {
  const W = w.weapons;
  if (!always(w) || !W || !W.on.length || !(n > 0) || !Number.isFinite(angle)) return;
  const WR = w.rules.weapons, SV = WR.salvo, p = w.player, share = gearShare(w), rad = Math.PI / 180;
  const fan = (k, i, deg) => angle + (k > 1 ? i / (k - 1) - 0.5 : 0) * deg * rad;
  for (const g of W.on) {
    if (g === 'missile') {
      const k = n * SV.missile.n;
      for (let i = 0; i < k; i++) { const a = fan(k, i, SV.missile.spreadDeg); W.missiles.push({ x: p.x, z: p.z, px: p.x, pz: p.z, a, life: WR.missile.life, salvo: SV.missile.dmg * share }); emit(w, 'weaponFire', { kind: 'missile', x: p.x, z: p.z, angle: a, salvo: true }); }
    } else if (g === 'burst') {
      const k = n * SV.burst.n;
      for (let i = 0; i < k; i++) { const a = fan(k, i, SV.burst.spreadDeg); pellet(w, 'burst', p.x, p.z, a, { speed: WR.burst.speed, range: WR.burst.range, dmg: SV.burst.dmg * share }, 'salvo', SV.burst.fall); emit(w, 'weaponFire', { kind: 'burst', x: p.x, z: p.z, angle: a, salvo: true }); }
    } else if (g === 'beam') {
      W.salvoBeam = { until: w.time + n * SV.beam.dur, angle: how === 'snipe' ? angle : null, dps: SV.beam.dps * share };
      emit(w, 'weaponFire', { kind: 'beam', x: p.x, z: p.z, angle, salvo: true, dur: n * SV.beam.dur, fixed: how === 'snipe' });
    } else if (g === 'drone') { W.salvoDroneUntil = Math.max(W.salvoDroneUntil, w.time) + n * SV.drone.dur; W.salvoDroneAt = Math.max(W.salvoDroneAt, w.time); W.salvoDrone = SV.drone.dmg * share; }
  }
  emit(w, 'salvo', { kinds: [...W.on], n, x: p.x, z: p.z, angle, how, full: n >= p.storeCap });   // full = 칸을 다 쓴 한 방(연출이 크다)
}

export function updateWeapons(w, input) {
  const W = w.weapons, R = w.rules, WR = R.weapons, p = w.player, b = w.aim, dt = R.dt;   // b = 겨눈 적(foes.js)
  if (!W) return;
  if (input.toggle) toggle(w, input.toggle);
  const A = always(w);   // 늘 나가는 무기: 받아치지 않아도 쏘고, 가동 = 과열(over배 자주)
  const newParries = w.stats.parries - W.parries, newPerfects = w.stats.perfects - W.perfects;
  W.parries = w.stats.parries; W.perfects = w.stats.perfects;
  if (newParries > 0) {
    // 무기 가동: 쉬던 무기가 깨어나면 알린다. 게이지: 보통 +1, 완벽 +2
    if (w.time >= W.chargeUntil && W.on.some(g => A || g !== 'burst')) emit(w, 'weaponWake', { x: p.x, z: p.z });
    W.chargeUntil = Math.max(W.chargeUntil, w.time + (newPerfects > 0 ? WR.charge.perfectSec : WR.charge.sec));
    if (!w.opts.store) W.gauge = Math.min(WR.skill.max, W.gauge + newParries + newPerfects);   // 모아 던지기(§4.11)에선 게이지 대신 모은 탄
  }
  if (!b && !w.result && !w.execute) {   // 겨눌 적이 없다(방 정리 뒤·등장 예고): 날던 것은 곧게 날다 사라지고, 던진 산탄 몫은 버린다
    W.throwFans = 0;
    for (let k = W.missiles.length - 1; k >= 0; k--) { const m = W.missiles[k]; m.px = m.x; m.pz = m.z; m.life -= dt; m.x += Math.cos(m.a) * WR.missile.speed * dt; m.z += Math.sin(m.a) * WR.missile.speed * dt; if (m.life <= 0) W.missiles.splice(k, 1); }
    for (let k = W.pellets.length - 1; k >= 0; k--) { const q = W.pellets[k]; q.px = q.x; q.pz = q.z; q.x += q.vx * dt; q.z += q.vz * dt; q.left -= Math.hypot(q.vx, q.vz) * dt; if (q.left <= 0) W.pellets.splice(k, 1); }
    return;
  }
  if (w.result || !b || b.dead || w.execute) return;
  const aim = Math.atan2(b.z - p.z, b.x - p.x), charged = w.time < W.chargeUntil;
  const due = g => has(W, g) && (A || charged) && w.time >= W.next[g] - 1e-9;   // 가동 중에만(멈춘 동안 쌓인 차례는 깨어나자마자 한 번 쏜다) — 늘 나가는 무기는 언제나
  const pace = A && charged ? A.over : 1, hard = A ? A.mul * gearShare(w) : 1;   // 과열 중엔 다음 차례가 over배 빨리 온다 · 피해 mul배(무기가 여럿이면 나눠 갖는다)

  // 무기 스킬(U·I·O): 그 무기를 꼈고 게이지가 cost칸 이상일 때
  if (input.skill && !w.opts.store) {
    const k = input.skill, SK = WR.skill;
    if (!has(W, k) || !SK[k]) emit(w, 'denied', { what: 'skill', why: 'gear', kind: k });
    else if (W.gauge < SK.cost) emit(w, 'denied', { what: 'skill', why: 'gauge', kind: k });
    else {
      W.gauge -= SK.cost;
      if (k === 'missile') {
        const M = SK.missile;
        for (let i = 0; i < M.n; i++) {
          const a = aim + (i / (M.n - 1) - 0.5) * M.spreadDeg * Math.PI / 180;
          W.missiles.push({ x: p.x, z: p.z, px: p.x, pz: p.z, a, life: WR.missile.life });
          emit(w, 'weaponFire', { kind: 'missile', x: p.x, z: p.z, angle: a, skill: true });
        }
      } else if (k === 'beam') W.skillBeamUntil = w.time + SK.beam.dur;
      else if (k === 'drone') W.frenzyUntil = w.time + SK.drone.dur;
      emit(w, 'weaponSkill', { kind: k, x: p.x, z: p.z });
    }
  }
  const again = g => { W.next[g] = w.time + WR[g].every / pace; };

  // 미사일: 옆으로 나갔다가 보스를 따라감
  if (due('missile')) {
    again('missile');
    const M = WR.missile;
    for (let k = 0; k < M.n; k++) {
      const a = aim + (k - (M.n - 1) / 2) * M.spreadDeg * Math.PI / 180 * (M.n > 1 ? 2 / (M.n - 1) : 0);
      W.missiles.push({ x: p.x, z: p.z, px: p.x, pz: p.z, a, life: M.life });
      emit(w, 'weaponFire', { kind: 'missile', x: p.x, z: p.z, angle: a });
    }
  }
  for (let k = W.missiles.length - 1; k >= 0; k--) {
    const m = W.missiles[k], M = WR.missile;
    m.px = m.x; m.pz = m.z; m.life -= dt;
    const want = Math.atan2(b.z - m.z, b.x - m.x);
    let d = want - m.a; d = Math.atan2(Math.sin(d), Math.cos(d));
    m.a += Math.max(-M.turn * dt, Math.min(M.turn * dt, d));
    m.x += Math.cos(m.a) * M.speed * dt; m.z += Math.sin(m.a) * M.speed * dt;
    if (m.salvo == null && pillarHit(w, m.px, m.pz, m.x, m.z)) { emit(w, 'pillarBlock', { x: m.x, z: m.z, enemy: false }); W.missiles.splice(k, 1); continue; }   // 기둥에 막힌다(한 방은 지난다)
    const hm = hitFoe(w, m.px, m.pz, m.x, m.z);
    if (hm) {
      if (m.salvo != null) hurtFoe(w, hm, m.salvo, 'salvo', { pierce: true });   // 한 방: 방패·보호를 지난다
      else hurtFoe(w, hm, M.dmg * hard, 'weapon', { fromX: m.px, fromZ: m.pz });
      emit(w, 'weaponHit', { kind: 'missile', x: m.x, z: m.z, salvo: m.salvo != null });
      W.missiles.splice(k, 1); continue;
    }
    if (m.life <= 0) W.missiles.splice(k, 1);
  }

  // 산탄: 패링에 성공할 때마다 보스 쪽으로 부채
  // 모아 던지기(§4.11)에선 받을 때가 아니라 던질 때, 던진 수만큼(부채마다 조금 어긋나게)
  const fans = A ? (due('burst') ? 1 : 0) : w.opts.store ? (W.throwFans | 0) : newParries;   // 늘 나가는 무기: burstEvery초마다 한 번
  if (A && fans) W.next.burst = w.time + A.burstEvery / pace;
  W.throwFans = 0;
  if (has(W, 'burst') && fans > 0) {
    const Bu = WR.burst, stepA = Bu.spreadDeg * Math.PI / 180 / Math.max(1, Bu.n - 1) * 2;
    for (let r = 0; r < fans; r++) for (let k = 0; k < Bu.n; k++) {
      const a = aim + (k - (Bu.n - 1) / 2) * stepA + (w.opts.store ? (r - (fans - 1) / 2) * stepA / fans : 0);
      pellet(w, 'burst', p.x, p.z, a, Bu, 'burst', A ? Bu.fall : null);
      emit(w, 'weaponFire', { kind: 'burst', x: p.x, z: p.z, angle: a });
    }
  }

  // 빔: 잠깐 보스를 잇는다
  if (due('beam')) { again('beam'); W.beamUntil = w.time + WR.beam.dur; emit(w, 'weaponFire', { kind: 'beam', x: p.x, z: p.z, angle: aim }); }
  if (w.time < W.beamUntil - 1e-9) {
    if (A) lineHurt(w, aim, beamReach(w, aim), WR.beam.width, WR.beam.dps * dt * hard, 'weapon', { fromX: p.x, fromZ: p.z });   // 줄 위의 적을 모두 지난다(기둥에서 끊긴다)
    else hurtFoe(w, b, WR.beam.dps * dt * hard, 'weapon', { fromX: p.x, fromZ: p.z });
  }
  if (w.time < W.skillBeamUntil - 1e-9) hurtFoe(w, b, WR.skill.beam.dps * dt * hard, 'weapon', { fromX: p.x, fromZ: p.z });   // 굵은 빔(스킬)
  if (W.salvoBeam && w.time < W.salvoBeam.until - 1e-9) lineHurt(w, W.salvoBeam.angle ?? aim, WR.beam.len, WR.salvo.beam.width, W.salvoBeam.dps * dt, 'salvo', { pierce: true });   // 굵은 빔(한 방): 줄 위의 적 모두 — 저격이면 그 줄에 고정

  // 드론: 몸 곁을 돌며 보스에게 한 발
  if (has(W, 'drone')) {
    const D = WR.drone;
    W.droneA += D.spin * dt;
    const frenzy = w.time < W.frenzyUntil;   // 드론 연사(스킬): 가동과 상관없이 아주 자주
    if (frenzy ? w.time >= W.next.drone - 1e-9 : due('drone')) {
      W.next.drone = w.time + (frenzy ? WR.skill.drone.every : D.every / pace);
      const x = p.x + Math.cos(W.droneA) * D.offset, z = p.z + Math.sin(W.droneA) * D.offset;
      const t = A ? flank(w) : b, a = Math.atan2(t.z - z, t.x - x);   // 내가 안 보는 적을 쏜다
      pellet(w, 'drone', x, z, a, D, 'weapon');
      emit(w, 'weaponFire', { kind: 'drone', x, z, angle: a });
    }
  }

  // 드론의 한 방(난사): salvoDroneUntil까지 every초마다 한 발 — 가동·과열과 따로
  if (has(W, 'drone') && w.time < W.salvoDroneUntil - 1e-9 && w.time >= W.salvoDroneAt - 1e-9) {
    const D = WR.drone, Sd = WR.salvo.drone, x = p.x + Math.cos(W.droneA) * D.offset, z = p.z + Math.sin(W.droneA) * D.offset, t = flank(w), a = Math.atan2(t.z - z, t.x - x);
    W.salvoDroneAt = w.time + Sd.every;
    pellet(w, 'drone', x, z, a, { speed: D.speed, range: D.range, dmg: W.salvoDrone }, 'salvo');
    emit(w, 'weaponFire', { kind: 'drone', x, z, angle: a, salvo: true });
  }
  // 작은 탄(드론·산탄)
  for (let k = W.pellets.length - 1; k >= 0; k--) {
    const q = W.pellets[k];
    q.px = q.x; q.pz = q.z;
    q.x += q.vx * dt; q.z += q.vz * dt; q.left -= Math.hypot(q.vx, q.vz) * dt;
    if (q.src !== 'salvo' && pillarHit(w, q.px, q.pz, q.x, q.z)) { emit(w, 'pillarBlock', { x: q.x, z: q.z, enemy: false }); W.pellets.splice(k, 1); continue; }
    const hq = hitFoe(w, q.px, q.pz, q.x, q.z);
    if (hq) {
      const far = q.fall ? fallMul(q.fall, q.far - q.left) : 1;
      if (q.src === 'salvo') hurtFoe(w, hq, q.dmg * far, 'salvo', { pierce: true });   // 한 방: 제 값 그대로(몫은 낼 때 곱했다), 방패·보호를 지난다
      else hurtFoe(w, hq, q.dmg * hard * far, q.src, { fromX: q.px, fromZ: q.pz });
      emit(w, 'weaponHit', { kind: q.kind, x: q.x, z: q.z, salvo: q.src === 'salvo' });
      W.pellets.splice(k, 1); continue;
    }
    if (q.left <= 0) W.pellets.splice(k, 1);
  }
}
