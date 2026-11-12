// 투석기 그리기(설계서 2026-11-09-flood-catapult-design.md §3): 받침 + 팔(쏘면 앞으로 젖혀졌다 돌아옴), 포물선으로 나는 돌과 땅 그림자,
// 떨어진 자리에 퍼지는 흙먼지. 병사 무리(crowd.js)와 따로 그린다 — 수가 적다.
import * as THREE from 'three';
import { SIDE_COLORS } from './scene.js';

const LOOK = {
  base: [2.6, 1.0, 1.8], wheel: 0.45, armLen: 3.4, armW: 0.28, axleH: 1.2, bucket: 0.6,
  rest: 0.55, fired: -1.15, swing: 0.7,      // 팔 각도(라디안, +는 뒤로 젖힘): 쉴 때 뒤로, 쏜 순간 앞으로, swing초에 걸쳐 돌아온다
  armColor: 0x7a5a3a, selectedEmissive: 0x555555,
  boulder: 0.55, boulderColor: 0x6f6a60, lift: 1.5,
  shadow: 1.3, shadowMin: 0.12, shadowMax: 0.5,
  dust: { seconds: 1.1, r0: 3, r1: 10, opacity: 0.6, color: 0xa08f6a },
};

export function createCatapults(view, rules) {
  const scene = view.scene, bodies = [], rocks = [], dusts = [];
  let seen = new Set();                                   // 지난 화면의 나는 돌(사라지면 떨어진 것 — 흙먼지)

  function body(n) {
    if (bodies[n]) return bodies[n];
    const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const [bx, by, bz] = LOOK.base;
    const base = new THREE.Mesh(new THREE.BoxGeometry(bx, by, bz), mat); base.position.y = LOOK.wheel + by / 2; g.add(base);
    const wheelGeo = new THREE.CylinderGeometry(LOOK.wheel, LOOK.wheel, 0.25, 10).rotateX(Math.PI / 2), wheelMat = new THREE.MeshLambertMaterial({ color: 0x4a3b2a });
    for (const [x, z] of [[-bx / 2.6, bz / 2], [bx / 2.6, bz / 2], [-bx / 2.6, -bz / 2], [bx / 2.6, -bz / 2]]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, LOOK.wheel, z); g.add(w); }
    const pivot = new THREE.Group(); pivot.position.set(-0.3, LOOK.wheel + by + LOOK.axleH * 0.3, 0); g.add(pivot);
    const armMat = new THREE.MeshLambertMaterial({ color: LOOK.armColor });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(LOOK.armW, LOOK.armLen, LOOK.armW), armMat); arm.position.y = LOOK.armLen / 2; pivot.add(arm);
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(LOOK.bucket, LOOK.bucket * 0.5, LOOK.bucket), armMat); bucket.position.y = LOOK.armLen; pivot.add(bucket);
    scene.add(g);
    return (bodies[n] = { g, pivot, mat });
  }
  const rockGeo = new THREE.SphereGeometry(LOOK.boulder, 10, 8), rockMat = new THREE.MeshLambertMaterial({ color: LOOK.boulderColor });
  const shadowGeo = new THREE.CircleGeometry(LOOK.shadow, 12).rotateX(-Math.PI / 2);
  function rock(n) {
    if (rocks[n]) return rocks[n];
    const m = new THREE.Mesh(rockGeo, rockMat), sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    scene.add(m); scene.add(sh);
    return (rocks[n] = { m, sh });
  }
  const dustGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);

  // visible(i): 그릴 병사인가(안개), seeAt(x, z): 그 자리가 보이나, selected: 병사 번호마다 1 = 고른 병사.
  function update(world, alpha, visible = null, seeAt = null, selected = null) {
    const s = world.soldiers, now = world.time, U = rules.units;
    let n = 0;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i] || !U[s.side[i]][s.type[i]].catapult || (visible && !visible(i))) continue;
      const b = body(n++), x = s.px[i] + (s.x[i] - s.px[i]) * alpha, z = s.pz[i] + (s.z[i] - s.pz[i]) * alpha;
      b.g.visible = true;
      b.g.position.set(x, view.heightAt(x, z), -z);
      b.g.rotation.y = s.facing[i];
      const since = now - s.fireAt[i], k = since < LOOK.swing ? since / LOOK.swing : 1;
      b.pivot.rotation.z = LOOK.fired + (LOOK.rest - LOOK.fired) * k * k;   // 쏘면 앞으로 젖혀졌다가 천천히 돌아온다
      b.mat.color.setHex(SIDE_COLORS[s.side[i]]).multiplyScalar(0.85);
      b.mat.emissive.setHex(selected && selected[i] ? LOOK.selectedEmissive : 0x000000);
    }
    for (let k = n; k < bodies.length; k++) bodies[k].g.visible = false;

    const A = rules.catapult.arc, now2 = new Set();
    let r = 0;
    for (const bo of world.boulders) {
      now2.add(bo);
      if (seeAt && !seeAt(bo.x0, bo.z0) && !seeAt(bo.x1, bo.z1)) continue;
      const t = Math.min(1, Math.max(0, (now - bo.t0) / (bo.t1 - bo.t0))), x = bo.x0 + (bo.x1 - bo.x0) * t, z = bo.z0 + (bo.z1 - bo.z0) * t, ground = view.heightAt(x, z);
      const R = rock(r++);
      R.m.visible = R.sh.visible = true;
      R.m.position.set(x, ground + LOOK.lift + 4 * A * t * (1 - t), -z);
      R.sh.position.set(x, ground + 0.25, -z);
      R.sh.material.opacity = LOOK.shadowMin + (LOOK.shadowMax - LOOK.shadowMin) * t;   // 떨어질수록 진해진다
    }
    for (let k = r; k < rocks.length; k++) rocks[k].m.visible = rocks[k].sh.visible = false;
    for (const bo of seen) if (!now2.has(bo) && (!seeAt || seeAt(bo.x1, bo.z1))) {   // 떨어졌다 → 흙먼지
      const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: LOOK.dust.color, transparent: true, opacity: LOOK.dust.opacity, depthWrite: false }));
      m.position.set(bo.x1, view.heightAt(bo.x1, bo.z1) + 0.3, -bo.z1);
      scene.add(m); dusts.push({ m, at: now });
    }
    seen = now2;
    const D = LOOK.dust;
    for (let k = dusts.length - 1; k >= 0; k--) {
      const d = dusts[k], age = (now - d.at) / D.seconds;   // 판 시각으로(빠르기·녹화에 맞게)
      if (age >= 1) { scene.remove(d.m); d.m.material.dispose(); dusts.splice(k, 1); continue; }
      const rr = D.r0 + (D.r1 - D.r0) * Math.sqrt(age);
      d.m.scale.set(rr, 1, rr); d.m.material.opacity = D.opacity * (1 - age);
    }
  }
  return { update };
}
