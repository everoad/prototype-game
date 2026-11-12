// 땅(설계서 §4 — 영지 규칙): 지역 깃발 점령과 이어짐. rules.capture.every틱마다 깃발 radius m 원 안의 산 병사 무게를 편마다 센다
// (달아나는 FLEE·ROUT는 빼고). 한 편만 있으면: 제 땅은 hold를 채우고, 적 땅은 hold를 깎아 0이면 중립, 중립 땅은 그 편 땅과 이웃해야
// 잡는다(다른 편이 잡던 중이면 먼저 prog를 0까지). 둘 이상(중립 포함)이면 겨룸 — 진전 없음. 소굴이 살아 있는 지역은 아무도 못 잡는다.
// 본진은 2단계에서 뺏기지 않는다(성채가 오는 3단계에서 다시 정한다). 이어짐 = 본진에서 제 땅 이웃으로 너비 우선.
import { forEachNear, STATE } from './soldiers.js';
import { campAlive } from './camps.js';

export function makeTerritory(map) {
  if (!map.regions) return null;
  return map.regions.map(g => ({ owner: g.home, hold: g.home >= 0 ? 1 : 0, prog: 0, capturer: -1, connected: [false, false], contested: false }));
}

export function relink(w) {
  const T = w.territory, R = w.map.regions;
  for (const t of T) { t.connected[0] = false; t.connected[1] = false; }
  for (const side of [0, 1]) {
    const home = w.map.homes[side];
    if (T[home].owner !== side) continue;
    T[home].connected[side] = true;
    const q = [home];
    while (q.length) for (const n of R[q.shift()].neighbors) if (T[n].owner === side && !T[n].connected[side]) { T[n].connected[side] = true; q.push(n); }
  }
}

function setOwner(w, g, side, lost) {
  const t = w.territory[g.id];
  t.owner = side; t.hold = side >= 0 ? 1 : 0; t.prog = 0; t.capturer = -1;
  const kind = side >= 0 ? 'gain' : 'lose', who = side >= 0 ? side : lost;
  w.events.push({ kind, region: g.id, side: who });
  if (who === 0) w.notices.push({ side: 0, kind: 'land', text: `${side >= 0 ? '땅을 얻었다' : '땅을 잃었다'}: ${g.name}`, at: w.time, x: g.x, z: g.z });
}

export function stepTerritory(w) {
  const T = w.territory;
  if (!T) return;
  const C = w.rules.capture;
  if (w.tick % C.every !== 0) return;
  const dt = C.every * w.rules.dt, s = w.soldiers, R2 = C.radius * C.radius, units = w.rules.units;
  let changed = false;
  for (const g of w.map.regions) {
    const t = T[g.id], wt = [0, 0, 0];
    forEachNear(s, g.x, g.z, C.radius, j => {
      if (!s.alive[j] || s.state[j] === STATE.FLEE || s.state[j] === STATE.ROUT || units[s.side[j]][s.type[j]].worker) return;   // 광부는 점령 무게에 들지 않는다(3단계)
      if ((s.x[j] - g.x) ** 2 + (s.z[j] - g.z) ** 2 > R2) return;
      wt[s.side[j]] += units[s.side[j]][s.type[j]].weight;
    });
    const present = (wt[0] > 0) + (wt[1] > 0) + (wt[2] > 0);
    t.contested = present > 1;
    if (present !== 1 || wt[2] > 0 || campAlive(w, g.id)) continue;
    const side = wt[0] > 0 ? 0 : 1;
    const rate = Math.min(C.maxBoost, 1 + C.perWeight * (wt[side] - 1)) / C.seconds * dt;
    if (t.owner === side) { t.hold = Math.min(1, t.hold + rate); continue; }
    if (t.owner >= 0) {                                              // 적 땅: 먼저 중립으로(본진은 못 뺏는다)
      if (g.home >= 0) continue;
      t.hold -= rate;
      if (t.hold <= 0) { setOwner(w, g, -1, t.owner); changed = true; }
      continue;
    }
    if (!g.neighbors.some(n => T[n].owner === side)) continue;       // 중립: 우리 땅과 이웃해야
    if (t.capturer !== side) { t.prog -= rate; if (t.prog <= 0) { t.prog = 0; t.capturer = side; } continue; }
    t.prog += rate;
    if (t.prog >= 1 - 1e-9) { setOwner(w, g, side, -1); changed = true; }
  }
  if (changed) relink(w);
}
