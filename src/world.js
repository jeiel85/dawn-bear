// ───────────────────────────── world: the ruined city (layout, perspective-painted towers, street, overpass) ─────────────────────────────
const SUN_AZ = v3.norm([0.35, 0, 0.93]);
function sunDir(elev) { const e = elev * DEG; return v3.norm([SUN_AZ[0] * Math.cos(e), Math.sin(e), SUN_AZ[2] * Math.cos(e)]); }

function mkLayer(depth, ox = 0, oy = 0, w = W, h = H) {
  const canvas = newCanvas(w + 2 * ox, h + 2 * oy);
  return { canvas, ctx: canvas.getContext('2d'), ox, oy, depth };
}
// layer with uneven margins around the frame (left, top, right, bottom)
function mkLayerR(depth, l, t, r, b) { const canvas = newCanvas(W + l + r, H + t + b); return { canvas, ctx: canvas.getContext('2d'), ox: l, oy: t, depth }; }
function lp(L, cam, p) { const s = cam.project(p); return [s[0] + L.ox, s[1] + L.oy, s[2]]; }
// clip a world polygon against the near plane, project into layer pixels
function clipProj(L, cam, pts, near = 1) {
  const vs = pts.map((p) => m4.xfPoint(cam.view, p)), out = [], n = vs.length;
  for (let i = 0; i < n; i++) {
    const a = vs[i], b = vs[(i + 1) % n], ia = -a[2] >= near, ib = -b[2] >= near;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (-near - a[2]) / (b[2] - a[2]); out.push(v3.lerp(a, b, t)); }
  }
  return out.map((v) => [W / 2 + (v[0] / -v[2]) * cam.f + cam.shift[0] + L.ox, H / 2 - (v[1] / -v[2]) * cam.f + cam.shift[1] + L.oy, -v[2]]);
}
function drawImageAffine(c, img, p00, p10, p01, alpha = 1) {
  const w = img.width, h = img.height;
  c.save(); c.globalAlpha = alpha;
  c.setTransform((p10[0] - p00[0]) / w, (p10[1] - p00[1]) / w, (p01[0] - p00[0]) / h, (p01[1] - p00[1]) / h, p00[0], p00[1]);
  c.drawImage(img, 0, 0); c.restore();
}
// image onto a projected quad via two affine triangles
function drawImageQuad(c, img, q) { // q: [tl, tr, br, bl] screen
  const w = img.width, h = img.height;
  const tri = (p0, p1, p2, s0, s1, s2) => {
    c.save(); c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.closePath(); c.clip();
    const dx1 = s1[0] - s0[0], dy1 = s1[1] - s0[1], dx2 = s2[0] - s0[0], dy2 = s2[1] - s0[1], det = dx1 * dy2 - dx2 * dy1;
    const a = ((p1[0] - p0[0]) * dy2 - (p2[0] - p0[0]) * dy1) / det, b = ((p1[1] - p0[1]) * dy2 - (p2[1] - p0[1]) * dy1) / det;
    const cc = ((p2[0] - p0[0]) * dx1 - (p1[0] - p0[0]) * dx2) / det, d = ((p2[1] - p0[1]) * dx1 - (p1[1] - p0[1]) * dx2) / det;
    c.setTransform(a, b, cc, d, p0[0] - a * s0[0] - cc * s0[1], p0[1] - b * s0[0] - d * s0[1]);
    c.drawImage(img, 0, 0); c.restore();
  };
  tri(q[0], q[1], q[2], [0, 0], [w, 0], [w, h]);
  tri(q[0], q[2], q[3], [0, 0], [w, h], [0, h]);
}

// ── city layout ──
const CITY = (() => {
  const r = makeRng(77), boxes = [];
  const styleFor = (h) => (h > 42 ? (r.chance(0.68) ? 'apt' : 'office') : 'old');
  for (const side of [-1, 1]) { // walls of the main street (x = ±24)
    let z = 320;
    while (z > -1150) {
      const w = r.range(22, 44), gap = r.chance(0.18) ? r.range(12, 20) : r.range(2, 6);
      const z1 = z, z0 = z - w, near = z0 < 30 && z1 > -30;
      const h = near ? r.range(80, 98) : Math.abs(z0) < 220 ? r.range(28, 84) : r.range(16, 72);
      const d = r.range(18, 28), style = near ? 'apt' : styleFor(h), xf = side * (24 + (style === 'old' ? 0 : r.range(0, 4)));
      boxes.push({ x0: side < 0 ? xf - d : xf, x1: side < 0 ? xf : xf + d, z0, z1, h, style, seed: r.int(1, 1e6), broken: !near && r.chance(0.3), main: 1, vines: near ? 1.6 : r.range(0.3, 1.2) });
      z = z0 - gap;
    }
  }
  for (let bx = -7; bx <= 7; bx++) for (let bz = -15; bz <= 7; bz++) { // outer city grid
    const cx = bx * 72, cz = bz * 72;
    if (Math.abs(cx) < 80) continue;
    const dense = fbm2(bx * 0.35 + 3, bz * 0.35 + 7, 3);
    const n = dense > 0.45 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = r.range(24, 46), d = r.range(18, 40), ox = r.range(-16, 16), oz = (k - (n - 1) / 2) * 30 + r.range(-6, 6);
      const h = lerp(14, 92, Math.pow(dense, 1.5)) * r.range(0.55, 1.2);
      boxes.push({ x0: cx + ox - w / 2, x1: cx + ox + w / 2, z0: cz + oz - d / 2, z1: cz + oz + d / 2, h, style: styleFor(h), seed: r.int(1, 1e6), broken: r.chance(0.3), vines: r.range(0, 1), roofTree: r.chance(0.35) });
    }
  }
  // the overpass across the street, broken in the middle
  for (let x = -260; x < 260; x += 26) {
    if (x > -10 && x < 12) continue;
    boxes.push({ x0: x, x1: x + 26, z0: -340, z1: -324, y0: 13, h: 15.6, style: 'deck', seed: 900 + x, broken: false, vines: 0.6 });
    if (((x + 260) / 26) % 2 === 0) boxes.push({ x0: x + 10, x1: x + 15, z0: -336, z1: -328, h: 13, style: 'pillar', seed: 1900 + x, vines: 1 });
  }
  return boxes;
})();

const FACE_COLS = { apt: ['#cbb39f', '#d4bca2', '#bba9a6', '#cdb4a4', '#c4b8a8'], office: ['#8f9db4', '#9ba6b9', '#8a92a8'], old: ['#c29f82', '#ab9189', '#bb9f78', '#b38e84', '#9c948e'], deck: ['#ada4a0'], pillar: ['#a39b98'] };

// paint one tower box into a layer
function paintBox(P, L, cam, b, env) {
  const c = P.c, y0 = b.y0 ?? 0, h = b.h;
  const corners = [];
  for (const x of [b.x0, b.x1]) for (const y of [y0, h]) for (const z of [b.z0, b.z1]) corners.push([x, y, z]);
  const pr = corners.map((p) => lp(L, cam, p));
  if (pr.every((s) => s[2] < 1)) return;
  const lw = L.canvas.width, lh = L.canvas.height;
  if (pr.every((s) => s[0] < -50) || pr.every((s) => s[0] > lw + 50) || pr.every((s) => s[1] < -50) || pr.every((s) => s[1] > lh + 50)) return;
  const r = makeRng(b.seed), base = hex(r.pick(FACE_COLS[b.style] || FACE_COLS.old));
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, dist = v3.len(v3.sub([cx, h / 2, cz], cam.pos));
  const faces = [
    { n: [1, 0, 0], q: [[b.x1, h, b.z1], [b.x1, h, b.z0], [b.x1, y0, b.z0], [b.x1, y0, b.z1]], w: b.z1 - b.z0 },
    { n: [-1, 0, 0], q: [[b.x0, h, b.z0], [b.x0, h, b.z1], [b.x0, y0, b.z1], [b.x0, y0, b.z0]], w: b.z1 - b.z0 },
    { n: [0, 0, 1], q: [[b.x0, h, b.z1], [b.x1, h, b.z1], [b.x1, y0, b.z1], [b.x0, y0, b.z1]], w: b.x1 - b.x0 },
    { n: [0, 0, -1], q: [[b.x1, h, b.z0], [b.x0, h, b.z0], [b.x0, y0, b.z0], [b.x1, y0, b.z0]], w: b.x1 - b.x0 },
  ];
  const jag = b.broken ? (u) => Math.max(0, fbm2(u * 3.5 + b.seed % 97, 2.2, 3) - 0.42) * 0.55 : null;
  for (const fc of faces) {
    const ctr = v3.mul(v3.add(fc.q[0], fc.q[2]), 0.5);
    if (v3.dot(fc.n, v3.sub(cam.pos, ctr)) <= 0) continue;
    const sun = Math.max(0, v3.dot(fc.n, env.sun)) * env.sunOn + (1 - env.sunOn) * 0.32 * Math.max(0, v3.dot(fc.n, SUN_AZ));
    const shadeC = mixc(shadec(base, 0.58), env.cool, 0.36), litC = shadec(mixc(base, env.warm, 0.36), 1.06);
    let col = mixc(shadeC, litC, clamp(sun * 1.7));
    col = hazeMix(env, col, dist);
    const pq = fc.q.map((p) => lp(L, cam, p));
    if (pq.some((s) => s[2] < 1)) { const cp = clipProj(L, cam, fc.q); if (cp.length > 2) P.fill(cp, col, 1, 0.6); continue; }
    const area = Math.abs((pq[1][0] - pq[0][0]) * (pq[3][1] - pq[0][1]) - (pq[3][0] - pq[0][0]) * (pq[1][1] - pq[0][1]));
    const hz = clamp(1 - Math.exp(-dist / env.hazeDist), 0, 0.92);
    const winDark = hazeMix(env, mixc(hex('#34314a'), env.cool, 0.25), dist), winSky = hazeMix(env, env.skyRef, dist * 0.6);
    if (area < 5200 * env.detail) { // far: a painted mass with weathering strokes and broken floor bands
      const map = quadMap(pq), sq = Math.sqrt(area);
      const out = []; for (let i = 0; i <= 8; i++) out.push(map(i / 8, jag ? jag(i / 8) : 0)); out.push(pq[2], pq[3]);
      const w = P.fill(out, col, 1, 0.5);
      if (sq > 6) {
        c.save(); P.path(w); c.clip();
        const a0 = map(0.5, 0), a1 = map(0.5, 1), va = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
        for (let i = 0; i < 5; i++) { const p = map(r.f(), r.f() * 0.6); P.stroke(p[0], p[1], va, sq * r.range(0.3, 0.9), Math.max(1.5, sq * 0.07), jitterc(shadec(col, r.range(0.84, 1.08)), r, 0.08), 0.3, { bristles: 2 }); }
        const F = Math.max(2, Math.round((h - y0) / 5.5));
        c.strokeStyle = css(winDark); c.lineWidth = Math.max(0.6, sq / F * 0.32);
        for (let f = 1; f < F; f++) {
          if (hashi(b.seed, f, 9) < 0.25) continue;
          let u = 0.05;
          while (u < 0.95) { const L = 0.08 + hashi(b.seed, f, Math.round(u * 100)) * 0.3, p0 = map(u, f / F), p1 = map(Math.min(0.95, u + L), f / F); c.globalAlpha = (0.18 + 0.2 * hashi(f, b.seed, 3)) * (1 - hz); c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke(); u += L + 0.04 + hashi(f, Math.round(u * 50), b.seed) * 0.12; }
        }
        c.globalAlpha = 1; c.restore();
        P.edge(w, shadec(col, 0.8), Math.max(1, sq * 0.04), 0.35);
      }
      continue;
    }
    const floors = Math.max(2, Math.round((h - y0) / (b.style === 'office' ? 3.6 : 2.9)));
    const bays = Math.max(1, Math.round(fc.w / (b.style === 'office' ? 3.2 : 4.6)));
    const plain = b.style === 'deck' || b.style === 'pillar';
    const map = quadMap(pq);
    if (plain) {
      const w = P.shape(pq, col, { angle: Math.atan2(pq[1][1] - pq[0][1], pq[1][0] - pq[0][0]), sw: [2, 6], len: [10, 60], density: 0.002, talpha: [0.06, 0.14], cj: 0.12, max: 600, amp: 0.6 });
      for (let i = 0; i < 6; i++) { const u = r.f(), p0 = map(u, 0), p1 = map(u + r.range(-0.01, 0.01), r.range(0.4, 1)); c.globalAlpha = 0.14; c.strokeStyle = css(shadec(col, 0.6)); c.lineWidth = r.range(1, 4); c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke(); c.globalAlpha = 1; }
      if (b.vines) for (let i = 0; i < 3; i++) { const u = r.f(); paintVine(P, map(u, 0), map(u + r.range(-0.05, 0.05), r.range(0.3, 1)), 1.2, b.seed + i, Math.max(1, Math.sqrt(area) * 0.012)); }
      continue;
    }
    paintFacade(P, map, {
      floors, bays, col, seed: b.seed + fc.n[0] * 7 + fc.n[2] * 13, style: b.style, top: jag, detail: env.detail,
      end: b.style === 'apt' && fc.w < Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.8,
      winDark, winSky, vines: b.vines ?? 0.5, stains: 1.2, amp: 0.7,
      rim: sun > 0.05 && env.sunOn ? { side: v3.dot(fc.n, [SUN_AZ[2], 0, -SUN_AZ[0]]) > 0 ? -1 : 1, col: env.warm, a: 0.35 * (1 - hz), w: 0.025 } : null,
      haze: hz > 0.05 ? [env.haze, hz * 0.5] : null,
    });
    if (b.style === 'old' && env.signs && area > 4000 && r.chance(0.7)) { // shop sign over the ground floor
      const sg = env.signs[b.seed % env.signs.length];
      const v0 = 1 - 1.6 / floors, v1 = 1 - 1.05 / floors;
      drawImageQuad(c, sg, [map(0.08, v0), map(0.92, v0), map(0.92, v1), map(0.08, v1)]);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  // roof seen from above
  if (cam.pos[1] > h + 1 && !b.broken && b.style !== 'pillar') {
    const top = clipProj(L, cam, [[b.x0, h, b.z0], [b.x1, h, b.z0], [b.x1, h, b.z1], [b.x0, h, b.z1]]);
    if (top.length > 2) {
      const rc = hazeMix(env, mixc(mixc(base, hex('#c9b7a7'), 0.4), env.warm, 0.25 * env.sunOn), dist);
      const w = P.fill(top, rc, 1, 0.5);
      P.edge(w, shadec(rc, 0.75), 2, 0.4);
      const pxs = Math.sqrt(Math.abs((top[1][0] - top[0][0]) * (top[2][1] - top[1][1])) + 1);
      if (pxs > 14 && b.style !== 'deck') {
        const tx = lerp(b.x0, b.x1, r.range(0.2, 0.7)), tz = lerp(b.z0, b.z1, r.range(0.2, 0.7));
        const box = { x0: tx, x1: tx + Math.min(8, (b.x1 - b.x0) * 0.3), z0: tz, z1: tz + Math.min(7, (b.z1 - b.z0) * 0.3), y0: h, h: h + 3.5, style: 'deck', seed: b.seed + 5, vines: 0 };
        paintBox(P, L, cam, box, env);
        const tk = lp(L, cam, [lerp(b.x0, b.x1, r.range(0.15, 0.85)), h + 4, lerp(b.z0, b.z1, r.range(0.15, 0.85))]);
        const ts = 3 / cam.upp(tk[2]);
        if (ts > 1.2) { c.fillStyle = css(hazeMix(env, hex('#6f6a76'), dist)); c.fillRect(tk[0] - ts, tk[1] - ts * 0.4, ts * 2, ts * 1.6); c.beginPath(); c.ellipse(tk[0], tk[1] - ts * 0.4, ts, ts * 0.35, 0, 0, Math.PI * 2); c.fill(); }
        if (b.roofTree || r.chance(0.4)) {
          const tp = lp(L, cam, [lerp(b.x0, b.x1, r.range(0.2, 0.8)), h, lerp(b.z0, b.z1, r.range(0.2, 0.8))]);
          const s = r.range(6, 11) / cam.upp(tp[2]);
          if (s > 2) paintTree(P, tp[0], tp[1], s, b.seed + 9, { sunOn: env.sunOn, cols: hazeLeaf(env, dist) });
        }
        for (let i = 0; i < 3; i++) { const gp = lp(L, cam, [lerp(b.x0, b.x1, r.f()), h, lerp(b.z0, b.z1, r.f())]); const s = 2.5 / cam.upp(gp[2]); if (s > 1) paintGrass(P, gp[0], gp[1], s, b.seed + 30 + i, { n: 6, cols: [hazeMix(env, PAL.leafMid, dist), hazeMix(env, PAL.leafLit, dist)] }); }
      }
    }
  }
}
function hazeLeaf(env, d) { return { dark: hazeMix(env, PAL.leafDark, d), mid: hazeMix(env, PAL.leafMid, d), lit: hazeMix(env, PAL.leafLit, d), sun: hazeMix(env, PAL.leafSun, d) }; }

// paint every box in back-to-front order (optionally only those in a depth range)
function paintCity(P, L, cam, env, o = {}) {
  const list = CITY.filter((b) => {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const v = m4.xfPoint(cam.view, [cx, b.h / 2, cz]), d = -v[2];
    if (d < (o.dmin ?? -1e9) || d > (o.dmax ?? 1e9)) return false;
    if (o.filter && !o.filter(b)) return false;
    return d > -60;
  }).map((b) => ({ b, d: v3.len(v3.sub([(b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2], cam.pos)) }));
  list.sort((a, b) => b.d - a.d);
  for (const { b } of list) paintBox(P, L, cam, b, env);
}

// ground: street + sidewalks in haze strips, then details
function paintGround(P, L, cam, env, o = {}) {
  const c = P.c, r = makeRng(o.seed ?? 4);
  const zFar = o.zFar ?? -1150, zNear = o.zNear ?? 320, xW = o.xW ?? 600;
  const step = o.step ?? 24;
  for (let z = zFar; z < zNear; z += step) {
    const mid = [0, 0, z + step / 2], d = v3.len(v3.sub(mid, cam.pos));
    const lot = hazeMix(env, mixc(hex('#77707f'), env.warm, 0.12 * env.sunOn), d);
    const walk = hazeMix(env, mixc(PAL.paving, env.warm, 0.15 * env.sunOn), d);
    const road = hazeMix(env, mixc(PAL.asphalt, env.cool, 0.1), d);
    for (const [x0, x1, col] of [[-xW, -24, lot], [-24, -18, walk], [-18, 18, road], [18, 24, walk], [24, xW, lot]]) {
      const q = clipProj(L, cam, [[x0, 0, z], [x1, 0, z], [x1, 0, z + step + 0.5], [x0, 0, z + step + 0.5]]);
      if (q.length > 2) { P.path(q); c.fillStyle = css(col); c.fill(); }
    }
  }
  // texture strokes along the street direction
  const vp = lp(L, cam, [0, 0, -3000]);
  const road = clipProj(L, cam, [[-24, 0, zFar], [24, 0, zFar], [24, 0, zNear], [-24, 0, zNear]]);
  c.save(); if (road.length > 2) { P.path(road); c.clip(); }
  for (let i = 0; i < (o.strokes ?? 1400); i++) {
    const x = r.range(-18, 18), z = r.range(zFar, zNear), p = lp(L, cam, [x, 0, z]);
    if (p[2] < 2) continue;
    const s = 1 / cam.upp(p[2]);
    const ang = Math.atan2(vp[1] - p[1], vp[0] - p[0]), toVp = Math.hypot(vp[0] - p[0], vp[1] - p[1]);
    P.stroke(p[0], p[1], ang, Math.min(r.range(4, 14) * s, toVp * 0.5), r.range(0.3, 0.9) * s, hazeMix(env, jitterc(r.chance(0.5) ? PAL.asphaltLit : PAL.asphalt, r, 0.15), p[2]), r.range(0.15, 0.35), { bristles: 2 });
  }
  c.restore();
  // lane markings (faded dashes)
  for (let z = zFar; z < zNear; z += 9) {
    for (const lx of [-0.2, -9.2, 8.8]) {
      if (lx !== -0.2 && hashi(Math.round(z), lx * 10) < 0.3) continue;
      const q = clipProj(L, cam, [[lx, 0.02, z], [lx + 0.45, 0.02, z], [lx + 0.45, 0.02, z + 4.5], [lx, 0.02, z + 4.5]]);
      if (q.length > 2) { P.path(q); c.fillStyle = css(hazeMix(env, lx === -0.2 ? hex('#c9a95a') : hex('#d8d2cc'), q[0][2]), 0.55 * hashi(Math.round(z), 3)); c.fill(); }
    }
  }
  // curbs
  for (const x of [-18, 18]) {
    const pts = []; for (let z = zFar; z <= zNear; z += 8) { const p = lp(L, cam, [x, 0.3, z]); if (p[2] > 1) pts.push(p); }
    if (pts.length > 1) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineWidth = 1.5; c.strokeStyle = css(hazeMix(env, hex('#b4a9ad'), 200), 0.7); c.stroke(); }
  }
  // cracks with grass
  for (let i = 0; i < (o.cracks ?? 90); i++) {
    let x = r.range(-20, 20), z = r.range(zFar * 0.4, zNear * 0.6), a = r.f() * 6.28;
    const pts = [];
    for (let k = 0; k < 8; k++) { pts.push(lp(L, cam, [x, 0.03, z])); a += r.range(-0.7, 0.7); x += Math.cos(a) * 1.6; z += Math.sin(a) * 1.6; }
    if (pts.some((p) => p[2] < 2)) continue;
    const s = 1 / cam.upp(pts[0][2]);
    if (s < 0.4) continue;
    c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.lineWidth = Math.max(0.6, s * 0.12); c.strokeStyle = css(hazeMix(env, hex('#2f2b3a'), pts[0][2]), 0.8); c.stroke();
    if (r.chance(0.6)) { const g = pts[r.int(0, 7)]; paintGrass(P, g[0], g[1], s * r.range(0.8, 1.8), i * 7 + 1, { n: 7, cols: [hazeMix(env, PAL.leafMid, g[2]), hazeMix(env, PAL.leafLit, g[2]), hazeMix(env, PAL.leafDark, g[2])] }); }
  }
  // puddles reflecting the sky
  for (let i = 0; i < (o.puddles ?? 14); i++) {
    const x = r.range(-15, 15), z = r.range(-300, 120), rx = r.range(2, 6), rz = r.range(1.5, 4);
    const pts = []; for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28; pts.push([x + Math.cos(a) * rx * (1 + (noise2(k, i) - 0.5) * 0.4), 0.04, z + Math.sin(a) * rz]); }
    const q = clipProj(L, cam, pts); if (q.length < 3) continue;
    P.fill(q, hazeMix(env, mixc(env.skyRef, hex('#e9cdbf'), 0.3), q[0][2]), 0.85, 0.5);
  }
  // street trees and rubble along the walls
  if (o.trees !== false) for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, z = 300 - i * 52 + r.range(-10, 10), x = side * r.range(20, 22.5);
    const p = lp(L, cam, [x, 0, z]); if (p[2] < 5) continue;
    const s = r.range(7, 11) / cam.upp(p[2]);
    if (s > 2 && Math.abs(z) > 14) paintTree(P, p[0], p[1], s, 50 + i, { sunOn: env.sunOn, cols: hazeLeaf(env, p[2]), lx: 0.5, ly: -0.6 });
  }
  if (o.rubble !== false) for (let i = 0; i < 34; i++) {
    const side = r.sign(), z = r.range(-900, 260), x = side * r.range(16, 23);
    const p = lp(L, cam, [x, 0, z]); if (p[2] < 5) continue;
    const s = 1 / cam.upp(p[2]);
    paintRubble(P, p[0], p[1], r.range(5, 12) * s, r.range(1.5, 4) * s, 300 + i, { lit: hazeMix(env, PAL.concreteWarm, p[2]), shade: hazeMix(env, PAL.concreteDark, p[2]), grass: 2 });
  }
}

// power poles + sagging wires along a line of world points
function paintPoles(P, L, cam, env, pts, o = {}) {
  const c = P.c, tops = [];
  for (const [i, b] of pts.entries()) {
    const a = lp(L, cam, b), t = lp(L, cam, [b[0], b[1] + (o.h ?? 11), b[2]]);
    if (a[2] < 2) { tops.push(null); continue; }
    const s = 0.25 / cam.upp(a[2]);
    const col = hazeMix(env, hex('#3a3340'), a[2] * (o.hazeK ?? 1));
    P.ink([[a[0], a[1]], [t[0], t[1]]], Math.max(1, s * 1.6), col, 1, { amp: 0.4, t0: 0.01, t1: 0.03 });
    const arm = lp(L, cam, [b[0] + 1.6, b[1] + (o.h ?? 11) - 0.8, b[2]]), arm2 = lp(L, cam, [b[0] - 1.6, b[1] + (o.h ?? 11) - 0.8, b[2]]);
    P.ink([[arm2[0], arm2[1]], [arm[0], arm[1]]], Math.max(0.8, s * 0.9), col, 1, { amp: 0.2, t0: 0.02, t1: 0.02 });
    tops.push([[b[0] - 1.4, b[1] + (o.h ?? 11) - 0.9, b[2]], [b[0] + 1.4, b[1] + (o.h ?? 11) - 0.9, b[2]], [b[0], b[1] + (o.h ?? 11) - 2.6, b[2]]]);
  }
  for (let i = 1; i < tops.length; i++) {
    if (!tops[i] || !tops[i - 1]) continue;
    for (let k = 0; k < 3; k++) {
      const A = tops[i - 1][k], B = tops[i][k], sag = (o.sag ?? 1.6) * (1 + k * 0.3), seg = [];
      for (let j = 0; j <= 20; j++) { const u = j / 20; seg.push(lp(L, cam, [lerp(A[0], B[0], u), lerp(A[1], B[1], u) - sag * 4 * u * (1 - u), lerp(A[2], B[2], u)])); }
      if (seg.some((p) => p[2] < 1)) continue;
      c.beginPath(); seg.forEach((p, j) => (j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.lineWidth = Math.max(0.7, 0.05 / cam.upp(seg[10][2])); c.strokeStyle = css(hazeMix(env, hex('#2e2834'), seg[10][2] * (o.hazeK ?? 1)), 0.9); c.stroke();
    }
  }
}

// sky for a camera: gradient keyed to the horizon, painted strokes, sun glow, dawn altocumulus
function paintSkyFor(L, cam, stops, seed, o = {}) {
  const c = L.ctx, w = L.canvas.width, h = L.canvas.height;
  const hor = lp(L, cam, v3.add(cam.pos, [cam.fwd[0] * 9000, 0, cam.fwd[2] * 9000]));
  const top = o.top ?? hor[1] - (o.span ?? 900);
  paintSky(c, w, h, stops, seed, { y0: top, y1: hor[1] + (o.below ?? 40) });
  const sp = lp(L, cam, v3.add(cam.pos, v3.mul(o.sunDir ?? sunDir(o.sunElev ?? 2), 9000)));
  if (sp[2] > 0 && o.glow !== false) {
    const P = new Painter(c, seed + 3);
    for (let i = 0; i < 14; i++) P.dab(sp[0] + P.r.range(-60, 60), sp[1] + P.r.range(-20, 20), (o.glowR ?? 500) * (0.25 + i * 0.07), o.glowCol ?? hex('#fff1cf'), (o.glowA ?? 0.1));
  }
  if (o.clouds !== false) {
    const P = new Painter(c, seed + 9);
    paintAltoField(P, w, top + (o.cloudTop ?? 60), hor[1] - (o.cloudGap ?? 30), o.cloudCols ?? { mid: hex('#ad94b6'), lit: hex('#f6bda2'), hi: hex('#ffe0bc'), shade: hex('#7f75a3') }, seed + 1, { rows: o.rows ?? 16, big: o.big ?? 50, small: o.small ?? 5, thresh: o.thresh ?? 0.52, lx: o.lx ?? (sp[0] > w / 2 ? 0.35 : -0.35), ly: o.ly ?? (stops === PAL.dayGold ? -0.75 : 0.9), litBand: stops === PAL.dayGold ? 0.62 : 0.45, hazeTo: gradStops(stops, 0.9) });
  }
  return { hor, sun: sp };
}
