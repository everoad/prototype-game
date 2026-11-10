// three.js 장면: 기울인 원근 카메라, 지형, 숲, 거점, 구역 선분 (계획서 Task 2).
// sim 좌표 (x, z) → three 좌표 (x, 높이, −z). 그래야 우리 쪽(낮은 z)에서 적 쪽을 볼 때 x가 화면 오른쪽으로 는다.
import * as THREE from 'three';
import { FOREST, HILL, WATER, FORD } from '../sim/map.js';
import { makeRng } from '../sim/rng.js';
import { buildingPos } from '../sim/defense.js';

export const SIDE_COLORS = [0x1D9E75, 0xD85A30, 0x888780];
const LOOK = {
  ground: [0xc3cf98, 0x93ab6a, 0xd2c690, 0x6a9cbc, 0xa3c1c4], // 들판 숲바닥 언덕 물 여울
  tree: 0x4f7a3a, sky: 0xdfe6ea, hillHeight: 6, waterDepth: -1.2,
  fogAlpha: 120,   // 안 보이는 칸의 어둡기(0~255)
  camStart: { tx: 600, tz: 370, h: 700, yaw: -Math.PI / 4 }, camMinH: 120, camMaxH: 900, pitchDeg: 45, fov: 40, maxFov: 80,   // yaw −45°: 대각선 시점(사용자 2026-11-08) — 우리 쪽이 왼쪽 아래, 적이 오른쪽 위
  treeSpacing: 8, rotateStep: Math.PI / 24, arrowWidth: 2.2, arrowOpacity: 0.55, keyPanScreens: 0.3,
  // 금 명령 원(casts.js): 거는 순간 flash초 동안 채운 원이 옅어지고, 화살 비는 끝날 때까지 테두리 호가 남은 몫만큼 남는다. 적이 건 원은 보일 때 빨갛게 번쩍만.
  wallRing: { inset: 2, width: 5, color: 0x6b6a64, opacity: 0.9, segments: 24, drop: [6, 12, 18] },   // 성벽이 서 있는 거점: 원 안쪽 두꺼운 회색 고리 — 24조각, 체력 75·50·25% 밑에서 drop개까지 빠진다(투석기 2026-11-09)
  vpPole: { h: 22, r: 0.6, fw: 10, fh: 6 }, landPole: { h: 12, r: 0.45, fw: 6, fh: 4 },   // 승점·작은 땅 깃대
  cast: { flash: 0.6, flashOpacity: 0.35, ringOpacity: 0.9, aimOpacity: 0.95, aimFill: 0.1, pool: 32, ringWidth: 0.06 },
};
// 화살 비는 보라(설계서의 주황은 적 편 색과 헷갈려서, 2026-11-09 화면 확인)
export const CAST_COLORS = { march: 0x7fd3ff, drum: 0xf2c14e, volley: 0xc77dff, levy: 0x9fe870, enemy: 0xff3b30 };

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

  // 거점: 바닥 고리 + 낮은 상자(본진은 크게), 승점은 고리 + 깃대
  const strongholdMeshes = new Map();
  for (const s of map.strongholds) {
    const g = new THREE.Group();
    const color = SIDE_COLORS[s.side ?? 2];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.radius - 1.5, s.radius, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
    g.add(ring);
    if (s.kind === 'vp' || s.kind === 'land') {                // 승점: 깃대 22 m, 작은 땅: 낮은 깃대(LOOK.landPole)
      const P = s.kind === 'land' ? LOOK.landPole : LOOK.vpPole;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, P.h, 6), new THREE.MeshLambertMaterial({ color: 0x5f5e5a }));
      pole.position.y = P.h / 2; g.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(P.fw, P.fh, 0.4), new THREE.MeshLambertMaterial({ color }));
      flag.position.set(P.fw / 2, P.h - P.fh / 2 - 0.5, 0); g.add(flag); g.userData.flag = flag;
    } else {
      const size = s.kind === 'hq' ? 28 : 16;
      const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.4, size), new THREE.MeshLambertMaterial({ color }));
      box.position.y = size * 0.2; g.add(box); g.userData.box = box;
      const W = LOOK.wallRing, wall = new THREE.Group(), wallMat = new THREE.MeshBasicMaterial({ color: W.color, transparent: true, opacity: W.opacity, side: THREE.DoubleSide });
      for (let k = 0; k < W.segments; k++) wall.add(new THREE.Mesh(new THREE.RingGeometry(s.radius - W.inset - W.width, s.radius - W.inset, 4, 1, k / W.segments * Math.PI * 2, Math.PI * 2 / W.segments * 0.96), wallMat));   // 조각(체력이 줄면 빠진다)
      wall.rotation.x = -Math.PI / 2; wall.position.y = 0.35; wall.visible = false; g.add(wall); g.userData.wallRing = wall;   // 성벽이 서 있는 동안(main.js)
    }
    g.userData.ring = ring;
    g.position.set(s.x, heightAt(s.x, s.z), -s.z);
    scene.add(g);
    strongholdMeshes.set(s.id, g);
  }

  // 구역 선분
  for (const sec of map.sectors) {
    const pts = [new THREE.Vector3(sec.x0, 0.4, -sec.z), new THREE.Vector3(sec.x1, 0.4, -sec.z)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: SIDE_COLORS[sec.side], transparent: true, opacity: 0.5 })));
  }

  // 구역 깃발은 없앴다(사용자 2026-11-08): 구역 병사를 고르는 손잡이는 HUD의 구역 단추(hud.js)로 옮겼다.

  // 카메라: 바닥의 목표점(tx, tz), 높이 h, 돌림 yaw. 45° 내려다본다.
  const cam = { ...LOOK.camStart };
  function placeCamera() {
    const back = cam.h / Math.tan(LOOK.pitchDeg * Math.PI / 180);
    const bx = -Math.sin(cam.yaw) * back, bz = -Math.cos(cam.yaw) * back; // sim 좌표에서 뒤로
    camera.position.set(cam.tx + bx, cam.h, -(cam.tz + bz));
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

  // 조작(PC 전용, 사용자 2026-11-08): 왼쪽·오른쪽은 input.js가 가져간다(gestureFilter가 true). 여기는 가운데 버튼 끌기 = 화면 이동,
  // 휠 = 확대, WASD·방향키 = 화면 이동, Q/E = 회전. 키는 e.code로 본다(한글 입력 상태에서도 먹게).
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
    canvas.setPointerCapture(e.pointerId);
    panPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // 윈도 크롬의 가운데 버튼 자동 스크롤 막기
  canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('pointermove', e => {
    if (!panPointer || e.pointerId !== panPointer.id) return;
    pan(e.clientX - panPointer.x, e.clientY - panPointer.y);
    panPointer.x = e.clientX; panPointer.y = e.clientY;
  });
  const up = e => { if (panPointer && e.pointerId === panPointer.id) panPointer = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
  const held = new Set();
  const PAN_KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [1, 0], ArrowLeft: [1, 0], KeyD: [-1, 0], ArrowRight: [-1, 0] };
  const typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName ?? '');
  window.addEventListener('keydown', e => {
    if (typing(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyQ') cam.yaw -= LOOK.rotateStep;
    if (e.code === 'KeyE') cam.yaw += LOOK.rotateStep;
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
  const arrowGroup = new THREE.Group();
  scene.add(arrowGroup);
  let arrowKey = '';
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
  function setArrows(list) {
    const key = JSON.stringify(list);
    if (key === arrowKey) return;
    arrowKey = key;
    for (const c of [...arrowGroup.children]) { arrowGroup.remove(c); c.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
    for (const a of list) { const m = makeArrow(a, LOOK.arrowOpacity); if (m) arrowGroup.add(m); }
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

  // 건물: 거점 둘레에 칸마다 작은 모양(망루 = 높은 기둥, 성벽 = 고리 담), 짓는 중이면 반투명.
  const BUILD_LOOK = { pikes: [0x5f5e5a, 5], archery: [0x378add, 6], stable: [0xba7517, 5], tower: [0xd3d1c7, 16], wall: [0x888780, 3] };
  const buildGroup = new THREE.Group(); scene.add(buildGroup);
  let buildKey = '';
  // slotsOf(st): 그릴 칸(안개 — 적 거점은 마지막으로 본 모습, 못 봤으면 빈 칸). 없으면 지금 모습.
  function setBuildings(strongholds, slotsOf = st => st.slots) {
    const key = strongholds.map(st => slotsOf(st).map(b => (b ? `${b.kind}${b.level}${b.building ? 'b' : ''}` : '-')).join(',')).join('|');
    if (key === buildKey) return;
    buildKey = key;
    for (const c of [...buildGroup.children]) { buildGroup.remove(c); c.geometry?.dispose(); c.material?.dispose(); }
    for (const st of strongholds) slotsOf(st).forEach((b, k) => {
      if (!b) return;
      const [color, h] = BUILD_LOOK[b.kind] ?? [0xffffff, 4];
      const mat = new THREE.MeshLambertMaterial({ color, transparent: !!b.building, opacity: b.building ? 0.4 : 1 });
      let mesh;
      if (b.kind === 'wall') { mesh = new THREE.Mesh(new THREE.TorusGeometry(st.radius * 0.92, 1.4 * b.level, 6, 48), mat); mesh.rotation.x = Math.PI / 2; mesh.position.set(st.x, 1.5, -st.z); }
      else {
        const p = buildingPos(st, k), size = b.kind === 'tower' ? 3 : 7;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(size, h * (b.level >= 2 ? 1.4 : 1), size), mat);
        mesh.position.set(p.x, h * (b.level >= 2 ? 0.7 : 0.5), -p.z);
      }
      buildGroup.add(mesh);
    });
  }

  // 장수: 깃대 + 깃발(편 색, 패주 중 회색). 고른 장수는 발밑 고리와 남은 길.
  const genGroup = new THREE.Group(); scene.add(genGroup);
  const genMeshes = new Map();
  const lineMat = color => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), lineMat(0xffffff)); pathLine.renderOrder = 5; scene.add(pathLine);
  function setGenerals(list, selectedId, now, seeAt = null) {
    for (const g of list) {
      let m = genMeshes.get(g.id);
      if (!m) {
        m = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 6), new THREE.MeshLambertMaterial({ color: 0x444441 }));
        pole.position.y = 6;
        const flag = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 0.5), new THREE.MeshLambertMaterial({ color: SIDE_COLORS[g.side] }));
        flag.position.set(3.5, 9.5, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.6, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.6;
        m.add(pole, flag, ring); m.userData = { flag, ring };
        genGroup.add(m); genMeshes.set(g.id, m);
      }
      m.position.set(g.x, 0, -g.z);
      m.visible = g.side === 0 || !seeAt || seeAt(g.x, g.z);   // 안 보이는 적 장수는 숨긴다
      m.userData.flag.material.color.setHex(now < g.routedUntil ? 0x888780 : SIDE_COLORS[g.side]);
      m.userData.ring.visible = g.id === selectedId;
    }
    const sel = list.find(g => g.id === selectedId);
    const pts = sel && sel.path.length ? [{ x: sel.x, z: sel.z }, ...sel.path] : [];
    pathLine.geometry.setFromPoints(pts.map(p => new THREE.Vector3(p.x, 1.2, -p.z)));
    pathLine.visible = pts.length > 1;
  }
  // 마우스를 올린 곳(input.js): 골라질 것 둘레의 흰 고리. h = { x, z, r } 또는 null.
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
  hoverRing.rotation.x = -Math.PI / 2; hoverRing.renderOrder = 8; hoverRing.visible = false; scene.add(hoverRing);
  function setHover(h) {
    hoverRing.visible = !!h;
    if (h) { hoverRing.position.set(h.x, heightAt(h.x, h.z) + 1, -h.z); hoverRing.scale.setScalar(h.r); }
  }

  // 금 명령 겨누기(input.js): 마우스를 따라가는 고리 + 옅은 채움. a = { x, z, r, color } 또는 null.
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
  // 성벽 체력 몫(0~1) → 빠진 조각. 빠지는 차례는 고르게 흩어 둔다.
  const DROP_ORDER = [0, 12, 6, 18, 3, 15, 9, 21, 1, 13, 7, 19, 4, 16, 10, 22, 2, 14, 8, 20, 5, 17, 11, 23];
  function setWallDamage(id, frac) {
    const ring = strongholdMeshes.get(id)?.userData.wallRing, D = LOOK.wallRing.drop;
    if (!ring) return;
    const gone = frac < 0.25 ? D[2] : frac < 0.5 ? D[1] : frac < 0.75 ? D[0] : 0;
    ring.children.forEach((m, k) => { m.visible = DROP_ORDER.indexOf(k) >= gone; });
  }
  return { renderer, scene, camera, cam, controls, strongholdMeshes, setWallDamage, heightAt, worldToScreen, screenToGround, footprint, resize, render, pan, setArrows, setPreview, setBuildings, setGenerals, setFog, setHover, setAim, setCasts };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
