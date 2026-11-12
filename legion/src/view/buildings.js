// 자원 자리·건물·광부 조 표식 그리기(3단계 계획 Task 8, 설계서 §5 "알아보기": 멀리서도 윤곽·색으로 갈리게, 지붕·깃발은 편 색).
// 자원 자리는 늘(위에 채굴기가 서면 숨긴다), 건물은 생기면 모양을 만들고 사라지면 치운다(잔해 원 ruinSeconds초). 짓는 중이면 진행만큼 자라고 비계가 둘러싼다.
// 띠(체력·일)와 광부 조 망치 표식은 HTML(화면에서 늘 같은 크기). 좌표: sim (x, z) → three (x, 높이, −z). 수치는 LOOK 한곳.
import * as THREE from 'three';
import { SIDE_COLORS } from './colors.js';
import { barsOf } from './buildingBars.js';
import { crewMarks } from './crewMarks.js';

const LOOK = {
  stone: 0xc9c1ae, darkStone: 0x8f877a, wood: 0x8a6a43, darkWood: 0x5e4630, plank: 0xc9a56b, iron: 0x6b6f76, dirt: 0x8f7a55,
  gold: 0xf2c14e, mana: 0x7fd3ff, scaffold: 0xd8c9a0, ruin: 0x4a4640,
  ruinSeconds: 10, growMin: 0.25,                  // 짓는 중: 높이 = growMin + (1 − growMin) × 진행
  select: { color: 0xffffff, width: 1.2, gap: 1.5 },
  rally: { pole: 6, color: 0xffffff, line: 0xffffff },
  bars: { maxH: 520, lift: 4, width: 44 },          // 띠: 카메라가 이보다 낮을 때만, 건물 위 lift m, 폭 px
  marks: { maxH: 2000, lift: 3.5, size: 20 },       // 망치 표식: 늘(maxH 아래), 광부 위 lift m, 지름 px
  ghost: { opacity: 0.45, bad: 0x802010 },          // 짓기 유령(4단계): 반투명, 놓을 수 없으면 붉은빛
};

const toV = (x, y, z) => new THREE.Vector3(x, y, -z);
const mats = new Map();
const mat = (color, extra = null) => { const key = `${color}|${extra ? JSON.stringify(extra) : ''}`; if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...(extra ?? {}) })); return mats.get(key); };
const mesh = (geo, color, x, y, z, extra) => { const m = new THREE.Mesh(geo, mat(color, extra)); m.position.set(x, y, z); return m; };
const box = (w, h, d, color, x = 0, y = h / 2, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);

// 박공지붕(세모 기둥): 폭 w, 높이 h, 길이 len(x 방향), 밑이 y.
function gable(w, h, len, color, y) {
  const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2).rotateY(Math.PI / 2);
  return mesh(g, color, 0, y, 0);
}
function flagPole(color, x, z, h = 9) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, h, 6), LOOK.darkWood, x, h / 2, z));
  g.add(box(2.6, 1.6, 0.12, color, x + 1.3, h - 0.9, z));
  return g;
}

// ── 자원 자리 ──
function goldSpot() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(4.6, 5, 0.4, 16), LOOK.dirt, 0, 0.2, 0));
  [[0, 0, 1.3], [1.9, 0.8, 0.9], [-1.7, 1.1, 1], [0.6, -1.9, 0.85], [-1.2, -1.4, 0.75]].forEach(([x, z, r]) => g.add(mesh(new THREE.DodecahedronGeometry(r, 0), LOOK.gold, x, 0.4 + r * 0.7, z, { emissive: 0x3a2a00 })));
  return g;
}
function woodSpot() {
  const g = new THREE.Group();
  [[-2.5, -1.5], [2.2, -2], [0.5, 2.6]].forEach(([x, z]) => g.add(mesh(new THREE.CylinderGeometry(0.75, 0.9, 1, 8), LOOK.wood, x, 0.5, z)));
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.2, 8).rotateZ(Math.PI / 2), LOOK.plank, 0, 0.5 + k * 0.85, 0.5 * (k % 2) - 0.2));
  return g;
}
function manaSpot() {
  const g = new THREE.Group();
  [[0, 0, 3.2], [1.7, 1, 2.2], [-1.5, 1.2, 2]].forEach(([x, z, h]) => {
    const c = mesh(new THREE.OctahedronGeometry(1, 0).scale(0.8, h / 2, 0.8), LOOK.mana, x, h / 2, z, { emissive: 0x1d5f80 });
    c.rotation.z = x * 0.08; g.add(c);
  });
  return g;
}
const SPOT = { gold: goldSpot, wood: woodSpot, mana: manaSpot };

// ── 건물(발자국 반지름 안에 들게) ──
export function castle(color) {
  const g = new THREE.Group(), roof = mat(color);
  g.add(box(18, 8, 18, LOOK.stone));
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
    g.add(mesh(new THREE.CylinderGeometry(2.2, 2.4, 12, 8), LOOK.stone, x, 6, z));
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4, 8), roof); c.position.set(x, 14, z); g.add(c);
  }
  g.add(box(8, 14, 8, LOOK.stone));
  const kr = new THREE.Mesh(new THREE.ConeGeometry(6, 6, 4), roof); kr.position.y = 17; kr.rotation.y = Math.PI / 4; g.add(kr);
  return g;
}
function goldmine(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(4, 4.4, 1.2, 10), LOOK.dirt, 0, 0.6, 0));               // 흙 둔덕
  for (const s of [-1, 1]) for (const z of [-1.4, 1.4]) { const beam = box(0.6, 7.4, 0.6, LOOK.wood, s * 1.6, 4.2, z); beam.rotation.z = s * 0.42; g.add(beam); }   // ㅅ자 갱도 틀 둘
  g.add(box(0.5, 0.5, 3.6, LOOK.wood, 0, 7.4, 0));
  g.add(gable(4.4, 1.6, 3.8, color, 6.9));                                                         // 편 색 갱도 지붕
  g.add(box(2.8, 3, 0.3, 0x2a2622, 0, 2.6, 1.7));                                                  // 갱도 입구(어둠)
  [[2.6, -2, 1.1], [3.2, -0.4, 0.8], [1.8, -3.1, 0.75], [-2.8, -2.4, 0.9]].forEach(([x, z, r]) => g.add(mesh(new THREE.DodecahedronGeometry(r, 0), LOOK.gold, x, 1.2 + r * 0.7, z, { emissive: 0x3a2a00 })));
  return g;
}
function lumbermill(color) {
  const g = new THREE.Group();
  g.add(box(6.4, 3.6, 4.6, LOOK.plank, 0, 1.8, -0.8));
  g.add(gable(5.8, 3, 7.2, color, 3.6));
  for (let k = 0; k < 4; k++) g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 6, 8).rotateZ(Math.PI / 2), LOOK.wood, 0, 0.55 + Math.floor(k / 2) * 0.95, 2.5 + (k % 2) * 1.1 - Math.floor(k / 2) * 0.55));   // 통나무 더미
  g.add(mesh(new THREE.CylinderGeometry(2, 2, 0.2, 24).rotateX(Math.PI / 2), LOOK.iron, 3.6, 2.2, -0.8));   // 둥근 톱
  return g;
}
function manawell(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.4, 24), color, 0, 0.2, 0));
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.add(box(0.8, 3.4 + (k % 2) * 0.8, 0.8, LOOK.darkStone, Math.cos(a) * 3, 1.9, Math.sin(a) * 3)); }
  g.add(mesh(new THREE.SphereGeometry(1.1, 16, 12), LOOK.mana, 0, 3.6, 0, { emissive: 0x3aa0d0 }));
  return g;
}
function barracks(color) {
  const g = new THREE.Group();
  g.add(box(13, 4.4, 6.6, LOOK.plank));
  g.add(gable(7.6, 3.2, 14, color, 4.4));
  g.add(box(2, 2.6, 0.2, LOOK.darkWood, 0, 1.3, 3.35));
  g.add(flagPole(color, -5.6, 4.4, 10), flagPole(color, 5.6, 4.4, 10));
  return g;
}
function stable(color) {
  const g = new THREE.Group();
  g.add(box(14, 2.8, 8, LOOK.wood));
  g.add(gable(9, 1.8, 15, color, 2.8));
  for (let k = 0; k < 10; k++) { const x = -7 + k * 14 / 9; g.add(box(0.3, 1.4, 0.3, LOOK.darkWood, x, 0.7, 6)); }   // 울타리 말뚝
  g.add(box(14, 0.18, 0.18, LOOK.darkWood, 0, 1.1, 6));
  return g;
}
function workshop(color) {
  const g = new THREE.Group();
  g.add(box(10, 5.4, 9, LOOK.darkStone));
  g.add(box(10.6, 0.6, 9.6, color, 0, 5.7, 0));
  g.add(box(1.6, 11, 1.6, LOOK.stone, 3.4, 5.5, -2.8));                                       // 높은 굴뚝
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 8, 18), mat(LOOK.wood)); wheel.position.set(-3, 2.8, 4.8); g.add(wheel);   // 큰 나무 바퀴
  g.add(box(0.3, 4.6, 0.3, LOOK.wood, -3, 2.8, 4.8));
  return g;
}
const MODEL = { citadel: castle, goldmine, lumbermill, manawell, barracks, stable, workshop };

export function createBuildings(view, world) {
  const scene = view.scene, H = (x, z) => view.heightAt(x, z), map = world.map;
  // 자원 자리
  const spots = map.deposits.map(d => { const g = SPOT[d.kind](); g.position.copy(toV(d.x, H(d.x, d.z), d.z)); scene.add(g); return g; });
  // 건물
  const shown = new Map(), ruins = [];
  const scaffoldMat = new THREE.MeshBasicMaterial({ color: LOOK.scaffold, wireframe: true });
  function add(b) {
    const g = (MODEL[b.type] ?? barracks)(SIDE_COLORS[b.side]);
    if (b.side === 1) g.rotation.y = Math.PI;                       // 몬스터 쪽은 아래(제 편 반대쪽)를 본다
    const root = new THREE.Group(); root.add(g);
    root.position.copy(toV(b.x, H(b.x, b.z), b.z));
    const scaffold = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.95, b.r * 0.95, 1, 8, 3, true), scaffoldMat);
    root.add(scaffold);
    scene.add(root);
    shown.set(b.id, { b, root, model: g, scaffold });
  }
  // 고른 건물: 발밑 고리, 집결지 깃발·선
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1 + LOOK.select.width / 10, 48), new THREE.MeshBasicMaterial({ color: LOOK.select.color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 7; ring.visible = false; scene.add(ring);
  const rallyFlag = new THREE.Group();
  rallyFlag.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, LOOK.rally.pole, 6), LOOK.darkWood, 0, LOOK.rally.pole / 2, 0), box(2, 1.3, 0.1, LOOK.rally.color, 1, LOOK.rally.pole - 0.7, 0));
  rallyFlag.visible = false; scene.add(rallyFlag);
  const rallyLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: LOOK.rally.line, dashSize: 3, gapSize: 2, depthTest: false, transparent: true, opacity: 0.85 }));
  rallyLine.renderOrder = 7; rallyLine.visible = false; scene.add(rallyLine);

  // HTML 겹: 띠와 망치 표식
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3';
  document.body.appendChild(layer);
  const bars = new Map(), marks = new Map();
  function barEl(id) {
    let el = bars.get(id);
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = `position:absolute;width:${LOOK.bars.width}px;transform:translate(-50%,-100%);display:flex;flex-direction:column;gap:2px`;
      el.innerHTML = '<div class="hp" style="height:4px;background:#3a3a36;border-radius:2px;overflow:hidden"><i style="display:block;height:100%;background:#4caf50"></i></div><div class="wk" style="height:4px;background:#3a3a36;border-radius:2px;overflow:hidden"><i style="display:block;height:100%;background:#7fd3ff"></i></div>';
      layer.appendChild(el); bars.set(id, el);
    }
    return el;
  }
  function markEl(key) {
    let el = marks.get(key);
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = `position:absolute;width:${LOOK.marks.size}px;height:${LOOK.marks.size}px;transform:translate(-50%,-50%);border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:700 12px/1 "Segoe UI Symbol",sans-serif`;
      el.textContent = '⚒';
      layer.appendChild(el); marks.set(key, el);
    }
    return el;
  }

  // seeAt(x, z): 안개일 때 편 0이 보는 곳인가(없으면 다 보인다). selectedId: 고른 건물 id(없으면 −1).
  function update(w, seeAt = null, selectedId = -1) {
    const live = new Set();
    for (const b of w.buildings) {
      if (!b.alive) continue;
      live.add(b.id);
      if (!shown.has(b.id)) add(b);
      const it = shown.get(b.id), seen = b.side === 0 || !seeAt || seeAt(b.x, b.z);
      it.root.visible = seen;
      const k = b.done ? 1 : LOOK.growMin + (1 - LOOK.growMin) * b.progress;
      it.model.scale.y = k;
      it.scaffold.visible = !b.done;
      if (!b.done) { const h = 9 * k; it.scaffold.scale.set(1, h, 1); it.scaffold.position.y = h / 2; }
    }
    for (const [id, it] of shown) if (!live.has(id)) {                // 무너졌다: 잔해 원
      scene.remove(it.root);
      const r = new THREE.Mesh(new THREE.CircleGeometry(it.b.r, 20), new THREE.MeshBasicMaterial({ color: LOOK.ruin, transparent: true, opacity: 0.8, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.copy(toV(it.b.x, H(it.b.x, it.b.z) + 0.3, it.b.z)); scene.add(r);
      ruins.push({ mesh: r, at: w.time });
      shown.delete(id);
      bars.get(id)?.remove(); bars.delete(id);
    }
    for (let k = ruins.length - 1; k >= 0; k--) {
      const age = w.time - ruins[k].at;
      if (age > LOOK.ruinSeconds || age < 0) { scene.remove(ruins[k].mesh); ruins[k].mesh.geometry.dispose(); ruins[k].mesh.material.dispose(); ruins.splice(k, 1); }
      else ruins[k].mesh.material.opacity = 0.8 * (1 - age / LOOK.ruinSeconds);
    }
    map.deposits.forEach((d, k) => { spots[k].visible = w.depositUse[d.id] < 0; });

    // 고른 건물
    const sel = selectedId >= 0 ? w.buildingById.get(selectedId) : null;
    ring.visible = !!sel;
    if (sel) { ring.position.copy(toV(sel.x, H(sel.x, sel.z) + 0.4, sel.z)); ring.scale.setScalar(sel.r + LOOK.select.gap); }
    const rally = sel?.rally;
    rallyFlag.visible = rallyLine.visible = !!rally;
    if (rally) {
      rallyFlag.position.copy(toV(rally.x, H(rally.x, rally.z), rally.z));
      rallyLine.geometry.setFromPoints([toV(sel.x, H(sel.x, sel.z) + 1, sel.z), toV(rally.x, H(rally.x, rally.z) + 1, rally.z)]);
      rallyLine.computeLineDistances();
    }

    // 띠
    const near = view.cam.h < LOOK.bars.maxH;
    for (const b of w.buildings) {
      if (!b.alive) continue;
      const v = barsOf(b, w.time), it = shown.get(b.id), el = barEl(b.id);
      const show = near && it?.root.visible && (v.hp !== null || v.work !== null);
      const p = show ? view.worldToScreen(b.x, b.z, H(b.x, b.z) + 12 + LOOK.bars.lift) : null;
      if (!p || p.behind) { el.style.display = 'none'; continue; }
      el.style.display = 'flex'; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
      const [hp, wk] = el.children;
      hp.style.display = v.hp === null ? 'none' : ''; hp.firstChild.style.width = `${(v.hp ?? 0) * 100}%`;
      hp.firstChild.style.background = (v.hp ?? 1) > 0.5 ? '#4caf50' : (v.hp ?? 1) > 0.25 ? '#f2c14e' : '#e0533c';
      wk.style.display = v.work === null ? 'none' : ''; wk.firstChild.style.width = `${(v.work ?? 0) * 100}%`;
      wk.firstChild.style.background = v.kind === 'build' ? '#d8c9a0' : v.kind === 'research' ? '#c77dff' : '#7fd3ff';
    }

    // 광부 조 망치 표식(우리 조는 노랑 — 쉬면 꽉 찬, 일하면 테두리만; 적 조는 보일 때 편 색 테두리)
    const used = new Set(), showMarks = view.cam.h < LOOK.marks.maxH;
    for (const side of [0, 1]) for (const m of crewMarks(w, side)) {
      if (!showMarks || (side !== 0 && seeAt && !seeAt(m.x, m.z))) continue;
      const key = `${side}:${m.crew}`, p = view.worldToScreen(m.x, m.z, H(m.x, m.z) + LOOK.marks.lift);
      if (p.behind) continue;
      used.add(key);
      const el = markEl(key), color = side === 0 ? '#f2c14e' : '#' + SIDE_COLORS[1].toString(16).padStart(6, '0');
      el.style.display = 'flex'; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
      el.style.background = side === 0 && m.idle ? color : 'rgba(44,44,42,.55)';
      el.style.border = `2px solid ${side === 0 && m.idle ? '#2c2c2a' : color}`;
      el.style.color = side === 0 && m.idle ? '#2c2c2a' : color;
    }
    for (const [key, el] of marks) if (!used.has(key)) el.style.display = 'none';
  }
  // 짓기 유령(4단계): 놓는 동안 그 건물 모양이 반투명하게 따라다닌다. g = { type, side, x, z, ok } 또는 null.
  let ghost = null, ghostKey = '', ghostOk = null;
  function setGhost(g) {
    if (!g) { if (ghost) ghost.visible = false; return; }
    const key = `${g.type}|${g.side}`;
    if (key !== ghostKey) {
      if (ghost) { scene.remove(ghost); ghost.traverse(o => { if (o.isMesh) { o.material.dispose(); o.geometry.dispose(); } }); }
      const model = (MODEL[g.type] ?? barracks)(SIDE_COLORS[g.side]);
      model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = LOOK.ghost.opacity; o.material.depthWrite = false; o.userData.baseEmissive = o.material.emissive?.getHex() ?? 0; } });
      if (g.side === 1) model.rotation.y = Math.PI;
      ghost = new THREE.Group(); ghost.add(model); ghost.renderOrder = 6; scene.add(ghost);
      ghostKey = key; ghostOk = null;
    }
    ghost.visible = true;
    ghost.position.copy(toV(g.x, H(g.x, g.z), g.z));
    if (ghostOk !== g.ok) { ghostOk = g.ok; ghost.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(g.ok ? o.userData.baseEmissive : LOOK.ghost.bad); }); }   // 되면 모형 제 빛으로
  }
  return { update, layer, setGhost };
}
