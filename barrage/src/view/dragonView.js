// 상자 용(설계 용 §7): 몸통·목·머리(눈 둘, 아래턱, 입 빛)·날개 둘·꼬리 마디·다리 넷. 정면 = +x(보스 무리가 -face로 돈다).
// 자세는 dragonPose(w)가 정하고 여기서는 따라 움직이기만 한다. 몸 재질은 보스 재질(번쩍임·금 갈라짐 그대로)을 같이 쓴다.
import { dragonPose, neckYaw } from './dragonPose.js';

export function createDragonView(view, LOOK, bodyMat) {
  const THREE = view.THREE, C = LOOK.colors, G = LOOK.dragon;
  const box = ([x, y, z], mat = bodyMat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat); m.castShadow = true; return m; };
  const wingMat = new THREE.MeshLambertMaterial({ color: C.bossDark, emissive: new THREE.Color('#000000'), side: THREE.DoubleSide });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  // 몸통
  const torso = box(G.torso); torso.position.y = G.torsoY; body.add(torso);
  // 목 → 머리 → 아래턱·눈·입 빛
  const neck = new THREE.Group(); neck.position.set(G.neckAt[0], G.neckAt[1], 0); body.add(neck);
  const neckBox = box(G.neck); neckBox.position.x = G.neck[0] / 2; neck.add(neckBox);
  const head = new THREE.Group(); head.position.x = G.neck[0]; neck.add(head);
  const skull = box(G.head); skull.position.set(G.head[0] / 2, G.head[1] * 0.15, 0); head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0.05, -G.head[1] * 0.25, 0); head.add(jaw);
  const jawBox = box(G.jaw); jawBox.position.x = G.jaw[0] / 2; jaw.add(jawBox);
  const eyeMat = new THREE.MeshBasicMaterial({ color: C.bossEye });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), eyeMat); e.position.set(G.head[0] * 0.7, G.head[1] * 0.45, s * G.head[2] * 0.36); head.add(e); }
  const glowMat = new THREE.MeshBasicMaterial({ color: C.white, transparent: true, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(G.mouthGlow, 12, 8), glowMat); glow.position.set(G.head[0] * 0.95, -G.head[1] * 0.1, 0); head.add(glow);
  // 날개: 어깨에서 옆으로(왼쪽 = +z = 용이 보는 쪽에서 반시계)
  const wings = [1, -1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(G.wingAt[0], G.wingAt[1], side * G.wingAt[2]); body.add(pivot);
    const m = box(G.wing, wingMat); m.position.set(-G.wing[0] * 0.25, 0, side * G.wing[2] / 2); pivot.add(m);
    return { pivot, side };
  });
  // 꼬리: 마디마다 다음 마디의 뿌리
  const tail = [];
  let parent = new THREE.Group(); parent.position.set(G.tailAt[0], G.tailAt[1], 0); body.add(parent);
  for (let i = 0; i < G.tailSegs; i++) {
    const k = Math.pow(G.tailTaper, i), seg = new THREE.Group();
    const m = box([G.tailSeg[0], G.tailSeg[1] * k, G.tailSeg[2] * k]); m.position.x = -G.tailSeg[0] / 2; seg.add(m);
    if (i > 0) seg.position.x = -G.tailSeg[0];
    parent.add(seg); tail.push(seg); parent = seg;
  }
  // 다리 넷: 엉덩이에서 아래로
  const legs = [];
  for (const [lx, front] of [[G.legX, true], [-G.legX, false]]) for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(lx, G.leg[1], s * G.legZ); body.add(hip);
    const m = box(G.leg); m.position.y = -G.leg[1] / 2; hip.add(m);
    legs.push({ hip, front, phase: (front ? 0 : Math.PI) + (s > 0 ? 0 : Math.PI) });
  }

  const cur = dragonPose({ boss: { groggyUntil: -1, state: 'idle', stateAt: 0 }, time: 0, rules: { brain: { windup: 1 } } });
  const lerp = (a, b, t) => a + (b - a) * t;
  let walk = 0, lastX = null, lastZ = null;

  // flash = 준비 중이면 위협 색(입 빛), 아니면 null
  function update(w, now, flash) {
    const P = dragonPose(w), k = G.follow, b = w.boss;
    for (const key of Object.keys(cur)) cur[key] = key === 'tail' && Math.sign(P.tail) !== Math.sign(cur.tail) && P.tail < 0 ? lerp(cur[key], P[key], G.swingFollow) : lerp(cur[key], P[key], k);
    // 걷기: 걸은 거리만큼 다리를 번갈아 든다
    if (lastX != null) walk += Math.hypot(b.x - lastX, b.z - lastZ) * G.walkRate;
    lastX = b.x; lastZ = b.z;
    const low = cur.crouch * G.crouch + cur.down * G.down;
    body.position.y = -low;
    body.rotation.z = -cur.pitch;   // 나는 용: 떠오를 때 머리를 들고, 내리꽂을 때 숙인다
    torso.rotation.z = -cur.down * 0.08;
    neck.rotation.z = G.neckPitch + cur.headLift * G.lift - cur.down * (G.neckPitch + 0.55);
    neck.rotation.y = neckYaw(cur);
    neckBox.scale.set(1, cur.neck, cur.neck);
    head.rotation.z = -G.neckPitch - cur.headLift * G.lift * 0.4 + cur.down * 0.4;
    jaw.rotation.z = -cur.jaw * G.jawOpen;
    for (const g of wings) {
      const v = g.side > 0 ? cur.wingL : cur.wingR;
      const a = v >= 0 ? lerp(G.wingFold, G.wingUp, v) : G.wingDown * -v, span = v >= 0 ? lerp(G.wingFoldSpan, 1, v) : 1;
      g.pivot.rotation.x = -g.side * a; g.pivot.scale.set(1, 1, span);
    }
    for (const seg of tail) seg.rotation.y = cur.tail >= 0 ? cur.tail * G.tailCurl : cur.tail * G.tailSwing;
    for (const L of legs) {
      const swing = Math.sin(walk + L.phase) * G.walkSwing * (1 - cur.down);
      L.hip.rotation.z = swing + (L.front ? cur.paws * G.pawLift : 0) - cur.tuck * G.tuck;   // 떠 있을 때는 다리를 뒤로 접는다
      L.hip.rotation.x = cur.down * 0.7 * Math.sign(L.hip.position.z);
      L.hip.scale.y = 1 - cur.crouch * 0.3;
    }
    // 날개도 보스 번쩍임을 조금 받는다, 입 빛 = 위협 색
    wingMat.emissive.copy(bodyMat.emissive); wingMat.emissiveIntensity = bodyMat.emissiveIntensity * 0.6;
    glow.visible = !!flash && cur.jaw > 0.25;
    if (glow.visible) { glowMat.color.set(flash); glowMat.opacity = 0.6 + 0.4 * Math.sin(now * 30); }
  }
  return { root, update };
}
