// 걸음: 목표 쪽 바라는 속도 + 밀어 간격 지키기 + 감쇠 + 지형 속도 + 걸을 수 없는 곳에서 되돌리기.
import { GOAL, STATE, ORDER } from './soldiers.js';
import { CAVALRY } from './rules.js';
import { fieldDir } from './flowfield.js';
import { rangeOf } from './combat.js';

const NEAR_DIRECT = 25;   // 목표가 이 안이면 흐름장 대신 곧장 간다 m
const ARRIVE = 1.0;       // 이 안이면 선다 m
const SLOW_RADIUS = 3;    // 이 안에서 속도를 줄인다 m
const HOLD_RADIUS = 3;    // 정면에 선 병사는 자리에서 이만큼 밀려도 돌아가지 않는다 m(돌아가려다 서로 짓눌리는 일 방지)

const FIGHT_PUSH = 0.3; // 싸우는 병사는 밀려도 덜 움직인다(떨림 감쇠, 보완 6)
const PUSH_SHARE = 0.8; // 겹친 길이 중 한 틱에 스스로 비키는 몫(둘이 같이 비키니 합은 1을 넘는다 — 빽빽한 곳에서 간격 0.6 m 이상 유지)

export function desiredVelocity(w, i) {
  const s = w.soldiers;
  if (s.state[i] === STATE.ROUT) {                         // 국지 무너짐: 우리 쪽으로 달아난다(§6.3a)
    const dx = s.routX[i] - s.x[i], dz = s.routZ[i] - s.z[i], d = Math.hypot(dx, dz);
    if (d < 1) return [0, 0];
    const sp = w.rules.units[s.side[i]][s.type[i]].speed * w.rules.behavior.routSpeed * w.map.speedMult(s.x[i], s.z[i]);
    return [dx / d * sp, dz / d * sp];
  }
  const u = w.rules.units[s.side[i]][s.type[i]];
  if (s.throughUntil[i] > w.time) {                        // 짓밟기: 달리던 방향으로 그대로 지나간다
    const sp = u.speed * w.map.speedMult(s.x[i], s.z[i]);
    return [s.throughX[i] * sp, s.throughZ[i] * sp];
  }
  if (s.inContact[i] && s.order[i] !== ORDER.MOVE) {     // 닿으면 멈춤(보완 4) — 달리는 기병은 버팀 아닌 적이면 지나간다. 이동 명령만 멈추지 않고 간다(사용자 2026-11-08 "B"),
                                                           // 공격 명령은 길을 막은 적과 싸운다(같은 날 "길목에 적이 있는데 관통하고 지나간다")
    const v = Math.hypot(s.vx[i], s.vz[i]);
    const c = s.contact[i], cu = c >= 0 ? w.rules.units[s.side[c]][s.type[c]] : null;
    const prey = cu && (cu.range > w.rules.melee.reach * 2 || cu.siege);   // 원거리·공성은 지나가지 않고 벤다
    const elsewhere = u.charges && !prey && c !== s.target[i];             // 기병이 노리지 않은 적과 닿음
    if (elsewhere && !s.contactHold[i] && v > u.speed * 0.6) {               // 버팀 아닌 적: 짓밟고 지나간다
      s.throughUntil[i] = w.time + w.rules.behavior.throughSeconds;
      s.throughX[i] = s.vx[i] / v; s.throughZ[i] = s.vz[i] / v;
      return [s.vx[i] / v * u.speed, s.vz[i] / v * u.speed];
    }
    if (elsewhere && s.contactHold[i]) {                                     // 노리지 않은 창: 반대쪽으로 빠져나간다
      const dx = s.x[i] - s.x[c], dz = s.z[i] - s.z[c], l = Math.hypot(dx, dz) || 1;
      s.throughUntil[i] = w.time + w.rules.behavior.evadeSeconds;
      s.throughX[i] = dx / l; s.throughZ[i] = dz / l;
      return [dx / l * u.speed, dz / l * u.speed];
    }
    return [0, 0];
  }
  if (s.wedge[i]) {                                        // 행군 중인 쐐기: 쐐기 속도 + 자리로 당김
    const g = w.rules.group, max = w.rules.units[s.side[i]][s.type[i]].speed * g.catchUp * g.chargeSpeed;
    let vx = s.ffx[i] + (s.goalX[i] - s.x[i]) * g.follow, vz = s.ffz[i] + (s.goalZ[i] - s.z[i]) * g.follow;
    const l = Math.hypot(vx, vz);
    if (l > max) { vx *= max / l; vz *= max / l; }
    return [vx, vz];
  }
  const ranged = u.range > w.rules.melee.reach * 2, rt = s.rtarget[i], rng = ranged ? rangeOf(w, i) : u.range;
  if (!s.order[i] && ranged && rt >= 0 && s.alive[rt] && (s.x[rt] - s.x[i]) ** 2 + (s.z[rt] - s.z[i]) ** 2 <= rng * rng) return [0, 0];   // 서서 쏜다(명령받은 궁수는 걸으며 쏜다)
  const t = s.target[i];
  if (t >= 0 && s.alive[t]) {                              // 어그로: 적에게 붙는다(원거리는 사거리까지만)
    const dx = s.x[t] - s.x[i], dz = s.z[t] - s.z[i], d = Math.hypot(dx, dz);
    if (d <= (ranged ? rng * 0.85 : w.rules.melee.reach * 0.9)) return [0, 0];
    let sp = w.rules.units[s.side[i]][s.type[i]].speed * w.map.speedMult(s.x[i], s.z[i]);
    if (s.chargeUntil[i] > w.time || s.marchUntil[i] > w.time) sp *= w.rules.group.chargeSpeed;   // 돌진·강행군
    return [dx / d * sp, dz / d * sp];
  }
  if (s.hasPursuit[i]) {                                   // 정면 병사: 120 m 안 적 무리로 다가간다
    const dx = s.pursuitX[i] - s.x[i], dz = s.pursuitZ[i] - s.z[i], d = Math.hypot(dx, dz);
    if (d > 1) { const sp = w.rules.units[s.side[i]][s.type[i]].speed * w.map.speedMult(s.x[i], s.z[i]) * (s.marchUntil[i] > w.time ? w.rules.group.chargeSpeed : 1); return [dx / d * sp, dz / d * sp]; }   // 강행군도 먹는다
  }
  const kind = s.goalKind[i];
  if (kind === GOAL.SECTOR && s.state[i] === STATE.FRONT) return [0, 0];   // 정면 병사는 자리로 돌아가지 않고 선다
  if (kind === GOAL.NONE) return [0, 0];
  const gx = s.goalX[i], gz = s.goalZ[i];
  const dx = gx - s.x[i], dz = gz - s.z[i];
  const d = Math.hypot(dx, dz);
  if (d < ARRIVE || (s.state[i] === STATE.FRONT && d < HOLD_RADIUS)) {
    if (kind === GOAL.SECTOR && !s.rallyPhase[i] && s.state[i] !== STATE.FRONT) s.state[i] = STATE.FRONT;
    return [0, 0];
  }
  let speed = w.rules.units[s.side[i]][s.type[i]].speed * w.map.speedMult(s.x[i], s.z[i]) * Math.min(1, d / SLOW_RADIUS);
  if (s.group[i] >= 0 && d > 2) speed *= w.rules.group.catchUp;                 // 쐐기 자리에서 처지면 따라잡는다
  if (s.chargeUntil[i] > w.time || s.marchUntil[i] > w.time) speed *= w.rules.group.chargeSpeed;   // 쐐기가 풀린 돌진·강행군(casts.js)
  if (d < NEAR_DIRECT || pastFieldTarget(w, i, gx, gz)) return [dx / d * speed, dz / d * speed];
  const field = fieldFor(w, i);
  if (!field) return [dx / d * speed, dz / d * speed];
  let dir = fieldDir(field, w.map, s.x[i], s.z[i]);
  if (!dir.dx && !dir.dz) return [dx / d * speed, dz / d * speed];
  // 길 폭(보완 1): 병사마다 옆으로 lane m 비킨 점에서 흐름장을 읽어, 같은 거점에서 나와도 나란한 여러 길로 걷는다.
  const lane = s.lane[i], ox = s.x[i] - dir.dz * lane, oz = s.z[i] + dir.dx * lane;
  if (w.map.walkable(ox, oz)) {
    const d2 = fieldDir(field, w.map, ox, oz);
    if (d2.dx || d2.dz) dir = d2;
  }
  return [dir.dx * speed, dir.dz * speed];
}

// 흐름장은 거점 가운데·"그 자리" 한가운데로 이끄는데, 자기 자리는 거기서 떨어져 있다(거점이면 가운데에서 반지름의 절반까지).
// 흐름장이 이끄는 곳까지 자기 자리보다 가깝게(NEAR_DIRECT 여유) 왔으면 흐름장 대신 자리로 곧장 간다 — 안 그러면 가운데에 닿았다가
// 자리 쪽으로 몇 걸음 나가면 흐름장이 다시 가운데로 되돌려, 25 m 넘게 떨어진 자리의 병사가 가운데에 갇혀 뭉쳤다(2026-11-08, 본진 수비대·승점).
function pastFieldTarget(w, i, gx, gz) {
  const s = w.soldiers, k = s.goalKind[i], x = s.x[i], z = s.z[i];
  let cx, cz;
  if (k === GOAL.STRONGHOLD) { const st = w.strongholds[s.goalId[i]]; if (!st) return false; cx = st.x; cz = st.z; }
  else if (k === GOAL.POINT && s.goalId[i] >= 0) { const p = w.fields.points[s.goalId[i]]; if (!p) return false; cx = p.x; cz = p.z; }
  else return false;   // 구역 선분: 자리 깊이가 최대 28 m라 거의 안 걸리고, 곧장 가게 하면 정면 싸움이 달라져(밀어붙이기가 늦음) 그대로 둔다
  return Math.hypot(x - cx, z - cz) <= Math.hypot(gx - cx, gz - cz) + NEAR_DIRECT;
}

function fieldFor(w, i) {
  const s = w.soldiers;
  if (s.goalKind[i] === GOAL.SECTOR) return w.fields.sector[s.goalId[i]];
  if (s.goalKind[i] === GOAL.STRONGHOLD) return w.strongholdField(s.goalId[i]);
  if (s.goalKind[i] === GOAL.POINT && s.goalId[i] >= 0) return w.pointField(s.goalId[i]);   // "그 자리"로 보낸 병사(그 밖의 점 목표는 곧장)
  return null;
}

export function stepMovement(w) {
  const s = w.soldiers, m = w.rules.movement, dt = w.rules.dt, map = w.map;
  const spacing = m.spacing, cap = m.neighborCap, keep = m.damping;
  const holds = w._holds ?? (w._holds = w.rules.units.flatMap(side => side.map(u => (u.holdsLine ? 1 : 0))));
  const gap = w._gap ?? (w._gap = w.rules.units.flatMap(side => side.map(u => u.spacing ?? spacing)));   // 병종마다 간격(고블린 떼는 좁게) — 둘 사이는 평균
  const NT = w.rules.units[0].length;   // 편마다 병종 수(공성 포함) — holds·gap은 편 × NT + 병종
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    s.px[i] = s.x[i]; s.pz[i] = s.z[i];
    const [dvx, dvz] = desiredVelocity(w, i);
    s.vx[i] = s.vx[i] * keep + dvx * (1 - keep);
    s.vz[i] = s.vz[i] * keep + dvz * (1 - keep);

    // 간격: 같은 편끼리 밀고(뒤에서 밀면 앞이 밀린다, 보완 6), 적끼리도 몸이 부딪힌다(보완 4)
    let pushX = 0, pushZ = 0, seen = 0;
    const xi = s.x[i], zi = s.z[i], side = s.side[i], cav = s.type[i] === CAVALRY, gi = gap[side * NT + s.type[i]];
    const cs = s.cellSize, gc = s.gcols, gr = s.grows, head = s.head, next = s.next, X = s.x, Z = s.z;
    const c0 = Math.max(0, Math.floor((xi - spacing) / cs)), c1 = Math.min(gc - 1, Math.floor((xi + spacing) / cs));
    const r0 = Math.max(0, Math.floor((zi - spacing) / cs)), r1 = Math.min(gr - 1, Math.floor((zi + spacing) / cs));
    scan: for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++)
        for (let j = head[rr * gc + cc]; j !== -1; j = next[j]) {
          if (j === i) continue;
          const ddx = xi - X[j], ddz = zi - Z[j], d2 = ddx * ddx + ddz * ddz, pair = (gi + gap[s.side[j] * NT + s.type[j]]) / 2;
          if (d2 >= pair * pair) continue;
          let share = PUSH_SHARE;
          if (cav) {                                           // 기병: 버팀 아닌 적은 지나가고, 우리 보병은 약하게 밀고 지나간다
            if (s.side[j] !== side) { if (!holds[s.side[j] * NT + s.type[j]] || !s.braced[j]) continue; }   // 버티지 못하는 창은 밀고 지나간다
            else if (s.type[j] !== CAVALRY) share *= w.rules.behavior.cavFriendPush;
          }
          if (++seen > cap) break scan;
          if (d2 < 1e-8) { pushX += (i < j ? 1 : -1) * pair * 0.5; continue; }
          const d = Math.sqrt(d2), overlap = (pair - d) * share;
          pushX += ddx / d * overlap; pushZ += ddz / d * overlap;
        }
    if (s.inContact[i]) { pushX *= FIGHT_PUSH; pushZ *= FIGHT_PUSH; }
    const pl = Math.hypot(pushX, pushZ);
    if (pl > m.maxPush) { pushX *= m.maxPush / pl; pushZ *= m.maxPush / pl; }

    let nx = xi + s.vx[i] * dt + pushX, nz = zi + s.vz[i] * dt + pushZ;
    if (!map.walkable(nx, nz)) {
      if (map.walkable(nx, zi)) nz = zi;
      else if (map.walkable(xi, nz)) nx = xi;
      else { nx = xi; nz = zi; }
    }
    if (!map.walkable(nx, nz)) [nx, nz] = nearestWalkable(map, nx, nz);
    const moved = Math.hypot(nx - xi, nz - zi);              // 돌격 거리: 빨리 달리는 동안만 쌓인다
    s.runDist[i] = moved / dt > w.rules.units[s.side[i]][s.type[i]].speed * 0.6 ? s.runDist[i] + moved : 0;
    s.x[i] = nx; s.z[i] = nz;
    if (!s.inContact[i] && !s.wedge[i] && s.vx[i] * s.vx[i] + s.vz[i] * s.vz[i] > 0.01) s.facing[i] = Math.atan2(s.vz[i], s.vx[i]);
  }
}

// 가장 가까운 걸을 수 있는 칸의 가운데(나선으로 찾음).
export function nearestWalkable(map, x, z) {
  const c0 = Math.min(map.cols - 1, Math.max(0, Math.floor(x / map.cell))), r0 = Math.min(map.rows - 1, Math.max(0, Math.floor(z / map.cell)));
  for (let k = 0; k < Math.max(map.cols, map.rows); k++)
    for (let dr = -k; dr <= k; dr++)
      for (let dc = -k; dc <= k; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== k) continue;
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) continue;
        const cx = (c + 0.5) * map.cell, cz = (r + 0.5) * map.cell;
        if (map.walkable(cx, cz)) return [cx, cz];
      }
  return [x, z];
}
