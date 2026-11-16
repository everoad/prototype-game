// 판정 수치 한곳(설계서 §10 · 각 Task가 자기 묶음을 더한다). 수치는 모두 초·U 단위 — 틱 수로 쓰지 않는다.
// 다른 파일은 값을 복사해 두지 말고 쓸 때마다 RULES.x로 읽는다(수치 패널 F2가 바로 먹게).

// 탄 종류
export const K = { NORMAL: 0, WHITE: 1, GOLD: 2, RED: 3, REFLECT: 4 };

export const RULES = {
  dt: 1 / 120,                                   // 고정 틱 120 Hz(§8)
  board: { hx: 10, hz: 7 },                      // 판 x ∈ [−10, 10], z ∈ [−7, 7]
  player: {
    bodyR: 0.5,        // 몸 원(근접 판정·몸끼리)
    hitR: 0.15,        // 판정 점(탄)
    parryR: 0.8,       // 패링 원
    grazeR: 0.55,      // 스침(§4.8): 판정 점 가운데에서 이 거리 + 탄 반지름 안
    speed: 7.83,       // U/s (proto-game)
    hp: 90,            // 숙련 봇도 10판에 1~3판 진다(원거리 재설계 Task 7)
    hurtInvuln: 1.0,   // 맞은 뒤 무적
    hurtClearR: 2.5,   // 맞은 순간 둘레 탄 지우기
    buffer: 0.1,       // 입력 미리 받기
  },
  start: { player: [-6, 0], boss: [6, 0] },      // 판 양 끝(§5.2 여는 순서)
  // 맞은 출처 번호(hurt src, stats.hitsByPattern 키): 패턴 1~7은 그 번호
  src: { laser: 8, orbs: 9, combo: 10, slam: 11, wave: 12, sword: 13, background: 14 },
  // 두 겹 탄막의 아래(§5.4): 바탕 고리(+ 2단계 느린 나선), 2단계 쌍둥이 구슬. 흰·금 없음.
  layers: {
    bg1: { every: 1.6, n: 12, speed: 6 },
    bg2: { every: 1.1, n: 16, speed: 6, spiralEvery: 0.2, spiralStepDeg: 13, spiralSpeed: 5 },
    orbs: { r: 2.5, spin: 1.2, every: 0.8, speed: 11 },
    start: { ring: 0.8, orb: 0.4 },   // 판 시작 뒤 첫 고리·첫 구슬(둘째 구슬은 every/2 늦게 — 엇갈림)
    resume: 0.3,                       // 쉬었다 다시 쏠 때 첫 발까지
  },
  // 쓸어내는 레이저(패턴 8, 빨강 = 회피만): 조준선 aim초(발사 lockBefore 전까지 따라옴) → 빔이 sweepDeg를 sweepSec에
  laser: { aim: 0.5, lockBefore: 0.2, sweepDeg: 40, sweepSec: 0.8, width: 1.0, dmg: 20 },
  dodge: {
    dist: 5, dur: 0.25,
    front: 0.7,            // 앞 절반 시간에 거리의 70%(튀어 나가는 곡선, §4.5)
    invuln: 0.22,          // 시작부터
    charges: 2, recharge: 3,   // 쓴 충전 하나는 쓴 뒤 3초에 돌아온다
  },
  parry: { window: 0.25, perfect: 0.12, failRecovery: 0.25 },
  reflect: { hold: 0.06 /* 받은 탄만 고리 위에서 멈춤 — 화면은 안 멈춘다 */, dmgNormal: 40, dmgPerfect: 80, staggerNormal: 8, staggerPerfect: 14, staggerGold: 20 },
  boss: { r: 1.6, hp: 7500, speed: 5.65 },       // 체력은 봇으로 맞춘다(원거리 재설계 Task 7: 숙련 약 2분)
  shots: { pellets: 5, spreadDeg: 12, rate: 12, speed: 30, range: 16, dmg: 1, cap: 160 },   // 퍼지는 자동 사격(§4.3)
  stagger: { max: 100, groggy: 3, groggyMul: 1.5 },
  counter: { overdrive: 2.85 /* 느려짐 1초(×0.35) + 2.5초, sim 시간 */, overdriveMul: 2, bossStun: 1.5 },   // 반격 기회(§4.6)
  // 완전 패링 반격(§4.4.2): 붙기 → 일제 사격 → 뒤로 튀기, 합쳐 약 0.8초(+ 화면 정지 0.1). standOff = 붙는 자리(보스 가운데에서).
  fullCounter: { dashIn: 0.15, volley: 0.35, back: 0.3, backDist: 5, steerDeg: 90, dmg: 120, stagger: 15, standOff: 2.6 },
  heal: { amount: 3 },   // ?heal=1 변형만(§4.7)
  // 순간 돌진(§5.3): 움츠림 → 0.2초 전 자리 고정 → 25 U/s, 몸 사이 1.0 U(가운데끼리 3.1)에서 멈춤. 피해 없음.
  rush: { crouch: 0.35, lockBefore: 0.2, speed: 25, gap: 1.0 },
  // 근접(§5.3): 종류마다 예고 하나로 고정. 내려찍기 원은 보스 앞 offset에 둔다(멈춘 거리 3.1의 플레이어에 닿게).
  // 빨간 장판은 (예고 − 0.2) × 이동 속도 ≥ 반지름 + 몸 반지름(가운데서도 걸어서 빠져나감).
  melee: {
    swing: { warn: 0.35, R: 3.6, halfDeg: 60, dmg: 15 },            // 빨라짐(§5.3)
    slam: { warn: 0.45, R: 1.4, offset: 2.0, dmg: 25 },             // (0.45 − 0.2) × 7.83 ≥ 1.4 + 0.5
    active: 0.1, recover: 0.15, gapAfter: 0.8, push: 0.4,
    stagger: { normal: 12, perfect: 20 },
  },
  // 빠르고 멀리 닿는 장판 공격(§5.3). 빨간 빠른 공격은 redWindow초 안에 redMax번까지(§5.6, 두뇌가 지킨다).
  floor: {
    slam: { warn: 0.5, lockBefore: 0.2, width: 3.2, speed: 30, dmg: 22, stun: 1.0, stagger: 20, maxShove: 0.6 },   // maxShove: 한 틱에 플레이어를 이보다 멀리 밀어야 하면(구석) 거기서 멈춘다
    wave: { warn: 0.4, speed: 12, thick: 0.8, dmg: 18, stagger: [12, 20], teleR: 1.2 },   // teleR: 예고 고리 = 보스 몸 + 이만큼
    sword: { warn: 0.4, R: 12, halfDeg: 12, dmg: 18, stagger: [12, 20], active: 0.1 },
    redWindow: 3, redMax: 2, redSlack: 0.15,   // redSlack = 타격 예정 시각 어림의 여유
  },
  combos: { A: [['swing', 'white'], ['swing', 'white'], ['slam', 'gold']], B: [['swing', 'white'], ['slam', 'red']] },
  lanes: { redWarn: 0.7, goldWarn: 0.5, lockBefore: 0.2 },   // 빨강·금 탄의 차선 예고(§5.1)
  // 시범 봇(§9, 확인·영상용 도구): 사람처럼 0.2초 늦게, 둘레 10 U만 본다. think = 움직임을 다시 정하는 간격.
  bot: { react: 0.2, sight: 10, look: 0.5, samples: 6, think: 3 / 120, parryLead: [0.03, 0.10], jitter: 0.04, jitterSome: 0.08, someRate: 0.5, keep: [8, 10], margin: 0.3, dodgeLead: 0.05, duel: [2.6, 4.2] },
  // 보스 두뇌(§5.1~5.3): 준비 → 패턴 → 숨, 거리 묶음, 돌진 시계, 깨어남, 2단계 새 패턴 하나씩.
  brain: {
    // 박자(§5.5): 준비 0.25초, 숨 0.15~0.35초, 다음 준비는 앞 패턴 마지막 0.3초와 겹친다
    windup: 0.25, breath: [0.15, 0.35], breath2: [0.1, 0.25], overlap: 0.3, wake: 0.4, wakeBreath: 0.6,
    // 움직임(§5.2): 쏘는 동안 둘레를 돈다(접선 U/s, 1·2단계), 거리 맞추기, 방향 바꾸기, 준비 중 절반, 가끔 옆으로 뛰기
    orbit: [2.0, 2.6], radial: 1.5, flip: [2, 4], windupMoveMul: 0.5, hop: { chance: 0.3, dist: [3, 4], sec: 0.25 },
    // 고르기(§5.5): 가까움 < near = 근접 콤보 또는 파도(nearWave), 멀리 > far에 farHold초면 farChance로 박치기·다가오기,
    // 장판 공격·다가오기는 floorEvery초(1·2단계)에 한 번. 장판 색 = 흰·빨강·금(금은 박치기만, 나머지는 흰).
    near: 4, far: 11, farHold: 2, farChance: 0.7, floorEvery: [7, 5], nearWave: 0.5, colors: [0.6, 0.3, 0.1], comboB: 0.5,
    sparseBreathMul: 2,   // 성긴(처음 소개) 패턴 뒤 숨 배율
    flipCooldown: 0.6,    // 난간에 막혀 도는 방향을 바꾼 뒤 다시 바꾸기까지(떨림 방지)
    keep: [7.5, 10], phaseAt: 0.5, phasePause: 1.0,   // 7.5 U 넘게: 흰 탄(보스 몸 1.2 U에서 나옴)이 0.4초 규칙(6.4 U)에 걸리지 않는 거리
    opening: [{ pattern: 1 }, { pattern: 3 }, { slam: 'white' }, { approach: 'A' }],   // 흰 탄 받기 → 빨강 피하기 → 몸도 받기 → 다 받으면 반격
    intro2: [5, 6, 7],      // 2단계 고르기 1·3·5번째에 하나씩(성기게)
  },
  // 탄막 패턴 시작값(§5.2 — 빌더가 다듬는다). muzzle = 보스 가운데에서 탄이 나오는 거리.
  patterns: {
    muzzle: 1.2,
    1: { volleys: [0, 0.3, 0.6], n: 7, nSparse: 3, spreadDeg: 60, speed: 11.5 },                        // 조준 부채, 가운데 흰(사이 10° — 걸어서 빠질 틈)
    2: { rings: [0, 0.35, 0.7, 1.05, 1.4], n: 40, nSparse: 22, gapSlots: 6, gapSparse: 2, twistDeg: 4.1, speed: 10, whites: [2, 3], whitesSparse: [1, 1] },   // 고리, 마지막 고리 금 1
    3: { at: [0, 0.35, 0.7], atSparse: [0], speed: 18 },                                          // 빨간 창(조준 차선)
    4: { speed: 4, r: 0.5, burstDist: 7, minTravel: 0.25, burstAt: 1.5, n: 18, nSparse: 9, whites: 2, whitesSparse: 1, fragSpeed: 11, maxSec: 2.5 },   // 쪼개지는 구슬
    5: { dur: 3.2, every: 0.07, everySparse: 0.12, arms: 3, stepDeg: 8, whiteEvery: 6, speed: 10 },     // 나선
    6: { dur: 1.2, every: 0.05, everySparse: 0.1, speed: 18 },                                        // 연발, 끝 금(조준 차선)
    7: { spacing: 0.5, spacingSparse: 1.0, speed: 9, gap: 1.6, nearGap: 1.5, farGap: [5, 7], plugWhites: 3, reds: 3, redLen: 3, maxSec: 4 },   // 탄 벽
  },
  bullets: {
    cap: 600,              // 동시에 판에 있는 적 탄 상한(두 겹 탄막 몫)
    parrySpeed: 14,        // 흰·금 탄은 모두 이 속도(§4.4)
    minParrySpawn: 6.4,    // = parryR + 0.4 × parrySpeed — 이 안에서 생기는 흰·금 탄은 보통 탄(0.4초 규칙)
    r: [0.2, 0.25, 0.3, 0.6, 0.25],   // 판정 반지름, K 순(보통·흰·금·빨강·되튐)
    dmg: [10, 12, 18, 22, 0],
    reflectSpeed: 24,
  },
};
