// 진단: 맞고 있는데(1초 사이 체력이 줄었는데) 노리는 적도 없고 맞닿지도 않은 병사 — 상태별(사용자 2026-11-07: "목적지로 이동만 한다").
// node prototypes/flood/tools/passive.mjs [초=180] [시드=1]
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';
import { STATE } from '../src/sim/soldiers.js';

const seconds = Number(process.argv[2] ?? 180), seed = Number(process.argv[3] ?? 1);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7));
const s = w.soldiers, NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];
const STATE_NAME = Object.fromEntries(Object.entries(STATE).map(([k, v]) => [v, k]));
const lastHp = new Float32Array(s.capacity), tally = new Map(), hitTotal = [0, 0];
w.stats = { dmg: {}, kills: [], lastHit: new Int8Array(s.capacity).fill(-1), dealt: new Float32Array(s.capacity) };
const lastDealt = new Float32Array(s.capacity);
for (let t = 0; t < seconds * 20; t++) {
  step(w);
  if (t % 20) continue;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) { lastHp[i] = 0; continue; }
    const hit = lastHp[i] > 0 && s.hp[i] < lastHp[i] - 1e-3;
    lastHp[i] = s.hp[i];
    if (!hit) continue;
    hitTotal[s.side[i]]++;
    const dealt = w.stats.dealt[i] - lastDealt[i];
    lastDealt[i] = w.stats.dealt[i];
    if (dealt > 0) continue;                                    // 이 1초에 피해를 줬으면 '싸우는 중'
    const grp = s.group[i] >= 0 ? w.groups.find(g => g.id === s.group[i]) : null;
    const t = s.target[i], tgt = t >= 0 ? `노림 ${NAME[s.side[t]][s.type[t]]} ${Math.hypot(s.x[t] - s.x[i], s.z[t] - s.z[i]).toFixed(0) > 10 ? '멀리' : '가까이'}` : s.rtarget[i] >= 0 ? '쏠 목표' : '노림 없음';
    const how = grp ? `쐐기 ${grp.state}${grp.charging ? '·돌진' : ''}` : `${STATE_NAME[s.state[i]]}${s.hasPursuit[i] ? '·쫓기' : ''} · ${s.inContact[i] ? (s.contactHold[i] ? '창과 닿음' : '닿음') : '안 닿음'} · ${tgt}`;
    const key = `${s.side[i]} ${NAME[s.side[i]][s.type[i]]} · ${how}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
}
for (const side of [0, 1]) {
  const rows = [...tally].filter(([k]) => k.startsWith(`${side} `)).sort((a, b) => b[1] - a[1]);
  const n = rows.reduce((a, [, v]) => a + v, 0);
  console.log(`\n편 ${side}: 맞은 병사·초 ${hitTotal[side]} 중 그 1초에 피해를 못 준 채 맞음 ${n} (${(n / Math.max(1, hitTotal[side]) * 100).toFixed(0)}%)`);
  for (const [k, v] of rows.slice(0, 10)) console.log(`  ${String(v).padStart(6)}  ${k.slice(2)}`);
}
