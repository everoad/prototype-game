// 녹화(?record=초&fps=30&speed=n): 프레임마다 speed/fps초씩 판을 돌리고 3D + 덧그림 + 한 줄 요약을 PNG로 서버에 보낸다.
import { advance } from '../sim/world.js';

export async function record({ world, view, canvas, over, drawFrame, seconds, fps, speed, fixedCam }) {
  const total = Math.round(seconds * fps);
  const comp = document.createElement('canvas');
  comp.width = canvas.width || 1280; comp.height = canvas.height || 720;
  const g = comp.getContext('2d');
  for (let f = 0; f < total; f++) {
    advance(world, speed / fps, 1000);
    if (!fixedCam) follow(world, view, f / Math.max(1, total - 1));
    drawFrame(1);
    if (comp.width !== canvas.width) { comp.width = canvas.width; comp.height = canvas.height; }
    g.drawImage(canvas, 0, 0);
    g.drawImage(over, 0, 0, comp.width, comp.height);
    summary(g, world, comp.width);
    const blob = await new Promise(res => comp.toBlob(res, 'image/png'));
    await fetch(`/frame?n=${f}`, { method: 'POST', body: blob });
  }
  await fetch('/done', { method: 'POST', body: '' });
}

// 카메라: 싸움이 가장 많이 난 곳(최근 사건)을 천천히 따라간다
function follow(w, view, u) {
  let x = 0, z = 0, n = 0;
  for (const e of w.events) if (w.time - e.time < 6 && e.x !== undefined) { x += e.x; z += e.z; n++; }
  if (!n) { for (const un of w.units) if (un.side < 2 && !un.t.worker) { x += un.x; z += un.z; n++; } }
  if (!n) return;
  const c = view.cam;
  c.tx += (x / n - c.tx) * 0.04; c.tz += (z / n - c.tz) * 0.04;
  c.h = 125;
}

function summary(g, w, width) {
  const t = w.time, clock = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const land = [0, 1].map(s => w.regions.filter(r => r.owner === s).length);
  const army = [0, 1].map(s => w.units.filter(u => u.side === s && !u.t.worker).length);
  g.fillStyle = 'rgba(24,26,30,0.82)'; g.fillRect(10, 10, width - 20, 36);
  g.font = '18px "Malgun Gothic", sans-serif'; g.fillStyle = '#f4efe2';
  g.fillText(`${clock}   땅 파랑 ${land[0]} : 빨강 ${land[1]}   병력 ${army[0]} : ${army[1]}   승점 ${Math.ceil(w.sides[0].points)} : ${Math.ceil(w.sides[1].points)}${w.result ? `   — ${w.result.winner === 0 ? '파랑' : '빨강'} 승리` : ''}`, 22, 34);
}
