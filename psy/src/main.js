// 조작과 한 프레임. 판정은 1/60초씩 고정으로 돌린다.
(function () {
  'use strict';
  const P = window.PSY, R = P.R, STEP = 1 / 60;
  const cv = document.getElementById('c');
  R.ctx = cv.getContext('2d', { alpha: false });
  const inp = { mx: 0, my: 0, ax: 0, ay: 0, fireL: false, fireR: false, chargeSet: null, push: false, shift: false, sel: null, px: 0, py: 0 };
  const ui = { help: true, paused: false, ready: true };
  const keys = {};
  let W, seed, last = 0, acc = 0;

  function qs(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function start(s) {
    seed = s; W = P.newWorld(seed); P.makeMini(W);
    const lv = Number(qs('level') || 0);
    for (let i = 1; i < lv; i++) P.cheatLevel(W);
    W.banners.length = 0;
    inp.fireL = inp.fireR = false; inp.chargeSet = null; inp.sel = null; acc = 0;
    window.PSY_W = W;
  }
  function resize() { cv.width = R.cw = window.innerWidth; cv.height = R.ch = window.innerHeight; inp.px = R.cw * 0.6; inp.py = R.ch * 0.5; }
  function pos(e) { const r = cv.getBoundingClientRect(); inp.px = e.clientX - r.left; inp.py = e.clientY - r.top; }
  const playing = () => W.state === 'play' && !ui.paused && !ui.ready;

  cv.addEventListener('mousemove', (e) => { pos(e); inp.shift = e.shiftKey; if (inp.sel) { inp.sel.x1 = inp.px; inp.sel.y1 = inp.py; } });
  cv.addEventListener('mousedown', (e) => {
    pos(e); e.preventDefault(); window.focus();
    if (ui.ready) { ui.ready = false; return; }
    if (!playing()) return;
    const w = P.toWorld(inp.px, inp.py);
    if (e.button === 0) {
      if (e.shiftKey) {
        const s = P.setAt(W, w.x, w.y);
        if (s) { if (P.canCharge(W, s, false)) inp.chargeSet = s; }
        else inp.sel = { x0: inp.px, y0: inp.py, x1: inp.px, y1: inp.py };
      } else inp.fireL = true;
    } else if (e.button === 2) {
      if (W.armed) P.slam(W, w.x, w.y); else inp.fireR = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      inp.fireL = false; inp.chargeSet = null;
      const q = inp.sel; inp.sel = null;
      if (q && playing()) {
        if (Math.abs(q.x1 - q.x0) < 6 && Math.abs(q.y1 - q.y0) < 6) { const w = P.toWorld(q.x1, q.y1); P.pickAt(W, w.x, w.y); }
        else { const a = P.toWorld(Math.min(q.x0, q.x1), Math.min(q.y0, q.y1)), b = P.toWorld(Math.max(q.x0, q.x1), Math.max(q.y0, q.y1)); P.pickBox(W, a.x, a.y, b.x, b.y); }
      }
    } else if (e.button === 2) inp.fireR = false;
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true; inp.shift = e.shiftKey;
    if (ui.ready) { if (e.code === 'Enter' || e.code === 'Space') ui.ready = false; return; }
    switch (e.code) {
      case 'Space': inp.push = true; break;
      case 'KeyX': if (playing()) P.dropAll(W); break;
      case 'KeyH': ui.help = !ui.help; break;
      case 'KeyP': case 'Escape': if (W.state === 'play') ui.paused = !ui.paused; break;
      case 'KeyR': if (W.state !== 'play') start(e.shiftKey ? seed : (Math.random() * 100000) | 0); break;
      case 'Equal': if (playing()) P.cheatLevel(W); break;
      case 'Digit0': if (playing()) P.cheatZone(W); break;
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; inp.shift = e.shiftKey; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; inp.fireL = inp.fireR = false; inp.chargeSet = null; inp.sel = null; inp.shift = false; });
  window.addEventListener('resize', resize);

  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    inp.mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    inp.my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    const a = P.toWorld(inp.px, inp.py); inp.ax = a.x; inp.ay = a.y;
    if (playing()) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) { P.step(W, STEP, inp); acc -= STEP; n++; inp.push = false; }
      if (n === 4) acc = 0;
    }
    P.render(W, inp, ui);
    requestAnimationFrame(frame);
  }

  resize();
  start(Number(qs('seed')) || ((Math.random() * 100000) | 0));
  R.camX = W.player.x; R.camY = W.player.y;
  requestAnimationFrame(frame);
})();
