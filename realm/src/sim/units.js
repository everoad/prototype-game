// 유닛 한 틱: 노릴 것 고르기(0.3초마다) → 움직이기 → 치기/고치기/짓기 → 서로 밀어내기. 투사체.
import { damageMult } from './rules.js';
import { fieldTo, flowDir, clearLine, passable, snapCell } from './path.js';
import { killEntity, alert, pushOut, canSee } from './world.js';

const GRID = 16;

export function setOrder(w, u, o, queue = false) {
  if (queue && u.order.kind !== 'idle' && u.order.kind !== 'hold') { u.queue.push(o); return; }
  u.queue.length = 0;
  startOrder(w, u, o);
}
function startOrder(w, u, o) {
  u.order = o; u.target = o.kind === 'attack' ? o.target : -1; u.returning = false; u.bestD = Infinity; u.bestAt = w.time; u.thinkIn = 0;
  u.fieldCell = -1; u.field = null;
  if (o.kind === 'idle' || o.kind === 'hold') { u.homeX = u.x; u.homeZ = u.z; }
}
function finishOrder(w, u) {
  const next = u.queue.shift();
  startOrder(w, u, next ?? { kind: 'idle' });
}

// ─── 격자 ───
function buildGrid(w) {
  const cols = Math.ceil(w.map.size / GRID);
  let g = w.grid;
  if (!g || g.next.length < w.units.length) g = w.grid = { cols, head: new Int32Array(cols * cols), next: new Int32Array(Math.max(1024, w.units.length * 2)) };
  g.head.fill(-1);
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (!u.alive) continue;
    const c = Math.min(cols - 1, Math.max(0, Math.floor(u.x / GRID))), r = Math.min(cols - 1, Math.max(0, Math.floor(u.z / GRID)));
    g.next[i] = g.head[r * cols + c];
    g.head[r * cols + c] = i;
  }
}
export function forNear(w, x, z, rad, fn) {
  const g = w.grid, cols = g.cols, us = w.units;
  const c0 = Math.max(0, Math.floor((x - rad) / GRID)), c1 = Math.min(cols - 1, Math.floor((x + rad) / GRID));
  const r0 = Math.max(0, Math.floor((z - rad) / GRID)), r1 = Math.min(cols - 1, Math.floor((z + rad) / GRID));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
    for (let i = g.head[r * cols + c]; i !== -1; i = g.next[i]) if (us[i].alive && fn(us[i]) === false) return;
}

const radiusOf = e => (e.ent === 'building' ? e.r : e.t.r);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const SLOP = 2.5;                                          // 건물이 막은 칸은 반지름보다 조금 넓다
const reachOf = (u, tg) => u.t.range + u.t.r + radiusOf(tg) + (tg.ent === 'building' ? SLOP : 0);
// 건물로 갈 때는 가장 가까운 둘레 지점으로(가운데 칸은 막혀 있다)
const rim = (u, b) => { const d = Math.hypot(u.x - b.x, u.z - b.z) || 1; return { x: b.x + (u.x - b.x) / d * (b.r + 3), z: b.z + (u.z - b.z) / d * (b.r + 3) }; };

export function canHit(u, tg) {
  if (!tg || !tg.alive || tg.side === u.side || u.t.dmg <= 0 || tg.ruined || tg.dormant) return false;
  if (tg.ent === 'unit' && tg.flying && !u.t.hitsAir) return false;
  return true;
}

// 노릴 적: 가까운 것, 치는 유닛 먼저, 일꾼·사제 다음, 건물은 나중(투석기는 건물 먼저).
function acquire(w, u, rad) {
  let best = null, bs = Infinity;
  const siege = u.t.ground;
  forNear(w, u.x, u.z, rad + 4, e => {
    if (!canHit(u, e)) return;
    const d = dist(u, e) - e.t.r;
    if (d > rad) return;
    if (u.t.minRange && d < u.t.minRange) return;
    let s = d + (e.t.worker || e.t.dmg <= 0 ? 8 : 0) + (siege ? 25 : 0);
    if (d <= u.t.range + u.t.r) s -= 10;
    if (s < bs) { bs = s; best = e; }
  });
  for (const b of w.buildings) {
    if (!canHit(u, b)) continue;
    const d = dist(u, b) - b.r;
    if (d > rad) continue;
    if (u.t.minRange && d < u.t.minRange) continue;
    let s = d + (b.t.shoot ? 4 : 20) - (siege ? 30 : 0);
    if (d <= u.t.range + u.t.r) s -= 10;
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}

function think(w, u) {
  const o = u.order, t = u.t;
  if (t.heal) {                                             // 사제: 가장 다친 아군
    let best = null, br = 1;
    forNear(w, u.x, u.z, t.range + 6, a => {
      if (a.side !== u.side || a === u || a.hp >= a.maxHp) return;
      if (dist(u, a) > t.range + u.t.r + a.t.r) return;
      const ratio = a.hp / a.maxHp;
      if (ratio < br) { br = ratio; best = a; }
    });
    u.target = best ? best.id : -1;
    return;
  }
  if (t.worker && o.kind !== 'attack') return;
  if (o.kind === 'attack') {
    const tg = w.byId.get(o.target);
    if (!tg || !tg.alive || !canHit(u, tg) || (tg.ent === 'unit' && !canSee(w, u.side, tg.x, tg.z))) finishOrder(w, u);
    return;
  }
  if (o.kind === 'move' || u.returning) { u.target = -1; return; }
  const cur = w.byId.get(u.target);
  const sight = t.sight * w.rules.acquire;
  if (cur && canHit(u, cur) && dist(u, cur) <= reachOf(u, cur)) return;              // 닿아 있으면 그대로
  const rad = o.kind === 'hold' ? t.range + t.r : sight;
  const nb = acquire(w, u, rad);
  if (nb) u.target = nb.id;
  else if (!(cur && canHit(u, cur) && dist(u, cur) <= sight * 1.3 && o.kind !== 'hold')) u.target = -1;
}

export function updateUnits(w, dt) {
  buildGrid(w);
  const { rules, paths, map } = w;
  const all = w.units, n = all.length, back = w.tick % 2 === 1;   // 틱마다 순서를 뒤집는다 — 먼저 계산되는 편이 늘 먼저 치지 않게
  for (let k = 0; k < n; k++) {
    const u = all[back ? n - 1 - k : k];
    if (!u.alive) continue;
    u.px = u.x; u.pz = u.z;
    u.cd -= dt;
    u.thinkIn -= dt;
    if (u.t.regen) u.hp = Math.min(u.maxHp, u.hp + u.t.regen * dt);
    if (u.camp !== undefined && w.time - u.lastHit > 5) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt);   // 소굴 괴물은 싸움이 끝나면 낫는다
    if (u.thinkIn <= 0) { u.thinkIn = 0.3; think(w, u); }
    const t = u.t, o = u.order;
    let dest = null, stop = false;
    const tg = u.target >= 0 ? w.byId.get(u.target) : null;
    if (t.heal && tg && tg.alive) {                           // 사제
      const d = dist(u, tg), reach = t.range + t.r + tg.t.r;
      if (d <= reach) {
        stop = o.kind !== 'move';
        if (u.cd <= 0) { tg.hp = Math.min(tg.maxHp, tg.hp + t.heal); u.cd = t.cd; u.lastAttack = w.time; w.events.push({ kind: 'heal', x: tg.x, z: tg.z, time: w.time }); }
      } else if (o.kind === 'idle' && Math.hypot(u.x - u.homeX, u.z - u.homeZ) < rules.leash) dest = tg;
    }
    if (!t.heal && tg && canHit(u, tg)) {
      const d = dist(u, tg), reach = reachOf(u, tg);
      if (d <= reach) {
        stop = true;
        u.facing = Math.atan2(tg.z - u.z, tg.x - u.x);
        if (u.cd <= 0 && !(t.minRange && d - radiusOf(tg) < t.minRange)) attack(w, u, tg);
      } else if (o.kind === 'hold') u.target = -1;
      else if (o.kind === 'idle' && Math.hypot(u.x - u.homeX, u.z - u.homeZ) > (u.camp !== undefined ? rules.campLeash : rules.leash)) { u.target = -1; u.returning = true; }
      else dest = tg.ent === 'building' ? rim(u, tg) : tg;
    } else if (tg && !t.heal) u.target = -1;
    if (!dest && !stop) {
      if (o.kind === 'move' || o.kind === 'amove') {
        const d = Math.hypot(o.x - u.x, o.z - u.z);
        if (d < 1.0) finishOrder(w, u);
        else {
          if (d < u.bestD - 0.5) { u.bestD = d; u.bestAt = w.time; }
          const nearCenter = Math.hypot(o.cx - u.x, o.cz - u.z) < Math.sqrt(o.n ?? 1) * 2.4 + 3;
          if (w.time - u.bestAt > (nearCenter ? 1.2 : 6)) finishOrder(w, u);   // 막혀 더 못 다가가면 거기서 멈춘다
          else dest = o;
        }
      } else if (o.kind === 'build' || o.kind === 'repair') {
        const b = w.byId.get(o.target);
        if (!b || !b.alive || (o.kind === 'build' && b.done) || (o.kind === 'repair' && b.hp >= b.maxHp)) finishOrder(w, u);
        else if (dist(u, b) <= b.r + t.r + 1.4 + SLOP) {
          stop = true;
          u.facing = Math.atan2(b.z - u.z, b.x - u.x);
          if (o.kind === 'build') b.builders++;
          else { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rules.repairPerSec * dt); u.lastAttack = w.time; if (b.ruined && b.hp >= b.maxHp * rules.fort.revive) b.ruined = false; }
        } else dest = rim(u, b);
      } else if (o.kind === 'idle' && u.returning) {
        if (Math.hypot(u.x - u.homeX, u.z - u.homeZ) < 1.5) u.returning = false;
        else dest = { x: u.homeX, z: u.homeZ };
      }
    }
    // 움직이기
    let dx = 0, dz = 0;
    if (dest && !stop) {
      const dd = Math.hypot(dest.x - u.x, dest.z - u.z);
      if (u.flying || dd < 1e-3) { dx = (dest.x - u.x) / (dd || 1); dz = (dest.z - u.z) / (dd || 1); }
      else if (dd < 140 && clearLine(paths, u.x, u.z, dest.x, dest.z, t.r * 0.8)) { dx = (dest.x - u.x) / dd; dz = (dest.z - u.z) / dd; }
      else {
        // 흐름장 목표: 무리 이동은 무리 가운데, 쫓기는 3칸 묶음, 그 밖은 2칸 묶음 — 같은 흐름장을 나눠 쓴다
        const grp = dest === o && o.cx !== undefined;
        const raw = map.cellOf(grp ? o.cx : dest.x, grp ? o.cz : dest.z);
        const cell = snapCell(paths, raw, dest.ent === 'unit' ? 3 : 2);
        if (u.fieldCell !== cell || !u.field || u.fieldVer !== paths.version) {
          const f = paths.budget > 0 || paths.cache.has(cell) ? fieldTo(paths, cell) : null;
          if (f && !paths.cache.has(cell)) paths.budget--;
          if (f) { u.field = f; u.fieldCell = cell; u.fieldVer = paths.version; }
        }
        const dir = u.field && u.fieldCell === cell ? flowDir(paths, u.field, u.x, u.z) : null;
        if (dir) { dx = dir[0]; dz = dir[1]; } else { dx = (dest.x - u.x) / dd; dz = (dest.z - u.z) / dd; }
      }
    }
    const sp = t.speed;
    u.vx += (dx * sp - u.vx) * 0.5; u.vz += (dz * sp - u.vz) * 0.5;
    if (!dest || stop) { u.vx *= 0.3; u.vz *= 0.3; }
    let nx = u.x + u.vx * dt, nz = u.z + u.vz * dt;
    if (!u.flying) {
      if (!passable(paths, map.cellOf(nx, u.z))) nx = u.x;
      if (!passable(paths, map.cellOf(nx, nz))) nz = u.z;
    }
    nx = Math.min(map.size - 2, Math.max(2, nx)); nz = Math.min(map.size - 2, Math.max(2, nz));
    const moved = Math.hypot(nx - u.x, nz - u.z);
    u.runDist = moved > 0.02 ? u.runDist + moved : u.runDist * 0.8;
    if (moved > 0.05 && !stop) u.facing = Math.atan2(nz - u.z, nx - u.x);
    u.x = nx; u.z = nz;
  }
  // 서로 밀어내기(땅 유닛끼리, 날짐승끼리). 가만히 선 쪽이 더 비켜 준다.
  const sep = rules.separation, us = w.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (!a.alive) continue;
    forNear(w, a.x, a.z, a.t.r + 3.5, b => {
      if (b.id <= a.id || b.flying !== a.flying) return;
      const rr = a.t.r + b.t.r, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return;
      const d = Math.sqrt(d2) || 0.01, push = (rr - d) * sep;
      const nx = d2 > 0 ? dx / d : 1, nz = d2 > 0 ? dz / d : 0;
      const ma = a.vx * a.vx + a.vz * a.vz > 1 ? 1 : 2, mb = b.vx * b.vx + b.vz * b.vz > 1 ? 1 : 2;
      const ka = ma / (ma + mb), kb = mb / (ma + mb);
      const ax = a.x - nx * push * ka, az = a.z - nz * push * ka, bx = b.x + nx * push * kb, bz = b.z + nz * push * kb;
      if (a.flying || passable(paths, map.cellOf(ax, az))) { a.x = ax; a.z = az; }
      if (b.flying || passable(paths, map.cellOf(bx, bz))) { b.x = bx; b.z = bz; }
    });
  }
  for (const u of us) if (u.alive && !u.flying && !passable(paths, map.cellOf(u.x, u.z))) pushOut(w, u);
}

function attack(w, u, tg) {
  const t = u.t;
  let dmg = t.dmg;
  if (t.charge && u.runDist >= w.rules.chargeRun) { dmg *= w.rules.chargeMult; w.events.push({ kind: 'charge', x: tg.x, z: tg.z, time: w.time }); }
  u.runDist = 0;
  u.cd = t.cd;
  u.lastAttack = w.time;
  if (t.proj) launch(w, u, tg, dmg);
  else dealDamage(w, tg, dmg, t.kind, u);
}

export function launch(w, from, tg, dmg, shot = from.t) {
  const ground = !!shot.ground;
  const d = Math.hypot(tg.x - from.x, tg.z - from.z);
  w.projectiles.push({ x: from.x, z: from.z, sx: from.x, sz: from.z, tx: tg.x, tz: tg.z, target: ground ? -1 : tg.id, speed: shot.proj, dmg, kind: shot.kind,
    splash: shot.splash ?? 0, side: from.side, air: tg.ent === 'unit' && tg.flying, src: { side: from.side, type: from.type, id: from.id }, total: Math.max(1, d),
    look: from.type, fromFly: !!from.flying, alive: true });
}

export function updateProjectiles(w, dt) {
  for (const p of w.projectiles) {
    if (p.target >= 0) { const tg = w.byId.get(p.target); if (tg && tg.alive) { p.tx = tg.x; p.tz = tg.z; } }
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), stepLen = p.speed * dt;
    if (d <= stepLen) {
      p.x = p.tx; p.z = p.tz; p.alive = false;
      if (p.splash > 0) splash(w, p.tx, p.tz, p.splash, p.dmg, p.kind, p.side, p.air, p.src);
      else { const tg = w.byId.get(p.target); if (tg && tg.alive) dealDamage(w, tg, p.dmg, p.kind, p.src); }
    } else { p.x += dx / d * stepLen; p.z += dz / d * stepLen; }
  }
  if (w.projectiles.some(p => !p.alive)) w.projectiles = w.projectiles.filter(p => p.alive);
}

// 범위 피해: 가운데 100% → 가장자리 50%. 공중을 노린 것은 공중만, 땅을 노린 것은 땅과 건물만.
export function splash(w, x, z, rad, dmg, kind, side, air, src) {
  w.events.push({ kind: 'splash', x, z, r: rad, dmgKind: kind, time: w.time, air });
  forNear(w, x, z, rad + 3, e => {
    if (e.side === side || e.flying !== air) return;
    const d = Math.hypot(e.x - x, e.z - z) - e.t.r;
    if (d > rad) return;
    dealDamage(w, e, dmg * (1 - 0.5 * Math.max(0, d) / rad), kind, src);
  });
  if (!air) for (const b of w.buildings) {
    if (!b.alive || b.side === side) continue;
    const d = Math.hypot(b.x - x, b.z - z) - b.r;
    if (d <= rad) dealDamage(w, b, dmg * (1 - 0.5 * Math.max(0, d) / rad), kind, src);
  }
}

export function dealDamage(w, tg, dmg, kind, src) {
  if (!tg.alive) return;
  const armor = tg.ent === 'building' ? 'building' : tg.t.armor;
  tg.hp -= dmg * damageMult(kind, armor);
  tg.lastHit = w.time;
  if (src && w.firstContact < 0 && tg.ent === 'unit' && !tg.t.worker) w.firstContact = w.time;
  if (tg.side < 2) alert(w, tg.side, 'attacked', tg.ent === 'building' ? `${tg.t.name}이(가) 공격받고 있습니다` : '우리 병력이 공격받고 있습니다', tg.x, tg.z);
  // 맞은 유닛이 놀고 있으면 되친다
  if (tg.ent === 'unit' && src && src.id) {
    const att = w.byId.get(src.id);
    if (att && att.alive && tg.target < 0 && (tg.order.kind === 'idle' || tg.order.kind === 'amove') && !tg.returning && canHit(tg, att)) tg.target = att.id;
  }
  if (tg.hp > 0) return;
  if (tg.type === 'fort') {                                  // 요새는 없어지지 않고 무너진다(고치면 다시 쏜다)
    tg.hp = 0; tg.ruined = true; tg.target = -1;
    w.events.push({ kind: 'collapse', x: tg.x, z: tg.z, r: tg.r, type: 'fort', side: tg.side, time: w.time });
    if (tg.side < 2) alert(w, tg.side, 'lost', '요새가 무너졌습니다', tg.x, tg.z);
    return;
  }
  killEntity(w, tg, src);
}
