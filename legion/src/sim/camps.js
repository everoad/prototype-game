// 괴물 소굴(설계서 §4·§5, 확정 그림 2026-11-13-legion-map.svg): 소굴 있는 지역마다 중립(편 2) 괴물이 깃발 둘레에 병종 덩어리로 선다.
// 다가온 적과는 보통 병사처럼 싸우고(behavior.js 어그로), 제 자리에서 rules.camp.leash m 넘게 끌려 나가면 이동 명령으로 돌아간다.
import { spawn, ORDER } from './soldiers.js';
import { setGoal, pointFieldId } from './world.js';

const TYPE_ORDER = [3, 0, 1, 2];        // 고블린 · 창 고블린 · 투척꾼 · 늑대 기수 — 덩어리 x 자리 [0, −1, +1, +2] × typeGap
const SLOT = [0, -1, 1, 2];

// 열 수: √n 이상인 가장 작은 약수 — 덩어리가 늘 꽉 찬 네모라 위아래로 뒤집어도 같은 자리(덜 찬 줄이 한쪽에 몰리지 않게).
const fullCols = n => { for (let d = Math.ceil(Math.sqrt(n)); d < n; d++) if (n % d === 0) return d; return n; };

// 처음 바라보는 쪽: 편 0 절반은 −z(편 0이 오는 쪽), 편 1 절반은 +z, 가운데 줄은 옆(위아래 뒤집어도 같게).
const faceOf = (g, width) => (g.j < 2 ? -Math.PI / 2 : g.j > 2 ? Math.PI / 2 : g.x <= width / 2 ? 0 : Math.PI);

export function spawnCamps(w) {
  const C = w.rules.camp, s = w.soldiers;
  for (const g of w.map.regions ?? []) {
    const comp = g.camp ? w.rules.camps[g.camp] : null;
    if (!comp) continue;
    const camp = { region: g.id, ids: [], serials: [], spots: [], field: -1 }, face = faceOf(g, w.map.width);
    TYPE_ORDER.forEach((type, k) => {
      const n = comp[type] ?? 0;
      if (!n) return;
      const cols = fullCols(n), rows = n / cols, cx = g.x + SLOT[k] * C.typeGap;
      for (let m = 0; m < n; m++) {
        const x = cx + (m % cols - (cols - 1) / 2) * C.gap, z = g.z + (Math.floor(m / cols) - (rows - 1) / 2) * C.gap;
        const id = spawn(s, 2, type, x, z, w.rules);
        setGoal(w, [id], { kind: 'point', x, z });                    // 흐름장 없이 곧장(자리에 서 있다)
        s.facing[id] = s.pfacing[id] = face;
        s.camp[id] = g.id;
        camp.ids.push(id); camp.serials.push(s.serial[id]); camp.spots.push([x, z]);
      }
    });
    w.camps.push(camp);
    w.campIndex[g.id] = camp;
  }
}

// 그 지역 소굴이 아직 살아 있나(한 마리라도). 소굴 없는 지역은 false.
export function campAlive(w, region) {
  const camp = w.campIndex[region], s = w.soldiers;
  return !!camp && camp.ids.some((i, k) => s.alive[i] && s.serial[i] === camp.serials[k]);
}

// 끈: 제 자리에서 leash 넘게 나간 소굴 병사는 소굴 깃발 흐름장을 따라 제 자리로(이동 명령 — 가는 길엔 새 적을 찾지 않는다).
// 자리에 닿으면(behavior.js 도착 10 m) 명령이 풀려 다시 싸운다.
export function stepCamps(w) {
  if (!w.camps.length) return;
  const s = w.soldiers, C = w.rules.camp, L2 = C.leash * C.leash;
  for (const camp of w.camps) camp.ids.forEach((i, k) => {
    if (!s.alive[i] || s.serial[i] !== camp.serials[k]) return;
    const [x, z] = camp.spots[k], d2 = (s.x[i] - x) ** 2 + (s.z[i] - z) ** 2;
    if (s.order[i] === ORDER.MOVE || d2 <= L2) return;
    if (camp.field < 0) { const g = w.map.regions[camp.region]; camp.field = pointFieldId(w, g.x, g.z); }
    setGoal(w, [i], { kind: 'point', x, z, field: camp.field });
    s.order[i] = ORDER.MOVE; s.orderBest[i] = Infinity; s.orderAt[i] = w.time;
    s.target[i] = -1; s.rtarget[i] = -1;
  });
}
