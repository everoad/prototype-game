// sim 한 틱 시간 재기: 시험 장면 하나를 군단 영지 모듈(기본) 또는 홍수 모듈(--flood)로 돌린다 — 같은 장면이라 둘을 바로 견준다.
// node prototypes/legion/tools/bench.mjs [장면 = clash5k] [--flood]
// 장면 game = 군단 영지 게임 판(지도·소굴·시작 군대·성채·광부 + 편 0 경제 시범, 240초) — 군단 영지 모듈에서만.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { LABS, makeApi, actionRunner } from '../src/sim/labs.js';

const args = process.argv.slice(2), flood = args.includes('--flood');
const name = args.find(a => !a.startsWith('--')) ?? 'clash5k';
const GAME = name === 'game';
if (GAME && flood) throw new Error('game 장면은 군단 영지 모듈에서만 돈다');
if (!GAME && !LABS[name]) throw new Error(`모르는 장면: ${name} (있는 것: game, ${Object.keys(LABS).join(', ')})`);
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, flood ? '../../flood/src/sim' : '../src/sim');
const load = f => import(pathToFileURL(path.join(dir, f)).href);
const [{ createWorld, step }, { spawn }, { applyOrder }] = await Promise.all([load('world.js'), load('soldiers.js'), load('orders.js')]);

const api = makeApi({ createWorld, step, spawn, applyOrder });
const w = createWorld({ seed: 1, scenario: 'empty', knobs: {}, ...(GAME ? { map: 'legion' } : {}) });
let due, seconds = GAME ? 240 : LABS[name].seconds;
if (GAME) { const { setupGame, demoActions } = await import('../src/sim/game.js'); setupGame(w); due = actionRunner(demoActions(w, api)); }
else due = actionRunner(LABS[name].setup(w, api));
const s = w.soldiers, times = [];
let peak = 0;
while (w.time < seconds - 1e-9) {
  due(w, api);
  const t = performance.now();
  step(w);
  times.push(performance.now() - t);
  let n = 0;
  for (let i = 0; i < s.count; i++) if (s.alive[i]) n++;
  peak = Math.max(peak, n);
}
const alive = [0, 0];
for (let i = 0; i < s.count; i++) if (s.alive[i]) alive[s.side[i]]++;
const mean = times.reduce((a, b) => a + b, 0) / times.length;
const sorted = [...times].sort((a, b) => a - b);
const p95 = sorted[Math.floor(sorted.length * 0.95)];
console.log(`${flood ? '홍수' : '군단 영지'} ${name}: ${times.length}틱, 평균 ${mean.toFixed(2)} ms, 95% ${p95.toFixed(2)} ms, 최대 ${sorted.at(-1).toFixed(2)} ms, 산 병사 최대 ${peak}, 끝 ${alive[0]}/${alive[1]}`);
