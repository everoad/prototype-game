// 이기어검(검사의 무기 — 설계 2026-11-17-barrage-flying-swords-design.md). 수치는 RULES.sword.swords.
// 바탕 다섯 자루가 늘 있고, 스킬이 적을 벨 때마다 다섯이 더 생겨 keep초 남는다(최대 max). 가진 검은 모두 그 스킬의 타격에 나선다.
// 판정은 시간으로 정한다 — 검의 자리는 판에 없다(화면 view/swordsView.js가 사건을 보고 만들어 낸다). 그림이 늦어도 피해는 밀리지 않는다.
// 상태는 w.player.swords(검사 판에만 있다 — 사수 판은 한 틱도 바뀌지 않는다).
import { emit } from './events.js';
import { hurtFoe, foeR } from './foes.js';
import { segCircle } from './geom.js';

// 묶음(batches) = 스킬 묶음만 { id, until } — 바탕 묶음은 id 0이고 식지 않는다. list = 검 하나하나 { b 묶음, k 묶음 안 번호, nextAt 다음 출격, leg 하던 출격 }.
// strikes = 줄 선 스킬 타격(앞의 것이 끝나야 다음 것이 시작한다), busyUntil = 마지막 타격이 끝나는 시각.
export function createSwords(rules, from = 0) {
  const C = rules.sword.swords, S = { seq: 0, sid: 0, batches: [], list: [], strikes: [], cast: null, busyUntil: -1 };
  for (let k = 0; k < C.n; k++) S.list.push({ b: 0, k, nextAt: 0, leg: null });
  restagger(S, C, from);
  return S;
}

// 처형이 몸을 가져갈 때: 남은 타격과 출격을 거두고 스킬 묶음을 지운다(바탕 다섯만 남는다). 거둔 것이 있을 때만 알린다 — 처형 내내 틱마다 불려도 된다.
export function clearSwords(w) {
  const S = w.player.swords;
  if (!S) return;
  const C = w.rules.sword.swords, had = S.strikes.length > 0 || S.batches.length > 0 || S.list.some(s => s.leg);
  S.strikes.length = 0; S.cast = null; S.busyUntil = -1;
  if (S.batches.length) { S.batches.length = 0; S.list = S.list.filter(s => s.b === 0); }
  for (const s of S.list) s.leg = null;
  restagger(S, C, w.time);
  if (had) emit(w, 'swordsClear', {});
}

export const swordCount = w => (w.player.swords ? w.player.swords.list.length : 0);

// 출격 차례를 from부터 고르게 엇갈려 다시 잡는다(자루 수가 바뀌었거나 스킬 타격이 끝났을 때)
function restagger(S, C, from) {
  const n = S.list.length;
  S.list.forEach((s, i) => { s.nextAt = from + i * C.beat / n; });
}

// 맞힐 수 있는 적인가(죽은 적 · 자리에 없는 보스 · 날고 있는 몬스터 · 아직 안 나온 몬스터는 아니다)
const live = (w, f) => (f === w.boss ? !f.dead && !f.away : !f.dead && !f.flying && w.time >= f.bornAt);
const idOf = (w, f) => (f === w.boss ? 0 : f.id);

// 스킬이 적 하나를 벴다(sword.js의 cut이 부른다). 같은 스킬 한 번 — 일섬은 같은 움직임, 회전 베기·마무리는 같은 틱 — 의 첫 베기에서
// 묶음을 만들고(가득이면 가장 오래된 묶음의 시간만 새로) 타격을 줄에 세운다. 뒤따르는 베기는 그 타격이 벨 적에 더한다.
// batch = false면 묶음 없이 타격만(잇는 일섬의 둘째 번부터), mul = 검 한 번의 세기 배율.
export function swordsOnCut(w, skill, f, orbs = 1, { batch: fresh = true, mul = 1 } = {}) {
  const S = w.player.swords;
  if (!S) return;
  const p = w.player, C = w.rules.sword.swords, K = C[skill];
  const mv = p.blade.move && p.blade.move.kind === 'slash' ? p.blade.move : null, c = S.cast;
  if (c && c.skill === skill && (mv ? c.move === mv : c.move == null && c.tick === w.tick)) {
    if (!c.foes.includes(f)) c.foes.push(f);
    if (!c.armed && live(w, f)) arm(w, S, c);
    return;
  }
  const cap = Math.round(C.max / C.n) - 1;
  let batch = null, renewed = false;
  if (!fresh) batch = null;   // 잇는 일섬의 이어지는 번: 묶음을 새로 만들지도, 남은 시간을 새로 하지도 않는다(타격만 나선다)
  else if (S.batches.length < cap) {
    batch = { id: ++S.seq, until: w.time + C.keep };
    S.batches.push(batch);
    for (let k = 0; k < C.n; k++) S.list.push({ b: batch.id, k, nextAt: 0, leg: null });
  } else if (cap > 0) {
    batch = S.batches.shift();
    batch.until = w.time + C.keep;
    S.batches.push(batch);
    renewed = true;
  }
  const angle = mv ? Math.atan2(mv.z1 - mv.z0, mv.x1 - mv.x0) : Math.atan2(f.z - p.z, f.x - p.x);
  const strike = { sid: ++S.sid, skill, tick: w.tick, move: mv, foes: [f], aim: w.aim, orbs, mul, total: C.join || !batch ? S.list.length : C.n, armed: false, startAt: null, span: K.span, done: 0, sum: 0, told: false, angle, fresh: batch ? batch.id : 0 };
  S.cast = strike;
  S.strikes.push(strike);
  if (live(w, f)) arm(w, S, strike);
  for (const s of S.list) s.leg = null;
  if (batch) emit(w, 'swordsBatch', { skill, batch: batch.id, n: C.n, until: batch.until, x: mv ? mv.x0 : p.x, z: mv ? mv.z0 : p.z, angle, renewed });
}

// 타격을 연다: 그 스킬이 벤 적 가운데 살아남은 적이 처음 나온 때부터 센다(앞 타격이 남았으면 그 뒤에). 벤 적이 다 죽었으면 열리지 않는다 — stepSwords가 거둔다.
function arm(w, S, st) {
  st.armed = true;
  st.startAt = Math.max(w.time + w.rules.sword.swords[st.skill].first, S.busyUntil);
  S.busyUntil = st.startAt + st.span;
}

// 타격 하나(검 한 자루의 몫): 일섬은 그 일섬이 벤 적 모두, 회전 베기는 벤 적들에게 돌아가며, 마무리는 겨눈 적(죽었으면 벤 다른 적)에게 × 쓴 칸 수.
// 받아친 탄으로 베는 스킬에 얹히는 것이라 방패·보호를 지난다(salvo). 무너짐은 주지 않는다.
function strikeOnce(w, st) {
  const C = w.rules.sword.swords, k = st.done++, last = st.done >= st.total, alive = st.foes.filter(f => live(w, f));
  const targets = st.skill === 'slash' ? alive : st.skill === 'spin' ? alive.slice(k % (alive.length || 1), k % (alive.length || 1) + 1) : alive.includes(st.aim) ? [st.aim] : alive.slice(0, 1);
  if (!targets.length) { emit(w, 'swordMiss', { sid: st.sid, skill: st.skill, k, total: st.total, last, sum: st.sum, x: st.lastX ?? null, z: st.lastZ ?? null }); return; }   // 헛돈 검: 그때까지의 합계와 마지막으로 벤 자리를 같이 알린다(마지막 검이면 화면이 합계를 띄운다)
  const dmg = C[st.skill].dmg * (st.skill === 'finish' ? st.orbs : 1) * st.mul;   // mul = 형태가 바꾼 세기(잇는 일섬 — sword.js)
  for (const f of targets) {
    const x = f.x, z = f.z, id = idOf(w, f);
    const dealt = hurtFoe(w, f, dmg * (f === w.boss ? 1 : w.rules.sword.mob), 'salvo', { pierce: true, quiet: true });
    st.sum += dealt; st.lastX = x; st.lastZ = z;
    emit(w, 'swordHit', { sid: st.sid, skill: st.skill, k, total: st.total, id, x, z, dmg: dealt, sum: st.sum, last, orbs: st.orbs });
  }
}

// 자루 수가 줄었다(묶음이 식었다): 남은 검의 박자를 다시 고르게 편다 — 나가 있는 검은 다음 찌르기를, 등 뒤의 검은 다음 출격을
function rephase(S, C, now) {
  const n = S.list.length, out = S.list.filter(s => s.leg).sort((a, b) => a.leg.at - b.leg.at), t0 = out.length ? Math.max(now, out[0].leg.at) : now;
  out.forEach((s, i) => { s.leg.at = t0 + i * C.beat / n; });
  S.list.filter(s => !s.leg).forEach((s, i) => { s.nextAt = t0 + (out.length + i) * C.beat / n; });
}

const nearest = (list, x, z) => {
  let best = null, bd = Infinity;
  for (const f of list) { const d = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z); if (d < bd) { bd = d; best = f; } }
  return best;
};

// 출격을 끝낸다(blocked = 기둥·방패에 막혀 튕겨 돌아온다)
function home(w, s, blocked, at = null) {
  s.leg = null;
  emit(w, 'swordHome', { batch: s.b, k: s.k, blocked, x: at ? at.x : null, z: at ? at.z : null });
}

// 찌를 수 있는 적(끈): 내 사거리(칼바람이 닿는 거리) 안의 적 near, 그리고 그런 적에게서 hopR 안 — 한 다리 건너 — 의 적까지 all.
// 검은 돌아오지 않고 계속 건너다니므로, 이 끈이 없으면 검이 혼자 방을 치운다.
function targets(w, C) {
  const p = w.player, Wv = w.rules.sword.wave, foes = w.foeList.filter(q => live(w, q));
  const near = foes.filter(f => Math.hypot(f.x - p.x, f.z - p.z) - foeR(w, f) <= Wv.range + Wv.r + 1e-9);
  return { near, all: foes.filter(f => near.includes(f) || near.some(g => Math.hypot(f.x - g.x, f.z - g.z) - foeR(w, f) <= C.hopR + 1e-9)) };
}

// 찌를 때가 된 검: 검이 온 줄(from → 적)로 판정한다 — 기둥이 줄을 끊거나 방패·보호에 막히면 돌아와 rest초 쉰다.
// 찌른 뒤에는 돌아오지 않는다: hopR 안의 아직 안 찌른 가장 가까운 적으로 건너가고(다 찔렀으면 한 바퀴를 새로 센다), 건너갈 적이 없으면 그 적을 roundDeg 돌아서 다시 찌른다.
// 찌를 적이 끈 밖으로 나갔거나 죽었으면 끈 안의 다른 적으로, 없으면 돌아온다.
function stab(w, C, s, T) {
  const L = s.leg;
  const hop = (f, skip) => T.all.filter(q => q !== f && live(w, q) && !skip.includes(q) && Math.hypot(q.x - f.x, q.z - f.z) - foeR(w, q) <= C.hopR + 1e-9);
  let f = L.foe;
  if (!T.all.includes(f) || !live(w, f)) {   // 끈 밖으로 나갔거나 죽었다(이 틱에 앞의 검이 죽였어도 — 막힌 것이 아니다)
    const next = nearest(T.all.filter(q => q !== f && live(w, q)), f.x, f.z);
    if (!next) return home(w, s, false);
    L.foe = next; L.seen = [next]; L.round = false; L.at += C.beat;
    emit(w, 'swordTurn', { batch: s.b, k: s.k, id: idOf(w, next), at: L.at });
    return;
  }
  const pillar = (w.tries ? w.tries.pillars : []).find(q => segCircle(L.fromX, L.fromZ, f.x, f.z, q.x, q.z, q.r));
  if (pillar) { emit(w, 'pillarBlock', { x: pillar.x, z: pillar.z, enemy: false }); s.nextAt = w.time + C.rest; return home(w, s, true, pillar); }
  const r = foeR(w, f), fromX = L.fromX, fromZ = L.fromZ, d = Math.hypot(f.x - fromX, f.z - fromZ) || 1, ux = (f.x - fromX) / d, uz = (f.z - fromZ) / d;
  const x = f.x - ux * r, z = f.z - uz * r, id = idOf(w, f), round = L.round, n = L.n;
  const dealt = hurtFoe(w, f, C.stab * (f === w.boss ? 1 : w.rules.sword.mob), 'weapon', { fromX, fromZ, quiet: true });
  if (!(dealt > 0)) { s.nextAt = w.time + C.rest; return home(w, s, true, { x, z }); }
  L.n++; L.at += C.beat;
  let next = null, other = nearest(hop(f, L.seen), f.x, f.z);
  if (!other) { L.seen = [f]; other = nearest(hop(f, L.seen), f.x, f.z); }
  if (other) {
    L.fromX = f.x; L.fromZ = f.z; L.foe = other; L.seen.push(other); L.round = false;
    next = { id: idOf(w, other), at: L.at, round: false, fromX: L.fromX, fromZ: L.fromZ };
  } else if (live(w, f)) {
    const a = Math.atan2(fromZ - f.z, fromX - f.x) + ((s.b + s.k) % 2 ? 1 : -1) * C.roundDeg * Math.PI / 180;
    L.fromX = f.x + Math.cos(a) * (r + 1); L.fromZ = f.z + Math.sin(a) * (r + 1); L.round = true;
    next = { id, at: L.at, round: true, fromX: L.fromX, fromZ: L.fromZ };
  }
  emit(w, 'swordStab', { batch: s.b, k: s.k, hop: n, id, x, z, fromX, fromZ, dmg: dealt, round, next });
  if (!next) home(w, s, false);
}

// 건너다니기(기본 공격): 닿는 적이 있는 동안 검은 모두 나가서 돌아오지 않고, 검마다 beat에 한 번씩 찌른다 — 자루 수로 나눠 엇갈려서(검이 늘면 그만큼 촘촘하다).
// 첫 적은 내 사거리 안 — 겨눈 적이 먼저, 아니면 가장 가까운 적. 닿는 적이 없으면 제 박자를 한 번 미룬다(엇갈림은 그대로). 처형·구제 창 동안은 쉰다.
function sorties(w, S, C) {
  const p = w.player, now = w.time;
  if (w.execute || p.dyingAt != null) return;
  const T = targets(w, C);
  for (const s of S.list) {
    if (s.leg) { if (now + 1e-9 >= s.leg.at) stab(w, C, s, T); continue; }
    if (now + 1e-9 < s.nextAt) continue;
    s.nextAt += C.beat;
    const first = w.aim && T.near.includes(w.aim) ? w.aim : nearest(T.near, p.x, p.z);
    if (!first) continue;
    s.leg = { foe: first, at: now + C.fly, fromX: p.x, fromZ: p.z, n: 0, seen: [first], round: false };
    emit(w, 'swordSortie', { batch: s.b, k: s.k, id: idOf(w, first), at: s.leg.at });
  }
}

// 틱마다(칼바람 뒤): 새 타격을 알리고 → 때가 된 타격을 내고 → 식을 묶음을 식히고 → 타격이 없으면 건너다닌다.
export function stepSwords(w) {
  const S = w.player.swords;
  if (!S) return;
  const C = w.rules.sword.swords, now = w.time;
  if (w.result) return;
  if (w.execute) { clearSwords(w); return; }   // 처형이 시작된 그 틱부터 베지 않는다(world.step은 다음 틱에야 거둔다)
  let dropped = false;
  for (let i = S.strikes.length - 1; i >= 0; i--) {   // 벤 적이 다 죽은 타격은 열지 않는다(일섬은 가는 동안 더 벨 수 있으니 그 움직임이 끝날 때까지 기다린다)
    const st = S.strikes[i];
    if (st.armed || (st.move && w.player.blade.move === st.move)) continue;
    S.strikes.splice(i, 1); dropped = true;
    if (S.cast === st) S.cast = null;
  }
  if (dropped && !S.strikes.length) restagger(S, C, now);
  for (const st of S.strikes) {
    if (st.told || !st.armed) continue;
    st.told = true;
    // 알리는 차례: 마무리는 겨눈 적이 맨 앞(검이 그 적을 친다), 그 밖에는 살아 있는 적이 앞
    const lead = q => (st.skill === 'finish' && q === st.aim ? 2 : live(w, q) ? 1 : 0), foes = [...st.foes].sort((a, b) => lead(b) - lead(a)), f = foes[0], mv = st.move;
    emit(w, 'swordsStrike', { sid: st.sid, skill: st.skill, total: st.total, startAt: st.startAt, span: st.span, x: f.x, z: f.z, r: foeR(w, f), angle: st.angle, orbs: st.orbs, ids: foes.map(q => idOf(w, q)), fresh: st.fresh, line: mv ? [mv.x0, mv.z0, mv.x1, mv.z1] : null });
  }
  while (S.strikes.length) {
    const st = S.strikes[0];
    if (!st.armed) break;
    while (st.done < st.total && now + 1e-9 >= st.startAt + st.done * st.span / st.total) strikeOnce(w, st);
    if (st.done < st.total) break;
    S.strikes.shift();
    if (S.cast === st) S.cast = null;
    if (!S.strikes.length) restagger(S, C, now);
  }
  if (!S.strikes.length) {
    for (let i = 0; i < S.batches.length; i++) {
      const b = S.batches[i];
      if (now + 1e-9 < b.until) continue;
      S.batches.splice(i--, 1);
      S.list = S.list.filter(s => s.b !== b.id);
      emit(w, 'swordsExpire', { batch: b.id });
      rephase(S, C, now);
    }
    sorties(w, S, C);
  }
}
