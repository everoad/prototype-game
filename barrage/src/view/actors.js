// 몸: 플레이어(캡슐·총구·패링 고리·판정 점)와 보스(둥근 덩어리·눈). 몸짓은 sim 상태와 사건에서 읽는다(로직 ↔ 외형 분리).
// 늘 보스를 본다(돌아보는 시간 없음), 가는 쪽으로 기울고 서면 살짝 튕긴다. 보스는 준비 때 다음 위협 색으로 번쩍인다(§5.1).
import { canExecute } from '../sim/execute.js';
import { createDragonView } from './dragonView.js';
import { warpAt } from './warp.js';

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
  // 모아 던지기(§4.11): 모인 구슬(패링 고리 안쪽을 돈다) + 패링 고리 위 칸(모인 만큼 밝게) — 들어오는 탄을 읽는 자리를 가리지 않게 작게
  // 칸 수는 판 중에 늘 수 있다(몸 카드 "탄 칸 +1") — 수가 바뀌면 고리의 칸을 다시 짠다
  let storeCap = 0;
  const storeOrbs = [], storeArcs = [];
  function buildStore(cap) {
    for (const o of storeOrbs) { L.actors.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); }
    for (const a of storeArcs) { L.marker.remove(a); a.geometry.dispose(); a.material.dispose(); }
    storeOrbs.length = 0; storeArcs.length = 0; storeCap = cap;
    for (let k = 0; k < storeCap; k++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: C.cyan }));
      orb.visible = false; L.actors.add(orb);
      storeOrbs.push({ m: orb, from: null, at: -1e9 });
      const gap = S.storeArcGapDeg * Math.PI / 180, span = Math.PI * 2 / storeCap - gap;
      const arc = new THREE.Mesh(flat(new THREE.RingGeometry(0.8 - S.storeArcWidth, 0.8 + S.storeArcWidth, 20, 1, k * Math.PI * 2 / storeCap + gap / 2, span)), markerMat(C.cyan));
      arc.visible = false; L.marker.add(arc); storeArcs.push(arc);
    }
  }
  buildStore(opts.storeCap ?? 0);

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
  // 용(?boss=dragon): 둥근 몸 대신 상자 용 — 같은 재질이라 번쩍임·금 갈라짐이 그대로 보인다
  const dragon = opts.boss === 'dragon' ? createDragonView(view, LOOK, bMat) : null;
  if (dragon) { bPose.visible = false; boss.add(dragon.root); }

  // 처형 금빛 고리(§5.8): 그로기면 옅게, 곁(누르면 처형)이면 밝게 맥동
  const execRingMat = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, depthTest: false, depthWrite: false });
  const execRing = new THREE.Mesh((() => { const g = new THREE.RingGeometry(S.bossR + S.execRing - 0.1, S.bossR + S.execRing, 64); g.rotateX(-Math.PI / 2); return g; })(), execRingMat);
  execRing.position.y = 0.05; execRing.visible = false; L.marker.add(execRing);

  // 방패 거품(청록, §4.9)과 아이템(초록 — 방패 = 고리, 폭탄 = 다면체, 둘 다 바닥 고리)
  const shieldMat = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, depthTest: false, depthWrite: false });
  const shieldEdgeMat = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, depthTest: false, depthWrite: false });
  const shieldBall = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 48)), shieldMat);
  const shieldEdge = new THREE.Mesh(flat(new THREE.RingGeometry(0.94, 1, 48)), shieldEdgeMat);
  shieldBall.visible = shieldEdge.visible = false; L.marker.add(shieldBall, shieldEdge);
  const itemMat = new THREE.MeshBasicMaterial({ color: C.item });
  const itemFloorMat = new THREE.MeshBasicMaterial({ color: C.item, transparent: true, depthWrite: false, opacity: S.itemGlow });
  const itemGeo = { shield: new THREE.TorusGeometry(1, 0.28, 8, 20), bomb: new THREE.DodecahedronGeometry(1, 0) };
  const itemFloorGeo = (() => { const g = new THREE.CircleGeometry(1, 32); g.rotateX(-Math.PI / 2); return g; })();   // 바닥 고리는 파도 뜻이라 옅은 빛 원판
  const itemPool = [];
  function itemMeshes(i) {
    if (!itemPool[i]) { const body = new THREE.Mesh(itemGeo.shield, itemMat), floor = new THREE.Mesh(itemFloorGeo, itemFloorMat); floor.position.y = 0.01; L.actors.add(body); L.floorFx.add(floor); itemPool[i] = { body, floor }; }
    return itemPool[i];
  }

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
  const st = { flashColor: null, flashAt: -1, ringFlashAt: -1e9, dimAt: -1e9, stopAt: -1e9, moving: false, lunge: -1e9, shakeUntil: -1e9, shakeAmp: 0, joltAt: -1e9, jolt: 0, deadAt: null, downAt: null, pulseAt: -1e9, kickAt: -1e9 };
  const lerp = (a, b, t) => a + (b - a) * t;

  function onEvents(events, now) {
    for (const e of events) {
      if (e.type === 'windup') { st.flashColor = C.windup[e.color] ?? C.windup.purple; st.flashAt = now; }
      else if (e.type === 'meleeHit') st.lunge = now;
      else if (e.type === 'bossHit') { st.shakeUntil = now + 0.06; st.shakeAmp = 0.04; }
      else if (e.type === 'orbFire' && orbs[e.k]) orbs[e.k].flashAt = now;
      else if (e.type === 'storeAdd' && storeOrbs[e.n - 1]) { storeOrbs[e.n - 1].from = { x: e.x, z: e.z }; storeOrbs[e.n - 1].at = now; }   // 받은 자리에서 빨려 들어온다
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
    const armed = !!w.weapons && w.time < w.weapons.chargeUntil && w.weapons.on.some(g => g !== 'burst');   // 무기 가동 중: 몸이 더 밝게
    pMat.emissiveIntensity = now - st.dimAt < 0.15 ? 0 : armed ? LOOK.feel.aura.glow : 0.25;
    pMat.color.set(now - st.dimAt < 0.15 ? C.playerDark : C.player);
    // 반격 기회(과열): 그동안 몸이 금빛, 끝나기 직전 깜빡
    const od = p.overdriveUntil - w.time, OD = LOOK.feel.overdrive;
    if (od > 0 && (od > OD.blink || Math.floor(now * 12) % 2 === 0)) { pMat.color.set(C.gold); pMat.emissive.set(C.gold); pMat.emissiveIntensity = OD.glow; }
    else pMat.emissive.set(C.player);
    // 패배: 몸이 사라진다(파편은 feel)
    if (st.downAt != null) { body.visible = false; nose.visible = false; ring.visible = false; hitRim.visible = false; hitCore.visible = false; }
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
    // 모인 구슬·고리 칸
    if (storeCap > 0 && p.storeCap != null && p.storeCap !== storeCap) buildStore(p.storeCap);
    const stored = p.store?.length ?? 0, full = stored >= storeCap && storeCap > 0;
    for (let k = 0; k < storeCap; k++) {
      const o = storeOrbs[k], arc = storeArcs[k], on = k < stored;
      o.m.visible = on; arc.visible = on;
      if (!on) continue;
      const a = now * S.storeSpin + k * Math.PI * 2 / storeCap, R0 = w.rules.store.orbitR;
      let ox = x + Math.cos(a) * R0, oz = z + Math.sin(a) * R0, oy = S.storeOrbY;
      const u = Math.min(1, (now - o.at) / S.storeArrive);
      if (o.from && u < 1) { const e2 = u * u * (3 - 2 * u); ox = lerp(o.from.x, ox, e2); oz = lerp(o.from.z, oz, e2); oy = lerp(S.bh, oy, e2); }
      o.m.position.set(ox, oy, oz);
      const pop = u < 1 ? 1.6 - 0.6 * u : 1, beat = full ? 1 + 0.18 * Math.sin(now * 16) : 1;
      o.m.scale.setScalar(S.storeOrbR * (p.store[k].perfect ? 1.25 : 1) * pop * beat);
      arc.position.set(x, S.bh, z);
      arc.material.opacity = full ? 0.7 + 0.3 * Math.sin(now * 16) : 0.9;
    }

    // 보스 자리·바라봄
    let bx = lerp(b.px, b.x, alpha), bz = lerp(b.pz, b.z, alpha);
    if (now < st.shakeUntil) { bx += (Math.random() - 0.5) * st.shakeAmp; bz += (Math.random() - 0.5) * st.shakeAmp; }
    const jt = now - st.joltAt;
    if (jt < 0.12) { const k = Math.sin(jt / 0.12 * Math.PI) * st.jolt, a = Math.atan2(b.z - p.z, b.x - p.x); bx += Math.cos(a) * k; bz += Math.sin(a) * k; }
    if (w.tries?.snipe) { const o = warpAt(LOOK.tries.snipe.warp, w.tries.snipe, bx, bz, view.simTime ?? w.time, [0, 0]); bx += o[0]; bz += o[1]; }   // 저격에 맞아 젖혀진다(그림만)
    boss.position.set(bx, 0, bz);
    boss.rotation.y = -b.face;
    boss.visible = !b.away;   // 일반 방(스테이지)에서는 보스가 자리에 없다
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
    else if (w.time < b.groggyUntil && !b.dead) { sy = 1 - Bd.groggySquash;   // 그로기(처형 중·연습 장면 포함 — 두뇌 상태가 아니라 그로기 시간으로)
       sxz = 1 + Bd.groggySquash * 0.4; tilt = -0.15; }
    else if (state === 'stun') { tilt = -0.08; }
    const lu = now - st.lunge;
    if (lu < 0.15) tilt -= Math.sin(lu / 0.15 * Math.PI) * 0.25;   // 근접 타격 순간 앞으로 튀어 나감
    bPose.rotation.z = lerp(bPose.rotation.z, tilt, 0.35);
    bPose.rotation.x = lerp(bPose.rotation.x, side, 0.35);
    const kt = (now - st.kickAt) / LOOK.feel.volley.kickSec, kick = kt >= 0 && kt < 1 ? 1 + LOOK.feel.volley.kick * (1 - kt) : 1;   // 탄을 낼 때 몸이 살짝 튄다
    bPose.scale.set(lerp(bPose.scale.x, sxz * stretch, 0.4) * kick, lerp(bPose.scale.y, sy, 0.4), lerp(bPose.scale.z, sxz / Math.sqrt(stretch), 0.4) * kick);
    // 번쩍임: 다음 위협 색 — 준비 동안 이어지고 끝나면 flashSec에 걸쳐 사그라든다
    const charging = state === 'windup' || floorWarn || (rush && rush.phase === 'crouch');
    const fl = now - st.flashAt;
    const k = st.flashColor ? (charging ? 0.55 + 0.25 * Math.sin(now * 30) : Math.max(0, 1 - fl / Bd.flashSec)) : 0;
    if (k > 0) { bMat.emissive.set(st.flashColor); bMat.emissiveIntensity = k * (st.flashColor === C.windup.purple ? 0.35 : 1); }   // 특수 탄 없는 패턴은 약하게(§5.1)
    else if (b.stagger >= w.rules.stagger.max * 0.8) { bMat.emissive.set(C.bossCrack); bMat.emissiveIntensity = 0.06 + 0.05 * Math.sin(now * 14); }   // 곧 무너진다(§5.4)
    else bMat.emissiveIntensity = 0;
    dragon?.update(w, now, charging ? st.flashColor : null);
    // 방패 거품: 켜진 동안, 끝나기 0.3초 전부터 깜빡
    const sh = p.shieldUntil - w.time;
    shieldBall.visible = shieldEdge.visible = sh > 0 && (sh > 0.3 || Math.floor(now * 20) % 2 === 0);
    if (shieldBall.visible) {
      for (const m of [shieldBall, shieldEdge]) { m.position.set(x, S.bh, z); m.scale.setScalar(w.rules.shield.r); }
      shieldMat.opacity = S.shieldAlpha * (0.8 + 0.2 * Math.sin(now * 12)); shieldEdgeMat.opacity = S.shieldEdge;
    }
    // 아이템: 떠서 돌고, 사라지기 itemBlink초 전부터 깜빡
    let ii = 0;
    for (const it of w.items ?? []) {
      const g = itemMeshes(ii++), left = it.born + w.rules.items.life - w.time;
      const show = left > S.itemBlink || Math.floor(now * 8) % 2 === 0;
      g.body.visible = g.floor.visible = show;
      g.body.geometry = itemGeo[it.kind];
      g.body.position.set(it.x, S.bh * 2 + 0.15 * Math.sin(now * 3 + ii), it.z);
      g.body.rotation.set(it.kind === 'shield' ? Math.PI / 2 : 0, now * 2, 0);
      g.body.scale.setScalar(S.itemR);
      g.floor.position.x = it.x; g.floor.position.z = it.z; g.floor.scale.setScalar(w.rules.items.pickR);
    }
    for (; ii < itemPool.length; ii++) itemPool[ii].body.visible = itemPool[ii].floor.visible = false;
    // 처형 고리
    const groggy = w.time < b.groggyUntil && !b.dead && !w.execute;
    execRing.visible = groggy;
    if (groggy) {
      const near = canExecute(w), [lo, hi] = S.execRingAlpha;
      execRing.position.x = bx; execRing.position.z = bz;
      execRingMat.opacity = near ? hi * (0.75 + 0.25 * Math.sin(now * 18)) : lo;
      execRing.scale.setScalar(near ? 1 + 0.05 * Math.sin(now * 18) : 1);
    }
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
    // 2단계 넘어감: 몸이 한 번 부푼다
    const pu = (now - st.pulseAt) / 0.45;
    boss.scale.setScalar(pu >= 0 && pu < 1 ? 1 + 0.22 * Math.sin(pu * Math.PI) : 1);
    // 죽음: 금이 가듯 금빛으로 떨다가(파편이 터지는 동안) 마지막에 꺼지며 가라앉는다
    if (b.dead) {
      st.deadAt ??= now;
      const D = LOOK.feel.death, t = now - st.deadAt, crack = D.chunks.at(-1) + D.finalAfter;
      if (t < crack) { boss.scale.setScalar(1 + 0.05 * Math.sin(now * 70)); bMat.emissive.set(C.gold); bMat.emissiveIntensity = (0.15 + 0.6 * t / crack) * (0.6 + 0.4 * Math.sin(now * 45)); }
      else { const u = Math.min(1, (t - crack) / 0.45); boss.scale.setScalar(1 - 0.95 * u); boss.position.y = -0.8 * u; bMat.emissiveIntensity = 0; }
    }
  }

  return {
    update, onEvents,
    ringFlash(now) { st.ringFlashAt = now; },
    dodgeTrail(now, near) { if (near) { trail.near = true; for (const g of ghosts) if (now - g.born < LOOK.feel.afterimage.fade) { g.alpha = LOOK.feel.afterimage.alphaNear; g.m.material.color.set('#a8f0ff'); } return; } trail.until = now + 0.25; trail.nextAt = now; trail.near = false; },
    dashTrail(now) { trail.until = now + 0.2; trail.nextAt = now; trail.near = true; },
    bossJolt(now, amount) { st.joltAt = now; st.jolt = amount; },
    bossPulse(now) { st.pulseAt = now; },
    bossKick(now) { st.kickAt = now; },
    playerDown(now) { st.downAt = now; },
    playerUp() { st.downAt = null; st.deadAt = null; },   // 방 다시 하기(스테이지)
    dim(now) { st.dimAt = now; },
    toggleRing() { ringOn = !ringOn; return ringOn; },
    player, boss,
  };
}
