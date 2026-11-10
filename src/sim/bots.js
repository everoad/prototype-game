// 각본 봇 일곱(설계서 §10.4, 계획서 Task 15): 사람이 찾을 답을 일부러 하는 봇. 표준 AI(makeAi)와 같은 think(world) 꼴이고, 표준 AI 위에 한 가지 수를 얹거나 막는다.
// 조작이 바뀌어(장수 → 고르고 보내기, 공성은 생산하지 않음) ①·③을 바꿨다(실행 기록 Task 15 Ruling).
import { makeAi } from './ai.js';
import { STATE } from './soldiers.js';
import { CAVALRY, ARCHER } from './rules.js';
import { isPoint } from './map.js';

export const BOTS = {
  blob: '① 처음에 우리 병력을 한 덩어리로 가운데를 뚫어 적 본진으로(60초마다 다시)',
  cavHq: '② 기병만 모아 가장자리로 돌아 적 본진 기습(60초마다)',
  poke: '③ 궁수가 적 앞 거점 원 밖까지 들어갔다 빠지기를 되풀이(30초마다)',
  demolish: '④ 빼앗기기 직전 그 거점 건물 철거',
  turtle: '⑤ 나가지 않고 웅크려 비기기(보내기 없음, 성벽·망루)',
  archers: '⑥ 궁수 위주(생산 건물은 모두 사격장)',
  noCav: '⑦ 기병 없음(마구간을 짓지 않고 본진 마구간도 헌다)',
};

const BOT = { resend: 60, cavEvery: 60, cavFrom: 30, cavMin: 10, pokeEvery: 30, pokeStay: 15, pokeMax: 60, pokeGap: 15, turtleEvery: 30, demolishGauge: 50 };

// 고를 수 있는 우리 병사(수비대·달아나는 병사 빼고). type을 주면 그 병종만.
function troops(w, side, type = -1) {
  const s = w.soldiers, out = [];
  for (let i = 0; i < s.count; i++)
    if (s.alive[i] && s.side[i] === side && (type < 0 || s.type[i] === type) && s.state[i] !== STATE.GARRISON && s.state[i] !== STATE.FLEE && s.state[i] !== STATE.ATTACHED) out.push(i);
  return out;
}
const own = (w, side) => w.strongholds.filter(st => st.owner === side && !isPoint(st));
const keep = kinds => o => kinds.includes(o.kind);

export function makeBot(name, side, rng) {
  if (!BOTS[name]) throw new Error(`모르는 봇 ${name}`);
  const base = makeAi(side, { personality: 'aggressive', difficulty: 'normal' }, rng);
  const enemy = 1 - side, enemyHq = `hq${enemy}`;
  const S = { done: false, next: 0, pokeBack: null, demolished: new Set() };

  const think = {
    blob(w) {                                                    // 건물·막아라만 표준 AI, 흐름은 모두 적 본진으로
      const out = base.think(w).filter(keep(['build', 'upgrade', 'demolish', 'holdTheLine']));
      if (!S.done && w.time >= 0.5) {
        S.done = true; S.next = w.time + BOT.resend;
        for (const st of own(w, side)) out.push({ kind: 'arrow', side, from: st.id, target: { kind: 'stronghold', id: enemyHq } });
        out.push({ kind: 'send', side, from: { kind: 'ids', ids: troops(w, side) }, target: { kind: 'stronghold', id: enemyHq } });
      } else if (S.done && w.time >= S.next) {
        S.next = w.time + BOT.resend;
        out.push({ kind: 'send', side, from: { kind: 'ids', ids: troops(w, side) }, target: { kind: 'stronghold', id: enemyHq } });
      }
      return out;
    },
    cavHq(w) {
      const out = base.think(w);
      if (w.time >= BOT.cavFrom && w.time >= S.next) {
        S.next = w.time + BOT.cavEvery;
        const cav = troops(w, side, CAVALRY);
        if (cav.length >= BOT.cavMin) {
          const edges = w.map.routes.filter(r => r.name.startsWith('edge')), route = edges[Math.floor(rng.next() * edges.length)];
          const via = side === 0 ? [...route.via].reverse() : route.via;   // 길은 편 1 → 편 0 차례로 적혀 있다
          out.push({ kind: 'send', side, from: { kind: 'ids', ids: cav }, target: { kind: 'stronghold', id: enemyHq }, via });
        }
      }
      return out;
    },
    poke(w) {
      const out = base.think(w);
      if (S.pokeBack && w.time >= S.pokeBack.at) {               // 빠지기
        out.push({ kind: 'send', side, from: { kind: 'ids', ids: S.pokeBack.ids }, target: { kind: 'point', x: S.pokeBack.x, z: S.pokeBack.z } });
        S.pokeBack = null;
      } else if (!S.pokeBack && w.time >= S.next) {              // 들어가기: 적 앞 거점 원 밖 pokeGap m(우리 쪽)
        S.next = w.time + BOT.pokeEvery;
        const fronts = w.strongholds.filter(st => st.owner === enemy && st.kind === 'front');
        const archers = troops(w, side, ARCHER);
        if (fronts.length && archers.length) {
          const s = w.soldiers;
          const cx = archers.reduce((a, i) => a + s.x[i], 0) / archers.length, cz = archers.reduce((a, i) => a + s.z[i], 0) / archers.length;
          const st = fronts.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
          const d = Math.hypot(cx - st.x, cz - st.z) || 1, r = st.radius + BOT.pokeGap;
          const p = { x: st.x + (cx - st.x) / d * r, z: st.z + (cz - st.z) / d * r };
          const ids = archers.sort((a, b) => Math.hypot(s.x[a] - p.x, s.z[a] - p.z) - Math.hypot(s.x[b] - p.x, s.z[b] - p.z)).slice(0, BOT.pokeMax);
          if (w.map.walkable(p.x, p.z)) { out.push({ kind: 'send', side, from: { kind: 'ids', ids }, target: { kind: 'point', ...p } }); S.pokeBack = { at: w.time + BOT.pokeStay, ids, x: cx, z: cz }; }
        }
      }
      return out;
    },
    demolish(w) {
      const out = base.think(w);
      for (const st of own(w, side)) {
        const gauge = side === 0 ? st.gauge : -st.gauge, mine = st.weightIn?.[side] ?? 0, theirs = st.weightIn?.[enemy] ?? 0;
        if (theirs > mine && gauge < BOT.demolishGauge) st.slots.forEach((b, k) => {
          const key = `${st.id}:${k}`;
          if (b && !S.demolished.has(key)) { S.demolished.add(key); out.push({ kind: 'demolish', side, stronghold: st.id, slot: k }); }
        });
        else st.slots.forEach((b, k) => { if (!b) S.demolished.delete(`${st.id}:${k}`); });
      }
      return out;
    },
    turtle(w) {
      const out = base.think(w).filter(o => o.kind !== 'send' && !(o.kind === 'cast' && o.order === 'march') && !(o.kind === 'arrow' && o.target.kind === 'stronghold' && w.strongholds.find(x => x.id === o.target.id)?.owner !== side));
      if (w.time >= S.next) {
        S.next = w.time + BOT.turtleEvery;
        for (const st of own(w, side)) [0, 1].forEach(u => {        // 강화 칸: 성벽, 망루
          const k = st.slotCount + u;
          if (k < st.slots.length && !st.slots[k]) out.push({ kind: 'build', side, stronghold: st.id, slot: k, building: u === 0 ? 'wall' : 'tower' });
        });
      }
      return out;
    },
    archers(w) { return base.think(w).map(o => (o.kind === 'build' && (o.building === 'pikes' || o.building === 'stable') ? { ...o, building: 'archery' } : o)); },
    noCav(w) {
      const out = base.think(w).filter(o => !(o.kind === 'build' && o.building === 'stable'));
      if (!S.done) {
        S.done = true;
        const hq = w.strongholds.find(st => st.id === `hq${side}`);
        hq.slots.forEach((b, k) => { if (b && b.kind === 'stable') out.push({ kind: 'demolish', side, stronghold: hq.id, slot: k }); });
      }
      return out;
    },
  }[name];
  return { name, state: S, think };
}
