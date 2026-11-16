// 화면 없이 봇 판 여러 개(§9): 종류별 승/판, 판 길이 중앙값, 맞은 수, 패링 몫, 완벽 패링, 출처별 맞음.
// 출처(RULES.src): 1~7 패턴 · 레이저 · 구슬 · 콤보 · 박치기 · 파도 · 검기 · 바탕. 구슬·바탕은 판마다 맞음, 나머지는 한 번마다 맞음.
// node prototypes/barrage/tools/botrun.mjs [--kinds 1,some,dodge,walk,turtle] [--seeds 10] [--minutes 6] [--heal] [--phase 2] [--immortal] [--gear all] [--boss dragon] [--store] [--hard]
// --gear all = 보조 무기 다 켬, --phase 2 = 2단계부터, --immortal = 죽지 않음(걷기 봇의 2단계 패턴별 맞음처럼 오래 봐야 할 때 — 승패는 뜻 없음)
import { createWorld, step, drainEvents } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { createBot } from '../src/sim/bot.js';
import { parryShare } from '../src/sim/stats.js';
import { zoneOf } from '../src/sim/dragonBody.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const kinds = opt('kinds', '1,some,dodge,walk,turtle').split(',');   // user = 사용자 판에 맞춘 봇
const store = args.includes('--store'), hard = args.includes('--hard');   // 모아 던지기 변형(§4.11)
const seeds = Number(opt('seeds', 10)), minutes = Number(opt('minutes', 6)), heal = args.includes('--heal');
const phase = Number(opt('phase', 1)), immortal = args.includes('--immortal');
const gear = opt('gear', 'none'), boss = opt('boss', 'ranged');   // 보조 무기(§4.10): all · none · missile,orbit,…

function playOne(kind, seed) {
  const w = createWorld({ seed, heal, phase, gear, boss, store, hard }), bot = createBot(kind, seed);
  if (immortal) w.player.hp = w.player.maxHp = 1e9;
  const runs = {}, max = Math.round(minutes * 60 / RULES.dt), zones = { front: 0, side: 0, back: 0 };
  let k = 0;
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
    }
  }
  const s = w.stats;
  return { result: w.result ?? 'time', t: k * RULES.dt, hits: s.hits, share: parryShare(s), perfects: s.perfects, parries: s.parries, grazes: s.grazes, byPattern: s.hitsByPattern, runs, bossHp: w.boss.hp / w.boss.maxHp, zones, throws: s.throws, healed: s.healed, hpLeft: w.player.hp, throwShare: s.total > 0 ? s.dmg.throw / s.total : 0 };
}

const NAMES = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', [RULES.src.laser]: '레이저', [RULES.src.orbs]: '구슬', [RULES.src.combo]: '콤보', [RULES.src.slam]: '박치기', [RULES.src.wave]: '파도', [RULES.src.sword]: '검기', [RULES.src.background]: '바탕', [RULES.src.tail]: '꼬리', [RULES.src.wing]: '날개' };
const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : 0; };
const t0 = Date.now();
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
    store: store ? `던지기 ${median(games.map(g => g.throws)).toFixed(0)} 회복 ${median(games.map(g => g.healed)).toFixed(0)} 던진 피해 몫 ${(median(games.map(g => g.throwShare)) * 100).toFixed(0)}% 남은 체력 ${median(games.map(g => g.hpLeft)).toFixed(0)}` : '',
    parts: boss === 'dragon' ? (() => { const S = RULES.src, n = games.length, sum = ids => ids.reduce((a, id) => a + (runsP[id] || 0), 0) / n;
      return `머리 ${sum([1, 2, 3, 4, 6, 8]).toFixed(1)} 날개 ${sum([7, S.wing]).toFixed(1)} 꼬리 ${sum([S.tail]).toFixed(1)} 몸 ${sum([S.slam, S.wave, S.combo]).toFixed(1)}`; })() : '',
    zones: boss === 'dragon' ? (() => { const t = { front: 0, side: 0, back: 0 }; for (const g of games) for (const k in t) t[k] += g.zones[k]; const all = t.front + t.side + t.back || 1; return `앞 ${(t.front / all * 100).toFixed(0)}% 옆 ${(t.side / all * 100).toFixed(0)}% 뒤 ${(t.back / all * 100).toFixed(0)}%`; })() : '',
  });
}
console.log(`seeds ${seeds}, ${minutes}분 상한${heal ? ', heal' : ''}${phase === 2 ? ', 2단계부터' : ''}${immortal ? ', 죽지 않음' : ''}${gear !== 'none' ? `, 무기 ${gear}` : ''}${boss !== 'ranged' ? `, 보스 ${boss}` : ''}${store ? ', 모아 던지기' : ''}${hard ? ', hard' : ''}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log('종류    승/판  길이  이긴길이 맞음 패링몫 완벽 패링 스침 보스남음  출처별 맞음/번(구슬·바탕은 /판)');
for (const r of rows) console.log(`${r.kind.padEnd(7)} ${r.win.padStart(5)} ${r.len.padStart(5)} ${r.winLen.padStart(7)} ${r.hits.padStart(4)} ${r.share.padStart(5)} ${r.perfect.padStart(4)} ${r.parry.padStart(4)} ${r.graze.padStart(4)} ${r.bossLeft.padStart(6)}   ${r.perPattern}${r.zones ? `  [${r.zones} · 부위별 공격/판 ${r.parts}]` : ''}${r.store ? `  [${r.store}]` : ''}`);
