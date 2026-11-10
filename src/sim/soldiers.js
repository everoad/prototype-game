// 병사 배열 묶음(SoA)과 균일 격자 이웃 찾기.

export const STATE = { MARCH: 0, RALLY: 1, FRONT: 2, GARRISON: 3, ATTACHED: 4, FLEE: 5, ROUT: 6 };
export const GOAL = { NONE: 0, SECTOR: 1, STRONGHOLD: 2, GENERAL: 3, POINT: 4 };
// 명령(사용자 2026-11-08 "B"): 보낸 병사는 도착할 때까지 MOVE(새 적을 찾지 않고 닿은 적만 저절로 친다, 궁수는 걸으며 쏜다),
// 적 병사에게 보낸 병사는 ATTACK(그 적을 쫓아가 25 m 안에서 친다). 도착하면 NONE — 원래대로 싸운다.
export const ORDER = { NONE: 0, MOVE: 1, ATTACK: 2 };

export function createSoldiers(capacity, map, cellSize) {
  const f32 = () => new Float32Array(capacity);
  const s = {
    capacity, count: 0, free: [], nextSerial: 1,
    serial: new Uint32Array(capacity),
    order: new Uint8Array(capacity), orderFoe: new Int32Array(capacity), orderSerial: new Uint32Array(capacity),   // ORDER와 공격할 적(번호·태어난 차례)
    orderBest: new Float32Array(capacity), orderAt: new Float32Array(capacity),   // 명령: 목표까지 가장 가까웠던 거리와 그때 — 막혀 서 버리면 풀려고   // 태어난 차례(번호는 죽은 병사 것을 다시 쓰므로, 고른 병사를 알아볼 때 함께 본다)
    x: f32(), z: f32(), vx: f32(), vz: f32(), px: f32(), pz: f32(), hp: f32(), facing: f32(), pfacing: f32(),   // pfacing: 앞 틱 끝의 보는 방향(도는 빠르기 한계, movement.js clampTurns)
    slotX: f32(), slotZ: f32(), lane: f32(), chargeUntil: f32(), ffx: f32(), ffz: f32(), routUntil: f32(), routX: f32(), routZ: f32(), pursuitX: f32(), pursuitZ: f32(), holdUntil: f32(), runDist: f32(), lastCharge: f32(), hitTimer: f32(),
    goalX: f32(), goalZ: f32(),
    type: new Uint8Array(capacity), side: new Uint8Array(capacity), state: new Uint8Array(capacity),
    goalKind: new Uint8Array(capacity), alive: new Uint8Array(capacity), inContact: new Uint8Array(capacity), rallyPhase: new Uint8Array(capacity), wedge: new Uint8Array(capacity), chargeHit: new Uint8Array(capacity), hasPursuit: new Uint8Array(capacity), contactHold: new Uint8Array(capacity),
    goalId: new Int16Array(capacity), general: new Int16Array(capacity), group: new Int32Array(capacity), origin: new Int16Array(capacity),
    returnTo: new Int16Array(capacity),   // 막아라로 끌려온 병사의 원래 구역(아니면 −1)
    buff: new Uint8Array(capacity),       // 장수 기운·돌격·버텨라 (generals.js BUFF)
    target: new Int32Array(capacity), rtarget: new Int32Array(capacity), contact: new Int32Array(capacity),   // contact = 지금 닿은 적(−1)
    throughUntil: f32(), throughX: f32(), throughZ: f32(),
    leaveUntil: f32(),                    // 맞붙어 있다 보낸 병사: 이때까지 바로 옆 적만 친다
    marchUntil: f32(), drumUntil: f32(),  // 금 명령(casts.js): 강행군·돌격 북이 끝나는 때
    volleyUntil: f32(), volleyX: f32(), volleyZ: f32(),   // 화살 비가 끝나는 때와 원 가운데
    fmRole: new Uint8Array(capacity), impaleAt: f32(), fireAt: f32(), aimNext: f32(),   // 투석기(catapult.js): 마지막으로 쏜 때, 과녁을 다시 찾을 때
      // 거점 수비 진형 역할(formation.js FM), 이 창이 마지막으로 기병을 꽂은 때
    idleAt: f32(),
    staggerUntil: f32(),                  // 기병 돌격에 맞아 이때까지 못 친다
    braced: new Uint8Array(capacity),
    elite: new Uint8Array(capacity),      // 2단계 건물에서 나온 강화 병종     // 버팀이 지금 버티나(기병 아닌 적과 맞붙지 않음)                        // 정면 병사가 할 일 없이 서기 시작한 때(−1 = 아님)
    // 격자
    cellSize, gcols: Math.ceil(map.width / cellSize), grows: Math.ceil(map.depth / cellSize),
    next: new Int32Array(capacity),
  };
  s.head = new Int32Array(s.gcols * s.grows).fill(-1);
  s.cellCount = new Uint16Array(s.gcols * s.grows);
  return s;
}

// 병사 번호에서 [0,1) — 같은 번호면 늘 같은 값.
export function hash01(n) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function spawn(s, side, type, x, z, rules) {
  const id = s.free.length ? s.free.pop() : s.count++;
  if (id >= s.capacity) throw new Error('병사 배열이 가득 찼다');
  s.x[id] = x; s.z[id] = z; s.px[id] = x; s.pz[id] = z; s.vx[id] = 0; s.vz[id] = 0;
  s.hp[id] = rules.units[side][type].hp; s.type[id] = type; s.side[id] = side; s.alive[id] = 1;
  s.facing[id] = side === 0 ? Math.PI / 2 : -Math.PI / 2;   // 적 쪽(편 0은 +z)
  s.pfacing[id] = s.facing[id];
  s.state[id] = STATE.MARCH; s.goalKind[id] = GOAL.NONE; s.goalId[id] = -1; s.general[id] = -1; s.origin[id] = -1; s.returnTo[id] = -1; s.buff[id] = 0;
  s.target[id] = -1; s.contact[id] = -1; s.inContact[id] = 0; s.rallyPhase[id] = 0; s.group[id] = -1; s.chargeUntil[id] = 0; s.wedge[id] = 0; s.ffx[id] = 0; s.ffz[id] = 0; s.chargeHit[id] = 0; s.hasPursuit[id] = 0; s.routUntil[id] = -1e9; s.rtarget[id] = -1; s.throughUntil[id] = 0; s.contactHold[id] = 0; s.holdUntil[id] = 0; s.runDist[id] = 0; s.lastCharge[id] = -1e9; s.hitTimer[id] = 0; s.idleAt[id] = -1; s.leaveUntil[id] = 0; s.staggerUntil[id] = 0; s.braced[id] = 1; s.elite[id] = 0;
  s.lane[id] = (hash01(id * 3 + 1) * 2 - 1) * rules.behavior.pathWidth;
  s.serial[id] = s.nextSerial++;
  s.order[id] = 0; s.orderFoe[id] = -1;
  s.slotX[id] = 0;
  s.marchUntil[id] = 0; s.drumUntil[id] = 0; s.volleyUntil[id] = 0; s.fmRole[id] = 0; s.impaleAt[id] = -1e9; s.fireAt[id] = -1e9; s.aimNext[id] = 0;
  return id;
}

export function kill(s, id) {
  if (!s.alive[id]) return;
  s.alive[id] = 0;
  s.free.push(id);
}

export function rebuildGrid(s) {
  s.head.fill(-1);
  s.cellCount.fill(0);
  for (let i = 0; i < s.count; i++) {
    if (!s.alive[i]) continue;
    const c = cellIndex(s, s.x[i], s.z[i]);
    if (c < 0) continue;
    s.next[i] = s.head[c];
    s.head[c] = i;
    if (s.cellCount[c] < 65535) s.cellCount[c]++;
  }
}

export function cellIndex(s, x, z) {
  const c = Math.floor(x / s.cellSize), r = Math.floor(z / s.cellSize);
  if (c < 0 || r < 0 || c >= s.gcols || r >= s.grows) return -1;
  return r * s.gcols + c;
}

// (x,z)에서 반지름 r 안의 칸에 든 병사마다 fn(id). 거리는 부르는 쪽이 본다. fn이 false를 돌려주면 멈춘다.
export function forEachNear(s, x, z, r, fn) {
  const c0 = Math.max(0, Math.floor((x - r) / s.cellSize)), c1 = Math.min(s.gcols - 1, Math.floor((x + r) / s.cellSize));
  const r0 = Math.max(0, Math.floor((z - r) / s.cellSize)), r1 = Math.min(s.grows - 1, Math.floor((z + r) / s.cellSize));
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++)
      for (let id = s.head[rr * s.gcols + cc]; id !== -1; id = s.next[id])
        if (fn(id) === false) return;
}
