// three.js 장면: 기울인 원근 카메라, 지형, 숲(홍수 계획서 Task 2). 거점·구역·길·건물·장수 그리기는 옛 판과 함께 뺐다.
// sim 좌표 (x, z) → three 좌표 (x, 높이, −z). 그래야 우리 쪽(낮은 z)에서 적 쪽을 볼 때 x가 화면 오른쪽으로 는다.
import * as THREE from 'three';
import { FOREST, HILL, WATER } from '../sim/map.js';
import { makeRng } from '../sim/rng.js';

import { SIDE_COLORS } from './colors.js';
import { CAMERA, orbit, cameraOffset } from './camMath.js';
export { SIDE_COLORS };
const LOOK = {
  ground: [0xc3cf98, 0x93ab6a, 0xd2c690, 0x6a9cbc, 0xa3c1c4, 0x8b8780], // 들판 숲바닥 언덕 물 여울 바위
  tree: 0x4f7a3a, sky: 0xdfe6ea, hillHeight: 6, waterDepth: -1.2,
  fogAlpha: 120,   // 안 보이는 칸의 어둡기(0~255)
  camStart: { tx: 600, tz: 370, h: 700, yaw: -Math.PI / 4, pitch: CAMERA.pitchStart }, camMinH: 120, camMaxH: 900, fov: 40, maxFov: 80,   // yaw −45°: 대각선 시점(사용자 2026-11-08) — 우리 쪽이 왼쪽 아래, 적이 오른쪽 위
  treeSpacing: 8, arrowWidth: 2.2, arrowOpacity: 0.55, keyPanScreens: 0.3,
  // 지휘 스킬 원(casts.js): 거는 순간 flash초 동안 채운 원이 옅어지고, 화살 비는 끝날 때까지 테두리 호가 남은 몫만큼 남는다. 적이 건 원은 보일 때 빨갛게 번쩍만.
  cast: { flash: 0.6, flashOpacity: 0.35, ringOpacity: 0.9, aimOpacity: 0.95, aimFill: 0.1, pool: 32, ringWidth: 0.06 },
};
// 화살 비는 보라(설계서의 주황은 적 편 색과 헷갈려서, 2026-11-09 화면 확인)
export const CAST_COLORS = { march: 0x7fd3ff, drum: 0xf2c14e, volley: 0xc77dff, enemy: 0xff3b30 };

export function createScene(canvas, map, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LOOK.sky);
  const camera = new THREE.PerspectiveCamera(LOOK.fov, 1, 1, 5000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a70, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-300, 600, 200);
  scene.add(sun);

  const heightAt = (x, z) => {
    const i = map.cellOf(x, z);
    if (i < 0) return 0;
    return map.terrain[i] === HILL ? LOOK.hillHeight : map.terrain[i] === WATER ? LOOK.waterDepth : 0;
  };

  // 지형: 8 m 격자 평면, 칸 색 텍스처, 언덕은 들어 올린다
  const geo = new THREE.PlaneGeometry(map.width, map.depth, map.width / 8, map.depth / 8);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + map.width / 2, z = -(pos.getZ(i) - map.depth / 2);
    pos.setY(i, heightAt(Math.min(x, map.width - 1), Math.min(Math.max(z, 0), map.depth - 1)));
  }
  geo.computeVertexNormals();
  const tex = new Uint8Array(map.cols * map.rows * 4);
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    const col = new THREE.Color(LOOK.ground[map.terrain[r * map.cols + c]]);
    const o = ((map.rows - 1 - r) * map.cols + c) * 4;
    tex[o] = col.r * 255; tex[o + 1] = col.g * 255; tex[o + 2] = col.b * 255; tex[o + 3] = 255;
  }
  const dataTex = new THREE.DataTexture(tex, map.cols, map.rows);
  dataTex.colorSpace = THREE.SRGBColorSpace;
  dataTex.magFilter = THREE.LinearFilter;
  dataTex.needsUpdate = true;
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: dataTex }));
  ground.position.set(map.width / 2, 0, -map.depth / 2);
  scene.add(ground);

  // 숲: 원뿔 나무 인스턴싱
  const rng = makeRng(11);
  const spots = [];
  for (let z = 0; z < map.depth; z += LOOK.treeSpacing)
    for (let x = 0; x < map.width; x += LOOK.treeSpacing) {
      const px = x + rng.next() * LOOK.treeSpacing, pz = z + rng.next() * LOOK.treeSpacing;
      if (map.terrain[map.cellOf(px, pz)] === FOREST) spots.push([px, pz, 0.7 + rng.next() * 0.6]);
    }
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 9, 6), new THREE.MeshLambertMaterial({ color: LOOK.tree }), spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z, s], i) => { m4.makeScale(s, s, s).setPosition(x, 4.5 * s, -z); trees.setMatrixAt(i, m4); });
  scene.add(trees);

  // 카메라: 바닥의 목표점(tx, tz), 높이 h, 돌림 yaw, 기울기 pitch(도, 30~70 — 가운데 끌기, camMath.js).
  const cam = { ...LOOK.camStart };
  function placeCamera() {
    const o = cameraOffset(cam);                       // sim 좌표에서 뒤로
    camera.position.set(cam.tx + o.x, o.y, -(cam.tz + o.z));
    camera.lookAt(cam.tx, 0, -cam.tz);
  }

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function screenToGround(px, py) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    return { x: hit.x, z: -hit.z };
  }
  const v = new THREE.Vector3();
  function worldToScreen(x, z, y = 0) {
    const rect = canvas.getBoundingClientRect();
    v.set(x, y, -z).project(camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, behind: v.z > 1 };
  }

  // 화면 네 귀퉁이가 닿는 땅(미니맵의 보는 곳 테두리).
  function footprint() {
    const r = canvas.getBoundingClientRect();
    return [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]].map(([x, y]) => screenToGround(x, y)).filter(Boolean);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      // 세로 화면(휴대폰)에서는 가로 시야를 가로 화면과 같게: 세로 시야를 넓힌다
      const half = LOOK.fov / 2 * Math.PI / 180;
      camera.fov = camera.aspect >= 1 ? LOOK.fov : Math.min(LOOK.maxFov, 2 * Math.atan(Math.tan(half) / camera.aspect) * 180 / Math.PI);
      camera.updateProjectionMatrix();
    }
  }

  // 조작(PC 전용): 왼쪽·오른쪽은 input.js가 가져간다(gestureFilter가 true). 여기는 가운데 버튼 끌기 = 회전·기울기(사용자 2026-11-13 "QE 화면 회전도 마우스 휠키로"),
  // 휠 = 확대, 방향키 = 화면 이동(WASD·Q/E는 없앴다 — 사용자 같은 날). 키는 e.code로 본다(한글 입력 상태에서도 먹게).
  const controls = { gestureFilter: () => false };
  let panPointer = null;
  function pan(dxPx, dyPx) {
    const k = cam.h / canvas.clientHeight * 1.2;
    const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    const rx = -dxPx * k, fz = dyPx * k;            // 화면 오른쪽 → 땅 오른쪽, 화면 아래 → 뒤
    cam.tx = clamp(cam.tx + rx * c + fz * s, 0, map.width);
    cam.tz = clamp(cam.tz - rx * s + fz * c, -200, map.depth);
  }
  function zoom(f) { cam.h = clamp(cam.h * f, LOOK.camMinH, LOOK.camMaxH); }
  canvas.addEventListener('pointerdown', e => {
    if (controls.gestureFilter(e)) return;
    if (e.button !== 1) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    panPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };   // 가운데 끌기(이름은 옛것 — 이제 회전·기울기)
  });
  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // 윈도 크롬의 가운데 버튼 자동 스크롤 막기
  canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('pointermove', e => {
    if (!panPointer || e.pointerId !== panPointer.id) return;
    orbit(cam, e.clientX - panPointer.x, e.clientY - panPointer.y);
    panPointer.x = e.clientX; panPointer.y = e.clientY;
  });
  const up = e => { if (panPointer && e.pointerId === panPointer.id) panPointer = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
  const held = new Set();
  const PAN_KEYS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [1, 0], ArrowRight: [-1, 0] };
  const typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName ?? '');
  window.addEventListener('keydown', e => {
    if (typing(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (PAN_KEYS[e.code]) { held.add(e.code); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  let keyAt = 0;
  function panByKeys() {                                    // 누르고 있는 동안 1초에 화면 높이의 LOOK.keyPanScreens만큼
    const now = performance.now(), dt = Math.min(0.05, keyAt ? (now - keyAt) / 1000 : 0);
    keyAt = now;
    if (!held.size || !dt) return;
    let dx = 0, dy = 0;
    for (const k of held) { dx += PAN_KEYS[k][0]; dy += PAN_KEYS[k][1]; }
    const k = LOOK.keyPanScreens * canvas.clientHeight * dt;
    pan(Math.sign(dx) * k, Math.sign(dy) * k);
  }
  window.addEventListener('resize', resize);

  // 흐름 화살표: 바닥에 납작한 띠 + 머리. list = [{from:{x,z}, to:{x,z}, color, dashed}]
  function makeArrow(a, opacity) {
    const dx = a.to.x - a.from.x, dz = a.to.z - a.from.z, len = Math.hypot(dx, dz);
    if (len < 1) return null;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const head = Math.min(14, len * 0.3), body = len - head;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(body, LOOK.arrowWidth), mat);
    band.rotation.x = -Math.PI / 2; band.position.set(body / 2, 0, 0);
    const tri = new THREE.Shape([new THREE.Vector2(0, -LOOK.arrowWidth * 1.8), new THREE.Vector2(head, 0), new THREE.Vector2(0, LOOK.arrowWidth * 1.8)]);
    const tip = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat);
    tip.rotation.x = -Math.PI / 2; tip.position.set(body, 0, 0);
    g.add(band, tip);
    g.position.set(a.from.x, 0.8, -a.from.z);
    g.rotation.y = Math.atan2(dz, dx);
    return g;
  }
  let preview = null;
  // 끄는 중의 화살표 하나, 또는 화살표 여럿(그린 길의 다리마다)
  function setPreview(a) {
    if (preview) { scene.remove(preview); preview.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); preview = null; }
    if (!a) return;
    if (Array.isArray(a)) { preview = new THREE.Group(); for (const leg of a) { const m = makeArrow(leg, 0.9); if (m) preview.add(m); } scene.add(preview); return; }
    preview = makeArrow(a, 0.9);
    if (preview) scene.add(preview);
  }

  // 마우스를 올린 곳(input.js): 골라질 것 둘레의 흰 고리. h = { x, z, r } 또는 null.
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
  hoverRing.rotation.x = -Math.PI / 2; hoverRing.renderOrder = 8; hoverRing.visible = false; scene.add(hoverRing);
  function setHover(h) {
    hoverRing.visible = !!h;
    if (h) { hoverRing.position.set(h.x, heightAt(h.x, h.z) + 1, -h.z); hoverRing.scale.setScalar(h.r); }
  }

  // 지휘 스킬 겨누기(input.js): 마우스를 따라가는 고리 + 옅은 채움. a = { x, z, r, color } 또는 null.
  const C = LOOK.cast, flat = m => { m.rotation.x = -Math.PI / 2; m.renderOrder = 9; m.visible = false; scene.add(m); return m; };
  const overlay = (opacity) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const aimRing = flat(new THREE.Mesh(new THREE.RingGeometry(1 - C.ringWidth, 1, 64), overlay(C.aimOpacity)));
  const aimFill = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 64), overlay(C.aimFill)));
  function setAim(a) {
    aimRing.visible = aimFill.visible = !!a;
    if (!a) return;
    for (const m of [aimRing, aimFill]) { m.position.set(a.x, heightAt(a.x, a.z) + 1.2, -a.z); m.scale.setScalar(a.r); m.material.color.setHex(a.color); }
  }
  // 건 원(w.casts): 채운 원(번쩍임)과 남은 시간 호. 메시는 C.pool개씩 돌려 쓰고, 호 모양은 남은 몫이 1% 넘게 바뀔 때만 다시 만든다.
  const flashes = Array.from({ length: C.pool }, () => flat(new THREE.Mesh(new THREE.CircleGeometry(1, 48), overlay(C.flashOpacity))));
  const arcs = Array.from({ length: C.pool }, () => { const m = flat(new THREE.Mesh(new THREE.RingGeometry(1 - C.ringWidth, 1, 64), overlay(C.ringOpacity))); m.userData.frac = 1; return m; });
  function setCasts(list, now, seeAt = null) {
    let nf = 0, na = 0;
    for (const c of list) {
      const mine = c.side === 0, color = mine ? CAST_COLORS[c.order] : CAST_COLORS.enemy, y = heightAt(c.x, c.z) + 1;
      if (!mine && seeAt && !seeAt(c.x, c.z)) continue;
      const age = now - c.at;
      if (age >= 0 && age < C.flash && nf < C.pool) {
        const m = flashes[nf++];
        m.visible = true; m.position.set(c.x, y, -c.z); m.scale.setScalar(c.r); m.material.color.setHex(color);
        m.material.opacity = C.flashOpacity * (1 - age / C.flash);
      }
      if (mine && c.order === 'volley' && now < c.until && na < C.pool) {
        const m = arcs[na++], frac = Math.max(0.01, (c.until - now) / (c.until - c.at));
        if (Math.abs(frac - m.userData.frac) > 0.01) { m.geometry.dispose(); m.geometry = new THREE.RingGeometry(1 - C.ringWidth, 1, 64, 1, Math.PI / 2, frac * Math.PI * 2); m.userData.frac = frac; }
        m.visible = true; m.position.set(c.x, y + 0.1, -c.z); m.scale.setScalar(c.r); m.material.color.setHex(color);
      }
    }
    for (let k = nf; k < C.pool; k++) flashes[k].visible = false;
    for (let k = na; k < C.pool; k++) arcs[k].visible = false;
  }

  // 안개: 편 side가 못 보는 8 m 칸을 어둡게(데이터 텍스처를 늘려 가장자리가 부드럽다). vision.tick이 바뀔 때만 다시 칠한다.
  let fogTex = null, fogMesh = null, fogTick = -2;
  function setFog(vision, side) {
    if (!vision) { if (fogMesh) fogMesh.visible = false; return; }
    if (!fogMesh) {
      fogTex = new THREE.DataTexture(new Uint8Array(vision.cols * vision.rows * 4), vision.cols, vision.rows, THREE.RGBAFormat);
      fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter;
      fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false }));
      fogMesh.rotation.x = -Math.PI / 2; fogMesh.position.set(map.width / 2, 0.6, -map.depth / 2);
      fogMesh.renderOrder = 2;
      scene.add(fogMesh);
    }
    fogMesh.visible = true;
    if (vision.tick === fogTick) return;
    fogTick = vision.tick;
    const d = fogTex.image.data, open = vision.open[side];
    for (let k = 0; k < open.length; k++) { d[k * 4] = 28; d[k * 4 + 1] = 32; d[k * 4 + 2] = 38; d[k * 4 + 3] = open[k] ? 0 : LOOK.fogAlpha; }
    fogTex.needsUpdate = true;
  }

  function render() { panByKeys(); resize(); placeCamera(); renderer.render(scene, camera); }
  resize(); placeCamera();
  return { renderer, scene, camera, cam, controls, heightAt, worldToScreen, screenToGround, footprint, resize, render, pan, setPreview, setFog, setHover, setAim, setCasts };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
