// 키 상태 → 이번 틱 입력(순수, Node에서 시험). 화면 기준 방향(W = 화면 위)을 바닥 방향으로 바꾼다.
// 반대 키는 나중에 누른 쪽이 이긴다(축마다 누른 차례), 패링·회피는 누른 순간(edge)만 센다(자동 반복 무시),
// 틱이 안 돈 화면(정지 중)에 누른 것은 다음 take()에 나간다.
const AXIS = {
  KeyW: ['v', 1], ArrowUp: ['v', 1], KeyS: ['v', -1], ArrowDown: ['v', -1],
  KeyD: ['h', 1], ArrowRight: ['h', 1], KeyA: ['h', -1], ArrowLeft: ['h', -1],
};
const PARRY = new Set(['ShiftLeft', 'ShiftRight']);
const DODGE = new Set(['Space']);

export function createInputMap(yawRad) {
  const held = new Map();           // 코드 → 누른 차례
  const down = new Set();           // 지금 눌려 있는 패링·회피 키(자동 반복 거르기)
  let order = 0, parry = false, dodge = false, last = 0;
  const sin = Math.sin(yawRad), cos = Math.cos(yawRad);

  function axis(name) {
    let best = null;
    for (const [code, k] of held) { const a = AXIS[code]; if (a[0] === name && (!best || k > best.k)) best = { k, s: a[1] }; }
    return best ? best.s : 0;
  }
  return {
    keyDown(code, tMs) {
      if (AXIS[code]) { if (!held.has(code)) { held.set(code, ++order); last = tMs; } return; }
      if (down.has(code)) return;
      down.add(code);
      if (PARRY.has(code)) { parry = true; last = tMs; }
      if (DODGE.has(code)) { dodge = true; last = tMs; }
    },
    keyUp(code) { held.delete(code); down.delete(code); },
    mouseDown(btn, tMs) { if (btn === 0) parry = true; if (btn === 2) dodge = true; last = tMs; },
    mouseUp() {},
    blur() { held.clear(); down.clear(); },
    // 화면 위(v) = 바닥 (−sin ψ, −cos ψ), 화면 오른쪽(h) = (cos ψ, −sin ψ)
    take() {
      const v = axis('v'), h = axis('h');
      let mx = -sin * v + cos * h, mz = -cos * v - sin * h;
      const len = Math.hypot(mx, mz);
      if (len > 1e-9) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
      const out = { mx, mz, parry, dodge };
      parry = false; dodge = false;
      return out;
    },
    lastPressMs: () => last,
    isHeld: code => held.has(code) || down.has(code),
  };
}
