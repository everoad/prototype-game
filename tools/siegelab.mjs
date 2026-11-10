// 공성 시험장 재기(투석기 계획서 2026-11-09 Task 6): 적 앞 거점 f1L(성벽 + 진형 수비대 150)을 우리 보병 300명(+ 투석기 3대)이 친다.
// node tools/siegelab.mjs [cat=1|0] [초=300] [시드=1]   (prototypes/flood에서)
import { createWorld, step } from '../src/sim/world.js';
import { spawnSiegeLab, siegeLabController } from '../src/sim/scenarios.js';
import { wallStanding } from '../src/sim/production.js';

const withCat = (process.argv[2] ?? '1') !== '0', limit = Number(process.argv[3] ?? 300), seed = Number(process.argv[4] ?? 1);
const w = createWorld({ scenario: 'empty', seed });
const lab = spawnSiegeLab(w, withCat);
w.controllers[0] = siegeLabController(lab);
const f = lab.stronghold, s = w.soldiers, alive = ids => ids.filter(i => s.alive[i]).length;
let wallAt = null, takenAt = null, shots = 0, garrisonGoneAt = null;
while (w.time < limit && takenAt === null) {
  step(w);
  for (const e of w.events) if (e.kind === 'boulderFire' && e.side === 0) shots++;
  if (wallAt === null && !wallStanding(f)) wallAt = w.time;
  if (garrisonGoneAt === null && alive(lab.garrison) === 0) garrisonGoneAt = w.time;
  if (f.owner !== 1) takenAt = w.time;
}
const t = v => (v === null ? '-' : `${Math.round(v)}초`);
console.log(`투석기 ${withCat ? '3대' : '없음'} · 시드 ${seed}: 성벽 깨짐 ${t(wallAt)} · 수비대 다 쓰러짐 ${t(garrisonGoneAt)} · 주인 잃음 ${t(takenAt)} · 우리 보병 ${alive(lab.ours)}/300 · 수비대 ${alive(lab.garrison)}/150 · 투석기 ${alive(lab.cats)}/${lab.cats.length} · 돌 ${shots}발`);
