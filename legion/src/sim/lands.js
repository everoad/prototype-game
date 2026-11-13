// 땅 = 병종과 생산 멈춤(6-1단계, 설계서 §7 "6단계 설계" — 영지 규칙을 홍수 자료 위에 다시 짬).
// 특수 병종은 그 역할 땅(마나 샘·말 목장 마을·고대 유적)을 가졌고 성채와 이어져야 줄에 넣고, 만드는 동안에도 그래야 시계가 돈다.
// 건물이 선 땅이 그 편 것이 아니거나 끊기면 그 건물의 줄 전체가 멈춘다(취소 없음). 땅이 없는 판(시험장 지도)은 늘 된다.
import { ROLE_NAMES } from './regions.js';

// 그 역할 땅 하나 이상이 그 편 것이고 성채와 이어져 있나.
export function ownsLand(w, side, role) {
  const T = w.territory;
  if (!T) return true;
  return w.map.regions.some(g => g.land === role && T[g.id].owner === side && T[g.id].connected[side]);
}

// 이 병종을 뽑을 수 없는 까닭(땅), 되면 ''.
export function landWhy(w, side, key) {
  const land = w.rules.train[key]?.land;
  return !land || ownsLand(w, side, land) ? '' : `${ROLE_NAMES[land]} 땅이 있어야 한다`;
}

// 줄 맨 앞 항목이 멈추는 까닭, 아니면 ''. 건물 땅 먼저, 그다음 병사 항목의 땅.
export function pauseWhy(w, b, item) {
  const T = w.territory;
  if (T && b.region >= 0 && (T[b.region].owner !== b.side || !T[b.region].connected[b.side])) return '땅이 끊겼다';
  return item.kind === 'unit' ? landWhy(w, b.side, item.key) : '';
}
