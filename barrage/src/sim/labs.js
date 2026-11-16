// 상황 되풀이 장면(§8 ?lab=): 판 대신 한 상황만 되풀이한다 — 손맛을 한 동작씩 다듬고 사용자가 연습하는 곳.
// opts.lab이면 보스 두뇌(thinkBoss) 대신 LABS[lab].think가 돈다. 장면에서는 체력이 1 밑으로 내려가지 않는다(player.js).
import { K } from './rules.js';
import { emit } from './events.js';
import { spawnBullet } from './bullets.js';
import { bossGroggy } from './boss.js';
import { startPattern, updatePattern, windupColor } from './patterns.js';
import { startRush, updateRush, startCombo, updateCombo } from './melee.js';
import { clampToBoard } from './geom.js';

const aim = w => Math.atan2(w.player.z - w.boss.z, w.player.x - w.boss.x);
function fire(w, kind, a, speed) {
  const m = w.rules.patterns.muzzle, x = w.boss.x + Math.cos(a) * m, z = w.boss.z + Math.sin(a) * m;
  const id = spawnBullet(w, kind, x, z, a, speed, 0);
  if (id >= 0) emit(w, 'fire', { kind: w.bullets.kind[id], x, z, id });
}
const windup = (w, color, id = 0) => emit(w, 'windup', { color, kind: 'pattern', id, sparse: false });

// 박자 장면: every초마다 준비 번쩍임 → lead초 뒤 shot(w)
function beat(every, lead, color, shot) {
  return {
    setup(w) { w.lab = { next: 0.5, fireAt: Infinity }; },
    think(w) {
      const L = w.lab;
      if (w.time >= L.next) { windup(w, color); L.fireAt = w.time + lead; L.next = w.time + every; }
      if (w.time >= L.fireAt) { L.fireAt = Infinity; shot(w); }
    },
  };
}

// 패턴 되풀이 장면
function loopPattern(id, breath, opts = {}) {
  return {
    setup(w) { w.lab = { run: null, next: 0.5 }; },
    think(w) {
      const L = w.lab;
      if (L.run) { if (updatePattern(w, L.run)) { L.run = null; L.next = w.time + breath; } return; }
      if (w.time >= L.next) {
        windup(w, opts.color ?? windupColor(id), id);
        L.run = startPattern(w, id, opts);
        w.boss.run = L.run;
      }
    },
  };
}

function nearBoss(w) {
  const p = w.player, R = w.rules, gap = R.boss.r + R.player.bodyR + R.rush.gap;
  let [x, z] = clampToBoard(R, p.x + gap, p.z, R.boss.r);
  if (Math.hypot(x - p.x, z - p.z) < gap - 0.01) [x, z] = clampToBoard(R, p.x - gap, p.z, R.boss.r);
  w.boss.x = w.boss.px = x; w.boss.z = w.boss.pz = z;
}

export const LABS = {
  // 흰 탄 한 발씩 1초 박자
  parry: beat(1.0, 0.4, 'white', w => fire(w, K.WHITE, aim(w), 14)),
  // 0.4초마다 흰 탄 + 그 둘레 보통 탄 4발 부채
  stream: beat(0.4, 0.2, 'white', w => {
    const a = aim(w), D = Math.PI / 180;
    fire(w, K.WHITE, a, 14);
    for (const d of [-16, -8, 8, 16]) fire(w, K.NORMAL, a + d * D, 11);
  }),
  // 붙어서 콤보 A → 1.2초 → 콤보 B 되풀이
  melee: {
    setup(w) { w.lab = { combo: null, next: 0.6, flip: false }; nearBoss(w); },
    think(w) {
      const L = w.lab;
      if (L.combo) { if (updateCombo(w)) { L.combo = null; L.next = w.time + 1.2; } return; }
      if (w.time >= L.next) { nearBoss(w); L.combo = L.flip ? 'B' : 'A'; L.flip = !L.flip; emit(w, 'meleeStart', { combo: L.combo }); startCombo(w, L.combo); }
    },
  },
  // 먼 모서리로 돌아가 돌진 + 콤보 A 되풀이
  rush: {
    setup(w) { w.lab = { stage: 'wait', next: 0.6 }; },
    think(w) {
      const L = w.lab, b = w.boss, p = w.player, R = w.rules;
      if (L.stage === 'rush') { if (updateRush(w)) { startCombo(w, 'A'); L.stage = 'combo'; } return; }
      if (L.stage === 'combo') { if (updateCombo(w)) { L.stage = 'wait'; L.next = w.time + 1.0; } return; }
      if (w.time >= L.next) {
        const cx = p.x > 0 ? -R.board.hx + R.boss.r : R.board.hx - R.boss.r, cz = p.z > 0 ? -R.board.hz + R.boss.r : R.board.hz - R.boss.r;
        b.x = b.px = cx; b.z = b.pz = cz;
        startRush(w, 'A'); L.stage = 'rush';
      }
    },
  },
  // 빨간 창 되풀이
  dodge: loopPattern(3, 0.8),
  // 흰 없는 조준 부채 되풀이(스침 연습)
  graze: {
    setup(w) { w.lab = { next: 0.5, k: 0 }; },
    think(w) {
      const L = w.lab, D = Math.PI / 180;
      if (w.time < L.next) return;
      if (L.k === 0) windup(w, 'purple');
      const a = aim(w);
      for (let i = -3; i <= 3; i++) fire(w, K.NORMAL, a + i * 40 / 6 * D, 11);
      L.k = (L.k + 1) % 3;
      L.next = w.time + (L.k === 0 ? 1.1 : 0.35);
    },
  },
};

export const labName = name => (name && LABS[name] ? name : null);

export function setupLab(w) {
  const lab = LABS[w.opts.lab];
  w.boss.hp = w.boss.maxHp = 1e7;
  if (w.opts.lab === 'parry' || w.opts.lab === 'stream' || w.opts.lab === 'graze') {
    w.player.x = w.player.px = -2; w.player.z = w.player.pz = 0;
    w.boss.x = w.boss.px = 6; w.boss.z = w.boss.pz = 0;
  }
  lab.setup(w);
}

// 그로기 동안은 쉬었다가 잇는다(무력화가 차는 맛도 장면에서 보이게).
export function thinkLab(w) {
  if (bossGroggy(w) || w.time < (w.boss.stunUntil ?? -1)) {
    // 쉬는 동안 하던 근접은 끝낸다(맞은 장판이 남아 있지 않게 — 두뇌의 cancelAll과 같은 몫)
    if (w.melee.combo || w.melee.areas.length) { w.melee.combo = null; w.melee.areas.length = 0; }
    return;
  }
  LABS[w.opts.lab].think(w);
}
