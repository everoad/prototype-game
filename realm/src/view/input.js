// 조작(PC): 왼쪽 = 고르기(끌면 네모), 오른쪽 = 알아서(이동·공격·짓기 돕기·자원 자리에 채굴기·건물이면 집결지),
// A = 공격 이동, S = 멈춤, H = 제자리, B = 짓기 메뉴, Ctrl+숫자 = 부대 묶기, 숫자 = 부르기(두 번 = 카메라), ` = 노는 일꾼, Space = 마지막 알림.
// 카메라: 화살표·화면 가장자리·가운데 끌기·휠.
import { UNITS, BUILDINGS, RESEARCH, BUILD_MENU, RES_NAME } from '../sim/rules.js';
import { canPlace, canPay, cost } from '../sim/world.js';

const KIND_TYPE = { gold: 'goldmine', wood: 'lumbermill', mana: 'manawell' };
const costText = t => ['gold', 'wood', 'mana'].filter(k => t[k]).map(k => `${RES_NAME[k]} ${t[k]}`).join(' · ');

export function createInput({ canvas, view, getWorld, side, onCommand, toast, fog, edgeScroll = true }) {
  const sel = new Set();
  let mode = null;            // null | 'amove' | { build: type }
  let card = 'main';
  let box = null, drag = null, pan = null, ghost = null, mouse = { x: -1, y: -1, in: false };
  const groups = {}, lastDigit = { d: -1, t: 0 };
  let lastClick = { t: 0, id: -1 }, idleIdx = 0;
  const keys = new Set();

  const W = () => getWorld();
  const entities = () => [...sel].map(id => W().byId.get(id)).filter(e => e && e.alive);
  function info() {
    const es = entities();
    for (const id of [...sel]) { const e = W().byId.get(id); if (!e || !e.alive) sel.delete(id); }
    const units = es.filter(e => e.ent === 'unit' && e.side === side), workers = units.filter(u => u.t.worker);
    const building = es.length === 1 && es[0].ent === 'building' ? es[0] : null;
    return { es, units, workers, building, other: es.length === 1 && es[0].side !== side ? es[0] : null };
  }
  const seeOk = (x, z) => !fog || canSeeW(W(), side, x, z);

  function entityAt(cx, cy) {
    const r = canvas.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top;
    let best = null, bd = 13;
    for (const s of view.screenUnits) {
      const y = Math.max(s.sy, Math.min(s.gy, my)), d = Math.hypot(s.sx - mx, y - my);
      const dd = d - (s.u.side === side ? 1 : 0);
      if (dd < bd) { bd = dd; best = s.u; }
    }
    if (best) return best;
    const p = view.pick(cx, cy);
    if (!p) return null;
    for (const b of W().buildings) if ((b.side === side || seeOk(b.x, b.z) || W().sides[side].seen.has(b.id)) && Math.hypot(b.x - p.x, b.z - p.z) < b.r + 1.5) return b;
    return null;
  }
  function depositAt(p) {
    let best = null, bd = 7;
    for (const d of W().map.deposits) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  const cmd = c => { const r = onCommand({ ...c, side }); if (r && !r.ok && r.why) toast(r.why); return r; };

  function select(list, add = false) {
    if (!add) sel.clear();
    for (const e of list) sel.add(e.id);
    card = 'main'; mode = null;
  }

  // ── 명령 카드(화면 단추와 단축키가 같은 목록을 쓴다)
  function cardButtons() {
    const w = W(), S = w.sides[side], I = info(), out = [];
    if (I.building && I.building.side === side) {
      const b = I.building;
      if (!b.done) { out.push({ key: 'C', label: '짓기 취소', sub: '돌려받음', run: () => cmd({ kind: 'cancel', building: b.id }) }); return out; }
      for (const k of b.t.trains ?? []) {
        const t = UNITS[k], locked = t.needs && !S.research.has(t.needs);
        out.push({ key: t.key, label: t.name, sub: costText(t), info: k, enabled: !locked && canPay(S, cost(t)), why: locked ? `${RESEARCH[t.needs].name} 연구 필요` : '', run: () => cmd({ kind: 'train', building: b.id, unit: k }) });
      }
      for (const k of b.t.research ?? []) {
        const r = RESEARCH[k], done = S.research.has(k) || S.researching.has(k);
        out.push({ key: r.key, label: r.name, sub: done ? (S.research.has(k) ? '완료' : '하는 중') : costText(r), research: k, enabled: !done && canPay(S, cost(r)), run: () => cmd({ kind: 'research', building: b.id, key: k }) });
      }
      if (b.queue.length) out.push({ key: 'C', label: '마지막 취소', sub: '줄에서 빼기', run: () => cmd({ kind: 'cancel', building: b.id }) });
      return out;
    }
    if (!I.units.length) return out;
    if (card === 'build' && I.workers.length) {
      for (const type of BUILD_MENU) {
        const t = BUILDINGS[type], needOk = !t.needs || w.buildings.some(b => b.side === side && b.type === t.needs && b.done);
        out.push({ key: t.key, label: t.name, sub: costText(t), building: type, enabled: needOk && canPay(S, cost(t)), why: needOk ? '' : `${BUILDINGS[t.needs].name} 필요`, run: () => { mode = { build: type }; } });
      }
      out.push({ key: 'Escape', label: '뒤로', sub: 'Esc', run: () => { card = 'main'; mode = null; } });
      return out;
    }
    out.push({ key: 'A', label: '공격 이동', sub: '가며 싸운다', run: () => { mode = 'amove'; } });
    out.push({ key: 'S', label: '멈춤', sub: '', run: () => cmd({ kind: 'stop', ids: I.units.map(u => u.id) }) });
    out.push({ key: 'H', label: '제자리', sub: '쫓지 않는다', run: () => cmd({ kind: 'hold', ids: I.units.map(u => u.id) }) });
    if (I.workers.length) out.push({ key: 'B', label: '짓기', sub: '건물 메뉴', run: () => { card = 'build'; } });
    return out;
  }

  // ── 마우스
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1) { pan = { x: e.clientX, y: e.clientY, p: view.pick(e.clientX, e.clientY) }; return; }
    if (e.button === 2) { if (mode) { mode = null; return; } rightClick(e.clientX, e.clientY, e.shiftKey); return; }
    if (e.button !== 0) return;
    const p = view.pick(e.clientX, e.clientY);
    if (mode && mode.build) {
      if (!p) return;
      const I = info();
      const r = cmd({ kind: 'build', ids: I.workers.map(u => u.id), type: mode.build, x: ghost?.x ?? p.x, z: ghost?.z ?? p.z, queue: e.shiftKey });
      if (r?.ok && !e.shiftKey) { mode = null; card = 'main'; }
      return;
    }
    if (mode === 'amove') {
      if (!p) return;
      const I = info(), tg = entityAt(e.clientX, e.clientY);
      if (tg && tg.side !== side && !tg.dormant && !tg.ruined) cmd({ kind: 'attack', ids: I.units.map(u => u.id), target: tg.id, queue: e.shiftKey });
      else { cmd({ kind: 'amove', ids: I.units.map(u => u.id), x: p.x, z: p.z, queue: e.shiftKey }); view.markMove(p.x, p.z, 0xff5040); }
      if (!e.shiftKey) mode = null;
      return;
    }
    const r = canvas.getBoundingClientRect();
    drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, shift: e.shiftKey, cx: e.clientX, cy: e.clientY, ctrl: e.ctrlKey };
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top, in: true, cx: e.clientX, cy: e.clientY };
    if (pan && pan.p) { const p = view.pick(e.clientX, e.clientY); if (p) { view.cam.tx += pan.p.x - p.x; view.cam.tz += pan.p.z - p.z; } }
    if (drag) { const dx = mouse.x - drag.x0, dy = mouse.y - drag.y0; if (Math.hypot(dx, dy) > 6) box = { x0: drag.x0, y0: drag.y0, x1: mouse.x, y1: mouse.y }; }
  });
  canvas.addEventListener('pointerleave', () => { mouse.in = false; });
  canvas.addEventListener('pointerup', e => {
    if (e.button === 1) { pan = null; return; }
    if (e.button !== 0 || !drag) return;
    const w = W();
    if (box) {
      const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
      let inside = view.screenUnits.filter(s => s.sx >= x0 && s.sx <= x1 && s.gy >= y0 && s.sy <= y1 && s.u.side === side).map(s => s.u);
      if (inside.some(u => !u.t.worker)) inside = inside.filter(u => !u.t.worker);
      if (inside.length) select(inside, drag.shift);
    } else {
      const tg = entityAt(drag.cx, drag.cy);
      if (!tg) { if (!drag.shift) { sel.clear(); card = 'main'; } }
      else {
        const now = performance.now();
        const dbl = now - lastClick.t < 320 && lastClick.id === tg.id;
        lastClick = { t: now, id: tg.id };
        if ((dbl || drag.ctrl) && tg.ent === 'unit' && tg.side === side) select(view.screenUnits.filter(s => s.u.side === side && s.u.type === tg.type).map(s => s.u));
        else if (drag.shift && tg.ent === 'unit' && tg.side === side && !info().building) { if (sel.has(tg.id)) sel.delete(tg.id); else sel.add(tg.id); }
        else select([tg]);
      }
    }
    drag = null; box = null;
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.cam.h *= Math.pow(1.12, Math.sign(e.deltaY)); }, { passive: false });

  function rightClick(cx, cy, shift) {
    const w = W(), I = info(), p = view.pick(cx, cy);
    if (!p) return;
    if (I.building && I.building.side === side && !I.units.length) {
      if (I.building.t.trains) { cmd({ kind: 'rally', building: I.building.id, x: p.x, z: p.z }); view.markMove(p.x, p.z); }
      return;
    }
    if (!I.units.length) return;
    const ids = I.units.map(u => u.id), tg = entityAt(cx, cy);
    if (tg && tg.side !== side && !tg.dormant && !tg.ruined) { cmd({ kind: 'attack', ids, target: tg.id, queue: shift }); view.markMove(tg.x, tg.z, 0xff4040); return; }
    if (tg && tg.side === side && tg.ent === 'building' && I.workers.length && (!tg.done || tg.hp < tg.maxHp)) { cmd({ kind: 'assist', ids: I.workers.map(u => u.id), target: tg.id, queue: shift }); view.markMove(tg.x, tg.z, 0x5ac8fa); return; }
    if (I.workers.length === I.units.length) {
      const d = depositAt(p);
      if (d && d.building < 0) { const r = cmd({ kind: 'build', ids: I.workers.map(u => u.id), type: KIND_TYPE[d.kind], x: d.x, z: d.z, queue: shift }); if (r?.ok) { view.markMove(d.x, d.z, 0x5ac8fa); return; } }
    }
    cmd({ kind: 'move', ids, x: p.x, z: p.z, queue: shift });
    view.markMove(p.x, p.z);
  }

  // ── 자판
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.key);
    const w = W();
    if (/^Digit[0-9]$/.test(e.code)) {
      const d = Number(e.code.slice(5));
      if (e.ctrlKey) { groups[d] = [...sel]; toast(`${d}번 부대로 묶었습니다`); e.preventDefault(); return; }
      const list = (groups[d] ?? []).map(id => w.byId.get(id)).filter(x => x && x.alive);
      if (!list.length) return;
      select(list);
      const now = performance.now();
      if (lastDigit.d === d && now - lastDigit.t < 350) centerOn(list);
      lastDigit.d = d; lastDigit.t = now;
      return;
    }
    if (e.key === 'Escape') { if (mode) mode = null; else if (card !== 'main') card = 'main'; else sel.clear(); return; }
    if (e.key === '`') { idleWorker(); return; }
    if (e.key === ' ') { const a = w.sides[side].alerts.findLast(x => x.x !== undefined); if (a) { view.cam.tx = a.x; view.cam.tz = a.z; } e.preventDefault(); return; }
    if (e.key === 'F2') { select(w.units.filter(u => u.side === side && !u.t.worker)); e.preventDefault(); return; }
    if (e.key.startsWith('Arrow')) { e.preventDefault(); return; }
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const btn = cardButtons().find(b => b.key === k);
    if (btn) { if (btn.enabled === false) toast(btn.why || '자원이 모자랍니다'); else btn.run(); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => keys.delete(e.key));
  window.addEventListener('blur', () => keys.clear());

  function centerOn(list) {
    let x = 0, z = 0;
    for (const e of list) { x += e.x; z += e.z; }
    view.cam.tx = x / list.length; view.cam.tz = z / list.length;
  }
  function idleWorker() {
    const idle = W().units.filter(u => u.side === side && u.t.worker && u.order.kind === 'idle');
    if (!idle.length) { toast('노는 일꾼이 없습니다'); return; }
    const u = idle[idleIdx++ % idle.length];
    select([u]); centerOn([u]);
  }

  // 틱마다: 카메라 밀기, 짓기 그림자
  function update(dt) {
    const c = view.cam, sp = c.h * 1.3 * dt, f = [Math.cos(c.yaw), Math.sin(c.yaw)], rgt = [Math.sin(c.yaw), -Math.cos(c.yaw)];
    let mx = 0, my = 0;
    if (keys.has('ArrowUp')) my += 1;
    if (keys.has('ArrowDown')) my -= 1;
    if (keys.has('ArrowRight')) mx += 1;
    if (keys.has('ArrowLeft')) mx -= 1;
    if (edgeScroll && mouse.in && !drag) {
      const r = canvas.getBoundingClientRect(), m = 6;
      if (mouse.x < m) mx -= 1; if (mouse.x > r.width - m) mx += 1;
      if (mouse.y < m) my += 1; if (mouse.y > r.height - m) my -= 1;
    }
    c.tx += (f[0] * my + rgt[0] * mx) * sp; c.tz += (f[1] * my + rgt[1] * mx) * sp;
    ghost = null;
    if (mode && mode.build && mouse.in) {
      const p = view.pick(mouse.cx, mouse.cy);
      if (p) { const at = canPlace(W(), side, mode.build, p.x, p.z); ghost = { type: mode.build, x: at.x ?? p.x, z: at.z ?? p.z, ok: at.ok, why: at.why, r: BUILDINGS[mode.build].r }; }
    }
    if (mode && !info().units.length) mode = null;
  }
  function rally() {
    const I = info();
    if (!I.building || I.building.side !== side || !I.building.rally) return null;
    return { x: I.building.x, z: I.building.z, rx: I.building.rally.x, rz: I.building.rally.z };
  }
  return {
    sel, info, cardButtons, update, rally, select, centerOn, idleWorker, cmd,
    ghost: () => ghost, box: () => box, mode: () => mode, card: () => card,
    setCard: c => { card = c; }, minimapOrder: (x, z) => { const I = info(); if (I.units.length) { cmd({ kind: mode === 'amove' ? 'amove' : 'move', ids: I.units.map(u => u.id), x, z }); mode = null; } else if (I.building?.side === side) cmd({ kind: 'rally', building: I.building.id, x, z }); },
  };
}
function canSeeW(w, side, x, z) {
  const vcell = w.rules.map.visionCell, cols = w.vision.cols, c = Math.floor(x / vcell), r = Math.floor(z / vcell);
  return c >= 0 && r >= 0 && c < cols && r < cols && w.vision[side].visible[r * cols + c] === 1;
}
