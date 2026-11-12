// 고르기(설계서 §5.2, 사용자 2026-11-08): 무엇을 누르면 어느 병사가 골라지나. 세상을 읽기만 한다(화면 좌표는 project로 받는다).
// (홍수의 거점·구역 누르기와 거점 건물 정보는 옛 판과 함께 뺐다 — 군단 영지 4단계에서 부대 고르기로 새로.)
import { STATE } from '../sim/soldiers.js';
import { crewMates } from '../sim/workers.js';

// 고를 수 없는 병사: 달아나는 병사.
export const selectable = (s, i, side) => s.alive[i] && s.side[i] === side && s.state[i] !== STATE.FLEE;

// 오른쪽 클릭의 목표: 누른 그 자리, 물 위면 null.
export function rightClickTarget(w, side, p) {
  if (!w.map.walkable(p.x, p.z)) return null;
  return { kind: 'point', x: p.x, z: p.z };
}

// 보내기 목표: 누른 곳 밑의 적 병사(foe, 없으면 −1)는 "그 적 공격", 아니면 그 자리.
export function sendTarget(w, side, p, foe) {
  if (foe < 0) return rightClickTarget(w, side, p);
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

// 놀고 있는 병사만(사용자 "놀고 있는 병사 다 고르기"): 무리·명령·노리는 적·맞닿음이 없는 병사
export function idleOnly(w, ids) {
  const s = w.soldiers;
  return ids.filter(i => s.alive[i] && s.group[i] < 0 && !s.order[i] && s.target[i] < 0 && s.rtarget[i] < 0 && !s.inContact[i]);
}

// 병종 고르기(사용자 2026-11-10 "범위 안에서 특정 병종만"): 고른 병사 가운데 그 병종만(drop이면 그 병종만 빼고).
export function byType(w, ids, type, drop = false) {
  const s = w.soldiers;
  return ids.filter(i => (s.type[i] === type) !== drop);
}

// 고른 것 = 병사 번호 + 태어난 차례. 죽은 병사의 번호를 새 병사가 받아도 새 병사는 고른 것이 아니다.
export function remember(w, ids) {
  const s = w.soldiers;
  return { ids: [...ids], serials: ids.map(i => s.serial[i]) };
}

// 고른 것 중 아직 고를 수 있는 병사만(죽었거나·번호를 새 병사가 받았거나·달아나는 병사는 빠진다).
export function stillSelected(w, side, sel) {
  const s = w.soldiers, ids = [], serials = [];
  sel.ids.forEach((i, k) => { if (s.serial[i] === sel.serials[k] && selectable(s, i, side)) { ids.push(i); serials.push(sel.serials[k]); } });
  return { ids, serials };
}

// ---- 광부 조(3단계) ----
const isWorker = (w, i) => w.rules.units[w.soldiers.side[i]][w.soldiers.type[i]].worker;

// 네모 고르기: 광부와 다른 병사가 섞였으면 광부를 뺀다(싸울 병력을 고르려다 광부까지 끌고 가지 않게). 광부만이면 그대로.
export function armyFirst(w, ids) {
  const army = ids.filter(i => !isWorker(w, i));
  return army.length && army.length < ids.length ? army : ids;
}

// (x, z)에서 r 안 가장 가까운 우리 광부의 조(없으면 빈 배열).
export function crewAt(w, side, x, z, r) {
  const s = w.soldiers;
  let best = -1, bd = r;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== side || s.crew[i] < 0) continue;
    const d = Math.hypot(s.x[i] - x, s.z[i] - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best < 0 ? [] : crewMates(w, best);
}

// 쉬는 조(아무도 일을 맡지 않은 조)의 광부 모두.
export function idleCrews(w, side) {
  const s = w.soldiers, busy = new Set(), out = [];
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.crew[i] >= 0 && s.job[i] >= 0) busy.add(s.crew[i]);
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.crew[i] >= 0 && !busy.has(s.crew[i])) out.push(i);
  return out;
}

// ---- 부대(4단계, sim/units.js) ----
// 그 병사의 부대(같은 편·같은 부대 번호의 산 병사). 부대가 없으면 그 병사 하나.
export function unitTroops(w, i) {
  const s = w.soldiers, u = s.unit[i], out = [];
  if (u < 0) return s.alive[i] ? [i] : out;
  for (let j = 0; j < s.count; j++) if (s.unit[j] === u && s.side[j] === s.side[i] && selectable(s, j, s.side[i])) out.push(j);
  return out;
}

// ids에 든 병사의 부대 전체로 넓힌다(광부와 부대 없는 병사는 그대로).
function widen(w, side, ids) {
  const s = w.soldiers, units = new Set(ids.filter(i => s.unit[i] >= 0).map(i => s.unit[i])), out = new Set(ids);
  if (units.size) for (let j = 0; j < s.count; j++) if (units.has(s.unit[j]) && selectable(s, j, side)) out.add(j);
  return [...out];
}

// 끌어 고르기(설계서 §4 부대 단위): 네모에 닿은 부대 전체. 병사가 섞이면 광부는 뺀다.
export const boxUnits = (w, side, project, rect) => armyFirst(w, widen(w, side, boxTroops(w, side, project, rect)));

// 두 번 누르기: 화면 네모 안 그 병사와 같은 병종인 우리 부대 모두.
export function sameTypeOnScreen(w, side, i, project, rect) {
  const s = w.soldiers, type = s.type[i];
  return widen(w, side, boxTroops(w, side, project, rect).filter(j => s.type[j] === type && s.crew[j] < 0));
}

// 누른 병사가 고르는 것: 부대 → 부대가 없으면 그 쐐기(시험 장면 — 4단계 최종 검토) → 그것도 없으면 그 병사 하나.
export function clickTroops(w, i) {
  const s = w.soldiers;
  if (s.unit[i] >= 0) return unitTroops(w, i);
  if (s.group[i] >= 0) { const out = []; for (let j = 0; j < s.count; j++) if (s.group[j] === s.group[i] && selectable(s, j, s.side[i])) out.push(j); return out; }
  return s.alive[i] ? [i] : [];
}
