// 기병 시험장: 기병 무게 160(100기)이 궁수 무게 180(300명)을 친다. 둘 다 사람 병종(mirror).
//   open  = 궁수만 서 있다(가운데 구역 뒤). 기병이 닿아서 얼마나 빨리 죽이나, 다가가며 얼마나 죽나.
//   wall  = 궁수 앞에 창병 무게 200이 선분을 지킨다. 기병이 창 벽에 박지 않고 돌아 들어가나(진단용 — 적 창이 마음껏 기병을 쫓는다).
//   anvil = wall + 우리 창병 무게 200이 적 창과 맞붙는다(망치와 모루). 기병이 돌아 들어가 뒤의 궁수를 베나.
// node prototypes/flood/tools/cavlab.mjs [open|wall|anvil] [초=90]
import { createWorld, step } from '../src/sim/world.js';
import { spawnCavLab } from '../src/sim/scenarios.js';

export function cavLab(kind = 'open', seed = 1) {
  const w = createWorld({ scenario: 'empty', seed, knobs: { mirror: true } });
  return { w, ...spawnCavLab(w, kind) };
}

if (process.argv[1]?.endsWith('cavlab.mjs')) {
  const kind = process.argv[2] ?? 'open', seconds = Number(process.argv[3] ?? 90);
  const { w, archers, spears, cav } = cavLab(kind);
  const s = w.soldiers, alive = ids => ids.filter(i => s.alive[i]).length;
  let stuck = 0, tenth = null;
  for (let t = 1; t <= seconds; t++) {
    for (let k = 0; k < 20; k++) step(w);
    for (const i of cav) if (s.alive[i] && s.inContact[i] && s.contactHold[i]) stuck++;
    if (tenth === null && alive(archers) <= 30) tenth = t;
    if (t % 10 === 0) console.log(`${t}s 기병 ${alive(cav)}/100 · 궁수 ${alive(archers)}/300${spears.length ? ` · 창 ${alive(spears)}/200` : ''}`);
  }
  console.log(`궁수 90% 죽은 때: ${tenth ?? '못 함'} s · 창 벽에 막힌 기병·초 ${stuck}`);
}
