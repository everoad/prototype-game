// 장수와 별동대(설계서 §4). 장수는 깃발이다 — 싸우지도 맞지도 않는다.
// · 별동대: 붙은 병사(지휘 한도 무게까지)는 장수 둘레를 따르고, 장수가 서면 둘레 50 m의 적과 싸운다.
// · 기운: 가까운 우리 병사 무게 500에 공격 ×1.2. 1초마다 다시 고르고, 돌격 15초 동안은 고정.
// · 돌격(공격 ×1.3·빠르기 ×1.3)·버텨라(받는 피해 ×0.7·물러나지 않음) 15초, 다시 쓰기까지 commandCooldown초.
// · 패주: 60 m 안 적 무게 ≥ 20 × 규모이고 우리의 2배 넘게 5초, 또는 우리 무게 20 × 규모 미만으로 적 거점 100 m 안에 5초
//   → 60초 못 쓰고 본진으로 달아남, 사기 −6, 별동대는 가장 가까운 구역 병사가 된다.
import { STATE, GOAL, forEachNear, hash01 } from './soldiers.js';
import { setGoal } from './world.js';
import { applyMoraleEvent } from './morale.js';
import { retargetGathering } from './groups.js';
import { arrowOf } from './production.js';
import { computeField, fieldAim, fieldDir } from './flowfield.js';
import { seenByStructures } from './vision.js';

export const BUFF = { AURA: 1, CHARGE: 2, HOLD: 4 };
const AURA_RADIUS = 120;      // 기운 받을 병사를 찾는 반경 m
const SPACE_PER_SOLDIER = 2;  // 별동대 둘레 원의 넓이 m² / 명
const FIGHT_REACH = 10;       // 장수가 서 있을 때 별동대가 싸우는 범위 = 어그로 + 이만큼(장수에서) m
const MAX_PATH = 20;

const fail = reason => ({ ok: false, reason });

export function addGeneral(w, side, x, z, id) {
  const g = {
    id, side, x, z, path: [], attached: new Set(), aura: new Set(),
    chargeUntil: -1e9, holdUntil: -1e9, chargeReadyAt: 0, holdReadyAt: 0,
    routedUntil: -1e9, routeTimer: 0, loneSeenTimer: 0, auraAt: -1e9, index: w.generals.length,
  };
  w.generals.push(g);
  w.sides[side].generals.push(g);
  return g;
}

const weightOf = (w, i) => w.rules.units[w.soldiers.side[i]][w.soldiers.type[i]].weight;
export const generalById = (w, id) => w.generals.find(g => g.id === id);
export const isRouted = (w, g) => w.time < g.routedUntil;

// 장수가 우리 거점이나 우리 구역 선분에서 assembleRange(150 m) 안인가 — 흐름이 장수에게 모이는 조건(§3.4).
export function generalInReach(w, g) {
  const R = w.rules.general.assembleRange;
  for (const st of w.strongholds) if (st.owner === g.side && st.kind !== 'vp' && Math.hypot(st.x - g.x, st.z - g.z) <= R) return true;
  for (const sec of w.map.sectors) {
    if (sec.side !== g.side) continue;
    const px = Math.max(sec.x0, Math.min(sec.x1, g.x));
    if (Math.hypot(px - g.x, sec.z - g.z) <= R) return true;
  }
  return false;
}

// 가장 가까운 우리 구역(선분까지 거리).
function nearestSector(w, side, x, z) {
  let best = null, bd = Infinity;
  for (const sec of w.map.sectors) {
    if (sec.side !== side) continue;
    const px = Math.max(sec.x0, Math.min(sec.x1, x)), d = Math.hypot(px - x, sec.z - z);
    if (d < bd) { bd = d; best = sec; }
  }
  return best;
}

function attachOne(w, g, i) {
  const s = w.soldiers;
  if (s.general[i] >= 0 && s.general[i] !== g.index) w.generals[s.general[i]].attached.delete(i);
  s.group[i] = -1; s.wedge[i] = 0; s.returnTo[i] = -1; s.target[i] = -1; s.rtarget[i] = -1; s.hasPursuit[i] = 0;
  s.state[i] = STATE.ATTACHED; s.goalKind[i] = GOAL.GENERAL; s.goalId[i] = g.index; s.general[i] = g.index;
  g.attached.add(i);
}

const attachedWeight = (w, g) => { let sum = 0; for (const i of g.attached) sum += weightOf(w, i); return sum; };

// 병사들을 장수에게 붙인다: 장수에게 가까운 순으로 지휘 한도를 넘지 않을 때까지. 붙인 수를 돌려준다.
export function attachIds(w, g, ids, typeFilter = null) {
  const s = w.soldiers, lim = w.rules.general.limit;
  let weight = attachedWeight(w, g), n = 0;
  const cand = ids.filter(i => s.alive[i] && s.side[i] === g.side && s.general[i] !== g.index && s.state[i] !== STATE.ROUT && s.state[i] !== STATE.FLEE
    && (!typeFilter || typeFilter.includes(s.type[i])));
  const d2 = i => (s.x[i] - g.x) ** 2 + (s.z[i] - g.z) ** 2;
  cand.sort((a, b) => d2(a) - d2(b));
  for (const i of cand) {
    const wt = weightOf(w, i);
    if (weight + wt > lim + 1e-9) continue;
    attachOne(w, g, i);
    weight += wt; n++;
  }
  return n;
}

// 화살표로 장수에게 온 병사(setGoal 'general'): 한도까지 붙이고, 넘치면 가장 가까운 구역으로.
export function joinGeneral(w, ids, id) {
  const g = generalById(w, id), s = w.soldiers;
  if (g && !isRouted(w, g)) attachIds(w, g, ids);
  const left = ids.filter(i => s.alive[i] && (!g || s.general[i] !== g.index));
  for (const i of left) { const sec = nearestSector(w, s.side[i], s.x[i], s.z[i]); if (sec) setGoal(w, [i], { kind: 'sector', id: sec.id }); }
}

// 별동대를 풀어 가장 가까운 구역 병사로.
function releaseAttached(w, g) {
  const s = w.soldiers;
  for (const i of g.attached) {
    if (!s.alive[i] || s.general[i] !== g.index) continue;
    s.general[i] = -1; s.state[i] = STATE.MARCH; s.target[i] = -1;
    const sec = nearestSector(w, g.side, s.x[i], s.z[i]);
    if (sec) setGoal(w, [i], { kind: 'sector', id: sec.id });
    else { s.goalKind[i] = GOAL.POINT; s.goalId[i] = -1; s.goalX[i] = s.x[i]; s.goalZ[i] = s.z[i]; }
  }
  g.attached.clear();
}

// 명령: generalMove{path} · charge · hold · attach{ids, typeFilter} · dissolve.
export function generalOrder(w, o) {
  const g = generalById(w, o.general);
  if (!g || g.side !== o.side) return fail('우리 장수가 아니다');
  if (isRouted(w, g)) return fail(`패주 중 (${Math.ceil(g.routedUntil - w.time)}초)`);
  const r = w.rules.general;
  switch (o.kind) {
    case 'generalMove': {
      const path = (o.path ?? []).slice(0, MAX_PATH).map(p => ({ x: Math.max(0, Math.min(w.map.width, p.x)), z: Math.max(0, Math.min(w.map.depth, p.z)) }));
      if (!path.length) return fail('길이 없다');
      g.path = path;
      return { ok: true };
    }
    case 'charge':
      if (w.time < g.chargeReadyAt) return fail(`돌격은 ${Math.ceil(g.chargeReadyAt - w.time)}초 뒤`);
      g.aura = new Set(pickAura(w, g));
      g.auraAt = w.time;
      g.chargeUntil = w.time + r.chargeSeconds;
      g.chargeReadyAt = w.time + r.cooldown;
      w.events.push({ kind: 'charge', side: g.side, general: g.id });
      return { ok: true };
    case 'hold':
      if (w.time < g.holdReadyAt) return fail(`버텨라는 ${Math.ceil(g.holdReadyAt - w.time)}초 뒤`);
      g.holdUntil = w.time + r.holdSeconds;
      g.holdReadyAt = w.time + r.cooldown;
      w.events.push({ kind: 'hold', side: g.side, general: g.id });
      return { ok: true };
    case 'attach': {
      const n = attachIds(w, g, o.ids ?? [], o.typeFilter ?? null);
      return n ? { ok: true, count: n } : fail(attachedWeight(w, g) >= r.limit - 1.6 ? '지휘 한도가 찼다' : '붙일 병사가 없다');
    }
    case 'dissolve':
      if (!g.attached.size) return fail('별동대가 없다');
      releaseAttached(w, g);
      return { ok: true };
    default: return fail(`모르는 명령 ${o.kind}`);
  }
}

// 기운 받을 병사: 장수에게 가까운 순으로 무게가 지휘 한도를 넘지 않을 때까지(우리 편, 달아나지 않는 병사).
export function pickAura(w, g) {
  const s = w.soldiers, R2 = AURA_RADIUS * AURA_RADIUS, list = [];
  forEachNear(s, g.x, g.z, AURA_RADIUS, j => {
    if (!s.alive[j] || s.side[j] !== g.side || s.state[j] === STATE.ROUT) return;
    const d2 = (s.x[j] - g.x) ** 2 + (s.z[j] - g.z) ** 2;
    if (d2 <= R2) list.push([d2, j]);
  });
  list.sort((a, b) => a[0] - b[0]);
  const out = [], lim = w.rules.general.limit;
  let weight = 0;
  for (const [, j] of list) {
    const wt = weightOf(w, j);
    if (weight + wt > lim + 1e-9) continue;
    out.push(j); weight += wt;
  }
  return out;
}

function rout(w, g) {
  g.routedUntil = w.time + w.rules.general.routedSeconds;
  g.routeTimer = 0; g.loneSeenTimer = 0; g.path = [];
  g.chargeUntil = -1e9; g.holdUntil = -1e9;
  releaseAttached(w, g);
  g.aura = new Set();
  applyMoraleEvent(w, g.side, 'generalRouted', g.id);
  w.events.push({ kind: 'generalRouted', side: g.side, general: g.id });
}

// 한 틱: 장수 걷기·패주 판정·별동대 자리·기운 고르기·버프 표시·장수 화살표 다시 보기.
export function stepGenerals(w) {
  if (!w.generals.length) return;
  const s = w.soldiers, r = w.rules, gr = r.general, dt = r.dt;
  for (const g of w.generals) {
    for (const i of g.attached) if (!s.alive[i] || s.general[i] !== g.index) g.attached.delete(i);
    // 걷기: 별동대가 있으면 가장 느린 병종의 0.9배(별동대가 처지지 않게), 패주 중이면 본진으로
    let speed = gr.speed;
    for (const i of g.attached) speed = Math.min(speed, r.units[s.side[i]][s.type[i]].speed * 0.9);
    if (isRouted(w, g)) {
      const hq = w.strongholds.find(st => st.kind === 'hq' && st.original === g.side);
      g.path = hq ? [{ x: hq.x, z: hq.z }] : [];
      speed = gr.speed;
    }
    let step = speed * dt;
    while (g.path.length && step > 1e-9) {
      const p = g.path[0];
      if (g.fieldFor !== p) { g.fieldFor = p; g.field = clearLine(w.map, g.x, g.z, p.x, p.z) ? null : computeField(w.map, [p]); }   // 물이 막으면 돌아간다
      let tx = p.x, tz = p.z;
      if (g.field && Math.hypot(p.x - g.x, p.z - g.z) > 25) { const a = fieldAim(g.field, w.map, g.x, g.z, 6); if (a) { tx = a.x; tz = a.z; } }
      const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
      if (tx === p.x && tz === p.z && d <= step) { g.x = p.x; g.z = p.z; step -= d; g.path.shift(); continue; }
      if (d > 1e-9) {                                                           // 물에는 들어가지 않는다(축으로 미끄러진다)
        const mv = Math.min(step, d), nx = g.x + dx / d * mv, nz = g.z + dz / d * mv;
        if (w.map.walkable(nx, nz)) { g.x = nx; g.z = nz; }
        else if (w.map.walkable(nx, g.z)) g.x = nx;
        else if (w.map.walkable(g.x, nz)) g.z = nz;
        else if (g.field) { const f = fieldDir(g.field, w.map, g.x, g.z); g.x += f.dx * mv; g.z += f.dz * mv; }
      }
      step = 0;
    }
    if (isRouted(w, g)) { g.path = []; continue; }
    // 패주 판정
    let foe = 0, ours = 0;
    const R = gr.routRadius;
    forEachNear(s, g.x, g.z, R, j => {
      if (!s.alive[j] || (s.x[j] - g.x) ** 2 + (s.z[j] - g.z) ** 2 > R * R) return;
      if (s.side[j] === g.side) ours += weightOf(w, j); else foe += weightOf(w, j);
    });
    g.routeTimer = foe >= gr.routMinWeight && foe > gr.routRatio * ours ? g.routeTimer + dt : 0;
    const seen = ours < gr.loneWeight && seenByStructures(w, g.side, g.x, g.z);   // 적 거점·망루에 보임
    g.loneSeenTimer = seen ? g.loneSeenTimer + dt : 0;
    if (g.routeTimer >= gr.routSeconds - 1e-9 || g.loneSeenTimer >= gr.loneSeenSeconds - 1e-9) { rout(w, g); continue; }
    // 별동대 자리: 장수 둘레 원(병사 번호로 고정된 방향·거리)
    const rad = Math.sqrt(Math.max(1, g.attached.size) * SPACE_PER_SOLDIER / Math.PI);
    for (const i of g.attached) {
      const a = hash01(i * 5 + 1) * Math.PI * 2, k = Math.sqrt(hash01(i * 9 + 4));
      s.goalX[i] = g.x + Math.cos(a) * rad * k; s.goalZ[i] = g.z + Math.sin(a) * rad * k;
    }
    // 기운: 1초마다 다시 고른다(돌격 중엔 고정)
    if (w.time >= g.chargeUntil && w.time - g.auraAt >= gr.auraRecompute - 1e-9) { g.aura = new Set(pickAura(w, g)); g.auraAt = w.time; }
  }
  // 버프 표시(매 틱 새로): 기운·돌격·버텨라
  const buffed = w._buffed ?? (w._buffed = []);
  for (const i of buffed) s.buff[i] = 0;
  buffed.length = 0;
  for (const g of w.generals) {
    if (isRouted(w, g)) continue;
    const bits = BUFF.AURA | (w.time < g.chargeUntil ? BUFF.CHARGE : 0) | (w.time < g.holdUntil ? BUFF.HOLD : 0);
    for (const i of g.aura) {
      if (!s.alive[i] || s.side[i] !== g.side) continue;
      s.buff[i] |= bits;
      if (bits & BUFF.CHARGE) s.chargeUntil[i] = Math.max(s.chargeUntil[i], g.chargeUntil);   // 돌격: 빠르기 ×1.3(걸음에서)
      buffed.push(i);
    }
  }
  // 장수 화살표: 장수가 멀어지거나 돌아오면 모이는 쐐기의 목표도 바꾼다(1초마다)
  if (w.tick % 20 === 0) for (const side of [0, 1]) for (const [from, a] of w.sides[side].arrows) {
    if (a.kind !== 'general') continue;
    const k = w.strongholds.findIndex(st => st.id === from), st = w.strongholds[k];
    if (!st || st.owner !== side) continue;
    const eff = arrowOf(w, st);
    for (const grp of w.groups) if (grp.origin === k && grp.state === 'gather' && (grp.target.kind !== eff.kind || grp.target.id !== eff.id)) retargetGathering(w, grp, eff);
  }
}

// 붙은 병사(우선순위 1): 장수가 가는 중이면 따라가기만, 서 있으면 장수 둘레(어그로 + 10 m)의 적과 싸운다.
export function attachedThink(w, i, nearestEnemy, bestRangedTarget) {
  const s = w.soldiers, b = w.rules.behavior, g = w.generals[s.general[i]];
  if (!g) { s.target[i] = -1; return; }
  if (g.path.length) { s.target[i] = -1; s.rtarget[i] = -1; return; }
  const u = w.rules.units[s.side[i]][s.type[i]], reach = b.aggro + FIGHT_REACH;
  const near = j => (s.x[j] - g.x) ** 2 + (s.z[j] - g.z) ** 2 <= reach * reach;
  if (u.range > w.rules.melee.reach * 2) {
    if ((i + w.tick) % b.rangedScanEvery < 2) { const rt = bestRangedTarget(w, i, u.range + (s.elite[i] && s.type[i] === 1 ? w.rules.elite.rangeBonus : 0)); s.rtarget[i] = rt >= 0 && near(rt) ? rt : -1; }
    return;
  }
  const t = s.target[i];
  if (t >= 0 && s.alive[t] && s.side[t] !== s.side[i] && near(t)) return;
  s.target[i] = -1;
  if ((i + w.tick) % 8 > 1) return;
  const e = nearestEnemy(s, i, b.aggro);
  s.target[i] = e >= 0 && near(e) ? e : -1;
}

// 곧은 길이 걸을 수 있는 땅만 지나나(4 m마다 본다).
function clearLine(map, x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 4);
  for (let k = 1; k <= n; k++) if (!map.walkable(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n)) return false;
  return true;
}
