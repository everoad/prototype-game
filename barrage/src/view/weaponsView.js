// 보조 무기 그리기(§4.10): 모두 청록 하나, 옅게, 적 탄 아래(shots 층) — 적 탄 색 읽기가 먼저.
// 미사일(가는 막대 + 옅은 꼬리) · 작은 탄(드론·산탄) · 드론(작은 공) · 빔(가는 속 + 넓은 빛).
export function createWeaponsView(view, LOOK, rules) {
  const THREE = view.THREE, C = LOOK.colors, S = LOOK.sizes, L = view.layers;
  const mat = (opacity) => new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity, depthWrite: false });
  const cap = 128;
  function inst(geo, m) { const x = new THREE.InstancedMesh(geo, m, cap); x.count = 0; x.frustumCulled = false; x.instanceMatrix.setUsage(THREE.DynamicDrawUsage); L.shots.add(x); return x; }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const G = LOOK.guns;
  const missiles = inst(box, mat(G.missile.headAlpha)), pellets = inst(box, mat(S.weaponAlpha));
  // 미사일 꼬리: 지나온 자리를 기억해 마디로 잇는다(사용자 "꼬리가 그냥 직선이라 이상해" — 휘어 날면 꼬리도 그 길로 휜다). 마디마다 색을 어둡게 해 뒤로 사라진다
  const Tr = G.missile.trail, trailCap = 640, trail = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: Tr.alpha, depthWrite: false }), trailCap);
  trail.count = 0; trail.frustumCulled = false; trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); L.shots.add(trail);
  const paths = new WeakMap(), cyan = new THREE.Color(C.cyan), tint = new THREE.Color();
  const drone = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(G.drone.alpha)); drone.visible = false; L.shots.add(drone);   // 드론: 모난 몸이 또렷하게
  const beamGeo = new THREE.PlaneGeometry(1, 1); beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(0.5, 0, 0);
  const beam = new THREE.Mesh(beamGeo, mat(G.beam.coreAlpha)), glow = new THREE.Mesh(beamGeo, mat(S.weaponBeamAlpha * 0.35));
  const rails = [new THREE.Mesh(beamGeo, mat(G.beam.railAlpha)), new THREE.Mesh(beamGeo, mat(G.beam.railAlpha))];   // 빔 양옆의 가는 줄(어긋나게 깜빡인다)
  beam.visible = glow.visible = false; L.shots.add(glow, beam);
  for (const r of rails) { r.visible = false; L.shots.add(r); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (mesh, x, y, z, sx, sy, sz, yaw) => { q.setFromAxisAngle(up, -yaw); m4.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz)); mesh.setMatrixAt(mesh.count++, m4); };

  function update(w, alpha, now) {
    const W = w.weapons, p = w.player, b = w.aim ?? (w.boss.away ? null : w.boss), WR = rules.weapons, y = S.bh * 1.2;   // 겨눈 적(일반 방에서는 가장 가까운 몬스터)
    missiles.count = pellets.count = trail.count = 0;
    if (!W) return;
    const heat = !!w.tries?.on.always && w.time < W.chargeUntil, hk = heat ? G.heat.missileScale : 1, pk = heat ? G.heat.shotScale : 1;   // 과열: 굵게
    const lerp = (a, c) => a + (c - a) * alpha;
    for (const m of W.missiles) if (missiles.count < cap) {
      const mx = lerp(m.px, m.x), mz = lerp(m.pz, m.z);
      put(missiles, mx, y, mz, G.missile.headLen * hk, G.missile.headW * hk, G.missile.headW * hk, m.a);
      let path = paths.get(m);
      if (!path) { path = []; paths.set(m, path); }
      const last = path[path.length - 1];
      if (!last || Math.hypot(mx - last[0], mz - last[1]) >= Tr.step) { path.push([mx, mz]); if (path.length > Tr.n) path.shift(); }
      let ax = mx, az = mz;
      for (let k = path.length - 1; k >= 0 && trail.count < trailCap; k--) {   // 머리에서 뒤로
        const bx = path[k][0], bz = path[k][1], d = Math.hypot(ax - bx, az - bz);
        if (d > 1e-3) {
          const u = (path.length - 1 - k) / Tr.n, tw = (Tr.w[0] + (Tr.w[1] - Tr.w[0]) * u) * hk, at = trail.count;
          put(trail, (ax + bx) / 2, y, (az + bz) / 2, d * 1.06, tw, tw, Math.atan2(az - bz, ax - bx));
          trail.setColorAt(at, tint.copy(cyan).multiplyScalar(1 - (1 - Tr.dim) * u));
        }
        ax = bx; az = bz;
      }
    }
    for (const s of W.pellets) if (pellets.count < cap) put(pellets, lerp(s.px, s.x), y, lerp(s.pz, s.z), S.shotLen * 0.7, S.shotWidth * 1.3 * pk, S.shotWidth * 1.3 * pk, Math.atan2(s.vz, s.vx));
    const px = lerp(p.px, p.x), pz = lerp(p.pz, p.z);
    drone.visible = W.on.includes('drone');
    if (drone.visible) { drone.position.set(px + Math.cos(W.droneA) * WR.drone.offset, y * 1.6, pz + Math.sin(W.droneA) * WR.drone.offset); drone.scale.setScalar(w.time < W.frenzyUntil ? S.frenzyDroneR * (0.9 + 0.1 * Math.sin(now * 40)) : G.drone.r); drone.rotation.y = now * 3; }
    const bigBeam = w.time < W.skillBeamUntil;
    beam.visible = glow.visible = !!b && (w.time < W.beamUntil || bigBeam);
    if (beam.visible) {
      const a = Math.atan2(b.z - pz, b.x - px), len = Math.max(0, Math.hypot(b.x - px, b.z - pz) - (b.r ?? rules.boss.r) * 0.5), f = 0.8 + 0.2 * Math.sin(now * 50);
      for (const m of [beam, glow]) { m.position.set(px, y, pz); m.rotation.y = -a; }
      const wk = bigBeam ? S.skillBeamWidth : 1;   // 굵은 빔(스킬)
      beam.scale.set(len, 1, S.weaponBeamWidth * wk * f); glow.scale.set(len, 1, S.weaponBeamWidth * S.weaponBeamGlow * wk * f);
      rails.forEach((r, k) => {
        const side = k ? 1 : -1, off = G.beam.rail * wk * side;
        r.visible = Math.sin(now * 90 + k * 2.1) > -0.6;   // 가끔 끊기며 깜빡인다
        r.position.set(px - Math.sin(a) * off, y, pz + Math.cos(a) * off); r.rotation.y = -a; r.scale.set(len, 1, G.beam.railW * wk);
      });
    } else for (const r of rails) r.visible = false;
    for (const m of [missiles, pellets, trail]) m.instanceMatrix.needsUpdate = true;
    if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
  }
  return { update };
}
