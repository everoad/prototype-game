// 지도: 5×5 격자로 놓은 지역 25곳(보로노이), 180° 돌려 같은 판. 오른쪽 아래·왼쪽 위 모서리와 가운데가 제단.
// 칸(4 m)마다 지형(풀·바위·물)과 어느 지역인지. 좌표 (x, z), 편 0 = 왼쪽 아래.
export const GRASS = 0, ROCK = 1, WATER = 2;

const L = [75, 197, 320, 443, 565];
// 지역: [격자 i, j, 역할, 금 자리, 목재 자리, 마나 자리, 소굴, 요새]. 맞은편(4−i, 4−j)은 같은 값으로 채운다.
// 소굴(중립 괴물): 본진 곁은 비어 있고, 멀수록·가운데일수록 세다.
const HALF = [
  [0, 0, 'home', 2, 2, 1, null], [1, 0, 'gold', 3, 0, 0, null], [0, 1, 'forest', 0, 3, 0, null],
  [1, 1, 'fort', 1, 1, 0, 'wolves', true], [2, 0, 'ley', 0, 0, 2, 'goblins'], [0, 2, 'village', 1, 0, 0, 'goblins'],
  [2, 1, 'gold', 3, 0, 0, 'band'], [1, 2, 'forest', 0, 3, 0, 'band'], [3, 0, 'forest', 1, 2, 0, 'band'], [0, 3, 'gold', 2, 0, 1, 'band'],
  [4, 0, 'altar', 0, 0, 1, 'altar'], [3, 1, 'village', 1, 1, 0, 'troll'],      // 맞은편과 같은 거리: 모서리 제단, 곁 마을
  [2, 2, 'altar', 0, 0, 2, 'center', true],                                   // 가운데 제단 + 요새(자기 자신이 맞은편)
];
export const CAMPS = {
  wolves: { wolf: 3 }, goblins: { goblin: 2, wolf: 2 }, band: { goblin: 4, wolf: 2 },
  troll: { troll: 1, goblin: 3 }, altar: { troll: 2, goblin: 4 }, center: { troll: 3, goblin: 4 },
};
// 지역 깃발을 격자에서 조금씩 비튼다(맞은편은 반대로) — 반듯한 바둑판으로 안 보이게
const JITTER = { '1,0': [6, 12], '0,1': [10, -4], '1,1': [-8, 6], '2,0': [-10, 8], '0,2': [6, 10], '2,1': [12, -6], '1,2': [-6, 12], '3,0': [8, 14], '0,3': [14, 6], '4,0': [-6, 10], '3,1': [10, 4] };
// 장애물(원): 맞은편 것도 저절로 만든다.
const OBSTACLES = [
  { x: 255, z: 268, r: 17, kind: ROCK }, { x: 270, z: 248, r: 14, kind: ROCK },     // 가운데로 가는 대각선을 둘로 가른다
  { x: 320, z: 128, r: 24, kind: WATER }, { x: 128, z: 320, r: 24, kind: WATER },   // 호수
  { x: 470, z: 72, r: 15, kind: ROCK }, { x: 72, z: 470, r: 15, kind: ROCK },       // 모서리 제단 앞 바위
  { x: 395, z: 160, r: 13, kind: ROCK }, { x: 160, z: 395, r: 13, kind: ROCK },
];

export function createMap() {
  const size = 640, cell = 4, cols = size / cell, rows = size / cell;
  const terrain = new Uint8Array(cols * rows);
  const obstacles = [];
  for (const o of OBSTACLES) obstacles.push(o, { ...o, x: size - o.x, z: size - o.z });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * cell, z = (r + 0.5) * cell;
    for (const o of obstacles) if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) { terrain[r * cols + c] = o.kind; break; }
  }
  // 지역
  const regions = [];
  const add = (i, j, role, gold, wood, mana, camp, fort, mirror) => {
    const key = `${i},${j}`, jit = JITTER[mirror ? `${4 - i},${4 - j}` : key] ?? [0, 0];
    const sgn = mirror ? -1 : 1;
    regions.push({ id: regions.length, key, i, j, x: L[i] + sgn * jit[0], z: L[j] + sgn * jit[1], role, gold, wood, mana, camp, fort: !!fort,
      altar: role === 'altar', village: role === 'village', home: key === '0,0' ? 0 : key === '4,4' ? 1 : -1, neighbors: [], deposits: [], cells: 0 });
  };
  for (const [i, j, role, g, wd, m, camp, fort] of HALF) {
    add(i, j, role, g, wd, m, camp, fort, false);
    if (i !== 4 - i || j !== 4 - j) add(4 - i, 4 - j, role, g, wd, m, camp, fort, true);
  }
  const regionOf = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * cell, z = (r + 0.5) * cell;
    let best = 0, bd = Infinity;
    for (const g of regions) { const d = (x - g.x) ** 2 + (z - g.z) ** 2; if (d < bd) { bd = d; best = g.id; } }
    regionOf[r * cols + c] = best;
    regions[best].cells++;
  }
  // 이웃: 맞닿은 칸이 다른 지역이면
  const nb = regions.map(() => new Set());
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = regionOf[r * cols + c];
    if (c + 1 < cols) { const b = regionOf[r * cols + c + 1]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
    if (r + 1 < rows) { const b = regionOf[(r + 1) * cols + c]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  }
  regions.forEach((g, k) => { g.neighbors = [...nb[k]].sort((a, b) => a - b); });

  const map = { size, cell, cols, rows, terrain, regionOf, regions, obstacles, deposits: [] };
  map.cellOf = (x, z) => {
    const c = Math.floor(x / cell), r = Math.floor(z / cell);
    return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
  };
  map.regionAt = (x, z) => { const i = map.cellOf(x, z); return i < 0 ? -1 : regionOf[i]; };
  map.openAt = (x, z, rad = 0) => {                          // 지형만 본다(건물은 path.js)
    for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) {
      const i = map.cellOf(x + dx, z + dz);
      if (i < 0 || terrain[i] !== GRASS) return false;
    }
    return true;
  };

  // 자원 자리: 깃발 둘레에 금, 반대쪽에 마나. 막힌 자리면 각을 돌린다. 맞은편 지역은 돌려 같은 자리.
  const placed = new Map();
  for (const g of regions) {
    const twin = regions.find(o => o.i === 4 - g.i && o.j === 4 - g.j);
    if (twin && placed.has(twin.id) && twin.id !== g.id) {
      for (const d of placed.get(twin.id)) addDeposit(map, g, d.kind, size - d.x, size - d.z);
      continue;
    }
    const spots = [];
    const toCenter = Math.atan2(size / 2 - g.z, size / 2 - g.x);
    const want = [...Array(g.gold).fill('gold'), ...Array(g.wood).fill('wood'), ...Array(g.mana).fill('mana')];
    const homeR = g.home >= 0 ? 34 : 26;
    want.forEach((kind, k) => {
      let a = toCenter + Math.PI + (k - (want.length - 1) / 2) * 0.9 + (kind === 'mana' ? Math.PI * 0.85 : kind === 'wood' ? -Math.PI * 0.6 : 0);
      for (let tries = 0; tries < 24; tries++, a += 0.27) {
        const x = g.x + Math.cos(a) * homeR, z = g.z + Math.sin(a) * homeR;
        if (map.openAt(x, z, 5) && map.regionAt(x, z) === g.id && x > 12 && z > 12 && x < size - 12 && z < size - 12 && spots.every(s => (s.x - x) ** 2 + (s.z - z) ** 2 > 12 * 12)) { spots.push({ kind, x, z }); break; }
      }
    });
    if (twin && twin.id === g.id) spots.splice(Math.ceil(spots.length / 2), Infinity, ...spots.slice(0, Math.floor(spots.length / 2)).map(s => ({ ...s, x: size - s.x, z: size - s.z })));   // 가운데: 절반을 돌려 채운다
    for (const s of spots) addDeposit(map, g, s.kind, s.x, s.z);
    placed.set(g.id, spots);
  }
  map.homes = [regions.find(g => g.home === 0), regions.find(g => g.home === 1)];
  return map;
}

function addDeposit(map, g, kind, x, z) {
  const d = { id: map.deposits.length, kind, x, z, region: g.id, building: -1 };
  map.deposits.push(d);
  g.deposits.push(d.id);
}

// 지역 경계 선분(그리기용): 칸 경계 가운데 양쪽 지역이 다른 곳.
export function regionBorders(map) {
  const out = [], { cols, rows, cell, regionOf } = map;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = regionOf[r * cols + c];
    if (c + 1 < cols && regionOf[r * cols + c + 1] !== a) out.push([(c + 1) * cell, r * cell, (c + 1) * cell, (r + 1) * cell]);
    if (r + 1 < rows && regionOf[(r + 1) * cols + c] !== a) out.push([c * cell, (r + 1) * cell, (c + 1) * cell, (r + 1) * cell]);
  }
  return out;
}
