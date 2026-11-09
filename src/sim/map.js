// 손으로 만든 시험 맵 한 장(설계서 §2.1). 편 0 = 낮은 z, 편 1 = z' = 800 − z.
// 지형 칸: 0 들판, 1 숲, 2 언덕, 3 물, 4 여울.

export const FIELD = 0, FOREST = 1, HILL = 2, WATER = 3, FORD = 4;

const WIDTH = 1200, DEPTH = 800, CELL = 4;

// 편 0 쪽 거점(편 1은 뒤집는다). L/R = x가 작은/큰 쪽.
const SIDE0 = [
  { key: 'hq', kind: 'hq', x: 600, z: 60, radius: 80, slots: 4 },
  { key: 'fL', kind: 'front', x: 350, z: 250, radius: 60, slots: 2 },
  { key: 'fR', kind: 'front', x: 850, z: 250, radius: 60, slots: 2 },
  { key: 'rL', kind: 'rear', x: 250, z: 150, radius: 60, slots: 2 },
  { key: 'rR', kind: 'rear', x: 950, z: 150, radius: 60, slots: 2 },
];
const VPS = [{ id: 'vpL', x: 250 }, { id: 'vpC', x: 600 }, { id: 'vpR', x: 950 }];
const VP_LINE = 400, VP_RADIUS = 60;
const SECTORS = [{ name: 'left', x0: 60, x1: 360 }, { name: 'center', x0: 470, x1: 730 }, { name: 'right', x0: 840, x1: 1140 }];
const SEGMENT_BACK = 10; // 승점 선에서 자기 쪽으로(설계서는 30 m — 어그로 40 m로는 60 m 떨어진 두 선분이 끝내 안 맞붙어 10 m로, 실행 기록 Task 4 Ruling)

// 지형 칠하기 [종류, x0, x1, z0, z1] — 위아래 대칭.
const PAINT = [
  [FOREST, 380, 460, 300, 500],   // 좌·중 이음매 숲
  [HILL, 740, 820, 300, 500],     // 중·우 이음매 언덕
  [FOREST, 1160, 1200, 150, 650], // 오른쪽 가장자리 숲
  [WATER, 132, 148, 250, 550],    // 왼쪽 가장자리 강
  [FORD, 132, 148, 385, 415],     // 그 강의 여울(폭 30 m)
];

// 정면을 피해 도는 길(사용자 2026-11-07 "A"): 편 1 쪽 → 편 0 쪽 차례의 경유점. 이음매 숲·언덕, 오른쪽 가장자리 숲, 왼쪽 강 바깥.
const ROUTES = [
  { name: 'seamL', via: [{ x: 420, z: 400 }] },
  { name: 'seamR', via: [{ x: 780, z: 400 }] },
  { name: 'edgeR', via: [{ x: 1180, z: 400 }] },
  { name: 'edgeL', via: [{ x: 90, z: 590 }, { x: 90, z: 210 }] },
];

const id = (key, side) => (key === 'hq' ? `hq${side}` : `${key[0]}${side}${key[1]}`);

export function buildMap(rules) {
  const cols = WIDTH / CELL, rows = DEPTH / CELL;
  const terrain = new Uint8Array(cols * rows);
  for (const [t, x0, x1, z0, z1] of PAINT) {
    for (let r = Math.floor(z0 / CELL); r < Math.ceil(z1 / CELL); r++)
      for (let c = Math.floor(x0 / CELL); c < Math.ceil(x1 / CELL); c++) terrain[r * cols + c] = t;
  }

  const strongholds = [];
  for (const side of [0, 1])
    for (const d of SIDE0)
      strongholds.push({ id: id(d.key, side), side, kind: d.kind, x: d.x, z: side === 0 ? d.z : DEPTH - d.z, radius: d.radius, slots: d.slots });
  for (const v of VPS) strongholds.push({ id: v.id, side: null, kind: 'vp', x: v.x, z: VP_LINE, radius: VP_RADIUS, slots: 0 });

  const sectors = [];
  for (const side of [0, 1])
    for (const s of SECTORS)
      sectors.push({ id: `s${side}-${s.name}`, side, x0: s.x0, x1: s.x1, z: side === 0 ? VP_LINE - SEGMENT_BACK : VP_LINE + SEGMENT_BACK });

  const speeds = [rules.terrain.field, rules.terrain.forest, rules.terrain.hill, 0, rules.terrain.ford];
  const cellOf = (x, z) => {
    if (x < 0 || z < 0 || x >= WIDTH || z >= DEPTH) return -1;
    return Math.floor(z / CELL) * cols + Math.floor(x / CELL);
  };
  const walkable = (x, z) => { const i = cellOf(x, z); return i >= 0 && terrain[i] !== WATER; };
  const speedMult = (x, z) => { const i = cellOf(x, z); return i < 0 ? 0 : speeds[terrain[i]]; };

  return { width: WIDTH, depth: DEPTH, cell: CELL, cols, rows, terrain, strongholds, sectors, vpLine: VP_LINE, cellOf, walkable, speedMult, routes: ROUTES };
}
