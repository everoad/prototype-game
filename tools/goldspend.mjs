// 금 쓰임(계획서 2026-11-09 Task 6): AI 대 AI 판마다 편별 금 명령·공성 횟수, 건물 vs 명령·공성에 쓴 금, 6분 때 채운 칸.
// node tools/goldspend.mjs [seeds=1,2,3] [minutes=12]   (prototypes/flood에서)
import { createWorld, step } from '../src/sim/world.js';
import { makeAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const seeds = (process.argv[2] ?? '1,2,3').split(',').map(Number), minutes = Number(process.argv[3] ?? 12);
for (const seed of seeds) {
  const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
  w.controllers[0] = makeAi(0, { personality: 'aggressive' }, makeRng(seed * 7 + 1));
  w.controllers[1] = makeAi(1, { personality: 'aggressive' }, makeRng(seed * 7 + 2));
  const count = [{}, {}], spentOrders = [0, 0], spentBuild = [0, 0], landTaken = [0, 0], landGold = [0, 0];   // 작은 땅(2026-11-09): 뺏은 땅 수, 땅에서 번 금
  let slots6 = null;
  const B = w.rules.buildings;
  while (w.time < minutes * 60 && !w.result) {
    step(w);
    for (const st of w.strongholds) if (st.kind === 'land' && (st.owner === 0 || st.owner === 1)) landGold[st.owner] += w.rules.lands.gold[st.landKind] / 60 * w.rules.dt;
    for (const e of w.events) {
      if (e.kind === 'captured' && (e.to === 0 || e.to === 1) && w.strongholds.find(x => x.id === e.stronghold)?.kind === 'land') landTaken[e.to]++;
      if (e.kind === 'cast') { count[e.side][e.order] = (count[e.side][e.order] ?? 0) + 1; spentOrders[e.side] += w.rules.orders[e.order].cost; }
      else if (e.kind === 'siegeBuy') { count[e.side].siege = (count[e.side].siege ?? 0) + 1; spentOrders[e.side] += w.rules.siegeBuy.cost; }
      else if (e.kind === 'build') spentBuild[e.side] += B[e.building].cost;
    }
    if (slots6 === null && w.time >= 360) slots6 = [0, 1].map(side => { let f = 0, t = 0; for (const st of w.strongholds) if (st.owner === side && st.kind !== 'vp') { t += st.slots.length; f += st.slots.filter(Boolean).length; } return `${f}/${t}`; });
  }
  console.log(`seed ${seed} · ${w.result ? `${w.result.reason} ${w.result.winner} @${Math.round(w.time)}s` : `${minutes}분 끝나지 않음`} · 6분 칸 ${slots6?.join(' ') ?? '-'}`);
  for (const side of [0, 1]) console.log(`  편 ${side}: 명령 ${JSON.stringify(count[side])} · 명령·공성 금 ${spentOrders[side]} · 새 건물 금 ${spentBuild[side]}(올리기 빼고) · 땅 먹음 ${landTaken[side]}번 · 땅 금 ${Math.round(landGold[side])} · 끝 땅 ${w.strongholds.filter(x => x.kind === 'land' && x.owner === side).length}`);
}
