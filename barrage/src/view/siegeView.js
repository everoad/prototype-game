// 포격수(sim/siege.js)의 높이를 쓰는 연출. 판정은 바닥의 원 · 탄 · 시각이 정한다(sim). 여기서는 그것이 눈에 읽히게만 한다:
//  · 포신: 몸 둘레에 회오리의 팔 수만큼 — 몸이 도는 쪽을 따라 돈다(회오리의 탄이 어디서 나오는지)
//  · 발밑 그림자: 뛰어오르면 작아지고 옅어진다 — 어디로 떨어지는지를 읽는 것
//  · 날아가는 포탄: 보스에게서 떨어질 자리까지 포물선(바닥의 빨간 원이 떨어질 자리, 작은 그림자가 지금 자리)
//  · 솟는 불: 폭탄 밭이 터질 때 원마다, 포탄이 떨어진 자리, 덮친 자리의 둘레
// 수호자 + 새 패턴(boss.mix — sim/brain.js)도 이 연출을 쓴다. 포신만 빼고(수호자의 몸 그대로).
// 판 상태는 읽기만 한다. 수치는 LOOK.siege.
import { createPillars } from './pillars.js';

export function createSiegeView(view, LOOK, fx, actors) {
  const THREE = view.THREE, C = LOOK.colors, G = LOOK.siege, L = view.layers;
  const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra });
  const pillars = createPillars(view);

  const disc = new THREE.CircleGeometry(1, 32);
  disc.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(disc, flat('#000000'));
  shadow.position.y = 0.02; shadow.visible = false;
  L.shadow.add(shadow);

  // 포신: 보스 몸의 자식(자리 · 도는 각 · 뛰어오른 높이 · 죽을 때의 크기를 같이 탄다). 몸의 앞(+x)에서부터 고르게.
  const Bl = G.barrel, MAX = 6, barrels = [];
  const barrelGeo = new THREE.BoxGeometry(Bl.len, Bl.h, Bl.w);
  for (let k = 0; k < MAX; k++) {
    const m = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: Bl.color }));
    m.castShadow = true; m.visible = false;
    actors.boss.add(m); barrels.push(m);
  }

  // 날아가는 포탄: 겉 + 밝은 속 + 바닥의 작은 그림자
  const ball = new THREE.SphereGeometry(1, 16, 10), shells = [];
  function shellMeshes(i) {
    if (!shells[i]) {
      const out = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: C.normal })), core = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: C.normalCore })), sh = new THREE.Mesh(disc, flat('#000000'));
      sh.position.y = 0.02;
      L.fx.add(out, core); L.shadow.add(sh);
      shells[i] = { out, core, sh };
    }
    return shells[i];
  }

  function onEvents(events, now, w) {
    if (!w.boss.siege && !w.boss.mix) return;
    for (const e of events) {
      if (e.type === 'bombsBlast') {
        const B = G.boom;
        e.cells.forEach(([x, z], k) => {
          pillars.add(now, x, z, e.R * B.r, B.h * (0.8 + 0.4 * ((k * 7) % 5) / 4), B.sec, C.red);   // 높이가 들쭉날쭉하게(화면만)
          if (k % B.sparkEvery === 0) fx.rise(x, z, 'red', B.sparks, B.sparkUp);
        });
        const parried = e.outcome === 'parry' || e.outcome === 'perfect';
        pillars.add(now, e.white.x, e.white.z, e.white.R * B.r, B.whiteH, B.sec * 1.2, parried ? C.cyan : C.white);
        fx.rise(e.white.x, e.white.z, parried ? 'cyan' : 'white', B.sparks * 3, B.sparkUp);
      } else if (e.type === 'shellLand') {
        const D = G.land;
        pillars.add(now, e.x, e.z, D.r, D.h, D.sec, C.normal);
        pillars.add(now, e.x, e.z, D.r * 0.5, D.h * 1.25, D.sec * 0.8, C.normalCore);
        fx.burst(e.x, e.z, 'purple', D.burst);
        fx.rise(e.x, e.z, 'purple', D.sparks, D.sparkUp);
      } else if (e.type === 'shellBurst') fx.burst(e.x, e.z, e.white ? 'white' : 'purple', G.burst);
      else if (e.type === 'siegeSlam') {
        const D = G.slam, c = e.color === 'red' ? C.red : C.white;
        for (let k = 0; k < D.n; k++) { const a = k / D.n * Math.PI * 2; pillars.add(now, e.x + Math.cos(a) * D.r, e.z + Math.sin(a) * D.r, D.w, D.h, D.sec, c); }
        fx.rise(e.x, e.z, e.color === 'red' ? 'red' : 'white', D.sparks, D.sparkUp);
      } else if (e.type === 'siegeLeap') fx.rise(e.x, e.z, 'grey', G.leap.sparks, G.leap.up);
    }
  }

  function update(w, now) {
    const b = w.boss, on = !!(b.siege || b.mix) && !b.dead, alt = b.alt ?? 0, S = G.shadow;
    shadow.visible = on && alt > 0.05;
    if (shadow.visible) {
      const k = Math.max(S.min, 1 - alt * S.shrink);
      shadow.position.x = b.x; shadow.position.z = b.z;
      shadow.scale.setScalar(S.r * k);
      shadow.material.opacity = S.alpha * k;
    }
    // 포신: 회오리를 도는 동안은 그 팔 수, 그 밖에는 이 단계의 팔 수
    const n = Math.min(MAX, b.act && b.act.kind === 'whirl' ? b.act.arms : w.rules.siege.whirl.arms[(b.phase ?? 1) - 1]);
    for (let k = 0; k < MAX; k++) {
      const m = barrels[k];
      m.visible = !!b.siege && k < n;
      if (!m.visible) continue;
      const a = k * Math.PI * 2 / n;
      m.position.set(Math.cos(a) * Bl.at, Bl.y, Math.sin(a) * Bl.at);
      m.rotation.y = -a;
    }
    // 날아가는 포탄
    const Sv = G.shell, list = on && b.act && b.act.kind === 'shells' ? b.act.list : [];
    let si = 0;
    for (const s of list) {
      if (s.stage !== 'fly') continue;
      const g = shellMeshes(si++), u = Math.max(0, Math.min(1, (w.time - s.born) / (s.T - s.born)));
      const x = s.fx + (s.x - s.fx) * u, z = s.fz + (s.z - s.fz) * u, y = Sv.from * (1 - u) + Sv.alt * 4 * u * (1 - u) + Sv.r * u, spin = 1 + 0.12 * Math.sin(now * 30);
      g.out.visible = g.core.visible = g.sh.visible = true;
      g.out.position.set(x, y, z); g.out.scale.setScalar(Sv.r * spin);
      g.core.position.set(x, y, z); g.core.scale.setScalar(Sv.r * Sv.core);
      const k = Math.max(0.4, 1 - y * Sv.shrink);
      g.sh.position.x = x; g.sh.position.z = z; g.sh.scale.setScalar(Sv.shadowR * k); g.sh.material.opacity = Sv.shadowAlpha * k;
    }
    for (; si < shells.length; si++) shells[si].out.visible = shells[si].core.visible = shells[si].sh.visible = false;
    pillars.update(now);
  }
  return { onEvents, update, count: () => pillars.count() };
}
