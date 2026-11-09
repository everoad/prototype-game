// 병사 그리기: 편 × 병종마다 InstancedMesh 하나, 앞 틱과 이번 틱 사이 보간, 쓰러진 흔적(5초에 걸쳐 작아짐).
import * as THREE from 'three';
import { SIDE_COLORS, CAST_COLORS } from './scene.js';

const LOOK = {
  // 창 = 원기둥, 궁 = 원뿔, 기병 = 길쭉한 상자(앞이 +x), 보병 = 낮은 네모 기둥, 공성 = 정육면체(병종 번호 차례 — rules.js)
  shapes: [
    () => new THREE.CylinderGeometry(0.42, 0.42, 1.8, 6).translate(0, 0.9, 0),
    () => new THREE.ConeGeometry(0.55, 1.9, 6).translate(0, 0.95, 0),
    () => new THREE.BoxGeometry(2.4, 1.7, 0.85).translate(0, 0.85, 0),
    () => new THREE.CylinderGeometry(0.5, 0.5, 1.4, 4).translate(0, 0.7, 0),   // 보병: 낮은 네모 기둥
    () => new THREE.BoxGeometry(1.5, 1.5, 1.5).translate(0, 0.75, 0),          // 공성(사람 공성병·몬스터 오거)
  ],
  brightness: [0.8, 1.3, 0.72, 1.12, 0.55],
  selectedTint: 2.6,   // 고른 병사 색 배율(사용자 2026-11-08 PC 조작)
  // 금 명령 효과 빛깔: 병사 색을 그 명령 색(scene.js CAST_COLORS — 강행군 하늘색·전쟁 북 금빛·화살 비 보라) 쪽으로 effectMix만큼 섞는다
  // (곱하기만 하면 초록 병사에 금빛이 안 보인다). 차례: 고른 병사 > 겨누기 미리 보기 > 화살 비 > 전쟁 북 > 강행군
  effectOrders: ['march', 'drum', 'volley'], effectMix: 0.7,
  corpseColor: 0x55503f, corpseSeconds: 5, corpseMax: 6000, corpseRadius: 0.55,
  shotMax: 4000, shotSeconds: 0.45, shotLength: 3, shotColors: [0x0c447c, 0x412402],
};

export function createCrowd(view, rules, capacity) {
  const meshes = [0, 1].map(side => LOOK.shapes.map((make, type) => {
    const color = new THREE.Color(SIDE_COLORS[side]).multiplyScalar(LOOK.brightness[type]);
    const m = new THREE.InstancedMesh(make(), new THREE.MeshLambertMaterial({ color }), capacity);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);   // 고른 병사는 밝게
    m.frustumCulled = false;
    m.count = 0;
    view.scene.add(m);
    return m;
  }));

  const corpseMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(LOOK.corpseRadius, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LOOK.corpseColor }), LOOK.corpseMax);
  corpseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  corpseMesh.frustumCulled = false;
  corpseMesh.count = 0;
  view.scene.add(corpseMesh);
  const corpses = [];   // {x, z, t}
  let corpseHead = 0;

  // 화살·바위: 쏜 뒤 shotSeconds 동안 보이는 짧은 선(판정은 즉시, 그림만)
  const shotGeo = new THREE.BufferGeometry();
  const shotPos = new Float32Array(LOOK.shotMax * 6), shotCol = new Float32Array(LOOK.shotMax * 6);
  shotGeo.setAttribute('position', new THREE.BufferAttribute(shotPos, 3).setUsage(THREE.DynamicDrawUsage));
  shotGeo.setAttribute('color', new THREE.BufferAttribute(shotCol, 3).setUsage(THREE.DynamicDrawUsage));
  const shotLines = new THREE.LineSegments(shotGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
  shotLines.frustumCulled = false;
  view.scene.add(shotLines);
  const shotColors = [new THREE.Color(LOOK.shotColors[0]), new THREE.Color(LOOK.shotColors[1])];

  const NT = LOOK.shapes.length;   // 병종 수(rules.units와 같은 차례)
  // 효과 빛깔 배율: 메시 색(편 색 × 밝기)마다 "그 색 → 명령 색 쪽으로 effectMix" 가 되는 instanceColor 배율 [편][병종][명령] = [r, g, b]
  const tintOf = [0, 1].map(side => LOOK.shapes.map((_, type) => {
    const base = new THREE.Color(SIDE_COLORS[side]).multiplyScalar(LOOK.brightness[type]), out = {};
    for (const order of LOOK.effectOrders) {
      const t = new THREE.Color(CAST_COLORS[order]), k = LOOK.effectMix, mix = (b, c) => (b + (c - b) * k) / Math.max(0.02, b);
      out[order] = [mix(base.r, t.r), mix(base.g, t.g), mix(base.b, t.b)];
    }
    return out;
  }));
  const m4 = new THREE.Matrix4(), counts = new Int32Array(2 * NT), ELITE_SCALE = new THREE.Vector3(1.3, 1.3, 1.3);
  let tinted = false;   // 지난 화면에 밝힌 병사가 있었나(고른 것이 없어지면 한 번 되돌린다)

  // visible(i): 그릴 병사인가(안개), seeAt(x, z): 그 자리가 보이나(화살·흔적).
  // selected: 병사 번호마다 1 = 고른 병사(밝게 그린다), 없으면 null.
  // preview: 금 명령 겨누기 미리 보기 { flags(병사 번호마다 1), order } 또는 null — 걸릴 병사를 그 효과 빛깔로.
  function update(world, alpha, visible = null, seeAt = null, selected = null, preview = null) {
    const s = world.soldiers, SEL = LOOK.selectedTint, now = world.time;
    const effects = world.casts.some(c => c.until > now && LOOK.effectOrders.includes(c.order));   // 병사 효과는 그 원이 남아 있는 동안만 산다
    const pv = preview && LOOK.effectOrders.includes(preview.order) ? preview : null;
    const tint = !!selected || !!pv || effects || tinted;
    counts.fill(0);
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i]) continue;
      if (visible && !visible(i)) continue;
      const side = s.side[i], type = s.type[i], k = side * NT + type;
      const x = s.px[i] + (s.x[i] - s.px[i]) * alpha, z = s.pz[i] + (s.z[i] - s.pz[i]) * alpha;
      m4.makeRotationY(s.facing[i]);
      if (s.elite[i]) m4.scale(ELITE_SCALE);                  // 2단계 건물에서 나온 강화 병종은 조금 크게
      m4.setPosition(x, view.heightAt(x, z), -z);
      const mesh = meshes[side][type], n = counts[k]++;
      mesh.setMatrixAt(n, m4);
      if (tint) {
        const c = mesh.instanceColor.array;
        const T = tintOf[side][type];
        const k3 = selected && selected[i] ? null : pv && pv.flags[i] ? T[pv.order] : s.volleyUntil[i] > now ? T.volley : s.drumUntil[i] > now ? T.drum : s.marchUntil[i] > now ? T.march : null;
        if (selected && selected[i]) { c[n * 3] = SEL; c[n * 3 + 1] = SEL; c[n * 3 + 2] = SEL; }
        else if (k3) { c[n * 3] = k3[0]; c[n * 3 + 1] = k3[1]; c[n * 3 + 2] = k3[2]; }
        else { c[n * 3] = 1; c[n * 3 + 1] = 1; c[n * 3 + 2] = 1; }
      }
    }
    for (let side = 0; side < 2; side++)
      for (let type = 0; type < NT; type++) {
        const m = meshes[side][type];
        m.count = counts[side * NT + type];
        m.instanceMatrix.needsUpdate = true;
        if (tint) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, m.count * 3); m.instanceColor.needsUpdate = true; }   // 그린 몫만 올린다(효과 빛깔이 판 내내 켜져 있으므로)
      }
    tinted = !!selected || !!pv || effects;

    let ns = 0;
    for (const sh of world.shots) {
      const age = world.time - sh.t;
      if (age > LOOK.shotSeconds || ns >= LOOK.shotMax) continue;
      if (seeAt && !seeAt(sh.x1, sh.z1) && !seeAt(sh.x2, sh.z2)) continue;
      const k = age / LOOK.shotSeconds, len = LOOK.shotLength;   // 쏜 자리에서 목표까지 날아가는 짧은 선
      const dx = sh.x2 - sh.x1, dz = sh.z2 - sh.z1, l = Math.hypot(dx, dz) || 1;
      const hx = sh.x1 + dx * k, hz = sh.z1 + dz * k, tx = hx - dx / l * len, tz = hz - dz / l * len;
      const arc = Math.sin(k * Math.PI) * Math.min(12, l * 0.25) + 1.5;
      shotPos.set([tx, arc, -tz, hx, arc, -hz], ns * 6);
      const c = shotColors[sh.side];
      shotCol.set([c.r, c.g, c.b, c.r, c.g, c.b], ns * 6);
      ns++;
    }
    shotGeo.setDrawRange(0, ns * 2);
    shotGeo.attributes.position.needsUpdate = true;
    shotGeo.attributes.color.needsUpdate = true;

    // 쓰러진 흔적
    for (const d of world.deaths) {
      if (corpses.length < LOOK.corpseMax) corpses.push({ x: d.x, z: d.z, t: d.t });
      else { corpses[corpseHead] = { x: d.x, z: d.z, t: d.t }; corpseHead = (corpseHead + 1) % LOOK.corpseMax; }
    }
    world.deaths.length = 0;
    let n = 0;
    for (const c of corpses) {
      const fade = 1 - (world.time - c.t) / LOOK.corpseSeconds;
      if (fade <= 0 || (seeAt && !seeAt(c.x, c.z))) continue;
      m4.makeScale(fade, 1, fade).setPosition(c.x, view.heightAt(c.x, c.z) + 0.05, -c.z);
      corpseMesh.setMatrixAt(n++, m4);
    }
    corpseMesh.count = n;
    corpseMesh.instanceMatrix.needsUpdate = true;
    if (corpses.length > 0 && n === 0) { corpses.length = 0; corpseHead = 0; }
  }

  return { update, meshes };
}
