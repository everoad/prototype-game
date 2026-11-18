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
  src: { laser: 8, orbs: 9, combo: 10, slam: 11, wave: 12, sword: 13, background: 14, tail: 15, wing: 16, shooter: 17, charger: 18, mortar: 19, shieldMob: 20, bomber: 22, tide: 23, waller: 24, spinner: 25 },
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
  // 반격 기회(§4.6): 금 패링에만. redDodge = 빨강을 구르기로 통과했을 때도 주는가 — 사용자 2026-11-17 "너무 과하다, 그냥 회피 성공으로" → 끔
  counter: { overdrive: 2.85 /* 느려짐 1초(×0.35) + 2.5초, sim 시간 */, overdriveMul: 2, bossStun: 1.5, redDodge: false },
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
  // 무기의 특징(한 판의 뼈대 설계 §7 — always가 켜진 판에서만): 산탄 fall = 날아간 거리 near까지 mul[0]배, far부터 mul[1]배(그 사이는 곧게) — 붙을수록 세다.
  //   빔 = 몸에서 겨눈 적 쪽으로 len만큼 뻗은 줄(굵기 width) 위의 적을 모두 지난다. 드론 = 내가 겨누지 않은 적 가운데 가장 가까운 적을 쏜다. 미사일 = 그대로(기준).
  //   two = 무기를 둘 넘게 들면 각 무기 피해 = two / 낀 수(둘이면 0.65 — 둘째 무기는 힘이 아니라 덮는 상황을 늘린다).
  weapons: {
    missile: { every: 1.5, first: 0, n: 3, spreadDeg: 60, speed: 11, turn: 5, life: 3, dmg: 16 / 3 },   // 2발×8 → 3발×5.3
    burst: { n: 10, spreadDeg: 44, speed: 24, range: 16, dmg: 3, fall: { near: 2.5, far: 6, mul: [2.5, 0.3] } },   // 6발×5 → 10발×3
    beam: { every: 3, dur: 0.35, dps: 80, len: 16, width: 0.6 },
    two: 1.3,
    drone: { every: 0.2, first: 0, offset: 1.3, spin: 1.5, speed: 22, range: 16, dmg: 0.2 * 2 / 0.35 },   // 0.35초 2 → 0.2초 1.14
    // 패링과 엮기(사용자 "1번"): 공격 무기는 패링 뒤 sec초(완벽 perfectSec초) 동안만 가동. 패링이 스킬 게이지를 채운다(+1, 완벽 +2).
    charge: { sec: 3, perfectSec: 4.5 },
    skill: { max: 6, cost: 3, missile: { n: 12, spreadDeg: 160 }, beam: { dur: 1.5, dps: 160 }, drone: { dur: 4, every: 0.05 } },
    // 탄을 쓸 때의 한 방(한 판의 뼈대 설계 §7, always 판에서만): 던지기·저격·지뢰로 모은 탄을 쓰면 낀 무기가 모두 낸다. 값은 칸마다 — 쓴 칸 수를 곱한다.
    //   미사일 = 유도 미사일 n발(한 칸 50), 산탄 = 큰 부채 n발(붙으면 한 칸 100 — fall로 멀면 거의 0), 빔 = dur초 굵은 빔(줄 위의 적마다 한 칸 80), 드론 = dur초 동안 every초마다 한 발(한 칸 50).
    //   던진 탄처럼 방패·보호를 지난다. 피해 기록은 salvo(던진 탄의 바탕과 갈라 잰다). 무기가 여럿이면 two 몫을 나눠 갖는다.
    salvo: { missile: { n: 4, spreadDeg: 140, dmg: 12.5 }, burst: { n: 16, spreadDeg: 70, dmg: 6.25, fall: { near: 2.5, far: 6, mul: [1, 0.05] } }, beam: { dur: 0.25, dps: 320, width: 1.4 }, drone: { dur: 0.8, every: 0.04, dmg: 2.5 } },
  },
  // 등급(한 판의 뼈대 설계 §5 — 결과 화면): 스테이지마다 [등급, { sec 걸린 시간, hits 맞은 횟수, retries 다시 한 횟수 }] — 위에서부터 세 조건(≤)을 모두 채우는 첫 등급, 없으면 C.
  // 문턱은 봇(user) 기준 판 10판의 가운데 값이 B가 되게 잡는다. S는 다시 하기가 없어야 한다(어렵게 시작).
  grade: {
    1: [['S', { sec: 200, hits: 12, retries: 0 }], ['A', { sec: 225, hits: 26, retries: 1 }], ['B', { sec: 255, hits: 48, retries: 2 }]],
    2: [['S', { sec: 220, hits: 14, retries: 0 }], ['A', { sec: 250, hits: 30, retries: 1 }], ['B', { sec: 290, hits: 50, retries: 3 }]],
  },
  // 카드와 칸(한 판의 뼈대 설계 §6): slots = 갈래별 칸 수(몸은 제한 없음), supplyBelow = 체력이 이 몫 아래면 보급이 회복으로 뜬다, capPlus·chargePlus = 몸 카드가 늘리는 탄 칸·회피 충전.
  cards: { slots: { weapon: 2, orb: 1, move: 2 }, supplyBelow: 0.8, capPlus: 1, chargePlus: 1 },
  // 일반 몬스터(스테이지 설계 §4·§9) — 하나에 규칙 하나. 거리는 U, 시간은 초, 각도는 도.
  // appear = 등장 예고(자리 표시만, 겨누지도 맞지도 않음), bombShare = 폭탄이 몬스터에게 주는 피해(최대 체력 몫).
  // 사수: keep 거리를 지키며 every초마다 준비 warn초 뒤 세 발(가운데 흰, 양옆 보라). 돌격병: band 거리에서 줄을 깔고(warn, lockBefore 전 고정) dash로 len만큼,
  //   패링당하면 최대 체력의 parryShare를 잃는다. 포격병: every초마다 원 n개(둘째부터 gap초 뒤, 플레이어가 가는 쪽 lead초 앞) — 마지막 원만 흰색이고 그 안에서 받아치면 포탄이 되돌아가 포격병이 최대 체력의 parryShare를 잃는다(사용자 2026-11-17 "패링은 안 되는데 튼튼하고 … 늘어진다"). 방패병: 앞 ±arcDeg의 방패, 초당 turn도만 돈다, reach 안이면 흰 휘두르기.
  // 실험 기믹(?try= — tries.js): 갈고리 이동 · 엄폐 기둥 · 불 장판 · 돌진 베기 · 꿰뚫는 던지기. 기본 판에는 쓰이지 않는다.
  tries: {
    rope: { anchors: [[-7.5, -4.5], [7.5, -4.5], [-7.5, 4.5], [7.5, 4.5], [0, -5.5], [0, 5.5]], range: 13, minDist: 2.5, speed: 26, stopAt: 1.0, cooldown: 1.2, cone: 0.3 },
    pillars: { at: [[-3.5, -3], [3.5, 3], [-3.5, 3], [3.5, -3]], r: 0.9, hp: 45 },
    dash: { dmg: 110 },
    lance: { mul: 0.85 },
    mine: { max: 3, R: 2.0, mul: 1.5, arm: 0.4, touch: 0.3 },
    orbit: { R: 1.8, dps: 60, tick: 0.2 },
    swap: { cooldown: 5, invuln: 0.3 },
    graze: { per: 4 },
    bubble: { first: 12, every: 16, sec: 9, hits: 3 },
    tide: { first: 8, every: 11, warn: 1.6, dmg: 22, linger: 0.15 },
    vary: { shooter: { wideN: 5, wideDeg: 64, streamN: 3, streamGap: 0.14 }, charger: { warn2: 0.35 }, mortar: { lineN: 4, lineStep: 2.2, lineGap: 0.15 } },
    snipe: { min: 1, mul: 1.5, hold: 0.6, slow: 0.3, width: 0.8, len: 30, ahead: 3, pickDeg: 45 },
    always: { over: 2, burstEvery: 1.2, start: 'missile', shot: 1.3, mul: 2, crowd: 2, bossHp: 1.4, mobHp: 1.2, throwMul: 0.7 },
  },
  // 스테이지(스테이지 설계 §3·§5·§9): 방 = 묶음 목록, 묶음 = [종류, 수] 목록. 둘째 묶음은 남은 몬스터가 nextWaveAt 이하일 때
  // pickHold = 고르는 자리 위에 이만큼 서 있어야 주워진다(지나가기만 해서는 안 주워진다 — 판 가운데의 보급이 저절로 주워지던 것을 막는다).
  stage: {
    nextWaveAt: 1, pickR: 1.0, pickHold: 0.35, heal: 30, chargeMax: 3, bossHp: 1, bossGrace: 1, rewardDelay: 0.7, minSpawn: 5, spawnGap: 2,
    door: { halfZ: 1.5, reach: 0.2 },
    rewardAt: [[0, -3.2], [0, 0], [0, 3.2]],
    spots: [[1, -5], [1, 0], [1, 5], [4, -3], [4, 3], [6, -5.5], [6, 0], [6, 5.5], [8.5, -2.5], [8.5, 2.5], [-2, -5.5], [-2, 5.5], [-8.5, -5.5], [-8.5, 5.5]],
    // 방패병은 방에서 뺐다(사용자 2026-11-17 "패링할 거리도 없는데 튼튼하기만 해서 늘어진다") — 규칙·그리기·시험은 남아 있고 어느 방에도 나오지 않는다.
    // 돌격병은 한 묶음에 1(기본 판은 몬스터 수가 2배라 화면에 둘) — 사용자 2026-11-17 "돌격하는 애 수를 줄여야겠어, 너무 많은 것 같아"(전에는 2 → 화면에 넷).
    // 방 = 묶음 목록(전투) | { waves, feature }(전투 + 방의 특징) | { survive, every, cap, pool }(버티기) | { elite, with, every, cap }(정예 + 졸개).
    // bossHp = 그 스테이지 보스의 체력 배율(보스 방 1분쯤·첫 시도 통과 4~6/10에 맞춘다).
    // 한 판의 뼈대 설계 §5: 방 넷 + 보스. 방 3이 특수 방, 방 4에 방의 특징(실험 틀의 기둥·밀물 — 그 방에서만 켜진다).
    // 정예 방: elite 종류 하나가 크게 나오고(mobs.elite 배율), 졸개 with는 처음 한 번 + every초마다 살아 있는 졸개가 cap 미만이면 한 번 더. 정예가 죽으면 끝.
    // 보호탑도 방에서 뺐다(사용자 2026-11-17 — 방패병과 같은 까닭: 받아칠 거리가 없고 튼튼하기만 하다). 규칙·그리기·시험은 남아 있다.
    list: {
      1: {
        rooms: [
          [[['shooter', 4]], [['shooter', 3]]],
          [[['charger', 1], ['shooter', 3]], [['waller', 1], ['charger', 1], ['shooter', 1]]],
          { survive: 40, every: 4.5, cap: 7, pool: [[['shooter', 2]], [['charger', 1], ['shooter', 1]], [['mortar', 1], ['shooter', 1]]] },
          { feature: 'pillars', waves: [[['mortar', 2], ['shooter', 2]], [['spinner', 1], ['mortar', 1], ['charger', 1]]] },
        ],
        boss: 'ranged', bossHp: 1,
      },
      2: {
        rooms: [
          [[['bomber', 3], ['shooter', 3]], [['bomber', 3], ['shooter', 2], ['charger', 1]]],
          [[['bomber', 2], ['shooter', 3], ['charger', 1]], [['mortar', 1], ['bomber', 2], ['waller', 1]]],
          { elite: 'charger', with: [['bomber', 1]], every: 7, cap: 2 },
          { feature: 'tide', waves: [[['waller', 1], ['bomber', 2], ['shooter', 2]], [['spinner', 1], ['bomber', 2], ['waller', 1]]] },
        ],
        boss: 'dragon', bossHp: 0.9,
      },
    },
  },
  mobs: {
    appear: 0.8, bombShare: 0.5, first: 1.2, linger: 0.1,
    // 정예(한 판의 뼈대 §5): 있는 종류 하나를 키운 것 — 몸 r배, 체력 hp배, 쉬는 시간 rest배, 받아쳤을 때 잃는 몫 parryShare(보통의 것 대신 — 두 번에 죽지 않게).
    //   체력의 몫으로 깎는 것은 정예에게 제 값을 따로 둔다: bombShare = 폭탄(여느 몬스터는 mobs.bombShare — 그대로면 폭탄 두 번에 죽는다), returnShare = 튕겨 보낸 자폭병의 폭발(220은 체력 30배에 티가 안 난다).
    elite: { r: 1.5, hp: 30, rest: 0.75, parryShare: 0.025, bombShare: 0.05, returnShare: 0.04 },
    shooter: { n: 3, hp: 340, r: 0.55, speed: 2.5, keep: [5, 8], every: 2.2, jitter: [0.85, 1.15], strafe: 0.4, warn: 0.35, spreadDeg: 28, bulletSpeed: 11 },
    charger: { hp: 480, r: 0.65, speed: 3, band: [4, 7], warn: 0.6, lockBefore: 0.2, width: 1.4, dash: 22, len: 9, dmg: 18, rest: 1.6, parryShare: 0.5, stagger: [12, 20], backoff: 0.6, slack: 0.5, bounce: 1.5 },
    mortar: { hp: 260, r: 0.7, every: 3, jitter: [0.9, 1.1], aim: 0.3, n: 2, gap: 0.3, R: 1.3, warn: 0.8, dmg: 20, lead: 0.5, parryShare: 0.5, stagger: [12, 20] },
    // 자폭병(붙으면 심지 뒤 터짐 — 몬스터도 다친다, 죽여도 chain초 뒤 터짐) · 보호탑(둘레 aura 안 몬스터는 평타·무기에 안 다침 — 방에서는 뺐다)
    // 자폭병의 심지 원은 흰색이다(사용자 2026-11-17 — 받아칠 거리): 터지는 순간 원 안에서 받아치면 터지지 않고 fly.speed로 가장 가까운 다른 적 쪽으로(없으면 내 반대쪽) 최대 fly.dist 날아가 터진다.
    //   그 폭발은 나를 다치게 하지 않고 몬스터만 mobDmg(완벽이면 × fly.perfectMul, 받아친 피해). stagger = 받아쳤을 때 모이는 탄의 무력화 값. 죽어서 터지는 연쇄는 빨강 그대로.
    bomber: { hp: 140, r: 0.5, speed: 4.6, trigger: 1.7, fuse: 0.6, R: 2.2, dmg: 22, mobDmg: 220, chain: 0.35, stagger: [12, 20], fly: { speed: 18, dist: 7, perfectMul: 1.5 } },
    totem: { hp: 520, r: 0.8, aura: 4.5 },
    // 움직임을 요구하는 몬스터(사용자 "가만히 서서 패링만 기다린다"). 둘 다 받아칠 흰 탄을 준다.
    // 장벽병: keep 거리를 지키며 every초마다 겨눈 쪽 arcDeg 부채에 촘촘한 탄 n발 — 겨눈 줄에서 gapAt도(왼·오른쪽 무작위) 비켜난 곳에 gap발 빈틈, 빈틈 양 끝이 흰 탄(흰 탄은 더 빨라 먼저 와서 빈틈 자리를 알린다).
    // 회전포: 제자리. 예고 warn초 뒤 on초 동안 팔 arms개가 초당 turnDeg도 돌며 shotEvery초마다 쏜다(burst발 쏘고 skip발 쉼, 묶음 안에서 whiteEvery발마다 흰 탄 — 줄기가 촘촘해 서 있으면 쓸린다). 처음 팔은 나보다 startDeg도 앞에서 돌기 시작한다. 그 뒤 rest초 쉰다.
    waller: { hp: 300, r: 0.65, speed: 2, keep: [6, 9], strafe: 0.3, every: 3.0, jitter: [0.9, 1.1], warn: 0.5, n: 23, arcDeg: 110, gap: 3, gapAt: [12, 28], bulletSpeed: 8 },
    spinner: { hp: 320, r: 0.75, warn: 0.6, on: 3.2, rest: 2.4, arms: 2, turnDeg: 55, shotEvery: 0.11, burst: 9, skip: 2, whiteEvery: 4, bulletSpeed: 9, startDeg: 40 },
    shield: { hp: 420, r: 0.7, speed: 2, turn: 70, arcDeg: 60, reach: 2.2, stopAt: 0.8, swingR: 2.4, swingHalfDeg: 55, warn: 0.5, dmg: 15, stagger: [12, 20], rest: 1.2 },
  },
  // 모아 던지기(§4.11, 변형 ?store=1): 받은 것을 cap개까지 모았다가 U로 한 번에. dmg·heal = [보통, 완벽], n개면 피해·무력화 × (1 + bonus × (n − 1)).
  // every = 던질 때 탄 사이 간격, orbitR = 모인 탄이 도는 반지름(패링 고리 0.8 안쪽), hard = &hard=1의 받는 피해 배율, bossHp = 이 변형의 보스 체력 배율.
  store: { cap: 4, dmg: [100, 150], heal: [2, 4], bonus: 0.1, every: 0.06, orbitR: 0.5, hard: 1.3, bossHp: 1.2 },
  // 검사(설계 2026-11-17-barrage-sword-design.md §6·§11, 주소 char=sword): 약한 사격 + 모은 칸을 쓰는 스킬 셋. 보스·몬스터 수치는 사수 판과 같다.
  // 시험판 2(사용자 2026-11-17 "탄이 느려지는 둘레고 기본공격에 게이지를 조금씩 채우게 해서 스킬을 자주 쓰게" — 사수보다 안쪽에 서게 한다):
  //   wave(칼바람 — 쌍검의 기본 공격, 사수의 자동 사격 대신. 사용자 "주무기는 쌍검만 하자") = every초마다 겨눈 적 쪽으로 반지름 r의 칼바람이 speed로 range만큼 날아가며 닿는 적을 한 번씩 벤다(피해 dmg). 좌우 칼이 번갈아 낸다.
  //     사거리가 서는 자리를 정한다(보스 가운데에서 boss.r + range + r까지 닿는다). 맞힌 칼바람마다 칸이 조금 찬다 — charge초 동안 계속 맞히면 한 칸(보통 칸). 가득이면 더 차지 않는다.
  //     빠르게 낸다(사용자 "검 기본 공격도 빠르게 — 지금은 너무 허전하다": 0.4초 → 0.12초). 한 번의 피해와 한 번에 차는 양은 그만큼 나눴다 — 초당 피해 30, 칸 하나에 charge초 그대로.
  //   field(둘레) = 내 가운데에서 R 안에 들어온 적 탄은 slow배로 느려진다(받아친 탄·던진 탄은 빼고) — 안쪽에 서도 읽을 시간이 난다.
  //     R은 3에서 4.5로 넓혔다: 3이면 봇이 1단계의 빨간 창을 사수의 두 배로 맞아 40판 중 13~21판만 이겼고, 4.5면 29~32판(사수 31판)이다.
  // mob = 몬스터에게 주는 베기 피해 배율(몬스터에는 무너짐·처형이 없어 그 몫을 피해로),
  // buffer = 스킬 누름을 기억하는 시간, groups = 검사 판에 뜨는 카드 갈래.
  // 스킬의 값 = 쓴 칸의 던지기 피해(store.dmg) × dmg, 그 칸의 무너짐 값 × stag. 회복은 칸마다 store.heal.
  // 봇으로 맞춘 값(2026-11-17): reach 6 → 9.5(6이면 그 거리에 선 봇이 탄을 못 피해 10판을 다 졌다) → 시험판 2에서 7(둘레가 안쪽을 버틸 만하게 한다), 피해 배율 2.0·1.8·1.2 → 2.8·2.6·1.7(수호자 약 1분).
  // slash(U 일섬): 겨눈 적의 몸 표면까지 reach 안이면 그 적을 지나 건너편(몸 사이 past)에 dur초에 선다 — 가는 동안과 선 뒤 after초 무적.
  // spin(I 회전 베기): 내 가운데에서 R 안에 몸 표면이 든 적 모두. 무적 없음. 뒤 lock초 동안 다음 스킬이 기다린다.
  // finish(O 마무리): 남은 칸 전부 — 겨눈 쪽 부채(R, 반각 halfDeg)를 칸마다의 값을 더해 한 번에 베고, back초에 backDist 물러난다(그동안과 선 뒤 after초 무적).
  sword: {
    mob: 1.0, buffer: 0.2, groups: ['move', 'body'],
    wave: { every: 0.12, range: 4.7, speed: 22, r: 0.9, dmg: 3.6, charge: 6 },
    field: { R: 4.5, slow: 0.5 },
    slash: { reach: 7, past: 1.0, dur: 0.14, after: 0.1, dmg: 2.8, stag: 1.3 },
    spin: { R: 2.8, lock: 0.25, dmg: 2.6, stag: 2.0 },
    finish: { R: 3.4, halfDeg: 70, dmg: 1.7, stag: 1.0, backDist: 4.5, back: 0.2, after: 0.1 },
    // swords = 이기어검(sim/swords.js — 설계 2026-11-17-barrage-flying-swords-design.md §8. 처음 값 — 봇으로 맞추기 전이다):
    // n = 묶음 하나의 자루 수(바탕 묶음은 늘 있다), max = 가장 많을 때, keep = 스킬 묶음이 남는 초,
    // beat = 검 하나가 찌르는 간격(초 — 닿는 적이 있는 동안 돌아오지 않고 계속), rest = 기둥·방패에 막혀 돌아온 검이 쉬는 초, hopR = 다음 적으로 건너가는 거리(끈도 이 거리다), fly = 등 뒤에서 첫 적까지 걸리는 초,
    // stab = 찌를 때의 피해, roundDeg = 건너갈 적이 없을 때 같은 적을 돌아가는 각(도), join = 스킬에 가진 검이 모두 나서나(0이면 새 다섯만),
    // slash·spin·finish = 그 스킬의 검 타격: 벤 뒤 first초부터 span초 안에 고르게, 검 한 번의 피해 dmg(마무리는 × 쓴 칸 수). finish.first는 튕김(finish.back 0.2초)이 끝나고 조금 뒤다 — 착지와 첫 검 사이가 화면이 느려지는 틈이다(view/gap.js).
    swords: { n: 5, max: 15, keep: 4, beat: 0.5, rest: 1.5, hopR: 5, fly: 0.14, stab: 2.6, roundDeg: 120, join: 1,
      slash: { first: 0.04, span: 0.12, dmg: 5.6 }, spin: { first: 0.03, span: 0.20, dmg: 6.4 }, finish: { first: 0.25, span: 0.34, dmg: 6 } },
    // forms = 스킬의 형태(설계 2026-11-18-barrage-run-growth-design.md §3 — 처음 값. 지금은 주소 slash=chain | deep으로 고른다, 카드는 나중이다):
    // slash.chain = 잇는 일섬(여럿에게): 한 칸으로 n번까지 — 선 뒤 window초 안에 U를 다시 누르면 칸 없이 한 번 더. 한 번의 세기 dmg배 · 무너짐 stag배 · 검의 타격 swords배(묶음은 첫 번에만 생긴다).
    // slash.deep = 깊은 일섬(하나에게): 한 칸에 한 번, 세기 dmg배 · 무너짐 stag배. 선 뒤 lock초 동안 다른 스킬이 기다린다(그동안의 누름은 기억했다가 풀리는 틱에 낸다).
    forms: { slash: { chain: { n: 3, window: 0.6, dmg: 0.4, stag: 0.4, swords: 0.4 }, deep: { dmg: 1.6, stag: 1.6, lock: 0.3 } } },
  },
  // on = 콤보를 다 받아내면 자동 반격을 하는가 — 사용자 2026-11-17 "빼자"(보스가 한동안 멈추는 것이 과하다) → 끔. 장치는 남겨 둔다.
  fullCounter: { on: false, dashIn: 0.15, volley: 0.35, back: 0.3, backDist: 5, steerDeg: 90, dmg: 120, stagger: 15, standOff: 2.6 },
  heal: { amount: 3 },   // ?heal=1 변형만(§4.7)
  // 순간 돌진(§5.3): 움츠림 → 0.2초 전 자리 고정 → 25 U/s, 몸 사이 1.0 U(가운데끼리 3.1)에서 멈춤. 피해 없음.
  rush: { crouch: 0.35, lockBefore: 0.2, speed: 25, gap: 1.0 },
  // 근접(§5.3): 종류마다 예고 하나로 고정. 내려찍기 원은 보스 앞 offset에 둔다(멈춘 거리 3.1의 플레이어에 닿게).
  // 빨간 장판은 (예고 − 0.2) × 이동 속도 ≥ 반지름 + 몸 반지름(가운데서도 걸어서 빠져나감).
  melee: {
    swing: { warn: 0.35, R: 3.6, halfDeg: 60, dmg: 15 },            // 빨라짐(§5.3)
    slam: { warn: 0.45, R: 1.4, offset: 2.0, dmg: 25 },             // (0.45 − 0.2) × 7.83 ≥ 1.4 + 0.5
    active: 0.1, recover: 0.15, gapAfter: 0.8, push: 0.4,
    clear: false,   // 근접전에 들어갈 때(돌진 도착·가까이서 바로 콤보) 판의 탄을 지우는가 — 사용자 2026-11-17 "빼자" → 끔
    stagger: { normal: 12, perfect: 20 },
  },
  // 빠르고 멀리 닿는 장판 공격(§5.3). 빨간 빠른 공격은 redWindow초 안에 redMax번까지(§5.6, 두뇌가 지킨다).
  floor: {
    slam: { warn: 0.5, lockBefore: 0.2, width: 3.2, speed: 30, dmg: 22, stun: 0, recoil: 0, stagger: 20, maxShove: 0.6 },   // maxShove: 한 틱에 플레이어를 이보다 멀리 밀어야 하면(구석) 거기서 멈춘다. stun = 흰 패링 때 보스 경직(사용자 2026-11-17: 과해서 0 — 그냥 패링 성공), recoil = 다음 공격까지 더 쉬는 초(0.4를 넣었다가 "여전히 스턴 느낌"이라 0)
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
  // sword = 검사 봇(확인용): keep = 보스전에서 지키는 거리(칼바람이 닿는 안쪽 — 보스 가운데에서 boss.r + wave.range + wave.r까지 닿는다), stay = 붙어서 칸이 남아 있을 때, room = 방에서 가장 가까운 적과 지키는 거리(칼바람이 닿게), enter·enterRoom = 이만큼 모이면 일섬으로 들어간다(보스전·방),
  //   exitSec = 빨간 몸 공격이 이 안에 닿으면 마무리, lowHp = 체력이 이 몫 아래면 칸을 써서 회복, margin = 회전 베기를 누르는 거리의 여유.
  bot: { sword: { keep: [6, 7], stay: [2.4, 3.8], room: [4.5, 5.8], enter: 3, enterRoom: 1, exitSec: 0.25, lowHp: 0.25, margin: 0.2 }, user: { react: 0.38, think: 0.2, chance: 0.9 }, shell: { pull: 6, inside: 0.75, ahead: 0.6 }, snipe: { ticks: 30, hpAbove: 0.75 }, room: { keep: [4, 6.5], keepBurst: [2, 3.4], stepOff: 3, stand: 0.6, pull: 3, healBelow: 0.6, ropeFar: 7, dashFrom: 4.2, mineFrom: 3.2, totem: [1.6, 3] }, zone: { chance: 0.5, from: 6, R: [3, 4.5], sec: [2, 4], pull: 1.0, keep: [9, 11] }, react: 0.2, sight: 10, look: 0.5, samples: 6, think: 3 / 120, parryLead: [0.03, 0.10], jitter: 0.04, jitterSome: 0.08, someRate: 0.5, keep: [8, 10], margin: 0.3, dodgeLead: 0.05, duel: [2.6, 4.2], execBand: [2.4, 3.6] },
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
