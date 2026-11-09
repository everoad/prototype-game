// 공성병 사기(설계서 2026-11-09-flood-gold-orders-design.md §2): 우리 거점에서 금으로 사면 seconds 뒤 그 거점에 count명이 선다.
// 생산 방향으로 저절로 가지 않는다 — 언제 밀지는 보내는 쪽이 정한다. 한 거점에서 한 번에 하나씩.
import { spawn } from './soldiers.js';
import { SIEGE } from './rules.js';
import { setGoal } from './world.js';

const fail = reason => ({ ok: false, reason });
const NOTICE_SECONDS = 30;   // 알림(w.notices)을 이만큼 지난 뒤 지운다

// o = { kind: 'buySiege', side, stronghold }
export function buySiege(w, o) {
  if (w.result) return fail('판이 끝났다');
  const st = w.strongholds.find(x => x.id === o.stronghold), def = w.rules.siegeBuy;
  if (!st || st.kind === 'vp' || st.owner !== o.side) return fail('우리 거점이 아니다');
  if (st.siegeAt != null) return fail('이미 사는 중');
  if (w.sides[o.side].gold < def.cost - 1e-9) return fail('금이 모자라다');
  w.sides[o.side].gold -= def.cost;
  st.siegeAt = w.time + def.seconds; st.siegeSide = o.side;
  w.events.push({ kind: 'siegeBuy', side: o.side, stronghold: st.id });
  return { ok: true };
}

// 다 된 공성병을 그 거점에 세운다. 그 사이 주인이 바뀌었으면 아무에게도 나오지 않는다.
export function stepSiege(w) {
  const s = w.soldiers, def = w.rules.siegeBuy;
  w.strongholds.forEach((st, k) => {
    if (st.siegeAt == null || st.siegeAt > w.time + 1e-9) return;
    const side = st.siegeSide, n = Math.round(def.count);
    st.siegeAt = null;
    if (st.owner !== side || s.free.length + s.capacity - s.count < n) return;
    const ids = [];
    for (let m = 0; m < n; m++) {
      const a = w.rng.next() * Math.PI * 2, d = st.radius * 0.5 * Math.sqrt(w.rng.next());
      const i = spawn(s, side, SIEGE, st.x + Math.cos(a) * d, st.z + Math.sin(a) * d, w.rules);
      s.origin[i] = k;
      ids.push(i);
    }
    setGoal(w, ids, { kind: 'stronghold', id: st.id });
    w.notices.push({ side, kind: 'siegeReady', stronghold: st.id, ids, at: w.time });
  });
  for (let k = w.notices.length - 1; k >= 0; k--) if (w.time - w.notices[k].at > NOTICE_SECONDS) w.notices.splice(k, 1);
}
