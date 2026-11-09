// 기병 진단: 기병이 시간을 어디에 쓰고, 무엇에 죽고, 무엇을 죽이나.
// node prototypes/flood/tools/cavalry.mjs [battle|clash] [초=180] [시드=1]
//   battle = 실제 판(양쪽 단순 AI), clash = 가운데 구역에서 시작 구성으로 맞붙기(무게 1000씩)
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';
import { spawnMixedClash } from '../src/sim/scenarios.js';
import { STATE } from '../src/sim/soldiers.js';
import { CAVALRY, ARCHER, SIEGE } from '../src/sim/rules.js';

const mode = process.argv[2] ?? 'battle', seconds = Number(process.argv[3] ?? 180), seed = Number(process.argv[4] ?? 1);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: mode === 'battle' ? 'battle' : 'empty' });
if (mode === 'battle') { w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7)); }
else spawnMixedClash(w, 1000);
w.stats = { dmg: {}, kills: [], lastHit: new Int8Array(w.soldiers.capacity).fill(-1) };
const s = w.soldiers;
const NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];
const who = k => (k < 0 ? '?' : `${NAME[(k & 7) >> 2][k & 3]}${k & 8 ? '(쏨)' : ''}`);
// 기병 상태 표본(1초마다): 쐐기 행군/쐐기 돌진/버팀과 맞닿음/버팀 아닌 적과 맞닿음/짓밟고 지나감/궁·공성 노림/다른 적 노림/측면 돌기/섬
const bucket = [{}, {}];
for (let t = 0; t < seconds; t++) {
  for (let k = 0; k < 20; k++) step(w);
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.type[i] !== CAVALRY) continue;
    const b = bucket[s.side[i]];
    let key;
    if (s.group[i] >= 0) key = w.groups.find(g => g.id === s.group[i])?.charging ? '쐐기 돌진' : s.state[i] === STATE.RALLY ? '모이는 중' : '쐐기 행군';
    else if (s.state[i] === STATE.GARRISON) key = '수비대';
    else if (s.state[i] === STATE.ROUT) key = '무너져 달아남';
    else if (s.throughUntil[i] > w.time) key = '짓밟고 지나감';
    else if (s.inContact[i]) key = s.contactHold[i] ? '버팀(창)과 맞닿음' : '버팀 아닌 적과 맞닿음';
    else if (s.target[i] >= 0) { const ty = s.type[s.target[i]]; key = ty === ARCHER || ty === SIEGE ? '궁·공성 노리고 감' : '다른 적 노리고 감'; }
    else if (s.hasPursuit[i]) key = '측면 돌기/쫓기';
    else key = '서 있음/걸음';
    b[key] = (b[key] ?? 0) + 1;
  }
}
for (const side of [0, 1]) {
  const total = Object.values(bucket[side]).reduce((a, b) => a + b, 0) || 1;
  console.log(`\n== 편 ${side} ${NAME[side][2]}: 시간 쓰임(병사·초 ${total})`);
  for (const [k, v] of Object.entries(bucket[side]).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${(v / total * 100).toFixed(1)}%`);
  const died = w.stats.kills.filter(k => k.side === side && k.type === CAVALRY);
  const by = {};
  for (const k of died) by[who(k.by)] = (by[who(k.by)] ?? 0) + 1;
  console.log(`  죽음 ${died.length}: ` + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  const killed = w.stats.kills.filter(k => k.by >= 0 && ((k.by & 7) >> 2) === side && (k.by & 3) === CAVALRY && !(k.by & 8));
  const kt = {};
  for (const k of killed) kt[NAME[k.side][k.type]] = (kt[NAME[k.side][k.type]] ?? 0) + 1;
  console.log(`  죽인 것 ${killed.length}: ` + Object.entries(kt).map(([k, v]) => `${k} ${v}`).join(', '));
  const dealt = Object.entries(w.stats.dmg).filter(([k]) => k.startsWith(`${side}${CAVALRY}>`));
  console.log('  준 피해: ' + dealt.map(([k, v]) => `${NAME[k[3]][k[4]]} ${v.toFixed(0)}`).join(', '));
  const taken = Object.entries(w.stats.dmg).filter(([k]) => k.endsWith(`>${side}${CAVALRY}`));
  console.log('  받은 피해: ' + taken.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${NAME[k[0]][k[1]]} ${v.toFixed(0)}`).join(', '));
}
const archersDied = [0, 1].map(side => w.stats.kills.filter(k => k.side === side && k.type === ARCHER).length);
console.log(`\n궁(원거리) 죽음: 편0 ${archersDied[0]}, 편1 ${archersDied[1]} · 판 시각 ${w.time.toFixed(0)}초 · 사기 ${w.sides[0].morale.toFixed(0)}/${w.sides[1].morale.toFixed(0)}`);
