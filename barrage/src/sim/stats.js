// 판 기록: 피해 출처(패링 몫 셈), 패링·맞음 수 등. botrun과 결과 화면이 읽는다.
export const DAMAGE_SOURCES = ['shot', 'overdrive', 'reflect', 'counter', 'groggy', 'execute', 'bomb', 'weapon', 'burst', 'throw', 'salvo', 'mob'];   // salvo = 탄을 쓸 때 무기가 내는 한 방 · mob = 몬스터끼리 낸 피해(자폭병의 폭발 — 플레이어의 몫이 아니다)

export function createStats() {
  const dmg = {};
  for (const s of DAMAGE_SOURCES) dmg[s] = 0;
  return { dmg, total: 0, hits: 0, grazes: 0, shotsFired: 0, shotsHit: 0, parries: 0, perfects: 0, throws: 0, healed: 0, hitsByPattern: {} };
}

export function addDamage(stats, src, amount) {
  stats.dmg[src] += amount;
  if (src !== 'mob') stats.total += amount;   // total = 플레이어가 낸 피해(몫 셈의 분모)
}

// 패링에서 나온 피해 몫: 되튄 탄 + 완전 패링 반격 + 과열로 늘어난 몫 + 그로기로 늘어난 몫 + 처형(그로기는 패링으로만 온다).
export function parryShare(stats) {
  if (stats.total <= 0) return 0;
  const d = stats.dmg;
  return (d.reflect + d.counter + d.overdrive + d.groggy + d.execute + d.burst + d.throw + d.salvo) / stats.total;   // burst = 패링 연계 산탄(§4.10)
}
