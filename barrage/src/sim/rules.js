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
  src: { laser: 8, orbs: 9, combo: 10, slam: 11, wave: 12, sword: 13, background: 14, tail: 15, wing: 16 },
  // 두 겹 탄막의 아래(§5.4): 바탕 고리(+ 2단계 느린 나선), 2단계 쌍둥이 구슬. 흰·금 없음.
  layers: {
    bg1: { every: 2.2, n: 10, speed: 6 },
    bg2: { every: 1.6, n: 12, speed: 6, spiralEvery: 0.3, spiralStepDeg: 13, spiralSpeed: 5 },
    orbs: { r: 2.5, spin: 1.2, every: 1.2, speed: 11 },
    start: { ring: 0.8, orb: 0.4 },   // 판 시작 뒤 첫 고리·첫 구슬(둘째 구슬은 every/2 늦게 — 엇갈림)
    resume: 0.3,                       // 쉬었다 다시 쏠 때 첫 발까지
  },
  // 쓸어내는 레이저(패턴 8, 빨강 = 회피만): 조준선 aim초(발사 lockBefore 전까지 따라옴) → 빔이 sweepDeg를 sweepSec에
  laser: { aim: 0.6, lockBefore: 0.2, sweepDeg: 28, sweepSec: 1.0, width: 0.8, dmg: 20 },   // 사용자 "너무 피하기 힘듦": 예고 0.5→0.6, 각 40→28°, 쓸기 0.8→1.0초, 폭 1.0→0.8
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
  // 그로기 처형(§5.8): 곁 = 보스 몸 + 플레이어 몸 + reach. 피해 share × 최대 체력(붙어 쏘기 한 발 = 그 shotShare, 나머지는 큰 한 발).
  // 시간은 처형 시작부터 초(영화처럼 연출 — 사용자가 빠른 쪽과 비교해 고름). 큰 한 발에 보스를 knock U 밀고, 플레이어는 back초에 backDist U 물러난다.
  execute: {
    // share 0.12면 숙련 봇 판이 105→66초로 줄어 0.08(74초, 가끔 패링 봇 7/10)
    reach: 2.0, share: 0.08, shotShare: 0.1, knock: 2.0, backDist: 4, standOff: 2.4,
    dashIn: 0.15, shots: [0.25, 0.35, 0.45], final: 0.6, back: 0.3,
  },
  // 방패·폭탄 사용권(§4.9): 시작에 들고 오는 수, 최대, 보스전 아이템 간격·수명·보스와 떨어진 거리·줍는 거리
  items: { start: { shield: 1, bomb: 1 }, max: 3, every: 25, life: 10, minFromBoss: 5, pickR: 1.0 },
  shield: { sec: 1.5, r: 1.2 },                        // 보라 탄만 지움
  bomb: { invuln: 1.5, share: 0.04, rescue: 0.15 },   // rescue = 맞은 뒤 이 안에 폭탄이면 그 한 대를 되돌림
  // 보조 무기(§4.10) — 공격 무기만(칼날·파동은 너무 세서 뺐다, 사용자). 탄 수는 늘리고 한 발 피해를 줄여 초당 피해는 첫 시험과 같게.
  // first = 켠 뒤 첫 발까지(없으면 every).
  weapons: {
    missile: { every: 1.5, first: 0, n: 3, spreadDeg: 60, speed: 11, turn: 5, life: 3, dmg: 16 / 3 },   // 2발×8 → 3발×5.3
    burst: { n: 10, spreadDeg: 44, speed: 24, range: 16, dmg: 3 },                                    // 6발×5 → 10발×3
    beam: { every: 3, dur: 0.35, dps: 80 },
    drone: { every: 0.2, first: 0, offset: 1.3, spin: 1.5, speed: 22, range: 16, dmg: 0.2 * 2 / 0.35 },   // 0.35초 2 → 0.2초 1.14
    // 패링과 엮기(사용자 "1번"): 공격 무기는 패링 뒤 sec초(완벽 perfectSec초) 동안만 가동. 패링이 스킬 게이지를 채운다(+1, 완벽 +2).
    charge: { sec: 3, perfectSec: 4.5 },
    skill: { max: 6, cost: 3, missile: { n: 12, spreadDeg: 160 }, beam: { dur: 1.5, dps: 160 }, drone: { dur: 4, every: 0.05 } },
  },
  // 모아 던지기(§4.11, 변형 ?store=1): 받은 것을 cap개까지 모았다가 U로 한 번에. dmg·heal = [보통, 완벽], n개면 피해·무력화 × (1 + bonus × (n − 1)).
  // every = 던질 때 탄 사이 간격, orbitR = 모인 탄이 도는 반지름(패링 고리 0.8 안쪽), hard = &hard=1의 받는 피해 배율, bossHp = 이 변형의 보스 체력 배율.
  store: { cap: 4, dmg: [100, 150], heal: [2, 4], bonus: 0.1, every: 0.06, orbitR: 0.5, hard: 1.3, bossHp: 1.2 },
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
  // zone = 용 판 자리 정하기: from U 안에서 받은 공격이 끝날 때 chance꼴로 옆·뒤 R U 자리를 sec초 지킨다(pull = 그 자리로 끄는 세기, keep = 용과 지키는 거리, 설계 용 §9)
  // user = 사용자 판(60초·맞음 6·패링 16·완벽 14)에 맞춘 봇: 늦게 보고(react) 드물게 고쳐 움직인다(think), 패링 기회의 chance만 받는다.
  // 맞춘 결과(기본 판, 무기 다 켬, 10판, 죽지 않게): 63초 · 맞음 5.8 · 패링 15.8 · 완벽 13.9
  bot: { user: { react: 0.38, think: 0.2, chance: 0.9 }, zone: { chance: 0.5, from: 6, R: [3, 4.5], sec: [2, 4], pull: 1.0, keep: [9, 11] }, react: 0.2, sight: 10, look: 0.5, samples: 6, think: 3 / 120, parryLead: [0.03, 0.10], jitter: 0.04, jitterSome: 0.08, someRate: 0.5, keep: [8, 10], margin: 0.3, dodgeLead: 0.05, duel: [2.6, 4.2], execBand: [2.4, 3.6] },
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
  // 두 번째 보스 — 몸을 돌리는 용(설계 2026-11-16-barrage-dragon-design.md). 각도는 도, 거리는 몸통 가운데에서.
  // 몸: 몸통 원(boss.r)만 단단하고 맞는다. 머리는 앞 headAt에 들려 있고(지나갈 수 있음) 머리 공격은 입(앞 mouthAt)에서.
  // 몸 돌기: 가만히·걷기·탄 기다림 turn.free, 준비·패턴·장판 공격 turn.busy, 몸 공격은 lockBefore초 전에 방향 고정.
  // 자리: 보는 쪽과의 각 차 ≤ zone.front = 앞, ≥ zone.back = 뒤, 그 사이 옆. 머리 탄은 보는 쪽 ± aimCone 안으로만 겨눈다.
  // 걷기: 플레이어가 앞쪽 반이고 walk.from U보다 멀면 보는 쪽으로 walk.speed(1·2단계). near = 가까움(자리별 공격), far = 멀리.
  // mouthGuard = 입 바로 앞 이 거리 안의 플레이어 위에서는 탄이 생기지 않음(머리는 단단하지 않아 밑에 설 수 있다). turnMax = 옆·뒤 멀 때 돌기 최대 초, zoneRepeat = 꼬리·날개가 연달아 나오는 최대 번(그다음은 포효), recover = 몸 공격(장판·발톱) 뒤 더 쉬는 초(쏠 틈).
  // 꼬리 = 뒤 부채꼴(검기와 같은 판정), 날개 = 그쪽 반원 파도(퍼짐·두께·피해·무력화는 floor.wave).
  dragon: {
    hp: 6500, headAt: 2.0, mouthAt: 2.6, tailLen: 4,
    turn: { free: 90, busy: 45 }, lockBefore: 0.2,
    zone: { front: 50, back: 130 }, aimCone: 60, mouthGuard: 1.0,
    walk: { speed: [1.5, 2.0], from: 11 }, near: 5, far: 11, turnMax: 1.0, zoneRepeat: 2, recover: 0.6,
    tail: { warn: 0.45, R: 5.5, halfDeg: 70, dmg: 18, stagger: [12, 20], active: 0.1 },
    wing: { warn: 0.4, halfDeg: 90 },
    // 고르기: 여는 순서(화염구 부채 → 불 창 → 흰 활공 → 덮치기 + 발톱 A), 2단계 새 패턴, 쓰는 패턴(7 = 날개 탄 벽, 나머지는 머리), 가까운 앞에서 포효 몫
    brain: { opening: [{ pattern: 1 }, { pattern: 3 }, { slam: 'white' }, { approach: 'A' }], intro2: [6, 7], patterns: [1, 2, 3, 4, 6, 7, 8], nearWave: 0.5 },
  },
  // 탄막 패턴 시작값(§5.2 — 빌더가 다듬는다). muzzle = 보스 가운데에서 탄이 나오는 거리.
  patterns: {
    muzzle: 1.2,
    1: { volleys: [0, 0.3, 0.6], n: 7, nSparse: 3, spreadDeg: 60, speed: 11.5 },                        // 조준 부채, 가운데 흰(사이 10° — 걸어서 빠질 틈)
    2: { rings: [0, 0.4, 0.8, 1.2], n: 32, nSparse: 16, gapSlots: 5, gapSparse: 2, twistDeg: 4.1, speed: 10, whites: [2, 3], whitesSparse: [1, 1] },   // 고리, 마지막 고리 금 1
    3: { at: [0, 0.35, 0.7], atSparse: [0], speed: 18 },                                          // 빨간 창(조준 차선)
    4: { speed: 4, r: 0.5, burstDist: 7, minTravel: 0.25, burstAt: 1.5, n: 14, nSparse: 7, whites: 2, whitesSparse: 1, fragSpeed: 11, maxSec: 2.5 },   // 쪼개지는 구슬
    5: { dur: 3.2, every: 0.09, everySparse: 0.18, arms: 3, stepDeg: 8, whiteEvery: 6, speed: 10 },     // 나선
    6: { dur: 1.2, every: 0.07, everySparse: 0.14, speed: 18 },                                        // 연발, 끝 금(조준 차선)
    7: { spacing: 0.65, spacingSparse: 1.3, speed: 9, gap: 1.6, nearGap: 1.5, farGap: [5, 7], plugWhites: 3, reds: 3, redLen: 3, maxSec: 4 },   // 탄 벽
  },
  bullets: {
    cap: 600,              // 동시에 판에 있는 적 탄 상한(두 겹 탄막 몫)
    // 적 탄 속도(사용자 2026-11-16 "너무 빨라 보고 판단하고 피하기가 빡셈"): 보라·빨강 탄은 패턴 속도 × speedMul, 흰·금은 한 속도 parrySpeed(= 예전 14 × speedMul)
    speedMul: 0.75,
    parrySpeed: 10.5,      // 흰·금 탄은 모두 이 속도(§4.4)
    minParrySpawn: 0.8 + 0.4 * 10.5,   // = parryR + parryLead × parrySpeed(5.0 U) — 이 안에서 생기는 흰·금 탄은 잠깐 멈췄다 출발(0.4초 규칙)
    parryLead: 0.4,        // 흰·금 탄이 생겨서 패링 원에 닿기까지 최소 시간
    r: [0.2, 0.25, 0.3, 0.6, 0.25],   // 판정 반지름, K 순(보통·흰·금·빨강·되튐)
    dmg: [10, 12, 18, 22, 0],
    reflectSpeed: 24,
  },
};
