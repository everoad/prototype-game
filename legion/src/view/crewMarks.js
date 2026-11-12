// 광부 조 표식 자리(three 없이 셈만): 그 편 조마다 산 광부의 가운데·수·쉬는 중인가(아무도 일을 맡지 않음). 조 번호 차례.
export function crewMarks(w, side) {
  const s = w.soldiers, by = new Map();
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== side || s.crew[i] < 0) continue;
    let m = by.get(s.crew[i]);
    if (!m) by.set(s.crew[i], m = { crew: s.crew[i], x: 0, z: 0, n: 0, idle: true });
    m.x += s.x[i]; m.z += s.z[i]; m.n++;
    if (s.job[i] >= 0) m.idle = false;
  }
  return [...by.values()].sort((a, b) => a.crew - b.crew).map(m => ({ ...m, x: m.x / m.n, z: m.z / m.n }));
}
