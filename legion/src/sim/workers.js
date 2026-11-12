// 광부 조(3단계 계획 Task 4, 사용자 2026-11-13: 일꾼 10명이 한 조 — "일꾼만 덩치 크면 이상한데"): 판정은 광부 하나하나, 움직이고 일하는 단위는 조.
// 짓기 명령은 가장 가까운 쉬는 광부의 조 전체를 보낸다. 건물 둘레 reach 안의 광부가 짓고(짓는 중) 고친다(다 지은 건물). 싸우지 않는다(behavior·combat 가드).
import { spawn, ORDER } from './soldiers.js';
import { WORKER } from './rules.js';
import { setGoal, pointFieldId } from './world.js';
import { nearestWalkable } from './movement.js';
import { canPlace, addBuilding } from './buildings.js';
import { costOf, canPay, pay, lack } from './economy.js';
import { dropFromSquads } from './squads.js';

const fail = reason => ({ ok: false, reason });
const COLS = 5, GAP = 1.2;   // 조 네모: 5열, 간격 m(그리기·놓기 모양 — 판정 수치 아님)

// 광부 build.crew명을 (x, z)에 5열 네모로 세운다(앞 = heading). 걸을 수 없는 자리는 가장 가까운 걸을 수 있는 칸. → ids
export function spawnCrew(w, side, x, z, heading) {
  const s = w.soldiers, n = w.rules.build.crew, rows = Math.ceil(n / COLS), crew = w.nextCrew++, ids = [];
  const c = Math.cos(heading), sn = Math.sin(heading);
  for (let k = 0; k < n; k++) {
    const l = (k % COLS - (COLS - 1) / 2) * GAP, f = -(Math.floor(k / COLS) - (rows - 1) / 2) * GAP;
    let px = x + c * f - sn * l, pz = z + sn * f + c * l;
    if (!w.map.walkable(px, pz)) [px, pz] = nearestWalkable(w.map, px, pz);
    const i = spawn(s, side, WORKER, px, pz, w.rules);
    s.crew[i] = crew; s.facing[i] = s.pfacing[i] = heading;
    setGoal(w, [i], { kind: 'point', x: px, z: pz });
    ids.push(i);
  }
  return ids;
}

// 같은 조의 산 광부(자기 포함).
export function crewMates(w, i) {
  const s = w.soldiers, c = s.crew[i], out = [];
  if (c < 0) return s.alive[i] ? [i] : out;
  for (let j = 0; j < s.count; j++) if (s.alive[j] && s.crew[j] === c && s.side[j] === s.side[i]) out.push(j);
  return out;
}

// 그 건물 일을 맡긴다: 조가 온 쪽을 가운데로 건물 둘레(r + 3 m) 호를 따라 한 명씩 벌려 선다. 흐름장은 건물 문(gate)의 것, 가는 동안 이동 명령.
export function assignJob(w, ids, b) {
  const s = w.soldiers, live = ids.filter(i => s.alive[i]);
  if (!live.length) return;
  let cx = 0, cz = 0;
  for (const i of live) { cx += s.x[i]; cz += s.z[i]; }
  cx /= live.length; cz /= live.length;
  const R = b.r + 3, a0 = Math.atan2(cz - b.z, cx - b.x), step = GAP / R, field = pointFieldId(w, b.gate.x, b.gate.z);
  dropFromSquads(w, live);
  live.forEach((i, k) => {
    const a = a0 + (k - (live.length - 1) / 2) * step;
    let x = b.x + Math.cos(a) * R, z = b.z + Math.sin(a) * R;
    if (!w.map.walkable(x, z)) { x = b.gate.x; z = b.gate.z; }
    setGoal(w, [i], { kind: 'point', x, z, field });
    s.job[i] = b.id;
    s.order[i] = ORDER.MOVE; s.orderBest[i] = Infinity; s.orderAt[i] = w.time;
  });
}

// 틱마다: 일 맡은 광부가 건물 둘레 reach 안이면 짓거나 고친다. 건물이 없어졌거나 할 일이 끝났으면 쉰다.
export function stepWorkers(w) {
  const s = w.soldiers, B = w.rules.build, dt = w.rules.dt;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.job[i] < 0) continue;
    const b = w.buildingById.get(s.job[i]);
    if (!b || !b.alive || b.side !== s.side[i] || (b.done && b.hp >= b.maxHp)) { s.job[i] = -1; continue; }
    if ((s.x[i] - b.x) ** 2 + (s.z[i] - b.z) ** 2 > (b.r + B.reach) ** 2) continue;
    if (!b.done) b.builders++;
    else b.hp = Math.min(b.maxHp, b.hp + b.maxHp * B.repairPerSec / B.crew * dt);
  }
}

// 명령에 든 광부 목록에서 그 편의 산 광부만.
function workersOf(w, side, list) {
  const s = w.soldiers, out = [];
  for (const i of Array.isArray(list) ? list : []) {
    if (!Number.isInteger(i) || i < 0 || i >= s.count || !s.alive[i] || s.side[i] !== side || !w.rules.units[side][s.type[i]].worker || out.includes(i)) continue;
    out.push(i);
  }
  return out;
}
const nearestOf = (w, ids, x, z) => ids.reduce((a, i) => ((w.soldiers.x[i] - x) ** 2 + (w.soldiers.z[i] - z) ** 2 < (w.soldiers.x[a] - x) ** 2 + (w.soldiers.z[a] - z) ** 2 ? i : a), ids[0]);

// { kind: 'build', side, type, x, z, workers } — 놓을 수 있고 값이 되면 세우고, 가장 가까운 쉬는 광부(없으면 가장 가까운 광부)의 조를 보낸다.
export function buildOrder(w, o) {
  const ws = workersOf(w, o.side, o.workers);
  if (!ws.length) return fail('광부를 골라야 한다');
  const at = canPlace(w, o.side, o.type, o.x, o.z);
  if (!at.ok) return at;
  const S = w.sides[o.side], c = costOf(w.rules.buildings[o.type]);
  if (!canPay(S, c)) return fail(lack(S, c));
  pay(S, c);
  const b = addBuilding(w, o.side, o.type, at.x, at.z, { deposit: at.deposit });
  const idle = ws.filter(i => w.soldiers.job[i] < 0);
  assignJob(w, crewMates(w, nearestOf(w, idle.length ? idle : ws, at.x, at.z)), b);
  return { ok: true, id: b.id };
}

// { kind: 'assist', side, building, workers } — 짓는 중이거나 다친 우리 건물에 그 광부들의 조 모두를.
export function assistOrder(w, o) {
  const b = w.buildingById.get(o.building);
  if (!b || !b.alive || b.side !== o.side) return fail('건물이 없다');
  if (b.done && b.hp >= b.maxHp) return fail('할 일이 없다');
  const ws = workersOf(w, o.side, o.workers);
  if (!ws.length) return fail('광부를 골라야 한다');
  const all = [...new Set(ws.flatMap(i => crewMates(w, i)))];
  assignJob(w, all, b);
  return { ok: true, count: all.length };
}
