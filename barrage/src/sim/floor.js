// 빠르고 멀리 닿는 장판 공격(§5.3) — 보스에게 동작이 없으니 피할 단서는 장판이다. 멀리 있어도 반드시 대응해야 한다.
//  몸통 박치기: 보스 몸 너비 줄이 판 끝까지(발사 0.2초 전까지 따라옴) → 30 U/s로 들이받음. 몸이 닿는 순간이 타격.
//  지면 파도: 보스 둘레 원 0.4초 → 고리가 판 끝까지 퍼짐(걸어서는 못 피함). 앞면이 몸을 지나는 순간이 타격.
//  검기: 12 U 앞까지 가는 부채꼴 0.4초 → 한 번에.
// 판정은 근접과 같은 resolveHit(패링·아슬아슬·맞음). w.floor = 진행 중인 공격 하나, w.waves = 퍼지는 파도들(따로 이어 간다).
import { emit } from './events.js';
import { inSector, clampToBoard } from './geom.js';
import { separateBodies } from './boss.js';
import { resolveHit } from './melee.js';
import { openCounterChance } from './rewards.js';
import { reach } from './beams.js';

const D = Math.PI / 180;
const aimAt = w => Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x);
const inset = (R, r) => ({ hx: R.board.hx - r, hz: R.board.hz - r });

export function startSlam(w, color) {
  const R = w.rules, F = R.floor.slam, b = w.boss, face = aimAt(w);
  const area = { kind: 'slam', shape: 'lane', x: b.x, z: b.z, face, len: reach(R.board, b.x, b.z, face), width: F.width, color, warn: F.warn, born: w.time, hit: false };
  w.floorAreas.push(area);
  w.floor = { kind: 'slam', color, born: w.time, area, phase: 'warn', hitDone: false, left: 0 };
  b.face = face;
  emit(w, 'windup', { color, kind: 'slam' });
  emit(w, 'slamStart', { color, x: b.x, z: b.z, angle: face });
}

export function startWave(w, color) {
  const R = w.rules, F = R.floor.wave, b = w.boss;
  const area = { kind: 'wave', shape: 'circle', x: b.x, z: b.z, face: aimAt(w), R: R.boss.r + F.teleR, half: Math.PI, color, warn: F.warn, born: w.time, hit: false };
  w.floorAreas.push(area);
  w.floor = { kind: 'wave', color, born: w.time, area };
  emit(w, 'windup', { color, kind: 'wave' });
}

export function startSword(w, color) {
  const R = w.rules, F = R.floor.sword, b = w.boss, face = aimAt(w);
  const area = { kind: 'sword', shape: 'sector', x: b.x, z: b.z, face, R: F.R, half: F.halfDeg * D, color, warn: F.warn, born: w.time, hit: false };
  w.floorAreas.push(area);
  w.floor = { kind: 'sword', color, born: w.time, area };
  b.face = face;
  emit(w, 'windup', { color, kind: 'sword' });
  emit(w, 'swordStart', { color, x: b.x, z: b.z, angle: face });
}

function dropArea(w, area) { const k = w.floorAreas.indexOf(area); if (k >= 0) w.floorAreas.splice(k, 1); }
function finish(w) { if (w.floor?.area) dropArea(w, w.floor.area); w.floor = null; return true; }

// 진행 중인 장판 공격 하나를 잇는다. 끝나면 true(파도는 퍼지기 시작하면 끝 — 고리는 updateWaves가 잇는다).
export function updateFloor(w) {
  const f = w.floor, R = w.rules, b = w.boss, p = w.player;
  if (!f) return true;
  if (f.kind === 'slam') {
    const F = R.floor.slam, a = f.area;
    if (f.phase === 'warn') {
      if (w.time < f.born + F.warn - F.lockBefore) { a.face = aimAt(w); a.len = reach(R.board, b.x, b.z, a.face); b.face = a.face; }
      if (w.time < f.born + F.warn - 1e-9) return false;
      f.phase = 'dash'; a.hit = true;
      f.left = reach(inset(R, R.boss.r), b.x, b.z, a.face);
      if (f.left < 0.05) { emit(w, 'slamWall', { color: f.color, x: b.x, z: b.z }); return finish(w); }
    }
    const step = Math.min(F.speed * R.dt, f.left), bx0 = b.x, bz0 = b.z, px0 = p.x, pz0 = p.z;
    b.x += Math.cos(a.face) * step; b.z += Math.sin(a.face) * step; f.left -= step;
    [b.x, b.z] = clampToBoard(R, b.x, b.z, R.boss.r);
    // 구석에 몰린 플레이어: 옆으로 밀 수 없으면(한 틱에 maxShove 넘게) 보스가 그 앞에서 멈춘다 — 몸 너머로 순간이동시키지 않는다
    const shoved = () => Math.hypot(p.x - px0, p.z - pz0) > F.maxShove;
    if (!f.hitDone && Math.hypot(p.x - b.x, p.z - b.z) < R.boss.r + R.player.bodyR) {
      f.hitDone = true;
      if (f.color === 'red') w.redHitAt = w.time;
      const res = resolveHit(w, { color: f.color, src: R.src.slam, dmg: F.dmg, stagger: [F.stagger, F.stagger], kindName: 'slam' });
      emit(w, 'slamHit', { outcome: res.outcome, color: f.color, x: b.x, z: b.z });
      if (res.outcome === 'parry' || res.outcome === 'perfect') {
        if (f.color === 'gold') openCounterChance(w, 'goldSlam');
        else b.stunUntil = Math.max(b.stunUntil ?? -1, w.time + F.stun);
        separateBodies(w);
        if (shoved()) { b.x = bx0; b.z = bz0; p.x = px0; p.z = pz0; }
        return finish(w);   // 받아내면 보스가 그 자리에서 멈춘다
      }
      if (res.outcome === 'roll' && res.newRed) openCounterChance(w, 'redDodge');
    }
    separateBodies(w);   // 길에 선 플레이어는 옆으로 밀려난다
    if (shoved()) { b.x = bx0; b.z = bz0; p.x = px0; p.z = pz0; emit(w, 'slamWall', { color: f.color, x: b.x, z: b.z }); return finish(w); }
    if (f.left <= 1e-9) { if (f.color === 'red' && !f.hitDone) w.redHitAt = w.time; emit(w, 'slamWall', { color: f.color, x: b.x, z: b.z }); return finish(w); }
    return false;
  }
  // 파도: 예고 뒤 고리가 퍼진다. 고리가 플레이어에 닿거나 판을 나갈 때까지 이 공격은 끝나지 않는다(그동안 주 패턴과 겹치지 않게, §5.3).
  if (f.kind === 'wave') {
    if (!f.wave) {
      if (w.time < f.born + R.floor.wave.warn - 1e-9) return false;
      f.wave = { x: b.x, z: b.z, r: R.boss.r, color: f.color, born: w.time, hitDone: false, gapAngle: null };
      w.waves.push(f.wave);
      f.area.hit = true; dropArea(w, f.area);
      emit(w, 'waveStart', { color: f.color, x: b.x, z: b.z });
      return false;
    }
    if (f.wave.hitDone || !w.waves.includes(f.wave)) { w.floor = null; return true; }
    return false;
  }
  if (f.kind === 'sword') {
    const F = R.floor.sword, a = f.area;
    if (!a.hit && w.time >= f.born + F.warn - 1e-9) {
      a.hit = true;
      if (f.color === 'red') w.redHitAt = w.time;
      emit(w, 'meleeHit', { shape: 'sector', color: f.color, x: a.x, z: a.z, sword: true });
      if (inSector(p.x, p.z, R.player.bodyR, a.x, a.z, a.R, a.face, a.half)) {
        const res = resolveHit(w, { color: f.color, src: R.src.sword, dmg: F.dmg, stagger: F.stagger, kindName: 'sword' });
        if (res.outcome === 'roll' && res.newRed) openCounterChance(w, 'redDodge');
      }
    }
    if (a.hit && w.time >= f.born + F.warn + F.active - 1e-9) return finish(w);
    return false;
  }
  return finish(w);
}

// 퍼지는 파도: 앞면이 몸을 처음 지나는 틱에 한 번 판정, 판 네 모서리를 넘으면 지운다.
export function updateWaves(w) {
  const R = w.rules, F = R.floor.wave, p = w.player;
  for (let k = w.waves.length - 1; k >= 0; k--) {
    const v = w.waves[k];
    v.r += F.speed * R.dt;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    if (!v.hitDone && d + R.player.bodyR >= v.r - F.thick && d - R.player.bodyR <= v.r) {
      v.hitDone = true;
      if (v.color === 'red') w.redHitAt = w.time;
      const res = resolveHit(w, { color: v.color, src: R.src.wave, dmg: F.dmg, stagger: F.stagger, kindName: 'wave', x: p.x, z: p.z });
      if (res.outcome === 'parry' || res.outcome === 'perfect') v.gapAngle = Math.atan2(p.z - v.z, p.x - v.x);   // 받아낸 자리만 고리가 끊긴다
      emit(w, 'waveHit', { outcome: res.outcome, color: v.color, x: p.x, z: p.z });
      if (res.outcome === 'roll' && res.newRed) openCounterChance(w, 'redDodge');
    }
    const far = Math.max(...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => Math.hypot(sx * R.board.hx - v.x, sz * R.board.hz - v.z)));
    if (v.r - F.thick > far) w.waves.splice(k, 1);
  }
}

export function clearFloor(w) { w.floor = null; w.floorAreas.length = 0; w.waves.length = 0; }
