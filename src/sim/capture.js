// 점령 게이지(설계서 §7.1): −100(편 1) ~ +100(편 0). ±100에 닿으면 소유, 0을 지나면 소유를 잃는다.
import { forEachNear } from './soldiers.js';
import { wallStanding } from './production.js';

export function stepGauge(gauge, owner, weightOurs, weightTheirs, baseSeconds, dt, opts = {}) {
  if (opts.hqLocked) return { gauge, owner };
  const full = 100;
  let g = gauge;
  const more = Math.max(weightOurs, weightTheirs);
  if (more > 0 && weightOurs !== weightTheirs) {
    const sign = weightOurs > weightTheirs ? 1 : -1;
    let rate = full / baseSeconds * (more - Math.min(weightOurs, weightTheirs)) / more;
    if (opts.wallUp) rate *= 0.5;
    g += sign * rate * dt;
  } else if (more === 0 && opts.decaySeconds) {
    const home = owner === 0 ? full : owner === 1 ? -full : 0;
    const step = full / opts.decaySeconds * dt;
    g = g < home ? Math.min(home, g + step) : Math.max(home, g - step);
  }
  g = Math.max(-full, Math.min(full, g));
  if (g > full - 1e-6) g = full;           // 틱마다 더한 소수 오차로 100에 못 닿는 일 방지
  if (g < -full + 1e-6) g = -full;
  let o = owner;
  if (o === 0 && g < 0) o = null;
  if (o === 1 && g > 0) o = null;
  if (g >= full) o = 0;
  if (g <= -full) o = 1;
  return { gauge: g, owner: o };
}

// 거점마다 원 안의 무게를 세고 게이지를 움직인다. 소유가 바뀌면 onOwnerChange(st, oldOwner, newOwner).
export function stepCapture(w, onOwnerChange) {
  const s = w.soldiers, r = w.rules, dt = r.dt;
  for (const st of w.strongholds) {
    const weight = [0, 0];
    const r2 = st.radius * st.radius;
    forEachNear(s, st.x, st.z, st.radius, j => {
      if (!s.alive[j]) return;
      const dx = s.x[j] - st.x, dz = s.z[j] - st.z;
      if (dx * dx + dz * dz <= r2) weight[s.side[j]] += r.units[s.side[j]][s.type[j]].weight;
    });
    st.weightIn = weight;
    const base = r.capture[st.kind];
    const wallUp = wallStanding(st);
    const res = stepGauge(st.gauge, st.owner, weight[0], weight[1], base, dt,
      { wallUp: wallUp && st.kind !== 'hq', hqLocked: wallUp && st.kind === 'hq', decaySeconds: r.capture.decaySeconds });
    const old = st.owner;
    st.gauge = res.gauge;
    st.owner = res.owner;
    if (old !== res.owner) onOwnerChange?.(st, old, res.owner);
  }
}
