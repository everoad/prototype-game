// 겹 화면(2D 캔버스, §7): 보스 체력(깎인 꼬리)·무력화·단계, 플레이어 체력·회피 충전 점, 시간, 멈춤·결과, F1 판정 보기.
// 녹화는 이 캔버스를 WebGL 화면 위에 합쳐 찍는다. 가장자리 연출(Task 14)도 이 캔버스에 그린다(ctx).
export function createHud(canvas, LOOK) {
  const ctx = canvas.getContext('2d'), C = LOOK.colors;
  let dpr = 1, W = 0, H = 0;
  const st = { trail: 1, trailHold: 0, lastHp: 1, pipShakeAt: -1e9, staggerFlashAt: -1e9, bars: false, barsAt: -1e9, stockShake: { shield: -1e9, bomb: -1e9 } };
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
    // 방패·폭탄 사용권(§4.9)
    if (p.stock) {
      ctx.font = font(13, true); ctx.textAlign = 'left';
      const sk = what => (now - st.stockShake[what] < 0.2 ? Math.sin((now - st.stockShake[what]) * 80) * 3 : 0);
      ctx.fillStyle = p.stock.shield > 0 ? C.item : C.textDim; ctx.fillText(`Q 방패 ×${p.stock.shield}`, px + 300 + sk('shield'), py + 11);
      ctx.fillStyle = p.stock.bomb > 0 ? C.item : C.textDim; ctx.fillText(`E 폭탄 ×${p.stock.bomb}`, px + 390 + sk('bomb'), py + 11);
    }
    // 시간
    ctx.font = font(15, true); ctx.fillStyle = C.text; ctx.textAlign = 'right';
    ctx.fillText(mmss(w.time), W - 20, 34);
    ctx.font = font(12); ctx.fillStyle = C.textDim;
    ctx.fillText('WASD 이동 · Shift/좌클릭 패링 · Space/우클릭 회피 · Q 방패 · E 폭탄 · V 시점 · G 고리 · Esc 멈춤 · F4 다시', W - 20, H - 18);
    if (ui.bot) ctx.fillText(`봇: ${ui.bot}`, W - 20, 54);
    // F1 판정 보기
    if (ui.debug) debug(w, ui);
    // 멈춤·결과
    if (w.result || ui.paused) overlay(w, ui);
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
    ctx.fillStyle = 'rgba(10,9,14,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = C.text;
    const s = w.stats;
    if (w.result) {
      ctx.font = font(40, true); ctx.fillText(w.result === 'win' ? '승리' : '패배', W / 2, H / 2 - 60);
      ctx.font = font(16);
      ctx.fillText(`시간 ${mmss(w.time)} · 맞음 ${s.hits} · 패링 ${s.parries} · 완벽 ${s.perfects} · 스침 ${s.grazes}`, W / 2, H / 2 - 20);
      ctx.fillStyle = C.textDim; ctx.fillText('F4 다시', W / 2, H / 2 + 14);
    } else {
      ctx.font = font(32, true); ctx.fillText('멈춤', W / 2, H / 2 - 90);
      ctx.font = font(15);
      const rows = ['WASD·방향키 — 이동(누르는 그 틱에 최고 속도)', 'Shift·마우스 왼쪽 — 패링(흰·금 탄, 흰·금 근접)', 'Space·마우스 오른쪽 — 회피(2회 충전, 시작부터 무적)', '쏘기는 자동(보스 쪽, 붙을수록 많이 맞음)', 'V 시점 45°/60° · G 패링 고리 · F1 판정 보기 · F4 다시 · Esc 이어서'];
      rows.forEach((t, k) => ctx.fillText(t, W / 2, H / 2 - 44 + k * 24));
    }
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
  };
}
