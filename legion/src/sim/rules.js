// 군단 영지 시험판의 모든 수치(홍수 전쟁 수치에서 갈라냄 — 설계서 2026-11-13-legion-design.md). 다른 파일에 숫자를 흩뿌리지 않는다.
// makeRules(knobs)가 규모 배율(scale = 상한 ÷ 10,000)과 손잡이를 여기서 한 번만 곱한다.

export const SPEAR = 0;   // 버팀 (몬스터: 고블린)
export const ARCHER = 1;  // 화력 (몬스터: 트롤 투척꾼)
export const CAVALRY = 2; // 기동 (몬스터: 늑대 기수)
export const INFANTRY = 3; // 보병: 상성 없음 (몬스터: 고블린) — 공성 자리를 대신함(사용자 2026-11-07 시험)
export const TYPES = [SPEAR, ARCHER, CAVALRY, INFANTRY];   // 싸움 병종 넷(투석기는 따로)
export const SIEGE = 4;    // 투석기 (몬스터: 고블린 투석기)
export const WORKER = 5;   // 광부(3단계 — 싸우지 않고 짓고 고친다, 10명 한 조) (몬스터: 잡역 고블린)

const SPEAR_HP = 600; // 무게 = 체력 ÷ 창병 체력 (§1.4)

// 병종 기본 수치. 편 0 = 인간·엘프·드워프 연합, 편 1 = 몬스터 (§6.1, 몬스터 수치는 계획서 Task 1이 정한 시작값).
// 다종족 이름(사용자 2026-11-13 "인간 국가가 아니라 다종족 국가로"): 이름만 바꿨고 수치·규칙은 홍수 그대로.
const UNIT_TABLE = [
  [
    { name: '드워프 방패병', hp: 600, dps: 10, range: 1.2, speed: 3.5, holdsLine: true, shield: true, splash: 0, siege: false },   // 빠르기 3 → 3.5(사용자 2026-11-10 "조금만 올려 보자")
    { name: '엘프 궁수', hp: 360, dps: 4, range: 40, speed: 2.6, holdsLine: false, splash: 0, siege: false },   // 창병(3)보다 느리게 — 물러나는 궁수를 따라잡도록(사용자 2026-11-07)
    { name: '인간 기병', hp: 960, dps: 22, range: 1.2, speed: 9, holdsLine: false, splash: 0, siege: false, charges: true },   // 화력 14 → 22(무게당 궁수와 같게), 빠르기 7 → 9(보병의 세 배, 사용자 2026-11-07: 기병이 빨리 닿게)
    { name: '인간 보병', hp: 600, dps: 10, range: 1.2, speed: 3.5, holdsLine: false, shield: true, splash: 0, siege: false },   // 무난한 병종: 창병과 같은 수치와 앞쪽 방패, 버티기·기병 상성은 없음. 빠르기 3 → 3.5(사용자 2026-11-10, 창병과 같이)
    { name: '드워프 투석기', hp: 1500, dps: 0, range: 100, minRange: 12, speed: 2, holdsLine: false, splash: 0, siege: true, catapult: true },   // 투석기 설계서(2026-11-09): 맞붙어 싸우지 않고 catapult.js가 돌을 쏜다(공성병 대신)
    { name: '드워프 광부', hp: 150, dps: 0, range: 1.2, speed: 4, holdsLine: false, splash: 0, siege: false, worker: true },   // 광부(3단계 workers.js): 적을 노리지 않고 맞붙지도 않는다
  ],
  [
    { name: '창 고블린', hp: 360, dps: 6, range: 1.2, speed: 3.3, holdsLine: true, shield: true, splash: 0, siege: false, spacing: 0.6 },   // 떼(간격 0.6 m). 체력 300 → 360, 화력 5 → 6: 정면에서 기병을 막게(사용자 2026-11-07)
    { name: '투척꾼', hp: 400, dps: 3, range: 40, speed: 2.4, holdsLine: false, splash: 2, splashShare: 0.3, splashMax: 6, siege: false },   // 둘레 2 m의 가까운 6명까지 30%(사용자 2026-11-07: 조금 줄여 보자 — 제한이 없으면 빽빽한 줄에서 바위 하나가 열 명 넘게 쳤다)
    { name: '늑대 기수', hp: 700, dps: 12, range: 1.2, speed: 10, holdsLine: false, splash: 0, siege: false, charges: true },   // 빠르기 8 → 10(사람 기병과 같은 비율로)
    { name: '고블린', hp: 300, dps: 5, range: 1.2, speed: 3.3, holdsLine: false, shield: true, splash: 0, siege: false, spacing: 0.6 },
    { name: '고블린 투석기', hp: 1500, dps: 0, range: 100, minRange: 12, speed: 2, holdsLine: false, splash: 0, siege: true, catapult: true },   // 사람 투석기와 같은 규칙(1:1 대전, 오거는 뺐다)
    { name: '잡역 고블린', hp: 150, dps: 0, range: 1.2, speed: 4, holdsLine: false, splash: 0, siege: false, worker: true },   // 광부와 같은 수치
  ],
];

export function makeRules(knobs = {}) {
  const k = { scale: 1, damage: 1, speed: 1.25, mirror: false, soldierSight: 60, ...knobs };   // speed: 모든 이동 배율(홍수 사용자 2026-11-08: 1 → 1.25)
  const s = k.scale;
  // mirror: 편 1도 사람 병종 표를 쓴다(대칭 시험·1:1 대칭 판)
  const table = [...(k.mirror ? [UNIT_TABLE[0], UNIT_TABLE[0]] : UNIT_TABLE), UNIT_TABLE[1]];   // 편 2 = 중립 괴물 소굴(몬스터 표, 군단 영지 2단계)
  const units = table.map(side => side.map(u => ({
    ...u,
    dps: u.dps * k.damage,
    speed: u.speed * k.speed,
    weight: u.hp / SPEAR_HP,
  })));
  return {
    knobs: k,
    dt: 0.05, // 20 Hz
    units,
    // 공격 → 대상 ×배율. 기병은 원거리·공성 사냥꾼(사용자 2026-11-06: 닿아도 궁수가 안 죽는다 — ×1.3이면 궁수 하나에 20초)
    counters: [[SPEAR, CAVALRY, 2.5], [CAVALRY, ARCHER, 3]],   // 창 → 기병 ×2.5(버틸 때만, 사용자 2026-11-07: 같은 무게로 정면에서 붙어도 기병이 118:12로 이겼다)
    counterMult: 1.3,
    flank: { frontMaxDeg: 60, rearMinDeg: 120, side: 1.2, rear: 1.5 },
    shield: { mult: 0.5, halfAngleDeg: 60 },
    // 생산 건물 2단계(사용자 2026-11-07): 그 거점에서 나오는 그 병종이 강화 병종 — 방패벽 창병 · 장궁수 · 중기병
    // allRound: 방패벽 창은 정면 밖(옆·뒤)에서 온 원거리도 이만큼만 받는다(사용자 2026-11-07: 난전에서는 바위가 옆·뒤에서도 온다)
    elite: { shieldMult: 0.2, allRound: 0.5, rangeBonus: 15, spearCounter: 1.25 },
    // dodge: 달리는(빠르기 60% 넘게) 기병이 받는 원거리 피해 배율 · scare: 적 기병이 이 거리 안에 있는 원거리병은 쏘지 못한다 m
    // staggerSeconds: 기병 돌격에 맞은 병사가 못 치는 시간(사용자 2026-11-07 나안)
    // 원거리 화력 ×0.75(궁수 8 → 6, 투척꾼 6 → 4.5)와 dodge 0.5 → 0.3: 대진표에서 궁수 몰아 쓰기가 모든 상대를 이겼다(사용자 2026-11-07 밸런스)
    // 다시 ×⅔(궁수 6 → 4, 투척꾼 4.5 → 3, 사용자 2026-11-07 "궁병이 너무 사기"): 원거리는 무게당 보병의 1.6~2배를 주고 절반만 받았고, 우리 궁수 전략이 천적인 늑대 기수 전략을 이겼다
    charge: { mult: 2, runMeters: 30, cooldown: 10, dodge: 0.3, scare: 10, staggerSeconds: 2 },
    // brace: 버팀(창)은 이 거리 안에 기병 아닌 적이 없을 때만 버틴다 — 보병과 맞붙은 창은 기병에게 ×1.3이 없고 짓밟힌다(사용자 2026-11-07 나안) m
    melee: { interval: 1, reach: 1.2, caughtRanged: 0.3, brace: 1.8 },   // 근접 적이 닿은 원거리병은 못 쏘고 화력의 30%로 맞선다

    cap: 10000 * s,
    // 경제(3단계, economy.js): 시작 자원, 성채 수입(초당), 인구(무게) 상한 = base + 이어진 땅(본진 빼고)마다 perRegion + 그 가운데 villages 역할마다 perVillage, 최대 max. every틱마다 다시 센다
    economy: { start: { gold: 400, wood: 300, mana: 0 }, income: { gold: 4, wood: 2, mana: 0.5 }, pop: { base: 800, perRegion: 150, perVillage: 300, max: 4000, villages: ['village', 'ranch'] }, every: 10 },
    // 지휘 스킬(홍수의 금 명령, 설계서 2026-11-09-flood-gold-orders-design.md): 땅에 반지름 radius m 원을 찍어 건다. cooldown 초(스킬마다·편마다), seconds 효과 초.
    orders: {   // 지휘 스킬(군단 영지 2026-11-13 사용자 "일단 쿨타임으로"): 금 0 — 값은 남겨 두어 되살릴 수 있게
      radius: 50,
      // 2026-11-09 사용자 "스킬 쿨타임이 너무 길고 영향력이 적다": 다시 쓰기를 줄여 금이 제약이 되게(강행군 90 → 45, 돌격 북 120 → 60, 징집 120 → 90), 북 ×1.3 → ×1.5, 징집 150 → 200명. 화살 비는 그대로
      march: { cost: 0, cooldown: 45, seconds: 20, speedMult: 2 },   // 2026-11-09 놀아 본 뒤: 60초 ×1.3은 안 보였다 → 20초 ×2(쐐기가 치고 나가는 게 보이게)
      drum: { cost: 0, cooldown: 60, seconds: 15, damageMult: 1.5, knockback: 3 },   // 돌격 북: 화력 ×1.3, 근접 타격마다 맞은 적 3 m 밀려남(1.5면 15초에 줄이 6 m, 3이면 9 m — 2026-11-09 잼), 안 무너짐(전에는 받는 피해 ×0.7 30초 — 안 보였다)
      volley: { cost: 0, cooldown: 30, seconds: 10, fireMult: 2 },   // 화살 비: 원 안 적만, 쏘는 간격 ÷ fireMult(한 발 피해는 그대로)
    },
    // 투석기(catapult.js): reload초에 한 발, 돌은 flight초 날아 떨어진 자리에 — 병사는 둘레 splash m의 가까운 splashMax명에게 soldierHit(방패·방향·상성 곱).
    // 과녁: 보이는 적 aimSample명 가운데 둘레 aimRadius m에 적이 가장 많은 자리. arc = 화면 돌 높이 m.
    catapult: { reload: 4, flight: 2, arc: 15, splash: 3, splashMax: 6, soldierHit: 40, buildingHit: 250, aimRadius: 4, aimSample: 12, reveal: 3, revealRadius: 10, still: 0.5, retry: 0.5 },   // still: 이보다 빨리 움직이면 쏘지 않는다 m/s, retry: 과녁이 없으면 이만큼 뒤에 다시 본다 s, holdMargin: 적 거점이 사거리 − 이만큼 안에 들면 선다 m   // reveal: 쏜 투석기는 이만큼 적에게 보인다(둘레 revealRadius m) — 돌이 어디서 오는지 보인다
    // 공격 무리(squads.js, 사용자 2026-11-10): 적 병사로 보낸 병사들이 둘레에 적 없이 quietSeconds초 조용하면 병종 진형으로 다시 선다 — 진형 사이 옆 gap m, 줄 사이 rowGap m
    squad: { quietSeconds: 2, gap: 4, rowGap: 4 },
    // 괴물 소굴(camps.js, 군단 영지 2단계): 제 자리에서 leash m 넘게 끌려 나가면 돌아가 자리에 닿으면 다시 싸운다. 병종 덩어리는 간격 gap m, 덩어리 사이 typeGap m
    camp: { leash: 50, gap: 1.0, typeGap: 14 },
    // 점령(territory.js, 영지 규칙): 깃발 radius m 원 안 무게로, 1초에 min(maxBoost, 1 + perWeight × (무게 − 1)) / seconds — 한 명 20초, 보병 쐐기(150) 약 7초. every틱마다 센다
    capture: { radius: 30, seconds: 20, perWeight: 0.02, maxBoost: 3, every: 5 },
    // 게임 판 시작 군대(game.js): 본진 깃발에서 가운데 쪽으로 ahead m, 병종 덩어리 넷(보병·창·궁·기병)을 xs 자리에 cols열로(간격 gap, 기병 cavGap)
    // citadelBack: 성채는 본진 깃발에서 제 편 쪽으로 이만큼 m
    start: { ahead: 45, xs: [-60, -20, 20, 60], cols: 15, gap: 1.2, cavGap: 2, citadelBack: 22, crews: 3, crewAhead: 5, crewGap: 20 },   // crews: 광부 조 수(깃발에서 제 편 쪽 crewAhead m, 조 사이 crewGap m)
    // 소굴 세기(확정 그림): 병종 번호 = 몬스터 표(0 창 고블린 · 1 투척꾼 · 2 늑대 기수 · 3 고블린) → 마리 수
    camps: {
      weak: { 3: 30, 2: 8 },
      medium: { 3: 40, 0: 20, 1: 15 },
      strong: { 3: 60, 0: 40, 1: 30, 2: 15 },
      center: { 3: 90, 0: 60, 1: 40, 2: 20 },
    },
    // 건물(3단계, buildings.js): name = [사람 편, 몬스터 편], r = 발자국 반지름 m(그 안 칸을 막는다), 값·time = 건물 하나, sight = 시야 m.
    // on = 그 종류 자원 자리 위에만(채굴기), income = 다 지은 뒤 초마다(본진과 이어진 제 땅일 때), trains = 뽑는 것(train 열쇠), research = 연구(research 열쇠), needs = 먼저 있어야 하는 건물.
    buildings: {
      citadel: { name: ['성채', '소굴 본채'], hp: 8000, r: 11, gold: 0, wood: 0, mana: 0, time: 0, sight: 60, trains: ['worker'] },
      goldmine: { name: ['금광', '금 구덩이'], hp: 1200, r: 4, gold: 50, wood: 50, mana: 0, time: 12, sight: 30, on: 'gold', income: { gold: 3 } },
      lumbermill: { name: ['벌목소', '벌목터'], hp: 1200, r: 4, gold: 60, wood: 0, mana: 0, time: 12, sight: 30, on: 'wood', income: { wood: 2.5 } },
      manawell: { name: ['마나 우물', '마나 구덩이'], hp: 1200, r: 4, gold: 100, wood: 50, mana: 0, time: 15, sight: 30, on: 'mana', income: { mana: 1.5 } },
      barracks: { name: ['병영', '고블린 막사'], hp: 3000, r: 8, gold: 150, wood: 150, mana: 0, time: 25, sight: 40, trains: ['infantry', 'spear', 'archer'], research: ['shieldwall', 'longbow'] },
      stable: { name: ['마구간', '늑대 우리'], hp: 2800, r: 8, gold: 150, wood: 200, mana: 0, time: 25, sight: 40, trains: ['cav'], research: ['heavycav'] },
      workshop: { name: ['공방', '고블린 공방'], hp: 2800, r: 8, gold: 150, wood: 250, mana: 0, time: 30, sight: 40, needs: 'barracks', trains: ['siege'] },
    },
    buildMenu: ['goldmine', 'lumbermill', 'manawell', 'barracks', 'stable', 'workshop'],
    // 생산(3단계, produce.js): 한 번에 쐐기 하나 = 무게 group.weightByClass[열쇠](count가 있으면 그 수) — 값·time은 그 쐐기 몫(사용자 "한 번에 많이 나온다고 너무 비싸게만 하지 말아 줘")
    train: {
      infantry: { type: INFANTRY, gold: 200, wood: 100, mana: 0, time: 25 },
      spear: { type: SPEAR, gold: 150, wood: 200, mana: 0, time: 25 },
      archer: { type: ARCHER, gold: 150, wood: 250, mana: 0, time: 28 },
      cav: { type: CAVALRY, gold: 300, wood: 150, mana: 0, time: 32 },
      siege: { type: SIEGE, gold: 150, wood: 200, mana: 0, time: 35, count: 3 },
      worker: { type: WORKER, gold: 100, wood: 0, mana: 0, time: 12, count: 10 },   // 광부 조 하나
    },
    // 연구(3단계 — 홍수의 강화 병종 셋): 끝나면 그 편의 type 병사 모두와 그 뒤 뽑는 병사가 강화(elite — 방패벽·장궁 사거리·중기병, combat.js)
    research: {
      shieldwall: { name: '방패벽', type: SPEAR, gold: 200, wood: 0, mana: 100, time: 40 },
      longbow: { name: '장궁', type: ARCHER, gold: 200, wood: 0, mana: 100, time: 40 },
      heavycav: { name: '중기병', type: CAVALRY, gold: 250, wood: 0, mana: 150, time: 45 },
    },
    queueMax: 5,
    // 건물 피해(3단계, strikes.js): 한가한 병사가 화력 × melee(근접, 가장자리에서 reach m 안)·× ranged(원거리, 사거리 안). every틱마다, 편 0 건물 공격 알림은 alertEvery초에 한 번(투석기 돌은 catapult.buildingHit)
    buildingDamage: { melee: 0.5, ranged: 0.25, reach: 5, every: 5, alertEvery: 10 },
    produce: { gap: 4 },   // 나온 쐐기의 뒷줄은 건물 가장자리에서 이만큼 m
    // 짓기: 광부 조 crew명이 다 붙으면 건물 time초(maxBuilders명까지 센다), 짓기 시작한 건물 체력 startHp, 고치기 초당 최대 체력의 repairPerSec(한 조 다),
    // reach = 일하는 거리(건물 가장자리에서) m, 놓기: 깃발 flagClear + r m 밖, 건물 사이 gap m, 채굴기는 depositSnap m 안 자리로 붙음, 다른 건물은 자리에서 r + depositClear m 밖, 판 가장자리 edge + r m 안쪽.
    // fieldBudget: 건물이 길을 바꾼 뒤 한 틱에 다시 계산하는 흐름장 수(하나 약 10 ms)
    build: { crew: 10, maxBuilders: 20, startHp: 0.1, repairPerSec: 0.02, reach: 4.5, flagClear: 34, gap: 2, depositSnap: 12, depositClear: 6, edge: 6, fieldBudget: 2 },
    behavior: {
      aggro: 40,
      pathWidth: 9,
      routRadius: 8, routRatio: 2, routHp: 0.6, routSeconds: 4, routDistance: 20, routSpeed: 1, routCheckEvery: 20, routCooldown: 6,
      // 병종 규칙(§6.3): 원거리 목표 고르기, 궁수 물러나기, 기병 측면·짓밟기
      rangedScanEvery: 10, kiteMelee: 10, kiteFriend: 8, kiteSeconds: 2, kiteDistance: 15, kiteCooldown: 6,   // 궁수 물러나기: 한 번 물러난 뒤 kiteCooldown초는 못 물러난다
      throughSeconds: 1.5, cavFriendPush: 0.2,
      // 쫓기(2026-11-09 사용자 "벌레처럼 뭉치고 창·보병이 기병을 따라다닌다"): 창·보병은 cavNear m 밖에서 제 빠르기의 cavSlow배보다 빨리 달리는 기병을 쫓지 않는다,
      // 한 적을 쫓는 병사 무게 합은 그 적 무게 × capRatio까지(맞붙은 병사는 빼고 — 먼저 고른 순서). turn: 1초에 도는 각도(도) — 제자리에서 휙휙 돌지 않게
      chase: { cavNear: 3, cavSlow: 0.3, capRatio: 5 }, turn: { cav: 180, other: 180 },   // capRatio 3이면 뒷줄이 서 버려 기병이 선 끝으로 못 돌았다(roles 시험 0.46) → 5(0.91)
      closeSwitch: 2,   // 근접: 이 거리 안에 적이 오면 노리던 적을 버리고 그 적부터(사용자 2026-11-07: 맞붙은 적을 두고 뒤 궁수에게 달려든다) m
      leaveSeconds: 20,   // 맞붙어 있다 보낸 병사: 이 동안은 바로 옆(closeSwitch) 적만 치고 목표로 간다(사용자 2026-11-07 "A") s
    },
    movement: { spacing: 0.8, maxPush: 0.3, damping: 0.6, neighborCap: 24, cellSize: 4 },
    vision: { soldier: k.soldierSight,   // 병사 시야 m(사용자 2026-11-07: 30 → 60, 궁수·공성 사거리보다 넓게)
      hillMult: 1.5, forestSeen: 15, cell: 8, everyTicks: 4 },
    terrain: { field: 1, forest: 0.6, hill: 0.8, ford: 0.7, rock: 0 },   // rock: 바위는 못 지나간다(군단 영지 2단계)
    // 쐐기 진형(§6.4): 모이는 무게, 모양, 행군·돌진
    group: {
      weight: 150 * s, weightByClass: { infantry: 150 * s, spear: 150 * s, archer: 90 * s, cav: 100 * s, siege: 40 * s }, maxWidth: 15, lateral: 1.3, rowGap: 1.4,
      // 병종마다 진형(사용자 2026-11-06): 창 = 쐐기(위 maxWidth·lateral·rowGap), 기병 = 삼각형, 궁수·공성 = 가로 직사각형(한 줄 width명)
      shape: {
        spear: { kind: 'wedge' },
        infantry: { kind: 'wedge' },
        cav: { kind: 'triangle', lateral: 1.8, rowGap: 2.0 },
        archer: { kind: 'line', width: 30, lateral: 1.2, rowGap: 1.5 },
        siege: { kind: 'line', width: 25, lateral: 2.0, rowGap: 2.5 },
      },
      lineStop: 10,   // 직사각형(궁수·공성)은 적이 사거리 + 이만큼 안에 오면 서서 풀린다(돌진하지 않는다) m
      speedFactor: 0.85, speedFactorByClass: { cav: 1 }, turnRateDeg: 30, catchUp: 1.25,   // 기병 진형은 감속 없이 제 빠르기로(사용자 2026-11-07)
      viaStuck: 0.4,   // 경유점으로 가는 진형은 맞닿은 병사가 이 몫을 넘어야 풀린다(사용자 2026-11-07 "A")
      chargeConeDeg: 75,   // 행군 진형은 가는 쪽 ±이만큼 안의 적에게만 돌진·멈춘다(보낸 진형이 뒤에 남은 적에게 되돌아가지 않게)
      chargeDistance: 60, chargeSeconds: 3, chargeSpeed: 1.3, arriveDistance: 20,
      lookEvery: 10, cleanEvery: 20, lookaheadCells: 15, follow: 1.5,
      // 적 앞에서 풀린 쐐기(사용자 2026-11-10 영상 "와장창 흩어진다"): seconds초 동안 노릴 적이 없는 병사는 가던 쪽으로 ahead m 밀고 들어가 선다(궁수·투석기 줄은 제자리), 적은 그동안 틱마다 찾는다
      press: { seconds: 3, ahead: 6 },
      impactFront: 16, knockback: 1.5,   // 쐐기 충격: 앞 몇 명의 첫 타가 바로 ×2, 맞은 적이 밀려나는 거리
    },
  };
}
