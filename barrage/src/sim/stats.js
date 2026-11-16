// 판 기록: 피해 출처(패링 몫 셈), 패링·맞음 수 등. botrun과 결과 화면이 읽는다.
export const DAMAGE_SOURCES = ['shot', 'overdrive', 'reflect', 'counter', 'groggy'];

export function createStats() {
  const dmg = {};
  for (const s of DAMAGE_SOURCES) dmg[s] = 0;
  return { dmg, total: 0, hits: 0, grazes: 0, shotsFired: 0, shotsHit: 0, parries: 0, perfects: 0, hitsByPattern: {} };
}

export function addDamage(stats, src, amount) {
  stats.dmg[src] += amount;
  stats.total += amount;
}

// 패링에서 나온 피해 몫: 되튄 탄 + 완전 패링 반격 + 과열로 늘어난 몫 + 그로기로 늘어난 몫(그로기는 패링으로만 온다).
export function parryShare(stats) {
  if (stats.total <= 0) return 0;
  const d = stats.dmg;
  return (d.reflect + d.counter + d.overdrive + d.groggy) / stats.total;
}
