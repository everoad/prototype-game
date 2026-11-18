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
import { createMobsView } from './mobsView.js';
import { createTriesView } from './triesView.js';
import { createSwordView } from './swordView.js';
import { createSwordsView } from './swordsView.js';
import { labHand } from '../sim/labs.js';
import { viewTime } from './warp.js';
import { restartRoom, stageDef } from '../sim/stage.js';
import { createHud, resultAlpha } from './hud.js';
import { createIntro } from './intro.js';
import { worldOptions } from './query.js';
import { gradeOf } from './grade.js';
import { recordable, readBest, writeBest } from './records.js';
import { createCamera } from './camera.js';
import { createTimeFx } from './timeFx.js';
import { gapWanted, isDecision, threatAt, flurryWanted, flurryOver, volleyGap } from './gap.js';
import { isDodging } from '../sim/player.js';
import { createFx } from './fx.js';
import { createFeel } from './feel.js';
import { record, recordingSfx, renderWav } from './recorder.js';
import { createSfx } from './sfx.js';
import { createTunePanel } from './tunePanel.js';
import { createModePanel, MODE_PANEL_W } from './modePanel.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
if (q.get('raf') === 'timer') window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);   // 확인용: 숨은 창에서는 rAF가 멈춘다
const seed = num('seed', 1), speed = num('speed', 1), recording = q.has('record');
if (q.has('bh')) LOOK.sizes.bh = num('bh', LOOK.sizes.bh);
if (q.get('join') === '0') RULES.sword.swords.join = 0;   // 이기어검: 스킬에 새 다섯만 나서게(견줘 보는 용 — 설계 §8의 손잡이)
const world = createWorld(worldOptions(q));   // 모아 던지기가 기본(?store=0 = 예전 방식)

document.getElementById('wait')?.remove();
const canvas = document.getElementById('view'), hudCanvas = document.getElementById('hud');
const view = createScene(canvas, LOOK, { preserveDrawingBuffer: recording });
const actors = createActors(view, LOOK, { ring: q.get('ring') !== '0', boss: (world.stage ? stageDef(RULES, world.stage.id).boss : world.boss.kind) === 'dragon' ? 'dragon' : 'ranged', storeCap: world.opts.store ? RULES.store.cap : 0, char: world.opts.char });
const bullets = createBulletsView(view, LOOK, RULES.bullets.cap);
const weaponsView = createWeaponsView(view, LOOK, RULES);
const mobsView = createMobsView(view, LOOK);   // 일반 몬스터·보상·문(스테이지)
const triesView = createTriesView(view, LOOK);   // 실험 기믹(?try=)
const swordView = createSwordView(view, LOOK);   // 검사의 칼자국·내릴 자리(?char=sword)
const hud = createHud(hudCanvas, LOOK);
const camera = createCamera(view, LOOK);
const timeFx = createTimeFx(LOOK);
const fx = createFx(view, LOOK);
const swordsView = createSwordsView(view, LOOK, fx);   // 검사의 무기(이기어검 — 떠 있는 검들. 벤 자리의 불티는 fx로 낸다)
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
let modes = null;   // 모드 고르기 판(멈춤 화면 — modePanel.js) — 처음 멈출 때 만든다
// 흰·금 탄 속도가 바뀌면 0.4초 규칙 거리도 따라 바뀐다(minParrySpawn = parryR + 0.4 × parrySpeed)
const onTune = f => { if (f.key === 'parrySpeed') RULES.bullets.minParrySpawn = RULES.player.parryR + RULES.bullets.parryLead * RULES.bullets.parrySpeed; };
const feel = createFeel({ timeFx, camera, fx, get sfx() { return sfx; }, actors, hud, LOOK });
const map = createInputMap(LOOK.camera.yawDeg * Math.PI / 180);
const botKind = q.get('bot');
const bot = botKind === 'script' ? labHand : botKind ? createBot(botKind, seed) : null;   // script = 연습 장면의 정해진 손(sim/labs.js — clip=)

const ui = { paused: false, debug: false, fps: 60, lagMs: null, maxFrameMs: 0, now: 0, dt: 0, lab: world.opts.lab, bot: botKind, project: view.project };
let pitchIdx = Math.max(0, LOOK.camera.pitches.indexOf(num('pitch', LOOK.camera.pitches[0])));
const pitchFixed = q.has('pitch') && !LOOK.camera.pitches.includes(num('pitch', 45)) ? num('pitch', 45) : null;   // 목록 밖 각도는 확인용으로 고정
camera.setPitch(pitchFixed ?? LOOK.camera.pitches[pitchIdx]);
let gapKind = 'slash', lastFlurryAt = -1e9, volleyPending = false;   // 검사의 틈: 지금 열린 틈의 종류(일섬 뒤 · 난무 앞) · 난무 앞의 느려짐을 마지막으로 건 때
let pendingPress = null;   // 입력→화면 지연 재기: 먹은 누름의 시각
// 시작 장면: 1초쯤 보스 이름과 포효(판은 멈춤) — 아무 키나 누르면 건너뜀. 연습 장면·봇·녹화·?intro=0에는 없다
const intro = createIntro(q.get('intro') === '1' ? LOOK.feel.intro.sec : world.opts.lab || world.stage || botKind || recording || q.get('intro') === '0' ? 0 : LOOK.feel.intro.sec);   // ?intro=1이면 봇·녹화에도
let introShown = false, introOpen = false;
window.addEventListener('keydown', () => { if (introShown) intro.skip(); });
window.addEventListener('mousedown', () => { if (introShown) intro.skip(); });

function inputFn(w) {
  const i = bot ? bot(w) : map.take();
  if (isDecision(i)) timeFx.endGap(clockNow);   // 검사의 틈: 다음 키(스킬 · 회피 · 패링)를 누르면 닫힌다
  if (!bot && (i.parry || i.dodge)) pendingPress = map.lastPressMs();
  return i;
}

// 한 장: 판을 dt만큼 돌리고(멈춤이 아니면), 사건을 넘기고, 그린다. 실시간 루프와 녹화가 같이 쓴다.
function frame(now, dtReal) {
  ui.now = now; ui.dt = dtReal; clockNow = now;
  // 정지·느려짐은 sim에 주는 시간에 곱한다(sim은 배율을 모른다). 끝난 판도 죽음 느려짐이 끝날 때까지 연출은 돈다.
  const aiming = !!world.tries?.snipe?.on && !world.result;   // 저격 자세: 판의 시간이 slow배로 흐르고 화면 색이 가라앉는다(판이 끝나면 풀린다)
  const scale = timeFx.scaleAt(now) * (aiming ? RULES.tries.snipe.slow : 1);
  if (aiming !== ui.aiming) { ui.aiming = aiming; if (world.result !== 'lose') canvas.style.filter = aiming ? LOOK.tries.snipe.dim : ''; }
  const inIntro = intro.active(now);
  if (inIntro && !introShown) {   // 시작: 카메라를 당기고 보스 이름·포효·몸 부풂
    introShown = true; introOpen = true;
    hud.banner(now, LOOK.names[world.boss.kind === 'dragon' ? 'dragon' : 'ranged'], LOOK.feel.intro.sec);
    camera.hold?.(LOOK.feel.intro.hold, LOOK.feel.intro.sec + 1); actors.bossPulse(now); sfx.play('roar');
  }
  if (!inIntro && introOpen) { introOpen = false; camera.release?.(); map.take(); }   // 끝: 카메라를 풀고, 장면 중에 누른 패링·회피는 버린다
  if (!ui.paused && !world.result && !inIntro) advance(world, dtReal * speed * scale, inputFn, 12);
  if (ui.paused && !recording) (modes ??= createModePanel()).show(true); else if (modes) modes.show(false);   // 멈춘 동안에는 모드 고르기 판이 왼쪽에 뜬다
  ui.insetLeft = modes && modes.shown ? MODE_PANEL_W : 0;
  const events = drainEvents(world);
  // 검사의 틈(view/gap.js): 일섬으로 건너편에 서면 다음 키를 누를 때까지 판이 느리게 흐른다 — 그동안 검은 옅어지고(view.quiet), 나를 덮는 예고의 색을 읽어 준다(hud)
  const Gp = LOOK.sword.gap, slowOn = LOOK.feel.on.slow !== false;
  if (slowOn && gapWanted(world, events, Gp)) { timeFx.gap(now, Gp.slow, Gp.max); gapKind = 'slash'; }
  // 회전 베기: 난무가 펼쳐지기 전 — 검이 모여드는 동안 — 길게 느려졌다가, 첫 검이 베는 순간 제 빠르기로 돌아온다(연출. 이때는 검을 옅게 하지 않는다)
  if (slowOn && flurryWanted(events, now, lastFlurryAt, Gp.spin)) { timeFx.gap(now, Gp.spin.slow, Gp.spin.max); gapKind = 'spin'; lastFlurryAt = now; }
  else if (gapKind === 'spin' && flurryOver(events)) timeFx.endGap(now);
  // 마무리: 착지해서 활이 선 순간부터 첫 검이 꽂히기 전까지 느려졌다가, 꽂히는 순간 연사가 제 빠르기로 터진다
  const vg = volleyGap(volleyPending, events);
  volleyPending = vg.pending;
  if (slowOn && vg.open) { timeFx.gap(now, Gp.finish.slow, Gp.finish.max); gapKind = 'finish'; }
  else if (gapKind === 'finish' && vg.close) timeFx.endGap(now);
  if (world.result || world.execute || (gapKind === 'slash' && (world.player.blade?.move || isDodging(world)))) timeFx.endGap(now);   // 판이 끝났거나 몸이 이미 다음 동작(스킬의 움직임 · 구르기)에 들어갔으면 닫는다
  ui.gap = timeFx.gapOpen(now) ? { kind: gapKind, threat: threatAt(world) } : null;
  view.quiet = !!ui.gap && gapKind === 'slash';
  actors.onEvents(events, now);
  swordView.onEvents(events, now);
  swordsView.onEvents(events, now, world);
  feel.handle(events, now);
  feel.tick(world, now);
  // 판이 끝난 순간: 이겼으면 남은 적 탄이 반짝이며 사라진다. 결과 화면은 큰 순간이 지난 뒤 서서히, 졌으면 화면 색이 빠진다.
  if (world.result && ui.resultAt == null) {
    ui.resultAt = now;
    if (world.result === 'win' && world.stage) {   // 스테이지를 끝냈다: 등급을 매기고, 제대로 한 판이면 최고 기록을 남긴다(저장이 막혀도 그대로 간다)
      const sec = world.stage.playSec, grade = gradeOf(RULES.grade[world.stage.id], { sec, hits: world.stats.hits, retries: world.stage.retries });
      let storage = null;
      try { storage = window.localStorage; } catch { storage = null; }
      const counts = recordable(q) && !botKind;
      ui.grade = { grade, counts, seed: world.seed, prev: readBest(storage, world.stage.id), rec: counts ? writeBest(storage, world.stage.id, { sec, grade }) : null };
    }
    if (world.result === 'win') {
      world.beams.length = 0; world.lanes.length = 0; world.floorAreas.length = 0; world.waves.length = 0; world.melee.areas.length = 0;   // 남은 빔·차선·장판도 걷는다(판은 더 돌지 않는다)
      const b = world.bullets; let n = 0; for (let i = 0; i < b.cap && n < 90; i++) if (b.alive[i] && b.kind[i] !== 4) { fx.spark(b.x[i], b.z[i], 'purple', 0.8); n++; } if (n) sfx.play('clear'); }
  }
  ui.resultAlpha = world.result ? resultAlpha(world.result, now - ui.resultAt, LOOK.feel.result) : 0;
  ui.resultT = world.result ? Math.max(0, now - ui.resultAt - LOOK.feel.result.winDelay) : 0;   // 결과 화면이 뜬 뒤 흐른 시간(등급·기록이 차례로 찍힌다)
  view.simTime = viewTime(world.time, world.result, now, ui.resultAt);   // 그리기용 시각(판이 끝난 뒤에도 흐른다 — 끝낸 저격의 연출이 얼지 않게)
  if (world.result === 'lose' && !recording) canvas.style.filter = `grayscale(${(LOOK.feel.result.gray * Math.min(1, (now - ui.resultAt) / LOOK.feel.result.loseDelay)).toFixed(2)})`;
  if (ui.resultAlpha > 0 && !ui.released) { ui.released = true; camera.release?.(); }
  view.setMood(world.boss.phase === 2 ? 1 : 0, dtReal);
  const alpha = Math.min(1, world.acc / world.rules.dt);
  fx.update(now, ui.paused ? 0 : dtReal * (scale || 0.15));   // 정지 중에도 연출 알갱이는 아주 천천히 움직인다
  camera.update(world, dtReal, now);
  actors.update(world, alpha, now);
  bullets.update(world, alpha, now);
  weaponsView.update(world, alpha, now);
  mobsView.update(world, alpha, now);
  triesView.update(world, alpha, now);
  swordView.update(world, alpha, now);
  swordsView.update(world, alpha, now);
  view.render();
  hud.draw(world, ui);
  const sz = hud.size;
  fx.draw2d(hud.ctx, sz.W, sz.H, view.project, world.player);
}

// 스테이지에서 죽은 뒤 R: 그 방에 들어설 때 상태로 그 방부터(결과 화면·색 빠짐·느려짐을 걷는다)
function retryRoom() {
  restartRoom(world);
  ui.resultAt = null; ui.released = false; ui.resultAlpha = 0;
  canvas.style.filter = '';
  map.clearPresses();
}

attachInput(window, canvas, map, {
  onKey(code) {
    if (code === 'F4') location.reload();
    else if (code === 'KeyR' && world.stage && world.result === 'lose') retryRoom();
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
window.barrage = { retryRoom, world, view, camera, actors, hud, fx, feel, timeFx, ui, LOOK, RULES, get sfx() { return sfx; }, setSfx(s) { sfx = s; } };

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
