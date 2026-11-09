# 홍수 전쟁 웹 도형 시험판 (버리는 코드)

설계서: `docs/superpowers/specs/2026-11-06-flood-war-design.md`. 계획서: `docs/superpowers/plans/2026-11-06-flood-prototype.md`.

- 실행: `python prototypes/flood/tools/serve.py` → 브라우저에서 `http://localhost:8765/`
- 시험: `node --test "prototypes/flood/test/*.test.mjs"` (Node 22)
- `src/sim/` = 순수 계산(브라우저·Node 둘 다), `src/view/` = 화면·입력. 모든 수치는 `src/sim/rules.js` 한곳.
- `out/` = 녹화·자동 대전 결과(저장소 밖).
