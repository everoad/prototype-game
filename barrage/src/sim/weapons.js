// 보조 무기(§4.10): 낀 무기는 모두 자동. 공격 무기만 — 미사일·산탄(패링 연계)·빔·드론. 숫자 1~4(input.toggle)로 켜고 끈다(시험용).
// 탄을 지우는 방어 무기(칼날·파동)는 너무 세서 뺐다(사용자) — 탄은 패링·회피로 대한다. 처형 중·판이 끝나면 쉰다.
// 패링과 엮기: 공격 무기(미사일·빔·드론)는 패링 뒤 charge.sec초만 가동(받아칠수록 무기가 깨어난다), 산탄은 패링 그 자체.
// 패링이 스킬 게이지를 채우고(+1, 완벽 +2), U·I·O로 그 무기의 스킬(미사일 일제 사격·굵은 빔·드론 연사)을 쓴다(게이지 cost칸).
// 투사체는 수가 적어(초당 몇 발) 객체 배열로 둔다: w.weapons.missiles / pellets.
import { emit } from './events.js';
import { hitFoe, hurtFoe } from './foes.js';

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
  return { on, next, missiles: [], pellets: [], droneA: 0, beamUntil: -1, parries: 0, perfects: 0, chargeUntil: -1, gauge: 0, skillBeamUntil: -1, frenzyUntil: -1, throwFans: 0 };
}

const has = (W, g) => W.on.includes(g);

function toggle(w, n) {
  const W = w.weapons, g = GEAR[n - 1];
  if (!g) return;
  if (has(W, g)) W.on = W.on.filter(x => x !== g);
  else { W.on = GEAR.filter(x => x === g || W.on.includes(x)); W.next[g] = w.time + (w.rules.weapons[g].first ?? w.rules.weapons[g].every ?? 0); }
  emit(w, 'gearToggle', { kind: g, on: has(W, g) });
}

function pellet(w, kind, x, z, a, P, src) {
  w.weapons.pellets.push({ kind, x, z, px: x, pz: z, vx: Math.cos(a) * P.speed, vz: Math.sin(a) * P.speed, left: P.range ?? 16, dmg: P.dmg, src });
}

export function updateWeapons(w, input) {
  const W = w.weapons, R = w.rules, WR = R.weapons, p = w.player, b = w.aim, dt = R.dt;   // b = 겨눈 적(foes.js)
  if (!W) return;
  if (input.toggle) toggle(w, input.toggle);
  const A = w.tries && w.tries.on.always ? R.tries.always : null;   // 늘 나가는 무기(실험): 받아치지 않아도 쏘고, 가동 = 과열(over배 자주)
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
  const pace = A && charged ? A.over : 1, hard = A ? A.mul : 1;   // 과열 중엔 다음 차례가 over배 빨리 온다 · 피해 mul배

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
    const hm = hitFoe(w, m.px, m.pz, m.x, m.z);
    if (hm) {
      hurtFoe(w, hm, M.dmg * hard, 'weapon', { fromX: m.px, fromZ: m.pz }); emit(w, 'weaponHit', { kind: 'missile', x: m.x, z: m.z });
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
      pellet(w, 'burst', p.x, p.z, a, Bu, 'burst');
      emit(w, 'weaponFire', { kind: 'burst', x: p.x, z: p.z, angle: a });
    }
  }

  // 빔: 잠깐 보스를 잇는다
  if (due('beam')) { again('beam'); W.beamUntil = w.time + WR.beam.dur; emit(w, 'weaponFire', { kind: 'beam', x: p.x, z: p.z, angle: aim }); }
  if (w.time < W.beamUntil - 1e-9) hurtFoe(w, b, WR.beam.dps * dt * hard, 'weapon', { fromX: p.x, fromZ: p.z });
  if (w.time < W.skillBeamUntil - 1e-9) hurtFoe(w, b, WR.skill.beam.dps * dt * hard, 'weapon', { fromX: p.x, fromZ: p.z });   // 굵은 빔(스킬)

  // 드론: 몸 곁을 돌며 보스에게 한 발
  if (has(W, 'drone')) {
    const D = WR.drone;
    W.droneA += D.spin * dt;
    const frenzy = w.time < W.frenzyUntil;   // 드론 연사(스킬): 가동과 상관없이 아주 자주
    if (frenzy ? w.time >= W.next.drone - 1e-9 : due('drone')) {
      W.next.drone = w.time + (frenzy ? WR.skill.drone.every : D.every / pace);
      const x = p.x + Math.cos(W.droneA) * D.offset, z = p.z + Math.sin(W.droneA) * D.offset;
      const a = Math.atan2(b.z - z, b.x - x);
      pellet(w, 'drone', x, z, a, D, 'weapon');
      emit(w, 'weaponFire', { kind: 'drone', x, z, angle: a });
    }
  }

  // 작은 탄(드론·산탄)
  for (let k = W.pellets.length - 1; k >= 0; k--) {
    const q = W.pellets[k];
    q.px = q.x; q.pz = q.z;
    q.x += q.vx * dt; q.z += q.vz * dt; q.left -= Math.hypot(q.vx, q.vz) * dt;
    const hq = hitFoe(w, q.px, q.pz, q.x, q.z);
    if (hq) {
      hurtFoe(w, hq, q.dmg * hard, q.src, { fromX: q.px, fromZ: q.pz }); emit(w, 'weaponHit', { kind: q.kind, x: q.x, z: q.z });
      W.pellets.splice(k, 1); continue;
    }
    if (q.left <= 0) W.pellets.splice(k, 1);
  }
}
