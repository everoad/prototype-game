// 보이기 수치 한곳(설계서 §6·§7 · 색 규칙 §4.4). 순수 데이터 — three·DOM을 가져오지 않는다(봇·시험이 읽는다).
// 다른 파일은 값을 복사해 두지 말고 쓸 때마다 LOOK.x로 읽는다(수치 패널 F2가 바로 먹게).
export const LOOK = {
  colors: {
    bg: '#14131a', board: '#24222c', grid: '#2e2b38', rail: '#3d394a', railTop: '#57516a',
    // 색 규칙: 자주 = 보통, 흰 = 패링, 금 = 마무리, 빨강 = 회피만, 청록 = 플레이어(적에게 청록 금지, 흰색은 패링할 것에만)
    normal: '#a14fe0', normalCore: '#d9a8ff', white: '#ffffff', gold: '#ffc23d', goldRim: '#fff1b8', red: '#ff3d47', cyan: '#3ef0e6',
    player: '#38d9d0', playerDark: '#0b3f45', hitCore: '#9ffcf6', hitRim: '#062a2e',
    boss: '#3b2450', bossDark: '#24142f', bossEye: '#ff7a3c', bossCrack: '#3ef0e6',
    shadow: '#000000', text: '#e8e6ef', textDim: '#9a96a8',
    hp: '#ff4d6a', hpTrail: '#ffc1cb', stagger: '#3ef0e6', hpBack: '#2b2733', playerHp: '#38d9d0', pip: '#38d9d0', pipEmpty: '#3a3644',
    windup: { white: '#ffffff', gold: '#ffc23d', red: '#ff3d47', purple: '#a14fe0' },
    // 패링할 수 없는 것의 밝은 쪽(흰·금 금지): 구슬 쏠 때 번쩍 = 옅은 자주, 레이저 속·끝 = 옅은 빨강
    orbFlash: '#d9a8ff', beamCore: '#ffb3b8', beamTip: '#ff8a91',
  },
  sizes: {
    bulletVisual: 1.4,     // 화면 크기 = 판정 반지름 × 이것
    bulletMinPx: 5,        // 가장 민 줌에서도 이 픽셀보다 작게 그리지 않는다(반지름)
    bh: 0.35,              // 탄 높이(바닥에서) — 판정 점·패링 고리도 같은 높이(§3)
    ringAlpha: 0.25,       // 패링 고리 평소 밝기
    ringWidth: 0.05,
    shotAlpha: 0.45,       // 플레이어 탄(반투명·가늘게, 적 탄보다 아래)
    shotLen: 0.9, shotWidth: 0.07,
    hitRingWhite: false,   // 판정 점 테두리 흰색 변형(영상 비교용)
    playerR: 0.42, playerH: 0.75,
    bossR: 1.6, bossH: 1.6,
    shadowAlpha: 0.35,
    laneAlpha: [0.28, 0.6],  // 차선: 따라오는 동안 / 고정 뒤
    areaFill: 0.32, areaEdge: 0.75,
    // 원거리 재설계: 파도 고리 띠(띠·앞면 밝기, 앞면 두께), 레이저(빔 속 흰 줄 너비·빔 밝기·쓸 쪽 부채 밝기), 쌍둥이 구슬
    waveAlpha: [0.3, 0.95], waveFront: 0.18, waveGap: 1.4, waveTele: 0.4,   // waveGap: 받아낸 자리 끊긴 고리 반쪽 길이(U), waveTele: 파도 예고 고리 두께
    beamCore: 0.35, beamAlpha: 0.9, sweepAlpha: 0.12, beamTip: 0.32,
    orbR: 0.42, orbFlashSec: 0.12,
  },
  // 그리는 순서(아래 → 위, §7): 적 탄은 깊이와 상관없이 몸 위에
  draw: { order: { floor: 0, floorFx: 1, telegraph: 2, shadow: 3, shots: 4, actors: 5, bullets: 6, reflect: 7, fx: 8, marker: 9 } },
  body: {
    leanDeg: 12,           // 가는 쪽으로 기울기
    stopBounce: 0.12, stopBounceSec: 0.12,
    windupLeanDeg: 16, windupSquash: 0.12, flashSec: 0.22,
    dashStretch: 0.35, groggySquash: 0.35,
    slamStretch: 0.5, hopTiltDeg: 14,   // 박치기 동안 앞으로 늘어남, 옆으로 뛸 때 뛰는 쪽으로 기울기
  },
  // 둘 다 담는, 가만히 있는 카메라(§3). yaw −45° = 시작 자리에서 플레이어 왼쪽 아래·보스 오른쪽 위.
  camera: {
    yawDeg: -45, pitches: [45, 60], width: 30,
    minW: 22, maxW: 34, playerShare: 0.6, playerMargin: 3, bossMargin: 2, laneMargin: 1,
    posRate: 8, zoomOutRate: 6, zoomInRate: 2,
    deadPos: 1.0, deadW: 1.5, zoomInHold: 1.0,   // 비집는 동안 가만히: 작은 차이 무시, 당기기는 1초 머문 뒤
    edgeMargin: 2, shakeVerticalRatio: 0.4,
  },
  // 손맛(§6) — proto-game 값에서 시작. 정지·느려짐은 게임 시간, 흔들림·확대·섬광은 실제 시간.
  feel: {
    on: { stop: true, slow: true, shake: true, punch: true, edge: true, sparks: true, numbers: true, afterimage: true },
    budget: { window: 1.0, max: 0.15 },                 // 화면 전체 정지: 1초에 합쳐 0.15초까지(override 제외)
    parryPress: { bright: 0.12, fade: 0.25 },           // 누른 순간 고리: 앞 0.12초 가장 밝게(완벽 창)
    parryBullet: { shakePx: 8, shakeSec: 0.12, chainCent: 200, chainMax: 1200 },   // 탄 패링: 전체 정지 없음
    perfectBullet: { stop: 0.05, slow: 0.35, slowSec: 0.12, gap: 0.6, punch: 0.025, punchSec: 0.18, aberrPx: 6, aberrSec: 0.25, hush: 0.05, duckDb: -24, duckSec: 0.2 },
    parryMelee: { stop: 0.06, stopPerfect: 0.09, shakePx: 8, shakeSec: 0.14 },
    reflectHit: { flinch: 0.15, shakePerfect: 6, shakeSec: 0.1, numberSize: 26 },
    graze: { cent: 100, chainSec: 1.0, chainMax: 1200 },
    hitTiers: { window: 1 / 12 },                       // 1/12초 동안 맞은 알갱이 수 → 1~2 / 3~4 / 5
    hurt: { stop: 0.06, shakePx: 14, shakeSec: 0.25, edgeSec: 0.35, markSec: 0.3 },
    counter: { slow: 0.35, slowSec: 1.0, edgeSec: 1.0 },
    fullCounter: { stop: 0.1, edgeSec: 0.4, kickPx: 18, shakePx: 10, shakeSec: 0.2 },
    groggy: { stop: 0.25, punch: 0.06, punchSec: 0.4, shakePx: 12, shakeSec: 0.3 },
    death: { stop: 0.3, slow: 0.35, slowSec: 1.0, shakePx: 16, shakeSec: 0.5 },
    rush: { kickPx: 16, kickSec: 0.18, arriveShake: 10, arriveSec: 0.18 },
    slam: { shakePx: 10, shakeSec: 0.2 },
    // 원거리 재설계: 박치기 받아냄(근접 패링 위에 크게 튕김) · 난간 쿵 · 파도 시작 · 레이저 발사 떨림
    slamParry: { jolt: 0.5, shakePx: 12, shakeSec: 0.2 },
    slamWall: { shakePx: 12, shakeSec: 0.22, dust: 1.8, dustLine: 5, dustLineSize: 0.9 },   // dustLine: 지나간 길 먼지 수
    wave: { shakePx: 6, shakeSec: 0.15, dust: 1.4 },
    laser: { shakePx: 4, shakeSec: 0.8 },
    phase: { shakePx: 12, shakeSec: 0.5 },
    afterimage: { count: 3, fade: 0.22, alpha: 0.35, alphaNear: 0.6 },
  },
  // 소리 음량 한 표(dB). 사격음이 가장 작다 — 2분 내내 초당 12번 난다(§4.3).
  sound: {
    db: {
      shot: -36, hit1: -24, hit2: -20, hit3: -16, swish: -16, tick: -22, clang: -8, clangPerfect: -6, parryFail: -18,
      thump: -10, graze: -22, ping: -16, pingGold: -14, whoosh: -16, whooshNear: -14, hurt: -10, charge: -18,
      rushCharge: -14, rushArrive: -10, swing: -16, slam: -10, counterChance: -12, fullCounter: -10, execute: -8,
      groggy: -10, wake: -18, roar: -10, death: -8, clear: -20,
      laserCharge: -16, laserBeam: -15, slamWall: -8, orb: -30,
    },
  },
};
