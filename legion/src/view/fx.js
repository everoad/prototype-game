// 효과 표시(6-1단계 — three·DOM 없이): 세상의 w.fx(마법사 불꽃·사제 고치기) 가운데 수명 안의 것과 옅어지는 몫 a(1 → 0).
export function fxMarks(fx, now, life = { fire: 0.6, heal: 0.5 }) {
  const out = [];
  for (const f of fx) {
    const L = life[f.kind] ?? 0.5, age = now - f.t;
    if (age > L) continue;                                           // 이번 틱 표시(age < 0 — 그림 시각이 세상보다 늦을 때)도 꽉 찬 몫으로
    out.push({ kind: f.kind, x: f.x, z: f.z, r: f.r, a: Math.min(1, 1 - age / L) });
  }
  return out;
}
