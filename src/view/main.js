// 시험판 진입점. URL 인자: seed, scale, production, damage, scene(battle|clash|raid|cav), kind(cav: open|wall|anvil), mirror, speed, ai(both), aip·aip0(몬스터·우리 AI 성향 aggressive|careful|raider), cam(x,z,높이), yaw(시점 돌림 도),
// autohold(1 = 경보 3초 뒤 막아라 — 녹화용), skip(처음 몇 초를 화면 없이 돌림), raidAt(기습이 나오는 판 시각 초, scene=raid),
// raf(timer = 화면을 rAF 대신 타이머로 — 숨은 창에서 시험), demo(raid = sendAt초에 우리 기병이 오른쪽 가장자리로 돌아 적 뒤 거점 기습 — 녹화용, general = 장수 별동대 시연, send = sendAt초에 왼쪽 구역 병사를 적 앞 거점 f1L로 보내기 — 녹화용), commandLimit, commandCooldown.
import { createWorld, advance, step } from '../sim/world.js';
import { spawnClash, spawnRaid, spawnCavLab, spawnCounterLab } from '../sim/scenarios.js';
import { makeAi } from '../sim/ai.js';
import { makeRng } from '../sim/rng.js';
import { arrowOf, wallStanding } from '../sim/production.js';
import { createScene } from './scene.js';
import { createCrowd } from './crowd.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { record } from './recorder.js';
import { applyOrder } from '../sim/orders.js';
import { canSee, knownBuildings } from '../sim/vision.js';
import { makeStats } from '../sim/stats.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
if (q.get('raf') === 'timer') window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);   // 시험용: 숨은 창에서는 rAF가 멈춘다
const sceneName = q.get('scene') ?? 'battle';
const knobs = { scale: num('scale', 1), production: num('production', 1), damage: num('damage', 1), mirror: q.get('mirror') === '1' || sceneName === 'cav',
  commandLimit: num('commandLimit', 500), commandCooldown: num('commandCooldown', 60), soldierSight: num('soldierSight', 60) };
const seed = num('seed', 1);
let gameSpeed = num('speed', 1), paused = false;

const lab = sceneName === 'clash' || sceneName === 'cav' || sceneName === 'counter';   // 시험장: 빈 세상, 안개·화살표 없음
const world = createWorld({ seed, knobs, scenario: lab ? 'empty' : 'battle' });
if (sceneName === 'clash') spawnClash(world, Math.round(5000 * knobs.scale));
else if (sceneName === 'cav') spawnCavLab(world, q.get('kind') ?? 'anvil');
else if (sceneName === 'counter') {                       // send=1이면 sendAt초에 왼쪽 구역 병사(기병)를 가운데로 보낸다
  spawnCounterLab(world);
  if (q.get('send') === '1') { let sent = false; const at = num('sendAt', 10); world.controllers[0] = { think: w => (sent || w.time < at ? [] : (sent = true, [{ kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'sector', id: 's0-center' } }])) }; }
}
else {
  const PERSONALITIES = ['aggressive', 'careful', 'raider'];   // 몬스터 성향: aip로 고르고, 없으면 시드로 돌아가며
  const personality = q.get('aip') ?? PERSONALITIES[(seed - 1) % 3];
  world.controllers[1] = makeAi(1, { personality, difficulty: 'normal' }, makeRng(seed * 31 + 7));
  const ours = [];
  if (q.get('ai') === 'both') ours.push(makeAi(0, { personality: q.get('aip0') ?? 'aggressive', difficulty: 'normal' }, makeRng(seed * 17 + 3)));
  if (q.get('autohold') === '1') ours.push({
    think: w => w.sides[0].alerts.filter(a => a.kind === 'attacked' && w.time - a.since > 3 && !w.holds.some(h => h.side === 0 && w.strongholds[h.stronghold].id === a.stronghold))
      .map(a => ({ kind: 'holdTheLine', side: 0, stronghold: a.stronghold })),
  });
  if (sceneName === 'raid') {
    let raided = false;
    const at = num('raidAt', 0);
    ours.push({ think: w => { if (!raided && w.time >= at) { raided = true; spawnRaid(w); } return []; } });
  }
  if (q.get('demo') === 'general') ours.push(generalDemo());
  if (q.get('demo') === 'raid') {                           // 녹화용(Task 16): sendAt초에 우리 기병을 골라 오른쪽 가장자리로 돌아(경유점) 적 뒤 거점 r1R을 친다 — 고르고 Shift+오른쪽으로 보낸 것과 같다
    let sent = false; const at = num('sendAt', 60);
    ours.push({ think: w => {
      if (sent || w.time < at) return [];
      sent = true;
      const s = w.soldiers, ids = [];
      for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && s.type[i] === 2 && s.state[i] !== 3) ids.push(i);   // 2 = 기병, 3 = 수비대
      return [{ kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'stronghold', id: 'r1R' }, via: [{ x: 1180, z: 400 }] }];
    } });
  }
  if (q.get('demo') === 'send') { let sent = false; const at = num('sendAt', 100); ours.push({ think: w => (sent || w.time < at ? [] : (sent = true, [{ kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'stronghold', id: 'f1L' } }])) }); }
  if (ours.length) world.controllers[0] = { think: w => ours.flatMap(c => c.think(w)) };
}
// 녹화용 시연(?demo=general): 장수 A가 왼쪽 정면 뒤로 가서 가까운 500을 붙이고, 여울로 돌아 적 앞 거점 f1L을 친다. 적이 60 m 안이면 돌격.
function generalDemo() {
  let stage = 0;
  return { think: w => {
    const g = w.generals.find(x => x.id === 'g0a'), s = w.soldiers, out = [];
    if (!g || w.time < g.routedUntil) return out;
    if (stage === 0) { out.push({ kind: 'generalMove', side: 0, general: g.id, path: [{ x: 300, z: 330 }] }); stage = 1; }
    else if (stage === 1 && !g.path.length) {
      const ids = [];
      for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && s.goalKind[i] === 1 && Math.hypot(s.x[i] - g.x, s.z[i] - g.z) < 120) ids.push(i);
      out.push({ kind: 'attach', side: 0, general: g.id, ids, typeFilter: [0, 1, 2] });
      out.push({ kind: 'generalMove', side: 0, general: g.id, path: [{ x: 140, z: 400 }, { x: 90, z: 450 }, { x: 90, z: 575 }, { x: 200, z: 575 }, { x: 350, z: 550 }] });
      stage = 2;
    } else if (stage === 2 && g.path.length <= 2) {                          // 적 뒤로 돌아간 뒤에만 돌격
      for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 1 && Math.hypot(s.x[i] - g.x, s.z[i] - g.z) < 60) { out.push({ kind: 'charge', side: 0, general: g.id }); stage = 3; break; }
    }
    return out;
  } };
}
if (!lab) world.metrics = makeStats({ seed });                                           // 지표(Task 15) — 화면은 결정 수만 보인다
for (const until = num('skip', 0); world.time < until && !world.result;) step(world);   // 녹화 앞부분 건너뛰기

// 안개(§7.3): 편 0의 시야만 그린다. fog=0이면 끈다. 시험 장면(clash·cav)은 끈다.
const fogOn = q.get('fog') !== '0' && !lab;
const seeAt = fogOn ? (x, z) => canSee(world, 0, x, z) : null;
const visibleSoldier = fogOn ? i => world.soldiers.side[i] === 0 || canSee(world, 0, world.soldiers.x[i], world.soldiers.z[i]) : null;
const drawCrowd = alpha => crowd.update(world, alpha, visibleSoldier, seeAt, input.selectedFlags(), input.preview?.() ?? null);   // 고른 병사는 밝게, 겨누는 명령에 걸릴 병사는 그 빛깔로

const canvas = document.getElementById('view');
const recording = q.has('record');
const view = createScene(canvas, world.map, { preserveDrawingBuffer: recording });
const crowd = createCrowd(view, world.rules, world.soldiers.capacity);
if (q.has('cam')) { const [tx, tz, h] = q.get('cam').split(',').map(Number); Object.assign(view.cam, { tx, tz, h }); }   // 처음 카메라: cam=x,z,높이
if (q.has('yaw')) view.cam.yaw = num('yaw', -45) * Math.PI / 180;   // 시점 돌림(도): 기본 −45 = 대각선, 0 = 우리 쪽에서 곧게
let hud;
// PC 조작(설계서 §5, 사용자 2026-11-08): 왼쪽 = 고르기, 오른쪽 = 보내기. 우리 거점을 고르면 거점 판(짓기·생산 방향)이 열린다.
const input = createInput(view, canvas, () => world, 0, {
  onOrder: o => applyOrder(world, o), toast: t => hud.toast(t),
  onPlace: st => (st ? hud.openBuild(st) : hud.closeBuild()), canSee: seeAt,
});

function reloadWith(next) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(next)) p.set(k, String(v));
  location.search = p.toString();
}
hud = createHud({
  onOrder: o => applyOrder(world, o),
  onFocus: id => { const st = world.strongholds.find(x => x.id === id); if (st) Object.assign(view.cam, { tx: st.x, tz: st.z }); },
  getSelection: () => input.selection(), onArmFlow: () => input.armFlow(),
  onMinimap: (x, z) => Object.assign(view.cam, { tx: x, tz: z }), getFootprint: () => view.footprint(), seeAt,
  onAim: o => input.aim(o), getAim: () => input.aiming(), onSelectIds: ids => input.selectIds(ids),   // 금 명령 줄·공성병 알림
  onKnobs: k => reloadWith(k),
  onSpeed: v => { gameSpeed = v; },
  onPause: () => (paused = !paused),
  onRestart: () => reloadWith({ seed: seed + 1 }),
});
hud.setKnobs(knobs);

function syncLook() {
  if (!lab) view.setArrows(input.arrowsToDraw(world, arrowOf));
  if (fogOn) { const known = knownBuildings(world, 0); view.setBuildings(world.strongholds, st => { const k = known.get(st.id); return k === '?' ? [] : k; }); }
  else view.setBuildings(world.strongholds);
  view.setGenerals(world.generals, null, world.time, seeAt);
  view.setFog(fogOn ? world.vision : null, 0);
  view.setCasts(world.casts, world.time, seeAt);           // 금 명령 원(번쩍임·남은 시간)
  for (const st of world.strongholds) {   // 거점 색 = 주인
    const g = view.strongholdMeshes.get(st.id), color = [0x1D9E75, 0xD85A30][st.owner] ?? 0x888780;
    g.userData.ring.material.color.setHex(color);
    (g.userData.box ?? g.userData.flag).material.color.setHex(color);
    if (g.userData.wallRing) g.userData.wallRing.visible = wallStanding(st) && (st.owner === 0 || !seeAt || seeAt(st.x, st.z));   // 성벽 고리(적은 보일 때만)
  }
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
  if (now - fpsAt >= 1000) { fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; window.flood.fps = fps; }
  hud.update(world, fps);
  requestAnimationFrame(frame);
}
if (recording) {
  hud.root.style.display = 'none';
  record({ world, view, crowd, canvas, drawCrowd, beforeFrame: syncLook, seconds: num('record', 30), fps: num('fps', 30), speed: gameSpeed, fixedCam: q.has('cam') ? { ...view.cam } : null });
} else requestAnimationFrame(frame);
window.flood = { world, view, crowd, hud, input, setSpeed: v => { gameSpeed = v; } };
