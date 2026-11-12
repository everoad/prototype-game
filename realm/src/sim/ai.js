// 적 AI(안개를 무시한다 — 시험판). 1초마다: 일꾼·채굴기 → 건물 순서 → 연구 → 상성 생산 → 본대(소굴 치우기·점령·공격·막기) + 빠른 기습조.
import { UNITS, BUILDINGS, RESEARCH } from './rules.js';
import { canPlace, canPay, cost } from './world.js';

const PERSONALITIES = {
  rush:     { plan: [['barracks', 20], ['stable', 90], ['barracks', 150], ['magetower', 260], ['workshop', 360], ['aerie', 480]], attackRatio: 1.1, raid: 120, workers: 16 },
  balanced: { plan: [['barracks', 35], ['stable', 140], ['magetower', 200], ['barracks', 280], ['workshop', 330], ['aerie', 420], ['tower', 300]], attackRatio: 1.3, raid: 200, workers: 20 },
  tech:     { plan: [['barracks', 45], ['magetower', 150], ['stable', 210], ['aerie', 300], ['workshop', 380], ['barracks', 420], ['tower', 260]], attackRatio: 1.5, raid: 260, workers: 22 },
};
const BASE_MIX = { sword: 3, spear: 2, archer: 3, scout: 1.2, knight: 2.5, mage: 2, priest: 1, catapult: 0.6, golem: 1.2, griffon: 1.2, dragon: 1 };

export function power(e) {
  const t = e.ent === 'building' ? e.t.shoot ?? null : e.t;
  if (!t || e.ruined || e.dormant) return 0;
  const dps = (t.dmg ?? 0) / (t.cd ?? 1) * (t.splash ? 1.8 : 1) + (e.t?.heal ? 6 : 0);
  return Math.max(1, e.hp) / 100 * (dps + 1);
}

export function makeAi(side, { personality = 'balanced', seed = 1 } = {}) {
  const P = PERSONALITIES[personality] ?? PERSONALITIES.balanced;
  const st = { side, personality, target: -1, targetSince: 0, raidTarget: -1, raiders: new Set(), lastDefend: -99 };
  return { every: 1, personality, state: st, think: w => think(w, side, P, st) };
}

function think(w, side, P, st) {
  const out = [], S = w.sides[side], map = w.map, enemy = 1 - side;
  const mine = w.units.filter(u => u.side === side);
  const workers = mine.filter(u => u.t.worker), army = mine.filter(u => !u.t.worker);
  const blds = w.buildings.filter(b => b.side === side);
  const citadel = blds.find(b => b.type === 'citadel');
  if (!citadel) return out;
  const owned = map.regions.filter((rg, g) => w.regions[g].owner === side);
  const has = type => blds.filter(b => b.type === type);
  const reserve = { gold: 0, wood: 0, mana: 0 };
  const afford = c => canPay(S, { gold: c.gold + reserve.gold, wood: c.wood + reserve.wood, mana: c.mana + reserve.mana });

  // ── 일꾼
  const wantWorkers = Math.min(P.workers, 6 + 2 * owned.length);
  if (workers.length + citadel.queue.length < wantWorkers && citadel.queue.length < 2 && citadel.done) out.push({ kind: 'train', building: citadel.id, unit: 'worker' });
  const idle = workers.filter(u => u.order.kind === 'idle');
  const sites = blds.filter(b => !b.done);
  // 짓는 중인데 아무도 안 붙은 곳
  for (const b of sites) {
    const busy = workers.some(u => (u.order.kind === 'build') && u.order.target === b.id);
    if (!busy && idle.length) out.push({ kind: 'assist', ids: [idle.pop().id], target: b.id });
  }
  // 빈 자원 자리
  const needMana = has('magetower').length > 0 || P.plan.some(([t, at]) => (t === 'magetower' || t === 'aerie') && w.time > at - 60);
  const free = map.deposits.filter(d => d.building < 0 && w.regions[d.region].owner === side && w.regions[d.region].connected[side] && (d.kind !== 'mana' || needMana));
  free.sort((a, b) => Math.hypot(a.x - citadel.x, a.z - citadel.z) - Math.hypot(b.x - citadel.x, b.z - citadel.z));
  const kindType = { gold: 'goldmine', wood: 'lumbermill', mana: 'manawell' };
  for (const d of free) {
    if (!idle.length || sites.length >= 3) break;
    const type = kindType[d.kind], c = cost(BUILDINGS[type]);
    if (!canPay(S, c)) { reserve.gold += c.gold; reserve.wood += c.wood; break; }
    const u = idle.splice(nearestIdx(idle, d.x, d.z), 1)[0];
    out.push({ kind: 'build', ids: [u.id], type, x: d.x, z: d.z });
    S.gold -= c.gold; S.wood -= c.wood; S.mana -= c.mana;          // 같은 생각 안에서 두 번 쓰지 않게(명령이 실제로 낸다)
    sites.push({});
    out.at(-1).refund = c;
  }
  // 건물 순서
  const counts = {};
  for (const b of blds) counts[b.type] = (counts[b.type] ?? 0) + 1;
  const seen = {};
  for (const [type, at] of P.plan) {
    seen[type] = (seen[type] ?? 0) + 1;
    if (w.time < at || (counts[type] ?? 0) >= seen[type]) continue;
    const t = BUILDINGS[type];
    if (t.needs && !blds.some(b => b.type === t.needs && b.done)) continue;
    const c = cost(t);
    if (!afford(c)) { reserve.gold += c.gold; reserve.wood += c.wood; reserve.mana += c.mana; break; }
    const builder = idle.length ? idle.pop() : workers.find(u => u.order.kind === 'idle');
    if (!builder) break;
    const spot = type === 'tower' ? frontSpot(w, side, citadel) : findSpot(w, side, type, citadel.x, citadel.z);
    if (!spot) continue;
    out.push({ kind: 'build', ids: [builder.id], type, x: spot.x, z: spot.z });
    for (const k of ['gold', 'wood', 'mana']) S[k] -= c[k];
    out.at(-1).refund = c;
    break;
  }
  // 남는 자원: 생산 건물을 더(병영·마구간·마법탑 돌아가며), 앞 땅에 감시탑
  const prod = blds.filter(b => b.t.trains && b.type !== 'citadel').length;
  if (S.gold > 450 && S.wood > 300 && S.pop < S.popCap - 8 && prod < 8 && w.time > 240 && !sites.length) {
    const cycle = ['barracks', 'stable', 'magetower', 'barracks', 'workshop', 'aerie'];
    const type = cycle.find(t => (counts[t] ?? 0) < 1 + Math.floor(prod / 3) && (!BUILDINGS[t].needs || blds.some(b => b.type === BUILDINGS[t].needs && b.done)));
    const builder = idle.length ? idle.pop() : null;
    const spot = type && builder ? findSpot(w, side, type, citadel.x, citadel.z) : null;
    if (spot && afford(cost(BUILDINGS[type]))) { const c = cost(BUILDINGS[type]); out.push({ kind: 'build', ids: [builder.id], type, x: spot.x, z: spot.z, refund: c }); for (const k of ['gold', 'wood', 'mana']) S[k] -= c[k]; }
  } else if (S.wood > 600 && S.gold > 200 && idle.length && (counts.tower ?? 0) < 2 + Math.floor(w.time / 300)) {
    const spot = frontSpot(w, side, citadel);
    if (spot) { const c = cost(BUILDINGS.tower); out.push({ kind: 'build', ids: [idle.pop().id], type: 'tower', x: spot.x, z: spot.z, refund: c }); for (const k of ['gold', 'wood', 'mana']) S[k] -= c[k]; }
  }
  // 고치기
  for (const b of blds) if (b.done && b.hp < b.maxHp * 0.6 && idle.length && !w.units.some(e => e.side !== side && Math.hypot(e.x - b.x, e.z - b.z) < 30)) out.push({ kind: 'assist', ids: [idle.pop().id], target: b.id });
  for (const u of idle) if (Math.hypot(u.x - citadel.x, u.z - citadel.z) > 40) out.push({ kind: 'move', ids: [u.id], x: citadel.x + 15, z: citadel.z + 15 });

  // ── 연구
  for (const b of blds) {
    if (!b.done || b.queue.length || !b.t.research) continue;
    for (const key of b.t.research) {
      if (S.research.has(key) || S.researching.has(key)) continue;
      if (w.time < 150) continue;
      const c = cost(RESEARCH[key]);
      if (afford(c)) { out.push({ kind: 'research', building: b.id, key }); for (const k of ['gold', 'wood', 'mana']) S[k] -= c[k]; out.at(-1).refund = c; }
    }
  }

  // ── 생산: 본 적 구성에 맞춰
  const foes = w.units.filter(u => u.side === enemy && !u.t.worker);
  const fv = { large: 0, heavy: 0, air: 0, ranged: 0, total: 1 };
  for (const u of foes) {
    const v = u.t.gold + u.t.mana + u.t.wood;
    fv.total += v;
    if (u.flying) fv.air += v; else if (u.t.armor === 'large') fv.large += v;
    if (u.t.armor === 'heavy') fv.heavy += v;
    if (u.t.range > 10) fv.ranged += v;
  }
  const mix = { ...BASE_MIX };
  mix.spear += 6 * fv.large / fv.total;
  mix.mage += 5 * fv.heavy / fv.total;
  mix.archer += 7 * fv.air / fv.total;
  mix.knight += 5 * fv.ranged / fv.total; mix.scout += 2 * fv.ranged / fv.total;
  if (w.time > 420) mix.catapult += 1;
  if (P === PERSONALITIES.tech) { mix.mage += 1; mix.griffon += 1; mix.dragon += 1; }
  if (P === PERSONALITIES.rush) { mix.sword += 1; mix.scout += 1; mix.knight += 1; }
  const made = {};
  for (const u of army) made[u.type] = (made[u.type] ?? 0) + 1;
  for (const b of blds) {
    if (!b.done || !b.t.trains || b.type === 'citadel' || b.queue.length >= 2) continue;
    const options = b.t.trains.filter(k => !UNITS[k].needs || S.research.has(UNITS[k].needs));
    if (!options.length) continue;
    const pick = options.reduce((a, k) => ((made[k] ?? 0) / mix[k] < (made[a] ?? 0) / mix[a] ? k : a));
    const c = cost(UNITS[pick]);
    if (!afford(c) || S.pop + UNITS[pick].pop > S.popCap) continue;
    out.push({ kind: 'train', building: b.id, unit: pick });
    for (const k of ['gold', 'wood', 'mana']) S[k] -= c[k];
    out.at(-1).refund = c;
    made[pick] = (made[pick] ?? 0) + 1;
  }
  for (const b of blds) if (b.t.trains && b.done && !b.rally) out.push({ kind: 'rally', building: b.id, x: citadel.x + (side === 0 ? 30 : -30), z: citadel.z + (side === 0 ? 30 : -30) });

  // ── 군대
  armyOrders(w, side, P, st, army, owned, out);
  // 미리 깎아 둔 자원을 돌려놓는다(명령이 실제로 낼 때 다시 깎인다)
  for (const c of out) if (c.refund) { for (const k of ['gold', 'wood', 'mana']) S[k] += c.refund[k]; delete c.refund; }
  return out;
}

function armyOrders(w, side, P, st, army, owned, out) {
  const map = w.map, enemy = 1 - side;
  // 기습조: 빠른 것 몇(정찰 기병·그리폰)
  for (const id of [...st.raiders]) { const u = w.byId.get(id); if (!u || !u.alive) st.raiders.delete(id); }
  if (w.time > P.raid) for (const u of army) if ((u.type === 'scout' || u.type === 'griffon') && st.raiders.size < 6 && !st.raiders.has(u.id) && army.length > 14) st.raiders.add(u.id);
  const main = army.filter(u => !st.raiders.has(u.id));
  const mainPower = main.reduce((s, u) => s + power(u), 0);
  const center = centroid(main);

  // 막기: 우리 땅에 들어온 적
  let threat = null, tp = 0;
  for (const u of w.units) {
    if (u.side !== enemy || u.t.worker) continue;
    const g = map.regionAt(u.x, u.z);
    if (g >= 0 && w.regions[g].owner === side) { tp += power(u); if (!threat || Math.hypot(u.x - center.x, u.z - center.z) < Math.hypot(threat.x - center.x, threat.z - center.z)) threat = u; }
  }
  if (threat && tp > mainPower * 0.15 && main.length) {
    if (w.time - st.lastDefend > 3) { st.lastDefend = w.time; out.push({ kind: 'amove', ids: main.map(u => u.id), x: threat.x, z: threat.z }); }
    st.target = -1;
  } else if (main.length) {
    // 목표 지역: 이웃한 중립·적 지역 중 값/거리/지키는 힘
    const cur = st.target >= 0 ? w.regions[st.target] : null;
    if (cur && cur.owner === side) st.target = -1;
    if (st.target >= 0 && w.time - st.targetSince > 150) st.target = -1;   // 너무 오래 걸리면 다른 곳
    if (st.target < 0) {
      let best = -1, bs = -Infinity;
      map.regions.forEach((rg, g) => {
        const rs = w.regions[g];
        if (rs.owner === side) return;
        if (rs.owner < 0 && !rg.neighbors.some(k => w.regions[k].owner === side)) return;
        if (rs.owner === enemy && !rg.neighbors.some(k => w.regions[k].owner === side)) return;
        const guard = guardPower(w, side, rg);
        if (guard * P.attackRatio > mainPower) return;
        const value = rg.altar ? 4 : rg.village ? 3 : rg.fort ? 2.5 : rg.home >= 0 ? 6 : 1.5 + rg.deposits.length * 0.3;
        const d = Math.hypot(rg.x - center.x, rg.z - center.z);
        const s = value * 100 / (d + 80) - guard / Math.max(1, mainPower) * 2 + (rs.owner === enemy ? 0.5 : 0);
        if (s > bs) { bs = s; best = g; }
      });
      if (best >= 0) { st.target = best; st.targetSince = w.time; }
    }
    if (st.target >= 0) {
      const rg = map.regions[st.target];
      const far = main.filter(u => Math.hypot(u.x - rg.x, u.z - rg.z) > 14 && (u.order.kind === 'idle' || Math.hypot((u.order.cx ?? u.order.x ?? 0) - rg.x, (u.order.cz ?? u.order.z ?? 0) - rg.z) > 5));
      if (far.length) out.push({ kind: 'amove', ids: far.map(u => u.id), x: rg.x, z: rg.z });
    } else {
      // 할 일 없으면 앞 지역에 모인다
      const front = owned.reduce((a, rg) => (!a || dEnemy(w, rg, enemy) < dEnemy(w, a, enemy) ? rg : a), null);
      if (front) { const loose = main.filter(u => u.order.kind === 'idle' && Math.hypot(u.x - front.x, u.z - front.z) > 25); if (loose.length) out.push({ kind: 'amove', ids: loose.map(u => u.id), x: front.x, z: front.z }); }
    }
  }
  // 기습조: 적 채굴기가 있고 지키는 힘이 약한 적 지역의 깃발(깎으면 채굴기가 무너진다)
  const raiders = [...st.raiders].map(id => w.byId.get(id));
  if (raiders.length >= 3) {
    const rt = st.raidTarget >= 0 ? w.regions[st.raidTarget] : null;
    if (!rt || rt.owner !== enemy) {
      let best = -1, bs = -Infinity;
      const rp = raiders.reduce((s, u) => s + power(u), 0), c = centroid(raiders);
      map.regions.forEach((rg, g) => {
        if (w.regions[g].owner !== enemy || rg.home >= 0) return;
        const mines = w.buildings.filter(b => b.alive && b.side === enemy && b.deposit >= 0 && map.deposits[b.deposit].region === g).length;
        const guard = guardPower(w, side, rg);
        if (guard > rp * 0.8 || mines === 0) return;
        const s = mines * 3 - Math.hypot(rg.x - c.x, rg.z - c.z) / 60 - guard / Math.max(1, rp);
        if (s > bs) { bs = s; best = g; }
      });
      st.raidTarget = best;
    }
    if (st.raidTarget >= 0) {
      const rg = map.regions[st.raidTarget];
      const go = raiders.filter(u => u.order.kind === 'idle' || u.order.cx !== rg.x);
      if (go.length) out.push({ kind: 'amove', ids: go.map(u => u.id), x: rg.x, z: rg.z });
    } else { const go = raiders.filter(u => u.order.kind === 'idle'); if (go.length && center.n) out.push({ kind: 'amove', ids: go.map(u => u.id), x: center.x, z: center.z }); }
  }
}

function guardPower(w, side, rg) {
  let p = 0;
  for (const u of w.units) if (u.side !== side && !u.t.worker && Math.hypot(u.x - rg.x, u.z - rg.z) < 60) p += power(u);
  for (const b of w.buildings) if (b.side !== side && b.t.shoot && Math.hypot(b.x - rg.x, b.z - rg.z) < 50) p += power(b);
  return p;
}
const dEnemy = (w, rg, enemy) => Math.hypot(rg.x - w.map.homes[enemy].x, rg.z - w.map.homes[enemy].z);
function centroid(us) {
  let x = 0, z = 0;
  for (const u of us) { x += u.x; z += u.z; }
  return us.length ? { x: x / us.length, z: z / us.length, n: us.length } : { x: 0, z: 0, n: 0 };
}
function nearestIdx(us, x, z) {
  let bi = 0, bd = Infinity;
  us.forEach((u, i) => { const d = (u.x - x) ** 2 + (u.z - z) ** 2; if (d < bd) { bd = d; bi = i; } });
  return bi;
}
export function findSpot(w, side, type, cx, cz) {
  const toMid = Math.atan2(w.map.size / 2 - cz, w.map.size / 2 - cx);
  for (let rad = 24; rad <= 90; rad += 8)
    for (let k = 0; k < 16; k++) {
      const a = toMid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.39 + Math.PI * 0.15;
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      if (canPlace(w, side, type, x, z).ok) return { x, z };
    }
  return null;
}
function frontSpot(w, side, citadel) {
  const enemyHome = w.map.homes[1 - side];
  const owned = w.map.regions.filter((rg, g) => w.regions[g].owner === side && rg.home < 0);
  if (!owned.length) return null;
  const front = owned.reduce((a, rg) => (Math.hypot(rg.x - enemyHome.x, rg.z - enemyHome.z) < Math.hypot(a.x - enemyHome.x, a.z - enemyHome.z) ? rg : a));
  return findSpot(w, side, 'tower', front.x, front.z) ?? findSpot(w, side, 'tower', citadel.x, citadel.z);
}
