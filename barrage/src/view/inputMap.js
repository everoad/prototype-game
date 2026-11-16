// 키 상태 → 이번 틱 입력(순수, Node에서 시험). 화면 기준 방향(W = 화면 위)을 바닥 방향으로 바꾼다.
// 반대 키는 나중에 누른 쪽이 이긴다(축마다 누른 차례), 패링·회피는 누른 순간(edge)만 센다(자동 반복 무시),
// 틱이 안 돈 화면(정지 중)에 누른 것은 다음 take()에 나간다.
const AXIS = {
  KeyW: ['v', 1], ArrowUp: ['v', 1], KeyS: ['v', -1], ArrowDown: ['v', -1],
  KeyD: ['h', 1], ArrowRight: ['h', 1], KeyA: ['h', -1], ArrowLeft: ['h', -1],
};
// 양손 키보드(사용자 2026-11-16): 왼손 WASD·Space, 오른손 J 패링·K 방패·L 폭탄(U·I·O는 나중 스킬 자리). Shift·Q·E·마우스도 그대로.
const PARRY = new Set(['ShiftLeft', 'ShiftRight', 'KeyJ']);
const DODGE = new Set(['Space']);
const SHIELD = new Set(['KeyQ', 'KeyK']), BOMB = new Set(['KeyE', 'KeyL']);   // 방패·폭탄 사용권(§4.9)
const GEAR_KEYS = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4 };   // 보조 무기 켜고 끄기(§4.10, 시험용)
const ACT = new Set(['KeyI', 'KeyF']);   // 실험 기믹의 행동 키(?try= — 갈고리 등)
const SKILL_KEYS = { KeyU: 'missile', KeyI: 'beam', KeyO: 'drone' };   // 무기 스킬(패링 게이지)

export function createInputMap(yawRad) {
  const held = new Map();           // 코드 → 누른 차례
  const down = new Set();           // 지금 눌려 있는 패링·회피 키(자동 반복 거르기)
  let pickH = 0, pickV = 0;   // 이번에 누른 방향 키(가로·세로, −1·0·+1) — 저격의 적 고르기(누른 순간 한 번)
  let order = 0, parry = false, dodge = false, shield = false, bomb = false, toggle = 0, skill = null, toss = false, act = false, last = 0;
  const sin = Math.sin(yawRad), cos = Math.cos(yawRad);

  function axis(name) {
    let best = null;
    for (const [code, k] of held) { const a = AXIS[code]; if (a[0] === name && (!best || k > best.k)) best = { k, s: a[1] }; }
    return best ? best.s : 0;
  }
  return {
    keyDown(code, tMs) {
      if (AXIS[code]) { if (!held.has(code)) { held.set(code, ++order); last = tMs; if (AXIS[code][0] === 'h') pickH = AXIS[code][1]; else pickV = AXIS[code][1]; } return; }
      if (down.has(code)) return;
      down.add(code);
      if (PARRY.has(code)) { parry = true; last = tMs; }
      if (DODGE.has(code)) { dodge = true; last = tMs; }
      if (SHIELD.has(code)) shield = true;
      if (BOMB.has(code)) bomb = true;
      if (GEAR_KEYS[code]) toggle = GEAR_KEYS[code];
      if (SKILL_KEYS[code]) skill = SKILL_KEYS[code];
      if (ACT.has(code)) act = true;
      if (code === 'KeyU') toss = true;   // 모아 던지기(§4.11) — ?store=1에서만 쓰인다(아니면 U = 일제 사격 스킬)
    },
    keyUp(code) { held.delete(code); down.delete(code); },
    mouseDown(btn, tMs) { if (btn === 0) parry = true; if (btn === 2) dodge = true; last = tMs; },
    mouseUp() {},
    blur() { held.clear(); down.clear(); },
    clearPresses() { shield = false; bomb = false; toss = false; act = false; pickH = 0; pickV = 0; },   // 멈춘 동안 누른 Q·E(사용권)는 버린다
    // 화면 위(v) = 바닥 (−sin ψ, −cos ψ), 화면 오른쪽(h) = (cos ψ, −sin ψ)
    take() {
      const v = axis('v'), h = axis('h');
      let mx = -sin * v + cos * h, mz = -cos * v - sin * h;
      const len = Math.hypot(mx, mz);
      if (len > 1e-9) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
      const hold = down.has('KeyI') || down.has('KeyF');   // 실험 행동 키를 누르고 있는 동안(저격)
      const out = { mx, mz, parry, dodge, shield, bomb, toggle, skill, throw: toss, act, hold, pickX: (cos * pickH - sin * pickV) || 0, pickZ: (-sin * pickH - cos * pickV) || 0 };   // 누른 방향 키의 바닥 방향(이동과 같은 변환)
      pickH = 0; pickV = 0;
      parry = false; dodge = false; shield = false; bomb = false; toggle = 0; skill = null; toss = false; act = false;
      return out;
    },
    lastPressMs: () => last,
    isHeld: code => held.has(code) || down.has(code),
  };
}
