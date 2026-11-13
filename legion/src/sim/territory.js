// 땅(설계서 §4 — 영지 규칙): 지역 깃발 점령과 이어짐. rules.capture.every틱마다 깃발 radius m 원 안의 산 병사 무게를 편마다 센다
// (달아나는 FLEE·ROUT는 빼고). 한 편만 있으면: 제 땅은 hold를 채우고, 적 땅은 hold를 깎아 0이면 중립, 중립 땅은 그 편 땅과 이웃해야
// 잡는다(다른 편이 잡던 중이면 먼저 prog를 0까지). 둘 이상(중립 포함)이면 겨룸 — 진전 없음. 소굴이 살아 있는 지역은 아무도 못 잡는다.
// 본진은 2단계에서 뺏기지 않는다(성채가 오는 3단계에서 다시 정한다). 이어짐 = 본진에서 제 땅 이웃으로 너비 우선.
import { forEachNear, STATE } from './soldiers.js';
import { campAlive } from './camps.js';

export function makeTerritory(map) {
  if (!map.regions) return null;
  return map.regions.map(g => ({ owner: g.home, hold: g.home >= 0 ? 1 : 0, prog: 0, capturer: -1, connected: [false, false], contested: false, siege: 0 }));   // siege: 포위 시계 s(6-1단계)
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

function setOwner(w, g, side, lost, quiet = false) {   // quiet: 땅 알림 없이(포위로 넘어갈 때는 포위 알림 하나만 — 6-1단계 최종 검토)
  const t = w.territory[g.id];
  t.owner = side; t.hold = side >= 0 ? 1 : 0; t.prog = 0; t.capturer = -1;
  const kind = side >= 0 ? 'gain' : 'lose', who = side >= 0 ? side : lost;
  w.events.push({ kind, region: g.id, side: who });
  if (who === 0 && !quiet) w.notices.push({ side: 0, kind: 'land', text: `${side >= 0 ? '땅을 얻었다' : '땅을 잃었다'}: ${g.name}`, at: w.time, x: g.x, z: g.z });
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
  if (stepSiege(w, dt)) relink(w);                                  // 포위(6-1단계)
}

// 포위(6-1단계, 영지 updateSiege 규칙): 성채와 끊긴 우리 땅 덩어리(서로 이웃한 끊긴 땅)의 둘레 — 덩어리 밖 이웃 — 가 모두 적 편이면
// 덩어리 시계 = 덩어리 안 가장 작은 값 + dt, 아니면 0. rules.siege.seconds에 닿으면 덩어리째 적 땅(점령 진행은 지운다). 주인 없는 땅·이어진 땅은 0.
// 알림(편 0만, 자리 붙음): 시작 때 포위당함(encircled)·포위함(encircle), 넘어갈 때 잃음(siegeLost)·얻음(siegeGain). 넘어간 것이 있으면 true.
export function stepSiege(w, dt) {
  const T = w.territory, R = w.map.regions, n = R.length, limit = w.rules.siege.seconds;
  let flipped = false;
  const tell = (side, kind, text, g) => { if (side === 0) w.notices.push({ side: 0, kind, text, at: w.time, x: g.x, z: g.z }); };
  for (const side of [0, 1]) {
    if (flipped) relink(w);                                         // 앞 편에서 넘어간 땅의 이어짐을 다시(낡은 이어짐으로 거짓 포위 알림 — 6-1단계 최종 검토)
    const seen = new Uint8Array(n), foe = 1 - side;
    for (let g0 = 0; g0 < n; g0++) {
      if (seen[g0] || T[g0].owner !== side || T[g0].connected[side]) continue;
      const comp = [g0];
      seen[g0] = 1;
      let ring = true;
      for (let k = 0; k < comp.length; k++) for (const m of R[comp[k]].neighbors) {
        if (T[m].owner === side) { if (!seen[m]) { seen[m] = 1; comp.push(m); } }
        else if (T[m].owner !== foe) ring = false;
      }
      const t = ring ? Math.min(...comp.map(g => T[g].siege)) + dt : 0;
      for (const g of comp) T[g].siege = t;
      if (!ring) continue;
      const rg = R[g0], many = comp.length > 1 ? ` ${comp.length}곳` : '';
      if (t <= dt + 1e-9) {
        tell(side, 'encircled', `포위당했다 — ${limit}초 안에 풀지 못하면 땅을 잃는다`, rg);
        tell(foe, 'encircle', `적 땅을 포위했다 — ${limit}초 버티면 우리 땅`, rg);
      }
      if (t >= limit - 1e-9) {
        for (const g of comp) { setOwner(w, R[g], foe, side, true); w.events.push({ kind: 'lose', region: g, side }); T[g].siege = 0; }
        tell(side, 'siegeLost', `포위된 땅${many}을 잃었다`, rg);
        tell(foe, 'siegeGain', `포위한 땅${many}을 얻었다`, rg);
        flipped = true;
      }
    }
  }
  for (const t of T) if (t.owner < 0 || t.connected[t.owner]) t.siege = 0;
  return flipped;
}
