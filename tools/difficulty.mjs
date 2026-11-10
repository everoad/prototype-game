// 난이도 재기(2026-11-09): 몬스터 편 생산 배율(knobs.monsterProduction)마다 AI 대 AI 한 판 — 이긴 편·판 길이·끝 사기·거점 빼앗김·금 명령 쓴 횟수.
// node tools/difficulty.mjs [배율=1] [seed=1] [minutes=25]   (prototypes/flood에서)
import { createWorld, step } from '../src/sim/world.js';
import { makeAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const boost = Number(process.argv[2] ?? 1), seed = Number(process.argv[3] ?? 1), minutes = Number(process.argv[4] ?? 25);
const w = createWorld({ seed, knobs: { scale: 1, monsterProduction: boost }, scenario: 'battle' });
w.controllers[0] = makeAi(0, { personality: 'aggressive' }, makeRng(seed * 7 + 1));
w.controllers[1] = makeAi(1, { personality: 'aggressive' }, makeRng(seed * 7 + 2));
const fort = new Set(w.strongholds.filter(x => x.kind === 'hq' || x.kind === 'front' || x.kind === 'rear').map(x => x.id));
const lost = [0, 0], casts = [0, 0], sieges = [0, 0];
while (w.time < minutes * 60 && !w.result) {
  step(w);
  for (const e of w.events) {
    if (e.kind === 'captured' && fort.has(e.stronghold) && (e.from === 0 || e.from === 1)) lost[e.from]++;
    if (e.kind === 'cast') casts[e.side]++;
    if (e.kind === 'siegeBuy') sieges[e.side]++;
  }
}
const who = w.result ? (w.result.winner === null ? '무승부' : `편 ${w.result.winner} 승(${w.result.reason})`) : '끝나지 않음';
console.log(`몬스터 생산 ×${boost} 시드 ${seed}: ${who} @${Math.round(w.time)}초 · 사기 ${w.sides[0].morale.toFixed(0)} : ${w.sides[1].morale.toFixed(0)} · 거점 잃음 ${lost.join('/')} · 금 명령 ${casts.join('/')} · 투석기 ${sieges.join('/')}`);
