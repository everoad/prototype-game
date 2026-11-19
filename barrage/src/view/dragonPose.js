// 용 자세(설계 용 §7 — 몸이 예고다): sim 상태만 읽어 부위 자세를 낸다(순수 함수, 화면은 이 값을 따라 상자를 움직인다).
// headLift 0~1 머리 들기 · jaw 0~1 입 벌림 · neck 1~ 목 부풂(브레스 들이켬) · headYaw 머리 돌림(라디안, 빔 쓸기) ·
// wingL·wingR −1~1(0 접음, 1 높이 펼침, −1 내리침, 0.5 반쯤) · tail −1~1(+ 왼쪽으로 감음, − 오른쪽으로 휘두름) ·
// crouch 0~1 몸 낮춤 · paws 0~1 앞발 들기 · down 0~1 엎드림(그로기)
const clamp01 = x => Math.max(0, Math.min(1, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const FLAP = 13;        // 나는 용이 떠 있을 때의 날갯짓 빠르기(라디안/초 — 순수 함수라 LOOK을 읽지 않는다)
const HEAD_FREE = 7;   // 패턴 7(날개 탄 벽)만 머리 공격이 아니다

// 보스 무리는 rotation.y = −face로 돈다: 그 안에서 목을 θ 돌리면 머리는 face − θ를 본다 → 빔 쪽(face + headYaw)을 보려면 θ = −headYaw
export const neckYaw = pose => -pose.headYaw;

export function dragonPose(w) {
  const b = w.boss, out = { headLift: 0, jaw: 0, neck: 1, headYaw: 0, wingL: 0, wingR: 0, tail: 0, crouch: 0, paws: 0, down: 0, pitch: 0, tuck: 0 };
  if (w.time < b.groggyUntil && !b.dead) { out.down = 1; out.jaw = 1; return out; }
  const since = w.time - b.stateAt;
  // 패턴 준비: 머리 패턴 = 머리 들고 입 벌림, 날개 탄 벽 = 두 날개 펼침
  if (b.state === 'windup' && b.next?.pattern != null) {
    const u = clamp01(since / w.rules.brain.windup);
    if (b.next.pattern === HEAD_FREE) { out.wingL = out.wingR = u; } else { out.headLift = u; out.jaw = u; }
  }
  // 머리 패턴이 탄을 내는 동안 입을 벌리고 있다
  if ((b.runs ?? []).some(r => r.id !== HEAD_FREE && !r.done)) out.jaw = Math.max(out.jaw, 0.7);
  // 브레스: 들이켜는 동안 목이 부풀고 머리를 젖힘 → 쏘는 동안 머리가 빔을 따라 돈다
  const m = w.beams?.[0];
  if (m) {
    if (w.time < m.fireAt) { const u = clamp01((w.time - m.born) / (m.fireAt - m.born)); out.neck = 1 + 0.35 * u; out.headLift = Math.max(out.headLift, u); }
    else { out.headYaw = wrap(m.angle - b.face); out.jaw = 1; }
  }
  // 장판 공격
  const f = w.floor;
  if (f?.kind === 'tail') {
    const u = clamp01((w.time - f.born) / f.area.warn);
    out.tail = f.area.hit ? -1 : u;   // 왼쪽으로 감았다가 타격에 반대쪽으로 휘두른다
  } else if (f?.kind === 'wave' && f.arc) {
    const side = wrap(f.arc.face - b.face) > 0 ? 'wingL' : 'wingR';
    out[side] = f.wave ? -1 : clamp01((w.time - f.born) / f.area.warn);   // 들어 펼침 → 파도가 나가면 내리침
  } else if (f?.kind === 'wave') {
    const u = f.wave ? 1 : clamp01((w.time - f.born) / f.area.warn);
    out.paws = f.wave ? 0 : u; out.headLift = Math.max(out.headLift, u); out.jaw = Math.max(out.jaw, u);   // 앞발을 들었다 땅을 치며 포효
  } else if (f?.kind === 'slam') {
    out.crouch = f.phase === 'dash' ? 0.6 : clamp01((w.time - f.born) / w.rules.floor.slam.warn);
    out.wingL = out.wingR = 0.5;   // 활공: 날개 반쯤
  }
  // 덮치기·발톱
  const r = w.melee?.rush;
  if (r) { if (r.phase === 'crouch') { out.crouch = clamp01((w.time - r.start) / w.rules.rush.crouch); out.paws = out.crouch; } else { out.crouch = 0.4; out.wingL = out.wingR = 0.5; } }
  if (w.melee?.areas?.length) out.paws = 1;
  // 나는 용(sim/dragon2.js): pitch = 몸 숙임(라디안, + = 머리가 아래) · tuck 0~1 = 다리 접기. 떠 있는 동안 두 날개가 FLAP의 빠르기로 친다.
  if (b.wyrm) {
    const D = w.rules.dragon2, flap = Math.sin(w.time * FLAP);
    if (b.state === 'inhale') { const u = clamp01(since / D.breath.inhale); out.neck = 1 + 0.4 * u; out.headLift = u; out.jaw = 0.3 * u; out.crouch = 0.3 * u; }
    else if (b.state === 'breath') { out.jaw = 1; out.headLift = 0.15; out.neck = 1.15; out.crouch = 0.25; out.wingL = out.wingR = 0.35; }
    else if (b.state === 'retreat') { const u = clamp01(since / D.retreat.sec); out.wingL = out.wingR = u < 0.4 ? 1 : -1; out.tuck = 0.6; out.pitch = -0.25; }
    else if (b.state === 'takeoff') { const u = clamp01(since / D.fly.rise); out.crouch = u < 0.2 ? 1 - u * 5 : 0; out.wingL = out.wingR = u < 0.2 ? 1 : flap; out.tuck = u; out.pitch = -0.45 * Math.sin(Math.PI * u); }
    else if (b.state === 'aim') { out.wingL = out.wingR = flap; out.tuck = 1; out.headLift = -0.3; out.jaw = 0.5; out.neck = 1.25; }
    else if (b.state === 'strafe') { out.wingL = out.wingR = 0.75 + 0.2 * flap; out.tuck = 1; out.pitch = 0.2; out.jaw = 1; out.headLift = -0.6; }
    else if (b.state === 'diveAim') {
      const a = b.act?.area, left = a ? a.born + a.warn - w.time : 1, fall = clamp01(1 - left / D.dive.drop);   // 마지막 drop초: 날개를 접고 머리부터 내리꽂는다
      out.tuck = 1 - fall; out.wingL = out.wingR = fall > 0 ? 0.15 : flap; out.pitch = fall > 0 ? 0.9 : 0.35; out.paws = fall; out.jaw = 0.6;
    } else if (b.state === 'land') { const u = clamp01(since / 0.35); out.crouch = 1 - u; out.wingL = out.wingR = 0.6 * (1 - u); }
  }
  return out;
}
