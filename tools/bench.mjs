// sim 한 틱 시간 재기. node prototypes/flood/tools/bench.mjs [scale=1] [seconds=60]
// 양쪽 5,000 × scale씩(머릿수, 대칭 병종) 세 구역에서 맞붙인다.
import { createWorld, step } from '../src/sim/world.js';
import { spawnClash } from '../src/sim/scenarios.js';

const scale = Number(process.argv[2] ?? 1), seconds = Number(process.argv[3] ?? 60);
const w = createWorld({ scenario: 'empty', seed: 1, knobs: { scale, mirror: true } });
spawnClash(w, Math.round(5000 * scale));
const n = Math.round(seconds / w.rules.dt);
const times = [];
for (let i = 0; i < n; i++) {
  const t = performance.now();
  step(w);
  times.push(performance.now() - t);
}
const alive = [0, 0];
for (let i = 0; i < w.soldiers.count; i++) if (w.soldiers.alive[i]) alive[w.soldiers.side[i]]++;
const mean = times.reduce((a, b) => a + b, 0) / times.length;
const sorted = [...times].sort((a, b) => a - b);
const p95 = sorted[Math.floor(sorted.length * 0.95)];
console.log(`scale ${scale}: ${n} ticks, mean ${mean.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${sorted.at(-1).toFixed(2)} ms, alive ${alive[0]}/${alive[1]}`);
