// 적 AI 보기(계획서 Task 14): 판단 다섯 가지 AI끼리(또는 몬스터 AI 혼자) 한 판을 돌리며 결정과 결과를 찍는다.
// node prototypes/flood/tools/aiwatch.mjs [시드=1] [초=600] [몬스터 성향=aggressive] [우리 성향=aggressive|none] [규모=1]
// 찍는 것: 1분마다 사기·살아 있는 무게·승점, 짓기·헐기·올리기, 막아라, 보내기(기습·밀어 넣기·되돌리기·지원),
// 기습마다 결과(150초 안에 목표를 빼앗았나·탄 건물·막는 쪽이 막아라를 썼나), AI 생각 한 번에 드는 ms.
import { createWorld, step } from '../src/sim/world.js';
import { makeAi } from '../src/sim/ai.js';
import { makeRng } from '../src/sim/rng.js';

const [seed = 1, seconds = 600, p1 = 'aggressive', p0 = 'aggressive', scale = 1] = process.argv.slice(2).map((v, k) => (k === 2 || k === 3 ? v : Number(v)));
const w = createWorld({ seed, knobs: { scale }, scenario: 'battle' });
if (process.env.ROUTES === '0') w.rules.ai.raidRoutes = false;   // 도는 길 없이(비교용)
const ais = [p0 === 'none' ? null : makeAi(0, { personality: p0, difficulty: 'normal' }, makeRng(seed * 17 + 3)),
  makeAi(1, { personality: p1, difficulty: 'normal' }, makeRng(seed * 31 + 7))];
const cost = [0, 0], calls = [0, 0];
ais.forEach((ai, side) => {
  if (!ai) return;
  w.controllers[side] = { think: x => { const t0 = performance.now(), o = ai.think(x); if (o.length || x.tick % 20 === 0) { cost[side] += performance.now() - t0; calls[side]++; } return o; } };
});
const NAME = ['우리', '몬스터'], log = [], raids = [];
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const sideOfSt = id => w.strongholds.find(s => s.id === id);
for (let k = 0, n = seconds / w.rules.dt; k < n && !w.result; k++) {
  step(w);
  for (const e of w.events) {
    const who = NAME[e.side] ?? '';
    if (e.kind === 'build') log.push(`${mmss(w.time)} ${who} 짓기 ${e.stronghold} ${e.building}`);
    else if (e.kind === 'holdTheLine') log.push(`${mmss(w.time)} ${who} 막아라 ${e.stronghold} (끌어옴 ${Math.round(e.weight)})`);
    else if (e.kind === "send") {
      const tgt = e.target.kind === 'stronghold' ? sideOfSt(e.target.id) : null;
      const what = e.from.kind === 'sector' ? '밀어 넣기' : e.target.kind === 'sector' ? '되돌리기' : tgt && tgt.owner === e.side ? '지원' : '기습';
      log.push(`${mmss(w.time)} ${who} ${what} ${e.from.id} → ${e.target.id} (${e.count}명)`);
      if (what === '기습') raids.push({ side: e.side, at: w.time, target: e.target.id, count: e.count, took: null, burned: 0, held: false });
    } else if (e.kind === 'captured') {
      log.push(`${mmss(w.time)} ${e.stronghold} 주인 ${e.from ?? '-'} → ${e.to ?? '-'}`);
      for (const r of raids) if (r.target === e.stronghold && r.took === null && e.to === r.side && w.time - r.at <= 150) r.took = w.time - r.at;
    } else if (e.kind === 'burned') { for (const r of raids) if (r.target === e.stronghold && w.time - r.at <= 150) r.burned++; }
    if (e.kind === 'holdTheLine') for (const r of raids) if (r.target === e.stronghold && r.side !== e.side && w.time - r.at <= 150) r.held = true;
    if (e.kind === 'rejected' && e.order.kind !== 'arrow') log.push(`${mmss(w.time)} ${NAME[e.order.side]} 거절 ${e.order.kind} ${e.reason}`);
  }
  ais.forEach((ai, side) => { if (ai && ai.state.counterType !== (ai.lastCounter ?? null)) { log.push(`${mmss(w.time)} ${NAME[side]} 상성 대상 → ${['창', '궁', '기', '보'][ai.state.counterType]}`); ai.lastCounter = ai.state.counterType; } });
  if (w.tick % (60 / w.rules.dt) === 0) {
    const s = w.soldiers, alive = [0, 0];
    for (let i = 0; i < s.count; i++) if (s.alive[i]) alive[s.side[i]] += w.rules.units[s.side[i]][s.type[i]].weight;
    const vps = w.strongholds.filter(x => x.kind === 'vp').map(x => x.owner ?? '-').join('');
    log.push(`${mmss(w.time)} ── 사기 ${w.sides.map(x => Math.round(x.morale)).join('/')} · 무게 ${alive.map(Math.round).join('/')} · 승점 ${vps} · 금 ${w.sides.map(x => Math.round(x.gold)).join('/')}`);
  }
}
console.log(log.join('\n'));
console.log(`\n끝 ${mmss(w.time)} ${w.result ? `승자 ${w.result.winner ?? '무승부'} (${w.result.reason})` : '(시간 끝)'}`);
console.log('기습:', raids.length ? '' : '없음');
for (const r of raids) console.log(`  ${NAME[r.side]} ${mmss(r.at)} → ${r.target} ${r.count}명: ${r.took !== null ? `${Math.round(r.took)}초 만에 빼앗음` : '못 빼앗음'} · 탄 건물 ${r.burned} · 막아라 ${r.held ? '썼다' : '안 씀'}`);
ais.forEach((ai, side) => ai && console.log(`${NAME[side]} 기습 길: ${ai.state.raids.map(r => `${r.target}/${r.route}`).join(' ') || '-'}`));
ais.forEach((ai, side) => ai && console.log(`${NAME[side]} AI(${ai.state.personality}): 상성 대상 ${ai.state.counterType ?? '없음'} · 생각 평균 ${(cost[side] / Math.max(1, calls[side])).toFixed(2)} ms`));
