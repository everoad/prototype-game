// 실험 기믹(?try=이름,이름 — 사용자 2026-11-17 "다양한 기믹이나 무기 같은 거 만들어서 여러 가지 테스트"): 기본 판·스테이지는 그대로 두고 켠 것만 끼어든다.
//  sky     갈고리: 판의 말뚝에 줄을 걸어 빠르게 끌려간다(이동기 키 — tryKey). 끌려가는 동안은 공중이라 맞지 않는다(대신 내릴 자리는 말뚝뿐, 받아치지도 못한다).
//          줄의 상태는 w.tries.rope, 수치는 RULES.tries.rope(말뚝 자리·빠르기·쉬는 시간).
//  pillars 엄폐 기둥: 보라·빨강 탄과 내 평타를 막는다(흰·금과 던진 탄은 넘어간다 — 받아칠 것은 남긴다). hp발 막으면 무너진다. 몸은 돌아서 지나간다.
//  dash    돌진 베기: 회피로 적의 몸을 지나가면 피해(회피가 공격도 된다).
//  mine    지뢰: 모은 탄 하나를 발밑에 놓는다(O, 회복 없음). 적의 몸이 닿으면 둘레의 적이 던진 탄보다 세게 다친다.
//  orbit   오라: 모은 탄이 있는 동안 가까운 적이 깎인다(들고 있을 이유 — 던져서 회복할지, 붙어서 갈지).
//  swap    자리 바꾸기: 겨눈 몬스터와 자리를 바꾼다(이동기 키). 둘러싸였을 때 빠져나오고, 적을 폭발·불 속에 넣는다.
//  graze   스침 모으기: 스칠 때마다 조금씩 모여 몇 번에 한 칸(패링 말고도 모으는 길).
//  bubble  보호막(보스전): 보스가 가끔 막을 두른다 — 평타·무기는 막히고 던진 탄만 통한다. 던진 탄 몇 발이면 깨진다(던질 때를 고르게).
//  tide    밀물(판 전체): 판의 반쪽에 빨간 예고가 깔리고 잠시 뒤 그 반쪽이 다친다 — 탄 사이로 판을 건너야 한다.
//  always  늘 나가는 무기(사용자 "기본으로 나가고 패링했을 때 강화"): 낀 무기가 받아치지 않아도 쏜다. 패링하면 가동 시간 동안 과열(over배 자주).
//          산탄도 burstEvery초마다 부채(던질 때 따로 나가지 않는다). 스테이지는 start 무기 하나를 들고 시작한다. 평타 shot배·무기 mul배(사용자 "데미지가 너무 낮다") — 그만큼 보스 체력 bossHp배, 방의 몬스터 수 crowd배(체력 mobHp배).
//  snipe   저격(사용자): I를 누르고 있으면 저격 자세 — 몸은 서고(화면이 시간을 slow배로 늦춘다), 조준점이 겨눈 적에 붙어 따라간다.
//          모아 던지기 판에서만 있다(탄을 쓴다). 갈고리·자리 바꾸기·지뢰와 키가 따로라 같이 있다(한 판의 뼈대 §8). 겨눌 적이 없으면 못 든다.
//          WASD = 적 고르기(사용자 "AD로 타깃을 선택" → W·S도): 지금 고른 적에서 누른 쪽(±45°)의 가장 가까운 적. 선은 몸에서 고른 적을 지나 뻗는다.
//          떼면(또는 hold초 뒤) 모은 탄을 다 써서 선 위의 적을 모두 뚫는다(칸마다 던지기 피해 × mul, 회복 없음). 회피 = 취소(탄은 남는다).
//  vary    공격 다양화(사용자 "일반 적군 공격 패턴도 너무 단조로워"): 몬스터가 공격을 돌아가며 쓴다(mobs.js) —
//          사수: 세 발 → 넓은 부채(wideN발) → 연사(한 줄로 streamN발, 첫 발이 흰 탄), 돌격병: 두 번에 한 번 연속 돌진(짧은 예고 warn2),
//          포격병: 두 번에 한 번 줄 포격(나를 지나는 줄에 원 lineN개가 차례로).
//  lance   꿰뚫는 던지기: 던진 탄이 따라가지 않고 곧게 날며 길 위의 적을 모두 뚫는다(줄 세우기).
// w.tries = null(꺼짐) 또는 { on: { 이름: true }, rope, pillars, mines, … }. 수치는 RULES.tries.
import { K } from './rules.js';
import { emit } from './events.js';
import { clampToBoard, segCircle, slideOut } from './geom.js';
import { killBullet } from './bullets.js';
import { isDodging } from './player.js';
import { hurtFoe, foeR } from './foes.js';
import { addStagger } from './boss.js';
import { storeAdd, throwMul } from './store.js';
import { weaponSalvo } from './weapons.js';
import { resolveHit } from './melee.js';
import { executeActive } from './execute.js';
import { autoActive } from './rewards.js';
import { isSword } from './sword.js';

export const TRIES = ['sky', 'pillars', 'dash', 'lance', 'mine', 'orbit', 'swap', 'graze', 'bubble', 'tide', 'always', 'snipe', 'vary'];

// 기본 판으로 올린 것(사용자 2026-11-17): 주소 없이 열면 켜진다. 규칙은 아직 여기(실험 틀)에 있고, sim의 createWorld 기본값은 꺼짐 그대로다(시험·고정 해시).
export const BASE_TRIES = ['always', 'vary', 'snipe'];

// 판에 켤 것(화면·봇 도구가 쓴다): 올린 것 + 주소의 ?try=. 'none' = 아무것도(예전 판), '-이름' = 그것만 뺀다, 'all' = 전부
export function gameTries(v) {
  if (v === 'none') return [];
  if (v === 'all') return [...TRIES];
  const list = typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
  const off = list.filter(s => s.startsWith('-')).map(s => s.slice(1));
  return TRIES.filter(t => (BASE_TRIES.includes(t) || list.includes(t)) && !off.includes(t));
}

export function parseTries(v) {
  if (v === 'all') return [...TRIES];
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map(s => s.trim()) : [];
  return TRIES.filter(t => list.includes(t));
}

// 실험의 상태(다 꺼진 빈 틀). 켜는 것은 turnOn이 채운다
function blank(w) {
  return {
    on: {}, names: [],
    rope: { to: null, readyAt: 0, from: null }, anchors: [], pillars: [],
    dashAt: -1, dashHit: [],
    lanceLast: null, mines: [], bubble: null, tide: null, snipe: null,
    swapAt: 0, shotBase: 1, orbitAt: 0, grazeSeen: w.stats.grazes, grazeN: 0,
  };
}

// 실험 하나의 상태를 새로 만들거나(on) 거둔다. 시각은 지금(w.time)부터 잰다 — 판 중에 켜도 처음 켠 것처럼 돈다
function turn(w, name, on) {
  const X = w.tries, T = w.rules.tries;
  if (on) X.on[name] = true; else delete X.on[name];
  X.names = TRIES.filter(t => X.on[t]);
  const roped = !!X.on.sky;
  if (name === 'sky') {
    if (roped && !X.anchors.length) X.anchors = T.rope.anchors.map(([x, z]) => ({ x, z }));
    if (!roped) { X.anchors = []; X.rope.to = null; }
  } else if (name === 'pillars') X.pillars = on ? T.pillars.at.map(([x, z]) => ({ x, z, r: T.pillars.r, hp: T.pillars.hp })) : [];
  else if (name === 'lance') X.lanceLast = on ? new Int32Array(w.bullets.cap) : null;
  else if (name === 'mine') X.mines = [];
  else if (name === 'bubble') X.bubble = on ? { on: false, hp: 0, until: 0, nextAt: w.time + T.bubble.first } : null;
  else if (name === 'tide') {
    if (!on && X.tide && X.tide.area) { const k = w.floorAreas.indexOf(X.tide.area); if (k >= 0) w.floorAreas.splice(k, 1); }
    X.tide = on ? { nextAt: w.time + T.tide.first, area: null } : null;
  }
  else if (name === 'orbit') X.orbitAt = w.time;
  else if (name === 'graze') { X.grazeSeen = w.stats.grazes; X.grazeN = 0; }
  else if (name === 'snipe') X.snipe = on && w.opts.store && !isSword(w) ? { on: false, angle: 0, since: 0, wait: false, target: null, rx: 0, rz: 0, rpx: 0, rpz: 0, firedAt: -1e9, fx: 0, fz: 0, fa: 0 } : null;
  else if (name === 'always') X.shotBase = on ? T.always.shot : 1;
}

export function initTries(w, list) {
  const names = parseTries(list);
  if (!names.length) { w.tries = null; return; }
  w.tries = blank(w);
  for (const n of names) turn(w, n, true);
  if (w.tries.on.always) initAlways(w);
}

// 판 중에 켜고 끈다(카드·방의 특징 — cards.js·stage.js). 모르는 이름·이미 그 상태면 아무것도 하지 않는다.
// always(판 전체의 배율)는 판을 열 때만 켠다 — 여기서 켜도 보스 체력·시작 무기는 바뀌지 않는다.
export function setTry(w, name, on) {
  if (!TRIES.includes(name)) return;
  if (!w.tries) { if (!on) return; w.tries = blank(w); }
  if (!!w.tries.on[name] === !!on) return;
  turn(w, name, !!on);
}

// 늘 나가는 무기: 보스 체력 배율(스테이지 보스 방은 stage.js가 같은 배율로 다시 잰다)과 스테이지 시작 무기. 방 첫 스냅샷보다 먼저여야 한다(world.js가 스테이지보다 먼저 부른다).
function initAlways(w) {
  const A = w.rules.tries.always;
  w.boss.maxHp *= A.bossHp; w.boss.hp *= A.bossHp;
  if (w.opts.stage != null && !w.weapons.on.length && !isSword(w)) w.weapons.on = [A.start];   // 검사는 무기를 들지 않는다
}

// 저격: 틱의 맨 앞(플레이어가 움직이기 전)에 입력을 본다. 조준 중이면 이동·던지기·실험 행동을 지운 입력을 돌려준다.
export function triesAim(w, input) {
  const sn = w.tries && w.tries.snipe;
  if (!sn) return input;
  const Sn = w.rules.tries.snipe, p = w.player;
  const busy = executeActive(w) || autoActive(w) || p.dyingAt != null || !!w.result;
  if (!sn.on) {
    if (!input.hold) { sn.wait = false; return input; }
    if (sn.wait) return input;   // 쏘거나 그만둔 뒤엔 키를 뗐다 다시 눌러야 한다
    if (busy || isDodging(w) || p.store.length < Sn.min || !w.aim) { sn.wait = true; emit(w, 'denied', { what: 'snipe', why: busy ? 'busy' : p.store.length < Sn.min ? 'empty' : !w.aim ? 'target' : 'busy' }); return input; }
    sn.on = true; sn.since = w.time; sn.target = null;
    snipeTrack(w);   // 조준점은 겨눈 적에 붙어 시작한다(적이 없으면 몸 앞 ahead)
    sn.rpx = sn.rx; sn.rpz = sn.rz;
    emit(w, 'snipeStart', { x: p.x, z: p.z, angle: sn.angle });
  }
  if (busy || input.dodge) {   // 회피 = 그만두기(탄은 남는다) — 회피는 그대로 나간다
    sn.on = false; sn.wait = true;
    emit(w, 'snipeCancel', { x: p.x, z: p.z });
    return { ...input, orb: false, move1: false, move2: false };
  }
  sn.rpx = sn.rx; sn.rpz = sn.rz;
  if (input.pickX || input.pickZ) snipePick(w, input.pickX, input.pickZ);   // WASD = 그쪽의 가장 가까운 적
  snipeTrack(w);
  if (!sn.target) {   // 조준하는 사이 적이 다 사라졌다: 허공에 쏘지 않고 그만둔다(탄은 남는다)
    sn.on = false; sn.wait = true;
    emit(w, 'snipeCancel', { x: p.x, z: p.z });
    return { ...input, orb: false, move1: false, move2: false };
  }
  if (!input.hold || w.time - sn.since >= Sn.hold - 1e-9) { snipeFire(w); sn.on = false; sn.wait = !!input.hold; }
  return { ...input, mx: 0, mz: 0, throw: false, orb: false, move1: false, move2: false };   // 조준 중엔 몸이 서고 다른 기술도 쉰다
}

// 조준점을 고른 적에 붙인다. 고른 적이 없거나 죽었으면 가장 가까운 적(겨눈 적)으로. 선은 몸에서 조준점 쪽
function snipeTrack(w) {
  const sn = w.tries.snipe, Sn = w.rules.tries.snipe, p = w.player;
  if (!sn.target || sn.target.dead || !w.foeList.includes(sn.target)) sn.target = w.aim;
  const t = sn.target;
  sn.rx = t ? t.x : p.x + Math.cos(p.face) * Sn.ahead; sn.rz = t ? t.z : p.z + Math.sin(p.face) * Sn.ahead;
  sn.angle = Math.atan2(sn.rz - p.z, sn.rx - p.x);
}

// (dx, dz) = 누른 쪽의 바닥 방향(화면 위·아래·왼쪽·오른쪽). 지금 고른 적에서 그쪽 ±45° 안의 가장 가까운 적을 고른다 — 없으면 그대로
function snipePick(w, dx, dz) {
  const sn = w.tries.snipe, cur = sn.target, len = Math.hypot(dx, dz), cone = Math.cos(w.rules.tries.snipe.pickDeg * Math.PI / 180);
  if (!cur || len < 1e-9) return;
  let best = null, bd = Infinity;
  for (const f of w.foeList) {
    if (f === cur || f.dead) continue;
    const ex = f.x - cur.x, ez = f.z - cur.z, d = Math.hypot(ex, ez);
    if (d < 1e-9 || (ex * dx + ez * dz) / (d * len) < cone - 1e-9) continue;   // 누른 쪽에서 pickDeg 넘게 벗어난 적
    if (d < bd) { bd = d; best = f; }
  }
  if (best) { sn.target = best; emit(w, 'snipePick', { x: best.x, z: best.z }); }
}

function snipeFire(w) {
  const sn = w.tries.snipe, Sn = w.rules.tries.snipe, S = w.rules.store, p = w.player;
  const n = p.store.length, ca = Math.cos(sn.angle), sa = Math.sin(sn.angle), x1 = p.x + ca * Sn.len, z1 = p.z + sa * Sn.len;
  let dmg = 0, stagger = 0;
  for (const o of p.store) { dmg += S.dmg[o.perfect ? 1 : 0]; stagger += o.stagger; }
  dmg *= Sn.mul * throwMul(w);
  p.store.length = 0;
  const marks = [];
  for (const f of [...w.foeList]) {
    if (f.dead || !segCircle(p.x, p.z, x1, z1, f.x, f.z, foeR(w, f) + Sn.width / 2)) continue;
    const dealt = hurtFoe(w, f, dmg, 'throw', { pierce: true });   // 받아친 탄으로 쏜다: 방패·보호를 뚫고, 던진 탄으로 센다
    if (dealt > 0 && f === w.boss) addStagger(w, stagger);
    if (dealt > 0) marks.push({ x: f.x, z: f.z, dmg: dealt });
  }
  sn.firedAt = w.time; sn.fx = p.x; sn.fz = p.z; sn.fa = sn.angle;
  emit(w, 'snipeFire', { x: p.x, z: p.z, angle: sn.angle, n, dmg, hits: marks.length, marks });
  weaponSalvo(w, n, sn.angle, 'snipe');   // 낀 무기의 한 방은 저격 줄을 따라 나간다
}

export const tryOn = (w, name) => !!w.tries && !!w.tries.on[name];

// 키가 필요한 실험이 쓰는 입력 칸: 'orb'(O) · 'move1'(K) · 'move2'(L). 낀 것(w.kit — 카드, cards.js)이 있으면 이동기 칸의 차례를 따르고,
// 없으면(보스전에 ?try=로 켠 판) 갈고리 = move1, 자리 바꾸기 = 갈고리가 켜져 있으면 move2 아니면 move1. 지뢰는 늘 orb. 키가 없는 실험은 null.
export function tryKey(w, name) {
  if (name === 'mine') return 'orb';
  if (name !== 'sky' && name !== 'swap') return null;
  const at = w.kit ? w.kit.move.indexOf(name) : -1;
  if (at >= 0) return at === 0 ? 'move1' : 'move2';
  const X = w.tries;
  return name === 'swap' && X && X.on.sky ? 'move2' : 'move1';
}
export const ropePulling = w => !!w.tries && !!w.tries.rope.to;

// 줄을 걸 말뚝: 가는 쪽(입력)과 가장 잘 맞는 것, 입력이 없으면 보는 쪽. 너무 가깝거나 먼 것은 뺀다.
function pickAnchor(w, input) {
  const T = w.rules.tries.rope, p = w.player;
  let dx = input.mx || 0, dz = input.mz || 0;
  if (dx === 0 && dz === 0) { dx = Math.cos(p.face); dz = Math.sin(p.face); }
  const len = Math.hypot(dx, dz) || 1;
  let best = null, bs = -Infinity;
  for (const a of w.tries.anchors) {
    const ax = a.x - p.x, az = a.z - p.z, d = Math.hypot(ax, az);
    if (d < T.minDist || d > T.range) continue;
    const dot = (ax * dx + az * dz) / (d * len);
    if (dot < T.cone) continue;
    const score = dot * 2 + d / T.range;   // 방향이 먼저, 같으면 먼 쪽
    if (score > bs) { bs = score; best = a; }
  }
  return best;
}

// 플레이어가 움직인 뒤, 몸끼리 전에: 갈고리(누름·끌려감), 돌진 베기
export function triesMove(w, input) {
  const X = w.tries;
  if (!X || w.result) return;
  const R = w.rules, p = w.player;
  if (X.on.sky) {
    const T = R.tries.rope, rope = X.rope, busy = !!w.execute || (p.auto && w.time < p.autoUntil) || p.dyingAt != null || !!p.blade.move;   // 검사의 스킬이 몸을 움직이는 동안은 줄을 놓고, 새로 걸지도 못한다
    if (rope.to && (isDodging(w) || busy)) { rope.to = null; emit(w, 'ropeEnd', { x: p.x, z: p.z, cut: true }); }   // 구르면 줄을 놓는다
    if (input[tryKey(w, 'sky')] && !rope.to) {
      const a = !busy && !isDodging(w) && w.time >= rope.readyAt ? pickAnchor(w, input) : null;
      if (a) { rope.to = a; rope.from = { x: p.x, z: p.z }; rope.readyAt = w.time + T.cooldown; emit(w, 'ropeStart', { x: p.x, z: p.z, ax: a.x, az: a.z }); }
      else emit(w, 'denied', { what: 'rope' });
    }
    if (rope.to) {
      const dx = rope.to.x - p.x, dz = rope.to.z - p.z, d = Math.hypot(dx, dz), step = T.speed * R.dt;
      if (d <= T.stopAt + step) { rope.to = null; emit(w, 'ropeEnd', { x: p.x, z: p.z, cut: false }); }
      else {
        [p.x, p.z] = clampToBoard(R, p.x + dx / d * step, p.z + dz / d * step, R.player.bodyR);
        p.invulnUntil = Math.max(p.invulnUntil, w.time + 2 * R.dt);   // 공중: 끌려가는 동안은 맞지 않는다
      }
    }
  }
  const busy2 = !!w.execute || (p.auto && w.time < p.autoUntil) || p.dyingAt != null || !!p.blade.move;   // 검사의 스킬이 몸을 움직이는 동안은 자리 바꾸기·지뢰도 쉰다
  if (X.on.swap && input[tryKey(w, 'swap')]) {   // 자리 바꾸기: 겨눈 몬스터와(보스와는 안 된다 — 보스의 장판·돌진이 자리에 묶여 있다)
    const t = w.aim, S = R.tries.swap;
    if (t && !t.dead && t !== w.boss && !busy2 && !isDodging(w) && w.time >= X.swapAt) {
      const x0 = p.x, z0 = p.z;
      [p.x, p.z] = clampToBoard(R, t.x, t.z, R.player.bodyR); [t.x, t.z] = clampToBoard(R, x0, z0, t.r);
      p.px = p.x; p.pz = p.z; t.px = t.x; t.pz = t.z;
      p.invulnUntil = Math.max(p.invulnUntil, w.time + S.invuln); X.swapAt = w.time + S.cooldown;
      emit(w, 'swap', { x0, z0, x1: p.x, z1: p.z });
    } else emit(w, 'denied', { what: 'swap' });
  }
  if (X.on.mine && !isSword(w) && input[tryKey(w, 'mine')]) {   // 지뢰: 모은 탄 하나를 발밑에(검사의 O는 마무리 — sword.js)
    if (p.store.length && X.mines.length < R.tries.mine.max && !busy2) { const o = p.store.pop(); X.mines.push({ x: p.x, z: p.z, born: w.time, perfect: o.perfect, stagger: o.stagger }); emit(w, 'mineSet', { x: p.x, z: p.z, n: p.store.length }); if (w.aim && !w.aim.dead) weaponSalvo(w, 1, Math.atan2(w.aim.z - p.z, w.aim.x - p.x), 'mine'); }
    else emit(w, 'denied', { what: 'mine' });
  }
  if (X.on.orbit && p.store.length && w.time >= X.orbitAt) {   // 오라: tick초마다 가까운 적을 깎는다
    const O = R.tries.orbit;
    X.orbitAt = w.time + O.tick;
    for (const f of w.foeList) {
      if (f.dead || Math.hypot(f.x - p.x, f.z - p.z) > O.R + foeR(w, f)) continue;
      hurtFoe(w, f, O.dps * p.store.length * O.tick, 'weapon', { pierce: true });
      emit(w, 'orbitHit', { x: f.x, z: f.z });
    }
  }
  if (X.on.graze) {   // 스침 모으기
    X.grazeN += w.stats.grazes - X.grazeSeen; X.grazeSeen = w.stats.grazes;
    while (X.grazeN >= R.tries.graze.per) { X.grazeN -= R.tries.graze.per; if (!storeAdd(w, { perfect: false, gold: false, stagger: R.reflect.staggerNormal, x: p.x, z: p.z, kind: 'graze' })) X.grazeN = 0; }
  }
  if (X.on.dash && isDodging(w)) {
    const T = R.tries.dash, d = p.dodge;
    if (X.dashAt !== d.startedAt) { X.dashAt = d.startedAt; X.dashHit.length = 0; }
    for (const f of w.foeList) {
      if (f.dead || X.dashHit.includes(f)) continue;
      if (!segCircle(p.px, p.pz, p.x, p.z, f.x, f.z, foeR(w, f) + R.player.bodyR)) continue;
      X.dashHit.push(f);
      const dealt = hurtFoe(w, f, T.dmg, 'weapon', { pierce: true });
      emit(w, 'dashHit', { x: f.x, z: f.z, dmg: dealt });
    }
  }
}

// 몸끼리 뒤: 기둥은 누구의 몸도 지나가지 못한다
export function triesBodies(w) {
  const X = w.tries;
  if (!X || !X.pillars.length) return;
  const R = w.rules, p = w.player, b = w.boss, through = !!p.blade.move && p.blade.move.kind === 'slash';   // 검사의 일섬은 기둥도 지나간다(끝에 겹치면 선 틱에 밀려난다)
  for (const c of X.pillars) {
    if (!through) [p.x, p.z] = clampToBoard(R, ...slideOut(p.x, p.z, R.player.bodyR, c.x, c.z, c.r), R.player.bodyR);
    if (!b.away && !b.dead) [b.x, b.z] = clampToBoard(R, ...slideOut(b.x, b.z, R.boss.r, c.x, c.z, c.r), R.boss.r);
    for (const m of w.enemies) if (!m.dead && w.time >= m.bornAt) [m.x, m.z] = clampToBoard(R, ...slideOut(m.x, m.z, m.r, c.x, c.z, c.r), m.r);
  }
}

// 탄이 움직인 뒤, 판정 전: 기둥이 적 탄과 평타를 막고, 지뢰가 터지고, 보호막·밀물이 돈다
export function triesBullets(w) {
  const X = w.tries;
  if (!X) return;
  const R = w.rules, p = w.player, T = R.tries;
  if (X.pillars.length) {
    const b = w.bullets, s = w.shots;
    for (let k = X.pillars.length - 1; k >= 0; k--) if (X.pillars[k].hp <= 0) { emit(w, 'pillarBreak', { x: X.pillars[k].x, z: X.pillars[k].z }); X.pillars.splice(k, 1); }   // 막을 만큼 막으면 무너진다
    for (const c of X.pillars) {
      for (let i = 0; i < b.cap; i++) {
        if (!b.alive[i] || (b.kind[i] !== K.NORMAL && b.kind[i] !== K.RED) || w.time < b.holdUntil[i]) continue;   // 흰·금(받아칠 것)과 던진 탄은 넘어간다
        if (!segCircle(b.px[i], b.pz[i], b.x[i], b.z[i], c.x, c.z, c.r + b.r[i])) continue;
        emit(w, 'pillarBlock', { x: b.x[i], z: b.z[i], enemy: true });
        killBullet(w, i);
        c.hp--;
      }
      for (let i = 0; i < s.cap; i++) {
        if (!s.alive[i] || !segCircle(s.px[i], s.pz[i], s.x[i], s.z[i], c.x, c.z, c.r)) continue;
        s.alive[i] = 0;
        emit(w, 'pillarBlock', { x: s.x[i], z: s.z[i], enemy: false });
      }
    }
  }
  for (let k = X.mines.length - 1; k >= 0; k--) {   // 지뢰: 놓고 arm초 뒤부터, 적의 몸이 닿으면 둘레 R 안의 적이 다친다
    const m = X.mines[k], Mi = T.mine;
    if (w.time < m.born + Mi.arm || !w.foeList.some(f => !f.dead && Math.hypot(f.x - m.x, f.z - m.z) <= foeR(w, f) + Mi.touch)) continue;
    X.mines.splice(k, 1);
    emit(w, 'mineBoom', { x: m.x, z: m.z });
    for (const f of w.foeList) {
      if (f.dead || Math.hypot(f.x - m.x, f.z - m.z) > Mi.R + foeR(w, f)) continue;
      hurtFoe(w, f, (m.perfect ? R.store.dmg[1] : R.store.dmg[0]) * Mi.mul * throwMul(w), 'throw', { pierce: true });
      if (f === w.boss) addStagger(w, m.stagger);
    }
  }
  if (X.bubble && !w.boss.away && !w.boss.dead) {   // 보호막: first초 뒤부터 every초마다 sec초(깨지면 바로 걷힌다 — foes.hurtFoe)
    const Bb = X.bubble, Bu = T.bubble;
    if (!Bb.on && w.time >= Bb.nextAt - 1e-9) { Bb.on = true; Bb.hp = Bu.hits; Bb.until = w.time + Bu.sec; emit(w, 'bubbleOn', { x: w.boss.x, z: w.boss.z }); }
    else if (Bb.on && w.time >= Bb.until - 1e-9) { Bb.on = false; Bb.nextAt = w.time + Bu.every; emit(w, 'bubbleOff', { x: w.boss.x, z: w.boss.z }); }
  }
  if (X.tide) {   // 밀물: 판의 반쪽(왼·오른쪽 무작위)에 예고 → warn초 뒤 그 반쪽에 선 몸이 다친다(빨강 — 건너가거나 구른다)
    const Td = X.tide, Ti = T.tide, hx = R.board.hx, hz = R.board.hz;
    if (!Td.area && w.time >= Td.nextAt - 1e-9) {
      const side = w.rng.next() < 0.5 ? -1 : 1;
      Td.area = { kind: 'tide', shape: 'lane', x: side < 0 ? -hx : 0, z: 0, face: 0, len: hx, width: hz * 2, color: 'red', warn: Ti.warn, born: w.time, hit: false, side };
      w.floorAreas.push(Td.area);
      emit(w, 'tideWarn', { side });
    }
    const a = Td.area;
    if (a && !a.hit && w.time >= a.born + a.warn - 1e-9) {
      a.hit = true;
      emit(w, 'tideHit', { side: a.side });
      if (p.x * a.side > -R.player.bodyR) resolveHit(w, { color: 'red', src: R.src.tide, dmg: Ti.dmg, stagger: [0, 0], kindName: 'tide', x: p.x - a.side, z: p.z });
    }
    if (a && a.hit && w.time >= a.born + a.warn + Ti.linger) { const k = w.floorAreas.indexOf(a); if (k >= 0) w.floorAreas.splice(k, 1); Td.area = null; Td.nextAt = w.time + Ti.every; }
  }
  if (X.lanceLast && p.throwSum) { const b = w.bullets; let flying = false; for (let i = 0; i < b.cap && !flying; i++) flying = !!b.alive[i] && !!b.thrown[i]; if (!flying) p.throwSum = 0; }
}
