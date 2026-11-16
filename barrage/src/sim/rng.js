// 판 전용 시드 난수(mulberry32, legion에서 가져옴). Math.random은 쓰지 않는다.
// peek() = 다음 값을 상태를 바꾸지 않고 본다(stateHash용).
export function makeRng(seed) {
  let a = seed >>> 0;
  function mix(s) {
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    return mix(a);
  }
  return { next, int: n => Math.floor(next() * n), peek: () => mix((a + 0x6D2B79F5) >>> 0) };
}
