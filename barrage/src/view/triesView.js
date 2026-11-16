// 실험 기믹 그리기(?try= — sim/tries.js): 갈고리 말뚝과 줄, 엄폐 기둥, 불 장판. 꺼져 있으면 아무것도 그리지 않는다.
// 색: 말뚝·줄 = 청록(플레이어의 것), 기둥 = 난간 색(판의 일부), 불 = 빨강(피할 것 — 걸어서 나온다).
import { rayInBoard } from './warp.js';

export function createTriesView(view, LOOK) {
  const THREE = view.THREE, C = LOOK.colors, L = view.layers;
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const pools = { anchors: [], pillars: [], fires: [], mines: [], crystals: [] };
  const discGeo = flat(new THREE.CircleGeometry(1, 32));
  const rope = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: C.cyan }));
  rope.visible = false; L.actors.add(rope);
  // 보호막: 보스를 감싼 옅은 자주 공(받아칠 수 없는 것이라 흰·금이 아니다). 맞을수록 옅어진다
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: C.normalCore, transparent: true, depthWrite: false }));
  bubble.visible = false; L.fx.add(bubble);
  // 저격: 조준선(가는 속 + 넓은 빛, 청록 = 플레이어의 것)과 쏜 순간의 굵은 섬광. 몸에서 +x로 뻗는 판을 돌려 쓴다
  const lineGeo = flat(new THREE.PlaneGeometry(1, 1)); lineGeo.translate(0.5, 0, 0);
  const lineMat = o => new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: o, depthWrite: false });
  const aimLine = new THREE.Mesh(lineGeo, lineMat(1)), aimGlow = new THREE.Mesh(lineGeo, lineMat(1)), aimFlash = new THREE.Mesh(lineGeo, lineMat(1));
  for (const m of [aimLine, aimGlow, aimFlash]) { m.visible = false; L.fx.add(m); }
  // 저격이 가른 공기: 줄 양옆으로 비스듬히 튀어 나가는 바람 줄(줄을 따라 차례로 — 쏜 쪽에서 먼 쪽으로)
  const Gv = LOOK.tries.snipe.gust, gust = new THREE.InstancedMesh(lineGeo, lineMat(Gv.alpha), Gv.n), dummy = new THREE.Object3D();
  gust.count = 0; gust.frustumCulled = false; gust.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gust.visible = false; L.fx.add(gust);
  const hash = k => { const s = Math.sin(k * 127.1) * 43758.5453; return s - Math.floor(s); };
  // 조준점: 가운데가 빈 십자 + 점(고리는 쓰지 않는다 — 고리는 패링·파도의 뜻)
  const cross = new THREE.Group(), crossMat = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  {
    const Cr = LOOK.tries.snipe.cross, bar = flat(new THREE.PlaneGeometry(1, 1));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = new THREE.Mesh(bar, crossMat);
      m.position.set(dx * (Cr.gap + Cr.arm / 2), 0, dz * (Cr.gap + Cr.arm / 2)); m.scale.set(dx ? Cr.arm : Cr.w, 1, dx ? Cr.w : Cr.arm);
      cross.add(m);
    }
    const dot = new THREE.Mesh(bar, crossMat); dot.scale.set(Cr.dot, 1, Cr.dot); cross.add(dot);
  }
  cross.visible = false; cross.renderOrder = 20; (L.marker ?? L.fx).add(cross);
  const lay = (m, x, z, angle, len, width, y, opacity) => { m.visible = true; m.position.set(x, y, z); m.rotation.y = -angle; m.scale.set(len, 1, width); m.material.opacity = opacity; };

  const make = {
    anchors() {
      const T = LOOK.tries, g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(T.anchorR, T.anchorR * 1.4, T.anchorH, 10), new THREE.MeshLambertMaterial({ color: C.playerDark }));
      post.position.y = T.anchorH / 2; post.castShadow = true;
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(T.anchorTop, 0), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true }));
      top.position.y = T.anchorH + T.anchorTop;
      g.add(post, top); L.actors.add(g);
      return { g, top };
    },
    pillars() {
      const T = LOOK.tries, g = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, T.pillarH, 20), new THREE.MeshLambertMaterial({ color: C.railTop }));
      g.castShadow = true; L.actors.add(g);
      return { g };
    },
    mines() {   // 지뢰: 바닥의 청록 원판 + 작은 뿔
      const T = LOOK.tries, g = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, depthWrite: false, opacity: 0.35 }));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(T.mineR * 0.6, T.mineR * 1.4, 6), new THREE.MeshBasicMaterial({ color: C.cyan }));
      g.position.y = 0.014; L.floorFx.add(g); L.actors.add(spike);
      return { g, spike };
    },
    crystals() {   // 수정: 흰 결정(패링으로 치는 것 — 흰색), 쉬는 동안은 어둡다
      const T = LOOK.tries, g = new THREE.Mesh(new THREE.OctahedronGeometry(T.crystalR, 0), new THREE.MeshBasicMaterial({ color: C.white, transparent: true }));
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, T.crystalH * 0.5, 8), new THREE.MeshLambertMaterial({ color: C.railTop }));
      L.actors.add(g, base);
      return { g, base };
    },
    fires() {
      const g = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: C.red, transparent: true, depthWrite: false }));
      const core = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: C.beamCore, transparent: true, depthWrite: false }));
      g.position.y = 0.014; core.position.y = 0.016; L.floorFx.add(g, core);
      return { g, core };
    },
  };
  function sync(name, list, place) {
    const pool = pools[name];
    for (let k = 0; k < list.length; k++) { pool[k] ??= make[name](); place(pool[k], list[k], k); }
    for (let k = 0; k < pool.length; k++) for (const m of Object.values(pool[k])) m.visible = k < list.length;
  }

  function update(w, alpha, now) {
    const X = w.tries, T = LOOK.tries, p = w.player;
    sync('anchors', X ? X.anchors : [], (v, a, k) => {
      v.g.position.set(a.x, 0, a.z);
      const ready = w.time >= X.rope.readyAt && !X.rope.to;
      v.top.rotation.y = now * 2 + k;
      v.top.material.opacity = X.rope.to === a ? 1 : ready ? 0.55 + 0.25 * Math.sin(now * 4 + k) : 0.2;
    });
    sync('pillars', X ? X.pillars : [], (v, c) => { const k = Math.max(0.35, c.hp / w.rules.tries.pillars.hp); v.g.position.set(c.x, T.pillarH * k / 2, c.z); v.g.scale.set(c.r, k, c.r); });   // 막을수록 낮아진다
    sync('fires', X ? X.fires : [], (v, f, k) => {
      const left = f.until - w.time, fade = Math.min(1, left / T.fireFade), grow = Math.min(1, (w.time - f.born) / 0.25);
      const flick = 0.5 + 0.5 * Math.sin(now * 17 + k * 2.1) * Math.sin(now * 7.3 + k);
      v.g.position.x = v.core.position.x = f.x; v.g.position.z = v.core.position.z = f.z;
      v.g.scale.setScalar(f.r * grow); v.core.scale.setScalar(f.r * grow * (0.45 + 0.15 * flick));
      v.g.material.opacity = (T.fireAlpha[0] + (T.fireAlpha[1] - T.fireAlpha[0]) * flick) * fade;
      v.core.material.opacity = 0.35 * fade * (0.6 + 0.4 * flick);
    });
    sync('mines', X ? X.mines : [], (v, m, k) => {
      const armed = w.time >= m.born + w.rules.tries.mine.arm, beat = armed ? 0.7 + 0.3 * Math.sin(now * 8 + k) : 0.4;
      v.g.position.x = m.x; v.g.position.z = m.z; v.g.scale.setScalar(T.mineR * 1.6); v.g.material.opacity = 0.4 * beat;
      v.spike.position.set(m.x, T.mineR * 0.7, m.z); v.spike.scale.setScalar(m.perfect ? 1.25 : 1);
    });
    sync('crystals', X ? X.crystals : [], (v, c, k) => {
      const ready = w.time >= c.readyAt;
      v.base.position.set(c.x, T.crystalH * 0.25, c.z);
      v.g.position.set(c.x, T.crystalH * 0.5 + T.crystalR + (ready ? 0.08 * Math.sin(now * 3 + k) : 0), c.z);
      v.g.rotation.y = now * (ready ? 1.5 : 0.2) + k;
      v.g.material.opacity = ready ? 0.95 : 0.25;
    });
    const Bb = X?.bubble;
    bubble.visible = !!Bb && Bb.on && !w.boss.away && !w.boss.dead;
    if (bubble.visible) {
      const b = w.boss, k = Bb.hp / w.rules.tries.bubble.hits;
      bubble.position.set(lerp(b.px, b.x, alpha), LOOK.sizes.bossH * 0.5, lerp(b.pz, b.z, alpha));
      bubble.scale.setScalar(T.bubbleR * (1 + 0.02 * Math.sin(now * 6)));
      bubble.material.opacity = T.bubbleAlpha[0] + (T.bubbleAlpha[1] - T.bubbleAlpha[0]) * k;
    }
    const sn = X?.snipe, Sv = T.snipe;
    aimLine.visible = aimGlow.visible = aimFlash.visible = cross.visible = gust.visible = false;
    if (sn) {
      const len = w.rules.tries.snipe.len;
      if (sn.on) {
        const x = lerp(p.px, p.x, alpha), z = lerp(p.pz, p.z, alpha), pulse = 0.85 + 0.15 * Math.sin(now * 18);
        lay(aimLine, x, z, sn.angle, len, Sv.aimW, Sv.y, Sv.aimAlpha * pulse);
        lay(aimGlow, x, z, sn.angle, len, Sv.glowW, Sv.y - 0.01, Sv.glowAlpha);
        cross.visible = true; cross.position.set(lerp(sn.rpx, sn.rx, alpha), Sv.cross.y, lerp(sn.rpz, sn.rz, alpha)); cross.rotation.y = now * Sv.cross.spin;
      }
      const since = w.time - sn.firedAt;
      let shown = 0;
      if (since >= 0 && since < Gv.sec + len / Gv.wave) {
        const ca = Math.cos(sn.fa), sa = Math.sin(sn.fa), inside = rayInBoard(w.rules.board, sn.fx, sn.fz, sn.fa, len);
        for (let k = 0; k < Gv.n; k++) {
          const s = inside * (k + hash(k)) / Gv.n, side = k % 2 ? 1 : -1, u = (since - s / Gv.wave) / Gv.sec;
          if (u <= 0 || u >= 1) continue;
          let dx = -sa * side + ca * Gv.sweep, dz = ca * side + sa * Gv.sweep;   // 바깥 + 쏜 쪽으로 비스듬히
          const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
          const ease = 1 - (1 - u) * (1 - u), off = Gv.start + Gv.dist * ease * (0.6 + 0.8 * hash(k + 50));
          dummy.position.set(sn.fx + ca * s + dx * off, Gv.y, sn.fz + sa * s + dz * off);
          dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
          dummy.scale.set(Gv.len * (1 - u) * (0.6 + 0.8 * hash(k + 9)), 1, Gv.w * (1 - u * 0.5));
          dummy.updateMatrix(); gust.setMatrixAt(shown++, dummy.matrix);
        }
      }
      gust.count = shown; gust.visible = shown > 0; gust.instanceMatrix.needsUpdate = true;
      if (since >= 0 && since < Sv.flashSec) { const k = 1 - since / Sv.flashSec; lay(aimFlash, sn.fx, sn.fz, sn.fa, len, Sv.flashW * (0.3 + 0.7 * k), Sv.y + 0.01, k); }
    }
    // 줄: 플레이어 몸에서 말뚝 꼭대기까지
    const to = X?.rope.to;
    rope.visible = !!to;
    if (to) {
      const x = lerp(p.px, p.x, alpha), z = lerp(p.pz, p.z, alpha), y0 = 0.8, y1 = T.anchorH + T.anchorTop;
      const dx = to.x - x, dz = to.z - z, dy = y1 - y0, len = Math.hypot(dx, dy, dz);
      rope.position.set(x + dx / 2, y0 + dy / 2, z + dz / 2);
      rope.scale.set(len, T.ropeW, T.ropeW);
      rope.rotation.set(0, 0, 0);
      rope.rotation.y = -Math.atan2(dz, dx);
      rope.rotateZ(Math.atan2(dy, Math.hypot(dx, dz)));
    }
  }
  return { update };
}
