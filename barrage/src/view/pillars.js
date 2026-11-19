// 솟는 불길: 터진 자리에서 위로 솟았다 꺼지는 열린 원기둥(위로 갈수록 좁다)의 풀 — 높이를 쓰는 연출.
// 포격수(siegeView.js)가 쓴다. 나는 용(wyrmView.js)은 제 것을 그대로 쓴다(같은 모양).
export function createPillars(view) {
  const THREE = view.THREE, L = view.layers;
  const geo = new THREE.CylinderGeometry(0.55, 1, 1, 14, 1, true);
  geo.translate(0, 0.5, 0);
  const free = [], live = [];
  return {
    // (x, z)에서 밑 반지름 R, 높이 h로 sec초 동안
    add(now, x, z, R, h, sec, color) {
      const m = free.pop() ?? new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.material.color.set(color);
      m.position.set(x, 0.02, z);
      L.fx.add(m);
      live.push({ m, t0: now, R, h, sec });
    },
    update(now) {
      for (let i = live.length - 1; i >= 0; i--) {
        const it = live[i], u = (now - it.t0) / it.sec;
        if (u >= 1 || u < 0) { L.fx.remove(it.m); free.push(it.m); live.splice(i, 1); continue; }
        const grow = 1 - (1 - u) ** 3;
        it.m.scale.set(it.R * (0.7 + 0.3 * grow), Math.max(0.01, it.h * grow), it.R * (0.7 + 0.3 * grow));
        it.m.material.opacity = (1 - u) ** 1.5 * 0.85;
      }
    },
    count: () => live.length,
  };
}
