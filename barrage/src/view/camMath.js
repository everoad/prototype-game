// 둘 다 담는, 가만히 있는 카메라의 셈(§3) — 순수(three·DOM 없음, Node 시험·봇이 쓴다).
// 화면 좌표: sx = x cos ψ − z sin ψ, sy = −sin θ (x sin ψ + z cos ψ) (scene.js 카메라와 같은 셈, 높이 0).
// 카메라 상태 = 화면 좌표의 가운데 (sx, sy)와 화면 가로 width(정사영 크기 = 줌).
import { K } from '../sim/rules.js';
import { reach as exitDist } from '../sim/beams.js';   // 판 안에서 (x, z)에서 angle 쪽으로 나가는 곳까지

const D = Math.PI / 180;
const FRAMED = new Set(['fire', 'dive', 'bomb', 'impact', 'eye', 'pounce']);   // 화면에 꼭 담는 예고 원(큰 판의 보스들)
export function screenOf(x, z, yawDeg, pitchDeg) {
  const y = yawDeg * D, t = pitchDeg * D;
  return { sx: x * Math.cos(y) - z * Math.sin(y), sy: -Math.sin(t) * (x * Math.sin(y) + z * Math.cos(y)) };
}
export function floorOf(sx, sy, yawDeg, pitchDeg) {
  const y = yawDeg * D, t = pitchDeg * D, u = -sy / Math.sin(t);
  return { x: sx * Math.cos(y) + u * Math.sin(y), z: -sx * Math.sin(y) + u * Math.cos(y) };
}

// 담을 것: [플레이어, 보스, 빨강·금 차선 양 끝(판 안으로 자름), 탄 벽 시작 줄 양 끝]. 앞 둘은 늘 이 차례(frameTarget이 쓴다).
export function framingPoints(w, LOOK) {
  const C = LOOK.camera, p = w.player, b = w.boss, R = w.rules;
  if (b.away) return roomPoints(w, LOOK);
  const out = [{ x: p.x, z: p.z, r: C.playerMargin }, { x: b.x, z: b.z, r: R.boss.r + C.bossMargin + (b.alt ?? 0) * (C.altMargin ?? 0) }];   // 떠 있는 용(dragon2): 뜬 만큼 여백을 넓혀 몸이 화면에 든다
  for (const l of w.lanes) {
    if (l.kind !== K.RED && l.kind !== K.GOLD) continue;
    const d = exitDist(R.board, l.x, l.z, l.angle);
    out.push({ x: l.x, z: l.z, r: C.laneMargin }, { x: l.x + Math.cos(l.angle) * d, z: l.z + Math.sin(l.angle) * d, r: C.laneMargin });
  }
  for (const run of b.runs ?? (b.run ? [b.run] : [])) {
    const wl = run.wallLine;
    if (wl && !run.done) out.push({ x: wl[0], z: wl[1], r: C.laneMargin }, { x: wl[2], z: wl[3], r: C.laneMargin });
  }
  // 박치기 줄 끝(판 끝까지 깔림), 레이저 빔 끝(판 안으로 자름)
  for (const a of w.floorAreas ?? []) if (a.shape === 'lane') out.push({ x: a.x + Math.cos(a.face) * a.len, z: a.z + Math.sin(a.face) * a.len, r: C.laneMargin });
  for (const it of w.items ?? []) if (C.itemReach == null || Math.hypot(it.x - p.x, it.z - p.z) <= C.itemReach) out.push({ x: it.x, z: it.z, r: C.laneMargin });   // 아이템(§4.9)이 화면 밖에 생기지 않게 — 큰 판에서는 내 곁의 것만(판 끝의 아이템 하나가 카메라를 끝까지 빼지 않게)
  for (const a of w.floorAreas ?? []) if (FRAMED.has(a.kind)) out.push({ x: a.x, z: a.z, r: a.R + C.laneMargin });   // 나는 용의 불줄 · 급강하 원, 포격수의 폭탄 밭 · 포탄 · 덮칠 자리(예고가 다 보이게)
  for (const m of w.beams ?? []) { const d = exitDist(R.board, m.x, m.z, m.angle); out.push({ x: m.x + Math.cos(m.angle) * d, z: m.z + Math.sin(m.angle) * d, r: C.laneMargin }); }
  return out;
}

// 일반 방(스테이지): [플레이어, 볼 것들의 가운데, 살아 있는 몬스터(등장 예고 포함)·보상·문, 돌격 줄 끝]. 보스는 자리에 없다.
function roomPoints(w, LOOK) {
  const C = LOOK.camera, p = w.player, S = w.stage, see = [];
  for (const m of w.enemies) if (!m.dead) see.push({ x: m.x, z: m.z, r: m.r + C.laneMargin });
  for (const r of S?.rewards ?? []) see.push({ x: r.x, z: r.z, r: C.laneMargin });
  if (S?.door) see.push({ x: S.door.x, z: S.door.z, r: C.laneMargin });
  for (const a of w.floorAreas ?? []) if (a.shape === 'lane') see.push({ x: a.x + Math.cos(a.face) * a.len, z: a.z + Math.sin(a.face) * a.len, r: C.laneMargin });
  let cx = 0, cz = 0;
  for (const q of see) { cx += q.x / see.length; cz += q.z / see.length; }
  return [{ x: p.x, z: p.z, r: C.playerMargin }, { x: cx, z: cz, r: C.playerMargin }, ...see];
}

// 이상적인 틀: 가운데 = 보스→플레이어 playerShare 지점, 가로 = 모두 담는 최소값을 [minW, maxW]로.
// 판 가장자리 + edgeMargin 밖은 덜 보이게 자르되, 담을 것이 먼저다.
export function frameTarget(points, { yawDeg, pitchDeg, aspect, LOOK, board }) {
  const C = LOOK.camera;
  const s = points.map(p => ({ ...screenOf(p.x, p.z, yawDeg, pitchDeg), r: p.r }));
  const [P, B] = s;
  let cx = B.sx + (P.sx - B.sx) * C.playerShare, cy = B.sy + (P.sy - B.sy) * C.playerShare;
  let hw = 0, hh = 0;
  for (const q of s) { hw = Math.max(hw, Math.abs(q.sx - cx) + q.r); hh = Math.max(hh, Math.abs(q.sy - cy) + q.r); }
  // 플레이어·보스 몸(여백 없이 1 U)만은 반드시 담는다 — 아주 넓거나 좁은 화면에서는 이때만 maxW를 넘긴다
  const ess = s.slice(0, 2), ex0 = Math.min(...ess.map(q => q.sx)), ex1 = Math.max(...ess.map(q => q.sx));
  const ey0 = Math.min(...ess.map(q => q.sy)), ey1 = Math.max(...ess.map(q => q.sy));
  const mustW = Math.max(ex1 - ex0 + 2, (ey1 - ey0 + 2) * aspect);
  const width = Math.max(mustW, Math.min(C.maxW, Math.max(C.minW, 2 * hw, 2 * hh * aspect)));
  const H = width / aspect;
  // 판 가장자리: 판 네 모서리 + 여백의 화면 상자 안으로(틀이 상자보다 크면 상자 가운데)
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => screenOf(a * board.hx, c * board.hz, yawDeg, pitchDeg));
  const bx0 = Math.min(...corners.map(c => c.sx)) - C.edgeMargin, bx1 = Math.max(...corners.map(c => c.sx)) + C.edgeMargin;
  const by0 = Math.min(...corners.map(c => c.sy)) - C.edgeMargin, by1 = Math.max(...corners.map(c => c.sy)) + C.edgeMargin;
  const clampIn = (c, half, lo, hi) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, c)));
  cx = clampIn(cx, width / 2, bx0, bx1); cy = clampIn(cy, H / 2, by0, by1);
  // 담을 것이 먼저: 넘치는 쪽으로 옮긴다(상자가 틀보다 크면 상자 가운데)
  const px0 = Math.min(...s.map(q => q.sx - q.r)), px1 = Math.max(...s.map(q => q.sx + q.r));
  const py0 = Math.min(...s.map(q => q.sy - q.r)), py1 = Math.max(...s.map(q => q.sy + q.r));
  const fit = (c, half, lo, hi) => (hi - lo >= half * 2 ? (lo + hi) / 2 : Math.max(hi - half, Math.min(lo + half, c)));
  cx = fit(cx, width / 2, px0, px1); cy = fit(cy, H / 2, py0, py1);
  const f = floorOf(cx, cy, yawDeg, pitchDeg);
  return { sx: cx, sy: cy, width, cx: f.x, cz: f.z };
}

// 한 걸음: 1) 담을 것이 여백째 화면 밖이면 바로 따라감 2) 조금만 다르면 그대로 3) 아니면 넘은 만큼만, 넓히기는 바로, 좁히기는 머문 뒤.
export function stepFrame(cur, ideal, points, dtReal, { yawDeg, pitchDeg, aspect, LOOK }) {
  const C = LOOK.camera, next = { ...cur };
  const H = cur.width / aspect;
  const out = points.some(p => { const s = screenOf(p.x, p.z, yawDeg, pitchDeg); return Math.abs(s.sx - cur.sx) + p.r > cur.width / 2 || Math.abs(s.sy - cur.sy) + p.r > H / 2; });
  const kPos = 1 - Math.exp(-C.posRate * dtReal), kOut = 1 - Math.exp(-C.zoomOutRate * dtReal), kIn = 1 - Math.exp(-C.zoomInRate * dtReal);
  if (out) {
    next.sx += (ideal.sx - cur.sx) * kPos; next.sy += (ideal.sy - cur.sy) * kPos;
    if (ideal.width > cur.width) next.width += (ideal.width - cur.width) * kOut;
    next.narrowT = 0;
    return next;
  }
  const dx = ideal.sx - cur.sx, dy = ideal.sy - cur.sy, dw = ideal.width - cur.width;
  if (Math.abs(dx) <= C.deadPos && Math.abs(dy) <= C.deadPos && Math.abs(dw) <= C.deadW) { next.narrowT = 0; return next; }
  const follow = (d, k) => (Math.abs(d) <= C.deadPos ? 0 : (d - Math.sign(d) * C.deadPos) * k);
  next.sx += follow(dx, kPos); next.sy += follow(dy, kPos);
  if (dw > 0) { next.width += dw * kOut; next.narrowT = 0; }
  else if (dw < -C.deadW) {
    next.narrowT = (cur.narrowT || 0) + dtReal;
    if (next.narrowT >= C.zoomInHold) next.width += dw * kIn;
  } else next.narrowT = 0;
  return next;
}
