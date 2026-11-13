// 공격 무리(사용자 2026-11-10 "적 공격 클릭은 적이 다 죽으면 한곳에 뭉쳐 있다 — 쐐기 형태로 유지"):
// 적 병사로 보낸 병사들을 한 무리로 기억한다. 무리가 다 풀리고(쐐기·명령 끝) 아무도 싸우지 않으며 둘레 aggro m에 적이 없는 채로
// squad.quietSeconds가 지나면, 그 자리(무리 가운데)에서 병종 진형으로 다시 선다 — 앞줄 보병·창 쐐기, 그 뒤 기병 삼각형,
// 맨 뒤 궁수·투석기 직사각형, 모두 공격하던 쪽을 보고(restFacing). 다시 싸우면 싸운 뒤 또 선다. 다른 곳으로 보내면 빠진다(orders.js).
import { STATE, GOAL, ORDER } from './soldiers.js';
import { formationOffsets, classOf } from './groups.js';

const EVERY = 20;                                                  // 1초마다 본다(틱)
const ROWS = [['golem', 'infantry', 'spear'], ['cav', 'knight'], ['archer', 'mage', 'siege', 'priest']];   // 앞줄부터(6-1단계: 골렘은 앞, 기사는 기병과, 마법사·사제는 뒤)

// 적 병사로 보낸 병사들(쐐기째 간 병사 포함)을 새 무리로. 방향 = 무리 가운데 → 그 적.
export function startSquad(w, ids, to) {
  const s = w.soldiers;
  dropFromSquads(w, ids);
  const live = ids.filter(i => s.alive[i]);
  if (!live.length) return;
  let cx = 0, cz = 0;
  for (const i of live) { cx += s.x[i]; cz += s.z[i]; }
  cx /= live.length; cz /= live.length;
  w.squads.push({ side: s.side[live[0]], ids: live, serials: live.map(i => s.serial[i]), heading: Math.atan2(to.z - cz, to.x - cx), quietSince: null, formed: false });
}

// 다른 곳으로 보낸 병사는 무리에서 빠지고 서 있을 때 보는 방향도 풀린다.
export function dropFromSquads(w, ids) {
  const s = w.soldiers;
  for (const i of ids) s.restFacing[i] = NaN;
  if (!w.squads.length) return;
  const out = new Set(ids);
  for (const q of w.squads) {
    const keep = [];
    q.ids.forEach((i, k) => { if (!out.has(i)) keep.push(k); });
    if (keep.length < q.ids.length) { q.serials = keep.map(k => q.serials[k]); q.ids = keep.map(k => q.ids[k]); }
  }
  w.squads = w.squads.filter(q => q.ids.length);
}

export function stepSquads(w) {
  if (!w.squads.length || w.tick % EVERY) return;
  const s = w.soldiers, aggro = w.rules.behavior.aggro, wait = w.rules.squad.quietSeconds;
  w.squads = w.squads.filter(q => {
    const ids = [], serials = [];
    let busy = false;
    q.ids.forEach((i, k) => {
      if (!s.alive[i] || s.serial[i] !== q.serials[k]) return;
      if (s.group[i] < 0 && s.goalKind[i] !== GOAL.POINT) return;          // 다른 규칙이 데려갔다(구역·거점 목표)
      ids.push(i); serials.push(q.serials[k]);
      if (s.group[i] >= 0 || s.order[i] !== ORDER.NONE || s.target[i] >= 0 || s.rtarget[i] >= 0 || s.inContact[i] || s.state[i] === STATE.ROUT || s.state[i] === STATE.FLEE) busy = true;
    });
    q.ids = ids; q.serials = serials;
    if (!ids.length) return false;
    if (!busy) for (const i of ids) if (enemyWithin(w, q.side, s.x[i], s.z[i], aggro)) { busy = true; break; }
    if (busy) { q.quietSince = null; q.formed = false; return true; }
    q.quietSince ??= w.time;
    if (!q.formed && w.time - q.quietSince >= wait - 1e-9) { formUp(w, q); q.formed = true; }
    return true;
  });
}

// 반지름 r 안에 적 병사가 있나(하나 찾으면 끝).
function enemyWithin(w, side, x, z, r) {
  const s = w.soldiers, cs = s.cellSize, r2 = r * r;
  const c0 = Math.max(0, Math.floor((x - r) / cs)), c1 = Math.min(s.gcols - 1, Math.floor((x + r) / cs));
  const r0 = Math.max(0, Math.floor((z - r) / cs)), r1 = Math.min(s.grows - 1, Math.floor((z + r) / cs));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let j = s.head[rr * s.gcols + cc]; j !== -1; j = s.next[j])
        if (s.alive[j] && s.side[j] !== side && (s.x[j] - x) ** 2 + (s.z[j] - z) ** 2 <= r2) return true;
  return false;
}

// 무리 가운데에 진형을 짠다: 줄(ROWS)마다 병종 진형(무게 weightByClass씩)을 옆으로 squad.gap m 띄워 늘어놓고, 줄 사이는 squad.rowGap m.
// 진형 안 자리는 앞쪽(공격한 쪽)에 선 병사부터 앞 자리로 — 서로 가로질러 걷지 않게.
function formUp(w, q) {
  const s = w.soldiers, r = w.rules, g = r.group, Q = r.squad, ids = q.ids;
  let cx = 0, cz = 0;
  for (const i of ids) { cx += s.x[i]; cz += s.z[i]; }
  cx /= ids.length; cz /= ids.length;
  const c = Math.cos(q.heading), sn = Math.sin(q.heading);
  const fwd = i => (s.x[i] - cx) * c + (s.z[i] - cz) * sn, across = i => -(s.x[i] - cx) * sn + (s.z[i] - cz) * c;
  const byClass = {};
  for (const i of ids) (byClass[classOf(s.type[i])] ??= []).push(i);
  const slots = [];
  let back = 0;
  for (const row of ROWS) {
    const parts = [];
    for (const cls of row) {
      const list = byClass[cls];
      if (!list) continue;
      list.sort((a, b) => across(a) - across(b));
      const per = g.weightByClass[cls] ?? g.weight;
      for (let k = 0; k < list.length;) {
        const part = [];
        let wt = 0;
        while (k < list.length && (wt < per - 1e-9 || !part.length)) { const i = list[k++]; part.push(i); wt += r.units[s.side[i]][s.type[i]].weight; }
        const offs = formationOffsets(cls, part.length, g);
        let l0 = Infinity, l1 = -Infinity, f0 = 0;
        for (const o of offs) { l0 = Math.min(l0, o.l); l1 = Math.max(l1, o.l); f0 = Math.min(f0, o.f); }
        parts.push({ part, offs, l0, l1, depth: -f0 });
      }
    }
    if (!parts.length) continue;
    let at = -(parts.reduce((a, p) => a + p.l1 - p.l0, 0) + Q.gap * (parts.length - 1)) / 2, depth = 0;
    for (const p of parts) {
      const shift = at - p.l0;
      p.part.sort((a, b) => fwd(b) - fwd(a));
      p.part.forEach((i, n) => slots.push({ i, f: p.offs[n].f - back, l: p.offs[n].l + shift }));
      at += p.l1 - p.l0 + Q.gap;
      depth = Math.max(depth, p.depth);
    }
    back += depth + Q.rowGap;
  }
  const mid = (back - Q.rowGap) / 2;                               // 진형 앞뒤 가운데를 무리 가운데에
  for (const { i, f, l } of slots) {
    let gx = cx + c * (f + mid) - sn * l, gz = cz + sn * (f + mid) + c * l;
    if (!w.map.walkable(gx, gz)) { gx = s.x[i]; gz = s.z[i]; }
    s.goalKind[i] = GOAL.POINT; s.goalId[i] = -1; s.goalX[i] = gx; s.goalZ[i] = gz;
    s.restFacing[i] = q.heading;
  }
}
