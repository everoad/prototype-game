// 군단 영지 게임 지도(설계서 2026-11-13-legion-design.md §5, 확정 그림 2026-11-13-legion-map.svg — 사용자 2026-11-13 "배치 그대로 가자").
// 1200 × 800 m, 4 m 칸. 지역 25곳 = 5 × 5 자리를 조금씩 비튼 보로노이. 편 0 = 아래(낮은 z), 편 1 쪽은 위아래로 뒤집어 저절로 만든다(map.js).
// 지형 칸: 0 들판, 1 숲, 2 언덕, 3 물, 5 바위.
import { FIELD, FOREST, HILL, WATER, ROCK } from '../terrain.js';

// 편 0 절반 + 가운데 줄: [i, j, 역할, 소굴 세기, 비틀기 dx, dz]. 편 1 = (i, 4 − j), 비틀기 (dx, −dz). 가운데 줄(j 2)은 dz 0이고 좌우 대칭.
const HALF = [
  [0, 0, 'ley', 'weak', 20, 18], [1, 0, 'gold', null, -28, 14], [2, 0, 'home', null, 0, -10], [3, 0, 'forest', null, 30, 16], [4, 0, 'ranch', 'weak', -18, 22],
  [0, 1, 'volcano', 'medium', 26, -18], [1, 1, 'ruins', 'medium', -30, 14], [2, 1, 'fort', null, 0, 20], [3, 1, 'cliffs', 'medium', 28, -16], [4, 1, 'village', 'medium', -22, 10],
  [0, 2, 'altar', 'strong', 36, 0], [1, 2, 'fort', 'strong', 18, 0], [2, 2, 'altar', 'center', 0, 0], [3, 2, 'fort', 'strong', -18, 0], [4, 2, 'altar', 'strong', -36, 0],
];

// 지형(편 0 절반에 그리면 맞은편은 뒤집어 저절로; mid: true = 가운데 줄 — 이미 위아래 대칭이라 한 번만). 차례대로 칠하고 뒤 항목이 덮는다.
const PAINT = [
  { kind: FOREST, poly: [[748, 0], [1000, 0], [1010, 60], [985, 150], [930, 178], [800, 172], [752, 120]] },   // 숲 지대
  { kind: FIELD, circle: [870, 96, 38] },                                                                     // 숲 지대 깃발 빈터
  { kind: FOREST, circle: [232, 150, 26] }, { kind: FOREST, circle: [482, 300, 20] }, { kind: FOREST, circle: [1010, 330, 22] },
  { kind: FOREST, circle: [700, 330, 18] },
  { kind: HILL, circle: [600, 254, 34] },                                                                     // 앞 요새 언덕
  { kind: HILL, circle: [856, 232, 48] },                                                                     // 절벽 둥지 높은 땅
  { kind: ROCK, circle: [906, 204, 14] }, { kind: ROCK, circle: [922, 252, 12] }, { kind: ROCK, circle: [884, 282, 10] },   // 절벽
  { kind: ROCK, circle: [300, 222, 8] }, { kind: ROCK, circle: [372, 274, 9] }, { kind: ROCK, circle: [312, 288, 7] }, { kind: ROCK, circle: [384, 212, 7] },   // 유적 돌기둥
  { kind: ROCK, circle: [80, 252, 22] }, { kind: ROCK, circle: [182, 262, 11] }, { kind: ROCK, circle: [96, 196, 12] },    // 화산 분화구·바위
  { kind: ROCK, circle: [470, 150, 16] }, { kind: ROCK, circle: [492, 118, 12] },                              // 본진 왼쪽 바위 등성이
  { kind: WATER, circle: [52, 52, 28] },                                                                      // 마나 샘 못
  { kind: HILL, circle: [370, 400, 40], mid: true }, { kind: HILL, circle: [830, 400, 40], mid: true },        // 가운데 요새 언덕
  { kind: WATER, circle: [252, 400, 28], mid: true }, { kind: WATER, circle: [948, 400, 28], mid: true },      // 가운데 줄 호수(동서 길목)
];

// 자원 자리(3단계): 'i,j' → [[종류, 깃발에서 dx, dz], …]. 편 0 절반(j < 2)만 적으면 맞은편 (i, 4 − j)은 (dx, −dz)로 저절로, 가운데 줄은 모두 적는다.
// 자리 둘레 6 m는 제 지역의 걸을 수 있는 땅(목재는 숲도), 깃발에서 44 m 넘게, 다른 자리와 18 m 넘게(시험 deposits.test.mjs).
const DEPOSITS = {
  '2,0': [['gold', -50, -8], ['gold', -44, -40], ['wood', 50, -8], ['wood', 44, -40], ['mana', 0, -52]],   // 본진
  '1,0': [['gold', -46, -10], ['gold', -10, -48], ['gold', 38, -30]],                                        // 금광 지대
  '3,0': [['wood', -44, -14], ['wood', 0, -48], ['wood', 46, -10]],                                          // 숲
  '0,0': [['mana', 48, -8], ['mana', 20, 46]],                                                               // 마나 샘
  '4,0': [['gold', -46, -8], ['wood', 40, -24]],                                                             // 말 목장 마을
  '0,1': [['gold', 46, -10], ['gold', 10, -46], ['mana', -20, 44]],                                          // 화산
  '1,1': [['gold', -48, -6], ['gold', 0, -48], ['gold', 46, -20]],                                           // 고대 유적
  '2,1': [['gold', -50, -10], ['wood', 50, -10]],                                                            // 앞 요새
  '3,1': [['gold', -48, -8], ['wood', -10, -48], ['wood', -30, 40]],                                         // 절벽 둥지
  '4,1': [['gold', -46, -10], ['wood', 44, -12]],                                                            // 마을
  '0,2': [['mana', -50, 0]], '1,2': [['gold', 52, 0], ['wood', -62, 0]], '2,2': [['mana', 0, -50], ['mana', 0, 50]],
  '3,2': [['gold', -52, 0], ['wood', 62, 0]], '4,2': [['mana', 50, 0]],                                       // 가운데 줄(좌우 대칭)
};

export const LEGION_MAP = {
  name: 'legion',
  width: 1200, depth: 800, cell: 4,
  grid: { x: [120, 360, 600, 840, 1080], z: [80, 240, 400, 560, 720] },
  half: HALF,
  paint: PAINT,
  mirrorPaint: true,
  deposits: DEPOSITS,
};
