// 녹화 모드(?record=초&fps=30&speed=n): 실제 시간 대신 프레임마다 정확히 speed/fps초씩 판을 돌리고,
// 3D 화면 위에 사기·시간·병사 수를 그려 PNG로 서버에 보낸다(POST /frame?n=, 끝나면 POST /done).
import { advance } from '../sim/world.js';

// 카메라 경로: [시간 비율, {tx, tz, h, yaw}] — 처음 전경 → 가운데 맞닿은 곳 가까이 → 왼쪽 → 다시 전경
const PATH = [
  [0.0, { tx: 600, tz: 300, h: 560, yaw: 0 }],
  [0.3, { tx: 600, tz: 375, h: 150, yaw: 0 }],
  [0.6, { tx: 290, tz: 360, h: 190, yaw: 0.35 }],
  [1.0, { tx: 600, tz: 300, h: 620, yaw: 0 }],
];

function camAt(u) {
  for (let k = 1; k < PATH.length; k++) {
    const [u1, b] = PATH[k], [u0, a] = PATH[k - 1];
    if (u <= u1) {
      const t = (u - u0) / (u1 - u0), e = t * t * (3 - 2 * t);
      return Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * e]));
    }
  }
  return PATH.at(-1)[1];
}

// fixedCam이 있으면(URL cam=) 경로 대신 그 자리에 카메라를 고정한다.
export async function record({ world, view, crowd, beforeFrame, seconds, fps, speed, canvas, fixedCam = null, drawCrowd = null }) {
  const total = Math.round(seconds * fps);
  const comp = document.createElement('canvas');
  comp.width = canvas.width; comp.height = canvas.height;
  const g = comp.getContext('2d');
  for (let f = 0; f < total; f++) {
    advance(world, speed / fps, 1000);
    Object.assign(view.cam, fixedCam ?? camAt(f / Math.max(1, total - 1)));
    beforeFrame();
    if (drawCrowd) drawCrowd(1); else crowd.update(world, 1);
    view.render();
    g.drawImage(canvas, 0, 0);
    overlay(g, world, comp.width);
    const blob = await new Promise(res => comp.toBlob(res, 'image/png'));
    await fetch(`/frame?n=${f}`, { method: 'POST', body: blob });
  }
  await fetch('/done', { method: 'POST', body: '' });
}

function overlay(g, w, width) {
  const s = w.soldiers, alive = [0, 0], fight = [0, 0];
  for (let i = 0; i < s.count; i++) if (s.alive[i]) { alive[s.side[i]]++; fight[s.side[i]] += s.inContact[i]; }
  g.fillStyle = 'rgba(250,248,240,0.88)';
  g.fillRect(10, 10, width - 20, 40);
  g.font = '18px "Malgun Gothic", sans-serif';
  const bar = (x, label, m, color) => {
    g.fillStyle = '#2c2c2a'; g.fillText(label, x, 37);
    g.fillStyle = '#e4e1d6'; g.fillRect(x + 80, 24, 140, 12);
    g.fillStyle = color; g.fillRect(x + 80, 24, 140 * Math.max(0, m) / w.rules.morale.start, 12);
    g.fillStyle = '#2c2c2a'; g.fillText(m.toFixed(0), x + 230, 37);
  };
  bar(22, '우리 사기', w.sides[0].morale, '#1D9E75');
  bar(300, '적 사기', w.sides[1].morale, '#D85A30');
  const t = w.time;
  g.fillStyle = '#5f5e5a';
  g.fillText(`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}   병사 ${alive[0]} : ${alive[1]}   싸우는 중 ${fight[0]} : ${fight[1]}   승점 ${w.vpCount[0]} : ${w.vpCount[1]}`, 590, 37);
}
