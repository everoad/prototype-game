// 탄막 패링 진입점: URL → 판, 화면, 입력(또는 봇), 고정 틱 루프, 녹화.
// URL: pitch(도) bh(탄 높이) speed seed bot(1|some|dodge|walk|turtle) phase(2) pattern(번호) lab(장면) ring(0 = 고리 끔) heal(1) gear(all|none|missile,orbit,…) record(초) fps
import { createWorld, advance, drainEvents } from '../sim/world.js';
import { RULES } from '../sim/rules.js';
import { createBot } from '../sim/bot.js';
import { LOOK } from './look.js';
import { createScene } from './scene.js';
import { createInputMap } from './inputMap.js';
import { attachInput } from './input.js';
import { createActors } from './actors.js';
import { createBulletsView } from './bulletsView.js';
import { createWeaponsView } from './weaponsView.js';
import { createHud, resultAlpha } from './hud.js';
import { createCamera } from './camera.js';
import { createTimeFx } from './timeFx.js';
import { createFx } from './fx.js';
import { createFeel } from './feel.js';
import { record, recordingSfx, renderWav } from './recorder.js';
import { createSfx } from './sfx.js';
import { createTunePanel } from './tunePanel.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
if (q.get('raf') === 'timer') window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);   // 확인용: 숨은 창에서는 rAF가 멈춘다
const seed = num('seed', 1), speed = num('speed', 1), recording = q.has('record');
if (q.has('bh')) LOOK.sizes.bh = num('bh', LOOK.sizes.bh);
const world = createWorld({ seed, phase: num('phase', 1), pattern: q.has('pattern') ? num('pattern', null) : null, lab: q.get('lab'), heal: q.get('heal') === '1', boss: q.get('boss') ?? 'ranged', store: q.get('store') === '1', hard: q.get('hard') === '1', gear: q.get('gear') ?? (q.get('lab') ? 'none' : 'all') });   // 보조 무기(§4.10): 첫 시험은 다 켬

document.getElementById('wait')?.remove();
const canvas = document.getElementById('view'), hudCanvas = document.getElementById('hud');
const view = createScene(canvas, LOOK, { preserveDrawingBuffer: recording });
const actors = createActors(view, LOOK, { ring: q.get('ring') !== '0', boss: world.boss.kind === 'dragon' ? 'dragon' : 'ranged', storeCap: world.opts.store ? RULES.store.cap : 0 });
const bullets = createBulletsView(view, LOOK, RULES.bullets.cap);
const weaponsView = createWeaponsView(view, LOOK, RULES);
const hud = createHud(hudCanvas, LOOK);
const camera = createCamera(view, LOOK);
const timeFx = createTimeFx(LOOK);
const fx = createFx(view, LOOK);
// 소리: 실시간은 Web Audio(사용자 동작 뒤에야 나온다 — 첫 입력 때 resume), 녹화는 사건을 적었다가 끝에 wav로
let clockNow = 0;
let audio = null;
let sfx;
const silent = { play() {}, duck() {}, stop() {} };
if (recording) sfx = recordingSfx(() => clockNow);
else if (q.get('mute') === '1') sfx = silent;   // 소리 끔(?mute=1 — 미리보기 창에서 확인할 때)
else {
  try { audio = new AudioContext({ latencyHint: 'interactive' }); sfx = createSfx(audio, LOOK); } catch { sfx = { play() {}, duck() {} }; }
}
let panel = null;   // 수치 패널(F2) — 처음 열 때 만든다
// 흰·금 탄 속도가 바뀌면 0.4초 규칙 거리도 따라 바뀐다(minParrySpawn = parryR + 0.4 × parrySpeed)
const onTune = f => { if (f.key === 'parrySpeed') RULES.bullets.minParrySpawn = RULES.player.parryR + RULES.bullets.parryLead * RULES.bullets.parrySpeed; };
const feel = createFeel({ timeFx, camera, fx, get sfx() { return sfx; }, actors, hud, LOOK });
const map = createInputMap(LOOK.camera.yawDeg * Math.PI / 180);
const botKind = q.get('bot');
const bot = botKind ? createBot(botKind, seed) : null;

const ui = { paused: false, debug: false, fps: 60, lagMs: null, maxFrameMs: 0, now: 0, dt: 0, lab: world.opts.lab, bot: botKind, project: view.project };
let pitchIdx = Math.max(0, LOOK.camera.pitches.indexOf(num('pitch', LOOK.camera.pitches[0])));
const pitchFixed = q.has('pitch') && !LOOK.camera.pitches.includes(num('pitch', 45)) ? num('pitch', 45) : null;   // 목록 밖 각도는 확인용으로 고정
camera.setPitch(pitchFixed ?? LOOK.camera.pitches[pitchIdx]);
let pendingPress = null;   // 입력→화면 지연 재기: 먹은 누름의 시각

function inputFn(w) {
  if (bot) return bot(w);
  const i = map.take();
  if (i.parry || i.dodge) pendingPress = map.lastPressMs();
  return i;
}

// 한 장: 판을 dt만큼 돌리고(멈춤이 아니면), 사건을 넘기고, 그린다. 실시간 루프와 녹화가 같이 쓴다.
function frame(now, dtReal) {
  ui.now = now; ui.dt = dtReal; clockNow = now;
  // 정지·느려짐은 sim에 주는 시간에 곱한다(sim은 배율을 모른다). 끝난 판도 죽음 느려짐이 끝날 때까지 연출은 돈다.
  const scale = timeFx.scaleAt(now);
  if (!ui.paused && !world.result) advance(world, dtReal * speed * scale, inputFn, 12);
  const events = drainEvents(world);
  actors.onEvents(events, now);
  feel.handle(events, now);
  feel.tick(world, now);
  // 판이 끝난 순간: 이겼으면 남은 적 탄이 반짝이며 사라진다. 결과 화면은 큰 순간이 지난 뒤 서서히, 졌으면 화면 색이 빠진다.
  if (world.result && ui.resultAt == null) {
    ui.resultAt = now;
    if (world.result === 'win') {
      world.beams.length = 0; world.lanes.length = 0; world.floorAreas.length = 0; world.waves.length = 0; world.melee.areas.length = 0;   // 남은 빔·차선·장판도 걷는다(판은 더 돌지 않는다)
      const b = world.bullets; let n = 0; for (let i = 0; i < b.cap && n < 90; i++) if (b.alive[i] && b.kind[i] !== 4) { fx.spark(b.x[i], b.z[i], 'purple', 0.8); n++; } if (n) sfx.play('clear'); }
  }
  ui.resultAlpha = world.result ? resultAlpha(world.result, now - ui.resultAt, LOOK.feel.result) : 0;
  if (world.result === 'lose' && !recording) canvas.style.filter = `grayscale(${(LOOK.feel.result.gray * Math.min(1, (now - ui.resultAt) / LOOK.feel.result.loseDelay)).toFixed(2)})`;
  if (ui.resultAlpha > 0 && !ui.released) { ui.released = true; camera.release?.(); }
  view.setMood(world.boss.phase === 2 ? 1 : 0, dtReal);
  const alpha = Math.min(1, world.acc / world.rules.dt);
  fx.update(now, ui.paused ? 0 : dtReal * (scale || 0.15));   // 정지 중에도 연출 알갱이는 아주 천천히 움직인다
  camera.update(world, dtReal, now);
  actors.update(world, alpha, now);
  bullets.update(world, alpha, now);
  weaponsView.update(world, alpha, now);
  view.render();
  hud.draw(world, ui);
  const sz = hud.size;
  fx.draw2d(hud.ctx, sz.W, sz.H, view.project, world.player);
}

attachInput(window, canvas, map, {
  onKey(code) {
    if (code === 'F4') location.reload();
    else if (code === 'Escape') { ui.paused = !ui.paused; map.clearPresses(); }
    else if (code === 'F1') ui.debug = !ui.debug;
    else if (code === 'KeyV' && pitchFixed == null) { pitchIdx = (pitchIdx + 1) % LOOK.camera.pitches.length; camera.setPitch(LOOK.camera.pitches[pitchIdx]); }
    else if (code === 'KeyG') actors.toggleRing();
    else if (code === 'F2') { panel ??= createTunePanel({ LOOK, RULES, onChange: onTune }); panel.toggle(); }
  },
  onBlur() { if (!recording && !world.result) ui.paused = true; },
  onFirstInput() { audio?.resume(); },
});
window.addEventListener('resize', () => { view.resize(); hud.resize(); });
window.barrage = { world, view, camera, actors, hud, fx, feel, timeFx, ui, LOOK, RULES, get sfx() { return sfx; }, setSfx(s) { sfx = s; } };

if (recording) {
  const seconds = num('record', 10);
  record({ seconds, fps: num('fps', 60), frame, canvases: [canvas, hudCanvas], view, beforeDone: () => renderWav(sfx.log, seconds, createSfx, LOOK) });
} else {
  let last = performance.now(), frames = 0, fpsAt = last;
  const loop = t => {
    const dt = Math.min(0.1, (t - last) / 1000);
    ui.maxFrameMs = Math.max(ui.maxFrameMs * 0.995, t - last);   // 천천히 잊는 최댓값
    last = t;
    frame(t / 1000, dt);
    if (pendingPress != null) { ui.lagMs = performance.now() - pendingPress; pendingPress = null; }
    frames++;
    if (t - fpsAt >= 500) { ui.fps = frames * 1000 / (t - fpsAt); frames = 0; fpsAt = t; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
