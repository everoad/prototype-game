// 나는 용(sim/dragon2.js)의 높이를 쓰는 연출 — 사용자 2026-11-19: "날아다니는 거라든지 연출 같은 건 xyz축 다 써 줘."
// 판정은 바닥의 원과 시각이 정한다(sim). 여기서는 그것이 하늘에서 벌어지는 일로 보이게만 한다:
//  · 발밑 그림자: 용이 뜨면 작아지고 옅어진다 — 지금 어디 위에 떠 있는지를 읽는 것
//  · 불기둥: 불줄을 긋는 동안 입에서 바로 밑의 땅까지 비스듬히 내리꽂힌다
//  · 솟는 불: 원이 터지는 자리에서 불길이 위로 솟았다 꺼진다 · 불티가 위로 튄다
//  · 내려앉는 순간: 둘레로 흙먼지가 퍼지고 불길이 낮게 솟는다
// 판 상태는 읽기만 한다. 수치는 LOOK.wyrm. 떠 있는 몸의 자세(날갯짓 · 숙임 · 다리 접기)는 dragonPose.js가 정한다.
export function createWyrmView(view, LOOK, fx) {
  const THREE = view.THREE, C = LOOK.colors, G = LOOK.wyrm, L = view.layers;
  const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra });

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), flat('#000000'));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.visible = false;
  L.shadow.add(shadow);

  // 불기둥: 길이 1의 상자 둘(겉 + 속)을 입 → 땅 방향으로 눕히고 늘인다
  const box = new THREE.BoxGeometry(1, 1, 1);
  const colOuter = new THREE.Mesh(box, flat(C.red)), colCore = new THREE.Mesh(box, flat(G.column.core));
  for (const m of [colOuter, colCore]) { m.visible = false; L.fx.add(m); }
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  function placeColumn(m, wide) {
    dir.copy(to).sub(from);
    const len = dir.length();
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.scale.set(wide, len, wide);
    m.visible = true;
  }

  // 솟는 불: 열린 원기둥(위로 갈수록 좁다) 풀
  const pillarGeo = new THREE.CylinderGeometry(0.55, 1, 1, 14, 1, true);
  pillarGeo.translate(0, 0.5, 0);
  const free = [], live = [];
  function pillar(now, x, z, R, h, sec, color) {
    const m = free.pop() ?? new THREE.Mesh(pillarGeo, flat(color, { side: THREE.DoubleSide }));
    m.material.color.set(color);
    m.position.set(x, 0.02, z);
    L.fx.add(m);
    live.push({ m, t0: now, R, h, sec });
  }

  function onEvents(events, now, w) {
    if (!w.boss.wyrm) return;
    for (const e of events) {
      if (e.type === 'fireBoom') {
        const B = G.boom;
        pillar(now, e.x, e.z, e.R * B.r, B.h, B.sec, C.red);
        pillar(now, e.x, e.z, e.R * B.r * 0.5, B.h * 1.25, B.sec * 0.8, G.column.core);
        fx.rise(e.x, e.z, 'red', B.sparks, B.sparkUp);
      } else if (e.type === 'wyrmLand') {
        const D = G.land, c = e.color === 'red' ? C.red : C.white;
        for (let k = 0; k < D.n; k++) { const a = k / D.n * Math.PI * 2; pillar(now, e.x + Math.cos(a) * D.r, e.z + Math.sin(a) * D.r, D.w, D.h, D.sec, c); }
        fx.rise(e.x, e.z, e.color === 'red' ? 'red' : 'white', D.sparks, D.sparkUp);
      } else if (e.type === 'wyrmTakeoff') fx.rise(e.x, e.z, 'grey', G.takeoff.sparks, G.takeoff.up);
    }
  }

  function update(w, now) {
    const b = w.boss, on = !!b.wyrm && !b.dead;
    const alt = b.alt ?? 0, S = G.shadow;
    shadow.visible = on && alt > 0.05;
    if (shadow.visible) {
      const k = Math.max(S.min, 1 - alt * S.shrink);
      shadow.position.x = b.x; shadow.position.z = b.z;
      shadow.scale.setScalar(S.r * k);
      shadow.material.opacity = S.alpha * k;
    }
    // 불기둥: 입(떠 있는 높이 + 머리 높이, 보는 쪽 앞)에서 조금 뒤의 땅으로. 굵기가 떨린다.
    const strafing = on && b.state === 'strafe';
    colOuter.visible = colCore.visible = false;
    if (strafing) {
      const K = G.column, fx0 = Math.cos(b.face), fz0 = Math.sin(b.face), flick = 1 + K.flicker * Math.sin(now * K.rate);
      from.set(b.x + fx0 * K.mouthAt, alt + K.mouthY, b.z + fz0 * K.mouthAt);
      to.set(b.x - fx0 * K.back, 0.05, b.z - fz0 * K.back);
      placeColumn(colOuter, K.w * flick); placeColumn(colCore, K.w * K.coreShare * (2 - flick));
      colOuter.material.opacity = K.alpha; colCore.material.opacity = 0.95;
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const it = live[i], u = (now - it.t0) / it.sec;
      if (u >= 1 || u < 0) { L.fx.remove(it.m); free.push(it.m); live.splice(i, 1); continue; }
      const grow = 1 - (1 - u) ** 3;
      it.m.scale.set(it.R * (0.7 + 0.3 * grow), Math.max(0.01, it.h * grow), it.R * (0.7 + 0.3 * grow));
      it.m.material.opacity = (1 - u) ** 1.5 * 0.85;
    }
  }
  return { onEvents, update, count: () => live.length };
}
