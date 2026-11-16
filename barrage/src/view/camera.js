// 카메라: camMath의 틀 잡기를 화면에 적용하고, 흔들림·반동·순간 확대를 실제 시간으로 얹는다(정지 중에도 보이게).
// 흔들림은 가로 위주(세로는 shakeVerticalRatio배), 확대는 지금 가로에 곱한다. 세기는 화면 px로 받아 U로 바꾼다.
import { framingPoints, frameTarget, stepFrame, floorOf } from './camMath.js';

export function createCamera(view, LOOK) {
  const C = LOOK.camera;
  let state = null, pitchDeg = C.pitches[0];
  const fx = { shakePx: 0, shakeUntil: 0, shakeDur: 1, kickX: 0, kickY: 0, kickUntil: 0, kickDur: 1, punch: 0, punchAt: -1, punchDur: 1, hold: 0, holdAt: -1e9, holdUntil: -1e9, now: 0 };

  function opts() { return { yawDeg: C.yawDeg, pitchDeg, aspect: view.aspect, LOOK, board: { hx: 10, hz: 7 } }; }

  // now = 실제 시간(초), dtReal = 실제 흐른 시간
  function update(w, dtReal, now) {
    fx.now = now;
    const o = { ...opts(), board: w.rules.board };
    if (!(o.aspect > 0 && Number.isFinite(o.aspect))) return;   // 숨은 창(높이 0): 비율이 망가진 화면은 건너뛴다
    if (state && !Number.isFinite(state.sx + state.sy + state.width)) state = null;   // 한 번 망가진 틀은 다시 잡는다(NaN에 갇히지 않게)
    const pts = framingPoints(w, LOOK), ideal = frameTarget(pts, o);
    state = state ? stepFrame(state, ideal, pts, dtReal, o) : { ...ideal, narrowT: 0 };
    const f = floorOf(state.sx, state.sy, C.yawDeg, pitchDeg);
    // 흔들림·반동·순간 확대
    const upp = state.width / (view.canvas.clientWidth || window.innerWidth);   // 1 px = 몇 U
    let offX = 0, offY = 0;
    if (now < fx.shakeUntil) {
      const k = (fx.shakeUntil - now) / fx.shakeDur;
      offX += (Math.random() * 2 - 1) * fx.shakePx * k * upp;
      offY += (Math.random() * 2 - 1) * fx.shakePx * k * upp * C.shakeVerticalRatio;
    }
    if (now < fx.kickUntil) { const k = (fx.kickUntil - now) / fx.kickDur; offX += fx.kickX * k * upp; offY += fx.kickY * k * upp; }
    let zoom = 1;
    const pu = now - fx.punchAt;
    if (pu >= 0 && pu < fx.punchDur) { const u = pu / fx.punchDur, env = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8; zoom = 1 - fx.punch * env; }
    // 당긴 채 유지(처형 b): 0.1초에 당기고, 끝나면 0.15초에 푼다
    if (fx.hold > 0) {
      const inK = Math.min(1, (now - fx.holdAt) / 0.1), outK = now < fx.holdUntil ? 1 : Math.max(0, 1 - (now - fx.holdUntil) / 0.15);
      zoom *= 1 - fx.hold * Math.min(inK, outK);
      if (outK <= 0) fx.hold = 0;
    }
    view.setView({ cx: f.x, cz: f.z, width: state.width * zoom, pitchDeg, yawDeg: C.yawDeg, offX, offY });
  }

  return {
    update,
    // 센 쪽을 남긴다(적 여럿이 겹쳐도)
    shake(px, sec) { const left = fx.shakeUntil > fx.now ? fx.shakePx * (fx.shakeUntil - fx.now) / fx.shakeDur : 0; if (px < left) return; fx.shakePx = px; fx.shakeDur = sec; fx.shakeUntil = fx.now + sec; },
    kick(dx, dy, sec) { fx.kickX = dx; fx.kickY = dy; fx.kickDur = sec; fx.kickUntil = fx.now + sec; },
    punch(ratio, sec) { fx.punch = ratio; fx.punchDur = sec; fx.punchAt = fx.now; },
    hold(ratio, sec) { fx.hold = ratio; fx.holdAt = fx.now; fx.holdUntil = fx.now + sec; },
    release() { fx.holdUntil = Math.min(fx.holdUntil, fx.now); },
    setPitch(deg) { pitchDeg = deg; state = null; },   // 기울기가 바뀌면 화면 좌표가 달라진다 — 다시 잡는다
    get pitch() { return pitchDeg; },
    get state() { return state; },
  };
}
