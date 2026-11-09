// HUD: 위쪽 상태 줄(사기·시간·병사 수·FPS), 사기 깎임 이유, 손잡이 판, 결과 창. 화면 글은 한국어.

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font: 14px/1.4 system-ui, "Malgun Gothic", sans-serif; color: #2c2c2a; }
#hud .bar { position: absolute; left: 8px; right: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center;
  background: rgba(250,248,240,.88); border: 1px solid rgba(0,0,0,.12); border-radius: 10px; padding: 6px 10px; }
#hud .m { display: flex; align-items: center; gap: 6px; }
#hud .track { width: 120px; height: 9px; border-radius: 5px; background: #e4e1d6; overflow: hidden; }
#hud .fill { height: 100%; border-radius: 5px; }
#hud .muted { color: #5f5e5a; }
#hud .toasts { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 4px; align-items: center; }
#hud .toast { background: rgba(44,44,42,.82); color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 13px; }
#hud .panel { position: absolute; right: 8px; bottom: 8px; pointer-events: auto; background: rgba(250,248,240,.94); border: 1px solid rgba(0,0,0,.15);
  border-radius: 10px; padding: 8px 10px; max-width: 280px; }
#hud .panel summary { cursor: pointer; font-weight: 600; }
#hud .panel label { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; align-items: center; }
#hud .panel button, #hud .result button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #999; background: #fff; cursor: pointer; min-height: 36px; }
#hud .result { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.35); pointer-events: auto; }
#hud .result div { background: #faf8f0; border-radius: 14px; padding: 22px 28px; text-align: center; font-size: 20px; }
#hud .build { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); pointer-events: auto; background: rgba(250,248,240,.96);
  border: 1px solid rgba(0,0,0,.18); border-radius: 12px; padding: 10px 12px; min-width: 300px; max-width: calc(100% - 24px); display: none; }
#hud .build h3 { margin: 0 0 6px; font-size: 15px; display: flex; justify-content: space-between; gap: 8px; }
#hud .build .slot { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 0; border-top: 1px solid rgba(0,0,0,.08); }
#hud .build button { font: inherit; font-size: 13px; padding: 6px 9px; border-radius: 8px; border: 1px solid #999; background: #fff; cursor: pointer; min-height: 34px; }
#hud .build button.poor { color: #a32d2d; border-color: #e0a0a0; }
#hud .alerts { position: absolute; left: 8px; top: 96px; display: flex; flex-direction: column; gap: 4px; pointer-events: auto; max-width: 260px; }
#hud .alert { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(250,248,240,.94); border: 1px solid rgba(0,0,0,.15);
  border-left: 4px solid #a32d2d; border-radius: 8px; padding: 4px 6px 4px 8px; cursor: pointer; font-size: 13px; }
#hud .alert.sighted { border-left-color: #ba7517; }
#hud .alert button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 8px; border: 1px solid #a32d2d; background: #fff; color: #a32d2d; cursor: pointer; min-height: 32px; }
#hud .gens { position: absolute; left: 8px; bottom: 140px; display: flex; flex-direction: column; gap: 6px; pointer-events: auto; max-width: 330px; }
#hud .gens .row { display: flex; gap: 6px; flex-wrap: wrap; }
#hud .gens button { font: inherit; font-size: 13px; padding: 5px 9px; border-radius: 8px; border: 1px solid #999; background: rgba(255,255,255,.95); cursor: pointer; min-height: 34px; }
#hud .gens button.on { border-color: #0f6e56; background: #e1f5ee; }
#hud .gens button.off { color: #999; }
#hud .gens button:disabled { color: #aaa; cursor: default; }
#hud .gens .card { background: rgba(250,248,240,.95); border: 1px solid rgba(0,0,0,.15); border-radius: 10px; padding: 7px 9px; font-size: 13px; }
#hud .mini { position: absolute; right: 8px; top: 62px; pointer-events: auto; border: 1px solid rgba(0,0,0,.3); border-radius: 6px; cursor: pointer; }
#hud .help { position: absolute; left: 8px; bottom: 64px; background: rgba(250,248,240,.85); border-radius: 8px; padding: 6px 10px; font-size: 12px; max-width: 46%; }
#hud .orders { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); display: flex; gap: 6px; pointer-events: auto; }
#hud .orders button { position: relative; overflow: hidden; font: inherit; font-size: 13px; padding: 6px 10px; min-width: 92px; min-height: 44px; border-radius: 9px; border: 1px solid rgba(0,0,0,.25); background: rgba(250,248,240,.97); cursor: pointer; text-align: left; }
#hud .orders button .k { opacity: .55; margin-right: 4px; } #hud .orders button .g { display: block; font-size: 12px; color: #8a6d1d; }
#hud .orders button.poor .g { color: #c62828; } #hud .orders button.on { outline: 3px solid #1D9E75; }
#hud .orders button .cd { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(30,30,30,.38); pointer-events: none; }
#hud .orders button .cdt { position: absolute; right: 6px; top: 4px; font-size: 12px; font-weight: 600; color: #fff; text-shadow: 0 0 3px #000; pointer-events: none; }
#hud .alert.notice { border-left-color: #1D9E75; }
@media (max-width: 600px) { #hud .mini { top: 92px; width: 132px; height: 88px; } #hud .gens { bottom: 8px; max-width: calc(100% - 16px); } #hud .track { width: 70px; } #hud .help { display: none; } #hud .build { min-width: 0; left: 8px; right: 8px; transform: none; } }
`;

const SIDE_HEX = ['#1D9E75', '#D85A30'];
const REASON_SIDE = ['우리', '적'];

import { slotKinds } from '../sim/orders.js';
import { CASTS, canCast } from '../sim/casts.js';
const NAMES = { pikes: ['창 막사', '창 고블린 굴'], archery: ['사격장', '바위터'], stable: ['마구간', '늑대 우리'], tower: ['망루', '토템'], wall: ['성벽', '목책'] };
const WHAT = { pikes: '창병 80%', archery: '궁수 80%', stable: '기병 80%', tower: '시야 250 m', wall: '수비' };
const UPGRADE_NAME = ['성벽', '망루'];
const LEVEL2 = { pikes: '방패벽 창병', archery: '장궁수', stable: '중기병', wall: '체력 ×2', tower: '시야 300 m' };   // 2단계가 주는 것
export const buildingName = (kind, side) => NAMES[kind]?.[side] ?? kind;

const ALERT_NAME = { attacked: '공격받음', blocked: '생산 막힘', sighted: '적 발견' };
// 금 명령(설계서 2026-11-09-flood-gold-orders-design.md): 단추 이름과 한 줄 설명(수치는 규칙에서 읽는다). 차례 = 숫자키 1~5(casts.js CASTS)
export const CAST_TEXT = {
  march: { name: '강행군', what: r => `원 안 우리 병사가 ${r.orders.march.seconds}초 동안 ×${r.orders.march.speedMult} 빠르게 걷는다(쐐기는 가운데가 원 안이면 통째로)` },
  drum: { name: '돌격 북', what: r => `원 안 우리 병사가 ${r.orders.drum.seconds}초 동안 화력 ×${r.orders.drum.damageMult}, 무너지지 않고, 근접으로 맞은 적을 ${r.orders.drum.knockback} m 밀어낸다` },
  volley: { name: '화살 비', what: r => `원에 화살이 닿는 서 있는 궁수가 ${r.orders.volley.seconds}초 동안 원 안 적만 ×${r.orders.volley.fireMult} 빠르게 쏜다` },
  scout: { name: '정찰', what: r => `둘레 ${r.orders.scout.radius} m가 ${r.orders.scout.seconds}초 동안 보인다` },
  levy: { name: '징집', what: r => `"공격받음" 경보가 뜬 우리 거점에 보병 ${Math.round(r.orders.levy.count)}명이 바로 나온다` },
};
const PLACE_NAME = { hq: '본진', front: '앞 거점', rear: '뒤 거점' };
const LAND_NAME = { edge: '가장자리 땅', deep: '깊은 땅', choke: '길목' };   // 작은 땅(2026-11-09)
const placeLabel = st => (st.kind === 'land' ? LAND_NAME[st.landKind] : PLACE_NAME[st.kind] ?? '');
const NOTICE_SHOW = 15;   // 공성병 준비 알림을 보이는 초
const RESULT_TOAST_MS = 6000;   // 금 명령 결과 알림을 보이는 ms

export function createHud({ onKnobs, onSpeed, onPause, onRestart, onOrder, onFocus = () => {}, getSelection = () => [], onArmFlow = () => {}, onMinimap = () => {}, getFootprint = () => null, seeAt = null, onAim = () => {}, getAim = () => null, onSelectIds = () => {} }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'hud'; document.body.appendChild(root);
  root.innerHTML = `
    <div class="bar">
      <div class="m"><span>우리 사기</span><div class="track"><div class="fill" id="m0" style="background:${SIDE_HEX[0]}"></div></div><b id="m0n"></b></div>
      <div class="m"><span>적 사기</span><div class="track"><div class="fill" id="m1" style="background:${SIDE_HEX[1]}"></div></div><b id="m1n"></b></div>
      <span class="muted" id="time"></span>
      <span class="muted" id="counts"></span>
      <span class="muted" id="vp"></span>
      <span class="muted" id="lands" title="쥔 작은 땅 수(우리 : 적)"></span>
      <b id="gold"></b>
      <span class="muted" id="decisions" title="30초 넘게 유지된 명령(바로 되돌린 잡일은 세지 않는다, 설계서 §10.5-3)"></span>
      <span class="muted" id="fps"></span>
    </div>
    <div class="toasts" id="toasts"></div>
    <details class="panel"><summary>손잡이</summary>
      <label>규모 <select id="k-scale"><option>0.2</option><option>0.5</option><option>1</option><option>2</option></select></label>
      <label>생산 배율 <input id="k-prod" type="number" step="0.1" min="0.1" style="width:70px"></label>
      <label>피해 배율 <input id="k-dmg" type="number" step="0.1" min="0.1" style="width:70px"></label>
      <label>지휘 한도 <input id="k-limit" type="number" step="50" min="50" style="width:70px"></label>
      <label>명령 쿨(초) <input id="k-cool" type="number" step="5" min="0" style="width:70px"></label>
      <label>병사 시야(m) <input id="k-sight" type="number" step="10" min="10" style="width:70px"></label>
      <label>판 속도 <select id="k-speed"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
      <label><button id="k-pause">일시정지</button><button id="k-restart">다시 시작</button></label>
      <div class="muted" style="font-size:12px;margin-top:6px">규모·배율을 바꾸면 새 판으로 다시 시작한다.</div>
    </details>
    <div class="help" id="help"><b>왼쪽</b> 고르기: 거점 가운데·승점 깃대·쐐기를 누르거나 빈 땅에서 끌어 네모(Shift = 더하기, Esc = 풀기). 우리 거점을 누르면 짓기 판.
      <b>오른쪽</b> 고른 병력 보내기 — 거점·승점을 누르면 싸우며 간다, 땅·구역 선을 누르면 이동만(가는 길엔 싸우지 않고 닿은 적만 친다): 거점·승점 원 → 그 거점, 구역 선 위 → 그 구역, 그 밖 → 그 자리. <b>적 병사를 오른쪽 클릭 = 그 적 공격. Alt+오른쪽 = 어택땅(빈 땅으로도 싸우며 간다).</b> Shift+오른쪽 = 누를 때마다 길을 이어 간다(바로 출발, 경유점 3개까지), Ctrl+오른쪽 = 고른 우리 거점의 새 병사 방향.
      경보를 누르면 그 자리로, "막아라"는 가까운 구역에서 500을 돌려 막는다. <b>화면</b> 가운데 버튼 끌기·WASD·방향키·화면 가장자리·미니맵, 휠 = 확대, Q/E = 회전.
      <b>명령</b> 아래 줄 단추나 1~5 → 땅에 원을 찍어 건다(징집은 경보 뜬 거점). 오른쪽·Esc = 그만두기.</div>
    <canvas class="mini" id="mini" width="192" height="128"></canvas>
    <div class="alerts" id="alerts"></div>
    <div class="gens" id="gens"></div>
    <div class="build" id="build"></div>
    <div class="orders" id="orders"></div>
    <div class="result" id="result"><div><div id="result-text"></div><br><button id="result-restart">다시 하기</button></div></div>`;
  const $ = id => root.querySelector('#' + id);
  const toasts = [];

  function setKnobs(k) {
    $('k-scale').value = String(k.scale); $('k-prod').value = String(k.production); $('k-dmg').value = String(k.damage);
    $('k-limit').value = String(k.commandLimit); $('k-cool').value = String(k.commandCooldown); $('k-sight').value = String(k.soldierSight);
  }
  const knobsNow = () => ({ scale: Number($('k-scale').value), production: Number($('k-prod').value), damage: Number($('k-dmg').value), commandLimit: Number($('k-limit').value), commandCooldown: Number($('k-cool').value), soldierSight: Number($('k-sight').value) });
  for (const id of ['k-scale', 'k-prod', 'k-dmg', 'k-limit', 'k-cool', 'k-sight']) $(id).addEventListener('change', () => onKnobs(knobsNow()));
  $('k-speed').addEventListener('change', () => onSpeed(Number($('k-speed').value)));
  $('k-pause').addEventListener('click', () => { $('k-pause').textContent = onPause() ? '계속' : '일시정지'; });
  $('k-restart').addEventListener('click', () => onRestart());
  $('result-restart').addEventListener('click', () => onRestart());

  // 거점 판: 우리 거점을 누르면(고르면) 칸마다 짓기·올리기·철거 + 생산 방향
  let open = null, lastMenu = 0;
  function openBuild(st) { open = st; lastMenu = 0; $('build').style.display = 'block'; }
  function closeBuild() { open = null; $('build').style.display = 'none'; }
  function toast(text) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; $('toasts').appendChild(el); toasts.push({ el, until: performance.now() + 2500 }); }
  $('build').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !open) return;
    if (b.dataset.close) { closeBuild(); return; }
    if (b.dataset.flow) { onArmFlow(); return; }
    const r = onOrder({ kind: b.dataset.kind, side: 0, stronghold: open.id, slot: Number(b.dataset.slot), building: b.dataset.building });
    if (r && !r.ok) toast(r.reason);
    lastMenu = 0;
  });
  function renderBuild(w) {
    if (!open) return;
    if (open.owner !== 0) { closeBuild(); return; }
    const gold = w.sides[0].gold, def = w.rules.buildings;
    const kindName = { hq: '본진', front: '앞 거점', rear: '뒤 거점' }[open.kind];
    let html = `<h3><span>${kindName} ${open.id} · 금 ${gold.toFixed(0)}</span><span><button data-flow="1" title="누른 뒤 오른쪽 클릭(또는 Ctrl+오른쪽 클릭)">생산 방향</button> <button data-close="1">닫기</button></span></h3>`;
    open.slots.forEach((b, k) => {
      const up = k >= open.slotCount;
      if (k === open.slotCount) html += `<div class="slot"><span>거점 강화</span></div>`;
      if (up && open.kind === 'hq' && k === open.slotCount) return;   // 본진은 처음부터 성벽
      html += `<div class="slot"><span>${up ? UPGRADE_NAME[k - open.slotCount] : `칸 ${k + 1}`}</span>`;
      if (!b) for (const kind of slotKinds(open, k)) {
        html += `<button data-kind="build" data-slot="${k}" data-building="${kind}" class="${gold < def[kind].cost ? 'poor' : ''}">${buildingName(kind, 0)} ${def[kind].cost} · ${WHAT[kind]}</button>`;
      }
      else {
        const left = b.building ? ` (짓는 중 ${Math.max(0, b.doneAt - w.time).toFixed(0)}초)` : '';
        html += `<b>${buildingName(b.kind, 0)} ${b.level}단계${b.level >= 2 && LEVEL2[b.kind] ? ` (${LEVEL2[b.kind]})` : ''}${left}</b>`;
        if (!b.building && b.level < 2) { const c = def[b.kind].cost * def.upgradeCost; html += `<button data-kind="upgrade" data-slot="${k}" class="${gold < c ? 'poor' : ''}">올리기 ${c} · ${LEVEL2[b.kind] ?? ''}</button>`; }
        const spent = def[b.kind].cost * (b.level >= 2 ? 1 + def.upgradeCost : 1);
        html += `<button data-kind="demolish" data-slot="${k}">철거 +${(spent * def.demolishRefund).toFixed(0)}</button>`;
      }
      html += '</div>';
    });
    const sb = w.rules.siegeBuy;                              // 공성병 사기(siege.js): 한 번에 하나, 사는 동안 남은 초
    html += `<div class="slot"><span>공성</span>${open.siegeAt != null ? `<b>공성병 사는 중 ${Math.max(0, open.siegeAt - w.time).toFixed(0)}초</b>` : `<button data-kind="buySiege" class="${gold < sb.cost ? 'poor' : ''}" title="${sb.seconds}초 뒤 이 거점에 서서 기다린다 — 성벽·건물을 ×10으로 친다">공성병 ${Math.round(sb.count)}명 · 금 ${sb.cost}</button>`}</div>`;
    $('build').innerHTML = html;
  }

  // 경보(§7.3): 우리 거점이 공격받음·생산 막힘·망루가 적 발견. 줄을 누르면 그 자리로, "막아라"는 공격·막힘에만.
  let alertKey = '';
  let noticeIds = [];
  $('alerts').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && b.dataset.pick !== undefined) { onSelectIds(noticeIds[Number(b.dataset.pick)] ?? []); return; }   // 알림 [고르기]
    if (b && b.dataset.levy) { const r = onOrder({ kind: 'cast', side: 0, order: 'levy', stronghold: b.dataset.levy }); toast(r && r.ok ? `징집 — ${r.count}명` : r.reason); alertKey = ''; return; }
    if (b) { const r = onOrder({ kind: 'holdTheLine', side: 0, stronghold: b.dataset.hold }); if (r && !r.ok) toast(r.reason); alertKey = ''; return; }
    const row = e.target.closest('.alert');
    if (row) onFocus(row.dataset.st);
  });
  function renderAlerts(w) {
    const holding = new Set(w.holds.filter(h => h.side === 0).map(h => w.strongholds[h.stronghold].id));
    const list = w.sides[0].alerts;
    const levy = id => canCast(w, 0, 'levy', id), cost = w.rules.orders.levy.cost;
    const notes = w.notices.filter(n => n.side === 0 && n.kind === 'siegeReady' && w.time - n.at <= NOTICE_SHOW);
    const key = list.map(a => a.kind + a.stronghold).join() + '|' + [...holding].join() + '|' + notes.map(n => n.at).join();
    if (key === alertKey) { levyButtons(w); return; }   // 줄은 그대로 두고 징집 단추만 고친다(통째로 다시 그리면 그 사이 누른 클릭이 사라진다)
    alertKey = key;
    noticeIds = notes.map(n => n.ids);
    $('alerts').innerHTML = list.map(a => {
      const st = w.strongholds.find(x => x.id === a.stronghold);
      let act = a.kind === 'sighted' || st.kind === 'land' ? '' : holding.has(a.stronghold) ? '<span class="muted">막는 중</span>' : `<button data-hold="${a.stronghold}">막아라</button>`;   // 땅에는 막아라·징집 없음
      if (a.kind === 'attacked' && st.kind !== 'land') act += ` <button data-levy="${a.stronghold}">징집 ${cost}</button>`;   // 금 명령 긴급 징집(casts.js) — 상태는 levyButtons가
      return `<div class="alert ${a.kind}" data-st="${a.stronghold}"><span>${ALERT_NAME[a.kind]} · ${placeLabel(st)} ${a.stronghold}</span><span>${act}</span></div>`;
    }).join('') + notes.map((n, k) => `<div class="alert notice" data-st="${n.stronghold}"><span>공성병 ${n.ids.length}명 준비됨 · ${n.stronghold}</span><button data-pick="${k}">고르기</button></div>`).join('');
    levyButtons(w);
  }
  // 경보 줄 징집 단추: 쓸 수 없으면 흐리게, 다시 쓰기 중이면 남은 초(설계서 §1.3) — 바뀐 것만 고친다
  function levyButtons(w) {
    const cost = w.rules.orders.levy.cost;
    for (const b of $('alerts').querySelectorAll('button[data-levy]')) {
      const c = canCast(w, 0, 'levy', b.dataset.levy), text = c.ok ? `징집 ${cost}` : c.wait ? `징집 ${Math.ceil(c.wait)}초` : `징집 ${cost}`;
      if (b.textContent !== text) b.textContent = text;
      if (b.disabled !== !c.ok) b.disabled = !c.ok;
      const title = c.ok ? '' : c.reason;
      if (b.title !== title) b.title = title;
    }
  }

  // 금 명령 줄(설계서 2026-11-09 §1.3): 단추 다섯 — 숫자키·이름·금, 다시 쓰기 막과 남은 초, 금이 모자라면 빨강, 겨누는 단추는 테두리
  $('orders').addEventListener('click', e => { const b = e.target.closest('button'); if (b) onAim(b.dataset.order); });
  let ordersKey = '', ordersAt = 0, ordersBuilt = false;
  function renderOrders(w) {
    if (performance.now() - ordersAt < 100) return;
    ordersAt = performance.now();
    if (!ordersBuilt) {
      $('orders').innerHTML = CASTS.map((o, k) => `<button data-order="${o}" title="${CAST_TEXT[o].what(w.rules)}"><span class="cd"></span><span class="cdt"></span><span class="k">${k + 1}</span>${CAST_TEXT[o].name}<span class="g">금 ${w.rules.orders[o].cost}</span></button>`).join('');
      ordersBuilt = true;
    }
    const gold = w.sides[0].gold, aim = getAim(), parts = [];
    for (const o of CASTS) { const ready = w.sides[0].cooldowns[o] ?? 0; parts.push(`${o}${Math.ceil(Math.max(0, ready - w.time))}${gold < w.rules.orders[o].cost ? 'p' : ''}${aim === o ? 'a' : ''}`); }
    const key = parts.join();
    if (key === ordersKey) return;
    ordersKey = key;
    for (const b of $('orders').querySelectorAll('button')) {
      const o = b.dataset.order, def = w.rules.orders[o], left = Math.max(0, (w.sides[0].cooldowns[o] ?? 0) - w.time);
      b.querySelector('.cd').style.width = `${(left / def.cooldown) * 100}%`;
      b.querySelector('.cdt').textContent = left > 0 ? `${Math.ceil(left)}초` : '';
      b.classList.toggle('poor', gold < def.cost); b.classList.toggle('on', aim === o);
    }
  }

  // 고른 병력 판(사용자 2026-11-08 PC 조작): 고른 병력의 병종별 수와 조작 안내. (구역 단추·보낼 양은 같은 날 뺐다 — 네모로 고르면 돼서 쓰지 않았다.)
  let gensKey = '', selAt = 0;
  function renderSel(w) {
    if (performance.now() - selAt < 250 && gensKey) return;
    selAt = performance.now();
    const ids = getSelection(), s = w.soldiers, by = w.rules.units[0].map(() => 0);   // 병종마다(공성 포함)
    for (const i of ids) if (s.alive[i]) by[s.type[i]]++;
    const n = by.reduce((a, b) => a + b, 0), key = by.join('|');
    if (key === gensKey) return;
    gensKey = key;
    const html = n
      ? `<div class="card">고른 병력 <b>${n}명</b> · ${by.map((k, t) => (k ? `${w.rules.units[0][t].name} ${k}` : '')).filter(Boolean).join(' · ')}<br><span class="muted">오른쪽 = 보내기(적 위 = 공격) · Alt+오른쪽 = 어택땅 · Shift+오른쪽 = 길 이어 가기 · Esc = 풀기</span></div>`
      : `<div class="card muted">병력을 고르세요 — 거점·쐐기를 누르거나 빈 땅에서 끌어 네모</div>`;
    $('gens').innerHTML = html;
  }

  // 미니맵(§7.3): 지형·거점(주인 색)·우리 병사·보이는 적·안개·화면 테두리·경보. 누르면 그 자리로.
  const mini = $('mini'), mg = mini.getContext('2d');
  let terrainImg = null, fogCanvas = null, lastMini = 0, miniW = null;
  mini.addEventListener('pointerdown', e => {
    if (!miniW) return;
    const r = mini.getBoundingClientRect();
    onMinimap((e.clientX - r.left) / r.width * miniW.map.width, (1 - (e.clientY - r.top) / r.height) * miniW.map.depth);
  });
  function drawMini(w) {
    miniW = w;
    const W = mini.width, H = mini.height, map = w.map, sx = W / map.width, sz = H / map.depth;
    const X = x => x * sx, Y = z => H - z * sz;
    if (!terrainImg) {                                          // 지형은 한 번만
      terrainImg = document.createElement('canvas'); terrainImg.width = W; terrainImg.height = H;
      const tg = terrainImg.getContext('2d'), colors = ['#8a9a5b', '#3f5f2f', '#a89060', '#2f5f8f', '#5f8faf'], step = 8;
      tg.fillStyle = colors[0]; tg.fillRect(0, 0, W, H);
      for (let z = 0; z < map.depth; z += step) for (let x = 0; x < map.width; x += step) {
        const t = map.terrain[map.cellOf(x + 2, z + 2)];
        if (t) { tg.fillStyle = colors[t]; tg.fillRect(X(x), Y(z + step), step * sx + 0.5, step * sz + 0.5); }
      }
    }
    mg.drawImage(terrainImg, 0, 0);
    const V = w.vision;
    if (seeAt && V) {                                           // 안개
      if (!fogCanvas) { fogCanvas = document.createElement('canvas'); fogCanvas.width = V.cols; fogCanvas.height = V.rows; }
      const fc = fogCanvas.getContext('2d'), img = fc.createImageData(V.cols, V.rows), open = V.open[0];
      for (let r = 0; r < V.rows; r++) for (let c = 0; c < V.cols; c++) {
        const k = ((V.rows - 1 - r) * V.cols + c) * 4;           // 위가 먼 쪽(z 큼)
        img.data[k] = 20; img.data[k + 1] = 22; img.data[k + 2] = 28; img.data[k + 3] = open[r * V.cols + c] ? 0 : 150;
      }
      fc.putImageData(img, 0, 0);
      mg.imageSmoothingEnabled = true;
      mg.drawImage(fogCanvas, 0, 0, W, H);
    }
    const s = w.soldiers;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || (i & 1)) continue;                     // 둘에 하나만 찍는다
      if (s.side[i] === 1 && seeAt && !seeAt(s.x[i], s.z[i])) continue;
      mg.fillStyle = s.side[i] === 0 ? '#1D9E75' : '#D85A30';
      mg.fillRect(X(s.x[i]) - 0.6, Y(s.z[i]) - 0.6, 1.3, 1.3);
    }
    const alerted = new Set(w.sides[0].alerts.filter(a => a.kind !== 'sighted').map(a => a.stronghold));
    for (const st of w.strongholds) {
      mg.beginPath(); mg.arc(X(st.x), Y(st.z), Math.max(3, st.radius * sx), 0, Math.PI * 2);
      mg.lineWidth = alerted.has(st.id) ? 2.5 : 1.2;
      mg.strokeStyle = alerted.has(st.id) ? '#ff3b30' : ['#1D9E75', '#D85A30'][st.owner] ?? '#eeeeee';
      mg.stroke();
    }
    const fp = getFootprint();
    if (fp && fp.length >= 3) {                                 // 화면이 보는 땅(화면 네 귀퉁이가 닿는 곳 — 돌린 시점이면 기운 사각형)
      mg.strokeStyle = 'rgba(255,255,255,.9)'; mg.lineWidth = 1;
      mg.beginPath(); fp.forEach((q, k) => (k ? mg.lineTo(X(q.x), Y(q.z)) : mg.moveTo(X(q.x), Y(q.z)))); mg.closePath(); mg.stroke();
    }
  }

  // 금 명령 결과 한 줄(개발용 — 실제 게임에선 뺄 수 있다, 사용자 2026-11-09 "개발 단계에서는 수치를 봐야겠네")
  const shownResults = new WeakSet();
  // 피해는 걸린 병사가 낸 전체 — "명령 몫"은 화살 비 = 전체 × (1 − 1/fireMult), 돌격 북 = 전체 × (1 − 1/damageMult)
  function resultText(n, r) {
    const name = CAST_TEXT[n.order]?.name ?? n.order, dmg = Math.round(n.damage);
    if (n.order === 'volley') return `${name} 결과: 적 ${n.kills}명 쓰러뜨림 · 피해 ${dmg}(명령 몫 ${Math.round(n.damage * (1 - 1 / r.orders.volley.fireMult))}) · 궁수 ${n.count}명`;
    if (n.order === 'drum') return `${name} 결과: 적 ${n.kills}명 쓰러뜨림 · ${n.pushed}번 밀어냄 · 피해 ${dmg}(명령 몫 ${Math.round(n.damage * (1 - 1 / r.orders.drum.damageMult))}) · ${n.count}명`;
    if (n.order === 'march') return `${name} 결과: ${n.count}명이 평균 ${n.count ? Math.round(n.extra / n.count) : 0} m 더 감`;
    if (n.order === 'scout') return `${name} 결과: 적 최대 ${n.seen}명 봄`;
    return `${name} 끝`;
  }

  let lastCounts = 0;
  function update(w, fps) {
    if (performance.now() - lastMini > 250) { lastMini = performance.now(); drawMini(w); }
    renderAlerts(w);
    renderSel(w);
    renderOrders(w);
    const helpH = $('help').offsetHeight;                     // 도움말(명령 줄 위) 위에 고른 병력 판
    $('gens').style.bottom = helpH ? `${helpH + 72}px` : '';
    for (const side of [0, 1]) {
      const m = w.sides[side].morale;
      $('m' + side).style.width = `${Math.max(0, m / w.rules.morale.start * 100)}%`;
      $('m' + side + 'n').textContent = m.toFixed(0);
    }
    const t = w.time, mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    $('time').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    $('vp').textContent = `승점 ${w.vpCount[0]} : ${w.vpCount[1]}`;
    { const n = [0, 0]; for (const st of w.strongholds) if (st.kind === 'land' && (st.owner === 0 || st.owner === 1)) n[st.owner]++; $('lands').textContent = `땅 ${n[0]} : ${n[1]}`; }
    if (fps) $('fps').textContent = `FPS ${fps.toFixed(0)}`;
    $('gold').textContent = `금 ${w.sides[0].gold.toFixed(0)}`;
    if (w.metrics) $('decisions').textContent = `결정 ${w.metrics.decisions[0]} (${(w.metrics.decisions[0] / Math.max(1, w.time / 60)).toFixed(1)}/분)`;
    if (open && performance.now() - lastMenu > 400) { lastMenu = performance.now(); renderBuild(w); }
    if (t - lastCounts > 0.5) {
      lastCounts = t;
      const s = w.soldiers, alive = [0, 0], fight = [0, 0];
      for (let i = 0; i < s.count; i++) if (s.alive[i]) { alive[s.side[i]]++; fight[s.side[i]] += s.inContact[i]; }
      $('counts').textContent = `병사 ${alive[0]} : ${alive[1]} · 싸우는 중 ${fight[0]} : ${fight[1]}`;
    }
    for (const e of w.moraleLog) {
      const el = document.createElement('div'); el.className = 'toast';
      el.textContent = `${REASON_SIDE[e.side]} ${e.reason} −${e.amount.toFixed(0)}`;
      $('toasts').appendChild(el); toasts.push({ el, until: performance.now() + 4000 });
    }
    w.moraleLog.length = 0;
    for (const n of w.notices) {                              // 금 명령 결과(개발용, casts.js): 끝난 명령마다 한 줄
      if (n.side !== 0 || n.kind !== 'castResult' || shownResults.has(n)) continue;
      shownResults.add(n);
      const el = document.createElement('div'); el.className = 'toast'; el.textContent = resultText(n, w.rules);
      $('toasts').appendChild(el); toasts.push({ el, until: performance.now() + RESULT_TOAST_MS });
    }
    const now = performance.now();
    while (toasts.length && toasts[0].until < now) toasts.shift().el.remove();
    if (w.result) {
      $('result').style.display = 'flex';
      const r = w.result;
      const who = r.winner === null ? '무승부' : r.winner === 0 ? '승리' : '패배';
      const why = r.reason === 'hq' ? '본진 함락' : r.reason === 'draw' ? '양쪽 사기가 같이 꺾임' : '사기 붕괴';
      $('result-text').textContent = `${who} — ${why} (${mm}분 ${ss}초)`;
    }
  }
  return { update, setKnobs, root, openBuild, closeBuild, toast };
}
