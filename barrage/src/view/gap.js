// 검사의 틈(순수 — 시험): 일섬으로 건너편에 선 뒤 다음 키를 누를 때까지 판 전체가 느리게 흐른다. 수치는 LOOK.sword.gap.
// 여기서는 "언제 여는가 · 무엇이 닫는가 · 그동안 무엇을 읽어 주는가"만 정한다. 시간을 늘이는 것은 timeFx.gap, 여닫는 것은 main.js.
// 화면 쪽의 일이다 — 판의 시간 전체가 늘어질 뿐 판정은 바뀌지 않는다(보스만 느려지는 것이 아니다).
import { inCircle, inSector } from '../sim/geom.js';
import { foeR } from '../sim/foes.js';

// 이번 장의 사건으로 틈을 열 것인가: 일섬이 끝났고(건너편에 섰다), 가는 동안 미리 눌러 둔 것이 없고(이미 정했다면 열지 않는다 —
// 미리 누른 스킬은 서는 틱에 바로 나가고, 미리 누른 회피는 기억돼 있다), 몸 표면까지 near 안에 살아 있는 적이 있다(정할 것이 있다). 판이 끝났거나 처형 중이면 열지 않는다.
export function gapWanted(w, events, G) {
  const at = events.findIndex(e => e.type === 'bladeEnd' && e.skill === 'slash');
  if (at < 0) return false;
  const p = w.player;
  if (w.result || w.execute || !p.blade || p.blade.want || p.blade.move) return false;
  if (events.slice(at + 1).some(e => e.type === 'bladeSpin' || e.type === 'bladeFinish' || e.type === 'bladeSlash')) return false;
  if (p.buffer && p.buffer.dodgeUntil >= w.time) return false;
  return (w.foeList ?? []).some(f => !f.dead && !f.away && Math.hypot(f.x - p.x, f.z - p.z) - foeR(w, f) <= G.near);
}

// 난무 앞의 느려짐(회전 베기): 검 타격이 열린 장에 시작한다(맞히지 못했거나 벤 적이 다 죽었으면 타격이 열리지 않으니 없다).
// 잇달아 쓸 때는 S.every초에 한 번만(now = 지금, last = 마지막으로 건 때). 첫 검이 베는 순간 끝난다 — 모여드는 동안은 느리고, 펼쳐지는 것은 제 빠르기로.
export const flurryWanted = (events, now, last, S) => now - last >= S.every && events.some(e => e.type === 'swordsStrike' && e.skill === 'spin');
export const flurryOver = events => events.some(e => e.type === 'swordHit' && e.skill === 'spin');

// 연사 앞의 느려짐(마무리): 검 타격이 열린 마무리에서 내가 착지하는 장(튕김이 끝난다)에 시작하고, 첫 검이 꽂히는 순간 끝난다 —
// 활이 서고 첫 검이 날아가는 동안은 느리고, 연사는 제 빠르기로. pending = 검 타격이 열린 마무리가 착지를 기다리는 중인가(main.js가 들고 있는다).
// 돌려주는 값: { pending, open 이번 장에 연다, close 이번 장에 닫는다 }. 처형·방 넘어가기로 검이 거둬지면 기다리던 것도 지운다.
export function volleyGap(pending, events) {
  let open = false, close = false;
  for (const e of events) {
    if (e.type === 'swordsStrike' && e.skill === 'finish') pending = true;
    else if (e.type === 'bladeEnd' && e.skill === 'finish' && pending) { open = true; pending = false; }
    else if ((e.type === 'swordHit' || e.type === 'swordMiss') && e.skill === 'finish') { close = true; pending = false; }
    else if (e.type === 'swordsClear') { close = true; pending = false; }
  }
  return { pending, open: open && !close, close };
}

// 틈을 닫는 입력: 정했다는 뜻의 키 — 스킬 · 회피 · 패링. 걷는 것은 닫지 않는다(가는 동안 방향 키를 누르고 있는 일이 흔하다).
export const isDecision = input => !!(input && (input.parry || input.dodge || input.throw || input.spin || input.orb));

// 지금 나를 덮는 근접 예고(휘두르기 · 내려찍기 · 바닥의 검기 등) 가운데 가장 먼저 닿는 것: { color, left 남은 초 }. 없으면 null.
export function threatAt(w) {
  const p = w.player, r = w.rules.player.bodyR, now = w.time;
  let best = null;
  for (const a of [...(w.melee ? w.melee.areas : []), ...(w.floorAreas ?? []), ...(w.mobAreas ?? [])]) {
    if (!a || a.hit || !a.color || a.warn == null || a.born == null) continue;
    const on = a.shape === 'circle' ? inCircle(p.x, p.z, r, a.x, a.z, a.R) : a.shape === 'sector' ? inSector(p.x, p.z, r, a.x, a.z, a.R, a.face, a.half) : false;
    if (!on) continue;
    const left = Math.max(0, a.born + a.warn - now);
    if (!best || left < best.left) best = { color: a.color, left };
  }
  return best;
}
