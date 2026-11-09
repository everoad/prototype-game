// 진단: 근접 대 원거리 — 누가 얼마나 죽이나, 맞닿은 근접 병사가 1분에 얼마를 주고 받나.
// node prototypes/flood/tools/killshare.mjs [초=180] [시드=1]
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const seconds = Number(process.argv[2] ?? 180), seed = Number(process.argv[3] ?? 1);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7));
const s = w.soldiers;
w.stats = { dmg: {}, kills: [], lastHit: new Int8Array(s.capacity).fill(-1) };
const NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];
let contactSec = [0, 0];
for (let t = 0; t < seconds * 20; t++) {
  step(w);
  if (t % 20 === 0) for (let i = 0; i < s.count; i++) if (s.alive[i] && s.inContact[i]) contactSec[s.side[i]]++;
}
for (const side of [0, 1]) {
  const ks = w.stats.kills.filter(k => k.side === side);
  const ranged = ks.filter(k => k.by >= 0 && (k.by & 8)).length;
  console.log(`편 ${side} 죽음 ${ks.length}: 원거리에 ${ranged} (${(ranged / ks.length * 100).toFixed(0)}%), 근접에 ${ks.length - ranged}`);
  const dealt = Object.entries(w.stats.dmg).filter(([k]) => +k[0] === side);
  const byType = {};
  for (const [k, v] of dealt) byType[NAME[side][+k[1]]] = (byType[NAME[side][+k[1]]] ?? 0) + v;
  console.log('  준 피해(병종별): ' + Object.entries(byType).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}k`).join(', ') + ` · 맞닿은 병사·초 ${contactSec[side]}`);
}
