// 연출 조각(§6): 3D 알갱이(불꽃·터짐·섬광·총구·지우기 반짝임·먼지)와 2D 겹(숫자·맞힌 자리·가장자리 빛·색 번짐).
// 모두 미리 만든 풀에서 꺼내 쓴다(매 화면 새 객체 없음). 섬광·색 번짐·붉은 경고는 화면 가장자리만, 먼지는 바닥 층, 고리 모양 금지.
export function createFx(view, LOOK) {
  const THREE = view.THREE, C = LOOK.colors, L = view.layers;
  const N = 600;
  const P = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N), floor: new Uint8Array(N) };
  const pcol = Array.from({ length: N }, () => new THREE.Color());
  let next = 0;
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mk = layer => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#fff', depthTest: false, depthWrite: false }), N); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); layer.add(m); return m; };
  const air = mk(L.fx), dirt = mk(L.floorFx);
  dirt.material.depthTest = true;
  const named = { white: C.white, gold: C.gold, red: C.red, cyan: C.cyan, purple: C.normal, orange: '#ff8a3c', grey: '#8e8a99', item: C.item, heal: C.heal, wound: C.wound };
  const bh = () => LOOK.sizes.bh;
  let rnd = 12345;   // 연출 전용 난수(sim 난수와 따로)
  const r01 = () => { rnd = (rnd * 1103515245 + 12345) >>> 0; return (rnd >>> 8) / 16777216; };

  function emit(x, y, z, vx, vy, vz, life, size, color, floor = false) {
    const i = next; next = (next + 1) % N;
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.life[i] = life; P.max[i] = life; P.size[i] = size; P.floor[i] = floor ? 1 : 0;
    pcol[i].set(named[color] ?? color);
  }
  function radial(x, z, n, speed, life, size, color, y = bh()) {
    for (let k = 0; k < n; k++) {
      const a = r01() * Math.PI * 2, s = speed * (0.4 + r01() * 0.8);
      emit(x, y, z, Math.cos(a) * s, (r01() - 0.3) * speed * 0.6, Math.sin(a) * s, life * (0.6 + r01() * 0.6), size * (0.6 + r01() * 0.6), color);
    }
  }

  // 2D 겹(HUD 캔버스): 숫자·맞힌 자리·가장자리
  const nums = [], marks = [], edges = [];
  const m4 = new THREE.Matrix4();
  const now2d = { t: 0 };

  const api = {
    spark(x, z, color, size = 1) { radial(x, z, 4, 4 * size, 0.18, 0.06 * size + 0.03, color); },
    burst(x, z, color, scale = 1) { radial(x, z, Math.round(10 * scale), 6 * scale, 0.35, 0.08 * scale, color); emit(x, bh(), z, 0, 0, 0, 0.09, 0.55 * scale, color); },
    flashAt(x, z, color) { emit(x, bh(), z, 0, 0, 0, 0.07, 0.75, color); radial(x, z, 6, 5, 0.16, 0.06, color); },
    tracer(x1, z1, x2, z2, color, scale = 1) {
      const n = Math.round(7 * scale), y = bh() * 1.2;
      for (let i = 0; i <= n; i++) { const u = i / n; emit(x1 + (x2 - x1) * u, y, z1 + (z2 - z1) * u, 0, 0, 0, 0.07 * scale, 0.09 * scale, color); }
    },
    // 올라가는 알갱이(회복): 몸 둘레에서 위로 — 바닥 고리가 아니다
    rise(x, z, color, n = 12) {
      for (let k = 0; k < n; k++) { const a = r01() * Math.PI * 2, d = 0.2 + r01() * 0.5; emit(x + Math.cos(a) * d, 0.2 + r01() * 0.6, z + Math.sin(a) * d, 0, 1.6 + r01() * 1.6, 0, 0.45 + r01() * 0.3, 0.07 + r01() * 0.04, color); }
    },
    // 총구: 번쩍임 + 앞으로 튀는 불티 몇 개(선처럼 짧고 빠르게)
    muzzle(x, z, angle) {
      const M = LOOK.guns.muzzle, mx = x + Math.cos(angle) * M.at, mz = z + Math.sin(angle) * M.at, y = bh() * 1.2;
      emit(mx, y, mz, 0, 0, 0, 0.04, 0.16, 'cyan');
      for (let k = 0; k < M.n; k++) { const a = angle + (r01() - 0.5) * M.coneDeg * Math.PI / 180, s = M.speed * (M.vary[0] + r01() * M.vary[1]); emit(mx, y, mz, Math.cos(a) * s, 0, Math.sin(a) * s, M.life, M.size, 'cyan'); }
    },
    // 벤 자리: 칼이 지나간 쪽으로 튀는 불티(o = { n, speed, coneDeg, life, size, flash = 번쩍이는 점의 크기(없으면 안 낸다) } — 고르게 퍼지는 불꽃과 달리 베는 방향이 읽힌다)
    spray(x, z, angle, color, o) {
      const y = bh();
      if (o.flash) emit(x, y, z, 0, 0, 0, 0.05, o.flash, color);   // 벤 순간의 짧은 번쩍임(한 점)
      for (let k = 0; k < o.n; k++) { const a = angle + (r01() - 0.5) * o.coneDeg * Math.PI / 180, s = o.speed * (0.5 + r01() * 0.8); emit(x, y, z, Math.cos(a) * s, (r01() - 0.3) * o.speed * 0.25, Math.sin(a) * s, o.life * (0.6 + r01() * 0.6), o.size * (0.6 + r01() * 0.7), color); }
    },
    // 산탄이 나갈 때: 부채꼴로 튀는 불티(spread = 부채 너비, 라디안)
    fan(x, z, angle, spread, mul = 1) {   // mul = 세기(한 방의 큰 부채 — 불티 수가 mul배)
      const Fn = LOOK.guns.fan, y = bh() * 1.2, n = Math.max(2, Math.round(Fn.n * mul));
      for (let k = 0; k < n; k++) { const a = angle + (k / (n - 1) - 0.5) * spread, s = Fn.speed * (Fn.vary[0] + r01() * Fn.vary[1]); emit(x + Math.cos(a) * Fn.at, y, z + Math.sin(a) * Fn.at, Math.cos(a) * s, 0, Math.sin(a) * s, Fn.life, Fn.size, 'cyan'); }
    },
    clearSparkle(x, z, r) {
      const n = r === Infinity ? 40 : 14, rr = r === Infinity ? 9 : r;
      for (let k = 0; k < n; k++) { const a = r01() * Math.PI * 2, d = Math.sqrt(r01()) * rr; emit(x + Math.cos(a) * d, bh(), z + Math.sin(a) * d, 0, 1.5 + r01(), 0, 0.3 + r01() * 0.2, 0.07, 'purple'); }
    },
    // 먼지: 바닥 층, 알갱이마다 거리·빠르기·크기가 달라 고리가 생기지 않는다
    // 위로 솟는 불티(나는 용의 불 — 높이를 쓰는 연출): n개가 up의 빠르기로 올라가며 조금 퍼진다
    rise(x, z, color, n = 8, up = 8) { for (let k = 0; k < n; k++) { const a = r01() * Math.PI * 2, s = 1 + r01() * 2.5; emit(x + Math.cos(a) * 0.5, 0.2, z + Math.sin(a) * 0.5, Math.cos(a) * s, up * (0.5 + r01() * 0.7), Math.sin(a) * s, 0.3 + r01() * 0.35, 0.09 + r01() * 0.08, color); } },
    dust(x, z, scale = 1) {
      for (let k = 0; k < Math.round(16 * scale); k++) { const a = r01() * Math.PI * 2, d = (0.6 + r01() * 1.4) * scale, s = (1 + r01() * 3) * scale; emit(x + Math.cos(a) * d, 0.05, z + Math.sin(a) * d, Math.cos(a) * s, 0.4 * r01(), Math.sin(a) * s, 0.35 + r01() * 0.3, 0.09 + r01() * 0.08, 'grey', true); }
    },
    number(x, z, text, color, size = 22) { nums.push({ x, z, text: String(text), color: named[color] ?? color, size, t: now2d.t }); if (nums.length > 24) nums.shift(); },
    hitMarker(x, z, sec) { marks.push({ x, z, until: now2d.t + sec }); },
    edge(color, sec) { edges.push({ color: named[color] ?? color, start: now2d.t, sec, kind: 'edge' }); },
    aberration(px, sec) { edges.push({ px, start: now2d.t, sec, kind: 'aberration' }); },

    update(now, dt) {
      now2d.t = now;
      air.count = 0; dirt.count = 0;
      for (let i = 0; i < N; i++) {
        if (P.life[i] <= 0) continue;
        P.life[i] -= dt;
        if (P.life[i] <= 0) continue;
        P.x[i] += P.vx[i] * dt; P.y[i] = Math.max(0.02, P.y[i] + P.vy[i] * dt); P.z[i] += P.vz[i] * dt;
        P.vx[i] *= 0.9; P.vz[i] *= 0.9;
        const s = P.size[i] * (P.life[i] / P.max[i]);
        m4.makeScale(s, s, s).setPosition(P.x[i], P.y[i], P.z[i]);
        const mesh = P.floor[i] ? dirt : air;
        mesh.setMatrixAt(mesh.count, m4); mesh.setColorAt(mesh.count, pcol[i]); mesh.count++;
      }
      for (const m of [air, dirt]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },

    // HUD 캔버스 위에(hud.draw 다음)
    draw2d(ctx, W, H, project, player) {
      const t = now2d.t;
      for (let k = nums.length - 1; k >= 0; k--) {
        const n = nums[k], age = t - n.t;
        if (age > 0.8) { nums.splice(k, 1); continue; }
        const s = n.x == null ? project(player.x, player.z, 1.6) : project(n.x, n.z, 1.4);
        ctx.globalAlpha = Math.min(1, 1.6 - age * 2);
        ctx.font = `800 ${n.size}px system-ui, "Malgun Gothic", sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,9,14,0.85)'; ctx.strokeText(n.text, s.x, s.y - age * 40);
        ctx.fillStyle = n.color; ctx.fillText(n.text, s.x, s.y - age * 40);
      }
      ctx.globalAlpha = 1;
      for (let k = marks.length - 1; k >= 0; k--) {
        const m = marks[k]; if (t > m.until) { marks.splice(k, 1); continue; }
        const s = project(m.x, m.z, LOOK.sizes.bh);
        ctx.strokeStyle = C.red; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(s.x - 8, s.y - 8); ctx.lineTo(s.x + 8, s.y + 8); ctx.moveTo(s.x + 8, s.y - 8); ctx.lineTo(s.x - 8, s.y + 8); ctx.stroke();
      }
      // 가장자리 빛·색 번짐: 화면 가장자리만(탄을 가리지 않게)
      for (let k = edges.length - 1; k >= 0; k--) {
        const e = edges[k], u = (t - e.start) / e.sec;
        if (u >= 1) { edges.splice(k, 1); continue; }
        const a = 1 - u;
        if (e.kind === 'edge') {
          const band = Math.min(W, H) * 0.14;
          for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, band, 0, 0, 0, band, H], [W, 0, W - band, 0, W - band, 0, band, H], [0, 0, 0, band, 0, 0, W, band], [0, H, 0, H - band, 0, H - band, W, band]]) {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, hexA(e.color, 0.55 * a)); g.addColorStop(1, hexA(e.color, 0));
            ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
          }
        } else {
          const px = e.px * a;
          ctx.fillStyle = `rgba(255,60,90,${0.35 * a})`; ctx.fillRect(0, 0, px, H); ctx.fillRect(0, 0, W, px * 0.6);
          ctx.fillStyle = `rgba(60,240,230,${0.35 * a})`; ctx.fillRect(W - px, 0, px, H); ctx.fillRect(0, H - px * 0.6, W, px * 0.6);
        }
      }
    },
  };
  return api;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
