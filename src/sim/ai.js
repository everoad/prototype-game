// 적 AI 둘: makeSimpleAi = 단계 1 단순판(10초마다 보이는 적 무게에 비례해 화살표를 나눈다 — 고정 전략 측정 도구들이 쓴다),
// makeAi = 판단 다섯 가지(계획서 Task 14, 아래).

import { canSee, knownBuildings } from './vision.js';
import { troopsAt, MAKERS } from './orders.js';
import { FOREST } from './map.js';
import { GOAL, STATE } from './soldiers.js';
import { SPEAR, ARCHER, CAVALRY } from './rules.js';
import { wallStanding, conversionShares } from './production.js';
import { canCast } from './casts.js';
import { forEachNear } from './soldiers.js';

const THINK_EVERY = 10;    // 초
// 짓기: 빈 칸이 있고 금이 되면 이 무게로 고른다
const BUILD_PICK = [['pikes', 0.3], ['archery', 0.4], ['stable', 0.3]];   // 생산 칸에 고르는 무게(공성 없음, 창 막사)
const UPGRADE_PICK = 0.5;   // 생산 칸이 다 차면 이 몫으로 성벽, 나머지 망루
const NEAR_LINE = 150;     // 승점 선에서 이만큼 안의 적을 그 구역의 위협으로 센다 m
const SECTOR_MARGIN = 60;  // 구역 선분 양옆으로 넓혀 세는 거리 m

export function makeSimpleAi(side, rng) {
  let next = 0;
  return {
    think(w) {
      if (w.time < next || w.result) return [];
      next = w.time + THINK_EVERY;
      const s = w.soldiers;
      const secs = w.map.sectors.filter(x => x.side === side);
      const threat = secs.map(() => 1);
      for (let i = 0; i < s.count; i++) {
        if (!s.alive[i] || s.side[i] === side || Math.abs(s.z[i] - w.map.vpLine) > NEAR_LINE || !canSee(w, side, s.x[i], s.z[i])) continue;   // 보이는 적만(§7.3)
        secs.forEach((sec, k) => { if (s.x[i] >= sec.x0 - SECTOR_MARGIN && s.x[i] <= sec.x1 + SECTOR_MARGIN) threat[k] += w.rules.units[s.side[i]][s.type[i]].weight; });
      }
      const mine = w.strongholds.filter(st => st.owner === side && st.kind !== 'vp');
      const assigned = secs.map(() => 0);
      const orders = [];
      let gold = w.sides[side].gold;
      for (const st of mine) {
        let k = st.slots.findIndex((b, j) => !b && j < st.slotCount), pick = 'archery';
        if (k >= 0) {
          let u = rng.next();
          for (const [kind, p] of BUILD_PICK) { if (u < p) { pick = kind; break; } u -= p; }
        } else if (rng.next() < 0.5) {                     // 생산 칸이 다 찼으면 반은 생산 건물 2단계(사용자 2026-11-07)
          const j = st.slots.findIndex((b, q) => b && q < st.slotCount && !b.building && b.level < 2);
          const c = j >= 0 ? w.rules.buildings[st.slots[j].kind].cost * w.rules.buildings.upgradeCost : Infinity;
          if (j >= 0 && gold >= c) { gold -= c; orders.push({ kind: 'upgrade', side, stronghold: st.id, slot: j }); }
          continue;
        } else {                                          // 아니면 강화(성벽·망루)
          const wall = st.slotCount, tower = st.slotCount + 1;
          const want = st.kind !== 'hq' && !st.slots[wall] && rng.next() < UPGRADE_PICK ? wall : !st.slots[tower] ? tower : st.kind !== 'hq' && !st.slots[wall] ? wall : -1;
          if (want < 0) continue;
          k = want; pick = want === wall ? 'wall' : 'tower';
        }
        const cost = w.rules.buildings[pick].cost;
        if (gold < cost) break;
        gold -= cost;
        orders.push({ kind: 'build', side, stronghold: st.id, slot: k, building: pick });
      }
      for (const st of mine.sort((a, b) => a.x - b.x)) {
        if (st.original !== st.owner) continue;          // 빼앗은 거점은 구역으로 못 보낸다
        if (w.holds.some(h => h.side === side && h.flows.some(f => f.from === st.id))) continue;   // 막아라로 돌린 흐름은 둔다
        let best = 0, bs = -Infinity;
        secs.forEach((sec, k) => {
          const score = threat[k] / (1 + assigned[k]) * (0.9 + 0.2 * rng.next()) / (1 + Math.abs((sec.x0 + sec.x1) / 2 - st.x) / 600);
          if (score > bs) { bs = score; best = k; }
        });
        assigned[best]++;
        const cur = w.sides[side].arrows.get(st.id);
        if (!cur || cur.id !== secs[best].id) orders.push({ kind: 'arrow', side, from: st.id, target: { kind: 'sector', id: secs[best].id } });
      }
      return orders;
    },
  };
}

// ---- 판단 다섯 가지 AI(계획서 Task 14, 사용자 2026-11-07 "A: 이대로"로 고친 안) ----
// 1초마다 생각한다. 플레이어와 같은 명령(화살표·짓기·올리기·철거·막아라·보내기)과 같은 시야만 쓰고, 장수는 쓰지 않는다.
//  1 건물: 상대 특수 병종(창·궁·기)이 30초 넘게 몰려 보여야 상성 건물을 앞 거점에 더한다. 그 전엔 기본(앞 사격장·뒤 마구간).
//          위협받은 거점에 성벽, 금이 남으면 2단계, 그다음 망루.
//  2 흐름: 구역 점수 = 기억한 위협 × 성향 + 우리 것이 아닌 승점 × 성향 + 1(±10%). 계획은 45~60초 유지.
//          구역 병력이 앞 적의 성향 push배를 넘으면 그 깃발에서 승점(또는 적 앞 거점)으로 밀어 넣는다.
//  3 기습: 3~5분(성향 배율)마다 기병을 가장 많이 내는 거점의 화살표를 그 거점 자신에게 돌려 300~500을 모았다가,
//          가장 약하게 지켜진(기억한 둘레 위협 + 가는 길 위협, 아는 성벽·생산 건물) 적 거점으로 보낸다.
//  4 수비: 경보 2초 뒤, 둘레 우리 무게가 적보다 크면 둔다 → 아니면 막아라 → 막아라가 늦거나 15초 뒤에도 밀리면 다른 곳에 선 병력을 보낸다.
//  5 성향(aggressive·careful·raider)이 점수 무게를 바꾸고, 판단마다 ±10% 난수. 난이도 normal = 반응 2초, 금 보너스 없음.
const SPECIALS = [SPEAR, ARCHER, CAVALRY];

export function makeAi(side, { personality = 'aggressive', difficulty = 'normal' } = {}, rng) {
  const A = { side, personality, difficulty, rng, P: null, next: 0, mem: null, seen: {}, counterType: null, planUntil: 0, plan: new Map(),
    raid: null, raids: [], pushAt: {}, quiet: new Map(), holdAt: new Map(), reinforced: new Map(), lastPush: -1e9, lastRegroup: -1e9, lastBuild: -1e9 };
  return {
    state: A,
    think(w) {
      if (!A.mem) init(w, A);
      if (w.result || w.time < A.next - 1e-9) return [];
      A.next = w.time + 1;
      A.spent = 0;                                          // 이 판단에서 기습이 낸 금(명령·공성) — 건물이 같은 금을 또 쓰지 않게
      const ai = w.rules.ai, orders = [];
      observe(w, A);
      defend(w, A, orders);
      raidThink(w, A, orders);
      if (w.time - A.lastBuild >= ai.buildEvery - 1e-9) { A.lastBuild = w.time; build(w, A, orders); }
      flow(w, A, orders);
      if (w.time >= ai.pushFrom && w.time - A.lastPush >= ai.pushEvery - 1e-9) { A.lastPush = w.time; push(w, A, orders); }
      if (w.time - A.lastRegroup >= ai.regroupEvery - 1e-9) { A.lastRegroup = w.time; regroup(w, A, orders); }
      return orders;
    },
  };
}

const between = (A, lo, hi) => lo + (hi - lo) * A.rng.next();
const jit = (w, A) => 1 - w.rules.ai.jitter + 2 * w.rules.ai.jitter * A.rng.next();
const byId = (w, id) => w.strongholds.find(x => x.id === id);
const ownOriginal = (w, side) => w.strongholds.filter(st => st.owner === side && st.original === side && st.kind !== 'vp');

function init(w, A) {
  const ai = w.rules.ai, cell = ai.memCell, cols = Math.ceil(w.map.width / cell), rows = Math.ceil(w.map.depth / cell), n = cols * rows;
  const M = { cell, cols, rows, n, mem: new Float32Array(n), now: new Float32Array(n), seen: new Uint8Array(n), forest: new Uint8Array(n),
    cx: new Float32Array(n), cz: new Float32Array(n), vis: w.rules.units[1 - A.side].map(() => 0), at: w.time };   // 병종마다(공성 포함)
  for (let k = 0; k < n; k++) { M.cx[k] = (k % cols + 0.5) * cell; M.cz[k] = (Math.floor(k / cols) + 0.5) * cell; }
  const m = w.map;                                                  // 숲 칸과 그 둘레 기억 칸 = 의심(×1.3)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    if (m.terrain[r * m.cols + c] !== FOREST) continue;
    const mc = Math.floor(c * m.cell / cell), mr = Math.floor(r * m.cell / cell);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = mc + dc, rr = mr + dr;
      if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) M.forest[rr * cols + cc] = 1;
    }
  }
  A.mem = M;
  A.P = ai.personality[A.personality] ?? ai.personality.aggressive;
  A.raid = { phase: 'wait', at: w.time + between(A, ai.raidEveryMin, ai.raidEveryMax) * A.P.raidEvery, sweepAt: 0, sweepFrom: null };
}

// 기억한 위협: 지금 보이는 칸은 지금 본 무게, 안 보이는 칸은 반감기로 준다. 안 보이는 숲 둘레는 의심 배율.
function observe(w, A) {
  const M = A.mem, s = w.soldiers, r = w.rules, ai = r.ai, side = A.side;
  const decay = Math.pow(0.5, Math.max(0, w.time - M.at) / ai.threatHalfLife);
  M.at = w.time;
  M.now.fill(0); M.vis.fill(0);
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] === side || !canSee(w, side, s.x[i], s.z[i])) continue;
    const c = Math.floor(s.x[i] / M.cell), rr = Math.floor(s.z[i] / M.cell);
    if (c < 0 || rr < 0 || c >= M.cols || rr >= M.rows) continue;
    const wt = r.units[s.side[i]][s.type[i]].weight;
    M.now[rr * M.cols + c] += wt;
    M.vis[s.type[i]] += wt;
  }
  for (let k = 0; k < M.n; k++) {
    const seen = canSee(w, side, M.cx[k], M.cz[k]);
    M.seen[k] = seen ? 1 : 0;
    M.mem[k] = seen ? M.now[k] : Math.max(M.mem[k] * decay, M.now[k]);
  }
  // 몰림: 특수 병종이 보인 무게에서 시작 구성 몫 × massShare를 넘는다. 30초 넘게 이어지면(5초 넘게 끊기면 처음부터) 상성 대상.
  const total = M.vis[0] + M.vis[1] + M.vis[2] + M.vis[3], mix = r.start.mix;
  let best = null, bestRatio = 0;
  for (const t of SPECIALS) {
    const o = A.seen[t] ??= { since: null, last: -1e9, ratio: 0 };
    if (total >= ai.massMinWeight && M.vis[t] / total >= mix[t] * ai.massShare) { o.since ??= w.time; o.last = w.time; o.ratio = M.vis[t] / total / mix[t]; }
    else if (w.time - o.last > ai.massForget) o.since = null;
    if (o.since !== null && w.time - o.since >= ai.observeSeconds - 1e-9 && o.ratio > bestRatio) { bestRatio = o.ratio; best = t; }
  }
  if (best !== null && best !== A.counterType && w.time - (A.counterAt ?? -1e9) >= ai.counterHold - 1e-9) { A.counterType = best; A.counterAt = w.time; }
}

function threatAt(A, k, w) {
  const M = A.mem;
  return M.mem[k] * (M.forest[k] && !M.seen[k] ? w.rules.ai.forestSuspicion : 1);
}
// 칸 가운데가 [x0, x1] × [z0, z1] 안인 칸들의 기억 위협 합.
function threatIn(w, A, x0, x1, z0, z1) {
  const M = A.mem;
  let sum = 0;
  const c0 = Math.max(0, Math.floor(x0 / M.cell)), c1 = Math.min(M.cols - 1, Math.floor(x1 / M.cell));
  const r0 = Math.max(0, Math.floor(z0 / M.cell)), r1 = Math.min(M.rows - 1, Math.floor(z1 / M.cell));
  for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) {
    const k = rr * M.cols + c;
    if (M.cx[k] >= x0 && M.cx[k] <= x1 && M.cz[k] >= z0 && M.cz[k] <= z1) sum += threatAt(A, k, w);
  }
  return sum;
}
function threatNear(w, A, x, z, rad) {
  const M = A.mem;
  let sum = 0;
  for (let k = 0; k < M.n; k++) if (Math.hypot(M.cx[k] - x, M.cz[k] - z) <= rad) sum += threatAt(A, k, w);
  return sum;
}
// 곧은 길(a → b)이 지나는 칸들의 기억 위협 합(칸마다 한 번).
function threatAlong(w, A, a, b) {
  const M = A.mem, len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / (M.cell / 2))), seen = new Set();
  let sum = 0;
  for (let j = 0; j <= n; j++) {
    const x = a.x + (b.x - a.x) * j / n, z = a.z + (b.z - a.z) * j / n;
    const c = Math.floor(x / M.cell), rr = Math.floor(z / M.cell), k = rr * M.cols + c;
    if (c < 0 || rr < 0 || c >= M.cols || rr >= M.rows || seen.has(k)) continue;
    seen.add(k);
    sum += threatAt(A, k, w);
  }
  return sum;
}
const sectorRegion = (w, sec) => [sec.x0 - w.rules.ai.sectorMargin, sec.x1 + w.rules.ai.sectorMargin, w.map.vpLine - w.rules.ai.nearLine, w.map.vpLine + w.rules.ai.nearLine];

// 거점에 서 있는(수비대·장수 빼고) 우리 병력과 거기 모이는 쐐기의 무게.
function weightAt(w, side, st) {
  const s = w.soldiers, r = w.rules, k = w.strongholds.indexOf(st);
  let sum = 0;
  for (const i of troopsAt(w, side, { kind: 'stronghold', id: st.id })) sum += r.units[side][s.type[i]].weight;
  for (const g of w.groups) if (g.origin === k && g.side === side && g.state === 'gather') for (const i of g.members) if (s.alive[i] && s.group[i] === g.id) sum += r.units[side][s.type[i]].weight;
  return sum;
}
// 이 거점의 흐름 계획(없으면 가장 가까운 우리 구역).
function planTarget(w, A, st) {
  const id = A.plan.get(st.id);
  if (id) return { kind: 'sector', id };
  const sec = nearestSector(w, A.side, st.x, st.z);
  return sec ? { kind: 'sector', id: sec.id } : { kind: 'stronghold', id: st.id };
}
function nearestSector(w, side, x, z) {
  let best = null, bd = Infinity;
  for (const sec of w.map.sectors) {
    if (sec.side !== side) continue;
    const px = Math.max(sec.x0, Math.min(sec.x1, x)), d = Math.hypot(px - x, sec.z - z);
    if (d < bd) { bd = d; best = sec; }
  }
  return best;
}

// ---- 1 건물 ----
function build(w, A, orders) {
  const r = w.rules, ai = r.ai, side = A.side, B = r.buildings;
  let gold = w.sides[side].gold - (A.spent ?? 0);
  const own = ownOriginal(w, side), fronts = own.filter(st => st.kind === 'front');
  const isMaker = b => b && MAKERS.includes(b.kind);
  const pay = (cost, o) => { if (gold < cost) return false; gold -= cost; orders.push(o); return true; };
  // ① 상성: 몰려 보인 병종의 천적 건물을 앞 거점마다(빈 생산 칸에 더하고, 칸이 없으면 다른 생산 건물을 헐어 자리를 낸다)
  const counter = A.counterType !== null ? ai.counterBuilding[A.counterType] : null;
  if (counter) for (const st of fronts) {
    if (st.slots.some((b, k) => k < st.slotCount && b && b.kind === counter)) continue;
    const free = st.slots.findIndex((b, k) => k < st.slotCount && !b);
    if (free >= 0) { if (!pay(B[counter].cost, { kind: 'build', side, stronghold: st.id, slot: free, building: counter })) return; continue; }
    const victim = st.slots.findIndex((b, k) => k < st.slotCount && isMaker(b) && b.kind !== counter && !b.building);
    if (victim >= 0 && !(st.weightIn?.[1 - side] > 0)) { orders.push({ kind: 'demolish', side, stronghold: st.id, slot: victim }); return; }   // 돌려받은 금으로 다음 판단에 짓는다(원 안에 적이 있으면 못 헌다)
  }
  // ② 기본: 생산 건물이 하나도 없는 거점(본진 빼고)에 앞 = 사격장, 뒤 = 마구간
  for (const st of own) {
    if (st.kind === 'hq' || st.slots.some((b, k) => k < st.slotCount && isMaker(b))) continue;
    const kind = ai.defaultBuilding[st.kind], free = st.slots.findIndex((b, k) => k < st.slotCount && !b);
    if (kind && free >= 0 && !pay(B[kind].cost, { kind: 'build', side, stronghold: st.id, slot: free, building: kind })) return;
  }
  // 금 명령(2026-11-09): 첫 생산 건물 다음, 성벽·올리기·망루 앞
  spendOrders(w, A, orders, pay);
  // ③ 성벽: 둘레(wallRadius)에 위협이 wallThreat를 넘게 있었거나 공격 경보가 있는 거점
  for (const st of own) {
    const k = st.slotCount;
    if (st.kind === 'hq' || st.slots[k]) continue;
    const alerted = w.sides[side].alerts.some(a => a.stronghold === st.id && a.kind === 'attacked');
    if ((alerted || threatNear(w, A, st.x, st.z, ai.wallRadius) >= ai.wallThreat) && !pay(B.wall.cost, { kind: 'build', side, stronghold: st.id, slot: k, building: 'wall' })) return;
  }
  // ④ 2단계: 상성 건물 → 기습 거점의 마구간 → 나머지
  const ups = [];
  for (const st of own) st.slots.forEach((b, k) => { if (k < st.slotCount && isMaker(b) && !b.building && b.level < 2) ups.push({ st, k, b }); });
  const rank = u => (u.b.kind === counter ? 0 : u.b.kind === 'stable' ? 1 : 2);
  ups.sort((a, b) => rank(a) - rank(b));
  for (const u of ups) if (!pay(B[u.b.kind].cost * B.upgradeCost, { kind: 'upgrade', side, stronghold: u.st.id, slot: u.k })) return;
  // ⑤ 망루: 금이 넉넉할 때 앞 거점부터
  for (const st of [...fronts, ...own.filter(x => x.kind !== 'front')]) {
    const k = st.slotCount + 1;
    if (st.slots[k] || gold < B.tower.cost + ai.towerSpare) continue;
    pay(B.tower.cost, { kind: 'build', side, stronghold: st.id, slot: k, building: 'tower' });
  }
}

// ---- 1b 금 명령(설계서 2026-11-09-flood-gold-orders-design.md §3): 보이는 적만 센다. 정찰은 쓰지 않는다 ----
function spendOrders(w, A, orders, pay) {
  const side = A.side, O = w.rules.orders;
  for (const a of w.sides[side].alerts) {                   // 긴급 징집: 공격받는 거점이 밀릴 때
    if (a.kind !== 'attacked') continue;
    const st = byId(w, a.stronghold);
    if (!st || (st.near?.[1 - side] ?? 0) <= (st.near?.[side] ?? 0) || !canCast(w, side, 'levy', st.id).ok) continue;
    if (pay(O.levy.cost, { kind: 'cast', side, order: 'levy', stronghold: st.id })) break;
  }
  if (canCast(w, side, 'drum').ok) { const p = drumSpot(w, A); if (p) pay(O.drum.cost, { kind: 'cast', side, order: 'drum', x: p.x, z: p.z }); }
  if (canCast(w, side, 'volley').ok) { const p = volleySpot(w, A); if (p) pay(O.volley.cost, { kind: 'cast', side, order: 'volley', x: p.x, z: p.z }); }
}

// 무게 합(둘레 R): 우리 무게·맞붙은 우리 수·보이는 적 무게.
function weighAround(w, side, x, z, R) {
  const s = w.soldiers, R2 = R * R, out = { own: 0, fighting: 0, foe: 0 };
  forEachNear(s, x, z, R, j => {
    if (!s.alive[j] || (s.x[j] - x) ** 2 + (s.z[j] - z) ** 2 > R2) return;
    const wt = w.rules.units[s.side[j]][s.type[j]].weight;
    if (s.side[j] === side) { out.own += wt; if (s.inContact[j]) out.fighting++; }
    else if (canSee(w, side, s.x[j], s.z[j])) out.foe += wt;
  });
  return out;
}

// 돌격 북 자리: 맞붙은 우리 병사를 후보로, 둘레에 맞붙은 우리가 drumMinOwn명 넘고 보이는 적 무게가 우리보다 큰 곳 중 차이가 가장 큰 곳.
function drumSpot(w, A) {
  const s = w.soldiers, side = A.side, C = w.rules.ai.casts, R = w.rules.orders.radius;
  let best = null, bs = 0, seen = 0, cands = 0;
  for (let i = 0; i < s.count && cands < C.maxCandidates; i++) {
    if (!s.alive[i] || s.side[i] !== side || !s.inContact[i] || seen++ % C.sample) continue;
    cands++;
    const m = weighAround(w, side, s.x[i], s.z[i], R);
    if (m.fighting > C.drumMinOwn && m.foe > m.own && m.foe - m.own > bs) { bs = m.foe - m.own; best = { x: s.x[i], z: s.z[i] }; }
  }
  return best;
}

// 화살 비 자리: 서 있는 우리 궁수가 노리는 보이는 적을 후보로, 둘레 보이는 적 무게가 volleyMinWeight 넘는 곳 중 가장 무거운 곳.
function volleySpot(w, A) {
  const s = w.soldiers, side = A.side, r = w.rules, C = r.ai.casts, R = r.orders.radius;
  let best = null, bw = C.volleyMinWeight, seen = 0, cands = 0;
  for (let i = 0; i < s.count && cands < C.maxCandidates; i++) {
    if (!s.alive[i] || s.side[i] !== side) continue;
    const u = r.units[side][s.type[i]];
    if (u.range <= r.melee.reach * 2 || u.siege || s.order[i] || (s.group[i] >= 0 && s.state[i] === STATE.MARCH) || s.state[i] === STATE.FLEE || s.state[i] === STATE.ROUT) continue;
    if (seen++ % C.sample) continue;
    cands++;
    const t = s.rtarget[i];
    if (t < 0 || !s.alive[t] || !canSee(w, side, s.x[t], s.z[t])) continue;
    const m = weighAround(w, side, s.x[t], s.z[t], R);
    if (m.foe > bw) { bw = m.foe; best = { x: s.x[t], z: s.z[t] }; }
  }
  return best;
}

// ---- 2 흐름과 밀어 넣기 ----
function flow(w, A, orders) {
  const ai = w.rules.ai, side = A.side;
  if (w.time < A.planUntil - 1e-9) return;
  A.planUntil = w.time + between(A, ai.planHoldMin, ai.planHoldMax);
  const secs = w.map.sectors.filter(x => x.side === side);
  const score = secs.map(sec => {
    const vp = w.strongholds.some(st => st.kind === 'vp' && st.x >= sec.x0 && st.x <= sec.x1 && st.owner !== side) ? ai.vpValue : 0;
    return (threatIn(w, A, ...sectorRegion(w, sec)) * A.P.threat + vp * A.P.vp + 1) * jit(w, A);
  });
  const assigned = secs.map(() => 0);
  for (const st of ownOriginal(w, side).sort((a, b) => a.x - b.x)) {
    let best = 0, bs = -Infinity;
    secs.forEach((sec, k) => {
      const sc = score[k] / (1 + assigned[k]) / (1 + Math.abs((sec.x0 + sec.x1) / 2 - st.x) / 600);
      if (sc > bs) { bs = sc; best = k; }
    });
    assigned[best]++;
    A.plan.set(st.id, secs[best].id);
    if (busyFlow(w, A, st)) continue;
    const cur = w.sides[side].arrows.get(st.id);
    if (!cur || cur.kind !== 'sector' || cur.id !== secs[best].id) orders.push({ kind: 'arrow', side, from: st.id, target: { kind: 'sector', id: secs[best].id } });
  }
}
// 막아라로 돌린 흐름이나 기습을 모으는 거점은 계획이 건드리지 않는다.
const busyFlow = (w, A, st) => (A.raid.phase === 'gather' && A.raid.source === st.id) || w.holds.some(h => h.side === A.side && h.flows.some(f => f.from === st.id));

function push(w, A, orders) {
  const r = w.rules, ai = r.ai, side = A.side, s = w.soldiers, M = A.mem;
  const weight = w.map.sectors.map(() => 0);
  for (let i = 0; i < s.count; i++)
    if (s.alive[i] && s.side[i] === side && s.goalKind[i] === GOAL.SECTOR && s.group[i] < 0 && s.state[i] !== STATE.ROUT) weight[s.goalId[i]] += r.units[side][s.type[i]].weight;
  w.map.sectors.forEach((sec, k) => {
    if (sec.side !== side || w.time < (A.pushAt[sec.id] ?? 0)) return;
    const [x0, x1, z0, z1] = sectorRegion(w, sec);
    const ez0 = side === 0 ? w.map.vpLine : z0, ez1 = side === 0 ? z1 : w.map.vpLine;   // 적 쪽 반을 지금 보고 있어야 민다
    let looked = false;
    for (let j = 0; j < M.n && !looked; j++) looked = M.seen[j] === 1 && M.cx[j] >= x0 && M.cx[j] <= x1 && M.cz[j] >= ez0 && M.cz[j] <= ez1;
    const theirs = threatIn(w, A, x0, x1, z0, z1);
    if (!looked || weight[k] < ai.pushMinWeight || weight[k] < A.P.push * theirs * jit(w, A)) return;
    const mid = (sec.x0 + sec.x1) / 2;
    const vp = w.strongholds.find(st => st.kind === 'vp' && st.x >= sec.x0 && st.x <= sec.x1 && st.owner !== side);
    const front = w.strongholds.filter(st => st.kind === 'front' && st.owner === 1 - side && Math.abs(st.x - mid) <= 300).sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
    const target = vp ?? front;
    if (!target) return;
    orders.push({ kind: 'send', side, from: { kind: 'sector', id: sec.id }, target: { kind: 'stronghold', id: target.id } });
    A.pushAt[sec.id] = w.time + ai.pushCooldown;
  });
}

// 승점·빼앗은 거점에 서 있는 병력: 원 안에 적이 없고 둘레 위협도 없이 regroupSeconds가 지나면 가까운 우리 구역으로.
function regroup(w, A, orders) {
  const ai = w.rules.ai, side = A.side;
  for (const st of w.strongholds) {
    if (st.owner !== side || (st.kind !== 'vp' && st.original === side)) { A.quiet.delete(st.id); continue; }
    const quiet = (st.weightIn?.[1 - side] ?? 0) === 0 && threatNear(w, A, st.x, st.z, st.radius + 40) < 1;
    if (!quiet || !troopsAt(w, side, { kind: 'stronghold', id: st.id }).length) { A.quiet.delete(st.id); continue; }
    const since = A.quiet.get(st.id) ?? w.time;
    A.quiet.set(st.id, since);
    if (w.time - since < ai.regroupSeconds - 1e-9) continue;
    const sec = nearestSector(w, side, st.x, st.z);
    if (sec) orders.push({ kind: 'send', side, from: { kind: 'stronghold', id: st.id }, target: { kind: 'sector', id: sec.id } });
    A.quiet.delete(st.id);
  }
}

// ---- 3 기습 ----
function raidThink(w, A, orders) {
  const R = A.raid, r = w.rules, ai = r.ai, side = A.side;
  if (R.sweepAt && w.time >= R.sweepAt) {                     // 보낸 뒤 늦게 닿은 쐐기 = 그 거점의 계획 구역으로
    R.sweepAt = 0;
    const st = byId(w, R.sweepFrom);
    if (st && st.owner === side && !(R.phase === 'gather' && R.source === st.id) && troopsAt(w, side, { kind: 'stronghold', id: st.id }).length)
      orders.push({ kind: 'send', side, from: { kind: 'stronghold', id: st.id }, target: planTarget(w, A, st) });
  }
  if (R.phase === 'wait') {
    if (w.time < R.at) return;
    const src = raidSource(w, A);
    if (!src) { R.at = w.time + ai.raidRetry; return; }
    Object.assign(R, { phase: 'gather', source: src.id, since: w.time, want: between(A, ai.raidWeightMin, ai.raidWeightMax), siegeDone: false });
    orders.push({ kind: 'arrow', side, from: src.id, target: { kind: 'stronghold', id: src.id } });   // 모으기 = 화살표를 그 거점 자신에게
    return;
  }
  const src = byId(w, R.source);
  const stop = (retry) => {
    if (src && src.owner === side) { orders.push({ kind: 'arrow', side, from: src.id, target: planTarget(w, A, src) }); Object.assign(R, { sweepAt: w.time + ai.raidSweep, sweepFrom: src.id }); }
    Object.assign(R, { phase: 'wait', at: w.time + retry });
  };
  if (!src || src.owner !== side || src.home) { stop(ai.raidRetry); return; }   // 빼앗겼거나 둘레가 밀리면 그만(모은 병력은 계획 구역으로)
  // 공성병(2026-11-09): 모으는 동안 값을 잡아 두었다가(건물·명령이 그 금을 쓰지 않게) 되면 산다. 나오면 거점에 서 있다가 보내기에 같이 간다
  if (!R.siegeDone) {
    const sb = r.siegeBuy;
    if (src.siegeAt != null) R.siegeDone = true;
    else if (w.sides[side].gold - A.spent >= sb.cost) { orders.push({ kind: 'buySiege', side, stronghold: src.id }); R.siegeDone = true; }
    A.spent += sb.cost;
  }
  const got = weightAt(w, side, src), late = w.time - R.since >= ai.raidGatherMax;
  if (got < R.want && !late) return;
  if (src.siegeAt != null && !late) return;                  // 산 공성병이 나올 때까지 기다린다
  const plan = got >= R.want * ai.raidMinShare ? raidTarget(w, A, src) : null;
  if (!plan) { stop(ai.raidRetry); return; }
  const tgt = plan.st;
  // 강행군(2026-11-09): 모이던 쐐기 가운데들의 평균 자리 — 보내기 뒤에 넣어 같은 틱에 새로 행군하는 그 쐐기들을 잡는다
  const k = w.strongholds.indexOf(src), gathered = w.groups.filter(g => g.origin === k && g.side === side && g.state === 'gather' && g.members.length);
  orders.push({ kind: 'send', side, from: { kind: 'stronghold', id: src.id }, target: { kind: 'stronghold', id: tgt.id }, ...(plan.via.length ? { via: plan.via } : {}) });
  const mc = r.orders.march.cost;
  if (gathered.length && canCast(w, side, 'march').ok && w.sides[side].gold - A.spent >= mc) {
    orders.push({ kind: 'cast', side, order: 'march', x: gathered.reduce((a, g) => a + g.x, 0) / gathered.length, z: gathered.reduce((a, g) => a + g.z, 0) / gathered.length });
    A.spent += mc;
  }
  A.raids.push({ at: w.time, source: src.id, target: tgt.id, weight: got, route: plan.route });
  stop(between(A, ai.raidEveryMin, ai.raidEveryMax) * A.P.raidEvery);
}

// 기병을 가장 많이 내는 우리 거점(본진 빼고, 밀리거나 경보 중인 곳 빼고). 기병이 없으면 뒤 거점.
function raidSource(w, A) {
  const r = w.rules, side = A.side, alerts = w.sides[side].alerts;
  const ok = ownOriginal(w, side).filter(st => st.kind !== 'hq' && !st.home && !alerts.some(a => a.stronghold === st.id && a.kind !== 'sighted') && !busyFlow(w, A, st));
  let best = null, bc = 0;
  for (const st of ok) { const c = conversionShares(st.slots, r)[CAVALRY]; if (c > bc + 1e-9) { bc = c; best = st; } }
  return best ?? ok.find(st => st.kind === 'rear') ?? null;
}

// 가장 약하게 지켜진 적 거점: 기억한 둘레 위협 + 가는 길 위협 ÷ 2 + (아는 성벽) − (아는 생산 건물) + 거리, ±10%. 본진은 성벽이 무너졌을 때만.
// 길: 곧장 또는 지도의 도는 길(경유점, 물을 건너지 않는 것만) — 길 위협과 길이를 길마다 잰다.
function raidTarget(w, A, src) {
  const ai = w.rules.ai, side = A.side, known = knownBuildings(w, side);
  const routes = [{ name: 'direct', via: [] }, ...(ai.raidRoutes ? w.map.routes : []).map(r => ({ name: r.name, via: side === 1 ? r.via : [...r.via].reverse() }))];
  let best = null, bs = Infinity;
  for (const st of w.strongholds) {
    if (st.owner !== 1 - side || st.kind === 'vp' || (st.kind === 'hq' && st.wallHp > 0)) continue;
    const kb = known.get(st.id), list = Array.isArray(kb) ? kb : [];
    const wall = list.some(b => b && b.kind === 'wall' && !b.building), makers = list.filter(b => b && MAKERS.includes(b.kind)).length;
    const base = threatNear(w, A, st.x, st.z, st.radius + 60) + (wall ? ai.raidWallPenalty : 0) - makers * ai.raidProdBonus + w.rules.garrison.stronghold;
    for (const route of routes) {
      const pts = [src, ...route.via, st];
      let path = 0, len = 0, ok = true;
      let cross = 0;
      for (let j = 1; j < pts.length && ok; j++) {
        ok = clearPath(w.map, pts[j - 1], pts[j]);
        path += threatAlong(w, A, pts[j - 1], pts[j]);
        len += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z);
        if (crossesFront(w, pts[j - 1], pts[j])) cross = ai.raidFrontPenalty;   // 정면(구역 선분)을 가로지르는 길
        for (const o of w.strongholds) if (o !== st && o.owner === 1 - side && o.kind !== 'vp' && distToSegment(o, pts[j - 1], pts[j]) < o.radius + 40) cross += ai.raidPassPenalty;   // 다른 적 거점(수비대·모이는 쐐기) 옆을 지나는 길
      }
      if (!ok) continue;
      const score = (base + path + cross + len / 100 * ai.raidDistPenalty) * jit(w, A);
      if (score < bs) { bs = score; best = { st, via: route.via.map(p => ({ ...p })), route: route.name }; }
    }
  }
  return best;
}

// 곧은 길이 승점 선을 구역 선분(양끝 20 m 더) 위에서 지나나 — 지나면 정면 싸움에 묶인다.
function crossesFront(w, a, b) {
  const z = w.map.vpLine;
  if ((a.z - z) * (b.z - z) > 0 || a.z === b.z) return false;
  const x = a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z);
  return w.map.sectors.some(sec => x >= sec.x0 - 20 && x <= sec.x1 + 20);
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// 곧은 길이 물을 건너지 않나(4 m마다 본다).
function clearPath(map, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 4);
  for (let k = 1; k < n; k++) if (!map.walkable(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n)) return false;
  return true;
}

// ---- 4 수비 ----
function defend(w, A, orders) {
  const ai = w.rules.ai, side = A.side;
  for (const [id, t] of A.reinforced) if (!w.sides[side].alerts.some(a => a.stronghold === id && a.kind === 'attacked')) A.reinforced.delete(id);
  for (const a of w.sides[side].alerts) {
    if ((a.kind !== 'attacked' && a.kind !== 'blocked') || w.time - a.since < ai.reactionDelay - 1e-9) continue;
    const k = w.strongholds.findIndex(x => x.id === a.stronghold), st = w.strongholds[k];
    if (!st || st.owner !== side) continue;
    const foe = st.near?.[1 - side] ?? 0, ours = st.near?.[side] ?? 0;
    const held = w.holds.some(h => h.side === side && h.stronghold === k);
    if (!held) {
      if (foe <= ours) continue;                                          // 수비대로 된다
      orders.push({ kind: 'holdTheLine', side, stronghold: st.id });
      A.holdAt.set(st.id, w.time);
      if (holdEta(w, side, st) > captureEta(w, st, side)) reinforce(w, A, st, orders);
      continue;
    }
    const since = A.holdAt.get(st.id) ?? a.since;
    if (w.time - since >= ai.holdLate && foe > ours && Math.abs(st.gauge) < ai.holdLateGauge) reinforce(w, A, st, orders);
  }
}
// 원 안의 무게로 게이지가 0을 지날 때까지 걸리는 초(밀리지 않으면 Infinity).
export function captureEta(w, st, side) {
  const inn = st.weightIn ?? [0, 0], E = inn[1 - side], O = inn[side];
  if (E <= O) return Infinity;
  if (st.kind === 'hq' && wallStanding(st)) return Infinity;
  const rate = 100 / w.rules.capture[st.kind] * (E - O) / E * (wallStanding(st) ? 0.5 : 1);
  return Math.abs(st.gauge) / rate;
}
// 막아라로 끌려오는 병력이 닿는 초: 가장 가까운 우리 구역에서 걸어서.
function holdEta(w, side, st) {
  const sec = nearestSector(w, side, st.x, st.z);
  if (!sec) return Infinity;
  const px = Math.max(sec.x0, Math.min(sec.x1, st.x));
  return Math.hypot(px - st.x, sec.z - st.z) / w.rules.ai.holdSpeed;
}
// 다른 곳에 선 병력: 모으던 기습 → 가까운 거점·승점에 선 병력 → (본진이면) 가까운 구역 깃발. 경보가 끝날 때까지 한 번만.
function reinforce(w, A, st, orders) {
  if (A.reinforced.has(st.id)) return;
  const side = A.side, R = A.raid, ai = w.rules.ai;
  let from = null;
  if (R.phase === 'gather' && R.source !== st.id) {
    from = { kind: 'stronghold', id: R.source };
    Object.assign(R, { phase: 'wait', at: w.time + ai.raidRetry });
    orders.push({ kind: 'arrow', side, from: R.source, target: planTarget(w, A, byId(w, R.source)) });
  } else {
    let bd = Infinity;
    for (const x of w.strongholds) {
      if (x === st || x.owner !== side || weightAt(w, side, x) < ai.pushMinWeight / 2) continue;
      const d = Math.hypot(x.x - st.x, x.z - st.z);
      if (d < bd) { bd = d; from = { kind: 'stronghold', id: x.id }; }
    }
    if (!from && st.kind === 'hq') { const sec = nearestSector(w, side, st.x, st.z); if (sec) from = { kind: 'sector', id: sec.id }; }
  }
  if (!from) return;
  orders.push({ kind: 'send', side, from, target: { kind: 'stronghold', id: st.id } });
  A.reinforced.set(st.id, w.time);
}
