// 화면 없는 AI 대 AI. node tools/match.mjs [--seeds 6] [--limit 1800] [--p0 balanced] [--p1 rush] [--verbose]
// 판마다: 이긴 편·까닭·길이, 첫 교전, 5·10분 땅 수, 뽑은 병종, 병종별 잡은 값(금+목재+마나), 틱당 ms.
import { createWorld, step } from '../src/sim/world.js';
import { makeAi } from '../src/sim/ai.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seeds = Number(arg('seeds', 6)), limit = Number(arg('limit', 1800)), verbose = process.argv.includes('--verbose');
const PS = ['balanced', 'rush', 'tech'];
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const regionsOf = w => [0, 1, -1].map(s => w.regions.filter(r => r.owner === s).length);
const sumTrained = {}, sumKills = {};
const rows = [];
for (let seed = 1; seed <= seeds; seed++) {
  const p0 = arg('p0', PS[(seed - 1) % 3]), p1 = arg('p1', PS[seed % 3]);
  const w = createWorld({ seed });
  w.controllers[0] = makeAi(0, { personality: p0, seed });
  w.controllers[1] = makeAi(1, { personality: p1, seed: seed + 100 });
  const marks = {};
  const t0 = performance.now();
  let peak = 0;
  while (!w.result && w.time < limit) {
    step(w);
    if (Math.abs(w.time - 300) < 0.05) marks[5] = regionsOf(w);
    if (Math.abs(w.time - 600) < 0.05) marks[10] = regionsOf(w);
    if (verbose && w.tick % 600 === 0) {
      const S = w.sides;
      console.log(`  ${mmss(w.time)} 땅 ${regionsOf(w).join('/')} 인구 ${S[0].pop}/${S[0].popCap} : ${S[1].pop}/${S[1].popCap} 금 ${S[0].gold | 0}:${S[1].gold | 0} 목 ${S[0].wood | 0}:${S[1].wood | 0} 마 ${S[0].mana | 0}:${S[1].mana | 0} 승점 ${S[0].points | 0}:${S[1].points | 0} 괴물 ${w.units.filter(u => u.side === 2).length} 유닛 ${w.units.length}`);
    }
    peak = Math.max(peak, w.units.length);
  }
  const ms = (performance.now() - t0) / w.tick;
  const r = w.result;
  rows.push({ seed, p0, p1, winner: r ? r.winner : '-', reason: r ? r.reason : '시간', time: mmss(w.time), contact: w.firstContact >= 0 ? mmss(w.firstContact) : '-', at5: marks[5]?.join('/'), at10: marks[10]?.join('/'), end: regionsOf(w).join('/'), points: w.sides.slice(0, 2).map(s => s.points | 0).join(':'), peak, ms: ms.toFixed(2) });
  for (const s of [0, 1]) {
    for (const [k, v] of Object.entries(w.sides[s].stats.trained)) sumTrained[k] = (sumTrained[k] ?? 0) + v;
    for (const [k, v] of Object.entries(w.sides[s].stats.kills)) sumKills[k] = (sumKills[k] ?? 0) + v;
  }
}
console.table(rows);
console.log('뽑은 수', sumTrained);
console.log('잡은 값', sumKills);
