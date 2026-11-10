// 시험 맵(설계서 2026-11-06-flood-war-design.md §2.1, 작은 땅 2026-11-09-flood-small-lands-design.md §1).
// 맵 자료: 자리·지형·구역·도는 길. 판정 코드는 이 자료를 읽기만 한다(map.js buildMap) — 맵을 더 만들 때는 이런 파일을 하나 더한다.
// 편 0 = 낮은 z. 편 1은 위아래 뒤집기(z' = depth − z). 지형 칸: 0 들판, 1 숲, 2 언덕, 3 물, 4 여울(map.js).

import { FOREST, HILL, WATER, FORD } from '../terrain.js';

export const TEST_MAP = {
  name: 'test',
  width: 1200, depth: 800, cell: 4,
  // 편 0 쪽 거점(편 1은 뒤집는다). L/R = x가 작은/큰 쪽.
  side0: [
    { key: 'hq', kind: 'hq', x: 600, z: 60, radius: 80, slots: 4 },
    { key: 'fL', kind: 'front', x: 350, z: 250, radius: 60, slots: 2 },
    { key: 'fR', kind: 'front', x: 850, z: 250, radius: 60, slots: 2 },
    { key: 'rL', kind: 'rear', x: 250, z: 150, radius: 60, slots: 2 },
    { key: 'rR', kind: 'rear', x: 950, z: 150, radius: 60, slots: 2 },
  ],
  // 작은 땅(2026-11-09): 편 0 뒤 땅(편 1은 뒤집는다) — 가장자리 땅·본진 옆 깊은 땅. 정면을 지나지 않고 지도 가장자리로 돌아야 닿는다.
  lands0: [
    { key: 'eL', landKind: 'edge', x: 80, z: 220 },
    { key: 'eR', landKind: 'edge', x: 1120, z: 220 },
    { key: 'kL', landKind: 'deep', x: 420, z: 70 },
    { key: 'kR', landKind: 'deep', x: 780, z: 70 },
  ],
  // 가장자리 길목(중립): 양 가장자리 가운데 — 왼쪽은 강 바깥이라 여울로 건넌다
  chokes: [{ id: 'cL', x: 80, z: 400 }, { id: 'cR', x: 1120, z: 400 }],
  vps: [{ id: 'vpL', x: 250 }, { id: 'vpC', x: 600 }, { id: 'vpR', x: 950 }],
  vpLine: 400, vpRadius: 60,
  // 구역 선분: 양 가장자리 100 m를 비운다(2026-11-09 작은 땅 — 60·1140이면 정면 끝이 길목 원에 닿아 몬스터 정면이 40초 만에 왼쪽 길목을 먹었다. 가장자리는 돌아가는 길로 남긴다)
  sectors: [{ name: 'left', x0: 160, x1: 360 }, { name: 'center', x0: 470, x1: 730 }, { name: 'right', x0: 840, x1: 1040 }],
  segmentBack: 10, // 승점 선에서 자기 쪽으로(설계서는 30 m — 어그로 40 m로는 60 m 떨어진 두 선분이 끝내 안 맞붙어 10 m로, 실행 기록 Task 4 Ruling)
  // 지형 칠하기 [종류, x0, x1, z0, z1] — 위아래 대칭.
  paint: [
    [FOREST, 380, 460, 300, 500],   // 좌·중 이음매 숲
    [HILL, 740, 820, 300, 500],     // 중·우 이음매 언덕
    [FOREST, 1160, 1200, 150, 650], // 오른쪽 가장자리 숲
    [WATER, 132, 148, 250, 550],    // 왼쪽 가장자리 강
    [FORD, 132, 148, 385, 415],     // 그 강의 여울(폭 30 m)
  ],
  // 정면을 피해 도는 길(사용자 2026-11-07 "A"): 편 1 쪽 → 편 0 쪽 차례의 경유점. 이음매 숲·언덕, 오른쪽 가장자리 숲, 왼쪽 강 바깥.
  routes: [
    { name: 'seamL', via: [{ x: 420, z: 400 }] },
    { name: 'seamR', via: [{ x: 780, z: 400 }] },
    { name: 'edgeR', via: [{ x: 1180, z: 400 }] },
    { name: 'edgeL', via: [{ x: 90, z: 590 }, { x: 90, z: 210 }] },
  ],
};
