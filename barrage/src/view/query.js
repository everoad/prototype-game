// 주소 옵션 → 판 옵션(순수 — main.js가 쓴다).
// 모아 던지기(§4.11)가 기본 규칙이다(사용자 2026-11-17). ?store=0이면 예전 방식(받자마자 날아감, U·I·O 무기 스킬).
import { RULES } from '../sim/rules.js';
import { gameTries } from '../sim/tries.js';

export function worldOptions(q, rand = Math.random) {
  const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const stage = q.has('stage') && RULES.stage.list[num('stage', 1)] ? num('stage', 1) : null;   // 스테이지(?stage=1): 모아 던지기는 늘 켜지고 무기 없이 시작
  return {
    // 스테이지는 주소에 seed가 없으면 열 때마다 새로 뽑는다(판마다 다른 카드 — 한 판의 뼈대 §6). 보스전·연습 장면은 늘 1
    seed: stage != null && !q.has('seed') ? 1 + Math.floor(rand() * 1e9) : num('seed', 1), phase: num('phase', 1), pattern: q.has('pattern') ? num('pattern', null) : null,
    lab: q.get('lab'), clip: q.get('clip'), heal: q.get('heal') === '1', boss: q.get('boss') ?? 'ranged',
    room: num('room', 1),   // 스테이지에서 시작할 방(1부터 — 연습·확인용)
    kit: stage != null && q.get('kit') ? q.get('kit').split(',').map(s => s.trim()).filter(Boolean) : null,   // 처음부터 들 카드(&kit=burst,sky · none = 빈손) — 확인용
    // 기본 판 = 올린 것(늘 나가는 무기·공격 다양화·저격) + ?try=이름(더 켜기) · -이름(빼기) · none(예전 판) · all. 연습 장면은 적은 것만
    tries: (q.get('lab') ? q.get('try') : gameTries(q.get('try')).join(',')) || null,
    stage, store: stage != null || q.get('store') !== '0', hard: q.get('hard') === '1',
    char: q.get('char') === 'sword' ? 'sword' : 'gunner',   // 캐릭터(?char=sword = 검사 — sim/sword.js). 검사는 무기를 들지 않는다(아래 gear는 듣지 않는다)
    // 보조 무기: 연습 장면·스테이지(카드로 얻는다)는 없음. 보스전만 여는 판은 무기 칸 규칙대로 미사일 + 산탄 둘(한 판의 뼈대 §3 — 넷이 한 방을 같이 내면 넘친다), 예전 판(?try=none)은 넷 다
    gear: q.get('gear') ?? (q.get('lab') || stage != null ? 'none' : gameTries(q.get('try')).includes('always') ? 'missile,burst' : 'all'),
  };
}
