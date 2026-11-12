// 3D 위 2D 덧그림: 체력·짓기·생산 막대, 지역 이름, 고르기 네모.
import { ROLES, UNITS } from '../sim/rules.js';

const ROLE_TEXT = { village: '마을 · 인구 +30', altar: '제단 · 승점', fort: '요새', gold: '금광 지대', forest: '숲', ley: '마나 샘', home: '' };

export function createOverlay(canvas) {
  const g = canvas.getContext('2d');
  function size() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio, 2);
    if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  const bar = (x, y, wd, frac, color, back = 'rgba(0,0,0,0.55)') => {
    g.fillStyle = back; g.fillRect(x - wd / 2 - 1, y - 1, wd + 2, 5);
    g.fillStyle = color; g.fillRect(x - wd / 2, y, wd * Math.max(0, Math.min(1, frac)), 3);
  };
  const hpColor = f => (f > 0.6 ? '#4cd964' : f > 0.3 ? '#ffcc00' : '#ff3b30');

  function draw(w, view, o) {
    const r = size();
    g.clearRect(0, 0, r.width, r.height);
    const side = o.side, zoomed = view.cam.h < 320;
    // 지역 이름
    if (zoomed) {
      g.font = '600 12px system-ui, "Malgun Gothic", sans-serif';
      g.textAlign = 'center';
      w.map.regions.forEach((rg, k) => {
        const st = w.regions[k];
        let label = ROLE_TEXT[rg.role] ?? '';
        const cut = st.owner >= 0 && !st.connected[st.owner];
        if (!label && !cut && !st.contested) return;
        const p = view.project(rg.x, rg.fort ? 18 : 12, rg.z);
        if (!p.vis || p.sx < -50 || p.sx > r.width + 50) return;
        if (cut) label += (label ? ' · ' : '') + '끊김(수입 없음)';
        if (st.contested) label += (label ? ' · ' : '') + '다툼';
        g.lineWidth = 3; g.strokeStyle = 'rgba(20,20,20,0.7)'; g.strokeText(label, p.sx, p.sy - 6);
        g.fillStyle = cut ? '#ffb0a0' : '#fff8e0'; g.fillText(label, p.sx, p.sy - 6);
      });
    }
    // 유닛 막대
    for (const s of view.screenUnits) {
      const u = s.u, sel = o.selected.has(u.id);
      if (!sel && u.hp >= u.maxHp) continue;
      const wd = Math.max(14, Math.min(40, u.t.r * 14 * (240 / Math.max(80, view.cam.h))));
      bar(s.sx, s.sy - 4, wd, u.hp / u.maxHp, u.side === side ? hpColor(u.hp / u.maxHp) : '#ff6a5a');
    }
    // 건물 막대
    for (const b of w.buildings) {
      const vis = b.side === side || !o.fog || o.canSee(b.x, b.z);
      if (!vis) continue;
      const sel = o.selected.has(b.id);
      const showHp = sel || b.hp < b.maxHp * 0.999;
      const busy = b.side === side && b.queue.length;
      if (!showHp && b.done && !busy) continue;
      const p = view.project(b.x, b.type === 'citadel' ? 22 : b.type === 'magetower' ? 22 : 12, b.z);
      if (!p.vis) continue;
      const wd = Math.max(26, Math.min(80, b.r * 7 * (200 / Math.max(80, view.cam.h))));
      let y = p.sy;
      if (b.ruined) { g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffd0c0'; g.fillText('무너짐', p.sx, y - 4); y += 12; }
      if (showHp && !b.dormant) { bar(p.sx, y, wd, b.hp / b.maxHp, b.side === side ? hpColor(b.hp / b.maxHp) : '#ff6a5a'); y += 7; }
      if (!b.done) { bar(p.sx, y, wd, b.progress, '#5ac8fa'); y += 7; }
      if (busy) { const it = b.queue[0]; bar(p.sx, y, wd, 1 - it.left / it.total, it.kind === 'research' ? '#c77dff' : '#ffd34d'); }
    }
    // 고르기 네모
    if (o.box) {
      const { x0, y0, x1, y1 } = o.box;
      g.strokeStyle = '#40ff60'; g.lineWidth = 1.5; g.fillStyle = 'rgba(64,255,96,0.08)';
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
  return { draw, canvas, ctx: g };
}
export { ROLES, UNITS };
