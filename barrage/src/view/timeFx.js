// 정지(히트스톱)·느려짐(순수, Node 시험). 화면이 sim에 주는 시간에 scaleAt(now)을 곱한다 — sim은 시간 배율을 모른다.
// 겹치면 정지가 이긴다. 정지 예산: 지난 budget.window초 안에 시작한 정지의 합이 budget.max를 넘지 않게 자른다(§6).
// override(처형·보스 죽음·완전 패링 반격)는 예산 밖이고 세지도 않는다.
export function createTimeFx(LOOK) {
  let stopUntil = -1, slowUntil = -1, slowScale = 1, lastSlowAt = -1e9;
  const spent = [];   // [시작 시각, 길이] — 예산에 센 정지

  function budgetLeft(now) {
    const B = LOOK.feel.budget ?? { window: 1, max: 0.15 };
    while (spent.length && spent[0][0] < now - B.window) spent.shift();
    return B.max - spent.reduce((a, s) => a + s[1], 0);
  }

  return {
    // 실제로 건 정지 길이를 돌려준다(예산에 잘리면 짧거나 0)
    hitstop(now, sec, { override = false } = {}) {
      let len = sec;
      if (!override) {
        len = Math.max(0, Math.min(sec, budgetLeft(now)));
        if (len <= 1e-9) return 0;
        spent.push([now, len]);
      }
      stopUntil = Math.max(stopUntil, now + len);
      return len;
    },
    // skipIfWithin: 직전 느려짐 시작에서 그 시간 안이면 건너뜀(이어지는 완벽 패링의 박자 유지)
    slow(now, scale, sec, { skipIfWithin = 0 } = {}) {
      if (skipIfWithin > 0 && now - lastSlowAt < skipIfWithin) return false;
      lastSlowAt = now;
      const start = Math.max(now, stopUntil);   // 정지가 끝난 뒤 이어서
      slowUntil = Math.max(slowUntil, start + sec);
      slowScale = scale;
      return true;
    },
    scaleAt(now) {
      if (now < stopUntil) return 0;
      if (now < slowUntil) return slowScale;
      return 1;
    },
    get stopped() { return stopUntil; },
  };
}
