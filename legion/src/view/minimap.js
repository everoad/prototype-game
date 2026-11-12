// 미니맵 셈(4단계 — three·DOM 없이): 미니맵 위 화면 좌표 → 땅 좌표, 오른쪽 클릭 보내기를 못 하는 까닭.

// rect = { left, top, width, height }(화면 px). 위쪽이 큰 z, 바깥은 판 가장자리로.
export function miniToWorld(px, py, rect, map) {
  const u = Math.min(1, Math.max(0, (px - rect.left) / rect.width)), v = Math.min(1, Math.max(0, (py - rect.top) / rect.height));
  return { x: Math.min(map.width - 0.01, u * map.width), z: Math.min(map.depth - 0.01, (1 - v) * map.depth) };   // 끝 픽셀은 판 안쪽(판 밖 x 1200·z 800은 걸을 수 없다)
}

// 보낼 수 없는 까닭(되면 ''). mode = 'aim'(스킬 겨누기) | 'place'(짓기 놓기) | 'amove'(어택땅 기다림 — 보낸다) | null.
export function miniSendCheck({ selected, walkable, mode }) {
  if (!selected) return '먼저 병력을 고르세요';
  if (mode === 'aim') return '겨누는 중에는 보내지 않는다';
  if (mode === 'place') return '놓는 중에는 보내지 않는다';
  if (!walkable) return '갈 수 없는 곳';
  return '';
}
