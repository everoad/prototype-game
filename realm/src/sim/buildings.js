// 건물 한 틱: 짓기(일꾼 수만큼 빠르게), 생산 줄·연구, 성채·요새·감시탑 화살.
import { UNITS, RESEARCH } from './rules.js';
import { spawnUnit, alert, pushOut } from './world.js';
import { forNear, launch, setOrder } from './units.js';

export function updateBuildings(w, dt) {
  const { rules } = w;
  for (const b of w.buildings) {
    if (!b.alive) continue;
    const t = b.t;
    if (!b.done) {
      const n = Math.min(4, b.builders);
      if (n > 0) {
        const rate = (1 + rules.buildRateExtra * (n - 1)) / t.time;
        b.progress = Math.min(1, b.progress + rate * dt);
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * rate * dt);
        if (b.progress >= 1) { b.done = true; alert(w, b.side, 'built', `${t.name} 완성`, b.x, b.z); w.events.push({ kind: 'built', id: b.id, time: w.time }); }
      }
      b.builders = 0;
      continue;
    }
    if (t.shoot && !b.ruined && !b.dormant) shoot(w, b, dt);
    const item = b.queue[0];
    if (!item) continue;
    const S = w.sides[b.side];
    if (item.kind === 'unit') {
      const ut = UNITS[item.key];
      if (!item.started) {
        if (S.pop + ut.pop > S.popCap) { alert(w, b.side, 'pop', '인구가 가득 찼습니다 — 마을을 잡으면 늘어납니다'); continue; }
        item.started = true;
        S.pop += ut.pop;                                          // 자리를 미리 잡는다
      }
      item.left -= dt;
      if (item.left <= 0) {
        b.queue.shift();
        S.pop -= ut.pop;
        const tx = b.rally?.x ?? w.map.size / 2, tz = b.rally?.z ?? w.map.size / 2;
        const a = Math.atan2(tz - b.z, tx - b.x), rr = b.r + ut.r + 1.5;
        const u = spawnUnit(w, b.side, item.key, b.x + Math.cos(a) * rr, b.z + Math.sin(a) * rr);
        u.facing = a;
        pushOut(w, u);
        S.stats.trained[item.key] = (S.stats.trained[item.key] ?? 0) + 1;
        if (b.rally) setOrder(w, u, { kind: 'move', x: b.rally.x + (w.rng() - 0.5) * 6, z: b.rally.z + (w.rng() - 0.5) * 6, cx: b.rally.x, cz: b.rally.z, n: 6 });
        w.events.push({ kind: 'trained', id: u.id, side: b.side, time: w.time });
      }
    } else {
      item.left -= dt;
      if (item.left <= 0) {
        b.queue.shift();
        S.research.add(item.key);
        S.researching.delete(item.key);
        alert(w, b.side, 'research', `${RESEARCH[item.key].name} 완료`, b.x, b.z);
      }
    }
  }
}

function shoot(w, b, dt) {
  const sh = b.t.shoot;
  b.cd -= dt;
  b.thinkIn -= dt;
  let tg = b.target >= 0 ? w.byId.get(b.target) : null;
  const inRange = e => e && e.alive && e.side !== b.side && Math.hypot(e.x - b.x, e.z - b.z) <= sh.range + b.r + e.t.r;
  if (!inRange(tg)) tg = null;
  if (!tg && b.thinkIn <= 0) {
    b.thinkIn = 0.4;
    let bd = Infinity;
    forNear(w, b.x, b.z, sh.range + b.r + 3, e => {
      if (e.side === b.side || (e.flying && !sh.hitsAir)) return;
      const d = Math.hypot(e.x - b.x, e.z - b.z) - e.t.r;
      if (d <= sh.range + b.r && d < bd) { bd = d; tg = e; }
    });
  }
  b.target = tg ? tg.id : -1;
  if (tg && b.cd <= 0) {
    b.cd = sh.cd;
    b.lastAttack = w.time;
    launch(w, b, tg, sh.dmg, sh);
  }
}
