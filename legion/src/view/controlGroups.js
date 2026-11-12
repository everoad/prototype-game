// 부대 지정(설계서 §4 키 배치, 4단계): 숫자 1~9 칸마다 병사 번호와 태어난 차례를 기억한다(죽은 병사의 번호를 새 병사가 받아도 낯선 병사가 들지 않게).
// 화면만 쓰는 기억 — 세상은 바꾸지 않는다. 한 병사가 여러 칸에 들 수 있다.
import { STATE } from '../sim/soldiers.js';

export function createGroups() {
  const slots = new Map();   // n → Map(id → serial)

  const put = (n, sel, keep) => {
    const m = keep && slots.get(n) ? slots.get(n) : new Map();
    sel.ids.forEach((i, k) => m.set(i, sel.serials[k]));
    slots.set(n, m);
  };
  // 그 칸의 산 병사(제 편, 태어난 차례가 같은 것만). 걸러진 것은 칸에서도 지운다.
  function get(w, side, n) {
    const s = w.soldiers, m = slots.get(n), ids = [], serials = [];
    if (!m) return { ids, serials };
    for (const [i, serial] of m) {
      if (s.alive[i] && s.serial[i] === serial && s.side[i] === side) { if (s.state[i] !== STATE.FLEE) { ids.push(i); serials.push(serial); } }   // 달아나는 병사는 고르지 않는다(돌아오면 다시 든다)
      else m.delete(i);
    }
    if (!m.size) slots.delete(n);
    return { ids, serials };
  }
  function center(w, side, n) {
    const { ids } = get(w, side, n), s = w.soldiers;
    if (!ids.length) return null;
    let x = 0, z = 0;
    for (const i of ids) { x += s.x[i]; z += s.z[i]; }
    return { x: x / ids.length, z: z / ids.length };
  }
  // 빈 칸이 아닌 칸마다 { n, count, name } — name = 가장 많은 병종 이름.
  function list(w, side) {
    const out = [], s = w.soldiers, units = w.rules.units[side];
    for (let n = 1; n <= 9; n++) {
      const { ids } = get(w, side, n);
      if (!ids.length) continue;
      const by = units.map(() => 0);
      for (const i of ids) by[s.type[i]]++;
      const top = by.indexOf(Math.max(...by));
      out.push({ n, count: ids.length, name: units[top].name });
    }
    return out;
  }
  return { set: (n, sel) => put(n, sel, false), add: (n, sel) => put(n, sel, true), get, center, list };
}
