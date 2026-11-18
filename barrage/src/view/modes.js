// 모드 고르기의 목록과 주소(순수 — Node 시험). 멈춤 화면의 판(modePanel.js)이 쓴다.
// 사용자 2026-11-18: "지금까지 나온 모드들 정리해서 … 점점 url이 많아지니까 찾기가 어려워지네."
// 고르는 것(sel) = { char, board, slash, gear, mark: [이름…], try: [이름…], lab }. 주소의 옵션(query.js가 읽는 것)과 같은 뜻이고, 기본값은 주소에 붙이지 않는다.
// 갈래의 items = [값, 화면에 뜨는 이름]. many = 여럿을 같이 켤 수 있다(나머지는 하나만).
export const MODE_GROUPS = [
  { id: 'char', title: '캐릭터', items: [['gunner', '사수'], ['sword', '검사']] },
  { id: 'board', title: '판', items: [['boss', '보스전 — 수호자'], ['dragon', '보스전 — 용'], ['stage1', '스테이지 1'], ['stage2', '스테이지 2']] },
  { id: 'slash', title: '일섬의 형태 (U)', items: [['', '기본'], ['chain', '잇는 일섬 — 한 칸으로 세 번'], ['deep', '깊은 일섬 — 한 번에 세게']] },
  { id: 'mark', title: '자국 카드', many: true, items: [['cut', '긋는 칼 — 일섬이 자국을 남긴다'], ['pop', '터뜨리는 회전 — 회전 베기가 자국을 터뜨린다']] },
  { id: 'gear', title: '무기', items: [['', '둘 — 미사일 · 산탄'], ['all', '넷 다']] },
  { id: 'try', title: '더 켜기', many: true, items: [['sky', '갈고리 (K)'], ['swap', '자리 바꾸기 (K · L)'], ['dash', '돌진 베기'], ['mine', '지뢰 (O)'], ['orbit', '오라'], ['lance', '꿰뚫는 던지기'], ['graze', '스침 모으기'], ['pillars', '엄폐 기둥'], ['tide', '밀물'], ['bubble', '보스 보호막']] },
  { id: 'lab', title: '연습 장면', items: [['', '없음'], ['parry', '패링 — 흰 탄 한 발씩'], ['stream', '패링 — 탄 사이의 흰 탄'], ['dodge', '회피 — 빨간 창'], ['graze', '스침'], ['melee', '근접 콤보'], ['rush', '돌진과 콤보'], ['execute', '처형']] },
];

const group = id => MODE_GROUPS.find(g => g.id === id);
const has = (id, v) => group(id).items.some(i => i[0] === v);
const bossFight = sel => sel.board === 'boss' || sel.board === 'dragon';

// 갈래가 뜻이 있는 때: 연습 장면을 고르면 판 · 무기 · 더 켜기는 듣지 않는다. 일섬의 형태는 검사에게만, 무기 고르기는 사수의 보스전에만(스테이지의 무기는 카드로 얻는다).
const GROUP_ON = {
  board: sel => !sel.lab, try: sel => !sel.lab,
  slash: sel => !sel.lab && sel.char === 'sword',
  mark: sel => !sel.lab && sel.char === 'sword',
  gear: sel => !sel.lab && sel.char === 'gunner' && bossFight(sel),
};
// 더 켜기에서 맞지 않는 칸: 보호막은 보스전의 것, 탄 기술(지뢰 · 오라 · 꿰뚫는 던지기)은 사수의 것
const TRY_ON = { bubble: bossFight, mine: sel => sel.char !== 'sword', orbit: sel => sel.char !== 'sword', lance: sel => sel.char !== 'sword' };

export const shownGroups = sel => MODE_GROUPS.filter(g => !GROUP_ON[g.id] || GROUP_ON[g.id](sel));
// 자국 카드에서 맞지 않는 칸: 쓰는 카드(터뜨리는 회전)는 남기는 카드(긋는 칼)를 고른 뒤에만 뜬다(설계 §2 — 혼자서는 값이 없다)
const MARK_ON = { pop: sel => sel.mark.includes('cut') };
const ITEM_ON = { try: TRY_ON, mark: MARK_ON };
export const shownItems = (g, sel) => (ITEM_ON[g.id] ? g.items.filter(([v]) => !ITEM_ON[g.id][v] || ITEM_ON[g.id][v](sel)) : g.items);

// 지금 주소(URLSearchParams)에서 고른 것을 읽는다. 모르는 값은 기본으로.
export function readModes(q) {
  const get = k => q.get(k) ?? '', stage = 'stage' + get('stage'), tries = get('try').split(',').map(s => s.trim()), marks = get('mark').split(',').map(s => s.trim());
  return {
    char: get('char') === 'sword' ? 'sword' : 'gunner',
    board: q.has('stage') && has('board', stage) ? stage : get('boss') === 'dragon' ? 'dragon' : 'boss',
    slash: has('slash', get('slash')) ? get('slash') : '',
    gear: get('gear') === 'all' ? 'all' : '',
    mark: group('mark').items.map(i => i[0]).filter(v => marks.includes(v)),
    try: group('try').items.map(i => i[0]).filter(v => tries.includes(v)),
    lab: has('lab', get('lab')) ? get('lab') : '',
  };
}

// 고른 것 → 주소의 옵션 줄(앞의 ?는 없다). 기본값과 맞지 않는 것은 넣지 않는다. keep = 지금 주소 — 소리 끔(mute=1)만 가지고 간다.
export function modeQuery(sel, keep = null) {
  const on = id => shownGroups(sel).some(g => g.id === id), parts = [];
  if (sel.lab) parts.push('lab=' + sel.lab);
  else if (sel.board.startsWith('stage')) parts.push('stage=' + sel.board.slice(5));
  else if (sel.board === 'dragon') parts.push('boss=dragon');
  if (sel.char === 'sword') parts.push('char=sword');
  if (on('slash') && sel.slash) parts.push('slash=' + sel.slash);
  if (on('gear') && sel.gear) parts.push('gear=' + sel.gear);
  const marks = on('mark') ? shownItems(group('mark'), sel).map(i => i[0]).filter(v => sel.mark.includes(v)) : [];
  if (marks.length) parts.push('mark=' + marks.join(','));
  const tries = on('try') ? shownItems(group('try'), sel).map(i => i[0]).filter(v => sel.try.includes(v)) : [];
  if (tries.length) parts.push('try=' + tries.join(','));
  if (keep && keep.get('mute') === '1') parts.push('mute=1');
  return parts.join('&');
}
