// 용 자세(설계 용 §7 — 몸이 예고다): sim 상태만 읽어 부위 자세를 낸다(순수 함수, 화면은 이 값을 따라 상자를 움직인다).
// headLift 0~1 머리 들기 · jaw 0~1 입 벌림 · neck 1~ 목 부풂(브레스 들이켬) · headYaw 머리 돌림(라디안, 빔 쓸기) ·
// wingL·wingR −1~1(0 접음, 1 높이 펼침, −1 내리침, 0.5 반쯤) · tail −1~1(+ 왼쪽으로 감음, − 오른쪽으로 휘두름) ·
// crouch 0~1 몸 낮춤 · paws 0~1 앞발 들기 · down 0~1 엎드림(그로기)
const clamp01 = x => Math.max(0, Math.min(1, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const HEAD_FREE = 7;   // 패턴 7(날개 탄 벽)만 머리 공격이 아니다

// 보스 무리는 rotation.y = −face로 돈다: 그 안에서 목을 θ 돌리면 머리는 face − θ를 본다 → 빔 쪽(face + headYaw)을 보려면 θ = −headYaw
export const neckYaw = pose => -pose.headYaw;

export function dragonPose(w) {
  const b = w.boss, out = { headLift: 0, jaw: 0, neck: 1, headYaw: 0, wingL: 0, wingR: 0, tail: 0, crouch: 0, paws: 0, down: 0 };
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
  return out;
}
