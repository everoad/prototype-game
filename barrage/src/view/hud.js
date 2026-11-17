// 겹 화면(2D 캔버스, §7): 보스 체력(깎인 꼬리)·무력화·단계, 플레이어 체력·회피 충전 점, 시간, 멈춤·결과, F1 판정 보기.
// 녹화는 이 캔버스를 WebGL 화면 위에 합쳐 찍는다. 가장자리 연출(Task 14)도 이 캔버스에 그린다(ctx).
import { BASE_TRIES, tryKey } from '../sim/tries.js';
import { CARDS, GROUPS, kitCards, kitAll } from '../sim/cards.js';
import { guide } from './guide.js';
import { isSword, slashLanding } from '../sim/sword.js';
import { BUILD } from './version.js';

// 결과 화면 밝기: 승리·패배 순간에서 since초 — 늦게(큰 순간을 먼저 보여 주고) 서서히 뜬다
export function resultAlpha(result, since, R) {
  if (!result) return 0;
  const delay = result === 'win' ? R.winDelay : R.loseDelay;
  return Math.max(0, Math.min(1, (since - delay) / R.fade));
}

export function createHud(canvas, LOOK) {
  const ctx = canvas.getContext('2d'), C = LOOK.colors;
  let dpr = 1, W = 0, H = 0;
  const st = { trail: 1, trailHold: 0, lastHp: 1, pipShakeAt: -1e9, staggerFlashAt: -1e9, bars: false, barsAt: -1e9, stockShake: { shield: -1e9, bomb: -1e9, skill: -1e9, store: -1e9 }, banner: null, fadeAt: -1e9, fadeSec: 0, gains: [], blink: null };
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  const font = (px, bold = false) => `${bold ? '700 ' : ''}${px}px system-ui, "Malgun Gothic", sans-serif`;
  function bar(x, y, w, h, v, color, back = C.hpBack) {
    ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
  }
  const mmss = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

  function draw(w, ui) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const b = w.boss, p = w.player, now = ui.now;
    const away = !!b.away, S = w.stage;   // 일반 방(스테이지): 보스 막대 대신 방 번호와 남은 적
    if (S) stageLayer(w, ui);
    // 보스 체력 + 깎인 꼬리(잠깐 남았다 줄어듦)
    const hp = away ? 1 : b.hp / b.maxHp;
    if (hp < st.lastHp) st.trailHold = now + 0.4;
    st.lastHp = hp;
    if (now > st.trailHold) st.trail = Math.max(hp, st.trail - 0.6 * (ui.dt ?? 0.016));
    if (st.trail < hp) st.trail = hp;
    const bw = Math.min(720, W * 0.5), bx = (W - bw) / 2, by = 22;
    if (away) {
      const left = w.enemies.reduce((n, m) => n + (m.dead ? 0 : 1), 0);
      ctx.textAlign = 'center'; ctx.font = font(18, true); ctx.fillStyle = C.text; ctx.fillText(`방 ${S.room + 1} / ${S.of}`, W / 2, by + 12);
      ctx.font = font(13); ctx.fillStyle = C.textDim; ctx.fillText(S.phase === 'fight' ? (S.surviveUntil != null ? `버티기 ${Math.max(0, S.surviveUntil - w.time).toFixed(0)}초` : `남은 적 ${left}`) : S.phase === 'reward' ? '하나를 골라 그 위에 서세요' : S.phase === 'replace' ? `칸이 찼습니다 — 버릴 카드 위에 서세요(새 카드: ${LOOK.names.card[S.pending.id]})` : '문으로 →', W / 2, by + 32);
    } else {
    bar(bx, by, bw, 14, st.trail, C.hpTrail);
    ctx.fillStyle = C.hp; ctx.fillRect(bx, by, bw * hp, 14);
    // 무력화(80%부터 맥동)
    const sv = b.stagger / w.rules.stagger.max, pulse = sv >= 0.8 ? 0.6 + 0.4 * Math.sin(now * 14) : 1;
    ctx.globalAlpha = pulse; bar(bx, by + 18, bw, 6, sv, C.stagger); ctx.globalAlpha = 1;
    if (now - st.staggerFlashAt < 0.18) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(bx, by + 18, bw * sv, 6); }
    ctx.font = font(13, true); ctx.fillStyle = C.text; ctx.textAlign = 'left';
    ctx.fillText(ui.lab ? `연습: ${ui.lab}` : `${b.phase ?? 1}단계`, bx + bw + 10, by + 12);
    if (S) { ctx.textAlign = 'right'; ctx.fillStyle = C.textDim; ctx.fillText(`방 ${S.room + 1} / ${S.of}`, bx - 10, by + 12); ctx.textAlign = 'left'; }
    }
    // 플레이어 체력 + 회피 충전 점
    const px = 24, py = H - 34;
    ctx.font = font(12); ctx.fillStyle = C.textDim; ctx.fillText('체력', px, py - 6);
    bar(px, py, 220, 12, p.hp / w.rules.player.hp, C.playerHp);
    const shake = now - st.pipShakeAt < 0.2 ? Math.sin((now - st.pipShakeAt) * 80) * 3 : 0;
    for (let k = 0; k < (p.dodge.max ?? w.rules.dodge.charges); k++) {
      ctx.beginPath(); ctx.arc(px + 240 + k * 18 + shake, py + 6, 6, 0, Math.PI * 2);
      ctx.fillStyle = k < p.dodge.charges ? C.pip : C.pipEmpty; ctx.fill();
    }
    // 보조 무기(§4.10): 숫자 1~4 = 켜고 끄기(시험용), 켠 것은 청록
    if (w.weapons && !isSword(w)) {   // 검사는 무기가 없다 — 이 줄을 그리지 않는다
      const names = { missile: '미사일', burst: '산탄', beam: '빔', drone: '드론' };
      ctx.font = font(12, true); ctx.textAlign = 'left';
      let gx = px;
      if (!w.kit) ['missile', 'burst', 'beam', 'drone'].forEach((g, k) => {   // 스테이지는 낀 것 HUD(오른쪽 아래)가 무기를 보여 준다
        const label = `${k + 1} ${names[g]}`;
        ctx.fillStyle = w.weapons.on.includes(g) ? C.cyan : C.textDim; ctx.fillText(label, gx, py - 24);
        gx += ctx.measureText(label).width + 10;
      });
      // 가동(패링 뒤 남은 시간)·스킬 게이지(패링 +1, 완벽 +2)·스킬 키(쓸 수 있으면 밝게)
      const WR = w.rules.weapons, left = Math.max(0, w.weapons.chargeUntil - w.time);
      ctx.fillStyle = left > 0 ? C.cyan : C.textDim; const hot = !!w.tries && !!w.tries.on.always;   // 늘 나가는 무기(실험): 가동 = 과열
      ctx.fillText(left > 0 ? (hot ? '과열' : '가동') : hot ? '패링하면 과열' : '패링하면 가동', gx + 6, py - 24);
      if (left > 0) bar(gx + 40, py - 32, 60, 6, left / WR.charge.perfectSec, C.cyan);
      const sk = now - st.stockShake.skill < 0.2 ? Math.sin((now - st.stockShake.skill) * 80) * 3 : 0;
      for (let k = 0; k < WR.skill.max && !w.opts.store; k++) {
        ctx.beginPath(); ctx.arc(px + 6 + k * 14 + sk, py - 44, 5, 0, Math.PI * 2);
        ctx.fillStyle = k < w.weapons.gauge ? C.cyan : C.pipEmpty; ctx.fill();
      }
      let sx2 = px + 6 + WR.skill.max * 14 + 8;
      for (const [key, g, name] of w.opts.store ? [] : [['U', 'missile', '일제 사격'], ['I', 'beam', '굵은 빔'], ['O', 'drone', '드론 연사']]) {
        const ok = w.weapons.on.includes(g) && w.weapons.gauge >= WR.skill.cost, label = `${key} ${name}`;
        ctx.fillStyle = ok ? C.cyan : C.textDim; ctx.fillText(label, sx2, py - 40); sx2 += ctx.measureText(label).width + 10;
      }
    }
    // 모아 던지기(§4.11): 모은 칸 + U 던지기(모은 것이 있으면 밝게, 가득이면 맥동)
    if (w.opts.store) {
      const cap = p.storeCap ?? w.rules.store.cap, n = p.store.length, full = n >= cap;
      const sk = now - st.stockShake.store < 0.2 ? Math.sin((now - st.stockShake.store) * 80) * 3 : 0;
      for (let k = 0; k < cap; k++) {
        ctx.beginPath(); ctx.arc(px + 8 + k * 18 + sk, py - 46, full ? 6.5 + Math.sin(now * 16) : 6, 0, Math.PI * 2);
        ctx.fillStyle = k < n ? C.cyan : C.pipEmpty; ctx.fill();
      }
      if (isSword(w) && n < cap && p.blade.charge > 0) {   // 검사: 칼바람이 채우는 칸 — 다음 빈 칸이 시계 방향으로 찬다
        const cx = px + 8 + n * 18 + sk, cy = py - 46;
        ctx.globalAlpha = LOOK.sword.chargeAlpha; ctx.fillStyle = C.cyan;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 6, -Math.PI / 2, -Math.PI / 2 + Math.min(1, p.blade.charge) * Math.PI * 2); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.font = font(13, true); ctx.textAlign = 'left';
      const low = p.hp > 0 && p.hp <= w.rules.player.hp * LOOK.feel.lowHp.at && n > 0;   // 체력 위태 + 모은 것 있음 = 던져서 회복하라고 깜빡
      ctx.fillStyle = low ? (Math.floor(now * 6) % 2 ? C.heal : C.text) : n > 0 ? C.cyan : C.textDim;
      if (isSword(w)) {   // 검사: 스킬 셋 — 지금 누르면 나가는 것만 밝다(칸이 없으면 셋 다 어둡고, 일섬은 닿는 거리 밖이면 어둡다)
        const N = LOOK.sword.names, reach = n > 0 && !!slashLanding(w), lit = low ? (Math.floor(now * 6) % 2 ? C.heal : C.text) : C.cyan;
        let tx = px + 8 + cap * 18 + 6 + sk;
        for (const [label, ok] of [[`U ${N.slash}`, reach], [`I ${N.spin}`, n > 0], [`O ${N.finish}`, n > 0]]) {
          ctx.fillStyle = ok ? lit : C.textDim; ctx.fillText(label, tx, py - 41); tx += ctx.measureText(label).width + 14;
        }
        if (p.swords) {   // 이기어검: 검 묶음 셋(바탕은 늘 켜져 있다) — 스킬 묶음은 남은 시간만큼 밑줄이 줄어든다
          const H = LOOK.sword.swords.hud, keep = w.rules.sword.swords.keep, y = py - 46;
          for (let i = 0; i < Math.round(w.rules.sword.swords.max / w.rules.sword.swords.n); i++) {
            const b = i === 0 ? null : p.swords.batches[i - 1], x = tx + 6 + i * H.gap;
            ctx.fillStyle = i === 0 || b ? C.cyan : C.pipEmpty;
            ctx.beginPath(); ctx.moveTo(x, y - H.h); ctx.lineTo(x + H.w, y); ctx.lineTo(x, y + H.h * 0.45); ctx.lineTo(x - H.w, y); ctx.closePath(); ctx.fill();
            if (b) ctx.fillRect(x - H.w, y + H.h * 0.45 + 3, 2 * H.w * Math.max(0, Math.min(1, (b.until - w.time) / keep)), 2);
          }
        }
      } else ctx.fillText((low ? 'U 던져서 회복!' : full ? 'U 던지기 — 가득!' : 'U 던지기') + (w.tries?.on.snipe ? ' · I 누르고 있기 = 저격(WASD 적 고르기)' : ''), px + 8 + cap * 18 + 6 + sk, py - 41);
    }
    // 방패·폭탄 사용권(§4.9)
    if (p.stock) {
      ctx.font = font(13, true); ctx.textAlign = 'left';
      const sk = what => (now - st.stockShake[what] < 0.2 ? Math.sin((now - st.stockShake[what]) * 80) * 3 : 0);
      ctx.fillStyle = p.stock.shield > 0 ? C.item : C.textDim; ctx.fillText(`Q 방패 ×${p.stock.shield}`, px + 300 + sk('shield'), py + 11);
      ctx.fillStyle = p.stock.bomb > 0 ? C.item : C.textDim; ctx.fillText(`E 폭탄 ×${p.stock.bomb}`, px + 390 + sk('bomb'), py + 11);
    }
    // 반격 기회(과열, §4.6): 남은 시간 금빛 막대(끝나기 전 깜빡)
    const od = p.overdriveUntil - w.time;
    if (od > 0 && (od > LOOK.feel.overdrive.blink || Math.floor(now * 12) % 2 === 0)) {
      ctx.font = font(12, true); ctx.textAlign = 'left'; ctx.fillStyle = C.gold; ctx.fillText('반격! 쏘기 2배', px, py - 62);
      bar(px + 92, py - 70, 110, 7, od / w.rules.counter.overdrive, C.gold);
    }
    // 체력 위태: 화면 가장자리가 붉게 맥동(가장자리만 — 탄을 가리지 않게)
    const L = LOOK.feel.lowHp;
    if (!w.result && p.hp > 0 && p.hp <= w.rules.player.hp * L.at) {
      const a = L.edgeLo + (L.edgeHi - L.edgeLo) * (0.5 + 0.5 * Math.sin(now * Math.PI * 2 / L.beat)), band = Math.min(W, H) * 0.12;
      const red = k => `rgba(255,61,71,${k})`;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, band, 0, 0, 0, band, H], [W, 0, W - band, 0, W - band, 0, band, H], [0, 0, 0, band, 0, 0, W, band], [0, H, 0, H - band, 0, H - band, W, band]]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, red(a)); g.addColorStop(1, red(0));
        ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      }
    }
    // 큰 글자(2단계 등): 커지며 나타났다 사라진다
    if (st.banner) {
      const u = (now - st.banner.at) / st.banner.sec;
      if (u >= 1) st.banner = null;
      else {
        const k = Math.min(1, u / 0.12), size = 30 + 34 * (1 - Math.pow(1 - k, 3));
        ctx.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3;
        ctx.font = font(size, true); ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,9,14,0.85)'; ctx.strokeText(st.banner.text, W / 2, H * 0.3);
        ctx.fillStyle = C.text; ctx.fillText(st.banner.text, W / 2, H * 0.3);
        ctx.globalAlpha = 1;
      }
    }
    // 실험 기믹(?try=): 켠 것의 이름을 왼쪽 위에
    const mine = w.kit ? kitAll(w).map(id => CARDS[id].try).filter(Boolean) : [];   // 카드가 켠 것과 방의 특징은 실험이 아니다(낀 것 HUD·방이 보여 준다)
    const extra = w.tries ? w.tries.names.filter(n => !BASE_TRIES.includes(n) && !mine.includes(n) && n !== S?.feature) : [];   // 기본 판으로 올린 것은 적지 않는다
    if (extra.length) {
      ctx.textAlign = 'left'; ctx.font = font(12, true); ctx.fillStyle = C.cyan; ctx.fillText('실험', 20, 66);
      ctx.font = font(12); ctx.fillStyle = C.textDim;
      extra.forEach((n, k) => ctx.fillText(LOOK.tries.names[n] ?? n, 20, 84 + k * 16));   // 보스 체력 막대 아래부터(겹치지 않게)
    }
    // 방을 넘어갈 때: 어두웠다가 밝아진다
    const fu = (now - st.fadeAt) / (st.fadeSec || 1);
    if (fu >= 0 && fu < 1) { ctx.fillStyle = `rgba(10,9,14,${(1 - fu).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    // 시간
    ctx.font = font(15, true); ctx.fillStyle = C.text; ctx.textAlign = 'right';
    ctx.fillText(mmss(w.time), W - 20, 34);
    ctx.font = font(12); ctx.fillStyle = C.textDim;
    ctx.fillText(w.kit ? `Esc 멈춤(조작 안내) · V 시점 · F4 처음부터${w.result === 'lose' ? ' · R 이 방 다시' : ''}` : `WASD 이동 · J/Shift 패링 · Space 회피 · Q 방패 · E 폭탄 · ${isSword(w) ? 'U 일섬 · I 회전 베기 · O 마무리' : w.opts.store ? 'U 던지기 · I 저격 · 1~4 무기' : 'U/I/O 무기 스킬 · 1~4 무기'} · V 시점 · Esc 멈춤 · F4 다시`, W - 20, H - 18);   // 스테이지는 짧게(낀 것 HUD가 키를 보여 준다)
    if (w.kit) kitBar(w, ui);
    ctx.fillText(`빌드 ${BUILD}${isSword(w) ? ' · 검사' : ''}`, W - 20, ui.bot ? 70 : 54);
    if (ui.bot) ctx.fillText(`봇: ${ui.bot}`, W - 20, 54);
    // F1 판정 보기
    if (ui.debug) debug(w, ui);
    // 멈춤·결과
    if ((w.result && (ui.resultAlpha ?? 1) > 0) || ui.paused) overlay(w, ui);   // 결과는 큰 순간이 지난 뒤 서서히(main이 resultAlpha를 준다)
  }

  // 스테이지: 몬스터 머리 위 체력 막대, 보상 이름, 문 표시(판 좌표 → 화면)
  function stageLayer(w, ui) {
    const M = LOOK.mobs, S = w.stage, now = ui.now;
    if (!ui.project) return;
    for (const m of w.enemies) {
      if (m.dead || w.time < m.bornAt || m.hp >= m.maxHp) continue;
      const s = ui.project(m.x, m.z, M.barY), frac = m.hp / m.maxHp, Lg = LOOK.guns.lag, tr = (st.mobTrail ??= new Map());
      const t = tr.get(m.id) ?? { v: frac, last: frac, hold: 0 };   // 깎인 꼬리: 잠깐 남았다 줄어든다(보스 막대와 같다)
      if (frac < t.last) t.hold = now + Lg.hold;
      t.last = frac;
      if (now > t.hold) t.v = Math.max(frac, t.v - Lg.rate * (ui.dt ?? 0.016));
      if (t.v < frac) t.v = frac;
      tr.set(m.id, t); if (tr.size > Lg.keep) tr.clear();
      bar(s.x - M.barW / 2, s.y, M.barW, M.barH, t.v, C.hpTrail);
      ctx.fillStyle = C.hp; ctx.fillRect(s.x - M.barW / 2, s.y, M.barW * Math.max(0, Math.min(1, frac)), M.barH);
    }
    // 고르는 자리: 이름(가까이 가면 한 줄 설명). 바꿔 끼우는 중 = "버리기: 이름" · "무르기"
    const p = w.player;
    for (const r of S.rewards) {
      const s = ui.project(r.x, r.z, 0), ready = S.phase === 'replace' ? r.armed : w.time >= r.born + w.rules.stage.rewardDelay;
      const card = r.kind === 'card' || r.kind === 'held', name = LOOK.names.card[r.what] ?? LOOK.names.reward[r.what] ?? r.what;
      ctx.globalAlpha = ready ? 1 : 0.45;
      ctx.textAlign = 'center'; ctx.font = font(14, true);
      ctx.fillStyle = r.kind === 'cancel' ? C.textDim : r.kind === 'held' ? C.text : card ? C.cyan : r.kind === 'charge' ? C.item : C.heal;
      const label = r.kind === 'cancel' ? '무르기' : r.kind === 'held' ? `버리기: ${name}` : r.kind === 'heal' ? `체력 +${w.rules.stage.heal}` : card ? `${LOOK.names.group[CARDS[r.what].group]} · ${name}` : name;
      ctx.fillText(label, s.x, s.y + 22);
      if (card && Math.hypot(p.x - r.x, p.z - r.z) <= LOOK.kit.near) { ctx.font = font(12); ctx.fillStyle = C.textDim; ctx.fillText(LOOK.names.cardLine[r.what] ?? '', s.x, s.y + 40); }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center'; ctx.font = font(14, true);
    if (S.door) { const s = ui.project(S.door.x, S.door.z, M.doorH + 0.4); ctx.fillStyle = Math.floor(now * 3) % 2 ? C.door : C.text; ctx.fillText('다음 방', s.x, s.y); }
  }

  // 낀 것 HUD(한 판의 뼈대 §8): 오른쪽 아래에 무기 2칸 · 탄 기술 1칸 · 이동기 2칸 · 몸(낀 만큼). 키가 있는 칸에는 키 글자, 빈 칸은 흐리게.
  // 칸의 자리: 오른쪽 끝에서 왼쪽으로 채워 나간다(몸 카드가 늘면 왼쪽으로 자란다)
  function kitLayout(w) {
    const Kt = LOOK.kit, R = w.rules.cards.slots, out = [];
    const body = kitCards(w, 'body'), sword = isSword(w), counts = { weapon: sword ? 0 : R.weapon, orb: sword ? 0 : R.orb, move: R.move, body: body.length };   // 검사 판에는 무기·탄 기술 칸이 없다
    let x = W - 20;
    for (const g of [...GROUPS].reverse()) {
      const sw = g === 'body' ? Kt.bodyW : Kt.slotW;
      for (let k = counts[g] - 1; k >= 0; k--) { x -= sw; out.push({ group: g, slot: k, x, y: H - Kt.bottom - Kt.slotH, w: sw, h: Kt.slotH }); x -= Kt.gap; }
      if (counts[g] > 0) x -= Kt.groupGap - Kt.gap;
    }
    return out;
  }
  function slotAt(w, group, slot) {
    const s = kitLayout(w).find(c => c.group === group && c.slot === slot);
    return s ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : { x: W - 60, y: H - LOOK.kit.bottom };
  }
  function kitBar(w, ui) {
    const Kt = LOOK.kit, now = ui.now, cells = kitLayout(w), KEY = { orb: 'O', move1: 'K', move2: 'L' };
    const seen = new Set();
    for (const c of cells) {
      const id = kitCards(w, c.group)[c.slot] ?? null, card = id ? CARDS[id] : null;
      const key = card && card.key ? KEY[tryKey(w, card.try)] : c.group === 'orb' ? 'O' : c.group === 'move' ? (c.slot === 0 ? 'K' : 'L') : null;
      const gain = st.gains.find(g => g.group === c.group && g.slot === c.slot), lit = gain ? Math.max(0, 1 - (now - gain.at - Kt.fly) / Kt.flash) : 0;
      const blink = st.blink === c.group && id && Math.floor(now * Kt.blink) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(255,255,255,0.28)' : id ? 'rgba(53,224,208,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      if (gain && now - gain.at >= Kt.fly && lit > 0) { ctx.fillStyle = `rgba(53,224,208,${(0.6 * lit).toFixed(3)})`; ctx.fillRect(c.x, c.y, c.w, c.h); }
      ctx.strokeStyle = id ? C.cyan : C.pipEmpty; ctx.lineWidth = 1; ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      ctx.font = font(12, true); ctx.textAlign = 'left';
      ctx.fillStyle = id ? C.text : C.textDim;
      const usesKey = key && (!card || card.key);
      ctx.fillText(`${usesKey ? key + ' ' : ''}${id ? LOOK.names.card[id] : '—'}`, c.x + 7, c.y + c.h / 2 + 4, c.w - 12);
      if (!seen.has(c.group)) { seen.add(c.group); }
    }
    // 갈래 이름(칸 묶음 위에 작게)
    ctx.font = font(11); ctx.fillStyle = C.textDim; ctx.textAlign = 'left';
    for (const g of GROUPS) { const first = cells.filter(c => c.group === g).sort((a2, b2) => a2.x - b2.x)[0]; if (first) ctx.fillText(LOOK.names.group[g], first.x, first.y - 5); }
    // 주운 카드: 자리에서 칸까지 선이 그어진다
    for (let k = st.gains.length - 1; k >= 0; k--) {
      const g = st.gains[k], u = (now - g.at) / Kt.fly;
      if (now - g.at > Kt.fly + Kt.flash) { st.gains.splice(k, 1); continue; }
      if (u >= 1 || !ui.project) continue;
      const a = ui.project(g.x, g.z, 1), b = slotAt(w, g.group, g.slot), e2 = u * u * (3 - 2 * u), t0 = Math.max(0, e2 - 0.35);
      ctx.strokeStyle = C.cyan; ctx.lineWidth = Kt.lineW; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0); ctx.lineTo(a.x + (b.x - a.x) * e2, a.y + (b.y - a.y) * e2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function debug(w, ui) {
    const p = w.player, b = w.boss, R = w.rules;
    const circle = (x, z, r, color) => {
      ctx.beginPath();
      for (let k = 0; k <= 32; k++) { const a = k / 32 * Math.PI * 2, s = ui.project(x + Math.cos(a) * r, z + Math.sin(a) * r, LOOK.sizes.bh); k ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    };
    circle(p.x, p.z, R.player.hitR, '#ff0');
    circle(p.x, p.z, R.player.parryR, '#0ff');
    circle(p.x, p.z, R.player.grazeR, '#888');
    circle(p.x, p.z, R.player.bodyR, '#fa0');
    circle(b.x, b.z, R.boss.r, '#f0f');
    const bl = w.bullets;
    for (let i = 0; i < bl.cap; i++) if (bl.alive[i]) circle(bl.x[i], bl.z[i], bl.r[i], 'rgba(255,255,0,0.6)');
    ctx.font = font(12); ctx.fillStyle = '#ff0'; ctx.textAlign = 'left';
    const lines = [
      `보스 ${b.state} · 단계 ${b.phase} · 무력화 ${b.stagger.toFixed(0)} · 체력 ${b.hp.toFixed(0)}`,
      `탄 ${bl.live} · 패링 ${w.stats.parries}(완벽 ${w.stats.perfects}) · 맞음 ${w.stats.hits} · 스침 ${w.stats.grazes}`,
      `fps ${ui.fps.toFixed(0)} · 입력→화면 ${ui.lagMs == null ? '-' : ui.lagMs.toFixed(1)} ms · 가장 긴 화면 ${ui.maxFrameMs.toFixed(1)} ms`,
    ];
    lines.forEach((t, k) => ctx.fillText(t, 20, 80 + k * 16));
  }

  function overlay(w, ui) {
    ctx.globalAlpha = w.result && !ui.paused ? (ui.resultAlpha ?? 1) : 1;
    ctx.fillStyle = 'rgba(10,9,14,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = C.text;
    const s = w.stats;
    if (w.result === 'win' && w.stage && ui.grade) {
      // 스테이지를 끝냈다(한 판의 뼈대 §5): 등급을 크게, 시간(최고) · 맞음 · 완벽 · 다시, 그 판에 낀 카드, 새 기록. 차례로 찍힌다
      const G = ui.grade, Rs = LOOK.feel.result, t = ui.resultT ?? 99, best = G.prev?.sec ?? null;
      ctx.font = font(40, true); ctx.fillText(`스테이지 ${w.stage.id} 완료`, W / 2, H / 2 - 96);
      if (t >= Rs.stamp[0]) {   // 등급: 크게 나타나 제 크기로 줄어든다
        const k = Math.min(1, (t - Rs.stamp[0]) / Rs.pop), px = Rs.gradePx * (1.6 - 0.6 * k);
        ctx.font = font(px, true); ctx.fillStyle = G.grade === 'S' ? C.cyan : C.text;
        ctx.fillText(G.grade, W / 2 + 250, H / 2 - 66 + px * 0.2);
        ctx.fillStyle = C.text;
      }
      const perfect = s.parries > 0 ? Math.round(s.perfects / s.parries * 100) : 0;
      ctx.font = font(17);
      ctx.fillText(`시간 ${mmss(w.stage.playSec)}${best != null ? ` (지난 최고 ${mmss(best)})` : ''} · 맞음 ${s.hits} · 완벽 ${perfect}% · 다시 ${w.stage.retries}`, W / 2, H / 2 - 44);
      if (t >= Rs.stamp[1]) {
        const cards = kitAll(w);
        ctx.font = font(14, true); ctx.fillStyle = C.cyan;
        ctx.fillText(cards.length ? cards.map(id => `[${LOOK.names.card[id]}]`).join(' ') : '[카드 없음]', W / 2, H / 2 - 12);
      }
      ctx.font = font(13); ctx.fillStyle = C.textDim;
      ctx.fillText([...w.stage.times.map(x => `방 ${x.room} ${x.sec.toFixed(0)}초`), `보스 ${(w.time - w.stage.startedAt).toFixed(0)}초`].join(' · ') + ' (고르는 시간은 빼고 잰다)', W / 2, H / 2 + 14);
      if (t >= Rs.stamp[2]) {
        const fresh = G.rec && (G.rec.isNew.sec || G.rec.isNew.grade);
        ctx.font = font(16, true); ctx.fillStyle = fresh ? C.cyan : C.textDim;
        ctx.fillText(!G.counts ? '(기록 없음 — 연습 옵션이 붙은 판)' : fresh ? `새 기록!${G.rec.isNew.sec ? ' 가장 빠른 시간' : ''}${G.rec.isNew.sec && G.rec.isNew.grade ? ' ·' : ''}${G.rec.isNew.grade ? ' 가장 높은 등급' : ''}` : `최고 ${mmss(G.rec.best.sec)} · ${G.rec.best.grade}`, W / 2, H / 2 + 44);
      }
      ctx.font = font(13); ctx.fillStyle = C.textDim;
      ctx.fillText('F4 한 판 더', W / 2, H / 2 + 74);
      ctx.textAlign = 'right'; ctx.font = font(11); ctx.fillText(`seed ${G.seed}`, W - 20, H - 40); ctx.textAlign = 'center';
    } else if (w.result) {
      ctx.font = font(40, true); ctx.fillText(w.result === 'win' ? (w.stage ? '스테이지 완료' : '승리') : '패배', W / 2, H / 2 - 60);
      ctx.font = font(16);
      ctx.fillText(`시간 ${mmss(w.time)} · 맞음 ${s.hits} · 패링 ${s.parries} · 완벽 ${s.perfects} · 스침 ${s.grazes}${isSword(w) ? ` · 일섬 ${s.blade.slash} · 회전 베기 ${s.blade.spin} · 마무리 ${s.blade.finish} · 회복 ${Math.round(s.healed)}` : w.opts.store ? ` · 던지기 ${s.throws} · 회복 ${Math.round(s.healed)}` : ''}`, W / 2, H / 2 - 20);
      ctx.fillStyle = C.textDim; ctx.fillText(w.stage && w.result === 'lose' ? 'R 이 방 다시 · F4 처음부터' : 'F4 다시', W / 2, H / 2 + 14);
      if (w.stage) ctx.fillText(`방 ${w.stage.room + 1} / ${w.stage.of} · 다시 한 횟수 ${w.stage.retries}` + w.stage.times.map(t => ` · 방 ${t.room} ${t.sec.toFixed(0)}초`).join(''), W / 2, H / 2 + 40);
    } else pauseGuide(w);
    ctx.globalAlpha = 1;
  }

  // 멈춤 화면의 안내(view/guide.js가 고른 것을 그린다): 목표 · 하는 법 · 조작 표(왼손 | 오른손) · 그 밖 · 색의 뜻 · 지금 낀 카드
  function keycap(x, y, label) {   // 키 하나(둥근 네모 + 글자). 그린 너비를 돌려준다
    const Gd = LOOK.guide;
    ctx.font = font(12, true);
    const wd = Math.max(Gd.capH, ctx.measureText(label).width + Gd.capPad * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = C.text; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + 0.5, y - Gd.capH / 2 + 0.5, wd, Gd.capH, 4); else ctx.rect(x + 0.5, y - Gd.capH / 2 + 0.5, wd, Gd.capH);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.fillText(label, x + wd / 2 + 0.5, y + 4);
    ctx.textAlign = 'left';
    return wd;
  }
  function pauseGuide(w) {
    const Gd = LOOK.guide, g = guide(w, LOOK);
    const pw = Gd.panelW, x0 = (W - pw) / 2, inner = pw - Gd.pad * 2, colW = (inner - Gd.colGap) / 2;
    const rows = Math.max(g.left.length, g.right.length);
    const total = 46 + 24 + 30 + g.how.length * Gd.lineH + 14 + 24 + rows * Gd.rowH + 12 + 24 + Gd.rowH + 12 + 24 + 26 + (g.cards.length ? 30 + g.cards.length * Gd.cardH : 0) + 34;
    // 작은 창에서는 판 전체를 줄여 그린다(잘리지 않게)
    const fit = Math.min(1, (H - 16) / total, (W - 16) / pw);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(fit, fit); ctx.translate(-W / 2, -H / 2);
    let y = (H - total) / 2;
    ctx.fillStyle = 'rgba(16,14,24,0.94)'; ctx.fillRect(x0, y, pw, total);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y + 0.5, pw - 1, total - 1);
    const lx = x0 + Gd.pad, rx = lx + colW + Gd.colGap;
    const head = (t, x, yy, wd) => { ctx.font = font(12, true); ctx.fillStyle = C.cyan; ctx.textAlign = 'left'; ctx.fillText(t, x, yy); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, yy + 6, wd, 1); };
    const capsW = r => { ctx.font = font(12, true); return r.keys.reduce((a, k) => a + Math.max(Gd.capH, ctx.measureText(k).width + Gd.capPad * 2) + Gd.capGap, 0); };
    const keyCol = list => Math.max(...list.map(capsW)) + Gd.keyGap;   // 그 묶음에서 가장 넓은 키 묶음에 맞춘 키 칸
    const row = (r, x, yy, wd, kw) => {   // 키들 | 하는 일(+ 다른 키)
      let kx = x;
      for (const k of r.keys) kx += keycap(kx, yy, k) + Gd.capGap;
      const tx = x + kw;
      ctx.font = font(14); ctx.fillStyle = C.text; ctx.textAlign = 'left';
      const room = wd - (tx - x), tw = Math.min(room, ctx.measureText(r.text).width);
      ctx.fillText(r.text, tx, yy + 5, room);
      if (r.alt && room - tw > 60) { ctx.font = font(11); ctx.fillStyle = C.textDim; ctx.fillText(r.alt, tx + tw + 8, yy + 5, room - tw - 8); }
    };
    // 제목 · 목표
    y += 36; ctx.textAlign = 'center'; ctx.font = font(26, true); ctx.fillStyle = C.text; ctx.fillText(`멈춤 — ${g.title}`, W / 2, y);
    y += 26; ctx.font = font(14); ctx.fillStyle = C.textDim; ctx.fillText(g.goal, W / 2, y, inner);
    // 하는 법
    y += 30; head(g.heads.how, lx, y, inner);
    y += 6;
    for (const t of g.how) { y += Gd.lineH; ctx.font = font(15); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(`· ${t}`, lx + 4, y, inner - 8); }
    // 조작 표: 왼손 | 오른손
    y += 14 + 24; head(g.heads.left, lx, y - 6, colW); head(g.heads.right, rx, y - 6, colW);
    for (let k = 0; k < rows; k++) {
      const yy = y + 6 + Gd.rowH * (k + 0.5);
      if (k % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(lx - 6, yy - Gd.rowH / 2, inner + 12, Gd.rowH); }
      if (g.left[k]) row(g.left[k], lx, yy, colW, keyCol(g.left));
      if (g.right[k]) row(g.right[k], rx, yy, colW, keyCol(g.right));
    }
    y += 6 + rows * Gd.rowH;
    // 그 밖(한 줄에 나란히)
    y += 12 + 18; head(g.heads.misc, lx, y - 6, inner);
    { const yy = y + 6 + Gd.rowH / 2, wd = inner / g.misc.length; g.misc.forEach((r, k) => { let kx = lx + wd * k; for (const key of r.keys) kx += keycap(kx, yy, key) + Gd.capGap; ctx.font = font(13); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(r.text, kx + 4, yy + 5, wd - (kx - lx - wd * k) - 8); }); }
    y += 6 + Gd.rowH;
    // 색의 뜻(한 줄에 나란히 — 색 점 + 글)
    y += 12 + 18; head(g.heads.colors, lx, y - 6, inner);
    { const yy = y + 22, wd = inner / g.colors.length; g.colors.forEach((c, k) => { const cx = lx + wd * k + Gd.dot; ctx.beginPath(); ctx.arc(cx, yy - 4, Gd.dot, 0, Math.PI * 2); ctx.fillStyle = LOOK.colors[c.color]; ctx.fill(); ctx.font = font(13); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(c.text, cx + Gd.dot + 7, yy, wd - Gd.dot * 2 - 12); }); }
    y += 26;
    // 지금 낀 카드
    if (g.cards.length) {
      y += 12 + 18; head(g.heads.cards, lx, y - 6, inner);
      y += 8;
      for (const c of g.cards) {
        y += Gd.cardH;
        ctx.font = font(13, true); ctx.fillStyle = C.cyan; ctx.textAlign = 'left';
        const label = `${c.key ? `[${c.key}] ` : ''}${c.name}`;
        ctx.fillText(label, lx + 4, y);
        const lw = ctx.measureText(label).width;
        ctx.font = font(13); ctx.fillStyle = C.textDim; ctx.fillText(`${c.group} · ${c.line}`, lx + 4 + lw + 10, y, inner - lw - 18);
      }
    }
    y += 26; ctx.textAlign = 'center'; ctx.font = font(13); ctx.fillStyle = C.textDim; ctx.fillText(g.resume, W / 2, y);
    ctx.restore();
  }

  // 처형 b의 위아래 검은 띠(0.15초에 들어오고 빠진다). 맨 위에 그려 겹 화면도 가린다.
  function drawBars(now) {
    const u = Math.min(1, (now - st.barsAt) / 0.15), k = st.bars ? u : 1 - u;
    if (k <= 0) return;
    const h = H * LOOK.sizes.letterbox * k * (2 - k);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
  }
  const drawAll = (w, ui) => { draw(w, ui); drawBars(ui.now); };

  return {
    draw: drawAll, resize, ctx, canvas,
    letterbox(now, on) { if (st.bars !== on) { st.bars = on; st.barsAt = now; } },
    get size() { return { W, H, dpr }; },
    shakePips(now) { st.pipShakeAt = now; },
    shakeStock(now, what) { st.stockShake[what] = now; },
    flashStagger(now) { st.staggerFlashAt = now; },
    banner(now, text, sec) { st.banner = { text, at: now, sec }; },
    cardGain(now, e) { st.gains.push({ at: now, group: e.group, slot: e.slot, x: e.x, z: e.z }); },   // 주운 카드: 자리 → 그 칸으로 선, 칸이 빛난다
    blinkGroup(group) { st.blink = group; },   // 바꿔 끼우는 동안 그 갈래의 칸이 깜빡인다(null = 멈춤)
    slotAt,
    fadeIn(now, sec) { st.fadeAt = now; st.fadeSec = sec; },
  };
}
