// 땅 그리기(2단계, 설계서 §5 "알아보기"): 바위 묶음, 지역 경계(가는 선 — 색 칠 없음), 주인 선(안쪽 편 색, 끊긴 땅은 점선),
// 깃발(주인 색 천, 점령 원과 진행 호), 랜드마크(제단·요새·괴물 소굴 천막 — 본진 성은 성채 건물), 지역 이름표(가까이 볼 때만).
// 좌표: sim (x, z) → three (x, 높이, −z). 수치는 LOOK 한곳.
import * as THREE from 'three';
import { regionPolygon, LAND_UNITS } from '../sim/regions.js';
import { ROCK } from '../sim/map.js';
import { campAlive } from '../sim/camps.js';
import { makeRng } from '../sim/rng.js';
import { SIDE_COLORS } from './scene.js';
import { dashSegments, ribbonPoints } from './landShapes.js';

const LOOK = {
  rock: { colors: [0x8b8780, 0x6f6b64], minPieces: 3, maxPieces: 7, perRadius: 3, minH: 3, maxH: 9 },   // 바위 덩어리: 반지름 perRadius m마다 한 조각
  border: { width: 0.8, color: 0x2c2c2a, opacity: 0.5, lift: 0.3, step: 8 },
  owner: { width: 2.5, inset: 6, opacity: 0.9, dash: [8, 6], lift: 0.35, step: 8 },
  flag: { pole: 14, poleR: 0.35, clothW: 7, clothH: 4.5, neutral: 0xf4f2ea, ringOpacity: 0.35, ringWidth: 0.8, arcWidth: 2.2, arcOpacity: 0.85 },
  stone: 0xc9c1ae, darkStone: 0x8f877a, gold: 0xf2d46b, tent: 0x5a4636, bone: 0xece6d6,
  label: { maxH: 520, lift: 20 },
  decoX: -30,   // 제단·요새는 깃발에서 x로 이만큼(소굴 덩어리 x −19 … +33 밖, 요새는 언덕 위)
  tentZ: 12,    // 소굴 천막은 깃발에서 z로 이만큼(덩어리 z ±5 밖)
};

const toV = (x, y, z) => new THREE.Vector3(x, y, -z);
const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// 띠(선분 목록 → 바닥에 붙인 납작한 사각형들) 하나의 BufferGeometry
function ribbonGeometry(segments, width, heightAt, lift) {
  const pos = [];
  for (const [[ax, az], [bx, bz]] of segments) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const nx = -(bz - az) / len * width / 2, nz = (bx - ax) / len * width / 2;
    const ya = heightAt(ax, az) + lift, yb = heightAt(bx, bz) + lift;
    const p = [[ax + nx, ya, az + nz], [ax - nx, ya, az - nz], [bx + nx, yb, bz + nz], [bx - nx, yb, bz - nz]].map(([x, y, z]) => [x, y, -z]);
    pos.push(...p[0], ...p[1], ...p[2], ...p[2], ...p[1], ...p[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
const closedSegments = pts => pts.map((p, k) => [p, pts[(k + 1) % pts.length]]);
const flatMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });

// 바위 칸 덩어리(이웃 칸끼리)마다 가운데·반지름
function rockClumps(map) {
  const seen = new Uint8Array(map.cols * map.rows), out = [];
  for (let k = 0; k < seen.length; k++) {
    if (seen[k] || map.terrain[k] !== ROCK) continue;
    let n = 0, sx = 0, sz = 0;
    const q = [k]; seen[k] = 1;
    while (q.length) {
      const i = q.pop(), c = i % map.cols, r = (i - c) / map.cols;
      n++; sx += (c + 0.5) * map.cell; sz += (r + 0.5) * map.cell;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, j = nr * map.cols + nc;
        if (nc >= 0 && nr >= 0 && nc < map.cols && nr < map.rows && !seen[j] && map.terrain[j] === ROCK) { seen[j] = 1; q.push(j); }
      }
    }
    out.push({ x: sx / n, z: sz / n, r: Math.sqrt(n * map.cell * map.cell / Math.PI) });
  }
  return out;
}

function buildRocks(view, map) {
  const L = LOOK.rock, rng = makeRng(23), clumps = rockClumps(map), pieces = [];
  for (const c of clumps) {
    const n = Math.max(L.minPieces, Math.min(L.maxPieces, Math.round(c.r / L.perRadius)));
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2, d = rng.next() * c.r * 0.55, size = c.r * (0.35 + rng.next() * 0.3);
      const h = L.minH + rng.next() * (L.maxH - L.minH);
      pieces.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, sx: size, sy: h / 2, sz: size * (0.8 + rng.next() * 0.4), rot: rng.next() * Math.PI, tone: k % 2 });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, pieces.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  pieces.forEach((p, i) => {
    q.setFromEuler(e.set(0, p.rot, 0));
    m4.compose(toV(p.x, view.heightAt(p.x, p.z) + p.sy * 0.6, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(L.colors[p.tone]));
  });
  mesh.count = pieces.length;
  view.scene.add(mesh);
}

// 랜드마크 묶음: 제단, 요새, 소굴 천막(본진 성은 3단계부터 성채 건물이 그린다 — view/buildings.js)
function altar() {
  const g = new THREE.Group(), stone = mat(LOOK.stone);
  [[9, 0.6], [6.5, 1.8], [4, 3]].forEach(([r, y]) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.2, 16), stone); d.position.y = y; g.add(d); });
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 10, 4), mat(LOOK.gold, { emissive: 0x4a3a08 })); ob.position.y = 8.6; g.add(ob);
  return g;
}
function fortTower() {
  const g = new THREE.Group(), stone = mat(LOOK.darkStone);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.2, 12, 10), stone); t.position.y = 6; g.add(t);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), stone);
    b.position.set(Math.cos(a) * 4.4, 12.8, Math.sin(a) * 4.4); g.add(b);
  }
  return g;
}
function campDecor() {
  const g = new THREE.Group(), tent = mat(LOOK.tent), tents = [];
  for (const [x, z] of [[-6, 0], [0, 4], [6, 0]]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(3, 4.5, 6), tent); t.position.set(x, 2.25, z); g.add(t); tents.push(t);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 6), mat(LOOK.bone)); pole.position.set(0, 3, -2); g.add(pole);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), mat(0x9a968c)); skull.position.set(0, 6.6, -2); g.add(skull);
  g.userData.fall = () => { tents.forEach((t, k) => { t.rotation.z = (k - 1 || 1) * 1.2; t.position.y = 1.2; }); pole.rotation.z = 1.3; pole.position.y = 0.6; skull.position.set(2.8, 0.9, -2); };
  return g;
}

export function createLand(view, world) {
  const map = world.map, R = map.regions, scene = view.scene, H = (x, z) => view.heightAt(x, z);
  buildRocks(view, map);

  // 지역 경계: 다각형 변(판 가장자리는 빼고)을 8 m 이하로 나눈 띠, 한 덩어리
  const B = LOOK.border, segs = [];
  const onEdge = ([ax, az], [bx, bz]) => (ax === bx && (ax <= 0.01 || ax >= map.width - 0.01)) || (az === bz && (az <= 0.01 || az >= map.depth - 0.01));
  for (const g of R) for (const s of closedSegments(ribbonPoints(regionPolygon(map, g.id), B.step))) if (!onEdge(s[0], s[1])) segs.push(s);
  scene.add(new THREE.Mesh(ribbonGeometry(segs, B.width, H, B.lift), flatMat(B.color, B.opacity)));

  // 지역마다: 주인 선, 깃발, 점령 원·호, 랜드마크
  const F = LOOK.flag, O = LOOK.owner, C = world.rules.capture;
  const items = R.map(g => {
    const y = H(g.x, g.z), item = { g, key: '' };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(F.poleR, F.poleR, F.pole, 6), mat(0x5f5e5a)); pole.position.copy(toV(g.x, y + F.pole / 2, g.z)); scene.add(pole);
    item.cloth = new THREE.Mesh(new THREE.BoxGeometry(F.clothW, F.clothH, 0.3), mat(F.neutral)); item.cloth.position.copy(toV(g.x + F.clothW / 2, y + F.pole - F.clothH / 2, g.z)); scene.add(item.cloth);
    const ring = new THREE.Mesh(new THREE.RingGeometry(C.radius - F.ringWidth, C.radius, 64), flatMat(0xffffff, F.ringOpacity)); ring.rotation.x = -Math.PI / 2; ring.position.copy(toV(g.x, y + 0.25, g.z)); scene.add(ring);
    item.arc = new THREE.Mesh(new THREE.BufferGeometry(), flatMat(0xffffff, F.arcOpacity)); item.arc.rotation.x = -Math.PI / 2; item.arc.position.copy(toV(g.x, y + 0.3, g.z)); scene.add(item.arc); item.arcFrac = -1;
    item.owner = new THREE.Mesh(new THREE.BufferGeometry(), flatMat(0xffffff, O.opacity)); scene.add(item.owner);
    item.ownerPts = ribbonPoints(regionPolygon(map, g.id, O.inset), O.step);
    const side = g.z < map.depth / 2 ? 1 : -1;                         // 랜드마크는 깃발에서 제 편 뒤쪽으로
    let deco = null;
    if (g.role === 'altar' || g.role === 'fort') { const x = g.x + LOOK.decoX; deco = g.role === 'altar' ? altar() : fortTower(); deco.position.copy(toV(x, H(x, g.z), g.z)); }
    if (deco) scene.add(deco);
    if (g.camp) { const z = g.z + side * LOOK.tentZ; item.camp = campDecor(); item.camp.position.copy(toV(g.x, H(g.x, z), z)); scene.add(item.camp); item.campUp = true; }
    return item;
  });

  // 이름표(HTML): 가까이 볼 때만
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 13px/1.25 system-ui,"Malgun Gothic",sans-serif;color:#1f1f1d;text-align:center;';
  document.body.appendChild(box);
  for (const it of items) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff;white-space:nowrap;';
    el.innerHTML = it.g.name + (it.g.land ? `<br><span style="font-weight:500;font-size:12px;color:#5a2d82">→ ${LAND_UNITS[it.g.land]}</span>` : '');
    box.appendChild(el); it.label = el;
  }

  function setArc(it, frac, color) {
    if (frac <= 0 || frac >= 1) { it.arc.visible = false; it.arcFrac = -1; return; }
    it.arc.visible = true;
    if (Math.abs(frac - it.arcFrac) > 0.01) {
      it.arc.geometry.dispose();
      it.arc.geometry = new THREE.RingGeometry(C.radius - F.arcWidth, C.radius, 64, 1, Math.PI / 2, frac * Math.PI * 2);
      it.arcFrac = frac;
    }
    it.arc.material.color.set(color);
  }

  // seeAt(x, z): 안개일 때 편 0이 보는 곳인가(없으면 다 보인다) — 안 보이는 깃발의 점령 진행 호는 숨긴다
  function update(w, seeAt = null) {
    const T = w.territory;
    for (const it of items) {
      const t = T[it.g.id], key = `${t.owner}|${t.owner >= 0 ? +t.connected[t.owner] : 0}`;
      if (key !== it.key) {                                        // 주인·이어짐이 바뀌면 주인 선과 천 색을 다시
        it.key = key;
        it.cloth.material.color.set(t.owner >= 0 ? SIDE_COLORS[t.owner] : F.neutral);
        it.owner.geometry.dispose();
        if (t.owner < 0) it.owner.geometry = new THREE.BufferGeometry();
        else {
          const closed = [...it.ownerPts, it.ownerPts[0]];
          const segs = t.connected[t.owner] ? closedSegments(it.ownerPts) : dashSegments(closed, O.dash[0], O.dash[1]);
          it.owner.geometry = ribbonGeometry(segs, O.width, H, O.lift);
          it.owner.material.color.set(SIDE_COLORS[t.owner]);
        }
      }
      if (seeAt && !seeAt(it.g.x, it.g.z)) setArc(it, 0, 0xffffff);
      else if (t.owner >= 0) setArc(it, t.hold, SIDE_COLORS[t.owner]);   // 적이 깎는 중이면 남은 몫
      else setArc(it, t.capturer >= 0 ? t.prog : 0, t.capturer >= 0 ? SIDE_COLORS[t.capturer] : 0xffffff);
      if (it.camp && it.campUp && !campAlive(w, it.g.id)) { it.camp.userData.fall(); it.campUp = false; }
      const show = view.cam.h < LOOK.label.maxH, p = show ? view.worldToScreen(it.g.x, it.g.z, H(it.g.x, it.g.z) + LOOK.label.lift) : null;
      if (!p || p.behind) it.label.style.display = 'none';
      else { it.label.style.display = ''; it.label.style.left = `${p.x}px`; it.label.style.top = `${p.y}px`; }
    }
  }
  return { update, labels: box };
}
