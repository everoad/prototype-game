// 자원·수입·인구(설계서 §4 "경제", 3단계 계획 Task 3). 자원 셋(금·목재·마나), 수입 = 다 지은 성채 + 본진과 이어진 제 땅의 다 지은 채굴기.
// 인구는 무게로 센다 — 산 병사 무게 합 + 생산 줄이 잡아 둔 몫(reserved). 상한 = 성채가 있으면 base + 이어진 땅마다 perRegion + 그 가운데 마을마다 perVillage(최대 max).
export const RES = ['gold', 'wood', 'mana'];
export const RES_NAMES = { gold: '금', wood: '목재', mana: '마나' };
const LACK = { gold: '금이 모자라다', wood: '목재가 모자라다', mana: '마나가 모자라다' };

export const costOf = def => ({ gold: def.gold ?? 0, wood: def.wood ?? 0, mana: def.mana ?? 0 });
export const canPay = (S, c) => RES.every(k => S[k] >= c[k] - 1e-9);
export function pay(S, c, sign = 1) { for (const k of RES) S[k] -= sign * c[k]; }
export const lack = (S, c) => { const k = RES.find(r => S[r] < c[r] - 1e-9); return k ? LACK[k] : ''; };

// 편 상태(편 0·1만 — 중립은 경제가 없다).
export function makeSide(rules) {
  const st = rules.economy.start;
  return { gold: st.gold, wood: st.wood, mana: st.mana, rate: { gold: 0, wood: 0, mana: 0 }, pop: 0, popCap: 0, reserved: 0,
    research: new Set(), researching: new Set(), alive: 0, alerts: [], cooldowns: {} };   // cooldowns: 지휘 스킬마다 다시 쓸 수 있는 때(casts.js)
}

const addRate = (S, inc) => { for (const k of RES) S.rate[k] += inc[k] ?? 0; };

// 수입률·인구·상한을 지금 다시 센다.
export function recount(w) {
  const E = w.rules.economy, T = w.territory, sides = w.sides, citadel = [false, false];
  for (const S of sides) { S.rate.gold = 0; S.rate.wood = 0; S.rate.mana = 0; S.pop = S.reserved; }
  for (const b of w.buildings) {
    if (!b.alive || !b.done || b.side > 1) continue;
    if (b.type === 'citadel') { citadel[b.side] = true; addRate(sides[b.side], E.income); }
    else if (b.def.income && T && b.region >= 0 && T[b.region].owner === b.side && T[b.region].connected[b.side]) addRate(sides[b.side], b.def.income);
  }
  const s = w.soldiers, units = w.rules.units;
  for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] < 2) sides[s.side[i]].pop += units[s.side[i]][s.type[i]].weight;
  for (const side of [0, 1]) {
    const S = sides[side];
    if (!citadel[side]) { S.popCap = 0; continue; }
    let n = 0, villages = 0;
    if (T) w.map.regions.forEach(g => {
      if (g.id === w.map.homes[side] || T[g.id].owner !== side || !T[g.id].connected[side]) return;
      n++;
      if (E.pop.villages.includes(g.role)) villages++;
    });
    S.popCap = Math.min(E.pop.max, E.pop.base + E.pop.perRegion * n + E.pop.perVillage * villages);
  }
}

// 틱마다: economy.every틱마다 다시 세고, 자원 += 수입률 × dt.
export function stepEconomy(w) {
  if (w.tick % w.rules.economy.every === 0) recount(w);
  const dt = w.rules.dt;
  for (const S of w.sides) for (const k of RES) S[k] += S.rate[k] * dt;
}
