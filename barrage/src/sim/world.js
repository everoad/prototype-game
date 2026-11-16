// 판 한 판: createWorld · step(한 틱) · advance(시간만큼) · drainEvents · stateHash.
// sim은 화면을 모르고 시간 배율도 모른다(정지·느려짐은 화면이 advance에 주는 시간에 곱한다).
import { RULES } from './rules.js';
import { makeRng } from './rng.js';
import { createPlayer, updatePlayer, isDodging } from './player.js';
import { createStats } from './stats.js';
import { createBullets, moveBullets, hitPlayerBullets } from './bullets.js';
import { createBoss, separateBodies } from './boss.js';
import { createShots, fireShots, moveShots } from './shots.js';
import { tryParry, catchBullets, endParry, hitBossReflects } from './parry.js';
import { updateLanes } from './patterns.js';
import { autoActive, stepAuto } from './rewards.js';
import { executeActive, canExecute, startExecute, stepExecute, endExecute } from './execute.js';
import { useItems, shieldBullets, updateItemSpawns } from './items.js';
import { createWeapons, updateWeapons } from './weapons.js';
import { initBrain, thinkBoss } from './brain.js';
import { initDragon, thinkDragon } from './dragon.js';
import { throwStore } from './store.js';
import { refreshFoes, isAway } from './foes.js';
import { updateMobs } from './mobs.js';
import { initStage, updateStage, stageDef } from './stage.js';
import { initTries, triesAim, triesMove, triesBodies, triesBullets, tryOn } from './tries.js';
import { labName, setupLab, thinkLab } from './labs.js';
import { updateLayers } from './layers.js';
import { updateBeams } from './beams.js';
import { updateWaves } from './floor.js';

export const BOSSES = ['ranged', 'dragon'];   // 보스 고르기(?boss=) — 모르는 값은 첫 보스

export function createWorld({ seed = 1, phase = 1, pattern = null, lab = null, heal = false, ai = true, gear = null, boss = 'ranged', store = false, hard = false, stage = null, room = 1, tries = null } = {}) {
  const r = RULES;
  const w = {
    rules: r, rng: makeRng(seed), seed,
    tick: 0, time: 0, acc: 0, events: [], result: null,
    player: createPlayer(r),
    boss: createBoss(r),
    bullets: createBullets(r.bullets.cap), shots: createShots(r.shots.cap), lanes: [], beams: [], waves: [], items: [], floor: null, floorAreas: [], melee: { areas: [], taken: true, rush: null, combo: null },
    enemies: [], foeList: null, aim: null, mobAreas: [],   // 일반 몬스터와 적 목록·겨눈 적(스테이지, foes.js) · 떨어지는 포탄(mobs.js)
    stats: createStats(),
    opts: { phase, pattern, lab: labName(lab), heal, ai, boss: BOSSES.includes(boss) ? boss : 'ranged', store: !!store || !!stageDef(r, stage), hard: !!hard, stage: stageDef(r, stage) ? stage : null },
    weapons: createWeapons(r, gear),   // 보조 무기(§4.10) — 기본 없음, 화면은 ?gear=
    stage: null,   // 스테이지(stage.js) — 보스전·연습 장면에서는 null
    tries: null,   // 실험 기믹(tries.js, ?try=) — 꺼져 있으면 null
  };
  if (w.opts.boss === 'dragon' && !w.opts.lab) initDragon(w); else initBrain(w);   // 연습 장면은 용을 모른다(지금 그대로)
  if (w.opts.lab) setupLab(w);
  refreshFoes(w);
  if (w.opts.store && r.store.bossHp !== 1) { w.boss.maxHp *= r.store.bossHp; w.boss.hp *= r.store.bossHp; }   // 모아 던지기 판의 보스 체력(§4.11)
  initTries(w, tries);   // 스테이지보다 먼저: 방에 들어설 때의 스냅샷·보스 체력이 실험(시작 무기·체력 배율)을 본다
  if (w.opts.stage != null) initStage(w, w.opts.stage, room - 1);
  return w;
}

// 한 틱. 차례(뒤 Task가 빈자리에 부름을 끼운다):
// 입력 → 플레이어 → 보스 → 패턴·근접 → 사격 → 탄 이동 → 판정 → 보상 → 결과 판정 → tick++, time += dt
export function step(w, input) {
  const p = w.player, b = w.boss;
  p.px = p.x; p.pz = p.z; b.px = b.x; b.pz = b.z;
  for (const e of w.enemies) { e.px = e.x; e.pz = e.z; }
  refreshFoes(w);   // 적 목록과 겨눌 적(이 틱 내내 쓴다)
  input = triesAim(w, input);   // 실험 기믹: 저격 자세(조준 중엔 이동 입력이 조준이 된다)
  // 입력·플레이어
  if (executeActive(w)) stepExecute(w, input);
  else if (autoActive(w)) stepAuto(w, input);
  else {
    updatePlayer(w, input);
    if ((input.parry || w.time <= p.buffer.parryUntil) && canExecute(w)) startExecute(w);   // 그로기 곁 패링 키(미리 누른 것 포함) = 처형(§5.8)
    else tryParry(w, input);
  }
  triesMove(w, input);   // 실험 기믹: 갈고리·돌진 베기
  useItems(w, input);   // Q 방패·E 폭탄(§4.9)
  throwStore(w, input);   // U 던지기(§4.11, ?store=1)
  if (!(tryOn(w, 'dash') && isDodging(w))) separateBodies(w);   // 돌진 베기(실험): 구르는 동안은 몸을 지나간다
  triesBodies(w);
  if (w.aim) p.face = Math.atan2(w.aim.z - p.z, w.aim.x - p.x);   // 몸은 늘 겨눈 적(보스)을 본다(돌아보는 시간 없음)
  updateItemSpawns(w);
  // 보스(두뇌가 패턴·돌진·근접을 돌린다) · 차선
  if (w.opts.lab) thinkLab(w);
  else if (isAway(w)) updateMobs(w);   // 일반 방: 보스는 자리에 없고 몬스터가 움직인다(스테이지)
  else { if (w.boss.kind === 'dragon') thinkDragon(w); else thinkBoss(w); updateLayers(w); }
  updateBeams(w);
  updateWaves(w);
  updateLanes(w);
  // 사격
  fireShots(w);
  moveShots(w);
  updateWeapons(w, input);   // 보조 무기(§4.10)
  // 탄 이동 · 판정
  moveBullets(w);
  triesBullets(w);   // 실험 기믹: 기둥이 탄을 막음·불 장판
  shieldBullets(w);       // 방패: 보라 탄은 닿기 전에 지운다
  catchBullets(w);        // 패링 원(0.8)이 판정 점보다 넓다 — 맞기 전에 받는다
  hitPlayerBullets(w);
  hitBossReflects(w);
  endParry(w);
  if (w.result && w.execute) endExecute(w);   // 날아가던 탄·되튄 탄이 끝낸 판: 처형도 끝낸다(화면은 이긴 뒤 판을 돌리지 않는다)
  updateStage(w);   // 방 정리·보상·문(스테이지)
  w.tick++;
  w.time = w.tick * w.rules.dt;
}

// 실제로 흐른 시간만큼 틱을 돈다. 한 번에 maxSteps틱을 넘으면 남은 시간을 버린다(탭이 뒤로 갔다 온 큰 dt).
export function advance(w, seconds, inputFn, maxSteps = 12) {
  w.acc += seconds;
  const dt = w.rules.dt;
  let n = Math.floor(w.acc / dt + 1e-9);
  if (n > maxSteps) { n = maxSteps; w.acc = 0; } else w.acc -= n * dt;
  for (let k = 0; k < n; k++) step(w, inputFn(w));
  return n;
}

export function drainEvents(w) {
  const out = w.events;
  w.events = [];
  return out;
}

const f = v => (v ?? 0).toFixed(6);
export function stateHash(w) {
  const p = w.player, b = w.boss;
  const live = w.bullets ? w.bullets.live : 0;
  const st = p.stock ? `${p.stock.shield}${p.stock.bomb}` : '', it = w.items ? w.items.map(i => `${i.kind[0]}${f(i.x)},${f(i.z)}`).join(';') : '';
  const base = [w.tick, f(p.x), f(p.z), p.hp, f(b.x), f(b.z), b.hp ?? 0, live, w.rng.peek().toFixed(9), st, it, p.dyingAt ?? ''];
  if (w.opts.store) base.push('s' + p.store.length);   // 기본 판 해시는 그대로(떼어 내기 시험)
  if (w.tries) base.push('t' + w.tries.names.join('+') + w.tries.fires.length + (w.tries.rope.to ? 'r' : '') + w.tries.mines.length + (w.tries.snipe && w.tries.snipe.on ? 's' : ''));
  if (w.enemies.length) base.push('e' + w.enemies.map(e => `${e.kind[0]}${f(e.x)},${f(e.z)},${f(e.hp)}`).join(';'));
  return base.join('|');
}
