// 보조 무기 그리기(§4.10): 모두 청록 하나, 옅게, 적 탄 아래(shots 층) — 적 탄 색 읽기가 먼저.
// 미사일(가는 막대 + 옅은 꼬리) · 작은 탄(드론·산탄) · 드론(작은 공) · 빔(가는 속 + 넓은 빛).
export function createWeaponsView(view, LOOK, rules) {
  const THREE = view.THREE, C = LOOK.colors, S = LOOK.sizes, L = view.layers;
  const mat = (opacity) => new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity, depthWrite: false });
  const cap = 128;
  function inst(geo, m) { const x = new THREE.InstancedMesh(geo, m, cap); x.count = 0; x.frustumCulled = false; x.instanceMatrix.setUsage(THREE.DynamicDrawUsage); L.shots.add(x); return x; }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const missiles = inst(box, mat(S.weaponAlpha)), tails = inst(box, mat(S.weaponAlpha * 0.35)), pellets = inst(box, mat(S.weaponAlpha));
  const drone = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat(S.weaponAlpha + 0.2)); drone.visible = false; L.shots.add(drone);
  const beamGeo = new THREE.PlaneGeometry(1, 1); beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(0.5, 0, 0);
  const beam = new THREE.Mesh(beamGeo, mat(S.weaponBeamAlpha)), glow = new THREE.Mesh(beamGeo, mat(S.weaponBeamAlpha * 0.35));
  beam.visible = glow.visible = false; L.shots.add(glow, beam);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (mesh, x, y, z, sx, sy, sz, yaw) => { q.setFromAxisAngle(up, -yaw); m4.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz)); mesh.setMatrixAt(mesh.count++, m4); };

  function update(w, alpha, now) {
    const W = w.weapons, p = w.player, b = w.boss, WR = rules.weapons, y = S.bh * 1.2;
    missiles.count = tails.count = pellets.count = 0;
    if (!W) return;
    const lerp = (a, c) => a + (c - a) * alpha;
    for (const m of W.missiles) if (missiles.count < cap) {
      const mx = lerp(m.px, m.x), mz = lerp(m.pz, m.z);
      put(missiles, mx, y, mz, S.missileLen, 0.1, 0.1, m.a);
      put(tails, mx - Math.cos(m.a) * S.missileTail * 0.6, y, mz - Math.sin(m.a) * S.missileTail * 0.6, S.missileTail, 0.07, 0.07, m.a);   // 꼬리
    }
    for (const s of W.pellets) if (pellets.count < cap) put(pellets, lerp(s.px, s.x), y, lerp(s.pz, s.z), S.shotLen * 0.7, S.shotWidth, S.shotWidth, Math.atan2(s.vz, s.vx));
    const px = lerp(p.px, p.x), pz = lerp(p.pz, p.z);
    drone.visible = W.on.includes('drone');
    if (drone.visible) { drone.position.set(px + Math.cos(W.droneA) * WR.drone.offset, y * 1.6, pz + Math.sin(W.droneA) * WR.drone.offset); drone.scale.setScalar(w.time < W.frenzyUntil ? S.frenzyDroneR * (0.9 + 0.1 * Math.sin(now * 40)) : S.droneR); }
    const bigBeam = w.time < W.skillBeamUntil;
    beam.visible = glow.visible = w.time < W.beamUntil || bigBeam;
    if (beam.visible) {
      const a = Math.atan2(b.z - pz, b.x - px), len = Math.max(0, Math.hypot(b.x - px, b.z - pz) - rules.boss.r * 0.5), f = 0.8 + 0.2 * Math.sin(now * 50);
      for (const m of [beam, glow]) { m.position.set(px, y, pz); m.rotation.y = -a; }
      const wk = bigBeam ? S.skillBeamWidth : 1;   // 굵은 빔(스킬)
      beam.scale.set(len, 1, S.weaponBeamWidth * wk * f); glow.scale.set(len, 1, S.weaponBeamWidth * S.weaponBeamGlow * wk * f);
    }
    for (const m of [missiles, tails, pellets]) m.instanceMatrix.needsUpdate = true;
  }
  return { update };
}
