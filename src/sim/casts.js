// 금 명령(설계서 2026-11-09-flood-gold-orders-design.md §1): 병사를 고르지 않고 땅에 원을 찍어 건다.
// 플레이어와 AI가 같은 길로 건다(applyOrder → castOrder). 효과는 병사(와 쐐기)에 끝나는 시각으로 적고, 걸음·싸움·판단이 읽는다.
import { STATE, ORDER, spawn } from './soldiers.js';
import { rangeOf } from './combat.js';
import { INFANTRY } from './rules.js';
import { setGoal } from './world.js';
import { isPoint } from './map.js';

export const CASTS = ['march', 'drum', 'volley', 'levy'];   // 강행군·돌격 북·화살 비·긴급 징집 — 단추·숫자키 1~4 차례(정찰은 뺐다 — 사용자 2026-11-09: 직접 부대를 돌려 정찰하는 판단이 없어진다)

const fail = reason => ({ ok: false, reason });

// 지금 걸 수 있나: 판 끝 → 모르는 명령 → 금 → 다시 쓰기(명령마다·편마다).
export function canCast(w, side, order, strongholdId = null) {
  if (w.result) return fail('판이 끝났다');
  const def = w.rules.orders[order];
  if (!CASTS.includes(order) || !def) return fail('모르는 명령');
  if (w.sides[side].gold < def.cost - 1e-9) return fail('금이 모자라다');
  const ready = w.sides[side].cooldowns[order] ?? 0;
  if (w.time < ready - 1e-9) { const wait = ready - w.time; return { ok: false, reason: `다시 쓰기 ${Math.ceil(wait)}초`, wait }; }
  if (order === 'levy') {                                   // 긴급 징집은 지킬 때만: "공격받음" 경보가 뜬 우리 거점(금으로 병사를 사서 공격에 쓰지 않게)
    const st = w.strongholds.find(x => x.id === strongholdId);
    if (!st || isPoint(st) || st.owner !== side) return fail('우리 거점이 아니다');
    if (!w.sides[side].alerts.some(a => a.kind === 'attacked' && a.stronghold === st.id)) return fail('경보가 뜬 우리 거점에만');
  }
  return { ok: true };
}

const caught = (s, i) => s.state[i] !== STATE.FLEE && s.state[i] !== STATE.ROUT;   // 달아나는 병사는 안 걸린다(수비대는 걸린다)

// (x, z) 원에 걸릴 우리 병사. 강행군·돌격 북: 쐐기는 가운데가 원 안이면 통째로(쐐기 빠르기는 쐐기 단위라서),
// 쐐기 밖 병사는 하나하나. 격자는 쓰지 않는다(겨누기 미리 보기·시험이 걸음 사이에도 부른다).
// 화살 비: 원 가운데에서 (사거리 + 반지름) 안에 선 우리 원거리병(공성 빼고) — 행군 쐐기·명령받고 가는 병사는 안 걸린다(걸으며 쏘지 않는다).
export function castTargets(w, side, order, x, z) {
  const out = { ids: [], groups: [] };
  const s = w.soldiers, r = w.rules, R = r.orders.radius, R2 = R * R;
  if (order === 'volley') {
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || s.side[i] !== side || !caught(s, i)) continue;
      const u = r.units[side][s.type[i]];
      if (u.range <= r.melee.reach * 2 || u.siege || (s.group[i] >= 0 && s.state[i] === STATE.MARCH) || s.order[i] !== ORDER.NONE) continue;
      const reach = rangeOf(w, i) + R;
      if ((s.x[i] - x) ** 2 + (s.z[i] - z) ** 2 <= reach * reach) out.ids.push(i);
    }
    return out;
  }
  if (order !== 'march' && order !== 'drum') return out;
  for (const g of w.groups) {
    if (g.side !== side || (g.x - x) ** 2 + (g.z - z) ** 2 > R2) continue;
    out.groups.push(g);
    for (const i of g.members) if (s.alive[i] && s.group[i] === g.id && caught(s, i)) out.ids.push(i);
  }
  for (let i = 0; i < s.count; i++)
    if (s.alive[i] && s.side[i] === side && s.group[i] < 0 && caught(s, i) && (s.x[i] - x) ** 2 + (s.z[i] - z) ** 2 <= R2) out.ids.push(i);
  return out;
}

// 명령 걸기. o = { kind: 'cast', side, order, x, z } (긴급 징집은 { stronghold }).
export function castOrder(w, o) {
  const side = o.side, order = o.order;
  if (side !== 0 && side !== 1) return fail('모르는 편');
  const can = canCast(w, side, order, o.stronghold ?? null);
  if (!can.ok) return can;
  const R = w.rules.orders, def = R[order], s = w.soldiers;
  if (order === 'levy') return levy(w, side, o.stronghold, def);
  const x = o.x, z = o.z;
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0 || x > w.map.width || z > w.map.depth) return fail('판 밖');
  const until = w.time + def.seconds;
  const r = R.radius;
  let count = 0;
  if (order === 'march' || order === 'drum') {
    const t = castTargets(w, side, order, x, z), arr = order === 'march' ? s.marchUntil : s.drumUntil;
    for (const i of t.ids) arr[i] = Math.max(arr[i], until);   // 강행군 쐐기 빠르기는 멤버의 marchUntil에서 나온다(groups.js)
    count = t.ids.length;
  } else if (order === 'volley') {
    const t = castTargets(w, side, order, x, z);
    for (const i of t.ids) { s.volleyUntil[i] = until; s.volleyX[i] = x; s.volleyZ[i] = z; s.rtarget[i] = -1; }   // 다음 훑기에서 원 안 과녁을 고른다
    count = t.ids.length;
  }
  // stats: 끝나면 결과 알림(개발용)으로 나가는 수치 — 쓰러뜨린 적·피해(화살 비·돌격 북), 밀어냄(돌격 북), 더 간 거리(강행군)
  pay(w, side, order, def, { x, z, r, until, count, stats: { kills: 0, damage: 0, pushed: 0, extra: 0 }, reported: false });
  return { ok: true, count };
}

function pay(w, side, order, def, circle) {
  w.sides[side].gold -= def.cost;
  w.sides[side].cooldowns[order] = w.time + def.cooldown;
  w.casts.push({ side, order, ...circle, at: w.time });
  w.events.push({ kind: 'cast', side, order });
}

// 그 편이 지금 걸고 있는 그 명령(다시 쓰기가 효과보다 길어 명령마다 하나뿐). 없으면 null.
export function activeCast(w, side, order) {
  for (let k = w.casts.length - 1; k >= 0; k--) { const c = w.casts[k]; if (c.side === side && c.order === order && c.until > w.time) return c; }
  return null;
}

// 긴급 징집: 그 거점 가운데 반지름 ½ 안에 보병 count명 — 그 거점으로 보낸 병사처럼 원 안에 서서 지킨다(보낼 수 있다).
function levy(w, side, id, def) {
  const s = w.soldiers, k = w.strongholds.findIndex(x => x.id === id), st = w.strongholds[k], n = Math.round(def.count);
  if (s.free.length + s.capacity - s.count < n) return fail('병사가 너무 많다');
  const ids = [];
  for (let m = 0; m < n; m++) {
    const a = w.rng.next() * Math.PI * 2, d = st.radius * 0.5 * Math.sqrt(w.rng.next());
    const i = spawn(s, side, INFANTRY, st.x + Math.cos(a) * d, st.z + Math.sin(a) * d, w.rules);
    s.origin[i] = k;
    ids.push(i);
  }
  setGoal(w, ids, { kind: 'stronghold', id: st.id });
  pay(w, side, 'levy', def, { x: st.x, z: st.z, r: st.radius, until: w.time });
  return { ok: true, count: n };
}

// 결과 수치 모으기(강행군 더 간 거리), 끝난 명령의 결과 알림, 끝난 원 지우기(화면이 끝난 원을 1초 더 그리게).
export function stepCasts(w) {
  const s = w.soldiers, mm = w.rules.orders.march.speedMult;
  for (const side of [0, 1]) {
    const m = activeCast(w, side, 'march');                 // 지난 걸음에서 ×mm로 간 몫 중 평소보다 더 간 몫((mm − 1) / mm)
    if (m) for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.marchUntil[i] > w.time) m.stats.extra += Math.hypot(s.x[i] - s.px[i], s.z[i] - s.pz[i]) * (mm - 1) / mm;
  }
  for (const c of w.casts) if (c.stats && !c.reported && c.until <= w.time + 1e-9) {
    c.reported = true;
    w.notices.push({ side: c.side, kind: 'castResult', order: c.order, count: c.count, ...c.stats, at: w.time });
  }
  const list = w.casts;
  for (let k = list.length - 1; k >= 0; k--) if (list[k].until < w.time - 1) list.splice(k, 1);
}
