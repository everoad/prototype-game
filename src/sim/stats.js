// 지표(설계서 §10.4, 계획서 Task 15): 판 길이·승자·끝난 이유, 편마다 지은 건물·병종, 기습 수·성공·기습 뒤 사기 차, 연쇄 붕괴 뒤 남은 시간,
// 살아 있는·싸우는 병사, 구역마다 정면이 빈 시간, 맞닿은 병사의 수명, 결정 수(30초 넘게 유지된 명령).
// 세상에 붙여 쓴다: w.metrics = makeStats(); 판정이 틱마다 w.metrics.tick(w)를 부른다(사건은 틱마다 지워지므로). w.stats는 전투 측정 도구(tools/)가 쓴다.
import { STATE } from './soldiers.js';

export const STATS = {
  sampleEvery: 1,      // 표본 s
  seriesEvery: 10,     // 살아 있는·싸우는 병사 수를 남기는 간격 s
  emptyAfter: 60,      // 이때부터 정면이 빈 시간을 센다 s(§10.5-2 "1분 이후")
  emptyRange: 60,      // 구역 선분에서 이 안의 자기 편 병사를 그 구역 정면으로 친다 m
  emptyWeight: 15,     // 정면 무게가 이보다 작으면 빈 것(규모 배율을 곱한다)
  raidWindow: 180,     // 기습(경유점 보내기) 뒤 이 안에 목표 거점을 먹으면 성공 s
  swingAfter: 120,     // 기습 뒤 사기 차를 재는 때 s
  collapseWindow: 60,  // 이 안에 자기 거점(승점 빼고)을 둘 이상 잃으면 연쇄 붕괴 s
  decisionHold: 30,    // 이만큼 유지된 명령만 결정으로 센다 s(§10.5-3, 잡일 클릭 빼기)
  pressureAt: 600,     // 시간 압박이 시작되는 때 s(§10.5-5 "10분")
  pressureMorale: 300, // 역전을 재는 때 s(§10.5-6 "5분")
};

export function makeStats({ seed = 0 } = {}) {
  let nextSample = 0, nextSeries = 0, emptySamples = 0, morale5 = null;
  const alive = [], fighting = [], empty = {}, raids = [], captures = [], lifetimes = [];
  const firstContact = new Map();                       // 병사 번호 → { serial, t }
  const builds = [{}, {}], unitTime = [[0, 0, 0, 0], [0, 0, 0, 0]], pending = [], decisions = [0, 0];

  const moraleDiff = (w, side) => w.sides[side].morale - w.sides[1 - side].morale;
  function decision(w, side, key) {
    if (key) for (let k = pending.length - 1; k >= 0; k--) if (pending[k].side === side && pending[k].key === key) pending.splice(k, 1);   // 30초 안에 다시 바꿈 → 앞의 것은 잡일
    pending.push({ side, key, at: w.time });
  }

  function tick(w) {
    for (const e of w.events) {
      if (e.kind === 'arrow') decision(w, e.side, `arrow:${e.from}`);
      else if (e.kind === 'build' || e.kind === 'holdTheLine') { decision(w, e.side, null); if (e.kind === 'build') builds[e.side][e.building] = (builds[e.side][e.building] ?? 0) + 1; }
      else if (e.kind === 'send') {
        decision(w, e.side, null);
        const tgt = e.target.kind === 'stronghold' && w.strongholds.find(x => x.id === e.target.id);
        if (e.routed && tgt && tgt.kind !== 'vp' && tgt.owner === 1 - e.side) raids.push({ side: e.side, target: tgt.id, at: w.time, m0: moraleDiff(w, e.side), won: false, swing: null });
      } else if (e.kind === 'captured') {
        captures.push({ at: w.time, stronghold: e.stronghold, from: e.from, to: e.to });
        for (const r of raids) if (!r.won && r.target === e.stronghold && e.to === r.side && w.time - r.at <= STATS.raidWindow) r.won = true;
      }
    }
    for (let k = pending.length - 1; k >= 0; k--) if (w.time - pending[k].at >= STATS.decisionHold) { decisions[pending[k].side]++; pending.splice(k, 1); }
    for (const r of raids) if (r.swing === null && w.time - r.at >= STATS.swingAfter) r.swing = moraleDiff(w, r.side) - r.m0;
    if (!morale5 && w.time >= STATS.pressureMorale) morale5 = [w.sides[0].morale, w.sides[1].morale];
    if (w.time + 1e-9 >= nextSample) { nextSample += STATS.sampleEvery; sample(w); }
  }

  function sample(w) {
    const s = w.soldiers, a = [0, 0], f = [0, 0], scale = w.rules.cap / 10000;
    const secs = w.map.sectors, front = secs.map(() => 0);
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i]) continue;
      const side = s.side[i], wt = w.rules.units[side][s.type[i]].weight;
      a[side]++; unitTime[side][s.type[i]] = (unitTime[side][s.type[i]] ?? 0) + 1;   // 병종 수는 규칙이 정한다(공성 = 4)
      if (s.inContact[i]) {
        f[side]++;
        const fc = firstContact.get(i);
        if (!fc || fc.serial !== s.serial[i]) firstContact.set(i, { serial: s.serial[i], t: w.time });
      }
      if (w.time >= STATS.emptyAfter && s.state[i] !== STATE.GARRISON) {
        secs.forEach((sec, k) => {
          if (sec.side !== side) return;
          const x = Math.max(sec.x0, Math.min(sec.x1, s.x[i]));
          if (Math.hypot(s.x[i] - x, s.z[i] - sec.z) <= STATS.emptyRange) front[k] += wt;
        });
      }
    }
    for (const [i, fc] of firstContact) if (!s.alive[i] || s.serial[i] !== fc.serial) { lifetimes.push(w.time - fc.t); firstContact.delete(i); }   // 맞닿은 뒤 죽음(1초 안쪽 오차)
    if (w.time >= STATS.emptyAfter) {
      emptySamples++;
      secs.forEach((sec, k) => { if (front[k] < STATS.emptyWeight * scale) empty[sec.id] = (empty[sec.id] ?? 0) + 1; });
    }
    if (w.time + 1e-9 >= nextSeries) { nextSeries += STATS.seriesEvery; alive.push([Math.round(w.time), a[0], a[1]]); fighting.push([Math.round(w.time), f[0], f[1]]); }
  }

  function finish(w) {
    const r = w.result, endTime = w.time;
    const lost = [0, 1].map(side => captures.filter(c => c.from === side && w.strongholds.find(x => x.id === c.stronghold)?.kind !== 'vp').map(c => c.at));
    const collapses = [];
    lost.forEach((times, side) => {
      let last = -Infinity;
      times.forEach((t, k) => { const n = times.filter(u => u <= t && u > t - STATS.collapseWindow).length; if (n >= 2 && t - last > STATS.collapseWindow) { collapses.push({ side, at: t, endAfter: endTime - t }); last = t; } void k; });
    });
    const swings = raids.filter(x => x.swing !== null).map(x => x.swing);
    const mix = side => { const tot = unitTime[side].reduce((p, q) => p + q, 0) || 1; return unitTime[side].map(v => Math.round(1000 * v / tot) / 1000); };
    return {
      seed, winner: r ? r.winner : null, reason: r ? r.reason : 'timeout', endTime: Math.round(endTime * 100) / 100,
      endedBeforePressure: !!r && endTime < STATS.pressureAt, draw: !!r && r.winner === null,
      morale5min: morale5,
      raids: raids.length, raidWins: raids.filter(x => x.won).length, raidMoraleSwing: swings.length ? swings.reduce((p, q) => p + q, 0) / swings.length : null,
      raidList: raids.map(x => ({ side: x.side, target: x.target, at: Math.round(x.at), won: x.won })),
      collapses, alive, fighting,
      emptyFrontPct: Object.fromEntries(w.map.sectors.map(sec => [sec.id, emptySamples ? Math.round(1000 * (empty[sec.id] ?? 0) / emptySamples) / 10 : 0])),
      contactLifetime: lifetimes.length ? Math.round(10 * lifetimes.reduce((p, q) => p + q, 0) / lifetimes.length) / 10 : null,
      buildMix: builds, unitMix: [mix(0), mix(1)], decisions: [...decisions],
    };
  }

  return { tick, finish, get decisions() { return decisions; } };
}
