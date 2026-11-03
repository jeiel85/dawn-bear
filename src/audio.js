// ───────────────────────────── audio: the whole soundtrack, synthesized offline (Web Audio), then mastered ─────────────────────────────
const SR = 48000;
const SOUND_EVENTS = []; // key hits for timing checks
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = (() => { const n = {}, names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; for (let o = 0; o < 9; o++) names.forEach((x, i) => { n[x + o] = 12 * (o + 1) + i; }); return n; })();

function audioKit(ctx) {
  const r = mulberry32(2024);
  const mk = (sec, kind) => {
    const b = ctx.createBuffer(1, Math.round(SR * sec), SR), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.2; }
    }
    return b;
  };
  const K = { ctx, r, white: mk(6, 'white'), pink: mk(8, 'pink'), brown: mk(8, 'brown'), queue: [], building: false, track: [], curEnd: 0 };
  // every node made while realizing an event is tracked, so it can be disconnected once the event is over
  for (const m of ['createGain', 'createBiquadFilter', 'createStereoPanner', 'createOscillator', 'createBufferSource']) {
    const orig = ctx[m].bind(ctx);
    ctx[m] = (...a) => { const n = orig(...a); if (K.building) K.track.push(n); return n; };
  }
  K.master = ctx.createGain();
  const sub = ctx.createBiquadFilter(); sub.type = 'highpass'; sub.frequency.value = 24; sub.Q.value = 0.6; // subsonic clean-up
  K.master.connect(sub); sub.connect(ctx.destination);
  const ir = (sec, decay, pre, bright, seed) => {
    const b = ctx.createBuffer(2, Math.round(SR * sec), SR), rr = mulberry32(seed);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR, w = rr() * 2 - 1;
        const k = bright * Math.exp(-t * 2.2) + 0.05; lp += (w - lp) * k;
        d[i] = t < pre ? 0 : lp * Math.exp(-(t - pre) / decay) * (t < pre + 0.08 && rr() < 0.004 ? 3 : 1);
      }
    }
    return b;
  };
  K.hall = ctx.createConvolver(); K.hall.buffer = ir(4.2, 0.62, 0.02, 0.5, 11); K.hall.connect(K.master);
  K.city = ctx.createConvolver(); K.city.buffer = ir(2.4, 0.36, 0.012, 0.65, 12); K.city.connect(K.master);
  const bus = (wet, rev) => { const g = ctx.createGain(); g.connect(K.master); const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(rev); return g; };
  K.music = bus(0.42, K.hall); K.sfx = bus(0.22, K.city); K.amb = bus(0.35, K.city); K.far = bus(0.9, K.city);
  // mix rides (a fader per group across the film)
  const ride = (g, pts) => { g.gain.setValueAtTime(pts[0][1], 0); for (const [t, v] of pts) g.gain.linearRampToValueAtTime(v, t); };
  ride(K.music, [[0, 1], [19.9, 1], [20, 0.42], [31, 0.42], [31.6, 1.7], [52.9, 1.7], [53.3, 2.0], [71.8, 2.0], [72.4, 0.85], [91, 0.85]]);
  ride(K.sfx, [[0, 1.8], [91, 1.8]]);
  ride(K.amb, [[0, 4.5], [91, 4.5]]); ride(K.far, [[0, 4.0], [91, 4.0]]);
  return K;
}
// ── building blocks ──
function gainEnv(K, pts, out) { // pts: [[t, v], ...] linear ramps from 0
  const g = K.ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0, Math.max(0, pts[0][0] - 0.001));
  for (const [t, v] of pts) g.gain.linearRampToValueAtTime(v, t);
  if (out) g.connect(out);
  return g;
}
// params sampled once per 128-sample block (k-rate): vibrato and sweeps sound the same, rendering is far cheaper
const kRate = (...ps) => ps.forEach((p) => { p.automationRate = 'k-rate'; });
function pan(K, p, out) { const n = K.ctx.createStereoPanner(); kRate(n.pan); n.pan.value = clamp(p, -1, 1); n.connect(out); return n; }
function noiseSrc(K, kind, t0, t1, off = 0, rate = 1) {
  K.curEnd = Math.max(K.curEnd, t1);
  const s = K.ctx.createBufferSource(); s.buffer = K[kind]; s.loop = true; s.playbackRate.value = rate;
  s.start(t0, (off * 1.37) % (K[kind].duration - 0.01)); s.stop(t1); return s;
}
function filt(K, type, f, q = 0.7, out) { const b = K.ctx.createBiquadFilter(); kRate(b.frequency, b.Q, b.gain, b.detune); b.type = type; b.frequency.value = f; b.Q.value = q; if (out) b.connect(out); return b; }
function osc(K, type, f, t0, t1) { K.curEnd = Math.max(K.curEnd, t1); const o = K.ctx.createOscillator(); kRate(o.frequency, o.detune); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t1); return o; }
// shaped noise event
function noiseHit(K, t, o) {
  const dur = o.dur ?? 0.3, out = o.out ?? K.sfx;
  const p = pan(K, o.pan ?? 0, out);
  const g = gainEnv(K, [[t, 0], [t + (o.a ?? 0.004), o.v ?? 0.5], [t + dur, 0]], p);
  if (o.exp) { g.gain.cancelScheduledValues(t + (o.a ?? 0.004)); g.gain.setTargetAtTime(0, t + (o.a ?? 0.004), dur / 4); }
  const f = filt(K, o.type ?? 'bandpass', o.f ?? 1000, o.q ?? 1, g);
  if (o.f1) { f.frequency.setValueAtTime(o.f, t); f.frequency.exponentialRampToValueAtTime(o.f1, t + dur); }
  const s = noiseSrc(K, o.kind ?? 'white', t, t + dur + 0.05, t * 7.3 + (o.seed ?? 0), o.rate ?? 1); s.connect(f);
}
function tone(K, t, o) { // decaying sine/partials
  const out = o.out ?? K.sfx, p = pan(K, o.pan ?? 0, out), dur = o.dur ?? 1;
  (o.partials ?? [[1, 1]]).forEach(([mul, amp, dk]) => {
    const g = K.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((o.v ?? 0.3) * amp, t + (o.a ?? 0.003));
    g.gain.setTargetAtTime(0, t + (o.a ?? 0.003), (dk ?? 1) * dur / 4); g.connect(p);
    const ob = osc(K, o.wave ?? 'sine', o.f * mul, t, t + dur * (dk ?? 1) * 1.3 + 0.1); ob.connect(g);
    if (o.f1) { ob.frequency.setValueAtTime(o.f * mul, t); ob.frequency.exponentialRampToValueAtTime(o.f1 * mul, t + (o.glide ?? dur * 0.5)); }
  });
}

// ── instruments ──
function piano(K, t, m, v, dur, out) {
  const f = mtof(m), p = pan(K, clamp((m - 62) / 30, -0.5, 0.5), out ?? K.music);
  const dec = clamp(4.2 - (m - 48) * 0.06, 1.0, 4.6);
  const amps = [1, 0.46, 0.3, 0.17, 0.1];
  amps.forEach((a, i) => {
    const k = i + 1, g = K.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * a * (k > 2 ? 1 - clamp((m - 60) / 50, 0, 0.8) : 1), t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, dec / (1 + i * 0.9) * 0.45);
    g.gain.setTargetAtTime(0, t + dur, 0.14);
    g.connect(p);
    const o = osc(K, 'sine', f * k * (1 + 0.00035 * k * k), t, t + Math.min(dur + 0.9, dec * 1.6 / (1 + i * 0.6) + 0.3)); o.detune.value = (k % 2 ? 1 : -1) * 1.5; o.connect(g);
  });
  noiseHit(K, t, { dur: 0.04, f: 2600, q: 0.8, v: v * 0.06, out: p, seed: m });
}
function strings(K, t, m, dur, v, o = {}) {
  const f = mtof(m), out = o.out ?? K.music, att = o.att ?? 0.45, rel = o.rel ?? 0.9, end = t + dur + rel * 2.3;
  const p = pan(K, o.pan ?? clamp((m - 60) / 40, -0.6, 0.6), out);
  const g = K.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att);
  if (o.swell) g.gain.linearRampToValueAtTime(v * o.swell, t + dur);
  g.gain.setTargetAtTime(0, t + dur, rel / 3);
  let dst = p;
  if (o.trem) { const tg = K.ctx.createGain(); tg.gain.value = 0.55; tg.connect(p); const l = osc(K, 'triangle', o.trem, t, end); const lg = K.ctx.createGain(); lg.gain.value = 0.45; l.connect(lg); lg.connect(tg.gain); dst = tg; }
  g.connect(dst);
  const lp = filt(K, 'lowpass', o.cut ?? Math.min(6500, f * 7 + 600), 0.6, g);
  if (o.bright) { lp.frequency.setValueAtTime(o.cut ?? 1200, t); lp.frequency.linearRampToValueAtTime(o.bright, t + dur); }
  const vib = osc(K, 'sine', 5.1 + (m % 5) * 0.12, t, end), vg = K.ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(o.vib ?? 9, t + Math.min(1.2, dur)); vib.connect(vg);
  const n = Math.min(o.voices ?? 3, 3);
  for (let i = 0; i < n; i++) {
    const ob = osc(K, o.wave ?? 'sawtooth', f, t, end); ob.detune.value = (i - (n - 1) / 2) * 8 + (hashi(m, i, Math.round(t * 10)) - 0.5) * 4;
    vg.connect(ob.detune); const og = K.ctx.createGain(); og.gain.value = 1 / n; ob.connect(og); og.connect(lp);
  }
}
function chord(K, t, ms, dur, v, o) { ms.forEach((m, i) => strings(K, t + i * (o?.stagger ?? 0), m, dur, v / Math.sqrt(ms.length), o)); }
function horn(K, t, m, dur, v) {
  const f = mtof(m), end = t + dur + 0.9, p = pan(K, -0.15, K.music);
  const g = K.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.14); g.gain.setTargetAtTime(v * 0.85, t + 0.14, 0.4); g.gain.setTargetAtTime(0, t + dur, 0.18); g.connect(p);
  const lp = filt(K, 'lowpass', 700, 0.9, g); lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500 + v * 1200, t + 0.25);
  const vib = osc(K, 'sine', 4.6, t, end), vg = K.ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(6, t + 0.8); vib.connect(vg);
  for (const [w, k, d] of [['sawtooth', 0.7, -4], ['triangle', 0.6, 3]]) { const o = osc(K, w, f, t, end); o.detune.value = d; vg.connect(o.detune); const og = K.ctx.createGain(); og.gain.value = k; o.connect(og); og.connect(lp); }
}
function celesta(K, t, m, v, out) { tone(K, t, { f: mtof(m), v, dur: 2.6, out: out ?? K.music, pan: clamp((m - 72) / 24, -0.5, 0.5), partials: [[1, 1, 1], [2, 0.22, 0.45], [3, 0.08, 0.3], [4.07, 0.06, 0.2]] }); }
function bell(K, t, m, v) { tone(K, t, { f: mtof(m), v, dur: 7, out: K.music, partials: [[1, 1, 1], [2, 0.5, 0.7], [2.76, 0.32, 0.55], [4.07, 0.16, 0.4], [5.4, 0.1, 0.3], [0.5, 0.25, 1.2]] }); }
function timpani(K, t, m, v) {
  const f = mtof(m);
  tone(K, t, { f: f * 1.05, f1: f, glide: 0.12, v, dur: 2.2, out: K.music, partials: [[1, 1, 1], [1.5, 0.45, 0.6], [1.98, 0.3, 0.5], [2.44, 0.14, 0.35]] });
  noiseHit(K, t, { dur: 0.12, type: 'lowpass', f: 420, q: 0.5, v: v * 0.9, out: K.music, kind: 'pink', seed: m });
}

// ── sound design ──
function creak(K, t, dur, v, o = {}) { // friction creak: jittered low saw through a resonant sweeping band
  const end = t + dur + 0.4, p = pan(K, o.pan ?? 0, o.out ?? K.sfx);
  const g = gainEnv(K, [[t, 0], [t + 0.15, v], [t + dur * 0.7, v * 0.8], [t + dur, 0]], p);
  const bp = filt(K, 'bandpass', o.f0 ?? 380, o.q ?? 7, g);
  bp.frequency.setValueAtTime(o.f0 ?? 380, t); bp.frequency.linearRampToValueAtTime(o.f1 ?? 720, t + dur);
  const s = osc(K, 'sawtooth', o.pitch ?? 70, t, end);
  const n = Math.max(4, Math.round(dur * 30)), cv = new Float32Array(n), rr = mulberry32(Math.round(t * 1000));
  for (let i = 0; i < n; i++) cv[i] = (o.pitch ?? 70) * (0.75 + rr() * 0.6);
  s.frequency.setValueCurveAtTime(cv, t, dur); s.connect(bp);
  noiseHit(K, t, { dur, f: o.f1 ?? 900, q: 3, v: v * 0.35, out: p, kind: 'pink', seed: t });
}
function groan(K, t, dur, v, pitch = 42, panv = 0) { // deep metal groan for the giant body
  const end = t + dur + 0.6, p = pan(K, panv, K.sfx);
  const g = gainEnv(K, [[t, 0], [t + dur * 0.25, v], [t + dur * 0.8, v * 0.9], [t + dur, 0]], p);
  const bp = filt(K, 'bandpass', 160, 2.5, g); bp.frequency.setValueAtTime(130, t); bp.frequency.linearRampToValueAtTime(320, t + dur * 0.6); bp.frequency.linearRampToValueAtTime(190, t + dur);
  const am = osc(K, 'sine', 7 + (t % 3), t, end), amg = K.ctx.createGain(); amg.gain.value = 0.35; am.connect(amg);
  const mix = K.ctx.createGain(); mix.gain.value = 0.65; amg.connect(mix.gain); mix.connect(bp);
  for (const [mul, d] of [[1, -9], [1.005, 7], [1.5, 0], [2.01, 3]]) { const o = osc(K, 'sawtooth', pitch * mul, t, end); o.detune.value = d; o.frequency.setValueAtTime(pitch * mul * 0.92, t); o.frequency.linearRampToValueAtTime(pitch * mul * 1.08, t + dur); o.connect(mix); }
  creak(K, t + dur * 0.2, dur * 0.6, v * 0.35, { pitch: 90, f0: 500, f1: 1100, pan: panv * 0.6 });
}
function clang(K, t, base, v, panv = 0, dur = 2.2) {
  tone(K, t, { f: base, v, dur, pan: panv, partials: [[1, 1, 1], [1.62, 0.7, 0.8], [2.71, 0.5, 0.6], [4.13, 0.3, 0.45], [5.9, 0.18, 0.3]] });
  noiseHit(K, t, { dur: 0.25, f: 2400, q: 0.9, v: v * 0.7, pan: panv, seed: base });
  for (let i = 0; i < 6; i++) noiseHit(K, t + 0.08 + i * 0.07 + hashi(i, base) * 0.05, { dur: 0.05, f: 1800 + hashi(i, 3) * 2000, q: 2, v: v * 0.25 * (1 - i / 7), pan: panv + (hashi(i, 5) - 0.5) * 0.4, seed: i });
}
function thud(K, t, v, f = 55, panv = 0) {
  tone(K, t, { f: f * 1.6, f1: f, glide: 0.18, v, dur: 1.4, pan: panv, partials: [[1, 1, 1], [1.5, 0.3, 0.5]] });
  noiseHit(K, t, { dur: 0.5, type: 'lowpass', f: 300, q: 0.5, v: v * 0.8, pan: panv, kind: 'brown', exp: 1 });
}
function crackle(K, t, v, dur = 0.08, panv = 0) { for (let i = 0; i < 7; i++) noiseHit(K, t + hashi(i, Math.round(t * 100)) * dur, { dur: 0.012, type: 'highpass', f: 2600, q: 0.7, v: v * (0.4 + hashi(i, 9) * 0.6), pan: panv, seed: i + t }); }
function whoosh(K, t, dur, f0, f1, v, p0 = 0, p1 = 0, kind = 'pink') {
  const p = K.ctx.createStereoPanner(); kRate(p.pan); p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur); p.connect(K.sfx);
  const g = gainEnv(K, [[t, 0], [t + dur * 0.45, v], [t + dur, 0]], p);
  const b = filt(K, 'bandpass', f0, 0.9, g); b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5); b.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
  noiseSrc(K, kind, t, t + dur + 0.05, t * 3).connect(b);
}
function chirp(K, t, v, panv, seed) {
  const rr = mulberry32(seed), n = 2 + Math.floor(rr() * 3);
  for (let i = 0; i < n; i++) {
    const tt = t + i * (0.09 + rr() * 0.05), base = 3200 + rr() * 2400, d = 0.05 + rr() * 0.06;
    const p = pan(K, panv, K.far), g = gainEnv(K, [[tt, 0], [tt + 0.008, v], [tt + d, 0]], p);
    const o = osc(K, 'sine', base, tt, tt + d + 0.02); o.frequency.setValueAtTime(base, tt); o.frequency.linearRampToValueAtTime(base * (0.75 + rr() * 0.6), tt + d * 0.6); o.frequency.linearRampToValueAtTime(base * (0.9 + rr() * 0.3), tt + d); o.connect(g);
  }
}
function flap(K, t, v, panv, seed) { noiseHit(K, t, { dur: 0.07, f: 700 + hashi(seed, 1) * 900, q: 1.1, v, pan: panv, kind: 'pink', seed, a: 0.012 }); }
function whir(K, t, dur, f0, f1, v, panv = 0) {
  const p = pan(K, panv, K.sfx), g = gainEnv(K, [[t, 0], [t + 0.08, v], [t + dur - 0.1, v], [t + dur, 0]], p);
  const lp = filt(K, 'lowpass', 1800, 1.2, g);
  for (const [w, k] of [['sawtooth', 1], ['square', 0.5]]) { const o = osc(K, w, f0 * k, t, t + dur + 0.05); o.frequency.setValueAtTime(f0 * k, t); o.frequency.linearRampToValueAtTime(f1 * k, t + dur); const og = K.ctx.createGain(); og.gain.value = 0.4; o.connect(og); og.connect(lp); }
}
function tink(K, t, v, f = 4200, panv = 0) { tone(K, t, { f, v, dur: 0.06, pan: panv, partials: [[1, 1, 1], [1.7, 0.4, 0.6]] }); noiseHit(K, t, { dur: 0.012, type: 'highpass', f: 3500, v: v * 0.6, pan: panv, seed: f }); }
// thruster roar with gain & filter automation [[t, gain, cutoff], ...]
function roar(K, pts, o = {}) {
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const p = K.ctx.createStereoPanner(); kRate(p.pan); p.connect(K.sfx);
  if (o.pans) { p.pan.setValueAtTime(o.pans[0][1], 0); for (const [t, v] of o.pans) p.pan.linearRampToValueAtTime(v, t); }
  const g = K.ctx.createGain(); g.gain.setValueAtTime(0, 0); for (const [t, v] of pts) g.gain.linearRampToValueAtTime(v, t); g.connect(p);
  const hp = filt(K, 'highpass', o.hp ?? 45, 0.6, g);
  const lp = filt(K, 'lowpass', pts[0][2], 0.7, hp); lp.frequency.setValueAtTime(pts[0][2], 0); for (const [t, , c] of pts) lp.frequency.linearRampToValueAtTime(c, t);
  const bg = K.ctx.createGain(); bg.gain.value = o.brown ?? 1; bg.connect(lp); noiseSrc(K, 'brown', t0, t1 + 0.1, 3).connect(bg);
  const pk = K.ctx.createGain(); pk.gain.value = o.pink ?? 0.55; pk.connect(lp); noiseSrc(K, 'pink', t0, t1 + 0.1, 5).connect(pk);
  if (o.tone) { // tonal grit (for doppler)
    const tg = K.ctx.createGain(); tg.gain.value = o.toneGain ?? 0.12; tg.connect(lp);
    for (const d of [-12, 0, 7]) { const ob = osc(K, 'sawtooth', o.tone[0][1], t0, t1 + 0.1); ob.detune.value = d; ob.frequency.setValueAtTime(o.tone[0][1], 0); for (const [t, f] of o.tone) ob.frequency.linearRampToValueAtTime(f, t); ob.connect(tg); }
  }
}

// Events are queued at build time and realized ~1.5 s ahead of the render position (see renderSoundtrack),
// so the live graph only holds what is sounding now; the output is identical to building everything up front.
function lazy(fn, tOf = (args) => args[0]) {
  return function (K, ...args) {
    if (K.building) return fn(K, ...args);
    K.queue.push({ t: tOf(args), run: () => fn(K, ...args) });
  };
}
noiseHit = lazy(noiseHit); tone = lazy(tone); piano = lazy(piano); strings = lazy(strings); horn = lazy(horn);
celesta = lazy(celesta); bell = lazy(bell); timpani = lazy(timpani); creak = lazy(creak); groan = lazy(groan);
clang = lazy(clang); thud = lazy(thud); crackle = lazy(crackle); whoosh = lazy(whoosh); chirp = lazy(chirp);
flap = lazy(flap); whir = lazy(whir); tink = lazy(tink); roar = lazy(roar, (args) => args[0][0][0]);
function at(K, t, fn) { K.queue.push({ t, run: fn }); }

// ── the score of sound effects and ambience ──
function buildAmbience(K) {
  // dawn wind with slow gusts (city part, fades by 64)
  const wind = (kind, f, q, base, seed, p) => {
    const pn = pan(K, p, K.amb), g = K.ctx.createGain(); g.connect(pn);
    const n = 91 * 4, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const tt = i / 4; const gust = Math.pow(fbm2(tt * 0.13 + seed, seed, 3), 2.2) * 2.4; const city = tt < 61 ? 1 : Math.max(0, 1 - (tt - 61) / 3); cv[i] = base * (0.35 + gust) * city * smoothstep(0, 3, tt); }
    g.gain.setValueCurveAtTime(cv, 0.01, 90.9);
    const b = filt(K, 'bandpass', f, q, g);
    const fl = K.ctx.createOscillator(); kRate(fl.frequency, fl.detune); fl.frequency.value = 0.07; const flg = K.ctx.createGain(); flg.gain.value = f * 0.35; fl.connect(flg); flg.connect(b.frequency); fl.start(0); fl.stop(91);
    noiseSrc(K, kind, 0, 91, seed).connect(b);
  };
  at(K, 0, () => { wind('pink', 520, 0.8, 0.075, 3, -0.4); wind('pink', 900, 1.1, 0.05, 9, 0.45); wind('brown', 180, 0.7, 0.06, 13, 0); });
  // distant birds, water drips, slow cable creaks
  const r = mulberry32(55);
  for (let t = 1.5; t < 31; t += 0.9 + r() * 2.6) chirp(K, t, 0.012 + r() * 0.018, r() * 1.6 - 0.8, Math.floor(r() * 1e6));
  for (let t = 3.2; t < 52; t += 2.2 + r() * 4) tone(K, t, { f: 1300 + r() * 700, f1: 700 + r() * 300, glide: 0.03, v: 0.03 + r() * 0.02, dur: 0.35, out: K.amb, pan: r() * 1.4 - 0.7 });
  for (let t = 6; t < 35; t += 5 + r() * 5) creak(K, t, 1.4 + r() * 1.2, 0.03 + r() * 0.015, { pitch: 55 + r() * 30, f0: 300, f1: 600 + r() * 400, pan: r() * 1.2 - 0.6, out: K.amb });
}

function buildSfx(K) {
  const E = (t, n) => SOUND_EVENTS.push({ t, name: n });
  // sparrow: wing flutter during the approach, a tiny landing tick at 16.0
  for (let t = 14.05; t < 15.7; t += 1 / 11) flap(K, t, 0.05 + 0.03 * Math.sin((t - 14) * 3), 0.6 - (t - 14) * 0.35, Math.round(t * 100));
  tink(K, 16.0, 0.18, 5200, -0.05); E(16.0, 'sparrow landing tick');
  for (let i = 0; i < 4; i++) flap(K, 16.02 + i * 0.07, 0.03, -0.05, 900 + i);
  // chest flickers: electric ticks, then the power-up hum
  for (const t of [27.1, 27.4, 27.8]) { crackle(K, t, 0.45, 0.06); tone(K, t, { f: 1200, f1: 600, glide: 0.05, v: 0.06, dur: 0.12 }); E(t, 'chest flicker'); }
  at(K, 28.0, () => { const p = pan(K, 0, K.sfx), g = gainEnv(K, [[28.0, 0], [28.6, 0.07], [31, 0.05], [53, 0.035], [54, 0]], p);
    const lp = filt(K, 'lowpass', 300, 1.5, g); lp.frequency.setValueAtTime(260, 28); lp.frequency.linearRampToValueAtTime(1100, 29.6); lp.frequency.linearRampToValueAtTime(500, 31);
    for (const [m, k] of [[1, 1], [2, 0.5], [3, 0.25]]) { const o = osc(K, 'sawtooth', 44 * m, 28, 54.1); o.frequency.setValueAtTime(44 * m, 28); o.frequency.linearRampToValueAtTime(58 * m, 29.6); const og = K.ctx.createGain(); og.gain.value = k; o.connect(og); og.connect(lp); }
    tone(K, 28.0, { f: 880, v: 0.05, dur: 1.5, partials: [[1, 1, 1], [1.5, 0.4, 0.8]] }); }); E(28.0, 'chest on');
  // eyes power on + ear twitches
  whir(K, 29.6, 0.45, 300, 900, 0.07); tink(K, 29.6, 0.07, 3600, 0); E(29.6, "eyes on");
  tink(K, 30.3, 0.1, 2600, -0.3); tink(K, 30.65, 0.1, 2800, 0.3); E(30.3, 'ear twitch');
  // 31.3: the ground rumbles, flocks burst from every roof
  roar(K, [[31.0, 0, 90], [31.4, 0.28, 120], [33.5, 0.22, 110], [35.5, 0.16, 100], [37, 0.12, 90], [44, 0.1, 90], [46, 0, 80]], { hp: 28 });
  thud(K, 31.3, 0.32, 38); E(31.3, 'rumble + flocks');
  { const r = mulberry32(31); for (let i = 0; i < 260; i++) { const t = 31.3 + Math.pow(r(), 1.7) * 2.6; flap(K, t, 0.025 + r() * 0.05 * (1 - (t - 31.3) / 3), r() * 1.8 - 0.9, i); } }
  // the rise (35.5 + local times)
  const R = (s) => 35.5 + s;
  crackle(K, R(1.0), 0.3, 0.12, -0.3); thud(K, R(1.0), 0.32, 60, -0.3); noiseHit(K, R(1.0), { dur: 0.9, f: 1600, q: 0.6, v: 0.16, pan: -0.3, kind: 'pink' }); E(R(1.0), 'ground crack (hand)');
  groan(K, R(1.2), 1.6, 0.16, 40, 0); creak(K, R(2.4), 0.6, 0.07, { pitch: 80, pan: 0.2 });
  groan(K, R(3.0), 2.2, 0.15, 46, -0.2);
  clang(K, R(4.2), 210, 0.22, -0.35); thud(K, R(4.2), 0.2, 70, -0.35); E(R(4.2), 'signboard crash');
  thud(K, R(5.2), 0.34, 48, -0.2); clang(K, R(5.25), 95, 0.12, -0.2, 1.2); E(R(5.2), 'slip clunk');
  groan(K, R(5.6), 3.0, 0.2, 38, 0.1);
  for (const [s, pn] of [[6.2, 0.4], [7.0, -0.3]]) { noiseHit(K, R(s), { dur: 0.3, f: 1200, f1: 600, q: 2, v: 0.14, pan: pn }); tink(K, R(s), 0.08, 1900, pn); clang(K, R(s) + 1.85, 330 + pn * 60, 0.14, pn, 1.4); E(R(s), 'plate falls'); }
  for (const t of [41.5, 41.9, 42.3, 42.7, 43.2]) { tone(K, t, { f: 130 + (t * 37 % 60), f1: 90, glide: 0.4, v: 0.08, dur: 0.9, wave: 'triangle', pan: t % 0.8 - 0.4 }); noiseHit(K, t, { dur: 0.06, f: 3000, v: 0.08, seed: t }); }
  thud(K, R(10.2), 0.42, 42, 0); noiseHit(K, R(10.2), { dur: 1.6, f: 700, q: 0.5, v: 0.14, kind: 'pink' }); E(R(10.2), 'settle thud');
  // look up: servo whir and the ear perk
  whir(K, 48.25, 0.9, 140, 260, 0.04, 0.1); whir(K, 49.4, 0.6, 400, 1100, 0.03); tink(K, 50.8, 0.14, 3100, 0.2); tink(K, 50.86, 0.08, 4600, -0.2); E(50.8, 'ear perk');
  // ignition, the wind ring
  thud(K, 53.55, 0.6, 34); noiseHit(K, 53.55, { dur: 0.6, type: 'lowpass', f: 900, v: 0.35, kind: 'pink', exp: 1 }); E(53.55, 'ignition boom');
  roar(K, [[53.55, 0, 200], [53.7, 0.26, 900], [54.3, 0.3, 1400], [56, 0.26, 1200], [57.9, 0.28, 1500], [58.5, 0.3, 1900], [60.4, 0.38, 2600], [61.0, 0.34, 2200], [61.15, 0, 1800]]);
  whoosh(K, 54.3, 1.7, 300, 2600, 0.42, -0.8, 0.8); thud(K, 54.3, 0.22, 50); E(54.3, 'wind ring whoosh');
  // pass-by: the loudest moment, Doppler across the stereo field
  roar(K, [[60.95, 0, 600], [61.1, 0.5, 3000], [61.25, 0.85, 5200], [61.45, 0.6, 3000], [62.1, 0.26, 1300], [63.4, 0.16, 600], [64, 0, 400]],
    { pans: [[60.95, -0.9], [61.25, 0], [61.6, 0.75], [63.5, 0.6]], tone: [[60.95, 210], [61.2, 205], [61.3, 150], [61.6, 128], [64, 120]], pink: 1.5, toneGain: 0.28, brown: 0.45, hp: 70 });
  whoosh(K, 60.9, 1.1, 500, 3800, 0.5, -0.9, 0.9);
  E(61.25, 'doppler pass-by');
  // flight: wind rush and buffet thumps, then the cloud punch
  at(K, 63.6, () => { const p = pan(K, 0, K.sfx), g = gainEnv(K, [[63.6, 0], [64.3, 0.22], [68.3, 0.24], [68.6, 0.32], [70, 0.16], [71.6, 0.03], [72.2, 0]], p);
    const b = filt(K, 'bandpass', 900, 0.6, g); b.frequency.setValueAtTime(700, 64); b.frequency.linearRampToValueAtTime(1400, 68.5); b.frequency.linearRampToValueAtTime(2200, 72);
    noiseSrc(K, 'pink', 63.6, 72.3, 21).connect(b); });
  for (let f = 64 * FPS; f < 68.5 * FPS; f++) if (hashi(f >> 1, 5, 3) >= 0.86 && (f & 1) === 0) thud(K, f / FPS, 0.12, 70 + (f % 5) * 6, ((f % 7) - 3) / 6);
  noiseHit(K, 68.5, { dur: 1.1, type: 'lowpass', f: 2400, f1: 300, q: 0.5, v: 0.5, kind: 'pink' }); thud(K, 68.5, 0.26, 60); E(68.5, 'cloud punch');
}

function buildMusic(K) {
  const N = NOTE;
  // 20.0 high string harmonic with the sunray
  strings(K, 20.0, N.A6, 7.2, 0.035, { att: 2.2, rel: 2.2, voices: 2, wave: 'triangle', cut: 4200, vib: 4, pan: 0.2 });
  strings(K, 21.0, N.E6, 6.0, 0.02, { att: 2.5, rel: 2.0, voices: 2, wave: 'triangle', cut: 3600, vib: 3, pan: -0.25 });
  // 22.0 solo piano — first phrase of the theme (quarter = 0.6 s), left-hand arpeggios
  const q = 0.6, hum = (i) => (hashi(i, 77) - 0.5) * 0.03;
  const mel1 = [[0, N.F4, 1], [1, N.G4, 1], [2, N.A4, 2], [4, N.B4, 1], [5, N.A4, 1], [6, N.F4 + 1, 2], [8, N.E4, 1], [9, N['F#4'], 1], [10, N.G4, 1], [11, N['F#4'], 1], [12, N.E4, 4]];
  mel1[0][1] = N['F#4']; mel1[5][1] = N['F#4'];
  mel1.forEach(([b, m, d], i) => piano(K, 22.0 + b * q + hum(i), m, 0.16, d * q * 1.05));
  const lh = [[N.D3, N.A3, N.D4, N.A3], [N.B2, N['F#3'], N.B3, N['F#3']], [N.E3, N.B3, N.E4, N.B3], [N.A2, N.E3, N.A3, N['C#4']]];
  lh.forEach((ns, bar) => { for (let k = 0; k < 8; k++) if (bar < 3 || k < 5) piano(K, 22.0 + bar * 4 * q + k * q / 2 + hum(bar * 9 + k), ns[k % 4], 0.07, q * 1.2); });
  // 31.0 low string tremolo under the rumble, into the rise
  strings(K, 31.0, N.D2, 6.0, 0.05, { att: 1.6, trem: 11, swell: 2.4, voices: 5, cut: 900, rel: 1.5 });
  strings(K, 31.6, N.A2, 5.4, 0.035, { att: 1.6, trem: 11.5, swell: 2.4, voices: 4, cut: 1000, rel: 1.5 });
  // 35.5 the rise: strings build, a dissonant stab at the slip, the warm full chord when it stands
  const R = (s) => 35.5 + s;
  chord(K, R(1.2), [N.B1, N.B2, N['F#3'], N.B3, N.D4], 2.0, 0.09, { att: 0.9, swell: 1.5, rel: 0.8, cut: 1800 });
  chord(K, R(3.0), [N.G1, N.G2, N.D3, N.G3, N.B3, N.D4], 2.2, 0.1, { att: 1.0, swell: 1.6, rel: 0.4, cut: 2000, bright: 3200 });
  chord(K, R(5.2), [N['C#4'], N.D4, N.G4], 0.35, 0.09, { att: 0.03, rel: 0.25, cut: 3000 });
  timpani(K, R(5.2), N.D2, 0.18);
  [N.D3, N.E3, N['F#3'], N.G3, N.A3, N.B3, N['C#4'], N.D4].forEach((m, i) => strings(K, R(5.6) + i * 0.37, m, 0.45, 0.07 + i * 0.008, { att: 0.08, rel: 0.25, voices: 4 }));
  chord(K, R(5.6), [N.A1, N.A2, N.E3], 3.0, 0.1, { att: 1.2, swell: 1.8, rel: 0.5, cut: 1200 });
  chord(K, R(8.6), [N.D2, N.A2, N.D3, N['F#3'], N.A3, N.D4, N['F#4'], N.A4], 3.4, 0.2, { att: 0.35, rel: 1.6, cut: 3600, swell: 0.75 });
  horn(K, R(8.65), N['F#3'], 3.0, 0.11); horn(K, R(8.7), N.A3, 3.0, 0.09);
  timpani(K, R(8.6), N.D2, 0.24);
  // 48.0 suspended chord, a breath of silence before ignition
  chord(K, 48.2, [N.D4, N.G4, N.A4, N.D5], 4.8, 0.06, { att: 2.4, swell: 1.3, rel: 0.12, cut: 3000 });
  chord(K, 48.6, [N.D3, N.A3], 4.4, 0.05, { att: 2.0, swell: 1.2, rel: 0.12, cut: 1200 });
  // 53.55 timpani with the boom, rhythm builds to lift-off
  timpani(K, 53.55, N.D2, 0.5); timpani(K, 54.3, N.A1, 0.45);
  for (let i = 0; i < 6; i++) timpani(K, 56.0 + i * 0.25 + (i > 3 ? (i - 3) * -0.05 : 0), N.D2, 0.16 + i * 0.04);
  for (let i = 0; i < 18; i++) strings(K, 54.4 + i * 0.25, i % 4 === 3 ? N.A1 : N.D2, 0.2, 0.08 + i * 0.006, { att: 0.02, rel: 0.12, voices: 4, cut: 1200 });
  chord(K, 56.0, [N.A2, N.E3, N.A3], 2.0, 0.12, { att: 1.0, swell: 2.0, rel: 0.3, cut: 1500, bright: 3000 });
  horn(K, 56.4, N.A3, 1.6, 0.1);
  for (let i = 0; i < 16; i++) strings(K, 58.0 + i * 0.125, N.A3 + [0, 2, 4, 5, 7, 9, 11, 12][i % 8] + (i >= 8 ? 12 : 0) - 12, 0.14, 0.06 + i * 0.006, { att: 0.02, rel: 0.1, voices: 3 });
  for (let i = 0; i < 8; i++) timpani(K, 58.0 + i * 0.25, i % 2 ? N.A1 : N.D2, 0.12 + i * 0.03);
  // 60.0 the full theme — violins + horn melody, cellos, piano; bar = 2.0 s
  const Q = 0.5, T0 = 60.0;
  const theme = [[0, N['F#5'], 1], [1, N.G5, 1], [2, N.A5, 2], [4, N.B5, 1], [5, N.A5, 1], [6, N['F#5'], 2], [8, N.E5, 1], [9, N['F#5'], 1], [10, N.G5, 1], [11, N['F#5'], 1], [12, N.E5, 4], [16, N.A5, 2]];
  theme.forEach(([b, m, d]) => { strings(K, T0 + b * Q, m, d * Q * 0.98, 0.1, { att: 0.07, rel: 0.4, voices: 5, cut: 6000 }); horn(K, T0 + b * Q, m - 12, d * Q * 0.95, 0.075); });
  strings(K, T0 + 18 * Q, N.D6, 3.0, 0.11, { att: 0.12, swell: 1.25, rel: 1.0, voices: 6, cut: 7000 }); // climax held through the clouds
  horn(K, T0 + 18 * Q, N.D5 - 12, 3.0, 0.09);
  const bass = [[0, [N.D2, N.D3]], [4, [N.B1, N.B2]], [8, [N.E2, N.E3]], [12, [N.A1, N.A2]], [16, [N.D2, N.D3]], [18, [N.G1, N.G2]], [20, [N.A1, N.A2]]];
  bass.forEach(([b, ms], i) => chord(K, T0 + b * Q, ms, (i < bass.length - 1 ? bass[i + 1][0] - b : 4) * Q, 0.13, { att: 0.15, rel: 0.5, cut: 900 }));
  const mid = [[0, [N['F#3'], N.A3, N.D4]], [4, [N['F#3'], N.B3, N.D4]], [8, [N.G3, N.B3, N.E4]], [12, [N.E3, N.A3, N['C#4']]], [16, [N['F#3'], N.A3, N.D4]], [18, [N.G3, N.B3, N.D4]], [20, [N.A3, N['C#4'], N.E4]]];
  mid.forEach(([b, ms], i) => chord(K, T0 + b * Q, ms, (i < mid.length - 1 ? mid[i + 1][0] - b : 4) * Q, 0.1, { att: 0.2, rel: 0.6, cut: 2400 }));
  for (let b = 0; b < 22; b++) { const ch = mid.filter((x) => x[0] <= b).pop()[1]; piano(K, T0 + b * Q, ch[b % 3] + 12, 0.07, Q * 1.2); }
  for (const b of [0, 4, 8, 12, 16, 18, 20]) timpani(K, T0 + b * Q, b === 12 || b === 20 ? N.A1 : N.D2, 0.2);
  noiseHit(K, 68.6, { dur: 3.2, type: 'highpass', f: 5000, v: 0.05, a: 2.6, kind: 'white', out: K.music }); // airy swell
  // 72.0 space: quiet piano + celesta reprise over high strings, the long final chord
  chord(K, 72.0, [N.D5, N['F#5'], N.A5], 12.5, 0.04, { att: 1.8, rel: 3.5, voices: 3, cut: 3200, vib: 5 });
  const q2 = 0.85, S0 = 72.6;
  const rep = [[0, N['C#5'], 1], [1, N.B4, 1], [2, N.A4, 1], [3, N['F#4'], 1], [4, N.G4, 1], [5, N['F#4'], 1], [6, N.E4, 1], [7, N['F#4'], 1], [8, N.D4, 4]];
  rep.forEach(([b, m, d], i) => { piano(K, S0 + b * q2 + hum(i + 40), m, 0.13, d * q2 * 1.1); celesta(K, S0 + b * q2 + 0.01, m + 12, 0.035); });
  const lh2 = [[0, [N.A2, N.E3, N.A3, N['C#4']]], [4, [N.E2, N.B2, N.E3, N.G3]], [8, [N.D2, N.A2, N.E3, N['F#3'], N.A3, N.D4]]];
  lh2.forEach(([b, ns]) => ns.forEach((m, k) => piano(K, S0 + b * q2 + k * q2 * 0.5, m, 0.06, b === 8 ? 7.5 : q2 * 4)));
  chord(K, S0 + 8 * q2, [N.D3, N.A3, N.E4, N['F#4'], N.A4, N.D5], 6.0, 0.05, { att: 1.6, rel: 3.0, voices: 3, cut: 2600 });
  celesta(K, 82.8, N.A6, 0.025); celesta(K, 83.5, N['F#6'], 0.02);
  // 86.8 one clear bell note and a faint pad; silent at 91
  bell(K, 86.8, N.D6, 0.07); E0(86.8);
  chord(K, 86.8, [N.D4, N.A4, N['F#5']], 2.4, 0.025, { att: 1.0, rel: 0.5, voices: 2, cut: 2000 });
  function E0(t) { SOUND_EVENTS.push({ t, name: 'title bell' }); }
}

// mastering: fixed gain, smooth fade to silence at 91 s, lookahead peak limiter with a true-peak margin
function master(buf) {
  const L = buf.getChannelData(0), Rr = buf.getChannelData(1), n = L.length;
  const gain = Math.pow(10, MASTER_DB / 20);
  const fadeStart = Math.round(90.2 * SR), end = Math.round(90.95 * SR);
  for (let i = 0; i < n; i++) {
    let k = gain;
    if (i < 0.02 * SR) k *= i / (0.02 * SR);
    if (i > fadeStart) k *= i >= end ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (i - fadeStart) / (end - fadeStart));
    L[i] *= k; Rr[i] *= k;
  }
  const ceil = Math.pow(10, -1.3 / 20), look = Math.round(0.004 * SR), relC = Math.exp(-1 / (0.12 * SR));
  // true-peak estimate: 4x oversampling with 8-tap windowed-sinc kernels at 1/4, 1/2, 3/4 sample offsets
  const ker = [0.25, 0.5, 0.75].map((d) => { const h = []; for (let k = -3; k <= 4; k++) { const x = k - d, sn = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); h.push(sn * (0.5 + 0.5 * Math.cos(Math.PI * x / 4.5))); } return h; });
  const tp = (X, i) => {
    let m = Math.abs(X[i]);
    if (i < 3 || i > n - 5) return m;
    for (const h of ker) { let y = 0; for (let k = 0; k < 8; k++) y += X[i - 3 + k] * h[k]; m = Math.max(m, Math.abs(y)); }
    return m;
  };
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(tp(L, i), tp(Rr, i)); need[i] = a > ceil ? ceil / a : 1; }
  // running minimum over the lookahead window, then smooth release
  const gmin = new Float32Array(n); const dq = []; let head = 0;
  for (let i = 0; i < n + look; i++) {
    if (i < n) { while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop(); dq.push(i); }
    const j = i - look; if (j < 0) continue;
    while (dq[head] < j - look) head++;
    gmin[j] = need[dq[head]];
  }
  let g = 1;
  for (let i = 0; i < n; i++) { const tgt = gmin[i]; g = tgt < g ? tgt : tgt + (g - tgt) * relC; L[i] *= g; Rr[i] *= g; }
}
const MASTER_DB = 0.6;

async function renderSoundtrack() {
  SOUND_EVENTS.length = 0;
  const ctx = new OfflineAudioContext(2, SR * DURATION, SR);
  const K = audioKit(ctx);
  const stem = typeof Q !== 'undefined' ? Q.get('stem') : null; // debug: render one group alone, unmastered
  if (!stem || stem === 'amb') buildAmbience(K);
  if (!stem || stem === 'sfx') buildSfx(K);
  if (!stem || stem === 'music') buildMusic(K);
  const Qe = K.queue.sort((a, b) => a.t - b.t), live = [];
  let qi = 0;
  const realize = (until) => {
    while (qi < Qe.length && Qe[qi].t < until) {
      K.building = true; K.track = []; K.curEnd = Qe[qi].t;
      Qe[qi].run();
      K.building = false;
      live.push({ end: K.curEnd + 0.4, nodes: K.track });
      qi++;
    }
  };
  const cull = (now) => { for (let i = live.length - 1; i >= 0; i--) if (live[i].end < now) { for (const n of live[i].nodes) n.disconnect(); live.splice(i, 1); } };
  const STEP = 1, AHEAD = 1.5;
  realize(AHEAD);
  for (let T = STEP; T < DURATION; T += STEP) ctx.suspend(T).then(() => { cull(T); realize(T + AHEAD); ctx.resume(); });
  const buf = await ctx.startRendering();
  if (!stem) master(buf);
  SOUND_EVENTS.sort((a, b) => a.t - b.t);
  return buf;
}
