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
    board2: '#2b2030', grid2: '#47304c', railTop2: '#8c4a6e',   // 2단계의 판(자줏빛으로 물든다)
    heal: '#8dffc0',   // 회복(모아 던지기 §4.11) — 옅은 초록(아이템 연두·플레이어 청록과 다르게)
    item: '#a6ff4d',   // 아이템(방패·폭탄 사용권, §4.9) — 아직 아무 뜻이 없던 연두(청록 플레이어와 멀게)
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
    execRing: 0.35, execRingAlpha: [0.25, 0.9], letterbox: 0.11,   // 처형 금빛 고리(보스 몸 + 이만큼, 그로기 / 곁일 때 밝기), 검은 띠 높이(화면 높이 몫)
    weaponAlpha: 0.5, weaponBeamAlpha: 0.45, weaponBeamWidth: 0.18, weaponBeamGlow: 3.5, skillBeamWidth: 3, frenzyDroneR: 0.26,   // 굵은 빔·드론 연사(스킬)
    missileLen: 0.45, missileTail: 0.7, droneR: 0.16,   // 보조 무기(§4.10): 청록, 옅게(빔 빛 = 속 너비 × glow, 미사일 꼬리)
    storeOrbR: 0.12, storeOrbY: 0.95, storeSpin: 2.6, storeArrive: 0.16, storeArcWidth: 0.08, storeArcGapDeg: 14, thrownScale: 1.3,   // 모아 던지기(§4.11): 모인 구슬(크기·높이·도는 빠르기·빨려 드는 시간), 고리 칸(굵기·틈), 던진 탄 크기
    shieldAlpha: 0.22, shieldEdge: 0.6, itemR: 0.42, itemBlink: 3, itemGlow: 0.35,   // 방패 원판(탄 높이)·테 밝기, 아이템 크기, 사라지기 전 깜빡이는 초, 바닥 빛 밝기
  },
  names: { ranged: '수호자', dragon: '용' },   // 시작 장면에 뜨는 보스 이름
  // 그리는 순서(아래 → 위, §7): 적 탄은 깊이와 상관없이 몸 위에
  draw: { order: { floor: 0, floorFx: 1, telegraph: 2, shadow: 3, shots: 4, actors: 5, bullets: 6, reflect: 7, fx: 8, marker: 9 } },
  body: {
    leanDeg: 12,           // 가는 쪽으로 기울기
    stopBounce: 0.12, stopBounceSec: 0.12,
    windupLeanDeg: 16, windupSquash: 0.12, flashSec: 0.22,
    dashStretch: 0.35, groggySquash: 0.35,
    slamStretch: 0.5, hopTiltDeg: 14,   // 박치기 동안 앞으로 늘어남, 옆으로 뛸 때 뛰는 쪽으로 기울기
  },
  // 상자 용(설계 용 §7): 크기 [x 앞뒤, y 높이, z 옆] U, 각은 라디안. follow = 자세를 따라가는 빠르기(화면마다), swingFollow = 꼬리 휘두를 때.
  // 날개: 접음 wingFold(위로 세워 접고 옆 길이 wingFoldSpan) → 펼침 wingUp, 내리침 wingDown. 꼬리: 감기 tailCurl·휘두르기 tailSwing(마디마다).
  dragon: {
    torso: [3.0, 1.1, 1.9], torsoY: 1.05,
    neckAt: [1.25, 1.25], neck: [0.7, 0.45, 0.5], neckPitch: 0.35, lift: 0.6,   // 입 끝 ≈ 앞 2.7 U(sim 입 2.6 — 탄이 입에서 나와 보이게)
    head: [0.8, 0.55, 0.65], jaw: [0.7, 0.16, 0.55], jawOpen: 0.75, mouthGlow: 0.22,
    wingAt: [0.25, 1.55, 0.8], wing: [1.7, 0.06, 2.5], wingFold: 1.2, wingFoldSpan: 0.55, wingUp: 1.55, wingDown: -0.4,
    tailAt: [-1.45, 0.95], tailSegs: 4, tailSeg: [1.0, 0.45, 0.45], tailTaper: 0.78, tailCurl: 0.32, tailSwing: 0.45,
    legX: 0.9, legZ: 0.75, leg: [0.4, 0.95, 0.4], walkRate: 2.4, walkSwing: 0.45, pawLift: 0.9,
    crouch: 0.35, down: 0.5, follow: 0.3, swingFollow: 0.6,
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
    // 보스 죽음(승리): 정지·느려짐 + 카메라 당김 유지·금빛 가장자리, chunks초마다 파편이 터지고 finalAfter초 뒤 마지막으로 크게
    death: { stop: 0.3, slow: 0.35, slowSec: 1.0, shakePx: 16, shakeSec: 0.5, hold: 0.12, holdSec: 2.2, edgeSec: 1.2, chunks: [0.25, 0.5, 0.8], chunkBurst: 2, chunkShake: 6, finalAfter: 0.25, finalBurst: 4.5, finalShake: 20 },
    playerDeath: { stop: 0.12, slow: 0.3, slowSec: 0.8, shakePx: 14, shakeSec: 0.4, burst: 3, edgeSec: 1.0 },   // 패배: 느려짐·청록 파편·붉은 가장자리
    result: { winDelay: 1.6, loseDelay: 1.0, fade: 0.3, gray: 0.85 },   // 결과 화면이 뜨기까지·서서히 뜨는 시간, 패배 때 화면 색 빠짐
    lowHp: { at: 0.25, beat: 0.85, edgeLo: 0.1, edgeHi: 0.34 },   // 체력 위태: 최대 체력 몫, 심장 간격, 붉은 가장자리 밝기(낮음~높음)
    overdrive: { blink: 0.5, shotScale: 1.7, glow: 0.7 },
    // 탄 발사 박자: 보라·빨강 탄이 나올 때 한 묶음에 한 번(gap초 안은 건너뜀) 낮은 소리 + 발사 자리 불꽃 + 보스 몸이 살짝 튐(kick)
    volley: { gap: 0.08, srcCent: 120, redCent: -400, spark: 0.9, kick: 0.04, kickSec: 0.09 },
    bossChunks: { at: [0.75, 0.25], burst: 2.4, dust: 1.6, shakePx: 10, shakeSec: 0.2, jolt: 0.3 },   // 보스 체력이 이 몫을 지날 때 파편(50%는 2단계 넘어감이 맡는다)
    aura: { every: 0.14, glow: 0.6 },   // 무기 가동(패링 뒤): 몸에서 청록 알갱이가 오르는 간격, 몸 빛
    intro: { sec: 1.1, hold: 0.22 },    // 시작 장면: 길이, 카메라 당김   // 반격 기회(과열): 끝나기 blink초 전부터 깜빡, 탄 굵기, 몸 빛
    rush: { kickPx: 16, kickSec: 0.18, arriveShake: 10, arriveSec: 0.18 },
    slam: { shakePx: 10, shakeSec: 0.2 },
    // 원거리 재설계: 박치기 받아냄(근접 패링 위에 크게 튕김) · 난간 쿵 · 파도 시작 · 레이저 발사 떨림
    slamParry: { jolt: 0.5, shakePx: 12, shakeSec: 0.2 },
    slamWall: { shakePx: 12, shakeSec: 0.22, dust: 1.8, dustLine: 5, dustLineSize: 0.9 },   // dustLine: 지나간 길 먼지 수
    wave: { shakePx: 6, shakeSec: 0.15, dust: 1.4 },
    laser: { shakePx: 4, shakeSec: 0.8 },
    phase: { shakePx: 14, shakeSec: 0.5, stop: 0.12, punch: 0.05, punchSec: 0.4, burst: 4, edgeSec: 0.9, bannerSec: 1.4 },   // 2단계 넘어감: 정지·당김·자주 파편·가장자리·큰 글자
    afterimage: { count: 3, fade: 0.22, alpha: 0.35, alphaNear: 0.6 },
    weaponSkill: { shakePx: 8, shakeSec: 0.25 },   // 무기 스킬(§4.10)
    // 모아 던지기(§4.11): 모일 때 한 칸마다 storeCent 음 올림 · 던지는 순간(정지·흔들림·당김·청록 파편·회복 숫자·초록 가장자리) ·
    // 명중마다 hitCent 음 올림·파편 · 마지막 한 발(정지·큰 흔들림·합계 숫자)
    store: {
      storeCent: 150, stop: 0.05, shakePx: 10, shakeSec: 0.2, punch: 0.03, punchSec: 0.2, burst: 1.3, healNumber: 28, healEdgeSec: 0.45, healRise: 14,
      hitCent: 200, hitBurst: 1.3, hitJolt: 0.2, lastStop: 0.08, lastShake: 18, lastShakeSec: 0.3, lastBurst: 2.6, number: 40,
    },
    // 폭탄(§4.9): 짧은 정지(예산 안)·크게 흔들림·당김·청록 파편. 구제면 청록 가장자리 더
    bomb: { stop: 0.06, shakePx: 16, shakeSec: 0.35, punch: 0.04, punchSec: 0.3, burst: 3, rescueEdge: 0.5 },
    // 그로기 처형(§5.8) — 영화처럼: 검은 띠·카메라 당김 유지·정적 → 붙어 쏘기(한 발마다 shotCent 음 올림) → 큰 한 발(정지·느려짐·금빛 가장자리).
    execute: {
      // holdSec = 안전 한도일 뿐 — 당김은 처형이 끝날 때(executeEnd → release) 풀린다(사용자 2026-11-16)
      hold: 0.14, holdSec: 4, duckDb: -30, duckSec: 0.22, stop: 0.12, shakePx: 24, shakeSec: 0.45, slow: 0.3, slowSec: 0.5, edgeSec: 0.6, burst: 3, number: 44,
      shotCent: 300, shotShake: 6, shotShakeSec: 0.08,
    },
  },
  // 소리 음량 한 표(dB). 사격음이 가장 작다 — 2분 내내 초당 12번 난다(§4.3).
  sound: {
    db: {
      shot: -36, hit1: -24, hit2: -20, hit3: -16, swish: -16, tick: -22, clang: -8, clangPerfect: -6, parryFail: -18,
      thump: -10, graze: -22, ping: -16, pingGold: -14, whoosh: -16, whooshNear: -14, hurt: -10, charge: -18,
      rushCharge: -14, rushArrive: -10, swing: -16, slam: -10, counterChance: -12, fullCounter: -10, execute: -8,
      groggy: -10, wake: -18, roar: -10, death: -8, clear: -20,
      laserCharge: -16, laserBeam: -15, slamWall: -8, orb: -30, execShot: -9,
      shield: -14, shieldBlock: -26, bomb: -6, pickup: -12, itemSpawn: -20,
      missile: -32, beam: -30, burst: -26, drone: -42,   // 보조 무기는 평타처럼 작게
      gearWake: -20, salvo: -12, bigBeam: -12, swarm: -16,   // 무기가 깨어남(패링), 무기 스킬
      heartbeat: -13, shatter: -9, puff: -25, puffBg: -33, gearSleep: -22,   // 탄 발사 박자(주 패턴·바탕), 무기가 꺼짐
         // 체력 위태, 보스가 부서짐
      store: -13, storeFull: -11, throw: -9, throwHit: -10, throwBoom: -5, heal: -11,   // 모아 던지기(§4.11)
    },
  },
};
