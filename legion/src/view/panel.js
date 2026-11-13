// 화면 판 글(3단계 계획 Task 9 — three 없이 셈만, 노드 시험이 불러온다): 자원 줄, 값 글, 짓기 단추, 건물 판 단추, 생산 줄 글.
import { RES, RES_NAMES, costOf, lack } from '../sim/economy.js';
import { buildingName } from '../sim/buildings.js';
import { batchOf } from '../sim/produce.js';
import { landWhy } from '../sim/lands.js';

export function resourceText(w, side) {
  const S = w.sides[side];
  return `${RES.map(k => `${RES_NAMES[k]} ${Math.floor(S[k])} (+${S.rate[k].toFixed(1)})`).join(' · ')} · 인구 ${Math.ceil(S.pop - 1e-9)}/${S.popCap}`;
}

export const costText = c => RES.filter(k => c[k] > 0).map(k => `${RES_NAMES[k]} ${c[k]}`).join(' · ');

// 짓기 단추(buildMenu 차례): 못 고르는 까닭 = 먼저 있어야 하는 건물, 모자란 자원.
export function buildButtons(w, side) {
  const R = w.rules, S = w.sides[side];
  return R.buildMenu.map(type => {
    const def = R.buildings[type], cost = costOf(def);
    const needs = def.needs && !w.buildings.some(b => b.alive && b.side === side && b.type === def.needs && b.done) ? `${buildingName(R.buildings[def.needs], side)}이(가) 먼저 있어야 한다` : '';
    const why = needs || lack(S, cost);
    return { type, name: buildingName(def, side), cost, ok: !why, why };
  });
}

// 건물 판 단추(다 지은 건물만): 생산(trains 차례) 다음 연구(research 차례).
export function buildingButtons(w, b) {
  if (!b.done) return [];
  const R = w.rules, S = w.sides[b.side], full = b.queue.length >= R.queueMax ? '생산 줄이 가득 찼다' : '';
  const train = (b.def.trains ?? []).map(key => {
    const t = R.train[key], cost = costOf(t), why = full || landWhy(w, b.side, key) || lack(S, cost);   // 땅 = 병종(6-1단계)
    return { kind: 'train', key, name: R.units[b.side][t.type].name, n: batchOf(R, b.side, key).n, cost, time: t.time, ok: !why, why };
  });
  const research = (b.def.research ?? []).map(key => {
    const r = R.research[key], cost = costOf(r), why = (S.research.has(key) || S.researching.has(key) ? '이미 했거나 하는 중이다' : '') || full || lack(S, cost);
    return { kind: 'research', key, name: r.name, cost, time: r.time, ok: !why, why };
  });
  return [...train, ...research];
}

// 포위 남은 초(6-1단계 — 땅 이름표 밑 붉은 글): 시계가 돌면 '포위 N초', 아니면 ''.
export function siegeText(t, rules) {
  return t.siege > 0 ? `포위 ${Math.max(1, Math.ceil(rules.siege.seconds - t.siege - 1e-9))}초` : '';
}

// 생산 줄 글: 맨 앞은 남은 초(인구가 모자라 시작 못 했으면 '(인구 대기)'), 나머지는 이름만.
export function queueText(w, b) {
  const R = w.rules;
  return b.queue.map((it, k) => {
    const name = it.kind === 'unit' ? R.units[b.side][R.train[it.key].type].name : R.research[it.key].name;
    if (k > 0) return name;
    if (b.pausedWhy) return `${name} (멈춤: ${b.pausedWhy})`;          // 땅을 잃음·끊김(6-1단계)
    return it.kind === 'unit' && !it.started ? `${name} (인구 대기)` : `${name} ${Math.ceil(it.left - 1e-9)}초`;
  });
}

// 건물 판(HUD): key = 판 모양(단추 종류·켜짐·까닭, 취소 단추, 집결지) — 이것이 바뀔 때만 판을 다시 만든다(누르는 사이에 단추가 바뀌어 클릭이 사라지지 않게, 3단계 최종 검토).
// status·queue = 자리에서 글만 고치는 몫(체력·짓기 진행·남은 초).
export function buildingCard(w, b) {
  const buttons = buildingButtons(w, b), cancel = !b.done ? 'build' : b.queue.length ? 'queue' : '';
  const status = b.done ? `체력 ${Math.ceil(b.hp)}/${b.maxHp}` : `짓는 중 ${Math.round(b.progress * 100)}% · 체력 ${Math.ceil(b.hp)}/${b.maxHp}`;
  const queue = b.done && b.def.trains ? `줄: ${b.queue.length ? queueText(w, b).join(' → ') : '비었음'}` : '';
  const key = JSON.stringify([b.id, b.done, cancel, !!b.rally, buttons.map(x => [x.kind, x.key, x.ok, x.why])]);
  return { key, name: buildingName(b.def, b.side), status, queue, buttons, cancel, trains: !!b.def.trains };
}

// 고른 병력 판(HUD, 4단계 최종 검토): key = 판 모양(있는 병종·광부 있음·어택땅 켜짐) — 수가 줄어도 판을 다시 만들지 않아 누르는 단추가 사라지지 않게.
// counts = 병종 번호마다 산 병사 수, total, crew(광부 수) — 자리에서 글만 고친다.
export function selectionParts(w, ids, { amove = false } = {}) {
  const s = w.soldiers, units = w.rules.units[0], counts = units.map(() => 0);
  let crew = 0;
  for (const i of ids) if (s.alive[i]) { counts[s.type[i]]++; if (units[s.type[i]].worker) crew++; }
  const total = counts.reduce((a, b) => a + b, 0);
  return { key: JSON.stringify([counts.map((c, t) => (c ? t : -1)).filter(t => t >= 0), crew > 0, !!amove]), counts, total, crew };
}

// 부대 줄: key = 있는 칸 번호들, labels[n] = "주된 병종 수" — 수·이름은 자리에서 고친다.
export function groupBarParts(list) {
  return { key: list.map(g => g.n).join(','), labels: Object.fromEntries(list.map(g => [g.n, `${g.name} ${g.count}`])) };
}
