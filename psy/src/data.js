// 수치와 표: 물건 · 한 방 · 건물 · 좀비. 밸런스는 나중 — 전부 여기서 고친다.
(function (G) {
  'use strict';
  const P = (G.PSY = G.PSY || {});

  P.C = {
    mapW: 3000, mapH: 1800,
    capBase: 10, capMul: 1.33,        // 무게 한도 = capBase × capMul^(레벨 − 1)
    xpBase: 6, xpPow: 1.55,           // 다음 레벨까지 = xpBase × 레벨^xpPow
    orbitDmg: 5, throwDmg: 10,        // 피해 = 무게 × 이 값
    lightCd: 0.25,                    // 가벼운 것이 한 번 치고 쉬는 시간
    speed: 7, hp: 100, regen: 0.8, regenWait: 4,
    tkBase: 16, tkPerLevel: 0.8,      // 염력이 닿는 거리
    pushR: 9, pushCd: 12,             // 밀쳐내기
    sight: 22, hordeSight: 90, lose: 90, // 좀비가 알아채는 거리(대군은 멀리서) · 놓치는 거리
    actR: 120, hordeActR: 260, despawnR: 175, maxZ: 7500,
    setRange: 26, setReach: 80, setMul: 10, // 한 방: 모을 때 거리 · 내리칠 수 있는 거리 · 한도의 몇 배까지
    viewBase: 44, viewPerLevel: 1.6,  // 화면 폭(m)
    corpseTtl: 45, corpseMax: 500,
    // 맞아 죽은 좀비는 날아간다: 속도 = 밀치는 힘 × bodyKick. 날아가는 몸은 다른 좀비를 쓰러뜨리고(빠르면 다치게도 한다) 멈춘 자리에 시체로 남는다
    bodyMax: 1400, bodyKick: 1.25, bodyG: 24, bodyFric: 16, bodyHits: 4, bodyHurtSp: 14, bodyDmg: 4,
    winFrac: 0.85,
    soundOn: true,                    // 〔안〕 소리가 떼를 부른다
    horde: 5000,
  };

  // 고리: 무게 급마다 반지름 r · 한 바퀴 T초 · 간격 sp · 겹 사이 dl · 뜬 높이 z
  P.RING = [
    { r: 2.6, T: 1.3, sp: 0.42, dl: 0.55, z: 1.2 },
    { r: 4.6, T: 2.2, sp: 1.6, dl: 1.3, z: 1.7 },
    { r: 8.5, T: 3.6, sp: 5.5, dl: 3.0, z: 2.6 },
    { r: 14, T: 6.0, sp: 12, dl: 5.0, z: 4.5 },
  ];

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  P.shade = shade;

  // 물건: 이름 · 무게 · 가로 · 세로 · 높이 · 색 · 성질
  // 성질: glass(깨지며 파편) · sharp(베고 지나감) · boom(폭발 반지름) · bounce(튕김) · long(긴 것: len) · push(터지며 밀쳐냄) · ms(들 수 있게 되면 알림)
  const K = (P.K = {});
  P.KLIST = [];
  function kind(id, name, w, sx, sy, h, col, o) {
    const k = { id, name, w, sx, sy, h, col, col2: shade(col, 0.68), dur: Math.round(4 + 3 * Math.pow(w, 0.7)) };
    if (o) Object.assign(k, o);
    k.pierce = Math.floor(w / 8) + (k.sharp ? 6 : 0);
    k.cls = w < 10 ? 0 : w < 100 ? 1 : w < 2500 ? 2 : 3;
    k.hitR = (k.long ? k.len : Math.max(sx, sy)) * 0.5 + 0.35;
    K[id] = k; P.KLIST.push(k);
  }
  // 손에 드는 것
  kind('can', '깡통', 1, 0.25, 0.25, 0.3, '#aeb3bb');
  kind('bottle', '병', 1, 0.2, 0.2, 0.35, '#6fae7a', { glass: 1, dur: 1 });
  kind('knife', '식칼', 1, 0.35, 0.1, 0.05, '#d8dde2', { sharp: 1, dur: 10 });
  kind('brick', '벽돌', 2, 0.35, 0.2, 0.15, '#a5533c', { dur: 14 });
  kind('pot', '냄비', 2, 0.4, 0.4, 0.25, '#8d9299');
  kind('hammer', '망치', 2, 0.4, 0.15, 0.1, '#7d6a55', { dur: 20 });
  kind('saw', '톱날', 3, 0.6, 0.6, 0.06, '#c9ced4', { sharp: 1, dur: 25 });
  kind('plant', '화분', 3, 0.45, 0.45, 0.5, '#7a4b2c');
  kind('corpse', '시체', 4, 1.6, 0.5, 0.3, '#5d6b4f', { dur: 3 });
  kind('mailbox', '우편함', 4, 0.4, 0.4, 1.1, '#3f5f8a');
  kind('exting', '소화기', 5, 0.3, 0.3, 0.6, '#c23b34', { push: 1, dur: 1 });
  kind('chair', '의자', 6, 0.55, 0.55, 0.9, '#8a6a45');
  kind('bin', '쓰레기통', 6, 0.6, 0.6, 0.9, '#4d5a52');
  kind('scrap', '고철 조각', 6, 0.7, 0.5, 0.3, '#6d6f73');
  kind('tire', '타이어', 8, 0.7, 0.7, 0.25, '#232323', { bounce: 1 });
  kind('sign', '표지판', 10, 0.7, 0.12, 2.2, '#c9a53a', { sharp: 1 });
  kind('rebar', '철근', 12, 2.4, 0.15, 0.1, '#7a4a3a', { sharp: 1, long: 1, len: 2.4 });
  kind('tv', 'TV', 12, 1.0, 0.25, 0.6, '#1d2026', { glass: 1, dur: 1 });
  kind('bike', '자전거', 12, 1.7, 0.4, 1.0, '#3d7f86');
  kind('ladder', '사다리', 14, 3.2, 0.5, 0.15, '#b9b08a', { long: 1, len: 3.2 });
  kind('cart', '쇼핑카트', 15, 1.0, 0.6, 1.0, '#9aa0a8');
  kind('pipe', '파이프', 18, 3.0, 0.3, 0.3, '#70757c', { long: 1, len: 3.0 });
  kind('pallet', '팔레트', 20, 1.2, 1.0, 0.15, '#9c7b4f');
  // 가구급
  kind('table', '탁자', 25, 1.5, 0.9, 0.8, '#7d5c3c', { ms: 1 });
  kind('rubble', '콘크리트 조각', 25, 1.0, 0.9, 0.6, '#85837d', { dur: 60 });
  kind('gas', '가스통', 30, 0.45, 0.45, 1.1, '#c9632b', { boom: 7, dur: 6 });
  kind('bench', '벤치', 35, 1.8, 0.6, 0.8, '#5d4a36');
  kind('bookshelf', '책장', 40, 1.2, 0.4, 1.9, '#6b4c2f');
  kind('manhole', '맨홀 뚜껑', 40, 0.9, 0.9, 0.08, '#3a3d42', { sharp: 1, dur: 120 });
  kind('bed', '침대', 45, 2.0, 1.5, 0.6, '#8f8f9a');
  kind('sofa', '소파', 50, 2.0, 0.9, 0.8, '#6e4a52');
  kind('drum', '드럼통', 60, 0.7, 0.7, 1.0, '#b23a2e', { boom: 9, dur: 8 });
  kind('roof', '지붕판', 60, 2.4, 1.8, 0.12, '#5a4038', { sharp: 1 });
  kind('washer', '세탁기', 70, 0.7, 0.7, 0.9, '#c8ccd0');
  kind('fridge', '냉장고', 80, 0.8, 0.8, 1.8, '#d5d8dc', { ms: 1 });
  kind('luggage', '수하물 카트', 90, 2.4, 1.4, 1.2, '#4f6b8a');
  // 차량급
  kind('uld', '화물 상자', 120, 1.6, 1.5, 1.6, '#aab0b6');
  kind('engine', '엔진 블록', 150, 1.0, 0.8, 0.8, '#4a4d52', { dur: 160 });
  kind('moto', '오토바이', 180, 2.1, 0.7, 1.1, '#3a3a40', { ms: 1 });
  kind('lamp', '가로등', 200, 0.35, 0.35, 6.0, '#8a8f96', { long: 1, len: 6 });
  kind('vend', '자판기', 300, 1.0, 0.8, 1.9, '#b0453a');
  kind('pole', '전봇대', 500, 0.45, 0.45, 9.0, '#6b5a48', { long: 1, len: 9 });
  kind('car', '승용차', 1200, 4.4, 1.9, 1.4, '#59708a', { ms: 1 });
  kind('van', '승합차', 1800, 5.2, 2.1, 2.1, '#8a8f8c');
  kind('stairs', '계단차', 2400, 6.0, 2.4, 3.5, '#c9c5b0');
  // 대형
  kind('forklift', '지게차', 3000, 2.6, 1.3, 2.2, '#c9a02c');
  kind('container', '컨테이너', 3500, 6.1, 2.4, 2.6, '#8a4a3a');
  kind('truck', '트럭', 5000, 7.5, 2.5, 3.0, '#6d7466', { ms: 1 });
  kind('bus', '버스', 10000, 11, 2.6, 3.1, '#b99a3a', { ms: 1 });
  kind('tanker', '유조차', 12000, 10, 2.6, 3.2, '#b9b9b0', { boom: 22, dur: 40 });
  kind('excavator', '굴착기', 14000, 7.0, 3.0, 3.2, '#c98f2c');
  // 그 자리에서 쓰는 한 방 (blast = 쓸어버리는 반지름)
  kind('tree', '큰 나무', 900, 5, 5, 9, '#3b5a35', { set: 1, blast: 10 });
  kind('billboard', '광고탑', 2500, 10, 1, 12, '#8a8577', { set: 1, blast: 14 });
  kind('pylon', '송전탑', 8000, 6, 6, 28, '#7c8288', { set: 1, blast: 19 });
  kind('wtower', '급수탑', 15000, 9, 9, 19, '#8a5a40', { set: 1, blast: 23 });
  kind('crane', '타워크레인', 20000, 4, 4, 44, '#c9a02c', { set: 1, blast: 27 });
  kind('plane', '여객기', 60000, 38, 36, 6, '#d5d8dc', { set: 1, blast: 50 });

  P.MILESTONES = P.KLIST.filter((k) => k.ms);
  P.SETKINDS = P.KLIST.filter((k) => k.set);

  // 건물: 이름 · 높이 · 체력 · armor(이 무게보다 가벼운 것은 튕겨남) · 색 · 안에 든 것[물건, 최소, 최대] · 잔해
  const BT = (P.BT = {});
  function btype(id, name, h, hp, armor, col, loot, rub) { BT[id] = { id, name, h, hp, armor, col, col2: shade(col, 0.62), loot, rub }; }
  const RUB_S = [['brick', 6, 10], ['rubble', 2, 4], ['roof', 1, 2]];
  const RUB_M = [['brick', 10, 18], ['rubble', 5, 9], ['roof', 2, 4], ['rebar', 2, 5]];
  const RUB_L = [['rubble', 12, 20], ['roof', 4, 8], ['rebar', 8, 14], ['pipe', 3, 6], ['scrap', 8, 14]];
  btype('house', '주택', 6, 2500, 25, '#6b5d52',
    [['sofa', 1, 1], ['fridge', 1, 1], ['tv', 1, 1], ['bed', 1, 2], ['table', 1, 1], ['chair', 2, 4], ['knife', 1, 3], ['pot', 1, 3], ['can', 3, 8], ['bottle', 2, 6], ['washer', 0, 1], ['bookshelf', 0, 1], ['exting', 0, 1]], RUB_S);
  btype('store', '편의점', 4.5, 2500, 25, '#5f6b63',
    [['can', 20, 40], ['bottle', 15, 25], ['fridge', 1, 2], ['exting', 1, 1], ['vend', 0, 1]], RUB_S);
  btype('mart', '마트', 7, 12000, 60, '#57626b',
    [['can', 80, 140], ['bottle', 40, 70], ['cart', 8, 15], ['fridge', 4, 8], ['knife', 6, 12], ['pot', 6, 12], ['exting', 2, 3], ['vend', 1, 3]], RUB_M);
  btype('furniture', '가구점', 7, 9000, 60, '#6b5a4a',
    [['sofa', 6, 10], ['table', 6, 10], ['bed', 5, 8], ['bookshelf', 6, 10], ['chair', 15, 25], ['fridge', 2, 4], ['tv', 5, 9], ['washer', 2, 4]], RUB_M);
  btype('hardware', '철물점', 5.5, 6000, 40, '#5a5348',
    [['saw', 15, 25], ['hammer', 10, 18], ['pipe', 8, 14], ['ladder', 4, 8], ['gas', 3, 6], ['brick', 20, 30], ['rebar', 6, 12]], RUB_M);
  btype('gasst', '주유소', 4.5, 2000, 25, '#6b4a3a',
    [['gas', 4, 7], ['drum', 3, 6], ['tire', 6, 10], ['can', 5, 10], ['exting', 1, 2]], RUB_S);
  btype('garage', '정비소', 5.5, 5000, 40, '#4f5358',
    [['tire', 12, 20], ['engine', 2, 4], ['hammer', 4, 8], ['drum', 2, 4], ['moto', 1, 2], ['scrap', 6, 10]], RUB_M);
  btype('diner', '식당', 4.5, 3000, 25, '#6b4f4a',
    [['knife', 8, 14], ['pot', 8, 14], ['gas', 2, 4], ['table', 4, 8], ['chair', 10, 18], ['bottle', 10, 20], ['fridge', 1, 2]], RUB_S);
  btype('warehouse', '창고', 9, 40000, 300, '#4d5458',
    [['pallet', 15, 25], ['drum', 8, 14], ['uld', 4, 8], ['forklift', 1, 2], ['can', 30, 60]], RUB_L);
  btype('factory', '공장', 10, 50000, 300, '#585048',
    [['engine', 4, 8], ['pipe', 10, 20], ['drum', 6, 12], ['rebar', 10, 20], ['scrap', 15, 25], ['saw', 6, 12]], RUB_L);
  btype('hangar', '격납고', 14, 150000, 1000, '#5a6066',
    [['stairs', 1, 2], ['engine', 6, 10], ['drum', 8, 14], ['uld', 6, 12], ['luggage', 3, 6]], RUB_L);
  btype('terminal', '터미널', 12, 400000, 2000, '#646a70',
    [['luggage', 20, 30], ['chair', 60, 90], ['vend', 6, 12], ['cart', 20, 30], ['bench', 20, 30], ['exting', 6, 10]], RUB_L);

  // 좀비: 이름 · 체력 · 속도 · 경험치 · 닿아 있을 때 초당 피해
  P.ZT = [
    { name: '느린 좀비', hp: 10, sp: 1.6, xp: 1, dps: 4, col: '#6e7f5a', col2: '#93a17c', col3: '#b8c0a8' },
    { name: '뛰는 좀비', hp: 6, sp: 6.0, xp: 2, dps: 4, col: '#8a4b44', col2: '#b9756a', col3: '#d0b0aa' },
  ];

  P.ZONES = [
    { name: '주택가', x0: 0, x1: 950, col: '#2f3a2c', d0: 0.0015, d1: 0.006, run: 0.05 },
    { name: '상가', x0: 950, x1: 1550, col: '#3a3d40', d0: 0.007, d1: 0.011, run: 0.12 },
    { name: '공단', x0: 1550, x1: 2250, col: '#3d3a35', d0: 0.011, d1: 0.018, run: 0.2 },
    { name: '공항', x0: 2250, x1: 3000, col: '#2c2f33', d0: 0.008, d1: 0.008, run: 0.15 },
  ];
  P.zoneAt = function (x) { const Z = P.ZONES; return x < Z[0].x1 ? 0 : x < Z[1].x1 ? 1 : x < Z[2].x1 ? 2 : 3; };
})(typeof window !== 'undefined' ? window : globalThis);
