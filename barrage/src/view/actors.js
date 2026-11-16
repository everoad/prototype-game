// 몸: 플레이어(캡슐·총구·패링 고리·판정 점)와 보스(둥근 덩어리·눈). 몸짓은 sim 상태와 사건에서 읽는다(로직 ↔ 외형 분리).
// 늘 보스를 본다(돌아보는 시간 없음), 가는 쪽으로 기울고 서면 살짝 튕긴다. 보스는 준비 때 다음 위협 색으로 번쩍인다(§5.1).
export function createActors(view, LOOK, opts = {}) {
  const THREE = view.THREE, C = LOOK.colors, S = LOOK.sizes, Bd = LOOK.body, L = view.layers;
  const col = c => new THREE.Color(c);

  // ── 플레이어
  const player = new THREE.Group();
  const pMat = new THREE.MeshLambertMaterial({ color: C.player, emissive: col(C.player), emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(S.playerR, S.playerH, 6, 16), pMat);
  body.position.y = S.playerR + S.playerH / 2; body.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.18), new THREE.MeshLambertMaterial({ color: C.playerDark }));
  nose.position.set(S.playerR + 0.12, S.playerR + S.playerH * 0.55, 0); nose.castShadow = true;
  const lean = new THREE.Group(); lean.add(body, nose);
  player.add(lean);
  L.actors.add(player);

  const markerMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false });
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };
  const ringMat = markerMat(C.cyan); ringMat.opacity = S.ringAlpha;
  const ring = new THREE.Mesh(flat(new THREE.RingGeometry(0.8 - S.ringWidth, 0.8 + S.ringWidth, 64)), ringMat);
  const hitRim = new THREE.Mesh(flat(new THREE.RingGeometry(0.15, 0.21, 24)), markerMat(S.hitRingWhite ? C.white : C.hitRim));
  const hitCore = new THREE.Mesh(flat(new THREE.CircleGeometry(0.15, 24)), markerMat(C.hitCore));
  for (const m of [ring, hitRim, hitCore]) { m.position.y = S.bh; L.marker.add(m); }
  let ringOn = opts.ring !== false;

  // ── 보스
  const boss = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: C.boss, emissive: col('#000000') });
  const bBody = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), bMat);
  bBody.scale.set(S.bossR, S.bossH * 0.62, S.bossR); bBody.position.y = S.bossH * 0.55; bBody.castShadow = true;
  const eyeMat = new THREE.MeshBasicMaterial({ color: C.bossEye });
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), eyeMat); e.position.set(S.bossR * 0.9, S.bossH * 0.8, s * 0.42); eyes.add(e); }
  const bPose = new THREE.Group(); bPose.add(bBody, eyes);
  boss.add(bPose);
  L.actors.add(boss);

  // 2단계 쌍둥이 구슬: 작은 자주 구 둘, 쏠 때 흰 번쩍
  const orbs = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: C.normal }));
    m.visible = false; L.actors.add(m); return { m, flashAt: -1e9 };
  });

  // 잔상: 회피·완전 패링 반격 경로에 몸 모양 반투명(아슬아슬이면 하늘색, §6)
  const ghosts = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial({ color: C.player, transparent: true, depthWrite: false }));
    m.visible = false; L.actors.add(m); return { m, born: -1e9, alpha: 0 };
  });
  let ghostNext = 0;
  const trail = { until: -1e9, every: 0.08, nextAt: 0, near: false };

  // 몸짓 상태
  const st = { flashColor: null, flashAt: -1, ringFlashAt: -1e9, dimAt: -1e9, stopAt: -1e9, moving: false, lunge: -1e9, shakeUntil: -1e9, shakeAmp: 0, joltAt: -1e9, jolt: 0, deadAt: null };
  const lerp = (a, b, t) => a + (b - a) * t;

  function onEvents(events, now) {
    for (const e of events) {
      if (e.type === 'windup') { st.flashColor = C.windup[e.color] ?? C.windup.purple; st.flashAt = now; }
      else if (e.type === 'meleeHit') st.lunge = now;
      else if (e.type === 'bossHit') { st.shakeUntil = now + 0.06; st.shakeAmp = 0.04; }
      else if (e.type === 'orbFire' && orbs[e.k]) orbs[e.k].flashAt = now;
    }
  }

  function update(w, alpha, now) {
    const p = w.player, b = w.boss;
    // 플레이어 자리·바라봄·기울기
    const x = lerp(p.px, p.x, alpha), z = lerp(p.pz, p.z, alpha);
    player.position.set(x, 0, z);
    player.rotation.y = -p.face;
    const vx = p.x - p.px, vz = p.z - p.pz, moving = Math.hypot(vx, vz) > 1e-4;
    if (st.moving && !moving) st.stopAt = now;
    st.moving = moving;
    // 가는 쪽으로 기울기: 몸 좌표에서의 진행 방향
    const lf = Math.cos(p.face) * vx + Math.sin(p.face) * vz, ls = -Math.sin(p.face) * vx + Math.cos(p.face) * vz, lv = Math.hypot(lf, ls) || 1;
    const leanR = moving ? Bd.leanDeg * Math.PI / 180 : 0;
    lean.rotation.z = lerp(lean.rotation.z, -leanR * lf / lv, 0.5);
    lean.rotation.x = lerp(lean.rotation.x, leanR * ls / lv, 0.5);
    const sb = now - st.stopAt;
    const bounce = sb < Bd.stopBounceSec ? Math.sin(sb / Bd.stopBounceSec * Math.PI) * Bd.stopBounce : 0;
    lean.scale.set(1 + bounce * 0.5, 1 - bounce, 1 + bounce * 0.5);
    // 맞은 뒤 무적: 깜빡임 · 잠김 표시: 잠깐 어둡게
    const blink = w.time < p.invulnUntil && !(p.dodge.startedAt >= 0 && w.time < p.dodge.startedAt + w.rules.dodge.invuln) ? (Math.floor(now * 20) % 2 === 0) : false;
    body.visible = !blink; nose.visible = !blink;
    pMat.emissiveIntensity = now - st.dimAt < 0.15 ? 0 : 0.25;
    pMat.color.set(now - st.dimAt < 0.15 ? C.playerDark : C.player);
    // 잔상: trail 동안 every초마다 지금 자리에 하나
    const A = LOOK.feel.afterimage;
    if (now < trail.until && now >= trail.nextAt && LOOK.feel.on.afterimage !== false) {
      trail.nextAt = now + trail.every;
      const g = ghosts[ghostNext]; ghostNext = (ghostNext + 1) % ghosts.length;
      g.born = now; g.alpha = trail.near ? A.alphaNear : A.alpha;
      g.m.material.color.set(trail.near ? '#a8f0ff' : C.player);
      g.m.position.set(x, body.position.y, z); g.m.rotation.copy(lean.rotation); g.m.rotation.y = player.rotation.y; g.m.visible = true;
    }
    for (const g of ghosts) {
      const age = now - g.born;
      if (age > A.fade) { g.m.visible = false; continue; }
      g.m.material.opacity = g.alpha * (1 - age / A.fade);
    }
    // 패링 고리·판정 점
    for (const m of [ring, hitRim, hitCore]) m.position.set(x, S.bh, z);
    const rf = now - st.ringFlashAt;
    ringMat.opacity = rf < 0.12 ? 1 : rf < 0.25 ? lerp(1, S.ringAlpha, (rf - 0.12) / 0.13) : S.ringAlpha;
    ring.visible = ringOn || rf < 0.25;

    // 보스 자리·바라봄
    let bx = lerp(b.px, b.x, alpha), bz = lerp(b.pz, b.z, alpha);
    if (now < st.shakeUntil) { bx += (Math.random() - 0.5) * st.shakeAmp; bz += (Math.random() - 0.5) * st.shakeAmp; }
    const jt = now - st.joltAt;
    if (jt < 0.12) { const k = Math.sin(jt / 0.12 * Math.PI) * st.jolt, a = Math.atan2(b.z - p.z, b.x - p.x); bx += Math.cos(a) * k; bz += Math.sin(a) * k; }
    boss.position.set(bx, 0, bz);
    boss.rotation.y = -b.face;
    // 몸짓: 준비 젖힘·움츠림, 돌진 늘어남, 그로기 주저앉음
    let tilt = 0, sy = 1, sxz = 1, stretch = 1, side = 0;
    const state = b.state, rush = w.melee.rush, fa = state === 'floor' ? w.floor : null;
    const floorWarn = !!fa && fa.phase !== 'dash' && !fa.area?.hit;
    if (state === 'windup' || floorWarn || (rush && rush.phase === 'crouch')) {
      const u = Math.min(1, (w.time - b.stateAt) / 0.35);
      tilt = Bd.windupLeanDeg * Math.PI / 180 * u * (rush ? 0.6 : 1);
      sy = 1 - Bd.windupSquash * u * (rush ? 2 : 1); sxz = 1 + Bd.windupSquash * 0.5 * u;
    } else if (rush && rush.phase === 'dash') { stretch = 1 + Bd.dashStretch; sy = 0.9; }
    else if (fa?.kind === 'slam' && fa.phase === 'dash') { stretch = 1 + Bd.slamStretch; sy = 0.82; }
    else if (state === 'hop') side = Bd.hopTiltDeg * Math.PI / 180 * (b.orbitDir || 1);
    else if (state === 'groggy') { sy = 1 - Bd.groggySquash; sxz = 1 + Bd.groggySquash * 0.4; tilt = -0.15; }
    else if (state === 'stun') { tilt = -0.08; }
    const lu = now - st.lunge;
    if (lu < 0.15) tilt -= Math.sin(lu / 0.15 * Math.PI) * 0.25;   // 근접 타격 순간 앞으로 튀어 나감
    bPose.rotation.z = lerp(bPose.rotation.z, tilt, 0.35);
    bPose.rotation.x = lerp(bPose.rotation.x, side, 0.35);
    bPose.scale.set(lerp(bPose.scale.x, sxz * stretch, 0.4), lerp(bPose.scale.y, sy, 0.4), lerp(bPose.scale.z, sxz / Math.sqrt(stretch), 0.4));
    // 번쩍임: 다음 위협 색 — 준비 동안 이어지고 끝나면 flashSec에 걸쳐 사그라든다
    const charging = state === 'windup' || floorWarn || (rush && rush.phase === 'crouch');
    const fl = now - st.flashAt;
    const k = st.flashColor ? (charging ? 0.55 + 0.25 * Math.sin(now * 30) : Math.max(0, 1 - fl / Bd.flashSec)) : 0;
    if (k > 0) { bMat.emissive.set(st.flashColor); bMat.emissiveIntensity = k * (st.flashColor === C.windup.purple ? 0.35 : 1); }   // 특수 탄 없는 패턴은 약하게(§5.1)
    else if (b.stagger >= w.rules.stagger.max * 0.8) { bMat.emissive.set(C.bossCrack); bMat.emissiveIntensity = 0.06 + 0.05 * Math.sin(now * 14); }   // 곧 무너진다(§5.4)
    else bMat.emissiveIntensity = 0;
    // 쌍둥이 구슬(sim 자리 그대로)
    for (let k = 0; k < 2; k++) {
      const o = b.orbs?.[k], g = orbs[k];
      g.m.visible = !!o && !b.dead;
      if (!o) continue;
      const f = now - g.flashAt < S.orbFlashSec;
      g.m.position.set(o.x, S.bh * 2.2, o.z); g.m.scale.setScalar(S.orbR * (f ? 1.3 : 1));
      g.m.material.color.set(f ? C.orbFlash : C.normal);
    }
    // 죽음: 가라앉으며 작아진다
    if (b.dead) { st.deadAt ??= now; const u = Math.min(1, (now - st.deadAt) / 1.2); boss.scale.setScalar(1 - 0.85 * u); boss.position.y = -0.8 * u; }
  }

  return {
    update, onEvents,
    ringFlash(now) { st.ringFlashAt = now; },
    dodgeTrail(now, near) { if (near) { trail.near = true; for (const g of ghosts) if (now - g.born < LOOK.feel.afterimage.fade) { g.alpha = LOOK.feel.afterimage.alphaNear; g.m.material.color.set('#a8f0ff'); } return; } trail.until = now + 0.25; trail.nextAt = now; trail.near = false; },
    dashTrail(now) { trail.until = now + 0.2; trail.nextAt = now; trail.near = true; },
    bossJolt(now, amount) { st.joltAt = now; st.jolt = amount; },
    dim(now) { st.dimAt = now; },
    toggleRing() { ringOn = !ringOn; return ringOn; },
    player, boss,
  };
}
