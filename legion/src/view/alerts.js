// 알림 자리(4단계 — three 없이 셈만): Space가 갈 마지막 알림 자리, 미니맵에 띄울 공격받음·무너짐 고리.
const PING_KINDS = new Set(['attacked', 'collapse']);

const URGENT_SECONDS = 15;   // Space: 이 안의 공격받음·무너짐이 먼저(되풀이되는 인구 알림에 묻히지 않게 — 4단계 최종 검토)

// 그 편 알림 가운데 위치(x, z)가 있는 것: URGENT_SECONDS 안의 공격받음·무너짐 가운데 가장 새것, 없으면 가장 새것 { x, z, kind, at }. 없으면 null.
export function lastAlert(w, side) {
  let best = null, urgent = null;
  for (const n of w.notices) {
    if (n.side !== side || !Number.isFinite(n.x) || !Number.isFinite(n.z)) continue;
    if (!best || n.at >= best.at) best = n;
    if (PING_KINDS.has(n.kind) && w.time - n.at <= URGENT_SECONDS && (!urgent || n.at >= urgent.at)) urgent = n;
  }
  const a = urgent ?? best;
  return a ? { x: a.x, z: a.z, kind: a.kind, at: a.at } : null;
}

// 미니맵 고리: seconds초 안의 그 편 공격받음·무너짐 [{ x, z, age }].
export function pings(w, side, now, seconds = 6) {
  const out = [];
  for (const n of w.notices) if (n.side === side && PING_KINDS.has(n.kind) && Number.isFinite(n.x) && now - n.at < seconds) out.push({ x: n.x, z: n.z, age: now - n.at });
  return out;
}
