// ───────────────────────────── paint_bg: gouache background painters (sky, clouds, towers, streets, plants, space) ─────────────────────────────
const PAL = {
  ink: hex('#2c2336'),
  dawnSky: [[0, hex('#323b66')], [0.28, hex('#4f5689')], [0.52, hex('#8a80ad')], [0.72, hex('#c99aaa')], [0.86, hex('#efbc9f')], [1, hex('#f8d8aa')]],
  dayGold: [[0, hex('#4f78b4')], [0.4, hex('#86a6cf')], [0.7, hex('#d9cdb8')], [0.88, hex('#f5d7a4')], [1, hex('#fbe7bd')]],
  concrete: hex('#a8a0a6'), concreteWarm: hex('#bfa596'), concreteDark: hex('#7d7586'),
  sunWarm: hex('#ffcf96'), sunHot: hex('#fff0cf'), shadowCool: hex('#5d5884'), shadowDeep: hex('#3e3a5e'),
  leafDark: hex('#2f4636'), leafMid: hex('#4f6a44'), leafLit: hex('#8fa25a'), leafSun: hex('#c4bf6a'), moss: hex('#6f7d42'),
  rust: hex('#8c4f33'), rustDark: hex('#5e3427'),
  asphalt: hex('#5f5a70'), asphaltLit: hex('#8a7d86'), paving: hex('#8f8793'),
};

// lighting environment passed to painters
function makeEnv(o) {
  return Object.assign({
    sun: v3.norm([0.55, 0.16, 0.82]), sunOn: 0, warm: PAL.sunWarm, cool: PAL.shadowCool,
    haze: hex('#c4b2c6'), hazeDist: 420, skyRef: hex('#9d91b8'), detail: 1,
  }, o);
}
function hazeMix(env, col, d) { return mixc(col, env.haze, clamp(1 - Math.exp(-d / env.hazeDist), 0, 0.92)); }

// ── sky ──
function paintSky(ctx, w, h, stops, seed, o = {}) {
  const P = new Painter(ctx, seed), y0 = o.y0 ?? 0, y1 = o.y1 ?? h;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([p, c]) => g.addColorStop(p, css(c)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const r = P.r;
  const n = Math.round(w * h / 2600);
  for (let i = 0; i < n; i++) {
    const y = r.range(y0 - 40, y1 + 40), x = r.range(-100, w);
    const col = gradStops(stops, clamp((y - y0) / (y1 - y0)));
    P.stroke(x, y, (r.f() - 0.5) * 0.04, r.range(120, 520), r.range(10, 34), jitterc(col, r, 0.05), r.range(0.06, 0.16), { bristles: 4, bend: 0.03 });
  }
  if (o.sun) { // painted glow around the sun position
    const [sx, sy, rad, col] = o.sun;
    for (let i = 0; i < 9; i++) P.dab(sx + r.range(-rad, rad) * 0.2, sy + r.range(-rad, rad) * 0.1, rad * (0.5 + i * 0.18), col, 0.12);
  }
}

// ── clouds ──
function cloudPuff(P, x, y, rx, ry, cols, seed, o = {}) {
  const c = P.c, body = P.blob(x, y, rx, ry, seed, o.lump ?? 0.18, 20);
  const w = P.fill(body, cols.mid, o.alpha ?? 1, 1.2);
  c.save(); P.path(w); c.clip();
  const lx = o.lx ?? 0, ly = o.ly ?? 1; // light direction (screen) the lit side faces
  const lit = P.blob(x + lx * rx * 0.32, y + ly * ry * 0.42, rx * 0.95, ry * 0.8, seed + 3, 0.22, 18);
  P.fill(lit, cols.lit, 0.95, 1);
  if (cols.hi) { const hi = P.blob(x + lx * rx * 0.55, y + ly * ry * 0.7, rx * 0.8, ry * 0.5, seed + 5, 0.25, 16); P.fill(hi, cols.hi, 0.85, 1); }
  if (cols.shade) { const sh = P.blob(x - lx * rx * 0.5, y - ly * ry * 0.62, rx * 0.9, ry * 0.55, seed + 7, 0.25, 16); P.fill(sh, cols.shade, 0.55, 1); }
  if (rx > 28) P.texture(w, { col: cols.mid, density: 0.0015, len: [rx * 0.3, rx * 0.9], w: [2, Math.max(3, ry * 0.25)], alpha: [0.05, 0.14], angle: o.angle ?? 0, angleJit: 0.2, cj: 0.1, max: 14, bristles: 2 });
  c.restore();
}
// a cauliflower cloudlet: lumpy puffs over a flat base, lit side toward (lx, ly), hard cel edges
function cloudlet(P, x, y, w, h, cols, seed, o = {}) {
  const r = makeRng(seed), c = P.c, lx = o.lx ?? 0.2, ly = o.ly ?? 1;
  const n = Math.max(3, Math.round(w / h * 1.8));
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.2 + r.f() * 0.6) / n, prof = Math.pow(Math.sin(Math.PI * u), 0.6);
    const rad = h * (0.32 + 0.42 * prof) * r.range(0.75, 1.2);
    puffs.push([x + (u - 0.5) * w, y - rad * 0.5 * prof - r.range(0, 0.18) * h, rad]);
  }
  for (let i = 0; i < n * 1.5; i++) { const p = r.pick(puffs), a = r.range(Math.PI * 1.02, Math.PI * 1.98); puffs.push([p[0] + Math.cos(a) * p[2] * 0.8, p[1] + Math.sin(a) * p[2] * 0.75, p[2] * r.range(0.3, 0.55)]); }
  const base = y + h * (o.base ?? 0.12);
  c.save(); c.beginPath(); c.rect(x - w * 2, base - h * 6, w * 4, h * 6); c.clip();
  c.globalAlpha = o.alpha ?? 1;
  const disc = (px, py, rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(px, py, Math.max(0.3, rr), 0, Math.PI * 2); c.fill(); };
  const sh = css(cols.shade ?? cols.mid), md = css(cols.mid), lt = css(cols.lit), hi = cols.hi ? css(cols.hi) : null;
  for (const p of puffs) disc(p[0], p[1], p[2], sh);
  for (const p of puffs) disc(p[0] + lx * p[2] * 0.16, p[1] + ly * p[2] * 0.16, p[2] * 0.84, md);
  for (const p of puffs) disc(p[0] + lx * p[2] * 0.36, p[1] + ly * p[2] * 0.36, p[2] * 0.6, lt);
  if (hi) for (const p of puffs) if (r.chance(0.6)) disc(p[0] + lx * p[2] * 0.55, p[1] + ly * p[2] * 0.55, p[2] * 0.36, hi);
  c.restore(); c.globalAlpha = 1;
}
// dawn altocumulus field in perspective: big cloudlets high, tiny near the horizon
function paintAltoField(P, w, yTop, yHor, cols, seed, o = {}) {
  const r = makeRng(seed), rows = o.rows ?? 18;
  for (let i = rows - 1; i >= 0; i--) {
    const k = i / (rows - 1), y = yTop + (yHor - yTop) * Math.pow(k, 1.6);
    const s = lerp(o.big ?? 46, o.small ?? 5, Math.pow(k, 0.8));
    let x = -s * 4 * r.f();
    while (x < w + s * 4) {
      const cw = s * r.range(2.5, 6.5);
      const cover = fbm2(x * 0.0018 + seed, y * 0.008 + seed * 0.3, 3);
      if (cover > (o.thresh ?? 0.5)) {
        const fade = lerp(1, 0.55, k);
        const cc = o.hazeTo ? { shade: mixc(cols.shade, o.hazeTo, k * 0.6), mid: mixc(cols.mid, o.hazeTo, k * 0.55), lit: mixc(cols.lit, o.hazeTo, k * 0.35), hi: cols.hi } : cols;
        cloudlet(P, x + cw / 2, y + r.range(-s, s) * 1.1, cw, s, cc, seed * 31 + i * 97 + Math.round(x), { lx: o.lx ?? 0.2, ly: o.ly ?? 1, alpha: fade });
        x += cw * r.range(1.05, 1.6);
      } else x += s * r.range(2, 4);
    }
  }
}
// a cumulus heap: many puffs, flat-ish base, lit from (lx, ly)
function paintCumulus(P, cx, by, w, h, cols, seed, o = {}) {
  const r = makeRng(seed), puffs = [];
  const n = o.n ?? Math.min(26, Math.round(10 + w / 40));
  for (let i = 0; i < n; i++) {
    const u = r.f(), prof = Math.sin(Math.PI * clamp(u * 1.05 - 0.025)) ** 0.7;
    const px = cx + (u - 0.5) * w, ph = h * prof * r.range(0.55, 1);
    const rad = r.range(0.18, 0.32) * Math.min(w * 0.6, h * 1.3) * (0.6 + prof * 0.6);
    puffs.push([px, by - ph + rad * 0.9, rad * r.range(1.0, 1.35), rad]);
  }
  puffs.sort((a, b) => b[1] - a[1]);
  // base shadow body
  const base = [];
  for (let i = 0; i <= 24; i++) { const u = i / 24; base.push([cx + (u - 0.5) * w * 1.02, by - h * 0.18 * Math.sin(Math.PI * u) - (noise2(u * 6 + seed, 1) - 0.5) * h * 0.08]); }
  base.push([cx + w * 0.5, by + h * 0.04]); base.push([cx - w * 0.5, by + h * 0.04]);
  P.fill(base, cols.base ?? cols.shade ?? cols.mid, o.alpha ?? 1, 2);
  puffs.forEach((p, i) => cloudPuff(P, p[0], p[1], p[2], p[3], cols, seed * 13 + i, { lx: o.lx ?? 0.5, ly: o.ly ?? -0.8, lump: 0.14, alpha: o.alpha ?? 1, angle: o.angle ?? 0 }));
}

// ── distant city silhouettes ──
function paintSkyline(P, x0, x1, baseY, o) {
  const r = makeRng(o.seed), c = P.c;
  let x = x0;
  while (x < x1) {
    const bw = r.range(o.wMin, o.wMax);
    const tall = fbm2(x * 0.004 + o.seed, 3.1, 3);
    const bh = lerp(o.hMin, o.hMax, Math.pow(tall, 1.3)) * r.range(0.7, 1.15);
    const top = baseY - bh;
    const col = jitterc(o.col, r, 0.05);
    const pts = [[x, baseY + 4]];
    if (r.chance(o.broken ?? 0.25)) { // ruined jagged top
      const k = r.int(3, 6);
      for (let i = 0; i <= k; i++) pts.push([x + bw * i / k, top + r.range(0, bh * 0.25) * (i % 2 ? 1 : 0.3)]);
    } else {
      pts.push([x, top]);
      if (r.chance(0.3)) { const tx = x + bw * r.range(0.2, 0.6), tw = bw * r.range(0.15, 0.3); pts.push([tx, top], [tx, top - bh * 0.06], [tx + tw, top - bh * 0.06], [tx + tw, top]); }
      pts.push([x + bw, top]);
    }
    pts.push([x + bw, baseY + 4]);
    P.fill(pts, col, 1, o.amp ?? 0.7);
    if (o.lit && r.chance(0.6)) { // sunward edge catching light
      c.globalAlpha = o.litA ?? 0.5; c.fillStyle = css(o.lit);
      c.fillRect(x + bw - Math.max(1.2, bw * 0.12), top + 1, Math.max(1.2, bw * 0.12), bh * r.range(0.3, 1)); c.globalAlpha = 1;
    }
    if (o.win && bh > 14) { // window speckle grid
      const fs = o.floorPx ?? 4, cols = Math.max(1, Math.floor(bw / (fs * 1.6)));
      c.fillStyle = css(o.win);
      for (let fy = top + fs; fy < baseY - fs * 0.5; fy += fs) for (let k = 0; k < cols; k++) {
        if (r.chance(0.35)) continue;
        c.globalAlpha = r.range(0.15, 0.5) * (o.winA ?? 1);
        c.fillRect(x + (k + 0.3) * bw / cols, fy, Math.max(0.8, bw / cols * 0.45), Math.max(0.8, fs * 0.45));
      }
      c.globalAlpha = 1;
    }
    if (o.green && r.chance(o.green)) { // overgrowth clump on the roof
      for (let k = 0; k < 4; k++) P.fill(P.blob(x + r.range(0.1, 0.9) * bw, top - r.range(0, 3), r.range(2, 6) * (o.gs ?? 1), r.range(1.5, 4) * (o.gs ?? 1), r.f() * 99, 0.3, 10), jitterc(o.greenCol ?? PAL.leafMid, r, 0.1), 0.9, 0.4);
    }
    x += bw + (r.chance(0.3) ? r.range(0, bw * 0.4) : -r.range(0, bw * 0.3));
  }
}

// ── facades in perspective ──
// map(u,v) → screen; u: left→right, v: top→bottom. o: {floors,bays,col,seed,style,top(u)->v,lightK,winDark,winSky,detail,vines,haze}
function paintFacade(P, map, o) {
  const c = P.c, r = makeRng(o.seed);
  const top = o.top || (() => 0);
  const outline = [];
  for (let i = 0; i <= 24; i++) outline.push(map(i / 24, top(i / 24)));
  outline.push(map(1, 1), map(0, 1));
  const a = map(0.5, 0), b = map(0.5, 1);
  const vang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pxH = Math.hypot(b[0] - a[0], b[1] - a[1]), pxW = Math.hypot(map(1, 0.5)[0] - map(0, 0.5)[0], map(1, 0.5)[1] - map(0, 0.5)[1]);
  const big = pxH * pxW;
  const w = P.shape(outline, o.col, { angle: vang, sw: [2, Math.max(3, Math.min(10, pxW / 30))], len: [pxH * 0.05, pxH * 0.25], density: 0.0025, talpha: [0.05, 0.13], cj: 0.12, max: 1600, amp: o.amp ?? 0.9, edgeW: 2, edgeA: 0.3 });
  c.save(); P.path(w); c.clip();
  const F = o.floors, B = o.bays;
  const floorPx = pxH / F, bayPx = pxW / B;
  const slab = shadec(o.col, 1.08), under = shadec(o.col, 0.72);
  const dark = o.winDark, sky = o.winSky;
  const quad = (u0, v0, u1, v1) => [map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)];
  const fillQ = (q, col, al = 1) => { P.path(q); c.globalAlpha = al; c.fillStyle = css(col); c.fill(); c.globalAlpha = 1; };
  const lineUV = (u0, v0, u1, v1, col, wpx, al) => { const p0 = map(u0, v0), p1 = map(u1, v1); c.globalAlpha = al; c.strokeStyle = css(col); c.lineWidth = wpx; c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke(); c.globalAlpha = 1; };
  for (let f = 0; f < F; f++) {
    const v0 = f / F, v1 = (f + 1) / F;
    if (o.style !== 'office' && floorPx > 2.2) { // balcony slab bands
      fillQ(quad(0, v0, 1, v0 + 0.16 / F), slab, 0.55);
      lineUV(0, v0 + 0.17 / F, 1, v0 + 0.17 / F, under, Math.max(0.6, floorPx * 0.06), 0.6);
    }
    for (let bi = 0; bi < B; bi++) {
      const u0 = bi / B, u1 = (bi + 1) / B;
      if (v0 < top(u0) + 0.01 || v0 < top(u1) + 0.01) continue;
      const h = hashi(o.seed, f, bi);
      const wu0 = u0 + (o.style === 'office' ? 0.1 : 0.14) / B, wu1 = u1 - (o.style === 'office' ? 0.1 : 0.14) / B;
      const wv0 = v0 + (o.style === 'office' ? 0.14 : 0.3) / F, wv1 = v1 - 0.1 / F;
      let col;
      if (h < 0.42) col = mixc(dark, sky, hashi(o.seed + 5, f, bi) * 0.35);
      else if (h < 0.7) col = mixc(dark, sky, 0.55 + hashi(o.seed + 9, f, bi) * 0.35);
      else if (h < 0.84) col = shadec(dark, 0.62);
      else if (h < 0.9) col = mixc(o.col, dark, 0.35);
      else col = mixc(dark, sky, 0.25);
      const q = quad(wu0, wv0, wu1, wv1);
      if (floorPx < 3 || bayPx < 3) { fillQ(q, col, 0.75); continue; }
      fillQ(q, col, 0.95);
      if (floorPx > 7 && o.detail > 0.3) {
        lineUV(wu0, wv0, wu1, wv0, under, Math.max(0.7, floorPx * 0.08), 0.75); // shadow under lintel
        lineUV(wu0, wv1, wu1, wv1, slab, Math.max(0.7, floorPx * 0.06), 0.6); // sill
        if (h < 0.7 && bayPx > 10) lineUV((wu0 + wu1) / 2, wv0, (wu0 + wu1) / 2, wv1, under, Math.max(0.6, bayPx * 0.03), 0.5); // mullion
        if (h >= 0.7 && h < 0.84 && floorPx > 12) { // broken pane shards
          const p0 = map(wu0, wv0), p2 = map(wu1, wv1);
          c.globalAlpha = 0.7; c.fillStyle = css(mixc(dark, sky, 0.6));
          c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(lerp(p0[0], p2[0], 0.35), p0[1]); c.lineTo(lerp(p0[0], p2[0], 0.12), lerp(p0[1], p2[1], 0.5)); c.closePath(); c.fill(); c.globalAlpha = 1;
        }
        if (h > 0.95 && floorPx > 9) { // plant spilling from a window
          const p = map((wu0 + wu1) / 2, wv1);
          for (let k = 0; k < 5; k++) P.fill(P.blob(p[0] + r.range(-bayPx, bayPx) * 0.3, p[1] + r.range(-2, floorPx * 0.4), bayPx * r.range(0.1, 0.22), floorPx * r.range(0.1, 0.2), r.f() * 99, 0.3, 9), jitterc(k % 2 ? PAL.leafMid : PAL.leafDark, r, 0.1), 0.95, 0.3);
        }
      }
    }
  }
  // grime streaks running down
  const streaks = Math.round((o.stains ?? 1) * B * 2.2);
  for (let i = 0; i < streaks; i++) {
    const u = r.f(), v = Math.max(top(u), r.f() * 0.6), len = r.range(0.08, 0.5);
    const p0 = map(u, v), p1 = map(u + r.range(-0.004, 0.004), Math.min(1, v + len));
    c.globalAlpha = r.range(0.06, 0.16); c.strokeStyle = css(shadec(o.col, 0.6)); c.lineWidth = Math.max(1, bayPx * r.range(0.05, 0.25));
    c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
  }
  c.globalAlpha = 1;
  // lit edge (sun catching the sunward corner)
  if (o.rim) {
    const side = o.rim.side ?? 1, k = o.rim.w ?? 0.03;
    const q = side > 0 ? quad(1 - k, 0, 1, 1) : quad(0, 0, k, 1);
    fillQ(q, o.rim.col, o.rim.a ?? 0.5);
  }
  if (o.lightK != null && o.lightK < 1) { // shade wash
    P.path(w); c.globalAlpha = 1 - o.lightK; c.fillStyle = css(o.shadeCol ?? PAL.shadowCool); c.globalCompositeOperation = 'multiply'; c.fill(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
  // vines draping from the top
  const vines = Math.round((o.vines ?? 0) * B * 0.5);
  for (let i = 0; i < vines; i++) {
    const u = r.f(), v = top(u) + 0.002;
    const p0 = map(u, v), p1 = map(u + r.range(-0.03, 0.03), Math.min(1, v + r.range(0.15, 0.75)));
    paintVine(P, p0, p1, Math.max(0.6, bayPx * 0.05), r.f() * 1e5, o.leafScale ?? Math.max(0.6, bayPx * 0.07));
  }
  if (o.haze) { P.path(w); c.globalAlpha = o.haze[1]; c.fillStyle = css(o.haze[0]); c.fill(); c.globalAlpha = 1; }
  c.restore();
  return w;
}

// a hanging vine with leaves
function paintVine(P, p0, p1, width, seed, leaf) {
  const r = makeRng(seed | 0), c = P.c, pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n, sway = Math.sin(t * 5 + seed) * 0.03 * Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    pts.push([lerp(p0[0], p1[0], t) + sway, lerp(p0[1], p1[1], t)]);
  }
  P.ink(pts, width, PAL.leafDark, 0.85, { amp: width * 0.8, t0: 0.02, t1: 0.4 });
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const nl = Math.round(L / (leaf * 3.2));
  for (let i = 0; i < nl; i++) {
    const t = r.f(), x = lerp(p0[0], p1[0], t) + r.range(-leaf, leaf) * 1.4, y = lerp(p0[1], p1[1], t);
    const s = leaf * (1.2 - t * 0.6) * r.range(0.6, 1.3);
    c.fillStyle = css(jitterc(r.pick([PAL.leafDark, PAL.leafMid, PAL.leafMid, PAL.leafLit]), r, 0.12));
    c.beginPath(); c.ellipse(x, y, s, s * 0.6, r.range(0, Math.PI), 0, Math.PI * 2); c.fill();
  }
}

// a painted tree / bush clump (Ghibli style: dark mass, mid clusters, lit clusters toward light)
function paintTree(P, x, y, s, seed, o = {}) {
  const r = makeRng(seed), c = P.c;
  const lx = o.lx ?? 0.6, ly = o.ly ?? -0.7;
  const cols = o.cols ?? { dark: PAL.leafDark, mid: PAL.leafMid, lit: PAL.leafLit, sun: PAL.leafSun };
  if (o.trunk !== false) P.ink([[x, y], [x + s * 0.05, y - s * 0.4], [x - s * 0.02, y - s * 0.8]], s * 0.09, hex('#4a3a3a'), 1, { amp: s * 0.02 });
  const cy = y - s * (o.trunk === false ? 0.3 : 0.95), clusters = o.n ?? 9;
  const blobs = [];
  for (let i = 0; i < clusters; i++) {
    const a = r.f() * Math.PI * 2, d = Math.sqrt(r.f()) * s * 0.42;
    blobs.push([x + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.8, s * r.range(0.2, 0.34)]);
  }
  blobs.forEach((b, i) => P.fill(P.blob(b[0], b[1], b[2], b[2] * 0.85, seed + i, 0.3, 14), jitterc(cols.dark, r, 0.08), 1, b[2] * 0.06));
  blobs.forEach((b, i) => P.fill(P.blob(b[0] + lx * b[2] * 0.22, b[1] + ly * b[2] * 0.22, b[2] * 0.72, b[2] * 0.6, seed + i + 50, 0.32, 13), jitterc(cols.mid, r, 0.08), 0.95, b[2] * 0.06));
  blobs.forEach((b, i) => { if (r.chance(0.8)) P.fill(P.blob(b[0] + lx * b[2] * 0.42, b[1] + ly * b[2] * 0.42, b[2] * 0.4, b[2] * 0.3, seed + i + 90, 0.35, 11), jitterc(o.sunOn ? cols.sun : cols.lit, r, 0.08), 0.9, b[2] * 0.05); });
  // leafy edge dabs
  c.lineCap = 'round';
  for (let i = 0; i < clusters * 10; i++) {
    const b = r.pick(blobs), a = r.f() * Math.PI * 2;
    const px = b[0] + Math.cos(a) * b[2] * 0.95, py = b[1] + Math.sin(a) * b[2] * 0.8;
    c.fillStyle = css(jitterc(Math.sin(a) * ly + Math.cos(a) * lx > 0.3 ? cols.lit : cols.dark, r, 0.1));
    c.beginPath(); c.ellipse(px, py, b[2] * 0.09, b[2] * 0.06, a, 0, Math.PI * 2); c.fill();
  }
}

// grass tuft cluster
function paintGrass(P, x, y, s, seed, o = {}) {
  const r = makeRng(seed), c = P.c, n = o.n ?? 9;
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const bx = x + r.range(-s, s) * 0.6, h = s * r.range(0.5, 1.2), lean = r.range(-0.5, 0.5) * h;
    c.strokeStyle = css(jitterc(r.pick(o.cols ?? [PAL.leafDark, PAL.leafMid, PAL.leafLit]), r, 0.12));
    c.lineWidth = Math.max(0.6, s * 0.06);
    c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + lean * 0.3, y - h * 0.6, bx + lean, y - h); c.stroke();
  }
}

// utility pole with cross arms; returns wire anchor points
function paintPole(P, x, yb, h, s, col, seed) {
  const r = makeRng(seed), c = P.c;
  P.ink([[x, yb], [x + r.range(-0.6, 0.6) * s, yb - h]], s * 1.6, col, 1, { amp: 0.3 * s, t0: 0.01, t1: 0.02 });
  const anchors = [];
  for (let k = 0; k < 2; k++) {
    const ay = yb - h + s * (4 + k * 7), aw = s * (14 - k * 3);
    P.ink([[x - aw, ay + r.range(-0.6, 0.6)], [x + aw, ay]], s * 0.9, col, 1, { amp: 0.2 * s, t0: 0.02, t1: 0.02 });
    for (const u of [-0.85, -0.35, 0.35, 0.85]) { c.fillStyle = css(col); c.fillRect(x + aw * u - s * 0.4, ay - s * 1.5, s * 0.8, s * 1.5); anchors.push([x + aw * u, ay - s * 1.2]); }
  }
  if (r.chance(0.6)) { c.fillStyle = css(col); c.fillRect(x - s * 1.6 + s * 1.8, yb - h + s * 16, s * 3.2, s * 4.4); } // transformer
  return anchors;
}
function paintWire(P, a, b, sag, w, col, alpha = 0.9) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + sag * 4 * t * (1 - t)]); }
  P.ink(pts, w, col, alpha, { wobble: false, t0: 0.001, t1: 0.001 });
}

// soft drifting mist band painted with long low-alpha strokes
function paintMist(ctx, w, h, y, bandH, col, alpha, seed) {
  const P = new Painter(ctx, seed), r = P.r;
  for (let i = 0; i < w / 18; i++) { const x = r.range(-100, w + 100), yy = y + r.gauss() * bandH * 0.55, rad = r.range(50, 170) * (bandH / 60 + 0.4); P.dab(x, yy, rad, col, alpha * r.range(0.08, 0.2) * (0.6 + fbm2(x * 0.004 + seed, 2, 3))); }
  const n = Math.round(w * bandH / 1400);
  for (let i = 0; i < n; i++) {
    const yy = y + r.gauss() * bandH * 0.45, x = r.range(-200, w);
    P.stroke(x, yy, r.range(-0.03, 0.03), r.range(160, 520), r.range(8, 30), jitterc(col, r, 0.04), alpha * r.range(0.12, 0.45) * fbm2(x * 0.003 + seed, yy * 0.01, 2), { bristles: 3, bend: 0.06 });
  }
}

// rubble heap
function paintRubble(P, cx, cy, w, h, seed, o = {}) {
  const r = makeRng(seed), lit = o.lit ?? PAL.concreteWarm, shade = o.shade ?? PAL.concreteDark;
  const n = o.n ?? Math.round(8 + w / 6);
  for (let i = 0; i < n; i++) {
    const u = r.f(), x = cx + (u - 0.5) * w, top = cy - h * Math.sin(Math.PI * u) * r.range(0.4, 1);
    const s = r.range(0.06, 0.2) * w * (0.5 + Math.sin(Math.PI * u) * 0.5), a = r.f() * 6.28;
    const k = r.int(4, 6), pts = [];
    for (let j = 0; j < k; j++) { const aa = a + j / k * 6.28 + r.range(-0.3, 0.3); pts.push([x + Math.cos(aa) * s * r.range(0.6, 1), top + Math.sin(aa) * s * 0.6 * r.range(0.6, 1)]); }
    P.fill(pts, jitterc(shade, r, 0.12), 1, 0.4);
    const half = pts.slice(0, Math.ceil(k / 2) + 1);
    half.push([x, top]);
    P.fill(half, jitterc(lit, r, 0.1), 0.95, 0.3);
    if (r.chance(0.25)) P.ink([[x, top], [x + r.range(-s, s), top - r.range(s * 0.5, s * 1.5)]], Math.max(0.6, s * 0.08), PAL.rustDark, 0.9, { amp: 0.3 }); // rebar
  }
  if (o.grass) for (let i = 0; i < o.grass; i++) paintGrass(P, cx + r.range(-0.5, 0.5) * w, cy - r.range(0, h * 0.5), r.range(0.15, 0.3) * h, seed + i * 7);
}

// a signboard texture: background colour, hangul text, frame, rust
function makeSign(text, o) {
  const cw = o.w, ch = o.h, cv = newCanvas(cw, ch), c = cv.getContext('2d');
  const P = new Painter(c, o.seed ?? 3), r = P.r;
  P.shape([[2, 2], [cw - 2, 2], [cw - 2, ch - 2], [2, ch - 2]], o.bg, { amp: 0.8, density: 0.006, len: [10, 40], sw: [2, 6], talpha: [0.08, 0.18], cj: 0.12, edgeW: 3 });
  c.strokeStyle = css(o.fg); c.fillStyle = css(o.fg);
  const n = [...text].length, size = Math.min(ch * 0.62, (cw * 0.84) / (n * 1.12));
  const tx = (cw - size * (n * 1.12 - 0.12)) / 2, ty = (ch - size) / 2;
  drawHangul(c, text, tx, ty, size, size * 0.13, r);
  if (o.cross) { c.fillStyle = css(hex('#c8463c')); const s = ch * 0.4, x = cw * 0.08, y = (ch - s) / 2; c.fillRect(x + s / 3, y, s / 3, s); c.fillRect(x, y + s / 3, s, s / 3); }
  // weathering: rust blooms and peeled paint
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, cw), y = r.range(0, ch);
    P.fill(P.blob(x, y, r.range(2, 10), r.range(2, 7), r.f() * 99, 0.4, 10), jitterc(r.chance(0.6) ? PAL.rust : shadec(o.bg, 0.8), r, 0.1), r.range(0.3, 0.75), 0.4);
  }
  for (let i = 0; i < 10; i++) { const x = r.range(0, cw); c.globalAlpha = 0.25; c.strokeStyle = css(PAL.rustDark); c.lineWidth = r.range(1, 3); c.beginPath(); c.moveTo(x, r.range(0, ch * 0.5)); c.lineTo(x + r.range(-2, 2), ch); c.stroke(); }
  c.globalAlpha = 1;
  c.lineWidth = 3; c.strokeStyle = css(PAL.ink); c.globalAlpha = 0.85; c.strokeRect(1.5, 1.5, cw - 3, ch - 3); c.globalAlpha = 1;
  applyPaper(cv, 0.5, o.seed ?? 3);
  return cv;
}

// ── space ──
function paintStars(ctx, w, h, seed, o = {}) {
  const r = makeRng(seed), P = new Painter(ctx, seed + 1);
  // milky band
  const band = (x) => h * (o.bandY ?? 0.35) + (x - w / 2) * (o.bandSlope ?? -0.25);
  for (let i = 0; i < 900; i++) {
    const x = r.range(-100, w + 100), y = band(x) + r.gauss() * h * 0.12;
    P.dab(x, y, r.range(20, 80), r.pick([hex('#3a3f7a'), hex('#5a4a86'), hex('#2f4a7a')]), 0.05);
  }
  for (let i = 0; i < (o.n ?? 2600); i++) {
    const nearBand = r.chance(0.45);
    const x = r.range(0, w), y = nearBand ? band(x) + r.gauss() * h * 0.1 : r.range(0, h);
    const m = Math.pow(r.f(), 5);
    const rad = 0.5 + m * 2.4, a = 0.35 + m * 0.65;
    ctx.fillStyle = css(r.pick([hex('#ffffff'), hex('#dfe6ff'), hex('#fff1d6'), hex('#cfe0ff')]), a);
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    if (m > 0.55) { // painted cross glint
      ctx.strokeStyle = css(hex('#f4f6ff'), a * 0.55); ctx.lineWidth = 0.8;
      const L = rad * r.range(4, 8);
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
    }
  }
}
