// 모드 고르기 판(멈춤 화면 — Esc): 캐릭터 · 판 · 일섬의 형태 · 무기 · 더 켤 것 · 연습 장면을 눌러 고르고 "이 판으로 열기"를 누르면 그 주소로 연다.
// 목록과 주소는 modes.js(순수). 여기는 화면에 붙이는 일만 한다 — 수치 패널(tunePanel.js)과 같은 식의 DOM 판이고 판(sim)은 건드리지 않는다.
// 단추는 초점을 받지 않는다: 누른 뒤 Space(회피)나 Enter가 단추를 다시 누르는 일이 없게.
import { readModes, modeQuery, shownGroups, shownItems } from './modes.js';

export const MODE_PANEL_W = 320;   // 판의 너비(px) — 멈춤 안내가 이만큼 비켜서 그려진다(hud.js의 ui.insetLeft)

const CSS = {
  root: 'position:fixed;top:0;left:0;width:' + MODE_PANEL_W + 'px;max-height:100%;overflow:auto;background:rgba(20,19,26,0.95);color:#e8e6ef;font:13px system-ui,"Malgun Gothic",sans-serif;padding:12px 14px 14px;display:none;z-index:9;box-sizing:border-box;border-right:1px solid #3d394a',
  title: 'font-weight:700;font-size:15px;margin-bottom:2px',
  hint: 'color:#9a96a8;font-size:12px;margin-bottom:6px',
  head: 'margin:12px 0 5px;color:#9a96a8;font-size:12px',
  row: 'display:flex;flex-wrap:wrap;gap:5px',
  chip: 'padding:5px 9px;background:#2b2733;color:#e8e6ef;border:1px solid #3d394a;border-radius:4px;cursor:pointer;font:inherit',
  chipOn: 'padding:5px 9px;background:#123c42;color:#9ff4ff;border:1px solid #37d6e0;border-radius:4px;cursor:pointer;font:inherit;font-weight:700',
  go: 'margin-top:14px;width:100%;padding:9px;background:#37d6e0;color:#10151a;border:0;border-radius:4px;cursor:pointer;font:inherit;font-weight:700',
  goOff: 'margin-top:14px;width:100%;padding:9px;background:#2b2733;color:#9a96a8;border:1px solid #3d394a;border-radius:4px;cursor:default;font:inherit',
  addr: 'margin-top:8px;color:#9a96a8;font:11px monospace;word-break:break-all',
  copy: 'margin-top:6px;padding:4px 8px;background:#2b2733;color:#e8e6ef;border:1px solid #3d394a;border-radius:4px;cursor:pointer;font:12px system-ui,"Malgun Gothic",sans-serif',
};

// query = 지금 주소의 옵션, open(q) = 그 옵션 줄로 연다(시험·다른 틀에서 바꿔 낄 수 있게)
export function createModePanel({ query = new URLSearchParams(location.search), open = q => { location.href = location.pathname + (q ? '?' + q : ''); } } = {}) {
  const sel = readModes(query), now = modeQuery(sel, query);
  const root = document.createElement('div');
  root.style.cssText = CSS.root;
  const el = (tag, css, text) => { const e = document.createElement(tag); e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const button = (css, text, onClick) => {
    const b = el('button', css, text);
    b.tabIndex = -1;
    b.addEventListener('mousedown', e => e.preventDefault());   // 초점을 받지 않는다
    b.addEventListener('click', () => { onClick(); b.blur(); });
    return b;
  };
  function render() {
    root.replaceChildren(el('div', CSS.title, '판 고르기'), el('div', CSS.hint, '눌러서 고르고 아래 단추로 엽니다 · Esc = 닫고 이어 하기'));
    for (const g of shownGroups(sel)) {
      root.append(el('div', CSS.head, g.title));
      const row = el('div', CSS.row);
      for (const [v, name] of shownItems(g, sel)) {
        const on = g.many ? sel.try.includes(v) : sel[g.id] === v;
        row.append(button(on ? CSS.chipOn : CSS.chip, name, () => {
          if (g.many) sel.try = on ? sel.try.filter(x => x !== v) : [...sel.try, v];
          else sel[g.id] = v;
          render();
        }));
      }
      root.append(row);
    }
    const q = modeQuery(sel, query), same = q === now;
    root.append(button(same ? CSS.goOff : CSS.go, same ? '지금 이 판입니다' : '이 판으로 열기', () => { if (!same) open(q); }));
    root.append(el('div', CSS.addr, q ? '?' + q : '(기본 판 — 주소에 붙는 것 없음)'));
    root.append(button(CSS.copy, '주소 복사', () => { navigator.clipboard?.writeText(location.origin + location.pathname + (q ? '?' + q : '')).catch(() => {}); }));
  }
  render();
  document.body.append(root);
  let shown = false;
  return {
    show(on) { if (on === shown) return; shown = on; root.style.display = on ? 'block' : 'none'; },
    get shown() { return shown; },
    root,
  };
}
