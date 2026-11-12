// 명령(플레이어·AI 공통). 세상을 바꾸는 길은 이것뿐이다.
import { sendTroops, targetPoint, detachFromGroups } from './groups.js';
import { STATE, ORDER } from './soldiers.js';
import { setGoal, pointFieldId } from './world.js';
import { castOrder } from './casts.js';
import { startSquad, dropFromSquads } from './squads.js';
import { buildOrder, assistOrder } from './workers.js';
import { trainOrder, cancelOrder, rallyOrder, researchOrder } from './produce.js';

const fail = reason => ({ ok: false, reason });

export function applyOrder(w, o) {
  if (w.result) return fail('판이 끝났다');               // 끝난 판(3단계 최종 검토 — 판 끝 뒤 생산 단추가 값을 깎았다)
  switch (o.kind) {
    case 'send': return send(w, o);
    case 'cast': return castOrder(w, o);                 // 지휘 스킬(casts.js)
    case 'stop': return stopOrder(w, o);                 // 멈춤(4단계 — S)
    case 'build': return buildOrder(w, o);               // 광부 조가 짓기(workers.js)
    case 'assist': return assistOrder(w, o);             // 광부 조가 돕기·고치기
    case 'train': return trainOrder(w, o);               // 생산 줄(produce.js)
    case 'research': return researchOrder(w, o);
    case 'cancel': return cancelOrder(w, o);
    case 'rally': return rallyOrder(w, o);
    default: return fail(`모르는 명령 ${o.kind}`);
  }
}

function send(w, o) {
  const f = o.from;
  let t = o.target;
  if (!f || !t) return fail('어디서 어디로');
  const onBuilding = t.kind === 'building';
  if (onBuilding) { t = buildingPoint(w, o.side, f, t); if (!t) return fail('칠 건물이 없다'); }   // 적 건물 공격(3단계): 그 둘레 점으로 이동 — 도착하면 건물을 친다(strikes.js)
  if (f.kind !== 'ids' || !Array.isArray(f.ids)) return fail('고른 병사가 없다');
  if (t.kind === 'point') { if (!Number.isFinite(t.x) || !Number.isFinite(t.z) || !w.map.walkable(t.x, t.z)) return fail('갈 수 없는 곳'); }
  else if (t.kind === 'foe') {                                                 // 적 병사 공격(사용자 2026-11-08 "B")
    const sd = w.soldiers, e = t.id;
    if (!Number.isInteger(e) || e < 0 || e >= sd.count || !sd.alive[e] || sd.serial[e] !== t.serial || sd.side[e] === o.side) return fail('칠 적이 없다');
  }
  else return fail('모르는 목표');
  // 싸우며 갈까: engage 없음 = 이동만(가는 길엔 싸우지 않고 닿은 적만 친다, 홍수 사용자 2026-11-08), true = 어택땅, 'forward' = 아래
  const engage = o.engage ?? false;
  if (o.append) return appendRoute(w, o);                                      // Shift+오른쪽 이어 가기(사용자 2026-11-08)
  const via = o.via?.length ? o.via.slice(0, 3).map(p => ({ x: p.x, z: p.z })) : null;   // 경유점(사용자 2026-11-07 "A"): 진형은 이 점들을 차례로 거쳐 간다
  if (via && via.some(p => !w.map.walkable(p.x, p.z))) return fail('갈 수 없는 경유점');
  const picked = pickable(w, o.side, f.ids);
  const s = w.soldiers;
  // 광부(3단계)는 쐐기에 끼지 않는다: 땅으로 보내면 일을 놓고 따로 걷고, 적으로 보내면 빠진다
  const crewSet = new Set(picked.filter(i => w.rules.units[s.side[i]][s.type[i]].worker));
  const ids = crewSet.size ? picked.filter(i => !crewSet.has(i)) : picked, crew = t.kind === 'point' && !onBuilding ? [...crewSet] : [];   // 건물 공격에는 광부가 빠진다
  if (!ids.length && !crew.length) return fail('보낼 병사가 없다');
  const to = t.kind === 'point' ? pointTarget(w, t, picked.length) : t.kind === 'foe' ? foeTarget(w, t) : t;
  if (crew.length) { dropFromSquads(w, crew); for (const i of crew) s.job[i] = -1; setGoal(w, crew, to); orderAll(w, crew, to); }
  if (!ids.length) { w.events.push({ kind: 'send', side: o.side, from: { kind: 'ids', count: crew.length }, target: { ...to }, count: crew.length, routed: false }); return { ok: true, count: crew.length }; }
  for (const i of ids) s.volleyUntil[i] = 0;   // 보내면 화살 비가 풀린다
  detachFromGroups(w, ids);                            // 행군 중인 쐐기에서 고른 병사(사용자 2026-11-08)
  if (t.kind === 'foe') startSquad(w, ids, to); else dropFromSquads(w, ids);   // 공격 무리(squads.js): 적이 다 쓰러지면 진형으로 선다
  if (t.kind === 'foe') { sendTroops(w, ids, to, via, true); orderAll(w, ids, to); }   // 적 공격은 어떻게 골랐든 명령
  else {
    // engage: 싸우며 간다. true = 어택땅(둘레 40 m 적과 싸운 뒤 간다), 'forward' = 홍수의 거점·구역 보내기(11-07 규칙: 앞쪽 적에게만 돌진,
    // 붙은 적만 끝내고 감 — 군단 영지에는 구역이 없어 이 값으로 남긴다. AI가 쓸 수 있다)
    sendTroops(w, ids, to, via, !engage, engage === true);
    if (!engage) orderAll(w, ids, to);
    else for (const i of ids) s.order[i] = ORDER.NONE;          // 전에 받은 이동 명령이 남아 있으면 지운다(쐐기에 낀 병사는 setGoal을 거치지 않는다)
  }
  const count = ids.length + crew.length;
  w.events.push({ kind: 'send', side: o.side, from: f.kind === 'ids' ? { kind: 'ids', count: ids.length } : { ...f }, target: { ...to }, count, routed: !!via });   // routed: 경유점 보내기(지표의 기습)
  return { ok: true, count };
}

// 멈춤(설계서 §4 "S 멈춤", 4단계): 이동·공격 명령을 풀고 행군 쐐기·공격 무리에서 빼 그 자리에 선다(제 자리가 목표).
// 노리던 적·빠지는 중·밀고 들어가기·화살 비를 비우고 광부는 일을 놓는다. 다음 판단부터는 원래대로 가까운 적과 싸운다.
function stopOrder(w, o) {
  const ids = pickable(w, o.side, Array.isArray(o.ids) ? o.ids : []), s = w.soldiers;
  if (!ids.length) return fail('멈출 병사가 없다');
  detachFromGroups(w, ids);
  dropFromSquads(w, ids);
  for (const i of ids) {
    setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] });
    s.target[i] = -1; s.rtarget[i] = -1; s.leaveUntil[i] = 0; s.pressUntil[i] = 0; s.volleyUntil[i] = 0; s.job[i] = -1;
  }
  w.events.push({ kind: 'stop', side: o.side, count: ids.length });
  return { ok: true, count: ids.length };
}

// 고른 병사(사용자 2026-11-08 PC 조작) 중 보낼 수 있는 병사: 우리 편·살아 있음·달아나는 병사 아님. 겹친 번호는 하나로.
function pickable(w, side, list) {
  const s = w.soldiers, seen = new Set(), out = [];
  for (const i of list) {
    if (!Number.isInteger(i) || i < 0 || i >= s.count || seen.has(i)) continue;
    seen.add(i);
    if (s.alive[i] && s.side[i] === side && s.state[i] !== STATE.FLEE) out.push(i);
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
  if (groups.some(g => (g.via?.length ?? 0) >= MAX_VIA)) return fail(`경유점은 ${MAX_VIA}개까지`);
  for (const i of ids) { s.volleyUntil[i] = 0; s.job[i] = -1; }   // 보내면 화살 비가 풀리고 광부는 일을 놓는다(거절되면 그대로)
  if (t.kind === 'foe') startSquad(w, ids, foeTarget(w, t)); else dropFromSquads(w, ids);
  const n = groups.reduce((a, g) => a + g.members.filter(i => s.alive[i] && s.group[i] === g.id).length, 0) + loose.length;
  const to = t.kind === 'point' ? pointTarget(w, t, n) : t.kind === 'foe' ? foeTarget(w, t) : t;
  const fight = t.kind !== 'foe' && (o.engage ?? false);      // engage면 싸우며 간다(보내기와 같은 규칙)
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
// 적 건물 둘레의 점: 고른 병력 가운데에서 본 건물 가장자리 + 2 m(막혔으면 건물 문). 우리·죽은·없는 건물이면 null.
function buildingPoint(w, side, f, t) {
  const b = w.buildingById.get(t.id);
  if (!b || !b.alive || b.side === side) return null;
  const s = w.soldiers, ids = f.kind === 'ids' && Array.isArray(f.ids) ? f.ids.filter(i => Number.isInteger(i) && i >= 0 && i < s.count && s.alive[i] && s.side[i] === side) : [];
  let cx = b.gate.x, cz = b.gate.z;
  if (ids.length) { cx = 0; cz = 0; for (const i of ids) { cx += s.x[i]; cz += s.z[i]; } cx /= ids.length; cz /= ids.length; }
  const a = Math.atan2(cz - b.z, cx - b.x), x = b.x + Math.cos(a) * (b.r + 2), z = b.z + Math.sin(a) * (b.r + 2);
  // ring: 도착한 병사는 건물 둘레 띠(가장자리에서 1 m ~ 칠 수 있는 거리) 위 제 자리에 선다 — 한 점 둘레 원이면 절반 가까이 손이 안 닿았다(3단계 최종 검토)
  const ring = { x: b.x, z: b.z, r0: b.r + 1, r1: b.r + w.rules.buildingDamage.reach - 0.5 };
  return w.map.walkable(x, z) ? { kind: 'point', x, z, ring } : { kind: 'point', x: b.gate.x, z: b.gate.z, ring };
}

const foeTarget = (w, t) => ({ kind: 'foe', id: t.id, serial: t.serial, x: w.soldiers.x[t.id], z: w.soldiers.z[t.id] });

// "그 자리" 목표: 무리 크기에 맞춘 원(한 명당 POINT_AREA m²)과 그 점의 흐름장.
const POINT_AREA = 2.5, POINT_MIN_R = 4;
function pointTarget(w, t, n) {
  return { kind: 'point', x: t.x, z: t.z, r: Math.max(POINT_MIN_R, Math.sqrt(n * POINT_AREA / Math.PI)), field: pointFieldId(w, t.x, t.z), ...(t.ring ? { ring: t.ring } : {}) };
}

