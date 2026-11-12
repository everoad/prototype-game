// 땅 그리기 자료(셈만, three 없이 — 노드 시험이 불러온다): 점선 조각, 닫힌 다각형을 고르게 나눈 띠 점.

// 꺾인 선 points를 따라 on m 그리고 off m 비우기를 되풀이한 조각 [[a, b], …](a, b = [x, z]). 변을 넘는 조각은 변마다 나눈다.
export function dashSegments(points, on, off) {
  const out = [], period = on + off;
  let walked = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k], [bx, bz] = points[k + 1], len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    const at = t => [ax + (bx - ax) * t / len, az + (bz - az) * t / len];
    let t = 0;
    while (t < len - 1e-9) {
      const phase = (walked + t) % period;
      if (phase < on - 1e-9) {                       // 그리는 중: 이 조각 끝 = min(변 끝, 그리기 끝)
        const end = Math.min(len, t + on - phase);
        out.push([at(t), at(end)]);
        t = end;
      } else t = Math.min(len, t + period - phase);   // 비우는 중
    }
    walked += len;
  }
  return out;
}

// 닫힌 다각형 poly의 각 변을 step m 이하로 나눈 점들(꼭짓점 포함, 첫 점을 끝에 되풀이하지 않는다).
export function ribbonPoints(poly, step) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step - 1e-9));
    for (let m = 0; m < n; m++) out.push(m === 0 ? [ax, az] : [ax + (bx - ax) * m / n, az + (bz - az) * m / n]);
  }
  return out;
}
