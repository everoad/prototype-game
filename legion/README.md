# 군단 영지 웹 도형 시험판 (버리는 코드)

홍수 전쟁(`prototypes/flood`)의 싸움 위에 영지(`prototypes/realm`)의 경제를 올리는 판. 설계서: `docs/superpowers/specs/2026-11-13-legion-design.md`.
계획서: `docs/superpowers/plans/2026-11-13-legion-stage1.md`(1단계 갈라내기 — 끝), `…-stage2.md`(2단계 지도와 땅 — 끝), `…-stage3.md`(3단계 경제와 건물 — 끝), `…-stage4.md`(4단계 조작과 화면 — 끝), `…-stage6-1.md`(6-1단계 땅 병종과 땅 규칙 — 끝, 5단계보다 먼저). 지도 그림: `docs/superpowers/specs/2026-11-13-legion-map.svg`.

- 실행: `python prototypes/legion/tools/serve.py 8790` → `http://localhost:8790/`(게임 판)
  - 게임 판(`?scene=game`, 기본): 지역 25곳·괴물 소굴 17곳·자원 자리 64곳, 양쪽 성채·광부 조 셋·시작 군대, 금 400·목재 300. `?demo=1` = 편 0 경제 시범(광부 조가 금광·벌목소·병영을 짓고, 병영이 보병·방패병 쐐기를 앞 요새 앞으로 내고, 95초에 모두 마나 샘으로). 편 1은 아직 서 있기만 한다(AI는 5단계). 적 성채가 무너지면 승리. `?showcase=1` = 특수 병종 보여 주기(편 0이 본진 쪽 두 줄 땅과 다 지은 마법탑·마구간·공방을 쥐고 마법사·사제·기사·골렘을 뽑아 앞 요새에 모은다, 편 1 요새 앞엔 몬스터 특수 부대 넷, 120초에 어택땅).
  - 시험 장면(`?scene=`): wedges · cavanvil · flank · ranged · catapult · squad · skills · disengage · crossing(여울 건너기) · clash5k(양쪽 5,000명) · 특수 병종(6-1단계, 황금 아님): mages · priestsOn · priestsOff · knights · golems · specials(양쪽 특수 넷). 모르는 이름이면 game.
  - 그 밖: `speed` · `cam=x,z,높이` · `yaw` · `fog=1` · `skip=초` · `raf=timer`(숨은 창 시험) · `seed`(지금 sim은 난수를 쓰지 않아 결과가 시드와 무관하다 — 3단계 경제부터 쓴다).
  - 조작(4단계 키 배치, 사용자 2026-11-13):
    - 고르기: 병사를 누르면 그 부대(광부면 그 조), 두 번 누르면 화면 안 같은 병종 모두, 끌면 닿은 부대 전체(병사가 섞이면 광부는 빠진다). Shift = 더하기, Esc = 풀기.
    - 명령: 오른쪽 = 보내기(적 위 = 공격, 적 건물 위 = 건물 공격), Alt+오른쪽 = 어택땅, Shift+오른쪽 = 길 잇기, S = 멈춤, 고른 병력 판의 [멈춤]·[어택땅](누르고 땅 클릭).
    - 부대 지정: Ctrl+숫자 = 지정, Shift+숫자 = 더하기, 숫자 = 고르기, 두 번 = 그리 화면. 아래 부대 줄을 눌러도 된다.
    - 지휘 스킬: Z·X·C(쿨타임만). ` = 쉬는 광부 조, Space = 마지막 알림 자리.
    - 짓기: 광부 조를 고르고 Q 금광 · W 벌목소 · E 마나 우물 · R 병영 · A 마구간 · D 공방 · F 마법탑(짓기 단추와 같다, 못 지으면 까닭).
    - 화면: 가운데 버튼 끌기 = 회전·기울기(30~70°), 휠 = 확대, 화면 가장자리·방향키·미니맵(누르기·끌기) = 이동, 미니맵 오른쪽 = 고른 병력 보내기. URL `pitch=도`.
  - 특수 병종(6-1단계): 마법탑 = 화염 마법사(마나 샘 땅)·사제, 마구간 = 기사(말 목장 마을 땅), 공방 = 룬 골렘(고대 유적 땅). 그 땅을 가졌고 성채와 이어져야 뽑고, 잃으면 줄이 멈춘다(되찾으면 이어 감). 건물 땅을 잃거나 끊겨도 멈춘다. 끊긴 우리 땅이 적 땅에 다 둘러싸이면 60초 뒤 적 땅(이름표에 붉은 남은 초).
  - 경제(3단계): 망치 표식 곁 광부를 누르면 그 조 → 왼쪽 아래 짓기 단추(또는 Q·W·E·R·A·D·F) → 땅에 놓기(반투명 건물 유령, 초록 = 됨, 빨강 = 까닭, Shift = 이어서, 오른쪽·Esc = 그만, 채굴기는 자원 자리에 붙는다). 우리 건물을 누르면 판(생산·연구 단추, 줄, 취소) — 오른쪽 = 집결지. 광부로 짓는·다친 우리 건물에 오른쪽 = 돕기. 자원 줄의 "광부 조" 단추 = 쉬는 조 모두 고르기.
- 시험: `node --test "prototypes/legion/test/*.test.mjs"` (Node 22). `test/golden.test.mjs` = 시험 장면 아홉이 홍수와 같은 결과인지(남은 병사·체력 합·자리 합, 15·30·45·60초).
- 황금 기록 다시 하기(홍수 싸움을 일부러 바꿨을 때만): `node prototypes/legion/tools/golden-record.mjs`.
- 성능: `node prototypes/legion/tools/bench.mjs [장면=clash5k] [--flood]` — 같은 장면을 군단 영지 모듈 또는 홍수 모듈로 돌려 틱당 ms를 견준다. `game` = 게임 판 + 경제 시범 240초(군단 영지만).
- 영상: `powershell -File prototypes/legion/tools/record.ps1 -Seconds 100 -Name legion-economy -Query "scene=game&demo=1&speed=2"` → `out/legion-economy.mp4`(게임 판은 카메라 길이 정해져 있다; `cam=x,z,높이`면 고정).
- `src/sim/` = 순수 계산(브라우저·Node 둘 다), `src/view/` = 화면·입력. 모든 수치는 `src/sim/rules.js` 한곳. 시험 장면은 `src/sim/labs.js`(화면·황금 시험·bench가 같이 쓴다).
  - 땅: `maps/legion.js`(확정 지도 표·자원 자리) · `regions.js`(지역·이웃·다각형) · `camps.js`(괴물 소굴, 편 2) · `territory.js`(점령·이어짐) · `game.js`(게임 판 차리기·시범) · 화면 `view/land.js`.
  - 조작(4단계): 화면 `view/keys.js`(키 → 할 일) · `view/camMath.js`(회전·기울기) · `view/controlGroups.js`(부대 지정) · `view/alerts.js`(알림 자리) · `view/minimap.js`(미니맵 셈), sim `units.js`(부대 번호)·`orders.js` 멈춤.
  - 특수 병종·땅(6-1단계): `rules.js`(병종 6~9·갈래 cls·몸 body·싸우지 않음 noncombat) · `heal.js`(사제) · `lands.js`(땅 = 병종·생산 멈춤) · `territory.js` 포위 · `combat.js`(갈래 상성·pushDistance·골렘 몸·모루·범위 타격) · 화면 `view/crowd.js`(도형·고리·빛·효과) · `view/fx.js`.
  - 경제(3단계): `buildings.js`(놓기·길 막기·짓기 진행) · `economy.js`(자원·수입·인구) · `workers.js`(광부 조·짓기·고치기 명령) · `produce.js`(생산 줄·연구·집결지) · `strikes.js`(건물 피해·판 끝) · 화면 `view/buildings.js`(모양·띠·망치 표식) · `view/panel.js`(판 글).
- `out/` = 녹화(저장소 밖).
