// ───────────────────────────── brush: gouache painting engine (paper, bristle strokes, wobbly shapes) ─────────────────────────────
function newCanvas(w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (IN_WORKER) { const oc = new OffscreenCanvas(w, h); oc.getContext('2d', { willReadFrequently: true }); return oc; } // CPU raster: each worker paints on its own core
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// periodic value noise for tileable textures
function noise2p(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const P = NOISE_PERM, m = (k) => ((k % p) + p) % p;
  const g = (a, b) => NOISE_VAL[P[(P[m(a) & 255] + (m(b) & 255)) & 511]];
  const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function makePaperTile(n, seed) {
  const c = newCanvas(n, n), x = c.getContext('2d');
  const img = x.createImageData(n, n), d = img.data, r = mulberry32(seed);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const lo = noise2p(i / n * 8, j / n * 8, 8) * 0.6 + noise2p(i / n * 32, j / n * 32, 32) * 0.4;
    const tooth = noise2p(i / n * 128, j / n * 128, 128);
    let v = 128 + (lo - 0.5) * 26 + (tooth - 0.5) * 30 + (r() - 0.5) * 22;
    const k = (j * n + i) * 4; d[k] = d[k + 1] = d[k + 2] = clamp(v, 0, 255); d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // paper fibres
  x.lineCap = 'round';
  for (let f = 0; f < n * 0.9; f++) {
    const px = r() * n, py = r() * n, a = r() * Math.PI * 2, l = 4 + r() * 18, light = r() < 0.5;
    x.strokeStyle = light ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'; x.lineWidth = 0.6 + r() * 0.7;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      x.beginPath(); x.moveTo(px + ox, py + oy);
      x.quadraticCurveTo(px + ox + Math.cos(a + 0.5) * l * 0.5, py + oy + Math.sin(a + 0.5) * l * 0.5, px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l);
      x.stroke();
    }
  }
  return c;
}

const PAPER = { tile: null, tileFine: null };
function paperInit() {
  PAPER.tile = makePaperTile(512, 77);
  PAPER.tileFine = makePaperTile(256, 91);
}

// overlay paper grain onto a painted layer, keeping its alpha
function applyPaper(canvas, strength = 0.55, seed = 0) {
  const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d');
  const tmp = newCanvas(w, h), t = tmp.getContext('2d');
  t.save(); t.translate(-(seed * 97) % 512, -(seed * 53) % 512);
  t.fillStyle = t.createPattern(PAPER.tile, 'repeat'); t.fillRect(0, 0, w + 1024, h + 1024); t.restore();
  t.globalCompositeOperation = 'destination-in'; t.drawImage(canvas, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = strength; ctx.drawImage(tmp, 0, 0); ctx.restore();
}

class Painter {
  constructor(ctx, seed = 1) { this.c = ctx; this.r = makeRng(seed); this.seed = seed; }

  // subdivide a closed/open polyline and displace points along their normals with position-based noise
  wob(pts, amp = 1.6, freq = 0.035, seg = 10, closed = true) {
    const out = [], n = pts.length;
    const lim = closed ? n : n - 1;
    let total = 0;
    for (let i = 0; i < lim; i++) { const a = pts[i], b = pts[(i + 1) % n]; total += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    seg = Math.max(seg, total / 90); // keep big shapes to a bounded number of wobble points
    for (let i = 0; i < lim; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / seg));
      const nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
      for (let s = 0; s < k; s++) {
        const x = a[0] + (b[0] - a[0]) * s / k, y = a[1] + (b[1] - a[1]) * s / k;
        const d = (fbm2(x * freq + 31.7, y * freq + 11.3, 3) - 0.5) * 2 * amp;
        out.push([x + nx * d, y + ny * d]);
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }
  path(pts, closed = true) {
    const c = this.c; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (closed) c.closePath();
  }
  // flat gouache fill with hand-wobbled edges
  fill(pts, col, alpha = 1, amp = 1.4) {
    const c = this.c; const w = amp > 0 ? this.wob(pts, amp) : pts;
    this.path(w); c.globalAlpha = alpha; c.fillStyle = css(col); c.fill(); c.globalAlpha = 1;
    return w;
  }
  // a single bristle brush stroke: several thin streaks with breaks (dry brush feel)
  stroke(x, y, ang, len, w, col, a, opts = {}) {
    const c = this.c, r = this.r;
    const bristles = opts.bristles ?? Math.min(5, Math.max(1, Math.round(w / 3)));
    const bend = (opts.bend ?? 0.12) * len * (r.f() - 0.5) * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, py = ca;
    c.lineCap = 'round';
    for (let i = 0; i < bristles; i++) {
      const off = bristles === 1 ? 0 : (-0.5 + (i + 0.5) / bristles) * w + (r.f() - 0.5) * w * 0.15;
      const s0 = r.f() * 0.18 * len, s1 = len - r.f() * 0.22 * len;
      const bx = x + px * off, by = y + py * off;
      c.globalAlpha = a * (0.55 + 0.45 * r.f());
      c.strokeStyle = css(opts.cj ? jitterc(col, r, opts.cj) : col);
      c.lineWidth = bristles === 1 ? w : (w / bristles) * (1.25 + r.f() * 0.6);
      c.beginPath(); c.moveTo(bx + ca * s0, by + sa * s0);
      const mx = bx + ca * (s0 + s1) / 2 + px * bend, my = by + sa * (s0 + s1) / 2 + py * bend;
      c.quadraticCurveTo(mx, my, bx + ca * s1, by + sa * s1); c.stroke();
    }
    c.globalAlpha = 1;
  }
  // brush texture inside a shape (clipped)
  texture(pts, o) {
    const c = this.c, r = this.r;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const area = (x1 - x0) * (y1 - y0);
    const n = Math.min(o.max ?? 4000, Math.round(area * (o.density ?? 0.002)));
    c.save(); this.path(pts); c.clip();
    for (let i = 0; i < n; i++) {
      const x = x0 + r.f() * (x1 - x0), y = y0 + r.f() * (y1 - y0);
      const col = o.colAt ? o.colAt(x, y, r) : o.col;
      if (!col) continue;
      const ang = (o.angle ?? 0) + (r.f() - 0.5) * (o.angleJit ?? 0.3);
      this.stroke(x, y, ang, r.range(o.len[0], o.len[1]), r.range(o.w[0], o.w[1]), col, r.range(o.alpha[0], o.alpha[1]), { cj: o.cj ?? 0.06, bristles: o.bristles });
    }
    c.restore();
  }
  // darker pooled pigment along the inside of an edge
  edge(pts, col, width = 3, alpha = 0.3) {
    const c = this.c; c.save(); this.path(pts); c.clip();
    c.globalAlpha = alpha; c.strokeStyle = css(col); c.lineWidth = width; c.lineJoin = 'round'; this.path(pts); c.stroke();
    c.restore(); c.globalAlpha = 1;
  }
  // full painted shape: fill + brush texture + pooled edge
  shape(pts, col, o = {}) {
    const w = this.fill(pts, col, o.alpha ?? 1, o.amp ?? 1.4);
    if (o.tex !== false) this.texture(w, {
      col, density: o.density ?? 0.0016, len: o.len ?? [14, 46], w: o.sw ?? [3, 9], alpha: o.talpha ?? [0.06, 0.16],
      angle: o.angle ?? 0, angleJit: o.angleJit ?? 0.35, cj: o.cj ?? 0.12, max: o.max, colAt: o.colAt,
    });
    if (o.edge !== false) this.edge(w, shadec(col, o.edgeK ?? 0.82), o.edgeW ?? 2.5, o.edgeA ?? 0.35);
    return w;
  }
  // tapered, pressure-varying hand-inked line
  ink(pts, w, col, alpha = 1, o = {}) {
    const c = this.c, r = this.r;
    const p = o.wobble === false ? pts : this.wob(pts, o.amp ?? 0.8, o.freq ?? 0.05, o.seg ?? 8, false);
    if (p.length < 2) return;
    const left = [], right = [], n = p.length;
    let total = 0; const acc = [0];
    for (let i = 1; i < n; i++) { total += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); acc.push(total); }
    const ph = r.f() * 10;
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const u = total ? acc[i] / total : 0;
      const taper = Math.min(1, u / (o.t0 ?? 0.12), (1 - u) / (o.t1 ?? 0.15));
      const press = 0.75 + 0.5 * noise2(acc[i] * 0.03 + ph, ph);
      const hw = Math.max(0.25, w * 0.5 * clamp(taper, 0.15, 1) * press);
      left.push([p[i][0] - dy * hw, p[i][1] + dx * hw]); right.push([p[i][0] + dy * hw, p[i][1] - dx * hw]);
    }
    c.beginPath(); c.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(left[i][0], left[i][1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath(); c.globalAlpha = alpha; c.fillStyle = css(col); c.fill(); c.globalAlpha = 1;
  }
  // soft round dab (for mist, glow, foliage clusters)
  dab(x, y, rad, col, a) {
    const c = this.c, g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, css(col, a)); g.addColorStop(0.6, css(col, a * 0.55)); g.addColorStop(1, css(col, 0));
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // irregular blob polygon around a centre
  blob(x, y, rx, ry, seed, lump = 0.22, n = 18) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const k = 1 + (noise2(Math.cos(a) * 1.5 + seed * 7.1, Math.sin(a) * 1.5 + seed * 3.3) - 0.5) * 2 * lump;
      pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
    }
    return pts;
  }
}

// projective map from the unit square to a quad (for painting facades in perspective)
function quadMap(q) { // q: [p00, p10, p11, p01] (u right, v down)
  const [a, b, c, d] = q;
  const x0 = a[0], y0 = a[1], x1 = b[0], y1 = b[1], x2 = c[0], y2 = c[1], x3 = d[0], y3 = d[1];
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
  }
  const A = x1 - x0 + g * x1, B = x3 - x0 + h * x3, C = x0, D = y1 - y0 + g * y1, E = y3 - y0 + h * y3, F = y0;
  return (u, v) => { const w = g * u + h * v + 1; return [(A * u + B * v + C) / w, (D * u + E * v + F) / w]; };
}
