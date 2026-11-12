# 영지 전쟁 시험판 (버리는 코드)

Ashes식 경제(지역 깃발 점령 → 일꾼이 자원 자리에 채굴기)와 건물 생산, 판타지 병종 12가지 + 중립 괴물 소굴.
설계: `docs/superpowers/specs/2026-11-12-realm-rts-design.md`.

- 실행: `python prototypes/realm/tools/serve.py 8780` → `http://localhost:8780/`
- 시험: `node --test "prototypes/realm/test/*.test.mjs"` (Node 22)
- AI 대 AI: `node prototypes/realm/tools/match.mjs --seeds 6 [--verbose]`
- `src/sim/` = 순수 계산(브라우저·Node 둘 다), `src/view/` = 화면·입력. 모든 수치는 `src/sim/rules.js` 한곳.
