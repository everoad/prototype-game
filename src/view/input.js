// 조작 → 명령. PC(마우스·키보드) 전용 — 설계서 §5(사용자 2026-11-08: "전반적으로 조작이 너무 불편하다").
// · 왼쪽 = 고르기: 거점(가운데 건물)·승점(깃대)·쐐기를 누르거나, 빈 땅에서 끌어 네모. Shift = 더하기, 빈 땅 누르기·Esc = 풀기.
//   정면(구역) 병사는 네모로 고른다(구역 깃발·구역 단추는 없앴다, 사용자 2026-11-08).
//   누르는 범위는 원보다 좁다(원은 점령·수비대 범위 그대로, 사용자 2026-11-08 "클릭 범위만 줄이고 크기는 유지").
// · 오른쪽 = 고른 병력 보내기. 거점·승점을 누르면 전처럼 싸우며 간다(어택땅), 땅·구역 선을 누르면 이동만 — 가는 길에 새 적을 찾지 않는다,
//   이동 중엔 쏘지도 않는다(사용자 2026-11-08): 거점·승점 원 안 → 그 거점, 구역 선분 바로 위(15 m) → 그 구역,
//   그 밖 → 누른 그 자리. 보이는 적 병사를 누르면 그 적을 공격(사용자 2026-11-08 "B", 토탈 워처럼).
//   Shift+오른쪽 = 이어 가기: 누르자마자 가고, 누를 때마다 지금 목적지 뒤로 길이 이어진다(경유점 3개까지, 사용자 2026-11-08).
//   Alt+오른쪽 = 어택땅: 땅·구역 선으로도 싸우며 간다(Shift와 같이 쓰면 어택땅으로 길을 잇는다).
//   Ctrl+오른쪽 = 고른 우리 거점의 생산 방향(병사는 안 움직인다). 거점 판의 "생산 방향" 단추 뒤 오른쪽 클릭도 같다.
// · 화면 이동: 가운데 버튼 끌기·WASD·방향키는 scene.js, 화면 가장자리(0.3초 머문 뒤)는 여기.
import { placeTroops, groupTroops, boxTroops, remember, stillSelected, rightClickTarget, sendTarget, FLOW_SECTOR_PICK } from './select.js';
import { CASTS, canCast, castTargets } from '../sim/casts.js';
import { CAST_COLORS } from './scene.js';
import { CAST_TEXT } from './hud.js';
// · 금 명령(설계서 2026-11-09-flood-gold-orders-design.md §1.3): 명령 줄 단추나 숫자키 1~5로 겨누고, 왼쪽 클릭으로 원을 찍어 건다(징집은 경보 뜬 우리 거점).
//   같은 단추·키 다시, 오른쪽 클릭, Esc = 그만두기(겨누는 동안 오른쪽 클릭은 보내기가 아니다). 숫자 칸에 칠 때는 키가 먹지 않는다.

const TAP_MOVE = 8;          // px — 이보다 덜 움직이고 떼면 누르기, 넘으면 네모
const CORE_M = { hq: 32, front: 22, rear: 22, vp: 20 };   // 누르는 범위: 가운데 건물(승점은 깃대) 둘레 m — 건물 자리 26·16 m + 반 폭 + 여유
const CORE_MIN_PX = 20;      // 멀리서 볼 때도 누를 수 있게 화면 최소 반지름 px
const POLE_TOP = 22, POLE_PX = 28;   // 승점 깃대 높이 m(장면과 같게), 깃대에서 누르는 거리 px
const WEDGE_PICK_M = 4, WEDGE_PICK_PX = 10;   // 쐐기: 누른 곳에서 가장 가까운 쐐기 병사가 이만큼 안이면 그 쐐기
const FOE_PICK_M = 6, FOE_PICK_PX = 12;       // 오른쪽 클릭: 누른 곳에서 가장 가까운 보이는 적 병사가 이만큼 안이면 그 적을 공격
const EDGE_PX = 40, EDGE_WAIT = 0.3, EDGE_SCREENS = 0.35;   // 화면 가장자리 이동: 띠 폭 px, 머문 뒤 초, 가장 끝에서 1초에 흐르는 화면 높이(깊이의 제곱)
const PRUNE_EVERY = 0.25;    // 초 — 고른 것에서 죽은 병사를 빼는 주기
const AIM_PREVIEW_EVERY = 150;   // ms — 겨누는 원에 걸릴 병사를 다시 세는 주기
const HOVER_COUNT_EVERY = 300;   // ms — 마우스를 올린 곳의 병사 수를 다시 세는 주기
const SIDE_LR = { L: '왼쪽', C: '가운데', R: '오른쪽' };
const SECTOR_NAME = { left: '왼쪽', center: '가운데', right: '오른쪽' };
const KIND_NAME = { hq: '본진', front: '앞 거점', rear: '뒤 거점' };

export function createInput(view, canvas, getWorld, side, hooks) {
  const { onOrder = () => ({ ok: true }), toast = () => {}, onPlace = () => {}, onSelection = () => {}, canSee = null } = hooks;
  let shiftHeld = false, ctrlHeld = false, altHeld = false;   // 포인터 이벤트의 shiftKey·ctrlKey·altKey가 빠지는 환경(iframe 등) 대비
  let sel = { ids: [], serials: [] }, place = null, flags = null, arrowMode = false;
  let route = null;   // 고른 병력에 내린 마지막 보내기의 길(목적지들) — Shift+오른쪽이 여기에 잇는다. 고르기가 바뀌면 지운다.
  let drag = null;   // 왼쪽 누름: { pointerId, startX, startY, startGround, box }
  const pointer = { x: 0, y: 0, over: false, edgeSince: -1 };
  let hover = null, hoverCount = { key: '', n: 0, at: 0 };
  let aim = null, aimFlags = null, aimN = 0, aimAt = 0;   // 겨누는 금 명령(CASTS 하나)과 걸릴 병사 미리 보기

  // 네모와 이름표(마우스 옆 글)
  const boxEl = document.createElement('div');
  boxEl.style.cssText = 'position:fixed;border:1.5px solid #fff;background:rgba(255,255,255,.12);pointer-events:none;display:none;z-index:5';
  const tipEl = document.createElement('div');
  tipEl.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:6;background:rgba(44,44,42,.85);color:#fff;font:13px/1.35 system-ui,"Malgun Gothic",sans-serif;padding:4px 8px;border-radius:7px;white-space:nowrap';
  document.body.append(boxEl, tipEl);

  window.addEventListener('keydown', e => {
    if (e.key === 'Shift' && !shiftHeld) { shiftHeld = true; showPreview(); }
    if (e.key === 'Control') ctrlHeld = true;
    if (e.key === 'Alt') { altHeld = true; e.preventDefault(); }   // Alt = 어택땅. 기본 동작(윈도 브라우저 메뉴로 포커스가 넘어감)을 막는다
    if (e.key === 'Escape') { if (aim) stopAim(); else if (arrowMode) arrowMode = false; else select([], null, false); }
    const tag = e.target && e.target.tagName;
    if (/^Digit[1-5]$/.test(e.code) && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') toggleAim(CASTS[Number(e.code.slice(5)) - 1]);   // 꾹 누름(반복)·Ctrl/Alt+숫자(브라우저 탭)는 무시
  });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') { shiftHeld = false; showPreview(); } if (e.key === 'Control') ctrlHeld = false; if (e.key === 'Alt') { altHeld = false; e.preventDefault(); } });
  window.addEventListener('blur', () => { shiftHeld = false; ctrlHeld = false; altHeld = false; });

  // ---- 누른 곳 알아보기 ----
  const segPx = (cx, cy, x, z, top) => {
    const a = view.worldToScreen(x, z, 0), b = view.worldToScreen(x, z, top);
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((cx - a.x) * vx + (cy - a.y) * vy) / l2));
    return Math.hypot(cx - (a.x + vx * t), cy - (a.y + vy * t));
  };
  function coreAt(w, cx, cy, p) {
    let best = null, bd = Infinity;
    for (const st of w.strongholds) {
      const c = view.worldToScreen(st.x, st.z, 0), px = Math.hypot(cx - c.x, cy - c.y);
      let hit = px <= CORE_MIN_PX || (p && Math.hypot(p.x - st.x, p.z - st.z) <= CORE_M[st.kind]);
      if (!hit && st.kind === 'vp') hit = segPx(cx, cy, st.x, st.z, POLE_TOP) <= POLE_PX;
      if (hit && px < bd) { bd = px; best = st; }
    }
    return best;
  }
  const metersPerPx = (cx, cy, p) => { const q = view.screenToGround(cx + 10, cy); return q && p ? Math.hypot(q.x - p.x, q.z - p.z) / 10 : 1; };
  function wedgeAt(w, cx, cy, p) {
    if (!p) return null;
    const s = w.soldiers, r = Math.max(WEDGE_PICK_M, WEDGE_PICK_PX * metersPerPx(cx, cy, p));
    let best = -1, bd = r;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || s.side[i] !== side || s.group[i] < 0) continue;
      const d = Math.hypot(s.x[i] - p.x, s.z[i] - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : w.groups.find(g => g.id === s.group[best]) ?? null;
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

  // 왼쪽으로 누르면 골라질 것: 거점·승점 가운데 > 쐐기. 정면(구역) 병사는 네모로 고른다.
  function pickAt(w, cx, cy) {
    const p = view.screenToGround(cx, cy);
    const st = coreAt(w, cx, cy, p);
    if (st) return { kind: 'stronghold', id: st.id, st, x: st.x, z: st.z, r: CORE_M[st.kind] };
    const grp = wedgeAt(w, cx, cy, p);
    if (grp) return { kind: 'wedge', grp, x: grp.x, z: grp.z, r: Math.max(8, Math.sqrt(grp.members.length) * 1.3) };
    return null;
  }
  const troopsOf = (w, pk) => (pk.kind === 'wedge' ? groupTroops(w, pk.grp) : placeTroops(w, side, { kind: pk.kind, id: pk.id }));

  // ---- 이름 ----
  const sectorName = sec => `구역 ${SECTOR_NAME[sec.id.split('-')[1]] ?? sec.id}`;
  function placeName(st) {
    if (st.kind === 'vp') return `승점 ${SIDE_LR[st.id.slice(2)] ?? st.id}`;
    const who = st.owner === side ? '우리 ' : st.owner === null ? '' : '적 ';
    return st.kind === 'hq' ? `${who}본진` : `${who}${KIND_NAME[st.kind]}(${SIDE_LR[st.id.slice(-1)]})`;
  }

  // ---- 오른쪽 클릭의 목표(select.js rightClickTarget): 보내기는 누른 그 자리로, 생산 방향은 구역 선 80 m 안이면 그 구역 ----
  function targetAt(w, p, sectorPick) {
    const t = rightClickTarget(w, side, p, sectorPick);
    if (!t) return null;
    const name = t.kind === 'stronghold' ? placeName(w.strongholds.find(x => x.id === t.id)) : t.kind === 'sector' ? sectorName(w.map.sectors.find(x => x.id === t.id)) : '이 자리';
    return { target: t, name };
  }

  // ---- 고르기 ----
  function select(ids, pk, add) {
    const w = getWorld();
    if (add) {
      const have = new Set(sel.ids), more = ids.filter(i => !have.has(i));
      const extra = remember(w, more);
      sel = { ids: [...sel.ids, ...extra.ids], serials: [...sel.serials, ...extra.serials] };
      place = null;
    } else {
      sel = remember(w, ids);
      place = pk && pk.kind === 'stronghold' ? pk.st : null;
    }
    rebuildFlags();
    route = null; arrowMode = false; showPreview();
    onPlace(place && place.owner === side && place.kind !== 'vp' ? place : null);
    onSelection(sel.ids);
  }
  function rebuildFlags() {
    const s = getWorld().soldiers;
    if (!flags || flags.length !== s.capacity) flags = new Uint8Array(s.capacity);
    flags.fill(0);
    for (const i of sel.ids) flags[i] = 1;
  }

  // ---- 금 명령 겨누기 ----
  function toggleAim(order) {
    if (!CASTS.includes(order) || getWorld().result) return;
    if (aim === order) { stopAim(); return; }
    aim = order; aimAt = 0; arrowMode = false;
    if (order === 'levy') toast('징집: 경보가 뜬 우리 거점을 누르세요 — 오른쪽·Esc 그만두기');
  }
  function stopAim() { aim = null; aimFlags = null; view.setAim(null); view.setHover(null); }
  // 징집: 누른 곳의 거점(가운데 건물 또는 원 안)
  const strongholdAt = (w, cx, cy, p) => coreAt(w, cx, cy, p) ?? (p && w.strongholds.find(st => st.kind !== 'vp' && Math.hypot(p.x - st.x, p.z - st.z) <= st.radius)) ?? null;
  function castAt(e) {
    const w = getWorld(), p = view.screenToGround(e.clientX, e.clientY);
    if (!p || w.result) return;
    let o;
    if (aim === 'levy') {
      const st = strongholdAt(w, e.clientX, e.clientY, p);
      if (!st) { toast('경보가 뜬 우리 거점을 누르세요'); return; }
      o = { kind: 'cast', side, order: 'levy', stronghold: st.id };
    } else o = { kind: 'cast', side, order: aim, x: p.x, z: p.z };
    const r = onOrder(o), name = CAST_TEXT[aim].name;
    if (r && r.ok) { toast(aim === 'scout' ? name : `${name} — ${r.count}명`); stopAim(); }
    else if (r) toast(`${name}: ${r.reason}`);
  }

  // ---- 명령 ----
  function command(e) {
    const w = getWorld(), p = view.screenToGround(e.clientX, e.clientY);
    if (!p || w.result) return;
    if (e.ctrlKey || ctrlHeld || arrowMode) { setFlow(w, p); arrowMode = false; return; }
    if (!sel.ids.length) { toast('먼저 병력을 고르세요 — 거점·쐐기를 누르거나 빈 땅에서 끌어 네모'); return; }
    const f0 = foeAt(w, e.clientX, e.clientY, p), f = sendTarget(w, side, p, f0)?.kind === 'foe' ? f0 : -1;   // 거점·승점 원 안이면 밑의 적 병사보다 그 거점(어택땅)
    const t = f >= 0 ? { target: { kind: 'foe', id: f, serial: w.soldiers.serial[f] }, name: foeName(w, f), attack: true } : targetAt(w, p);
    if (!t) { toast('갈 수 없는 곳(물)'); return; }
    const stop = t.attack ? { x: w.soldiers.x[f], z: w.soldiers.z[f] } : { x: p.x, z: p.z };
    const attack = !t.attack && (e.altKey || altHeld);                        // Alt+오른쪽 = 어택땅(사용자 2026-11-08 — A는 WASD라 Alt, 토탈 워의 Alt+오른쪽처럼)
    // Shift+오른쪽 = 이어 가기(사용자 2026-11-08: 보통 전략 게임처럼 누르자마자 가고, 누를 때마다 지금 목적지 뒤로 길이 이어진다)
    if ((e.shiftKey || shiftHeld) && route) {
      const r = onOrder({ kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target: t.target, append: true, ...(attack ? { engage: true } : {}) });
      if (r && r.ok) { route.stops.push(stop); toast(`이어 가기 → ${t.name} (경유 ${route.stops.length - 1})`); showPreview(); return; }
      if (r && r.reason !== '이어 갈 병력이 없다') { toast(r.reason); return; }   // 이어 갈 병력이 없으면(이미 도착) 새로 보낸다
    }
    const o = { kind: 'send', side, from: { kind: 'ids', ids: sel.ids }, target: t.target };   // 거점·승점이면 싸우며 간다, 땅·구역 선이면 이동만(판정이 정한다)
    if (attack) o.engage = true;                                                                // Alt = 어택땅: 땅·구역 선으로도 싸우며 간다
    const r = onOrder(o);
    if (r && r.ok) { toast(t.attack ? `${r.count}명 공격 → ${t.name}` : `${r.count}명 ${attack ? '어택땅' : '출발'} → ${t.name}`); route = { stops: [stop] }; }
    else if (r) toast(r.reason);
    showPreview();
  }
  function setFlow(w, p) {
    const st = place && w.strongholds.find(x => x.id === place.id);
    if (!st || st.owner !== side || st.kind === 'vp') { toast('생산 방향: 우리 거점을 먼저 누르세요'); return; }
    const t = targetAt(w, p, FLOW_SECTOR_PICK);
    if (!t || t.target.kind === 'point') { toast('생산 방향은 구역 선이나 거점으로만'); return; }
    const r = onOrder({ kind: 'arrow', side, from: st.id, target: t.target });
    if (r && r.ok) toast(`${placeName(st)} 새 병사 → ${t.name}`);
    else if (r) toast(r.reason);
  }

  // 길 미리 보기(Shift를 누르고 있을 때): 고른 병력 가운데 → 지금 길의 목적지들 → 마우스 자리(다음 Shift+오른쪽이 이을 곳).
  function showPreview() {
    if (!shiftHeld || !sel.ids.length) { view.setPreview(null); return; }
    const w = getWorld(), s = w.soldiers;
    let cx = 0, cz = 0, n = 0;
    for (const i of sel.ids) if (s.alive[i]) { cx += s.x[i]; cz += s.z[i]; n++; }
    if (!n) { view.setPreview(null); return; }
    const stops = [{ x: cx / n, z: cz / n }, ...(route ? route.stops : [])];
    if (shiftHeld && pointer.over) { const p = view.screenToGround(pointer.x, pointer.y); if (p) stops.push(p); }
    view.setPreview(stops.slice(1).map((q, k) => ({ from: stops[k], to: q, color: 0xfaeeda })));
  }

  // ---- 포인터 ----
  view.controls.gestureFilter = e => {
    const w = getWorld();
    if (w.result) return false;
    if (e.button === 2) { if (aim) stopAim(); else command(e); return true; }   // 겨누는 동안 오른쪽 = 그만두기(보내지 않는다)
    if (e.button === 0 && aim) { castAt(e); return true; }
    if (e.button !== 0) return false;                             // 가운데 버튼 = 화면 이동(scene.js)
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
      const ids = boxTroops(w, side, (x, z) => view.worldToScreen(x, z, 0), { x0: a.x, y0: a.y, x1: e.clientX, y1: e.clientY });
      if (ids.length || !add) select(ids, null, add);
      if (ids.length) toast(`${ids.length}명 고름`);
      return;
    }
    const pk = pickAt(w, e.clientX, e.clientY);
    if (!pk) { if (!add) select([], null, false); return; }
    const ids = troopsOf(w, pk);
    select(ids, pk, add);
    if (!ids.length && !(pk.kind === 'stronghold' && pk.st.owner === side)) toast(`${pk.kind === 'stronghold' ? placeName(pk.st) : '쐐기'}에 고를 우리 병사가 없다`);
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
    // 화면 가장자리: 캔버스 위(판 위가 아님)에서 띠 안에 EDGE_WAIT초 머물면 흐른다. 끄는 중(포인터를 잡은 채 캔버스 밖)이면 가장 끝으로 친다.
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
    // 고른 것에서 죽은 병사 빼기
    if (w.time - pruneAt >= PRUNE_EVERY || w.time < pruneAt) {
      pruneAt = w.time;
      if (sel.ids.length) {
        const next = stillSelected(w, side, sel);
        if (next.ids.length !== sel.ids.length) { sel = next; rebuildFlags(); onSelection(sel.ids); }
      }
    }
    updateHover(w, now);
  }
  requestAnimationFrame(tick);

  // 마우스를 올린 곳: 골라질 것을 빛내고 이름·수를, 고른 병력이 있으면 오른쪽 클릭의 목표를 보인다.
  function updateHover(w, now) {
    if (aim && w.result) stopAim();
    if (!pointer.over || (drag && drag.box) || w.result) { tipEl.style.display = 'none'; view.setHover(null); view.setAim(null); return; }
    if (aim) { aimHover(w, now); return; }
    const pk = pickAt(w, pointer.x, pointer.y);
    const gp = view.screenToGround(pointer.x, pointer.y), f0 = sel.ids.length && !pk && !ctrlHeld && !arrowMode ? foeAt(w, pointer.x, pointer.y, gp) : -1;
    const foe = f0 >= 0 && sendTarget(w, side, gp, f0)?.kind === 'foe' ? f0 : -1;   // 오른쪽 클릭과 같은 판단(원 안이면 적 병사를 빛내지 않는다)
    view.setHover(pk ? { x: pk.x, z: pk.z, r: pk.r } : foe >= 0 ? { x: w.soldiers.x[foe], z: w.soldiers.z[foe], r: 4 } : null);
    const lines = [];
    if (pk) {
      const key = pk.kind === 'wedge' ? `g${pk.grp.id}` : pk.id;
      if (key !== hoverCount.key || now - hoverCount.at > HOVER_COUNT_EVERY) hoverCount = { key, n: troopsOf(w, pk).length, at: now };
      const n = hoverCount.n;
      if (pk.kind === 'wedge') lines.push(`쐐기 · ${n}명`);
      else if (pk.st.owner === side && pk.st.kind !== 'vp') lines.push(`${placeName(pk.st)} · 서 있는 병사 ${n}명 — 누르면 고르기·짓기`);
      else lines.push(`${placeName(pk.st)} · 우리 병사 ${n}명`);
    }
    if (sel.ids.length) {
      const flow = ctrlHeld || arrowMode, p = view.screenToGround(pointer.x, pointer.y), t = p && targetAt(w, p, flow ? FLOW_SECTOR_PICK : undefined);
      if (flow) lines.push(place ? `오른쪽 클릭 → 새 병사를 ${t && t.target.kind !== 'point' ? t.name : '(구역 선·거점만)'}` : '생산 방향: 우리 거점을 먼저 누르세요');
      else {
        const where = foe >= 0 ? `${foeName(w, foe)} 공격` : t ? t.name : '갈 수 없는 곳';
        const mode = foe >= 0 || !t ? '' : altHeld || t.target.kind === 'stronghold' ? ' (싸우며 간다)' : ' (이동만)';
        const key = `${altHeld ? 'Alt+' : ''}${shiftHeld && route ? 'Shift+' : ''}오른쪽`;
        lines.push(`${key} → ${shiftHeld && route ? '이어 가기: ' : ''}${altHeld && foe < 0 ? '어택땅: ' : ''}${where}${mode}`);
      }
    } else if (arrowMode || ctrlHeld) lines.push('생산 방향: 우리 거점을 먼저 누르세요');
    if (!lines.length) { tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
    Object.assign(tipEl.style, { display: 'block', left: `${pointer.x + 16}px`, top: `${pointer.y + 14}px` });
  }

  // 겨누는 동안: 마우스를 따라가는 원, 걸릴 병사(AIM_PREVIEW_EVERY마다 다시 셈), 안내 글. 징집은 누를 수 있는 거점 고리만.
  function aimHover(w, now) {
    const p = view.screenToGround(pointer.x, pointer.y), name = CAST_TEXT[aim].name, lines = [];
    if (aim === 'levy') {
      view.setAim(null);
      const st = p && strongholdAt(w, pointer.x, pointer.y, p), ok = st && canCast(w, side, 'levy', st.id);
      view.setHover(st && ok.ok ? { x: st.x, z: st.z, r: st.radius } : null);
      lines.push(st ? (ok.ok ? `${name} → ${placeName(st)} — 왼쪽 클릭으로 걸기` : `${name}: ${ok.reason}`) : `${name}: 경보가 뜬 우리 거점을 누르세요 — 오른쪽·Esc 그만두기`);
    } else if (p) {
      view.setHover(null);
      view.setAim({ x: p.x, z: p.z, r: aim === 'scout' ? w.rules.orders.scout.radius : w.rules.orders.radius, color: CAST_COLORS[aim] });
      if (aim !== 'scout' && now - aimAt > AIM_PREVIEW_EVERY) {
        aimAt = now;
        const s = w.soldiers;
        if (!aimFlags || aimFlags.length !== s.capacity) aimFlags = new Uint8Array(s.capacity);
        aimFlags.fill(0);
        const t = castTargets(w, side, aim, p.x, p.z);
        for (const i of t.ids) aimFlags[i] = 1;
        aimN = t.ids.length;
      }
      const c = canCast(w, side, aim);
      lines.push(`${name}${aim === 'scout' ? '' : ` · 걸리는 ${aim === 'volley' ? '궁수' : '병사'} ${aimN}명`} — 왼쪽 클릭으로 걸기, 오른쪽·Esc 그만두기`);
      if (!c.ok) lines.push(c.reason);
    } else view.setAim(null);
    tipEl.innerHTML = lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
    Object.assign(tipEl.style, { display: 'block', left: `${pointer.x + 16}px`, top: `${pointer.y + 14}px` });
  }

  // 화면에 그릴 화살표: 우리 거점마다 지금 따르는 목표.
  function arrowsToDraw(w, arrowOf) {
    const out = [];
    for (const st of w.strongholds) {
      if (st.owner !== side || st.kind === 'vp') continue;
      const t = arrowOf(w, st);
      let to = null;
      if (t.kind === 'sector') { const s = w.map.sectors.find(x => x.id === t.id); to = { x: (s.x0 + s.x1) / 2, z: s.z }; }   // 구역 선 가운데(병사가 서는 곳)
      else if (t.kind === 'stronghold') { const s = w.strongholds.find(x => x.id === t.id); to = { x: s.x, z: s.z }; }
      else if (t.kind === 'general') { const g = w.generals.find(x => x.id === t.id); if (g) to = { x: g.x, z: g.z }; }
      if (to) out.push({ from: { x: st.x, z: st.z }, to, color: 0x1D9E75 });
    }
    return out;
  }
  return {
    arrowsToDraw,
    selectedFlags: () => (sel.ids.length ? flags : null),
    selection: () => sel.ids,
    refresh: () => frameWork(performance.now()),   // 녹화·시험용: 다음 화면을 기다리지 않고 네모·이름표·고른 것을 지금 고친다
    armFlow: () => { arrowMode = true; toast('오른쪽 클릭으로 이 거점의 새 병사가 갈 곳(구역 선·거점)을 정하세요 — Esc 취소'); },
    clear: () => select([], null, false),
    aim: toggleAim,                                                  // 명령 줄 단추(hud.js)
    aiming: () => aim,
    preview: () => (aim && aimFlags && aim !== 'scout' && aim !== 'levy' ? { flags: aimFlags, order: aim } : null),
    selectIds: ids => select(ids.filter(i => getWorld().soldiers.alive[i]), null, false),   // 알림 [고르기]
  };
}
