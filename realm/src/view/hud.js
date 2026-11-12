// 화면 위 판: 자원·인구·시간·승점, 알림, 작은 지도, 고른 것, 명령 카드, 도움말, 끝 화면.
import { UNITS, BUILDINGS, RESEARCH, RES_NAME } from '../sim/rules.js';
import { TEAM } from './models.js';

const ARMOR = { light: '가벼운 갑옷', heavy: '무거운 갑옷', large: '큰 몸', building: '건물' };
const KIND = { blade: '베기', pierce: '찌르기(큰 것 ×2.5)', arrow: '화살(가벼운 것 ×1.4, 무거운 것 ×0.5)', magic: '마법(무거운 것 ×1.6)', siege: '공성(건물 ×3)', crush: '부수기(건물 ×1.5)' };
export const DESC = {
  worker: '건물을 짓고 고친다. 자원 자리를 오른쪽 클릭하면 채굴기를 짓는다.',
  sword: '튼튼한 보병. 무거운 갑옷이라 화살에 강하다. 창병을 이긴다.',
  spear: '큰 것(기병·그리폰·용·투석기)에 2.5배. 검사에 약하다.',
  archer: '멀리 쏜다. 가벼운 것에 강하고 날짐승을 맞힌다. 검사엔 약하다.',
  scout: '가장 빠르고 넓게 본다. 궁수·마법사·일꾼·투석기 사냥. 창병에 약하다.',
  knight: '15 m 달린 뒤 첫 일격이 3배. 궁수·마법사를 덮친다. 창병에 약하다.',
  mage: '범위 불덩이. 무거운 갑옷(검사·골렘)에 1.6배. 몸이 약하다.',
  priest: '다친 아군을 고친다(초마다 9).',
  catapult: '55 m 공성. 건물에 3배, 범위 피해. 12 m 안은 못 쏜다.',
  golem: '아주 튼튼하다. 화살에 강하다. 마법에 약하다.',
  griffon: '날짐승: 땅 근접 공격에 안 맞는다. 일꾼·투석기 사냥. 궁수·탑에 약하다.',
  dragon: '날짐승. 범위 불길. 아주 비싸고 아주 세다.',
  wolf: '소굴을 지키는 늑대. 빠르다.', goblin: '활을 쏘는 고블린.', troll: '트롤: 튼튼하고 상처가 저절로 낫는다.',
  goldmine: '금 자리 위. 금 +2.5/초 — 성채와 이어진 땅일 때만.', lumbermill: '숲 자리 위. 목재 +1.5/초.', manawell: '마나 자리 위. 마나 +1.5/초.',
  barracks: '검사·창병·궁수.', stable: '정찰 기병. 기사 서임 연구 뒤 기사.', magetower: '화염 마법사·사제.', workshop: '투석기. 골렘 각성 연구 뒤 골렘.',
  aerie: '그리폰. 용의 알 연구 뒤 용.', tower: '화살을 쏘고 넓게 본다.', citadel: '본진. 일꾼을 뽑고 화살을 쏜다. 무너지면 진다.',
  fort: '지역의 요새. 땅 주인 편으로 화살을 쏜다. 무너져도 일꾼이 고치면 다시 쏜다.',
  knighthood: '마구간에서 기사를 뽑을 수 있다.', golemcraft: '공방에서 골렘을 뽑을 수 있다.', dragonegg: '둥지에서 용을 뽑을 수 있다.',
};
const costHtml = t => ['gold', 'wood', 'mana'].filter(k => t[k]).map(k => `<span class="r-${k}">${RES_NAME[k]} ${t[k]}</span>`).join(' ');
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font:13px/1.35 system-ui,"Malgun Gothic",sans-serif;color:#f4efe2}
#hud .panel{background:rgba(24,26,30,.82);border:1px solid rgba(255,255,255,.12);border-radius:8px;pointer-events:auto}
#top{position:absolute;top:8px;left:8px;right:8px;display:flex;gap:14px;align-items:center;padding:6px 12px;flex-wrap:wrap}
#top b{font-weight:700}
.r-gold{color:#ffd34d}.r-wood{color:#d9a06a}.r-mana{color:#7fe6ff}
#top .pts{display:flex;align-items:center;gap:6px}
#top .bar{width:90px;height:8px;background:#444;border-radius:4px;overflow:hidden}
#top .bar i{display:block;height:100%}
#top .sp{margin-left:auto;display:flex;gap:4px}
#hud button{font:inherit;color:#f4efe2;background:#3a3d44;border:1px solid #5a5d66;border-radius:6px;padding:3px 8px;cursor:pointer}
#hud button:hover{background:#4a4e57}#hud button.on{background:#2f6fd6;border-color:#5a8fe6}
#alerts{position:absolute;top:52px;left:8px;display:flex;flex-direction:column;gap:4px;max-width:340px}
#alerts div{padding:4px 10px;cursor:pointer}
#mini{position:absolute;left:8px;bottom:8px;padding:6px}
#mini canvas{display:block;width:184px;height:184px;cursor:crosshair}
#mini .row{display:flex;gap:4px;margin-top:5px}
#sel{position:absolute;left:206px;bottom:8px;right:392px;min-height:80px;max-height:196px;overflow:auto;padding:8px 12px}
#sel h3{margin:0 0 4px;font-size:15px}
#sel .chips{display:flex;flex-wrap:wrap;gap:4px}
#sel .chip{padding:2px 8px;border-radius:5px;background:#3a3d44;cursor:pointer}
#sel .q{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
#sel .q span{background:#3a3d44;border-radius:5px;padding:2px 6px;cursor:pointer}
#sel .dim{color:#b8b2a2}
#card{position:absolute;right:8px;bottom:8px;width:372px;padding:6px;display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
#card button{height:52px;padding:2px 4px;display:flex;flex-direction:column;justify-content:center;align-items:center;line-height:1.15}
#card button small{font-size:10px;opacity:.85}
#card button:disabled{opacity:.42;cursor:default}
#card .hk{position:absolute;margin:-30px 0 0 -62px;font-size:10px;color:#ffd34d}
#tip{position:absolute;right:8px;bottom:136px;width:360px;padding:8px 10px;display:none}
#toast{position:absolute;left:50%;top:60px;transform:translateX(-50%);padding:6px 14px;display:none}
#help,#result{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);pointer-events:auto}
#help .panel,#result .panel{max-width:620px;padding:18px 22px}
#help h2,#result h2{margin:0 0 8px}
#help li{margin:2px 0}
@media (max-width: 900px){#sel{display:none}#card{width:300px}}
`;

export function createHud({ getWorld, side, input, view, onSpeed, onPause, onRestart, fog }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'hud';
  root.innerHTML = `
    <div id="top" class="panel"></div>
    <div id="alerts"></div>
    <div id="mini" class="panel"><canvas width="368" height="368"></canvas><div class="row"><button id="idleBtn">노는 일꾼</button><button id="armyBtn">군대 전부</button></div></div>
    <div id="sel" class="panel"></div>
    <div id="card" class="panel"></div>
    <div id="tip" class="panel"></div>
    <div id="toast" class="panel"></div>
    <div id="help"><div class="panel">
      <h2>영지 전쟁 — 조작</h2>
      <ul>
        <li><b>왼쪽 클릭·끌기</b>: 고르기 (Shift = 더하기, 두 번 클릭 = 화면 안 같은 병종)</li>
        <li><b>오른쪽 클릭</b>: 이동 · 적이면 공격 · 짓는 건물이면 돕기 · 자원 자리면 채굴기 · 건물을 골랐으면 집결지</li>
        <li><b>A</b> 공격 이동 · <b>S</b> 멈춤 · <b>H</b> 제자리 · 일꾼은 <b>B</b> 짓기 메뉴 → 단축키 → 클릭으로 놓기(Shift = 이어서)</li>
        <li>건물을 고르면 <b>Q W E</b> 생산 · <b>R</b> 연구 · <b>C</b> 취소</li>
        <li><b>Ctrl+숫자</b> 부대 묶기 · <b>숫자</b> 부르기(두 번 = 카메라) · <b>\`</b> 노는 일꾼 · <b>F2</b> 군대 전부 · <b>Space</b> 마지막 알림</li>
        <li>카메라: 화살표 · 화면 끝 · 가운데 끌기 · 휠 · 작은 지도 클릭(오른쪽 = 보내기) · <b>P</b> 멈춤</li>
      </ul>
      <h2>규칙</h2>
      <ul>
        <li>깃발 가까이에 병력만 있으면 땅을 잡는다(우리 땅과 이웃한 곳만). 적 땅은 먼저 중립으로 깎는다 — 그 땅 채굴기는 무너진다.</li>
        <li>채굴기는 성채와 <b>이어진</b> 땅에서만 수입을 낸다. 가운데를 끊으면 뒤가 말라붙는다.</li>
        <li>마을 = 인구 +30, 요새 = 화살 쏘는 거점, 제단 = 더 많이 쥔 편이 상대 승점을 깎는다. 빈 땅은 괴물이 지킨다(잡으면 금).</li>
        <li>이기기: 적 성채를 부수거나 적 승점을 0으로.</li>
      </ul>
      <button id="helpClose">닫기 (Esc)</button></div></div>
    <div id="result"><div class="panel"><h2></h2><p></p><button id="again">다시 하기</button></div></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const top = $('#top'), alerts = $('#alerts'), selEl = $('#sel'), cardEl = $('#card'), tip = $('#tip'), toastEl = $('#toast'), help = $('#help'), result = $('#result');
  const mini = $('#mini canvas'), mg = mini.getContext('2d');
  let speed = 1, paused = false, toastUntil = 0, cardSig = '', selSig = '', lastTop = 0, shownAlerts = 0;
  const showHelp = v => { help.style.display = v ? 'flex' : 'none'; };
  $('#helpClose').onclick = () => showHelp(false);
  $('#again').onclick = onRestart;
  $('#idleBtn').onclick = () => input.idleWorker();
  $('#armyBtn').onclick = () => input.select(getWorld().units.filter(u => u.side === side && !u.t.worker));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && help.style.display === 'flex') showHelp(false);
    if (e.key === 'p' || e.key === 'P') { paused = !paused; onPause(paused); }
    if (e.key === 'F1') { e.preventDefault(); showHelp(help.style.display !== 'flex'); }
  });

  function toast(t) { toastEl.textContent = t; toastEl.style.display = 'block'; toastUntil = performance.now() + 2200; }

  // 작은 지도: 앞(카메라 yaw)이 위로 오게 돌린다
  const MS = 368;
  function miniXf() {
    const th = view.cam.yaw, s = MS / (640 * (Math.abs(Math.cos(th)) + Math.abs(Math.sin(th)))) * 0.98;
    return { th, s, sin: Math.sin(th), cos: Math.cos(th) };
  }
  function toMini(x, z, X = miniXf()) {
    const rx = x - 320, rz = z - 320;
    return [MS / 2 + X.s * (rx * X.sin - rz * X.cos), MS / 2 - X.s * (rx * X.cos + rz * X.sin)];
  }
  function fromMini(px, py, X = miniXf()) {
    const u = (px - MS / 2) / X.s, v = -(py - MS / 2) / X.s;
    return { x: 320 + u * X.sin + v * X.cos, z: 320 - u * X.cos + v * X.sin };
  }
  const regionImg = document.createElement('canvas');
  let regionKey = '';
  function drawMini(w) {
    const X = miniXf(), map = w.map;
    const key = w.regions.map(r => r.owner).join(',') + '|' + (fog ? w.visionAt : 0);
    if (key !== regionKey) {
      regionKey = key;
      regionImg.width = map.cols; regionImg.height = map.rows;
      const ig = regionImg.getContext('2d'), img = ig.createImageData(map.cols, map.rows);
      const vc = w.vision.cols, vcell = w.rules.map.visionCell;
      for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
        const i = r * map.cols + c, t = map.terrain[i], own = w.regions[map.regionOf[i]].owner;
        let col = t === 1 ? [120, 115, 100] : t === 2 ? [70, 120, 170] : own === 0 ? [70, 110, 170] : own === 1 ? [170, 80, 70] : [110, 140, 90];
        const edge = c + 1 < map.cols && map.regionOf[i + 1] !== map.regionOf[i] || r + 1 < map.rows && map.regionOf[i + map.cols] !== map.regionOf[i];
        if (edge) col = col.map(v => v * 0.6);
        if (fog) { const vi = Math.floor(r * map.cell / vcell) * vc + Math.floor(c * map.cell / vcell); const m = w.vision[side].visible[vi] ? 1 : w.vision[side].explored[vi] ? 0.65 : 0.35; col = col.map(v => v * m); }
        img.data.set([col[0], col[1], col[2], 255], i * 4);
      }
      ig.putImageData(img, 0, 0);
    }
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.fillStyle = '#15171a'; mg.fillRect(0, 0, MS, MS);
    const k = map.cell * X.s;
    mg.setTransform(k * X.sin, -k * X.cos, -k * X.cos, -k * X.sin, MS / 2 + X.s * 320 * (X.cos - X.sin), MS / 2 + X.s * 320 * (X.cos + X.sin));
    mg.imageSmoothingEnabled = false;
    mg.drawImage(regionImg, 0, 0);
    mg.setTransform(1, 0, 0, 1, 0, 0);
    // 지역 깃발(역할)
    map.regions.forEach(rg => {
      const [px, py] = toMini(rg.x, rg.z, X);
      mg.fillStyle = rg.altar ? '#ffe08a' : rg.village ? '#f0f0f0' : rg.fort ? '#c0c0c0' : 'rgba(0,0,0,0)';
      if (rg.altar || rg.village || rg.fort) { mg.beginPath(); mg.arc(px, py, rg.altar ? 6 : 4.5, 0, Math.PI * 2); mg.fill(); mg.strokeStyle = '#222'; mg.stroke(); }
    });
    for (const b of w.buildings) {
      if (b.side !== side && fog && !w.sides[side].seen.has(b.id)) continue;
      const [px, py] = toMini(b.x, b.z, X), s = b.type === 'citadel' ? 9 : 5;
      mg.fillStyle = b.side === 2 ? '#bbb' : b.side === side ? '#9cc4ff' : '#ff9c8c'; mg.fillRect(px - s / 2, py - s / 2, s, s);
    }
    for (const u of w.units) {
      if (u.side !== side && fog && !canSee(w, side, u.x, u.z)) continue;
      const [px, py] = toMini(u.x, u.z, X);
      mg.fillStyle = u.side === 2 ? '#d8c890' : u.side === side ? '#4da3ff' : '#ff5a4a';
      mg.fillRect(px - 2, py - 2, 4, 4);
    }
    const fp = view.footprint();
    if (fp.length === 4) { mg.strokeStyle = '#fff'; mg.lineWidth = 1.5; mg.beginPath(); fp.forEach((p, i) => { const [px, py] = toMini(p.x, p.z, X); if (i) mg.lineTo(px, py); else mg.moveTo(px, py); }); mg.closePath(); mg.stroke(); }
    const now = w.time;
    for (const a of w.sides[side].alerts) if (a.kind === 'attacked' && now - a.time < 4 && a.x !== undefined) { const [px, py] = toMini(a.x, a.z, X); mg.strokeStyle = '#ff3b30'; mg.lineWidth = 2; mg.beginPath(); mg.arc(px, py, 6 + (now - a.time) * 4, 0, Math.PI * 2); mg.stroke(); }
  }
  let miniDown = false;
  const miniAt = e => { const r = mini.getBoundingClientRect(); return fromMini((e.clientX - r.left) / r.width * MS, (e.clientY - r.top) / r.height * MS); };
  mini.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('pointerdown', e => { const p = miniAt(e); if (e.button === 2) { input.minimapOrder(p.x, p.z); view.markMove(p.x, p.z); return; } miniDown = true; mini.setPointerCapture(e.pointerId); view.cam.tx = p.x; view.cam.tz = p.z; });
  mini.addEventListener('pointermove', e => { if (miniDown) { const p = miniAt(e); view.cam.tx = p.x; view.cam.tz = p.z; } });
  mini.addEventListener('pointerup', () => { miniDown = false; });

  function drawTop(w) {
    const S = w.sides[side], E = w.sides[1 - side];
    const alt = [0, 0];
    w.map.regions.forEach((rg, g) => { if (rg.altar && w.regions[g].owner >= 0) alt[w.regions[g].owner]++; });
    const res = k => `<span class="r-${k}"><b>${RES_NAME[k]} ${Math.floor(S[k])}</b> <small>+${S.rate[k].toFixed(1)}</small></span>`;
    const pct = p => `${(p / w.rules.victory.points * 100).toFixed(0)}%`;
    top.innerHTML = `${res('gold')}${res('wood')}${res('mana')}<span><b>인구 ${S.pop}/${S.popCap}</b></span><span>⏱ ${mmss(w.time)}</span>
      <span class="pts">승점 우리 <span class="bar"><i style="width:${pct(S.points)};background:#${TEAM[side].toString(16).padStart(6, '0')}"></i></span>${Math.ceil(S.points)}
      · 적 <span class="bar"><i style="width:${pct(E.points)};background:#${TEAM[1 - side].toString(16).padStart(6, '0')}"></i></span>${Math.ceil(E.points)}</span>
      <span>제단 ${alt[side]} : ${alt[1 - side]}</span>
      <span class="sp">${[0.5, 1, 2, 4].map(v => `<button data-sp="${v}" class="${v === speed ? 'on' : ''}">${v === 0.5 ? '½' : v}×</button>`).join('')}<button data-pause="1" class="${paused ? 'on' : ''}">❚❚</button><button data-help="1">도움말 F1</button></span>`;
  }
  top.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sp) { speed = Number(b.dataset.sp); onSpeed(speed); }
    if (b.dataset.pause) { paused = !paused; onPause(paused); }
    if (b.dataset.help) showHelp(true);
  });

  function drawAlerts(w) {
    const list = w.sides[side].alerts.filter(a => w.time - a.time < 8).slice(-5);
    const sig = list.map(a => a.time).join(',');
    if (sig === alerts.dataset.sig) return;
    alerts.dataset.sig = sig;
    alerts.innerHTML = list.map((a, i) => `<div class="panel" data-i="${i}" style="color:${a.kind === 'attacked' || a.kind === 'lost' ? '#ff9c8c' : a.kind === 'pop' ? '#ffd34d' : '#d8f0d0'}">${a.text}</div>`).join('');
    alerts.querySelectorAll('div').forEach((d, i) => { d.onclick = () => { const a = list[i]; if (a.x !== undefined) { view.cam.tx = a.x; view.cam.tz = a.z; } }; });
  }

  function drawSel(w) {
    const I = input.info(), es = I.es;
    let html = '', sig = '';
    if (!es.length) { sig = 'none'; html = `<h3>아무것도 고르지 않음</h3><div class="dim">일꾼을 골라 <b>B</b>로 짓기, 자원 자리를 오른쪽 클릭하면 채굴기. 병영에서 병력을 뽑아 이웃 땅의 괴물을 치우고 깃발을 잡으세요. <b>F1</b> 도움말.</div>`; }
    else if (es.length === 1) {
      const e = es[0], t = e.t, mineSide = e.side === side;
      if (e.ent === 'unit') {
        sig = `u${e.id}|${Math.ceil(e.hp)}|${e.order.kind}`;
        html = `<h3>${t.name} <span class="dim">${e.side === 2 ? '중립 괴물' : mineSide ? '' : '적'}</span></h3>
          <div>체력 ${Math.ceil(e.hp)} / ${e.maxHp} · ${ARMOR[t.armor]} · ${t.dmg ? KIND[t.kind] : '공격 없음'}${t.dmg ? ` · 사거리 ${t.range} m` : ''} · 빠르기 ${t.speed}${t.fly ? ' · 날짐승' : ''}</div>
          <div class="dim">${DESC[e.type] ?? ''}</div>`;
      } else {
        const q = mineSide ? e.queue.map((it, k) => `<span data-q="${k}" title="클릭 = 취소">${it.kind === 'unit' ? UNITS[it.key].name : RESEARCH[it.key].name}${k === 0 ? ` ${Math.round((1 - it.left / it.total) * 100)}%` : ''}</span>`).join('') : '';
        const state = !e.done ? `짓는 중 ${Math.round(e.progress * 100)}%` : e.ruined ? '무너짐 — 일꾼으로 고치면 다시 쏜다' : e.dormant ? '비어 있음 — 땅을 잡으면 우리 것' : '';
        let extra = '';
        if (e.deposit >= 0) { const st = w.regions[w.map.deposits[e.deposit].region]; if (!(st.owner === e.side && st.connected[e.side])) extra = '<div style="color:#ff9c8c">성채와 끊긴 땅 — 수입 없음</div>'; }
        sig = `b${e.id}|${Math.ceil(e.hp)}|${state}|${q}|${extra}`;
        html = `<h3>${t.name} <span class="dim">${e.side === 2 ? '중립' : mineSide ? '' : '적'}</span></h3>
          <div>체력 ${Math.ceil(e.hp)} / ${e.maxHp}${state ? ' · ' + state : ''}${e.rally ? ' · 집결지 있음' : t.trains ? ' · 오른쪽 클릭 = 집결지' : ''}</div>${extra}
          <div class="dim">${DESC[e.type] ?? ''}</div>${q ? `<div class="q">${q}</div>` : ''}`;
      }
    } else {
      const byType = {};
      for (const e of es) byType[e.type] = (byType[e.type] ?? 0) + 1;
      sig = 'm' + Object.entries(byType).map(([k, v]) => k + v).join(',');
      html = `<h3>${es.length}명</h3><div class="chips">${Object.entries(byType).map(([k, v]) => `<span class="chip" data-t="${k}">${UNITS[k]?.name ?? k} ×${v}</span>`).join('')}</div><div class="dim" style="margin-top:4px">이름을 누르면 그 병종만</div>`;
    }
    if (sig === selSig) return;
    selSig = sig;
    selEl.innerHTML = html;
    selEl.querySelectorAll('[data-q]').forEach(s => { s.onclick = () => { const b = I.building; if (b) input.cmd?.({ kind: 'cancel', building: b.id, index: Number(s.dataset.q) }); }; });
    selEl.querySelectorAll('[data-t]').forEach(s => { s.onclick = () => input.select(es.filter(e => e.type === s.dataset.t)); });
  }

  function drawCard(w) {
    const btns = input.cardButtons();
    const sig = input.card() + '|' + btns.map(b => b.key + b.label + b.sub + b.enabled).join(',');
    if (sig === cardSig) return;
    cardSig = sig;
    cardEl.innerHTML = '';
    for (const b of btns) {
      const el = document.createElement('button');
      el.innerHTML = `${b.label}<small>${b.sub ?? ''}</small><small style="color:#ffd34d">${b.key === 'Escape' ? 'Esc' : b.key}</small>`;
      if (b.enabled === false) el.disabled = true;
      el.onclick = () => b.run();
      const descKey = b.info ?? b.building ?? b.research;
      el.onmouseenter = () => {
        const t = b.info ? UNITS[b.info] : b.building ? BUILDINGS[b.building] : b.research ? RESEARCH[b.research] : null;
        tip.innerHTML = `<b>${b.label}</b> ${t ? costHtml(t) : ''}${b.info ? ` · 인구 ${UNITS[b.info].pop} · ${UNITS[b.info].time}초` : ''}<div class="dim">${DESC[descKey] ?? b.sub ?? ''}</div>${b.why ? `<div style="color:#ff9c8c">${b.why}</div>` : ''}`;
        tip.style.display = 'block';
      };
      el.onmouseleave = () => { tip.style.display = 'none'; };
      cardEl.appendChild(el);
    }
    if (!btns.length) tip.style.display = 'none';
  }

  function update(w) {
    const now = performance.now();
    if (now - lastTop > 120) { lastTop = now; drawTop(w); drawAlerts(w); drawSel(w); }
    drawCard(w);
    drawMini(w);
    if (toastUntil && now > toastUntil) { toastEl.style.display = 'none'; toastUntil = 0; }
    const g = input.ghost();
    if (g && !g.ok && g.why) { if (toastEl.dataset.ghost !== g.why) { toastEl.textContent = g.why; toastEl.dataset.ghost = g.why; } toastEl.style.display = 'block'; toastUntil = now + 200; }
    else toastEl.dataset.ghost = '';
    if (w.result && result.style.display !== 'flex') {
      const win = w.result.winner === side;
      result.querySelector('h2').textContent = win ? '승리' : '패배';
      result.querySelector('p').textContent = `${mmss(w.result.time)} · ${w.result.reason === 'citadel' ? (win ? '적 성채를 무너뜨렸습니다' : '우리 성채가 무너졌습니다') : (win ? '적 승점이 바닥났습니다' : '우리 승점이 바닥났습니다')}`;
      result.style.display = 'flex';
    }
  }
  return { update, toast, root, showHelp };
}
function canSee(w, side, x, z) {
  const vcell = w.rules.map.visionCell, cols = w.vision.cols, c = Math.floor(x / vcell), r = Math.floor(z / vcell);
  return c >= 0 && r >= 0 && c < cols && r < cols && w.vision[side].visible[r * cols + c] === 1;
}
