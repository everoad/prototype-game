// 바닥 평면 기하: 거리, 선분-원, 부채꼴·원 판정, 판 가두기, 원 밖으로 밀어내기.

export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

// 선분 (x0,z0)→(x1,z1)이 원(cx,cz,r)에 닿나 — 빠른 탄이 한 틱에 건너뛰지 않게.
export function segCircle(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0, dz = z1 - z0, len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((cx - x0) * dx + (cz - z0) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = x0 + dx * t - cx, qz = z0 + dz * t - cz;
  return qx * qx + qz * qz <= r * r;
}

// 원 몸(px,pz,r)이 원 장판(cx,cz,R)에 닿나.
export const inCircle = (px, pz, r, cx, cz, R) => dist(px, pz, cx, cz) <= R + r;

// 원 몸(px,pz,r)이 부채꼴(가운데 cx,cz, 반지름 R, 바라보는 각 face, 반각 halfAngle)에 닿나.
// 몸의 가운데가 부채꼴을 몸 반지름만큼 넓힌 모양 안이면 닿음(가장자리 선까지의 거리로 판정).
export function inSector(px, pz, r, cx, cz, R, face, halfAngle) {
  const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
  if (d > R + r) return false;
  if (d <= r) return true;
  let a = Math.atan2(dz, dx) - face;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.abs(a) <= halfAngle) return true;
  // 가까운 가장자리 선분(가운데 → 반지름 R 끝)까지 거리
  const edge = face + Math.sign(a) * halfAngle;
  return segCircle(cx, cz, cx + Math.cos(edge) * R, cz + Math.sin(edge) * R, px, pz, r);
}

// 판 안으로 축마다 자른다(난간을 따라 미끄러짐).
export function clampToBoard(rules, x, z, r) {
  const hx = rules.board.hx - r, hz = rules.board.hz - r;
  return [x < -hx ? -hx : x > hx ? hx : x, z < -hz ? -hz : z > hz ? hz : z];
}

// 원 몸(x,z,r)이 원(cx,cz,R) 안에 겹치면 가장 가까운 둘레로 밀어낸다(몸끼리 미끄러짐).
export function slideOut(x, z, r, cx, cz, R) {
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), min = R + r;
  if (d >= min) return [x, z];
  if (d < 1e-9) return [cx - min, cz];   // 한가운데면 −x 쪽으로
  return [cx + dx / d * min, cz + dz / d * min];
}
