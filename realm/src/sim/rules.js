// 영지 전쟁 시험판의 모든 수치(설계 docs/superpowers/specs/2026-11-12-realm-rts-design.md). 시간 = 초, 거리 = m.

export const RULES = {
  dt: 0.1,                       // 한 틱(10 Hz)
  map: { size: 640, cell: 4, visionCell: 8 },
  start: { gold: 300, wood: 200, mana: 0, workers: 5 },
  pop: { base: 80, perVillage: 30, max: 200 },   // 인구 상한 = 성채 80 + 이어진 마을마다 30
  victory: { points: 500, drainPerAltar: 1 },    // 제단을 더 쥔 수만큼 상대 승점이 초마다 깎인다
  capture: { radius: 12, fortRadius: 18, seconds: 20, perExtraUnit: 0.2, maxBoost: 2 },   // 한 명이면 20초, 여럿이면 최대 두 배 빠르게
  income: { gold: 3, wood: 1, mana: 0.5 },       // 성채
  fort: { regain: 0.4, revive: 0.25 },           // 요새: 땅을 잡으면 체력 40%로 내 편, 무너진 요새는 25%까지 고치면 다시 쏜다
  vision: { every: 0.5 },
  separation: 0.6,               // 겹친 유닛을 이 몫만큼 떼어 낸다(틱마다)
  leash: 28,                     // 가만히 선 유닛이 적을 쫓아가는 거리 — 넘으면 돌아온다
  campLeash: 22,                 // 괴물은 소굴에서 이만큼만 쫓는다
  acquire: 1.0,                  // 시야 × 이 배율 안의 적을 저절로 노린다
  chargeRun: 15, chargeMult: 3,  // 기사 돌격
  buildRateExtra: 0.6,           // 일꾼이 하나 늘 때마다 짓는 빠르기 +60%(최대 4명)
  repairPerSec: 0.02,            // 일꾼 하나가 초마다 고치는 몫(최대 체력의 2%)
  queueMax: 5,
};

// 공격 종류 × 갑옷. 날짐승은 hitsAir인 공격만 맞는다.
export const DAMAGE = {
  blade:  { light: 1.0, heavy: 0.7, large: 1.0, building: 0.5 },
  pierce: { light: 1.0, heavy: 0.7, large: 2.5, building: 0.4 },
  arrow:  { light: 1.4, heavy: 0.5, large: 1.0, building: 0.25 },
  magic:  { light: 1.0, heavy: 1.6, large: 1.0, building: 0.5 },
  siege:  { light: 0.6, heavy: 0.6, large: 0.6, building: 3.0 },
  crush:  { light: 1.0, heavy: 1.0, large: 1.0, building: 1.5 },
};
export const damageMult = (kind, armor) => DAMAGE[kind]?.[armor] ?? 1;
export const RES = ['gold', 'wood', 'mana'];
export const RES_NAME = { gold: '금', wood: '목재', mana: '마나' };

// 병종. dmg = 한 번 칠 때, cd = 다시 칠 때까지, range = 칠 수 있는 거리(몸 가장자리 사이), proj = 투사체 빠르기(없으면 바로 맞음).
// splash = 범위 반지름(가운데 100% → 가장자리 50%). pop = 인구. time = 뽑는 시간. from = 뽑는 건물, needs = 연구. key = 생산 단축키.
export const UNITS = {
  worker:   { name: '일꾼',      hp: 60,   armor: 'light', speed: 6,   r: 0.8, range: 0.8, dmg: 3,  cd: 1.0, kind: 'blade',  sight: 20, pop: 1, gold: 50,  wood: 0,   mana: 0,   time: 12, from: 'citadel', key: 'Q', worker: true },
  sword:    { name: '검사',      hp: 200,  armor: 'heavy', speed: 5.5, r: 1.0, range: 1.0, dmg: 14, cd: 1.0, kind: 'blade',  sight: 24, pop: 1, gold: 50, wood: 20, mana: 0,   time: 14, from: 'barracks', key: 'Q' },
  spear:    { name: '창병',      hp: 160,  armor: 'light', speed: 5.5, r: 1.0, range: 2.0, dmg: 10, cd: 1.0, kind: 'pierce', sight: 24, pop: 1, gold: 30, wood: 30, mana: 0,   time: 12, from: 'barracks', key: 'W' },
  archer:   { name: '궁수',      hp: 110,  armor: 'light', speed: 5.5, r: 0.9, range: 28,  dmg: 9,  cd: 1.2, kind: 'arrow',  sight: 32, pop: 1, gold: 30, wood: 45, mana: 0,   time: 14, from: 'barracks', key: 'E', proj: 60, hitsAir: true },
  scout:    { name: '정찰 기병',  hp: 180,  armor: 'large', speed: 11,  r: 1.4, range: 1.2, dmg: 10, cd: 1.0, kind: 'blade',  sight: 40, pop: 2, gold: 60, wood: 30, mana: 0,   time: 16, from: 'stable', key: 'Q' },
  knight:   { name: '기사',      hp: 420,  armor: 'large', speed: 9,   r: 1.5, range: 1.4, dmg: 22, cd: 1.2, kind: 'blade',  sight: 30, pop: 3, gold: 120, wood: 50, mana: 30,  time: 22, from: 'stable', key: 'W', needs: 'knighthood', charge: true },
  mage:     { name: '화염 마법사', hp: 95,   armor: 'light', speed: 5,   r: 0.9, range: 24,  dmg: 20, cd: 2.4, kind: 'magic',  sight: 30, pop: 2, gold: 50, wood: 20, mana: 50,  time: 18, from: 'magetower', key: 'Q', proj: 26, splash: 4, hitsAir: true },
  priest:   { name: '사제',      hp: 120,  armor: 'light', speed: 5.5, r: 0.9, range: 16,  dmg: 0,  cd: 1.0, kind: 'magic',  sight: 28, pop: 2, gold: 40, wood: 20, mana: 50,  time: 18, from: 'magetower', key: 'W', heal: 9 },
  catapult: { name: '투석기',    hp: 260,  armor: 'large', speed: 3.5, r: 1.8, range: 55,  dmg: 60, cd: 4.5, kind: 'siege',  sight: 26, pop: 4, gold: 80, wood: 150, mana: 0,   time: 28, from: 'workshop', key: 'Q', proj: 22, splash: 5, minRange: 12, ground: true },
  golem:    { name: '골렘',      hp: 1300, armor: 'heavy', speed: 4.5, r: 2.0, range: 1.6, dmg: 40, cd: 2.0, kind: 'crush',  sight: 24, pop: 5, gold: 100, wood: 40, mana: 80, time: 35, from: 'workshop', key: 'W', needs: 'golemcraft' },
  griffon:  { name: '그리폰',    hp: 260,  armor: 'large', speed: 12,  r: 1.6, range: 1.4, dmg: 14, cd: 1.0, kind: 'blade',  sight: 40, pop: 3, gold: 100, wood: 50, mana: 50,  time: 22, from: 'aerie', key: 'Q', fly: true, hitsAir: true },
  dragon:   { name: '용',        hp: 1600, armor: 'large', speed: 7,   r: 3.0, range: 14,  dmg: 50, cd: 2.5, kind: 'magic',  sight: 44, pop: 8, gold: 250, wood: 100, mana: 250, time: 60, from: 'aerie', key: 'W', needs: 'dragonegg', fly: true, hitsAir: true, proj: 30, splash: 6 },
  // 중립 괴물(편 2): 소굴을 지킨다. bounty = 잡은 편이 받는 금.
  wolf:     { name: '늑대',      hp: 120,  armor: 'light', speed: 8,   r: 1.0, range: 1.0, dmg: 9,  cd: 0.8, kind: 'blade',  sight: 18, pop: 0, gold: 0, wood: 0, mana: 0, time: 0, bounty: 15, monster: true },
  goblin:   { name: '고블린',    hp: 90,   armor: 'light', speed: 5.5, r: 0.8, range: 20,  dmg: 7,  cd: 1.3, kind: 'arrow',  sight: 22, pop: 0, gold: 0, wood: 0, mana: 0, time: 0, bounty: 15, monster: true, proj: 50, hitsAir: true },
  troll:    { name: '트롤',      hp: 700,  armor: 'heavy', speed: 4.5, r: 1.8, range: 1.4, dmg: 30, cd: 1.6, kind: 'crush',  sight: 18, pop: 0, gold: 0, wood: 0, mana: 0, time: 0, bounty: 60, monster: true, regen: 4 },
};

// 건물. r = 차지하는 반지름(길을 막는다). shoot = 스스로 쏘는 화살. income = 지어진 뒤 초마다(지역이 성채와 이어져 있을 때만).
export const BUILDINGS = {
  citadel:    { name: '성채',     hp: 3000, r: 10, gold: 0,   wood: 0,   mana: 0,   time: 0,  sight: 40, trains: ['worker'], shoot: { range: 30, dmg: 12, cd: 1.0, kind: 'arrow', proj: 60, hitsAir: true } },
  fort:       { name: '요새',     hp: 1500, r: 6,  gold: 0,   wood: 0,   mana: 0,   time: 0,  sight: 36, shoot: { range: 32, dmg: 15, cd: 1.0, kind: 'arrow', proj: 60, hitsAir: true } },
  goldmine:   { name: '금광',     hp: 400,  r: 3,  gold: 50,  wood: 50,  mana: 0,   time: 12, sight: 16, key: 'Q', onDeposit: 'gold', income: { gold: 2.5 } },
  lumbermill: { name: '벌목소',   hp: 400,  r: 3,  gold: 60,  wood: 0,   mana: 0,   time: 12, sight: 16, key: 'W', onDeposit: 'wood', income: { wood: 2.0 } },
  manawell:   { name: '마나 샘',  hp: 400,  r: 3,  gold: 100, wood: 50,  mana: 0,   time: 18, sight: 16, key: 'E', onDeposit: 'mana', income: { mana: 1.5 } },
  barracks:   { name: '병영',     hp: 1000, r: 7,  gold: 100, wood: 120, mana: 0,   time: 30, sight: 24, key: 'A', trains: ['sword', 'spear', 'archer'] },
  stable:     { name: '마구간',   hp: 900,  r: 7,  gold: 120, wood: 120, mana: 0,   time: 30, sight: 24, key: 'S', trains: ['scout', 'knight'], research: ['knighthood'] },
  magetower:  { name: '마법탑',   hp: 800,  r: 5,  gold: 120, wood: 80,  mana: 50,  time: 35, sight: 30, key: 'D', needs: 'barracks', trains: ['mage', 'priest'] },
  workshop:   { name: '공방',     hp: 1000, r: 7,  gold: 100, wood: 200, mana: 0,   time: 35, sight: 24, key: 'F', needs: 'barracks', trains: ['catapult', 'golem'], research: ['golemcraft'] },
  aerie:      { name: '둥지',     hp: 900,  r: 7,  gold: 150, wood: 150, mana: 100, time: 40, sight: 30, key: 'Z', needs: 'magetower', trains: ['griffon', 'dragon'], research: ['dragonegg'] },
  tower:      { name: '감시탑',   hp: 700,  r: 3,  gold: 50,  wood: 100, mana: 0,   time: 20, sight: 44, key: 'X', shoot: { range: 34, dmg: 12, cd: 1.0, kind: 'arrow', proj: 60, hitsAir: true } },
};
export const BUILD_MENU = ['goldmine', 'lumbermill', 'manawell', 'barracks', 'stable', 'magetower', 'workshop', 'aerie', 'tower'];

export const RESEARCH = {
  knighthood: { name: '기사 서임', gold: 150, wood: 0, mana: 75,  time: 40, key: 'R' },
  golemcraft: { name: '골렘 각성', gold: 200, wood: 0, mana: 100, time: 45, key: 'R' },
  dragonegg:  { name: '용의 알',   gold: 300, wood: 0, mana: 200, time: 60, key: 'R' },
};

// 지역 역할(지도에 쓰는 이름)
export const ROLES = {
  home: '본진', gold: '금광 지대', forest: '숲', ley: '마나 샘', village: '마을', fort: '요새', altar: '제단',
};
