// 시험 장면(설계서 2026-11-13-legion-design.md §7 1단계): 싸움이 홍수와 같은지 재는 황금 시험과 화면·영상이 함께 쓴다.
// 세상 함수(createWorld·step·spawn·applyOrder)는 주입받는다(makeApi) — 같은 장면을 홍수 모듈로도 군단 영지 모듈로도 돈다.
// 그래서 다른 sim 모듈을 import하지 않는다. 병종 번호: 0 창 · 1 궁 · 2 기병 · 3 보병 · 4 공성(편 1은 같은 번호의 몬스터).
// 자리: 홍수 시험 지도의 빈 들판 x 470–730, z 150–340(거점·승점·땅에서 110 m 넘게).

const SPEAR = 0, ARCHER = 1, CAV = 2, INF = 3, SIEGE = 4;

export function makeApi(mods) {
  const alive = (w, ids) => ids.filter(i => w.soldiers.alive[i]);
  const api = {
    spawn: (w, side, type, x, z) => mods.spawn(w.soldiers, side, type, x, z, w.rules),
    // n명을 cols열 네모로(가운데 cx, cz, 간격 gap m)
    block(w, side, type, n, cx, cz, cols, gap) {
      const rows = Math.ceil(n / cols), ids = [];
      for (let k = 0; k < n; k++) {
        const c = k % cols, r = Math.floor(k / cols);
        ids.push(api.spawn(w, side, type, cx + (c - (cols - 1) / 2) * gap, cz + (r - (rows - 1) / 2) * gap));
      }
      return ids;
    },
    send: (w, side, ids, target, engage = true, via = null) => mods.applyOrder(w, { kind: 'send', side, from: { kind: 'ids', ids: alive(w, ids) }, target, engage, ...(via ? { via } : {}) }),
    cast: (w, side, order, x, z) => mods.applyOrder(w, { kind: 'cast', side, order, x, z }),
    point: (x, z) => ({ kind: 'point', x, z }),
    foe: (w, id) => ({ kind: 'foe', id, serial: w.soldiers.serial[id] }),
    center(w, ids) {
      const live = alive(w, ids), s = w.soldiers;
      let x = 0, z = 0;
      for (const i of live) { x += s.x[i]; z += s.z[i]; }
      return live.length ? { x: x / live.length, z: z / live.length } : { x: 600, z: 250 };
    },
    nearest(w, ids, p) {
      let best = -1, bd = Infinity;
      for (const i of alive(w, ids)) { const d = (w.soldiers.x[i] - p.x) ** 2 + (w.soldiers.z[i] - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    },
  };
  return api;
}

// 행동 하나: at초에 run. 결과가 { ok: false }면 장면이 잘못된 것이라 멈춘다.
const act = (at, run) => ({ at, run });
const must = r => { if (r && r.ok === false) throw new Error(`시험 장면 행동 실패: ${r.reason}`); return r; };

export const LABS = {
  wedges: { seconds: 60, setup(w, a) {
    const ours = a.block(w, 0, SPEAR, 100, 600, 205, 10, 1.2), theirs = a.block(w, 1, SPEAR, 120, 600, 300, 12, 1.2);
    return [act(0.5, () => { must(a.send(w, 0, ours, a.point(600, 330))); must(a.send(w, 1, theirs, a.point(600, 180))); })];
  } },
  cavanvil: { seconds: 60, setup(w, a) {
    const spears = a.block(w, 0, SPEAR, 200, 600, 235, 20, 1.2), cav = a.block(w, 0, CAV, 100, 520, 230, 10, 2);
    a.block(w, 1, SPEAR, 200, 600, 275, 20, 1.2); a.block(w, 1, ARCHER, 300, 600, 300, 30, 1.2);
    return [act(0.5, () => must(a.send(w, 0, spears, a.point(600, 300)))), act(3, () => must(a.send(w, 0, cav, a.point(640, 322))))];
  } },
  flank: { seconds: 60, setup(w, a) {
    a.block(w, 0, INF, 150, 600, 240, 15, 1.2);
    const cav = a.block(w, 0, CAV, 60, 480, 320, 10, 2), theirs = a.block(w, 1, INF, 150, 600, 300, 15, 1.2);
    return [act(0.5, () => must(a.send(w, 1, theirs, a.point(600, 200)))), act(12, () => must(a.send(w, 0, cav, a.point(600, 335))))];
  } },
  ranged: { seconds: 60, setup(w, a) {
    a.block(w, 0, ARCHER, 150, 600, 220, 15, 1.2);
    const theirs = a.block(w, 1, INF, 200, 600, 330, 20, 1.2);
    return [act(0.5, () => must(a.send(w, 1, theirs, a.point(600, 200))))];
  } },
  catapult: { seconds: 60, setup(w, a) {
    a.block(w, 0, SIEGE, 3, 600, 170, 3, 8);
    const inf = a.block(w, 0, INF, 100, 600, 215, 10, 1.2);
    a.block(w, 1, INF, 150, 600, 290, 15, 1.2);
    return [act(20, () => must(a.send(w, 0, inf, a.point(600, 300))))];
  } },
  squad: { seconds: 60, setup(w, a) {
    const ours = [...a.block(w, 0, INF, 60, 600, 220, 10, 1.2), ...a.block(w, 0, SPEAR, 20, 600, 212, 10, 1.2), ...a.block(w, 0, ARCHER, 30, 600, 204, 10, 1.2)];
    const theirs = a.block(w, 1, INF, 25, 600, 290, 5, 1.2);
    return [act(1, () => must(a.send(w, 0, ours, a.foe(w, a.nearest(w, theirs, a.center(w, theirs))))))];
  } },
  skills: { seconds: 60, setup(w, a) {
    const spears = a.block(w, 0, SPEAR, 100, 600, 220, 10, 1.2);
    a.block(w, 0, ARCHER, 80, 600, 205, 10, 1.2);
    const theirs = a.block(w, 1, INF, 150, 600, 300, 15, 1.2);
    return [
      act(0.5, () => must(a.send(w, 1, theirs, a.point(600, 200)))),
      act(4, () => { const c = a.center(w, spears); must(a.cast(w, 0, 'drum', c.x, c.z)); }),
      act(6, () => { const c = a.center(w, theirs); must(a.cast(w, 0, 'volley', c.x, c.z)); }),
    ];
  } },
  disengage: { seconds: 60, setup(w, a) {
    const ours = a.block(w, 0, SPEAR, 100, 600, 205, 10, 1.2), theirs = a.block(w, 1, SPEAR, 120, 600, 300, 12, 1.2);
    return [
      act(0.5, () => { must(a.send(w, 0, ours, a.point(600, 330))); must(a.send(w, 1, theirs, a.point(600, 180))); }),
      act(20, () => must(a.send(w, 0, ours, a.point(600, 120), false))),
    ];
  } },
  // 여울 건너기(최종 검토 권고): 왼쪽 강(x 132–148)의 여울(z 385–415)을 경유점으로 건너 서 있는 적을 친다 — 보병·궁수는 어택땅,
  // 기병은 이동만으로 두 경유점을 돌아 적 궁수 옆으로, 5초에 강행군. 여울(느린 땅)·경유점·스킬이 같이 도는 장면.
  // engage: 'forward'는 쓰지 않는다 — 홍수에서는 고른 병사의 engage가 참이면 모두 어택땅이라 두 판에서 뜻이 다르다.
  crossing: { seconds: 60, setup(w, a) {
    const inf = a.block(w, 0, INF, 60, 100, 400, 6, 1.2), archers = a.block(w, 0, ARCHER, 30, 90, 400, 6, 1.2), cav = a.block(w, 0, CAV, 20, 100, 440, 5, 2);
    a.block(w, 1, INF, 80, 230, 400, 10, 1.2); a.block(w, 1, ARCHER, 40, 250, 400, 10, 1.2);
    const ford = { x: 140, z: 400 };
    return [
      act(0.5, () => {
        must(a.send(w, 0, [...inf, ...archers], a.point(225, 400), true, [ford]));
        must(a.send(w, 0, cav, a.point(262, 430), false, [ford, { x: 200, z: 460 }]));
      }),
      act(5, () => { const c = a.center(w, inf); must(a.cast(w, 0, 'march', c.x, c.z)); }),
    ];
  } },
  // 성능 재기(tools/bench.mjs): 양쪽 5,000명(보병 40 · 창 25 · 궁 20 · 기병 15%)이 x 200–1000에 2 m 간격 줄로 선다 —
  // 편 0은 z 180–260(앞줄이 위), 편 1은 z 540–620. 0.5초에 80 m 폭 열 토막씩 맞은편 줄로 engage. 황금 시험에서는 뺀다.
  clash5k: { seconds: 60, golden: false, setup(w, a) {
    const MIX = [[INF, 2000], [SPEAR, 1250], [ARCHER, 1000], [CAV, 750]], COLS = 400, GAP = 2, PARTS = 10;
    const parts = [0, 1].map(() => Array.from({ length: PARTS }, () => []));
    for (const side of [0, 1]) {
      let k = 0;
      for (const [type, n] of MIX) for (let j = 0; j < n; j++, k++) {
        const c = k % COLS, row = Math.floor(k / COLS);
        const x = 201 + c * GAP, z = side === 0 ? 259 - row * GAP : 541 + row * GAP;
        parts[side][Math.floor(c * GAP / (800 / PARTS))].push(a.spawn(w, side, type, x, z));
      }
    }
    return [act(0.5, () => {
      for (const side of [0, 1]) parts[side].forEach((ids, p) => must(a.send(w, side, ids, a.point(200 + (p + 0.5) * 800 / PARTS, side === 0 ? 560 : 240))));
    })];
  } },
};

// 때가 된 행동을 돌리는 함수(화면과 runLab이 같이 쓴다). onFail이 없으면(황금 시험) 실패한 행동이 던져 멈추고,
// 있으면(화면 — 사용자가 먼저 스킬을 걸어 장면의 스킬이 거절될 수 있다) 까닭을 넘기고 다음 행동으로 간다.
export function actionRunner(actions, onFail = null) {
  const list = actions.slice().sort((x, y) => x.at - y.at);
  let k = 0;
  return (w, api) => {
    while (k < list.length && list[k].at <= w.time + 1e-9) {
      const a = list[k++];
      if (!onFail) { a.run(w, api); continue; }
      try { a.run(w, api); } catch (e) { onFail(e.message); }
    }
  };
}

// 그 순간의 요약: 편·병종별 산 병사, 체력 합, 자리 합(x + z).
export function snapshot(w, t) {
  const s = w.soldiers, alive = {};
  for (let side = 0; side < 2; side++) for (let type = 0; type <= 4; type++) alive[`${side}:${type}`] = 0;
  let hp = 0, pos = 0;
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    alive[`${s.side[i]}:${s.type[i]}`]++;
    hp += s.hp[i]; pos += s.x[i] + s.z[i];
  }
  return { t, alive, hp: hp.toFixed(3), pos: pos.toFixed(3) };
}

// 장면 하나를 돌려 체크포인트마다 요약을 돌려준다.
export function runLab(name, mods, checkpoints = [15, 30, 45, 60]) {
  const api = makeApi(mods);
  const w = mods.createWorld({ seed: 1, scenario: 'empty', knobs: {} });
  const due = actionRunner(LABS[name].setup(w, api));
  const out = [];
  for (const t of checkpoints) {
    while (w.time < t - 1e-9) { due(w, api); mods.step(w); }
    out.push(snapshot(w, t));
  }
  return out;
}

export const goldenLabs = () => Object.keys(LABS).filter(n => LABS[n].golden !== false);
