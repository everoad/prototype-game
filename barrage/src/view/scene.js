// three.js 장면: 정사영 카메라, 빛, 판·난간·바둑판, 그리는 순서 층(§7).
// sim 좌표 (x, z) → three 좌표 (x, 높이, z). 카메라 = 바라보는 점 + (sin ψ cos θ, sin θ, cos ψ cos θ) × 40, up = (0,1,0)
// → 화면 오른쪽 = (cos ψ, 0, −sin ψ), 화면 위 = 바닥 (−sin ψ, −cos ψ) 쪽(inputMap·camMath와 같은 셈).
import * as THREE from 'three';

export function createScene(canvas, LOOK, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LOOK.colors.bg);
  const camera = new THREE.OrthographicCamera(-15, 15, 8, -8, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xc8c4ff, 0x2a2430, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 50 });
  scene.add(sun);

  const layers = {};
  for (const [name, order] of Object.entries(LOOK.draw.order)) {
    const g = new THREE.Group();
    g.renderOrder = order;   // 묶음째 정렬(그 안은 함께 그린다)
    layers[name] = g;
    scene.add(g);
  }

  // 판: 어둡고 채도 낮게 — 화면에서 가장 밝은 것은 탄이다(§7)
  const hx = 10, hz = 7;
  const floorMat = new THREE.MeshLambertMaterial({ color: LOOK.colors.board });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  layers.floor.add(floor);
  // 1 U 바둑판(거리 읽기용)
  const gridPts = [];
  for (let x = -hx; x <= hx; x++) gridPts.push(x, 0.005, -hz, x, 0.005, hz);
  for (let z = -hz; z <= hz; z++) gridPts.push(-hx, 0.005, z, hx, 0.005, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: LOOK.colors.grid });
  layers.floor.add(new THREE.LineSegments(gridGeo, gridMat));
  // 난간: 판 둘레 낮은 벽
  const railMat = new THREE.MeshLambertMaterial({ color: LOOK.colors.rail });
  const railTop = new THREE.MeshBasicMaterial({ color: LOOK.colors.railTop });
  const railH = 0.45, railT = 0.25;
  for (const [w, d, x, z] of [[hx * 2 + railT * 2, railT, 0, -hz - railT / 2], [hx * 2 + railT * 2, railT, 0, hz + railT / 2], [railT, hz * 2, -hx - railT / 2, 0], [railT, hz * 2, hx + railT / 2, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, railH, d), [railMat, railMat, railTop, railMat, railMat, railMat]);
    m.position.set(x, railH / 2, z); m.castShadow = true; m.receiveShadow = true;
    layers.floor.add(m);
  }

  // 판의 분위기: 0 = 1단계, 1 = 2단계(자줏빛) — 부드럽게 옮겨 간다
  const C1 = { board: new THREE.Color(LOOK.colors.board), grid: new THREE.Color(LOOK.colors.grid), top: new THREE.Color(LOOK.colors.railTop) };
  const C2 = { board: new THREE.Color(LOOK.colors.board2), grid: new THREE.Color(LOOK.colors.grid2), top: new THREE.Color(LOOK.colors.railTop2) };
  let mood = 0;
  function setMood(target, dt) {
    mood += (target - mood) * Math.min(1, dt * 3);
    floorMat.color.copy(C1.board).lerp(C2.board, mood); gridMat.color.copy(C1.grid).lerp(C2.grid, mood); railTop.color.copy(C1.top).lerp(C2.top, mood);
  }

  const view = { cx: 0, cz: 0, width: LOOK.camera.width, pitchDeg: LOOK.camera.pitches[0], yawDeg: LOOK.camera.yawDeg, offX: 0, offY: 0 };
  let aspect = 16 / 9;

  function setView(v) {
    Object.assign(view, v);
    const yaw = view.yawDeg * Math.PI / 180, pitch = view.pitchDeg * Math.PI / 180;
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const target = new THREE.Vector3(view.cx, 0, view.cz);
    camera.position.copy(target).addScaledVector(back, 40);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const w = view.width, h = w / aspect;
    camera.left = -w / 2 + view.offX; camera.right = w / 2 + view.offX;
    camera.top = h / 2 + view.offY; camera.bottom = -h / 2 + view.offY;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (!(w > 0 && h > 0)) return;   // 숨은 창: 크기 0이면 지난 크기를 둔다
    renderer.setSize(w, h, false);
    aspect = w / h;
    setView({});
  }
  resize();

  // 화면 1 px이 몇 U인가(가장 민 줌에서 탄 최소 크기에 씀)
  const unitsPerPx = () => view.width / (canvas.clientWidth || window.innerWidth);
  // 판 위 점(x, z, 높이 h) → 화면 CSS px(HUD의 F1 판정 원)
  const tmp = new THREE.Vector3();
  function project(x, z, h = 0) {
    tmp.set(x, h, z).project(camera);
    const w = canvas.clientWidth || window.innerWidth, hh = canvas.clientHeight || window.innerHeight;
    return { x: (tmp.x + 1) / 2 * w, y: (1 - tmp.y) / 2 * hh };
  }

  return {
    THREE, renderer, scene, camera, layers, view, setView, setMood, resize, unitsPerPx, project,
    get aspect() { return aspect; },
    render() { renderer.render(scene, camera); },
    canvas,
  };
}
