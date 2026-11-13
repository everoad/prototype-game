// 병사 그리기: 편 × 병종마다 InstancedMesh 하나, 앞 틱과 이번 틱 사이 보간, 쓰러진 흔적(5초에 걸쳐 작아짐).
import * as THREE from 'three';
import { SIDE_COLORS, CAST_COLORS } from './scene.js';
import { SHOT_COLORS } from './colors.js';
import { MAGE, PRIEST } from '../sim/rules.js';
import { fxMarks } from './fx.js';

const LOOK = {
  // 창 = 원기둥, 궁 = 원뿔, 기병 = 길쭉한 상자(앞이 +x), 보병 = 낮은 네모 기둥, 공성 = 정육면체(병종 번호 차례 — rules.js)
  shapes: [
    () => new THREE.CylinderGeometry(0.42, 0.42, 1.8, 6).translate(0, 0.9, 0),
    () => new THREE.ConeGeometry(0.55, 1.9, 6).translate(0, 0.95, 0),
    () => new THREE.BoxGeometry(2.4, 1.7, 0.85).translate(0, 0.85, 0),
    () => new THREE.CylinderGeometry(0.5, 0.5, 1.4, 4).translate(0, 0.7, 0),   // 보병: 낮은 네모 기둥
    () => new THREE.BoxGeometry(1.5, 1.5, 1.5).translate(0, 0.75, 0),          // 공성(투석기) — 자리만 맞추고 그리지 않는다(catapults.js가 그린다)
    () => new THREE.CylinderGeometry(0.4, 0.4, 1.35, 6).translate(0, 0.675, 0),   // 광부 몸(편 색) — 노란 모자는 hats가 따로 그린다(사용자 2026-11-13: 보통 크기 10명 한 조)
    // 특수 병종(6-1단계, 설계서 "화면"): 마법사 = 뾰족 원뿔(+ 지팡이 빛), 사제 = 밝은 긴 옷(+ 머리 위 고리), 기사 = 기병보다 큰 상자, 골렘 = 사람 키 2.5배 돌덩이
    () => new THREE.ConeGeometry(0.5, 2.3, 6).translate(0, 1.15, 0),
    () => new THREE.CylinderGeometry(0.32, 0.5, 1.9, 8).translate(0, 0.95, 0),
    () => new THREE.BoxGeometry(2.8, 2.0, 1.0).translate(0, 1.0, 0),
    () => new THREE.BoxGeometry(2.2, 4.4, 2.0).translate(0, 2.2, 0),
  ],
  brightness: [0.8, 1.3, 0.72, 1.12, 0.55, 1.0, 1.25, 1.65, 0.6, 0.42],
  halo: { color: 0xfff3b0, radius: 0.34, tube: 0.07, y: 2.2 },          // 사제 머리 위 고리
  glow: { color: 0xffa040, radius: 0.2, x: 0.4, y: 2.25 },            // 마법사 지팡이 끝 빛(앞쪽)
  // 효과(fx.js): 불꽃 = 바닥 고리가 반지름 r까지 커지며 옅어짐, 고치기 = 병사 위 초록 반짝이 떠오름
  fxMax: 3000, fire: { color: 0xff7a1a, start: 0.35 }, heal: { color: 0x5dff7a, size: 0.32, y: 2.6, rise: 1.2 },
  hat: { color: 0xf2c14e, radius: 0.46, y: 1.5 },   // 광부 노란 모자
  selectedTint: 2.6,   // 고른 병사 색 배율(사용자 2026-11-08 PC 조작)
  // 지휘 스킬 효과 빛깔: 병사 색을 그 명령 색(scene.js CAST_COLORS — 강행군 하늘색·돌격 북 금빛·화살 비 보라) 쪽으로 effectMix만큼 섞는다
  // (곱하기만 하면 초록 병사에 금빛이 안 보인다). 차례: 고른 병사 > 겨누기 미리 보기 > 화살 비 > 돌격 북 > 강행군
  effectOrders: ['march', 'drum', 'volley'], effectMix: 0.7,
  corpseColor: 0x55503f, corpseSeconds: 5, corpseMax: 6000, corpseRadius: 0.55,
  shotMax: 4000, shotSeconds: 0.45, shotLength: 3,
};

export function createCrowd(view, rules, capacity) {
  const meshes = [0, 1, 2].map(side => LOOK.shapes.map((make, type) => {   // 편 2 = 중립(회색, SIDE_COLORS[2])
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
  const shotColors = SHOT_COLORS.map(c => new THREE.Color(c));   // 편마다(편 2 중립 투척꾼도 쏜다)

  const NT = LOOK.shapes.length;   // 병종 수(rules.units와 같은 차례)
  // 효과 빛깔 배율: 메시 색(편 색 × 밝기)마다 "그 색 → 명령 색 쪽으로 effectMix" 가 되는 instanceColor 배율 [편][병종][명령] = [r, g, b]
  const tintOf = [0, 1, 2].map(side => LOOK.shapes.map((_, type) => {
    const base = new THREE.Color(SIDE_COLORS[side]).multiplyScalar(LOOK.brightness[type]), out = {};
    for (const order of LOOK.effectOrders) {
      const t = new THREE.Color(CAST_COLORS[order]), k = LOOK.effectMix, mix = (b, c) => (b + (c - b) * k) / Math.max(0.02, b);
      out[order] = [mix(base.r, t.r), mix(base.g, t.g), mix(base.b, t.b)];
    }
    return out;
  }));
  const m4 = new THREE.Matrix4(), counts = new Int32Array(3 * NT), ELITE_SCALE = new THREE.Vector3(1.3, 1.3, 1.3);
  // 효과 그리기(6-1단계): 불꽃 고리·고치기 반짝
  function drawFx(world, seeAt) {
    let nf = 0, nl = 0;
    for (const f of fxMarks(world.fx, world.time)) {
      if (seeAt && !seeAt(f.x, f.z)) continue;
      const y = view.heightAt(f.x, f.z);
      if (f.kind === 'fire' && nf < LOOK.fxMax) {
        const sc = f.r * (LOOK.fire.start + (1 - LOOK.fire.start) * (1 - f.a));
        m4.makeScale(sc, 1, sc).setPosition(f.x, y + 0.15, -f.z);
        fires.setMatrixAt(nf, m4); fires.instanceColor.setXYZ(nf, fireColor.r * f.a, fireColor.g * f.a, fireColor.b * f.a); nf++;
      } else if (f.kind === 'heal' && nl < LOOK.fxMax) {
        m4.makeRotationY(f.a * 3).setPosition(f.x, y + LOOK.heal.y + (1 - f.a) * LOOK.heal.rise, -f.z);
        heals.setMatrixAt(nl, m4); heals.instanceColor.setXYZ(nl, healColor.r * f.a, healColor.g * f.a, healColor.b * f.a); nl++;
      }
    }
    for (const [m, n] of [[fires, nf], [heals, nl]]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  // 광부 노란 모자(모든 편 하나로) — 몸과 같은 자리 위
  const hats = new THREE.InstancedMesh(new THREE.SphereGeometry(LOOK.hat.radius, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, LOOK.hat.y, 0), new THREE.MeshLambertMaterial({ color: LOOK.hat.color }), capacity);
  hats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hats.frustumCulled = false;
  hats.count = 0;
  view.scene.add(hats);
  const extra = (geo, color) => {                                   // 몸 위에 얹는 표시(모든 편 하나로) — 사제 고리·마법사 빛
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), capacity);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; view.scene.add(m);
    return m;
  };
  const halos = extra(new THREE.TorusGeometry(LOOK.halo.radius, LOOK.halo.tube, 5, 14).rotateX(Math.PI / 2).translate(0, LOOK.halo.y, 0), LOOK.halo.color);
  const glows = extra(new THREE.SphereGeometry(LOOK.glow.radius, 6, 4).translate(LOOK.glow.x, LOOK.glow.y, 0), LOOK.glow.color);
  // 효과: 더하기 섞기라 색을 a만큼 줄이면 옅어진다
  const fxMesh = (geo) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), LOOK.fxMax);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LOOK.fxMax * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; view.scene.add(m);
    return m;
  };
  const fires = fxMesh(new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2)), heals = fxMesh(new THREE.OctahedronGeometry(LOOK.heal.size));
  const fireColor = new THREE.Color(LOOK.fire.color), healColor = new THREE.Color(LOOK.heal.color);
  let tinted = false;   // 지난 화면에 밝힌 병사가 있었나(고른 것이 없어지면 한 번 되돌린다)

  // visible(i): 그릴 병사인가(안개), seeAt(x, z): 그 자리가 보이나(화살·흔적).
  // selected: 병사 번호마다 1 = 고른 병사(밝게 그린다), 없으면 null.
  // preview: 지휘 스킬 겨누기 미리 보기 { flags(병사 번호마다 1), order } 또는 null — 걸릴 병사를 그 효과 빛깔로.
  function update(world, alpha, visible = null, seeAt = null, selected = null, preview = null) {
    const s = world.soldiers, SEL = LOOK.selectedTint, now = world.time;
    const effects = world.casts.some(c => c.until > now && LOOK.effectOrders.includes(c.order));   // 병사 효과는 그 원이 남아 있는 동안만 산다
    const pv = preview && LOOK.effectOrders.includes(preview.order) ? preview : null;
    const tint = !!selected || !!pv || effects || tinted;
    counts.fill(0);
    let nh = 0, nhalo = 0, nglow = 0;
    for (let i = 0; i < s.count; i++) {
      if (!s.alive[i]) continue;
      if (visible && !visible(i)) continue;
      if (rules.units[s.side[i]][s.type[i]].catapult) continue;   // 투석기는 catapults.js가 그린다
      const side = s.side[i], type = s.type[i], k = side * NT + type;
      const x = s.px[i] + (s.x[i] - s.px[i]) * alpha, z = s.pz[i] + (s.z[i] - s.pz[i]) * alpha;
      m4.makeRotationY(s.facing[i]);
      if (s.elite[i]) m4.scale(ELITE_SCALE);                  // 2단계 건물에서 나온 강화 병종은 조금 크게
      m4.setPosition(x, view.heightAt(x, z), -z);
      const mesh = meshes[side][type], n = counts[k]++;
      mesh.setMatrixAt(n, m4);
      if (rules.units[side][type].worker) hats.setMatrixAt(nh++, m4);
      else if (type === PRIEST) halos.setMatrixAt(nhalo++, m4);
      else if (type === MAGE) glows.setMatrixAt(nglow++, m4);
      if (tint) {
        const c = mesh.instanceColor.array;
        const T = tintOf[side][type];
        const k3 = selected && selected[i] ? null : pv && pv.flags[i] ? T[pv.order] : s.volleyUntil[i] > now ? T.volley : s.drumUntil[i] > now ? T.drum : s.marchUntil[i] > now ? T.march : null;
        if (selected && selected[i]) { c[n * 3] = SEL; c[n * 3 + 1] = SEL; c[n * 3 + 2] = SEL; }
        else if (k3) { c[n * 3] = k3[0]; c[n * 3 + 1] = k3[1]; c[n * 3 + 2] = k3[2]; }
        else { c[n * 3] = 1; c[n * 3 + 1] = 1; c[n * 3 + 2] = 1; }
      }
    }
    for (let side = 0; side < 3; side++)
      for (let type = 0; type < NT; type++) {
        const m = meshes[side][type];
        m.count = counts[side * NT + type];
        m.instanceMatrix.needsUpdate = true;
        if (tint) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, m.count * 3); m.instanceColor.needsUpdate = true; }   // 그린 몫만 올린다(효과 빛깔이 판 내내 켜져 있으므로)
      }
    hats.count = nh;
    hats.instanceMatrix.needsUpdate = true;
    halos.count = nhalo; halos.instanceMatrix.needsUpdate = true;
    glows.count = nglow; glows.instanceMatrix.needsUpdate = true;
    drawFx(world, seeAt);
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
