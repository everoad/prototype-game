// 한 판의 상태와 한 틱. 화면 없이도(Node) 돈다. 명령은 applyCommand 하나로만 들어온다.
import { RULES, UNITS, BUILDINGS, RESEARCH, RES, RES_NAME } from './rules.js';
import { createMap, CAMPS } from './map.js';
import { createPaths, stampBuilding, nearestOpen, passable } from './path.js';
import { updateUnits, updateProjectiles, setOrder } from './units.js';
import { updateBuildings } from './buildings.js';

export function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createWorld({ seed = 1, rules = RULES } = {}) {
  const map = createMap();
  const w = {
    rules, map, seed, rng: makeRng(seed), time: 0, tick: 0, acc: 0, nextId: 1,
    paths: createPaths(map),
    units: [], buildings: [], projectiles: [], events: [],
    byId: new Map(),
    sides: [0, 1, 2].map(s => ({ side: s, gold: rules.start.gold, wood: rules.start.wood, mana: rules.start.mana, pop: 0, popCap: rules.pop.base, points: rules.victory.points,
      research: new Set(), researching: new Set(), rate: { gold: 0, wood: 0, mana: 0 }, alerts: [], seen: new Map(),
      stats: { trained: {}, lostValue: 0, killedValue: 0, kills: {} } })),
    regions: map.regions.map(g => ({ owner: g.home, hold: g.home >= 0 ? 1 : 0, prog: 0, capturer: -1, connected: [g.home === 0, g.home === 1], contested: false, count: [0, 0, 0], fort: -1 })),
    regionsDirty: true,
    vision: [0, 1].map(() => ({ visible: new Uint8Array((map.size / rules.map.visionCell) ** 2), explored: new Uint8Array((map.size / rules.map.visionCell) ** 2) })),
    visionAt: -1,
    controllers: [null, null], thinkAt: [0.5, 1.0],
    result: null, firstContact: -1,
    grid: null,
  };
  const vc = map.size / rules.map.visionCell;
  w.vision.cols = vc;
  // 성채와 일꾼
  for (const side of [0, 1]) {
    const home = map.homes[side];
    const cx = home.x + (side === 0 ? 4 : -4), cz = home.z + (side === 0 ? 4 : -4);
    const b = addBuilding(w, side, 'citadel', cx, cz, true);
    b.rally = null;
    for (let k = 0; k < rules.start.workers; k++) {
      const fwd = side === 0 ? Math.PI / 4 : -3 * Math.PI / 4, a = fwd + (k % 2 ? 1 : -1) * (1.2 + Math.floor(k / 2) * 0.35);   // 성채 옆(카메라에서 안 가리게)
      spawnUnit(w, side, 'worker', cx + Math.cos(a) * 18, cz + Math.sin(a) * 18);
    }
  }
  // 요새(처음엔 중립이 지킨다)와 괴물 소굴(편 2)
  map.regions.forEach((rg, g) => {
    if (rg.fort) { const f = addBuilding(w, 2, 'fort', rg.x, rg.z, true); f.region = g; w.regions[g].fort = f.id; }
    const camp = CAMPS[rg.camp];
    if (!camp) return;
    let k = 0;
    const ring = rg.fort ? 12 : 4;
    for (const [type, n] of Object.entries(camp)) for (let m = 0; m < n; m++, k++) {
      const a = k * 2.399, rr = ring + 2 + (k % 3) * 2.2;
      const u = spawnUnit(w, 2, type, rg.x + Math.cos(a) * rr, rg.z + Math.sin(a) * rr);
      u.camp = g;
    }
  });
  updateRegions(w, 0);
  updateVision(w);
  return w;
}

export function spawnUnit(w, side, type, x, z) {
  const t = UNITS[type];
  const u = { id: w.nextId++, ent: 'unit', side, type, t, x, z, px: x, pz: z, vx: 0, vz: 0, hp: t.hp, maxHp: t.hp, facing: side === 0 ? Math.PI / 4 : -3 * Math.PI / 4,
    order: { kind: 'idle' }, queue: [], target: -1, cd: 0, runDist: 0, homeX: x, homeZ: z, returning: false, thinkIn: (w.nextId % 4) * 0.1,
    lastAttack: -9, lastHit: -9, stuckT: 0, bestD: Infinity, alive: true, flying: !!t.fly };
  w.units.push(u);
  w.byId.set(u.id, u);
  w.sides[side].pop += t.pop;
  return u;
}

export function addBuilding(w, side, type, x, z, done = false, deposit = -1) {
  const t = BUILDINGS[type];
  const b = { id: w.nextId++, ent: 'building', side, type, t, x, z, r: t.r, hp: done ? t.hp : Math.max(1, t.hp * 0.1), maxHp: t.hp, done, progress: done ? 1 : 0,
    builders: 0, deposit, queue: [], rally: null, cd: 0, target: -1, thinkIn: 0, alive: true, lastHit: -9 };
  w.buildings.push(b);
  w.byId.set(b.id, b);
  stampBuilding(w.paths, x, z, t.r, 1);
  if (deposit >= 0) w.map.deposits[deposit].building = b.id;
  // 밑에 깔린 유닛은 밀어낸다
  for (const u of w.units) if (!u.flying && (u.x - x) ** 2 + (u.z - z) ** 2 < (t.r + u.t.r) ** 2) pushOut(w, u);
  return b;
}

export function pushOut(w, u) {
  const i = nearestOpen(w.paths, w.map.cellOf(u.x, u.z));
  if (i < 0) return;
  u.x = ((i % w.map.cols) + 0.5) * w.map.cell; u.z = (((i / w.map.cols) | 0) + 0.5) * w.map.cell;
}

// 놓을 수 있나. 금광·마나 샘은 비어 있는 자원 자리 위(가장 가까운 것, 10 m 안). 돌려주기: { ok, x, z, deposit, why }
export function canPlace(w, side, type, x, z) {
  const t = BUILDINGS[type], map = w.map;
  if (!t || type === 'citadel') return { ok: false, why: '지을 수 없는 건물' };
  if (t.needs && !w.buildings.some(b => b.alive && b.side === side && b.type === t.needs && b.done)) return { ok: false, why: `${BUILDINGS[t.needs].name}이(가) 먼저 있어야 합니다` };
  let deposit = -1;
  if (t.onDeposit) {
    let bd = 10 * 10;
    for (const d of map.deposits) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (d.kind === t.onDeposit && dd < bd) { bd = dd; deposit = d.id; }
    }
    if (deposit < 0) return { ok: false, why: t.onDeposit === 'gold' ? '금 자리 위에 지어야 합니다' : '마나 자리 위에 지어야 합니다' };
    const d = map.deposits[deposit];
    if (d.building >= 0) return { ok: false, why: '이미 지은 자리', x: d.x, z: d.z };
    x = d.x; z = d.z;
  }
  const g = map.regionAt(x, z);
  if (g < 0 || w.regions[g].owner !== side) return { ok: false, why: '우리 땅에만 지을 수 있습니다', x, z, deposit };
  if (x < t.r + 2 || z < t.r + 2 || x > map.size - t.r - 2 || z > map.size - t.r - 2) return { ok: false, why: '지도 끝', x, z, deposit };
  for (const b of w.buildings) if (b.alive && (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + t.r + 1.5) ** 2) return { ok: false, why: '다른 건물과 겹칩니다', x, z, deposit };
  if (!t.onDeposit) {
    for (const d of map.deposits) if ((d.x - x) ** 2 + (d.z - z) ** 2 < (t.r + 5) ** 2) return { ok: false, why: '자원 자리를 막습니다', x, z, deposit };
    for (const rg of map.regions) if ((rg.x - x) ** 2 + (rg.z - z) ** 2 < (t.r + 6) ** 2) return { ok: false, why: '깃발 자리를 막습니다', x, z, deposit };
  }
  const c0 = Math.floor((x - t.r) / map.cell), c1 = Math.floor((x + t.r) / map.cell), r0 = Math.floor((z - t.r) / map.cell), r1 = Math.floor((z + t.r) / map.cell);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const cx = (c + 0.5) * map.cell, cz = (r + 0.5) * map.cell;
    if ((cx - x) ** 2 + (cz - z) ** 2 > t.r * t.r) continue;
    if (!passable(w.paths, r * map.cols + c)) return { ok: false, why: '막힌 땅', x, z, deposit };
  }
  return { ok: true, x, z, deposit };
}

export const cost = t => ({ gold: t.gold ?? 0, wood: t.wood ?? 0, mana: t.mana ?? 0 });
export function canPay(side, c) { return RES.every(k => side[k] >= c[k]); }
export function pay(side, c, sign = 1) { for (const k of RES) side[k] -= sign * c[k]; }
export const lack = (side, c) => { const k = RES.find(r => side[r] < c[r]); return k ? `${RES_NAME[k]}이(가) 모자랍니다` : ''; };

export function alert(w, side, kind, text, x, z) {
  const a = w.sides[side].alerts;
  const last = a.findLast?.(e => e.kind === kind) ?? null;
  if (last && w.time - last.time < (kind === 'attacked' ? 12 : 1.5) && (x === undefined || Math.hypot(last.x - x, last.z - z) < 150)) return;
  a.push({ kind, text, x, z, time: w.time });
  if (a.length > 40) a.shift();
}

// 명령 하나. 틀린 명령은 조용히 버리고 이유를 돌려준다(화면이 알림으로 보인다).
export function applyCommand(w, c) {
  if (w.result) return { ok: false, why: '끝난 판' };
  const S = w.sides[c.side];
  const mine = ids => (ids ?? []).map(id => w.byId.get(id)).filter(e => e && e.alive && e.ent === 'unit' && e.side === c.side);
  switch (c.kind) {
    case 'move': case 'amove': case 'stop': case 'hold': case 'attack': case 'assist': {
      const us = mine(c.ids);
      if (!us.length) return { ok: false, why: '고른 유닛 없음' };
      if (c.kind === 'attack') {
        const tg = w.byId.get(c.target);
        if (!tg || !tg.alive) return { ok: false, why: '대상 없음' };
        for (const u of us) setOrder(w, u, tg.side === c.side ? (u.t.worker && tg.ent === 'building' ? { kind: tg.done ? 'repair' : 'build', target: tg.id } : { kind: 'move', x: tg.x, z: tg.z, cx: tg.x, cz: tg.z, n: us.length }) : u.t.dmg > 0 ? { kind: 'attack', target: tg.id } : { kind: 'move', x: tg.x, z: tg.z, cx: tg.x, cz: tg.z, n: us.length }, c.queue);
        return { ok: true };
      }
      if (c.kind === 'assist') {
        const b = w.byId.get(c.target);
        if (!b || !b.alive || b.ent !== 'building' || b.side !== c.side) return { ok: false, why: '대상 없음' };
        for (const u of us) if (u.t.worker) setOrder(w, u, { kind: b.done ? 'repair' : 'build', target: b.id }, c.queue);
        return { ok: true };
      }
      if (c.kind === 'stop' || c.kind === 'hold') { for (const u of us) setOrder(w, u, { kind: c.kind === 'hold' ? 'hold' : 'idle' }); return { ok: true }; }
      groupMove(w, us, c.kind, c.x, c.z, c.queue);
      return { ok: true };
    }
    case 'build': {
      const workers = mine(c.ids).filter(u => u.t.worker);
      if (!workers.length) return { ok: false, why: '일꾼을 골라야 합니다' };
      const t = BUILDINGS[c.type];
      const at = canPlace(w, c.side, c.type, c.x, c.z);
      if (!at.ok) return at;
      if (!canPay(S, cost(t))) return { ok: false, why: lack(S, cost(t)) };
      pay(S, cost(t));
      const b = addBuilding(w, c.side, c.type, at.x, at.z, false, at.deposit);
      const ws = c.allWorkers ? workers : [nearest(workers, at.x, at.z)];
      for (const u of ws) setOrder(w, u, { kind: 'build', target: b.id }, c.queue);
      return { ok: true, id: b.id };
    }
    case 'train': case 'research': {
      const b = w.byId.get(c.building);
      if (!b || !b.alive || b.side !== c.side || !b.done) return { ok: false, why: '건물이 아직 없습니다' };
      if (b.queue.length >= w.rules.queueMax) return { ok: false, why: '생산 줄이 가득 찼습니다' };
      if (c.kind === 'train') {
        const ut = UNITS[c.unit];
        if (!ut || !b.t.trains?.includes(c.unit)) return { ok: false, why: '여기서 못 뽑습니다' };
        if (ut.needs && !S.research.has(ut.needs)) return { ok: false, why: `${RESEARCH[ut.needs].name} 연구가 필요합니다` };
        if (!canPay(S, cost(ut))) return { ok: false, why: lack(S, cost(ut)) };
        pay(S, cost(ut));
        b.queue.push({ kind: 'unit', key: c.unit, left: ut.time, total: ut.time, started: false });
      } else {
        const r = RESEARCH[c.key];
        if (!r || !b.t.research?.includes(c.key)) return { ok: false, why: '여기서 못 합니다' };
        if (S.research.has(c.key) || S.researching.has(c.key)) return { ok: false, why: '이미 했거나 하는 중' };
        if (!canPay(S, cost(r))) return { ok: false, why: lack(S, cost(r)) };
        pay(S, cost(r));
        S.researching.add(c.key);
        b.queue.push({ kind: 'research', key: c.key, left: r.time, total: r.time, started: false });
      }
      return { ok: true };
    }
    case 'cancel': {
      const b = w.byId.get(c.building);
      if (!b || !b.alive || b.side !== c.side) return { ok: false };
      if (!b.done) { pay(S, cost(b.t), -1); killEntity(w, b, null); return { ok: true }; }   // 짓던 건물 취소
      const k = c.index ?? b.queue.length - 1, item = b.queue[k];
      if (!item) return { ok: false };
      b.queue.splice(k, 1);
      const t = item.kind === 'unit' ? UNITS[item.key] : RESEARCH[item.key];
      pay(S, cost(t), -1);
      if (item.kind === 'research') S.researching.delete(item.key);
      if (item.kind === 'unit' && item.started) S.pop -= UNITS[item.key].pop;
      return { ok: true };
    }
    case 'rally': {
      const b = w.byId.get(c.building);
      if (!b || !b.alive || b.side !== c.side) return { ok: false };
      b.rally = { x: c.x, z: c.z };
      return { ok: true };
    }
  }
  return { ok: false, why: '모르는 명령' };
}

const nearest = (us, x, z) => us.reduce((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2 <= (b.x - x) ** 2 + (b.z - z) ** 2 ? a : b));

// 여럿을 한 점으로: 서로의 자리를 줄여서 지킨다(진형 아님 — 한 점에 몰려 밀치지 않게).
export function groupMove(w, us, kind, x, z, queue = false) {
  let cx = 0, cz = 0;
  for (const u of us) { cx += u.x; cz += u.z; }
  cx /= us.length; cz /= us.length;
  const spread = Math.sqrt(us.length) * 2.4;
  let maxR = 0;
  for (const u of us) maxR = Math.max(maxR, Math.hypot(u.x - cx, u.z - cz));
  const k = maxR > spread ? spread / maxR : 1;
  for (const u of us) {
    let gx = x + (u.x - cx) * k, gz = z + (u.z - cz) * k;
    if (!u.flying && !passable(w.paths, w.map.cellOf(gx, gz))) { gx = x; gz = z; }
    setOrder(w, u, { kind, x: gx, z: gz, cx: x, cz: z, n: us.length }, queue);
  }
}

export function killEntity(w, e, killer) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  const S = w.sides[e.side];
  if (e.ent === 'unit') {
    S.pop -= e.t.pop;
    w.events.push({ kind: 'death', x: e.x, z: e.z, type: e.type, side: e.side, time: w.time, fly: e.flying });
  } else {
    stampBuilding(w.paths, e.x, e.z, e.r, -1);
    if (e.deposit >= 0) w.map.deposits[e.deposit].building = -1;
    for (const it of e.queue) {                                  // 줄에 있던 것은 돌려준다
      if (it.kind === 'research') S.researching.delete(it.key);
      if (it.kind === 'unit' && it.started) S.pop -= UNITS[it.key].pop;
    }
    w.events.push({ kind: 'collapse', x: e.x, z: e.z, r: e.r, type: e.type, side: e.side, time: w.time });
    if (e.type === 'citadel' && !w.result) w.result = { winner: 1 - e.side, reason: 'citadel', time: w.time };
    if (e.done) alert(w, e.side, 'lost', `${e.t.name}이(가) 무너졌습니다`, e.x, e.z);
  }
  if (killer && e.t.bounty && killer.side < 2) w.sides[killer.side].gold += e.t.bounty;
  if (killer) {
    const value = (e.t.gold ?? 0) + (e.t.mana ?? 0);
    w.sides[killer.side].stats.killedValue += value;
    S.stats.lostValue += value;
    const k = w.sides[killer.side].stats.kills;
    k[killer.type] = (k[killer.type] ?? 0) + value;
  }
}

// ─── 지역: 점령·끊김·승점 ───
export function updateRegions(w, dt) {
  const { map, rules } = w;
  for (const st of w.regions) { st.count[0] = 0; st.count[1] = 0; st.count[2] = 0; }
  for (const u of w.units) {
    if (!u.alive || u.t.worker) continue;
    const g = map.regionAt(u.x, u.z);
    if (g < 0) continue;
    const rg = map.regions[g], R = rg.fort ? rules.capture.fortRadius : rules.capture.radius;
    if ((u.x - rg.x) ** 2 + (u.z - rg.z) ** 2 < R * R) w.regions[g].count[u.side]++;
  }
  const citadelAlive = [0, 1].map(s => w.buildings.some(b => b.alive && b.type === 'citadel' && b.side === s));
  map.regions.forEach((rg, g) => {
    const st = w.regions[g], [a, b, m] = st.count;
    st.contested = (a > 0) + (b > 0) + (m > 0) > 1;
    if (dt <= 0 || st.contested || (a === 0 && b === 0)) return;
    const side = a > 0 ? 0 : 1, n = a + b;
    if (rg.home >= 0 && rg.home !== side && citadelAlive[rg.home]) return;   // 성채가 선 본진은 못 뺏는다
    const rate = Math.min(rules.capture.maxBoost, 1 + rules.capture.perExtraUnit * (n - 1)) / rules.capture.seconds * dt;
    if (st.owner === side) { st.hold = Math.min(1, st.hold + rate); return; }
    if (st.owner >= 0) {                                           // 적 땅: 먼저 중립으로
      st.hold -= rate;
      if (st.hold <= 0) {
        const lost = st.owner;
        st.owner = -1; st.hold = 0; st.prog = 0; st.capturer = -1;
        w.regionsDirty = true;
        const f = w.byId.get(st.fort);
        if (f) { f.side = 2; f.dormant = true; f.queue.length = 0; }   // 빈 요새는 쏘지 않는다
        for (const bd of w.buildings) if (bd.alive && bd.side === lost && bd.deposit >= 0 && map.deposits[bd.deposit].region === g) killEntity(w, bd, null);   // 그 땅의 채굴기는 무너진다
        alert(w, lost, 'region', '땅을 잃었습니다', rg.x, rg.z);
        w.events.push({ kind: 'flip', region: g, owner: -1, time: w.time });
      }
      return;
    }
    // 중립: 우리 땅과 이웃해야 잡는다
    if (!rg.neighbors.some(k => w.regions[k].owner === side)) return;
    if (st.capturer !== side) { st.prog -= rate; if (st.prog <= 0) { st.prog = 0; st.capturer = side; } return; }
    st.prog += rate;
    if (st.prog >= 1) {
      st.owner = side; st.hold = 1; st.prog = 0; st.capturer = -1;
      w.regionsDirty = true;
      const f = w.byId.get(st.fort);
      if (f) { f.side = side; f.dormant = false; f.hp = Math.max(f.hp, f.maxHp * rules.fort.regain); f.ruined = false; f.target = -1; }
      alert(w, side, 'gain', '땅을 얻었습니다', rg.x, rg.z);
      w.events.push({ kind: 'flip', region: g, owner: side, time: w.time });
    }
  });
  if (w.regionsDirty) {
    w.regionsDirty = false;
    for (const side of [0, 1]) {
      for (const st of w.regions) st.connected[side] = false;
      const home = map.homes[side].id;
      if (w.regions[home].owner !== side) continue;
      const stack = [home];
      w.regions[home].connected[side] = true;
      while (stack.length) {
        const g = stack.pop();
        for (const k of map.regions[g].neighbors) if (!w.regions[k].connected[side] && w.regions[k].owner === side) { w.regions[k].connected[side] = true; stack.push(k); }
      }
    }
  }
  // 승점: 제단을 더 쥔 편이 상대를 깎는다
  if (dt > 0) {
    const alt = [0, 0];
    map.regions.forEach((rg, g) => { if (rg.altar && w.regions[g].owner >= 0) alt[w.regions[g].owner]++; });
    const d = alt[0] - alt[1];
    if (d !== 0) {
      const loser = d > 0 ? 1 : 0;
      w.sides[loser].points = Math.max(0, w.sides[loser].points - Math.abs(d) * rules.victory.drainPerAltar * dt);
      if (w.sides[loser].points <= 0 && !w.result) w.result = { winner: 1 - loser, reason: 'points', time: w.time };
    }
  }
}

// ─── 수입 ───
function updateEconomy(w, dt) {
  const { rules, map } = w;
  for (const S of w.sides) { for (const k of RES) S.rate[k] = 0; S.popCap = 0; }
  for (const b of w.buildings) {
    if (!b.alive || !b.done || b.side > 1) continue;
    const S = w.sides[b.side];
    if (b.type === 'citadel') { for (const k of RES) S.rate[k] += rules.income[k]; S.popCap += rules.pop.base; }
    else if (b.t.income) {
      const g = map.deposits[b.deposit].region;
      if (w.regions[g].owner === b.side && w.regions[g].connected[b.side]) for (const k of RES) S.rate[k] += b.t.income[k] ?? 0;
    }
  }
  map.regions.forEach((rg, g) => { const st = w.regions[g]; if (rg.village && st.owner >= 0 && st.connected[st.owner]) w.sides[st.owner].popCap += rules.pop.perVillage; });
  for (const S of w.sides) { S.popCap = Math.min(rules.pop.max, S.popCap); for (const k of RES) S[k] += S.rate[k] * dt; }
}

// ─── 시야 ───
export function updateVision(w) {
  const vcell = w.rules.map.visionCell, cols = w.vision.cols;
  for (const side of [0, 1]) {
    const v = w.vision[side];
    v.visible.fill(0);
    const stamp = (x, z, r) => {
      const c0 = Math.max(0, Math.floor((x - r) / vcell)), c1 = Math.min(cols - 1, Math.floor((x + r) / vcell));
      const r0 = Math.max(0, Math.floor((z - r) / vcell)), r1 = Math.min(cols - 1, Math.floor((z + r) / vcell));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const cx = (cc + 0.5) * vcell, cz = (rr + 0.5) * vcell;
        if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) { v.visible[rr * cols + cc] = 1; v.explored[rr * cols + cc] = 1; }
      }
    };
    for (const u of w.units) if (u.alive && u.side === side) stamp(u.x, u.z, u.t.sight);
    for (const b of w.buildings) if (b.alive && b.side === side) stamp(b.x, b.z, b.t.sight);
    // 본 적 건물 기억
    const seen = w.sides[side].seen;
    for (const b of w.buildings) if (b.alive && b.side !== side && canSee(w, side, b.x, b.z)) seen.set(b.id, { id: b.id, type: b.type, x: b.x, z: b.z, r: b.r, done: b.done, progress: b.progress, side: b.side });
    for (const [id, m] of seen) { const b = w.byId.get(id); if ((!b || !b.alive) && canSee(w, side, m.x, m.z)) seen.delete(id); }
  }
}
export function canSee(w, side, x, z) {
  const vcell = w.rules.map.visionCell, cols = w.vision.cols;
  const c = Math.floor(x / vcell), r = Math.floor(z / vcell);
  if (c < 0 || r < 0 || c >= cols || r >= cols) return false;
  return w.vision[side].visible[r * cols + c] === 1;
}

// ─── 한 틱 ───
export function step(w) {
  if (w.result) return;
  const dt = w.rules.dt;
  for (const side of [0, 1]) {
    const ctl = w.controllers[side];
    if (ctl && w.time >= w.thinkAt[side]) {
      w.thinkAt[side] = w.time + (ctl.every ?? 1);
      for (const c of ctl.think(w, side) ?? []) applyCommand(w, { ...c, side });
    }
  }
  w.paths.budget = 6;                                // 틱마다 새로 만드는 흐름장 수
  updateEconomy(w, dt);
  updateUnits(w, dt);
  updateBuildings(w, dt);
  updateProjectiles(w, dt);
  // 죽은 것 치우기
  if (w.units.some(u => !u.alive)) { for (const u of w.units) if (!u.alive) w.byId.delete(u.id); w.units = w.units.filter(u => u.alive); }
  if (w.buildings.some(b => !b.alive)) { for (const b of w.buildings) if (!b.alive) w.byId.delete(b.id); w.buildings = w.buildings.filter(b => b.alive); }
  updateRegions(w, dt);
  w.time += dt; w.tick++;
  if (w.time - w.visionAt >= w.rules.vision.every) { w.visionAt = w.time; updateVision(w); }
  if (w.events.length > 400) w.events.splice(0, w.events.length - 300);
}

// 화면용: 실제 흐른 시간만큼 틱을 돈다(한 번에 maxSteps까지).
export function advance(w, seconds, maxSteps = 20) {
  w.acc += seconds;
  let n = 0;
  while (w.acc >= w.rules.dt && n < maxSteps) { step(w); w.acc -= w.rules.dt; n++; }
  if (n >= maxSteps) w.acc = 0;
}
