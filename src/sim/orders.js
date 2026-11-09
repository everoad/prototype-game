// 명령(플레이어·AI 공통). 세상을 바꾸는 길은 이것뿐이다.
import { holdTheLine, setArrow } from './defense.js';
import { generalOrder, generalById } from './generals.js';
import { sendTroops, retargetGathering, targetPoint, detachFromGroups } from './groups.js';
import { STATE, GOAL, ORDER } from './soldiers.js';
import { setGoal, pointFieldId } from './world.js';
import { castOrder } from './casts.js';
import { buySiege } from './siege.js';
import { isPoint } from './map.js';

const fail = reason => ({ ok: false, reason });

export function applyOrder(w, o) {
  switch (o.kind) {
    case 'arrow': return arrow(w, o);
    case 'build': return build(w, o);
    case 'upgrade': return upgrade(w, o);
    case 'demolish': return demolish(w, o);
    case 'holdTheLine': return holdTheLine(w, o);
    case 'send': return send(w, o);
    case 'cast': return castOrder(w, o);                 // 금 명령(casts.js)
    case 'buySiege': return buySiege(w, o);              // 공성병 사기(siege.js)
    case 'generalMove': case 'charge': case 'hold': case 'attach': case 'dissolve': return generalOrder(w, o);
    default: return fail(`모르는 명령 ${o.kind}`);
  }
}

// 흐름 화살표(§3.4).
function arrow(w, o) {
  const k = w.strongholds.findIndex(s => s.id === o.from);
  const st = w.strongholds[k];
  if (!st || isPoint(st)) return fail('거점이 아니다');
  if (st.owner !== o.side) return fail('우리 거점이 아니다');
  const t = o.target;
  if (t.kind === 'sector' && st.original !== st.owner) return fail('빼앗은 거점의 병력은 지키기나 장수에게만 간다');
  if (t.kind === 'sector') {
    const sec = w.map.sectors.find(s => s.id === t.id);
    if (!sec || sec.side !== o.side) return fail('우리 구역이 아니다');
  } else if (t.kind === 'stronghold') {
    if (!w.strongholds.some(s => s.id === t.id)) return fail('없는 거점');
  } else if (t.kind === 'general') {
    const g = generalById(w, t.id);
    if (!g || g.side !== o.side) return fail('우리 장수가 아니다');
    const prev = w.sides[o.side].arrows.get(st.id);                                    // 장수가 멀면 갈 '마지막 구역'
    t.fallback = prev?.kind === 'sector' ? { ...prev } : prev?.kind === 'general' ? prev.fallback : undefined;
  } else return fail('모르는 목표');
  // 모이는 쐐기(병종마다)와 앞으로 나올 병사만 따른다(§3.4). 출발한 쐐기와 정면의 병사는 원래 목표로 간다.
  setArrow(w, o.side, st.id, t);
  w.events.push({ kind: 'arrow', side: o.side, from: st.id, target: { ...t } });
  return { ok: true };
}

// 서 있는 병사 보내기(사용자 2026-11-07 "A"): from = { kind: 'stronghold'(승점 포함) | 'sector', id }.
// 그 거점·구역을 목표로 둔 우리 병사(수비대·장수에 붙은 병사·행군 중인 진형 빼고)와, 거점이면 거기 모이던 쐐기(다 안 찼어도)가 간다.
// PC 조작(사용자 2026-11-08, 설계서 §5): from = { kind: 'ids', ids }(고른 병사), target = { kind: 'point', x, z }(그 자리)도 받는다.
// 거점·승점으로 보내면 전처럼 싸우며 간다(engage — 어택땅). 땅(그 자리)·구역 선으로 보낸 고른 병사는 이동 명령(ORDER.MOVE — 가는 길에 싸우지 않는다),
// 적 병사로 보내면 공격 명령(ORDER.ATTACK). engage: true/false를 주면 그렇게. from이 거점·구역이면(AI) 늘 engage. (사용자 2026-11-08)
export function troopsAt(w, side, from) {
  const s = w.soldiers, out = [];
  const kind = from.kind === 'sector' ? GOAL.SECTOR : GOAL.STRONGHOLD;
  const k = from.kind === 'sector' ? w.map.sectors.findIndex(x => x.id === from.id) : w.strongholds.findIndex(x => x.id === from.id);
  if (k < 0) return out;
  for (let i = 0; i < s.count; i++)
    if (s.alive[i] && s.side[i] === side && s.goalKind[i] === kind && s.goalId[i] === k && s.group[i] < 0 && s.state[i] !== STATE.GARRISON && s.state[i] !== STATE.ATTACHED) out.push(i);
  return out;
}

function send(w, o) {
  const f = o.from, t = o.target;
  if (!f || !t) return fail('어디서 어디로');
  if (f.kind === 'sector') {
    const sec = w.map.sectors.find(x => x.id === f.id);
    if (!sec || sec.side !== o.side) return fail('우리 구역이 아니다');
  } else if (f.kind === 'ids') { if (!Array.isArray(f.ids)) return fail('고른 병사가 없다'); }
  else if (f.kind !== 'stronghold' || !w.strongholds.some(x => x.id === f.id)) return fail('없는 곳');
  if (f.kind === t.kind && f.id === t.id) return fail('같은 곳');
  if (t.kind === 'sector') { const sec = w.map.sectors.find(x => x.id === t.id); if (!sec || sec.side !== o.side) return fail('우리 구역이 아니다'); }
  else if (t.kind === 'stronghold') { if (!w.strongholds.some(x => x.id === t.id)) return fail('없는 거점'); }
  else if (t.kind === 'general') { const g = generalById(w, t.id); if (!g || g.side !== o.side) return fail('우리 장수가 아니다'); }
  else if (t.kind === 'point') { if (!Number.isFinite(t.x) || !Number.isFinite(t.z) || !w.map.walkable(t.x, t.z)) return fail('갈 수 없는 곳'); }
  else if (t.kind === 'foe') {                                                 // 적 병사 공격(사용자 2026-11-08 "B")
    const sd = w.soldiers, e = t.id;
    if (!Number.isInteger(e) || e < 0 || e >= sd.count || !sd.alive[e] || sd.serial[e] !== t.serial || sd.side[e] === o.side) return fail('칠 적이 없다');
  }
  else return fail('모르는 목표');
  // 싸우며 갈까(어택땅): 거점·승점으로 보내면 어떻게 골랐든, 거점·구역에서 보내면(AI) 늘 — 땅·구역 선으로 보낸 고른 병사만 이동만(사용자 2026-11-08)
  const engage = o.engage ?? (f.kind !== 'ids' || t.kind === 'stronghold');
  if (o.append && f.kind === 'ids') return appendRoute(w, o);                                      // Shift+오른쪽 이어 가기(사용자 2026-11-08)
  const via = o.via?.length ? o.via.slice(0, 3).map(p => ({ x: p.x, z: p.z })) : null;   // 경유점(사용자 2026-11-07 "A"): 진형은 이 점들을 차례로 거쳐 간다
  if (via && via.some(p => !w.map.walkable(p.x, p.z))) return fail('갈 수 없는 경유점');
  let ids = f.kind === 'ids' ? pickable(w, o.side, f.ids) : troopsAt(w, o.side, f);
  const s = w.soldiers;
  let moved = 0;
  const gone = [];                                                             // 쐐기째 간 병사(명령을 함께 건다)
  if (f.kind === 'stronghold') {                                         // 거기 모이던 쐐기도 지금 간다(다 안 찼어도)
    const k = w.strongholds.findIndex(x => x.id === f.id);
    for (const grp of [...w.groups]) {
      if (grp.origin !== k || grp.side !== o.side || grp.state !== 'gather' || !grp.members.length) continue;
      const m = grp.members.filter(i => s.alive[i] && s.group[i] === grp.id);
      if (t.kind === 'general') { w.groups.splice(w.groups.indexOf(grp), 1); for (const i of m) s.group[i] = -1; ids.push(...m); continue; }   // 장수에게는 하나하나
      retargetGathering(w, grp, t);
      grp.state = 'march'; grp.sent = true; grp.order = !engage;
      grp.via = via ? via.map(p => ({ ...p })) : null;
      for (const i of m) s.state[i] = STATE.MARCH;
      moved += m.length;
      gone.push(...m);
    }
  }
  if (!ids.length && !moved) return fail('보낼 병사가 없다');
  for (const i of [...ids, ...gone]) s.volleyUntil[i] = 0;                  // 보내면 화살 비가 풀린다(casts.js)
  if (f.kind === 'ids') detachFromGroups(w, ids);                            // 행군 중인 쐐기에서 고른 병사(사용자 2026-11-08)
  const to = t.kind === 'point' ? pointTarget(w, t, ids.length) : t.kind === 'foe' ? foeTarget(w, t) : t;
  if (t.kind === 'general') setGoal(w, ids, t);
  else if (t.kind === 'foe') { sendTroops(w, ids, to, via, true); orderAll(w, [...ids, ...gone], to); }   // 적 공격은 어떻게 골랐든 명령
  else {
    // engage: 싸우며 간다. 고른 병력(플레이어)이면 어택땅 — 둘레 40 m 적과 싸운 뒤 간다. 거점·구역에서 보내기(AI)는 11-07 규칙(앞쪽 적에게만 돌진, 붙은 적만 끝내고 감) 그대로.
    sendTroops(w, ids, to, via, !engage, engage && f.kind === 'ids');
    if (!engage) orderAll(w, [...ids, ...gone], to);
    else for (const i of [...ids, ...gone]) s.order[i] = ORDER.NONE;          // 전에 받은 이동 명령이 남아 있으면 지운다(쐐기에 낀 병사는 setGoal을 거치지 않는다)
  }
  const count = ids.length + moved;
  w.events.push({ kind: 'send', side: o.side, from: f.kind === 'ids' ? { kind: 'ids', count: ids.length } : { ...f }, target: { ...to }, count, routed: !!via });   // routed: 경유점 보내기(지표의 기습)
  return { ok: true, count };
}

// 고른 병사(사용자 2026-11-08 PC 조작) 중 보낼 수 있는 병사: 우리 편·살아 있음·수비대·장수에 붙은 병사·달아나는 병사 아님. 겹친 번호는 하나로.
function pickable(w, side, list) {
  const s = w.soldiers, seen = new Set(), out = [];
  for (const i of list) {
    if (!Number.isInteger(i) || i < 0 || i >= s.count || seen.has(i)) continue;
    seen.add(i);
    if (s.alive[i] && s.side[i] === side && s.state[i] !== STATE.GARRISON && s.state[i] !== STATE.ATTACHED && s.state[i] !== STATE.FLEE) out.push(i);
  }
  return out;
}

// 이어 가기(Shift+오른쪽, 사용자 2026-11-08 — 보통 전략 게임처럼 누르자마자 가고, 누를 때마다 길이 이어진다):
// 고른 병사가 탄 명령받은 행군 쐐기는 풀지 않고 지금 목적지를 경유점 끝에 붙인 뒤 새 목적지로 간다(경유점 MAX_VIA까지).
// 쐐기 밖의 명령받은 병사는 새 목적지로 곧장. 이어 갈 병사가 없으면(이미 도착 등) 거절 — 화면이 새로 보낸다.
const MAX_VIA = 3;
function appendRoute(w, o) {
  const s = w.soldiers, t = o.target, ids = pickable(w, o.side, o.from.ids), chosen = new Set(ids);
  const groups = w.groups.filter(g => g.sent && g.state === 'march' && g.members.some(i => chosen.has(i) && s.alive[i] && s.group[i] === g.id));
  const loose = ids.filter(i => s.group[i] < 0 && s.order[i]);
  if (!groups.length && !loose.length) return fail('이어 갈 병력이 없다');
  for (const i of ids) s.volleyUntil[i] = 0;                                // 보내면 화살 비가 풀린다(casts.js)
  if (groups.some(g => (g.via?.length ?? 0) >= MAX_VIA)) return fail(`경유점은 ${MAX_VIA}개까지`);
  const n = groups.reduce((a, g) => a + g.members.filter(i => s.alive[i] && s.group[i] === g.id).length, 0) + loose.length;
  const to = t.kind === 'point' ? pointTarget(w, t, n) : t.kind === 'foe' ? foeTarget(w, t) : t;
  const fight = t.kind !== 'foe' && (o.engage ?? t.kind === 'stronghold');      // 새 목적지가 거점·승점이면 싸우며 간다(보내기와 같은 규칙)
  for (const g of groups) {
    const p = targetPoint(w, g.target);
    g.via = [...(g.via ?? []), { x: p.x, z: p.z }];
    g.target = { ...to }; g.order = !fight; g.attackMove = fight;
    const live = g.members.filter(i => s.alive[i] && s.group[i] === g.id);
    if (fight) { for (const i of live) s.order[i] = ORDER.NONE; }
    else orderAll(w, live, to);
  }
  if (loose.length) { setGoal(w, loose, to); if (!fight) orderAll(w, loose, to); }   // 명령받고 가던 병사는 새 목적지로 곧장
  w.events.push({ kind: 'send', side: o.side, from: { kind: 'ids', count: n }, target: { ...to }, count: n, append: true });
  return { ok: true, count: n };
}

// 보낸 병사 모두에게 명령: 땅·거점·구역이면 MOVE(도착할 때까지 새 적을 찾지 않는다), 적이면 ATTACK(사용자 2026-11-08 "B").
function orderAll(w, ids, to) {
  const s = w.soldiers, attack = to.kind === 'foe';
  for (const i of ids) {
    s.order[i] = attack ? ORDER.ATTACK : ORDER.MOVE; s.orderBest[i] = Infinity; s.orderAt[i] = w.time;
    if (attack) { s.orderFoe[i] = to.id; s.orderSerial[i] = to.serial; }
  }
}
const foeTarget = (w, t) => ({ kind: 'foe', id: t.id, serial: t.serial, x: w.soldiers.x[t.id], z: w.soldiers.z[t.id] });

// "그 자리" 목표: 무리 크기에 맞춘 원(한 명당 POINT_AREA m²)과 그 점의 흐름장.
const POINT_AREA = 2.5, POINT_MIN_R = 4;
function pointTarget(w, t, n) {
  return { kind: 'point', x: t.x, z: t.z, r: Math.max(POINT_MIN_R, Math.sqrt(n * POINT_AREA / Math.PI)), field: pointFieldId(w, t.x, t.z) };
}

export const MAKERS = ['pikes', 'archery', 'stable'];   // 생산 칸에 짓는 것
export const UPGRADES = ['wall', 'tower'];              // 생산 칸 뒤 강화 칸(차례대로) — 칸을 다투지 않는다(사용자 2026-11-07)
// 칸 k에 지을 수 있는 것: 생산 칸이면 MAKERS, 강화 칸이면 그 하나.
export const slotKinds = (st, k) => (k < st.slotCount ? MAKERS : [UPGRADES[k - st.slotCount]]);

function ownSlot(w, o) {
  const st = w.strongholds.find(x => x.id === o.stronghold);
  if (!st || isPoint(st)) return { err: '거점이 아니다' };
  if (st.owner !== o.side) return { err: '우리 거점이 아니다' };
  if (!(o.slot >= 0 && o.slot < st.slots.length)) return { err: '없는 칸' };
  return { st };
}

const costOf = (w, b) => w.rules.buildings[b.kind].cost * (b.level >= 2 ? 1 + w.rules.buildings.upgradeCost : 1);

// 짓기(§3.3): 값을 내고 buildSeconds 뒤 돈다. 성벽은 거점에 하나.
function build(w, o) {
  const { st, err } = ownSlot(w, o);
  if (err) return fail(err);
  if (st.slots[o.slot]) return fail('칸이 차 있다');
  if (!slotKinds(st, o.slot).includes(o.building)) return fail('이 칸에 지을 수 없다');
  if (o.building === 'wall' && st.kind === 'hq') return fail('본진은 처음부터 성벽이 있다');
  const def = w.rules.buildings[o.building];
  if (w.sides[o.side].gold < def.cost) return fail('금이 모자라다');
  w.sides[o.side].gold -= def.cost;
  const hp = o.building === 'wall' ? def.hp : w.rules.buildings.hp;
  st.slots[o.slot] = { kind: o.building, level: 1, hp, building: true, doneAt: w.time + w.rules.buildings.buildSeconds };
  w.events.push({ kind: 'build', side: o.side, stronghold: st.id, building: o.building });
  return { ok: true };
}

// 올리기: 값 × upgradeCost(1.5), 바로 2단계. 성벽 2단계는 체력 ×2.
function upgrade(w, o) {
  const { st, err } = ownSlot(w, o);
  if (err) return fail(err);
  const b = st.slots[o.slot];
  if (!b || b.building) return fail('올릴 건물이 없다');
  if (b.level >= 2) return fail('이미 2단계');
  const cost = w.rules.buildings[b.kind].cost * w.rules.buildings.upgradeCost;
  if (w.sides[o.side].gold < cost) return fail('금이 모자라다');
  w.sides[o.side].gold -= cost;
  b.level = 2;
  if (b.kind === 'wall') b.hp *= 2;
  return { ok: true };
}

// 철거: 낸 값의 반을 돌려받는다. 원 안에 적이 있으면 못 한다(빼앗기기 직전 철거 방지).
function demolish(w, o) {
  const { st, err } = ownSlot(w, o);
  if (err) return fail(err);
  const b = st.slots[o.slot];
  if (!b) return fail('빈 칸');
  if (st.weightIn && st.weightIn[1 - o.side] > 0) return fail('원 안에 적이 있다');
  w.sides[o.side].gold += costOf(w, b) * w.rules.buildings.demolishRefund;
  st.slots[o.slot] = null;
  return { ok: true };
}
