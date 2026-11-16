// 시작 장면(순수): 처음 sec초 동안 판을 돌리지 않고 보스를 보여 준다. 아무 키나 누르면 건너뛴다.
// 재시도가 잦은 게임이라 짧게 — 길이 0이면 없다(연습 장면·봇·녹화).
export function createIntro(sec) {
  let startAt = null, done = !(sec > 0);
  return {
    // 장면 중이면 true. 첫 부름에서 시작한다.
    active(now) {
      if (done) return false;
      startAt ??= now;
      if (now - startAt >= sec) { done = true; return false; }
      return true;
    },
    skip() { done = true; },
    get started() { return startAt != null; },
  };
}
