// 진단: 기병이 어디를 치나(사용자 2026-11-07: "기병이 값을 하려면 AI가 옆을 잘 쳐야 하는데 가능한가").
// 기병이 준 피해를 대상 병종 × 맞은 쪽(앞 ≤60° · 옆 · 뒤 ≥120°)으로 나누고, 기병이 죽인 무게 ÷ 잃은 무게를 낸다.
// node prototypes/flood/tools/cavflank.mjs battle [초=300] [시드=1]   — 양쪽 AI 판
// node prototypes/flood/tools/cavflank.mjs anvil [초=90]              — 망치와 모루 시험장(우리 기병만)
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';
import { hitAngleDeg } from '../src/sim/combat.js';
import { CAVALRY } from '../src/sim/rules.js';
import { cavLab } from './cavlab.mjs';

const mode = process.argv[2] ?? 'battle', seconds = Number(process.argv[3] ?? (mode === 'battle' ? 300 : 90)), seed = Number(process.argv[4] ?? 1);
let w;
if (mode === 'battle') {
  w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
  w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7));
} else w = cavLab(mode, seed).w;
const s = w.soldiers, NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];

// 피해를 적을 때(lastHit[t] = … 다음 dealt[i] += hit) 공격자·대상·크기를 잡는다 — 시뮬 코드는 그대로 둔다.
let lastTarget = -1;
const hits = [[], []];   // 편마다 { tgtSide, tgtType, side: 'front'|'side'|'rear', hit }
const lastHit = new Proxy(new Int8Array(s.capacity).fill(-1), { set(a, k, v) { a[k] = v; lastTarget = Number(k); return true; }, get(a, k) { return a[k]; } });
const dealtArr = new Float32Array(s.capacity);
const dealt = new Proxy(dealtArr, {
  get(a, k) { return a[k]; },
  set(a, k, v) {
    const i = Number(k), hit = v - a[k];
    a[k] = v;
    if (s.type[i] === CAVALRY && lastTarget >= 0 && hit > 0) {
      const ang = hitAngleDeg(s, i, lastTarget);
      hits[s.side[i]].push({ tt: s.type[lastTarget], at: ang <= w.rules.flank.frontMaxDeg ? 'front' : ang >= w.rules.flank.rearMinDeg ? 'rear' : 'side', hit });
    }
    return true;
  },
});
w.stats = { dmg: {}, kills: [], lastHit, dealt };
const contactSec = [{ spear: 0, other: 0, none: 0 }, { spear: 0, other: 0, none: 0 }];
for (let t = 0; t < seconds * 20; t++) {
  step(w);
  if (t % 20) continue;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.type[i] !== CAVALRY) continue;
    const c = s.contact[i], k = c < 0 ? 'none' : w.rules.units[s.side[c]][s.type[c]].holdsLine ? 'spear' : 'other';
    contactSec[s.side[i]][k]++;
  }
}
const wt = (side, type) => w.rules.units[side][type].weight;
for (const side of [0, 1]) {
  const hs = hits[side];
  if (!hs.length && !w.stats.kills.some(k => k.side === side && k.type === CAVALRY)) continue;
  const total = hs.reduce((a, h) => a + h.hit, 0) || 1;
  console.log(`\n편 ${side} ${NAME[side][CAVALRY]}: 준 피해 ${(total / 1000).toFixed(0)}k`);
  for (let tt = 0; tt < 4; tt++) {
    const row = hs.filter(h => h.tt === tt);
    if (!row.length) continue;
    const sum = a => row.filter(h => h.at === a).reduce((x, h) => x + h.hit, 0);
    const all = sum('front') + sum('side') + sum('rear');
    console.log(`  → ${NAME[1 - side][tt].padEnd(3)} ${(all / total * 100).toFixed(0).padStart(3)}% of 피해 · 앞 ${(sum('front') / all * 100).toFixed(0)}% 옆 ${(sum('side') / all * 100).toFixed(0)}% 뒤 ${(sum('rear') / all * 100).toFixed(0)}%`);
  }
  const killedW = w.stats.kills.filter(k => k.side !== side && k.by === side * 4 + CAVALRY).reduce((a, k) => a + wt(k.side, k.type), 0);
  const lostW = w.stats.kills.filter(k => k.side === side && k.type === CAVALRY).reduce((a, k) => a + wt(side, CAVALRY), 0);
  const killedSpearW = w.stats.kills.filter(k => k.side !== side && k.by === side * 4 + CAVALRY && w.rules.units[k.side][k.type].holdsLine).reduce((a, k) => a + wt(k.side, k.type), 0);
  const lostToSpear = w.stats.kills.filter(k => k.side === side && k.type === CAVALRY && k.by >= 0 && k.by < 8 && w.rules.units[(k.by >> 2)][k.by & 3].holdsLine).reduce((a, k) => a + wt(side, CAVALRY), 0);
  const c = contactSec[side], cs = c.spear + c.other + c.none || 1;
  console.log(`  죽인 무게 ${killedW.toFixed(0)} ÷ 잃은 무게 ${lostW.toFixed(0)} = ${(killedW / Math.max(1, lostW)).toFixed(2)} · 창(버팀)만: 죽인 ${killedSpearW.toFixed(0)} / 창에게 잃은 ${lostToSpear.toFixed(0)}`);
  console.log(`  기병·초: 창과 맞닿음 ${(c.spear / cs * 100).toFixed(0)}% · 다른 적과 ${(c.other / cs * 100).toFixed(0)}% · 안 닿음 ${(c.none / cs * 100).toFixed(0)}%`);
}
