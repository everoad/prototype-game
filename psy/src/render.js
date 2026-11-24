// 화면: 쿼터뷰(비스듬히 내려다봄)로 상자와 원만 그린다. 판정 상태를 바꾸지 않는다.
(function (G) {
  'use strict';
  const P = G.PSY, C = P.C, ZT = P.ZT, RING = P.RING;
  const KY = 0.78, KZ = 0.62, CP = 40, TAU = Math.PI * 2;
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  const R = (P.R = { vw: C.viewBase, camX: 0, camY: 0, S: 20, cw: 0, ch: 0, ctx: null, frame: 0, mini: null });

  const sx = (x) => (x - R.camX) * R.S + R.cw * 0.5;
  const sy = (y, z) => ((y - R.camY) * KY - z * KZ) * R.S + R.ch * 0.5;
  P.toWorld = function (px, py) { return { x: (px - R.cw * 0.5) / R.S + R.camX, y: (py - R.ch * 0.5) / R.S / KY + R.camY }; };

  function box(x0, y0, x1, y1, z, h, top, front) {
    const c = R.ctx, l = sx(x0), w = (x1 - x0) * R.S;
    c.fillStyle = front; c.fillRect(l, sy(y1, z + h), w, h * KZ * R.S + 1);
    c.fillStyle = top; c.fillRect(l, sy(y0, z + h), w, (y1 - y0) * KY * R.S);
  }
  function ell(x, y, z, r, fill, stroke, lw) {
    const c = R.ctx;
    c.beginPath(); c.ellipse(sx(x), sy(y, z), Math.max(0.5, r * R.S), Math.max(0.5, r * R.S * KY), 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); }
  }
  function drawObj(o, z) {
    const k = o.k; let a = k.sx * 0.5, b = k.sy * 0.5;
    if (o.r) { const t = a; a = b; b = t; }
    box(o.x - a, o.y - b, o.x + a, o.y + b, z, k.h, k.col, k.col2);
  }
  function drawAir(o, z) {
    const c = R.ctx, k = o.k;
    if (k.long) {
      const L = k.len * 0.5, dx = Math.cos(o.ang) * L, dy = Math.sin(o.ang) * L;
      c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = Math.max(2, 0.3 * R.S); c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx(o.x - dx), sy(o.y - dy, 0)); c.lineTo(sx(o.x + dx), sy(o.y + dy, 0)); c.stroke();
      c.strokeStyle = k.col; c.lineWidth = Math.max(2, 0.32 * R.S); c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx(o.x - dx), sy(o.y - dy, z)); c.lineTo(sx(o.x + dx), sy(o.y + dy, z)); c.stroke();
    } else {
      let a = k.sx * 0.5, b = k.sy * 0.5;
      if (k.sx > 2 && Math.abs(Math.sin(o.ang)) > 0.7) { const t = a; a = b; b = t; }   // 큰 것은 가는 쪽으로 눕힌다
      c.fillStyle = 'rgba(0,0,0,0.2)';
      if (k.cls === 0) c.fillRect(sx(o.x) - 2, sy(o.y, 0) - 1, 4, 2);
      else { c.beginPath(); c.ellipse(sx(o.x), sy(o.y, 0), (a + 0.15) * R.S, (b + 0.15) * R.S * KY, 0, 0, TAU); c.fill(); }
      box(o.x - a, o.y - b, o.x + a, o.y + b, z, Math.min(k.h, 3.2), k.col, k.col2);
    }
  }

  // 한 방으로 쓰는 큰 것들
  function drawSet(s, W) {
    const c = R.ctx, k = s.k; let x = s.x, y = s.y, z = 0;
    if (s.st === 0 && s.charge > 0) { z = s.charge * 3; x += (Math.random() - 0.5) * 0.25 * s.charge; }
    else if (s.st === 1) z = 9 + Math.sin(W.t * 2) * 0.6;
    else if (s.st === 2) { const f = s.ft; x = s.fx0 + (s.tx - s.fx0) * f; y = s.fy0 + (s.ty - s.fy0) * f; z = 9 * (1 - f * f) + Math.sin(Math.PI * f) * 12; }
    if (s.st === 3) {                                   // 쓰고 난 잔해
      ell(x, y, 0, k.blast * 0.55, 'rgba(20,18,16,0.55)');
      box(x - k.sx * 0.3, y - k.sy * 0.25, x + k.sx * 0.3, y + k.sy * 0.25, 0, 0.8, '#3a3835', '#262422');
      return;
    }
    if (z > 0.5) ell(x, y, 0, Math.max(k.sx, k.sy) * 0.45, 'rgba(0,0,0,0.35)');
    switch (k.id) {
      case 'tree':
        box(x - 0.5, y - 0.5, x + 0.5, y + 0.5, z, 6, '#5a4630', '#40311f');
        ell(x, y, z + 8, 4.2, '#34552f'); ell(x - 1, y, z + 9.5, 2.8, '#41683a');
        break;
      case 'billboard':
        box(x - 4.2, y - 0.3, x - 3.6, y + 0.3, z, 8, '#55585c', '#3b3d40'); box(x + 3.6, y - 0.3, x + 4.2, y + 0.3, z, 8, '#55585c', '#3b3d40');
        box(x - 5, y - 0.4, x + 5, y + 0.4, z + 7, 5, '#a59a80', '#7d745f');
        break;
      case 'pylon':
        box(x - 1.3, y - 1.3, x + 1.3, y + 1.3, z, 27, '#8a9096', '#5f646a');
        box(x - 6, y - 0.3, x + 6, y + 0.3, z + 19, 0.7, '#8a9096', '#5f646a'); box(x - 4.5, y - 0.3, x + 4.5, y + 0.3, z + 24.5, 0.7, '#8a9096', '#5f646a');
        break;
      case 'wtower':
        box(x - 2.6, y - 2.6, x + 2.6, y + 2.6, z, 12, '#4a4038', '#342c26');
        box(x - 4.5, y - 4.5, x + 4.5, y + 4.5, z + 12, 7, '#8f5e44', '#6a4532');
        break;
      case 'crane':
        box(x - 1.5, y - 1.5, x + 1.5, y + 1.5, z, 42, '#c9a02c', '#8f721f');
        box(x - 6, y - 0.7, x + 26, y + 0.7, z + 42, 1.6, '#c9a02c', '#8f721f');
        break;
      default:                                          // 여객기
        box(x - 19, y - 2, x + 19, y + 4, z + 2.4, 0.7, '#c2c6cb', '#8e9297');
        box(x - 2.2, y - 18, x + 2.2, y + 18, z + 1.8, 4.2, '#dfe2e6', '#a3a7ac');
        box(x - 6, y + 14, x + 6, y + 17, z + 5.5, 0.6, '#c2c6cb', '#8e9297');
        box(x - 0.4, y + 13, x + 0.4, y + 18, z + 6, 5, '#b9453c', '#84302a');
    }
    if (s.st === 0 && s.charge > 0) {                   // 모으는 중
      c.strokeStyle = '#c9a8ff'; c.lineWidth = 4;
      c.beginPath(); c.ellipse(sx(s.x), sy(s.y, 0), k.sx * 0.6 * R.S, k.sx * 0.6 * R.S * KY, 0, -Math.PI / 2, -Math.PI / 2 + TAU * s.charge); c.stroke();
    }
  }

  function bar(x, y, w, h, f, col, back) {
    const c = R.ctx;
    c.fillStyle = back || 'rgba(0,0,0,0.55)'; c.fillRect(x, y, w, h);
    c.fillStyle = col; c.fillRect(x, y, Math.max(0, Math.min(1, f)) * w, h);
  }
  function label(s, x, y, size, col, align) {
    const c = R.ctx;
    c.font = '600 ' + size + 'px ' + FONT; c.textAlign = align || 'left';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(s, x, y);
    c.fillStyle = col || '#e8e8e8'; c.fillText(s, x, y);
  }

  // 작은 지도: 한 번만 그려 두고 쓴다
  P.makeMini = function (W) {
    if (typeof document === 'undefined') return;
    const mw = 240, mh = Math.round(mw * W.h / W.w), cv = document.createElement('canvas');
    cv.width = mw; cv.height = mh;
    const c = cv.getContext('2d'), s = mw / W.w;
    c.fillStyle = '#1c1e21'; c.fillRect(0, 0, mw, mh);
    for (const z of W.zones) { c.fillStyle = z.col; c.fillRect(z.x0 * s, 0, (z.x1 - z.x0) * s, mh); }
    c.fillStyle = '#15171a'; c.fillRect(0, 888 * s, 2340 * s, 24 * s + 1);
    c.fillStyle = '#4a4e55'; c.fillRect(2500 * s, 820 * s, 200 * s, 160 * s);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    for (const b of W.buildings) c.fillRect(b.x0 * s, b.y0 * s, Math.max(1, (b.x1 - b.x0) * s), Math.max(1, (b.y1 - b.y0) * s));
    R.mini = cv; R.miniS = s;
  };

  P.render = function (W, inp, ui) {
    const c = R.ctx, cw = R.cw, ch = R.ch, p = W.player;
    R.frame++;
    let big = 0;
    for (let i = 0; i < W.carried.length; i++) if (W.carried[i].k.cls > big) big = W.carried[i].k.cls;
    const vwT = C.viewBase + p.level * C.viewPerLevel + (big === 3 ? 22 : big === 2 ? 8 : 0) + (W.armed ? 30 : 0);
    R.vw += (vwT - R.vw) * 0.04;
    const S = (R.S = cw / R.vw);
    let shx = 0, shy = 0;
    if (W.shake > 0) { shx = (Math.random() - 0.5) * W.shake * 1.2; shy = (Math.random() - 0.5) * W.shake * 1.2; }
    R.camX = p.x + (inp.ax - p.x) * 0.1 + shx; R.camY = p.y + (inp.ay - p.y) * 0.1 + shy;
    const hx = cw * 0.5 / S, hy = ch * 0.5 / S / KY;
    const vx0 = R.camX - hx - 22, vx1 = R.camX + hx + 22, vy0 = R.camY - hy - 22, vy1 = R.camY + hy + 60;

    // 바닥
    c.fillStyle = '#23262a'; c.fillRect(0, 0, cw, ch);
    for (const z of W.zones) if (z.x1 > vx0 && z.x0 < vx1) { c.fillStyle = '#26292d'; c.fillRect(sx(z.x0), 0, (z.x1 - z.x0) * S, ch); }
    for (const q of W.pads) {
      if (q.x1 < vx0 || q.x0 > vx1 || q.y1 < vy0 || q.y0 > vy1) continue;
      c.fillStyle = q.col; c.fillRect(sx(q.x0), sy(q.y0, 0), (q.x1 - q.x0) * S + 1, (q.y1 - q.y0) * KY * S + 1);
    }
    if (vy0 < 912 && vy1 > 888) { c.fillStyle = 'rgba(200,200,180,0.25)'; c.fillRect(sx(Math.max(0, vx0)), sy(900, 0) - 1, (Math.min(2340, vx1) - Math.max(0, vx0)) * S, 2); }
    // 판의 바깥
    c.fillStyle = '#0c0d0f';
    if (vx0 < 0) c.fillRect(0, 0, sx(0), ch);
    if (vx1 > W.w) c.fillRect(sx(W.w), 0, cw - sx(W.w), ch);
    if (vy0 < 0) c.fillRect(0, 0, cw, sy(0, 0));
    if (vy1 > W.h) c.fillRect(0, sy(W.h, 0), cw, ch - sy(W.h, 0));

    const list = [];
    // 건물(무너진 것은 바닥의 얼룩)
    const pcx0 = Math.max(0, (vx0 / CP) | 0), pcx1 = Math.min(W.pw - 1, (vx1 / CP) | 0), pcy0 = Math.max(0, (vy0 / CP) | 0), pcy1 = Math.min(W.ph - 1, (vy1 / CP) | 0);
    for (let cy = pcy0; cy <= pcy1; cy++) for (let cx = pcx0; cx <= pcx1; cx++) {
      const a = W.bgrid[cy * W.pw + cx]; if (!a) continue;
      for (const b of a) {
        if (b.fr === R.frame) continue; b.fr = R.frame;
        if (b.dead) { c.fillStyle = 'rgba(18,16,14,0.6)'; c.fillRect(sx(b.x0), sy(b.y0, 0), (b.x1 - b.x0) * S, (b.y1 - b.y0) * KY * S); }
        else list.push({ y: b.y1, t: 1, o: b });
      }
    }
    // 바닥의 물건: 낮은 것은 바로, 키 큰 것은 순서대로
    const shift = inp.shift, tk = P.tkRange(W), tk2 = tk * tk;
    let hover = null, hd = 1.2;
    P.eachGround(W, vx0, vy0, vx1, vy1, (o) => {
      if (o.x < vx0 || o.x > vx1 || o.y < vy0 || o.y > vy1) return;
      if (o.k.h < 0.7) drawObj(o, 0); else list.push({ y: o.y + (o.r ? o.k.sx : o.k.sy) * 0.5, t: 2, o });
      if (shift) {
        const d = Math.hypot(o.x - inp.ax, o.y - inp.ay) - Math.max(o.k.sx, o.k.sy) * 0.5;
        if (d < hd) { hd = d; hover = o; }
      }
    });
    for (const s of W.sets) if (s.x > vx0 - 30 && s.x < vx1 + 30 && s.y > vy0 - 30 && s.y < vy1 + 30) list.push({ y: (s.st === 2 ? s.fy0 + (s.ty - s.fy0) * s.ft : s.y) + s.k.sy * 0.3, t: 3, o: s });
    const zs = W.zs;
    for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z.x > vx0 && z.x < vx1 && z.y > vy0 && z.y < vy1) list.push({ y: z.y, t: 4, o: z }); }
    for (let i = 0; i < W.carried.length; i++) list.push({ y: W.carried[i].y, t: 5, o: W.carried[i] });
    for (let i = 0; i < W.thrown.length; i++) list.push({ y: W.thrown[i].y, t: 6, o: W.thrown[i] });
    const bs = W.bodies;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (b.x > vx0 && b.x < vx1 && b.y > vy0 - 12 && b.y < vy1 + 12) list.push({ y: b.y, t: 8, o: b }); }
    list.push({ y: p.y, t: 7, o: p });
    list.sort((a, b) => a.y - b.y);

    // 염력이 닿는 범위
    if (shift) ell(p.x, p.y, 0, tk, 'rgba(180,150,255,0.06)', 'rgba(190,160,255,0.45)', 1.5);

    const zw = 0.5 * S, zh = 1.5 * KZ * S;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], o = e.o;
      switch (e.t) {
        case 1: {
          box(o.x0, o.y0, o.x1, o.y1, 0, o.T.h, o.T.col, o.T.col2);
          const w = (o.x1 - o.x0) * S;
          if (w > 60) { c.font = '600 ' + Math.max(11, Math.min(18, w / 8)) + 'px ' + FONT; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillText(o.T.name, sx((o.x0 + o.x1) * 0.5), sy((o.y0 + o.y1) * 0.5, o.T.h) + 5); }
          if (o.hp < o.T.hp) bar(sx(o.x0), sy(o.y0, o.T.h) - 8, w, 5, o.hp / o.T.hp, '#d8a13a');
          break;
        }
        case 2: drawObj(o, 0); break;
        case 3: drawSet(o, W); break;
        case 4: {
          const T = ZT[o.t], x = sx(o.x), yb = sy(o.y, 0);
          if (o.stun > 0.3) {                             // 쓰러져 있다
            const L = 1.5 * S, th = zw * 0.7;
            c.fillStyle = T.col3; c.fillRect(x - L * 0.5, yb - th, L, th);
            c.fillStyle = T.col2; c.fillRect(x + L * 0.5 - zw * 0.2, yb - th, zw * 0.6, th);
            break;
          }
          c.fillStyle = o.stun > 0 ? T.col3 : T.col; c.fillRect(x - zw * 0.5, yb - zh, zw, zh);
          c.fillStyle = T.col2; c.fillRect(x - zw * 0.35, yb - zh - zw * 0.6, zw * 0.7, zw * 0.6);
          break;
        }
        case 8: {                                         // 날아가는 몸: 바닥의 그림자 + 도는 몸통
          const T = ZT[o.t], x = sx(o.x), L = 1.5 * S, th = zw;
          const k = 1 / (1 + o.z * 0.25);
          c.fillStyle = 'rgba(0,0,0,' + (0.28 * k).toFixed(3) + ')';
          c.beginPath(); c.ellipse(x, sy(o.y, 0), 0.7 * S * k, 0.35 * S * k, 0, 0, TAU); c.fill();
          const cs = Math.cos(o.ang), sn = Math.sin(o.ang);
          c.setTransform(cs, sn, -sn, cs, x, sy(o.y, o.z + 0.35));
          c.fillStyle = T.col; c.fillRect(-L * 0.5, -th * 0.5, L, th);
          c.fillStyle = T.col2; c.fillRect(L * 0.5 - zw * 0.1, -th * 0.35, zw * 0.6, th * 0.7);
          c.setTransform(1, 0, 0, 1, 0, 0);
          break;
        }
        case 5: drawAir(o, RING[o.k.cls].z); break;
        case 6: drawAir(o, 1.3); break;
        default: {
          ell(p.x, p.y, 0, 0.55, 'rgba(0,0,0,0.4)');
          const hot = p.flash > 0;
          box(p.x - 0.3, p.y - 0.3, p.x + 0.3, p.y + 0.3, 0.5, 1.5, hot ? '#ff8a8a' : '#e3d6ff', hot ? '#c84a4a' : '#8c6fd6');
          box(p.x - 0.22, p.y - 0.22, p.x + 0.22, p.y + 0.22, 2.0, 0.4, '#f1e9ff', '#c0a8ee');
        }
      }
    }

    // 효과
    for (const f of W.fx) {
      const a = f.life / f.max, g = 1 - a;
      if (f.t === 0) ell(f.x, f.y, 0, f.r * (0.15 + 0.85 * g), null, 'rgba(255,230,160,' + (0.35 * a).toFixed(3) + ')', 2);
      else if (f.t === 1) { ell(f.x, f.y, 0, f.r * (0.6 + 0.4 * g), 'rgba(255,' + Math.round(120 + 100 * a) + ',60,' + (0.75 * a).toFixed(3) + ')'); ell(f.x, f.y, 0, f.r * 0.5 * a, 'rgba(255,250,220,' + a.toFixed(3) + ')'); }
      else if (f.t === 2) ell(f.x, f.y, 0, f.r * (0.4 + 0.6 * g), 'rgba(150,145,135,' + (0.45 * a).toFixed(3) + ')');
      else if (f.t === 4) ell(f.x, f.y, 0, f.r * (0.2 + 0.8 * g), 'rgba(190,160,255,' + (0.18 * a).toFixed(3) + ')', 'rgba(210,190,255,' + (0.8 * a).toFixed(3) + ')', 3);
      else { c.globalAlpha = Math.min(1, a * 2); label(f.s, sx(f.x), sy(f.y, 2.5 + g * 2), 15, f.col, 'center'); c.globalAlpha = 1; }
    }

    // 조준선 · 한 방의 표적 · 줍기 표시
    if (W.state === 'play') {
      if (W.armed) {
        const s = W.armed; let dx = inp.ax - s.x, dy = inp.ay - s.y; const d = Math.hypot(dx, dy) || 1;
        if (d > C.setReach) { dx *= C.setReach / d; dy *= C.setReach / d; }
        ell(s.x + dx, s.y + dy, 0, s.k.blast, 'rgba(255,120,60,0.14)', 'rgba(255,170,90,0.9)', 2.5);
        ell(s.x, s.y, 0, C.setReach, null, 'rgba(255,170,90,0.25)', 1);
      } else if (!shift) {
        c.strokeStyle = 'rgba(200,180,255,0.22)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(sx(p.x), sy(p.y, 1)); c.lineTo(sx(inp.ax), sy(inp.ay, 1)); c.stroke();
      }
      if (shift) {
        let hs = P.setAt(W, inp.ax, inp.ay);
        if (hs) {
          const ok = hs.k.w <= p.cap * C.setMul;
          label(hs.k.name + ' — 한 방' + (ok ? ' · 누르고 있으면 모은다 (' + P.chargeNeed(W, hs).toFixed(1) + '초)' : ' · 한도 ' + Math.ceil(hs.k.w / C.setMul) + ' 필요'), sx(hs.x), sy(hs.y, hs.k.h + 2), 15, ok ? '#c9ffb0' : '#ff9a8a', 'center');
        } else if (hover) {
          const k = hover.k, far = (hover.x - p.x) * (hover.x - p.x) + (hover.y - p.y) * (hover.y - p.y) > tk2;
          label(k.name + ' · 무게 ' + k.w + ' · 내구 ' + hover.dur, sx(hover.x), sy(hover.y, k.h + 0.8), 14, k.w > p.cap ? '#ff9a8a' : far ? '#b0b0b0' : '#c9ffb0', 'center');
        }
        if (inp.sel) {
          const q = inp.sel, x = Math.min(q.x0, q.x1), y = Math.min(q.y0, q.y1), w = Math.abs(q.x1 - q.x0), h = Math.abs(q.y1 - q.y0);
          c.fillStyle = 'rgba(190,160,255,0.12)'; c.fillRect(x, y, w, h);
          c.strokeStyle = 'rgba(210,190,255,0.9)'; c.lineWidth = 1.5; c.strokeRect(x, y, w, h);
        }
      }
    }
    hud(W, inp, ui);
  };

  function hud(W, inp, ui) {
    const c = R.ctx, cw = R.cw, ch = R.ch, p = W.player;
    c.textBaseline = 'alphabetic';
    // 왼쪽 위: 레벨 · 경험치 · 무게 · 체력
    label('레벨 ' + p.level, 18, 30, 20, '#f1e9ff');
    bar(100, 16, 200, 10, p.xp / P.xpNeed(p.level), '#b79cff');
    label('무게 ' + p.used + ' / ' + p.cap, 18, 58, 16, '#e8e8e8');
    bar(18, 66, 282, 12, p.used / p.cap, '#7fd0c0');
    bar(18, 86, 282, 12, p.hp / p.maxhp, p.hp < 35 ? '#ff6a5a' : '#d8554a');
    label('체력 ' + Math.ceil(p.hp), 22, 97, 11, '#ffffff');
    label('염력 ' + P.tkRange(W).toFixed(0) + 'm · 처치 ' + W.kills, 18, 120, 13, '#b8bcc4');
    const pf = 1 - Math.max(0, p.pushCd) / C.pushCd;
    bar(18, 128, 120, 6, pf, pf >= 1 ? '#c9a8ff' : '#6a5a8a');
    label(pf >= 1 ? '밀쳐내기 [Space]' : '밀쳐내기 ' + p.pushCd.toFixed(0) + '초', 146, 136, 12, pf >= 1 ? '#d8c8ff' : '#8a8a96');

    // 가운데 위: 구역 · 목표 · 알림
    const zi = P.zoneAt(p.x);
    label(W.zones[zi].name, cw * 0.5, 30, 20, '#e8e8e8', 'center');
    const left = W.hordeTotal - W.hordeKilled;
    label(zi === 3 || W.hordeKilled > 0 ? '공항 대군 ' + left.toLocaleString() + ' 남음 — ' + Math.round(C.winFrac * 100) + '%를 쓸어버리면 끝' : '목표: 동쪽 끝 공항의 대군을 쓸어버린다', cw * 0.5, 52, 13, '#b8bcc4', 'center');
    let by = 86;
    for (const b of W.banners) { c.globalAlpha = Math.min(1, b.life); label(b.s, cw * 0.5, by, 18, '#ffe9a8', 'center'); by += 26; }
    c.globalAlpha = 1;
    if (W.armed) label(W.armed.k.name + ' 준비됨 — 우클릭한 곳에 내리친다', cw * 0.5, ch - 90, 20, '#ffb37a', 'center');

    // 왼쪽 아래: 지금 들고 있는 것, 다음에 던질 것
    const car = W.carried;
    if (car.length) {
      const names = {}; for (const o of car) names[o.k.name] = (names[o.k.name] || 0) + 1;
      const parts = Object.keys(names).map((n) => n + (names[n] > 1 ? ' ×' + names[n] : ''));
      let line = parts.slice(0, 8).join(' · ') + (parts.length > 8 ? ' …' : '');
      label('든 것 ' + car.length + '개: ' + line, 18, ch - 62, 13, '#b8bcc4');
      label('좌클릭 ▶ ' + car[0].k.name + ' (' + car[0].k.w + ')', 18, ch - 40, 16, '#bfe8ff');
      label('우클릭 ▶ ' + car[car.length - 1].k.name + ' (' + car[car.length - 1].k.w + ')', 18, ch - 18, 16, '#ffd0a0');
    } else label('빈손 — Shift + 드래그로 주변의 물건을 든다', 18, ch - 18, 16, '#ffd27a');

    // 오른쪽 위: 작은 지도
    if (R.mini) {
      const m = R.mini, mx = cw - m.width - 16, my = 16, s = R.miniS;
      c.globalAlpha = 0.9; c.drawImage(m, mx, my); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.strokeRect(mx + 0.5, my + 0.5, m.width, m.height);
      for (const st of W.sets) if (st.st < 3 && st.k.w <= p.cap * C.setMul) { c.fillStyle = st.k.id === 'plane' ? '#ffd27a' : '#c9a8ff'; c.fillRect(mx + st.x * s - 1, my + st.y * s - 1, 3, 3); }
      c.fillStyle = '#ff8a5a'; c.fillRect(mx + 2600 * s - 3, my + 900 * s - 3, 6, 6);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(mx + p.x * s, my + p.y * s, 3, 0, TAU); c.fill();
      label('씨앗 ' + W.seed + ' · ' + fmtT(W.t), cw - 16, my + m.height + 18, 12, '#8a8f96', 'right');
    }

    // 도움말
    if (ui.help) {
      const L = ['이동  W A S D', '들기  Shift + 클릭 · 드래그 (허용 무게까지)', '던지기  좌클릭 = 가벼운 것부터(누르고 있기) · 우클릭 = 가장 무거운 것',
        '한 방  Shift + 큰 물체를 누르고 있기 → 우클릭한 곳에 내리친다', 'Space 밀쳐내기 · X 전부 내려놓기 · H 도움말 · P 멈춤', '확인용  = 레벨 +1 · 0 다음 구역으로'];
      const w = 520, h = L.length * 20 + 14, x = cw - w - 16, y = ch - h - 12;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x, y, w, h);
      for (let i = 0; i < L.length; i++) label(L[i], x + 10, y + 22 + i * 20, 13, '#d0d4da');
    }

    // 덮는 화면
    if (W.state !== 'play' || ui.paused || ui.ready) {
      c.fillStyle = 'rgba(8,8,10,0.72)'; c.fillRect(0, 0, cw, ch);
      const cx = cw * 0.5; let y = ch * 0.5 - 150;
      if (ui.ready) {
        label('염력', cx, y, 54, '#e3d6ff', 'center'); y += 34;
        label('시험판 — 줍고 · 돌리고 · 던지는 손이 재미있는지 보는 판', cx, y, 15, '#9aa0a8', 'center'); y += 50;
        for (const s of ['주변의 물건을 들어 몸 주위로 돌리고, 던져서 좀비 떼를 쓸어버린다.', '무게 한도가 곧 들 수 있는 개수이자 공격력이다. 레벨이 오르면 더 큰 것이 들린다.', '물건은 닳는다. 계속 새로 구해야 한다. 건물은 무거운 것을 던져 부수면 안의 것이 쏟아진다.', '동쪽 끝 공항의 대군을 비행기로 날려 버리면 끝.']) { label(s, cx, y, 16, '#d0d4da', 'center'); y += 26; }
        y += 18;
        for (const s of ['W A S D 이동', 'Shift + 클릭 · 드래그 = 들기', '좌클릭 = 가벼운 것부터 던지기 (누르고 있으면 연사)', '우클릭 = 가장 무거운 것 던지기', 'Shift + 큰 물체를 누르고 있기 = 한 방 모으기 → 우클릭으로 내리치기', 'Space 밀쳐내기 · X 전부 내려놓기']) { label(s, cx, y, 15, '#c9b8ff', 'center'); y += 24; }
        y += 24; label('클릭해서 시작', cx, y, 22, '#ffe9a8', 'center');
      } else if (W.state === 'dead' || W.state === 'win') {
        label(W.state === 'win' ? '공항의 대군을 쓸어버렸다' : '쓰러졌다', cx, y, 44, W.state === 'win' ? '#ffe9a8' : '#ff8a7a', 'center'); y += 60;
        const st = W.stats;
        for (const s of ['버틴 시간 ' + fmtT(W.t) + ' · 레벨 ' + p.level + ' · 무게 한도 ' + p.cap, '처치 ' + W.kills.toLocaleString() + ' · 대군 ' + W.hordeKilled.toLocaleString() + ' / ' + W.hordeTotal.toLocaleString(),
          '든 것 중 가장 무거운 것: ' + (W.heaviest ? W.heaviest.name + ' (' + W.heaviest.w + ')' : '없음'), '던진 횟수 ' + st.thrown + ' · 부순 건물 ' + st.buildings + ' · 쓴 한 방 ' + st.sets]) { label(s, cx, y, 17, '#d0d4da', 'center'); y += 28; }
        y += 24; label('R = 새 판 · Shift + R = 같은 씨앗으로 다시', cx, y, 18, '#ffe9a8', 'center');
      } else { label('멈춤', cx, ch * 0.5, 40, '#e8e8e8', 'center'); label('P = 계속', cx, ch * 0.5 + 40, 16, '#b8bcc4', 'center'); }
    }
  }
  function fmtT(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
})(typeof window !== 'undefined' ? window : globalThis);
