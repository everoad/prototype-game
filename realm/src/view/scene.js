// three.js 화면: sim (x, z) → three (x, 높이, −z). 카메라는 (tx, tz)를 h 높이에서 52°로 내려다보고, yaw = 땅 위 앞 방향(기본 45° = 적 쪽).
import * as THREE from 'three';
import { GRASS, ROCK, WATER, regionBorders } from '../sim/map.js';
import { UNITS } from '../sim/rules.js';
import { UNIT_MODELS, FLY_HEIGHT, UNIT_SCALE, TEAM, buildingModel } from './models.js';

const LOOK = {
  sky: 0xcfdde6, grass: [0x8fb36a, 0x86ab62, 0x97b871], rock: 0x8a8476, water: 0x4a86b8,
  tint: [0x3b7bdc, 0xd84a3a], tintAmount: 0.24, fog: { explored: 0.72, hidden: 0.46 },
  pitch: 52 * Math.PI / 180, fov: 40, hMin: 40, hMax: 560,
  ringOpacity: 0.55, capacity: 320,
};
const SIDE_HEX = TEAM;

export function createScene(canvas, world, opts = {}) {
  const map = world.map;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LOOK.sky);
  const camera = new THREE.PerspectiveCamera(LOOK.fov, 1, 1, 3000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a7a60, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-200, 400, 150);
  scene.add(sun);
  const cam = { tx: 140, tz: 140, h: 150, yaw: Math.PI / 4 };

  // ── 땅: 칸 색 텍스처(지형 + 주인 물들이기 + 안개)
  const { cols, rows } = map;
  const base = new Float32Array(cols * rows * 3);
  const c3 = new THREE.Color();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < cols * rows; i++) {
    const t = map.terrain[i];
    const hx = t === ROCK ? LOOK.rock : t === WATER ? LOOK.water : LOOK.grass[map.regionOf[i] % 3];
    const n = 0.94 + rnd() * 0.08;                        // 텍스처가 sRGB라 hex 값을 그대로 쓴다(THREE.Color는 선형으로 바꿔 버린다)
    base[i * 3] = ((hx >> 16) & 255) / 255 * n; base[i * 3 + 1] = ((hx >> 8) & 255) / 255 * n; base[i * 3 + 2] = (hx & 255) / 255 * n;
  }
  const texData = new Uint8Array(cols * rows * 4);
  const tex = new THREE.DataTexture(texData, cols, rows);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.size, map.size), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.size / 2, 0, -map.size / 2);
  scene.add(ground);
  const tints = LOOK.tint.map(h => ({ r: ((h >> 16) & 255) / 255, g: ((h >> 8) & 255) / 255, b: (h & 255) / 255 }));
  let groundKey = '';
  function paintGround(w, side, fog) {
    const owners = w.regions.map(r => r.owner + (r.connected[side] ? 'c' : '')).join(',');
    const key = owners + '|' + (fog ? w.visionAt : 0);
    if (key === groundKey) return;
    groundKey = key;
    const vc = w.vision.cols, vcell = w.rules.map.visionCell, vis = w.vision[side];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, g = map.regionOf[i], own = w.regions[g].owner;
      let R = base[i * 3], G = base[i * 3 + 1], B = base[i * 3 + 2];
      if (own >= 0 && map.terrain[i] === GRASS) {
        const k = LOOK.tintAmount * (w.regions[g].connected[own] ? 1 : 0.45), t = tints[own];
        R += (t.r - R) * k; G += (t.g - G) * k; B += (t.b - B) * k;
      }
      if (fog) {
        const vi = Math.floor(r * map.cell / vcell) * vc + Math.floor(c * map.cell / vcell);
        const m = vis.visible[vi] ? 1 : vis.explored[vi] ? LOOK.fog.explored : LOOK.fog.hidden;
        R *= m; G *= m; B *= m;
      }
      const o = (r * cols + c) * 4;                 // 텍스처 줄 0 = v 0 = sim z 0(땅을 −90° 눕혔다)
      texData[o] = Math.min(255, R * 255); texData[o + 1] = Math.min(255, G * 255); texData[o + 2] = Math.min(255, B * 255); texData[o + 3] = 255;
    }
    tex.needsUpdate = true;
  }
  // 지역 경계선
  {
    const segs = regionBorders(map), pos = new Float32Array(segs.length * 6);
    segs.forEach(([x0, z0, x1, z1], k) => pos.set([x0, 0.12, -z0, x1, 0.12, -z1], k * 6));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c3a22, transparent: true, opacity: 0.45 })));
  }
  // 바위·물
  {
    const rocks = [], dodec = new THREE.DodecahedronGeometry(1, 0);
    for (const o of map.obstacles) {
      if (o.kind === WATER) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(o.r - 1, 28), new THREE.MeshLambertMaterial({ color: 0x5b9ad0, transparent: true, opacity: 0.55 }));
        m.rotation.x = -Math.PI / 2; m.position.set(o.x, 0.05, -o.z); scene.add(m);
        continue;
      }
      const n = Math.round(o.r * o.r / 18);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (o.r - 2);
        rocks.push([o.x + Math.cos(a) * rr, o.z + Math.sin(a) * rr, 2 + rnd() * 3.5, rnd() * 6]);
      }
    }
    const im = new THREE.InstancedMesh(dodec, new THREE.MeshLambertMaterial({ color: 0x8f897c }), rocks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    rocks.forEach(([x, z, s, a], k) => { e.set(a, a * 1.7, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, s * 0.5, -z), q, new THREE.Vector3(s, s * 0.8, s)); im.setMatrixAt(k, m4); });
    scene.add(im);
  }
  // 자원 자리: 금 바위, 마나 수정, 나무 숲
  {
    const trees = [];
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xf2c94c, emissive: 0x4a3608 }), manaMat = new THREE.MeshLambertMaterial({ color: 0x7fe6ff, emissive: 0x1f7fa8 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    for (const d of map.deposits) {
      if (d.kind === 'gold') {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), rockMat); r.position.set(d.x - 1.8, 0.8, -d.z - 1.2); scene.add(r);
        for (const [dx, dz] of [[1.8, 0.6], [-0.6, 2.2], [0.4, -2.0]]) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), goldMat); o.position.set(d.x + dx, 0.9, -(d.z + dz)); scene.add(o); }
      } else if (d.kind === 'mana') {
        const o = new THREE.Mesh(new THREE.OctahedronGeometry(1.1).scale(1, 2.2, 1), manaMat); o.position.set(d.x + 2.2, 2.4, -(d.z + 2.2)); scene.add(o);
      } else {
        for (let k = 0; k < 11; k++) {
          const a = k * 2.4 + rnd(), rr = 6 + rnd() * 6;
          const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
          if (map.terrain[map.cellOf(x, z)] === GRASS) trees.push([x, z, 0.5 + rnd() * 0.35]);
        }
      }
    }
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6, 7).translate(0, 5, 0), new THREE.MeshLambertMaterial({ color: 0x3f6b35 }), trees.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0x6a4a2c }), trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach(([x, z, s], k) => { m4.makeScale(s, s, s).setPosition(x, 0, -z); crown.setMatrixAt(k, m4); trunk.setMatrixAt(k, m4); });
    scene.add(crown, trunk);
  }
  // 지역 깃발·점령 고리·역할 장식
  const flags = map.regions.map(rg => {
    const g = new THREE.Group();
    g.position.set(rg.x, 0, -rg.z);
    const R = rg.fort ? world.rules.capture.fortRadius : world.rules.capture.radius;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: LOOK.ringOpacity, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.7, R, 48).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.18;
    const progMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const progGeo = new THREE.RingGeometry(R - 2.2, R - 0.8, 48, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2);
    const prog = new THREE.Mesh(progGeo, progMat);
    prog.position.y = 0.2;
    g.add(ring, prog);
    if (rg.home >= 0) ring.visible = false;   // 본진은 성채가 지킨다
    let flagMat = null;
    if (!rg.fort && rg.home < 0) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 5).translate(0, 3.5, 0), new THREE.MeshLambertMaterial({ color: 0x5a4a3a }));
      flagMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
      const flag = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.12).translate(1.5, 6.1, 0), flagMat);
      g.add(pole, flag);
    }
    if (rg.altar) {
      const st = new THREE.MeshLambertMaterial({ color: 0xb9b2a2 });
      const sr = rg.fort ? R + 3 : 6.5;   // 요새가 있으면 돌기둥을 고리 밖으로
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.2).translate(0, 1.75, 0), st); b.position.set(Math.cos(a) * sr, 0, Math.sin(a) * sr); g.add(b); }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshLambertMaterial({ color: 0xffe08a, emissive: 0x806010 }));
      gem.position.y = rg.fort ? 22 : 13; g.add(gem); g.userData.gem = gem;
    }
    if (rg.village) {
      const wall = new THREE.MeshLambertMaterial({ color: 0xe0d4b8 }), roof = new THREE.MeshLambertMaterial({ color: 0x9a5a3a });
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2 + 0.3, rr = R + 7 + (k % 2) * 3;
        const h = new THREE.Group();
        h.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.4).translate(0, 1.3, 0), wall), new THREE.Mesh(hip(4.6, 4, 2), roof));
        h.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); h.rotation.y = a;
        g.add(h);
      }
    }
    scene.add(g);
    return { g, ring, prog, progGeo, flagMat, R };
  });

  // ── 유닛: 병종 × 부분마다 InstancedMesh
  const unitMeshes = {};
  for (const [type, parts] of Object.entries(UNIT_MODELS)) {
    unitMeshes[type] = parts.map(p => {
      const m = new THREE.MeshLambertMaterial({ color: p.color === 'team' ? 0xffffff : p.color, ...(p.emissive ? { emissive: p.emissive } : {}) });
      const im = new THREE.InstancedMesh(p.geo, m, LOOK.capacity);
      im.count = 0; im.frustumCulled = false;
      if (p.color === 'team') im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.userData = { team: p.color === 'team', wing: p.wing ?? 0 };
      scene.add(im);
      return im;
    });
  }
  const shadow = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }), 120);
  shadow.count = 0; shadow.frustumCulled = false; scene.add(shadow);
  const selRing = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), 400);
  selRing.count = 0; selRing.frustumCulled = false; selRing.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(selRing);

  // ── 투사체
  const projLooks = {
    arrow: new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), 600),
    fire: new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a }), 200),
    dragon: new THREE.InstancedMesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a1a }), 60),
    stone: new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshLambertMaterial({ color: 0x6e6a62 }), 80),
  };
  for (const im of Object.values(projLooks)) { im.count = 0; im.frustumCulled = false; scene.add(im); }
  const lookOf = t => (t === 'mage' ? 'fire' : t === 'dragon' ? 'dragon' : t === 'catapult' ? 'stone' : 'arrow');

  // ── 효과(범위 고리, 죽음 먼지, 회복 빛)
  const fx = [];
  const fxRing = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), fxBall = new THREE.SphereGeometry(1, 8, 6);
  for (let k = 0; k < 80; k++) {
    const m = new THREE.Mesh(k < 50 ? fxRing : fxBall, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m);
    fx.push({ m, until: 0, start: 0, ring: k < 50 });
  }
  let lastEvent = -1;
  function spawnFx(kind, x, y, z, r, color, life) {
    const pool = fx.filter(f => f.ring === (kind === 'ring'));
    const f = pool.find(p => !p.m.visible) ?? pool.reduce((a, b) => (a.until < b.until ? a : b));
    Object.assign(f, { start: performance.now() / 1000, until: performance.now() / 1000 + life, r, x, y, z });
    f.m.material.color.setHex(color); f.m.visible = true;
  }

  // ── 건물
  const bMeshes = new Map();
  const ghost = { g: null, type: null, circle: new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.8, depthWrite: false })) };
  ghost.circle.visible = false; scene.add(ghost.circle);
  const rallyLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x40ff60 }));
  const rallyFlag = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 6).translate(0, 1.5, 0), new THREE.MeshBasicMaterial({ color: 0x40ff60 }));
  rallyLine.visible = rallyFlag.visible = false; scene.add(rallyLine, rallyFlag);
  const moveMarks = [];
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.RingGeometry(1.4, 2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); moveMarks.push({ m, t: 0 }); }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const col = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  const sideCol = SIDE_HEX.map(h => new THREE.Color(h));
  const screenUnits = [];

  function placeCamera() {
    cam.h = Math.max(LOOK.hMin, Math.min(LOOK.hMax, cam.h));
    cam.tx = Math.max(0, Math.min(map.size, cam.tx)); cam.tz = Math.max(0, Math.min(map.size, cam.tz));
    const back = cam.h / Math.tan(LOOK.pitch), fxx = Math.cos(cam.yaw), fzz = Math.sin(cam.yaw);
    camera.position.set(cam.tx - fxx * back, cam.h, -(cam.tz - fzz * back));
    camera.lookAt(cam.tx, 0, -cam.tz);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: -hit.z };
  }
  const pv = new THREE.Vector3();
  function project(x, y, z) {
    pv.set(x, y, -z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { sx: (pv.x + 1) / 2 * r.width, sy: (1 - pv.y) / 2 * r.height, vis: pv.z < 1 && pv.z > -1 };
  }
  function footprint() {
    const r = canvas.getBoundingClientRect();
    return [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]].map(([x, y]) => pick(r.left + x, r.top + y)).filter(Boolean);
  }

  // 한 장면: alpha = 틱 사이 보간(0~1)
  function update(w, alpha, o) {
    placeCamera();
    const side = o.side, fog = o.fog, now = performance.now() / 1000, seeOk = (x, z) => !fog || canSeeLocal(w, side, x, z);
    paintGround(w, side, fog);
    // 깃발·고리
    map.regions.forEach((rg, g) => {
      const st = w.regions[g], f = flags[g];
      const known = !fog || seeOk(rg.x, rg.z);
      const ownCol = st.owner >= 0 ? SIDE_HEX[st.owner] : 0x9a9a92;
      f.ring.material.color.setHex(ownCol);
      if (f.flagMat) f.flagMat.color.setHex(ownCol);
      const p = st.owner >= 0 ? (st.hold < 1 ? st.hold : 0) : st.prog;
      const show = known && p > 0.001 && p < 0.999;
      f.prog.visible = show;
      if (show) { f.progGeo.setDrawRange(0, Math.floor(48 * p) * 6); f.prog.material.color.setHex(st.owner >= 0 ? SIDE_HEX[st.owner] : SIDE_HEX[st.capturer] ?? 0xffffff); }
      if (f.g.userData.gem) { f.g.userData.gem.rotation.y = now; f.g.userData.gem.material.color.setHex(st.owner >= 0 ? SIDE_HEX[st.owner] : 0xffe08a); }
    });
    // 건물
    const want = new Map();
    for (const b of w.buildings) {
      if (b.side === side || !fog || seeOk(b.x, b.z)) want.set(b.id, b);
    }
    if (fog) for (const [id, m] of w.sides[side].seen) if (!want.has(id)) want.set(id, { ...m, remembered: true, hp: 1, maxHp: 1 });
    for (const [id, g] of bMeshes) if (!want.has(id)) { scene.remove(g); bMeshes.delete(id); }
    for (const [id, b] of want) {
      let g = bMeshes.get(id);
      if (!g) { g = buildingModel(b.type); g.position.set(b.x, 0, -b.z); g.rotation.y = b.type === 'citadel' ? (b.side === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4) : 0; bMeshes.set(id, g); scene.add(g); }
      const ruined = b.ruined || b.dormant;
      g.userData.team.color.setHex(ruined ? 0x777770 : SIDE_HEX[b.side] ?? 0x888888);
      const sy = !b.done ? 0.2 + 0.8 * (b.progress ?? 0) : b.ruined ? 0.45 : 1;
      g.scale.set(1, sy, 1);
      const flash = !b.remembered && w.time - b.lastHit < 0.12;
      g.userData.team.emissive?.setHex(flash ? 0x553333 : 0x000000);
    }
    // 유닛
    screenUnits.length = 0;
    const counts = {};
    let sh = 0, sr = 0;
    for (const type in unitMeshes) counts[type] = 0;
    const sel = o.selected;
    for (const u of w.units) {
      if (u.side !== side && fog && !seeOk(u.x, u.z)) continue;
      const k = counts[u.type]++;
      if (k >= LOOK.capacity) continue;
      const x = u.px + (u.x - u.px) * alpha, z = u.pz + (u.z - u.pz) * alpha;
      const moving = Math.hypot(u.vx, u.vz) > 0.5;
      let y = u.flying ? FLY_HEIGHT[u.type] + Math.sin(now * 2 + u.id) * 0.6 : moving ? Math.abs(Math.sin(now * 9 + u.id)) * 0.18 : 0;
      const lunge = w.time - u.lastAttack < 0.2 && !u.t.proj ? 0.5 : 0;
      q.setFromAxisAngle(yAxis, u.facing);
      v3.set(x + Math.cos(u.facing) * lunge, y, -(z + Math.sin(u.facing) * lunge));
      const s = UNIT_SCALE;
      s3.set(s, s, s);
      const flash = w.time - u.lastHit < 0.12;
      for (const im of unitMeshes[u.type]) {
        if (im.userData.wing) {
          const flap = Math.sin(now * (u.type === 'dragon' ? 3 : 7) + u.id) * 0.5 * im.userData.wing;
          qw.setFromAxisAngle(xAxis, flap);
          m4.compose(v3, q.clone().multiply(qw), s3);
        } else m4.compose(v3, q, s3);
        im.setMatrixAt(k, m4);
        if (im.userData.team) { col.copy(sideCol[u.side]); if (flash) col.lerp(white, 0.6); im.setColorAt(k, col); }
      }
      if (u.flying && sh < 120) { m4.compose(v3.set(x, 0.15, -z), new THREE.Quaternion(), s3.set(u.t.r * 1.4, 1, u.t.r * 1.4)); shadow.setMatrixAt(sh++, m4); }
      if (sel.has(u.id) && sr < 400) {
        const rr = u.t.r * UNIT_SCALE * 1.25;
        m4.compose(v3.set(x, 0.25, -z), new THREE.Quaternion(), s3.set(rr, 1, rr));
        selRing.setMatrixAt(sr, m4); selRing.setColorAt(sr, col.setHex(u.side === side ? 0x40ff60 : 0xff4040)); sr++;
      }
      const top = (u.flying ? FLY_HEIGHT[u.type] : 0) + (u.t.r * 2.2 + 1) * UNIT_SCALE;
      const p = project(x, top, z);
      if (p.vis) screenUnits.push({ u, sx: p.sx, sy: p.sy, gy: project(x, 0, z).sy, x, z });
    }
    for (const b of w.buildings) if (sel.has(b.id) && sr < 400) {
      const rr = b.r + 1.5;
      m4.compose(v3.set(b.x, 0.25, -b.z), new THREE.Quaternion(), s3.set(rr, 1, rr));
      selRing.setMatrixAt(sr, m4); selRing.setColorAt(sr, col.setHex(b.side === side ? 0x40ff60 : 0xff4040)); sr++;
    }
    for (const type in unitMeshes) for (const im of unitMeshes[type]) { im.count = Math.min(LOOK.capacity, counts[type]); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    shadow.count = sh; shadow.instanceMatrix.needsUpdate = true;
    selRing.count = sr; selRing.instanceMatrix.needsUpdate = true; if (selRing.instanceColor) selRing.instanceColor.needsUpdate = true;
    // 투사체
    const pc = { arrow: 0, fire: 0, dragon: 0, stone: 0 };
    for (const p of w.projectiles) {
      if (fog && !seeOk(p.x, p.z)) continue;
      const look = lookOf(p.look), im = projLooks[look];
      if (pc[look] >= im.instanceMatrix.count) continue;
      const total = Math.hypot(p.tx - p.sx, p.tz - p.sz) || p.total;
      const left = Math.hypot(p.tx - p.x, p.tz - p.z), u = Math.max(0, Math.min(1, 1 - left / Math.max(total, 0.01)));
      const y0 = p.fromFly ? 10 : look === 'arrow' ? 2 : 2.5, y1 = p.air ? 9 : 1;
      const arc = look === 'stone' ? total * 0.3 : look === 'arrow' ? total * 0.1 : 1.5;
      const y = y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * arc;
      const a = Math.atan2(p.tz - p.sz, p.tx - p.sx), pitchA = Math.cos(Math.PI * u) * (arc / Math.max(total, 1)) * 3;
      q.setFromAxisAngle(yAxis, a).multiply(qw.setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitchA));
      m4.compose(v3.set(p.x, y, -p.z), q, s3.set(1, 1, 1));
      im.setMatrixAt(pc[look]++, m4);
    }
    for (const [look, im] of Object.entries(projLooks)) { im.count = pc[look]; im.instanceMatrix.needsUpdate = true; }
    // 효과
    for (const e of w.events) {
      if (e.time <= lastEvent) continue;
      if (e.x !== undefined && fog && !seeOk(e.x, e.z)) continue;
      if (e.kind === 'splash') spawnFx('ring', e.x, e.air ? 9 : 0.4, e.z, e.r, e.dmgKind === 'siege' ? 0x6e5a40 : 0xff7a20, 0.45);
      else if (e.kind === 'death') spawnFx('ball', e.x, e.fly ? 6 : 1, e.z, 1.6, e.side === 2 ? 0x8a7a5a : 0x777777, 0.6);
      else if (e.kind === 'collapse') spawnFx('ring', e.x, 0.4, e.z, e.r * 2, 0x5a4a3a, 1.0);
      else if (e.kind === 'heal') spawnFx('ball', e.x, 2.5, e.z, 0.6, 0x70ff90, 0.4);
      else if (e.kind === 'charge') spawnFx('ring', e.x, 0.4, e.z, 4, 0xffffff, 0.35);
    }
    if (w.events.length) lastEvent = Math.max(lastEvent, w.events[w.events.length - 1].time);
    for (const f of fx) {
      if (!f.m.visible) continue;
      const t = (now - f.start) / (f.until - f.start);
      if (t >= 1) { f.m.visible = false; continue; }
      const s = f.ring ? f.r * (0.3 + 0.7 * t) : f.r * (0.6 + 0.6 * t);
      f.m.scale.set(s, s, s); f.m.position.set(f.x, f.y + (f.ring ? 0 : t * 2), -f.z);
      f.m.material.opacity = (1 - t) * (f.ring ? 0.85 : 0.5);
    }
    for (const mk of moveMarks) if (mk.m.visible) { const t = (now - mk.t) / 0.6; if (t >= 1) mk.m.visible = false; else { mk.m.material.opacity = 1 - t; const s = 1 - 0.5 * t; mk.m.scale.set(s, s, s); } }
    // 짓기 그림자
    const gh = o.ghost;
    if (gh && gh.type) {
      if (ghost.type !== gh.type) {
        if (ghost.g) scene.remove(ghost.g);
        ghost.g = buildingModel(gh.type); ghost.type = gh.type;
        ghost.g.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.55; } });
        scene.add(ghost.g);
      }
      ghost.g.visible = true; ghost.g.position.set(gh.x, 0, -gh.z);
      ghost.g.traverse(m => { if (m.isMesh) m.material.color.setHex(gh.ok ? 0x80ff90 : 0xff6060); });
      ghost.circle.visible = true; ghost.circle.position.set(gh.x, 0.3, -gh.z); ghost.circle.scale.setScalar(gh.r + 1); ghost.circle.material.color.setHex(gh.ok ? 0x40ff60 : 0xff4040);
    } else { if (ghost.g) ghost.g.visible = false; ghost.circle.visible = false; }
    // 집결지
    const rb = o.rally;
    if (rb) {
      rallyLine.geometry.setFromPoints([new THREE.Vector3(rb.x, 1, -rb.z), new THREE.Vector3(rb.rx, 1, -rb.rz)]);
      rallyFlag.position.set(rb.rx, 0, -rb.rz);
      rallyLine.visible = rallyFlag.visible = true;
    } else rallyLine.visible = rallyFlag.visible = false;
  }
  function markMove(x, z, color = 0x40ff60) {
    const mk = moveMarks.reduce((a, b) => (a.t < b.t ? a : b));
    mk.t = performance.now() / 1000; mk.m.visible = true; mk.m.position.set(x, 0.3, -z); mk.m.material.color.setHex(color);
  }
  function render() { resize(); renderer.render(scene, camera); }
  return { renderer, scene, camera, cam, pick, project, footprint, update, render, resize, screenUnits, markMove, LOOK };
}

function hip(w, d, h) { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.scale(w, h, d); g.translate(0, 2.6 + h / 2, 0); return g; }
function canSeeLocal(w, side, x, z) {
  const vcell = w.rules.map.visionCell, cols = w.vision.cols, c = Math.floor(x / vcell), r = Math.floor(z / vcell);
  return c >= 0 && r >= 0 && c < cols && r < cols && w.vision[side].visible[r * cols + c] === 1;
}
export { UNITS };
