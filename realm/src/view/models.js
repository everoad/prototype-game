// 유닛·건물 모양: 단순한 도형 조합. 앞 = +X, 땅 = y 0, 1 = 1 m. 'team' 색 부분은 편 색으로 칠한다.
import * as THREE from 'three';

export const TEAM = [0x2f6fd6, 0xd23c3c, 0x8a8a80];   // 우리 파랑, 적 빨강, 중립 회색
const SKIN = 0xf0c8a0, WOOD = 0x8a6a45, DARK = 0x3b3b3b, STEEL = 0xb8bec8, STONE = 0xc8c2b4;

const T = (g, x = 0, y = 0, z = 0) => g.translate(x, y, z);
const box = (w, h, d, x, y, z) => T(new THREE.BoxGeometry(w, h, d), x, y, z);
const cyl = (rt, rb, h, x, y, z, seg = 8) => T(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z);
const cone = (r, h, x, y, z, seg = 8) => T(new THREE.ConeGeometry(r, h, seg), x, y, z);
const ball = (r, x, y, z, seg = 8) => T(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), x, y, z);
const rotZ = (g, a) => g.rotateZ(a), rotX = (g, a) => g.rotateX(a), rotY = (g, a) => g.rotateY(a);
const at = (g, x, y, z) => g.translate(x, y, z);

const legs4 = (len, w, x, z, h, color) => [[x, z], [x, -z], [-x, z], [-x, -z]].map(([a, b]) => ({ geo: box(w, len, w, a, h, b), color }));

// part: { geo, color: hex | 'team', emissive?, wing? } — wing = 날갯짓으로 흔든다
export const UNIT_MODELS = {
  worker: [
    { geo: cyl(0.42, 0.52, 1.0, 0, 0.5, 0), color: 'team' }, { geo: ball(0.3, 0, 1.28, 0), color: SKIN },
    { geo: box(0.5, 0.55, 0.45, -0.45, 0.95, 0), color: 0xb08850 }, { geo: rotZ(box(0.08, 1.0, 0.08, 0, 0, 0), -0.6).translate(0.45, 1.0, 0.3), color: WOOD },
  ],
  sword: [
    { geo: box(0.6, 0.5, 0.55, 0, 0.25, 0), color: DARK }, { geo: box(0.75, 1.0, 0.7, 0, 0.95, 0), color: 'team' },
    { geo: ball(0.3, 0, 1.68, 0), color: SKIN }, { geo: cone(0.34, 0.35, 0, 1.95, 0), color: STEEL },
    { geo: box(0.14, 0.95, 0.75, 0.42, 0.95, -0.45), color: STEEL }, { geo: box(1.1, 0.1, 0.1, 0.75, 1.0, 0.45), color: STEEL },
  ],
  spear: [
    { geo: cyl(0.38, 0.48, 1.3, 0, 0.65, 0), color: 'team' }, { geo: ball(0.3, 0, 1.55, 0), color: SKIN },
    { geo: rotZ(cyl(0.05, 0.05, 3.6, 0, 0, 0, 5), -1.05).translate(0.9, 1.5, 0.35), color: WOOD },
    { geo: rotZ(cone(0.12, 0.4, 0, 0, 0, 5), -1.05).translate(2.45, 2.4, 0.35), color: STEEL },
  ],
  archer: [
    { geo: cone(0.55, 1.45, 0, 0.72, 0), color: 'team' }, { geo: ball(0.28, 0, 1.55, 0), color: SKIN },
    { geo: cone(0.33, 0.55, 0, 1.85, 0), color: 0x3d5a3a },
    { geo: rotY(new THREE.TorusGeometry(0.62, 0.05, 4, 12, Math.PI), Math.PI / 2).rotateZ(-Math.PI / 2).translate(0.42, 1.05, 0), color: WOOD },
  ],
  scout: [
    { geo: box(1.8, 0.75, 0.65, 0, 1.1, 0), color: 0xb98b5a }, { geo: rotZ(box(0.45, 0.95, 0.38, 0, 0, 0), -0.5).translate(1.05, 1.65, 0), color: 0xb98b5a },
    ...legs4(0.9, 0.14, 0.62, 0.22, 0.45, 0x8f6a44),
    { geo: box(0.45, 0.8, 0.45, -0.1, 1.85, 0), color: 'team' }, { geo: ball(0.24, -0.05, 2.45, 0), color: SKIN },
  ],
  knight: [
    { geo: box(2.1, 0.95, 0.8, 0, 1.25, 0), color: 0x5a4636 }, { geo: rotZ(box(0.55, 1.05, 0.45, 0, 0, 0), -0.45).translate(1.25, 1.9, 0), color: 0x5a4636 },
    { geo: box(2.2, 0.55, 0.9, 0, 0.95, 0), color: 'team' }, ...legs4(1.0, 0.18, 0.72, 0.26, 0.5, 0x3e3026),
    { geo: box(0.6, 0.95, 0.6, -0.1, 2.2, 0), color: STEEL }, { geo: ball(0.3, -0.05, 2.9, 0), color: STEEL },
    { geo: rotZ(cyl(0.07, 0.07, 3.4, 0, 0, 0, 5), -Math.PI / 2).translate(1.4, 2.1, 0.42), color: WOOD },
    { geo: box(0.05, 0.4, 0.5, 2.7, 2.25, 0.42), color: 'team' },
  ],
  mage: [
    { geo: cone(0.62, 1.7, 0, 0.85, 0), color: 'team' }, { geo: ball(0.28, 0, 1.78, 0), color: SKIN },
    { geo: cone(0.42, 1.0, 0, 2.35, 0), color: 0x3a2a55 },
    { geo: cyl(0.04, 0.04, 2.1, 0.5, 1.05, 0.32, 5), color: WOOD }, { geo: ball(0.2, 0.5, 2.15, 0.32), color: 0xff8a2a, emissive: 0xff6a00 },
  ],
  priest: [
    { geo: cone(0.62, 1.7, 0, 0.85, 0), color: 0xf2efe6 }, { geo: cyl(0.36, 0.42, 0.3, 0, 1.05, 0), color: 'team' },
    { geo: ball(0.28, 0, 1.78, 0), color: SKIN }, { geo: rotX(new THREE.TorusGeometry(0.32, 0.05, 4, 16), Math.PI / 2).translate(0, 2.25, 0), color: 0xffd34d, emissive: 0xc8a020 },
  ],
  catapult: [
    { geo: box(2.6, 0.45, 1.5, 0, 0.75, 0), color: WOOD }, { geo: box(2.62, 0.25, 1.52, 0, 1.0, 0), color: 'team' },
    ...[[0.9, 0.82], [0.9, -0.82], [-0.9, 0.82], [-0.9, -0.82]].map(([x, z]) => ({ geo: rotX(cyl(0.45, 0.45, 0.2, 0, 0, 0, 10), Math.PI / 2).translate(x, 0.45, z), color: 0x5a4430 })),
    { geo: rotZ(box(2.8, 0.18, 0.18, 0, 0, 0), 0.55).translate(-0.2, 1.75, 0), color: WOOD }, { geo: box(0.5, 0.35, 0.5, -1.35, 2.55, 0), color: DARK },
    { geo: box(0.3, 1.4, 0.3, 0.3, 1.5, 0.5), color: WOOD }, { geo: box(0.3, 1.4, 0.3, 0.3, 1.5, -0.5), color: WOOD },
  ],
  golem: [
    { geo: box(0.75, 1.3, 0.75, 0, 0.65, 0.5), color: 0x8d8a80 }, { geo: box(0.75, 1.3, 0.75, 0, 0.65, -0.5), color: 0x8d8a80 },
    { geo: box(1.5, 1.7, 1.9, 0, 2.1, 0), color: 0x9a978c }, { geo: box(0.75, 0.65, 0.75, 0.15, 3.3, 0), color: 0x8d8a80 },
    { geo: box(0.6, 1.8, 0.6, 0.2, 1.8, 1.3), color: 0x8d8a80 }, { geo: box(0.6, 1.8, 0.6, 0.2, 1.8, -1.3), color: 0x8d8a80 },
    { geo: box(0.12, 0.6, 0.6, 0.77, 2.2, 0), color: 'team', emissive: 0x222244 },
  ],
  griffon: [
    { geo: box(1.8, 0.8, 0.8, 0, 0, 0), color: 0xc9a35a }, { geo: box(0.6, 0.6, 0.55, 1.15, 0.35, 0), color: 0xf0eee8 },
    { geo: rotZ(cone(0.15, 0.4, 0, 0, 0, 5), -Math.PI / 2).translate(1.6, 0.3, 0), color: 0xe0b030 },
    { geo: box(1.0, 0.2, 0.4, -1.3, 0.05, 0), color: 0xc9a35a },
    { geo: box(1.2, 0.08, 2.4, 0, 0.3, 1.5), color: 'team', wing: 1 }, { geo: box(1.2, 0.08, 2.4, 0, 0.3, -1.5), color: 'team', wing: -1 },
  ],
  dragon: [
    { geo: box(4.0, 1.6, 1.8, 0, 0, 0), color: 'team' }, { geo: rotZ(box(1.8, 0.7, 0.7, 0, 0, 0), 0.5).translate(2.5, 0.9, 0), color: 'team' },
    { geo: box(1.3, 0.8, 0.9, 3.6, 1.5, 0), color: 'team' }, { geo: rotZ(cone(0.15, 0.8, 0, 0, 0, 5), 0.9).translate(3.4, 2.2, 0.3), color: 0xe8e0c8 },
    { geo: rotZ(cone(0.15, 0.8, 0, 0, 0, 5), 0.9).translate(3.4, 2.2, -0.3), color: 0xe8e0c8 },
    { geo: box(3.2, 0.45, 0.6, -3.4, -0.2, 0), color: 'team' }, { geo: box(0.9, 0.9, 1.9, 0.2, -0.7, 0), color: 0x2a2222 },
    { geo: box(2.8, 0.1, 5.2, -0.2, 0.6, 3.2), color: 0x332a2a, wing: 1 }, { geo: box(2.8, 0.1, 5.2, -0.2, 0.6, -3.2), color: 0x332a2a, wing: -1 },
  ],
  wolf: [
    { geo: box(1.5, 0.6, 0.55, 0, 0.8, 0), color: 0x6d6d6d }, { geo: box(0.65, 0.5, 0.45, 0.95, 1.0, 0), color: 0x7a7a7a },
    { geo: cone(0.1, 0.3, 0.85, 1.35, 0.15, 4), color: 0x555555 }, { geo: cone(0.1, 0.3, 0.85, 1.35, -0.15, 4), color: 0x555555 },
    ...legs4(0.6, 0.13, 0.5, 0.18, 0.3, 0x5a5a5a), { geo: rotZ(box(0.7, 0.15, 0.15, 0, 0, 0), 0.5).translate(-0.95, 0.95, 0), color: 0x6d6d6d },
  ],
  goblin: [
    { geo: cyl(0.32, 0.42, 0.8, 0, 0.4, 0), color: 0x5d4b2f }, { geo: ball(0.3, 0, 1.05, 0), color: 0x7fae3c },
    { geo: rotX(cone(0.08, 0.45, 0, 0, 0, 4), Math.PI / 2).translate(0, 1.15, 0.38), color: 0x7fae3c }, { geo: rotX(cone(0.08, 0.45, 0, 0, 0, 4), -Math.PI / 2).translate(0, 1.15, -0.38), color: 0x7fae3c },
    { geo: rotY(new THREE.TorusGeometry(0.45, 0.04, 4, 10, Math.PI), Math.PI / 2).rotateZ(-Math.PI / 2).translate(0.35, 0.75, 0), color: WOOD },
  ],
  troll: [
    { geo: box(0.7, 1.3, 0.7, 0, 0.65, 0.5), color: 0x5e7a4b }, { geo: box(0.7, 1.3, 0.7, 0, 0.65, -0.5), color: 0x5e7a4b },
    { geo: box(1.4, 1.7, 1.6, 0.1, 2.1, 0), color: 0x6f8f5a }, { geo: ball(0.55, 0.45, 3.15, 0), color: 0x6f8f5a },
    { geo: box(0.5, 1.6, 0.5, 0.3, 1.9, 1.1), color: 0x6f8f5a }, { geo: box(0.5, 1.6, 0.5, 0.3, 1.9, -1.1), color: 0x6f8f5a },
    { geo: rotZ(cyl(0.2, 0.38, 2.2, 0, 0, 0, 6), -0.9).translate(1.3, 1.6, 1.15), color: 0x6a4a2a },
  ],
};
export const FLY_HEIGHT = { griffon: 11, dragon: 17 };
export const UNIT_SCALE = 1.8;   // 읽히게 몸보다 크게 그린다(나무·깃발은 줄였다)

// 건물: THREE.Group을 만든다. team = 편 색 재질(바뀌면 다시 칠한다).
const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, ...(e ? { emissive: e } : {}) });
const mesh = (g, m) => new THREE.Mesh(g, m);
const hipRoof = (w, d, h, y) => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.scale(w, h, d); g.translate(0, y + h / 2, 0); return g; };

export function buildingModel(type) {
  const g = new THREE.Group(), team = mat(0xffffff), parts = [];
  const add = (geo, m) => { const o = mesh(geo, m); g.add(o); parts.push(o); return o; };
  const stone = mat(STONE), wood = mat(0xb08a5a), dark = mat(0x4a4038);
  switch (type) {
    case 'citadel':
      add(box(14, 10, 14, 0, 5, 0), stone);
      for (const [x, z] of [[7, 7], [7, -7], [-7, 7], [-7, -7]]) { add(cyl(2.6, 2.8, 14, x, 7, z), stone); add(cone(3.3, 4.5, x, 16.2, z), team); }
      add(hipRoof(14.5, 14.5, 6, 10), team);
      add(box(0.5, 4.5, 4, 7.1, 2.25, 0), dark);
      break;
    case 'fort':
      add(cyl(6, 6.4, 4, 0, 2, 0, 12), mat(0xa8a294));
      add(cyl(2.2, 2.5, 10, 0, 5, 0, 8), stone);
      add(cone(3, 4, 0, 12, 0, 8), team);
      add(box(0.1, 2.2, 3, 0, 15, 0).translate(0, 0, 0), team);
      add(cyl(0.12, 0.12, 4, 0, 14.5, 0, 4), dark);
      break;
    case 'barracks':
      add(box(12, 4, 8, 0, 2, 0), wood); add(hipRoof(13, 9, 3.2, 4), team);
      add(box(0.4, 2.6, 2.4, 6.1, 1.3, 0), dark);
      add(box(0.2, 2.5, 0.2, 7.5, 1.25, 3), dark); add(box(0.1, 0.8, 1.4, 7.5, 2.7, 3), team);
      break;
    case 'stable':
      add(box(13, 3, 7, 0, 1.5, 0), mat(0xa07a4a)); add(hipRoof(14, 8, 2.4, 3), team);
      for (let k = -2; k <= 2; k++) add(box(0.25, 1.4, 0.25, 8, 0.7, k * 2), wood);
      add(box(0.15, 0.2, 8.2, 8, 1.1, 0), wood);
      break;
    case 'magetower':
      add(cyl(3, 3.6, 12, 0, 6, 0, 10), mat(0x9a8fb0)); add(cone(4.2, 6, 0, 15, 0, 10), team);
      add(ball(1.2, 0, 19.6, 0, 10), mat(0x66e0ff, 0x2299cc));
      break;
    case 'workshop':
      add(box(12, 5, 9, 0, 2.5, 0), mat(0x9c6b4e)); add(hipRoof(12.8, 9.8, 2.8, 5), team);
      add(box(1.5, 5, 1.5, -3.5, 7, -2.5), dark);
      add(rotY(new THREE.TorusGeometry(2, 0.45, 6, 12), 0).translate(6.3, 3, 0).rotateY(0), mat(0x707070));
      break;
    case 'aerie':
      add(cyl(3, 5, 10, 0, 5, 0, 7), mat(0x8b8478));
      add(rotX(new THREE.TorusGeometry(3.6, 1.1, 6, 12), Math.PI / 2).translate(0, 10.6, 0), mat(0x8a6a3a));
      add(cyl(0.15, 0.15, 6, 2.5, 12, 0, 4), dark); add(box(0.1, 1.6, 2.6, 2.5, 14, 1.3), team);
      break;
    case 'tower':
      add(cyl(1.8, 2.3, 10, 0, 5, 0, 8), stone); add(box(4.6, 1, 4.6, 0, 10.4, 0), wood); add(cone(3.4, 3.4, 0, 12.6, 0, 4).rotateY(Math.PI / 4), team);
      break;
    case 'goldmine':
      add(box(4.5, 3, 4.5, 0, 1.5, 0), wood); add(hipRoof(5, 5, 1.8, 3), team);
      for (const [x, z] of [[2.6, 1.6], [2.9, -0.8], [1.8, -2.4]]) add(new THREE.OctahedronGeometry(0.8).translate(x, 0.7, z), mat(0xf2c94c, 0x5a4410));
      break;
    case 'lumbermill':
      add(box(4.5, 2.8, 3.6, 0, 1.4, 0), mat(0x9a7448)); add(hipRoof(5, 4.2, 1.6, 2.8), team);
      for (let k = 0; k < 3; k++) add(rotX(cyl(0.35, 0.35, 3.2, 0, 0, 0, 6), Math.PI / 2).translate(2.9, 0.35 + k * 0.6, k % 2 ? 0.3 : -0.3), mat(0x7a5432));
      break;
    case 'manawell':
      add(rotX(new THREE.TorusGeometry(2.4, 0.6, 6, 14), Math.PI / 2).translate(0, 0.6, 0), stone);
      add(new THREE.OctahedronGeometry(1.2).scale(1, 2.4, 1).translate(0, 3.2, 0), mat(0x66e0ff, 0x2a8fbf));
      add(rotX(new THREE.TorusGeometry(2.4, 0.15, 4, 14), Math.PI / 2).translate(0, 1.25, 0), team);
      break;
  }
  g.userData = { team, parts };
  return g;
}
