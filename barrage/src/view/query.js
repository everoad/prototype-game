// 주소 옵션 → 판 옵션(순수 — main.js가 쓴다).
// 모아 던지기(§4.11)가 기본 규칙이다(사용자 2026-11-17). ?store=0이면 예전 방식(받자마자 날아감, U·I·O 무기 스킬).
export function worldOptions(q) {
  const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  return {
    seed: num('seed', 1), phase: num('phase', 1), pattern: q.has('pattern') ? num('pattern', null) : null,
    lab: q.get('lab'), heal: q.get('heal') === '1', boss: q.get('boss') ?? 'ranged',
    store: q.get('store') !== '0', hard: q.get('hard') === '1',
    gear: q.get('gear') ?? (q.get('lab') ? 'none' : 'all'),   // 보조 무기(§4.10): 판은 다 켬, 연습 장면은 없음
  };
}
