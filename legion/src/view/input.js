// 조작 → 명령. PC(마우스·키보드) 전용 — 홍수 설계서 §5(사용자 2026-11-08: "전반적으로 조작이 너무 불편하다")에서 옛 판 부분(거점·구역·생산 방향)을 뺐다.
// · 왼쪽 = 고르기: 병사를 누르면 그 부대(4단계 — 광부면 그 조), 두 번 누르면 화면 안 같은 병종 모두, 빈 땅에서 끌면 닿은 부대 전체. Shift = 더하기, 빈 땅 누르기·Esc = 풀기.
// · 오른쪽 = 고른 병력 보내기. 땅을 누르면 이동만(가는 길에 새 적을 찾지 않고, 이동 중엔 쏘지도 않는다),
//   보이는 적 병사를 누르면 그 적을 공격(사용자 2026-11-08 "B", 토탈 워처럼).
//   Shift+오른쪽 = 이어 가기: 누르자마자 가고, 누를 때마다 지금 목적지 뒤로 길이 이어진다(경유점 3개까지).
//   Alt+오른쪽 = 어택땅: 싸우며 간다(Shift와 같이 쓰면 어택땅으로 길을 잇는다).
// · 지휘 스킬(군단 영지: 쿨타임만): 단추나 Z·X·C로 겨누고(4단계 키 배치), 왼쪽 클릭으로 원을 찍어 건다.
//   같은 단추·키 다시, 오른쪽 클릭, Esc = 그만두기(겨누는 동안 오른쪽 클릭은 보내기가 아니다). 숫자 칸에 칠 때는 키가 먹지 않는다.
// · 화면: 가운데 버튼 끌기(회전·기울기)·방향키 이동은 scene.js, 화면 가장자리 이동(0.3초 머문 뒤)은 여기.
// · 3단계: 광부(하나를 누르면 그 조)·우리 건물 고르기, 짓기 놓기(HUD 단추 → 왼쪽 = 놓기, Shift = 이어서, 오른쪽·Esc = 그만),
//   건물을 고르고 오른쪽 = 집결지, 광부를 고르고 짓는·다친 우리 건물에 오른쪽 = 돕기, 적 건물에 오른쪽 = 건물 공격(적 병사가 먼저).
import { remember, stillSelected, sendTarget, byType, clickTroops, boxUnits, sameTypeOnScreen } from './select.js';
import { crewMates } from '../sim/workers.js';
import { STATE } from '../sim/soldiers.js';
import { buildingAt, canPlace, buildingName } from '../sim/buildings.js';
import { costText } from './panel.js';
import { keyAction, shouldPrevent } from './keys.js';
import { createGroups } from './controlGroups.js';
import { miniSendCheck } from './minimap.js';
import { CASTS, canCast, castTargets } from '../sim/casts.js';
import { CAST_COLORS } from './scene.js';
import { CAST_TEXT } from './hud.js';

const TAP_MOVE = 8;          // px — 이보다 덜 움직이고 떼면 누르기, 넘으면 네모
const WEDGE_PICK_M = 4, WEDGE_PICK_PX = 10;   // 부대: 누른 곳에서 가장 가까운 우리 병사가 이만큼 안이면 그 부대(4단계 — 이름은 옛 쐐기 누르기에서)
const DOUBLE_TAP_MS = 350, DOUBLE_TAP_PX = 12;  // 두 번 누르기(같은 병종 모두)
const GROUP_DOUBLE_MS = 400;                    // 같은 부대 숫자를 이 안에 두 번 = 그 부대로 화면(4단계)
const FOE_PICK_M = 6, FOE_PICK_PX = 12;       // 오른쪽 클릭: 누른 곳에서 가장 가까운 보이는 적 병사가 이만큼 안이면 그 적을 공격
const BUILDING_PAD = 2;                       // 건물 누르기: 가운데에서 반지름 + 이만큼 m
const PLACE_OK = 0x4caf50, PLACE_BAD = 0xe0533c;   // 놓기 원 색
const EDGE_PX = 40, EDGE_WAIT = 0.3, EDGE_SCREENS = 0.35;   // 화면 가장자리 이동: 띠 폭 px, 머문 뒤 초, 가장 끝에서 1초에 흐르는 화면 높이(깊이의 제곱)
const PRUNE_EVERY = 0.25;    // 초 — 고른 것에서 죽은 병사를 빼는 주기
const AIM_PREVIEW_EVERY = 150;   // ms — 겨누는 원에 걸릴 병사를 다시 세는 주기

export function createInput(view, canvas, getWorld, side, hooks) {
  const { onOrder = () => ({ ok: true }), toast = () => {}, onSelection = () => {}, canSee = null, onKey = () => {}, onGhost = () => {} } = hooks;   // onKey: 여기서 다루지 않는 키 할 일(main.js), onGhost: 짓기 유령(4단계)
  let shiftHeld = false, altHeld = false;   // 포인터 이벤트의 shiftKey·altKey가 빠지는 환경(iframe 등) 대비
  let sel = { ids: [], serials: [] }, flags = null;
  let route = null;   // 고른 병력에 내린 마지막 보내기의 길(목적지들) — Shift+오른쪽이 여기에 잇는다. 고르기가 바뀌면 지운다.
  let drag = null;   // 왼쪽 누름: { pointerId, startX, startY, startGround, box }
  const pointer = { x: 0, y: 0, over: false, edgeSince: -1 };
  let aim = null, aimFlags = null, aimN = 0, aimAt = 0;   // 겨누는 지휘 스킬(CASTS 하나)과 걸릴 병사 미리 보기
  let selB = -1, placing = null;                          // 고른 우리 건물 id, 놓는 중인 건물 종류(3단계)
  let amove = false;                                      // 어택땅 단추를 눌러 땅 클릭을 기다리는 중(4단계 명령 단추)
  const groups = createGroups();                          // 부대 지정(숫자 1~9, 4단계)
  let lastGroup = { n: 0, t: -1e9 };

  // 네모와 이름표(마우스 옆 글)
  const boxEl = document.createElement('div');
  boxEl.style.cssText = 'position:fixed;border:1.5px solid #fff;background:rgba(255,255,255,.12);pointer-events:none;display:none;z-index:5';
  const tipEl = document.createElement('div');
  tipEl.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:6;background:rgba(44,44,42,.85);color:#fff;font:13px/1.35 system-ui,"Malgun Gothic",sans-serif;padding:4px 8px;border-radius:7px;white-space:nowrap';
  document.body.append(boxEl, tipEl);

  window.addEventListener('keydown', e => {
    if (e.key === 'Shift' && !shiftHeld) { shiftHeld = true; showPreview(); }
    if (e.key === 'Alt') { altHeld = true; e.preventDefault(); }   // Alt = 어택땅. 기본 동작(윈도 브라우저 메뉴로 포커스가 넘어감)을 막는다
    const ke = { code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat, tag: e.target?.tagName };   // 키 배치(keys.js, 사용자 2026-11-13)
    if (shouldPrevent(ke)) e.preventDefault();                   // Ctrl+숫자(탭)·Space — 꾹 눌러 반복될 때도
    const a = keyAction(ke);
    if (!a) return;
    (keyHandlers[a.kind] ?? onKey)(a);
  });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') { shiftHeld = false; showPreview(); } if (e.key === 'Alt') { altHeld = false; e.preventDefault(); } });
  window.addEventListener('blur', () => { shiftHeld = false; altHeld = false; });

  // 키 할 일(keys.js) 가운데 고르기·겨누기에 닿는 것. 나머지는 onKey로.
  const keyHandlers = {
    cast: a => toggleAim(a.order),
    cancel: () => { if (amove) amove = false; else if (placing) stopPlace(); else if (aim) stopAim(); else { select([], false); selectBuilding(-1); } },
    groupSet: a => {                                             // Ctrl+숫자 = 지정
      const live = stillSelected(getWorld(), side, sel);
      if (!live.ids.length) { toast('먼저 병력을 고르세요'); return; }
      groups.set(a.n, live); toast(`부대 ${a.n} 지정 — ${live.ids.length}명`);
    },
    groupAdd: a => {                                             // Shift+숫자 = 더하기
      const live = stillSelected(getWorld(), side, sel);
      if (!live.ids.length) { toast('먼저 병력을 고르세요'); return; }
      groups.add(a.n, live); toast(`부대 ${a.n}에 더함 — ${groups.get(getWorld(), side, a.n).ids.length}명`);
    },
    groupSelect: a => selectGroup(a.n),
    stop: () => {                                                // S = 멈춤(4단계)
      if (!sel.ids.length) { toast('먼저 병력을 고르세요'); return; }
      const r = onOrder({ kind: 'stop', side, ids: sel.ids });
      toast(r && r.ok ? `${r.count}명 멈춤` : r?.reason ?? '');
      route = null; showPreview();
    },
  };
  // 숫자 = 그 부대 고르기, 같은 숫자를 GROUP_DOUBLE_MS 안에 두 번 = 그 부대 가운데로 화면. 빈 칸이면 알리고 고른 것은 그대로.
  function selectGroup(n) {
    const w = getWorld(), got = groups.get(w, side, n), now = performance.now();
    if (!got.ids.length) { toast(`부대 ${n}이 비었다`); lastGroup = { n: 0, t: -1e9 }; return; }
    const again = lastGroup.n === n && now - lastGroup.t < GROUP_DOUBLE_MS;
    lastGroup = { n, t: now };
    select(got.ids, false);
    if (again) { const c = groups.center(w, side, n); if (c) Object.assign(view.cam, { tx: c.x, tz: c.z }); }
    else toast(`부대 ${n} — ${got.ids.length}명`);
  }
  // 미니맵 오른쪽 클릭(4단계): 고른 병력을 그 자리로(Alt·어택땅 단추가 켜져 있으면 싸우며 간다).
  function sendTo(x, z, attack) {
    const w = getWorld();
    if (w.result) return;
    if (selB >= 0) { const r = onOrder({ kind: 'rally', side, building: selB, x, z }); toast(r && r.ok ? '집결지 → 미니맵 자리' : r?.reason ?? ''); return; }   // 고른 건물이면 집결지
    attack = attack || altHeld;
    const why = miniSendCheck({ selected: sel.ids.length, walkable: w.map.walkable(x, z), mode: aim ? 'aim' : placing ? 'place' : amove ? 'amove' : null });
    if (why) { toast(why); return; }
    const fight = attack || amove;
    amove = false;
    const r = onOrder({ kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target: { kind: 'point', x, z }, ...(fight ? { engage: true } : {}) });
    toast(r && r.ok ? `${r.count}명 ${fight ? '어택땅' : '출발'} → 미니맵 자리` : r?.reason ?? '');
    route = r && r.ok ? { stops: [{ x, z }] } : null;
  }
  // 어택땅 단추(4단계 명령 단추): 누른 뒤 땅을 왼쪽 클릭하면 싸우며 간다(적 병사 위면 공격). 오른쪽·Esc = 그만.
  function startAttackMove() {
    if (getWorld().result) return;
    if (!sel.ids.length) { toast('먼저 병력을 고르세요'); return; }
    stopAim(); stopPlace(); amove = true;
  }
  function attackMoveAt(e) {
    const w = getWorld(), p = view.screenToGround(e.clientX, e.clientY);
    if (w.result) { amove = false; return; }
    if (!p) { toast('땅을 눌러 주세요'); return; }
    amove = false;
    const f = foeAt(w, e.clientX, e.clientY, p), eb = f < 0 ? buildingAt(w, p.x, p.z, BUILDING_PAD) : null;
    if (eb && eb.side !== side && (!canSee || canSee(eb.x, eb.z))) {   // 적 건물 위면 건물 공격(오른쪽 클릭과 같게)
      const r = onOrder({ kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target: { kind: 'building', id: eb.id } });
      toast(r && r.ok ? `${r.count}명 공격 → 적 ${buildingName(eb.def, eb.side)}` : r?.reason ?? '');
      return;
    }
    const target = sendTarget(w, side, p, f);
    if (!target) { toast('갈 수 없는 곳(물·바위·건물)'); return; }
    const r = onOrder({ kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target, ...(target.kind === 'foe' ? {} : { engage: true }) });
    toast(r && r.ok ? `${r.count}명 ${target.kind === 'foe' ? `공격 → ${foeName(w, f)}` : '어택땅 → 이 자리'}` : r?.reason ?? '');
    route = r && r.ok ? { stops: [{ x: p.x, z: p.z }] } : null;
  }

  // ---- 누른 곳 알아보기 ----
  const metersPerPx = (cx, cy, p) => { const q = view.screenToGround(cx + 10, cy); return q && p ? Math.hypot(q.x - p.x, q.z - p.z) / 10 : 1; };
  function soldierAt(w, cx, cy, p) {
    if (!p) return -1;
    const s = w.soldiers, r = Math.max(WEDGE_PICK_M, WEDGE_PICK_PX * metersPerPx(cx, cy, p));
    let best = -1, bd = r;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || s.side[i] !== side || s.state[i] === STATE.FLEE) continue;
      const d = Math.hypot(s.x[i] - p.x, s.z[i] - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // 오른쪽 클릭으로 칠 적: 누른 곳에서 가장 가까운 보이는(안개 밖) 적 병사.
  function foeAt(w, cx, cy, p) {
    if (!p) return -1;
    const s = w.soldiers, r = Math.max(FOE_PICK_M, FOE_PICK_PX * metersPerPx(cx, cy, p));
    let best = -1, bd = r;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || s.side[i] === side) continue;
      const d = Math.hypot(s.x[i] - p.x, s.z[i] - p.z);
      if (d < bd && (!canSee || canSee(s.x[i], s.z[i]))) { bd = d; best = i; }
    }
    return best;
  }
  const foeName = (w, f) => `적 ${w.rules.units[w.soldiers.side[f]][w.soldiers.type[f]].name}`;
  // 왼쪽으로 누르면 골라질 것: 누른 곳 가까이의 우리 병사가 속한 부대(광부면 그 조) — 4단계 부대 단위 고르기.
  function pickAt(w, cx, cy) {
    const i = soldierAt(w, cx, cy, view.screenToGround(cx, cy));
    if (i < 0) return null;
    const s = w.soldiers, crew = s.crew[i] >= 0, ids = crew ? crewMates(w, i) : clickTroops(w, i);   // 부대 → 쐐기 → 하나
    let x = 0, z = 0;
    for (const j of ids) { x += s.x[j]; z += s.z[j]; }
    return { i, ids, crew, x: x / ids.length, z: z / ids.length, r: Math.max(4, Math.sqrt(ids.length) * 1.3) };
  }
  let lastTap = null;   // 두 번 누르기

  // ---- 고르기 ----
  function select(ids, add) {
    const w = getWorld();
    if (ids.length) selB = -1;                                   // 병사를 고르면 건물 고르기는 풀린다
    if (add) {
      const have = new Set(sel.ids), extra = remember(w, ids.filter(i => !have.has(i)));
      sel = { ids: [...sel.ids, ...extra.ids], serials: [...sel.serials, ...extra.serials] };
    } else sel = remember(w, ids);
    rebuildFlags();
    route = null; showPreview();
    onSelection(sel.ids);
  }
  function rebuildFlags() {
    const s = getWorld().soldiers;
    if (!flags || flags.length !== s.capacity) flags = new Uint8Array(s.capacity);
    flags.fill(0);
    for (const i of sel.ids) flags[i] = 1;
  }

  function selectBuilding(id) {
    selB = id;
    if (id >= 0 && sel.ids.length) { sel = { ids: [], serials: [] }; rebuildFlags(); route = null; onSelection(sel.ids); }   // 건물을 고르면 병사 고르기는 풀린다
  }
  const workersIn = ids => { const w = getWorld(), s = w.soldiers; return ids.filter(i => s.alive[i] && w.rules.units[s.side[i]][s.type[i]].worker); };

  // ---- 짓기 놓기(3단계) ----
  function startPlace(type) { if (getWorld().result) return; stopAim(); amove = false; placing = type; }
  function stopPlace() { placing = null; view.setAim(null); onGhost(null); }
  function placeAt(e) {
    const w = getWorld(), p = view.screenToGround(e.clientX, e.clientY);
    if (!p || w.result) return;
    const name = buildingName(w.rules.buildings[placing], side), r = onOrder({ kind: 'build', side, type: placing, x: p.x, z: p.z, workers: sel.ids });
    if (r && r.ok) { toast(`${name} 짓기 시작`); if (!(e.shiftKey || shiftHeld)) stopPlace(); }
    else if (r) toast(`${name}: ${r.reason}`);
  }
  function placeHover(w) {
    if (!workersIn(sel.ids).length) { stopPlace(); toast('놓기를 그만둔다 — 고른 광부가 없다'); return; }
    const p = view.screenToGround(pointer.x, pointer.y), def = w.rules.buildings[placing], name = buildingName(def, side);
    view.setHover(null);
    if (!p) { view.setAim(null); onGhost(null); return; }
    const at = canPlace(w, side, placing, p.x, p.z);
    view.setAim({ x: at.x ?? p.x, z: at.z ?? p.z, r: def.r, color: at.ok ? PLACE_OK : PLACE_BAD });
    onGhost({ type: placing, side, x: at.x ?? p.x, z: at.z ?? p.z, ok: at.ok });   // 짓기 유령(4단계)
    const lines = [`${name} 놓기 — 왼쪽 클릭(Shift = 이어서), 오른쪽·Esc 그만`, at.ok ? costText(def) : at.reason];
    tipEl.innerHTML = lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
    Object.assign(tipEl.style, { display: 'block', left: `${pointer.x + 16}px`, top: `${pointer.y + 14}px` });
  }

  // ---- 지휘 스킬 겨누기 ----
  function toggleAim(order) {
    if (!CASTS.includes(order) || getWorld().result) return;
    if (placing) stopPlace();
    amove = false;
    if (aim === order) { stopAim(); return; }
    aim = order; aimAt = 0;
  }
  function stopAim() { aim = null; aimFlags = null; view.setAim(null); view.setHover(null); }
  function castAt(e) {
    const w = getWorld(), p = view.screenToGround(e.clientX, e.clientY);
    if (!p || w.result) return;
    const r = onOrder({ kind: 'cast', side, order: aim, x: p.x, z: p.z }), name = CAST_TEXT[aim].name;
    if (r && r.ok) { toast(`${name} — ${r.count}명`); stopAim(); }
    else if (r) toast(`${name}: ${r.reason}`);
  }

  // ---- 명령 ----
  function command(e) {
    const w = getWorld(), p = view.screenToGround(e.clientX, e.clientY);
    if (!p || w.result) return;
    if (selB >= 0) {                                                           // 고른 건물: 집결지
      const r = onOrder({ kind: 'rally', side, building: selB, x: p.x, z: p.z });
      toast(r && r.ok ? '집결지 → 이 자리' : r?.reason ?? '');
      return;
    }
    if (!sel.ids.length) { toast('먼저 병력을 고르세요 — 병사를 누르거나 빈 땅에서 끌어 네모'); return; }
    const b = buildingAt(w, p.x, p.z, BUILDING_PAD), crew = workersIn(sel.ids);
    if (b && b.side === side && crew.length && (!b.done || b.hp < b.maxHp)) {   // 광부: 짓는·다친 우리 건물 돕기
      const r = onOrder({ kind: 'assist', side, building: b.id, workers: crew });
      toast(r && r.ok ? `광부 ${r.count}명 → ${buildingName(b.def, side)} ${b.done ? '고치기' : '짓기'}` : r?.reason ?? '');
      return;
    }
    const f = foeAt(w, e.clientX, e.clientY, p);
    if (f < 0 && b && b.side !== side && (!canSee || canSee(b.x, b.z))) {     // 적 건물 공격(적 병사가 먼저)
      const r = onOrder({ kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target: { kind: 'building', id: b.id } });
      toast(r && r.ok ? `${r.count}명 공격 → 적 ${buildingName(b.def, b.side)}` : r?.reason ?? '');
      route = null; showPreview();
      return;
    }
    const target = sendTarget(w, side, p, f);
    if (!target) { toast('갈 수 없는 곳(물·바위·건물)'); return; }
    const isFoe = target.kind === 'foe', name = isFoe ? foeName(w, f) : '이 자리';
    const stop = isFoe ? { x: w.soldiers.x[f], z: w.soldiers.z[f] } : { x: p.x, z: p.z };
    const attack = !isFoe && (e.altKey || altHeld);                            // Alt+오른쪽 = 어택땅(토탈 워의 Alt+오른쪽처럼)
    if ((e.shiftKey || shiftHeld) && route) {
      const r = onOrder({ kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target, append: true, ...(attack ? { engage: true } : {}) });
      if (r && r.ok) { route.stops.push(stop); toast(`이어 가기 → ${name} (경유 ${route.stops.length - 1})`); showPreview(); return; }
      if (r && r.reason !== '이어 갈 병력이 없다') { toast(r.reason); return; }   // 이어 갈 병력이 없으면(이미 도착) 새로 보낸다
    }
    const o = { kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target };
    if (attack) o.engage = true;
    const r = onOrder(o);
    if (r && r.ok) { toast(isFoe ? `${r.count}명 공격 → ${name}` : `${r.count}명 ${attack ? '어택땅' : '출발'} → ${name}`); route = { stops: [stop] }; }
    else if (r) toast(r.reason);
    showPreview();
  }

  // 길 미리 보기(Shift를 누르고 있을 때): 고른 병력 가운데 → 지금 길의 목적지들 → 마우스 자리(다음 Shift+오른쪽이 이을 곳).
  function showPreview() {
    if (!shiftHeld || !sel.ids.length) { view.setPreview(null); return; }
    const w = getWorld(), s = w.soldiers;
    let cx = 0, cz = 0, n = 0;
    for (const i of sel.ids) if (s.alive[i]) { cx += s.x[i]; cz += s.z[i]; n++; }
    if (!n) { view.setPreview(null); return; }
    const stops = [{ x: cx / n, z: cz / n }, ...(route ? route.stops : [])];
    if (pointer.over) { const p = view.screenToGround(pointer.x, pointer.y); if (p) stops.push(p); }
    view.setPreview(stops.slice(1).map((q, k) => ({ from: stops[k], to: q, color: 0xfaeeda })));
  }

  // ---- 포인터 ----
  view.controls.gestureFilter = e => {
    const w = getWorld();
    if (w.result) return false;
    if (e.button === 2) { if (amove) amove = false; else if (placing) stopPlace(); else if (aim) stopAim(); else command(e); return true; }   // 겨누는·놓는·어택땅 기다리는 동안 오른쪽 = 그만두기(보내지 않는다)
    if (e.button === 0 && amove) { attackMoveAt(e); return true; }
    if (e.button === 0 && placing) { placeAt(e); return true; }
    if (e.button === 0 && aim) { castAt(e); return true; }
    if (e.button !== 0) return false;                             // 가운데 버튼 = 회전·기울기(scene.js)
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startGround: view.screenToGround(e.clientX, e.clientY), box: false };
    return true;
  };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.over = true;
    if (drag && e.pointerId === drag.pointerId && !drag.box && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= TAP_MOVE) drag.box = true;
    if (shiftHeld) showPreview();
  });
  canvas.addEventListener('pointerleave', () => { pointer.over = false; pointer.edgeSince = -1; tipEl.style.display = 'none'; view.setHover(null); });
  function end(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag, w = getWorld(), add = e.shiftKey || shiftHeld;
    drag = null;
    boxEl.style.display = 'none';
    if (d.box) {
      const a = d.startGround ? view.worldToScreen(d.startGround.x, d.startGround.z, 0) : { x: d.startX, y: d.startY };
      const ids = boxUnits(w, side, (x, z) => view.worldToScreen(x, z, 0), { x0: a.x, y0: a.y, x1: e.clientX, y1: e.clientY });   // 닿은 부대 전체, 병사가 섞이면 광부는 뺀다
      if (ids.length || !add) select(ids, add);
      if (ids.length) toast(`${ids.length}명 고름`);
      return;
    }
    const gp0 = view.screenToGround(e.clientX, e.clientY), inside = gp0 ? buildingAt(w, gp0.x, gp0.z, 0) : null;
    if (inside && inside.side === side) { selectBuilding(inside.id); return; }   // 우리 건물 발자국 안을 누르면 건물이 먼저(멀리서 곁의 병사가 가로채지 않게)
    const pk = pickAt(w, e.clientX, e.clientY), now = performance.now();
    if (pk) {
      const dbl = !pk.crew && lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX;
      lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
      if (dbl) {                                                   // 두 번 누르기: 화면 안 같은 병종 우리 부대 모두
        const r = canvas.getBoundingClientRect(), ids = sameTypeOnScreen(w, side, pk.i, (x, z) => view.worldToScreen(x, z, 0), { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
        select(ids, add); toast(`같은 병종 ${ids.length}명`); return;
      }
      select(pk.ids, add);
      if (pk.crew) toast(`광부 조 ${pk.ids.length}명`);
      return;
    }
    const p = view.screenToGround(e.clientX, e.clientY);
    const b = p ? buildingAt(w, p.x, p.z, BUILDING_PAD) : null;
    if (b && b.side === side) { selectBuilding(b.id); return; }
    if (!add) { select([], false); selectBuilding(-1); }
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pointerId) { drag = null; boxEl.style.display = 'none'; } });

  // ---- 매 화면: 화면 가장자리 이동·네모 그리기·마우스 올린 곳·고른 것 정리 ----
  let lastAt = 0, pruneAt = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    frameWork(now);
  }
  function frameWork(now) {
    const dt = Math.min(0.05, lastAt ? (now - lastAt) / 1000 : 0);
    lastAt = now;
    const w = getWorld(), r = canvas.getBoundingClientRect();
    // 화면 가장자리: 캔버스 위에서 띠 안에 EDGE_WAIT초 머물면 흐른다. 끄는 중(포인터를 잡은 채 캔버스 밖)이면 가장 끝으로 친다.
    const live = pointer.over || (drag && drag.box);
    const depth = (v, lo, hi) => (v < lo + EDGE_PX ? -Math.min(1, (lo + EDGE_PX - v) / EDGE_PX) : v > hi - EDGE_PX ? Math.min(1, (v - hi + EDGE_PX) / EDGE_PX) : 0);
    const ex = live ? depth(pointer.x, r.left, r.right) : 0, ey = live ? depth(pointer.y, r.top, r.bottom) : 0;
    if (ex || ey) {
      if (pointer.edgeSince < 0) pointer.edgeSince = now;
      if ((now - pointer.edgeSince) / 1000 >= EDGE_WAIT && dt > 0) {
        const k = EDGE_SCREENS * r.height * dt;
        view.pan(-Math.sign(ex) * ex * ex * k, -Math.sign(ey) * ey * ey * k);
        if (shiftHeld) showPreview();
      }
    } else pointer.edgeSince = -1;
    // 네모(시작점은 땅에 붙인다 — 화면이 흘러도 처음 누른 땅에서 시작)
    if (drag && drag.box) {
      const a = drag.startGround ? view.worldToScreen(drag.startGround.x, drag.startGround.z, 0) : { x: drag.startX, y: drag.startY };
      const x0 = Math.min(a.x, pointer.x), y0 = Math.min(a.y, pointer.y);
      Object.assign(boxEl.style, { display: 'block', left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(pointer.x - a.x)}px`, height: `${Math.abs(pointer.y - a.y)}px` });
    }
    // 고른 것에서 죽은 병사 빼기(무너진 건물 고르기도 푼다)
    if (w.time - pruneAt >= PRUNE_EVERY || w.time < pruneAt) {
      pruneAt = w.time;
      if (selB >= 0 && !w.buildingById?.get(selB)) selB = -1;
      if (amove && (!sel.ids.length || w.result)) amove = false;   // 고른 병력이 다 죽었거나 판이 끝나면 어택땅 기다림도 끝
      if (sel.ids.length) {
        const next = stillSelected(w, side, sel);
        if (next.ids.length !== sel.ids.length) { sel = next; rebuildFlags(); onSelection(sel.ids); }
      }
    }
    updateHover(w, now);
  }
  requestAnimationFrame(tick);

  // 마우스를 올린 곳: 골라질 쐐기를 빛내고 수를, 고른 병력이 있으면 오른쪽 클릭의 목표를 보인다.
  function updateHover(w, now) {
    if (aim && w.result) stopAim();
    if ((aim || placing) && w.result) { stopAim(); stopPlace(); }
    if (!pointer.over || (drag && drag.box) || w.result) { tipEl.style.display = 'none'; view.setHover(null); view.setAim(null); onGhost(null); return; }
    if (placing) { placeHover(w); return; }
    if (aim) { aimHover(w, now); return; }
    if (amove && !sel.ids.length) amove = false;
    if (amove) {
      view.setHover(null);
      tipEl.textContent = '어택땅 — 땅을 왼쪽 클릭(적 병사 위면 공격), 오른쪽·Esc 그만';
      Object.assign(tipEl.style, { display: 'block', left: `${pointer.x + 16}px`, top: `${pointer.y + 14}px` });
      return;
    }
    const pk = pickAt(w, pointer.x, pointer.y);
    const gp = view.screenToGround(pointer.x, pointer.y), foe = sel.ids.length && !pk ? foeAt(w, pointer.x, pointer.y, gp) : -1;
    view.setHover(pk ? { x: pk.x, z: pk.z, r: pk.r } : foe >= 0 ? { x: w.soldiers.x[foe], z: w.soldiers.z[foe], r: 4 } : null);
    const lines = [], hb = !pk && gp ? buildingAt(w, gp.x, gp.z, BUILDING_PAD) : null;
    if (hb && (hb.side === side || !canSee || canSee(hb.x, hb.z))) lines.push(`${hb.side === side ? '' : '적 '}${buildingName(hb.def, hb.side)}${hb.done ? '' : ` (짓는 중 ${Math.round(hb.progress * 100)}%)`}`);
    if (pk) lines.push(`${pk.crew ? '광부 조' : `부대 · ${w.rules.units[side][w.soldiers.type[pk.i]].name}`} · ${pk.ids.length}명`);
    if (selB >= 0) lines.push('오른쪽 → 집결지');
    else if (sel.ids.length) {
      const walkable = gp && w.map.walkable(gp.x, gp.z);
      const crewSel = workersIn(sel.ids).length, own = hb && hb.side === side, needs = own && (!hb.done || hb.hp < hb.maxHp);
      const where = foe >= 0 ? `${foeName(w, foe)} 공격` : hb && !own ? `적 ${buildingName(hb.def, hb.side)} 공격` : needs && crewSel ? `${buildingName(hb.def, side)} ${hb.done ? '고치기' : '짓기 돕기'}` : walkable ? '이 자리' : '갈 수 없는 곳';
      const mode = foe >= 0 || !walkable ? '' : altHeld ? ' (싸우며 간다)' : ' (이동만)';
      const key = `${altHeld ? 'Alt+' : ''}${shiftHeld && route ? 'Shift+' : ''}오른쪽`;
      lines.push(`${key} → ${shiftHeld && route ? '이어 가기: ' : ''}${altHeld && foe < 0 ? '어택땅: ' : ''}${where}${mode}`);
    }
    if (!lines.length) { tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
    Object.assign(tipEl.style, { display: 'block', left: `${pointer.x + 16}px`, top: `${pointer.y + 14}px` });
  }

  // 겨누는 동안: 마우스를 따라가는 원, 걸릴 병사(AIM_PREVIEW_EVERY마다 다시 셈), 안내 글.
  function aimHover(w, now) {
    const p = view.screenToGround(pointer.x, pointer.y), name = CAST_TEXT[aim].name, lines = [];
    if (p) {
      view.setHover(null);
      view.setAim({ x: p.x, z: p.z, r: w.rules.orders.radius, color: CAST_COLORS[aim] });
      if (now - aimAt > AIM_PREVIEW_EVERY) {
        aimAt = now;
        const s = w.soldiers;
        if (!aimFlags || aimFlags.length !== s.capacity) aimFlags = new Uint8Array(s.capacity);
        aimFlags.fill(0);
        const t = castTargets(w, side, aim, p.x, p.z);
        for (const i of t.ids) aimFlags[i] = 1;
        aimN = t.ids.length;
      }
      const c = canCast(w, side, aim);
      lines.push(`${name} · 걸리는 ${aim === 'volley' ? '궁수' : '병사'} ${aimN}명 — 왼쪽 클릭으로 걸기, 오른쪽·Esc 그만두기`);
      if (!c.ok) lines.push(c.reason);
    } else view.setAim(null);
    tipEl.innerHTML = lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
    Object.assign(tipEl.style, { display: 'block', left: `${pointer.x + 16}px`, top: `${pointer.y + 14}px` });
  }

  return {
    selectedFlags: () => (sel.ids.length ? flags : null),
    selection: () => sel.ids,
    refresh: () => frameWork(performance.now()),   // 녹화·시험용: 다음 화면을 기다리지 않고 네모·이름표·고른 것을 지금 고친다
    clear: () => select([], false),
    aim: toggleAim,                                                  // 스킬 단추(hud.js)
    aiming: () => aim,
    preview: () => (aim && aimFlags ? { flags: aimFlags, order: aim } : null),
    selectIds: ids => select(ids.filter(i => getWorld().soldiers.alive[i]), false),
    selectedBuilding: () => selB,                                    // 3단계: 고른 우리 건물 id(−1 = 없음)
    selectBuilding,
    startPlace, stopPlace, placing: () => placing,
    startAttackMove, attackMove: () => amove, stopNow: () => keyHandlers.stop(),   // 4단계 명령 단추
    groupList: () => groups.list(getWorld(), side), selectGroup,                  // 4단계 부대 지정(HUD 부대 줄)
    sendTo,                                                                      // 4단계 미니맵 오른쪽 클릭
    pickType: (type, drop) => { const w = getWorld(); select(byType(w, stillSelected(w, side, sel).ids, type, drop), false); },   // 고른 병력 판의 병종 단추
  };
}
