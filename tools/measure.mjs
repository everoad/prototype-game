// 단계 관문용 숫자: 화면 없이 한 판을 돌려 살아 있는/싸우는 병사, 구역마다 정면이 빈 시간, 첫 충돌이 가는 시간, 틱 시간을 잰다.
// node prototypes/flood/tools/measure.mjs [scale=1] [minutes=6] [seed=1] [damage=1]
import { createWorld, step } from '../src/sim/world.js';
import { makeSimpleAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const scale = Number(process.argv[2] ?? 1), minutes = Number(process.argv[3] ?? 6), seed = Number(process.argv[4] ?? 1), damage = Number(process.argv[5] ?? 1);
const EMPTY_WEIGHT = 50, NEAR = 40;   // 선분 40 m 안 무게 50 × scale 미만이면 그 구역 정면이 빈 것으로 본다
const w = createWorld({ seed, knobs: { scale, damage } });
w.controllers = [makeSimpleAi(0, makeRng(seed * 17 + 3)), makeSimpleAi(1, makeRng(seed * 31 + 7))];
const s = w.soldiers;
const startIds = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.origin[i] === -1 && s.state[i] !== 3) startIds.push(i);
let firstContact = null, startGone = null, tickMs = 0, ticks = 0;
const empty = new Map(w.map.sectors.map(sec => [sec.id, 0])); let measured = 0;
const rows = [];
for (let t = 0; t < minutes * 60 * 20; t++) {
  const a = performance.now(); step(w); tickMs += performance.now() - a; ticks++;
  if (w.tick % 20) continue;
  const alive = [0, 0], fight = [0, 0];
  for (let i = 0; i < s.count; i++) if (s.alive[i]) { alive[s.side[i]]++; fight[s.side[i]] += s.inContact[i]; }
  if (firstContact === null && fight[0] + fight[1] > 50) firstContact = w.time;
  if (startGone === null && firstContact !== null && startIds.filter(i => s.alive[i]).length < startIds.length * 0.2) startGone = w.time;
  if (w.time >= 60) {
    measured++;
    for (const sec of w.map.sectors) {
      let wt = 0;
      for (let i = 0; i < s.count; i++) {
        if (!s.alive[i] || s.side[i] !== sec.side) continue;
        const x = Math.max(sec.x0, Math.min(sec.x1, s.x[i]));
        if (Math.hypot(s.x[i] - x, s.z[i] - sec.z) <= NEAR) wt += w.rules.units[sec.side][s.type[i]].weight;
      }
      if (wt < EMPTY_WEIGHT * scale) empty.set(sec.id, empty.get(sec.id) + 1);
    }
  }
  if (w.tick % (20 * 60) === 0) rows.push(`${w.time / 60}분: 병사 ${alive[0]}/${alive[1]}, 싸우는 중 ${fight[0]}/${fight[1]}, 사기 ${w.sides[0].morale.toFixed(0)}/${w.sides[1].morale.toFixed(0)}, 승점 ${w.vpCount}`);
  if (w.result) break;
}
console.log(`규모 ${scale}, 피해 배율 ${damage}, 시드 ${seed}, ${(w.time / 60).toFixed(1)}분, 틱 평균 ${(tickMs / ticks).toFixed(2)} ms`);
for (const r of rows) console.log('  ' + r);
console.log(`첫 맞닿음 ${firstContact?.toFixed(0)}s, 시작 대군 80%가 쓰러진 때 ${startGone?.toFixed(0) ?? '아직'}s → 첫 충돌 ${startGone && firstContact ? ((startGone - firstContact) / 60).toFixed(1) + '분' : '판 끝까지 감'}`);
console.log('1분 뒤 구역마다 정면이 빈 시간: ' + [...empty].map(([k, v]) => `${k} ${(v / Math.max(1, measured) * 100).toFixed(0)}%`).join(', '));
if (w.result) console.log('끝: ' + JSON.stringify(w.result));
