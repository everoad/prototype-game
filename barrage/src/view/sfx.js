// 효과음 합성(Web Audio, proto-game Sfx처럼 코드로). 실시간 AudioContext와 OfflineAudioContext(녹화)에 같은 코드.
// 음량은 LOOK.sound.db[이름] 한 표(코드에 음량 숫자 없음). 사격음은 가장 작게 — 맞는 소리가 주인공(§4.3).
export function createSfx(ctx, LOOK) {
  const master = ctx.createGain();
  // 겹치는 소리가 찢어지지 않게 마지막에 압축기(리미터처럼)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); let s = 22222; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 2147483648) - 1; } }
  const dbToGain = db => Math.pow(10, db / 20);
  const vol = name => dbToGain(LOOK.sound.db?.[name] ?? -12);
  let collect = null;                 // play() 동안 만든 소스를 모은다(stop용)
  const playing = new Map();          // 이름 → 마지막으로 울린 소스들

  function env(g, when, dur, peak, attack = 0.004) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  }
  function tone(when, type, f0, f1, dur, peak, detune = 0, out = master) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, when);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, when + dur);
    env(g, when, dur, peak);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + dur + 0.02);
    collect?.push(o);
  }
  function noise(when, dur, peak, filter = 'bandpass', f0 = 2000, f1 = f0, q = 1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = filter; f.Q.value = q;
    f.frequency.setValueAtTime(f0, when);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, when + dur);
    env(g, when, dur, peak, 0.003);
    s.connect(f).connect(g).connect(master);
    s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.02);
    collect?.push(s);
  }
  // 쇳소리: 어긋난 배음 몇 개가 빨리 사그라든다
  function metal(when, base, dur, peak, detune) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.28], [8.9, 0.12]]) tone(when, 'sine', base * ratio, base * ratio, dur / Math.sqrt(ratio), peak * amp, detune);
    noise(when, 0.04, peak * 0.5, 'highpass', 4000);
  }

  const SOUNDS = {
    shot: (t, v) => noise(t, 0.025, v, 'highpass', 5000),
    hit1: (t, v) => tone(t, 'sine', 320, 160, 0.05, v),
    hit2: (t, v) => { tone(t, 'sine', 300, 120, 0.07, v); noise(t, 0.04, v * 0.5, 'lowpass', 1500); },
    hit3: (t, v) => { tone(t, 'sine', 260, 90, 0.11, v); noise(t, 0.07, v * 0.8, 'lowpass', 2200); },
    swish: (t, v) => noise(t, 0.08, v, 'bandpass', 1800, 6000, 2),
    tick: (t, v) => tone(t, 'square', 1700, 1700, 0.025, v),
    clang: (t, v, o) => metal(t, 950, 0.28, v, o.detune || 0),
    clangPerfect: (t, v, o) => { metal(t, 1150, 0.5, v, o.detune || 0); tone(t, 'sine', 2300, 2300, 0.6, v * 0.25, o.detune || 0); },
    parryFail: (t, v) => tone(t, 'square', 150, 110, 0.1, v),
    thump: (t, v, o) => { tone(t, 'sine', 110, 50, 0.22, v, o.detune || 0); noise(t, 0.08, v * 0.6, 'lowpass', 900); },
    graze: (t, v, o) => tone(t, 'sine', 2600, 2600, 0.035, v, o.detune || 0),
    ping: (t, v) => { tone(t, 'sine', 1760, 1760, 0.16, v); tone(t, 'sine', 3520, 3520, 0.08, v * 0.3); },
    pingGold: (t, v) => { tone(t, 'sine', 880, 880, 0.32, v); tone(t, 'sine', 1320, 1320, 0.26, v * 0.6); },
    whoosh: (t, v) => noise(t, 0.16, v, 'bandpass', 600, 2400, 1.2),
    whooshNear: (t, v) => { noise(t, 0.16, v, 'bandpass', 700, 3000, 1.2); tone(t + 0.04, 'sine', 2400, 3200, 0.12, v * 0.35); },
    hurt: (t, v) => { noise(t, 0.14, v, 'lowpass', 2500, 600); tone(t, 'sawtooth', 120, 70, 0.16, v * 0.5); },
    charge: (t, v, o) => {
      const c = o.color;
      if (c === 'white') tone(t, 'sine', 600, 1250, 0.35, v);
      else if (c === 'gold') { tone(t, 'sine', 500, 1000, 0.35, v); tone(t, 'sine', 750, 1500, 0.35, v * 0.4); }
      else if (c === 'red') tone(t, 'sawtooth', 180, 380, 0.35, v * 0.6);
      else tone(t, 'triangle', 300, 480, 0.3, v * 0.6);
    },
    rushCharge: (t, v) => { noise(t, 0.35, v, 'bandpass', 300, 2500, 1); tone(t, 'sawtooth', 90, 200, 0.35, v * 0.4); },
    rushArrive: (t, v) => { tone(t, 'sine', 70, 40, 0.3, v); noise(t, 0.2, v * 0.7, 'lowpass', 800); },
    swing: (t, v) => noise(t, 0.12, v, 'bandpass', 900, 2600, 1.5),
    slam: (t, v) => { tone(t, 'sine', 60, 35, 0.4, v); noise(t, 0.3, v * 0.8, 'lowpass', 600); },
    counterChance: (t, v) => { [660, 880, 1320].forEach((f, k) => tone(t + k * 0.06, 'triangle', f, f, 0.3, v)); },
    fullCounter: (t, v) => { noise(t, 0.12, v, 'bandpass', 400, 4000, 2); tone(t, 'sine', 400, 1600, 0.15, v * 0.6); },
    execute: (t, v) => { tone(t, 'sine', 80, 40, 0.7, v); metal(t, 600, 0.8, v * 0.6, 0); },
    groggy: (t, v) => tone(t, 'sine', 90, 45, 0.6, v),
    wake: (t, v) => tone(t, 'sawtooth', 110, 90, 0.22, v),
    roar: (t, v) => { tone(t, 'sawtooth', 85, 60, 0.9, v); noise(t, 0.9, v * 0.5, 'lowpass', 500); },
    death: (t, v) => { tone(t, 'sine', 70, 25, 1.4, v); noise(t, 1.0, v * 0.6, 'lowpass', 1200, 200); },
    clear: (t, v) => noise(t, 0.3, v, 'highpass', 6000, 9000),
    laserCharge: (t, v) => { tone(t, 'sawtooth', 110, 440, 0.5, v * 0.6); tone(t, 'sine', 220, 880, 0.5, v * 0.5); },
    laserBeam: (t, v) => { noise(t, 0.8, v, 'bandpass', 1400, 900, 3); tone(t, 'sawtooth', 160, 150, 0.8, v * 0.45); },
    slamWall: (t, v) => { tone(t, 'sine', 55, 28, 0.5, v); noise(t, 0.35, v * 0.9, 'lowpass', 900, 300); },
    orb: (t, v) => tone(t, 'sine', 640, 520, 0.05, v),
    shield: (t, v) => { tone(t, 'sine', 420, 840, 0.25, v); noise(t, 0.2, v * 0.4, 'highpass', 3000, 6000); },
    shieldBlock: (t, v) => tone(t, 'sine', 1900, 1700, 0.03, v),
    bomb: (t, v) => { tone(t, 'sine', 95, 30, 0.8, v); noise(t, 0.7, v * 0.9, 'lowpass', 1600, 200); tone(t, 'sawtooth', 160, 60, 0.5, v * 0.4); },
    pickup: (t, v) => { tone(t, 'triangle', 880, 880, 0.08, v); tone(t + 0.07, 'triangle', 1320, 1320, 0.12, v); },
    itemSpawn: (t, v) => tone(t, 'sine', 660, 700, 0.15, v),
    missile: (t, v) => noise(t, 0.12, v, 'bandpass', 1200, 3000, 2),
    beam: (t, v) => { tone(t, 'sawtooth', 520, 500, 0.35, v * 0.5); noise(t, 0.35, v * 0.5, 'highpass', 4000); },
    burst: (t, v) => noise(t, 0.05, v, 'highpass', 3000),
    drone: (t, v) => tone(t, 'square', 1400, 1400, 0.02, v),
    gearWake: (t, v) => { tone(t, 'triangle', 660, 990, 0.12, v); tone(t + 0.05, 'sine', 1320, 1320, 0.1, v * 0.5); },
    salvo: (t, v) => { for (let k = 0; k < 6; k++) noise(t + k * 0.03, 0.12, v * 0.6, 'bandpass', 1000, 3200, 2); },
    bigBeam: (t, v) => { tone(t, 'sawtooth', 220, 180, 1.5, v * 0.5); noise(t, 1.5, v * 0.5, 'bandpass', 2400, 1600, 1.5); },
    swarm: (t, v) => { for (let k = 0; k < 4; k++) tone(t + k * 0.04, 'square', 1200 + k * 200, 1600 + k * 200, 0.08, v * 0.5); },
    heartbeat: (t, v) => { tone(t, 'sine', 62, 44, 0.13, v); tone(t + 0.19, 'sine', 56, 40, 0.15, v * 0.7); },
    shatter: (t, v, o) => { noise(t, 0.22, v, 'bandpass', 2600, 500, 1.2); tone(t, 'sine', 120, 50, 0.25, v * 0.8, o.detune || 0); },
    // 모아 던지기(§4.11): 착(모임) · 가득 · 던짐 · 명중(음이 오름) · 마지막 한 발 · 회복
    store: (t, v, o) => { tone(t, 'triangle', 780, 1170, 0.07, v, o.detune || 0); noise(t, 0.02, v * 0.5, 'highpass', 5000); },
    storeFull: (t, v) => { tone(t, 'triangle', 1320, 1320, 0.09, v); tone(t + 0.07, 'triangle', 1760, 1760, 0.14, v); },
    throw: (t, v) => { noise(t, 0.2, v, 'bandpass', 500, 3400, 1.5); tone(t, 'sawtooth', 180, 620, 0.16, v * 0.5); },
    throwHit: (t, v, o) => { tone(t, 'sine', 190, 95, 0.13, v, o.detune || 0); noise(t, 0.05, v * 0.5, 'highpass', 3200); },
    throwBoom: (t, v) => { tone(t, 'sine', 75, 30, 0.55, v); noise(t, 0.28, v * 0.7, 'lowpass', 1400, 300); tone(t, 'triangle', 880, 440, 0.25, v * 0.3); },
    heal: (t, v) => { [660, 880, 1320].forEach((f, k) => tone(t + k * 0.06, 'sine', f, f, 0.22, v * (1 - k * 0.2))); },
    execShot: (t, v, o) => { noise(t, 0.07, v, 'bandpass', 2600, 700, 2); tone(t, 'square', 260, 120, 0.09, v * 0.4, o.detune || 0); },
  };

  return {
    play(name, o = {}) {
      const fn = SOUNDS[name];
      if (!fn) return;
      collect = [];
      fn(ctx.currentTime + (o.when ?? 0) + (o.delay ?? 0), vol(name), o);
      playing.set(name, collect); collect = null;
    },
    // 그 이름으로 마지막에 울린 소리를 지금 끊는다(끊긴 레이저)
    stop(name) {
      for (const s of playing.get(name) ?? []) { try { s.stop(ctx.currentTime); } catch { /* 이미 끝남 */ } }
      playing.delete(name);
    },
    // 줄이기: 다른 소리를 db만큼 sec 동안(완벽 패링 직전 정적)
    duck(db, sec, at = 0) {
      const t = ctx.currentTime + at;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(dbToGain(db), t);
      master.gain.setValueAtTime(dbToGain(db), t + sec);
      master.gain.linearRampToValueAtTime(1, t + sec + 0.05);
    },
    names: Object.keys(SOUNDS),
    ctx,
  };
}
