// 그로기 처형(§5.8): 그로기 동안 보스 곁에서 패링 키 → 달려듦 → 붙어 쏘기(시간표 shots) → 큰 한 발(final) → 물러남(back).
// 연출은 "영화처럼" 하나(빠른 쪽과 비교해 사용자가 고름 — 동작이 생기면 올라타기 같은 처형으로 바꿀 자리).
// 무기는 총·활 — 칼 대신 바짝 붙어 쏜다. 피해는 그로기 배율 없이 정확히 share × 최대 체력, 끝나면 그로기도 끝(두뇌가 깨어남을 낸다).
// 처형 중 플레이어는 무적(autoUntil)이고 sim이 움직인다. 누른 회피는 기억했다가 끝날 때 내고, 패링 누름은 버린다(깨어나는 보스에 헛패링이 되므로).
import { emit } from './events.js';
import { clampToBoard } from './geom.js';
import { bossGroggy, damageBoss, separateBodies } from './boss.js';

export const executeActive = w => !!w.execute;

export function canExecute(w) {
  const R = w.rules, b = w.boss, p = w.player;
  if (w.execute || w.result || b.dead || !bossGroggy(w)) return false;
  return Math.hypot(p.x - b.x, p.z - b.z) <= R.boss.r + R.player.bodyR + R.execute.reach;
}

export function startExecute(w) {
  const R = w.rules, E = R.execute, p = w.player, b = w.boss;
  const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz) || 1;
  const [toX, toZ] = clampToBoard(R, b.x + dx / d * E.standOff, b.z + dz / d * E.standOff, R.player.bodyR);
  const end = w.time + E.final + E.back;
  w.execute = { start: w.time, fromX: p.x, fromZ: p.z, toX, toZ, shot: 0, fired: false, total: E.share * b.maxHp, dealt: 0, buffered: null, away: 0 };
  p.buffer.parryUntil = -1;
  p.autoUntil = Math.max(p.autoUntil ?? -1, end);            // 무적
  b.groggyUntil = Math.max(b.groggyUntil, end + R.dt);        // 처형이 끝날 때까지 그로기
  p.parry.active = false;
  emit(w, 'executeStart', { x: p.x, z: p.z, bx: b.x, bz: b.z });
}

function deal(w, amount) {
  const e = w.execute;
  e.dealt += damageBoss(w, amount, 'execute', true);
}

// 끝내기. 다른 피해(날아가던 탄·되튄 탄)로 보스가 죽어 판이 끝나면 world.step이 부른다 — 처형·검은 띠가 남지 않게.
export function endExecute(w) {
  const R = w.rules, e = w.execute, p = w.player;
  w.boss.groggyUntil = Math.min(w.boss.groggyUntil, w.time + R.dt);   // 다음 틱부터 그로기 아님
  p.autoUntil = w.time + R.dt;
  if (e.buffered === 'dodge') p.buffer.dodgeUntil = w.time + R.dt + R.player.buffer;
  w.execute = null;
  emit(w, 'executeEnd', { x: p.x, z: p.z });
}

export function stepExecute(w, input) {
  const R = w.rules, E = R.execute, e = w.execute, p = w.player, b = w.boss;
  if (input.dodge) e.buffered = 'dodge';
  const t = w.time + R.dt - e.start;
  if (!e.fired) {
    // 달려듦
    const u = Math.min(1, t / E.dashIn);
    [p.x, p.z] = clampToBoard(R, e.fromX + (e.toX - e.fromX) * u, e.fromZ + (e.toZ - e.fromZ) * u, R.player.bodyR);
    separateBodies(w);
    p.face = Math.atan2(b.z - p.z, b.x - p.x);
    // 붙어 쏘기: 한 발 = 피해의 shotShare
    while (e.shot < E.shots.length && t >= E.shots[e.shot] - 1e-9) {
      deal(w, e.total * E.shotShare);
      emit(w, 'executeShot', { i: e.shot, x: p.x, z: p.z, bx: b.x, bz: b.z });
      e.shot++;
      if (b.dead) return endExecute(w);
    }
    // 큰 한 발: 남은 몫 전부, 보스를 뒤로 밀어낸다
    if (t >= E.final - 1e-9) {
      e.fired = true;
      const dmg = e.total - e.dealt;
      deal(w, dmg);
      const ax = b.x - p.x, az = b.z - p.z, d = Math.hypot(ax, az) || 1;
      emit(w, 'executeFinal', { x: p.x, z: p.z, bx: b.x, bz: b.z, dmg, total: e.total });
      [b.x, b.z] = clampToBoard(R, b.x + ax / d * E.knock, b.z + az / d * E.knock, R.boss.r);
      separateBodies(w);
      e.away = Math.atan2(p.z - b.z, p.x - b.x);
      if (b.dead) return endExecute(w);
    }
  } else {
    // 물러남
    const k = E.backDist / E.back * R.dt;
    [p.x, p.z] = clampToBoard(R, p.x + Math.cos(e.away) * k, p.z + Math.sin(e.away) * k, R.player.bodyR);
    separateBodies(w);
  }
  if (t >= E.final + E.back - 1e-9) endExecute(w);
}
