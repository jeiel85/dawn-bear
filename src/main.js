// ───────────────────────────── main: loading, audio-clocked playback, controls, debug hooks ─────────────────────────────
const Q = new URLSearchParams(IN_WORKER ? '' : location.search);
const DEBUG = Q.has('debug'), NOAUDIO = Q.has('noaudio');
const $ = (sel) => (IN_WORKER ? null : document.querySelector(sel));
const view = $('#view'), vctx = view ? view.getContext('2d') : null;
const overlay = $('#overlay'), msgEl = $('#msg'), barEl = $('#bar > i'), toastEl = $('#toast');
const SB = IN_WORKER ? {} : (window.SB = { isReady: false, canvas: view });
let SOUND = null;
const player = { state: 'loading', ac: null, src: null, gain: null, t0: 0, pausedAt: 0, muted: false, lastFrame: -1, raf: 0 };

function progress(p, label) { barEl.style.width = `${Math.round(p * 100)}%`; if (label) msgEl.textContent = label; }
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

let toastTimer = 0;
function toast(text) { toastEl.textContent = text; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1200); }

function blackFrame() { vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.globalAlpha = 1; vctx.globalCompositeOperation = 'source-over'; vctx.fillStyle = '#000'; vctx.fillRect(0, 0, W, H); }
function drawAt(t) {
  const f = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.floor(t * FPS + 1e-6)));
  if (t >= DURATION) { blackFrame(); return; }
  SCENE.draw(vctx, f / FPS, f);
}

// the picture clock is the audio clock (minus output latency), so picture and sound never drift
function now() {
  if (player.state !== 'playing') return player.pausedAt;
  const ac = player.ac;
  return ac.currentTime - player.t0 - (ac.outputLatency || 0);
}
function stopSrc() { if (player.src) { try { player.src.onended = null; player.src.stop(); } catch { /* already stopped */ } player.src.disconnect(); player.src = null; } }
function ensureAudio() {
  if (player.ac) return;
  player.ac = new AudioContext({ latencyHint: 'playback' });
  player.gain = player.ac.createGain();
  player.gain.gain.value = player.muted ? 0 : 1;
  player.gain.connect(player.ac.destination);
}
function startAt(t) {
  ensureAudio();
  const ac = player.ac;
  ac.resume();
  stopSrc();
  t = clamp(t, 0, DURATION);
  if (SOUND) {
    const s = ac.createBufferSource(); s.buffer = SOUND; s.connect(player.gain);
    s.start(ac.currentTime + 0.05, t); player.src = s;
    player.t0 = ac.currentTime + 0.05 - t;
  } else player.t0 = ac.currentTime - t;
  player.state = 'playing';
  overlay.classList.add('hidden');
  player.lastFrame = -1;
  cancelAnimationFrame(player.raf); player.raf = requestAnimationFrame(frameLoop);
}
function pause() { if (player.state !== 'playing') return; player.pausedAt = clamp(now(), 0, DURATION); stopSrc(); player.state = 'paused'; toast('일시정지'); }
function seek(dt) {
  const t = clamp(now() + dt, 0, DURATION - 1 / FPS);
  if (player.state === 'playing') startAt(t);
  else { player.pausedAt = t; drawAt(t); }
  toast(`${t.toFixed(1)}초`);
}
function finish() {
  stopSrc(); player.state = 'ended'; player.pausedAt = 0; blackFrame();
  msgEl.textContent = '클릭하면 처음부터 다시 봅니다'; barEl.parentElement.style.display = 'none'; overlay.classList.remove('hidden');
}
function frameLoop() {
  if (player.state !== 'playing') return;
  const t = now();
  if (t >= DURATION) { finish(); return; }
  const f = Math.max(0, Math.floor(t * FPS));
  if (f !== player.lastFrame) { player.lastFrame = f; drawAt(t); }
  player.raf = requestAnimationFrame(frameLoop);
}
function primary() {
  if (player.state === 'idle' || player.state === 'ended') startAt(0);
  else if (player.state === 'playing') pause();
  else if (player.state === 'paused') startAt(player.pausedAt);
}
if (!IN_WORKER) {
  overlay.addEventListener('click', primary);
  view.addEventListener('click', primary);
  window.addEventListener('keydown', (e) => {
    if (player.state === 'loading') return;
    if (e.code === 'Space') { e.preventDefault(); primary(); }
    else if (e.code === 'KeyM') {
      player.muted = !player.muted;
      if (player.gain) player.gain.gain.setTargetAtTime(player.muted ? 0 : 1, player.ac.currentTime, 0.03);
      toast(player.muted ? '소리 끔' : '소리 켬');
    } else if (e.code === 'ArrowRight') seek(5);
    else if (e.code === 'ArrowLeft') seek(-5);
    else if (e.code === 'KeyR' || e.code === 'Home') startAt(0);
    else if (e.code === 'KeyF') { const st = document.getElementById('stage'); document.fullscreenElement ? document.exitFullscreen() : st.requestFullscreen?.(); }
  });
}

async function boot() {
  try {
    blackFrame();
    paperInit();
    // the soundtrack renders on the audio thread while the main thread paints the backgrounds
    const soundP = NOAUDIO ? null : renderSoundtrack();
    await SCENE.load((p, l) => progress(p * (NOAUDIO ? 1 : 0.9), l), yieldUI);
    const tPaint = performance.now();
    if (soundP) { progress(0.9, '소리를 합성하는 중…'); await yieldUI(); SOUND = await soundP; }
    if (DEBUG) console.log(`load: pictures ${(tPaint / 1000).toFixed(1)} s, sound ${(performance.now() / 1000).toFixed(1)} s`);
    progress(1);
    blackFrame();
    player.state = 'idle';
    barEl.parentElement.style.display = 'none';
    msgEl.textContent = '클릭하면 소리와 함께 시작합니다';
    SB.isReady = true;
  } catch (e) {
    console.error(e);
    msgEl.textContent = '이 브라우저에서는 재생할 수 없습니다 — ' + e.message;
  }
}

// debug hooks used by tools/*.mjs (frame stills, soundtrack export)
SB.renderFrame = async (f) => { const t0 = performance.now(); SCENE.draw(vctx, f / FPS, f); vctx.getImageData(0, 0, 1, 1); return performance.now() - t0; };
SB.wav = null;
SB.prepareWav = () => { SB.wav = encodeWav24(SOUND); return SB.wav.length; };
SB.wavPart = (i, n) => SB.wav.slice(i, i + n);
SB.events = () => (typeof SOUND_EVENTS !== 'undefined' ? SOUND_EVENTS : []);
// framing probe: screen positions of key points + full robot bounds for frame f
SB.probe = (f) => {
  LAST_ROBOT = null; SCENE.draw(vctx, f / FPS, f);
  if (!LAST_ROBOT) return null;
  const { cam, B, mats } = LAST_ROBOT, P = (b, p) => cam.project(m4.xfPoint(B[b], p)).map((v) => Math.round(v));
  const hi = ROBOT.model.parts.map((p, i) => (p.bone === 'head' ? i : -1)).filter((i) => i >= 0);
  const bb = ROBOT.bounds(mats, cam), hb = ROBOT.bounds(hi.map((i) => mats[i]), cam, hi.map((i) => ROBOT.model.parts[i]));
  return { head: P('head', [0, 0, 0]), capTop: P('head', [0, 7.4, 0.3]), brimTip: P('head', [0, 2.6, 9.6]), chin: P('head', [0, -5.2, 2]), perch: P('shoulderL', [0.6, 2.75, 0.4]), chest: P('chest', [0, 1.6, 4.6]), feet: P('ankleL', [0, 0, 0]),
    bounds: [bb.x0, bb.y0, bb.x1, bb.y1].map(Math.round), headBounds: [hb.x0, hb.y0, hb.x1, hb.y1].map(Math.round) };
};

function encodeWav24(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const bytes = new Uint8Array(44 + n * ch * 3), dv = new DataView(bytes.buffer);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 3, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 3, true); dv.setUint16(32, ch * 3, true); dv.setUint16(34, 24, true); wr(36, 'data'); dv.setUint32(40, n * ch * 3, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.round(clamp(data[c][i], -1, 1) * 8388607);
    bytes[o++] = v & 255; bytes[o++] = (v >> 8) & 255; bytes[o++] = (v >> 16) & 255;
  }
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// background painter: paints the shots it is handed and sends the layers back as ImageBitmaps
function workerMain() {
  paperInit(); setupSigns();
  self.onmessage = async (e) => {
    const id = e.data;
    try {
      if (id === 'common') {
        const a = paintCommonAssets(), bm = (cv) => cv.transferToImageBitmap();
        const res = { SIGN_IMG: bm(a.SIGN_IMG), CLOUD_IMGS: a.CLOUD_IMGS.map(bm), STARS: bm(a.STARS), PLANET: bm(a.PLANET) };
        self.postMessage({ id, res }, [res.SIGN_IMG, ...res.CLOUD_IMGS, res.STARS, res.PLANET]);
      } else {
        const sh = SHOTS[id], t0 = performance.now();
        await sh.paint.call(sh, async () => {});
        const { out, transfer } = packShot(sh);
        self.postMessage({ id, out, ms: Math.round(performance.now() - t0) }, transfer);
      }
    } catch (err) { self.postMessage({ id, error: String((err && err.stack) || err) }); }
  };
}
if (IN_WORKER) workerMain(); else boot();
