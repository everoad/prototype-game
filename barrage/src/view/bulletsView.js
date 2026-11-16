// 탄 그리기(§7): 종류마다 인스턴스 메시 하나, 종류마다 다른 모양, 탄 높이 bh + 밑 그림자 원.
// 적 탄은 깊이와 상관없이 몸 위(depthTest 끔, bullets 층). 플레이어 탄은 가늘고 반투명, 적 탄보다 아래(shots 층).
// 차선(따라오는 동안 점선 → 고정 실선), 근접 장판(채워지는 면), 쪼개지는 구슬의 흰 조각 표시 점도 여기서.
// 장판 공격: 박치기 줄(판 끝까지, 예고 동안 길이로 채워짐) · 파도 예고 원 · 검기 부채 · 퍼지는 파도 고리 띠(앞면 밝게) ·
// 레이저(조준 점선 + 쓸 쪽 옅은 부채 → 굵은 빨간 빔 + 흰 속 + 끝 불꽃).
import { K } from '../sim/rules.js';

export function createBulletsView(view, LOOK, cap) {
  const THREE = view.THREE, C = LOOK.colors, S = LOOK.sizes, L = view.layers;
  const top = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, ...extra });
  function inst(geo, mat, layer, order = 0) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0; m.frustumCulled = false; m.renderOrder = order;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    layer.add(m);
    return m;
  }
  const sphere = new THREE.SphereGeometry(1, 14, 10), octa = new THREE.OctahedronGeometry(1, 0);
  const meshes = {
    normal: inst(sphere, top(C.normal), L.bullets, 0),
    normalCore: inst(new THREE.SphereGeometry(0.55, 10, 8), top(C.normalCore), L.bullets, 1),
    white: inst(octa, top(C.white), L.bullets, 2),
    gold: inst(octa, top(C.gold), L.bullets, 2),
    goldRim: inst(new THREE.TorusGeometry(1.25, 0.12, 6, 24), top(C.goldRim), L.bullets, 3),
    red: inst(sphere, top(C.red), L.bullets, 1),
    reflect: inst(sphere, top(C.cyan), L.reflect, 1),
    reflectTail: inst(sphere, top(C.cyan, { transparent: true, opacity: 0.45 }), L.reflect, 0),
    shadow: inst(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.shadow, transparent: true, opacity: S.shadowAlpha, depthWrite: false }), L.shadow, 0),
    shots: inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: S.shotAlpha, depthWrite: false }), L.shots, 0),
    marks: inst(new THREE.SphereGeometry(0.12, 8, 6), top(C.white), L.bullets, 4),
  };
  meshes.goldRim.geometry.rotateX(Math.PI / 2);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const qx = new THREE.Quaternion(), axisY = new THREE.Vector3(0, 1, 0), axisX = new THREE.Vector3(1, 0, 0);
  function put(mesh, x, y, z, sx, sy, sz, yaw = 0, spin = 0) {
    q.setFromAxisAngle(axisY, -yaw);
    if (spin) { qx.setFromAxisAngle(axisX, spin); q.multiply(qx); }
    m4.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz));
    mesh.setMatrixAt(mesh.count++, m4);
  }

  // ── 차선: 줄무늬 텍스처(점선) / 실선
  const stripeCanvas = document.createElement('canvas'); stripeCanvas.width = 64; stripeCanvas.height = 4;
  const sg = stripeCanvas.getContext('2d'); sg.fillStyle = '#fff'; sg.fillRect(0, 0, 36, 4);
  const stripe = new THREE.CanvasTexture(stripeCanvas); stripe.wrapS = THREE.RepeatWrapping;
  const lanePool = [];
  function laneMesh(i) {
    if (!lanePool[i]) {
      const mat = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false, map: stripe.clone() });
      mat.map.wrapS = THREE.RepeatWrapping; mat.map.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0.5, 0, 0);
      const m = new THREE.Mesh(geo, mat); m.position.y = 0.02; L.telegraph.add(m); lanePool[i] = m;
    }
    return lanePool[i];
  }

  // ── 근접 장판: 모양별 지오메트리 캐시, 테두리(옅게) + 채워지는 면
  const geoCache = new Map();
  const areaGeo = (shape, R, half, ring = false) => {
    const key = `${shape}:${R}:${half}:${ring}`;
    if (!geoCache.has(key)) {
      const g = ring ? new THREE.RingGeometry(Math.max(0.1, R - S.waveTele), R, 64, 1, half < Math.PI ? -half : 0, half < Math.PI ? half * 2 : Math.PI * 2) : shape === 'circle' ? new THREE.CircleGeometry(R, 48) : new THREE.CircleGeometry(R, 32, -half, half * 2);
      g.rotateX(-Math.PI / 2);
      geoCache.set(key, g);
    }
    return geoCache.get(key);
  };
  const areaPool = [];
  function areaMeshes(i) {
    if (!areaPool[i]) {
      const edge = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      const fill = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      edge.position.y = 0.015; fill.position.y = 0.025;
      L.telegraph.add(edge, fill); areaPool[i] = { edge, fill };
    }
    return areaPool[i];
  }
  const colorOf = { white: C.white, gold: C.gold, red: C.red };
  const pair = [null, null];
  const AREA_PAIR = (a, b) => { pair[0] = a; pair[1] = b; return pair; };   // 화면마다 새 배열을 만들지 않는다
  const BEAM_PARTS = ['aim', 'sweep', 'ray', 'core', 'tip'];

  // ── 박치기 줄: 판 끝까지 깔린 직사각형(옅은 바탕) + 길이로 채워지는 면
  const planeX = () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0.5, 0, 0); return g; };
  const stripGeo = planeX();
  const mat = (extra = {}) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...extra });
  const lanePool2 = [];
  function slamLane(i) {
    if (!lanePool2[i]) {
      const edge = new THREE.Mesh(stripGeo, mat()), fill = new THREE.Mesh(stripGeo, mat());
      edge.position.y = 0.016; fill.position.y = 0.026;
      L.telegraph.add(edge, fill); lanePool2[i] = { edge, fill };
    }
    return lanePool2[i];
  }

  // ── 퍼지는 파도: 반지름이 매 화면 바뀌는 고리 — 꼭짓점을 직접 고친다
  const RN = 96;
  function ringGeo() {
    const g = new THREE.BufferGeometry(), idx = [];
    for (let i = 0; i < RN; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    g.setIndex(idx); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RN + 1) * 6), 3));
    return g;
  }
  function setRing(g, r0, r1, a0 = 0, span = Math.PI * 2) {
    const p = g.attributes.position.array;
    for (let i = 0; i <= RN; i++) { const a = a0 + i / RN * span, c = Math.cos(a), s = Math.sin(a), k = i * 6; p[k] = c * r0; p[k + 1] = 0; p[k + 2] = s * r0; p[k + 3] = c * r1; p[k + 4] = 0; p[k + 5] = s * r1; }
    g.attributes.position.needsUpdate = true;
  }
  const wavePool = [];
  function waveMeshes(i) {
    if (!wavePool[i]) {
      const band = new THREE.Mesh(ringGeo(), mat({ side: THREE.DoubleSide })), front = new THREE.Mesh(ringGeo(), mat({ side: THREE.DoubleSide }));
      band.position.y = 0.03; front.position.y = 0.035; band.frustumCulled = front.frustumCulled = false;
      L.telegraph.add(band, front); wavePool[i] = { band, front };
    }
    return wavePool[i];
  }

  // ── 레이저: 조준 점선(차선과 같은 줄무늬) + 쓸 쪽 부채, 빔(빨강 + 흰 속) + 끝 불꽃
  const sweepGeo = {};
  const sweepOf = (dir, deg) => {
    const key = `${dir}:${deg}`, S2 = deg * Math.PI / 180;
    if (!sweepGeo[key]) { const g = new THREE.CircleGeometry(1, 24, dir > 0 ? -S2 : 0, S2); g.rotateX(-Math.PI / 2); sweepGeo[key] = g; }   // 지역 θ → 바깥 각 = face − θ
    return sweepGeo[key];
  };
  const beamPool = [];
  function beamMeshes(i) {
    if (!beamPool[i]) {
      const aim = new THREE.Mesh(stripGeo, mat({ map: stripe.clone() }));
      aim.material.map.wrapS = THREE.RepeatWrapping; aim.material.map.needsUpdate = true;
      const sweep = new THREE.Mesh(undefined, mat({ color: C.red }));
      const ray = new THREE.Mesh(stripGeo, top(C.red, { transparent: true })), core = new THREE.Mesh(stripGeo, top(C.beamCore, { transparent: true }));
      const tip = new THREE.Mesh(sphere, top(C.beamTip, { transparent: true }));
      aim.position.y = 0.03; sweep.position.y = 0.012; ray.position.y = S.bh; core.position.y = S.bh + 0.01; tip.position.y = S.bh;
      ray.renderOrder = 5; core.renderOrder = 6; tip.renderOrder = 6;
      L.telegraph.add(aim, sweep); L.bullets.add(ray, core, tip);
      beamPool[i] = { aim, sweep, ray, core, tip };
    }
    return beamPool[i];
  }

  function update(w, alpha, now) {
    drawFloor(w, now);
    for (const m of Object.values(meshes)) m.count = 0;
    const b = w.bullets, vis = S.bulletVisual, minR = S.bulletMinPx * view.unitsPerPx(), bh = S.bh;
    for (let i = 0; i < b.cap; i++) {
      if (!b.alive[i]) continue;
      if (w.result === 'win' && b.kind[i] !== K.REFLECT) continue;   // 이긴 순간 남은 적 탄은 반짝이며 사라진다(main)
      const x = b.px[i] + (b.x[i] - b.px[i]) * alpha, z = b.pz[i] + (b.z[i] - b.pz[i]) * alpha;
      const r = Math.max(b.r[i] * vis, minR), k = b.kind[i];
      const yaw = Math.atan2(b.vz[i], b.vx[i]);
      if (k !== K.REFLECT) put(meshes.shadow, x, 0.01, z, r * 0.9, 1, r * 0.9);
      if (k === K.NORMAL) { put(meshes.normal, x, bh, z, r, r, r); put(meshes.normalCore, x, bh, z, r, r, r); }
      else if (k === K.WHITE) put(meshes.white, x, bh, z, r * 1.15, r * 1.15, r * 1.15, now * 3 + i, 0.6);
      else if (k === K.GOLD) { put(meshes.gold, x, bh, z, r * 1.2, r * 1.2, r * 1.2, now * 3 + i, 0.6); put(meshes.goldRim, x, bh, z, r, r, r); }
      else if (k === K.RED) put(meshes.red, x, bh, z, r * 1.9, r * 0.8, r * 0.8, yaw);
      else {
        const holding = w.time < b.holdUntil[i], big = (b.perfect[i] ? 1.35 : 1) * (b.thrown[i] ? S.thrownScale : 1);   // 모아 던진 탄(§4.11)은 크게
        put(meshes.reflect, x, bh, z, r * big, r * big, r * big);
        if (!holding) put(meshes.reflectTail, x - Math.cos(yaw) * r * 1.6, bh, z - Math.sin(yaw) * r * 1.6, r * (b.perfect[i] ? 3.2 : 2.4) * (b.thrown[i] ? 1.8 : 1), r * 0.6 * (b.thrown[i] ? 1.4 : 1), r * 0.6, yaw);
      }
    }
    // 플레이어 탄(밝기는 매 화면 읽는다 — 수치 패널)
    meshes.shots.material.opacity = S.shotAlpha;
    const over = w.time < w.player.overdriveUntil, shotW = S.shotWidth * (over ? LOOK.feel.overdrive.shotScale : 1);   // 반격 기회(과열): 금빛·굵게
    meshes.shots.material.color.set(over ? C.gold : C.cyan);
    const s = w.shots;
    for (let i = 0; i < s.cap; i++) {
      if (!s.alive[i]) continue;
      const x = s.px[i] + (s.x[i] - s.px[i]) * alpha, z = s.pz[i] + (s.z[i] - s.pz[i]) * alpha;
      put(meshes.shots, x, bh * 1.2, z, S.shotLen, shotW, shotW, Math.atan2(s.vz[i], s.vx[i]));
    }
    // 쪼개지는 구슬의 흰 조각 표시
    const run = w.boss.run;
    if (run && run.id === 4 && !run.burst && run.marks && run.orb >= 0 && b.alive[run.orb]) {
      for (const a of run.marks) put(meshes.marks, b.x[run.orb] + Math.cos(a) * 0.75, bh, b.z[run.orb] + Math.sin(a) * 0.75, 1, 1, 1);
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;

    // 차선
    let li = 0;
    for (const l of w.lanes) {
      const m = laneMesh(li++), age = w.time - l.born, locked = !l.aimed || age >= l.warn - l.lockBefore;
      const len = 28, width = w.rules.bullets.r[l.kind] * 2.2;
      m.visible = true;
      m.position.set(l.x, 0.02, l.z); m.rotation.y = -l.angle;
      m.scale.set(len, 1, width);
      m.material.color.set(l.kind === K.RED ? C.red : C.gold);
      m.material.opacity = (locked ? S.laneAlpha[1] : S.laneAlpha[0]) * (0.8 + 0.2 * Math.sin(now * 25));
      m.material.map.repeat.set(locked ? 0.0001 : len / 1.1, 1);
      m.material.map.offset.x = locked ? 0.5 : -now * 3;
    }
    for (; li < lanePool.length; li++) lanePool[li].visible = false;

    // 근접 장판·장판 공격(원·부채): 채워지는 면이 예고 시간에 걸쳐 가운데서 넓어진다
    let ai = 0;
    const drawArea = a => {
      if (a.shape === 'lane') return;
      const { edge, fill } = areaMeshes(ai++), ring = a.kind === 'wave' || a.kind === 'wing';   // 날갯짓 예고 = 반원 고리
      const g = areaGeo(a.shape, a.R, a.half, ring), c = colorOf[a.color] ?? C.white;
      const u = Math.min(1, (w.time - a.born) / a.warn);
      for (const m of AREA_PAIR(edge, fill)) { m.geometry = g; m.visible = true; m.position.x = a.x; m.position.z = a.z; m.rotation.y = -a.face; m.material.color.set(c); }
      edge.material.opacity = a.hit ? 0.9 : S.areaFill * 0.6;
      fill.material.opacity = a.hit ? 0.95 : S.areaFill + (S.areaEdge - S.areaFill) * u;
      const sc = a.hit || ring ? 1 : u;   // 고리는 크기 대신 밝기로 채운다
      fill.scale.set(sc, 1, sc);
    };
    for (const a of w.melee.areas) drawArea(a);
    for (const a of w.floorAreas ?? []) drawArea(a);
    for (; ai < areaPool.length; ai++) { areaPool[ai].edge.visible = false; areaPool[ai].fill.visible = false; }
  }

  // 장판 공격·파도·레이저
  function drawFloor(w, now) {
    let si = 0;
    for (const a of w.floorAreas ?? []) {
      if (a.shape !== 'lane') continue;
      const { edge, fill } = slamLane(si++), c = colorOf[a.color] ?? C.white;
      const u = Math.min(1, (w.time - a.born) / a.warn);
      for (const m of AREA_PAIR(edge, fill)) { m.visible = true; m.position.x = a.x; m.position.z = a.z; m.rotation.y = -a.face; m.material.color.set(c); }
      edge.scale.set(a.len, 1, a.width); fill.scale.set(Math.max(0.001, a.len * (a.hit ? 1 : u)), 1, a.width);
      edge.material.opacity = S.areaFill * 0.6 * (0.85 + 0.15 * Math.sin(now * 25));
      fill.material.opacity = a.hit ? 0.95 : S.areaFill + (S.areaEdge - S.areaFill) * u;
    }
    for (; si < lanePool2.length; si++) { lanePool2[si].edge.visible = false; lanePool2[si].fill.visible = false; }

    let wi = 0;
    for (const v of w.waves ?? []) {
      const { band, front } = waveMeshes(wi++), c = colorOf[v.color] ?? C.white, th = w.rules.floor.wave.thick;
      // 받아낸 자리(gapAngle)만 끊긴다: 그 둘레 waveGap U를 비운 호
      const gh = Number.isFinite(v.gapAngle) ? Math.min(Math.PI / 2, S.waveGap / Math.max(1, v.r)) : 0;
      let a0 = Number.isFinite(v.gapAngle) ? v.gapAngle + gh : 0, span = Math.PI * 2 - gh * 2;
      if (v.arc) { a0 = v.arc.face - v.arc.half; span = v.arc.half * 2; }   // 날갯짓: 그쪽 반원만(받아낸 끊김은 반원 안이라 생략)
      setRing(band.geometry, Math.max(0, v.r - th), v.r, a0, span); setRing(front.geometry, Math.max(0, v.r - S.waveFront), v.r, a0, span);
      band.visible = front.visible = true;
      band.position.x = front.position.x = v.x; band.position.z = front.position.z = v.z;
      band.material.color.set(c); front.material.color.set(c);
      band.material.opacity = S.waveAlpha[0]; front.material.opacity = S.waveAlpha[1];
    }
    for (; wi < wavePool.length; wi++) { wavePool[wi].band.visible = false; wavePool[wi].front.visible = false; }

    let bi = 0;
    const Lz = w.rules.laser;
    for (const m of w.beams ?? []) {
      const g = beamMeshes(bi++), fired = w.time >= m.fireAt, locked = w.time >= m.fireAt - Lz.lockBefore;
      g.aim.visible = g.sweep.visible = !fired; g.ray.visible = g.core.visible = g.tip.visible = fired;
      if (!fired) {
        g.aim.position.x = m.x; g.aim.position.z = m.z; g.aim.rotation.y = -m.base;
        g.aim.scale.set(m.len, 1, Lz.width * 0.5);
        g.aim.material.color.set(C.red);
        g.aim.material.opacity = (locked ? S.laneAlpha[1] : S.laneAlpha[0]) * (0.8 + 0.2 * Math.sin(now * 25));
        g.aim.material.map.repeat.set(locked ? 0.0001 : m.len / 1.1, 1); g.aim.material.map.offset.x = locked ? 0.5 : -now * 3;
        g.sweep.geometry = sweepOf(m.dir, Lz.sweepDeg);
        g.sweep.position.x = m.x; g.sweep.position.z = m.z; g.sweep.rotation.y = -m.base; g.sweep.scale.set(m.len, 1, m.len);
        g.sweep.material.opacity = S.sweepAlpha;
      } else {
        for (const s of AREA_PAIR(g.ray, g.core)) { s.position.x = m.x; s.position.z = m.z; s.rotation.y = -m.angle; }
        g.ray.scale.set(m.len, 1, Lz.width); g.core.scale.set(m.len, 1, S.beamCore);
        g.ray.material.opacity = S.beamAlpha * (0.85 + 0.15 * Math.sin(now * 40)); g.core.material.opacity = 0.95;
        const tr = S.beamTip * (0.8 + 0.4 * Math.abs(Math.sin(now * 30)));
        g.tip.position.x = m.x + Math.cos(m.angle) * m.len; g.tip.position.z = m.z + Math.sin(m.angle) * m.len; g.tip.scale.setScalar(tr);
      }
    }
    for (; bi < beamPool.length; bi++) for (const k of BEAM_PARTS) beamPool[bi][k].visible = false;
  }

  return { update };
}
