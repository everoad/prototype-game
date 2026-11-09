// 수비 층(설계서 §3.5·§7.3): 거점 둘레 훑기, 집에 남음·건물 막힘 판정, 경보, "막아라" 풀기.
// 훑기는 SCAN_EVERY 틱마다(앞 틱의 격자를 쓴다 — 틱 처음, 생산 전).
import { forEachNear, STATE, GOAL } from './soldiers.js';
import { setGoal } from './world.js';
import { retargetGathering } from './groups.js';
import { arrowOf } from './production.js';
import { isPoint } from './map.js';

const SCAN_EVERY = 5;          // 틱
const ALERT_LINGER = 5;        // 조건이 끝나도 경보를 이만큼 더 둔다 s(깜빡임 방지)
const HIT_RECENT = 3;          // 건물이 맞은 뒤 이만큼은 '공격받음' s

// 둘레 적 무게가 max(5, 둘레 우리 무게)를 넘는가(5는 규모를 곱하지 않는다).
export const overwhelmed = (enemyWeight, ourWeight, min = 5) => enemyWeight > Math.max(min, ourWeight);

// 건물 자리(화면도 같이 쓴다): 칸 k는 거점 둘레 각도 (k + 0.5) / 칸 수 × 2π, 가운데에서 본진 26 m·그 밖 16 m.
export function buildingPos(st, k) {
  const a = (k + 0.5) / st.slots.length * Math.PI * 2, d = st.kind === 'hq' ? 26 : 16;
  return { x: st.x + Math.cos(a) * d, z: st.z + Math.sin(a) * d };
}

// 수비대 끈 = 원 + leash m.
export const garrisonReach = (w, st) => st.radius + w.rules.holdTheLine.leash;

export function stepDefense(w) {
  if (w.tick % SCAN_EVERY !== 0) return;
  const s = w.soldiers, r = w.rules;
  for (const st of w.strongholds) {
    if (st.kind === 'vp') continue;
    const land = st.kind === 'land';                                        // 작은 땅: 무게만 세고 "공격받음" 경보만(집에 남음·막힘·망루 없음)
    const reach = garrisonReach(w, st), reach2 = reach * reach, in2 = st.radius * st.radius;
    const near = [0, 0], inside = [0, 0], ids = st.nearIds ?? (st.nearIds = []);
    ids.length = 0;
    forEachNear(s, st.x, st.z, reach, j => {
      if (!s.alive[j]) return;
      const d2 = (s.x[j] - st.x) ** 2 + (s.z[j] - st.z) ** 2;
      if (d2 > reach2) return;
      const wt = r.units[s.side[j]][s.type[j]].weight;
      near[s.side[j]] += wt;
      ids.push(j);
      if (d2 <= in2) inside[s.side[j]] += wt;
    });
    st.near = near;
    st.weightNear = inside;
    const own = st.owner;
    if (land) { if (own !== null) raise(w, own, st, 'attacked', inside[1 - own] > 0); continue; }
    st.home = own !== null && overwhelmed(near[1 - own], near[own], r.defense.overwhelmMin);   // 집에 남음
    let blocked = false;
    st.slots.forEach((b, k) => {                                                              // 건물 막힘
      if (!b) return;
      b.blocked = false;
      if (own === null || b.building || r.buildings[b.kind]?.unit === undefined) return;
      const p = buildingPos(st, k), rad = r.defense.blockRadius, w2 = [0, 0];
      forEachNear(s, p.x, p.z, rad, j => {
        if (s.alive[j] && (s.x[j] - p.x) ** 2 + (s.z[j] - p.z) ** 2 <= rad * rad) w2[s.side[j]] += r.units[s.side[j]][s.type[j]].weight;
      });
      b.blocked = overwhelmed(w2[1 - own], w2[own], r.defense.overwhelmMin);
      blocked ||= b.blocked;
    });
    if (own === null) continue;
    raise(w, own, st, 'attacked', inside[1 - own] > 0 || w.time - (st.hitAt ?? -1e9) < HIT_RECENT);
    raise(w, own, st, 'blocked', blocked);
    raise(w, own, st, 'sighted', towerSees(w, st));
  }
  for (const side of [0, 1]) {
    const list = w.sides[side].alerts;
    for (let k = list.length - 1; k >= 0; k--) {
      const a = list[k], st = w.strongholds.find(x => x.id === a.stronghold);
      if (st.owner !== side || w.time - a.last > ALERT_LINGER) list.splice(k, 1);
    }
  }
  releaseHolds(w);
}

// 경보: 조건이 서면 목록에 올리고(새로 서면 사건), 이어지는 동안 last를 늘린다.
function raise(w, side, st, kind, on) {
  if (!on) return;
  const list = w.sides[side].alerts;
  const a = list.find(x => x.stronghold === st.id && x.kind === kind);
  if (a) { a.last = w.time; return; }
  list.push({ kind, stronghold: st.id, since: w.time, last: w.time });
  w.events.push({ kind: 'alert', alert: kind, side, stronghold: st.id });
}

// 다 지은 망루가 250 m(2단계 300 m) 안에 적을 보나 — 20 m 칸 무게 지도로 본다.
function towerSees(w, st) {
  const c = w.coarse;
  if (!c) return false;
  const foe = c.weight[1 - st.owner];
  for (let k = 0; k < st.slots.length; k++) {
    const b = st.slots[k];
    if (!b || b.kind !== 'tower' || b.building) continue;
    const p = buildingPos(st, k), range = b.level >= 2 ? w.rules.vision.tower2 : w.rules.vision.tower;
    const reach = Math.ceil(range / c.cell), c0 = Math.floor(p.x / c.cell), r0 = Math.floor(p.z / c.cell);
    for (let rr = Math.max(0, r0 - reach); rr <= Math.min(c.rows - 1, r0 + reach); rr++)
      for (let cc = Math.max(0, c0 - reach); cc <= Math.min(c.cols - 1, c0 + reach); cc++)
        if (foe[rr * c.cols + cc] > 0 && Math.hypot((cc + 0.5) * c.cell - p.x, (rr + 0.5) * c.cell - p.z) <= range) return true;
  }
  return false;
}

// 흐름 화살표를 바꾼다(없으면 지운다). 그 거점 앞에 모이는 쐐기도 따른다.
export function setArrow(w, side, fromId, target) {
  const k = w.strongholds.findIndex(x => x.id === fromId);
  if (target) w.sides[side].arrows.set(fromId, { ...target });
  else w.sides[side].arrows.delete(fromId);
  const t = target ?? arrowOf(w, w.strongholds[k]);
  for (const grp of w.groups) if (grp.origin === k && grp.state === 'gather') retargetGathering(w, grp, t);
}

// 막아라 풀기: 원 + 40 m 안에 적이 revertSeconds 동안 없으면 끌려온 병사는 원래 구역으로, 흐름은 원래대로.
function releaseHolds(w) {
  const s = w.soldiers, r = w.rules;
  for (let h = w.holds.length - 1; h >= 0; h--) {
    const hold = w.holds[h], st = w.strongholds[hold.stronghold];
    if ((st.near?.[1 - hold.side] ?? 0) > 0) { hold.clearSince = null; continue; }
    hold.clearSince ??= w.time;
    if (w.time - hold.clearSince < r.holdTheLine.revertSeconds - 1e-9) continue;
    const back = [];
    for (let i = 0; i < s.count; i++)
      if (s.alive[i] && s.side[i] === hold.side && s.returnTo[i] >= 0 && s.goalKind[i] === GOAL.STRONGHOLD && s.goalId[i] === hold.stronghold) back.push(i);
    const bySector = new Map();
    for (const i of back) { const k = s.returnTo[i]; if (!bySector.has(k)) bySector.set(k, []); bySector.get(k).push(i); s.returnTo[i] = -1; s.state[i] = STATE.MARCH; s.target[i] = -1; }
    for (const [k, ids] of bySector) setGoal(w, ids, { kind: 'sector', id: w.map.sectors[k].id });
    for (const f of hold.flows) {
      const cur = w.sides[hold.side].arrows.get(f.from);
      if (cur && cur.kind === 'stronghold' && cur.id === st.id) setArrow(w, hold.side, f.from, f.prev);   // 그새 바꾼 화살표는 둔다
    }
    // 돌린 흐름으로 온 병사(와 가는 중인 쐐기)도 자기 거점의 지금 화살표로 간다 — 뒤 거점에 수천이 서 있지 않게
    const from = new Set(hold.flows.map(f => w.strongholds.findIndex(x => x.id === f.from)));
    const byOrigin = new Map();
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || s.side[i] !== hold.side || s.goalKind[i] !== GOAL.STRONGHOLD || s.goalId[i] !== hold.stronghold) continue;
      if (s.state[i] === STATE.GARRISON || s.group[i] >= 0 || !from.has(s.origin[i])) continue;
      if (!byOrigin.has(s.origin[i])) byOrigin.set(s.origin[i], []);
      byOrigin.get(s.origin[i]).push(i);
    }
    for (const [k, ids] of byOrigin) if (w.strongholds[k].owner === hold.side) setGoal(w, ids, arrowOf(w, w.strongholds[k]));
    for (const grp of w.groups)
      if (grp.state === 'march' && from.has(grp.origin) && grp.target.kind === 'stronghold' && grp.target.id === st.id && w.strongholds[grp.origin].owner === hold.side)
        grp.target = { ...arrowOf(w, w.strongholds[grp.origin]) };
    w.holds.splice(h, 1);
    w.events.push({ kind: 'holdReleased', side: hold.side, stronghold: st.id });
  }
}

// "막아라"(§3.5): 그 거점에 가장 가까운 우리 구역에서, 거점에 가까운 순으로 무게가 지휘 한도가 될 때까지 끌어온다.
// 가까운 우리 거점 2곳의 흐름도 그 거점으로 간다. 이미 막는 중이면 못 한다.
export function holdTheLine(w, o) {
  const k = w.strongholds.findIndex(x => x.id === o.stronghold), st = w.strongholds[k];
  if (!st || isPoint(st)) return { ok: false, reason: '거점이 아니다' };
  if (st.owner !== o.side) return { ok: false, reason: '우리 거점이 아니다' };
  if (w.holds.some(h => h.stronghold === k && h.side === o.side)) return { ok: false, reason: '이미 막는 중' };
  const s = w.soldiers, r = w.rules;
  let sec = -1, sd = Infinity;
  w.map.sectors.forEach((x, j) => {
    if (x.side !== o.side) return;
    const px = Math.max(x.x0, Math.min(x.x1, st.x)), d = Math.hypot(px - st.x, x.z - st.z);
    if (d < sd) { sd = d; sec = j; }
  });
  if (sec < 0) return { ok: false, reason: '우리 구역이 없다' };
  const cand = [];
  for (let i = 0; i < s.count; i++)
    if (s.alive[i] && s.side[i] === o.side && s.goalKind[i] === GOAL.SECTOR && s.goalId[i] === sec && s.group[i] < 0 && s.state[i] !== STATE.ROUT && s.state[i] !== STATE.FLEE)
      cand.push(i);
  const d2 = i => (s.x[i] - st.x) ** 2 + (s.z[i] - st.z) ** 2;
  cand.sort((a, b) => d2(a) - d2(b));
  const pulled = [];
  let weight = 0;
  for (const i of cand) {
    if (weight >= r.general.limit - 1e-9) break;
    pulled.push(i);
    weight += r.units[o.side][s.type[i]].weight;
  }
  setGoal(w, pulled, { kind: 'stronghold', id: st.id });
  for (const i of pulled) { s.state[i] = STATE.GARRISON; s.returnTo[i] = sec; s.target[i] = -1; s.hasPursuit[i] = 0; s.chargeUntil[i] = 0; }
  const others = w.strongholds.filter(x => x !== st && x.owner === o.side && !isPoint(x))
    .sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z)).slice(0, 2);
  const flows = others.map(x => ({ from: x.id, prev: w.sides[o.side].arrows.get(x.id) }));
  for (const f of flows) setArrow(w, o.side, f.from, { kind: 'stronghold', id: st.id });
  w.holds.push({ side: o.side, stronghold: k, sector: sec, clearSince: null, flows, weight });
  w.events.push({ kind: 'holdTheLine', side: o.side, stronghold: st.id, weight });
  return { ok: true };
}
