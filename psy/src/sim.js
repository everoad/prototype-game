// 판정: 좀비 · 줍기 · 돌리기 · 던지기 · 한 방 · 건물. 화면을 모른다(node에서도 돈다).
(function (G) {
  'use strict';
  const P = G.PSY, C = P.C, K = P.K, ZT = P.ZT, RING = P.RING;
  const CO = 20, CP = 40, CB = 2.5, TAU = Math.PI * 2;
  const rand = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  P.capOf = (L) => Math.round(C.capBase * Math.pow(C.capMul, L - 1));
  P.xpNeed = (L) => Math.round(C.xpBase * Math.pow(L, C.xpPow));
  P.tkRange = (W) => C.tkBase + W.player.level * C.tkPerLevel;

  // ───────── 판 만들기
  P.newWorld = function (seed) {
    const W = P.generate(seed);
    W.gw = Math.ceil(W.w / CO); W.gh = Math.ceil(W.h / CO);
    W.ogrid = new Array(W.gw * W.gh);
    W.nObjs = 0;
    const list = W.objs; W.objs = null;
    for (let i = 0; i < list.length; i++) groundAdd(W, list[i]);
    W.bw = Math.ceil(W.w / CB); W.bh = Math.ceil(W.h / CB);
    W.blocked = new Uint8Array(W.bw * W.bh);
    W.pw = Math.ceil(W.w / CP); W.ph = Math.ceil(W.h / CP);
    W.bgrid = new Array(W.pw * W.ph);
    for (const b of W.buildings) {
      markBlocked(W, b, 1);
      const cx0 = (b.x0 / CP) | 0, cx1 = Math.min(W.pw - 1, (b.x1 / CP) | 0), cy0 = (b.y0 / CP) | 0, cy1 = Math.min(W.ph - 1, (b.y1 / CP) | 0);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const i = cy * W.pw + cx; (W.bgrid[i] || (W.bgrid[i] = [])).push(b); }
    }
    W.player = { x: W.start.x, y: W.start.y, hp: C.hp, maxhp: C.hp, level: 1, xp: 0, cap: P.capOf(1), used: 0, pushCd: 0, fx: 1, fy: 0, hurtT: 99, flash: 0 };
    W.carried = []; W.thrown = []; W.zs = []; W.fx = []; W.banners = []; W.delayed = []; W.corpses = []; W.bodies = []; W.bid = 1;
    W.t = 0; W.kills = 0; W.hordeKilled = 0; W.state = 'play'; W.heaviest = null; W.cdL = 0; W.cdR = 0; W.armed = null;
    W.pid = 1; W.touch = 0; W.shake = 0; W.actT = 0; W.sec = 0; W.txtT = -9;
    W.stats = { thrown: 0, picked: 0, broken: 0, buildings: 0, sets: 0 };
    W.zg = { cs: 2, n: 200, ox: 0, oy: 0, head: new Int32Array(200 * 200), next: new Int32Array(8192) };
    W.ff = { n: 144, ox: 0, oy: 0, dist: new Uint16Array(144 * 144), q: new Int32Array(144 * 144), t: 0 };
    return W;
  };

  function markBlocked(W, b, v) {
    const x0 = Math.max(0, Math.floor((b.x0 - 0.2) / CB)), x1 = Math.min(W.bw - 1, Math.floor((b.x1 + 0.2) / CB));
    const y0 = Math.max(0, Math.floor((b.y0 - 0.2) / CB)), y1 = Math.min(W.bh - 1, Math.floor((b.y1 + 0.2) / CB));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = (x + 0.5) * CB, cy = (y + 0.5) * CB;
      if (cx > b.x0 - 0.2 && cx < b.x1 + 0.2 && cy > b.y0 - 0.2 && cy < b.y1 + 0.2) W.blocked[y * W.bw + x] = v;
    }
  }
  function blockedAt(W, x, y) {
    if (x < 0 || y < 0 || x >= W.w || y >= W.h) return true;
    return W.blocked[((y / CB) | 0) * W.bw + ((x / CB) | 0)] === 1;
  }
  function buildingAt(W, x, y) {
    if (x < 0 || y < 0 || x >= W.w || y >= W.h) return null;
    const a = W.bgrid[((y / CP) | 0) * W.pw + ((x / CP) | 0)];
    if (!a) return null;
    for (let i = 0; i < a.length; i++) { const b = a[i]; if (!b.dead && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return b; }
    return null;
  }
  function insideB(W, x, y, pad) {
    return !!(buildingAt(W, x - pad, y - pad) || buildingAt(W, x + pad, y - pad) || buildingAt(W, x - pad, y + pad) || buildingAt(W, x + pad, y + pad));
  }
  P.buildingAt = buildingAt;

  // ───────── 바닥의 물건
  function groundAdd(W, o) {
    if (o.x < 0.5) o.x = 0.5; else if (o.x > W.w - 0.5) o.x = W.w - 0.5;
    if (o.y < 0.5) o.y = 0.5; else if (o.y > W.h - 0.5) o.y = W.h - 0.5;
    const ci = ((o.y / CO) | 0) * W.gw + ((o.x / CO) | 0);
    (W.ogrid[ci] || (W.ogrid[ci] = [])).push(o);
    o.ci = ci; o.st = 0; W.nObjs++;
  }
  function groundRemove(W, o) {
    const a = W.ogrid[o.ci]; if (!a) return;
    const i = a.indexOf(o);
    if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); W.nObjs--; }
  }
  function eachGround(W, x0, y0, x1, y1, fn) {
    const cx0 = Math.max(0, (x0 / CO) | 0), cx1 = Math.min(W.gw - 1, (x1 / CO) | 0);
    const cy0 = Math.max(0, (y0 / CO) | 0), cy1 = Math.min(W.gh - 1, (y1 / CO) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const a = W.ogrid[cy * W.gw + cx];
      if (a) for (let i = a.length - 1; i >= 0; i--) { if (i < a.length) fn(a[i]); }
    }
  }
  P.eachGround = eachGround;
  function newObj(id, x, y) { const k = K[id]; return { k, x, y, dur: k.dur, r: rand() < 0.5 ? 1 : 0, st: 0, cd: 0, ttl: 0, ang: 0 }; }

  // ───────── 알림 · 효과
  function banner(W, s) { W.banners.push({ s, life: 4 }); if (W.banners.length > 5) W.banners.shift(); }
  function text(W, x, y, s, col) { W.fx.push({ t: 3, x, y, r: 0, life: 1.2, max: 1.2, s, col: col || '#e8e8e8' }); }
  function hint(W, s) { if (W.t - W.txtT < 0.5) return; W.txtT = W.t; text(W, W.player.x, W.player.y, s, '#ffd27a'); }
  function fxRing(W, x, y, r, t, life) { W.fx.push({ t, x, y, r, life, max: life }); }

  // ───────── 좀비 격자
  function buildZGrid(W) {
    const zg = W.zg, zs = W.zs, n = zg.n, cs = zg.cs;
    zg.ox = Math.floor(W.player.x / cs) - (n >> 1); zg.oy = Math.floor(W.player.y / cs) - (n >> 1);
    zg.head.fill(-1);
    if (zg.next.length < zs.length) zg.next = new Int32Array(zs.length * 2);
    const head = zg.head, next = zg.next;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const cx = Math.floor(z.x / cs) - zg.ox, cy = Math.floor(z.y / cs) - zg.oy;
      if (cx < 0 || cy < 0 || cx >= n || cy >= n) { z.c = -1; continue; }
      const c = cy * n + cx; z.c = c; next[i] = head[c]; head[c] = i;
    }
  }
  function zQuery(W, x, y, r, fn) {
    const zg = W.zg, zs = W.zs, n = zg.n, cs = zg.cs, head = zg.head, next = zg.next;
    const rr = (r + 0.3) * (r + 0.3);
    const x0 = Math.max(0, Math.floor((x - r - 0.3) / cs) - zg.ox), x1 = Math.min(n - 1, Math.floor((x + r + 0.3) / cs) - zg.ox);
    const y0 = Math.max(0, Math.floor((y - r - 0.3) / cs) - zg.oy), y1 = Math.min(n - 1, Math.floor((y + r + 0.3) / cs) - zg.oy);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = head[cy * n + cx]; i >= 0; i = next[i]) {
        const z = zs[i]; if (z.dead) continue;
        const dx = z.x - x, dy = z.y - y;
        if (dx * dx + dy * dy <= rr) fn(z);
      }
    }
  }
  function zAll(W, x, y, r, fn) {
    if (r <= 30) return zQuery(W, x, y, r, fn);
    const zs = W.zs, rr = r * r;
    for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z.dead) continue; const dx = z.x - x, dy = z.y - y; if (dx * dx + dy * dy <= rr) fn(z); }
  }

  // ───────── 좀비: 나타나고 사라지기
  function spawnZ(W, x, y, t, horde) {
    W.zs.push({ x, y, kx: 0, ky: 0, hp: ZT[t].hp, t, st: 0, gx: 0, gy: 0, tm: rand() * 3, hit: -9, proj: 0, bid: 0, stun: 0, horde, wa: 0, wv: 0, dead: false, gone: false, c: -1 });
  }
  function spawnCell(W, cx, cy, n, t, horde) {
    for (let k = 0; k < n; k++) {
      let x, y, tr = 0;
      do { x = (cx + rand()) * CP; y = (cy + rand()) * CP; } while (blockedAt(W, x, y) && ++tr < 8);
      spawnZ(W, x, y, t, horde);
    }
  }
  function activate(W) {
    const p = W.player, pcx = (p.x / CP) | 0, pcy = (p.y / CP) | 0;
    for (let cy = pcy - 7; cy <= pcy + 7; cy++) for (let cx = pcx - 7; cx <= pcx + 7; cx++) {
      if (cx < 0 || cy < 0 || cx >= W.pw || cy >= W.ph) continue;
      const i = cy * W.pw + cx, n = W.popS[i] + W.popR[i] + W.popHS[i] + W.popHR[i];
      if (!n) continue;
      const far = Math.hypot((cx + 0.5) * CP - p.x, (cy + 0.5) * CP - p.y);
      if (far > C.actR && !(far <= C.hordeActR && W.popHS[i] + W.popHR[i] > 0)) continue;   // 대군은 멀리서부터 서 있다
      if (W.zs.length + n > C.maxZ) continue;
      spawnCell(W, cx, cy, W.popS[i], 0, false); spawnCell(W, cx, cy, W.popR[i], 1, false);
      spawnCell(W, cx, cy, W.popHS[i], 0, true); spawnCell(W, cx, cy, W.popHR[i], 1, true);
      W.popS[i] = W.popR[i] = W.popHS[i] = W.popHR[i] = 0;
    }
  }
  function returnToPop(W, z) {
    const i = clamp((z.y / CP) | 0, 0, W.ph - 1) * W.pw + clamp((z.x / CP) | 0, 0, W.pw - 1);
    const a = z.horde ? (z.t ? W.popHR : W.popHS) : (z.t ? W.popR : W.popS);
    if (a[i] < 65535) a[i]++;
  }

  // ───────── 길 찾기: 플레이어에서 퍼져 나가는 거리 지도
  function flow(W) {
    const ff = W.ff, n = ff.n, dist = ff.dist, q = ff.q, bw = W.bw, bh = W.bh, bl = W.blocked;
    ff.ox = Math.floor(W.player.x / CB) - (n >> 1); ff.oy = Math.floor(W.player.y / CB) - (n >> 1);
    dist.fill(65535);
    let qh = 0, qt = 0;
    const s = (n >> 1) * n + (n >> 1);
    dist[s] = 0; q[qt++] = s;
    while (qh < qt) {
      const c = q[qh++], cx = c % n, cy = (c / n) | 0, d = dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const ni = ny * n + nx;
        if (dist[ni] !== 65535) continue;
        const wx = nx + ff.ox, wy = ny + ff.oy;
        if (wx < 0 || wy < 0 || wx >= bw || wy >= bh || bl[wy * bw + wx]) continue;
        dist[ni] = d; q[qt++] = ni;
      }
    }
  }
  const FD = { x: 0, y: 0 };
  function flowDir(W, z) {
    const ff = W.ff, n = ff.n, dist = ff.dist;
    const cx = Math.floor(z.x / CB) - ff.ox, cy = Math.floor(z.y / CB) - ff.oy;
    if (cx < 1 || cy < 1 || cx >= n - 1 || cy >= n - 1) return false;
    const here = dist[cy * n + cx];
    if (here === 65535 || here < 3) return false;
    let best = here, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const d = dist[(cy + oy) * n + cx + ox];
      if (d >= best) continue;
      if (ox && oy && (dist[cy * n + cx + ox] === 65535 || dist[(cy + oy) * n + cx] === 65535)) continue;
      best = d; bx = ox; by = oy;
    }
    if (!bx && !by) return false;
    const m = bx && by ? 0.7071 : 1;
    FD.x = bx * m; FD.y = by * m;
    return true;
  }

  // ───────── 좀비: 맞고 죽기
  function addXp(W, n) {
    const p = W.player;
    p.xp += n;
    while (p.xp >= P.xpNeed(p.level)) {
      p.xp -= P.xpNeed(p.level); p.level++;
      const old = p.cap; p.cap = P.capOf(p.level);
      p.hp = Math.min(p.maxhp, p.hp + 15);
      banner(W, '레벨 ' + p.level + ' — 무게 한도 ' + old + ' → ' + p.cap);
      for (const k of P.MILESTONES) if (k.w > old && k.w <= p.cap) banner(W, '이제 들 수 있다: ' + k.name + ' (' + k.w + ')');
      for (const k of P.SETKINDS) if (k.w > old * C.setMul && k.w <= p.cap * C.setMul) banner(W, '한 방으로 쓸 수 있다: ' + k.name);
    }
  }
  function corpseAt(W, x, y) {
    if (W.corpses.length >= C.corpseMax) { const old = W.corpses.shift(); if (old.st === 0 && old.ttl > 0) { groundRemove(W, old); old.st = 9; } }
    const o = newObj('corpse', x, y); o.ttl = W.t + C.corpseTtl;
    groundAdd(W, o); W.corpses.push(o);
  }
  // (vx, vy, vz) = 날아가는 속도(m/s). 느리면 그 자리에 쓰러진다.
  function killZ(W, z, vx, vy, vz) {
    z.dead = true; W.kills++;
    if (z.horde) W.hordeKilled++;
    addXp(W, ZT[z.t].xp);
    const sp = Math.hypot(vx || 0, vy || 0);
    if (sp < 2 || W.bodies.length >= C.bodyMax) { corpseAt(W, z.x, z.y); return; }
    const a = Math.atan2(vy, vx) + (rand() - 0.5) * 0.7, s = sp * (0.75 + rand() * 0.5);   // 한 줄로 날아가지 않게 흩는다
    W.bodies.push({ x: z.x, y: z.y, z: 0.6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: vz * (0.8 + rand() * 0.4), ang: rand() * TAU, spin: (rand() < 0.5 ? -1 : 1) * (5 + s * 0.5), t: z.t, hits: C.bodyHits, id: W.bid++, life: 0, done: false });
  }
  function hurtZ(W, z, dmg, kx, ky, up) {
    if (z.dead) return;
    z.hp -= dmg;
    if (z.hp <= 0) { killZ(W, z, kx * C.bodyKick, ky * C.bodyKick, up !== undefined ? up : 2 + Math.hypot(kx, ky) * 0.45); return; }
    z.kx += kx; z.ky += ky;
    if (z.stun < 0.15) z.stun = 0.15;
    z.st = 2;
  }
  // 날아가는 몸: 포물선으로 날고, 땅에 닿으면 튕기고 미끄러지다 멈춰 시체가 된다. 낮게 지나가며 좀비를 쓰러뜨린다.
  function stepBodies(W, dt) {
    const bs = W.bodies, n = bs.length;
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      b.life += dt;
      b.vz -= C.bodyG * dt; b.z += b.vz * dt;
      let ground = false;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -4) { b.vz = -b.vz * 0.32; b.vx *= 0.72; b.vy *= 0.72; b.spin *= 0.6; if (W.fx.length < 300) fxRing(W, b.x, b.y, 0.9, 2, 0.25); }
        else { b.vz = 0; ground = true; }
      }
      let sp = Math.hypot(b.vx, b.vy);
      if (ground && sp > 0) { const ns = Math.max(0, sp - C.bodyFric * dt); b.vx *= ns / sp; b.vy *= ns / sp; sp = ns; }
      let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (blockedAt(W, nx, ny) && !blockedAt(W, b.x, b.y)) {            // 벽에 부딪혀 떨어진다
        if (!blockedAt(W, nx, b.y)) { ny = b.y; b.vy *= -0.3; b.vx *= 0.6; }
        else if (!blockedAt(W, b.x, ny)) { nx = b.x; b.vx *= -0.3; b.vy *= 0.6; }
        else { nx = b.x; ny = b.y; b.vx *= -0.3; b.vy *= -0.3; }
        sp = Math.hypot(b.vx, b.vy);
      }
      b.x = nx; b.y = ny;
      b.ang += b.spin * dt * (ground ? Math.min(1, sp / 8) : 1);
      if (b.hits > 0 && b.z < 1.4 && sp > 5) {
        zQuery(W, b.x, b.y, 0.55, (q) => {
          if (q.bid === b.id || b.hits <= 0) return;
          q.bid = b.id; b.hits--;
          q.stun = Math.max(q.stun, 0.6 + sp * 0.04);
          if (sp > C.bodyHurtSp) hurtZ(W, q, C.bodyDmg, b.vx * 0.35, b.vy * 0.35);
          else { q.kx += b.vx * 0.35; q.ky += b.vy * 0.35; q.st = 2; }
          b.vx *= 0.82; b.vy *= 0.82;
        });
      }
      if ((ground && sp < 1) || b.life > 6) { b.done = true; corpseAt(W, b.x, b.y); }
    }
    let w = 0;
    for (let i = 0; i < bs.length; i++) if (!bs[i].done) bs[w++] = bs[i];
    bs.length = w;
  }
  function burst(W, x, y, r, knock, stun) {
    zQuery(W, x, y, r, (z) => {
      const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy) || 1;
      z.kx += dx / d * knock; z.ky += dy / d * knock; z.stun = Math.max(z.stun, stun); z.st = 2;
    });
    fxRing(W, x, y, r, 4, 0.4);
  }
  function noise(W, x, y, r) {
    if (!C.soundOn) return;
    fxRing(W, x, y, r, 0, 0.7);
    zAll(W, x, y, r, (z) => { if (z.st !== 2) { z.st = 1; z.gx = x; z.gy = y; z.tm = 8; } });
  }

  // ───────── 부서지기 · 폭발 · 건물
  function debris(W, x, y, w) {
    if (w < 20) return;
    const n = clamp(Math.round(Math.log2(w / 6)), 1, 8), sp = 1 + Math.cbrt(w) * 0.25;
    for (let i = 0; i < n; i++) groundAdd(W, newObj(w >= 1000 && i % 4 === 3 ? 'tire' : 'scrap', x + (rand() - 0.5) * 2 * sp, y + (rand() - 0.5) * 2 * sp));
  }
  // 물건이 끝나는 자리: 성질에 따라 터지거나 깨지거나 조각이 남는다. (이미 어느 목록에서도 빠진 뒤에 부른다)
  function finish(W, o) {
    const k = o.k; o.st = 9; W.stats.broken++;
    if (k.boom) explode(W, o.x, o.y, k.boom, k.w);
    else if (k.glass) { zQuery(W, o.x, o.y, 2.6, (z) => { const dx = z.x - o.x, dy = z.y - o.y, d = Math.hypot(dx, dy) || 1; hurtZ(W, z, 8, dx / d * 3, dy / d * 3); }); fxRing(W, o.x, o.y, 2.6, 2, 0.3); }
    else if (k.push) burst(W, o.x, o.y, 6, 16, 2.5);
    else { debris(W, o.x, o.y, k.w); if (k.w >= 20) fxRing(W, o.x, o.y, 1 + Math.cbrt(k.w) * 0.3, 2, 0.5); }
  }
  function explode(W, x, y, r, w) {
    fxRing(W, x, y, r, 1, 0.6);
    W.shake = Math.max(W.shake, Math.min(1.2, r / 14));
    noise(W, x, y, r * 7);
    zAll(W, x, y, r, (z) => { const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy) || 1, f = 1 - Math.min(1, d / r) * 0.6; hurtZ(W, z, 9999, dx / d * 14 * f, dy / d * 14 * f, 5 + 7 * f); });
    const p = W.player;
    if (Math.hypot(p.x - x, p.y - y) < r * 0.5) { p.hp -= 20; p.hurtT = 0; p.flash = 0.3; }
    const hit = [];
    for (let cy = Math.max(0, ((y - r) / CP) | 0); cy <= Math.min(W.ph - 1, ((y + r) / CP) | 0); cy++)
      for (let cx = Math.max(0, ((x - r) / CP) | 0); cx <= Math.min(W.pw - 1, ((x + r) / CP) | 0); cx++) {
        const a = W.bgrid[cy * W.pw + cx]; if (!a) continue;
        for (const b of a) {
          if (b.dead || hit.indexOf(b) >= 0) continue;
          const nx = clamp(x, b.x0, b.x1), ny = clamp(y, b.y0, b.y1);
          if (Math.hypot(nx - x, ny - y) <= r) hit.push(b);
        }
      }
    for (const b of hit) if (w * 4 >= b.T.armor) { b.hp -= w * 40; if (b.hp <= 0) destroyBuilding(W, b); }
    eachGround(W, x - r, y - r, x + r, y + r, (o) => {
      if (o.k.boom && !o.fuse && Math.hypot(o.x - x, o.y - y) <= r) { o.fuse = true; W.delayed.push({ t: W.t + 0.12 + rand() * 0.25, o }); }
    });
  }
  function destroyBuilding(W, b) {
    if (b.dead) return;
    b.dead = true; markBlocked(W, b, 0); W.stats.buildings++;
    const spill = (list) => {
      for (const e of list) {
        const n = e[1] + Math.floor(rand() * (e[2] - e[1] + 1));
        for (let i = 0; i < n; i++) groundAdd(W, newObj(e[0], b.x0 + rand() * (b.x1 - b.x0), b.y0 + rand() * (b.y1 - b.y0)));
      }
    };
    spill(b.T.loot); spill(b.T.rub);
    const cx = (b.x0 + b.x1) * 0.5, cy = (b.y0 + b.y1) * 0.5;
    fxRing(W, cx, cy, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.7, 2, 1.0);
    text(W, cx, cy, b.T.name + ' 붕괴', '#ffd27a');
    W.shake = Math.max(W.shake, 0.6);
    noise(W, cx, cy, 90);
    W.ff.t = 0;
  }
  function hitBuilding(W, b, o) {
    if (o.k.w < b.T.armor) { if (W.t - W.txtT > 0.4) { W.txtT = W.t; text(W, o.x, o.y, '튕겨남 — 더 무거운 것이 필요하다', '#b0b0b0'); } return; }
    b.hp -= o.k.w * C.throwDmg;
    fxRing(W, o.x, o.y, 2 + Math.cbrt(o.k.w) * 0.3, 2, 0.4);
    if (b.hp <= 0) destroyBuilding(W, b);
  }

  // ───────── 줍기 · 내려놓기
  function sortCarried(W) { W.carried.sort((a, b) => a.k.w - b.k.w); }
  function dropObj(W, o) {
    const i = W.carried.indexOf(o); if (i < 0) return;
    W.carried.splice(i, 1); W.player.used -= o.k.w;
    groundAdd(W, o);
  }
  function tryPick(W, o, single) {
    const p = W.player, w = o.k.w;
    if (Math.hypot(o.x - p.x, o.y - p.y) > P.tkRange(W) + 1) { if (single) hint(W, '너무 멀다'); return false; }
    if (w > p.cap) { if (single) hint(W, o.k.name + ' 무게 ' + w + ' — 한도 ' + p.cap); return false; }
    if (p.used + w > p.cap) {
      if (!single) return false;
      while (p.used + w > p.cap && W.carried.length) dropObj(W, W.carried[0]);
    }
    groundRemove(W, o);
    o.st = 2; o.cd = 0; o.ttl = 0; o.fuse = false;
    W.carried.push(o); p.used += w; W.stats.picked++;
    if (!W.heaviest || w > W.heaviest.w) W.heaviest = o.k;
    return true;
  }
  P.pickAt = function (W, x, y) {
    let best = null, bd = 1e9;
    eachGround(W, x - 7, y - 7, x + 7, y + 7, (o) => {
      const k = o.k, hx = (o.r ? k.sy : k.sx) * 0.5, hy = (o.r ? k.sx : k.sy) * 0.5;
      const dx = Math.max(0, Math.abs(o.x - x) - hx), dy = Math.max(0, Math.abs(o.y - y) - hy), d = Math.hypot(dx, dy) - (k.w > 100 ? 0.5 : 0);
      if (d < bd || (d === bd && best && k.w > best.k.w)) { bd = d; best = o; }
    });
    if (!best || bd > 0.9) return false;
    const ok = tryPick(W, best, true);
    if (ok) sortCarried(W);
    return ok;
  };
  P.pickBox = function (W, x0, y0, x1, y1) {
    const p = W.player, r = P.tkRange(W), list = [];
    eachGround(W, Math.max(x0, p.x - r), Math.max(y0, p.y - r), Math.min(x1, p.x + r), Math.min(y1, p.y + r), (o) => {
      if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) return;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d <= r) { o._d = d + (o.k.id === 'corpse' ? 1e6 : 0); list.push(o); }
    });
    list.sort((a, b) => a._d - b._d);
    let n = 0, heavy = null;
    for (const o of list) { if (tryPick(W, o, false)) n++; else if (o.k.w > p.cap && (!heavy || o.k.w < heavy.k.w)) heavy = o; }
    if (n) sortCarried(W);
    else if (heavy) hint(W, heavy.k.name + ' 무게 ' + heavy.k.w + ' — 한도 ' + p.cap);
    else if (list.length) hint(W, '한도가 찼다 (' + p.used + ' / ' + p.cap + ')');
    return n;
  };
  P.dropAll = function (W) { while (W.carried.length) dropObj(W, W.carried[W.carried.length - 1]); };

  // ───────── 돌리기
  const cnt = [0, 0, 0, 0];
  function stepCarried(W, dt) {
    const p = W.player, car = W.carried;
    cnt[0] = cnt[1] = cnt[2] = cnt[3] = 0;
    for (let i = 0; i < car.length; i++) car[i].slot = cnt[car[i].k.cls]++;
    let broke = null;
    for (let i = 0; i < car.length; i++) {
      const o = car[i], k = o.k, R = RING[k.cls];
      const per = Math.max(6, Math.floor(TAU * R.r / R.sp)), layer = Math.floor(o.slot / per), inL = Math.min(per, cnt[k.cls] - layer * per);
      const a = (layer % 2 ? -1 : 1) * W.t * TAU / R.T + TAU * (o.slot % per) / inL + layer * 0.5, rr = R.r + layer * R.dl;
      const f = Math.min(1, dt * 9);
      o.x += (p.x + Math.cos(a) * rr - o.x) * f; o.y += (p.y + Math.sin(a) * rr - o.y) * f; o.ang = a;
      if (o.cd > 0) o.cd -= dt;
      const heavy = k.pierce > 0;
      if (!heavy && o.cd > 0) continue;
      const knock = Math.min(14, 3 + Math.sqrt(k.w));
      zQuery(W, o.x, o.y, k.hitR, (z) => {
        if (o.dur <= 0) return;
        if (heavy) { if (W.t - z.hit < 0.45) return; } else if (o.cd > 0) return;
        z.hit = W.t;
        const ux = z.x - p.x, uy = z.y - p.y, ud = Math.hypot(ux, uy) || 1;
        hurtZ(W, z, k.w * C.orbitDmg, ux / ud * knock, uy / ud * knock);
        o.dur--; if (!heavy) o.cd = C.lightCd;
      });
      if (o.dur <= 0) (broke || (broke = [])).push(o);
    }
    if (broke) for (const o of broke) { const i = car.indexOf(o); if (i >= 0) { car.splice(i, 1); p.used -= o.k.w; finish(W, o); } }
  }

  // ───────── 던지기
  function throwObj(W, o, ax, ay) {
    const p = W.player, car = W.carried, i = car.indexOf(o); if (i < 0) return;
    car.splice(i, 1); p.used -= o.k.w; W.stats.thrown++;
    let dx = ax - p.x, dy = ay - p.y, d = Math.hypot(dx, dy) || 1;
    const aim = Math.max(d, 9), tx = p.x + dx / d * aim, ty = p.y + dy / d * aim;   // 고리 위의 자리에서 조준한 곳으로 모인다
    dx = tx - o.x; dy = ty - o.y; d = Math.hypot(dx, dy) || 1;
    const sp = 50 - 4 * Math.log10(o.k.w + 1);
    o.vx = dx / d * sp; o.vy = dy / d * sp; o.sp = sp; o.ang = Math.atan2(dy, dx);
    o.left = o.k.cls >= 2 ? 48 : 38; o.pl = o.k.pierce; o.bn = o.k.bounce ? 4 : 0; o.id = W.pid++; o.st = 3;
    W.thrown.push(o);
  }
  function land(W, o) {
    const k = o.k;
    noise(W, o.x, o.y, 8 + 6 * Math.log10(k.w + 1));
    if (k.w >= 1000) W.shake = Math.max(W.shake, 0.35);
    if (k.boom || k.glass || k.push || o.dur <= 0) { finish(W, o); return; }
    if (k.w >= 60) fxRing(W, o.x, o.y, 1 + Math.cbrt(k.w) * 0.25, 2, 0.4);
    groundAdd(W, o);
  }
  function stepThrown(W, dt) {
    const th = W.thrown;
    for (let i = th.length - 1; i >= 0; i--) {
      const o = th[i], k = o.k, step = o.sp * dt;
      const nx = o.x + o.vx * dt, ny = o.y + o.vy * dt;
      let stop = false;
      const b = buildingAt(W, nx, ny);
      if (b) { hitBuilding(W, b, o); o.dur -= 3; if (!b.dead || k.w < 1000) stop = true; }
      if (!stop) {
        o.x = nx; o.y = ny; o.left -= step;
        const knock = Math.min(16, 4 + Math.sqrt(k.w));
        zQuery(W, o.x, o.y, k.hitR, (z) => {
          if (stop || z.proj === o.id) return;
          z.proj = o.id;
          hurtZ(W, z, k.w * C.throwDmg, o.vx / o.sp * knock, o.vy / o.sp * knock);
          o.dur--;
          if (k.boom || k.glass || k.push || o.dur <= 0) { stop = true; return; }
          if (o.bn > 0) {                                  // 타이어: 가까운 다른 좀비로 튕긴다
            let best = null, bd = 144;
            zQuery(W, o.x, o.y, 12, (q) => { if (q.proj === o.id || q.dead) return; const d2 = (q.x - o.x) * (q.x - o.x) + (q.y - o.y) * (q.y - o.y); if (d2 < bd) { bd = d2; best = q; } });
            if (best) { const d = Math.sqrt(bd) || 1; o.vx = (best.x - o.x) / d * o.sp; o.vy = (best.y - o.y) / d * o.sp; o.ang = Math.atan2(o.vy, o.vx); o.bn--; o.left = Math.max(o.left, 14); return; }
          }
          if (--o.pl < 0) stop = true;
        });
      }
      if (stop || o.left <= 0 || o.x < 1 || o.y < 1 || o.x > W.w - 1 || o.y > W.h - 1) { th[i] = th[th.length - 1]; th.pop(); land(W, o); }
    }
  }
  function stepThrow(W, dt, inp) {
    W.cdL -= dt; W.cdR -= dt;
    const car = W.carried;
    if (inp.fireL && W.cdL <= 0 && car.length) { const o = car[0]; throwObj(W, o, inp.ax, inp.ay); W.cdL = 0.07 + 0.012 * Math.sqrt(o.k.w); }
    if (inp.fireR && W.cdR <= 0 && car.length && !W.armed) { const o = car[car.length - 1]; throwObj(W, o, inp.ax, inp.ay); W.cdR = 0.18 + 0.012 * Math.sqrt(o.k.w); }
  }

  // ───────── 한 방
  P.setAt = function (W, x, y) {
    let best = null, bd = 1e9;
    for (const s of W.sets) {
      if (s.st !== 0) continue;
      const d = Math.hypot(s.x - x, s.y - y) - Math.max(3, Math.max(s.k.sx, s.k.sy) * 0.45);
      if (d < bd) { bd = d; best = s; }
    }
    return bd <= 0 ? best : null;
  };
  P.canCharge = function (W, s, quiet) {
    const p = W.player;
    if (W.armed) { if (!quiet) hint(W, '이미 한 방을 들고 있다'); return false; }
    if (s.k.w > p.cap * C.setMul) { if (!quiet) hint(W, s.k.name + ' — 아직 못 든다 (한도 ' + Math.ceil(s.k.w / C.setMul) + ' 필요)'); return false; }
    if (Math.hypot(s.x - p.x, s.y - p.y) > C.setRange + Math.max(s.k.sx, s.k.sy) * 0.5) { if (!quiet) hint(W, '더 가까이 가야 한다'); return false; }
    return true;
  };
  P.chargeNeed = (W, s) => clamp(2 + 1.2 * s.k.w / W.player.cap, 2.5, 14);
  function stepSets(W, dt, inp) {
    const p = W.player;
    for (const s of W.sets) {
      if (s.st === 0) {
        if (inp.chargeSet === s && P.canCharge(W, s, true)) {
          s.charge += dt / P.chargeNeed(W, s);
          if (s.charge >= 1) { s.charge = 1; s.st = 1; W.armed = s; inp.chargeSet = null; banner(W, s.k.name + ' 준비됨 — 우클릭한 곳에 내리친다'); noise(W, s.x, s.y, 40); }
        } else if (s.charge > 0) s.charge = Math.max(0, s.charge - dt * 0.4);
      } else if (s.st === 1) {
        if (Math.hypot(s.x - p.x, s.y - p.y) > C.setReach) { s.st = 0; s.charge = 0; W.armed = null; banner(W, '너무 멀어져 ' + s.k.name + '을(를) 놓쳤다'); }
      } else if (s.st === 2) {
        s.ft += dt / s.fd;
        if (s.ft >= 1) impact(W, s);
      }
    }
  }
  P.slam = function (W, x, y) {
    const s = W.armed; if (!s || s.st !== 1) return false;
    let dx = x - s.x, dy = y - s.y; const d = Math.hypot(dx, dy);
    if (d > C.setReach) { dx *= C.setReach / d; dy *= C.setReach / d; }
    s.fx0 = s.x; s.fy0 = s.y; s.tx = s.x + dx; s.ty = s.y + dy; s.ft = 0; s.fd = 0.6 + Math.min(d, C.setReach) / 60; s.st = 2;
    W.armed = null;
    return true;
  };
  function impact(W, s) {
    const k = s.k, r = k.blast, x = s.tx, y = s.ty;
    s.x = x; s.y = y; s.st = 3; W.stats.sets++;
    let n = 0;
    zAll(W, x, y, r, (z) => { n++; const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy) || 1, f = 1 - Math.min(1, d / r) * 0.7; killZ(W, z, dx / d * 30 * f, dy / d * 30 * f, 6 + 9 * f); });
    for (const b of W.buildings) {
      if (b.dead) continue;
      const nx = clamp(x, b.x0, b.x1), ny = clamp(y, b.y0, b.y1);
      if (Math.hypot(nx - x, ny - y) <= r) { b.hp -= k.w * 30; if (b.hp <= 0) destroyBuilding(W, b); }
    }
    eachGround(W, x - r, y - r, x + r, y + r, (o) => {
      if (o.k.boom && !o.fuse && Math.hypot(o.x - x, o.y - y) <= r) { o.fuse = true; W.delayed.push({ t: W.t + 0.1 + rand() * 0.4, o }); }
    });
    const pieces = 6 + Math.round(k.w / 3000);
    for (let i = 0; i < pieces; i++) { const a = rand() * TAU, d = rand() * r * 0.8; groundAdd(W, newObj(i % 5 === 4 ? 'rubble' : 'scrap', x + Math.cos(a) * d, y + Math.sin(a) * d)); }
    if (k.id === 'plane') for (let i = 0; i < 4; i++) groundAdd(W, newObj('engine', x + (rand() - 0.5) * r, y + (rand() - 0.5) * r));
    fxRing(W, x, y, r, 1, 0.9); fxRing(W, x, y, r * 1.3, 2, 1.4);
    W.shake = Math.max(W.shake, 1.5);
    noise(W, x, y, 250);
    banner(W, k.name + ' — ' + n + '마리');
    W.ff.t = 0;
  }

  // ───────── 플레이어
  function stepPlayer(W, dt, inp) {
    const p = W.player, m = Math.hypot(inp.mx, inp.my);
    if (m > 0) {
      const f = W.touch >= 3 ? 0.3 : W.touch >= 1 ? 0.6 : 1, v = C.speed * f * dt / m;
      const nx = clamp(p.x + inp.mx * v, 1, W.w - 1), ny = clamp(p.y + inp.my * v, 1, W.h - 1);
      const stuck = insideB(W, p.x, p.y, 0.5);
      if (stuck || !insideB(W, nx, p.y, 0.5)) p.x = nx;
      if (stuck || !insideB(W, p.x, ny, 0.5)) p.y = ny;
    }
    const ax = inp.ax - p.x, ay = inp.ay - p.y, ad = Math.hypot(ax, ay) || 1;
    p.fx = ax / ad; p.fy = ay / ad;
    if (p.pushCd > 0) p.pushCd -= dt;
    if (inp.push && p.pushCd <= 0) { p.pushCd = C.pushCd; burst(W, p.x, p.y, C.pushR, 18, 1.2); }
    p.hurtT += dt; if (p.flash > 0) p.flash -= dt;
    if (p.hurtT > C.regenWait && p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + C.regen * dt);
  }

  // ───────── 좀비 한 틱
  function stepZombies(W, dt) {
    const p = W.player, zs = W.zs, desp2 = C.despawnR * C.despawnR;
    let touching = 0, dmg = 0;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i]; if (z.dead) continue;
      const dx = p.x - z.x, dy = p.y - z.y, d2 = dx * dx + dy * dy;
      if (d2 > desp2 && !z.horde) { returnToPop(W, z); z.dead = true; z.gone = true; continue; }
      const T = ZT[z.t];
      let vx = 0, vy = 0;
      if (z.stun > 0) z.stun -= dt;
      else {
        const d = Math.sqrt(d2) || 0.01;
        if (z.st === 0) {
          if (d < (z.horde ? C.hordeSight : C.sight)) { z.st = 2; z.tm = 0; }
          else { z.tm -= dt; if (z.tm <= 0) { z.tm = 1 + rand() * 3; z.wa = rand() * TAU; z.wv = rand() < 0.5 ? 0 : 0.35; } vx = Math.cos(z.wa) * z.wv; vy = Math.sin(z.wa) * z.wv; }
        } else if (z.st === 1) {
          if (d < (z.horde ? C.hordeSight : C.sight)) { z.st = 2; z.tm = 0; }
          else {
            const ex = z.gx - z.x, ey = z.gy - z.y, ed = Math.hypot(ex, ey);
            z.tm -= dt;
            if (ed < 3 || z.tm <= 0) { z.st = 0; z.tm = 0; } else { vx = ex / ed * T.sp; vy = ey / ed * T.sp; }
          }
        }
        if (z.st === 2) {
          if (d > C.lose) { z.tm += dt; if (z.tm > 8) { z.st = 0; z.tm = 0; } } else z.tm = 0;
          // 앞이 트여 있으면 곧장 온다(넓게 퍼진 떼). 건물에 막히면 거리 지도를 따라 돌아온다.
          const ux = dx / d, uy = dy / d;
          const open = d <= 10 || !(blockedAt(W, z.x + ux * 2.5, z.y + uy * 2.5) || blockedAt(W, z.x + ux * 5, z.y + uy * 5) || blockedAt(W, z.x + ux * 8, z.y + uy * 8));
          if (!open && flowDir(W, z)) { vx = FD.x * T.sp; vy = FD.y * T.sp; } else { vx = ux * T.sp; vy = uy * T.sp; }
        }
      }
      if (z.kx || z.ky) {
        vx += z.kx; vy += z.ky;
        const f = Math.max(0, 1 - 6 * dt); z.kx *= f; z.ky *= f;
        if (Math.abs(z.kx) + Math.abs(z.ky) < 0.05) z.kx = z.ky = 0;
      }
      let nx = z.x + vx * dt, ny = z.y + vy * dt;
      if (blockedAt(W, nx, ny) && !blockedAt(W, z.x, z.y)) {
        if (!blockedAt(W, nx, z.y)) ny = z.y; else if (!blockedAt(W, z.x, ny)) nx = z.x; else { nx = z.x; ny = z.y; }
      }
      const px = p.x - nx, py = p.y - ny, pd2 = px * px + py * py;
      if (pd2 < 0.81) {
        touching++;
        const pd = Math.sqrt(pd2) || 0.01; nx = p.x - px / pd * 0.9; ny = p.y - py / pd * 0.9;
        if (z.stun <= 0) dmg += T.dps * dt;
      }
      z.x = nx; z.y = ny;
    }
    // 서로 겹치지 않게
    const zg = W.zg, n = zg.n, head = zg.head, next = zg.next;
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i]; if (a.dead || a.c < 0) continue;
      const cx = a.c % n, cy = (a.c / n) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const x2 = cx + ox, y2 = cy + oy; if (x2 < 0 || y2 < 0 || x2 >= n || y2 >= n) continue;
        for (let j = head[y2 * n + x2]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const b = zs[j]; if (b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 < 0.49 && d2 > 1e-6) { const d = Math.sqrt(d2), s = (0.7 - d) * 0.5 / d; a.x -= dx * s; a.y -= dy * s; b.x += dx * s; b.y += dy * s; }
        }
      }
    }
    W.touch = touching;
    if (dmg > 0) { p.hp -= dmg; p.hurtT = 0; p.flash = 0.15; }
  }

  // ───────── 한 틱
  P.step = function (W, dt, inp) {
    if (W.state !== 'play') return;
    W.t += dt;
    const p = W.player;
    stepPlayer(W, dt, inp);
    W.actT -= dt; if (W.actT <= 0) { W.actT = 0.5; activate(W); }
    W.ff.t -= dt; if (W.ff.t <= 0) { W.ff.t = 0.35; flow(W); }
    buildZGrid(W);
    stepSets(W, dt, inp);
    stepThrow(W, dt, inp);
    stepCarried(W, dt);
    stepThrown(W, dt);
    stepBodies(W, dt);
    stepZombies(W, dt);
    // 늦게 터지는 것(연쇄 폭발)
    for (let i = W.delayed.length - 1; i >= 0; i--) {
      const e = W.delayed[i];
      if (e.t <= W.t) { W.delayed.splice(i, 1); if (e.o.st === 0) { groundRemove(W, e.o); finish(W, e.o); } }
    }
    // 1초마다: 오래된 시체 치우기
    W.sec -= dt;
    if (W.sec <= 0) {
      W.sec = 1;
      while (W.corpses.length && W.corpses[0].ttl <= W.t) { const o = W.corpses.shift(); if (o.st === 0 && o.ttl > 0) { groundRemove(W, o); o.st = 9; } }
    }
    // 죽은 좀비 빼기
    const zs = W.zs; let w = 0;
    for (let i = 0; i < zs.length; i++) if (!zs[i].dead) zs[w++] = zs[i];
    zs.length = w;
    // 효과 · 알림
    const fx = W.fx; w = 0;
    for (let i = 0; i < fx.length; i++) { fx[i].life -= dt; if (fx[i].life > 0) fx[w++] = fx[i]; }
    fx.length = w;
    for (let i = W.banners.length - 1; i >= 0; i--) { W.banners[i].life -= dt; if (W.banners[i].life <= 0) W.banners.splice(i, 1); }
    if (W.shake > 0) W.shake = Math.max(0, W.shake - dt * 2.5);
    if (p.hp <= 0) { p.hp = 0; W.state = 'dead'; }
    else if (W.hordeKilled >= W.hordeTotal * C.winFrac) W.state = 'win';
  };

  // ───────── 확인용
  P.cheatLevel = function (W) { addXp(W, P.xpNeed(W.player.level) - W.player.xp); };
  P.cheatZone = function (W) {
    const p = W.player, zi = P.zoneAt(p.x);
    if (zi < 3) { p.x = P.ZONES[zi + 1].x0 + 30; p.y = 900; } else { p.x = 2405; p.y = 900; }
    W.ff.t = 0; W.actT = 0;
  };
})(typeof window !== 'undefined' ? window : globalThis);
