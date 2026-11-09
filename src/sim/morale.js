// 사기(설계서 §7.2): 시작 60, 승점 차이로 깎이고, 사건마다 깎이고, 10분 뒤 기본 깎임, 13분 뒤 모두 ×2.
import { STATE, GOAL } from './soldiers.js';

export function moraleDrainPerMinute(timeSec, vpDiffAgainst, rules) {
  const m = rules.morale;
  let d = vpDiffAgainst > 0 ? m.vpDrain * vpDiffAgainst : 0;
  if (timeSec >= m.baseFrom) d += m.base;
  if (timeSec >= m.doubleFrom) d *= m.doubleMult;
  return d;
}

const REASONS = { loseFront: '앞 거점을 잃음', loseRear: '뒤 거점을 잃음', loseCaptured: '빼앗았던 거점을 잃음', buildingBurned: '건물이 탐', generalRouted: '장수 패주', loseHq: '본진을 잃음' };

export function applyMoraleEvent(w, side, kind, detail = '') {
  const m = w.rules.morale, sd = w.sides[side];
  let amount;
  if (kind === 'loseHq') { amount = sd.morale; sd.morale = 0; w.hqLost = side; }
  else {
    amount = m.events[kind] * (w.time >= m.doubleFrom ? m.doubleMult : 1);
    sd.morale = Math.max(0, sd.morale - amount);
  }
  w.moraleLog.push({ side, kind, reason: REASONS[kind] + (detail ? ` (${detail})` : ''), amount, t: w.time });
}

export function stepMorale(w) {
  const vps = [0, 0];
  for (const st of w.strongholds) if (st.kind === 'vp' && st.owner !== null) vps[st.owner]++;
  for (const side of [0, 1]) {
    const against = vps[1 - side] - vps[side];
    const d = moraleDrainPerMinute(w.time, against, w.rules) / 60 * w.rules.dt;
    w.sides[side].morale = Math.max(0, w.sides[side].morale - d);
  }
  w.vpCount = vps;
}

// 판 끝 확인. 끝나면 진 편 병사가 모두 뒤로 흩어져 달아난다(보완 9).
export function checkEnd(w) {
  if (w.result) return;
  const z0 = w.sides[0].morale <= 0, z1 = w.sides[1].morale <= 0;
  if (!z0 && !z1) return;
  if (z0 && z1) { w.result = { winner: null, reason: 'draw', time: w.time }; return; }
  const loser = z0 ? 0 : 1;
  w.result = { winner: 1 - loser, reason: w.hqLost === loser ? 'hq' : 'morale', time: w.time };
  const s = w.soldiers;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== loser) continue;
    s.state[i] = STATE.FLEE; s.target[i] = -1; s.goalKind[i] = GOAL.POINT; s.goalId[i] = -1;
    s.goalX[i] = s.x[i] + (w.rng.next() - 0.5) * 200;
    s.goalZ[i] = loser === 0 ? -50 : w.map.depth + 50;
  }
}
