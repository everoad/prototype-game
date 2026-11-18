// 자국(검사의 연결 카드가 주고받는 재료 — 설계 2026-11-18-barrage-run-growth-design.md §3 · §10). 수치는 RULES.sword.marks.
// 적의 몸에 남는 칼자국: keep초 남고, 한 적에 한 겹. 세기(value) = 그 자국을 남긴 베기의 value배. 시간이 다 되면 그 세기만큼 저절로 터진다.
// 가득인데 또 남기면 있던 것이 터지고 새로 남는다. 자국 난 적이 죽으면 가장 가까운 적(moveR 안)에게 남은 시간 그대로 옮겨 간다 — 방에서 자국이 버려지지 않게.
// 카드(판을 열 때 정한다 — w.marks.cards. 지금은 주소 mark=cut,pop으로 켜는 시험판이고, 방에서 얻는 카드는 나중이다):
//  cut 긋는 칼(남긴다): 일섬으로 벤 적에게 자국.   pop 터뜨리는 회전(쓴다): 회전 베기가 자국 난 적을 베면 pop배로 터진다.
// 카드를 하나도 들지 않은 판에는 자국이 없다(w.marks = null — 한 틱도 달라지지 않는다). 검사의 것이다.
import { emit } from './events.js';
import { hurtFoe } from './foes.js';

export const MARK_CARDS = ['cut', 'pop'];

// cards = 켤 카드(목록이나 'cut,pop'). 아는 것이 하나도 없으면 null
export function createMarks(cards) {
  const want = Array.isArray(cards) ? cards : typeof cards === 'string' ? cards.split(',').map(s => s.trim()) : [];
  const on = MARK_CARDS.filter(c => want.includes(c));
  return on.length ? { cards: on, on: Object.fromEntries(on.map(c => [c, true])), list: [] } : null;   // list = [{ foe, until, value }]
}

const idOf = (w, f) => (f === w.boss ? 0 : f.id);
// 그 적의 자국(없으면 null). 화면과 시험도 쓴다.
export const markOn = (w, f) => (w.marks ? w.marks.list.find(m => m.foe === f) ?? null : null);

// 자국이 터진다: 세기 × mul만큼 다친다(받아친 탄에서 나온 것이라 보호막을 지난다 — foes.hurtFoe). why = 'time' 저절로 · 'renew' 또 남겨서 · 'spin' 터뜨리는 회전
function pop(w, m, mul, why) {
  const f = m.foe, x = f.x, z = f.z, dealt = hurtFoe(w, f, m.value * mul, 'mark');
  emit(w, 'markPop', { id: idOf(w, f), x, z, dmg: dealt, why });
}

// 자국을 그 적에게 둔다: 이미 지녔으면 있던 것이 터지고 새것이 남는다
function place(w, m) {
  const list = w.marks.list, k = list.findIndex(q => q.foe === m.foe);
  if (k >= 0) { const old = list[k]; list.splice(k, 1); pop(w, old, 1, 'renew'); }
  list.push(m);
}

export function leaveMark(w, f, value) {
  if (!w.marks || !(value > 0)) return;
  const until = w.time + w.rules.sword.marks.keep;
  place(w, { foe: f, until, value });
  emit(w, 'markLeave', { id: idOf(w, f), x: f.x, z: f.z, value, until });
}

// 스킬이 적 하나를 벴다(sword.js의 cut이 부른다). amount = 그 베기의 세기(몬스터가 죽으며 깎인 남은 체력이 아니라 벤 값).
// 터뜨리는 회전: 회전 베기가 자국 난 적을 베면 터진다 — 그 베기에 적이 죽었으면 터뜨리지 않는다(자국은 다음 틱에 옮겨 간다).
// 긋는 칼: 일섬이 벤 적에게 남긴다(죽은 적에게도 남긴다 — 곧 옮겨 간다).
export function marksOnCut(w, f, skill, amount) {
  const K = w.marks;
  if (!K) return;
  if (skill === 'spin' && K.on.pop && !f.dead) {
    const k = K.list.findIndex(m => m.foe === f);
    if (k >= 0) { const m = K.list[k]; K.list.splice(k, 1); pop(w, m, w.rules.sword.marks.pop, 'spin'); }
  }
  if (skill === 'slash' && K.on.cut) leaveMark(w, f, amount * w.rules.sword.marks.value);
}

const gone = (w, f) => (f === w.boss ? f.dead || !!f.away : f.dead || !w.enemies.includes(f));

// 틱마다: 시간이 다 된 자국은 터지고, 주인이 죽은 자국은 가장 가까운 적에게 옮겨 간다(없으면 사라진다).
// 남아 있는 것을 먼저 다 보고 나서 옮긴다 — 옮겨 갈 자리의 적이 지닌 자국이 제때 터지게.
export function stepMarks(w) {
  const K = w.marks;
  if (!K || !K.list.length) return;
  const M = w.rules.sword.marks, cur = K.list, moving = [];
  K.list = [];
  for (const m of cur) {
    if (gone(w, m.foe)) moving.push(m);
    else if (w.time >= m.until - 1e-9) pop(w, m, 1, 'time');
    else K.list.push(m);
  }
  for (const m of moving) {
    const f = m.foe;
    let to = null, bd = M.moveR;
    for (const o of w.foeList ?? []) {
      if (o === f || o.dead || o.bornAt > w.time) continue;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d <= bd + 1e-9) { bd = d; to = o; }
    }
    if (!to) { emit(w, 'markGone', { x: f.x, z: f.z }); continue; }
    emit(w, 'markMove', { id: idOf(w, to), fromX: f.x, fromZ: f.z, x: to.x, z: to.z, value: m.value });
    place(w, { foe: to, until: m.until, value: m.value });
  }
}

// 방을 넘어가거나 다시 할 때(stage.js): 자국은 따라가지 않는다
export function clearMarks(w) { if (w.marks) w.marks.list.length = 0; }
