// 시험판 진입점. URL: seed, ai(both = 우리도 AI), aip(적 AI 성향 balanced|rush|tech), aip0, fog(0 = 안개 끔), speed, edge(0 = 화면 끝 밀기 끔),
// cam(x,z,높이), skip(처음 몇 초를 화면 없이), record(초)·fps(녹화, tools/record.ps1).
import { createWorld, advance, step, applyCommand, canSee } from '../sim/world.js';
import { makeAi } from '../sim/ai.js';
import { createScene } from './scene.js';
import { createOverlay } from './overlay.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { record } from './recorder.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const seed = num('seed', 1), side = 0, fog = q.get('fog') !== '0';
const world = createWorld({ seed });
const PS = ['balanced', 'rush', 'tech'];
world.controllers[1] = makeAi(1, { personality: q.get('aip') ?? PS[(seed - 1) % 3], seed });
if (q.get('ai') === 'both') world.controllers[0] = makeAi(0, { personality: q.get('aip0') ?? 'balanced', seed: seed + 50 });
for (const until = num('skip', 0); world.time < until && !world.result;) step(world);

let gameSpeed = num('speed', 1), paused = false;
const canvas = document.getElementById('view'), over = document.getElementById('over');
const recording = q.has('record');
const view = createScene(canvas, world, { preserveDrawingBuffer: recording });
const home = world.map.homes[side];
Object.assign(view.cam, { tx: home.x + 6, tz: home.z + 6, h: 115 });
if (q.has('cam')) { const [tx, tz, h] = q.get('cam').split(',').map(Number); Object.assign(view.cam, { tx, tz, h }); }
const overlay = createOverlay(over);
let hud;
const input = createInput({ canvas, view, getWorld: () => world, side, fog, edgeScroll: q.get('edge') !== '0' && !recording,
  onCommand: c => applyCommand(world, c), toast: t => hud.toast(t) });
hud = createHud({ getWorld: () => world, side, input, view, fog,
  onSpeed: v => { gameSpeed = v; }, onPause: p => { paused = p; },
  onRestart: () => { const p = new URLSearchParams(location.search); p.set('seed', String(seed + 1)); location.search = p.toString(); } });

const seeAt = (x, z) => canSee(world, side, x, z);
function drawFrame(alpha) {
  view.update(world, alpha, { side, fog, selected: input.sel, ghost: input.ghost(), rally: input.rally() });
  view.render();
  overlay.draw(world, view, { side, fog, selected: input.sel, box: input.box(), canSee: seeAt });
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) advance(world, dt * gameSpeed, 8 * Math.max(1, gameSpeed));
  input.update(dt);
  drawFrame(Math.min(1, world.acc / world.rules.dt));
  hud.update(world);
  requestAnimationFrame(frame);
}
if (recording) { hud.root.style.display = 'none'; record({ world, view, canvas, over, drawFrame, seconds: num('record', 30), fps: num('fps', 30), speed: gameSpeed, fixedCam: q.has('cam') }); }
else requestAnimationFrame(frame);
window.realm = { world, view, input, hud, applyCommand, setSpeed: v => { gameSpeed = v; } };
