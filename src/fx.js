// ───────────────────────────── fx: hand-drawn 2D effects, all pure functions of time ─────────────────────────────
const INK = 'rgba(40,26,30,0.92)';

function pathPoly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
function inkStroke(c, w, col = INK) { c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = col; c.stroke(); }

// ── sparrow (Eurasian tree sparrow), cel-coloured with ink ──
// st: { flap: 0..1 wing phase (null = folded), fold: 0..1, tilt: head tilt (rad), legs: bool, lit: 0..1 }
function drawSparrow(c, x, y, s, dir, st) {
  c.save(); c.translate(x, y); c.scale(s * dir, s); c.rotate(st.body ?? 0);
  const lw = 1.6 / s, lit = st.lit ?? 0.6;
  const brown = mixc(hex('#7a5136'), hex('#a8714a'), lit), brownS = mixc(hex('#4f3324'), hex('#6e4a33'), lit);
  const belly = mixc(hex('#cfc2ae'), hex('#efe2c8'), lit), crown = mixc(hex('#6a321c'), hex('#94502c'), lit);
  // tail
  pathPoly(c, [[-0.5, 0.05], [-1.05, -0.08 + (st.tail ?? 0)], [-1.0, 0.12 + (st.tail ?? 0)], [-0.48, 0.2]]); c.fillStyle = css(brownS); c.fill(); inkStroke(c, lw);
  if (st.legs) { c.beginPath(); c.moveTo(0.02, 0.38); c.lineTo(-0.02, 0.62); c.moveTo(0.16, 0.38); c.lineTo(0.18, 0.62); inkStroke(c, lw * 0.9, 'rgba(60,40,30,.95)'); }
  // far wing when flying
  if (st.flap != null) wing(c, st.flap, -1, brownS, lw);
  // body
  c.beginPath(); c.ellipse(0, 0.1, 0.56, 0.38, -0.12, 0, Math.PI * 2); c.fillStyle = css(brown); c.fill();
  c.save(); c.clip(); c.beginPath(); c.ellipse(0.12, 0.34, 0.6, 0.3, -0.1, 0, Math.PI * 2); c.fillStyle = css(belly); c.fill();
  c.beginPath(); c.ellipse(-0.1, -0.12, 0.5, 0.2, -0.2, 0, Math.PI * 2); c.fillStyle = css(brownS, 0.5); c.fill(); c.restore();
  c.beginPath(); c.ellipse(0, 0.1, 0.56, 0.38, -0.12, 0, Math.PI * 2); inkStroke(c, lw);
  // folded wing with streaks and a white bar
  if (st.flap == null || (st.fold ?? 0) > 0.5) {
    c.beginPath(); c.moveTo(0.3, -0.08); c.quadraticCurveTo(0.0, -0.22, -0.62, 0.02); c.quadraticCurveTo(-0.15, 0.28, 0.3, 0.12); c.closePath();
    c.fillStyle = css(brownS); c.fill();
    c.save(); c.clip();
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0.25 - i * 0.18, -0.1); c.lineTo(0.05 - i * 0.18, 0.2); inkStroke(c, lw * 0.8, 'rgba(40,24,16,.6)'); }
    c.beginPath(); c.moveTo(0.2, 0.0); c.lineTo(-0.3, 0.05); inkStroke(c, lw * 1.6, 'rgba(240,232,214,.9)');
    c.restore();
    c.beginPath(); c.moveTo(0.3, -0.08); c.quadraticCurveTo(0.0, -0.22, -0.62, 0.02); c.quadraticCurveTo(-0.15, 0.28, 0.3, 0.12); inkStroke(c, lw);
  }
  // head
  c.save(); c.translate(0.46, -0.22); c.rotate(st.tilt ?? 0);
  c.beginPath(); c.arc(0, 0, 0.29, 0, Math.PI * 2); c.fillStyle = css(belly); c.fill();
  c.save(); c.clip();
  c.beginPath(); c.ellipse(-0.04, -0.2, 0.36, 0.22, -0.2, 0, Math.PI * 2); c.fillStyle = css(crown); c.fill();
  c.beginPath(); c.arc(0.02, 0.06, 0.08, 0, Math.PI * 2); c.fillStyle = '#1c1512'; c.fill(); // cheek spot
  c.beginPath(); c.ellipse(0.2, 0.24, 0.12, 0.1, 0, 0, Math.PI * 2); c.fillStyle = '#231a16'; c.fill(); // bib
  c.restore();
  c.beginPath(); c.arc(0, 0, 0.29, 0, Math.PI * 2); inkStroke(c, lw);
  pathPoly(c, [[0.24, -0.06], [0.44, 0.03], [0.24, 0.1]]); c.fillStyle = '#3d3431'; c.fill(); inkStroke(c, lw * 0.8);
  c.beginPath(); c.arc(0.12, -0.05, 0.055, 0, Math.PI * 2); c.fillStyle = '#100a08'; c.fill();
  c.beginPath(); c.arc(0.135, -0.07, 0.018, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
  c.restore();
  if (st.flap != null && (st.fold ?? 0) <= 0.5) wing(c, st.flap, 1, brown, lw);
  c.restore();
}
function wing(c, ph, near, col, lw) {
  // ph 0..1: 0 = up, 0.5 = down
  const a = Math.cos(ph * Math.PI * 2); // 1 up, -1 down
  const tipY = -1.1 * a * (near > 0 ? 1 : 0.8), tipX = -0.25 + (near > 0 ? 0 : -0.1);
  c.beginPath(); c.moveTo(0.25, -0.05);
  c.quadraticCurveTo(0.15, tipY * 0.6, tipX + 0.1, tipY);
  c.lineTo(tipX - 0.25, tipY * 0.85); c.lineTo(tipX - 0.38, tipY * 0.6);
  c.quadraticCurveTo(-0.3, tipY * 0.2, -0.25, 0.05); c.closePath();
  c.fillStyle = css(near > 0 ? col : shadec(col, 0.75)); c.fill(); inkStroke(c, lw);
  c.beginPath(); c.moveTo(0.05, tipY * 0.35); c.lineTo(tipX - 0.15, tipY * 0.7); inkStroke(c, lw * 0.7, 'rgba(240,230,210,.7)');
}

// small bird silhouette (flock)
function drawBird(c, x, y, s, ph, ang, col) {
  const a = Math.cos(ph * Math.PI * 2);
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  c.beginPath(); c.moveTo(-1, -0.7 * a); c.quadraticCurveTo(-0.5, -0.9 * a - 0.2, 0, 0.05);
  c.quadraticCurveTo(0.5, -0.9 * a - 0.2, 1, -0.7 * a); c.quadraticCurveTo(0.45, -0.35 * a + 0.1, 0, 0.3); c.quadraticCurveTo(-0.45, -0.35 * a + 0.1, -1, -0.7 * a);
  c.fillStyle = col; c.fill();
  c.beginPath(); c.ellipse(0, 0.15, 0.16, 0.3, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ── anime dust cloud: overlapping puffs, two-tone cel with outline, grows then thins ──
function dustCloud(c, x, y, R, age, life, seed, col, o = {}) {
  if (age < 0 || age > life) return;
  const u = age / life, r = makeRng(seed);
  const grow = easeOut(Math.min(1, u * 1.6), 2.2);
  const fade = 1 - smoothstep(0.55, 1, u);
  const n = o.n ?? 9;
  const lit = col.lit, shade = col.shade, line = col.line ?? 'rgba(70,58,72,0.55)';
  c.save(); c.globalAlpha = (o.alpha ?? 1) * fade;
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const a = r.range(-Math.PI, 0) - (o.spread ?? 0.0), d = r.range(0.1, 1) * R * grow;
    const pr = R * r.range(0.25, 0.48) * (0.6 + grow * 0.6) * (1 - u * 0.35);
    puffs.push([x + Math.cos(a) * d * (o.wide ?? 1.4) + (o.drift ?? 0) * u, y + Math.sin(a) * d * 0.55 - u * R * (o.rise ?? 0.25), pr]);
  }
  for (const p of puffs) { c.beginPath(); c.arc(p[0], p[1], p[2], 0, Math.PI * 2); c.fillStyle = shade; c.fill(); }
  for (const p of puffs) { c.beginPath(); c.arc(p[0] + p[2] * (o.lx ?? 0.25), p[1] + p[2] * (o.ly ?? -0.3), p[2] * 0.72, 0, Math.PI * 2); c.fillStyle = lit; c.fill(); }
  if (fade > 0.4) { c.globalAlpha *= 0.8; for (const p of puffs) { c.beginPath(); c.arc(p[0], p[1], p[2], Math.PI * 1.05, Math.PI * 1.95); inkStroke(c, 1.3, line); } }
  c.restore();
}

// ballistic chunk in world space projected through the camera
function debrisChunk(c, cam, p0, v0, t, size, seed, col, g = -9.8) {
  if (t < 0) return null;
  const p = [p0[0] + v0[0] * t, p0[1] + v0[1] * t + 0.5 * g * t * t, p0[2] + v0[2] * t];
  if (p[1] < 0) return null;
  const s = cam.project(p); if (s[2] <= 0.5) return null;
  const px = size / cam.upp(s[2]); if (px < 0.4) return s;
  const r = makeRng(seed), ang = t * r.range(-6, 6) + r.f() * 6;
  const k = r.int(4, 6), pts = [];
  for (let i = 0; i < k; i++) { const a = ang + i / k * Math.PI * 2 + r.range(-0.3, 0.3); pts.push([s[0] + Math.cos(a) * px * r.range(0.6, 1), s[1] + Math.sin(a) * px * r.range(0.5, 1)]); }
  pathPoly(c, pts); c.fillStyle = col; c.fill(); if (px > 2.5) inkStroke(c, Math.min(1.8, px * 0.18));
  return s;
}

// a slack or taut cable between two screen points (sag in px), drawn in ink with a light edge
function drawCable(c, a, b, sag, w, col = 'rgba(32,28,36,.95)', hi = 'rgba(200,180,190,.35)') {
  const pts = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + sag * 4 * t * (1 - t)]); }
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); inkStroke(c, w, col);
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1] - w * 0.25) : c.moveTo(p[0], p[1] - w * 0.25))); inkStroke(c, Math.max(0.6, w * 0.25), hi);
}

// ground cracks radiating from a screen point, growing with k (0..1)
function drawCracks(c, x, y, scale, k, seed, persp = 0.35) {
  if (k <= 0) return;
  const r = makeRng(seed);
  for (let i = 0; i < 9; i++) {
    let a = r.range(0, Math.PI * 2), px = x, py = y;
    const L = scale * r.range(0.4, 1) * k;
    c.beginPath(); c.moveTo(px, py);
    const steps = 7;
    for (let j = 0; j < steps; j++) { a += r.range(-0.5, 0.5); px += Math.cos(a) * L / steps; py += Math.sin(a) * L / steps * persp; c.lineTo(px, py); }
    inkStroke(c, Math.max(1, scale * 0.012), 'rgba(30,22,30,.85)');
    if (r.chance(0.5)) { c.beginPath(); c.moveTo(px, py); c.lineTo(px + r.range(-1, 1) * L * 0.25, py + r.range(-1, 1) * L * 0.1); inkStroke(c, Math.max(0.8, scale * 0.007), 'rgba(30,22,30,.7)'); }
  }
}

// anime thruster flame from screen point along a screen direction
function drawFlame(c, x, y, dx, dy, len, wid, f, seed, power = 1) {
  if (power <= 0.01) return;
  const ang = Math.atan2(dy, dx);
  const fl = 0.82 + 0.36 * hashi(seed, Math.floor(f / 1)) ;
  c.save(); c.translate(x, y); c.rotate(ang);
  const L = len * fl * power, Wd = wid * (0.8 + 0.2 * power);
  const layer = (lk, wk, col, a) => {
    c.beginPath(); c.moveTo(0, -Wd * wk);
    c.quadraticCurveTo(L * lk * 0.35, -Wd * wk * 1.15, L * lk, 0);
    c.quadraticCurveTo(L * lk * 0.35, Wd * wk * 1.15, 0, Wd * wk); c.closePath();
    c.globalAlpha = a; c.fillStyle = col; c.fill();
  };
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(0, 0, 0, 0, 0, L * 1.1); g.addColorStop(0, 'rgba(255,170,90,0.45)'); g.addColorStop(1, 'rgba(255,120,60,0)');
  c.globalAlpha = 1; c.fillStyle = g; c.fillRect(-L * 1.1, -L * 1.1, L * 2.2, L * 2.2);
  c.globalCompositeOperation = 'source-over';
  layer(1, 1, 'rgb(255,140,64)', 0.95);
  layer(0.72, 0.72, 'rgb(255,206,110)', 1);
  layer(0.45, 0.45, 'rgb(255,250,226)', 1);
  c.restore(); c.globalAlpha = 1;
}

// soft glow
function glow(c, x, y, r, col, a) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(col, a)); g.addColorStop(0.35, css(col, a * 0.45)); g.addColorStop(1, css(col, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}

// god rays fanning from a point (screen blend)
function godRays(c, x, y, n, len, spread, ang, col, a, seed) {
  const r = makeRng(seed);
  c.save(); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const aa = ang + (r.f() - 0.5) * spread, w = r.range(0.01, 0.05);
    const g = c.createLinearGradient(x, y, x + Math.cos(aa) * len, y + Math.sin(aa) * len);
    g.addColorStop(0, css(col, a * r.range(0.4, 1))); g.addColorStop(1, css(col, 0));
    c.fillStyle = g; c.beginPath(); c.moveTo(x, y);
    c.lineTo(x + Math.cos(aa - w) * len, y + Math.sin(aa - w) * len); c.lineTo(x + Math.cos(aa + w) * len, y + Math.sin(aa + w) * len); c.closePath(); c.fill();
  }
  c.restore();
}

// speed lines (redrawn on 1s)
function speedLines(c, f, n, ang, a, seed, area = [0, 0, W, H], col = '255,255,255') {
  const r = makeRng(seed * 977 + f);
  c.save(); c.lineCap = 'round';
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const x = area[0] + r.f() * area[2], y = area[1] + r.f() * area[3], L = r.range(80, 420);
    c.strokeStyle = `rgba(${col},${a * r.range(0.3, 1)})`; c.lineWidth = r.range(1, 3.5);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * L, y + dy * L); c.stroke();
  }
  c.restore();
}

// trail: light ribbon + puffy cloud stream along a list of screen points (oldest first)
function lightTrail(c, pts, w0, col, coreCol, alpha = 1) {
  if (pts.length < 2) return;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const u = i / (pts.length - 1);
      const w = w0 * u * [3.2, 1.6, 0.6][pass];
      c.strokeStyle = css(pass === 2 ? coreCol : col, alpha * u * [0.12, 0.3, 0.9][pass]);
      c.lineWidth = Math.max(0.5, w);
      c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
    }
  }
  c.restore();
}
function cloudTrail(c, pts, r0, cols, f, seed, alpha = 1) {
  if (pts.length < 2) return;
  const n = pts.length;
  c.save();
  for (const pass of [0, 1]) {
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1), p = pts[i];
      const rr = r0 * (0.35 + (1 - u) * 1.4) * (0.8 + 0.4 * hashi(seed, i));
      const ox = (hashi(seed + 3, i) - 0.5) * rr * 0.8, oy = (hashi(seed + 7, i) - 0.5) * rr * 0.8;
      c.globalAlpha = alpha * (0.25 + 0.75 * u) * (pass ? 0.95 : 0.9);
      c.fillStyle = pass ? cols.lit : cols.shade;
      c.beginPath(); c.arc(p[0] + ox + (pass ? -rr * 0.15 : 0), p[1] + oy + (pass ? -rr * 0.2 : 0), rr * (pass ? 0.75 : 1), 0, Math.PI * 2); c.fill();
    }
  }
  c.restore(); c.globalAlpha = 1;
}

// expanding ground ring of wind and dust (world circle on y=0 projected)
function windRing(c, cam, cx, cz, R, k, seed) {
  if (k <= 0 || k >= 1) return;
  const pts = [], n = 64;
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; const s = cam.project([cx + Math.cos(a) * R, 0.5, cz + Math.sin(a) * R]); pts.push(s); }
  const fade = Math.sin(Math.PI * k);
  c.save();
  for (const [w, al, col] of [[60, 0.16, '236,226,232'], [26, 0.32, '246,240,236'], [8, 0.55, '255,252,246']]) {
    c.strokeStyle = `rgba(${col},${al * fade})`; c.lineWidth = w * (1 - k * 0.4);
    c.beginPath(); let started = false;
    for (const p of pts) { if (p[2] <= 1) { started = false; continue; } started ? c.lineTo(p[0], p[1]) : (c.moveTo(p[0], p[1]), started = true); }
    c.stroke();
  }
  // dust lumps riding the ring
  const r = makeRng(seed);
  for (let i = 0; i < 40; i++) {
    const a = r.f() * Math.PI * 2, s = cam.project([cx + Math.cos(a) * R, 1.0 + r.f() * 2, cz + Math.sin(a) * R]);
    if (s[2] <= 1) continue;
    const pr = (3.5 + r.f() * 4) / cam.upp(s[2]);
    c.globalAlpha = 0.55 * fade; c.fillStyle = 'rgb(214,200,212)';
    c.beginPath(); c.arc(s[0], s[1] - pr * 0.4, pr, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.6 * fade; c.fillStyle = 'rgb(246,236,232)';
    c.beginPath(); c.arc(s[0] - pr * 0.2, s[1] - pr * 0.65, pr * 0.65, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// falling leaves (city only)
function leaves(c, t, n, seed, area, wind, col) {
  const r = makeRng(seed);
  c.save();
  for (let i = 0; i < n; i++) {
    const x0 = area[0] + r.f() * area[2], y0 = area[1] + r.f() * area[3], sp = r.range(18, 40), ph = r.f() * 6;
    const x = x0 + wind * t + Math.sin(t * 1.3 + ph) * 18, y = (y0 + sp * t) % (area[1] + area[3] + 40);
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2 + ph) * 1.2); c.scale(1, Math.abs(Math.cos(t * 1.7 + ph)) * 0.8 + 0.2);
    c.fillStyle = css(r.pick(col)); c.beginPath(); c.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  c.restore();
}

// ── frame finishing: colour grade, transmitted light, grain, vignette ──
const GRAIN = [];
function grainInit() {
  for (let k = 0; k < 4; k++) {
    const cv = newCanvas(480, 270), x = cv.getContext('2d'), img = x.createImageData(480, 270), r = mulberry32(900 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 70; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0); GRAIN.push(cv);
  }
}
function finishFrame(c, f, g) {
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  if (g.wash) { c.globalCompositeOperation = 'soft-light'; c.globalAlpha = g.wash[1] * 0.55; c.fillStyle = css(g.wash[0]); c.fillRect(0, 0, W, H); }
  if (g.top) { // graded vertical light (warm sky top, cool ground etc)
    c.globalCompositeOperation = g.topMode || 'soft-light'; c.globalAlpha = 1;
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, css(g.top[0], g.top[1])); gr.addColorStop(1, css(g.top[2], g.top[3]));
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
  }
  if (g.light) { // transmitted light bloom from a point
    const [x, y, r, col, a] = g.light;
    c.globalCompositeOperation = 'screen'; c.globalAlpha = 1;
    const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, css(col, a)); gr.addColorStop(0.4, css(col, a * 0.35)); gr.addColorStop(1, css(col, 0));
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
  }
  // vignette
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(1, css(g.vigCol || [120, 104, 130], 1));
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  // grain on 2s
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = g.grain ?? 0.07;
  const gi = Math.floor(f / 2) % 4;
  c.drawImage(GRAIN[gi], 0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  if (g.fade > 0) { c.fillStyle = `rgba(0,0,0,${clamp(g.fade)})`; c.fillRect(0, 0, W, H); }
  c.restore();
}
