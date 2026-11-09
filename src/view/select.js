// 고르기(설계서 §5.2, 사용자 2026-11-08): 무엇을 누르면 어느 병사가 골라지나. 세상을 읽기만 한다(화면 좌표는 project로 받는다).
import { troopsAt } from '../sim/orders.js';
import { STATE } from '../sim/soldiers.js';

// 고를 수 없는 병사: 수비대(늘 남는다)·장수에 붙은 병사·달아나는 병사.
export const selectable = (s, i, side) => s.alive[i] && s.side[i] === side && s.state[i] !== STATE.GARRISON && s.state[i] !== STATE.ATTACHED && s.state[i] !== STATE.FLEE;

// 곳 = { kind: 'sector' | 'stronghold', id }.
// 구역 → 그 구역 병사. 우리 거점 → 거기 서 있는 병사 + 그 앞에 모이는 쐐기. 승점·적 거점 → 원 안에 선 우리 병사(소속과 상관없이).
export function placeTroops(w, side, place) {
  const s = w.soldiers;
  if (place.kind === 'sector') return troopsAt(w, side, place);
  const k = w.strongholds.findIndex(x => x.id === place.id), st = w.strongholds[k];
  if (!st) return [];
  if (st.owner === side && st.kind !== 'vp') {
    const out = troopsAt(w, side, place);
    for (const g of w.groups) if (g.origin === k && g.side === side && g.state === 'gather') for (const i of g.members) if (s.alive[i] && s.group[i] === g.id) out.push(i);
    return out;
  }
  const out = [], r2 = st.radius * st.radius;
  for (let i = 0; i < s.count; i++) if (selectable(s, i, side) && (s.x[i] - st.x) ** 2 + (s.z[i] - st.z) ** 2 <= r2) out.push(i);
  return out;
}

// 오른쪽 클릭의 목표(설계서 §5.3): 거점·승점 원 안 → 그 거점, 우리 구역 선분에서 sectorPick m 안 → 그 구역, 그 밖 → 누른 그 자리, 물 위 → null.
// 보내기는 선 바로 위(SEND_SECTOR_PICK)만 구역으로 잡는다(사용자 2026-11-08: 전에는 80 m 띠라 옆으로 보내도 구역 선 쪽으로 비스듬히 갔다).
// 생산 방향은 그 자리를 못 가리키므로 넓게(FLOW_SECTOR_PICK) 잡는다.
export const SEND_SECTOR_PICK = 15, FLOW_SECTOR_PICK = 80;
export function rightClickTarget(w, side, p, sectorPick = SEND_SECTOR_PICK) {
  let st = null, bd = Infinity;
  for (const x of w.strongholds) { const d = Math.hypot(x.x - p.x, x.z - p.z); if (d <= x.radius && d < bd) { bd = d; st = x; } }
  if (st) return { kind: 'stronghold', id: st.id };
  let sec = null, sd = sectorPick;
  for (const s of w.map.sectors) {
    if (s.side !== side) continue;
    const x = Math.max(s.x0, Math.min(s.x1, p.x)), d = Math.hypot(p.x - x, p.z - s.z);
    if (d < sd) { sd = d; sec = s; }
  }
  if (sec) return { kind: 'sector', id: sec.id };
  if (!w.map.walkable(p.x, p.z)) return null;
  return { kind: 'point', x: p.x, z: p.z };
}

// 보내기 목표: 누른 곳 밑의 적 병사(foe, 없으면 −1)는 거점·승점 원 밖에서만 "그 적 공격"이다. 원 안이면 그 거점(어택땅).
// (사용자 2026-11-08 "승점을 고르고 적 본진·거점을 누르면 맞으면서 그냥 걷는다": 원 가운데엔 늘 수비대가 서 있어 그 한 명 공격이 되고,
//  공격 명령은 그 적에게 닿을 때까지 가는 길의 적을 치지 않는다.)
export function sendTarget(w, side, p, foe, sectorPick = SEND_SECTOR_PICK) {
  const t = rightClickTarget(w, side, p, sectorPick);
  if (foe < 0 || (t && t.kind === 'stronghold')) return t;
  return { kind: 'foe', id: foe, serial: w.soldiers.serial[foe] };
}

// 쐐기 하나의 살아 있는 병사.
export function groupTroops(w, grp) {
  const s = w.soldiers;
  return grp.members.filter(i => s.alive[i] && s.group[i] === grp.id);
}

// 화면 네모 안의 우리 병사. project(x, z) → { x, y } 화면 좌표(못 비추면 null).
export function boxTroops(w, side, project, rect) {
  const s = w.soldiers, out = [];
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1), y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  for (let i = 0; i < s.count; i++) {
    if (!selectable(s, i, side)) continue;
    const p = project(s.x[i], s.z[i]);
    if (p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(i);
  }
  return out;
}

// 고른 것 = 병사 번호 + 태어난 차례. 죽은 병사의 번호를 새 병사가 받아도 새 병사는 고른 것이 아니다.
export function remember(w, ids) {
  const s = w.soldiers;
  return { ids: [...ids], serials: ids.map(i => s.serial[i]) };
}

// 고른 것 중 아직 고를 수 있는 병사만(죽었거나·번호를 새 병사가 받았거나·수비대가 된 병사는 빠진다).
export function stillSelected(w, side, sel) {
  const s = w.soldiers, ids = [], serials = [];
  sel.ids.forEach((i, k) => { if (s.serial[i] === sel.serials[k] && selectable(s, i, side)) { ids.push(i); serials.push(sel.serials[k]); } });
  return { ids, serials };
}
