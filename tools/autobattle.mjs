// 자동 대전(설계서 §10.4, 계획서 Task 15): 시드를 일꾼(worker_threads)에 나눠 화면 없이 돌리고, §10.5 기준을 한국어 표로 판정한다.
// node prototypes/flood/tools/autobattle.mjs --seeds 50 --scale 0.2 --vs standard|bots|<봇>[,<봇>…] --limit 1800 --workers 8
//   --vs bots = 각본 봇 일곱을 차례로. 결과는 out/autobattle-<날짜>-<vs>[-<tag>].json.
//   --startvp 10|00|11 = 편 0·편 1 시작 대군이 승점으로 가나(기본 10 = 게임 그대로), --p0 aggressive|cycle = 편 0 표준 AI 성향, --tag 이름 = 파일 이름 꼬리, --mirror = 몬스터도 사람 병종 표.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runOne, judge, BOTS } from '../src/sim/autobattle.js';

if (!isMainThread) {
  for (const seed of workerData.seeds) parentPort.postMessage(runOne({ seed, scale: workerData.scale, vs: workerData.vs, limit: workerData.limit, startVp: workerData.startVp, p0: workerData.p0, mirror: workerData.mirror }));
} else {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const seeds = Number(arg('seeds', 50)), scale = Number(arg('scale', 0.2)), limit = Number(arg('limit', 1800)), workers = Number(arg('workers', 8));
  const vsArg = arg('vs', 'standard'), list = vsArg === 'bots' ? Object.keys(BOTS) : vsArg.split(',');
  const sv = arg('startvp', null), startVp = sv ? [sv[0] === '1', sv[1] === '1'] : null, p0 = arg('p0', 'aggressive'), tag = arg('tag', ''), mirror = process.argv.includes('--mirror');
  const here = dirname(fileURLToPath(import.meta.url)), outDir = join(here, '..', 'out');
  mkdirSync(outDir, { recursive: true });
  const d = new Date(), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  function runVs(vs) {
    return new Promise((resolve, reject) => {
      const all = Array.from({ length: seeds }, (_, k) => k + 1), reps = [], t0 = Date.now();
      const groups = Array.from({ length: Math.min(workers, seeds) }, (_, k) => all.filter((_, j) => j % Math.min(workers, seeds) === k));
      let left = groups.length;
      for (const g of groups) {
        const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { seeds: g, scale, vs, limit, startVp, p0, mirror } });
        wk.on('message', r => { reps.push(r); process.stdout.write(`\r${vs}: ${reps.length}/${seeds}판`); });
        wk.on('error', reject);
        wk.on('exit', () => { if (--left === 0) { process.stdout.write(`  (${((Date.now() - t0) / 1000).toFixed(0)}초)\n`); resolve(reps.sort((a, b) => a.seed - b.seed)); } });
      }
    });
  }

  for (const vs of list) {
    if (vs !== 'standard' && !BOTS[vs]) { console.error(`모르는 상대 ${vs}`); process.exit(1); }
    const reps = await runVs(vs);
    const file = join(outDir, `autobattle-${date}-${vs}${tag ? `-${tag}` : ''}.json`);
    writeFileSync(file, JSON.stringify({ vs, seeds, scale, limit, startVp, p0, mirror, reps }, null, 1));
    console.log(`\n=== ${vs === 'standard' ? '표준 AI 대 표준 AI' : `각본 봇 ${vs} 대 표준 AI`} — 시드 ${seeds}개, 규모 ${scale}, 한도 ${mmss(limit)}, 시작 승점 ${sv ?? '10(기본)'}, 편0 성향 ${p0}${mirror ? ', 병종 표 같게(mirror)' : ''} ===`);
    for (const r of judge(reps, vs)) console.log(`${r.pass ? '통과' : '실패'}  ${r.criterion}: ${r.value}`);
    const wins = [0, 1].map(s => reps.filter(r => r.winner === s).length);
    console.log(`승패: 편0 ${wins[0]} · 편1 ${wins[1]} · 그 밖 ${reps.length - wins[0] - wins[1]} / 끝난 이유: ${Object.entries(reps.reduce((m, r) => ({ ...m, [r.reason]: (m[r.reason] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`→ ${file}`);
  }
}
