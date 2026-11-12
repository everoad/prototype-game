// 녹화 모드(?record=초&fps=30&speed=n): 실제 시간 대신 프레임마다 정확히 speed/fps초씩 판을 돌리고,
// 3D 화면 위에 장면·시간·병사 수를 그려 PNG로 서버에 보낸다(POST /frame?n=, 끝나면 POST /done).
import { advance } from '../sim/world.js';
import { crewMarks } from './crewMarks.js';
import { barsOf } from './buildingBars.js';

// 카메라 경로(URL cam이 없을 때): [시간 비율, {tx, tz, h, yaw}]. lab = 시험 장면 자리(600, 250) 둘레,
// legion = 게임 판 경제 시범(속도 2, 100초 영상 ≈ 판 200초): 전경 → 본진(광부 조가 금광·벌목소·병영을 짓는다, 18–44초) → 병영과 첫 쐐기(71초)가
// 앞 요새 앞 집결지로 → 마나 샘으로 어택땅(95초)과 싸움 → 금광 지대 금광(126–136초) → 전경.
const PATHS = {};
// pitch(4단계 — 가운데 끌기 기울기 30~70°): 본진을 낮게(35°) 비추다가 싸움은 높이(65°) 내려다본다.
PATHS.legion = [
  [0.0, { tx: 600, tz: 330, h: 640, yaw: -0.5, pitch: 45 }],
  [0.06, { tx: 600, tz: 95, h: 190, yaw: -0.35, pitch: 40 }],
  [0.24, { tx: 630, tz: 110, h: 170, yaw: -0.05, pitch: 35 }],
  [0.38, { tx: 640, tz: 170, h: 230, yaw: -0.3, pitch: 45 }],
  [0.5, { tx: 470, tz: 170, h: 300, yaw: -0.3, pitch: 55 }],
  [0.68, { tx: 230, tz: 125, h: 230, yaw: -0.6, pitch: 65 }],
  [0.84, { tx: 360, tz: 100, h: 240, yaw: -0.3, pitch: 50 }],
  [1.0, { tx: 600, tz: 360, h: 700, yaw: -0.5, pitch: 45 }],
];
const PATH = PATHS.lab = [
  [0.0, { tx: 600, tz: 250, h: 260, yaw: -0.6, pitch: 45 }],
  [0.4, { tx: 600, tz: 260, h: 140, yaw: -0.3, pitch: 45 }],
  [0.8, { tx: 610, tz: 270, h: 150, yaw: 0.2, pitch: 45 }],
  [1.0, { tx: 600, tz: 250, h: 240, yaw: 0, pitch: 45 }],
];

function camAt(PATH, u) {
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
    Object.assign(view.cam, fixedCam ?? camAt(PATHS[world.map.name] ?? PATH, f / Math.max(1, total - 1)));
    beforeFrame();
    if (drawCrowd) drawCrowd(1); else crowd.update(world, 1);
    view.render();
    g.drawImage(canvas, 0, 0);
    marks(g, world, view, canvas.width / canvas.clientWidth);
    overlay(g, world, comp.width);
    const blob = await new Promise(res => comp.toBlob(res, 'image/png'));
    await fetch(`/frame?n=${f}`, { method: 'POST', body: blob });
  }
  await fetch('/done', { method: 'POST', body: '' });
}

// 화면 겹(HTML이라 캔버스에 안 찍힌다)을 영상에도: 광부 조 망치 표식(쉬면 꽉 찬 노랑, 일하면 테두리 — 적 조는 편 색 테두리), 건물 띠(일·체력).
function marks(g, w, view, k) {
  if (!w.buildings?.length) return;
  g.save(); g.scale(k, k);
  for (const b of w.buildings) {
    if (!b.alive) continue;
    const v = barsOf(b, w.time);
    if (v.hp === null && v.work === null) continue;
    const p = view.worldToScreen(b.x, b.z, view.heightAt(b.x, b.z) + 16);
    if (p.behind) continue;
    let y = p.y - 10;
    for (const [val, color] of [[v.hp, v.hp > 0.5 ? '#4caf50' : '#e0533c'], [v.work, v.kind === 'build' ? '#d8c9a0' : v.kind === 'research' ? '#c77dff' : '#7fd3ff']]) {
      if (val === null) continue;
      g.fillStyle = '#3a3a36'; g.fillRect(p.x - 22, y, 44, 4);
      g.fillStyle = color; g.fillRect(p.x - 22, y, 44 * val, 4);
      y += 6;
    }
  }
  for (const side of [0, 1]) for (const m of crewMarks(w, side)) {
    const p = view.worldToScreen(m.x, m.z, view.heightAt(m.x, m.z) + 3.5);
    if (p.behind) continue;
    const filled = side === 0 && m.idle, color = side === 0 ? '#f2c14e' : '#d85a30';
    g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2);
    g.fillStyle = filled ? color : 'rgba(44,44,42,.55)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = filled ? '#2c2c2a' : color; g.stroke();
    g.fillStyle = filled ? '#2c2c2a' : color; g.font = '700 12px "Segoe UI Symbol", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('⚒', p.x, p.y + 0.5);
  }
  g.restore();
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

function overlay(g, w, width) {
  const s = w.soldiers, alive = [0, 0, 0], fight = [0, 0, 0];
  for (let i = 0; i < s.count; i++) if (s.alive[i]) { alive[s.side[i]]++; fight[s.side[i]] += s.inContact[i]; }
  g.fillStyle = 'rgba(250,248,240,0.88)';
  g.fillRect(10, 10, width - 20, 40);
  g.font = '18px "Malgun Gothic", sans-serif';
  const t = w.time, clock = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  g.fillStyle = '#2c2c2a';
  const land = w.territory ? `   땅 우리 ${w.territory.filter(t => t.owner === 0).length} : 적 ${w.territory.filter(t => t.owner === 1).length}` : '';
  const scene = w.labName === 'game' ? '게임 판' : w.labName ?? '';
  const S = w.sides[0], res = w.buildings?.length ? `   금 ${Math.floor(S.gold)} · 목재 ${Math.floor(S.wood)} · 마나 ${Math.floor(S.mana)} · 인구 ${Math.ceil(S.pop)}/${S.popCap}` : '';
  g.fillText(`군단 영지 ${scene}   ${clock}   병사 우리 ${alive[0]} : 적 ${alive[1]}   싸우는 중 ${fight[0]} : ${fight[1]}${land}${res}`, 22, 37);
}
