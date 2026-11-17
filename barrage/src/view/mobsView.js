// 일반 몬스터·보상·문(스테이지 설계 §6): 단순한 도형. 몸 = 어두운 자주, 준비 동안 다음 위협 색으로 번쩍인다(흰 = 받아칠 것, 빨강 = 피할 것).
// 등장 예고 = 바닥의 옅은 자주 원판(고리는 파도 뜻이라 쓰지 않는다). 머리 위 체력 막대와 글자는 겹 화면(hud.js)이 그린다.
// 모델 앞 = +x(보스와 같다): rotation.y = −face.
import { CARDS } from '../sim/cards.js';
import { warpAt } from './warp.js';

export function createMobsView(view, LOOK) {
  const THREE = view.THREE, C = LOOK.colors, L = view.layers;
  const col = c => new THREE.Color(c);
  const flat = g => { g.rotateX(-Math.PI / 2); return g; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const shieldMat = new THREE.MeshLambertMaterial({ color: C.mobShield });
  const markerGeo = flat(new THREE.CircleGeometry(1, 28));

  function build(kind) {
    const M = LOOK.mobs, g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: C.mob, emissive: col('#000000') });
    const add = (geo, x, y, z, m = mat) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
    if (kind === 'shooter') {
      const S = M.shooter;
      add(new THREE.ConeGeometry(S.r, S.h, 14), 0, S.h / 2, 0);
      add(new THREE.BoxGeometry(...S.barrel), S.r * 0.6 + S.barrel[0] / 2, S.h * 0.45, 0);
    } else if (kind === 'charger') {
      const S = M.charger, geo = new THREE.ConeGeometry(S.r, S.len, 4);
      geo.rotateY(Math.PI / 4); geo.rotateZ(-Math.PI / 2);   // 뾰족한 끝이 앞(+x)
      add(geo, 0, S.y, 0).scale.y = S.flat;
    } else if (kind === 'mortar') {
      const S = M.mortar;
      add(new THREE.BoxGeometry(...S.box), 0, S.box[1] / 2, 0);
      const barrel = add(new THREE.CylinderGeometry(S.barrel[0], S.barrel[0] * 1.2, S.barrel[1], 10), 0.15, S.box[1] + S.barrel[1] * 0.3, 0);
      barrel.rotation.z = -S.tilt * 0.5;
    } else if (kind === 'bomber') {
      const S = M.bomber;
      add(new THREE.SphereGeometry(S.r, 14, 10), 0, S.r, 0);
      add(new THREE.CylinderGeometry(S.fuse[0], S.fuse[0], S.fuse[1], 6), 0, S.r * 2 + S.fuse[1] / 2 - 0.05, 0, shieldMat);
    } else if (kind === 'waller') {   // 장벽병: 옆으로 넓은 판 + 위의 가는 판
      const S = M.waller;
      add(new THREE.BoxGeometry(...S.box), 0, S.box[1] / 2, 0);
      add(new THREE.BoxGeometry(...S.fin), S.box[0] * 0.3, S.box[1] + S.fin[1] / 2, 0, shieldMat);
    } else if (kind === 'spinner') {   // 회전포: 낮은 원통 + 마주 보는 포신 둘(도는 쪽 = 몸의 방향)
      const S = M.spinner;
      add(new THREE.CylinderGeometry(S.r, S.r * 1.15, S.h, 12), 0, S.h / 2, 0);
      add(new THREE.BoxGeometry(...S.barrel), S.r * 0.5 + S.barrel[0] / 2, S.h * 0.75, 0);
      add(new THREE.BoxGeometry(...S.barrel), -(S.r * 0.5 + S.barrel[0] / 2), S.h * 0.75, 0);
      add(new THREE.OctahedronGeometry(S.cap, 0), 0, S.h + S.cap * 0.7, 0, shieldMat);
    } else if (kind === 'totem') {
      const S = M.totem;
      add(new THREE.CylinderGeometry(S.r * 0.7, S.r, S.h, 6), 0, S.h / 2, 0);
      add(new THREE.OctahedronGeometry(S.cap, 0), 0, S.h + S.cap * 0.8, 0, shieldMat);
    } else {
      const S = M.shield;
      add(new THREE.BoxGeometry(...S.box), 0, S.box[1] / 2, 0);
      add(new THREE.BoxGeometry(...S.plate), S.plateAt, S.plate[1] / 2 + 0.05, 0, shieldMat);
    }
    const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: C.normal, transparent: true, depthWrite: false, opacity: 0 }));
    marker.position.y = 0.012;
    // 보호탑의 둘레(옅은 자주 원판 — 이 안의 몬스터는 평타에 안 다친다)
    let aura = null;
    if (kind === 'totem') { aura = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: C.normal, transparent: true, depthWrite: false, opacity: M.totem.auraAlpha })); aura.position.y = 0.011; aura.visible = false; L.floorFx.add(aura); }
    L.actors.add(g); L.floorFx.add(marker);
    return { g, mat, marker, aura, kind, hitAt: -1e9, lastHp: null };
  }

  const pool = new Map();   // 몬스터 id → 그림
  function drop(id) { const v = pool.get(id); if (!v) return; L.actors.remove(v.g); L.floorFx.remove(v.marker); if (v.aura) { L.floorFx.remove(v.aura); v.aura.material.dispose(); } v.mat.dispose(); v.marker.material.dispose(); pool.delete(id); }

  // ── 보상(떠서 도는 도형 + 바닥 빛)과 문(오른쪽 난간의 빛나는 틀)
  // 카드는 갈래마다 모양이 다르다(색은 청록 하나 — 흰·금·빨강·보라는 탄의 색이라 쓰지 않는다): 무기 = 팔면체, 탄 기술 = 공, 이동기 = 뿔, 몸 = 상자. 무르기 = 회색 사면체
  const rewardGeo = { weapon: new THREE.OctahedronGeometry(1, 0), orb: new THREE.SphereGeometry(0.85, 14, 10), move: new THREE.ConeGeometry(0.8, 1.5, 4), body: new THREE.BoxGeometry(1.2, 1.2, 1.2), cancel: new THREE.TetrahedronGeometry(0.8, 0),
    shield: new THREE.TorusGeometry(0.8, 0.26, 8, 20), bomb: new THREE.DodecahedronGeometry(0.9, 0), heal: new THREE.IcosahedronGeometry(0.9, 1) };
  const rewards = [0, 1, 2].map(() => {
    const body = new THREE.Mesh(rewardGeo.heal, new THREE.MeshBasicMaterial({ color: C.heal, transparent: true }));
    const floor = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: C.heal, transparent: true, depthWrite: false, opacity: 0 }));
    floor.position.y = 0.012; body.visible = floor.visible = false;
    L.actors.add(body); L.floorFx.add(floor);
    return { body, floor };
  });
  const door = new THREE.Group(), doorMat = new THREE.MeshBasicMaterial({ color: C.door, transparent: true });
  const doorLight = new THREE.Mesh(flat(new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ color: C.door, transparent: true, depthWrite: false, opacity: 0.2 }));
  const posts = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), doorMat); door.add(m); return m; });
  door.visible = doorLight.visible = false;
  L.actors.add(door); L.floorFx.add(doorLight);

  function update(w, alpha, now) {
    const M = LOOK.mobs, seen = new Set();
    const sn = w.tries?.snipe, Wp = LOOK.tries.snipe.warp, warpOut = [0, 0];   // 저격이 가른 공기: 줄 곁의 몬스터가 밀렸다 돌아온다(그림만)
    for (const m of w.enemies ?? []) {
      seen.add(m.id);
      let v = pool.get(m.id);
      if (!v) { v = build(m.kind); pool.set(m.id, v); }
      const x = lerp(m.px, m.x, alpha), z = lerp(m.pz, m.z, alpha), age = w.time - m.bornAt;
      v.marker.position.x = x; v.marker.position.z = z;
      v.marker.scale.setScalar(M.markerR);
      // 등장 예고: 바닥 원판이 깜빡이다가 몸이 튀어나온다
      v.marker.visible = age < 0 && !m.dead;
      v.marker.material.opacity = M.markerAlpha * (0.6 + 0.4 * Math.sin(now * 14));
      const lit = m.dead && m.kind === 'bomber' && !m.boomed;   // 죽은 자폭병: 터질 때까지 빨갛게 깜빡이며 남는다
      const dying = m.dead && !lit ? (w.time - (m.diedAt ?? w.time)) / M.dieSec : 0;
      if (v.aura) { v.aura.visible = age >= 0 && !m.dead; v.aura.position.x = x; v.aura.position.z = z; v.aura.scale.setScalar(w.rules.mobs.totem.aura); v.aura.material.opacity = M.totem.auraAlpha * (0.8 + 0.2 * Math.sin(now * 3)); }
      v.g.visible = age >= 0 && dying < 1;
      if (!v.g.visible) continue;
      warpAt(Wp, sn, x, z, view.simTime ?? w.time, warpOut);
      // 움찔: 맞은 순간 플레이어 반대쪽으로 살짝 밀리고 부푼다(평타에 계속 맞으면 떨린다)
      const Fl = LOOK.guns.flinch, fl = Math.max(0, 1 - (now - v.hitAt) / Fl.sec), fd = Math.hypot(m.x - w.player.x, m.z - w.player.z) || 1;
      v.g.position.set(x + warpOut[0] + (m.x - w.player.x) / fd * Fl.push * fl, 0, z + warpOut[1] + (m.z - w.player.z) / fd * Fl.push * fl);
      v.g.rotation.y = -m.face;
      const pop = age < M.pop ? 0.4 + 0.6 * (age / M.pop) : 1;
      v.g.scale.setScalar((lit ? 1 + 0.15 * Math.sin(now * 40) : m.dead ? Math.max(0.05, 1 - dying) : pop) * (m.dead ? 1 : 1 + Fl.pop * fl) * (m.elite ? m.r / w.rules.mobs[m.kind].r : 1));   // 정예는 몸이 크다
      // 번쩍임: 준비 = 위협 색(포격병 빨강, 나머지 흰), 돌진 중 = 흰, 맞으면 잠깐 청록
      if (v.lastHp != null && m.hp < v.lastHp) v.hitAt = now;
      v.lastHp = m.hp;
      const warn = m.state === 'windup' || m.state === 'dash' || m.state === 'fly';
      if (lit) { v.mat.emissive.set(C.red); v.mat.emissiveIntensity = 0.6 + 0.4 * Math.sin(now * 40); }
      else if (warn && !m.dead) { v.mat.emissive.set(m.state === 'fly' ? C.cyan : m.kind === 'mortar' ? C.red : C.white); v.mat.emissiveIntensity = m.state === 'dash' || m.state === 'fly' ? 0.9 : 0.5 + 0.3 * Math.sin(now * 30); }   // 자폭병의 심지는 흰색(받아칠 수 있다), 튕겨 날아가는 것은 청록(내 것)
      else if (now - v.hitAt < M.hitFlash) { v.mat.emissive.set(C.cyan); v.mat.emissiveIntensity = 0.55; }
      else v.mat.emissiveIntensity = 0;
    }
    for (const id of [...pool.keys()]) if (!seen.has(id)) drop(id);

    // 보상
    const list = w.stage?.rewards ?? [];
    rewards.forEach((r, k) => {
      const it = list[k];
      r.body.visible = r.floor.visible = !!it;
      if (!it) return;
      const card = it.kind === 'card' || it.kind === 'held';
      const ready = Math.min(1, (w.time - it.born) / w.rules.stage.rewardDelay), c = it.kind === 'cancel' ? C.textDim ?? C.text : card ? C.cyan : it.kind === 'charge' ? C.item : C.heal;
      r.body.geometry = it.kind === 'cancel' ? rewardGeo.cancel : card ? rewardGeo[CARDS[it.what].group] : it.kind === 'charge' ? rewardGeo[it.what] : rewardGeo.heal;
      r.body.material.color.set(c); r.body.material.opacity = (0.35 + 0.65 * ready) * (it.kind === 'held' && !it.armed ? 0.5 : 1);
      r.body.position.set(it.x, M.rewardY + M.rewardBob * Math.sin(now * 2.4 + k), it.z);
      r.body.rotation.set(it.what === 'shield' ? Math.PI / 2.6 : 0.3, now * M.rewardSpin + k, 0);
      const hold = it.since != null ? Math.min(1, (w.time - it.since) / w.rules.stage.pickHold) : 0;   // 올라서 있는 동안 부푼다(다 차면 주워진다)
      r.body.scale.setScalar(M.rewardR * (0.5 + 0.5 * ready) * (1 + M.rewardHold * hold));
      r.floor.material.color.set(c); r.floor.material.opacity = M.rewardGlow * ready * (0.75 + 0.25 * Math.sin(now * 5 + k));
      r.floor.position.x = it.x; r.floor.position.z = it.z; r.floor.scale.setScalar(M.rewardFloorR);
    });

    // 문
    const d = w.stage?.door;
    door.visible = doorLight.visible = !!d;
    if (d) {
      const span = d.halfZ * 2, P = M.doorPost, beat = 0.75 + 0.25 * Math.sin(now * 5);
      door.position.set(d.x + P, 0, d.z);
      posts[0].scale.set(P, M.doorH, P); posts[0].position.set(0, M.doorH / 2, -d.halfZ);
      posts[1].scale.set(P, M.doorH, P); posts[1].position.set(0, M.doorH / 2, d.halfZ);
      posts[2].scale.set(P, P, span + P); posts[2].position.set(0, M.doorH, 0);
      doorMat.opacity = beat;
      doorLight.scale.set(M.doorLight, 1, span); doorLight.position.set(d.x - M.doorLight / 2, 0.012, d.z);
      doorLight.material.opacity = M.doorGlow * 0.5 * beat;
    }
  }

  return { update };
}
