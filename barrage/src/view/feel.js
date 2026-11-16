// sim 사건 → 시간(정지·느려짐)·카메라·연출·소리(§6 표의 줄마다 한 가지). 순수 — 받은 객체의 메서드만 부른다(Node에서 가짜로 시험).
// 원칙: 누름이 먼저 보이고(같은 프레임), 보상이 더 크게 보인다. 탄 패링은 화면을 멈추지 않는다(받은 탄만 멈춤, sim).
import { K, RULES } from '../sim/rules.js';

export function createFeel({ timeFx, camera, fx, sfx, actors, hud, LOOK }) {
  const st = { lastPerfectAt: -1e9, grazeAt: -1e9, grazeN: 0, firedAt: null, hit: { n: 0, start: 0 }, slamFrom: null };
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
    let pinged = new Set();
    for (const e of events) {
      switch (e.type) {
        case 'parryStart': actors.ringFlash(now); sfx.play('swish'); break;
        case 'denied':
          sfx.play('tick');
          if (e.what === 'dodge' && e.why === 'charges') hud.shakePips(now);
          else if (e.what === 'shield' || e.what === 'bomb') hud.shakeStock?.(now, e.what);   // 사용권 칸이 흔들림(몸 어둡게는 패링·회피 잠김 뜻)
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
        case 'phase': { const P = F().phase; shake(P.shakePx, P.shakeSec); sfx.play('roar'); break; }
        case 'bossDeath': { const D = F().death; stop(now, D.stop, { override: true }); slow(now, D.slow, D.slowSec); shake(D.shakePx, D.shakeSec); fx.burst(e.x, e.z, 'orange', 3); sfx.play('death'); break; }
        case 'playerDeath': sfx.play('death'); if (on('edge')) fx.edge('red', 1.0); break;
        case 'heal': if (on('numbers')) fx.number(null, null, `+${e.amount}`, 'cyan', 18); break;
        default: break;
      }
    }
  }

  return { handle, flushHits };
}
