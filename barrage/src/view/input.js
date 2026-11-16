// DOM 이벤트 → inputMap(순수). Space의 페이지 굴림·오른쪽 버튼 메뉴를 막고, 창이 초점을 잃으면 키를 다 뗀다.
// 판 밖 키(F1·F2·F4·Esc·V·G)는 onKey로 넘긴다.
const SPECIAL = new Set(['F1', 'F2', 'F4', 'Escape', 'KeyV', 'KeyG']);
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F4', 'ShiftLeft', 'ShiftRight']);

export function attachInput(target, canvas, map, { onKey, onBlur, onFirstInput } = {}) {
  let first = true;
  const firstInput = () => { if (first) { first = false; onFirstInput?.(); } };
  target.addEventListener('keydown', e => {
    if (BLOCK.has(e.code)) e.preventDefault();
    firstInput();
    if (SPECIAL.has(e.code)) { if (!e.repeat) onKey?.(e.code); return; }
    map.keyDown(e.code, performance.now());
  });
  target.addEventListener('keyup', e => map.keyUp(e.code));
  canvas.addEventListener('mousedown', e => { e.preventDefault(); firstInput(); map.mouseDown(e.button, performance.now()); });
  canvas.addEventListener('mouseup', e => map.mouseUp(e.button));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  target.addEventListener('blur', () => { map.blur(); onBlur?.(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { map.blur(); onBlur?.(); } });
}
