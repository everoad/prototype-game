// 검사(근접 캐릭터 — 설계 2026-11-17-barrage-sword-design.md): 주소 char=sword로 여는 두 번째 캐릭터. 수치는 RULES.sword.
// 기본 공격은 사거리가 있는 칼바람이고 무기가 없다. 받아쳐 모은 칸(player.store)을 스킬로 쓴다 — U 일섬 · I 회전 베기 · O 마무리.
// 칼바람이 맞는 동안 칸이 조금씩 차고, 내 둘레에 들어온 적 탄은 느려진다(bullets.moveBullets) — 사수보다 안쪽에서 싸운다.
// 검사의 규칙은 이 파일에 모으고 w.opts.char === 'sword'일 때만 끼어든다(사수 판은 한 틱도 바뀌지 않는다).
import { emit } from './events.js';
import { clampToBoard, segCircle } from './geom.js';
import { hurtFoe, foeR } from './foes.js';
import { addStagger } from './boss.js';
import { executeActive } from './execute.js';
import { autoActive } from './rewards.js';
import { isDodging } from './player.js';
import { storeAdd } from './store.js';
import { swordsOnCut } from './swords.js';

export const CHARS = ['gunner', 'sword'];   // 캐릭터 고르기(?char=) — 모르는 값은 사수

export const isSword = w => w.opts.char === 'sword';

// 스킬의 형태(설계 2026-11-18-barrage-run-growth-design.md §3 — 수치는 RULES.sword.forms): 같은 스킬이 설정에 따라 다른 물건이 된다. 지금은 일섬 둘뿐이고 판을 열 때 정한다(w.forms).
//  잇는 일섬(chain): 한 칸으로 n번까지. 깊은 일섬(deep): 한 칸에 한 번, 세게. 형태가 없으면(null) 지금 그대로다.
export function parseForms(rules, forms) {
  const s = forms && typeof forms.slash === 'string' && Object.hasOwn(rules.sword.forms.slash, forms.slash) ? forms.slash : null;
  return s ? { slash: s } : null;
}
const slashForm = w => (w.forms ? w.forms.slash : null);
// 잇는 일섬이 이어지는 중인가: 남은 횟수가 있고 창(선 뒤 window초)이 열려 있다. 가는 동안에도 참이다(미리 누른 U를 받는다). 화면(남은 횟수)과 봇도 쓴다.
export const chainLive = w => { const c = isSword(w) ? w.player.blade.chain : null; return !!c && c.left > 0 && w.time <= c.until + 1e-9; };
export const chainLeft = w => (chainLive(w) ? w.player.blade.chain.left : 0);
// 일섬이 지나갈 적: 보통은 겨눈 적. 잇는 일섬이 이어지는 동안은 이번 묶음에서 아직 안 벤 가까운 적 → 없으면 방금 벤 적이 아닌 가까운 적 → 그것도 없으면 겨눈 적(같은 적을 되지나간다).
function slashTarget(w) {
  const t = w.aim;
  if (!chainLive(w)) return t;
  const p = w.player, c = p.blade.chain, reach = w.rules.sword.slash.reach, alive = (w.foeList ?? []).filter(f => !f.dead);
  const near = list => { let best = null, bd = Infinity; for (const f of list) { const d = Math.hypot(f.x - p.x, f.z - p.z) - foeR(w, f); if (d <= reach + 1e-9 && d < bd) { bd = d; best = f; } } return best; };
  return near(alive.filter(f => !c.cut.includes(f))) ?? near(alive.filter(f => f !== c.last)) ?? t;
}

// 칼바람(기본 공격 — 사수의 자동 사격 자리): every초마다 겨눈 적 쪽으로 하나. range만큼 날아가며 닿는 적을 한 번씩 벤다(엄폐 기둥에는 막힌다 — 평타와 같다).
// 구르는 동안 · 스킬이 몸을 움직이는 동안 · 처형 중에는 쉰다. 맞힌 칼바람마다(적 수와 무관하게 한 번) 칸이 조금 찬다 — 사거리 안에서 싸우는 만큼 스킬이 자주 나온다.
export function swordWaves(w) {
  if (!isSword(w)) return;
  const p = w.player, B = p.blade, Wv = w.rules.sword.wave, R = w.rules, t = w.aim;
  if (!w.result && t && !t.dead && !w.execute && !B.move && !isDodging(w) && w.time + 1e-9 >= B.cutAt) {
    B.cutAt = w.time + Wv.every;
    const a = Math.atan2(t.z - p.z, t.x - p.x);
    B.cutN++;
    B.cuts.push({ x: p.x, z: p.z, px: p.x, pz: p.z, a, left: Wv.range, hit: [], scored: false, side: B.cutN % 2 ? 1 : -1 });   // side = 좌우 번갈아(보이는 모양만 — 판정은 같다)
    emit(w, 'bladeWave', { x: p.x, z: p.z, angle: a, side: B.cutN % 2 ? 1 : -1 });   // side = 어느 쪽 칼이 냈나(좌우 번갈아)
  }
  const pillars = w.tries ? w.tries.pillars : null;
  for (let k = B.cuts.length - 1; k >= 0; k--) {
    const c = B.cuts[k], step = Math.min(c.left, Wv.speed * R.dt);
    c.px = c.x; c.pz = c.z;
    c.x += Math.cos(c.a) * step; c.z += Math.sin(c.a) * step; c.left -= step;
    if (pillars && pillars.some(q => segCircle(c.px, c.pz, c.x, c.z, q.x, q.z, q.r))) { emit(w, 'pillarBlock', { x: c.x, z: c.z, enemy: false }); B.cuts.splice(k, 1); continue; }
    for (const f of [...w.foeList]) {
      if (f.dead || c.hit.includes(f) || !segCircle(c.px, c.pz, c.x, c.z, f.x, f.z, foeR(w, f) + Wv.r)) continue;
      c.hit.push(f);
      const dealt = hurtFoe(w, f, Wv.dmg, 'shot', { fromX: c.px, fromZ: c.pz });   // 기본 공격으로 적는다(방패·보호에는 막힌다)
      if (f === w.boss) emit(w, 'bossHit', { x: c.x, z: c.z });
      const fr = foeR(w, f);
      emit(w, 'waveHit', { x: f.x - Math.cos(c.a) * fr, z: f.z - Math.sin(c.a) * fr, angle: c.a, side: c.side });   // 맞힌 자리(적 몸 표면의 칼바람이 온 쪽) — 화면이 엇갈린 칼자국을 낸다
      if (dealt > 0 && !c.scored) { c.scored = true; charge(w, f); }
    }
    if (c.left <= 1e-9) B.cuts.splice(k, 1);
  }
}

// 맞힌 칼바람 하나만큼 칸이 찬다. 다 차면 보통 칸 하나(패링으로 받은 칸이 더 좋다 — 완벽이면 피해·무너짐·회복이 크다). 가득이면 더 차지 않는다.
function charge(w, f) {
  const p = w.player, B = p.blade, Wv = w.rules.sword.wave;
  if (p.store.length >= p.storeCap) return;
  B.charge += Wv.every / Wv.charge;
  if (B.charge < 1 - 1e-9) return;
  B.charge = Math.max(0, B.charge - 1);
  storeAdd(w, { perfect: false, gold: false, stagger: w.rules.reflect.staggerNormal, x: f.x, z: f.z, kind: 'cut' });
}

// 스킬과 그 키(입력 칸): U = throw, I = spin, O = orb. 한 틱에 여럿을 누르면 앞의 것.
const SKILLS = ['slash', 'spin', 'finish'];
const KEY = { slash: 'throw', spin: 'spin', finish: 'orb' };

// 못 쓰는 때: 처형·자동 반격 중, 구제 창(체력 0), 판이 끝남
const busy = w => executeActive(w) || autoActive(w) || w.player.dyingAt != null || !!w.result || (!w.boss.away && w.boss.dead);

// 한 칸을 쓴다(가장 먼저 모은 것부터): 그 자리에서 회복하고 칸의 값을 돌려준다
function spend(w) {
  const p = w.player, S = w.rules.store, o = p.store.shift(), before = p.hp;
  p.hp = Math.min(w.rules.player.hp, p.hp + (o.perfect ? S.heal[1] : S.heal[0]));
  w.stats.healed += p.hp - before;
  return { dmg: o.perfect ? S.dmg[1] : S.dmg[0], stagger: o.stagger, perfect: !!o.perfect, heal: p.hp - before };
}

// 적 하나를 벤다: 받아친 탄으로 베므로 방패·보호를 지난다. 몬스터에게는 mob배(무너짐·처형이 없는 몫), 보스에게는 무너짐.
// 특성(설계 §8 — 자국·맞부딪힘·되찾기·등 베기·틈 베기)이 끼어들 자리가 여기다.
function cut(w, f, skill, dmg, stagger, orbs = 1, swords = null) {
  const boss = f === w.boss, x = f.x, z = f.z;
  const dealt = hurtFoe(w, f, dmg * (boss ? 1 : w.rules.sword.mob), 'blade', { pierce: true });
  if (boss && dealt > 0) addStagger(w, stagger);
  if (dealt > 0) swordsOnCut(w, skill, f, orbs, swords ?? undefined);   // 이기어검(swords.js): 벤 스킬마다 묶음이 생기고 가진 검이 모두 따라 벤다(orbs = 그 스킬이 쓴 칸 수, swords = 형태가 바꾸는 것)
  emit(w, 'bladeHit', { skill, id: boss ? 0 : f.id, x, z, dmg: dealt });
  return dealt;
}

// 회전 베기가 닿는 적(몸 표면까지 spin.R 안) · 마무리가 닿는 적(겨눈 쪽 부채 — 겨눈 적은 거리만 본다). 화면(스킬 이름의 밝기)과 봇도 쓴다.
const spinFoes = w => (isSword(w) ? w.foeList.filter(f => !f.dead && Math.hypot(f.x - w.player.x, f.z - w.player.z) - foeR(w, f) <= w.rules.sword.spin.R) : []);
function finishFoes(w) {
  if (!isSword(w)) return [];
  const p = w.player, Fi = w.rules.sword.finish, t = w.aim && !w.aim.dead ? w.aim : null;
  const angle = t ? Math.atan2(t.z - p.z, t.x - p.x) : p.face, half = Fi.halfDeg * Math.PI / 180;
  return w.foeList.filter(f => {
    if (f.dead) return false;
    const dx = f.x - p.x, dz = f.z - p.z;
    if (Math.hypot(dx, dz) - foeR(w, f) > Fi.R) return false;
    const off = Math.atan2(dz, dx) - angle;
    return f === t || Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= half;
  });
}
export const spinReach = w => spinFoes(w).length > 0;
export const finishReach = w => finishFoes(w).length > 0;

// I 회전 베기: 그 틱에 둘레를 벤다. 닿는 적이 없으면 나가지 않는다(false — 칸은 그대로. 2026-11-18 사용자: "사거리 내에 적이 없으면 스킬 게이지만 날아간다")
function spin(w) {
  const foes = spinFoes(w);
  if (!foes.length) return false;
  const p = w.player, Sp = w.rules.sword.spin, o = spend(w);
  let hits = 0;
  for (const f of foes) { cut(w, f, 'spin', o.dmg * Sp.dmg, o.stagger * Sp.stag); hits++; }
  p.blade.lockUntil = w.time + Sp.lock;
  w.stats.blade.spin++;
  emit(w, 'bladeSpin', { x: p.x, z: p.z, R: Sp.R, n: 1, perfect: o.perfect, hits, heal: o.heal });
  return true;
}

// 일섬으로 설 자리: 지나갈 적(slashTarget — 보통은 겨눈 적)의 몸 표면까지 reach 안이면 그 적 가운데를 지나 건너편(몸 사이 past), 판 안으로 자른 자리. 아니면 null.
// 칸 수와 무관하다 — 화면(내릴 자리 표시)과 봇도 쓴다.
export function slashLanding(w) {
  if (!isSword(w)) return null;
  const p = w.player, t = slashTarget(w), R = w.rules, Sl = R.sword.slash;
  if (!t || t.dead) return null;
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), r = foeR(w, t);
  if (d - r > Sl.reach + 1e-9) return null;
  const ux = d > 1e-9 ? dx / d : Math.cos(p.face), uz = d > 1e-9 ? dz / d : Math.sin(p.face), far = r + R.player.bodyR + Sl.past;
  const [x, z] = clampToBoard(R, t.x + ux * far, t.z + uz * far, R.player.bodyR);
  return { target: t, x, z, angle: Math.atan2(uz, ux) };
}

export const bladeMoving = w => !!w.player.blade.move;

// 스킬의 움직임을 시작한다: 다음 틱부터 dur초에 간다. 구르던 중이면 구르기는 거기서 끝난다. 그동안 + 선 뒤 after초 무적.
function startMove(w, move, after) {
  const p = w.player, dt = w.rules.dt;
  p.blade.move = { t0: w.time + dt, x0: p.x, z0: p.z, hit: [], ...move };
  p.dodge.until = Math.min(p.dodge.until, w.time);
  p.invulnUntil = Math.max(p.invulnUntil, w.time + dt + move.dur + after);
}

// U 일섬: 겨눈 적을 지나 건너편에 선다. 닿는 거리 밖이면 나가지 않는다(false — 칸은 그대로)
// 형태(RULES.sword.forms.slash): 잇는 일섬 = 첫 번만 칸을 쓰고, 이어지는 번은 그 칸의 값으로 칸 없이 나간다(free). 깊은 일섬 = 세게 한 번, 선 뒤 lock초 동안 다른 스킬이 기다린다.
// 사건의 form = 형태(없으면 null), k / of = 이번이 몇 번째 / 한 칸으로 몇 번까지, free = 칸을 쓰지 않은 번.
function slash(w) {
  const land = slashLanding(w);
  if (!land) return false;
  const p = w.player, B = p.blade, Sl = w.rules.sword.slash, F = w.rules.sword.forms.slash, form = slashForm(w), free = chainLive(w), x0 = p.x, z0 = p.z;
  let o, c = null, mul = 1, stag = 1, swords = null, k = 1, of = 1;
  if (free) { c = B.chain; o = { dmg: c.dmg, stagger: c.stagger, perfect: c.perfect, heal: 0 }; c.left--; }
  else { o = spend(w); B.chain = c = form === 'chain' ? { left: F.chain.n - 1, until: Infinity, dmg: o.dmg, stagger: o.stagger, perfect: o.perfect, cut: [], last: null } : null; }
  if (c) { c.until = Infinity; mul = F.chain.dmg; stag = F.chain.stag; swords = { batch: !free, mul: F.chain.swords }; of = F.chain.n; k = of - c.left; }   // 창은 선 틱에 다시 센다(stepBlade)
  else if (form === 'deep') { mul = F.deep.dmg; stag = F.deep.stag; B.lockUntil = B.keepUntil = w.time + w.rules.dt + Sl.dur + F.deep.lock; }
  startMove(w, { kind: 'slash', dur: Sl.dur, x1: land.x, z1: land.z, target: land.target, dmg: o.dmg * Sl.dmg * mul, stagger: o.stagger * Sl.stag * stag, chain: c, swords }, Sl.after);
  w.stats.blade.slash++;
  emit(w, 'bladeSlash', { x0, z0, x1: land.x, z1: land.z, perfect: o.perfect, heal: o.heal, form, k, of, free });
  return true;
}

// 움직임 한 틱(걷기 대신 — world.step). 이동·회피·다른 스킬은 듣지 않는다: 누른 회피는 기억했다가 선 뒤에 나간다. 패링은 world.step이 그대로 받는다.
// 일섬으로 가는 동안은 적의 몸과 기둥을 지나간다(boss.separateBodies · tries.triesBodies가 건너뛴다).
export function stepBlade(w, input) {
  const p = w.player, B = p.blade, m = B.move, R = w.rules;
  if (!m) return;
  if (input.dodge) p.buffer.dodgeUntil = Math.max(w.time, m.t0 + m.dur) + R.player.buffer;   // 가는 내내 기억한다(움직임이 미리 받기 시간보다 길다)
  const u = Math.min(1, (w.time + R.dt - m.t0) / m.dur);
  if (m.kind === 'slash') {
    p.x = m.x0 + (m.x1 - m.x0) * u; p.z = m.z0 + (m.z1 - m.z0) * u;
    const hit = f => { m.hit.push(f); if (m.chain) m.chain.cut.push(f); cut(w, f, 'slash', m.dmg, m.stagger, 1, m.swords); };
    for (const f of [...w.foeList]) if (!f.dead && !m.hit.includes(f) && segCircle(p.px, p.pz, p.x, p.z, f.x, f.z, foeR(w, f) + R.player.bodyR)) hit(f);   // 이번 틱에 지나간 길 위의 적
    if (u >= 1 && !m.target.dead && !m.hit.includes(m.target)) hit(m.target);   // 겨눈 적은 그 사이 움직였어도 반드시 맞는다
  } else {   // 마무리의 튕김: 틱마다 그 몫만큼(난간에서는 축마다 잘려 미끄러진다 — 몸끼리는 world.step이 민다)
    const k = m.dist * (u - m.f);
    m.f = u;
    [p.x, p.z] = clampToBoard(R, p.x + m.dirX * k, p.z + m.dirZ * k, R.player.bodyR);
  }
  if (u >= 1 && m.chain) { m.chain.last = m.target; m.chain.until = w.time + R.sword.forms.slash.chain.window; }   // 잇는 일섬: 다시 누를 창은 선 때부터 센다
  if (u >= 1) { B.move = null; emit(w, 'bladeEnd', { skill: m.kind === 'slash' ? 'slash' : 'finish', x: p.x, z: p.z }); }
}

// 하던 움직임을 끊는다(처형·자동 반격이 몸을 가져갈 때). 기억한 누름도 버린다. 방을 넘어갈 때는 stage.js가 그냥 지운다(벨 적이 없다)
export function cancelBlade(w) {
  const B = w.player.blade, m = B.move;
  if (m && m.kind === 'slash' && !m.target.dead && !m.hit.includes(m.target)) { m.hit.push(m.target); cut(w, m.target, 'slash', m.dmg, m.stagger, 1, m.swords); }   // 칸을 쓴 일섬의 베기는 사라지지 않는다 — 겨눈 적은 반드시 맞는다
  B.move = null; B.want = null; B.chain = null;   // 이어지던 잇는 일섬도 거기서 끝난다
}

// O 마무리: 남은 칸을 다 써서 겨눈 쪽 부채를 한 번에 베고(칸마다의 값을 더한다), 곧바로 물러난다 — 이동 키를 누르고 있으면 그쪽, 아니면 겨눈 적의 반대쪽(회피와 같다).
// 닿는 적이 없으면 나가지 않는다(false — 칸은 그대로. 빠져나오는 것은 붙어 있을 때의 일이다 — 멀리서는 회피로). 튕기는 동안 적의 몸은 지나가지 못한다.
function finish(w, input) {
  const foes = finishFoes(w);
  if (!foes.length) return false;
  const p = w.player, Fi = w.rules.sword.finish, t = w.aim && !w.aim.dead ? w.aim : null;
  const angle = t ? Math.atan2(t.z - p.z, t.x - p.x) : p.face;
  let dmg = 0, stagger = 0, n = 0, perfect = true, heal = 0;
  while (p.store.length) { const o = spend(w); dmg += o.dmg; stagger += o.stagger; perfect = perfect && o.perfect; heal += o.heal; n++; }
  let hits = 0, dealt = 0;
  for (const f of foes) { dealt += cut(w, f, 'finish', dmg * Fi.dmg, stagger * Fi.stag, n); hits++; }
  let dirX = input.mx || 0, dirZ = input.mz || 0;
  if (dirX === 0 && dirZ === 0) { dirX = -Math.cos(angle); dirZ = -Math.sin(angle); }
  const len = Math.hypot(dirX, dirZ) || 1;
  dirX /= len; dirZ /= len;
  const x = p.x, z = p.z;
  startMove(w, { kind: 'back', dur: Fi.back, dirX, dirZ, dist: Fi.backDist, f: 0 }, Fi.after);
  w.stats.blade.finish++;
  emit(w, 'bladeFinish', { x, z, angle, n, perfect, dmg: dealt, hits, dirX, dirZ, heal });
  return true;
}

const START = { slash, spin, finish };

// 틱마다(던지기 자리에서): 스킬 누름을 기억하고, 나갈 수 있으면 낸다.
// 앞 스킬의 동작(움직임·lock)이 끝나길 기다리는 누름은 buffer초 기억한다 — 연달아 눌러도 먹는다. 못 나가는 누름(못 쓰는 때 · 칸 없음 · 닿는 거리 밖)은 버리면서 거절 신호를 한 번 낸다.
export function swordSkills(w, input) {
  if (!isSword(w)) return;
  const p = w.player, B = p.blade, Sw = w.rules.sword;
  const pressed = SKILLS.find(s => input[KEY[s]]) ?? null;
  if (pressed) { B.want = pressed; B.wantUntil = Math.max(w.time, B.keepUntil) + Sw.buffer; }   // keepUntil = 깊은 일섬의 잠금이 풀리는 때(그때까지의 누름은 버리지 않는다)
  if (!B.want) return;
  if (w.time > B.wantUntil + 1e-9) { B.want = null; return; }
  const skill = B.want, deny = why => { emit(w, 'denied', { what: skill, why }); B.want = null; };
  if (busy(w)) return deny('busy');
  if (p.store.length === 0 && !(skill === 'slash' && chainLive(w))) return deny('empty');   // 이어지는 잇는 일섬은 칸 없이 나간다
  if (B.move || w.time < B.lockUntil - 1e-9) return;
  if (!START[skill](w, input)) return deny('far');
  B.want = null;
}
