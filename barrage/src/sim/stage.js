// 스테이지(스테이지 설계 §3·§5, 한 판의 뼈대 설계 §5·§6): 한 판 안에서 방을 바꾼다. 방 = 몬스터 묶음들 → 다 잡으면 카드 둘 + 보급 하나 → 하나 고르면 문 → 다음 방, 끝 방 = 보스.
// 고르는 자리(w.stage.rewards): { kind, what, x, z, born, armed } — kind = 'card'·'heal'·'charge'(고르는 중) · 'held'·'cancel'(바꿔 끼우는 중).
// 칸이 찬 갈래의 카드를 밟으면 바꿔 끼우기(phase 'replace'): 밟은 자리가 무르기, 나머지 자리에 그 갈래의 낀 카드. 화면·키 없이 걸어서 고른다.
//   실수 방지: armed가 꺼진 자리는 플레이어가 한 번 벗어나야 눌린다(밟고 선 자리가 바로 눌리지 않는다).
// 체력·모은 탄·사용권·무기는 방을 넘어 이어진다. 죽으면 그 방에 들어설 때 상태로 그 방부터 다시(restartRoom).
// w.stage = { id, room(0부터), of, phase: 'fight'|'reward'|'replace'|'door'|'boss', wave, entry, rewards, offer, pending, door, startedAt, times, retries }
import { emit } from './events.js';
import { killBullet, clearBullets } from './bullets.js';
import { createBoss } from './boss.js';
import { createPlayer } from './player.js';
import { clearFloor } from './floor.js';
import { initBrain } from './brain.js';
import { initDragon } from './dragon.js';
import { setTry } from './tries.js';
import { spawnMob, refreshFoes } from './foes.js';
import { CARDS, drawPicks, giveCard, dropCard, kitCards, kitFull, kitSnapshot, kitRestore } from './cards.js';

export const stageDef = (rules, id) => rules.stage.list[id] ?? null;

// 방의 종류: 묶음 목록이나 { waves } = 전투, { survive } = 버티기, { elite } = 정예
export const roomKind = room => (Array.isArray(room) || room.waves ? 'fight' : room.elite ? 'elite' : 'survive');
const wavesOf = room => (Array.isArray(room) ? room : room.waves);

// 방의 특징(실험 틀의 기둥·밀물 등): 그 방에서만 켠다. 앞 방의 것은 끄고 새로 켜므로 다시 하기에서도 새것 한 벌이다
function setFeature(w, name) {
  const S = w.stage;
  if (S.feature) setTry(w, S.feature, false);
  S.feature = name;
  if (name) setTry(w, name, true);
}

export function initStage(w, id, room = 0) {   // room = 시작할 방(0부터 — 연습·확인용 ?room=)
  const def = stageDef(w.rules, id);
  w.stage = { id, room: 0, of: def.rooms.length + (def.boss ? 1 : 0), phase: 'fight', wave: 0, entry: null, rewards: [], offer: null, pending: null, door: null, feature: null, startedAt: 0, playSec: 0, times: [], retries: 0, surviveUntil: null, nextSpawnAt: 0 };
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
  w.weapons.missiles.length = 0; w.weapons.pellets.length = 0; w.weapons.throwFans = 0; w.weapons.salvoBeam = null; w.weapons.salvoDroneUntil = -1;   // 이어지던 한 방(굵은 빔·난사)도
  w.shots.alive.fill(0);   // 날던 평타
  w.player.throwSum = 0;
  if (w.tries && w.tries.snipe) { w.tries.snipe.on = false; w.tries.snipe.wait = false; }   // 저격 자세(실험)는 방을 넘어가지 않는다
  if (w.tries) { w.tries.mines.length = 0; w.tries.fires.length = 0; w.tries.rope.to = null; }   // 놓인 지뢰·타던 불·끌려가던 줄도
}

const snapshot = w => ({ hp: w.player.hp, stock: { ...w.player.stock }, store: w.player.store.map(s => ({ ...s })), gear: [...w.weapons.on], kit: kitSnapshot(w) });

// 방 n에 들어선다(들어설 때 상태를 적어 둔다 — 다시 하기)
function enterRoom(w, n, entry = null) {
  const R = w.rules, S = w.stage, p = w.player, def = stageDef(R, S.id);
  sweep(w);
  if (entry) {   // 다시 하기: 몸을 새로 만들고 들어설 때 것만 되돌린다
    const fresh = createPlayer(R);
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, fresh, { hp: entry.hp, stock: { ...entry.stock }, store: entry.store.map(s => ({ ...s })) });
    Object.assign(w.weapons, { on: [...entry.gear], chargeUntil: -1, beamUntil: -1, skillBeamUntil: -1, frenzyUntil: -1, throwFans: 0 });
    kitRestore(w, entry.kit);   // 카드의 효과(탄 칸·회피 충전·켠 실험)를 들어설 때 것으로 — 한 벌만
    w.result = null;
  }
  [p.x, p.z] = R.start.player; p.px = p.x; p.pz = p.z;
  p.dodge.until = Math.min(p.dodge.until, w.time);   // 구르며 문에 들어와도 새 방에서는 서서 시작한다
  Object.assign(S, { room: n, wave: 0, rewards: [], offer: null, pending: null, door: null, startedAt: w.time, entry: entry ?? snapshot(w), surviveUntil: null });
  const boss = n >= def.rooms.length, b = w.boss;
  for (const k of Object.keys(b)) delete b[k];
  Object.assign(b, createBoss(R));
  if (boss) {   // 끝 방: 보스가 나타나 처음부터(여는 순서) 싸운다. 두뇌의 시각은 판 시작(0) 기준이라 지금 시각만큼 민다
    setFeature(w, null);
    b.away = false;
    const dragon = def.boss === 'dragon';
    if (dragon) initDragon(w); else initBrain(w);
    b.maxHp = b.hp = (dragon ? R.dragon.hp : R.boss.hp) * R.store.bossHp * R.stage.bossHp * (def.bossHp ?? 1) * (w.tries && w.tries.on.always ? R.tries.always.bossHp : 1);   // def.bossHp = 그 스테이지 보스의 체력 배율
    for (const k of ['stateAt', 'floorAt', 'flipAt']) if (Number.isFinite(b[k])) b[k] += w.time;   // 그 보스에 있는 칸만 민다
    if (Number.isFinite(b.breathUntil)) b.breathUntil += w.time + R.stage.bossGrace;
    b.calmUntil = w.time + R.stage.bossGrace;   // 들어서자마자 맞지 않게 한 박자(바탕 탄막도 쉰다)
    S.phase = 'boss';
  } else {
    b.away = true;
    S.phase = 'fight';
    const room = def.rooms[n], kind = roomKind(room);
    setFeature(w, room.feature ?? null);
    if (kind === 'fight') spawnWave(w, wavesOf(room)[0]);
    else if (kind === 'survive') { S.surviveUntil = w.time + room.survive; S.nextSpawnAt = w.time; }   // 버티기 방: 정해진 시간 동안 몬스터가 꾸준히 나온다
    else {   // 정예 방: 큰 몬스터 하나(가장 먼 자리, 수를 늘리지 않는다) + 졸개
      const spot = [...R.stage.spots].sort((a2, b2) => Math.hypot(b2[0] - p.x, b2[1] - p.z) - Math.hypot(a2[0] - p.x, a2[1] - p.z))[0];
      spawnMob(w, room.elite, spot[0], spot[1], undefined, { elite: true });
      spawnWave(w, room.with);
      S.nextSpawnAt = w.time + room.every;
    }
  }
  refreshFoes(w);
  emit(w, 'roomStart', { room: n + 1, of: S.of, boss, kind: boss ? def.boss : roomKind(def.rooms[n]), feature: S.feature });
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

// 방을 깨면: 카드 둘 + 보급 하나(cards.drawPicks)를 자리 셋에 놓는다
function makeRewards(w) {
  const S = w.rules.stage;
  return drawPicks(w, w.stage.room).map((r, i) => ({ ...r, x: S.rewardAt[i][0], z: S.rewardAt[i][1], born: w.time, armed: false, since: null }));   // 뜰 때 밟고 있던 자리는 한 번 벗어나야 눌린다
}

function take(w, r) {
  const R = w.rules, S = R.stage, p = w.player;
  if (r.kind === 'card') giveCard(w, r.what);
  else if (r.kind === 'charge') p.stock[r.what] = Math.min(S.chargeMax, p.stock[r.what] + 1);
  else p.hp = Math.min(R.player.hp, p.hp + S.heal);
  emit(w, 'rewardPick', { kind: r.kind, what: r.what, x: r.x, z: r.z });
}

function openDoor(w) {
  const S = w.stage, R = w.rules;
  S.rewards = []; S.offer = null; S.pending = null;
  S.door = { x: R.board.hx, z: 0, halfZ: R.stage.door.halfZ };
  S.phase = 'door';
  emit(w, 'doorOpen', { x: S.door.x, z: S.door.z });
}

// 칸이 찬 갈래의 카드 r을 밟았다: 밟은 자리 = 무르기, 나머지 자리 = 그 갈래에 낀 카드(하나 또는 둘). 다 한 번 벗어나야 눌린다
function startReplace(w, r) {
  const S = w.stage, at = S.rewards.indexOf(r), group = CARDS[r.what].group, held = kitCards(w, group);
  const free = S.rewards.filter((x, i) => i !== at);
  S.offer = S.rewards; S.pending = { id: r.what, group };
  S.rewards = [{ kind: 'cancel', what: r.what, x: r.x, z: r.z, born: w.time, armed: false, since: null }, ...held.slice(0, free.length).map((id, k) => ({ kind: 'held', what: id, x: free[k].x, z: free[k].z, born: w.time, armed: false, since: null }))];
  S.phase = 'replace';
  emit(w, 'replaceStart', { id: r.what, group, x: r.x, z: r.z });
}

// 플레이어가 고른 자리 하나: 눌릴 수 있는(armed) 자리 위에 pickHold초 서 있어야 한다 — 지나가기만 해서는 주워지지 않는다.
// 벗어난 자리는 다시 눌릴 수 있게 되고(armed) 서 있던 시간은 처음부터. 한 틱에 하나만
function touched(w) {
  const S = w.stage, St = w.rules.stage, p = w.player;
  let hit = null;
  for (const r of S.rewards) {
    if (Math.hypot(p.x - r.x, p.z - r.z) > St.pickR) { r.armed = true; r.since = null; continue; }
    if (!r.armed) continue;
    if (r.since == null) r.since = w.time;
    if (!hit && w.time - r.since >= St.pickHold - 1e-9 && (S.phase === 'replace' || w.time >= r.born + St.rewardDelay - 1e-9)) hit = r;   // 뜨자마자 주워지지 않게 한 박자
  }
  return hit;
}

// 틱 끝에 한 번
export function updateStage(w) {
  const S = w.stage, R = w.rules, St = R.stage, p = w.player;
  if (!S || w.result) return;
  const def = stageDef(R, S.id);
  if (S.phase === 'fight' || S.phase === 'boss') S.playSec += R.dt;   // 싸운 시간(등급·기록이 이것을 쓴다 — 카드를 고르며 망설인 시간은 세지 않는다)
  if (S.phase === 'fight') {
    const room = def.rooms[S.room], kind = roomKind(room), alive = w.enemies.reduce((n, m) => n + (m.dead ? 0 : 1), 0);
    const vanish = () => { for (const m of w.enemies) if (!m.dead) { m.dead = true; m.diedAt = w.time; m.boomed = true; emit(w, 'mobDeath', { id: m.id, kind: m.kind, x: m.x, z: m.z }); } };
    if (kind === 'survive') {   // 버티기 방: every초마다(cap 미만이면) 묶음 하나, 시간이 다 되면 남은 몬스터가 사라진다
      if (w.time < S.surviveUntil - 1e-9) {
        if (w.time >= S.nextSpawnAt - 1e-9) { S.nextSpawnAt = w.time + room.every; if (alive < room.cap) spawnWave(w, room.pool[Math.floor(w.rng.next() * room.pool.length) % room.pool.length]); }
        return;
      }
      vanish();
    } else if (kind === 'elite') {   // 정예 방: 정예가 살아 있는 동안 졸개가 every초마다(cap 미만이면) 더 온다. 정예가 죽으면 남은 졸개가 사라진다
      const el = w.enemies.find(m => m.elite);
      if (el && !el.dead) {
        if (w.time >= S.nextSpawnAt - 1e-9) { S.nextSpawnAt = w.time + room.every; if (alive - 1 < room.cap) spawnWave(w, room.with); }
        return;
      }
      vanish();
    } else {
      const waves = wavesOf(room);
      if (S.wave + 1 < waves.length) { if (alive <= St.nextWaveAt) spawnWave(w, waves[++S.wave]); return; }
      if (alive > 0) return;
    }
    for (const m of w.enemies) m.boomed = true;   // 방이 정리되면 죽은 자폭병의 남은 폭발도 꺼진다(고르는 동안 맞지 않게)
    setFeature(w, null);   // 방의 특징(밀물·기둥)도 꺼진다 — 예고가 걷힌 밀물이 고르는 동안 덮치지 않게
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
    const r = touched(w);
    if (!r) return;
    if (r.kind === 'card' && kitFull(w, CARDS[r.what].group)) startReplace(w, r);
    else { take(w, r); openDoor(w); }
  } else if (S.phase === 'replace') {
    const r = touched(w);
    if (!r) return;
    if (r.kind === 'cancel') {   // 무르기: 처음 셋으로(밟고 선 자리의 카드가 바로 다시 눌리지 않게 꺼 둔다)
      S.rewards = S.offer.map(o => ({ ...o, armed: false, since: null })); S.offer = null; S.pending = null;
      S.phase = 'reward';
      emit(w, 'replaceCancel', { x: r.x, z: r.z });
    } else {
      const id = S.pending.id, at = kitCards(w, S.pending.group).indexOf(r.what);
      dropCard(w, r.what); giveCard(w, id, at);   // 버린 카드의 칸에 — 남은 카드의 키(K·L)가 바뀌지 않는다
      emit(w, 'rewardPick', { kind: 'card', what: id, x: r.x, z: r.z, dropped: r.what });
      openDoor(w);
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
