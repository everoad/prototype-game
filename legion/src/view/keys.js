// 키 해석(설계서 §4 키 배치, 사용자 2026-11-13): 키 하나 → 할 일 하나. 화면(input.js)이 그 결과로 움직인다. 키는 e.code로 본다(한글 입력 상태에서도 먹게).
// 숫자 = 부대(숫자 = 고르기, Ctrl+숫자 = 지정, Shift+숫자 = 더하기), Z·X·C = 지휘 스킬(CASTS 차례), Q·W·E·R·A·D·F = 짓기(광부 조를 골랐을 때), S = 멈춤, ` = 쉬는 광부 조, Space = 마지막 알림 자리, Esc = 그만.
// 방향키 화면 이동은 scene.js가 맡는다(WASD 화면 이동·Q/E 회전은 없앴다 — 사용자 "WASD 화면이동은 없애자").
import { CASTS } from '../sim/casts.js';

export const CAST_KEYS = ['Z', 'X', 'C'];
const CAST_CODES = CAST_KEYS.map(c => `Key${c}`);
// 짓기 단축키(사용자 2026-11-13 "일꾼 건물 생성 단축키"): 광부 조를 골랐을 때 rules.buildMenu 차례(금광·벌목소·마나 우물·병영·마구간·공방·마법탑 — 6-1단계 F)
export const BUILD_KEYS = ['Q', 'W', 'E', 'R', 'A', 'D', 'F'];
const BUILD_CODES = BUILD_KEYS.map(c => `Key${c}`);
const PLAIN = { KeyS: { kind: 'stop' }, Backquote: { kind: 'idleCrews' }, Space: { kind: 'lastAlert' } };


// e = { code, ctrlKey, shiftKey, altKey, metaKey, repeat, tag } → 할 일 또는 null
export function keyAction(e) {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tag ?? '') || e.repeat) return null;
  if (e.code === 'Escape') return { kind: 'cancel' };
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) {
    if (e.altKey || e.metaKey) return null;
    const n = Number(digit[1]);
    if (e.ctrlKey) return e.shiftKey ? null : { kind: 'groupSet', n };
    return e.shiftKey ? { kind: 'groupAdd', n } : { kind: 'groupSelect', n };
  }
  if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return null;
  const c = CAST_CODES.indexOf(e.code);
  if (c >= 0) return { kind: 'cast', order: CASTS[c] };
  const b = BUILD_CODES.indexOf(e.code);
  if (b >= 0) return { kind: 'build', slot: b };
  return PLAIN[e.code] ? { ...PLAIN[e.code] } : null;
}

// 브라우저 기본 동작을 막을 키: Ctrl+숫자(탭 바꾸기)와 Space(쪽 넘김·초점 단추 누름) — 꾹 눌러 반복될 때도(할 일은 없어도). 글 칸은 빼고.
export function shouldPrevent(e) {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tag ?? '')) return false;
  if (/^Digit[1-9]$/.test(e.code)) return !!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
  return e.code === 'Space' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
}
