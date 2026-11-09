// 홍수 전쟁 시험판의 모든 수치(설계서 2026-11-06-flood-war-design.md). 다른 파일에 숫자를 흩뿌리지 않는다.
// makeRules(knobs)가 규모 배율(scale = 상한 ÷ 10,000)과 손잡이를 여기서 한 번만 곱한다.

export const SPEAR = 0;   // 버팀 (몬스터: 고블린)
export const ARCHER = 1;  // 화력 (몬스터: 트롤 투척꾼)
export const CAVALRY = 2; // 기동 (몬스터: 늑대 기수)
export const INFANTRY = 3; // 보병: 징집의 기본, 상성 없음 (몬스터: 고블린) — 공성 자리를 대신함(사용자 2026-11-07 시험)
export const TYPES = [SPEAR, ARCHER, CAVALRY, INFANTRY];   // 생산 병종(징집·건물 비율). 공성은 사는 것만이라 여기 없다
export const SIEGE = 4;    // 공성병 (몬스터: 오거) — 금으로 산다(설계서 2026-11-09-flood-gold-orders-design.md §2)

const SPEAR_HP = 600; // 무게 = 체력 ÷ 창병 체력 (§1.4)

// 병종 기본 수치. 편 0 = 사람, 편 1 = 몬스터 (§6.1, 몬스터 수치는 계획서 Task 1이 정한 시작값).
const UNIT_TABLE = [
  [
    { name: '창병', hp: 600, dps: 10, range: 1.2, speed: 3, holdsLine: true, shield: true, splash: 0, siege: false },
    { name: '궁수', hp: 360, dps: 4, range: 40, speed: 2.6, holdsLine: false, splash: 0, siege: false },   // 창병(3)보다 느리게 — 물러나는 궁수를 따라잡도록(사용자 2026-11-07)
    { name: '기병', hp: 960, dps: 22, range: 1.2, speed: 9, holdsLine: false, splash: 0, siege: false, charges: true },   // 화력 14 → 22(무게당 궁수와 같게), 빠르기 7 → 9(보병의 세 배, 사용자 2026-11-07: 기병이 빨리 닿게)
    { name: '보병', hp: 600, dps: 10, range: 1.2, speed: 3, holdsLine: false, shield: true, splash: 0, siege: false },   // 무난한 병종: 창병과 같은 수치와 앞쪽 방패, 버티기·기병 상성은 없음
    { name: '공성병', hp: 480, dps: 3, range: 45, speed: 3, holdsLine: false, splash: 0, siege: true },   // 9322f5e의 수치, 빠르기만 1.8 → 3(보병과 같이 닿게, 2026-11-09)
  ],
  [
    { name: '창 고블린', hp: 360, dps: 6, range: 1.2, speed: 3.3, holdsLine: true, shield: true, splash: 0, siege: false, spacing: 0.6 },   // 떼(간격 0.6 m). 체력 300 → 360, 화력 5 → 6: 정면에서 기병을 막게(사용자 2026-11-07)
    { name: '투척꾼', hp: 400, dps: 3, range: 40, speed: 2.4, holdsLine: false, splash: 2, splashShare: 0.3, splashMax: 6, siege: false },   // 둘레 2 m의 가까운 6명까지 30%(사용자 2026-11-07: 조금 줄여 보자 — 제한이 없으면 빽빽한 줄에서 바위 하나가 열 명 넘게 쳤다)
    { name: '늑대 기수', hp: 700, dps: 12, range: 1.2, speed: 10, holdsLine: false, splash: 0, siege: false, charges: true },   // 빠르기 8 → 10(사람 기병과 같은 비율로)
    { name: '고블린', hp: 300, dps: 5, range: 1.2, speed: 3.3, holdsLine: false, shield: true, splash: 0, siege: false, spacing: 0.6 },
    { name: '오거', hp: 1500, dps: 8, range: 1.5, speed: 3.3, holdsLine: false, splash: 0, siege: true },   // 9322f5e의 수치, 빠르기만 1.6 → 3.3(고블린과 같이)
  ],
];

export function makeRules(knobs = {}) {
  const k = { scale: 1, production: 1, damage: 1, commandLimit: 500, commandCooldown: 60, speed: 1.25, mirror: false, soldierSight: 60, ...knobs };   // speed: 모든 이동 배율(사용자 2026-11-08: 조금 빠르게 1 → 1.25)
  const s = k.scale;
  // mirror: 편 1도 사람 병종 표를 쓴다(대칭 시험·1:1 대칭 판)
  const table = k.mirror ? [UNIT_TABLE[0], UNIT_TABLE[0]] : UNIT_TABLE;
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
    elite: { shieldMult: 0.2, allRound: 0.5, rangeBonus: 15, hpMult: 1.3, spearCounter: 1.25 },
    // dodge: 달리는(빠르기 60% 넘게) 기병이 받는 원거리 피해 배율 · scare: 적 기병이 이 거리 안에 있는 원거리병은 쏘지 못한다 m
    // staggerSeconds: 기병 돌격에 맞은 병사가 못 치는 시간(사용자 2026-11-07 나안)
    // 원거리 화력 ×0.75(궁수 8 → 6, 투척꾼 6 → 4.5)와 dodge 0.5 → 0.3: 대진표에서 궁수 몰아 쓰기가 모든 상대를 이겼다(사용자 2026-11-07 밸런스)
    // 다시 ×⅔(궁수 6 → 4, 투척꾼 4.5 → 3, 사용자 2026-11-07 "궁병이 너무 사기"): 원거리는 무게당 보병의 1.6~2배를 주고 절반만 받았고, 우리 궁수 전략이 천적인 늑대 기수 전략을 이겼다
    charge: { mult: 2, runMeters: 30, cooldown: 10, dodge: 0.3, scare: 10, staggerSeconds: 2 },
    buildingDamage: { siege: 10, other: 0.05 },
    // brace: 버팀(창)은 이 거리 안에 기병 아닌 적이 없을 때만 버틴다 — 보병과 맞붙은 창은 기병에게 ×1.3이 없고 짓밟힌다(사용자 2026-11-07 나안) m
    melee: { interval: 1, reach: 1.2, caughtRanged: 0.3, brace: 1.8 },   // 근접 적이 닿은 원거리병은 못 쏘고 화력의 30%로 맞선다

    cap: 10000 * s,
    levy: { hq: 600 * s * k.production, stronghold: 350 * s * k.production }, // 무게/분
    start: {
      armyWeight: 2000 * s,
      mix: { [INFANTRY]: 0.4, [SPEAR]: 0.15, [ARCHER]: 0.27, [CAVALRY]: 0.18 },   // 공성은 뺐다(사용자 2026-11-07: 역할이 애매, 나중에 금으로 산다)
      offset: 60,                       // 승점 선에서 떨어진 출발 자리 m
      toVictoryPoint: k.startToVictoryPoint ?? [true, false],    // 편마다(손잡이 startToVictoryPoint — 자동 대전에서 치우침을 가를 때): 시작 대군이 구역 선 대신 가장 가까운 승점으로(사용자 2026-11-08, 우리 편 — 적 AI는 구역 병력으로 판단하므로 구역 그대로)
      archerBack: 18, cavBack: 10, spearBack: 9,   // 궁수 직사각형·기병 삼각형·창 쐐기가 보병 쐐기 줄보다 뒤에 서는 거리 m
      hqBuildings: ['archery', 'stable'],
    },
    garrison: { hq: 150 * s, stronghold: 60 * s },
    gold: { start: 200, perMinute: { hq: 60, stronghold: 30, vp: 20 } },
    // 금 명령(설계서 2026-11-09-flood-gold-orders-design.md): 땅에 반지름 radius m 원을 찍어 건다. cost 금, cooldown 초(명령마다·편마다), seconds 효과 초.
    orders: {
      radius: 50,
      march: { cost: 60, cooldown: 90, seconds: 20, speedMult: 2 },   // 2026-11-09 놀아 본 뒤: 60초 ×1.3은 안 보였다 → 20초 ×2(쐐기가 치고 나가는 게 보이게)
      drum: { cost: 80, cooldown: 120, seconds: 15, damageMult: 1.3, knockback: 3 },   // 돌격 북: 화력 ×1.3, 근접 타격마다 맞은 적 3 m 밀려남(1.5면 15초에 줄이 6 m, 3이면 9 m — 2026-11-09 잼), 안 무너짐(전에는 받는 피해 ×0.7 30초 — 안 보였다)
      volley: { cost: 30, cooldown: 30, seconds: 10, fireMult: 2 },   // 화살 비: 원 안 적만, 쏘는 간격 ÷ fireMult(한 발 피해는 그대로)
      scout: { cost: 40, cooldown: 60, seconds: 30, radius: 150 },
      levy: { cost: 100, cooldown: 120, count: 150 * s },           // 긴급 징집: "공격받음" 경보가 뜬 우리 거점에만
    },
    siegeBuy: { cost: 150, count: 10 * s, seconds: 20 },             // 공성병 사기: 거점에서 사면 seconds 뒤 그 거점에 count명
    buildings: {
      archery: { cost: 120, share: 0.5, unit: ARCHER },   // 사격장만 50%(사용자 2026-11-08: 궁수가 늘 절반쯤 남는다 — 많이 나오고 덜 죽어서)
      stable: { cost: 150, share: 0.8, unit: CAVALRY },
      // 거점 강화(칸과 따로, 사용자 2026-11-07): 성벽·망루
      // 생산 건물(칸): 하나면 그 거점 징집의 80%, 서로 다른 둘이면 40%씩 — 합은 maxShare까지(사용자 2026-11-07: 거점 특화)
      pikes: { cost: 120, share: 0.8, unit: SPEAR },   // 창 막사
      tower: { cost: 80, range: 250, range2: 300 },
      wall: { cost: 120, hp: 10000, hqHp: 20000, taken: 0.7 },
      hp: 2000,
      buildSeconds: 25,
      upgradeCost: 1.5,
      demolishRefund: 0.5,
      maxShare: 0.8,
    },
    capture: { vp: 15, land: 15, front: 60, rear: 60, hq: 120, wallMult: 2, decaySeconds: 30 },
    // 작은 땅(설계서 2026-11-09-flood-small-lands-design.md): 원 반지름 m, 주인에게 1분 금(거점 금에 더한다), 주인 시야 m
    lands: { radius: 30, gold: { edge: 30, deep: 40, choke: 20 }, sight: { owned: 100, choke: 200 } },
    morale: {
      start: 60,
      vpDrain: 3,            // 승점 차이 1개당 1분에
      baseFrom: 600, base: 5, // 10분 뒤 양쪽 1분에
      doubleFrom: 780, doubleMult: 2,
      events: { loseFront: 6, loseRear: 8, loseCaptured: 3, buildingBurned: 2, generalRouted: 6 },
    },
    general: {
      limit: k.commandLimit * s,
      speed: 7 * k.speed,
      vision: 50,
      aura: 1.2,
      auraRecompute: 1,
      chargeMult: 1.3, chargeSeconds: 15, chargeAdvance: 20,
      holdTaken: 0.7, holdSeconds: 15,
      cooldown: k.commandCooldown,
      routRadius: 60, routMinWeight: 20 * s, routRatio: 2, routSeconds: 5, routedSeconds: 60,
      loneWeight: 20 * s, loneSeenSeconds: 5,
      assembleRange: 150,
    },
    holdTheLine: { revertSeconds: 10, leash: 40 },
    defense: { overwhelmMin: 5, blockRadius: 20 },
    behavior: {
      aggro: 40, leash: 60,
      archerFriendAhead: 15, archerRetreatMax: 40,
      decisionHold: 3,
      rallyBack: 25, rallyMinWeight: 50 * s,
      pathWidth: 9,
      // 정면은 밀고 밀린다(§6.3a)
      pursuit: 120, pursuitCell: 20, advanceCap: 120,
      routRadius: 8, routRatio: 2, routHp: 0.6, routSeconds: 4, routDistance: 20, routSpeed: 1, routCheckEvery: 20, routCooldown: 6,
      // 병종 규칙(§6.3): 원거리 목표 고르기, 궁수 물러나기, 기병 측면·짓밟기
      rangedScanEvery: 10, kiteMelee: 10, kiteFriend: 8, kiteSeconds: 2, kiteDistance: 15, kiteCooldown: 6,   // 궁수 물러나기: 한 번 물러난 뒤 kiteCooldown초는 못 물러난다
      flankOutside: 20, flankBeyond: 30, flankReach: 15, throughSeconds: 1.5, cavFriendPush: 0.2,
      huntRange: 100, lineBlock: 1.5, lineCell: 8,   // 기병: 100 m 안 원거리·공성을 먼저(기다리는 자리에서 적 궁수 줄까지 닿게), 가는 길(8 m 칸)에 적 버팀 무게가 이만큼 넘으면 막힌 길
      closeSwitch: 2,   // 근접: 이 거리 안에 적이 오면 노리던 적을 버리고 그 적부터(사용자 2026-11-07: 맞붙은 적을 두고 뒤 궁수에게 달려든다) m
      evadeSeconds: 1,  // 기병: 노리지 않은 창에 닿으면 이만큼 반대쪽으로 빠져나간다 s
      leaveSeconds: 20,   // 맞붙어 있다 보낸 병사: 이 동안은 바로 옆(closeSwitch) 적만 치고 목표로 간다(사용자 2026-11-07 "A") s
      regroupSeconds: 5, regroupDistance: 30,   // 정면 병사: 120 m 안에 적이 없이 이만큼 서 있고 자기 자리에서 이만큼 넘게 멀면 구역 선으로 돌아온다(사용자 2026-11-07: 구석에 남은 병사)
      evadeRange: 20, evadeDistance: 25,   // 기병: 우리와 맞붙지 않은 적 창이 이 안에 오면 반대로 이만큼 물러난다 m
    },
    movement: { spacing: 0.8, maxPush: 0.3, damping: 0.6, neighborCap: 24, cellSize: 4 },
    vision: { soldier: k.soldierSight,   // 병사 시야 m(사용자 2026-11-07: 30 → 60, 궁수·공성 사거리보다 넓게)
      general: 50, stronghold: 100, tower: 250, tower2: 300, hillMult: 1.5, forestSeen: 15, cell: 8, everyTicks: 4 },
    terrain: { field: 1, forest: 0.6, hill: 0.8, ford: 0.7 },
    ai: {
      planHoldMin: 45, planHoldMax: 60, threatHalfLife: 60, forestSuspicion: 1.3, observeSeconds: 30,
      raidWeightMin: 300 * s, raidWeightMax: 500 * s, raidEveryMin: 180, raidEveryMax: 300,
      reactionDelay: 2, jitter: 0.1,
      // 판단 다섯 가지(계획서 Task 14, 사용자 2026-11-07 "A: 이대로"로 고친 안 — 장수 대신 보내기, 공방 없음)
      memCell: 40, nearLine: 150, sectorMargin: 60,              // 위협 기억 칸 m · 구역 위협을 세는 승점 선 앞뒤 · 선분 옆 넓힘 m
      massShare: 1.5, massMinWeight: 20 * s, massForget: 5, counterHold: 120,   // counterHold: 정한 상성 대상은 이만큼 바꾸지 않는다 s      // 특수 병종이 시작 구성 몫의 이 배를 넘게 보이면 '몰림'(보인 무게가 이만큼 넘을 때), 이만큼 안 보이면 잊는다 s
      counterBuilding: { [CAVALRY]: 'pikes', [ARCHER]: 'stable', [SPEAR]: 'archery' },
      defaultBuilding: { front: 'archery', rear: 'stable' },     // 아무것도 몰려 보이지 않을 때 빈 거점에 짓는 것(뒤 마구간 = 기습 거점)
      wallThreat: 100 * s, wallRadius: 150, towerSpare: 100,     // 이 무게의 위협이 둘레에 있었으면 성벽 · 망루는 금이 그 값 + 이만큼 있을 때
      buildEvery: 1,                                             // 건물 판단 주기 s(상성 건물은 보고 나서 2초 안에)
      vpValue: 150 * s,                                          // 우리 것이 아닌 승점 하나 = 위협 무게 이만큼(성향 vp 배율)
      pushFrom: 60, pushEvery: 10, pushMinWeight: 100 * s, pushCooldown: 90,   // 밀어 넣기: 이 판 시각부터, 구역 병력이 앞 적 × 성향 push 넘고 이 무게 넘으면 깃발에서 보낸다
      raidGatherMax: 120, raidMinShare: 0.5, raidRetry: 30, raidSweep: 10, raidWallPenalty: 200 * s, raidProdBonus: 50 * s, raidDistPenalty: 50 * s, raidRoutes: true, raidFrontPenalty: 1000 * s, raidPassPenalty: 300 * s,   // raidDistPenalty: 100 m마다 더하는 무게(지도 반대편 대각선 기습 방지)
      regroupSeconds: 30, regroupEvery: 10,                      // 승점·빼앗은 거점에 선 병력: 적 없이 이만큼 지나면 가까운 구역으로
      // 금 명령(2026-11-09): 돌격 북은 둘레 50 m에 맞붙은 우리 병사가 drumMinOwn명 넘고 보이는 적 무게가 더 클 때, 화살 비는 둘레 50 m 보이는 적 무게가 volleyMinWeight 넘을 때.
      // 후보는 병사 sample명에 하나, 판단마다 maxCandidates개까지(1초마다 도는 AI가 무겁지 않게)
      casts: { drumMinOwn: 100 * s, volleyMinWeight: 30 * s, sample: 8, maxCandidates: 40 },
      // 작은 땅(2026-11-09): 길목 먹기(판 시각 chokeAt초부터, chokeRetry초마다 무게 chokeWeight), 땅 기습 무게, 땅 지키기(경보 defendDelay초 뒤 보이는 적 × defendRatio, defendEvery초에 한 번), 기습 점수에서 땅 금/분 1당 빼는 무게
      lands: { chokeAt: 30, chokeRetry: 60, chokeWeight: 100 * s, raidWeightMin: 100 * s, raidWeightMax: 200 * s, defendRatio: 1.5, defendEvery: 30, defendDelay: 2, valueWeight: 5 * s },
      holdLate: 15, holdLateGauge: 50, holdSpeed: 3 * k.speed,             // 막아라 뒤 이만큼 지나도 밀리고 게이지가 이 밑이면 다른 곳 병력도 · 끌려오는 걸음 m/s
      personality: {
        aggressive: { vp: 1.5, threat: 1, push: 1.3, raidEvery: 1 },
        careful: { vp: 0.8, threat: 1.3, push: 2, raidEvery: 1.4 },
        raider: { vp: 1, threat: 1, push: 1.6, raidEvery: 0.6 },
      },
    },
    fields: { recomputeSeconds: 4 },
    // 쐐기 진형(§6.4): 모이는 무게, 모양, 행군·돌진
    group: {
      weight: 150 * s, weightByClass: { infantry: 150 * s, spear: 150 * s, archer: 90 * s, cav: 100 * s, siege: 40 * s }, classGap: 25, maxWidth: 15, lateral: 1.3, rowGap: 1.4, assemblyGap: 20,
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
      impactFront: 16, knockback: 1.5,   // 쐐기 충격: 앞 몇 명의 첫 타가 바로 ×2, 맞은 적이 밀려나는 거리
    },
  };
}
