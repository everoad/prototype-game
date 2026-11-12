// 황금 기록: 시험 장면을 홍수 모듈로 두 번씩 돌려(같은지 보고) test/golden/expected.json에 적는다.
// node prototypes/legion/tools/golden-record.mjs [sim 폴더 = ../flood/src/sim]
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { runLab, goldenLabs } from '../src/sim/labs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] ?? path.join(here, '../../flood/src/sim'));
const load = f => import(pathToFileURL(path.join(dir, f)).href);
const [{ createWorld, step }, { spawn }, { applyOrder }] = await Promise.all([load('world.js'), load('soldiers.js'), load('orders.js')]);
const mods = { createWorld, step, spawn, applyOrder };

const out = {};
for (const name of goldenLabs()) {
  const a = runLab(name, mods), b = runLab(name, mods);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${name}: 두 번 돌린 결과가 다르다(비결정적)`);
  out[name] = a;
  const last = a.at(-1), sum = side => Object.entries(last.alive).filter(([k]) => k.startsWith(`${side}:`)).reduce((x, [, v]) => x + v, 0);
  console.log(`${name.padEnd(10)} 60초: 편 0 ${sum(0)}명, 편 1 ${sum(1)}명`);
}
const file = path.join(here, '../test/golden/expected.json');
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`기록함 test/golden/expected.json (${dir})`);
