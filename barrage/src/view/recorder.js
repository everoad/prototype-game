// 녹화(?record=초&fps=): 실제 시간 대신 프레임마다 정확히 speed / fps초씩(× 정지·느려짐 배율) 판을 돌리고,
// WebGL 화면 + HUD 캔버스를 합쳐 PNG로 서버에 보낸다(POST /frame?n=, 끝나면 POST /done). tools/record.ps1이 mp4로 묶는다.
// frame(now, dtReal) = 한 장 그리기(사건 처리 포함) — main.js가 실시간 루프와 같은 함수를 준다. now = 가상 실제 시간(초).
// 소리: 녹화 중 play/duck을 { name, t, ... }로 적어 두었다가(sfx = recordingSfx), 끝에 같은 합성 코드로 OfflineAudioContext에 그려 wav로 보낸다.
export function recordingSfx(clock) {
  const log = [];
  return {
    log,
    play(name, o = {}) { log.push({ kind: 'play', name, t: clock() + (o.delay ?? 0) + (o.when ?? 0), detune: o.detune ?? 0, color: o.color }); },
    duck(db, sec) { log.push({ kind: 'duck', t: clock(), db, sec }); },
  };
}

export async function renderWav(log, seconds, createSfx, LOOK, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
  const sfx = createSfx(ctx, LOOK);
  for (const e of log) {
    if (e.t >= seconds) continue;
    if (e.kind === 'play') sfx.play(e.name, { when: e.t, detune: e.detune, color: e.color });
    else sfx.duck(e.db, e.sec, e.t);
  }
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

// 16비트 PCM wav
function encodeWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, bytes = 44 + n * ch * 2, dv = new DataView(new ArrayBuffer(bytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}

export async function record({ seconds, fps, frame, canvases, beforeDone = null, view = null }) {
  const total = Math.round(seconds * fps);
  const [first] = canvases;
  const comp = document.createElement('canvas');
  comp.width = first.width; comp.height = first.height;
  const g = comp.getContext('2d');
  const log = msg => fetch('/log', { method: 'POST', body: String(msg) }).catch(() => {});
  window.addEventListener('error', e => log(`error ${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', e => log(`rejection ${e.reason?.stack ?? e.reason}`));
  view?.renderer?.getContext?.().canvas?.addEventListener('webglcontextlost', () => log('webgl context lost'));
  // 보내기는 실패하면 몇 번 다시(헤드리스 Edge에서 가끔 'Failed to fetch' — 그대로 두면 녹화가 멈춘다)
  const post = async (url, body) => {
    for (let k = 0; ; k++) {
      try { const r = await fetch(url, { method: 'POST', body }); if (r.ok) return; } catch (e) { if (k >= 8) throw e; }
      if (k >= 8) throw new Error(`POST ${url} 실패`);
      await new Promise(res => setTimeout(res, 100 * (k + 1)));
    }
  };
  for (let f = 0; f < total; f++) {
    try { frame(f / fps, 1 / fps); } catch (e) { log(`frame ${f}: ${e.stack ?? e}`); }
    if (f % 60 === 0) log(`frame ${f}`);
    g.clearRect(0, 0, comp.width, comp.height);
    for (const c of canvases) g.drawImage(c, 0, 0, comp.width, comp.height);
    const blob = await new Promise(res => comp.toBlob(res, 'image/png'));
    await post(`/frame?n=${f}`, blob);
  }
  if (beforeDone) { try { const extra = await beforeDone(); if (extra) await post('/audio', extra); } catch (e) { log(`audio: ${e.stack ?? e}`); } }
  await post('/done', '');
}
