// 이기어검 그리기(sim/swords.js — 설계 2026-11-17-barrage-flying-swords-design.md §6). 수치는 LOOK.sword.swords.
// 판은 검의 자리를 모른다 — 사건(출격 · 찌르기 · 스킬 타격의 시간표)만 준다. 여기서 검마다 길을 잡아 그 시각에 그 자리를 지나가게 한다.
// 움직임의 원칙: 궤적은 크게, 빠르게(적 곁에서 맴돌지 않는다 — 멀리 휘돌아 나갔다가 빠르게 들어와 스치며 벤다) · 날 끝은 가는 쪽을 본다 ·
// 길은 꺾이지 않고 이어진다 · 엇박 · 길과 칼자국의 크기는 제각각(화면만의 난수 — 판과 무관하고, 같은 판은 늘 같은 그림) · 자라나고 빨려 든다 ·
// 몸을 뚫지 않고 스친다(난무는 몸 위를 넘는다) · 불러 모으지 않는다(마무리만 내가 물러날 때 함께 물러난다).
// 검 · 꼬리 · 칼자국은 shots 겹(적 탄 아래)에 그린다. 판의 시각(틱 사이를 이은 값)으로 움직인다 — 화면 정지 때는 검도 선다. 판 상태는 읽기만 한다.

const clamp01 = u => Math.max(0, Math.min(1, u));
const lin = u => u;
const inQuad = u => u * u;
const outCubic = u => 1 - (1 - u) ** 3;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// 스킬 타격의 차례(순수): 가까운 검이 먼저, 새 다섯이 마지막(그 가운데 자루가 맨 끝). 마무리는 멀리 나가 있던 검 → 내 곁의 검(가까운 순) → 새 다섯.
// swords = [{ fresh, dFoe, dMe, k, far }] → 차례대로 늘어놓은 목록.
export function strikeOrder(swords, skill) {
  const rank = s => (s.fresh ? 2 : skill === 'finish' && !s.far ? 1 : 0);
  return [...swords].sort((a, b) => rank(a) - rank(b) || (a.fresh ? Math.abs(b.k - 2) - Math.abs(a.k - 2) : skill === 'finish' && !a.far ? a.dMe - b.dMe : a.dFoe - b.dFoe));
}

export function createSwordsView(view, LOOK, fx = null) {
  const THREE = view.THREE, C = LOOK.colors, L = view.layers, V = LOOK.sword.swords, D2R = Math.PI / 180;
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };
  const shape = new THREE.Shape();
  shape.moveTo(0.62, 0); shape.lineTo(0.08, 0.5); shape.lineTo(-0.38, 0); shape.lineTo(0.08, -0.5); shape.closePath();
  const bladeGeo = flat(new THREE.ShapeGeometry(shape)), coreGeo = flat(new THREE.PlaneGeometry(1, 1));
  const lineGeo = flat(new THREE.PlaneGeometry(1, 1)); lineGeo.translate(0.5, 0, 0);
  const mat = color => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });

  // 화면만의 난수(판의 난수와 따로 — 판을 바꾸지 않는다). 씨앗이 정해져 있어 같은 판을 다시 찍으면 같은 그림이 나온다.
  let seed = 0x2f6e2b1;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = ([a, b]) => a + (b - a) * rnd();
  const spray = (x, z, angle, o) => { if (fx && fx.spray && LOOK.feel.on.sparks !== false) fx.spray(x, z, angle, 'cyan', o); };   // 칼이 지나간 쪽으로 튀는 불티(view/fx.js)
  const coin = () => (rnd() < 0.5 ? -1 : 1);

  const swords = [];          // 보이는 검: { b, k, g, blade, core, x, z, dx, dz, ang, seq, jobs, mode, grow0, gone, boost, lx, lz, size, tw, near }
  const rows = [0];           // 등 뒤 부채의 줄 차례(묶음 id — 바탕이 가장 안쪽)
  const until = new Map();    // 묶음 id → 식는 시각(깜빡임)
  const strikes = new Map();  // 타격 sid → { used: 쓴 칼자국 각, first, angle }
  const seen = new Map();     // 적 id → 마지막으로 본 [x, z, r]
  const lines = [], lineFree = [];
  let W = null, A = 1, ts = 0, P = [0, 0];

  // 적의 지금 자리(틱 사이를 이은 값). 죽었거나 없으면 마지막으로 본 자리
  function fp(id) {
    const f = !W ? null : id === 0 ? (W.boss.away || W.boss.dead ? null : W.boss) : W.enemies.find(e => e.id === id && !e.dead);
    if (f) seen.set(id, [f.px + (f.x - f.px) * A, f.pz + (f.z - f.pz) * A, f.r ?? W.rules.boss.r]);
    return seen.get(id) ?? [P[0], P[1], 1];
  }
  const sign = s => ((s.b + s.k) % 2 ? 1 : -1);
  const rowOf = s => Math.max(0, rows.indexOf(s.b));

  // 등 뒤 부채의 제자리: [x, z, 바깥을 보는 각]
  function slot(s) {
    const F = V.fan, row = rowOf(s), back = (W ? W.player.face : 0) + Math.PI;
    const frac = row % 2 ? (s.k + 1) / (V.n + 1) : (s.k + 0.5) / V.n, a = back + (frac - 0.5) * 2 * F.halfDeg * D2R, r = F.r[Math.min(row, F.r.length - 1)];
    return [P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r, a];
  }
  // 마무리의 활: 내 뒤(적의 반대쪽)에 줄지어 선 자리 — 나를 따라온다(자루마다 조금씩 들쭉날쭉)
  function bowSlot(j) {
    const B = V.bow, [fx, fz] = fp(j.id), back = Math.atan2(P[1] - fz, P[0] - fx), row = Math.floor(j.bowI / V.n), inRow = Math.min(V.n, j.bowN - row * V.n);
    const a = back + ((j.bowI % V.n + 0.5) / inRow - 0.5) * 2 * B.halfDeg * D2R, r = B.r[Math.min(row, B.r.length - 1)] + j.bowR;
    return [P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r];
  }

  function line(x0, z0, x1, z1, w, sec, alpha, core = false, top = false, pop = 1) {
    const it = lineFree.pop() ?? { m: new THREE.Mesh(lineGeo, mat(C.cyan)) };
    it.m.material.color.set(core ? V.core : C.cyan);
    it.m.material.depthTest = !top;   // top = 몸을 가로지르는 칼자국: 몸에 가리지 않게 위에 그린다(적 탄보다는 아래 — 겹 차례가 낮다)
    it.m.position.set(x0, top ? V.strike.markY : V.y, z0); it.m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    Object.assign(it, { t0: ts, sec, w, alpha, pop, len: Math.hypot(x1 - x0, z1 - z0) });
    L.shots.add(it.m); lines.push(it);
  }
  // 칼자국: (x, z)를 가운데로 angle 쪽으로 누운 가는 줄 + 밝은 속
  function mark(x, z, angle, len, w, sec, top = false) {
    const dx = Math.cos(angle) * len / 2, dz = Math.sin(angle) * len / 2;
    const M = V.mark;
    line(x - dx, z - dz, x + dx, z + dz, w, sec, M.alpha, false, top, M.pop);   // 칼자국은 굵게 번쩍였다가 가늘어진다(벤 순간이 읽히게)
    line(x - dx * M.coreLen, z - dz * M.coreLen, x + dx * M.coreLen, z + dz * M.coreLen, w * M.coreW, sec, 1, true, top, M.pop);
  }

  function make(b, k, x, z, grow0, angle = 0) {
    const g = new THREE.Group(), blade = new THREE.Mesh(bladeGeo, mat(C.cyan)), core = new THREE.Mesh(coreGeo, mat(V.core));
    core.position.set(0.1, 0.01, 0);
    g.add(blade); g.add(core); L.shots.add(g);
    const s = { b, k, g, blade, core, x, z, dx: Math.cos(angle), dz: Math.sin(angle), ang: angle, seq: [], jobs: [], mode: 'idle', grow0, gone: null, boost: -1e9, lx: x, lz: z, born: true, size: pick(V.size), tw: pick(V.trail.wVary), near: null };
    swords.push(s);
    return s;
  }
  const seg = (t0, t1, at, extra = null) => ({ t0, t1: Math.max(t0, t1), at, ...extra });
  // 이어지는 길(3차 베지어): 지금 가던 쪽으로 k1만큼 내달리다가, inDir 쪽으로 k2만큼 달려 들어오며 to()에 닿는다 — 꺾이지 않고, 끝에서 가장 빠르다
  function glide(s, t0, t1, to, inDir, k1, k2, extra = null) {
    s.seq.push(seg(t0, t1, null, { ...extra, init: q => {
      const x0 = s.x, z0 = s.z, ax = x0 + s.dx * k1, az = z0 + s.dz * k1;
      q.at = u => {
        const [tx, tz] = to(), [ix, iz] = inDir(), bx = tx - ix * k2, bz = tz - iz * k2, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
        return [a * x0 + b * ax + c * bx + d * tx, a * z0 + b * az + c * bz + d * tz];
      };
    } }));
  }
  // 몸을 비켜 가는 길(2차 베지어): 곧은 길이 그 적(id)의 몸을 지나면 몸 바깥으로 돌아간다(걸리지 않으면 살짝만 휜다)
  const around = (x0, z0, to, id, side) => u => {
    const [tx, tz] = to(), dx = tx - x0, dz = tz - z0, len = Math.hypot(dx, dz) || 1, mx = (x0 + tx) / 2, mz = (z0 + tz) / 2;
    let cx = mx - dz * side * V.sortie.softBend, cz = mz + dx * side * V.sortie.softBend;
    if (id != null) {
      const [fx, fz, fr] = fp(id), t = clamp01(((fx - x0) * dx + (fz - z0) * dz) / (len * len)), qx = x0 + dx * t, qz = z0 + dz * t, d = Math.hypot(qx - fx, qz - fz), need = fr + V.clear;
      if (d < need) { const nx = d > 1e-3 ? (qx - fx) / d : -dz / len * side, nz = d > 1e-3 ? (qz - fz) / d : dx / len * side; cx = qx + nx * (need - d) * V.sortie.dodge; cz = qz + nz * (need - d) * V.sortie.dodge; }
    }
    const v = 1 - u;
    return [v * v * x0 + 2 * v * u * cx + u * u * tx, v * v * z0 + 2 * v * u * cz + u * u * tz];
  };
  // 적을 스치며 지나갈 자리와 그때 가는 쪽: (fromX, fromZ)에서 그 적을 보고 들어와, 가운데에서 옆으로 lat(몸 반지름의 몫)만큼 비낀 줄을 지난다
  function passAt(id, fromX, fromZ, lat) {
    const dir = () => { const [x, z] = fp(id), d = Math.hypot(x - fromX, z - fromZ) || 1; return [(x - fromX) / d, (z - fromZ) / d]; };
    const to = () => { const [x, z, r] = fp(id), [ux, uz] = dir(); return [x - uz * lat * r, z + ux * lat * r]; };
    return { to, dir };
  }
  // 제자리로 돌아간다: 부채의 줄을 따라 미끄러져 들어온다(막혀서 돌아올 때는 튕겨서). 끝나면 떠 있는다
  function goHome(s, t0, bounced = false) {
    const H = V.sortie;
    s.mode = 'home';
    glide(s, t0, t0 + H.homeSec, () => slot(s), () => { const a = slot(s)[2] + sign(s) * Math.PI / 2; return [Math.cos(a), Math.sin(a)]; }, bounced ? -H.bounce : H.homeOut, H.homeIn, { end: () => { s.mode = 'idle'; } });
  }
  // 스킬 타격을 마친 검: 가던 쪽으로 미끄러져 나가다가(판이 곧 다시 출격시킨다), 부를 것이 없으면 돌아온다. hold = 꽂혀 있던 검은 잠깐 그대로 있는다
  function release(s, hold = null) {
    const T = V.strike;
    s.mode = 'free';
    if (hold) s.seq.push(seg(ts, ts + V.bow.wait, hold));
    else s.seq.push(seg(ts, ts + T.coastSec, null, { ease: outCubic, init: q => { const x0 = s.x, z0 = s.z, dx = s.dx, dz = s.dz, d = pick(T.coast); q.at = u => [x0 + dx * d * u, z0 + dz * d * u]; } }));
    s.seq.push(seg(0, 0, null, { init: q => { q.at = () => [s.x, s.z]; }, end: () => goHome(s, ts) }));
  }

  // 스킬 타격의 한 몫을 시작한다: 지금 있는 자리에서 크게 돌아 들어와 제 차례(j.at)에 적을 가로지르고, 멀리 지나쳐 나간다.
  // 그림이 못 따라가면 조금 늦게 벤다(피해는 판이 제때 낸다).
  function startJob(s, j) {
    const T = V.strike, [fx, fz, fr] = fp(j.id);
    s.mode = 'strike'; s.seq.length = 0; s.near = j.id;
    const next = hold => { s.jobs.shift(); if (s.jobs.length) startJob(s, s.jobs[0]); else release(s, hold); };
    if (j.skill === 'finish' && j.bow) {   // 내가 물러날 때 함께 물러나 활에 섰다가, 제 차례에 쏜다 — 꽂혀서 잠깐 박혀 있는다
      const B = V.bow, tShot = Math.max(ts + 0.02, j.at - B.shot), tIn = Math.min(tShot, Math.max(ts + B.pull, j.start)), sp = (rnd() - 0.5) * 2 * B.spread, deep = pick(B.deep);
      if (s.born) { [s.x, s.z] = bowSlot(j); s.lx = s.x; s.lz = s.z; }
      s.seq.push(seg(ts, tIn, null, { ease: outCubic, init: q => { q.at = around(s.x, s.z, () => bowSlot(j), j.id, sign(s)); } }));
      s.seq.push(seg(tIn, tShot, () => bowSlot(j), { face: () => { const [x, z] = fp(j.id); return Math.atan2(z - s.z, x - s.x); } }));
      let x0 = 0, z0 = 0;
      const hit = () => { const [x, z, r] = fp(j.id), d = Math.hypot(x - x0, z - z0) || 1, ux = (x - x0) / d, uz = (z - z0) / d; return [x - ux * r * deep - uz * sp * r, z - uz * r * deep + ux * sp * r]; };
      s.seq.push(seg(tShot, tShot + B.shot, null, { ease: inQuad, init: q => { x0 = s.x; z0 = s.z; q.at = u => { const [hx, hz] = hit(); return [x0 + (hx - x0) * u, z0 + (hz - z0) * u]; }; },
        end: () => { const a = Math.atan2(s.z - z0, s.x - x0); mark(s.x, s.z, a, pick(B.markLen) * (j.last ? B.lastMark[0] : 1), pick(T.markW) * (j.last ? B.lastMark[1] : 1), T.markSec); spray(s.x, s.z, a, j.last ? V.spray.last : V.spray.shot); } }));
      s.seq.push(seg(tShot + B.shot, tShot + B.shot + pick(B.stick), hit, { end: () => next(hit) }));
      return;
    }
    // 가로지르는 줄: 일섬은 내가 지나간 줄과 나란히(있던 쪽에서 — 앞에서든 뒤에서든), 난무는 고르게 돌아가는 각 가운데 제 쪽에 가까운 것(조금씩 어긋나게), 멀리 있던 검의 마무리는 있던 쪽에서 곧장
    const st = strikes.get(j.sid) ?? { used: [] }, nat = Math.hypot(fx - s.x, fz - s.z) > 1e-6 ? Math.atan2(fz - s.z, fx - s.x) : j.angle, stabOnly = j.skill === 'finish';
    let a = nat, lat = coin() * pick(V.sortie.lat) * fr;
    if (j.skill === 'slash') {
      a = Math.cos(nat - j.angle) >= 0 || s.born ? j.angle : j.angle + Math.PI;
      lat = ((j.i % V.n) - (V.n - 1) / 2 + (rnd() - 0.5) * T.laneJitter) * T.side * (1 + Math.floor(j.i / V.n) * T.laneGrow);
    } else if (j.skill === 'spin') {
      let best = -1, bd = Infinity;
      for (let m = 0; m < j.total; m++) { if (st.used.includes(m)) continue; const d = Math.abs(wrap(2 * (nat - (j.angle + m * Math.PI / j.total)))); if (d < bd) { bd = d; best = m; } }
      if (best >= 0) { st.used.push(best); const o = j.angle + best * Math.PI / j.total + (rnd() - 0.5) * 2 * T.jitterDeg * D2R; a = Math.abs(wrap(o - nat)) <= Math.PI / 2 ? o : o + Math.PI; }
      lat = (rnd() - 0.5) * T.spinLat * fr;
    }
    const ca = Math.cos(a), sa = Math.sin(a), inGap = fr + pick(T.inGap), outGap = stabOnly ? -fr * T.stabDeep : fr + pick(T.outGap), v = pick(T.speed), tIn = inGap / v, tOut = stabOnly ? 0.01 : outGap / v;
    const mid = () => { const [x, z] = fp(j.id); return [x - sa * lat, z + ca * lat]; };
    const E = () => { const [x, z] = mid(); return [x - ca * inGap, z - sa * inGap]; };
    const X = () => { const [x, z] = mid(); return [x + ca * outGap, z + sa * outGap]; };
    if (s.born && j.skill !== 'slash') { [s.x, s.z] = E(); s.lx = s.x; s.lz = s.z; s.dx = ca; s.dz = sa; s.ang = a; }   // 새 검은 벨 줄의 바깥에서 자라난다(일섬은 내가 떠난 자리에서)
    const [ex, ez] = E(), gap = Math.hypot(ex - s.x, ez - s.z), t0 = Math.max(j.at - tIn, ts + gap / T.maxSpeed), lead = pick(T.lead);
    glide(s, ts, t0, E, () => [ca, sa], Math.min(lead, gap), Math.min(lead, gap + T.leadPad));
    s.seq.push(seg(t0, t0 + tIn + tOut, u => { const [x0, z0] = E(), [x1, z1] = X(); return [x0 + (x1 - x0) * u, z0 + (z1 - z0) * u]; }, {
      mid: tIn / (tIn + tOut), lift: j.skill === 'spin' ? T.hop : 0,   // 난무는 몸 위를 넘으며 벤다 — 일섬은 줄을 따라 꿰뚫는다
      onMid: () => { const [x, z] = mid(); mark(x, z, a, stabOnly ? pick(V.bow.markLen) : 2 * fr + pick(T.markPad), pick(T.markW), T.markSec, !stabOnly); spray(x, z, a, V.spray.strike); },
      end: stabOnly ? null : () => next(null) }));
    if (stabOnly) s.seq.push(seg(t0 + tIn + tOut, t0 + tIn + tOut + pick(V.bow.stick), X, { end: () => next(X) }));
  }

  // 바탕 다섯 자루: 처음 한 번, 등 뒤 제자리에 만든다(사건이 그리기보다 먼저 올 수 있다 — 판의 첫 틱에 첫 검이 떠난다)
  function base() {
    if (swords.some(s => s.b === 0)) return;
    for (let k = 0; k < V.n; k++) { const s = make(0, k, P[0], P[1], -1e9); [s.x, s.z, s.ang] = slot(s); s.dx = Math.cos(s.ang); s.dz = Math.sin(s.ang); s.lx = s.x; s.lz = s.z; s.born = false; }
  }

  function onEvents(events, now, world) {
    W = world;
    if (!world.player.swords && !swords.length) return;
    if (world.player.swords && !swords.some(s => s.b === 0)) { P = [world.player.x, world.player.z]; base(); }
    const find = (b, k) => swords.find(s => s.b === b && s.k === k && !s.gone), S = V.sortie;
    for (const e of events) {
      if (e.type === 'swordSortie' || e.type === 'swordTurn') {   // 떠난다(또는 가던 적을 바꾼다): 지금 보던 쪽으로 살짝 내달렸다가 휘돌아 그 적을 스치러 들어간다
        const s = find(e.batch, e.k); if (!s) continue;
        const p = passAt(e.id, s.x, s.z, coin() * pick(S.lat));
        s.mode = 'out'; s.seq.length = 0; s.jobs.length = 0; s.near = e.id;   // 판이 다시 건너다니게 했다: 덜 끝난 타격의 몫은 내려놓는다(쥐고 있으면 그 뒤의 타격에 나서지 못한다)
        glide(s, ts, e.at, p.to, p.dir, e.type === 'swordTurn' ? S.turnOut : S.wind, S.far * pick(S.farVary) * S.firstIn);
      } else if (e.type === 'swordStab') {   // 스치며 벤 순간: 칼자국 하나. 멈추지 않고 그대로 멀리 지나쳐 나갔다가, 다음에 들어올 쪽으로 크게 돌아 들어온다
        const s = find(e.batch, e.k); if (!s) continue;
        s.near = e.id; s.jobs.length = 0;
        mark(s.x, s.z, Math.atan2(s.dz, s.dx), pick(S.markLen), pick(S.markW), S.markSec, true);   // 몸 위에 그린다(스친 자국이 몸에 가리지 않게)
        spray(s.x, s.z, Math.atan2(s.dz, s.dx), V.spray.stab);
        if (!e.next) continue;
        const p = passAt(e.next.id, e.next.fromX, e.next.fromZ, coin() * pick(S.lat));
        s.seq.length = 0;
        glide(s, ts, e.next.at, p.to, p.dir, S.far * pick(S.farVary), S.far * pick(S.farVary));
      } else if (e.type === 'swordHome') {
        const s = find(e.batch, e.k); if (!s) continue;
        s.seq.length = 0; s.jobs.length = 0;
        goHome(s, ts, e.blocked);
      } else if (e.type === 'bladeSlash') {   // 일섬: 내가 지나갈 줄이 먼저 길게 번쩍인다(몸보다 앞서 — 벤 줄이 읽히게. 몸 위에 그린다)
        const F = LOOK.sword.skill.slash.flash, a = Math.atan2(e.z1 - e.z0, e.x1 - e.x0);
        mark((e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2, a, Math.hypot(e.x1 - e.x0, e.z1 - e.z0) + 2 * F.ext, F.w, F.sec, true);
      } else if (e.type === 'swordsBatch') {
        until.set(e.batch, e.until);
        if (e.renewed) { for (const s of swords) if (s.b === e.batch) s.boost = ts; continue; }
        if (!rows.includes(e.batch)) rows.push(e.batch);
        const px = -Math.sin(e.angle), pz = Math.cos(e.angle);
        for (let k = 0; k < e.n; k++) { const off = (k - (e.n - 1) / 2) * V.strike.side; make(e.batch, k, e.x + px * off, e.z + pz * off, ts + k * V.grow.each, e.angle); }
      } else if (e.type === 'swordsStrike') {
        if (!seen.has(e.ids[0])) seen.set(e.ids[0], [e.x, e.z, e.r]);   // 화면이 살아 있는 모습을 본 적 없는 적(멀리서 벤 일섬): 타격이 알려 준 자리로
        const live = swords.filter(s => !s.gone), pool = e.total >= live.length ? live : live.filter(s => s.b === e.fresh), [fx, fz] = fp(e.ids[0]);
        strikes.set(e.sid, { used: [], first: e.ids[0], angle: e.angle });
        const info = pool.map(s => ({ s, fresh: s.b === e.fresh && s.born, k: s.k, dFoe: Math.hypot(fx - s.x, fz - s.z), dMe: Math.hypot(P[0] - s.x, P[1] - s.z), far: !s.jobs.length && Math.hypot(P[0] - s.x, P[1] - s.z) > V.bow.reach }));
        const order = strikeOrder(info, e.skill).slice(0, e.total), bowN = order.filter(o => !o.far).length;
        let bowI = 0;
        order.forEach((o, i) => {
          const j = { sid: e.sid, skill: e.skill, i, total: e.total, at: e.startAt + i * e.span / e.total, start: e.startAt, id: e.skill === 'spin' ? e.ids[i % e.ids.length] : e.ids[0], angle: e.angle, last: i === e.total - 1, bow: !o.far, bowI: o.far ? 0 : bowI++, bowN, bowR: (rnd() - 0.5) * 2 * V.bow.rVary };
          o.s.jobs.push(j);
          if (o.s.jobs.length === 1) startJob(o.s, j);
        });
      } else if (e.type === 'swordHit') {   // 일섬이 지나간 다른 적에게도 칼자국 하나
        const st = strikes.get(e.sid);
        if (st && e.skill === 'slash' && st.first !== e.id) mark(e.x, e.z, st.angle, pick(V.sortie.markLen) * V.strike.passMark, pick(V.strike.markW), V.strike.markSec);
        if (e.last) strikes.delete(e.sid);
      } else if (e.type === 'swordMiss') {
        if (e.last) strikes.delete(e.sid);
      } else if (e.type === 'swordsExpire' || e.type === 'swordsClear') {
        for (const s of swords) if (!s.gone && (e.type === 'swordsClear' ? s.b !== 0 : s.b === e.batch)) { s.gone = ts; s.seq.length = 0; s.jobs.length = 0; }
        if (e.type === 'swordsClear') { rows.length = 1; until.clear(); strikes.clear(); seen.clear(); for (const s of swords) if (s.b === 0 && s.gone == null) { s.seq.length = 0; s.jobs.length = 0; goHome(s, ts); } }
        else { const i = rows.indexOf(e.batch); if (i > 0) rows.splice(i, 1); until.delete(e.batch); }
      }
    }
  }

  // 판의 시각이 거꾸로 갔다(판을 새로 시작했다): 하던 길과 몫, 식던 검, 남은 꼬리를 모두 치운다
  function rewind() {
    for (let i = swords.length - 1; i >= 0; i--) { const s = swords[i]; s.seq.length = 0; s.jobs.length = 0; s.mode = 'idle'; if (s.gone != null) { L.shots.remove(s.g); swords.splice(i, 1); } }
    for (const it of lines) { L.shots.remove(it.m); lineFree.push(it); }
    lines.length = 0; strikes.clear(); seen.clear();
  }

  // 길의 토막을 그 시각까지 밟는다(끝난 토막은 넘긴다). 돌려주는 값 = 지금 밟고 있는 토막과 그 안의 자리 u(없으면 null)
  function walk(s) {
    for (let guard = 0; guard < 8 && s.seq.length; guard++) {
      const q = s.seq[0];
      if (ts < q.t0) return null;
      if (q.init && !q.on) { q.on = true; q.init(q); }
      const u = q.t1 > q.t0 ? clamp01((ts - q.t0) / (q.t1 - q.t0)) : 1;
      [s.x, s.z] = q.at((q.ease ?? lin)(u));
      if (q.onMid && !q.midOn && u >= q.mid) { q.midOn = true; q.onMid(); }
      if (ts < q.t1) return [q, u];
      s.seq.shift();
      if (q.end) q.end();
    }
    return null;
  }

  function update(world, alpha) {
    W = world; A = alpha;
    const on = !!world.player.swords;
    if (!on && !swords.length) return;
    const p = world.player, prev = ts;
    P = [p.px + (p.x - p.px) * alpha, p.pz + (p.z - p.pz) * alpha];
    ts = world.time - (1 - alpha) * world.rules.dt;   // 판의 시각으로만 간다(결과 화면에서는 검도 선다 — 그리기용 시각을 따라가면 방을 다시 시작할 때 시각이 거꾸로 간다)
    if (ts < prev - 1e-6) rewind();
    const dt = Math.max(0, Math.min(0.1, ts - prev));
    if (on) base();
    for (let i = swords.length - 1; i >= 0; i--) {
      const s = swords[i], row = rowOf(s), dim = V.dim[Math.min(row, V.dim.length - 1)], ox = s.x, oz = s.z;
      let face = null, size = 1, fade = 1, lift = 0;
      if (s.gone != null) {   // 식는다: 가늘어지고 흐려지며 내 등으로 빨려 든다
        const u = Math.max(0, (ts - s.gone) / V.expire.sec);
        if (u >= 1) { L.shots.remove(s.g); swords.splice(i, 1); continue; }
        const k = Math.min(1, u * V.expire.pull[0] + dt * V.expire.pull[1]);
        s.x += (P[0] - s.x) * k; s.z += (P[1] - s.z) * k;
        size = 1 - u; fade = 1 - u;
      } else {
        const at = walk(s);
        if (at) {
          const [q, u] = at;
          if (q.face) face = q.face();
          if (q.lift) lift = q.lift * Math.sin(Math.PI * clamp01(u / (2 * q.mid)));
        } else if (!s.seq.length) {   // 떠 있는다: 제자리로 늦게 끌려온다(자루마다 조금씩 다른 빠르기)
          const [sx, sz, sa] = slot(s), F = V.fan, k = 1 - Math.exp(-(F.follow[0] + (F.follow[1] - F.follow[0]) * ((s.k * 0.37 + s.b * 0.21) % 1)) * dt);
          s.x += (sx - s.x) * k; s.z += (sz - s.z) * k;
          face = sa + sign(s) * F.outDeg * D2R;
        }
      }
      const step = Math.hypot(s.x - ox, s.z - oz), speed = dt > 0 ? step / dt : 0;
      if (step > 1e-5) { s.dx = (s.x - ox) / step; s.dz = (s.z - oz) / step; }
      const want = face != null && speed < V.fastFace ? face : step > 1e-4 ? Math.atan2(s.dz, s.dx) : s.ang;
      const cap = speed >= V.fastFace ? Math.PI : V.turn * dt;   // 빠르게 날 때는 가는 쪽을 곧장 본다
      s.ang += Math.max(-cap, Math.min(cap, wrap(want - s.ang)));
      const far = Math.hypot(s.x - s.lx, s.z - s.lz);
      if (s.gone == null && speed >= V.trail.minSpeed && far >= V.trail.minStep) line(s.lx, s.lz, s.x, s.z, V.trail.w * s.tw * dim, Math.min(V.trail.sec, V.trail.maxLen / speed), V.trail.alpha);   // 꼬리는 maxLen보다 길어지지 않는다
      if (far >= V.trail.minStep || speed < V.trail.minSpeed) { s.lx = s.x; s.lz = s.z; }
      // 모습: 줄마다 한 단계씩 가늘고 옅다 · 막 생긴(새로 고쳐진) 검은 밝다 · 자라난다 · 식기 전에 깜빡인다
      const grow = clamp01((ts - s.grow0) / V.grow.sec), left = (until.get(s.b) ?? Infinity) - ts;
      const blink = s.gone == null && left < V.expire.blinkSec && left > 0 ? V.expire.blinkLow + (1 - V.expire.blinkLow) * Math.cos(ts * V.expire.blinkHz * 2 * Math.PI) ** 2 : 1;
      const fresh = s.jobs.length && s.born ? V.fresh : 1 + V.renew.boost * clamp01(1 - (ts - s.boost) / V.renew.sec);
      if (s.born && !s.jobs.length && grow >= 1) s.born = false;
      const idle = !s.seq.length && s.gone == null, bob = idle ? Math.sin(ts * V.fan.bobHz * 2 * Math.PI + s.k * 1.3 + s.b) * V.fan.bobY : 0;
      s.g.visible = grow > 0;
      s.g.position.set(s.x, V.y + bob + lift, s.z); s.g.rotation.y = -s.ang;
      s.blade.scale.set(V.len * s.size * size * (V.grow.from[0] + (1 - V.grow.from[0]) * grow), 1, V.w * dim * size * (V.grow.from[1] + (1 - V.grow.from[1]) * grow) * Math.min(V.freshWide, fresh));
      s.core.scale.set(V.len * s.size * V.coreLen * size * grow, 1, V.coreW * size);
      const hush = view.quiet ? V.quiet : 1;   // 틈이 열려 있는 동안(view/gap.js)에는 검이 옅어진다 — 보스의 예고를 읽을 수 있게
      s.blade.material.opacity = V.alpha * dim * fade * blink * grow * Math.min(1, fresh) * hush;
      s.core.material.opacity = Math.min(1, (p.store && p.store.length ? 1 : V.coreDim) * fade * blink * grow * fresh * hush);
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      const it = lines[i], u = (ts - it.t0) / it.sec;
      if (u >= 1 || u < 0) { L.shots.remove(it.m); lineFree.push(it); lines.splice(i, 1); continue; }
      it.m.scale.set(it.len, 1, it.w * (1 - V.trail.taper * u) * (1 + (it.pop - 1) * (1 - u) ** 3)); it.m.material.opacity = it.alpha * (1 - u) * (view.quiet ? V.quiet : 1);
    }
  }

  return { onEvents, update, count: () => swords.filter(s => s.gone == null).length, peek: () => swords.map(s => ({ b: s.b, k: s.k, x: s.x, z: s.z, jobs: s.jobs.length, gone: s.gone != null })) };   // peek = 검마다의 자리와 밀린 몫(시험이 본다)
}
