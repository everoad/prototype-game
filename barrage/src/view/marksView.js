// 자국 난 적의 타격 효과(sim/marks.js). 사용자 2026-11-18:
//  "자국(상처)이 있으면 공격할 때 … 빨간색 표현" → "빨간색 라인 그리는 건 지워 주고 그냥 타격 이펙트로만" → "피 튀겨서 바닥에 묻는 방향은 말고,
//   베여서 촥 퍼지는 느낌인데 진짜 피 퍼지는 느낌보다는 보통 타격감 표현하는 방식으로".
// 그래서: 자국 난 적이 맞을 때마다(칼바람 · 떠 있는 검 · 스킬) 그 자리에 **번쩍이는 베임 한 줄**이 나고, 그 줄을 따라 **가는 줄기들이 촥 퍼졌다 사라진다**.
// 순식간이다(0.1~0.3초). 몸에 남는 줄도, 떨어지는 방울도, 바닥의 얼룩도 없다. 자국이 터질 때는 사방으로 퍼진다(터뜨리는 회전이면 크게, 엇갈린 베임 둘).
// 색은 진홍(LOOK.colors.wound)과 그 속의 옅은 분홍 — 예고의 빨강(피해야 할 것)보다 어둡고, 날아오는 탄이 아니라 적의 몸에서 뻗는 가는 선이다. 적 탄보다 아래 겹에 그린다.
// 판 상태(w.marks.list)는 읽기만 한다. 수치는 LOOK.sword.marks.cutFx. 머리 위의 표시(남은 시간)는 hud.js가 그린다.
export function createMarksView(view, LOOK) {
  const THREE = view.THREE, C = LOOK.colors, L = view.layers, X = LOOK.sword.marks.cutFx;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const free = [], live = [];
  let seed = 9173;   // 보이는 것에만 쓰는 난수(판의 난수와 따로)
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  const pick = ([a, b]) => a + (b - a) * rnd();
  const idOf = (w, f) => (f === w.boss ? 0 : f.id);
  const rOf = (w, f) => (f === w.boss ? w.rules.boss.r : f.r);
  const marked = (w, id) => w.marks.list.some(m => idOf(w, m.foe) === id);
  const near = (w, x, z) => w.marks.list.some(m => Math.hypot(m.foe.x - x, m.foe.z - z) <= rOf(w, m.foe) + X.reach);
  let last = -1e9;

  // 선 하나: (x, z)에서 angle 쪽으로. len0 → len1로 늘어나며 travel만큼 나아가고, 굵게 번쩍였다(pop배) 가늘어지며 사라진다
  function add(now, x, z, angle, len0, len1, travel, w, sec, pop, core) {
    const m = free.pop() ?? new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    m.material.color.set(core ? C.woundCore : C.wound);
    m.rotation.y = -angle;
    L.shots.add(m);
    live.push({ m, t0: now, x, z, dx: Math.cos(angle), dz: Math.sin(angle), len0, len1, travel, w, sec, pop });
  }
  // 타격 효과 한 번: 베임(겉 + 밝은 속) + 줄기 n개. o = 묶음(LOOK.sword.marks.cutFx의 hit · cut · pop · burst)
  function hit(now, x, z, angle, o) {
    const [f0, f1, fw, fsec, fpop] = o.flash;
    for (const a of o.cross ? [angle, angle + Math.PI / 2 + (rnd() - 0.5) * 0.5] : [angle]) {
      add(now, x, z, a, f0, f1, 0, fw, fsec, fpop, false);
      add(now, x, z, a, f0 * X.coreLen, f1 * X.coreLen, 0, fw * X.core, fsec, fpop, true);
    }
    for (let k = 0; k < o.n; k++) {
      const a = angle + (rnd() - 0.5) * o.coneDeg * Math.PI / 180 + (o.both && k % 2 ? Math.PI : 0), len = pick(o.len);
      add(now, x, z, a, len * 0.25, len, pick(o.dist), o.w * (0.7 + 0.6 * rnd()), o.sec * (0.75 + 0.5 * rnd()), 1.6, rnd() < X.coreShare);
    }
  }

  // 맞은 사건: 자국 난 적이 맞았으면 타격 효과(스킬로 벤 것은 크게). 잔 타격은 gap초에 한 번만 — 검이 1초에 스무 번 넘게 찌른다.
  // 자국이 터지는 사건(markPop)은 사방으로 — 터뜨리는 회전이면 크게.
  function onEvents(events, now, w) {
    if (!w.marks) return;
    const p = w.player;
    for (const e of events) {
      if (e.type === 'markPop' && e.dmg > 0) { hit(now, e.x, e.z, rnd() * Math.PI, e.why === 'spin' ? X.burst : X.pop); continue; }
      if (!w.marks.list.length) continue;
      let a = null, big = false;
      if (e.type === 'swordStab' && marked(w, e.id)) a = Math.atan2(e.z - e.fromZ, e.x - e.fromX);
      else if (e.type === 'swordHit' && marked(w, e.id)) a = Math.atan2(e.z - p.z, e.x - p.x) + (rnd() - 0.5) * 1.2;
      else if (e.type === 'bladeHit' && e.dmg > 0 && marked(w, e.id)) { a = Math.atan2(e.z - p.z, e.x - p.x); big = true; }
      else if (e.type === 'waveHit' && near(w, e.x, e.z)) a = e.angle + Math.PI / 2 + e.side * 0.5;
      if (a == null) continue;
      if (!big && now - last < X.gap) continue;
      last = now;
      hit(now, e.x, e.z, a, big ? X.cut : X.hit);
    }
  }

  function update(now) {
    for (let i = live.length - 1; i >= 0; i--) {
      const it = live[i], u = (now - it.t0) / it.sec;
      if (u >= 1 || u < 0) { L.shots.remove(it.m); free.push(it.m); live.splice(i, 1); continue; }
      const e = 1 - (1 - u) ** 3, len = it.len0 + (it.len1 - it.len0) * e, d = it.travel * e;
      it.m.position.set(it.x + it.dx * d, X.y, it.z + it.dz * d);
      it.m.scale.set(len, 1, it.w * (1 - 0.7 * u) * (1 + (it.pop - 1) * (1 - u) ** 3));
      it.m.material.opacity = 1 - u * u;
    }
  }
  return { onEvents, update, count: () => live.length };
}
