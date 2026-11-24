// 맵 만들기: 주택가 → 상가 → 공단 → 공항. 뼈대는 같고 배치는 씨앗마다 다르다.
(function (G) {
  'use strict';
  const P = G.PSY, C = P.C, K = P.K;
  const CP = 40;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const YARD = ['can', 'can', 'can', 'bottle', 'bottle', 'brick', 'brick', 'plant', 'plant', 'mailbox', 'bin', 'chair', 'bike', 'hammer', 'pot', 'tire', 'knife'];
  const TRAFFIC = ['car', 'car', 'car', 'car', 'car', 'car', 'car', 'van', 'van', 'moto', 'truck', 'bus', 'tanker'];
  const LOTCARS = ['car', 'car', 'car', 'car', 'van', 'moto'];

  P.generate = function (seed) {
    const rnd = rng(seed);
    const R = (a, b) => a + (b - a) * rnd();
    const RI = (a, b) => Math.floor(a + (b - a + 1) * rnd());
    const ch = (p) => rnd() < p;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const W = C.mapW, H = C.mapH;
    const g = { w: W, h: H, seed, buildings: [], objs: [], sets: [], pads: [], zones: P.ZONES, start: { x: 90, y: 900 } };
    const local = [];
    const B = (t, x0, y0, x1, y1) => {
      const T = P.BT[t];
      const b = { T, x0, y0, x1, y1, hp: T.hp, dead: false, fr: 0 };
      g.buildings.push(b); local.push(b); return b;
    };
    const inB = (x, y, pad) => {
      for (let i = 0; i < local.length; i++) { const b = local[i]; if (x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad) return true; }
      return false;
    };
    const O = (id, x, y, rot) => {
      if (x < 1 || y < 1 || x > W - 1 || y > H - 1) return;
      const k = K[id];
      g.objs.push({ k, x, y, dur: k.dur, r: rot === undefined ? (ch(0.5) ? 1 : 0) : rot, st: 0, cd: 0, ttl: 0, ang: 0 });
    };
    const scatter = (id, n, x0, y0, x1, y1, pad) => {
      pad = pad || 0.6;
      for (let i = 0; i < n; i++) for (let t = 0; t < 6; t++) {
        const x = R(x0, x1), y = R(y0, y1);
        if (!inB(x, y, pad)) { O(id, x, y); break; }
      }
    };
    const S = (id, x, y) => g.sets.push({ k: K[id], x, y, st: 0, charge: 0, ft: 0, fd: 1, fx0: 0, fy0: 0, tx: 0, ty: 0 });
    const pad = (x0, y0, x1, y1, col) => g.pads.push({ x0, y0, x1, y1, col });

    // ── 주택가의 한 필지 (36 × 36)
    function house(lx, ly) {
      let w = R(11, 14), d = R(9, 11);
      if (ch(0.5)) { const t = w; w = d; d = t; }
      const x0 = lx + R(4, 36 - w - 4), y0 = ly + R(4, 36 - d - 4);
      B('house', x0, y0, x0 + w, y0 + d);
      const n = RI(6, 13);
      for (let i = 0; i < n; i++) scatter(pick(YARD), 1, lx + 1, ly + 1, lx + 35, ly + 35);
      if (ch(0.55)) scatter('car', 1, lx + 3, ly + 3, lx + 33, ly + 33, 2.8);
    }
    function park(lx, ly) {
      if (ch(0.7)) S('tree', lx + R(12, 24), ly + R(12, 24));
      scatter('bench', RI(1, 3), lx + 3, ly + 3, lx + 33, ly + 33);
      scatter('tire', RI(0, 3), lx + 3, ly + 3, lx + 33, ly + 33);
      scatter('bin', 1, lx + 3, ly + 3, lx + 33, ly + 33);
      scatter('can', RI(3, 7), lx + 3, ly + 3, lx + 33, ly + 33);
      scatter('bottle', RI(2, 5), lx + 3, ly + 3, lx + 33, ly + 33);
    }
    function store(lx, ly) {
      const x0 = lx + R(6, 18), y0 = ly + R(6, 20);
      B('store', x0, y0, x0 + 12, y0 + 10);
      scatter('cart', RI(1, 3), lx + 2, ly + 2, lx + 34, ly + 34);
      scatter('can', RI(4, 8), lx + 2, ly + 2, lx + 34, ly + 34);
      scatter('bottle', RI(2, 5), lx + 2, ly + 2, lx + 34, ly + 34);
      scatter('bin', 1, lx + 2, ly + 2, lx + 34, ly + 34);
      if (ch(0.4)) scatter('vend', 1, lx + 2, ly + 2, lx + 34, ly + 34, 1.2);
    }
    function lotParking(lx, ly) {
      pad(lx + 2, ly + 2, lx + 34, ly + 34, '#35383c');
      const n = RI(3, 6);
      for (let i = 0; i < n; i++) O(pick(LOTCARS), lx + 6 + (i % 3) * 10 + R(-1, 1), ly + 9 + Math.floor(i / 3) * 16 + R(-1, 1), 1);
      scatter('cart', RI(0, 2), lx + 3, ly + 3, lx + 33, ly + 33);
    }
    function resBlock(bx, by) {
      pad(bx, by, bx + 72, by + 72, '#2f3a2c');
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const lx = bx + i * 36, ly = by + j * 36, t = rnd();
        if (t < 0.76) house(lx, ly); else if (t < 0.85) park(lx, ly); else if (t < 0.91) store(lx, ly); else lotParking(lx, ly);
      }
    }

    // ── 상가의 한 블록 (72 × 72)
    function carRows(x0, y0, x1, y1, n, kinds) {
      pad(x0, y0, x1, y1, '#35383c');
      const cols = Math.max(1, Math.floor((x1 - x0) / 5)), rows = Math.max(1, Math.floor((y1 - y0) / 9));
      for (let i = 0; i < n; i++) {
        const cx = RI(0, cols - 1), cy = RI(0, rows - 1);
        O(pick(kinds), x0 + 2.5 + cx * 5 + R(-0.5, 0.5), y0 + 4.5 + cy * 9 + R(-1, 1), 1);
      }
    }
    function comBlock(bx, by) {
      pad(bx, by, bx + 72, by + 72, '#3a3d40');
      const t = rnd();
      if (t < 0.2) {
        B('mart', bx + 18, by + 4, bx + 54, by + 30);
        carRows(bx + 4, by + 36, bx + 68, by + 68, RI(6, 12), LOTCARS);
        scatter('cart', RI(8, 14), bx + 4, by + 32, bx + 68, by + 68);
        if (ch(0.35)) S('billboard', bx + 62, by + 16);
      } else if (t < 0.34) {
        B('furniture', bx + 6, by + 6, bx + 36, by + 28);
        carRows(bx + 40, by + 6, bx + 68, by + 40, RI(3, 7), LOTCARS);
        scatter('sofa', RI(1, 3), bx + 4, by + 32, bx + 68, by + 68);
        scatter('table', RI(1, 3), bx + 4, by + 32, bx + 68, by + 68);
        scatter('pallet', RI(3, 6), bx + 4, by + 44, bx + 68, by + 68);
        scatter('chair', RI(3, 8), bx + 4, by + 32, bx + 68, by + 68);
      } else if (t < 0.5) {
        B('hardware', bx + 5, by + 6, bx + 27, by + 22);
        B('garage', bx + 44, by + 44, bx + 64, by + 58);
        scatter('pallet', RI(4, 8), bx + 3, by + 3, bx + 69, by + 69);
        scatter('pipe', RI(4, 8), bx + 3, by + 3, bx + 69, by + 69, 1.8);
        scatter('tire', RI(6, 12), bx + 30, by + 30, bx + 69, by + 69);
        scatter('drum', RI(2, 4), bx + 3, by + 3, bx + 69, by + 69);
        scatter('brick', RI(10, 20), bx + 3, by + 24, bx + 40, by + 69);
        scatter('car', RI(2, 4), bx + 30, by + 4, bx + 68, by + 40, 2.8);
        scatter('ladder', RI(1, 3), bx + 3, by + 3, bx + 69, by + 69, 1.8);
      } else if (t < 0.64) {
        B('gasst', bx + 8, by + 8, bx + 20, by + 16);
        pad(bx + 26, by + 6, bx + 60, by + 24, '#44403a');
        scatter('drum', RI(4, 6), bx + 26, by + 6, bx + 60, by + 24);
        scatter('gas', RI(3, 5), bx + 4, by + 4, bx + 60, by + 26);
        scatter('car', RI(2, 4), bx + 26, by + 8, bx + 60, by + 24, 2.8);
        if (ch(0.35)) O('tanker', bx + 44, by + 30, 0);
        B('diner', bx + 44, by + 46, bx + 60, by + 58);
        scatter('table', RI(2, 4), bx + 4, by + 40, bx + 40, by + 68);
        scatter('chair', RI(4, 8), bx + 4, by + 40, bx + 40, by + 68);
        scatter('bin', RI(1, 3), bx + 4, by + 30, bx + 68, by + 68);
        scatter('tire', RI(2, 5), bx + 4, by + 18, bx + 30, by + 40);
      } else if (t < 0.76) {
        B('diner', bx + 5, by + 6, bx + 21, by + 18);
        B('diner', bx + 46, by + 50, bx + 62, by + 62);
        B('store', bx + 48, by + 8, bx + 60, by + 18);
        B('store', bx + 8, by + 50, bx + 20, by + 60);
        scatter('table', RI(3, 6), bx + 22, by + 20, bx + 50, by + 50);
        scatter('chair', RI(6, 12), bx + 22, by + 20, bx + 50, by + 50);
        scatter('bin', RI(2, 4), bx + 3, by + 3, bx + 69, by + 69);
        scatter('can', RI(8, 14), bx + 3, by + 3, bx + 69, by + 69);
        scatter('bike', RI(2, 5), bx + 3, by + 3, bx + 69, by + 69);
        if (ch(0.5)) scatter('vend', RI(1, 2), bx + 3, by + 3, bx + 69, by + 69, 1.2);
      } else if (t < 0.86) {
        carRows(bx + 4, by + 4, bx + 68, by + 68, RI(18, 30), ['car', 'car', 'car', 'car', 'van', 'van', 'moto', 'truck', 'bus']);
        scatter('cart', RI(3, 8), bx + 4, by + 4, bx + 68, by + 68);
        if (ch(0.6)) S('billboard', bx + 36, by + 36);
      } else {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) house(bx + i * 36, by + j * 36);
      }
    }

    // ── 공단의 한 블록 (156 × 156)
    function indBlock(bx, by) {
      pad(bx, by, bx + 156, by + 156, '#3d3a35');
      const t = rnd();
      if (t < 0.28) {
        B('warehouse', bx + 8, by + 8, bx + 56, by + 40);
        B('warehouse', bx + 96, by + 60, bx + 144, by + 92);
        if (ch(0.6)) B('warehouse', bx + 8, by + 110, bx + 56, by + 142);
        scatter('truck', RI(2, 5), bx + 60, by + 6, bx + 150, by + 50, 4.5);
        scatter('pallet', RI(10, 20), bx + 4, by + 44, bx + 90, by + 108);
        scatter('forklift', RI(1, 2), bx + 4, by + 44, bx + 90, by + 108, 2);
        scatter('drum', RI(4, 8), bx + 4, by + 4, bx + 152, by + 152);
      } else if (t < 0.48) {
        B('factory', bx + 10, by + 10, bx + 54, by + 40);
        B('factory', bx + 100, by + 110, bx + 144, by + 140);
        scatter('drum', RI(8, 14), bx + 4, by + 44, bx + 152, by + 106);
        scatter('pipe', RI(6, 12), bx + 4, by + 44, bx + 152, by + 106, 1.8);
        scatter('container', RI(2, 4), bx + 60, by + 6, bx + 150, by + 40, 3.5);
        scatter('scrap', RI(8, 16), bx + 4, by + 4, bx + 152, by + 152);
        if (ch(0.5)) S('wtower', bx + 78, by + 78);
      } else if (t < 0.7) {
        const n = RI(14, 24);
        for (let i = 0; i < n; i++) O('container', bx + 12 + (i % 6) * 22 + R(-1, 1), by + 14 + Math.floor(i / 6) * 9 + R(-0.5, 0.5), 0);
        scatter('forklift', 2, bx + 6, by + 60, bx + 150, by + 150, 2);
        scatter('truck', RI(2, 4), bx + 6, by + 70, bx + 150, by + 150, 4.5);
        scatter('pallet', RI(6, 12), bx + 6, by + 60, bx + 150, by + 150);
        scatter('uld', RI(4, 8), bx + 6, by + 60, bx + 150, by + 150, 1.2);
      } else if (t < 0.88) {
        S('crane', bx + 78, by + 78);
        scatter('excavator', RI(1, 2), bx + 10, by + 10, bx + 146, by + 146, 4);
        scatter('rebar', RI(15, 25), bx + 20, by + 20, bx + 70, by + 60, 1.5);
        scatter('pipe', RI(10, 18), bx + 90, by + 20, bx + 140, by + 60, 1.8);
        scatter('brick', RI(30, 50), bx + 20, by + 96, bx + 70, by + 140);
        scatter('pallet', RI(8, 12), bx + 90, by + 96, bx + 140, by + 140);
        scatter('rubble', RI(6, 10), bx + 10, by + 10, bx + 146, by + 146);
        scatter('container', 2, bx + 10, by + 10, bx + 146, by + 30, 3.5);
        scatter('ladder', RI(2, 4), bx + 10, by + 10, bx + 146, by + 146, 1.8);
      } else {
        B('garage', bx + 10, by + 10, bx + 30, by + 24);
        scatter('truck', RI(8, 14), bx + 8, by + 34, bx + 148, by + 148, 4.5);
        scatter('bus', RI(4, 8), bx + 8, by + 34, bx + 148, by + 148, 6);
        scatter('tanker', RI(1, 3), bx + 40, by + 6, bx + 148, by + 30, 6);
        scatter('drum', RI(6, 10), bx + 8, by + 8, bx + 148, by + 148);
        scatter('tire', RI(8, 14), bx + 8, by + 8, bx + 60, by + 60);
      }
      if (ch(0.2)) S('pylon', bx - 6, by - 6);
    }

    // ── 격자: 주택가 · 상가는 84m 간격, 고속도로 줄(852~924)은 비운다
    const rows = [];
    for (let j = 0; j <= 20; j++) if (j !== 10) rows.push(12 + j * 84);
    for (let i = 0; i <= 17; i++) {
      const bx = 12 + i * 84, zone = bx + 36 < 950 ? 0 : 1;
      for (const by of rows) {
        local.length = 0;
        if (zone === 0) resBlock(bx, by); else comBlock(bx, by);
        // 길가: 가로등 · 표지판 · 세워 둔 차 · 맨홀
        if (ch(0.5)) O('lamp', bx - 3, by - 3, 0);
        if (ch(0.2)) O('sign', bx + 75, by - 3, 0);
        if (ch(0.15)) O('manhole', bx - 6, by + R(4, 68), 0);
        if (ch(0.2)) O('bin', bx + R(2, 70), by - 2.5, 0);
        const pc = RI(0, 2);
        for (let k = 0; k < pc; k++) O(pick(LOTCARS), bx + R(6, 66), by - 4, 0);
        if (ch(0.35)) O(pick(LOTCARS), bx - 4, by + R(6, 66), 1);
        if (zone === 1 && ch(0.12)) O('pole', bx - 9, by + R(4, 68), 0);
      }
    }
    const icols = [1562, 1730, 1898, 2066];
    const irows = [12, 180, 348, 516, 684, 936, 1104, 1272, 1440, 1608];
    for (const bx of icols) for (const by of irows) {
      local.length = 0;
      indBlock(bx, by);
      if (ch(0.6)) O('lamp', bx - 4, by - 4, 0);
      if (ch(0.4)) O('pole', bx - 8, by + R(10, 146), 0);
      const pc = RI(0, 2);
      for (let k = 0; k < pc; k++) O(ch(0.5) ? 'truck' : 'van', bx + R(10, 146), by - 5, 0);
    }

    // ── 고속도로: 버려진 차들
    pad(0, 852, 2340, 924, '#2a2f2a');
    pad(0, 888, 2340, 912, '#1f2226');
    const lanes = [891, 897, 903, 909];
    for (let x = 150; x < 2240;) {
      const id = pick(TRAFFIC);
      O(id, x, pick(lanes) + R(-0.6, 0.6), 0);
      x += R(7, 24) * (x < 950 ? 1.5 : 1);
    }
    for (let x = 40; x < 2240; x += 40) O('lamp', x, (Math.round(x / 40) % 2) ? 885 : 915, 0);
    for (let x = 1000; x < 2240; x += R(240, 340)) S('pylon', x, 866);
    for (let x = 700; x < 2200; x += R(260, 420)) S('billboard', x, 929);
    scatter('sign', 30, 20, 880, 2240, 886);

    // ── 공항
    local.length = 0;
    pad(2250, 0, 3000, 1800, '#2c2f33');
    pad(2262, 700, 2330, 1100, '#35383c');           // 주차장
    pad(2420, 760, 2760, 1040, '#3a3e44');           // 계류장 — 대군이 있는 곳
    pad(2280, 1250, 2980, 1300, '#1f2226');          // 활주로
    for (let x = 2300; x < 2960; x += 60) pad(x, 1273, x + 30, 1277, '#8a8f96');
    B('terminal', 2340, 740, 2390, 1060);
    B('hangar', 2440, 480, 2510, 530);
    B('hangar', 2540, 480, 2610, 530);
    B('hangar', 2640, 480, 2710, 530);
    S('plane', 2470, 810); S('plane', 2470, 990); S('plane', 2620, 790); S('plane', 2620, 1010); S('plane', 2750, 900);
    S('plane', 2520, 1276);
    for (let i = 0; i < 46; i++) O(pick(['car', 'car', 'car', 'van', 'moto']), 2268 + (i % 4) * 16 + R(-1, 1), 708 + Math.floor(i / 4) * 33 + R(-2, 2), 1);
    scatter('bus', 5, 2264, 700, 2328, 1100, 6);
    scatter('luggage', 30, 2400, 700, 2800, 1100, 1.5);
    scatter('uld', 40, 2400, 700, 2800, 1100, 1.2);
    scatter('stairs', 5, 2420, 760, 2760, 1040, 3.5);
    scatter('forklift', 4, 2400, 700, 2800, 1100, 2);
    scatter('cart', 20, 2392, 740, 2420, 1060);
    scatter('tanker', 3, 2400, 600, 2780, 700, 6);
    pad(2800, 1100, 2900, 1180, '#44403a');          // 급유장
    scatter('tanker', 4, 2804, 1104, 2896, 1176, 6);
    scatter('drum', 20, 2800, 1100, 2900, 1180);
    scatter('gas', 10, 2800, 1100, 2900, 1180);
    scatter('container', 12, 2440, 300, 2800, 440, 3.5);
    scatter('truck', 6, 2440, 300, 2800, 460, 4.5);
    scatter('engine', 8, 2430, 535, 2720, 570);
    S('pylon', 2300, 500); S('pylon', 2300, 1400);

    // ── 시작 자리 주변에 손에 들 것
    local.length = 0;
    const sx = g.start.x, sy = g.start.y;
    scatter('can', 8, sx - 10, sy - 14, sx + 12, sy - 4);
    scatter('bottle', 4, sx - 10, sy + 4, sx + 12, sy + 14);
    scatter('brick', 6, sx - 10, sy - 14, sx + 12, sy + 14);
    scatter('knife', 2, sx - 8, sy - 10, sx + 10, sy + 10);
    scatter('chair', 2, sx - 8, sy - 10, sx + 10, sy + 10);
    O('bin', sx + 6, sy - 6, 0);

    // ── 좀비: 40m 칸마다 몇 마리 있는지만 적어 둔다(가까이 가면 나타난다)
    const pw = Math.ceil(W / CP), ph = Math.ceil(H / CP);
    g.popS = new Uint16Array(pw * ph); g.popR = new Uint16Array(pw * ph);
    g.popHS = new Uint16Array(pw * ph); g.popHR = new Uint16Array(pw * ph);
    const hordeCells = [];
    for (let cy = 0; cy < ph; cy++) for (let cx = 0; cx < pw; cx++) {
      const x = (cx + 0.5) * CP, y = (cy + 0.5) * CP, i = cy * pw + cx;
      if (Math.hypot(x - sx, y - sy) < 75) continue;
      const zi = P.zoneAt(x), Z = P.ZONES[zi];
      const t = (x - Z.x0) / (Z.x1 - Z.x0);
      const n = (Z.d0 + (Z.d1 - Z.d0) * t) * CP * CP * R(0.5, 1.5);
      const run = Math.floor(n * Z.run + rnd()), slow = Math.floor(n - run + rnd());
      g.popS[i] = Math.max(0, slow); g.popR[i] = Math.max(0, run);
      if (x > 2500 && x < 2700 && y > 820 && y < 980) hordeCells.push(i);  // 계류장 한가운데에 빽빽하게
    }
    g.hordeTotal = 0;
    const per = C.horde / hordeCells.length;
    for (const i of hordeCells) {
      const n = Math.round(per * R(0.8, 1.2)), run = Math.round(n * 0.15);
      g.popHS[i] = n - run; g.popHR[i] = run; g.hordeTotal += n;
    }
    return g;
  };
})(typeof window !== 'undefined' ? window : globalThis);
