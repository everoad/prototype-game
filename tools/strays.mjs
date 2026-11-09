// 진단: 할 일 없이 서 있는 병사(노림·쏠 목표·쫓기 없음, 거의 안 움직임) — 얼마나 오래, 어디에(사용자 2026-11-07: "싸우다가 멀리 구석으로 가면 아무것도 안 한다").
// node prototypes/flood/tools/strays.mjs [초=300] [시드=1]
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';
import { STATE, GOAL } from '../src/sim/soldiers.js';

const seconds = Number(process.argv[2] ?? 300), seed = Number(process.argv[3] ?? 1);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
w.controllers[0] = makeSimpleAi(0, makeRng(seed * 17 + 3)); w.controllers[1] = makeSimpleAi(1, makeRng(seed * 31 + 7));
const s = w.soldiers, NAME = [['창', '궁', '기', '보'], ['창고블', '투척', '늑대', '고블']];
const STATE_NAME = Object.fromEntries(Object.entries(STATE).map(([k, v]) => [v, k]));
const GOAL_NAME = Object.fromEntries(Object.entries(GOAL).map(([k, v]) => [v, k]));
const idleSince = new Float32Array(s.capacity).fill(-1);

// 구역 선분에서 얼마나 떨어졌나: 옆(선분 x 범위 밖), 뒤(우리 쪽), 앞(적 쪽)
function where(i) {
  if (s.goalKind[i] !== GOAL.SECTOR) {
    const d = Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]);
    return { key: d > 30 ? '목표에서 30 m 넘게' : '목표 가까이', d };
  }
  const sec = w.map.sectors[s.goalId[i]], dir = sec.side === 0 ? 1 : -1;
  const side = s.x[i] < sec.x0 ? sec.x0 - s.x[i] : s.x[i] > sec.x1 ? s.x[i] - sec.x1 : 0;
  const ahead = (s.z[i] - sec.z) * dir;
  const key = side > 40 ? '선분 옆 40 m 밖' : ahead < -40 ? '선 뒤 40 m 넘게' : ahead > 40 ? '선 앞 40 m 넘게' : '선 근처';
  return { key, d: Math.max(side, Math.abs(ahead)) };
}

for (let t = 0; t < seconds * 20; t++) {
  step(w);
  if (t % 20) continue;
  for (let i = 0; i < s.count; i++) {
    const idle = s.alive[i] && s.state[i] !== STATE.GARRISON && s.state[i] !== STATE.ATTACHED && s.group[i] < 0 &&
      s.target[i] < 0 && s.rtarget[i] < 0 && !s.hasPursuit[i] && !s.inContact[i] && Math.hypot(s.vx[i], s.vz[i]) < 0.3;
    if (!idle) { idleSince[i] = -1; continue; }
    if (idleSince[i] < 0) idleSince[i] = w.time;
  }
  if ((t / 20) % 60 !== 59) continue;
  // 1분마다: 20초 넘게 서 있는 병사를 편·자리·상태별로
  const rows = new Map();
  let total = [0, 0];
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || idleSince[i] < 0 || w.time - idleSince[i] < 20) continue;
    total[s.side[i]]++;
    const p = where(i);
    const key = `${s.side[i]} ${NAME[s.side[i]][s.type[i]]} · ${GOAL_NAME[s.goalKind[i]]} ${STATE_NAME[s.state[i]]} · ${p.key}`;
    const r = rows.get(key) ?? { n: 0, d: 0, x: 0, z: 0 };
    r.n++; r.d += p.d; r.x += s.x[i]; r.z += s.z[i];
    rows.set(key, r);
  }
  console.log(`\n${w.time.toFixed(0)}초: 20초 넘게 서 있는 병사 — 우리 ${total[0]}, 몬스터 ${total[1]}`);
  for (const [k, r] of [...rows].sort((a, b) => b[1].n - a[1].n).slice(0, 10))
    console.log(`  ${String(r.n).padStart(5)}  ${k.slice(2).padEnd(40)} 평균 거리 ${(r.d / r.n).toFixed(0)} m · 가운데 (${(r.x / r.n).toFixed(0)}, ${(r.z / r.n).toFixed(0)})`);
}
console.log(`\n지도 ${w.map.width}×${w.map.depth}, 승점 선 z=${w.map.vpLine}; 구역: ` + w.map.sectors.map(x => `${x.id} 편${x.side} x ${x.x0}..${x.x1} z ${x.z}`).join(' · '));
