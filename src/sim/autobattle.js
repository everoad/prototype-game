// 자동 대전 한 판과 판정(설계서 §10.4·§10.5, 계획서 Task 15). 화면 없이 돈다 — tools/autobattle.mjs가 여러 시드를 일꾼에 나눠 부른다.
// 편 0 = 표준 AI(aggressive) 또는 각본 봇, 편 1 = 표준 AI(성향은 시드로 돌아가며 — 화면과 같다).
import { createWorld, step } from './world.js';
import { makeAi } from './ai.js';
import { makeRng } from './rng.js';
import { makeStats, STATS } from './stats.js';
import { makeBot, BOTS } from './bots.js';

export { BOTS };
const PERSONALITIES = ['aggressive', 'careful', 'raider'];

// mirror: 몬스터도 사람 병종 표(병종 차이를 빼고 볼 때). startVp: 편마다 시작 대군이 승점으로 가나(없으면 게임 기본 [우리만]). p0: 편 0 표준 AI 성향('aggressive' 또는 'cycle' = 편 1처럼 시드로 돌아가며, 한 칸 어긋나게).
export function runOne({ seed, scale = 0.2, vs = 'standard', limit = 1800, keepOrders = false, startVp = null, p0 = 'aggressive', mirror = false }) {
  const w = createWorld({ seed, knobs: { scale, mirror, ...(startVp ? { startToVictoryPoint: startVp } : {}) }, scenario: 'battle' });
  w.metrics = makeStats({ seed });
  const personality0 = p0 === 'cycle' ? PERSONALITIES[seed % 3] : p0;
  const side0 = vs === 'standard' ? makeAi(0, { personality: personality0, difficulty: 'normal' }, makeRng(seed * 17 + 3)) : makeBot(vs, 0, makeRng(seed * 17 + 3));
  const orders = [];
  w.controllers[0] = keepOrders ? { think: ww => { const o = side0.think(ww); orders.push(...o.map(x => ({ ...x }))); return o; } } : side0;
  w.controllers[1] = makeAi(1, { personality: PERSONALITIES[(seed - 1) % 3], difficulty: 'normal' }, makeRng(seed * 31 + 7));
  while (!w.result && w.time < limit - 1e-9) step(w);
  const rep = w.metrics.finish(w);
  rep.vs = vs; rep.scale = scale; rep.limit = limit; rep.startVp = startVp; rep.p0 = personality0; rep.mirror = mirror; rep.p1 = PERSONALITIES[(seed - 1) % 3];
  if (keepOrders) rep.orders = orders;
  return rep;
}

const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 0);
const median = xs => { const v = [...xs].sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0; };
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// §10.5 기준 2·4·5·6·7을 판정한다. 표준 판이면 2·4·5·6, 각본 봇이면 7(봇 승률)과 판 길이.
export function judge(reps, vs) {
  const n = reps.length, rows = [];
  const length = r => (r.reason === 'timeout' ? Math.max(r.endTime, r.limit ?? r.endTime) : r.endTime);
  const lengthRows = () => {
    const med = median(reps.map(length)), over15 = reps.filter(r => length(r) > 900).length, before10 = reps.filter(r => r.endedBeforePressure).length;
    const draws = reps.filter(r => r.draw || r.reason === 'timeout').length;
    rows.push({ criterion: '5a 판 길이 중간값 10~15분', value: mmss(med), pass: med >= 600 && med <= 900 });
    rows.push({ criterion: '5b 15분 넘는 판 < 20%', value: `${pct(over15, n)}%`, pass: pct(over15, n) < 20 });
    rows.push({ criterion: '5c 시간 압박(10분) 전에 끝난 판 ≥ 30%', value: `${pct(before10, n)}%`, pass: pct(before10, n) >= 30 });
    rows.push({ criterion: '5d 무승부·시간 끝 < 10%', value: `${pct(draws, n)}%`, pass: pct(draws, n) < 10 });
  };
  if (vs === 'standard') {
    const empties = reps.flatMap(r => Object.values(r.emptyFrontPct)), mean = empties.length ? empties.reduce((a, b) => a + b, 0) / empties.length : 0;
    rows.push({ criterion: '2 1분 뒤 구역 정면이 빈 시간 < 10%', value: `평균 ${mean.toFixed(1)}% (가장 큰 구역 ${Math.max(0, ...empties).toFixed(1)}%)`, pass: mean < 10 });
    const withRaid = reps.filter(r => r.raids > 0).length, raids = reps.reduce((a, r) => a + r.raids, 0), wins = reps.reduce((a, r) => a + r.raidWins, 0);
    const swings = reps.map(r => r.raidMoraleSwing).filter(x => x !== null), swing = swings.length ? swings.reduce((a, b) => a + b, 0) / swings.length : null;
    rows.push({ criterion: '4a 기습이 매 판 일어나나(≥ 90%)', value: `${pct(withRaid, n)}% (판당 ${(raids / (n || 1)).toFixed(1)}번)`, pass: pct(withRaid, n) >= 90 });
    rows.push({ criterion: '4b 기습 성공률 20~60%', value: `${pct(wins, raids)}% (${wins}/${raids})`, pass: raids > 0 && pct(wins, raids) >= 20 && pct(wins, raids) <= 60 });
    rows.push({ criterion: `4c 기습 ${STATS.swingAfter}초 뒤 사기 차(기습한 쪽 +)`, value: swing === null ? '없음' : swing.toFixed(1), pass: swing !== null && swing > 0 });
    lengthRows();
    const decided = reps.filter(r => r.morale5min && r.winner !== null && r.morale5min[0] !== r.morale5min[1]);
    const leaderWon = decided.filter(r => (r.morale5min[0] > r.morale5min[1] ? 0 : 1) === r.winner).length;
    rows.push({ criterion: '6 5분에 사기가 앞선 쪽 승률 < 80%', value: `${pct(leaderWon, decided.length)}% (${leaderWon}/${decided.length})`, pass: decided.length > 0 && pct(leaderWon, decided.length) < 80 });
  } else {
    const wins = reps.filter(r => r.winner === 0).length, limit = vs === 'noCav' ? 40 : 60;
    rows.push({ criterion: `7 봇 ${vs} 승률 < ${limit}% — ${BOTS[vs]}`, value: `${pct(wins, n)}% (${wins}/${n}, 진 판 ${reps.filter(r => r.winner === 1).length}, 무승부·시간 끝 ${reps.filter(r => r.winner === null).length})`, pass: pct(wins, n) < limit });
    lengthRows();
  }
  return rows;
}
