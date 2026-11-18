// 화면 없이 봇 판 여러 개(§9): 종류별 승/판, 판 길이 중앙값, 맞은 수, 패링 몫, 완벽 패링, 출처별 맞음.
// 출처(RULES.src): 1~7 패턴 · 레이저 · 구슬 · 콤보 · 박치기 · 파도 · 검기 · 바탕. 구슬·바탕은 판마다 맞음, 나머지는 한 번마다 맞음.
// 기본 판(올린 것: always·vary·snipe)을 잰다. --try 이름 = 더 켜기(-이름 = 빼기), --plain = 아무것도 켜지 않은 예전 판.
// node prototypes/barrage/tools/botrun.mjs [--kinds 1,some,dodge,walk,turtle] [--seeds 10] [--minutes 6] [--heal] [--phase 2] [--immortal] [--gear all] [--boss dragon] [--store] [--hard]
// --stage 1 = 일반 스테이지(방마다 첫 시도 통과·걸린 시간·남은 체력, 죽으면 그 방을 --retries번까지 다시)
//   --picks 갈래,카드,… = 봇이 고를 차례(기본 weapon,orb,move,body · none = 보급만) · --greedy = 체력이 낮아도 카드를 고른다 · --kit 카드,… = 처음부터 들고 시작(none = 무기 0)
//   스테이지 출력: 피해 몫(무기 = 늘 나가는 사격 + 한 방 / 던지기·저격의 바탕 / 평타) · 등급 · 선 거리(겨눈 적까지 거리의 가운데 값) · 서 있은 몫(이동 입력이 없던 틱)
// --gear all = 보조 무기 다 켬, --phase 2 = 2단계부터, --immortal = 죽지 않음(걷기 봇의 2단계 패턴별 맞음처럼 오래 봐야 할 때 — 승패는 뜻 없음)
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { createBot } from '../src/sim/bot.js';
import { parryShare } from '../src/sim/stats.js';
import { zoneOf } from '../src/sim/dragonBody.js';
import { restartRoom } from '../src/sim/stage.js';
import { gameTries } from '../src/sim/tries.js';
import { gradeOf, GRADES } from '../src/view/grade.js';
import { kitAll } from '../src/sim/cards.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const kinds = opt('kinds', '1,some,dodge,walk,turtle').split(',');   // user = 사용자 판에 맞춘 봇
const plain = args.includes('--plain'), store = args.includes('--store') || !plain, hard = args.includes('--hard');   // 기본 판은 모아 던지기·무기 다 켬(화면과 같다)   // 모아 던지기 변형(§4.11)
const seeds = Number(opt('seeds', 10)), minutes = Number(opt('minutes', 6)), heal = args.includes('--heal');
const phase = Number(opt('phase', 1)), immortal = args.includes('--immortal');
const stage = args.includes('--stage') ? Number(opt('stage', 1)) : null, retries = Number(opt('retries', 3));
const tries = plain ? null : gameTries(opt('try', null));   // 기본 판(올린 것) + --try 이름(-이름 = 빼기). --plain = 아무것도 켜지 않은 예전 판
const picks = opt('picks', null), kit = opt('kit', null), greedy = args.includes('--greedy');   // 스테이지: 봇의 고르기 차례 · 처음부터 들 카드 · 체력이 낮아도 카드를 고른다
const char = opt('char', 'gunner');   // 캐릭터(sword = 검사 — 무기 없음, 스킬 셋)
const gear = opt('gear', plain ? 'none' : tries.includes('always') ? 'missile,burst' : 'all'), boss = opt('boss', 'ranged');   // 보조 무기: 기본 판은 화면처럼 미사일 + 산탄, all · none · missile,beam,…

function playOne(kind, seed) {
  const w = createWorld({ seed, heal, phase, gear, boss, store, hard, tries, char }), bot = createBot(kind, seed);
  if (immortal) w.player.hp = w.player.maxHp = 1e9;
  const runs = {}, max = Math.round(minutes * 60 / RULES.dt), zones = { front: 0, side: 0, back: 0 };
  let k = 0, groggies = 0, stuns = 0;
  for (; k < max && !w.result; k++) {
    step(w, bot(w));
    if (w.boss.kind === 'dragon') { const z = zoneOf(w); zones[z === 'left' || z === 'right' ? 'side' : z]++; }
    for (const e of drainEvents(w)) {
      const S = RULES.src, add = id => { runs[id] = (runs[id] || 0) + 1; };
      if (e.type === 'windup' && e.kind === 'pattern') add(e.id);   // 레이저 = 패턴 8 = src 8
      if (e.type === 'rushStart' || e.type === 'meleeStart') add(S.combo);
      if (e.type === 'slamStart') add(S.slam);
      if (e.type === 'windup' && e.kind === 'wave') add(S.wave);
      if (e.type === 'swordStart') add(S.sword);
      if (e.type === 'tailStart') add(S.tail);
      if (e.type === 'wingStart') add(S.wing);
      if (e.type === 'groggy') groggies++;
      if (e.type === 'counterChance') stuns++;
    }
  }
  const s = w.stats;
  return { result: w.result ?? 'time', t: k * RULES.dt, hits: s.hits, share: parryShare(s), perfects: s.perfects, parries: s.parries, grazes: s.grazes, byPattern: s.hitsByPattern, runs, bossHp: w.boss.hp / w.boss.maxHp, zones, throws: s.throws, healed: s.healed, hpLeft: w.player.hp, throwShare: s.total > 0 ? s.dmg.throw / s.total : 0, groggies, stuns, bladeShare: s.total > 0 ? s.dmg.blade / s.total : 0, shotShare: s.total > 0 ? (s.dmg.shot + s.dmg.overdrive) / s.total : 0, execShare: s.total > 0 ? s.dmg.execute / s.total : 0, blade: { ...s.blade } };
}

// 스테이지 한 판: 죽으면 그 방을 retries번까지 다시. 방마다 { 죽은 횟수, 깬 시간, 깼을 때 체력 }
function playStage(kind, seed) {
  const w = createWorld({ seed, stage, hard, tries, kit, char }), bot = createBot(kind, seed, { greedy, ...(picks == null ? {} : { picks: picks === 'none' ? [] : picks.split(',') }) });
  const dist = []; let still = 0, ticks = 0;
  const max = Math.round(minutes * 60 / RULES.dt), rooms = Array.from({ length: w.stage.of }, () => ({ deaths: 0, sec: null, hp: null, reached: false }));
  let k = 0;
  for (; k < max; k++) {
    rooms[w.stage.room].reached = true;
    const input = bot(w);
    step(w, input);
    drainEvents(w);
    if (w.aim && !w.aim.dead && w.stage.phase !== 'reward' && w.stage.phase !== 'door') { ticks++; if (!input.mx && !input.mz) still++; if (k % 12 === 0) dist.push(Math.hypot(w.aim.x - w.player.x, w.aim.z - w.player.z)); }
    if (w.result === 'lose') {
      const r = rooms[w.stage.room];
      r.deaths++;
      if (r.deaths > retries) break;
      restartRoom(w);
    } else if (w.result === 'win') { const r = rooms[w.stage.room]; r.sec = w.time - w.stage.startedAt; r.hp = w.player.hp; break; }
  }
  for (const t of w.stage.times) { rooms[t.room - 1].sec = t.sec; rooms[t.room - 1].hp = t.hp; }
  const s = w.stats, d = s.dmg, tot = s.total || 1;
  const share = { weapon: (d.weapon + d.salvo + d.burst) / tot, throw: d.throw / tot, shot: (d.shot + d.overdrive) / tot, reflect: d.reflect / tot, blade: d.blade / tot };
  const grade = w.result === 'win' ? gradeOf(RULES.grade[stage], { sec: w.stage.playSec, hits: s.hits, retries: w.stage.retries }) : null;   // 등급은 싸운 시간으로(고르는 시간은 뺀다)
  return { result: w.result ?? 'time', t: k * RULES.dt, rooms, clean: w.result === 'win' && rooms.every(r => r.deaths === 0), parries: s.parries, perfects: s.perfects, hits: s.hits, throws: s.throws, healed: s.healed, gear: w.weapons.on.join('+') || '-', byPattern: s.hitsByPattern,
    share, grade, blade: { ...s.blade }, dist: median(dist), still: ticks ? still / ticks : 0, kit: kitAll(w).join('+') || '-' };
}

const NAMES = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', [RULES.src.laser]: '레이저', [RULES.src.orbs]: '구슬', [RULES.src.combo]: '콤보', [RULES.src.slam]: '박치기', [RULES.src.wave]: '파도', [RULES.src.sword]: '검기', [RULES.src.background]: '바탕', [RULES.src.tail]: '꼬리', [RULES.src.wing]: '날개' };
function median(a) { const b = [...a].sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : 0; }
const t0 = Date.now();
if (stage != null) {
  const SRC = { [RULES.src.shooter]: '사수', [RULES.src.charger]: '돌격', [RULES.src.mortar]: '포격', [RULES.src.shieldMob]: '방패', [RULES.src.bomber]: '자폭', [RULES.src.waller]: '장벽', [RULES.src.spinner]: '회전포', [RULES.src.tide]: '밀물' };
  console.log(`스테이지 ${stage}, seeds ${seeds}, ${minutes}분 상한, 방마다 다시 ${retries}번까지${hard ? ', hard' : ''}${tries && tries.length ? `, 켠 것 ${tries}` : ', 예전 판'}`);
  for (const kind of kinds) {
    const games = [];
    for (let seed = 1; seed <= seeds; seed++) games.push(playStage(kind, seed));
    const n = games[0].rooms.length, cols = [];
    for (let r = 0; r < n; r++) {
      const reached = games.filter(g => g.rooms[r].reached), first = reached.filter(g => g.rooms[r].deaths === 0 && g.rooms[r].sec != null), done = reached.filter(g => g.rooms[r].sec != null);
      cols.push(`방${r + 1} 첫시도 ${first.length}/${reached.length} · ${median(done.map(g => g.rooms[r].sec)).toFixed(0)}초 · 체력 ${median(done.map(g => g.rooms[r].hp)).toFixed(0)}`);
    }
    const hitsP = {};
    for (const g of games) for (const [id, c] of Object.entries(g.byPattern)) if (SRC[id]) hitsP[SRC[id]] = (hitsP[SRC[id]] || 0) + c;
    const wins = games.filter(g => g.result === 'win');
    console.log(`${kind.padEnd(6)} 끝까지 ${wins.length}/${games.length}(다시 없이 ${games.filter(g => g.clean).length}) · 전체 ${median(wins.map(g => g.t)).toFixed(0)}초 · 패링 ${median(games.map(g => g.parries)).toFixed(0)} 던지기 ${median(games.map(g => g.throws)).toFixed(0)} 회복 ${median(games.map(g => g.healed)).toFixed(0)} 맞음 ${median(games.map(g => g.hits)).toFixed(0)}`);
    console.log(`       ${cols.join(' | ')}`);
    const pct = v => (v * 100).toFixed(0) + '%', mid = key => median(games.map(g => g.share[key]));
    const grades = wins.map(g => g.grade), gmid = grades.length ? GRADES[Math.round(median(grades.map(g => GRADES.indexOf(g))))] : '-';
    console.log(`       피해 몫: 무기 ${pct(mid('weapon'))} · 던지기·저격 ${pct(mid('throw'))} · 평타 ${pct(mid('shot'))} · 받아친 것 ${pct(mid('reflect'))}${char === 'sword' ? ` · 베기 ${pct(mid('blade'))}(일섬 ${median(games.map(g => g.blade.slash)).toFixed(0)} 회전 ${median(games.map(g => g.blade.spin)).toFixed(0)} 마무리 ${median(games.map(g => g.blade.finish)).toFixed(0)})` : ''} | 등급 ${gmid}(${GRADES.map(g => `${g}${grades.filter(x => x === g).length}`).reverse().join(' ')}) | 선 거리 ${median(games.map(g => g.dist)).toFixed(1)} U · 서 있음 ${pct(median(games.map(g => g.still)))}`);
    console.log(`       낀 것(판마다): ${games.map(g => g.kit).join(' | ')}`);
    console.log(`       몬스터에게 맞음/판: ${Object.entries(hitsP).map(([k2, v]) => `${k2} ${(v / games.length).toFixed(1)}`).join(' ') || '-'}`);
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}초`);
  process.exit(0);
}
const rows = [];
for (const kind of kinds) {
  const games = [];
  for (let seed = 1; seed <= seeds; seed++) games.push(playOne(kind, seed));
  const wins = games.filter(g => g.result === 'win');
  const hitsP = {}, runsP = {};
  for (const g of games) { for (const [id, n] of Object.entries(g.byPattern)) hitsP[id] = (hitsP[id] || 0) + n; for (const [id, n] of Object.entries(g.runs)) runsP[id] = (runsP[id] || 0) + n; }
  const S = RULES.src, perGame = [S.orbs, S.background];
  const ids = [...new Set([...Object.keys(runsP), ...Object.keys(hitsP)].map(Number))].sort((a, b) => a - b);
  const perPattern = ids.map(id => perGame.includes(id) ? `${NAMES[id]}:${((hitsP[id] || 0) / games.length).toFixed(1)}/판` : runsP[id] ? `${NAMES[id] ?? id}:${((hitsP[id] || 0) / runsP[id]).toFixed(2)}` : '').filter(Boolean).join(' ');
  rows.push({
    kind, win: `${wins.length}/${games.length}`,
    len: median(games.map(g => g.t)).toFixed(0), winLen: wins.length ? median(wins.map(g => g.t)).toFixed(0) : '-',
    hits: median(games.map(g => g.hits)).toFixed(0), share: (median(games.map(g => g.share)) * 100).toFixed(0) + '%',
    perfect: median(games.map(g => g.perfects)).toFixed(0), parry: median(games.map(g => g.parries)).toFixed(0),
    graze: median(games.map(g => g.grazes)).toFixed(0), bossLeft: (median(games.map(g => g.bossHp)) * 100).toFixed(0) + '%',
    perPattern,
    store: store ? `던지기 ${median(games.map(g => g.throws)).toFixed(0)} 회복 ${median(games.map(g => g.healed)).toFixed(0)} 던진 피해 몫 ${(median(games.map(g => g.throwShare)) * 100).toFixed(0)}% 남은 체력 ${median(games.map(g => g.hpLeft)).toFixed(0)} · 그로기 ${median(games.map(g => g.groggies)).toFixed(0)} 금 패링 경직 ${median(games.map(g => g.stuns)).toFixed(0)} · 평타 ${(median(games.map(g => g.shotShare)) * 100).toFixed(0)}% 처형 ${(median(games.map(g => g.execShare)) * 100).toFixed(0)}%${char === 'sword' ? ` · 베기 ${(median(games.map(g => g.bladeShare)) * 100).toFixed(0)}% 일섬 ${median(games.map(g => g.blade.slash)).toFixed(0)} 회전 ${median(games.map(g => g.blade.spin)).toFixed(0)} 마무리 ${median(games.map(g => g.blade.finish)).toFixed(0)}` : ''}` : '',
    parts: boss === 'dragon' ? (() => { const S = RULES.src, n = games.length, sum = ids => ids.reduce((a, id) => a + (runsP[id] || 0), 0) / n;
      return `머리 ${sum([1, 2, 3, 4, 6, 8]).toFixed(1)} 날개 ${sum([7, S.wing]).toFixed(1)} 꼬리 ${sum([S.tail]).toFixed(1)} 몸 ${sum([S.slam, S.wave, S.combo]).toFixed(1)}`; })() : '',
    zones: boss === 'dragon' ? (() => { const t = { front: 0, side: 0, back: 0 }; for (const g of games) for (const k in t) t[k] += g.zones[k]; const all = t.front + t.side + t.back || 1; return `앞 ${(t.front / all * 100).toFixed(0)}% 옆 ${(t.side / all * 100).toFixed(0)}% 뒤 ${(t.back / all * 100).toFixed(0)}%`; })() : '',
  });
}
console.log(`seeds ${seeds}, ${minutes}분 상한${heal ? ', heal' : ''}${phase === 2 ? ', 2단계부터' : ''}${immortal ? ', 죽지 않음' : ''}${gear !== 'none' ? `, 무기 ${gear}` : ''}${boss !== 'ranged' ? `, 보스 ${boss}` : ''}${store ? ', 모아 던지기' : ''}${hard ? ', hard' : ''}${tries && tries.length ? `, 켠 것 ${tries}` : ', 예전 판'}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log('종류    승/판  길이  이긴길이 맞음 패링몫 완벽 패링 스침 보스남음  출처별 맞음/번(구슬·바탕은 /판)');
for (const r of rows) console.log(`${r.kind.padEnd(7)} ${r.win.padStart(5)} ${r.len.padStart(5)} ${r.winLen.padStart(7)} ${r.hits.padStart(4)} ${r.share.padStart(5)} ${r.perfect.padStart(4)} ${r.parry.padStart(4)} ${r.graze.padStart(4)} ${r.bossLeft.padStart(6)}   ${r.perPattern}${r.zones ? `  [${r.zones} · 부위별 공격/판 ${r.parts}]` : ''}${r.store ? `  [${r.store}]` : ''}`);
