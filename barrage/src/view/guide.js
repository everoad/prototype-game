// 멈춤 화면의 안내에 들어갈 것을 고른다(순수, Node 시험). 글과 크기는 LOOK.guide, 그리기는 hud.js.
// 처음 보는 사람이 읽고 바로 할 수 있게: 목표 한 줄 · 하는 법 몇 줄 · 조작 표(왼손·오른손·그 밖) · 색의 뜻 · 지금 낀 카드.
// 판의 종류에 맞는 줄만 낸다 — 카드로 얻는 키(O · K·L)는 스테이지나 그 실험을 켠 판에만, 예전 방식(?store=0)은 무기 스킬.
import { CARDS, kitAll } from '../sim/cards.js';
import { tryKey } from '../sim/tries.js';
import { isSword } from '../sim/sword.js';

const KEY = { orb: 'O', move1: 'K', move2: 'L' };

export function guide(w, LOOK) {
  const G = LOOK.guide, R = G.rows, on = w.tries ? w.tries.on : {}, store = !!w.opts.store, stage = !!w.stage;
  const orb = store && (stage || !!on.mine), moves = store && (stage || !!on.sky || !!on.swap);
  const sword = isSword(w);   // 검사: 오른손이 스킬 셋(U 일섬 · I 회전 베기 · O 마무리), 탄 기술 카드는 없다
  const right = sword ? [R.parry, R.slash, R.spinCut, R.finish, ...(moves ? [R.moves] : [])] : store ? [R.parry, R.throw, ...(on.snipe ? [R.snipe] : []), ...(orb ? [R.orb] : []), ...(moves ? [R.moves] : [])] : [R.parry, R.skills];
  const cards = w.kit ? kitAll(w).map(id => {
    const c = CARDS[id];
    return { id, group: LOOK.names.group[c.group], name: LOOK.names.card[id], line: LOOK.names.cardLine[id], key: c.key ? KEY[tryKey(w, c.try)] : null };
  }) : [];
  return {
    title: sword ? G.titleSword : G.title, resume: G.resume, heads: G.heads,
    goal: stage ? G.goal.stage : G.goal.boss,
    how: sword ? G.howSword : store ? G.how : G.howOld,
    left: [R.move, R.dodge, R.shield, R.bomb], right,
    misc: [R.pause, R.restart, ...(stage ? [R.retry] : []), R.view],
    colors: G.colors.map(([color, text]) => ({ color, text })),
    cards,
  };
}
