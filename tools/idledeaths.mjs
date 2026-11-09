// 진단: 한 번도 피해를 못 주고 죽은 병사를 죽을 때 상태별로 센다(사용자 2026-11-07: "돌진하는데 공격을 안 하고 맞다가 죽는다").
// node prototypes/flood/tools/idledeaths.mjs [초=180] [시드=1]
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';
import { STATE } from '../src/sim/soldiers.js';

const seconds = Number(process.argv[2] ?? 180), seed = Number(process.argv[3] ?? 1);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7));
const s = w.soldiers;
w.stats = { dmg: {}, kills: [], lastHit: new Int8Array(s.capacity).fill(-1), dealt: new Float32Array(s.capacity), onDeath: null };
const NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];
const STATE_NAME = Object.fromEntries(Object.entries(STATE).map(([k, v]) => [v, k]));
const rows = new Map(), total = [0, 0];
w.stats.onDeath = i => {
  total[s.side[i]]++;
  if (w.stats.dealt[i] > 0) { w.stats.dealt[i] = 0; return; }
  const grp = s.group[i] >= 0 ? w.groups.find(g => g.id === s.group[i]) : null;
  const how = grp ? `쐐기 ${grp.state}${grp.charging ? '·돌진' : ''}` : s.chargeUntil[i] > w.time ? '풀린 돌진' : STATE_NAME[s.state[i]];
  const key = `${s.side[i]} ${NAME[s.side[i]][s.type[i]]} · ${how} · ${s.inContact[i] ? '닿음' : '안 닿음'}`;
  rows.set(key, (rows.get(key) ?? 0) + 1);
};
for (let t = 0; t < seconds * 20; t++) step(w);
for (const side of [0, 1]) {
  const mine = [...rows].filter(([k]) => k.startsWith(`${side} `)).sort((a, b) => b[1] - a[1]);
  const n = mine.reduce((a, [, v]) => a + v, 0);
  console.log(`\n편 ${side}: 죽음 ${total[side]} 중 피해 0으로 죽음 ${n} (${(n / Math.max(1, total[side]) * 100).toFixed(0)}%)`);
  for (const [k, v] of mine.slice(0, 12)) console.log(`  ${String(v).padStart(5)}  ${k.slice(2)}`);
}
