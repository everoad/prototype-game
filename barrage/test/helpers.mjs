// 시험 도우미: 보스가 서 있기만 하는 판, 초 단위로 돌리기, 빈 입력.
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';

export const idle = Object.freeze({ mx: 0, mz: 0, parry: false, dodge: false });
export const quietWorld = (opts = {}) => createWorld({ ai: false, ...opts });
export const ticks = sec => Math.round(sec / RULES.dt);
// 그 시간만큼 틱을 돌린다. input은 객체거나 (w, k) => 입력 함수.
export function run(w, sec, input = idle) {
  const n = ticks(sec);
  for (let k = 0; k < n; k++) step(w, typeof input === 'function' ? input(w, k) : input);
}
export const types = w => drainEvents(w).map(e => e.type);
