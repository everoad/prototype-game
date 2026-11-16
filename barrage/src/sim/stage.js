// 스테이지(스테이지 설계 §3·§5): 한 판 안에서 방을 바꾼다. 방 = 몬스터 묶음들 → 다 잡으면 보상 셋 → 하나 고르면 문 → 다음 방, 끝 방 = 보스.
// 체력·모은 탄·사용권·무기는 방을 넘어 이어진다. 죽으면 그 방에 들어설 때 상태로 그 방부터 다시(restartRoom).
// w.stage = { id, room(0부터), of, phase: 'fight'|'reward'|'door'|'boss', wave, entry, rewards, door, startedAt, times, retries }
import { emit } from './events.js';
import { killBullet, clearBullets } from './bullets.js';
import { createBoss } from './boss.js';
import { createPlayer } from './player.js';
import { clearFloor } from './floor.js';
import { initBrain } from './brain.js';
import { spawnMob, refreshFoes } from './foes.js';
import { GEAR } from './weapons.js';

export const stageDef = (rules, id) => rules.stage.list[id] ?? null;

export function initStage(w, id, room = 0) {   // room = 시작할 방(0부터 — 연습·확인용 ?room=)
  const def = stageDef(w.rules, id);
  w.stage = { id, room: 0, of: def.rooms.length + (def.boss ? 1 : 0), phase: 'fight', wave: 0, entry: null, rewards: [], door: null, startedAt: 0, times: [], retries: 0, surviveUntil: null, nextSpawnAt: 0 };
  enterRoom(w, Math.max(0, Math.min(w.stage.of - 1, Math.floor(room) || 0)));
}

// 판에 남은 것을 걷는다(탄·장판·몬스터·무기 투사체·처형·보스의 장판)
function sweep(w) {
  const b = w.bullets;
  for (let i = 0; i < b.cap; i++) if (b.alive[i]) killBullet(w, i);
  clearFloor(w);
  w.lanes.length = 0; w.beams.length = 0; w.mobAreas.length = 0; w.enemies.length = 0; w.items.length = 0;
  w.melee = { areas: [], taken: true, rush: null, combo: null };
  w.execute = null;
  w.weapons.missiles.length = 0; w.weapons.pellets.length = 0; w.weapons.throwFans = 0;
  w.shots.alive.fill(0);   // 날던 평타
  w.player.throwSum = 0;
  if (w.tries && w.tries.snipe) { w.tries.snipe.on = false; w.tries.snipe.wait = false; }   // 저격 자세(실험)는 방을 넘어가지 않는다
}

const snapshot = w => ({ hp: w.player.hp, stock: { ...w.player.stock }, store: w.player.store.map(s => ({ ...s })), gear: [...w.weapons.on] });

// 방 n에 들어선다(들어설 때 상태를 적어 둔다 — 다시 하기)
function enterRoom(w, n, entry = null) {
  const R = w.rules, S = w.stage, p = w.player, def = stageDef(R, S.id);
  sweep(w);
  if (entry) {   // 다시 하기: 몸을 새로 만들고 들어설 때 것만 되돌린다
    const fresh = createPlayer(R);
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, fresh, { hp: entry.hp, stock: { ...entry.stock }, store: entry.store.map(s => ({ ...s })) });
    Object.assign(w.weapons, { on: [...entry.gear], chargeUntil: -1, beamUntil: -1, skillBeamUntil: -1, frenzyUntil: -1, throwFans: 0 });
    w.result = null;
  }
  [p.x, p.z] = R.start.player; p.px = p.x; p.pz = p.z;
  p.dodge.until = Math.min(p.dodge.until, w.time);   // 구르며 문에 들어와도 새 방에서는 서서 시작한다
  Object.assign(S, { room: n, wave: 0, rewards: [], door: null, startedAt: w.time, entry: entry ?? snapshot(w), surviveUntil: null });
  const boss = n >= def.rooms.length, b = w.boss;
  for (const k of Object.keys(b)) delete b[k];
  Object.assign(b, createBoss(R));
  if (boss) {   // 끝 방: 보스가 나타나 처음부터(여는 순서) 싸운다. 두뇌의 시각은 판 시작(0) 기준이라 지금 시각만큼 민다
    b.away = false;
    initBrain(w);
    b.maxHp = b.hp = R.boss.hp * R.store.bossHp * R.stage.bossHp * (w.tries && w.tries.on.always ? R.tries.always.bossHp : 1);
    b.stateAt += w.time; b.breathUntil += w.time + R.stage.bossGrace; b.floorAt += w.time; b.flipAt += w.time;
    b.calmUntil = w.time + R.stage.bossGrace;   // 들어서자마자 맞지 않게 한 박자(바탕 탄막도 쉰다)
    S.phase = 'boss';
  } else {
    b.away = true;
    S.phase = 'fight';
    const room = def.rooms[n];
    if (Array.isArray(room)) spawnWave(w, room[0]);
    else { S.surviveUntil = w.time + room.survive; S.nextSpawnAt = w.time; }   // 버티기 방: 정해진 시간 동안 몬스터가 꾸준히 나온다
  }
  refreshFoes(w);
  emit(w, 'roomStart', { room: n + 1, of: S.of, boss });
  if (boss) emit(w, 'bossEnter', { x: b.x, z: b.z });
}

// 묶음 = [종류, 수] 목록. 자리는 플레이어에게서 minSpawn 넘게, 서로 spawnGap 넘게 — 포격병은 가장 먼 자리, 나머지는 무작위
function spawnWave(w, wave) {
  const R = w.rules, S = R.stage, p = w.player;
  const taken = w.enemies.filter(m => !m.dead).map(m => [m.x, m.z]);
  const dp = s => Math.hypot(s[0] - p.x, s[1] - p.z);
  const crowd = w.tries && w.tries.on.always ? R.tries.always.crowd : 1;   // 늘 나가는 무기(실험): 빨리 죽는 만큼 많이 온다
  for (const [kind, n] of wave) for (let k = 0; k < Math.ceil(n * crowd); k++) {
    let free = S.spots.filter(s => dp(s) >= S.minSpawn && taken.every(t => Math.hypot(s[0] - t[0], s[1] - t[1]) >= S.spawnGap));
    if (!free.length) free = S.spots.filter(s => taken.every(t => Math.hypot(s[0] - t[0], s[1] - t[1]) >= 1e-6));
    if (!free.length) free = S.spots;
    const far = [...free].sort((a, b) => dp(b) - dp(a));
    const spot = kind === 'mortar' ? far[0] : free[Math.floor(w.rng.next() * free.length) % free.length];
    taken.push(spot);
    spawnMob(w, kind, spot[0], spot[1]);
  }
}

function makeRewards(w) {
  const S = w.rules.stage, p = w.player, pick = list => list[Math.floor(w.rng.next() * list.length) % list.length];
  const heal = { kind: 'heal', what: 'heal' };
  const noGear = GEAR.filter(g => !w.weapons.on.includes(g)), room = ['shield', 'bomb'].filter(k => p.stock[k] < S.chargeMax);
  const three = [noGear.length ? { kind: 'weapon', what: pick(noGear) } : heal, room.length ? { kind: 'charge', what: pick(room) } : heal, heal];
  return three.map((r, i) => ({ ...r, x: S.rewardAt[i][0], z: S.rewardAt[i][1], born: w.time }));
}

function take(w, r) {
  const R = w.rules, S = R.stage, p = w.player, W = w.weapons;
  if (r.kind === 'weapon') { W.on = GEAR.filter(g => g === r.what || W.on.includes(g)); W.next[r.what] = w.time + (R.weapons[r.what].first ?? R.weapons[r.what].every ?? 0); }
  else if (r.kind === 'charge') p.stock[r.what] = Math.min(S.chargeMax, p.stock[r.what] + 1);
  else p.hp = Math.min(R.player.hp, p.hp + S.heal);
  emit(w, 'rewardPick', { kind: r.kind, what: r.what, x: r.x, z: r.z });
}

// 틱 끝에 한 번
export function updateStage(w) {
  const S = w.stage, R = w.rules, St = R.stage, p = w.player;
  if (!S || w.result) return;
  const def = stageDef(R, S.id);
  if (S.phase === 'fight') {
    const waves = def.rooms[S.room], alive = w.enemies.reduce((n, m) => n + (m.dead ? 0 : 1), 0);
    if (!Array.isArray(waves)) {   // 버티기 방: every초마다(cap 미만이면) 묶음 하나, 시간이 다 되면 남은 몬스터가 사라진다
      if (w.time < S.surviveUntil - 1e-9) {
        if (w.time >= S.nextSpawnAt - 1e-9) { S.nextSpawnAt = w.time + waves.every; if (alive < waves.cap) spawnWave(w, waves.pool[Math.floor(w.rng.next() * waves.pool.length) % waves.pool.length]); }
        return;
      }
      for (const m of w.enemies) if (!m.dead) { m.dead = true; m.diedAt = w.time; m.boomed = true; emit(w, 'mobDeath', { id: m.id, kind: m.kind, x: m.x, z: m.z }); }
    } else {
      if (S.wave + 1 < waves.length) { if (alive <= St.nextWaveAt) spawnWave(w, waves[++S.wave]); return; }
      if (alive > 0) return;
    }
    // 방 정리: 판의 적 탄·예고를 걷고 보상 셋을 띄운다
    const b = w.bullets, n = clearBullets(w, 0, 0, Infinity);   // 적 탄은 반짝이며 사라진다(clear 사건)
    for (let i = 0; i < b.cap; i++) if (b.alive[i]) killBullet(w, i);   // 날던 내 탄도 걷는다
    w.floorAreas.length = 0; w.mobAreas.length = 0; p.throwSum = 0;
    const sec = w.time - S.startedAt;
    S.times.push({ room: S.room + 1, sec, hp: p.hp, retries: S.retries });
    if (!def.boss && S.room === def.rooms.length - 1) {   // 보스가 없는 스테이지: 끝 방을 정리하면 이긴다
      emit(w, 'roomClear', { room: S.room + 1, of: S.of, sec, cleared: n });
      w.result = 'win';
      return;
    }
    S.rewards = makeRewards(w);
    S.phase = 'reward';
    emit(w, 'roomClear', { room: S.room + 1, of: S.of, sec, cleared: n });
  } else if (S.phase === 'reward') {
    for (const r of S.rewards) {
      if (w.time < r.born + St.rewardDelay - 1e-9 || Math.hypot(p.x - r.x, p.z - r.z) > St.pickR) continue;
      take(w, r);
      S.rewards = [];
      S.door = { x: R.board.hx, z: 0, halfZ: St.door.halfZ };
      S.phase = 'door';
      emit(w, 'doorOpen', { x: S.door.x, z: S.door.z });
      break;
    }
  } else if (S.phase === 'door') {
    if (p.x >= R.board.hx - R.player.bodyR - St.door.reach && Math.abs(p.z - S.door.z) <= S.door.halfZ) enterRoom(w, S.room + 1);
  }
}

// 죽은 뒤: 그 방에 들어설 때 상태로 그 방부터
export function restartRoom(w) {
  const S = w.stage;
  if (!S) return;
  S.retries++;
  const room = S.room;
  enterRoom(w, room, S.entry);
  emit(w, 'roomRetry', { room: room + 1 });
}
