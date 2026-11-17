// 검사 그리기(sim/sword.js — 설계 2026-11-17-barrage-sword-design.md §10): 일섬이 지나간 길 · 회전 베기의 칼자국 · 마무리의 칼자국과 튕긴 길 · 내릴 자리 표시.
// 또렷한 청록 선만 쓴다(청록 = 내 것). 퍼지는 고리·부드러운 띠는 쓰지 않는다 — 고리는 패링·파도의 뜻이다.
// 사건(bladeSlash·bladeSpin·bladeFinish)을 받아 실제 시간으로 짧게 그렸다가 지운다. 판 상태는 읽기만 한다. 수치는 LOOK.sword.
// 쌍검의 칼바람(기본 공격): 좌우 칼이 번갈아 내는 초승달 — 좌우로 엇갈려 비껴 날아가고 잔상이 뒤따른다. 낼 때 몸 앞에 짧은 칼자국, 맞힌 자리에는 엇갈린 칼자국이 X로 쌓인다.
// 탄이 느려지는 둘레는 발밑의 아주 옅은 원판(어디까지인지 보이게).
import { isSword, slashLanding } from '../sim/sword.js';

// 줄 하나가 이번 장에 몸을 따라가는가(순수 — 시험): 제 움직임(move 객체)이 아직 가는 중이고 판이 끝나지 않았을 때만.
// 이어서 나간 다음 일섬(다른 객체)이나 판이 끝난 뒤(sim이 멈춰 움직임이 남아 있다)에는 따라가지 않는다.
export const lineFollows = (line, mv, result) => !!line.live && !result && !!mv && mv === line.move;

export function createSwordView(view, LOOK) {
  const THREE = view.THREE, C = LOOK.colors, L = view.layers, V = LOOK.sword;
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };
  const mat = () => new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, depthWrite: false });
  // 줄: 한쪽 끝에서 +x로 뻗는 납작한 판(길이 1 · 굵기 1)을 늘이고 돌려 쓴다
  const lineGeo = flat(new THREE.PlaneGeometry(1, 1)); lineGeo.translate(0.5, 0, 0);
  const lines = [];   // { m, x0, z0, x1, z1, w, t0, sec, live, move, end } — live = 몸이 아직 가는 중(끝이 몸을 따라간다), move = 그 움직임, end = 다 갔을 때의 끝(일섬)
  const free = [];
  function line(x0, z0, x1, z1, w, t0, sec, live = null, end = null) {
    const m = free.pop() ?? new THREE.Mesh(lineGeo, mat());
    L.fx.add(m);
    lines.push({ m, x0, z0, x1, z1, w, t0, sec, live, move: null, fresh: !!live, end });
  }
  // 회전 베기: 몸 둘레를 한 바퀴 빠르게 도는 짧은 칼자국(호) — 닫힌 고리로 남지 않는다
  let arcGeo = null, arcR = 0;
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), mat());
  arc.visible = false; L.fx.add(arc);
  const sweep = { t0: -1e9, x: 0, z: 0, a0: 0 };
  // 낼 때: 몸 앞에서 그쪽 칼이 긋는 짧은 칼자국(호)
  const Ct = V.cut, swingGeo = flat(new THREE.RingGeometry(Ct.arcR - Ct.arcW, Ct.arcR, 12, 1, -Ct.arcDeg * Math.PI / 360, Ct.arcDeg * Math.PI / 180));
  const swings = [], swingFree = [];   // { m, t0, a, side }
  // 칼바람: 초승달(가운데가 두껍고 끝이 뾰족하다 — 날아가는 쪽이 볼록). 반지름 1로 만들어 판의 칼바람 반지름만큼 키운다
  const Wl = V.wave, tip = Wl.arcDeg * Math.PI / 360, cres = new THREE.Shape();
  cres.moveTo(Math.cos(tip), -Math.sin(tip));
  cres.absarc(0, 0, 1, -tip, tip, false);
  cres.quadraticCurveTo(2 * (1 - Wl.thick) - Math.cos(tip), 0, Math.cos(tip), -Math.sin(tip));   // 안쪽 곡선: 가운데 두께가 thick
  const cutGeo = flat(new THREE.ShapeGeometry(cres, 10));   // 눕힌다(+x가 날아가는 쪽)
  const coreMat = () => new THREE.MeshBasicMaterial({ color: Wl.core, transparent: true, depthWrite: false });
  const cutPool = [];   // 칼바람 하나에 겹 여럿: 밝은 속 + 청록 몸 + 잔상
  // 둘레: 발밑의 아주 옅은 원판(퍼지지 않는다 — 늘 같은 크기)
  const field = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 48)), mat());
  field.visible = false; L.floorFx.add(field);
  // 내릴 자리: 작은 마름모 하나(고리가 아니다)
  const mark = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 4)), mat());
  mark.material.depthTest = false; mark.visible = false; L.marker.add(mark);
  let face = 0;

  function onEvents(events, now) {
    for (const e of events) {
      if (e.type === 'bladeWave') {   // 그쪽 칼이 몸 앞에서 긋는다
        const m = swingFree.pop() ?? new THREE.Mesh(swingGeo, mat());
        L.fx.add(m); swings.push({ m, t0: now, a: e.angle, side: e.side });
      } else if (e.type === 'waveHit') {   // 맞힌 자리: 비스듬한 칼자국(좌우가 엇갈려 X가 된다)
        const t = e.angle + Math.PI / 2 + e.side * Ct.markTiltDeg * Math.PI / 180, dx = Math.cos(t) * Ct.markLen / 2, dz = Math.sin(t) * Ct.markLen / 2;
        line(e.x - dx, e.z - dz, e.x + dx, e.z + dz, Ct.markW, now, Ct.markSec);
      } else if (e.type === 'bladeSlash') line(e.x0, e.z0, e.x0, e.z0, V.trail.w, now, V.trail.sec, 'slash', [e.x1, e.z1]);
      else if (e.type === 'bladeSpin') {
        if (!arcGeo || arcR !== e.R) { arcGeo?.dispose(); arcR = e.R; arcGeo = flat(new THREE.RingGeometry(e.R - V.sweep.w, e.R, V.sweep.seg, 1, 0, V.sweep.arcDeg * Math.PI / 180)); arc.geometry = arcGeo; }
        Object.assign(sweep, { t0: now, x: e.x, z: e.z, a0: face });
      } else if (e.type === 'bladeFinish') {
        const F = V.finish;
        for (let k = 0; k < F.n; k++) {   // 앞으로 벌어진 칼자국 몇 줄
          const a = e.angle + (F.n > 1 ? (k / (F.n - 1) - 0.5) * F.fanDeg * Math.PI / 180 : 0);
          line(e.x, e.z, e.x + Math.cos(a) * F.len, e.z + Math.sin(a) * F.len, F.w, now, F.sec);
        }
        line(e.x, e.z, e.x, e.z, F.backW, now, F.sec, 'back');   // 튕겨 나오는 길
      }
    }
  }

  function update(w, alpha, now) {
    const p = w.player, mv = p.blade ? p.blade.move : null;
    const px = p.px + (p.x - p.px) * alpha, pz = p.pz + (p.z - p.pz) * alpha;
    face = p.face;
    for (let k = lines.length - 1; k >= 0; k--) {
      const l = lines[k];
      if (l.fresh) { l.fresh = false; l.move = mv && mv.kind === l.live ? mv : null; }   // 처음 그리는 장에 제 움직임을 붙든다
      if (l.live) {   // 몸이 가는 동안은 끝이 몸에 붙어 있고, 서면 그때부터 흐려진다
        if (lineFollows(l, mv, w.result)) { l.x1 = px; l.z1 = pz; }
        else { if (l.end) [l.x1, l.z1] = l.end; l.live = null; l.t0 = now; }
      }
      const u = l.live ? 0 : (now - l.t0) / l.sec;
      if (u >= 1) { L.fx.remove(l.m); free.push(l.m); lines.splice(k, 1); continue; }
      const dx = l.x1 - l.x0, dz = l.z1 - l.z0, len = Math.hypot(dx, dz);
      l.m.visible = len > 1e-3;
      l.m.position.set(l.x0, V.y, l.z0);
      l.m.rotation.y = -Math.atan2(dz, dx);
      l.m.scale.set(len, 1, l.w * (1 - V.trail.thin * u));   // 흐려지며 가늘어진다
      l.m.material.opacity = 1 - u;
    }
    const su = (now - sweep.t0) / V.sweep.sec, hold = V.sweep.hold / V.sweep.sec;
    arc.visible = su >= 0 && su < 1 + hold;
    if (arc.visible) {
      arc.position.set(sweep.x, V.y, sweep.z);
      arc.rotation.y = -(sweep.a0 + Math.min(1, su) * Math.PI * 2);
      arc.material.opacity = su < 1 ? 1 : 1 - (su - 1) / hold;
    }
    // 칼바람: 속(밝게) + 몸(청록) + 잔상 — 좌우로 번갈아 비껴서 연달아 나가면 X로 엇갈린다
    const cuts = p.blade && p.blade.cuts ? p.blade.cuts : [], Wr = w.rules.sword.wave;
    const layers = [[0, 1, Wl.coreScale, true], [0, 1, 1, false], ...Wl.ghosts.map(([back, dim]) => [back, dim, 1, false])], per = layers.length;
    while (cutPool.length < cuts.length * per) { const core = layers[cutPool.length % per][3], m = new THREE.Mesh(cutGeo, core ? coreMat() : mat()); (core ? L.fx : L.shots).add(m); cutPool.push(m); }
    for (let k = 0; k < cutPool.length; k++) {
      const m = cutPool[k], c = cuts[Math.floor(k / per)], [back0, dim, scale, core] = layers[k % per];
      const back = core ? -(1 - scale) * Wr.r * Wl.size : back0;   // 밝은 속은 앞 가장자리에 맞춘다
      const gone = c ? Wr.range - c.left : 0;   // 날아온 거리 — 잔상은 그보다 뒤로 물러나지 않는다(몸 뒤에 그려지지 않게)
      m.visible = !!c && gone >= back0;
      if (!m.visible) continue;
      m.position.set(c.px + (c.x - c.px) * alpha - Math.cos(c.a) * back, V.y, c.pz + (c.z - c.pz) * alpha - Math.sin(c.a) * back);
      m.rotation.y = -(c.a + c.side * Wl.tiltDeg * Math.PI / 180);
      m.scale.setScalar(Wr.r * Wl.size * scale * (1 + Wl.grow * gone / Wr.range));   // 날아가며 조금 커진다
      m.material.opacity = Wl.alpha * dim * Math.min(1, c.left / (Wr.range * Wl.fade));
    }
    // 몸 앞의 칼자국: 짧게 그었다가 사라진다(몸을 따라간다)
    for (let k = swings.length - 1; k >= 0; k--) {
      const sw = swings[k], u = (now - sw.t0) / Ct.arcSec;
      if (u >= 1) { L.fx.remove(sw.m); swingFree.push(sw.m); swings.splice(k, 1); continue; }
      sw.m.position.set(px, V.y, pz);
      sw.m.rotation.y = -(sw.a + sw.side * (Ct.sweepDeg * (0.5 - u)) * Math.PI / 180);   // 바깥에서 안으로 긋는다
      sw.m.material.opacity = Ct.arcAlpha * (1 - u * u);
    }
    // 둘레
    field.visible = isSword(w) && !w.result;
    if (field.visible) { field.position.set(px, V.field.y, pz); field.scale.setScalar(w.rules.sword.field.R); field.material.opacity = V.field.alpha; }
    const land = isSword(w) && !w.result && !mv && p.store.length > 0 ? slashLanding(w) : null;
    mark.visible = !!land;
    if (land) {
      mark.position.set(land.x, V.mark.y, land.z);
      mark.scale.setScalar(V.mark.size * (1 + V.mark.pulse[0] * Math.sin(now * V.mark.pulse[1])));
      mark.material.opacity = V.mark.alpha;
    }
  }

  return { onEvents, update };
}
