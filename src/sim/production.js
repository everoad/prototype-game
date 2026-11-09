// 생산(설계서 §3.1): 양은 땅에서 — 거점마다 무게/분으로 징집, 상한이면 멈춘다. 건물의 종류 바꾸기는 Task 8에서 더한다.
import { spawn, STATE, GOAL } from './soldiers.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY, TYPES } from './rules.js';
import { isPoint } from './map.js';
import { setGoal } from './world.js';
import { gatheringGroup, joinGroup, formationOffsets, classOf } from './groups.js';
import { garrisonReach } from './defense.js';
import { generalInReach } from './generals.js';

export function aliveWeights(w) {
  const s = w.soldiers, out = [0, 0];
  for (let i = 0; i < s.count; i++) if (s.alive[i]) out[s.side[i]] += w.rules.units[s.side[i]][s.type[i]].weight;
  return out;
}

// 화살표가 없을 때의 목표: x가 가장 가까운 승점(가운데 선의 거점, 사용자 2026-11-08 — 전에는 가장 가까운 자기 편 구역 선).
// 왼쪽 거점들 → 왼쪽 승점, 본진 → 가운데 승점, 오른쪽 거점들 → 오른쪽 승점. AI는 제 화살표를 따로 건다.
export function defaultArrow(w, st) {
  return nearestVictoryPoint(w, st.x) ?? { kind: 'stronghold', id: st.id };
}
// x가 가장 가까운 승점(목표 꼴). 승점이 없으면 null.
export function nearestVictoryPoint(w, x) {
  let best = null, bd = Infinity;
  for (const vp of w.strongholds) {
    if (vp.kind !== 'vp') continue;
    const d = Math.abs(vp.x - x);
    if (d < bd) { bd = d; best = vp; }
  }
  return best ? { kind: 'stronghold', id: best.id } : null;
}

// 새 병사가 따를 목표. 장수 화살표는 장수가 우리 땅(150 m) 안에 있고 패주 중이 아닐 때만, 아니면 마지막 구역으로(§3.4).
export function arrowOf(w, st) {
  const a = w.sides[st.owner].arrows.get(st.id) ?? defaultArrow(w, st);
  if (a.kind !== 'general') return a;
  const g = w.generals.find(x => x.id === a.id);
  if (g && w.time >= g.routedUntil && generalInReach(w, g)) return { kind: 'general', id: a.id };
  return a.fallback ?? defaultArrow(w, st);
}

// 건물이 바꾸는 징집 몫(§3.1·§3.3): 바꾸기 건물 몫의 합은 maxShare까지(넘으면 비율대로 줄임), 창병이 나머지.
export function conversionShares(slots, rules) {
  const sh = { [SPEAR]: 0, [ARCHER]: 0, [CAVALRY]: 0, [INFANTRY]: 0 };
  for (const b of slots) {
    if (!b || b.building || b.blocked) continue;                  // 막힌 건물은 바꾸지 않는다(§3.5)
    const def = rules.buildings[b.kind];
    if (!def || def.unit === undefined) continue;
    sh[def.unit] += def.share;
  }
  let total = sh[SPEAR] + sh[ARCHER] + sh[CAVALRY];
  const max = rules.buildings.maxShare;
  if (total > max) { for (const t of [SPEAR, ARCHER, CAVALRY]) sh[t] *= max / total; total = max; }
  sh[INFANTRY] = 1 - total;   // 나머지는 보병(사용자 2026-11-07 시험: 기본 = 보병)
  return sh;
}

const garrisonWant = (r, st) => (st.kind === 'hq' ? r.garrison.hq : r.garrison.stronghold);

// 수비대 병사로 세운다: 목표 = 그 거점, 상태 GARRISON.
function makeGarrison(w, id, st) {
  setGoal(w, [id], { kind: 'stronghold', id: st.id });
  w.soldiers.state[id] = STATE.GARRISON;
  w.soldiers.returnTo[id] = -1;
}

// 거점에서 병사 하나를 내보낸다. 수비대가 모자라거나 둘레 적이 더 많으면(집에 남음) 수비대로 남는다(§3.5).
// 이 거점에 type을 내는 2단계 건물(다 지었고 막히지 않은)이 있나.
const eliteAt = (w, st, type) => st.slots.some(b => b && !b.building && !b.blocked && b.level >= 2 && w.rules.buildings[b.kind]?.unit === type);
function makeElite(w, id, st, type) {
  if (!eliteAt(w, st, type)) return;
  const s = w.soldiers;
  s.elite[id] = 1;
  if (type === CAVALRY) s.hp[id] *= w.rules.elite.hpMult;   // 중기병
}

export function produceAt(w, st, type) {
  const r = w.rules, side = st.owner;
  if (st.garrisonWeight < garrisonWant(r, st) - 1e-9 || st.home) {
    const a = w.rng.next() * Math.PI * 2, d = st.radius * 0.5 * Math.sqrt(w.rng.next());
    const id = spawn(w.soldiers, side, type, st.x + Math.cos(a) * d, st.z + Math.sin(a) * d, r);
    w.soldiers.origin[id] = w.strongholds.indexOf(st);
    makeElite(w, id, st, type);
    makeGarrison(w, id, st);
    st.garrisonWeight += r.units[side][type].weight;
    st.produced += r.units[side][type].weight;
    st.producedByType ??= [0, 0, 0, 0];
    st.producedByType[type]++;
    return id;
  }
  // 목표 쪽 가장자리(문)에서 나온다 — 가운데서 나와 모이는 자리까지 줄지어 걷지 않게
  const grp = gatheringGroup(w, st, arrowOf(w, st), classOf(type));
  const c = Math.cos(grp.heading), sn = Math.sin(grp.heading);
  const along = st.radius * (0.7 + 0.25 * w.rng.next()), across = (w.rng.next() - 0.5) * st.radius * 0.8;
  const id = spawn(w.soldiers, side, type, st.x + c * along - sn * across, st.z + sn * along + c * across, r);
  w.soldiers.origin[id] = w.strongholds.indexOf(st);
  makeElite(w, id, st, type);
  joinGroup(w, grp, id);   // 거점 앞 쐐기에 선다(§6.4)
  st.produced += r.units[side][type].weight;
  st.producedByType ??= [0, 0, 0, 0];
  st.producedByType[type]++;
  return id;
}

// 거점마다 수비대 무게(주인 편, 끌려온 병사 제외). 1초마다 집에 남지 않은 거점의 넘친 수비대는 앞에 모이는 쐐기로 간다.
function countGarrisons(w) {
  const s = w.soldiers, r = w.rules, n = w.strongholds.length;
  for (const st of w.strongholds) st.garrisonWeight = 0;
  const release = w.tick % 20 === 0;
  const extra = release ? Array.from({ length: n }, () => []) : null;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.state[i] !== STATE.GARRISON || s.returnTo[i] >= 0 || s.goalKind[i] !== GOAL.STRONGHOLD) continue;
    const st = w.strongholds[s.goalId[i]];
    if (!st || st.owner !== s.side[i]) continue;
    st.garrisonWeight += r.units[s.side[i]][s.type[i]].weight;
    if (release) extra[s.goalId[i]].push(i);
  }
  if (!release) return;
  w.strongholds.forEach((st, k) => {
    if (st.owner === null || isPoint(st) || st.home || !w.production) return;
    const want = garrisonWant(r, st);
    const reach2 = garrisonReach(w, st) ** 2;
    for (let n2 = extra[k].length - 1; n2 >= 0 && st.garrisonWeight > want + 1e-9; n2--) {
      const i = extra[k][n2], wt = r.units[s.side[i]][s.type[i]].weight;
      if (st.garrisonWeight - wt < want - 1e-9) break;
      if ((s.x[i] - st.x) ** 2 + (s.z[i] - st.z) ** 2 > reach2 || s.target[i] >= 0) continue;   // 싸우는 중이면 둔다
      joinGroup(w, gatheringGroup(w, st, arrowOf(w, st), classOf(s.type[i])), i);
      st.garrisonWeight -= wt;
    }
  });
}

export function stepProduction(w) {
  if (!w.production || w.result) return;
  // 수입과 짓기는 생산과 함께 돈다
  const r = w.rules, dt = r.dt;
  const alive = aliveWeights(w);
  w.sides[0].alive = alive[0]; w.sides[1].alive = alive[1];
  countGarrisons(w);
  for (const st of w.strongholds) {
    if (st.owner === null) continue;
    const income = st.kind === 'land' ? r.lands.gold[st.landKind] : r.gold.perMinute[st.kind === 'hq' ? 'hq' : st.kind === 'vp' ? 'vp' : 'stronghold'];   // 작은 땅은 종류마다(거점 금에 더한다)
    w.sides[st.owner].gold += income / 60 * dt;   // 수입
    if (isPoint(st)) continue;                         // 점(승점·땅)은 생산하지 않는다
    for (const b of st.slots) if (b && b.building && w.time >= b.doneAt) b.building = false;   // 짓기 마침
    const perMin = st.kind === 'hq' ? r.levy.hq : r.levy.stronghold;
    const gain = perMin / 60 * dt, shares = conversionShares(st.slots, r);
    st.typeAcc ??= [0, 0, 0, 0];
    for (const type of TYPES) {
      st.typeAcc[type] += gain * shares[type];
      const wt = r.units[st.owner][type].weight;
      while (st.typeAcc[type] >= wt - 1e-9) {
        if (alive[st.owner] + wt > r.cap + 1e-9) { st.typeAcc[type] = Math.min(st.typeAcc[type], wt); break; }
        st.typeAcc[type] -= wt;
        produceAt(w, st, type);
        alive[st.owner] += wt;
      }
    }
  }
}

// 시작 대군(설계서 §2.2, §6.4): 편마다 무게 armyWeight를 세 구역에 나눠, 구역마다 병종 무리로 승점 선에서 offset m 떨어진 자리에 세운다.
export function spawnStartArmies(w, mix = w.rules.start.mix) {
  for (const sec of w.map.sectors) spawnSectorArmy(w, sec, w.rules.start.armyWeight / w.map.sectors.length * 2, mix);
}

// 한 구역의 대군(병종마다 진형): 창 쐐기가 선분을 따라 나란히, 그 뒤 archerBack m에 궁수 직사각형, 선분 양끝에 기병 삼각형,
// 보병 쐐기 뒤 spearBack m에 창 쐐기. 이미 적 쪽으로 행군 중 — 목표는 그 구역 선, 또는 start.toVictoryPoint인 편은 가장 가까운 승점.
export function spawnSectorArmy(w, sec, weight, mix) {
  const r = w.rules, g = r.group, st = r.start;
  const dir = sec.side === 0 ? 1 : -1;
  const z0 = w.map.vpLine - dir * st.offset;
  const target = (st.toVictoryPoint?.[sec.side] && nearestVictoryPoint(w, (sec.x0 + sec.x1) / 2)) || { kind: 'sector', id: sec.id };   // 우리 편은 가장 가까운 승점으로(사용자 2026-11-08)
  const byClass = { infantry: [], spear: [], archer: [], cav: [] };
  for (const type of TYPES) {
    const count = Math.round(weight * (mix[type] ?? 0) / r.units[sec.side][type].weight);
    for (let n = 0; n < count; n++) byClass[classOf(type)].push(type);
  }
  const make = (types, x, z) => {
    if (!types.length) return;
    const cls = classOf(types[0]);
    const grp = { id: w.nextGroupId++, side: sec.side, origin: -1, cls, target: { ...target }, members: [], weight: 0, state: 'march', x, z, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, vx: 0, vz: 0, charging: false, foe: null };
    w.groups.push(grp);
    const offs = formationOffsets(cls, types.length, g), c = Math.cos(grp.heading), sn = Math.sin(grp.heading);
    types.forEach((type, n) => {
      const o = offs[n];
      joinGroup(w, grp, spawn(w.soldiers, sec.side, type, x + c * o.f - sn * o.l, z + sn * o.f + c * o.l, r));
    });
  };
  // 무리마다 무게 weightByClass만큼으로 나눈다
  const split = (types, cls) => {
    if (!types.length) return [];
    const per = Math.max(1, Math.round(g.weightByClass[cls] / r.units[sec.side][types[0]].weight));
    const k = Math.max(1, Math.round(types.length / per));
    return Array.from({ length: k }, (_, j) => types.slice(Math.floor(j * types.length / k), Math.floor((j + 1) * types.length / k)));
  };
  const across = (parts, z) => parts.forEach((part, k) => make(part, sec.x0 + (sec.x1 - sec.x0) * (k + 0.5) / parts.length, z));
  across(split(byClass.infantry, 'infantry'), z0);
  across(split(byClass.spear, 'spear'), z0 - dir * st.spearBack);
  across(split(byClass.archer, 'archer'), z0 - dir * st.archerBack);
  split(byClass.cav, 'cav').forEach((part, k) => make(part, k % 2 ? sec.x1 + 10 : sec.x0 - 10, z0 - dir * st.cavBack));
}

// 처음부터 차 있는 수비대(본진 150, 그 밖 60 — 무게). 채우기·끈은 Task 10.
export function spawnGarrisons(w) {
  const r = w.rules;
  for (const st of w.strongholds) {
    if (st.owner === null || isPoint(st)) continue;
    const want = st.kind === 'hq' ? r.garrison.hq : r.garrison.stronghold;
    const wt = r.units[st.owner][INFANTRY].weight;
    const ids = [];
    for (let got = 0; got + wt <= want + 1e-9; got += wt) {
      const a = w.rng.next() * Math.PI * 2, d = st.radius * 0.5 * Math.sqrt(w.rng.next());
      const id = spawn(w.soldiers, st.owner, INFANTRY, st.x + Math.cos(a) * d, st.z + Math.sin(a) * d, r);
      w.soldiers.origin[id] = w.strongholds.indexOf(st);
      ids.push(id);
    }
    setGoal(w, ids, { kind: 'stronghold', id: st.id });
    for (const id of ids) w.soldiers.state[id] = STATE.GARRISON;
    st.garrisonWeight = ids.length * wt;
  }
}

// 서 있는 성벽(본진의 처음 성벽 또는 다 지은 성벽 건물)이 있는가.
export function wallStanding(st) {
  return st.wallHp > 0 || st.slots.some(b => b && b.kind === 'wall' && !b.building && b.hp > 0);
}

// 건물을 치는 차례: 성벽이 먼저, 그다음 다른 건물(짓는 중 포함). 없으면 null.
export function buildingTarget(st) {
  if (st.wallHp > 0) return { wall: 'hq' };
  const k = st.slots.findIndex(b => b && b.kind === 'wall' && !b.building && b.hp > 0);
  if (k >= 0) return { slot: k };
  const j = st.slots.findIndex(b => b && b.hp > 0);
  return j >= 0 ? { slot: j } : null;
}
