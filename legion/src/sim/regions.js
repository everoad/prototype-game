// 지역(설계서 §5): 맵 자료의 절반 표(half)에서 지역 25곳을 만들고, 칸마다 어느 지역인지(가장 가까운 깃발), 이웃, 그리기용 다각형.
// 편 1 쪽 지역은 (i, 4 − j)에 비틀기 (dx, −dz) — 위아래 뒤집기. 가운데 줄(j 2)은 제 맞은편이다.

export const ROLE_NAMES = {
  home: '본진', gold: '금광 지대', forest: '숲', village: '마을', fort: '요새', altar: '제단',
  ley: '마나 샘', ranch: '말 목장 마을', ruins: '고대 유적', cliffs: '절벽 둥지', volcano: '화산',
};
// 그 땅이 주는 특수 병종(6단계)
export const LAND_UNITS = { ley: '마법사', ranch: '기사', ruins: '골렘', cliffs: '그리폰', volcano: '용' };

// 지역 목록(id 차례: half 차례로 편 0 쪽, 바로 뒤에 맞은편 — 가운데 줄은 하나만).
export function makeRegions(def) {
  const { grid, half, depth } = def, regions = [];
  for (const [i, j, role, camp, dx, dz] of half) {
    const make = (jj, z, mirror) => ({
      id: regions.length, i, j: jj, role, camp, x: grid.x[i] + dx, z, mirror,
      home: role === 'home' ? (mirror ? 1 : 0) : -1, land: LAND_UNITS[role] ? role : null, name: ROLE_NAMES[role], neighbors: [], twin: -1,
    });
    const a = make(j, grid.z[j] + dz, false);
    regions.push(a);
    if (j === 2) { a.twin = a.id; continue; }
    const b = make(4 - j, depth - (grid.z[j] + dz), true);
    regions.push(b);
    a.twin = b.id; b.twin = a.id;
  }
  return regions;
}

// 칸마다 가장 가까운 깃발(같은 거리면 작은 id), 이웃(가로·세로로 맞닿은 칸이 다른 지역).
export function assignRegions(regions, cols, rows, cell) {
  const regionOf = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * cell, z = (r + 0.5) * cell;
    let best = 0, bd = Infinity;
    for (const g of regions) { const d = (x - g.x) ** 2 + (z - g.z) ** 2; if (d < bd) { bd = d; best = g.id; } }
    regionOf[r * cols + c] = best;
  }
  const nb = regions.map(() => new Set());
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = regionOf[r * cols + c];
    if (c + 1 < cols) { const b = regionOf[r * cols + c + 1]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
    if (r + 1 < rows) { const b = regionOf[(r + 1) * cols + c]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  }
  regions.forEach((g, k) => { g.neighbors = [...nb[k]].sort((a, b) => a - b); });
  return regionOf;
}

// 반평면 a x + b z <= c 쪽만 남긴다(볼록 다각형 자르기).
function clip(poly, a, b, c) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length], fp = a * P[0] + b * P[1] - c, fq = a * Q[0] + b * Q[1] - c;
    if (fp <= 0) out.push(P);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}

// 지역 다각형 [[x, z], …](그리기용): 판 네모를 다른 깃발과의 이등분선으로 자른 볼록 다각형. inset m만큼 안으로(주인 선).
export function regionPolygon(map, id, inset = 0) {
  const s = map.regions[id], W = map.width, D = map.depth;
  let poly = [[inset, inset], [W - inset, inset], [W - inset, D - inset], [inset, D - inset]];
  for (const o of map.regions) if (o !== s) {
    const a = o.x - s.x, b = o.z - s.z, len = Math.hypot(a, b);
    poly = clip(poly, a, b, (o.x ** 2 + o.z ** 2 - s.x ** 2 - s.z ** 2) / 2 - inset * len);
  }
  return poly;
}
