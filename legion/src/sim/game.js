// 게임 판 차리기(2단계): 군단 영지 지도 위에 괴물 소굴과 양쪽 시작 군대(병종마다 쐐기 하나 무게). 경제·AI가 없는 2단계에서
// 편 1은 본진 앞에 서 있기만 한다. demoActions = 영상·bench용 편 0 시범 행동(labs.js의 행동 꼴 { at, run }).
import { spawn } from './soldiers.js';
import { INFANTRY, SPEAR, ARCHER, CAVALRY } from './rules.js';
import { setGoal } from './world.js';
import { spawnCamps } from './camps.js';
import { addBuilding } from './buildings.js';
import { spawnCrew } from './workers.js';
import { recount } from './economy.js';
import { newUnit } from './units.js';
import { applyOrder } from './orders.js';

const CLASS_OF = { [INFANTRY]: 'infantry', [SPEAR]: 'spear', [ARCHER]: 'archer', [CAVALRY]: 'cav' };
const ORDER = [INFANTRY, SPEAR, ARCHER, CAVALRY];   // rules.start.xs 차례

export function setupGame(w) {
  spawnCamps(w);
  const S = w.rules.start, s = w.soldiers;
  for (const side of [0, 1]) {
    const home = w.map.regions[w.map.homes[side]], dir = side === 0 ? 1 : -1;
    addBuilding(w, side, 'citadel', home.x, home.z - dir * S.citadelBack, { done: true });   // 성채(3단계): 본진 깃발 뒤
    for (let k = 0; k < S.crews; k++) spawnCrew(w, side, home.x + (k - (S.crews - 1) / 2) * S.crewGap, home.z - dir * S.crewAhead, dir * Math.PI / 2);   // 광부 조: 성채와 깃발 사이
    ORDER.forEach((type, k) => {
      const u = w.rules.units[side][type], n = Math.round(w.rules.group.weightByClass[CLASS_OF[type]] / u.weight);
      const gap = type === CAVALRY ? S.cavGap : S.gap, cx = home.x + S.xs[k], z0 = home.z + dir * S.ahead, ids = [];
      for (let m = 0; m < n; m++) {
        const x = cx + (m % S.cols - (S.cols - 1) / 2) * gap, z = z0 - dir * Math.floor(m / S.cols) * gap;   // 앞줄이 가운데 쪽
        const id = spawn(s, side, type, x, z, w.rules);
        setGoal(w, [id], { kind: 'point', x, z });
        ids.push(id);
      }
      newUnit(w, ids);                                               // 병종 덩어리 하나 = 부대 하나(4단계)
    });
  }
  recount(w);                                                        // 시작부터 수입·인구가 보이게
}

const act = (at, run) => ({ at, run });
const flagOf = (w, role) => w.map.regions.find(g => g.role === role && g.z < w.map.depth / 2);   // 편 0 쪽
const ours = (w, types) => { const s = w.soldiers, out = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && types.includes(s.type[i])) out.push(i); return out; };

// 시범(3단계 경제): 1초 — 광부 조 셋이 본진 금광·벌목소·병영을 하나씩, 군대는 금광 지대·숲·앞 요새로(이동 — 2단계와 같이 약 30·55·58초에 잡는다).
// 2초마다: 쉬는 조는 다음 일(본진 둘째 금광·둘째 벌목소, 금광 지대를 잡으면 그 금광 둘), 병영이 서면 인간 보병·드워프 방패병을 번갈아 줄에(줄 둘까지, 값이 되면),
// 집결지 = 앞 요새 깃발 앞. 95초 — 모인 병력(광부 빼고) 모두 마나 샘으로 어택땅.
const DEMO = { tick: 2, until: 240, attack: 95, barracks: [700, 120], rallyBack: 25, queue: 2, units: ['infantry', 'spear'] };

export function demoActions(w, api) {
  const to = (types, role, engage) => () => { const g = flagOf(w, role); api.send(w, 0, ours(w, types), api.point(g.x, g.z), engage); };
  const home = w.map.homes[0], spots = (region, kind) => w.map.deposits.filter(d => d.region === region && d.kind === kind);
  const gold = flagOf(w, 'gold'), fort = flagOf(w, 'fort');
  const jobs = [
    ['goldmine', spots(home, 'gold')[0]], ['lumbermill', spots(home, 'wood')[0]], ['barracks', { x: DEMO.barracks[0], z: DEMO.barracks[1] }],
    ['goldmine', spots(home, 'gold')[1]], ['lumbermill', spots(home, 'wood')[1]], ['goldmine', spots(gold.id, 'gold')[0]], ['goldmine', spots(gold.id, 'gold')[1]],
  ].map(([type, at]) => ({ type, x: at.x, z: at.z, id: -1 }));
  let next = 0;
  const director = () => {
    for (const crew of idleCrewIds(w, 0)) {                                   // 쉬는 조 → 다음 일(놓을 수 있고 값이 되면)
      const job = jobs.slice(next).find(j => j.id < 0);
      if (!job) break;
      const r = applyOrder(w, { kind: 'build', side: 0, type: job.type, x: job.x, z: job.z, workers: crew });
      if (!r.ok) break;
      job.id = r.id; next = jobs.indexOf(job) + 1;
    }
    const bar = w.buildings.find(b => b.side === 0 && b.type === 'barracks' && b.done);
    if (!bar) return;
    if (!bar.rally) applyOrder(w, { kind: 'rally', side: 0, building: bar.id, x: fort.x, z: fort.z - DEMO.rallyBack });
    while (bar.queue.length < DEMO.queue) {
      const unit = DEMO.units[(bar.made = (bar.made ?? 0) + 1) % DEMO.units.length];
      if (!applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit }).ok) { bar.made--; break; }
    }
  };
  const ticks = [];
  for (let t = DEMO.tick; t <= DEMO.until; t += DEMO.tick) ticks.push(act(t, director));
  return [
    act(1, to([INFANTRY, SPEAR], 'gold', false)), act(1, to([CAVALRY], 'forest', false)), act(1, to([ARCHER], 'fort', false)), act(1, director),
    ...ticks,
    act(DEMO.attack, to([INFANTRY, SPEAR, ARCHER, CAVALRY], 'ley', true)),
  ];
}

// 쉬는 광부 조마다 그 조의 광부 번호들(조 번호 차례).
function idleCrewIds(w, side) {
  const s = w.soldiers, by = new Map(), busy = new Set();
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i] || s.side[i] !== side || s.crew[i] < 0) continue;
    if (s.job[i] >= 0) busy.add(s.crew[i]);
    if (!by.has(s.crew[i])) by.set(s.crew[i], []);
    by.get(s.crew[i]).push(i);
  }
  return [...by.entries()].filter(([c]) => !busy.has(c)).sort((a, b) => a[0] - b[0]).map(([, ids]) => ids);
}
