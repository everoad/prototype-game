// 거점 수비 진형 재기(계획서 2026-11-09-flood-stronghold-formation Task 3): AI 대 AI 한 판을 진형 켜고/끄고 돌려
// 거점(본진·앞·뒤) 빼앗김 횟수·처음 빼앗긴 시각·판 길이·꽂힘 수를 찍는다.
// node tools/formation.mjs [seed=1] [on|off] [minutes=20]   (prototypes/flood에서)
import { createWorld, step } from '../src/sim/world.js';
import { makeAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const seed = Number(process.argv[2] ?? 1), on = (process.argv[3] ?? 'on') === 'on', minutes = Number(process.argv[4] ?? 20);
const w = createWorld({ seed, knobs: { scale: 1 }, scenario: 'battle' });
w.rules.formation.enabled = on;
w.controllers[0] = makeAi(0, { personality: 'aggressive' }, makeRng(seed * 7 + 1));
w.controllers[1] = makeAi(1, { personality: 'aggressive' }, makeRng(seed * 7 + 2));
const fort = new Set(w.strongholds.filter(x => x.kind === 'hq' || x.kind === 'front' || x.kind === 'rear').map(x => x.id));
const lost = [0, 0], first = [null, null], log = [];
let impales = 0, members = 0, samples = 0; const sieges = [0, 0], shots = [0, 0];   // 투석기 산 횟수·쏜 돌(2026-11-09)
const t0 = Date.now();
while (w.time < minutes * 60 && !w.result) {
  step(w);
  for (const e of w.events) {
    if (e.kind === 'impale') impales++;
    if (e.kind === 'siegeBuy') sieges[e.side]++;
    if (e.kind === 'boulderFire') shots[e.side]++;
    if (e.kind === 'captured' && fort.has(e.stronghold) && (e.from === 0 || e.from === 1)) {
      lost[e.from]++; first[e.from] ??= Math.round(w.time); log.push(`${Math.round(w.time)}s ${e.stronghold} ${e.from}→${e.to}`);
    }
  }
  if (w.tick % 200 === 0) { const s = w.soldiers; let n = 0; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.fmRole[i]) n++; members += n; samples++; }
}
console.log(`seed ${seed} 진형 ${on ? '켬' : '끔'} · ${w.result ? `${w.result.reason} 이긴 편 ${w.result.winner}` : '끝나지 않음'} @${Math.round(w.time)}s · 거점 잃음 편0 ${lost[0]}(처음 ${first[0] ?? '-'}s) 편1 ${lost[1]}(처음 ${first[1] ?? '-'}s) · 꽂힘 ${impales} · 투석기 산 횟수 ${sieges.join('/')} · 돌 ${shots.join('/')} · 진형 병사 평균 ${Math.round(members / Math.max(1, samples))} · ${((Date.now() - t0) / 1000).toFixed(0)}초 걸림`);
console.log('  ' + log.join(' | '));
