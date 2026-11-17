// 저격이 가른 공기(순수, Node 시험): 쏜 줄 곁의 탄·몬스터가 잠깐 바깥으로 밀렸다 돌아와 보인다. 그림만 옮긴다 — 판정 자리는 sim 그대로.
// 줄 위의 것(맞은 적)은 쏜 방향으로 젖혀지고, 줄 옆의 것은 줄에서 멀어지는 쪽으로 밀린다(멀수록 덜). 빨리 밀리고 천천히 돌아온다.
// W = LOOK.tries.snipe.warp { sec, side, fwd, reach, width, back }, sn = w.tries.snipe(firedAt·fx·fz·fa — 쏜 때·자리·방향).

// (x, z)의 것이 t에 밀려 보일 양을 out[0], out[1]에 쓴다
export function warpAt(W, sn, x, z, t, out) {
  out[0] = 0; out[1] = 0;
  if (!sn) return out;
  const since = t - sn.firedAt;
  if (since < 0 || since >= W.sec - 1e-9) return out;
  const ca = Math.cos(sn.fa), sa = Math.sin(sn.fa), dx = x - sn.fx, dz = z - sn.fz;
  const along = dx * ca + dz * sa, side = -dx * sa + dz * ca, d = Math.abs(side);
  if (along < -W.back || d >= W.reach) return out;
  const bump = Math.sin(Math.PI * Math.sqrt(since / W.sec));   // 4분의 1 지점에서 가장 멀고, 끝에 제자리
  const near = Math.max(0, 1 - d / W.width), k = (1 - d / W.reach) ** 2;
  const f = W.fwd * near * bump, o = W.side * k * (1 - near) * bump * (side < 0 ? -1 : 1);
  out[0] = ca * f - sa * o; out[1] = sa * f + ca * o;
  return out;
}

// (x, z)에서 angle 쪽으로 뻗은 줄이 판(±hx, ±hz) 안에 머무는 길이(len을 넘지 않는다) — 바람 줄·먼지를 판 안에만 뿌린다
export function rayInBoard(B, x, z, angle, len) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const tx = ca > 1e-9 ? (B.hx - x) / ca : ca < -1e-9 ? (-B.hx - x) / ca : Infinity;
  const tz = sa > 1e-9 ? (B.hz - z) / sa : sa < -1e-9 ? (-B.hz - z) / sa : Infinity;
  return Math.max(0, Math.min(len, tx, tz));
}

// 그리기용 시각: 판이 끝나면 sim 시각은 멈춘다(화면이 판을 더 돌리지 않는다). 끝낸 한 방의 섬광·바람 줄·밀림이 얼어붙지 않게,
// 끝난 뒤에는 끝난 순간(resultAt — 화면 시각)부터 실제로 흐른 시간만큼 더한다.
export function viewTime(simTime, result, now, resultAt) {
  return result && resultAt != null ? simTime + Math.max(0, now - resultAt) : simTime;
}
