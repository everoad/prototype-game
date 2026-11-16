// 겹 화면(2D 캔버스, §7): 보스 체력(깎인 꼬리)·무력화·단계, 플레이어 체력·회피 충전 점, 시간, 멈춤·결과, F1 판정 보기.
// 녹화는 이 캔버스를 WebGL 화면 위에 합쳐 찍는다. 가장자리 연출(Task 14)도 이 캔버스에 그린다(ctx).
// 결과 화면 밝기: 승리·패배 순간에서 since초 — 늦게(큰 순간을 먼저 보여 주고) 서서히 뜬다
export function resultAlpha(result, since, R) {
  if (!result) return 0;
  const delay = result === 'win' ? R.winDelay : R.loseDelay;
  return Math.max(0, Math.min(1, (since - delay) / R.fade));
}

export function createHud(canvas, LOOK) {
  const ctx = canvas.getContext('2d'), C = LOOK.colors;
  let dpr = 1, W = 0, H = 0;
  const st = { trail: 1, trailHold: 0, lastHp: 1, pipShakeAt: -1e9, staggerFlashAt: -1e9, bars: false, barsAt: -1e9, stockShake: { shield: -1e9, bomb: -1e9, skill: -1e9, store: -1e9 }, banner: null };
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
    // 보스 체력 + 깎인 꼬리(잠깐 남았다 줄어듦)
    const hp = b.hp / b.maxHp;
    if (hp < st.lastHp) st.trailHold = now + 0.4;
    st.lastHp = hp;
    if (now > st.trailHold) st.trail = Math.max(hp, st.trail - 0.6 * (ui.dt ?? 0.016));
    if (st.trail < hp) st.trail = hp;
    const bw = Math.min(720, W * 0.5), bx = (W - bw) / 2, by = 22;
    bar(bx, by, bw, 14, st.trail, C.hpTrail);
    ctx.fillStyle = C.hp; ctx.fillRect(bx, by, bw * hp, 14);
    // 무력화(80%부터 맥동)
    const sv = b.stagger / w.rules.stagger.max, pulse = sv >= 0.8 ? 0.6 + 0.4 * Math.sin(now * 14) : 1;
    ctx.globalAlpha = pulse; bar(bx, by + 18, bw, 6, sv, C.stagger); ctx.globalAlpha = 1;
    if (now - st.staggerFlashAt < 0.18) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(bx, by + 18, bw * sv, 6); }
    ctx.font = font(13, true); ctx.fillStyle = C.text; ctx.textAlign = 'left';
    ctx.fillText(ui.lab ? `연습: ${ui.lab}` : `${b.phase ?? 1}단계`, bx + bw + 10, by + 12);
    // 플레이어 체력 + 회피 충전 점
    const px = 24, py = H - 34;
    ctx.font = font(12); ctx.fillStyle = C.textDim; ctx.fillText('체력', px, py - 6);
    bar(px, py, 220, 12, p.hp / w.rules.player.hp, C.playerHp);
    const shake = now - st.pipShakeAt < 0.2 ? Math.sin((now - st.pipShakeAt) * 80) * 3 : 0;
    for (let k = 0; k < w.rules.dodge.charges; k++) {
      ctx.beginPath(); ctx.arc(px + 240 + k * 18 + shake, py + 6, 6, 0, Math.PI * 2);
      ctx.fillStyle = k < p.dodge.charges ? C.pip : C.pipEmpty; ctx.fill();
    }
    // 보조 무기(§4.10): 숫자 1~4 = 켜고 끄기(시험용), 켠 것은 청록
    if (w.weapons) {
      const names = { missile: '미사일', burst: '산탄', beam: '빔', drone: '드론' };
      ctx.font = font(12, true); ctx.textAlign = 'left';
      let gx = px;
      ['missile', 'burst', 'beam', 'drone'].forEach((g, k) => {
        const label = `${k + 1} ${names[g]}`;
        ctx.fillStyle = w.weapons.on.includes(g) ? C.cyan : C.textDim; ctx.fillText(label, gx, py - 24);
        gx += ctx.measureText(label).width + 10;
      });
      // 가동(패링 뒤 남은 시간)·스킬 게이지(패링 +1, 완벽 +2)·스킬 키(쓸 수 있으면 밝게)
      const WR = w.rules.weapons, left = Math.max(0, w.weapons.chargeUntil - w.time);
      ctx.fillStyle = left > 0 ? C.cyan : C.textDim; ctx.fillText(left > 0 ? '가동' : '패링하면 가동', gx + 6, py - 24);
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
      const cap = w.rules.store.cap, n = p.store.length, full = n >= cap;
      const sk = now - st.stockShake.store < 0.2 ? Math.sin((now - st.stockShake.store) * 80) * 3 : 0;
      for (let k = 0; k < cap; k++) {
        ctx.beginPath(); ctx.arc(px + 8 + k * 18 + sk, py - 46, full ? 6.5 + Math.sin(now * 16) : 6, 0, Math.PI * 2);
        ctx.fillStyle = k < n ? C.cyan : C.pipEmpty; ctx.fill();
      }
      ctx.font = font(13, true); ctx.textAlign = 'left';
      const low = p.hp > 0 && p.hp <= w.rules.player.hp * LOOK.feel.lowHp.at && n > 0;   // 체력 위태 + 모은 것 있음 = 던져서 회복하라고 깜빡
      ctx.fillStyle = low ? (Math.floor(now * 6) % 2 ? C.heal : C.text) : n > 0 ? C.cyan : C.textDim;
      ctx.fillText(low ? 'U 던져서 회복!' : full ? 'U 던지기 — 가득!' : 'U 던지기', px + 8 + cap * 18 + 6 + sk, py - 41);
    }
    // 방패·폭탄 사용권(§4.9)
    if (p.stock) {
      ctx.font = font(13, true); ctx.textAlign = 'left';
      const sk = what => (now - st.stockShake[what] < 0.2 ? Math.sin((now - st.stockShake[what]) * 80) * 3 : 0);
      ctx.fillStyle = p.stock.shield > 0 ? C.item : C.textDim; ctx.fillText(`K 방패 ×${p.stock.shield}`, px + 300 + sk('shield'), py + 11);
      ctx.fillStyle = p.stock.bomb > 0 ? C.item : C.textDim; ctx.fillText(`L 폭탄 ×${p.stock.bomb}`, px + 390 + sk('bomb'), py + 11);
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
    // 시간
    ctx.font = font(15, true); ctx.fillStyle = C.text; ctx.textAlign = 'right';
    ctx.fillText(mmss(w.time), W - 20, 34);
    ctx.font = font(12); ctx.fillStyle = C.textDim;
    ctx.fillText(`WASD 이동 · J/Shift 패링 · Space 회피 · K/Q 방패 · L/E 폭탄 · ${w.opts.store ? 'U 모은 탄 던지기' : 'U/I/O 무기 스킬'} · 1~4 무기 · V 시점 · Esc 멈춤 · F4 다시`, W - 20, H - 18);
    if (ui.bot) ctx.fillText(`봇: ${ui.bot}`, W - 20, 54);
    // F1 판정 보기
    if (ui.debug) debug(w, ui);
    // 멈춤·결과
    if ((w.result && (ui.resultAlpha ?? 1) > 0) || ui.paused) overlay(w, ui);   // 결과는 큰 순간이 지난 뒤 서서히(main이 resultAlpha를 준다)
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
    if (w.result) {
      ctx.font = font(40, true); ctx.fillText(w.result === 'win' ? '승리' : '패배', W / 2, H / 2 - 60);
      ctx.font = font(16);
      ctx.fillText(`시간 ${mmss(w.time)} · 맞음 ${s.hits} · 패링 ${s.parries} · 완벽 ${s.perfects} · 스침 ${s.grazes}${w.opts.store ? ` · 던지기 ${s.throws} · 회복 ${Math.round(s.healed)}` : ''}`, W / 2, H / 2 - 20);
      ctx.fillStyle = C.textDim; ctx.fillText('F4 다시', W / 2, H / 2 + 14);
    } else {
      ctx.font = font(32, true); ctx.fillText('멈춤', W / 2, H / 2 - 100);
      ctx.font = font(15);
      const rows = ['WASD·방향키 — 이동(누르는 그 틱에 최고 속도)', 'Shift·마우스 왼쪽 — 패링(흰·금 탄, 흰·금 근접)', 'Space·마우스 오른쪽 — 회피(2회 충전, 시작부터 무적)', '쏘기는 자동(보스 쪽, 붙을수록 많이 맞음)', w.opts.store ? 'U — 받아서 모은 탄 던지기(피해 + 회복, 최대 4개)' : 'U·I·O — 무기 스킬(패링 게이지 3칸)', 'K·Q 방패 · L·E 폭탄(아이템으로 얻은 만큼)', 'V 시점 45°/60° · G 패링 고리 · F1 판정 보기 · F4 다시 · Esc 이어서'];
      rows.forEach((t, k) => ctx.fillText(t, W / 2, H / 2 - 56 + k * 24));
    }
    ctx.globalAlpha = 1;
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
  };
}
