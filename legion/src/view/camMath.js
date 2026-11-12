// 카메라 셈(three 없이 — 노드 시험이 불러온다, 설계서 §4 키 배치): 가운데 버튼 끌기 = 회전(좌우)·기울기(상하). 각도는 도, yaw만 라디안(scene.js와 같게).
export const CAMERA = { pitchStart: 45, pitchMin: 30, pitchMax: 70, yawPerPx: 0.35, pitchPerPx: 0.15 };

// 끌린 만큼 돌리고 기울인다(아래로 끌면 더 내려다본다). cam을 제자리에서 고쳐 돌려준다.
export function orbit(cam, dxPx, dyPx) {
  cam.yaw += dxPx * CAMERA.yawPerPx * Math.PI / 180;
  cam.pitch = Math.min(CAMERA.pitchMax, Math.max(CAMERA.pitchMin, cam.pitch + dyPx * CAMERA.pitchPerPx));
  return cam;
}

// 바라보는 점(tx, tz)에서 카메라까지(sim 좌표 x, z와 높이 y).
export function cameraOffset(cam) {
  const back = cam.h / Math.tan(cam.pitch * Math.PI / 180);
  return { x: -Math.sin(cam.yaw) * back, y: cam.h, z: -Math.cos(cam.yaw) * back };
}
