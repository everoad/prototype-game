// 수치 패널(F2, §8): 연출·카메라 수치와 몇몇 판정 수치를 밀대로 바로 바꾼다(값은 쓸 때마다 읽으니 다음 틱·다음 장부터 먹는다).
// "복사" = 기본값과 달라진 것만 JSON으로 — 원격의 사용자가 고른 값을 그대로 받아 look.js·rules.js에 넣는다.
export const TUNE_FIELDS = (LOOK, RULES) => [
  ['손맛', LOOK.feel.parryBullet, 'shakePx', 0, 20, 1, '탄 패링 흔들림 px'],
  ['손맛', LOOK.feel.perfectBullet, 'stop', 0, 0.15, 0.01, '완벽 탄 패링 정지 초'],
  ['손맛', LOOK.feel.perfectBullet, 'slow', 0.1, 1, 0.05, '완벽 느려짐 배율'],
  ['손맛', LOOK.feel.perfectBullet, 'slowSec', 0, 0.4, 0.02, '완벽 느려짐 초'],
  ['손맛', LOOK.feel.perfectBullet, 'punch', 0, 0.08, 0.005, '완벽 순간 확대'],
  ['손맛', LOOK.feel.parryMelee, 'stop', 0, 0.15, 0.01, '근접 패링 정지 초'],
  ['손맛', LOOK.feel.hurt, 'stop', 0, 0.15, 0.01, '맞음 정지 초'],
  ['손맛', LOOK.feel.hurt, 'shakePx', 0, 30, 1, '맞음 흔들림 px'],
  ['손맛', LOOK.feel.budget, 'max', 0, 0.4, 0.01, '정지 예산(1초당 초)'],
  ['보이기', LOOK.sizes, 'ringAlpha', 0, 1, 0.05, '패링 고리 밝기'],
  ['보이기', LOOK.sizes, 'shotAlpha', 0, 1, 0.05, '플레이어 탄 밝기'],
  ['카메라', LOOK.camera, 'minW', 14, 34, 1, '가장 당김 가로 U'],
  ['카메라', LOOK.camera, 'maxW', 22, 44, 1, '가장 밈 가로 U'],
  ['카메라', LOOK.camera, 'deadPos', 0, 3, 0.1, '가만히: 가운데 U'],
  ['카메라', LOOK.camera, 'deadW', 0, 5, 0.1, '가만히: 가로 U'],
  ['카메라', LOOK.camera, 'zoomInHold', 0, 3, 0.1, '당기기 전 머묾 초'],
  ['카메라', LOOK.camera, 'posRate', 1, 20, 0.5, '따라가기 /s'],
  ['카메라', LOOK.camera, 'zoomOutRate', 1, 20, 0.5, '밀기 /s'],
  ['카메라', LOOK.camera, 'zoomInRate', 0.2, 10, 0.1, '당기기 /s'],
  ['판정', RULES.parry, 'window', 0.1, 0.5, 0.01, '패링 창 초'],
  ['판정', RULES.parry, 'perfect', 0.03, 0.3, 0.01, '완벽 창 초'],
  ['판정', RULES.bullets, 'parrySpeed', 6, 24, 0.5, '흰·금 탄 U/s'],
  ['판정', RULES.dodge, 'dist', 2, 8, 0.1, '회피 거리 U'],
  ['판정', RULES.dodge, 'dur', 0.1, 0.5, 0.01, '회피 시간 초'],
  ['판정', RULES.dodge, 'front', 0.5, 0.95, 0.01, '회피 앞 절반 몫'],
  ['판정', RULES.player, 'speed', 4, 14, 0.1, '이동 U/s'],
  ['판정', RULES.reflect, 'hold', 0, 0.2, 0.01, '받은 탄 멈춤 초'],
].map(([group, obj, key, min, max, step, label]) => ({ group, obj, key, min, max, step, label, path: `${group === '판정' ? 'RULES' : 'LOOK'}.${pathOf(LOOK, RULES, obj)}.${key}` }));

function pathOf(LOOK, RULES, obj) {
  for (const [root, name] of [[LOOK, 'LOOK'], [RULES, 'RULES']]) {
    const hit = find(root, obj, []);
    if (hit) return hit.join('.');
  }
  return '?';
  function find(o, target, trail) {
    for (const [k, v] of Object.entries(o)) {
      if (v === target) return [...trail, k];
      if (v && typeof v === 'object' && !Array.isArray(v) && trail.length < 3) { const r = find(v, target, [...trail, k]); if (r) return r; }
    }
    return null;
  }
}

export function createTunePanel({ LOOK, RULES, fields = TUNE_FIELDS(LOOK, RULES), onChange = null }) {
  const base = new Map(fields.map(f => [f, f.obj[f.key]]));
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;top:0;right:0;width:300px;max-height:100%;overflow:auto;background:rgba(20,19,26,0.94);color:#e8e6ef;font:12px system-ui,"Malgun Gothic",sans-serif;padding:10px 12px;display:none;z-index:10;box-sizing:border-box';
  root.innerHTML = '<div style="font-weight:700;margin-bottom:6px">수치 패널 (F2)</div>';
  let group = '';
  for (const f of fields) {
    if (f.group !== group) { group = f.group; const h = document.createElement('div'); h.textContent = group; h.style.cssText = 'margin:10px 0 4px;color:#9a96a8'; root.append(h); }
    const row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 46px;gap:2px 6px;margin:3px 0';
    const name = document.createElement('span'); name.textContent = f.label;
    const val = document.createElement('span'); val.style.textAlign = 'right';
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: f.min, max: f.max, step: f.step, value: f.obj[f.key] });
    input.style.gridColumn = '1 / 3';
    const show = () => { val.textContent = (+f.obj[f.key]).toFixed(f.step < 0.01 ? 3 : f.step < 1 ? 2 : 0); };
    input.addEventListener('input', () => { f.obj[f.key] = Number(input.value); show(); onChange?.(f); });
    input.addEventListener('keydown', e => e.stopPropagation());
    show();
    row.append(name, val, input);
    root.append(row);
  }
  const out = document.createElement('textarea');
  out.style.cssText = 'width:100%;height:90px;margin-top:8px;background:#0e0d12;color:#e8e6ef;border:1px solid #3d394a;font:11px monospace';
  const btn = document.createElement('button');
  btn.textContent = '바뀐 값 복사';
  btn.style.cssText = 'margin-top:8px;width:100%;padding:6px;background:#2b2733;color:#e8e6ef;border:1px solid #3d394a;cursor:pointer';
  btn.addEventListener('click', () => {
    const changed = {};
    for (const f of fields) if (f.obj[f.key] !== base.get(f)) changed[f.path] = f.obj[f.key];
    out.value = JSON.stringify(changed, null, 1);
    navigator.clipboard?.writeText(out.value).catch(() => {});
  });
  root.append(btn, out);
  document.body.append(root);
  return {
    toggle() { root.style.display = root.style.display === 'none' ? 'block' : 'none'; return root.style.display === 'block'; },
    changed() { const c = {}; for (const f of fields) if (f.obj[f.key] !== base.get(f)) c[f.path] = f.obj[f.key]; return c; },
    root,
  };
}
