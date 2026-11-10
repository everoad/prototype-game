// 시험 장면: 세 구역에서 양쪽이 맞붙는다(성능 재기·화면 확인용).
import { spawn } from './soldiers.js';
import { setGoal } from './world.js';
import { spawnSectorArmy } from './production.js';
import { SPEAR, ARCHER, CAVALRY, INFANTRY, SIEGE } from './rules.js';
import { STATE } from './soldiers.js';

const ROW = 1.0;      // 줄 간격 m
const BACK = 40;      // 선분 뒤 출발 거리 m

export function spawnClash(w, perSide, type = 0) {
  const per = Math.floor(perSide / w.map.sectors.length * 2);
  for (const sec of w.map.sectors) {
    const dir = sec.side === 0 ? -1 : 1;
    const width = sec.x1 - sec.x0, cols = Math.max(1, Math.floor(width / ROW));
    const ids = [];
    for (let k = 0; k < per; k++) {
      const x = sec.x0 + (k % cols) * ROW + 0.5, z = sec.z + dir * (BACK + Math.floor(k / cols) * ROW);
      ids.push(spawn(w.soldiers, sec.side, type, x, z, w.rules));
    }
    setGoal(w, ids, { kind: 'sector', id: sec.id });
  }
}

// 한 구역에서 양쪽이 시작 구성(§2.2)으로 맞붙는다(병종 규칙 시험용).
export function spawnMixedClash(w, weightPerSide, name = 'center') {
  for (const sec of w.map.sectors) if (sec.id.endsWith(name)) spawnSectorArmy(w, sec, weightPerSide, w.rules.start.mix);
}

// 기습 시험 장면(§3.5, ?scene=raid): 왼쪽 틈으로 빠져나온 적 기병(늑대) 무게 = 지휘 한도가 우리 뒤 거점으로 달려간다.
export function spawnRaid(w, target = 'r0L', weight = w.rules.general.limit) {
  const st = w.strongholds.find(x => x.id === target), side = 1 - st.owner;
  const n = Math.round(weight / w.rules.units[side][CAVALRY].weight), cols = 10, ids = [];
  for (let k = 0; k < n; k++) ids.push(spawn(w.soldiers, side, CAVALRY, 22 + (k % cols) * 1.6, 300 + Math.floor(k / cols) * 1.6, w.rules));
  setGoal(w, ids, { kind: 'stronghold', id: target });
  return ids;
}

// 기병 시험장(?scene=cav&kind=open|wall|anvil — 세상은 mirror로 만든다): 기병 100(무게 160)이 궁수 300(무게 180)을 친다.
//   open = 궁수만 · wall = 궁수 앞에 적 창 200 · anvil = wall + 우리 창 200이 적 창과 맞붙는다(망치와 모루) · spears = 적 창 200만(노릴 게 없다).
export function spawnCavLab(w, kind = 'open') {
  const block = (side, type, n, x0, z0, cols, gap) => {
    const ids = [];
    for (let k = 0; k < n; k++) ids.push(spawn(w.soldiers, side, type, x0 + (k % cols) * gap - (cols - 1) * gap / 2, z0 + Math.floor(k / cols) * gap, w.rules));
    return ids;
  };
  const stand = ids => { setGoal(w, ids, { kind: 'sector', id: 's1-center' }); for (const i of ids) { w.soldiers.state[i] = STATE.FRONT; w.soldiers.facing[i] = -Math.PI / 2; } };
  const archers = kind === 'spears' ? [] : block(1, ARCHER, 300, 600, 440, 30, 1.2);
  stand(archers);
  let spears = [], ours = [];
  if (kind === 'wall' || kind === 'anvil' || kind === 'spears') { spears = block(1, SPEAR, 200, 600, 414, 100, 1.0); stand(spears); }
  if (kind === 'anvil') { ours = block(0, SPEAR, 200, 600, 395, 100, 1.0); setGoal(w, ours, { kind: 'sector', id: 's0-center' }); }
  const cav = block(0, CAVALRY, 100, 600, 280, 10, 1.6);
  setGoal(w, cav, { kind: 'sector', id: 's0-center' });
  return { archers, spears, cav, ours };
}

// 병종 선택 시험장(?scene=counter, 사용자 2026-11-07: "병종을 고른 결과를 직접 느끼나"): 가운데에서 우리 보병 300·궁수 100이
// 고블린 600과 맞붙고, 그 뒤 25 m에 투척꾼 225가 몰려 있다. 우리 기병 60은 왼쪽 구역 뒤에 서 있다(보낼지 말지는 부르는 쪽).
export function spawnCounterLab(w) {
  const block = (side, type, n, x0, z0, cols, gap) => {
    const ids = [];
    for (let k = 0; k < n; k++) ids.push(spawn(w.soldiers, side, type, x0 + (k % cols) * gap - (cols - 1) * gap / 2, z0 + Math.floor(k / cols) * gap * (side === 0 ? -1 : 1), w.rules));
    return ids;
  };
  const front = (ids, sector) => { setGoal(w, ids, { kind: 'sector', id: sector }); for (const i of ids) w.soldiers.state[i] = STATE.FRONT; };
  const ours = block(0, INFANTRY, 300, 600, 380, 60, 1.0), archers = block(0, ARCHER, 100, 600, 362, 50, 1.2);
  const goblins = block(1, INFANTRY, 600, 600, 422, 80, 0.9), hurlers = block(1, ARCHER, 225, 600, 448, 45, 1.2);
  front([...ours, ...archers], 's0-center');
  front([...goblins, ...hurlers], 's1-center');
  const cav = block(0, CAVALRY, 60, 330, 350, 10, 1.6);
  setGoal(w, cav, { kind: 'sector', id: 's0-left' });
  return { ours, archers, goblins, hurlers, cav };
}

// 공성 시험장(투석기 설계서 2026-11-09 §6): 적(편 1) 앞 거점 f1L — 성벽 다 지음 + 수비대(고블린 80, 창 고블린 40, 투척꾼 30, 진형으로 선다).
// 우리 보병 300명이 f1L 남쪽 150 m에, 투석기 3대(withCatapults)가 그 뒤에. 보내기는 siegeLabController가 한다.
export function spawnSiegeLab(w, withCatapults = true) {
  const s = w.soldiers, f = w.strongholds.find(x => x.id === 'f1L');
  f.slots[f.slotCount] = { kind: 'wall', level: 1, hp: w.rules.buildings.wall.hp, building: false };
  const gar = [];
  for (const [type, n] of [[INFANTRY, 80], [SPEAR, 40], [ARCHER, 30]]) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, r = 10 + (k % 5) * 3; gar.push(spawn(s, 1, type, f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, w.rules)); }
  setGoal(w, gar, { kind: 'stronghold', id: 'f1L' }); for (const i of gar) s.state[i] = STATE.GARRISON;
  const ours = [];
  for (let k = 0; k < 300; k++) ours.push(spawn(s, 0, INFANTRY, f.x - 21 + (k % 30) * 1.4, f.z - 150 - Math.floor(k / 30) * 1.4, w.rules));
  setGoal(w, ours, { kind: 'point', x: f.x, z: f.z - 150 });
  const cats = [];
  if (withCatapults) for (let k = 0; k < 3; k++) cats.push(spawn(s, 0, SIEGE, f.x - 6 + k * 6, f.z - 170, w.rules));
  if (cats.length) setGoal(w, cats, { kind: 'point', x: f.x, z: f.z - 170 });
  return { ours, cats, garrison: gar, stronghold: f };
}

// 공성 시험장의 보내기: at초에 보병은 f1L로(어택땅), 투석기는 f1L 가운데에서 115 m 남쪽 자리로(이동).
export function siegeLabController(lab, at = 1) {
  let sent = false;
  return { think: w => {
    if (sent || w.time < at) return [];
    sent = true;
    const f = lab.stronghold, out = [{ kind: 'send', side: 0, from: { kind: 'ids', ids: lab.ours }, target: { kind: 'stronghold', id: f.id } }];
    if (lab.cats.length) out.push({ kind: 'send', side: 0, from: { kind: 'ids', ids: lab.cats }, target: { kind: 'point', x: f.x, z: f.z - 115 } });
    return out;
  } };
}
