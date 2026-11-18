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
    mob: '#6b3e8e', mobShield: '#9d8fbd', door: '#9fd0ff',   // 일반 몬스터 몸(보스와 같은 어두운 자주, 조금 밝게)·방패 판·문
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
    // 보조 무기(§4.10)의 미사일·드론 크기는 guns로 옮겼다(평타·무기 연출)
    storeOrbR: 0.12, storeOrbY: 0.95, storeSpin: 2.6, storeArrive: 0.16, storeArcWidth: 0.08, storeArcGapDeg: 14, thrownScale: 1.3,   // 모아 던지기(§4.11): 모인 구슬(크기·높이·도는 빠르기·빨려 드는 시간), 고리 칸(굵기·틈), 던진 탄 크기
    shieldAlpha: 0.22, shieldEdge: 0.6, itemR: 0.42, itemBlink: 3, itemGlow: 0.35,   // 방패 원판(탄 높이)·테 밝기, 아이템 크기, 사라지기 전 깜빡이는 초, 바닥 빛 밝기
  },
  names: { ranged: '수호자', dragon: '용', reward: { missile: '미사일', burst: '산탄', beam: '빔', drone: '드론', shield: '방패 +1', bomb: '폭탄 +1', heal: '체력 회복' },
    // 카드(한 판의 뼈대 설계 §6·§7): 이름 · 한 줄 설명 · 갈래 이름 · 정예 배너에 쓰는 몬스터 이름
    card: { missile: '미사일', burst: '산탄', beam: '빔', drone: '드론', lance: '꿰뚫는 던지기', mine: '지뢰', orbit: '오라', sky: '갈고리', swap: '자리 바꾸기', dash: '돌진 베기', cap: '탄 칸 +1', charge: '회피 충전 +1', graze: '스침 모으기' },
    cardLine: { missile: '알아서 쫓아간다', burst: '붙을수록 세다', beam: '한 줄을 꿰뚫는다', drone: '내가 안 보는 적을 쏜다',
      lance: '던진 탄이 곧게 날며 길 위의 적을 모두 뚫는다', mine: '탄 하나를 발밑에 놓는다 — 적이 닿으면 둘레가 크게 다친다', orbit: '탄을 들고 있는 동안 가까운 적이 깎인다',
      sky: '가는 쪽 말뚝으로 날아간다(나는 동안 안 맞는다)', swap: '겨눈 몬스터와 자리를 바꾼다', dash: '회피로 적의 몸을 지나가면 피해',
      cap: '모을 수 있는 탄이 한 칸 늘어난다', charge: '회피 충전이 하나 늘어난다', graze: '탄을 스칠 때마다 조금씩 모여 몇 번에 한 칸' },
    group: { weapon: '무기', orb: '탄 기술', move: '이동기', body: '몸' },
    mob: { shooter: '사수', charger: '돌격병', mortar: '포격병', waller: '장벽병', spinner: '회전포', bomber: '자폭병' } },   // 시작 장면에 뜨는 보스 이름 · 보상 이름
  // 멈춤 화면의 안내(사용자 "알아보기 쉽게 표로 — 다른 사람한테 공유해서 할 만한가 확인해 보게"): 처음 보는 사람이 읽고 바로 할 수 있게.
  // 글은 여기, 판에 맞는 줄 고르기는 view/guide.js, 그리기는 hud.js. 크기: panelW 판의 너비, pad 안쪽 여백, rowH 표의 줄 높이, capH·capPad·capGap 키 모양,
  // keyGap 키와 글 사이, colGap 왼손·오른손 사이, lineH 하는 법 줄 높이, cardH 카드 줄 높이, dot 색 점의 반지름.
  guide: {
    panelW: 800, pad: 26, rowH: 30, capH: 22, capPad: 7, capGap: 4, keyGap: 10, colGap: 30, lineH: 23, cardH: 20, dot: 6,
    title: '조작 안내', titleSword: '조작 안내(검사)', resume: 'Esc를 다시 누르면 이어서 합니다',
    heads: { how: '하는 법', left: '왼손', right: '오른손', misc: '그 밖', colors: '색의 뜻', cards: '지금 낀 카드' },
    goal: { stage: '방 넷을 지나 보스를 잡는다. 방을 깰 때마다 카드 하나를 골라 강해진다.', boss: '보스의 체력을 다 깎으면 이긴다.' },
    how: [
      '쏘기는 자동이다. 할 일은 피하기와 받아치기.',
      '흰·금색 탄과 공격은 닿는 순간 J — 받아친 탄이 몸 둘레에 모인다.',
      '모은 탄은 U로 던진다: 큰 피해 + 체력 회복. 든 무기도 같이 크게 쏜다.',
      '빨강은 받아칠 수 없다 — Space로 구르거나 걸어서 피한다.',
    ],
    howSword: [
      '쌍검의 칼바람은 멀리 못 간다 — 닿는 거리에서 싸운다. 맞히는 동안 칸이 찬다.',
      '내 둘레에 들어온 탄은 느려진다. 흰·금색은 닿는 순간 J로 받아친다.',
      'U 일섬으로 뚫고 들어가 I 회전 베기로 몰아친다. 칸을 쓰면 체력도 찬다.',
      '떠 있는 검은 닿는 적을 알아서 벤다. 스킬이 맞을 때마다 다섯 자루가 늘고, 가진 검이 모두 따라 벤다.',
      '빨강은 받아칠 수 없다 — O 마무리나 Space로 빠진다.',
    ],
    howOld: [
      '쏘기는 자동이다. 할 일은 피하기와 받아치기.',
      '흰·금색 탄과 공격은 닿는 순간 J — 받아친 탄이 보스에게 되돌아간다.',
      '받아칠수록 게이지가 찬다. 세 칸이면 U·I·O로 무기 스킬을 쓴다.',
      '빨강은 받아칠 수 없다 — Space로 구르거나 걸어서 피한다.',
    ],
    colors: [['white', '흰·금 = 받아친다(J)'], ['red', '빨강 = 피한다(Space)'], ['normal', '보라 = 걸어서 비킨다'], ['cyan', '청록 = 내 것']],
    rows: {
      move: { keys: ['W', 'A', 'S', 'D'], text: '이동', alt: '방향키' },
      dodge: { keys: ['Space'], text: '회피(구르기) — 빨강도 지나간다', alt: '오른쪽 클릭' },
      shield: { keys: ['Q'], text: '방패 — 잠깐 보라 탄을 막는다' },
      bomb: { keys: ['E'], text: '폭탄 — 판의 탄을 지운다' },
      parry: { keys: ['J'], text: '패링 — 흰·금을 받아친다', alt: 'Shift · 왼쪽 클릭' },
      throw: { keys: ['U'], text: '던지기 — 모은 탄을 한 번에' },
      snipe: { keys: ['I'], text: '저격 — 누르고 있다가 떼면 쏜다' },
      orb: { keys: ['O'], text: '탄 기술 — 카드로 얻는다(지뢰)' },
      slash: { keys: ['U'], text: '일섬 — 1칸: 베며 건너편으로(무적)' },
      spinCut: { keys: ['I'], text: '회전 베기 — 1칸: 둘레를 벤다' },
      finish: { keys: ['O'], text: '마무리 — 남은 칸 전부: 베고 빠진다' },
      moves: { keys: ['K', 'L'], text: '이동기 — 카드로 얻는다' },
      skills: { keys: ['U', 'I', 'O'], text: '무기 스킬 — 패링 게이지 3칸' },
      pause: { keys: ['Esc'], text: '멈춤 · 이 안내' },
      restart: { keys: ['F4'], text: '처음부터' },
      retry: { keys: ['R'], text: '죽은 뒤 그 방부터' },
      view: { keys: ['V'], text: '시점 바꾸기' },
    },
  },
  // 검사(sim/sword.js — 설계 2026-11-17-barrage-sword-design.md §10): 또렷한 청록 선과 불꽃만. 퍼지는 고리는 쓰지 않는다.
  // y = 칼자국 선의 높이, blade = 몸에 단 칼(길이·굵기·두께·높이·앞으로 내민 거리·옆으로 비낀 거리), trail = 일섬이 지나간 길(남는 초·굵기·흐려지며 가늘어지는 몫),
  // sweep = 회전 베기의 칼자국(한 바퀴 도는 초·호의 길이(도)·굵기·다 돈 뒤 남는 초·호를 나눈 수), finish = 마무리의 칼자국(줄 수·길이·굵기·벌어짐(도)·남는 초·튕긴 길의 굵기),
  // mark = 내릴 자리 표시(크기·불투명도·바닥에서의 높이·맥동 [폭, 빠르기]), cut = 쌍검의 기본 베기(몸 앞 칼자국의 반지름·굵기·호의 길이(도)·긋는 동안 도는 각(도)·남는 초·불투명도 / 벤 자리 칼자국의 길이·굵기·남는 초·비낀 각(도) / 불티 크기 / 좌우 소리의 높이 차(센트)),
  // swing = 몸의 칼이 휘둘리는 모양(걸리는 초·시작 각·끝 각·쉬는 각 — 도, 바깥이 +),
  // wave = 칼바람(초승달: 펼친 각(도)·가운데 두께(반지름의 몫)·판의 반지름에 곱하는 크기·날아가며 커지는 몫·불투명도·사거리 끝에서 흐려지기 시작하는 몫·좌우로 엇갈려 비끼는 각(도)·밝은 속의 색과 크기·뒤따르는 잔상 [뒤로 물린 거리 U, 불투명도 몫]),
  // field = 탄이 느려지는 둘레의 원판(불투명도·높이), chargeAlpha = 차는 칸(HUD)의 불투명도, burst = 벤 자리의 불꽃 크기(스킬별), number·numberBig·healNumber = 숫자 크기(px — 마무리는 크게),
  // stop·finishStop = 벨 때의 짧은 멈춤(초), finishShake = [px, 초], punch = [당김, 초], jolt·joltBig = 보스가 움찔하는 세기, names = 스킬 이름(HUD).
  sword: {
    y: 0.5, blade: { len: 1.25, w: 0.09, h: 0.07, y: 0.62, out: 0.25, side: 0.34 },
    trail: { sec: 0.22, w: 0.16, thin: 0.6 }, sweep: { sec: 0.14, arcDeg: 150, w: 0.16, hold: 0.1, seg: 28 },
    finish: { n: 3, len: 3.6, w: 0.2, fanDeg: 50, sec: 0.28, backW: 0.1 },
    mark: { size: 0.3, alpha: 0.75, y: 0.03, pulse: [0.12, 7] },
    cut: { pop: 2.4, spray: { n: 4, speed: 10, coneDeg: 44, life: 0.14, size: 0.055 }, arcR: 1.7, arcW: 0.16, arcDeg: 70, sweepDeg: 110, arcSec: 0.11, arcAlpha: 0.95, markLen: 1.9, markW: 0.15, markSec: 0.16, markTiltDeg: 42, spark: 0.7, cent: 220 },
    swing: { sec: 0.11, from: 80, to: -25, rest: 30 },
    wave: { arcDeg: 130, thick: 0.34, size: 1.25, grow: 0.35, alpha: 0.9, fade: 0.35, tiltDeg: 38, core: '#9ff4ff', coreScale: 0.6, ghosts: [[0.5, 0.45], [1.0, 0.2]] }, field: { alpha: 0.06, y: 0.012 }, chargeAlpha: 0.6,
    burst: { slash: 1.0, spin: 0.8, finish: 1.6 }, number: 26, numberBig: 40, healNumber: 22,
    stop: 0.025, finishStop: 0.07, finishShake: [9, 0.18], punch: [0.04, 0.18], jolt: 0.2, joltBig: 0.5,
    names: { slash: '일섬', spin: '회전 베기', finish: '마무리' },
    // 스킬의 형태(sim/sword.js — 2026-11-18, 주소 slash=chain | deep): formNames = HUD에 뜨는 이름. forms.chain.cent = 이어질 때마다 소리가 오르는 폭(센트).
    // forms.deep = 깊은 일섬의 무게: cent 소리 높이(낮게) · flashW 지나갈 줄의 굵기 배율 · stop 벨 때의 멈춤(초) · shake [px, 초] · punch [당김, 초] · number 숫자 크기 · jolt 보스가 움찔하는 세기.
    formNames: { chain: '잇는 일섬', deep: '깊은 일섬' },
    forms: { chain: { cent: 220 }, deep: { cent: -400, flashW: 2.4, stop: 0.06, shake: [8, 0.16], punch: [0.07, 0.24], number: 36, jolt: 0.4 } },
    // gap = 틈(view/gap.js — 2026-11-18 사용자: "돌진한 뒤에 보스 패턴을 보고 피할지 연계를 할지 결정을 하는 순간이 필요하다"): 일섬으로 건너편에 서면 다음 키를 누를 때까지 판이 slow배로 흐른다(가장 길게 max초).
    // near = 몸 표면까지 이 거리 안에 살아 있는 적이 있을 때만 연다, labelY·labelPx = 내 머리 위 글자의 높이·크기, labels = 예고의 색에 따라 읽어 주는 말(없음 · 빨강 · 흰/금). 그동안 검의 밝기는 swords.quiet배.
    // gap.spin = 난무 앞의 느려짐(회전 베기 — 사용자: "난무 펼쳐지기 전에 좀 길게 슬로우"): 검 타격이 열리면 slow배로 흐르다가 첫 검이 베는 순간 풀린다(가장 길게 max초, 잇달아 쓸 때는 every초에 한 번). 검은 옅어지지 않는다.
    // gap.finish = 연사 앞의 느려짐(마무리 — 사용자: "O 스킬도 너무 순식간에 지나가서"): 착지해서 활이 선 순간부터 첫 검이 꽂히기 전까지 slow배(가장 길게 max초).
    gap: { spin: { slow: 0.08, max: 0.5, every: 1.0 }, finish: { slow: 0.1, max: 0.6 }, slow: 0.2, max: 0.7, near: 4.5, labelY: 2.8, labelPx: 22, labels: { go: 'I · O 몰아친다', chain: 'U 잇는다 · I · O', dodge: 'Space 피한다', parry: 'J 받아친다' } },
    // skill = 스킬을 썼다는 강조(2026-11-18 — 사수의 한 방처럼): chain = 이 초 안에 앞의 느려짐이 있으면 겹쳐 쌓지 않는다,
    // slash·spin·finish = 가장자리 빛(초) · 느려짐 [빠르기, 초] · 화면 당김 [세기, 초]. 일섬의 flash = 지나갈 줄이 먼저 번쩍이는 긴 선(양 끝으로 더 뻗는 길이 · 굵기 · 초), 마무리의 slowOrbs = 칸을 이만큼 털었을 때부터 느려진다,
    // spray = 스킬 본체가 벤 자리에서 칼이 지나간 쪽으로 튀는 불티(수 · 빠르기 · 퍼지는 각(도) · 남는 초 · 크기).
    skill: { chain: 0.45,
      slash: { edge: 0.18, slow: [0.3, 0.22], punch: [0.05, 0.2], flash: { ext: 2.4, w: 0.11, sec: 0.22 } },
      spin: { edge: 0.15, slow: [0.4, 0.24], punch: [0.045, 0.2] },
      finish: { edge: 0.25, slow: [0.3, 0.32], slowOrbs: 2 },
      spray: { slash: { n: 12, speed: 15, coneDeg: 46, life: 0.22, size: 0.07 }, spin: { n: 9, speed: 13, coneDeg: 60, life: 0.2, size: 0.065 }, finish: { n: 14, speed: 16, coneDeg: 70, life: 0.24, size: 0.075 } } },
    // swords = 이기어검의 모습(view/swordsView.js — 설계 2026-11-17-barrage-flying-swords-design.md §6. 판정 수치는 RULES.sword.swords):
    // n = 한 줄의 자루 수, y = 뜬 높이, len·w = 날의 길이·너비, core·coreLen·coreW·coreDim = 밝은 속의 색·길이 몫·굵기·칸이 없을 때의 밝기, alpha = 날의 불투명도, dim = 줄마다의 굵기·밝기 몫(바탕 · 둘째 · 셋째 묶음),
    // turn = 날 끝이 돌아가는 빠르기(rad/초), fastFace = 이보다 빠르게 날 때는 가는 쪽을 곧장 본다(U/초), fresh = 막 생긴 묶음이 제 타격을 마칠 때까지의 밝기 배율,
    // fan = 등 뒤 부채(반각(도) · 줄마다의 거리 · 끌려오는 빠르기 [느린, 빠른] · 위아래로 뜨는 높이와 빠르기(Hz) · 바깥으로 기우는 각),
    // size = 검마다의 크기 몫 [가장 작게, 크게] — 아래의 [a, b]도 모두 그 사이에서 그때그때 고르는 값이다(길과 칼자국이 제각각이 되게. 화면만의 난수 — 판과 무관), clear = 돌아가는 길이 적의 몸에서 띄우는 거리,
    // trail = 꼬리(남는 초 · 굵기 · 자루마다의 굵기 몫 · 불투명도 · 이 빠르기(U/초)와 걸음(U)부터 긋는다 · 가장 긴 길이),
    // sortie = 건너다니기(far = 스친 뒤 지나쳐 나가는 거리 — 궤적의 크기 · 그 몫 · 몸 가운데에서 비껴 스치는 몫 · 등 뒤에서 떠날 때 보던 쪽으로 내달리는 거리 · 돌아오는 초 · 막혀 튕기는 거리 · 스친 자국의 길이 · 굵기 · 초),
    // strike = 스킬 타격(벨 줄에 들어서는 거리 · 지나쳐 나가는 거리 · 가로지르는 빠르기(U/초) · 벨 줄을 타고 들어오는 거리 · 난무가 몸 위를 넘는 높이 · 검이 낼 수 있는 가장 큰 빠르기 · 칼자국이 몸보다 긴 만큼 · 굵기 · 초 · 칼자국의 높이 · 일섬의 줄 사이 · 난무의 각이 어긋나는 정도(도) · 벤 뒤 미끄러져 나가는 거리와 초),
    // bow = 마무리의 활(줄마다의 거리 · 자루마다 들쭉날쭉한 정도 · 반각(도) · 물러나는 데 드는 가장 짧은 초 · 쏘는 초 · 꽂혀 있는 초 · 꽂힌 자국의 길이 · 몸에 꽂히는 자리가 옆으로 퍼지는 몫 · 이보다 멀리 나가 있던 검은 돌아오지 않는다 · 꽂힌 채 기다리는 초),
    // mark = 칼자국(불투명도 · 밝은 속의 길이 몫 · 굵기 몫 · 처음에 굵게 번쩍이는 배율), jolt·noteJolt = 보스를 찌를 때·스킬 타격의 음마다 보스가 움찔하는 세기, spray = 검이 지나간 쪽으로 튀는 불티(찌를 때 · 스킬 타격 · 마무리의 연사 · 그 마지막 검 — 수 · 빠르기 · 퍼지는 각(도) · 남는 초 · 크기 · 벤 순간 번쩍이는 점의 크기), freshWide = 막 생긴 검이 넓어지는 한도. sortie의 firstIn·turnOut·homeOut·homeIn·softBend·dodge, strike의 laneJitter·laneGrow·spinLat·stabDeep·leadPad·passMark, bow의 deep·lastMark는 길과 칼자국의 모양을 잡는 몫이다(view/swordsView.js의 그 자리에 뜻을 적었다).
    // grow = 자라나는 초 · 자루 사이의 엇박 · 처음의 [길이, 너비] 몫, expire = 빨려 드는 초 · 식기 전에 깜빡이는 초와 빠르기(Hz) · 깜빡일 때 가장 어두운 밝기 · 빨려 드는 세기, renew = 새로 고쳐질 때 번쩍이는 초와 세기,
    // sound = 찌르기 소리·불티를 1초에 몇 번까지 · 스킬 타격의 음 수 · 한 음씩 올라가는 높이(센트), spark = 찌른 불티의 크기, noteSpark = 스킬 타격의 음마다 나는 불티의 크기,
    // hud = 스킬 이름 옆의 묶음 표시(사이 · 너비 · 높이 — px),
    // last = 마무리의 마지막 검(흔들림 [px, 초] · 당김 [세기, 초] · 멈춤 초 · 칸을 이만큼 턴 때부터 멈춘다 · 불꽃 크기 · 합계 숫자 크기 · 낮은 소리의 높이(센트)).
    swords: { n: 5, y: 0.55, len: 1.5, w: 0.3, core: '#bff8ff', coreLen: 0.8, coreW: 0.06, coreDim: 0.55, alpha: 0.92, dim: [1, 0.8, 0.65], turn: 14, fastFace: 14, fresh: 1.25, freshWide: 1.4, quiet: 0.3, mark: { alpha: 0.95, coreLen: 0.7, coreW: 0.4, pop: 2.6 }, jolt: 0.05, noteJolt: 0.12,
      spray: { stab: { n: 4, speed: 12, coneDeg: 32, life: 0.14, size: 0.065, flash: 0.3 }, strike: { n: 5, speed: 13, coneDeg: 38, life: 0.16, size: 0.065, flash: 0.36 }, shot: { n: 6, speed: 13, coneDeg: 55, life: 0.18, size: 0.065, flash: 0.4 }, last: { n: 16, speed: 17, coneDeg: 80, life: 0.26, size: 0.08, flash: 0.7 } },
      fan: { halfDeg: 65, r: [1.25, 1.85, 2.45], follow: [7, 12], bobY: 0.07, bobHz: 0.7, outDeg: 7.5 },
      size: [0.85, 1.2], clear: 0.6,
      trail: { sec: 0.16, w: 0.11, wVary: [0.8, 1.35], alpha: 0.55, minSpeed: 7, minStep: 0.06, maxLen: 5, taper: 0.6 },
      sortie: { far: 9, farVary: [0.55, 1.4], lat: [0.25, 0.85], wind: 0.9, firstIn: 0.5, turnOut: 3.6, homeSec: 0.3, homeOut: 4.5, homeIn: 1.4, bounce: 1.2, softBend: 0.16, dodge: 2.4, markLen: [1.2, 2.6], markW: [0.08, 0.16], markSec: 0.16 },
      strike: { inGap: [1.4, 2.8], outGap: [2.6, 5.5], speed: [42, 60], lead: [1.2, 3.6], hop: 1.5, maxSpeed: 75, markPad: [1.0, 4.2], markW: [0.07, 0.17], markSec: 0.22, markY: 0.9, side: 0.45, jitterDeg: 9, coast: [1.5, 3.5], coastSec: 0.25, laneJitter: 0.7, laneGrow: 0.45, spinLat: 0.7, stabDeep: 0.3, leadPad: 0.5, passMark: 1.6 },
      bow: { r: [2.0, 2.9, 3.8], rVary: 0.3, halfDeg: 60, pull: 0.1, shot: 0.08, stick: [0.05, 0.12], markLen: [1.0, 2.1], spread: 0.5, deep: [0.5, 0.9], lastMark: [1.5, 1.8], reach: 8, wait: 0.25 },
      grow: { sec: 0.1, each: 0.02, from: [0.4, 0.15] }, expire: { sec: 0.25, blinkSec: 1, blinkHz: 7, blinkLow: 0.55, pull: [0.5, 12] }, renew: { sec: 0.25, boost: 0.5 },
      hud: { gap: 15, w: 4, h: 9 },
      sound: { perSec: 8, notes: 6, cent: 140, stabCent: 90 }, spark: 0.6, noteSpark: 0.85, last: { shake: [5, 0.12], punch: [0.03, 0.14], stop: 0.05, stopOrbs: 3, spark: 2.0, number: 30, cent: -300, edge: 0.2 } },
  },
  // 낀 것 HUD(오른쪽 아래의 칸들): slotW·slotH·gap = 칸 크기와 사이(px), bottom = 화면 아래에서 칸 아랫변까지, bodyW = 몸 카드 칸 너비,
  // fly = 주운 카드의 선이 칸까지 그어지는 초, flash = 칸이 빛나는 초, blink = 바꿔 끼울 때 깜빡이는 빠르기, near = 카드의 한 줄 설명이 뜨는 거리(U), keySec = 키·이름 배너 초, eliteSec = 정예 배너 초.
  kit: { slotW: 92, slotH: 26, gap: 6, groupGap: 14, bottom: 44, bodyW: 104, fly: 0.35, flash: 0.6, blink: 7, near: 2.6, keySec: 1.6, eliteSec: 1.6, lineW: 3 },
  // 실험 기믹(?try=): 말뚝(높이·굵기·꼭대기), 줄 굵기, 기둥 높이, 불 밝기(낮음~높음)·사그라드는 시간, 이름(겹 화면)
  tries: {
    // 저격 한 방(사용자 "진심 펀치처럼 공기를 가르며 주변으로 확 퍼지는 연출"): stop = 떼는 순간의 멈춤, warp = 줄 곁의 것이 밀렸다 돌아오는 그림(warp.js),
    // gust = 줄 양옆으로 튀어 나가는 바람 줄(n개, wave U/s로 줄을 따라 차례로), dust = 줄을 따라 이는 먼지 수, punch = 화면 당김.
    snipe: { stop: 0.07, punch: [0.05, 0.22], dust: 7, dustScale: 1.3, hitBurst: 3.4, aimPulse: [0.85, 0.15, 18], flashShrink: [0.3, 0.7],
      warp: { sec: 0.34, side: 0.9, fwd: 0.8, reach: 3.2, width: 0.7, back: 0.5 },
      gust: { n: 48, sec: 0.42, dist: 2.8, len: 1.5, w: 0.08, alpha: 0.85, wave: 70, y: 0.55, start: 0.25, sweep: 0.7, vary: [0.6, 0.8] },
      cross: { arm: 0.6, gap: 0.25, w: 0.1, dot: 0.12, y: 0.75, spin: 0.6, alpha: 0.95 }, aimW: 0.14, aimAlpha: 0.6, glowW: 0.8, glowAlpha: 0.12, flashW: 1.1, flashSec: 0.22, y: 0.7, shake: 16, shakeSec: 0.28, burst: 2.4, number: 34, dim: 'saturate(0.55) brightness(0.8)' },
    bubbleR: 2.3, bubbleAlpha: [0.16, 0.34], mineR: 0.32, boomBurst: 2.2, boomShake: 9, boomShakeSec: 0.18, anchorH: 1.2, anchorR: 0.12, anchorTop: 0.34, ropeW: 0.06, pillarH: 1.9, blockGap: 0.08, dashBurst: 1.4, dashNumber: 22, ropeShake: 3, ropeShakeSec: 0.08,
    names: { sky: '갈고리 — K: 가는 쪽 말뚝으로(공중이라 안 맞는다)', pillars: '엄폐 기둥 — 보라·빨강 탄과 평타를 막는다(흰·금은 지나간다), 많이 막으면 무너진다', dash: '돌진 베기 — 회피로 적을 지나가면 피해', lance: '꿰뚫는 던지기 — 던진 탄이 곧게 뚫고 간다', mine: '지뢰 — O: 모은 탄 하나를 발밑에(적이 밟으면 터진다)', orbit: '오라 — 모은 탄이 있으면 가까운 적이 깎인다', swap: '자리 바꾸기 — K(갈고리와 같이 켜면 L): 겨눈 몬스터와', graze: '스침 모으기 — 네 번 스치면 한 칸', bubble: '보호막 — 보스가 막을 두르면 던진 탄만 통한다(세 발이면 깨진다)', tide: '밀물 — 빨간 반쪽에서 건너가라', always: '늘 나가는 무기 — 패링하면 과열(더 자주 쏜다)', vary: '공격 다양화 — 사수: 세 발·넓은 부채·연사, 돌격병: 연속 돌진, 포격병: 줄 포격', snipe: '저격 — I 누르고 있기: 시간이 느려지고 겨눈 적에 조준점이 붙는다. WASD로 그쪽의 가까운 적을 고르고 떼면 쏜다(회피 = 취소)' },
  },
  // 평타·무기 연출(사용자 "기본 공격이나 무기도 좀 더 화려했으면"): 선과 불티로만 — 부드러운 빛·연기는 쓰지 않는다(사용자가 고른 느낌). 청록만, 적 탄 아래 층.
  // head = 평타 머리(밝고 짧게 — 꼬리는 sizes.shotLen·shotAlpha), muzzle = 쏠 때 앞으로 튀는 불티, heat = 과열(패링 뒤 가동 시간) 동안의 굵기 배율,
  // missile = 머리 + 지나온 길을 따라 그리는 꼬리(trail: step마다 자리를 n개 기억해 잇는다 — 휘어 날면 꼬리도 휜다, 뒤로 갈수록 w[0] → w[1]로 가늘고 dim까지 어둡게), beam = 속 밝기와 양옆 가는 줄·닿는 곳 불티, drone = 몸, fan = 산탄이 나갈 때 부채꼴 불티,
  // pellet = 작은 탄(드론·산탄)의 굵기 배율과 명중 불꽃, at·vary = 불티가 나오는 자리(U)와 빠르기 흩기 [바탕, 폭], flicker = 빔 옆줄 깜빡임 [빠르기, 어긋남, 끊기는 문턱], keep = 기억해 둘 적 수의 상한.
  // flinch = 맞은 몬스터의 움찔(밀림·부풂), number = 평타·무기 누적 피해 숫자(every초마다, big 이상 한 방은 제 숫자가 있어 뺀다), lag = 몬스터 체력 막대 잔상이 줄어드는 빠르기.
  guns: {
    head: { len: 0.34, w: 0.11, alpha: 0.95 },
    muzzle: { n: 3, speed: 16, life: 0.07, size: 0.05, coneDeg: 26, at: 0.6, vary: [0.7, 0.6] },
    heat: { shotScale: 1.4, headScale: 1.3, missileScale: 1.3 },
    missile: { headLen: 0.62, headW: 0.16, headAlpha: 0.95, hitBurst: 0.9, launch: 0.5, trail: { n: 18, step: 0.16, w: [0.12, 0.02], dim: 0.2, alpha: 0.85, cap: 640, overlap: 1.06 } },
    beam: { coreAlpha: 0.9, rail: 0.27, railW: 0.045, railAlpha: 0.8, flicker: [90, 2.1, -0.6], sparkEvery: 0.05, sparkSize: 0.7 },
    drone: { r: 0.23, alpha: 0.95, spark: 0.35, spin: 3 },
    pellet: { w: 1.3, hit: 0.3 },
    fan: { n: 8, speed: 20, life: 0.09, size: 0.06, at: 0.7, vary: [0.8, 0.4] },
    flinch: { sec: 0.1, push: 0.15, pop: 0.12 },
    number: { every: 0.45, min: 12, big: 60, size: 15, keep: 96 },
    lag: { hold: 0.25, rate: 0.9, keep: 96 },
  },
  // 일반 몬스터·보상·문(스테이지 설계 §6): 단순한 도형. 크기 [x 앞뒤, y 높이, z 옆] U
  mobs: {
    shooter: { r: 0.5, h: 1.3, barrel: [0.6, 0.14, 0.14] },
    charger: { r: 0.62, len: 1.7, flat: 0.55, y: 0.5 },
    mortar: { box: [1.2, 0.6, 1.2], barrel: [0.2, 1.1], tilt: 0.9 },
    shield: { box: [0.8, 1.3, 0.9], plate: [0.14, 1.5, 1.7], plateAt: 0.62 },
    bomber: { r: 0.5, fuse: [0.07, 0.35] },
    totem: { r: 0.55, h: 2.3, cap: 0.5, auraAlpha: 0.1 },
    waller: { box: [0.55, 1.15, 1.9], fin: [0.3, 0.35, 1.3] },
    spinner: { r: 0.72, h: 0.55, barrel: [1.0, 0.18, 0.18], cap: 0.3 },
    markerR: 0.7, markerAlpha: 0.4, pop: 0.18, hitFlash: 0.08, dieSec: 0.22,
    barW: 38, barH: 4, barY: 1.9,
    rewardR: 0.45, rewardHold: 0.45, rewardY: 1.0, rewardSpin: 1.6, rewardBob: 0.12, rewardGlow: 0.3, rewardFloorR: 1.0,
    doorH: 2.4, doorPost: 0.22, doorGlow: 0.5, doorLight: 3,
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
    // 한 방의 연출(한 판의 뼈대 §7): flash = 탄을 쓰는 순간 무기가 끼어든다는 신호 섬광의 세기 [한 칸, 네 칸], fan = 산탄 부채 불티의 폭(도)·세기 [한 칸, 네 칸],
    //   missile = 미사일이 떠나는 불티 [한 칸, 네 칸], beamPunch = 빔의 화면 당김 [양, 초], burstStop = 산탄 한 방이 맞는 순간의 멈춤(초), droneEvery = 난사 소리를 몇 발에 한 번,
    //   span = 한 칸에서 이만큼 더 쓰면 가장 큰 연출(네 칸). 다 쓴 한 방(full)만: shake·shakeSec 흔들림, slow·slowSec 느려짐. 저격의 한 방은 무기의 모습만 얹는다(저격의 연출이 주인공).
    salvo: { span: 3, flash: [0.9, 2.4], fan: [70, 1, 2], missile: [0.8, 2], beamPunch: [0.035, 0.16], burstStop: 0.035, droneEvery: 3, shake: 7, shakeSec: 0.18, slow: 0.45, slowSec: 0.22, detune: [0, 500] },
    // 자폭병 튕겨 보내기(§5): tracer = 날아가는 길의 줄 굵기, burst = 떨어진 자리의 폭발(보통 폭발보다 크다, 완벽이면 × perfect), number = 숫자 크기,
    //   multi = 한 번에 이만큼 넘게 잡으면 slow배로 slowSec초 느려진다(쓸어 담은 순간).
    bomber: { tracer: 2.4, flash: 1.2, burst: 2.8, perfect: 1.3, number: 30, shake: 9, shakeSec: 0.18, detune: 500, multi: 3, slow: 0.35, slowSec: 0.3 },
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
    // 결과 화면이 뜨기까지·서서히 뜨는 시간, 패배 때 화면 색 빠짐. 스테이지를 끝낸 화면: stamp = 등급·낀 카드·기록 줄이 찍히는 때(결과가 뜬 뒤 초), gradePx = 등급 글자 크기, pop = 등급이 찍히며 줄어드는 초
    result: { winDelay: 1.6, loseDelay: 1.0, fade: 0.3, gray: 0.85, stamp: [0.35, 0.8, 1.2], gradePx: 84, pop: 0.18 },
    lowHp: { at: 0.25, beat: 0.85, edgeLo: 0.1, edgeHi: 0.34 },   // 체력 위태: 최대 체력 몫, 심장 간격, 붉은 가장자리 밝기(낮음~높음)
    overdrive: { blink: 0.5, shotScale: 1.7, glow: 0.7 },
    // 탄 발사 박자: 보라·빨강 탄이 나올 때 한 묶음에 한 번(gap초 안은 건너뜀) 낮은 소리 + 발사 자리 불꽃 + 보스 몸이 살짝 튐(kick)
    volley: { gap: 0.08, srcCent: 120, redCent: -400, spark: 0.9, kick: 0.04, kickSec: 0.09 },
    bossChunks: { at: [0.75, 0.25], burst: 2.4, dust: 1.6, shakePx: 10, shakeSec: 0.2, jolt: 0.3 },   // 보스 체력이 이 몫을 지날 때 파편(50%는 2단계 넘어감이 맡는다)
    aura: { every: 0.14, glow: 0.6 },   // 무기 가동(패링 뒤): 몸에서 청록 알갱이가 오르는 간격, 몸 빛
    intro: { sec: 1.1, hold: 0.22 },    // 시작 장면: 길이, 카메라 당김   // 반격 기회(과열): 끝나기 blink초 전부터 깜빡, 탄 굵기, 몸 빛
    // 스테이지: 몬스터 죽음(파편·작은 흔들림), 방 정리·방 번호 큰 글자, 보상 줍기, 보스 등장(당김), 방 넘어갈 때 어두워졌다 밝아짐
    stage: { shellReturn: { tracer: 2.2, burst: 1.8, number: 26, shake: 9, shakeSec: 0.16, detune: 300 }, deathBurst: 1.1, deathShake: 5, deathShakeSec: 0.12, blockGap: 0.12, spawnGap: 0.2, clearSec: 1.3, clearEdge: 0.5, roomSec: 1.3, pickBurst: 1.6, pickNumber: 26, bossHold: 0.2, bossSec: 1.1, fade: 0.35, dashShake: 4, dashShakeSec: 0.1 },
    rush: { kickPx: 16, kickSec: 0.18, arriveShake: 10, arriveSec: 0.18 },
    slam: { shakePx: 10, shakeSec: 0.2 },
    // 원거리 재설계: 박치기 받아냄(근접 패링 위에 크게 튕김) · 난간 쿵 · 파도 시작 · 레이저 발사 떨림
    slamParry: { jolt: 0.2, shakePx: 10, shakeSec: 0.16 },   // 받아쳐진 돌진: 크게 튕기면 경직처럼 보여 줄였다(사용자 2026-11-17)
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
      stab: -25, ching: -19, swordsNew: -16,
      snipe: -5, store: -13, storeFull: -11, throw: -9, throwHit: -10, throwBoom: -5, heal: -11, slash: -9, spin: -10, finish: -5, wave: -21,   // 모아 던지기(§4.11)
      door: -12, mobSpawn: -22,   // 스테이지: 문이 열림, 몬스터 등장
    },
  },
};
