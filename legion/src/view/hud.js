// HUD(군단 영지 1단계 — 시험 장면 화면): 위쪽 상태 줄(시간·병사 수·FPS·장면·속도), 지휘 스킬 단추, 고른 병력 판, 미니맵, 도움말, 알림.
// 홍수 HUD에서 옛 판 부분(사기·승점·금·건물 판·경보·거점 목록·손잡이)을 뺐다. 화면 글은 한국어.
import { CASTS, canCast } from '../sim/casts.js';
import { CAST_KEYS, BUILD_KEYS } from './keys.js';
import { regionPolygon } from '../sim/regions.js';
import { crewMarks } from './crewMarks.js';
import { miniToWorld } from './minimap.js';
import { pings } from './alerts.js';
import { resourceText, costText, buildButtons, buildingCard, selectionParts, groupBarParts } from './panel.js';
import { buildingName } from '../sim/buildings.js';

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font: 14px/1.4 system-ui, "Malgun Gothic", sans-serif; color: #2c2c2a; }
#hud .bar { position: absolute; left: 8px; right: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; pointer-events: auto;
  background: rgba(250,248,240,.88); border: 1px solid rgba(0,0,0,.12); border-radius: 10px; padding: 6px 10px; }
#hud .bar select, #hud .bar button { font: inherit; font-size: 13px; padding: 3px 8px; border-radius: 7px; border: 1px solid #999; background: #fff; cursor: pointer; min-height: 30px; }
#hud .bar button.on { border-color: #0f6e56; background: #e1f5ee; }
#hud .muted { color: #5f5e5a; }
#hud .toasts { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 4px; align-items: center; }
#hud .toast { background: rgba(44,44,42,.82); color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 13px; }
#hud .gens { position: absolute; left: 8px; bottom: 140px; display: flex; flex-direction: column; gap: 6px; pointer-events: auto; max-width: 330px; }
#hud .gens .card { background: rgba(250,248,240,.95); border: 1px solid rgba(0,0,0,.15); border-radius: 10px; padding: 7px 9px; font-size: 13px; }
#hud .gens .card button.type { font: inherit; font-size: 13px; min-height: 26px; padding: 2px 8px; margin: 3px 3px 0 0; border-radius: 8px; border: 1px solid #999; background: #fff; cursor: pointer; }
#hud .mini { position: absolute; right: 8px; top: 62px; pointer-events: auto; border: 1px solid rgba(0,0,0,.3); border-radius: 6px; cursor: pointer; }
#hud .help { position: absolute; left: 8px; bottom: 64px; background: rgba(250,248,240,.85); border-radius: 8px; padding: 6px 10px; font-size: 12px; max-width: 46%; }
#hud .orders { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); display: flex; gap: 6px; pointer-events: auto; }
#hud .orders button { position: relative; overflow: hidden; font: inherit; font-size: 13px; padding: 6px 10px; min-width: 92px; min-height: 44px; border-radius: 9px; border: 1px solid rgba(0,0,0,.25); background: rgba(250,248,240,.97); cursor: pointer; text-align: left; }
#hud .orders button .k { opacity: .55; margin-right: 4px; } #hud .orders button .g { display: block; font-size: 12px; color: #5f5e5a; }
#hud .orders button.on { outline: 3px solid #1D9E75; }
#hud .orders button .cd { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(30,30,30,.38); pointer-events: none; }
#hud .res { flex-basis: 100%; display: flex; gap: 10px; align-items: center; font-weight: 600; }
#hud .gens .card button.act { font: inherit; font-size: 13px; min-height: 30px; padding: 3px 8px; margin: 4px 4px 0 0; border-radius: 8px; border: 1px solid #999; background: #fff; cursor: pointer; text-align: left; }
#hud .gens .card button.act .g { display: block; font-size: 11px; color: #5f5e5a; }
#hud .gens .card button.act .k { opacity: .55; margin-right: 4px; }
#hud .gens .card button.act:disabled { opacity: .55; cursor: default; }
#hud .gens .card button.act.on { outline: 3px solid #4caf50; }
#hud .cgroups { position: absolute; left: 50%; bottom: 62px; transform: translateX(-50%); display: flex; gap: 4px; pointer-events: auto; }
#hud .cgroups button { font: inherit; font-size: 12px; padding: 3px 8px; border-radius: 7px; border: 1px solid rgba(0,0,0,.25); background: rgba(250,248,240,.95); cursor: pointer; }
#hud .cgroups button b { margin-right: 4px; }
#hud .result { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: 30px; font-weight: 700; padding: 14px 28px; border-radius: 14px; background: rgba(250,248,240,.95); border: 2px solid #2c2c2a; display: none; pointer-events: auto; }
#hud .orders button .cdt { position: absolute; right: 6px; top: 4px; font-size: 12px; font-weight: 600; color: #fff; text-shadow: 0 0 3px #000; pointer-events: none; }
@media (max-width: 600px) { #hud .mini { top: 92px; width: 132px; height: 88px; } #hud .gens { bottom: 8px; max-width: calc(100% - 16px); } #hud .help { display: none; } }
`;

// 지휘 스킬(홍수의 금 명령, 설계서 2026-11-09-flood-gold-orders-design.md): 단추 이름과 한 줄 설명(수치는 규칙에서 읽는다). 차례 = Z·X·C(keys.js CAST_KEYS, casts.js CASTS)
export const CAST_TEXT = {
  march: { name: '강행군', what: r => `원 안 우리 병사가 ${r.orders.march.seconds}초 동안 ×${r.orders.march.speedMult} 빠르게 걷는다(쐐기는 가운데가 원 안이면 통째로)` },
  drum: { name: '돌격 북', what: r => `원 안 우리 병사가 ${r.orders.drum.seconds}초 동안 화력 ×${r.orders.drum.damageMult}, 무너지지 않고, 근접으로 맞은 적을 ${r.orders.drum.knockback} m 밀어낸다` },
  volley: { name: '화살 비', what: r => `원에 화살이 닿는 서 있는 궁수가 ${r.orders.volley.seconds}초 동안 원 안 적만 ×${r.orders.volley.fireMult} 빠르게 쏜다` },
};
const RESULT_TOAST_MS = 6000;   // 스킬 결과 알림을 보이는 ms
const TOAST_KINDS = new Set(['castResult', 'land', 'built', 'research', 'pop', 'attacked', 'collapse']);   // 알림으로 띄우는 w.notices 종류
const SPEEDS = [0.5, 1, 2, 4];

// 상태 줄 땅 수(지역이 있는 지도만): 편마다 가진 지역 수.
export function landText(w) {
  if (!w.territory) return '';
  const n = [0, 1].map(side => w.territory.filter(t => t.owner === side).length);
  return ` · 땅 우리 ${n[0]} : 적 ${n[1]}`;
}

// 자원 줄(3단계, 건물이 있는 판만): 자원·수입·인구와 우리 광부 조 수(쉬는 조).
export function resourceLine(w) {
  if (!w.buildings?.length) return '';
  const marks = crewMarks(w, 0);
  return `${resourceText(w, 0)} · 광부 조 ${marks.length}(쉬는 조 ${marks.filter(m => m.idle).length})`;
}

// 상태 줄 병사 수: 편마다 산 병사와 그 병종별 수(있는 병종만, 병종 번호 차례), 싸우는(맞닿은) 병사 수.
export function countsText(w) {
  const s = w.soldiers, units = w.rules.units, by = units.map(list => list.map(() => 0)), fight = units.map(() => 0);
  for (let i = 0; i < s.count; i++) if (s.alive[i]) { by[s.side[i]][s.type[i]]++; fight[s.side[i]] += s.inContact[i]; }
  const side = k => {
    const n = by[k].reduce((a, b) => a + b, 0), parts = by[k].map((c, t) => (c ? `${units[k][t].name} ${c}` : '')).filter(Boolean);
    return parts.length ? `${n}(${parts.join(' · ')})` : `${n}`;
  };
  const neutral = by[2] ? by[2].reduce((a, b) => a + b, 0) : 0;
  return `우리 ${side(0)} : 적 ${side(1)} · 싸우는 중 ${fight[0]} : ${fight[1]}${neutral ? ` · 중립 ${neutral}` : ''}`;
}

export function createHud({ labs = [], scene = '', speed = 1, onScene = () => {}, onRestart = () => {}, onSpeed = () => {}, onPause = () => false, getSelection = () => [],
  onMinimap = () => {}, getFootprint = () => null, seeAt = null, onAim = () => {}, getAim = () => null, onPickType = () => {},
  getBuilding = () => -1, onOrder = () => ({ ok: false }), onPlace = () => {}, getPlacing = () => null, onIdleCrews = () => {},
  onStop = () => {}, onAttackMove = () => {}, getAttackMove = () => false, getGroups = () => [], onGroup = () => {}, onMinimapSend = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'hud'; document.body.appendChild(root);
  root.innerHTML = `
    <div class="bar">
      <b>군단 영지</b><span class="muted">6-1단계 땅 병종과 땅 규칙</span>
      <label class="muted">장면 <select id="scene">${labs.map(n => `<option${n === scene ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button id="restart" title="같은 장면을 처음부터">다시</button>
      <span class="muted" id="time"></span>
      <span class="muted" id="counts"></span>
      <span id="speeds">${SPEEDS.map(v => `<button data-speed="${v}" class="${v === speed ? 'on' : ''}">${v === 0.5 ? '½' : v}×</button>`).join('')}</span>
      <button id="pause">멈춤</button>
      <span class="muted" id="fps"></span>
      <div class="res" id="res"><span id="restext"></span><button id="crews" title="쉬는 광부 조를 모두 고른다"></button></div>
    </div>
    <div class="result" id="result"></div>
    <div class="toasts" id="toasts"></div>
    <div class="help" id="help"><b>왼쪽</b> 고르기: 병사를 누르면 그 부대, 두 번 누르면 화면 안 같은 병종 모두, 빈 땅에서 끌면 닿은 부대 전체(Shift = 더하기, Esc = 풀기).
      <b>오른쪽</b> 고른 병력 보내기 — 땅이면 이동만(가는 길엔 싸우지 않고 닿은 적만 친다), <b>적 병사 위면 그 적 공격</b>. Alt+오른쪽 = 어택땅(싸우며 간다). Shift+오른쪽 = 누를 때마다 길을 이어 간다(바로 출발, 경유점 3개까지).
      <b>지휘 스킬</b> 아래 단추나 Z·X·C → 땅에 원을 찍어 건다(금 없음, 다시 쓰기 시간만). 오른쪽·Esc = 그만두기.
      <b>경제</b> 망치 표식(광부 조)을 누르고 아래 짓기 단추나 Q·W·E·R·A·D·F → 땅에 놓기. 우리 건물을 누르면 생산·연구 판, 오른쪽 = 집결지. 짓는 우리 건물에 광부로 오른쪽 = 돕기, 적 건물에 오른쪽 = 공격.
      <b>화면</b> 가운데 버튼 끌기 = 회전·기울기, 휠 = 확대, 화면 가장자리·방향키·미니맵 = 이동.</div>
    <canvas class="mini" id="mini" width="192" height="128"></canvas>
    <div class="gens" id="gens"></div>
    <div class="orders" id="orders"></div>
    <div class="cgroups" id="cgroups"></div>`;
  const $ = id => root.querySelector('#' + id);
  const toasts = [];
  function toast(text) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
    $('toasts').appendChild(el); toasts.push({ el, until: performance.now() + 2500 });
  }

  $('scene').addEventListener('change', e => onScene(e.target.value));
  $('restart').addEventListener('click', () => onRestart());
  $('speeds').addEventListener('click', e => {
    const b = e.target.closest('button[data-speed]'); if (!b) return;
    onSpeed(Number(b.dataset.speed));
    for (const x of $('speeds').querySelectorAll('button')) x.classList.toggle('on', x === b);
  });
  $('pause').addEventListener('click', () => { const p = onPause(); $('pause').classList.toggle('on', p); $('pause').textContent = p ? '계속' : '멈춤'; });
  $('orders').addEventListener('click', e => { const b = e.target.closest('button[data-order]'); if (b) onAim(b.dataset.order); });
  $('crews').addEventListener('click', () => onIdleCrews());
  $('cgroups').addEventListener('click', e => { const b = e.target.closest('button[data-n]'); if (b) onGroup(Number(b.dataset.n)); });   // 부대 줄: 누르기 = 고르기, 두 번 = 화면
  let groupsKey = null, groupsAt = 0;
  function renderGroups() {                                    // 부대 줄(4단계): 빈 칸이 아닌 부대마다 "숫자 주된 병종 수" — 칸이 바뀔 때만 다시 만들고 수는 자리에서(누르는 단추가 사라지지 않게)
    if (performance.now() - groupsAt < 200 && groupsKey !== null) return;
    groupsAt = performance.now();
    const p = groupBarParts(getGroups());
    if (p.key !== groupsKey) {
      groupsKey = p.key;
      $('cgroups').innerHTML = Object.entries(p.labels).map(([n, l]) => `<button data-n="${n}" title="${n} = 고르기, 두 번 = 화면 이동"><b>${n}</b><span class="lbl">${l}</span></button>`).join('');
      return;
    }
    for (const el of $('cgroups').querySelectorAll('button[data-n]')) { const l = p.labels[el.dataset.n], sp = el.querySelector('.lbl'); if (sp && l !== undefined && sp.textContent !== l) sp.textContent = l; }
  }

  // 지휘 스킬 줄: 다시 쓰기 남은 몫(어둡게)과 초, 겨누는 중이면 테두리
  let ordersBuilt = false, ordersKey = '', ordersAt = 0;
  function renderOrders(w) {
    if (performance.now() - ordersAt < 100) return;
    ordersAt = performance.now();
    if (!ordersBuilt) {
      $('orders').innerHTML = CASTS.map((o, k) => `<button data-order="${o}" title="${CAST_TEXT[o].what(w.rules)}"><span class="cd"></span><span class="cdt"></span><span class="k">${CAST_KEYS[k]}</span>${CAST_TEXT[o].name}<span class="g">다시 쓰기 ${w.rules.orders[o].cooldown}초</span></button>`).join('');
      ordersBuilt = true;
    }
    const aim = getAim(), key = CASTS.map(o => `${o}${Math.ceil(Math.max(0, (w.sides[0].cooldowns[o] ?? 0) - w.time))}${aim === o ? 'a' : ''}`).join();
    if (key === ordersKey) return;
    ordersKey = key;
    for (const b of $('orders').querySelectorAll('button')) {
      const o = b.dataset.order, def = w.rules.orders[o], left = Math.max(0, (w.sides[0].cooldowns[o] ?? 0) - w.time);
      b.querySelector('.cd').style.width = `${(left / def.cooldown) * 100}%`;
      b.querySelector('.cdt').textContent = left > 0 ? `${Math.ceil(left)}초` : '';
      b.classList.toggle('on', aim === o);
      b.disabled = !canCast(w, 0, o).ok && left <= 0;
    }
  }

  // 고른 병력 판: 병종별 수와 조작 안내. 병종 누르기 = 그 병종만, Shift+누르기 = 그 병종 빼기.
  // 광부가 있으면 짓기 단추(3단계), 우리 건물을 골랐으면 건물 판(생산·연구·취소·집결지).
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let gensHtml = '', selAt = 0;
  function renderSel(w) {
    if (performance.now() - selAt < 200 && gensHtml) return;
    selAt = performance.now();
    const bid = getBuilding(), b = bid >= 0 ? w.buildingById?.get(bid) : null;
    if (b) {                                                   // 건물 판: 모양이 그대로면 글만 고친다
      const c = buildingCard(w, b);
      if (c.key !== gensHtml) { gensHtml = c.key; $('gens').innerHTML = buildingCardHtml(w, c); }
      const st = $('gens').querySelector('.bst'), q = $('gens').querySelector('.bq');
      if (st && st.textContent !== c.status) st.textContent = c.status;
      if (q && q.textContent !== c.queue) q.textContent = c.queue;
      return;
    }
    const c = selectionCard(w);                                // 고른 병력 판: 모양이 그대로면 수만 고친다(4단계 최종 검토 — 싸우는 중 누른 단추가 사라졌다)
    if (c.key !== gensHtml) { gensHtml = c.key; $('gens').innerHTML = c.html; }
    else if (c.parts) {
      const g = $('gens'), tot = g.querySelector('.tot'), crw = g.querySelector('.crw');
      if (tot) tot.textContent = `${c.parts.total}명`;
      if (crw) crw.textContent = `${c.parts.crew}`;
      for (const el of g.querySelectorAll('.cnt')) el.textContent = `${c.parts.counts[Number(el.dataset.t)]}`;
    }
  }
  function selectionCard(w) {
    const ids = getSelection(), parts = selectionParts(w, ids, { amove: getAttackMove() }), by = parts.counts, n = parts.total, crew = parts.crew;
    if (!n) return { key: 'none', html: `<div class="card muted">병력을 고르세요 — 병사를 누르면 그 부대, 빈 땅에서 끌면 네모, 광부는 망치 표식 곁을 누른다</div>` };
    const html = selectionHtml(w, parts), bk = crew && w.buildings?.length ? JSON.stringify([buildButtons(w, 0).map(x => [x.ok, x.why]), getPlacing()]) : '';
    return { key: `${parts.key}|${bk}`, html, parts };
  }
  function selectionHtml(w, parts) {
    const by = parts.counts, n = parts.total, crew = parts.crew;
    const cmds = `<br><button class="act" data-kind="stop">멈춤<span class="g">S</span></button><button class="act${getAttackMove() ? ' on' : ''}" data-kind="amove">어택땅<span class="g">누르고 땅을 왼쪽 클릭</span></button>`;   // 명령 단추(4단계)
    const pick = `<div class="card">고른 병력 <b class="tot">${n}명</b> ${by.map((k, t) => (k ? `<button class="type" data-type="${t}">${w.rules.units[0][t].name} <span class="cnt" data-t="${t}">${k}</span></button>` : '')).join('')}${cmds}<br><span class="muted">병종 누르기 = 그 병종만 · Shift+누르기 = 그 병종 빼기<br>오른쪽 = 보내기(적 위 = 공격) · Alt+오른쪽 = 어택땅 · Shift+오른쪽 = 길 이어 가기 · Esc = 풀기</span></div>`;
    if (!crew || !w.buildings?.length) return pick;
    const placing = getPlacing();
    const btns = buildButtons(w, 0).map((x, k) => `<button class="act${placing === x.type ? ' on' : ''}" data-kind="place" data-key="${x.type}" ${x.ok ? '' : 'disabled'} title="${esc(x.why || costText(x.cost))}"><span class="k">${BUILD_KEYS[k] ?? ''}</span>${esc(x.name)}<span class="g">${esc(x.ok ? `${costText(x.cost)} · ${w.rules.buildings[x.type].time}초` : x.why)}</span></button>`).join('');
    return `${pick}<div class="card">짓기(광부 <span class="crw">${crew}</span>명) ${btns}<br><span class="muted">단추나 Q·W·E·R·A·D·F → 땅에 놓기(Shift = 이어서), 오른쪽·Esc = 그만 · 짓는 우리 건물에 오른쪽 = 돕기</span></div>`;
  }
  function buildingCardHtml(w, c) {
    const btns = c.buttons.map(x => `<button class="act" data-kind="${x.kind}" data-key="${x.key}" ${x.ok ? '' : 'disabled'} title="${esc(x.why || `${costText(x.cost)} · ${x.time}초`)}">${esc(x.name)}${x.n ? ` ${x.n}` : ''}<span class="g">${esc(x.ok ? `${costText(x.cost)} · ${x.time}초` : x.why)}</span></button>`).join('');
    const cancel = c.cancel === 'build' ? `<button class="act" data-kind="cancel">짓기 취소(값 돌려받기)</button>` : c.cancel === 'queue' ? `<button class="act" data-kind="cancel">마지막 줄 취소</button>` : '';
    const rally = w.buildingById.get(getBuilding())?.rally;
    return `<div class="card"><b>${esc(c.name)}</b> <span class="muted bst">${esc(c.status)}</span>${c.queue ? `<br><span class="bq">${esc(c.queue)}</span>` : ''}<br>${btns}${cancel}<br><span class="muted">${c.trains ? `오른쪽 클릭 = 집결지${rally ? '(정해 둠)' : ''} · ` : ''}Esc = 풀기</span></div>`;
  }
  $('gens').addEventListener('click', e => {
    const t = e.target.closest('button.type');
    if (t) { onPickType(Number(t.dataset.type), e.shiftKey); return; }
    const a = e.target.closest('button.act');
    if (!a || a.disabled) return;
    const k = a.dataset.kind, bid = getBuilding();
    if (k === 'place') { onPlace(a.dataset.key); gensHtml = ''; return; }
    if (k === 'stop') { onStop(); gensHtml = ''; return; }
    if (k === 'amove') { onAttackMove(); gensHtml = ''; return; }
    if (k === 'train') onOrder({ kind: 'train', side: 0, building: bid, unit: a.dataset.key });
    else if (k === 'research') onOrder({ kind: 'research', side: 0, building: bid, key: a.dataset.key });
    else if (k === 'cancel') onOrder({ kind: 'cancel', side: 0, building: bid });
    gensHtml = '';
  });

  // 미니맵: 지형·안개·병사(둘에 하나)·화면이 보는 땅. 누르면 그 자리로.
  const mini = $('mini'), mg = mini.getContext('2d');
  let terrainImg = null, fogCanvas = null, lastMini = 0, miniW = null;
  // 미니맵(4단계): 왼쪽 누르기·끌기 = 그리 화면, 오른쪽 누르기 = 고른 병력 보내기(Alt면 어택땅)
  let miniDrag = -1;
  const miniAt = e => miniToWorld(e.clientX, e.clientY, mini.getBoundingClientRect(), miniW.map);
  mini.addEventListener('pointerdown', e => {
    if (!miniW) return;
    const p = miniAt(e);
    if (e.button === 2) { onMinimapSend(p.x, p.z, e.altKey); return; }
    if (e.button !== 0) return;
    miniDrag = e.pointerId;
    try { mini.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    onMinimap(p.x, p.z);
  });
  mini.addEventListener('pointermove', e => { if (miniDrag === e.pointerId && miniW) { if (!(e.buttons & 1)) { miniDrag = -1; return; } const p = miniAt(e); onMinimap(p.x, p.z); } });   // 단추를 뗐으면(놓친 pointerup) 끝
  const miniUp = e => { if (miniDrag === e.pointerId) miniDrag = -1; };
  mini.addEventListener('pointerup', miniUp);
  mini.addEventListener('pointercancel', miniUp);
  mini.addEventListener('contextmenu', e => e.preventDefault());
  function drawMini(w) {
    miniW = w;
    const W = mini.width, H = mini.height, map = w.map, sx = W / map.width, sz = H / map.depth;
    const X = x => x * sx, Y = z => H - z * sz;
    if (!terrainImg) {
      terrainImg = document.createElement('canvas'); terrainImg.width = W; terrainImg.height = H;
      const tg = terrainImg.getContext('2d'), colors = ['#8a9a5b', '#3f5f2f', '#a89060', '#2f5f8f', '#5f8faf', '#77736c'], step = 8;
      tg.fillStyle = colors[0]; tg.fillRect(0, 0, W, H);
      for (let z = 0; z < map.depth; z += step) for (let x = 0; x < map.width; x += step) {
        const t = map.terrain[map.cellOf(x + 2, z + 2)];
        if (t) { tg.fillStyle = colors[t]; tg.fillRect(X(x), Y(z + step), step * sx + 0.5, step * sz + 0.5); }
      }
      if (map.regions) {                                       // 지역 경계(가는 선)
        tg.strokeStyle = 'rgba(30,30,28,.55)'; tg.lineWidth = 0.8;
        for (const g of map.regions) { const p = regionPolygon(map, g.id); tg.beginPath(); p.forEach(([x, z], k) => (k ? tg.lineTo(X(x), Y(z)) : tg.moveTo(X(x), Y(z)))); tg.closePath(); tg.stroke(); }
      }
      for (const d of map.deposits ?? []) {                    // 자원 자리(3단계): 금 노랑·목재 갈색·마나 하늘
        tg.fillStyle = d.kind === 'gold' ? '#f2c14e' : d.kind === 'wood' ? '#7a5a36' : '#7fd3ff';
        tg.fillRect(X(d.x) - 1, Y(d.z) - 1, 2, 2);
      }
    }
    mg.drawImage(terrainImg, 0, 0);
    const V = w.vision;
    if (seeAt && V) {
      if (!fogCanvas) { fogCanvas = document.createElement('canvas'); fogCanvas.width = V.cols; fogCanvas.height = V.rows; }
      const fc = fogCanvas.getContext('2d'), img = fc.createImageData(V.cols, V.rows), open = V.open[0];
      for (let r = 0; r < V.rows; r++) for (let c = 0; c < V.cols; c++) {
        const k = ((V.rows - 1 - r) * V.cols + c) * 4;
        img.data[k] = 20; img.data[k + 1] = 22; img.data[k + 2] = 28; img.data[k + 3] = open[r * V.cols + c] ? 0 : 150;
      }
      fc.putImageData(img, 0, 0);
      mg.imageSmoothingEnabled = true;
      mg.drawImage(fogCanvas, 0, 0, W, H);
    }
    const s = w.soldiers;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || (i & 1)) continue;
      if (s.side[i] !== 0 && seeAt && !seeAt(s.x[i], s.z[i])) continue;   // 안개: 우리 편 말고는 보이는 것만(중립 포함)
      mg.fillStyle = s.side[i] === 0 ? '#1D9E75' : s.side[i] === 1 ? '#D85A30' : '#888780';
      mg.fillRect(X(s.x[i]) - 0.6, Y(s.z[i]) - 0.6, 1.3, 1.3);
    }
    for (const b of w.buildings ?? []) {                       // 건물(3단계): 편 색 네모(성채는 크게), 안개면 보이는 적 건물만
      if (!b.alive || (b.side !== 0 && seeAt && !seeAt(b.x, b.z))) continue;
      const k = b.type === 'citadel' ? 3.5 : 2;
      mg.fillStyle = b.side === 0 ? '#1D9E75' : '#D85A30'; mg.strokeStyle = '#1f1f1d'; mg.lineWidth = 0.8;
      mg.fillRect(X(b.x) - k, Y(b.z) - k, 2 * k, 2 * k); mg.strokeRect(X(b.x) - k, Y(b.z) - k, 2 * k, 2 * k);
    }
    for (const m of crewMarks(w, 0)) { mg.fillStyle = '#f2c14e'; mg.beginPath(); mg.arc(X(m.x), Y(m.z), 2, 0, Math.PI * 2); mg.fill(); }   // 우리 광부 조
    if (w.territory) for (const g of map.regions) {            // 깃발: 주인 색 점(중립 흰색)
      const o = w.territory[g.id].owner;
      mg.fillStyle = o === 0 ? '#1D9E75' : o === 1 ? '#D85A30' : '#ffffff'; mg.strokeStyle = '#222'; mg.lineWidth = 1;
      mg.beginPath(); mg.arc(X(g.x), Y(g.z), 3, 0, Math.PI * 2); mg.fill(); mg.stroke();
    }
    for (const p of pings(w, 0, w.time)) {                     // 공격받음·무너짐 고리(6초 동안 커지며 옅어진다)
      mg.strokeStyle = `rgba(226,75,74,${(1 - p.age / 6).toFixed(2)})`; mg.lineWidth = 2;
      mg.beginPath(); mg.arc(X(p.x), Y(p.z), 4 + p.age * 3, 0, Math.PI * 2); mg.stroke();
    }
    const fp = getFootprint();
    if (fp && fp.length >= 3) {
      mg.strokeStyle = 'rgba(255,255,255,.9)'; mg.lineWidth = 1;
      mg.beginPath(); fp.forEach((q, k) => (k ? mg.lineTo(X(q.x), Y(q.z)) : mg.moveTo(X(q.x), Y(q.z)))); mg.closePath(); mg.stroke();
    }
  }

  // 스킬·투석기 결과 한 줄(개발용 — 홍수 사용자 2026-11-09 "개발 단계에서는 수치를 봐야겠네")
  const shownResults = new WeakSet();
  function resultText(n, r) {
    const name = CAST_TEXT[n.order]?.name ?? n.order, dmg = Math.round(n.damage);
    if (n.order === 'volley') return `${name} 결과: 적 ${n.kills}명 쓰러뜨림 · 피해 ${dmg}(스킬 몫 ${Math.round(n.damage * (1 - 1 / r.orders.volley.fireMult))}) · 궁수 ${n.count}명`;
    if (n.order === 'drum') return `${name} 결과: 적 ${n.kills}명 쓰러뜨림 · ${n.pushed}번 밀어냄 · 피해 ${dmg}(스킬 몫 ${Math.round(n.damage * (1 - 1 / r.orders.drum.damageMult))}) · ${n.count}명`;
    if (n.order === 'march') return `${name} 결과: ${n.count}명이 평균 ${n.count ? Math.round(n.extra / n.count) : 0} m 더 감`;
    return `${name} 끝`;
  }

  let lastCounts = -1;
  function update(w, fps) {
    if (performance.now() - lastMini > 250) { lastMini = performance.now(); drawMini(w); }
    renderSel(w);
    renderOrders(w);
    renderGroups();
    const helpH = $('help').offsetHeight;
    $('gens').style.bottom = helpH ? `${helpH + 72}px` : '';
    const t = w.time, mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    $('time').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    if (fps) $('fps').textContent = `FPS ${fps.toFixed(0)}`;
    if (t - lastCounts > 0.5 || t < lastCounts) {
      lastCounts = t;
      $('counts').textContent = countsText(w) + landText(w);
      const eco = !!w.buildings?.length;
      $('res').style.display = eco ? '' : 'none';
      if (eco) {
        const marks = crewMarks(w, 0);
        $('restext').textContent = resourceText(w, 0);
        $('crews').textContent = `광부 조 ${marks.length}(쉬는 조 ${marks.filter(m => m.idle).length})`;
      }
    }
    if (w.result && $('result').style.display !== 'block') {
      $('result').style.display = 'block';
      $('result').textContent = w.result.winner === 0 ? '승리 — 적 성채가 무너졌다' : '패배 — 우리 성채가 무너졌다';
    }
    for (const n of w.notices) {
      if (n.side !== 0 || !TOAST_KINDS.has(n.kind) || shownResults.has(n)) continue;   // land = 땅을 얻었다·잃었다(territory.js), 3단계: 완성·연구·인구·공격받음·무너짐
      shownResults.add(n);
      const el = document.createElement('div'); el.className = 'toast'; el.textContent = n.kind === 'castResult' ? resultText(n, w.rules) : n.text;
      $('toasts').appendChild(el); toasts.push({ el, until: performance.now() + RESULT_TOAST_MS });
    }
    const now = performance.now();
    while (toasts.length && toasts[0].until < now) toasts.shift().el.remove();
  }
  return { update, root, toast };
}
