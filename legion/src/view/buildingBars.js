// 건물 위 띠(three 없이 셈만 — 노드 시험이 불러온다): 체력은 다쳤을 때만(짓는 중이면 맞았을 때만), 일은 짓는 중(진행)이거나 줄 맨 앞이 돌 때.
export function barsOf(b, time) {
  const hurt = b.done ? b.hp < b.maxHp - 1e-6 : b.lastHit > -1e8 && b.lastHit <= time;
  const hp = hurt ? b.hp / b.maxHp : null;
  if (!b.done) return { hp, work: b.progress, kind: 'build' };
  const q = b.queue[0];
  if (!q) return { hp, work: null, kind: null };
  return { hp, work: q.started ? 1 - q.left / q.total : 0, kind: q.kind === 'unit' ? 'train' : 'research' };
}
