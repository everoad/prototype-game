// 건물(설계서 §4 "건물: 내 땅 아무 데나, 길을 막는다", 3단계 계획 Task 2): 발자국(반지름 r 원) 칸을 막고, 무너지면 푼다.
// 놓을 수 있는지는 canPlace가 까닭과 함께, 세우기·치우기는 addBuilding·removeBuilding(규칙 검사 없음 — 명령이 canPlace를 먼저 부른다).
import { nearestWalkable } from './movement.js';
import { GOAL, hash01 } from './soldiers.js';

const RES_PLACE = { gold: '금 자리 위에 지어야 한다', wood: '목재 자리 위에 지어야 한다', mana: '마나 자리 위에 지어야 한다' };
const fail = reason => ({ ok: false, reason });

// 건물 이름(편 1은 몬스터 이름).
export const buildingName = (def, side) => def.name[side === 1 ? 1 : 0];

// 놓을 수 있나. 채굴기는 가까운 빈 자리로 붙는다 — 돌려준 x, z가 실제 자리.
export function canPlace(w, side, type, x, z) {
  const R = w.rules, def = R.buildings[type], B = R.build, map = w.map;
  if (!Object.hasOwn(R.buildings, type)) return fail('모르는 건물');   // 'constructor'·'__proto__' 같은 원형 이름도(3단계 최종 검토)
  if (type === 'citadel') return fail('지을 수 없는 건물');
  const r = def.r, m = B.edge + r;
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < m || z < m || x > map.width - m || z > map.depth - m) return fail('판 밖');
  if (def.needs && !w.buildings.some(b => b.alive && b.side === side && b.type === def.needs && b.done)) return fail(`${buildingName(R.buildings[def.needs], side)}이(가) 먼저 있어야 한다`);
  let deposit = -1;
  if (def.on) {
    let bd = B.depositSnap * B.depositSnap;
    for (const d of map.deposits) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (d.kind === def.on && dd <= bd) { bd = dd; deposit = d.id; }
    }
    if (deposit < 0) return fail(RES_PLACE[def.on]);
    if (w.depositUse[deposit] >= 0) return fail('이미 지은 자리');
    x = map.deposits[deposit].x; z = map.deposits[deposit].z;
  }
  const g = map.regionAt ? map.regionAt(x, z) : -1;
  if (!w.territory || g < 0 || w.territory[g].owner !== side) return fail('우리 땅에만 지을 수 있다');
  if (!def.on) for (const f of map.regions) if ((f.x - x) ** 2 + (f.z - z) ** 2 < (B.flagClear + r) ** 2) return fail('깃발 둘레에는 지을 수 없다');
  for (const b of w.buildings) if (b.alive && (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + r + B.gap) ** 2) return fail('다른 건물과 겹친다');
  if (!def.on) for (const d of map.deposits) if ((d.x - x) ** 2 + (d.z - z) ** 2 < (r + B.depositClear) ** 2) return fail('자원 자리를 막는다');
  if (!footprintClear(map, x, z, r)) return fail('막힌 땅');
  return { ok: true, x, z, deposit };
}

// 발자국 칸(칸 가운데가 r 안) 모두 걸을 수 있나.
function footprintClear(map, x, z, r) {
  const cell = map.cell;
  for (let rr = Math.floor((z - r) / cell); rr <= Math.floor((z + r) / cell); rr++)
    for (let cc = Math.floor((x - r) / cell); cc <= Math.floor((x + r) / cell); cc++) {
      const cx = (cc + 0.5) * cell, cz = (rr + 0.5) * cell;
      if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r && !map.walkable(cx, cz)) return false;
    }
  return true;
}

export function addBuilding(w, side, type, x, z, { done = false, deposit = -1 } = {}) {
  const def = w.rules.buildings[type];
  const b = {
    id: w.nextBuildingId++, side, type, def, x, z, r: def.r, maxHp: def.hp, hp: done ? def.hp : def.hp * w.rules.build.startHp, done, progress: done ? 1 : 0,
    builders: 0, deposit, region: w.map.regionAt ? w.map.regionAt(x, z) : -1, queue: [], rally: null, alive: true, lastHit: -1e9, gate: null,
  };
  w.map.block(x, z, def.r, 1);
  b.gate = (() => { const [gx, gz] = nearestWalkable(w.map, x, z); return { x: gx, z: gz }; })();   // 건물 밖 가장 가까운 걸을 수 있는 칸(일꾼이 가는 곳)
  w.buildings.push(b);
  w.buildingById.set(b.id, b);
  if (deposit >= 0) w.depositUse[deposit] = b.id;
  moveOffFootprint(w, b);
  w.events.push({ kind: 'placed', id: b.id, side, type, x, z });
  return b;
}

// 막힌 칸에 걸린 목표를 밖으로: 병사의 자리 목표(새 건물 둘레로 흩어서 — 한 칸에 모두 몰려 밀치지 않게, 3단계 최종 검토), 쐐기 가운데·목표·경유점,
// 건물 집결지·문(병사 몸은 걸음이 밀어낸다 — movement.js nearestWalkable).
const SPREAD = { gap: 1.5, band: 3 };   // 흩는 띠: 새 건물 가장자리에서 gap ~ gap + band m
function moveOffFootprint(w, nb) {
  const s = w.soldiers, map = w.map, out = (x, z) => nearestWalkable(map, x, z);
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.goalKind[i] === GOAL.NONE || map.walkable(s.goalX[i], s.goalZ[i])) continue;
    const dx = s.goalX[i] - nb.x, dz = s.goalZ[i] - nb.z, a = dx || dz ? Math.atan2(dz, dx) : hash01(i * 13 + 7) * Math.PI * 2;
    const d = nb.r + SPREAD.gap + hash01(i * 17 + 3) * SPREAD.band, x = nb.x + Math.cos(a) * d, z = nb.z + Math.sin(a) * d;
    [s.goalX[i], s.goalZ[i]] = map.walkable(x, z) ? [x, z] : out(x, z);
  }
  for (const b of w.buildings) {
    if (b.rally && !map.walkable(b.rally.x, b.rally.z)) { const [x, z] = out(b.rally.x, b.rally.z); b.rally = { x, z }; }
    if (b.gate && !map.walkable(b.gate.x, b.gate.z)) { const [x, z] = out(b.x, b.z); b.gate = { x, z }; }
  }
  for (const g of w.groups) {
    if (!map.walkable(g.x, g.z)) [g.x, g.z] = out(g.x, g.z);
    if (g.target.kind === 'point' && !map.walkable(g.target.x, g.target.z)) [g.target.x, g.target.z] = out(g.target.x, g.target.z);
    if (g.via) for (const p of g.via) if (!map.walkable(p.x, p.z)) [p.x, p.z] = out(p.x, p.z);
  }
}

export function removeBuilding(w, b) {
  if (!b.alive) return;
  b.alive = false;
  w.map.block(b.x, b.z, b.r, -1);
  if (b.deposit >= 0 && w.depositUse[b.deposit] === b.id) w.depositUse[b.deposit] = -1;
  const S = w.sides[b.side];
  if (S) for (const it of b.queue) {                                // 줄 정리: 잡아 둔 인구·하던 연구(값은 돌려주지 않는다 — 무너진 것)
    if (it.kind === 'unit' && it.started) { S.reserved -= it.weight; S.pop -= it.weight; }
    if (it.kind === 'research') S.researching.delete(it.key);
  }
  b.queue.length = 0;
  if (b.type === 'citadel' && !w.result && b.side < 2) w.result = { winner: 1 - b.side, reason: 'citadel', at: w.time };   // 성채가 무너지면 판 끝
  const k = w.buildings.indexOf(b);
  if (k >= 0) w.buildings.splice(k, 1);
  w.buildingById.delete(b.id);
  w.events.push({ kind: 'collapse', id: b.id, side: b.side, type: b.type, x: b.x, z: b.z });
}

// 틱마다: 짓는 중인 건물 — 붙은 광부 수(maxBuilders까지) ÷ 조 인원 ÷ 짓는 시간만큼 나아간다.
export function stepBuildings(w) {
  const B = w.rules.build, dt = w.rules.dt;
  for (const b of w.buildings) {
    if (!b.alive) continue;
    if (!b.done) {
      const n = Math.min(B.maxBuilders, b.builders);
      if (n > 0) {
        const k = Math.min(1 - b.progress, n / B.crew / b.def.time * dt);
        b.progress += k;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * (1 - B.startHp) * k);
        if (b.progress >= 1 - 1e-9) {
          b.progress = 1; b.done = true;
          w.events.push({ kind: 'built', id: b.id, side: b.side });
          if (b.side === 0) w.notices.push({ side: 0, kind: 'built', text: `${buildingName(b.def, 0)} 완성`, at: w.time, x: b.x, z: b.z });
        }
      }
    }
    b.builders = 0;
  }
}

// (x, z)를 덮은 가장 가까운 산 건물(가운데에서 r + pad 안), 없으면 null.
export function buildingAt(w, x, z, pad = 0) {
  let best = null, bd = Infinity;
  for (const b of w.buildings) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d <= b.r + pad && d < bd) { bd = d; best = b; }
  }
  return best;
}
