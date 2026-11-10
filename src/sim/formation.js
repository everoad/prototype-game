// 거점 수비 진형(설계서 2026-11-09-flood-stronghold-formation-design.md): reslotEvery초마다 우리 거점(본진·앞·뒤)에 선 병력에게
// 병종별 고리 자리(목표 자리)와 역할(s.fmRole)을 준다(원 안에 선 병사만) — 창 바깥 고리, 궁수 그 바로 뒤, 보병 안쪽 고리, 기병·공성 가운데 고리.
// 자리는 자료(rules.formation)다. 거점이 실제 건물·성벽 모양을 갖게 되면 모양마다 자리 목록으로 바꾼다.
import { STATE, GOAL, ORDER } from './soldiers.js';
import { SPEAR, ARCHER, INFANTRY } from './rules.js';

export const FM = { NONE: 0, OUTER: 1, ARCHER: 2, INNER: 3, MIDDLE: 4 };

const isFort = st => st.owner !== null && (st.kind === 'hq' || st.kind === 'front' || st.kind === 'rear');

// 진형에 들 수 있는 병사인가(원 안인지는 빼고): 진형 켬, 목표가 주인 편 거점(본진·앞·뒤), 쐐기·명령 없음, 달아남·패주·장수 붙음 아님.
// 자리 나누기와 행동(behavior.js — 쐐기에 듦·거점을 잃음·진형 끔 같은 setGoal을 거치지 않는 길에서 역할을 바로 푼다)이 같이 쓴다.
export function fmMember(w, i) {
  const s = w.soldiers;
  if (!w.rules.formation?.enabled || s.goalKind[i] !== GOAL.STRONGHOLD || s.group[i] >= 0 || s.order[i] !== ORDER.NONE) return false;
  const st8 = s.state[i];
  if (st8 === STATE.FLEE || st8 === STATE.ROUT || st8 === STATE.ATTACHED) return false;
  const st = w.strongholds[s.goalId[i]];
  return !!st && isFort(st) && st.owner === s.side[i];
}

export function stepFormation(w) {
  const F = w.rules.formation;
  if (!F?.enabled || w.tick % Math.max(1, Math.round(F.reslotEvery / w.rules.dt)) !== 0) return;
  const s = w.soldiers, groups = w.strongholds.map(st => (isFort(st) ? { spear: [], archer: [], inf: [], mid: [] } : null));
  for (let i = 0; i < s.count; i++) {                       // 병사 한 번 훑기: 역할을 지우고 구성원이면 다시 준다
    if (!s.alive[i]) continue;
    s.fmRole[i] = FM.NONE;
    if (!fmMember(w, i)) continue;
    const k = s.goalId[i], g = groups[k], st = w.strongholds[k];
    const dx = s.x[i] - st.x, dz = s.z[i] - st.z;
    if (dx * dx + dz * dz > st.radius * st.radius) continue;   // 원 안에 선 병사만(가는 중·나가 싸우는 병사는 다음 나누기에)
    const t = s.type[i];
    (t === SPEAR ? g.spear : t === ARCHER ? g.archer : t === INFANTRY ? g.inf : g.mid).push(i);   // 기병·공성 → 가운데 고리
  }
  w.strongholds.forEach((st, k) => {
    const g = groups[k];
    if (!g) return;
    const R = st.radius, outer = g.spear.length ? g.spear : g.inf, inner = g.spear.length ? g.inf : [];   // 창이 없으면 보병이 바깥 고리
    const outerIn = ring(w, st, outer, F.outer * R, F.gap.outer, F.layer.outer, FM.OUTER, true);   // 가장 안쪽 겹(겹이 늘면 궁수도 안으로)
    ring(w, st, g.archer, outerIn - F.archerBehind, F.gap.archer, F.layer.archer, FM.ARCHER, false);
    ring(w, st, inner, F.inner * R, F.gap.inner, F.layer.inner, FM.INNER, true);
    ring(w, st, g.mid, F.middle * R, F.gap.middle, F.layer.middle, FM.MIDDLE, true);
  });
}

// 한 고리: 각도 순서로 줄 세워 겹(layer)마다 번갈아 넣고, 겹 안에서는 고르게 나눠 선다(병사가 간격보다 적어도 빈 조각이 없게).
// 돌려주는 값 = 가장 안쪽 겹의 반지름(병사가 없으면 r).
function ring(w, st, ids, r, gap, layerGap, role, faceOut) {
  const m = ids.length;
  if (!m) return r;
  const s = w.soldiers, angOf = new Map(ids.map(i => [i, Math.atan2(s.z[i] - st.z, s.x[i] - st.x)]));
  ids.sort((a, b) => angOf.get(a) - angOf.get(b));
  const per = Math.max(1, Math.floor(2 * Math.PI * r / gap)), L = Math.ceil(m / per), a0 = angOf.get(ids[0]);
  ids.forEach((i, j) => {
    const layer = j % L, pos = Math.floor(j / L), inLayer = Math.ceil((m - layer) / L);
    const a = a0 + 2 * Math.PI * pos / inLayer, rr = Math.max(2, r - layer * layerGap);
    s.goalX[i] = st.x + Math.cos(a) * rr; s.goalZ[i] = st.z + Math.sin(a) * rr;
    s.fmRole[i] = role;
    if (faceOut && s.target[i] < 0 && !s.inContact[i] && !w.rules.units[s.side[i]][s.type[i]].catapult) s.facing[i] = a;   // 바깥을 본다(방패가 바깥으로) — 투석기는 과녁 쪽 그대로
  });
  return Math.max(2, r - (L - 1) * layerGap);
}
