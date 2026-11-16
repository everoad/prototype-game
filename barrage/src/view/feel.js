// sim 사건 → 시간(정지·느려짐)·카메라·연출·소리(§6 표의 줄마다 한 가지). 순수 — 받은 객체의 메서드만 부른다(Node에서 가짜로 시험).
// 원칙: 누름이 먼저 보이고(같은 프레임), 보상이 더 크게 보인다. 탄 패링은 화면을 멈추지 않는다(받은 탄만 멈춤, sim).
import { K, RULES } from '../sim/rules.js';
import { rayInBoard } from './warp.js';

export function createFeel({ timeFx, camera, fx, sfx, actors, hud, LOOK }) {
  const st = { lastPerfectAt: -1e9, grazeAt: -1e9, grazeN: 0, firedAt: null, hit: { n: 0, start: 0 }, slamFrom: null, throwHits: 0, later: [], beatAt: -1e9, pillarAt: -1e9, burnAt: -1e9, blockAt: -1e9, spawnAt: -1e9, puffAt: -1e9, puffBgAt: -1e9, bossHpR: null, charged: false, auraAt: -1e9 };
  const F = () => LOOK.feel, on = k => F().on[k] !== false;
  const stop = (now, sec, opt) => (on('stop') ? timeFx.hitstop(now, sec, opt) : 0);
  const slow = (now, s, sec, opt) => on('slow') && timeFx.slow(now, s, sec, opt);
  const shake = (px, sec) => on('shake') && camera.shake(px, sec);

  function perfectPackage(now, withStop = true) {
    const P = F().perfectBullet;
    if (now - st.lastPerfectAt < P.gap) { st.lastPerfectAt = now; return false; }   // 이어지는 완벽: 박자 유지(정지·느려짐 생략)
    st.lastPerfectAt = now;
    if (withStop) stop(now, P.stop);
    slow(now, P.slow, P.slowSec);
    if (on('punch')) camera.punch(P.punch, P.punchSec);
    if (on('edge')) fx.aberration(P.aberrPx, P.aberrSec);
    sfx.duck(P.duckDb, P.duckSec);
    return true;
  }

  function flushHits(now) {
    const h = st.hit;
    if (h.n > 0 && now - h.start >= F().hitTiers.window - 1e-9) {
      const tier = h.n <= 2 ? 1 : h.n <= 4 ? 2 : 3;
      sfx.play(`hit${tier}`);
      if (tier === 3) actors.bossJolt?.(now, 0.08);
      h.n = 0;
    }
  }

  function handle(events, now) {
    flushHits(now);
    // 예약해 둔 연출(보스가 부서지는 파편 등) — 실제 시간으로
    for (let k = st.later.length - 1; k >= 0; k--) if (now >= st.later[k].at) { const it = st.later[k]; st.later.splice(k, 1); it.fn(now); }
    let pinged = new Set();
    for (const e of events) {
      switch (e.type) {
        case 'parryStart': actors.ringFlash(now); sfx.play('swish'); break;
        case 'denied':
          sfx.play('tick');
          if (e.what === 'dodge' && e.why === 'charges') hud.shakePips(now);
          else if (e.what === 'shield' || e.what === 'bomb' || e.what === 'skill') hud.shakeStock?.(now, e.what);
          else if (e.what === 'throw') hud.shakeStock?.(now, 'store');   // 던질 것이 없음·못 던지는 때   // 사용권 칸이 흔들림(몸 어둡게는 패링·회피 잠김 뜻)
          else actors.dim(now);
          break;
        case 'parry': {
          if (e.kind === 'melee') {
            const M = F().parryMelee;
            stop(now, e.perfect ? M.stopPerfect : M.stop);
            shake(M.shakePx, M.shakeSec);
            if (e.perfect) perfectPackage(now, false);   // 근접은 위 정지 0.09가 이미 정지다
            fx.flashAt(e.x, e.z, e.gold ? 'gold' : 'white');
            sfx.play(e.perfect ? 'clangPerfect' : 'clang', e.perfect ? { delay: F().perfectBullet.hush } : {});
            break;
          }
          const B = F().parryBullet;
          if (e.first) { shake(B.shakePx, B.shakeSec); fx.flashAt(e.x, e.z, e.gold ? 'gold' : 'white'); }
          const detune = Math.min(B.chainMax, (e.chain - 1) * B.chainCent);
          if (e.perfect && e.first && perfectPackage(now)) sfx.play('clangPerfect', { delay: F().perfectBullet.hush, detune });
          else sfx.play('clang', { detune });
          break;
        }
        case 'parryFail': sfx.play('parryFail'); actors.dim(now); break;
        case 'reflectHit': {
          const R = F().reflectHit;
          actors.bossJolt?.(now, R.flinch);
          if (on('sparks')) fx.burst(e.x, e.z, 'cyan', e.perfect ? 1.6 : 1);
          if (on('numbers')) fx.number(e.x, e.z, e.dmg, 'cyan', e.perfect ? R.numberSize * 1.3 : R.numberSize);
          hud.flashStagger(now);
          if (e.perfect) shake(R.shakePerfect, R.shakeSec);
          sfx.play('thump', { detune: e.perfect ? -200 : 0 });
          break;
        }
        case 'graze': {
          const G = F().graze;
          st.grazeN = now - st.grazeAt < G.chainSec ? st.grazeN + 1 : 0; st.grazeAt = now;
          if (on('sparks')) fx.spark(e.x, e.z, 'white', 0.5);
          sfx.play('graze', { detune: Math.min(G.chainMax, st.grazeN * G.cent) });
          break;
        }
        case 'bossHit':
          if (st.hit.n === 0) st.hit.start = now;
          st.hit.n++;
          if (on('sparks')) fx.spark(e.x, e.z, 'cyan', 0.4);
          break;
        case 'shoot': fx.muzzle?.(e.x, e.z, e.angle); sfx.play('shot'); break;
        case 'hurt': {
          const H = F().hurt;
          stop(now, H.stop);
          shake(H.shakePx, H.shakeSec);
          if (on('edge')) fx.edge('red', H.edgeSec);
          fx.hitMarker(e.bx, e.bz, H.markSec);
          sfx.play('hurt');
          break;
        }
        case 'clear': if (e.n > 0) fx.clearSparkle(e.x, e.z, e.r); if (e.r === Infinity) sfx.play('clear'); break;
        case 'fire':
          if ((e.kind === K.WHITE || e.kind === K.GOLD) && !pinged.has(`${e.kind}:${e.t}`)) { pinged.add(`${e.kind}:${e.t}`); sfx.play(e.kind === K.GOLD ? 'pingGold' : 'ping'); }
          else if (e.kind === K.NORMAL || e.kind === K.RED) {   // 탄 발사 박자: 한 묶음에 한 번(주 패턴은 불꽃·몸 튐까지, 바탕 탄막은 작은 소리만)
            const V = F().volley, bg = e.src === RULES.src.background;
            if (now - (bg ? st.puffBgAt : st.puffAt) >= V.gap) {
              if (bg) st.puffBgAt = now; else st.puffAt = now;
              sfx.play(bg ? 'puffBg' : 'puff', { detune: e.kind === K.RED ? V.redCent : ((e.src ?? 0) % 4) * V.srcCent });
              if (!bg) { if (on('sparks')) fx.spark(e.x, e.z, e.kind === K.RED ? 'red' : 'purple', V.spark); actors.bossKick?.(now); }
            }
          }
          break;
        case 'dodge': actors.dodgeTrail?.(now, false); sfx.play('whoosh'); break;
        case 'nearMiss': actors.dodgeTrail?.(now, true); sfx.play('whooshNear'); break;
        case 'counterChance': { const C = F().counter; slow(now, C.slow, C.slowSec); if (on('edge')) fx.edge('gold', C.edgeSec); sfx.play('counterChance'); break; }
        case 'fullCounter': {
          const FC = F().fullCounter;
          if (e.stage === 'in') { stop(now, FC.stop, { override: true }); if (on('edge')) fx.edge('cyan', FC.edgeSec); actors.dashTrail?.(now); sfx.play('fullCounter'); }
          else if (e.stage === 'volley') { camera.kick(FC.kickPx, 0, 0.15); shake(FC.shakePx, FC.shakeSec); if (on('numbers')) fx.number(e.x, e.z, RULES.fullCounter.dmg, 'cyan', 34); actors.bossJolt?.(now, 0.3); sfx.play('thump', { detune: -500 }); }
          else { actors.dashTrail?.(now); sfx.play('whoosh'); }
          break;
        }
        case 'groggy': { const G = F().groggy; stop(now, G.stop, { override: true }); if (on('punch')) camera.punch(G.punch, G.punchSec); shake(G.shakePx, G.shakeSec); if (on('numbers')) fx.number(e.x, e.z, '무너짐', 'orange', 34); sfx.play('execute'); break; }
        case 'wake': sfx.play('wake'); actors.bossJolt?.(now, 0.1); break;
        case 'windup': sfx.play('charge', { color: e.color }); break;
        case 'rushStart': sfx.play('rushCharge'); break;
        case 'rushArrive': { const R = F().rush; camera.kick(0, -R.kickPx, R.kickSec); shake(R.arriveShake, R.arriveSec); fx.dust(e.x, e.z, 1.2); sfx.play('rushArrive'); break; }
        case 'meleeHit': if (e.shape === 'circle') { const S = F().slam; shake(S.shakePx, S.shakeSec); fx.dust(e.x, e.z, 1.6); sfx.play('slam'); } else sfx.play('swing'); break;
        // 장판 공격: 패링·맞음·아슬아슬은 parry·hurt·nearMiss 사건이 맡고, 여기는 덧붙이는 것만
        case 'slamHit':
          if (e.outcome === 'parry' || e.outcome === 'perfect') { const S = F().slamParry; actors.bossJolt?.(now, S.jolt); shake(S.shakePx, S.shakeSec); }
          break;
        case 'slamStart': st.slamFrom = { x: e.x, z: e.z }; break;
        case 'slamWall': {
          const S = F().slamWall, a = st.slamFrom;
          shake(S.shakePx, S.shakeSec); fx.dust(e.x, e.z, S.dust); sfx.play('slamWall');
          if (a) for (let i = 1; i <= S.dustLine; i++) { const u = i / (S.dustLine + 1); fx.dust(a.x + (e.x - a.x) * u, a.z + (e.z - a.z) * u, S.dustLineSize); }   // 지나간 길 먼지
          st.slamFrom = null;
          break;
        }
        case 'waveStart': { const S = F().wave; shake(S.shakePx, S.shakeSec); fx.dust(e.x, e.z, S.dust); sfx.play('slam'); break; }
        case 'laserAim': sfx.play('laserCharge'); break;
        case 'laserFire': { const S = F().laser; shake(S.shakePx, S.shakeSec); sfx.play('laserBeam'); break; }
        case 'laserCut': sfx.stop?.('laserBeam'); break;
        case 'orbFire': sfx.play('orb'); break;
        case 'hop': sfx.play('whoosh', { detune: -700 }); break;
        case 'tailStart': sfx.play('swing', { detune: -900 }); break;     // 용 꼬리 감기
        case 'wingStart': sfx.play('whoosh', { detune: -400 }); break;    // 용 날개 들기
        // 그로기 처형(§5.8): 바짝 붙어 쏘기(총·활) — 영화처럼
        case 'executeStart': {
          const X = F().execute;
          actors.dashTrail?.(now);   // 소리는 없다 — 정적(§5.8)
          hud.letterbox?.(now, true); camera.hold?.(X.hold, X.holdSec); sfx.duck(X.duckDb, X.duckSec);
          break;
        }
        case 'executeShot': {
          const E = F().execute, a = Math.atan2(e.bz - e.z, e.bx - e.x);
          fx.muzzle?.(e.x, e.z, a); fx.tracer?.(e.x, e.z, e.bx, e.bz, 'cyan');
          if (on('sparks')) fx.spark(e.bx, e.bz, 'cyan', 0.8);
          shake(E.shotShake, E.shotShakeSec);
          actors.bossJolt?.(now, 0.15);
          sfx.play('execShot', { detune: e.i * E.shotCent });
          break;
        }
        case 'executeFinal': {
          const X = F().execute;
          stop(now, X.stop, { override: true });
          fx.tracer?.(e.x, e.z, e.bx, e.bz, 'cyan', 2);
          fx.flashAt(e.bx, e.bz, 'gold'); fx.flashAt(e.bx, e.bz, 'white');
          if (on('sparks')) fx.burst(e.bx, e.bz, 'cyan', X.burst);
          if (on('numbers')) fx.number(e.bx, e.bz, Math.round(e.total ?? e.dmg), 'gold', X.number);   // 처형 피해 합계
          shake(X.shakePx, X.shakeSec);
          slow(now, X.slow, X.slowSec); if (on('edge')) fx.edge('gold', X.edgeSec);
          actors.bossJolt?.(now, 0.6);
          sfx.play('execute'); sfx.play('thump', { detune: -800 });
          break;
        }
        case 'executeEnd': hud.letterbox?.(now, false); camera.release?.(); break;
        // 방패·폭탄·아이템(§4.9)
        case 'shieldOn': sfx.play('shield'); break;
        case 'shieldBlock': if (on('sparks')) fx.spark(e.x, e.z, 'cyan', 0.4); sfx.play('shieldBlock'); break;
        case 'deathbomb': if (on('edge')) fx.edge('cyan', F().bomb.rescueEdge); if (on('numbers')) fx.number(e.x, e.z, '구제', 'cyan', 26); break;
        case 'bomb': {
          const X = F().bomb;
          stop(now, X.stop);
          shake(X.shakePx, X.shakeSec);
          if (on('punch')) camera.punch(X.punch, X.punchSec);
          if (on('sparks')) fx.burst(e.x, e.z, 'cyan', X.burst);
          if (on('numbers') && e.dmg > 0) fx.number(e.bx, e.bz, Math.round(e.dmg), 'cyan', 28);
          sfx.play('bomb');
          break;
        }
        case 'itemSpawn': sfx.play('itemSpawn'); break;
        case 'itemPick': if (on('sparks')) fx.spark(e.x, e.z, 'item', 0.8); sfx.play('pickup'); break;
        // 보조 무기(§4.10): 작게. 산탄은 한 번 패링에 여러 발이라 같은 틱엔 한 번만
        case 'weaponFire':
          if (e.kind === 'burst') {   // 부채 하나에 한 번: 소리 + 부채꼴 불티(첫 발의 각도 = 부채의 왼쪽 끝)
            if (!pinged.has(`burst:${e.t}`)) { pinged.add(`burst:${e.t}`); sfx.play('burst'); const sp = RULES.weapons.burst.spreadDeg * Math.PI / 180; if (on('sparks')) fx.fan?.(e.x, e.z, e.angle + sp / 2, sp); }
          } else {
            sfx.play(e.kind);
            if (on('sparks') && e.kind === 'missile') fx.spark(e.x, e.z, 'cyan', LOOK.guns.missile.launch);
            if (on('sparks') && e.kind === 'drone') fx.spark(e.x, e.z, 'cyan', LOOK.guns.drone.spark);
          }
          break;
        case 'weaponHit': if (on('sparks')) { if (e.kind === 'missile') fx.burst(e.x, e.z, 'cyan', LOOK.guns.missile.hitBurst); else fx.spark(e.x, e.z, 'cyan', 0.3); } break;   // 명중: 미사일은 터지고 작은 탄은 불꽃
        case 'gearToggle': sfx.play('tick'); break;
        case 'weaponWake': sfx.play('gearWake'); if (on('sparks')) fx.spark(e.x, e.z, 'cyan', 0.7); break;   // 받아쳐서 무기가 깨어남
        case 'weaponSkill': {
          const X = F().weaponSkill;
          shake(X.shakePx, X.shakeSec);
          if (on('sparks')) fx.burst(e.x, e.z, 'cyan', 1.2);
          sfx.play({ missile: 'salvo', beam: 'bigBeam', drone: 'swarm' }[e.kind] ?? 'salvo');
          break;
        }
        // 모아 던지기(§4.11): 모임(착, 한 칸마다 음이 오름) → 던짐(큰 순간 + 회복 빛) → 명중(음이 오르다 마지막 한 발)
        case 'storeAdd': {
          const X = F().store;
          fx.tracer?.(e.x, e.z, e.px, e.pz, 'cyan', 0.8);
          if (on('sparks')) fx.spark(e.px, e.pz, 'cyan', 0.6);
          actors.ringFlash?.(now);
          sfx.play('store', { detune: (e.n - 1) * X.storeCent });
          if (e.full) sfx.play('storeFull', { delay: 0.06 });
          break;
        }
        case 'throw': {
          const X = F().store;
          st.throwHits = 0;
          stop(now, X.stop);
          shake(X.shakePx, X.shakeSec);
          if (on('punch')) camera.punch(X.punch, X.punchSec);
          if (on('sparks')) fx.burst(e.x, e.z, 'cyan', X.burst);
          actors.ringFlash?.(now);
          sfx.play('throw');
          if (e.heal > 0) {
            fx.rise?.(e.x, e.z, 'heal', X.healRise);
            if (on('numbers')) fx.number(null, null, `+${Math.round(e.heal)}`, 'heal', X.healNumber);
            if (on('edge')) fx.edge('heal', X.healEdgeSec);
            sfx.play('heal', { delay: 0.05 });
          }
          break;
        }
        case 'throwHit': {
          const X = F().store;
          actors.bossJolt?.(now, e.last ? 0.5 : X.hitJolt);
          hud.flashStagger(now);
          if (on('sparks')) fx.burst(e.x, e.z, 'cyan', e.last ? X.lastBurst : X.hitBurst);
          sfx.play('throwHit', { detune: st.throwHits * X.hitCent });
          st.throwHits++;
          if (e.last) {
            stop(now, X.lastStop);
            shake(X.lastShake, X.lastShakeSec);
            fx.flashAt(e.x, e.z, 'white'); fx.flashAt(e.x, e.z, 'cyan');
            if (on('numbers')) fx.number(e.x, e.z, Math.round(e.total), 'cyan', X.number);
            sfx.play('throwBoom');
          }
          break;
        }
        case 'phase': {   // 2단계 넘어감: 싸움의 고비 — 정지·당김·자주 파편과 가장자리·큰 글자·보스 몸이 부푼다
          const P = F().phase;
          stop(now, P.stop, { override: true });
          shake(P.shakePx, P.shakeSec);
          if (on('punch')) camera.punch(P.punch, P.punchSec);
          if (on('sparks') && e.x != null) fx.burst(e.x, e.z, 'purple', P.burst);
          if (on('edge')) fx.edge('purple', P.edgeSec);
          hud.banner?.(now, `${e.n}단계`, P.bannerSec);
          actors.bossPulse?.(now);
          sfx.play('roar');
          break;
        }
        case 'bossDeath': {   // 승리: 정지·느려짐 + 카메라 당김, 금빛 가장자리, 금이 가며 파편이 몇 번 터지고 마지막에 크게
          const D = F().death;
          stop(now, D.stop, { override: true }); slow(now, D.slow, D.slowSec); shake(D.shakePx, D.shakeSec);
          fx.burst(e.x, e.z, 'orange', 3); sfx.play('death');
          camera.hold?.(D.hold, D.holdSec);
          if (on('edge')) fx.edge('gold', D.edgeSec);
          D.chunks.forEach((t, k) => st.later.push({ at: now + t, fn: () => {
            const a = k * 2.4, d = 0.9;
            fx.burst(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d, k % 2 ? 'purple' : 'orange', D.chunkBurst);
            shake(D.chunkShake, 0.12); sfx.play('shatter', { detune: k * 150 });
          } }));
          st.later.push({ at: now + D.chunks.at(-1) + D.finalAfter, fn: () => {
            fx.burst(e.x, e.z, 'gold', D.finalBurst); fx.burst(e.x, e.z, 'orange', D.finalBurst * 0.7); fx.flashAt(e.x, e.z, 'gold');
            shake(D.finalShake, 0.35); sfx.play('shatter', { detune: -500 }); sfx.play('slamWall');
          } });
          break;
        }
        case 'playerDeath': {   // 패배: 느려짐·청록 파편·붉은 가장자리, 몸이 사라진다
          const P = F().playerDeath;
          stop(now, P.stop, { override: true }); slow(now, P.slow, P.slowSec); shake(P.shakePx, P.shakeSec);
          if (e.x != null) fx.burst(e.x, e.z, 'cyan', P.burst);
          if (on('edge')) fx.edge('red', P.edgeSec);
          actors.playerDown?.(now);
          sfx.play('death');
          break;
        }
        case 'heal': if (on('numbers')) fx.number(null, null, `+${e.amount}`, 'cyan', 18); break;
        // ── 스테이지: 일반 몬스터·방
        case 'mobHit':
          if (st.hit.n === 0) st.hit.start = now;
          st.hit.n++;
          if (on('sparks')) fx.spark(e.x, e.z, 'cyan', 0.4);
          break;
        case 'mobBlock': if (now - st.blockAt >= F().stage.blockGap) { st.blockAt = now; if (on('sparks')) fx.spark(e.x, e.z, 'purple', 0.5); sfx.play('shieldBlock'); } break;
        case 'mobSpawn': if (now - st.spawnAt >= F().stage.spawnGap) { st.spawnAt = now; sfx.play('mobSpawn'); } break;
        case 'mobWindup': sfx.play('charge', { color: e.color }); break;
        case 'mobDash': sfx.play('whoosh', { detune: -500 }); break;
        case 'mobChargeHit': { const S = F().stage; shake(S.dashShake, S.dashShakeSec); fx.dust?.(e.x, e.z, 1); break; }
        case 'mobDeath': { const S = F().stage; if (on('sparks')) fx.burst(e.x, e.z, 'purple', S.deathBurst); shake(S.deathShake, S.deathShakeSec); fx.dust?.(e.x, e.z, 0.8); sfx.play('shatter', { detune: 400 }); break; }
        case 'roomStart': { const S = F().stage; hud.banner(now, e.boss ? LOOK.names.ranged : `방 ${e.room} / ${e.of}`, S.roomSec); if (e.room > 1) hud.fadeIn?.(now, S.fade); break; }
        case 'bossEnter': { const S = F().stage; camera.hold?.(S.bossHold, S.bossSec); actors.bossPulse?.(now); sfx.play('roar'); break; }
        case 'roomClear': { const S = F().stage; hud.banner(now, '방 정리!', S.clearSec); if (on('edge')) fx.edge(LOOK.colors.heal, S.clearEdge); sfx.play('heal'); break; }
        case 'rewardPick': {
          const S = F().stage, color = e.kind === 'weapon' ? 'cyan' : e.kind === 'charge' ? 'item' : LOOK.colors.heal;
          if (on('sparks')) fx.burst(e.x, e.z, color, S.pickBurst);
          if (on('numbers')) fx.number(e.x, e.z, LOOK.names.reward[e.what] ?? e.what, color, S.pickNumber);
          sfx.play('pickup');
          break;
        }
        case 'doorOpen': sfx.play('door'); break;
        // ── 실험 기믹(?try=)
        case 'ropeStart': { const T = LOOK.tries; actors.dashTrail?.(now); shake(T.ropeShake, T.ropeShakeSec); sfx.play('whoosh', { detune: 500 }); break; }
        case 'ropeEnd': if (!e.cut) { fx.dust?.(e.x, e.z, 0.7); sfx.play('tick'); } break;
        case 'pillarBlock': if (now - st.pillarAt >= LOOK.tries.blockGap) { st.pillarAt = now; if (on('sparks')) fx.spark(e.x, e.z, e.enemy ? 'purple' : 'cyan', 0.4); } break;
        case 'pillarBreak': fx.dust?.(e.x, e.z, 2); if (on('sparks')) fx.burst(e.x, e.z, 'purple', 1.5); shake(6, 0.15); sfx.play('shatter', { detune: -200 }); break;
        case 'fireStart': sfx.play('puff', { detune: -600 }); break;
        case 'fireBurn': if (now - st.burnAt >= 0.1) { st.burnAt = now; if (on('sparks')) fx.spark(e.x, e.z, 'red', 0.7); } break;
        case 'mineSet': sfx.play('tick'); if (on('sparks')) fx.spark(e.x, e.z, 'cyan', 0.6); break;
        case 'mineBoom': { const T = LOOK.tries; if (on('sparks')) fx.burst(e.x, e.z, 'cyan', T.boomBurst); fx.dust?.(e.x, e.z, 1.4); shake(T.boomShake, T.boomShakeSec); sfx.play('throwBoom'); break; }
        case 'crystalPulse': if (on('sparks')) fx.burst(e.x, e.z, 'white', 2); if (on('numbers') && e.n > 0) fx.number(e.x, e.z, `흰 탄 ${e.n}`, 'white', 22); sfx.play('pingGold'); break;
        case 'swap': actors.dashTrail?.(now); if (on('sparks')) { fx.burst(e.x0, e.z0, 'purple', 1.2); fx.burst(e.x1, e.z1, 'cyan', 1.2); } sfx.play('whoosh', { detune: 800 }); break;
        case 'orbitHit': if (on('sparks')) fx.spark(e.x, e.z, 'cyan', 0.5); break;
        case 'focus': if (e.on) { sfx.play('gearWake'); fx.rise?.(e.x, e.z, 'cyan', 6); } break;
        case 'bubbleOn': sfx.play('shield'); hud.banner(now, '보호막 — 던진 탄만 통한다', 1.4); break;
        case 'bubbleBreak': if (on('sparks')) fx.burst(e.x, e.z, 'purple', 3); shake(12, 0.25); sfx.play('shatter'); if (on('numbers')) fx.number(e.x, e.z, '깨짐', 'cyan', 30); break;
        case 'bubbleOff': sfx.play('gearSleep'); break;
        case 'tideWarn': sfx.play('charge', { color: 'red' }); break;
        case 'tideHit': shake(8, 0.2); sfx.play('slam'); break;
        case 'snipeStart': sfx.play('gearWake'); break;
        case 'snipeCancel': sfx.play('gearSleep'); break;
        case 'snipePick': sfx.play('tick'); break;
        case 'snipeFire': {   // 한 박자 멈췄다가 터진다: 화면 당김·흔들림, 줄을 따라 먼지, 맞은 적에 큰 파편과 숫자(바람 줄·밀림은 triesView·warp가 그린다)
          const Sv = LOOK.tries.snipe, ca = Math.cos(e.angle), sa = Math.sin(e.angle);
          stop(now, Sv.stop, { override: true });
          shake(Sv.shake, Sv.shakeSec); camera.punch?.(Sv.punch[0], Sv.punch[1]);
          sfx.play('snipe');
          const inside = rayInBoard(RULES.board, e.x, e.z, e.angle, RULES.tries.snipe.len);
          if (on('sparks')) for (let k = 1; k <= Sv.dust; k++) fx.dust?.(e.x + ca * inside * k / (Sv.dust + 1), e.z + sa * inside * k / (Sv.dust + 1), 1.3);
          for (const m of e.marks) { if (on('sparks')) fx.burst(m.x, m.z, 'cyan', Sv.hitBurst); if (on('numbers')) fx.number(m.x, m.z, Math.round(m.dmg), 'cyan', Sv.number); }
          break;
        }
        case 'dashHit': { const T = LOOK.tries; if (on('sparks')) fx.burst(e.x, e.z, 'cyan', T.dashBurst); if (on('numbers') && e.dmg > 0) fx.number(e.x, e.z, Math.round(e.dmg), 'cyan', T.dashNumber); sfx.play('thump', { detune: 500 }); break; }
        case 'roomRetry': actors.playerUp?.(); timeFx.reset?.(); hud.fadeIn?.(now, F().stage.fade); break;
        default: break;
      }
    }
  }

  // 상태 연출(사건이 아니라 지금 상태): 체력 위태면 심장 소리가 박자마다
  function tick(w, now) {
    const L = F().lowHp, p = w.player;
    if (!w.result && p.hp > 0 && p.hp <= w.rules.player.hp * L.at && now - st.beatAt >= L.beat) { st.beatAt = now; sfx.play('heartbeat'); }
    // 보스 체력 구간(75%·25%): 지날 때 파편이 떨어진다 — 싸움이 나아가는 것이 보이게
    const b = w.boss;
    if (b) {
      const r = b.hp / b.maxHp, H = F().bossChunks;
      if (st.bossHpR != null && r > 0) for (const th of H.at) if (st.bossHpR > th && r <= th) {
        if (on('sparks')) fx.burst(b.x, b.z, 'purple', H.burst);
        fx.dust?.(b.x, b.z, H.dust); shake(H.shakePx, H.shakeSec); actors.bossJolt?.(now, H.jolt);
        sfx.play('shatter', { detune: -300 });
      }
      st.bossHpR = r;
    }
    // 무기 가동(패링 뒤 몇 초): 켜진 동안 몸에서 청록 알갱이가 오르고, 꺼질 때 소리
    const W = w.weapons, charged = !!W && !w.result && W.on.some(g => g !== 'burst') && w.time < W.chargeUntil, A = F().aura;
    if (st.charged && !charged && !w.result) sfx.play('gearSleep');
    if (charged && now - st.auraAt >= A.every) { st.auraAt = now; fx.rise?.(p.x, p.z, 'cyan', 1); }
    st.charged = charged;
    // 빔이 닿는 곳의 불티
    const Gb = LOOK.guns.beam;
    if (W && w.aim && !w.result && w.time < W.beamUntil && now - (st.beamSparkAt ?? -1e9) >= Gb.sparkEvery) { st.beamSparkAt = now; if (on('sparks')) fx.spark(w.aim.x, w.aim.z, 'cyan', Gb.sparkSize); }
    // 평타·무기의 누적 피해 숫자: 적마다 조금씩 깎인 것을 모아 every초마다 한 번(던지기·저격 같은 큰 한 방은 제 숫자가 있다)
    const Gn = LOOK.guns.number, gun = (st.gun ??= new Map());
    const track = (key, hp, x, z) => {
      const a = gun.get(key) ?? { hp, acc: 0, at: now };
      const drop = a.hp - hp;
      if (drop > 0 && drop < Gn.big) a.acc += drop;
      a.hp = hp;
      if (now - a.at >= Gn.every) { if (a.acc >= Gn.min && on('numbers')) fx.number?.(x, z, Math.round(a.acc), 'cyan', Gn.size); a.acc = 0; a.at = now; }
      gun.set(key, a);
    };
    if (!w.result) {
      for (const m of w.enemies ?? []) if (!m.dead && w.time >= m.bornAt) track(m.id, m.hp, m.x, m.z);
      if (w.boss && !w.boss.away && !w.boss.dead) track('boss', w.boss.hp, w.boss.x, w.boss.z);
      if (gun.size > 96) gun.clear();
    }
  }

  return { tick, handle, flushHits };
}
