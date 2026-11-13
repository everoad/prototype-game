// 군단 영지 진입점: 게임 판(2단계 — 지도·땅·소굴, src/sim/game.js)과 시험 장면(src/sim/labs.js — 황금 시험과 같은 장면)을 화면에서 돌린다.
// URL: scene(game 또는 시험 장면 이름, 기본 game — 모르는 이름이면 game), demo(1 = 게임 판에서 편 0 시범 행동), seed, speed, cam(x,z,높이), yaw(시점 돌림 도), fog(1 = 안개),
// skip(처음 몇 초를 화면 없이), raf(timer = 화면을 rAF 대신 타이머로 — 숨은 창에서 시험), record(초)·fps(녹화, tools/record.ps1).
import { createWorld, advance, step } from '../sim/world.js';
import { spawn } from '../sim/soldiers.js';
import { applyOrder } from '../sim/orders.js';
import { canSee } from '../sim/vision.js';
import { LABS, makeApi, actionRunner } from '../sim/labs.js';
import { setupGame, demoActions, showcaseActions } from '../sim/game.js';
import { createLand } from './land.js';
import { createBuildings } from './buildings.js';
import { idleCrews } from './select.js';
import { lastAlert } from './alerts.js';
import { createScene } from './scene.js';
import { createCrowd } from './crowd.js';
import { createCatapults } from './catapults.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { record } from './recorder.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
if (q.get('raf') === 'timer') window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);   // 시험용: 숨은 창에서는 rAF가 멈춘다
const names = ['game', ...Object.keys(LABS)];
const sceneName = names.includes(q.get('scene')) ? q.get('scene') : 'game';
const GAME = sceneName === 'game';
const seed = num('seed', 1);
let gameSpeed = num('speed', 1), paused = false;

// 장면의 행동(때가 되면 보내기·스킬)은 틱마다 명령 앞에서 돈다 — 황금 시험(runLab)과 같은 차례
const world = createWorld({ seed, ...(GAME ? { map: 'legion' } : {}) });
world.labName = sceneName;
const api = makeApi({ createWorld, step, spawn, applyOrder });
let hud;
const failToast = reason => (hud ? hud.toast(reason) : console.warn(reason));   // 사용자가 먼저 건 스킬과 겹쳐 장면 행동이 거절되면 알리고 이어 간다
if (GAME) setupGame(world);
const actions = GAME ? (q.get('demo') === '1' ? demoActions(world, api) : q.get('showcase') === '1' ? showcaseActions(world, api) : []) : LABS[sceneName].setup(world, api);   // showcase: 특수 병종 보여 주기(6-1단계)
const due = actionRunner(actions, failToast);
if (actions.length) world.controllers[0] = { think: w => { due(w, api); return []; } };
for (const until = num('skip', 0); world.time < until;) step(world);   // 녹화 앞부분 건너뛰기

// 안개(fog=1): 편 0의 시야만 그린다. 시험 장면은 기본으로 끈다.
const fogOn = q.get('fog') === '1';
const seeAt = fogOn ? (x, z) => canSee(world, 0, x, z) : null;
const visibleSoldier = fogOn ? i => world.soldiers.side[i] === 0 || canSee(world, 0, world.soldiers.x[i], world.soldiers.z[i]) : null;

const canvas = document.getElementById('view');
const recording = q.has('record');
const view = createScene(canvas, world.map, { preserveDrawingBuffer: recording });
const crowd = createCrowd(view, world.rules, world.soldiers.capacity);
const catapults = createCatapults(view, world.rules);
Object.assign(view.cam, GAME ? { tx: 600, tz: 170, h: 300 } : { tx: 600, tz: 250, h: 230 });   // 게임 판 = 우리 본진 앞, 시험 장면 = 빈 들판 x 470–730, z 150–340
const land = world.map.regions ? createLand(view, world) : null;
const buildings = world.map.regions ? createBuildings(view, world) : null;   // 자원 자리·건물·광부 조 표식(3단계)
if (q.has('cam')) { const [tx, tz, h] = q.get('cam').split(',').map(Number); Object.assign(view.cam, { tx, tz, h }); }
if (q.has('yaw')) view.cam.yaw = num('yaw', -45) * Math.PI / 180;
if (q.has('pitch') && Number.isFinite(num('pitch', 45))) view.cam.pitch = Math.min(70, Math.max(30, num('pitch', 45)));   // 기울기(도, 30~70)
// 키 할 일 가운데 화면 전체에 닿는 것(4단계): ` = 쉬는 광부 조, Space = 마지막 알림 자리
function pickIdleCrews() { const ids = idleCrews(world, 0); if (ids.length) { input.selectIds(ids); hud.toast(`쉬는 광부 조 ${ids.length}명`); } else hud.toast('쉬는 광부 조가 없다'); }
function goLastAlert() { const a = lastAlert(world, 0); if (a) Object.assign(view.cam, { tx: a.x, tz: a.z }); else hud.toast('알림이 없다'); }
const onKey = a => { if (a.kind === 'idleCrews') pickIdleCrews(); else if (a.kind === 'lastAlert') goLastAlert(); };
const input = createInput(view, canvas, () => world, 0, { onOrder: o => applyOrder(world, o), toast: t => hud.toast(t), canSee: seeAt, onKey, onGhost: g => buildings?.setGhost(g) });
const drawCrowd = alpha => { crowd.update(world, alpha, visibleSoldier, seeAt, input.selectedFlags(), input.preview?.() ?? null); catapults.update(world, alpha, visibleSoldier, seeAt, input.selectedFlags()); };   // 고른 병사는 밝게, 겨누는 스킬에 걸릴 병사는 그 빛깔로

function reloadWith(next) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(next)) p.set(k, String(v));
  location.search = p.toString();
}
hud = createHud({
  labs: names, scene: sceneName, speed: gameSpeed, onScene: name => reloadWith({ scene: name }), onRestart: () => reloadWith({ scene: sceneName }),
  onSpeed: v => { gameSpeed = v; }, onPause: () => (paused = !paused),
  getSelection: () => input.selection(), onPickType: (t, drop) => input.pickType(t, drop),
  onMinimap: (x, z) => Object.assign(view.cam, { tx: x, tz: z }), getFootprint: () => view.footprint(), seeAt,
  onAim: o => input.aim(o), getAim: () => input.aiming(),
  getBuilding: () => input.selectedBuilding(), getPlacing: () => input.placing(), onPlace: type => input.startPlace(type),
  onStop: () => input.stopNow(), onAttackMove: () => input.startAttackMove(), getAttackMove: () => input.attackMove(),
  getGroups: () => input.groupList(), onGroup: n => input.selectGroup(n), onMinimapSend: (x, z, alt) => input.sendTo(x, z, alt),
  onOrder: o => { const r = applyOrder(world, o); if (!r.ok) hud.toast(r.reason); return r; },
  onIdleCrews: pickIdleCrews,
});

function syncLook() {
  view.setFog(fogOn ? world.vision : null, 0);
  view.setCasts(world.casts, world.time, seeAt);           // 지휘 스킬 원(번쩍임·남은 시간)
  land?.update(world, seeAt);                              // 땅: 주인 선·깃발·점령 호(안개면 보이는 깃발만)·소굴·이름표
  buildings?.update(world, seeAt, input.selectedBuilding()); // 건물·띠·광부 조 표식, 고른 건물 고리·집결지
}

let last = performance.now(), frames = 0, fpsAt = last, fps = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) advance(world, dt * gameSpeed, 5 * gameSpeed);
  drawCrowd(Math.min(1, world.acc / world.rules.dt));
  syncLook();
  view.render();
  frames++;
  if (now - fpsAt >= 1000) { fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; window.legion.fps = fps; }
  hud.update(world, fps);
  requestAnimationFrame(frame);
}
window.legion = { world, view, crowd, hud, input, buildings, scene: sceneName, setSpeed: v => { gameSpeed = v; } };
if (recording) {
  hud.root.style.display = 'none';
  record({ world, view, crowd, canvas, drawCrowd, beforeFrame: syncLook, seconds: num('record', 30), fps: num('fps', 30), speed: gameSpeed, fixedCam: q.has('cam') ? { ...view.cam } : null });
} else requestAnimationFrame(frame);
