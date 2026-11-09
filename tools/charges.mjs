// 진단: 쐐기 돌진이 맞닿기까지 몇 초 걸리나, 무엇을 쫓나(사용자 2026-11-07: "공격도 안 하고 그냥 돌진").
// node prototypes/flood/tools/charges.mjs [초=180] [시드=1]
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const seconds = Number(process.argv[2] ?? 180), seed = Number(process.argv[3] ?? 1);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7));
const s = w.soldiers;
const started = new Map(), done = [], NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];
let chargingSoldierSec = 0, alive = new Set();
for (let t = 0; t < seconds * 20; t++) {
  step(w);
  const now = new Set();
  for (const g of w.groups) {
    if (!g.charging) continue;
    now.add(g.id);
    if (!started.has(g.id)) started.set(g.id, { t: w.time, cls: g.cls, side: g.side, n: g.members.length, foes: {} });
    const rec = started.get(g.id);
    // 무엇을 쫓나: 쐐기 끝에서 가장 가까운 적의 병종
    if (t % 20 === 0) {
      chargingSoldierSec += g.members.length;
      let best = -1, bd = 1e9;
      for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] !== g.side) { const d = (s.x[i] - g.x) ** 2 + (s.z[i] - g.z) ** 2; if (d < bd) { bd = d; best = i; } }
      if (best >= 0) { const k = NAME[s.side[best]][s.type[best]]; rec.foes[k] = (rec.foes[k] ?? 0) + 1; }
    }
  }
  for (const [id, rec] of started) if (!now.has(id)) { done.push({ ...rec, dur: w.time - rec.t }); started.delete(id); }
}
const durs = done.map(d => d.dur).sort((a, b) => a - b), q = p => durs[Math.floor(p * (durs.length - 1))] ?? 0;
console.log(`쐐기 돌진 ${done.length}번: 맞닿기까지 중간 ${q(0.5).toFixed(1)}초, 90% ${q(0.9).toFixed(1)}초, 가장 김 ${q(1).toFixed(1)}초 · 돌진 중 병사·초 ${chargingSoldierSec}`);
const long = done.filter(d => d.dur > 8);
const foes = {};
for (const d of long) for (const [k, v] of Object.entries(d.foes)) foes[k] = (foes[k] ?? 0) + v;
console.log(`8초 넘게 돌진한 쐐기 ${long.length}개 — 쫓던 적(초): ` + Object.entries(foes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
