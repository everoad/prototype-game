// 부대(설계서 §4 "부대 단위 — 병사 하나를 누르면 그 쐐기 전체", 4단계): 생산된 쐐기 하나·시작 군대의 병종 덩어리 하나가 판 내내 남는 묶음.
// 고르기(화면)만 쓴다 — 싸움·걸음 판단에는 닿지 않는다. 광부는 조(crew)로 묶여 부대가 없다.

// 산 병사(광부 빼고)에게 새 부대 번호를 적고 그 번호를 돌려준다.
export function newUnit(w, ids) {
  const s = w.soldiers, u = w.nextUnit++;
  for (const i of ids) if (s.alive[i] && s.crew[i] < 0) s.unit[i] = u;
  return u;
}
