// ───────────────────────────── shots: the 91-second film, cut by cut ─────────────────────────────
let ROBOT = null;
const SHOTS = [];
function shot(t0, t1, name, def) { SHOTS.push(Object.assign({ t0, t1, name }, def)); }
const C = (pos, target, fov = 40, roll = 0, shift = [0, 0]) => new Cam(pos, target, fov, roll, shift);
function camShifted(cam, dx, dy) { const c = cam.clone(); c.shift = [cam.shift[0] + dx, cam.shift[1] + dy]; return c.update(); }
const boneP = (B, name, p = [0, 0, 0]) => m4.xfPoint(B[name], p);
function shake(f, amp, seed = 1, hold = 1) { const k = Math.floor(f / hold); return [(hashi(k, seed, 1) - 0.5) * 2 * amp, (hashi(k, seed, 2) - 0.5) * 2 * amp]; }

const LIGHT = {
  pre: () => ({ sunDir: sunDir(3), sunCol: [1, 0.8, 0.62], sunOn: 0, amb: [0.9, 0.88, 1.08], skyCol: [0.74, 0.72, 0.96], skyFill: 1, rimDir: v3.norm([0.25, 0.5, 0.85]), rimCol: [1, 0.82, 0.78], rimOn: 0.5 }),
  dawn: (e = 7) => ({ sunDir: sunDir(e), sunCol: [1, 0.8, 0.58], sunOn: 1, amb: [0.84, 0.83, 1.1], skyCol: [0.7, 0.74, 1], skyFill: 0.75, rimDir: v3.norm([-0.35, 0.35, -0.85]), rimCol: [1, 0.86, 0.72], rimOn: 0.45 }),
  sky: () => ({ sunDir: v3.norm([0.6, 0.35, 0.72]), sunCol: [1, 0.9, 0.75], sunOn: 1, amb: [0.86, 0.9, 1.12], skyCol: [0.72, 0.84, 1], skyFill: 0.8, rimDir: v3.norm([-0.5, 0.2, -0.8]), rimCol: [1, 0.93, 0.8], rimOn: 0.55 }),
  space: () => ({ sunDir: v3.norm([1, 0.12, 0.15]), sunCol: [1, 0.88, 0.7], sunOn: 1, amb: [0.62, 0.6, 1.0], skyCol: [0.45, 0.42, 0.9], skyFill: 0.35, rimDir: v3.norm([-0.6, -0.5, 0.2]), rimCol: [0.55, 0.75, 1], rimOn: 0.7 }),
};
const ENV = {
  pre: () => makeEnv({ sunOn: 0, sun: sunDir(3), haze: hex('#b7a4cc'), hazeDist: 460, skyRef: hex('#a99cc4'), warm: hex('#f1c3a6'), cool: hex('#5f5a8a') }),
  dawn: (e = 7) => makeEnv({ sunOn: 1, sun: sunDir(e), haze: hex('#ebc7b2'), hazeDist: 520, skyRef: hex('#cbb9cb'), warm: hex('#ffcd96'), cool: hex('#625c8e') }),
};

// draw the GPU robot through the current camera
let LAST_ROBOT = null; // debug: last camera + skeleton, for framing probes
function drawRobot(c, cam, pose, st = {}) {
  const B = solvePose(pose);
  const mats = ROBOT.partMatrices(B);
  LAST_ROBOT = { cam, B, mats };
  const img = ROBOT.render(Object.assign({ mats, cam, center: boneP(B, 'chest'), radius: 27, boil: 0 }, st));
  c.drawImage(img, 0, 0);
  return { B, mats };
}
// eyes / chest / ears timing across the film
function eyeGlow(t) {
  if (t < 29.6) return 0;
  if (t < 30.05) { const fl = [0.3, 0, 0.55, 0.1, 0.8, 0.5, 1]; return fl[Math.min(6, Math.floor((t - 29.6) * 24 / 1.5))]; }
  if (t < 49.4) return 1;
  if (t < 50.6) return 1 + 0.5 * smoothstep(49.4, 50.3, t);
  if (t < 72) return 1.5;
  return 1.5 - 0.2 * smoothstep(72, 75, t);
}
function chestGlow(t) {
  if (t < 27.1) return 0;
  const pulse = (a, len, v) => (t >= a && t < a + len ? v : 0);
  if (t < 28.0) return Math.max(pulse(27.1, 0.09, 0.7), pulse(27.4, 0.13, 0.85), pulse(27.8, 0.09, 0.6));
  return Math.min(1, 0.55 + 0.45 * smoothstep(28.0, 28.5, t));
}
function lidAt(t) { if (t < 29.6) return 0.42; if (t < 30.0) return lerp(0.42, 0, easeOut(invLerp(29.6, 30.0, onN(t, 2)), 2)); return 0; }
function earsAt(t, base) {
  let k = 0;
  for (const tw of [30.3, 30.65]) if (t >= tw && t < tw + 0.25) k = Math.sin((t - tw) / 0.25 * Math.PI);
  const perk = t > 50.8 ? keys([[50.8, 0], [50.95, 1.25, (u) => easeOut(u, 2)], [51.2, 1]], t) : 0;
  const r = base ?? [-22, 0, -16];
  return { earL: [r[0] + 28 * perk + 14 * k, r[1], r[2] + 14 * perk + 10 * k], earR: [r[0] + 28 * perk + 14 * k, r[1], -(r[2] + 14 * perk + 10 * k)] };
}
function withEars(pose, t) { const e = earsAt(t, pose.rot.earL); pose.rot.earL = e.earL; pose.rot.earR = e.earR; return pose; }

// the kneeling (dormant) pose, with ears per time
function kneelPose(t) { return withEars(poseFrom(KP.kneel), t); }

// cables between the towers and the robot: [tower anchor, robot bone, local socket, slack]
const CABLES = [
  [[-24, 42, -6], 'chest', [-2.6, 2.2, -5.0], 16, 41.9], [[-24, 33, 12], 'shoulderR', [-1.0, 1.4, -1.2], 9, 42.7],
  [[24, 46, -10], 'chest', [2.6, 2.4, -5.0], 18, 41.5], [[24, 30, 6], 'shoulderL', [1.2, 1.2, -1.5], 8, 42.3],
  [[-24, 55, -26], 'chest', [0.8, 3.0, -5.0], 24, 43.2],
];
function drawCables(c, cam, B, t, upp0) {
  for (const [A, bone, loc, slack, tSnap] of CABLES) {
    const R = boneP(B, bone, loc);
    const snapped = t > tSnap, k = snapped ? t - tSnap : 0;
    const L = v3.len(v3.sub(R, A)) + slack * 0.6;
    let end = R, sag = slack * clamp(1 - Math.max(0, v3.len(v3.sub(R, A)) - 52) / 10, 0.05, 1);
    if (snapped) { // whip down toward the tower and swing
      const hang = v3.add(A, [0, -L * 0.85, 0]);
      const sw = Math.exp(-k * 1.4) * Math.cos(k * 4.2);
      end = v3.lerp(hang, R, clamp(sw, -0.4, 1) * 0.6 + 0.4 * Math.exp(-k * 6));
      sag = slack * 0.3 * (1 - Math.exp(-k * 3));
    }
    const pts = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(cam.project([lerp(A[0], end[0], u), lerp(A[1], end[1], u) - sag * 4 * u * (1 - u), lerp(A[2], end[2], u)])); }
    if (pts.some((p) => p[2] < 0.5)) continue;
    const w = Math.max(1.2, 0.45 / cam.upp(pts[12][2]));
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); inkStroke(c, w, 'rgba(36,30,40,.96)');
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1] - w * 0.28) : c.moveTo(p[0], p[1] - w * 0.28))); inkStroke(c, Math.max(0.6, w * 0.22), 'rgba(205,180,190,.4)');
    if (!snapped) { const s = pts[24], r0 = w * 1.4; c.fillStyle = '#4b4652'; c.beginPath(); c.arc(s[0], s[1], r0, 0, 6.3); c.fill(); inkStroke(c, 1.2); }
  }
}

// the pharmacy sign leaning on the right knee; tips over and lands at t=39.7
let SIGN_IMG = null;
function signQuad(B, t) {
  const knee = boneP(B, 'kneeR');
  const base = [knee[0] - 0.4, 0, Math.max(knee[2], 1.0) + 4.6];
  let ang = -24; // degrees from vertical, negative = leaning back onto the knee
  if (t > 38.9) ang = t < 39.7 ? lerp(-24, 90, easeIn(invLerp(38.9, 39.7, t), 2.6)) : 90 - 7 * Math.exp(-(t - 39.7) * 7) * Math.abs(Math.sin((t - 39.7) * 18));
  const a = ang * DEG, hw = 3.6, hh = 5.2;
  const up = [0, Math.cos(a), Math.sin(a)];
  const bl = [base[0] - hw, base[1], base[2]], br = [base[0] + hw, base[1], base[2]];
  return [v3.add(bl, v3.mul(up, hh)), v3.add(br, v3.mul(up, hh)), br, bl];
}
function drawSign(c, cam, B, t) { const q = signQuad(B, t).map((p) => cam.project(p)); if (q.some((p) => p[2] < 1)) return; drawImageQuad(c, SIGN_IMG, q); c.setTransform(1, 0, 0, 1, 0, 0); }

// sparrow on the robot's left shoulder (world-space perch); returns screen pos
function perchPoint(B) { return boneP(B, 'shoulderL', [0.6, 2.75, 0.4]); }

const CLOUD_IMGS = [], CLOUD_CARD_COUNT = 6;
let PLANET = null, STARS = null;

// ───────── S1 0–7 · extreme wide, slow pan right, fade in ─────────
shot(0, 7, 'city-wide', {
  cam0: C([4, 165, -960], [-85, 22, 0], 34),
  camAt(s) { const u = easeInOut(s / 7, 1.6); return C([-6 + 22 * u, 165, -960], [-190 + 215 * u, 22, 0], 34); },
  async paint(Y) {
    const cam = this.cam0, env = ENV.pre();
    env.hazeDist = 1500; env.detail = 0.8; env.haze = hex('#a998c4');
    this.sky = mkLayer(9000, 420, 80);
    paintSkyFor(this.sky, cam, PAL.dawnSky, 11, { sunDir: sunDir(-1.5), glowR: 700, glowA: 0.1, span: 1000, rows: 9, big: 180, small: 16, thresh: 0.5 });
    applyPaper(this.sky.canvas, 0.45, 2); await Y();
    this.far = mkLayer(4000, 420, 80);
    { const L = this.far, P = new Painter(L.ctx, 21), hor = lp(L, cam, [cam.pos[0] + cam.fwd[0] * 9000, 0, cam.pos[2] + cam.fwd[2] * 9000])[1];
      paintSkyline(P, 0, L.canvas.width, hor + 4, { seed: 5, wMin: 14, wMax: 40, hMin: 6, hMax: 34, col: hex('#a596b6'), win: hex('#c9b8cf'), winA: 0.4, floorPx: 2.5, broken: 0.3, lit: hex('#f2c9b6'), litA: 0.35, green: 0.2, gs: 0.6 });
      paintSkyline(P, 0, L.canvas.width, hor + 10, { seed: 6, wMin: 18, wMax: 52, hMin: 10, hMax: 46, col: hex('#9387a8'), win: hex('#b9a8c2'), winA: 0.5, floorPx: 3, broken: 0.35, lit: hex('#efc0ad'), litA: 0.35, green: 0.3, gs: 0.8 });
      paintMist(L.ctx, L.canvas.width, L.canvas.height, hor + 8, 40, hex('#d9c6d6'), 0.5, 3); }
    applyPaper(this.far.canvas, 0.4, 3); await Y();
    this.back = mkLayer(1300, 420, 80);
    { const P = new Painter(this.back.ctx, 31); paintGround(P, this.back, cam, env, { zNear: 60, strokes: 900, cracks: 20, puddles: 6 }); await Y(); paintCity(P, this.back, cam, env, { dmin: 930 }); }
    applyPaper(this.back.canvas, 0.4, 4); await Y();
    this.front = mkLayer(600, 420, 80);
    { const P = new Painter(this.front.ctx, 41); paintCity(P, this.front, cam, env, { dmax: 930 });
      paintMist(this.front.ctx, this.front.canvas.width, this.front.canvas.height, lp(this.front, cam, [0, 0, -40])[1] + 20, 26, hex('#d6c3d4'), 0.25, 5); }
    applyPaper(this.front.canvas, 0.4, 5); await Y();
    this.mist = mkLayer(900, 420, 80);
    for (const [y, z, a] of [[3, -260, 0.55], [10, -200, 0.4]]) paintMist(this.mist.ctx, this.mist.canvas.width, this.mist.canvas.height, lp(this.mist, cam, [0, y, z])[1], 40, hex('#e3cfda'), a, 7 + y);
    this.fg = mkLayer(60, 520, 80);
    { const L = this.fg, P = new Painter(L.ctx, 51), w = L.canvas.width, h = L.canvas.height;
      // rooftop parapet and weeds where the camera stands
      const ridge = []; for (let i = 0; i <= 30; i++) ridge.push([i / 30 * w, h - 120 - Math.sin(i / 30 * 3.1) * 30 + (noise2(i * 0.6, 1) - 0.5) * 30]);
      P.shape([...ridge, [w, h], [0, h]], hex('#4a4358'), { angle: 0, density: 0.003, len: [20, 60], sw: [3, 8], talpha: [0.08, 0.18], edgeA: 0.5 });
      for (let i = 0; i < 40; i++) paintGrass(P, P.r.range(0, w), h - P.r.range(60, 140), P.r.range(24, 60), 900 + i, { n: 12, cols: [hex('#2f3a35'), hex('#3d4c3c'), hex('#5a6448')] });
      for (let i = 0; i < 6; i++) paintTree(P, P.r.range(0, w), h - P.r.range(80, 130), P.r.range(70, 140), 950 + i, { trunk: false, cols: { dark: hex('#262f30'), mid: hex('#323f37'), lit: hex('#4f5a48'), sun: hex('#5f6650') } });
      const pa = paintPole(P, w * 0.22, h - 90, h - 40, 3.2, hex('#2b2630'), 3), pb = paintPole(P, w * 0.83, h - 70, h - 120, 2.6, hex('#2b2630'), 4);
      for (let k = 0; k < 4; k++) paintWire(P, pa[k], pb[k], 70 + k * 12, 1.6, hex('#2a2430'));
      for (let k = 0; k < 3; k++) paintWire(P, pb[k + 1], [w + 40, h * 0.18 + k * 30], 40, 1.4, hex('#2a2430'));
      for (let k = 0; k < 3; k++) paintWire(P, [-40, h * 0.12 + k * 26], pa[k], 46, 1.4, hex('#2a2430')); }
    applyPaper(this.fg.canvas, 0.5, 6);
  },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 1)), cam0 = this.cam0;
    drawLayer(c, this.sky, cam0, cam); drawLayer(c, this.far, cam0, cam); drawLayer(c, this.back, cam0, cam);
    const st = { light: LIGHT.pre(), lineW: 1.0, fog: 0.22, fogCol: [0.74, 0.67, 0.78], inkFog: 0.3, lid: 0.42, boil: f >> 1, ground: { on: 1, ao: 0.25, aoRect: [0, 0, 10, 8], col: [0.4, 0.33, 0.45] } };
    drawLayer(c, this.mist, cam0, cam, 0.8);
    drawRobot(c, cam, kneelPose(t), st);
    drawLayer(c, this.front, cam0, cam);
    drawLayer(c, this.fg, cam0, cam);
    leaves(c, s, 6, 3, [0, 0, W, H], 20, [hex('#4b5a3e'), hex('#6c7a48')]);
    finishFrame(c, f, { wash: [hex('#b7a2c8'), 0.25], top: [hex('#3b3b78'), 0.22, hex('#f0b8a0'), 0.18], light: [W * 0.78, H * 0.38, 900, hex('#ffd6b4'), 0.12], fade: 1 - smoothstep(0, 2.2, t) });
  },
});

// ───────── S2 7–13.5 · medium wide, slow tilt down to the kneeling robot ─────────
shot(7, 13.5, 'kneel-tilt', {
  cam0: C([11, 9.5, 72], [0, 13, 0], 40),
  camAt(s) { const u = easeInOut(onN(s, 1) / 6.5, 1.8); return camShifted(this.cam0, 0, 760 * (1 - u)); },
  async paint(Y) {
    const cam = this.cam0, env = ENV.pre(); env.hazeDist = 380;
    const mk = (d) => { const L = mkLayer(d, 80, 0, W, H); L.canvas.height = H + 860; L.oy = 800; L.ctx = L.canvas.getContext('2d'); return L; };
    this.sky = mk(9000);
    paintSkyFor(this.sky, cam, PAL.dawnSky, 12, { sunDir: sunDir(-1), glow: false, span: 1700, top: 0, rows: 14, big: 120, thresh: 0.46, cloudGap: 120 });
    applyPaper(this.sky.canvas, 0.45, 8); await Y();
    this.city = mk(140);
    { const P = new Painter(this.city.ctx, 61); paintGround(P, this.city, cam, env, { zNear: 75, strokes: 1600, cracks: 120 }); await Y(); paintCity(P, this.city, cam, env, { filter: (b) => b.main || Math.abs(b.x0) < 200 }); }
    applyPaper(this.city.canvas, 0.45, 9); await Y();
    this.mist = mk(60);
    paintMist(this.mist.ctx, this.mist.canvas.width, this.mist.canvas.height, lp(this.mist, cam, [0, 3, -60])[1], 50, hex('#dccbd8'), 0.4, 13);
    this.fg = mk(20);
    { const L = this.fg, P = new Painter(L.ctx, 71), bl = lp(L, cam, [0, 0, 60])[1];
      paintRubble(P, 160, bl + 80, 520, 160, 77, { grass: 8 }); paintRubble(P, L.canvas.width - 120, bl + 60, 420, 120, 78, { grass: 6 });
      for (let i = 0; i < 18; i++) paintGrass(P, P.r.range(0, L.canvas.width), bl + P.r.range(40, 120), P.r.range(20, 50), 700 + i, { n: 10 }); }
    applyPaper(this.fg.canvas, 0.45, 10);
  },
  draw(c, s, t, f) {
    const cam = this.camAt(s), cam0 = this.cam0;
    drawLayer(c, this.sky, cam0, cam); drawLayer(c, this.city, cam0, cam); drawLayer(c, this.mist, cam0, cam, 0.55);
    const { B } = drawRobot(c, cam, kneelPose(t), { light: LIGHT.pre(), lineW: 1.25, fog: 0.12, fogCol: [0.78, 0.72, 0.82], lid: 0.42, boil: f >> 1, ground: { on: 1, ao: 0.32, aoRect: [0, 0, 11, 9], col: [0.32, 0.27, 0.42] } });
    drawCables(c, cam, B, t);
    drawSign(c, cam, B, t);
    drawLayer(c, this.fg, cam0, cam);
    leaves(c, s, 8, 5, [0, -200, W, H], 15, [hex('#56663f'), hex('#7a8350')]);
    finishFrame(c, f, { wash: [hex('#b3a2c6'), 0.22], top: [hex('#3a3c7a'), 0.2, hex('#d9a7a0'), 0.12] });
  },
});

// ───────── S3 13.5–20 · shoulder close-up, a sparrow lands at 16.0 ─────────
shot(13.5, 20, 'sparrow', {
  setup() { const B = solvePose(kneelPose(14)); this.B0 = B; const sh = perchPoint(B), hd = boneP(B, 'head'); this.tgt = v3.add(v3.lerp(sh, hd, 0.42), [0, 1.5, 0]); },
  camAt(s) { const k = 1 - 0.04 * easeInOut(s / 6.5); return C(v3.add(this.tgt, v3.mul([24, -4, 21], k)), this.tgt, 36); },
  async paint(Y) {
    this.setup(); const cam = this.camAt(0), env = ENV.pre(); env.hazeDist = 300; env.detail = 0.6;
    this.cam0 = cam;
    this.bg = mkLayer(200, 60, 60);
    paintSkyFor(this.bg, cam, PAL.dawnSky, 14, { glow: false, rows: 10, big: 90, span: 1200 });
    { const P = new Painter(this.bg.ctx, 81); paintCity(P, this.bg, cam, env, { filter: (b) => b.main }); }
    paintMist(this.bg.ctx, this.bg.canvas.width, this.bg.canvas.height, H * 0.75, 200, hex('#d9c8d8'), 0.6, 15);
    const soft = newCanvas(this.bg.canvas.width, this.bg.canvas.height), sc = soft.getContext('2d');
    sc.filter = 'blur(5px)'; sc.drawImage(this.bg.canvas, 0, 0); sc.filter = 'none';
    sc.globalAlpha = 0.35; sc.fillStyle = '#cbb8cc'; sc.fillRect(0, 0, soft.width, soft.height);
    this.bg.canvas = soft; applyPaper(soft, 0.45, 11); await Y();
  },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 2)), cam0 = this.cam0;
    drawLayer(c, this.bg, cam0, cam);
    const { B } = drawRobot(c, cam, kneelPose(t), { light: LIGHT.pre(), lineW: 1.7, lid: 0.42, boil: f >> 1 });
    // sparrow flight-in → landing at 16.0 → settle → head tilts
    const P = cam.project(perchPoint(B)), sc = 62;
    const tl = 16.0;
    let x, y, st, dir = -1;
    if (t < tl) {
      const u = clamp((t - 14.0) / (tl - 14.0));
      if (u <= 0) return finishFrame(c, f, { wash: [hex('#b3a2c6'), 0.2] });
      const e = easeOut(u, 1.6);
      x = lerp(W + 120, P[0], e) + Math.sin(u * 9) * 14 * (1 - u); y = lerp(H * 0.12, P[1] - sc * 0.55, e) - Math.sin(u * Math.PI) * 60;
      st = { flap: (onN(t, 1) * 11) % 1, legs: u > 0.8, body: lerp(0.2, -0.25, u), lit: 0.45 };
      if (u > 0.85) st.flap = 0.5 + 0.15 * Math.sin(t * 60);
    } else {
      const k = t - tl;
      const fold = clamp(k / 0.5);
      x = P[0]; y = P[1] - sc * 0.55 + (k < 0.25 ? -Math.sin(k / 0.25 * Math.PI) * 8 : 0);
      const tilt = keys([[0.6, 0], [1.2, 0.38], [2.0, 0.38], [2.4, -0.1], [3.0, -0.1], [3.3, 0.3]], onN(k, 2));
      st = fold < 1 ? { flap: 0.5, fold, legs: true, body: -0.1, lit: 0.45 } : { flap: null, legs: true, tilt, body: -0.05, lit: 0.45, tail: k > 1.6 && k < 1.8 ? -0.06 : 0 };
    }
    drawSparrow(c, x, y, sc, dir, st);
    finishFrame(c, f, { wash: [hex('#b3a2c6'), 0.2], top: [hex('#3a3c7a'), 0.15, hex('#d8a8a8'), 0.1] });
  },
});

// ───────── S4 20–26.5 · face from slightly below; the first sunray slides across ─────────
shot(20, 26.5, 'sunray', {
  setup() { this.B0 = solvePose(kneelPose(21)); this.H = this.B0.head; },
  camAt(s) { const k = 1 - 0.035 * easeInOut(s / 6.5); const H = this.H; return C(m4.xfPoint(H, [3.2 * k, -4.2 * k, 25 * k]), m4.xfPoint(H, [0, 1.6, 0]), 40); },
  async paint(Y) {
    this.setup(); const cam = this.camAt(0), env = ENV.pre(); env.hazeDist = 260; env.detail = 0.6;
    this.cam0 = cam;
    this.bg = mkLayer(150, 60, 60);
    paintSkyFor(this.bg, cam, PAL.dawnSky, 16, { sunDir: sunDir(2), glowR: 400, glowA: 0.12, rows: 8, big: 110 });
    { const P = new Painter(this.bg.ctx, 91); paintCity(P, this.bg, cam, env, { filter: (b) => b.main }); }
    const soft = newCanvas(this.bg.canvas.width, this.bg.canvas.height), sc = soft.getContext('2d');
    sc.filter = 'blur(4px)'; sc.drawImage(this.bg.canvas, 0, 0); sc.filter = 'none';
    this.bg.canvas = soft; applyPaper(soft, 0.45, 12); await Y();
  },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 2)), cam0 = this.cam0;
    drawLayer(c, this.bg, cam0, cam);
    const ray = easeInOut(invLerp(0.4, 5.6, onN(s, 2)), 1.6);
    const n = v3.norm([0.22, 1, 0.1]), hc = v3.dot(m4.xfPoint(this.H, [0, 0, 0]), n);
    const L = LIGHT.dawn(2); L.band = { n, d0: hc + 9 - 17 * ray, d1: 1e5, w: 0.06, on: 1 };
    drawRobot(c, cam, kneelPose(t), { light: L, lineW: 2.1, lid: 0.42, boil: f >> 1, glint: 0.4 + 0.6 * ray });
    const sx = W * 0.82, sy = -60;
    godRays(c, sx, sy, 9, 1700, 0.55, Math.PI * 0.62, hex('#ffd9a8'), 0.22 * ray, 5);
    finishFrame(c, f, { wash: [mixc(hex('#b3a2c6'), hex('#f2c39a'), ray), 0.24], light: [sx, H * 0.2, 1100, hex('#ffcf9a'), 0.12 + 0.2 * ray], top: [hex('#ffd2a0'), 0.1 * ray, hex('#3a3c7a'), 0.14] });
  },
});

// ───────── S5 26.5–31 · chest window flickers on; then the eyes and ears ─────────
shot(26.5, 29.2, 'chest', {
  setup() { this.B0 = solvePose(kneelPose(27)); this.Cb = this.B0.chest; },
  camAt(s) { const k = 1 - 0.05 * easeInOut(s / 2.7); const Cb = this.Cb; return C(m4.xfPoint(Cb, [0.9, -0.6, 4.6 + 6.4 * k]), m4.xfPoint(Cb, [0, 1.25, 4.6]), 34); },
  async paint() { this.setup(); this.cam0 = this.camAt(0); },
  draw(c, s, t, f) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2638'); g.addColorStop(1, '#433a52');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const cam = this.camAt(onN(s, 2));
    const cg = chestGlow(t);
    const L = LIGHT.dawn(3); L.sunOn = 0.0; L.rimOn = 0.3;
    drawRobot(c, cam, kneelPose(t), { light: L, lineW: 2.3, chestGlow: cg, lid: 0.42, boil: f >> 1 });
    const p = cam.project(m4.xfPoint(this.Cb, [0, 1.6, 4.7]));
    glow(c, p[0], p[1], 520 * (0.6 + cg * 0.5), hex('#ffcf86'), 0.55 * cg);
    glow(c, p[0], p[1], 160, hex('#fff2d0'), 0.6 * cg);
    finishFrame(c, f, { wash: [hex('#a796c0'), 0.2], light: cg > 0 ? [p[0], p[1], 900, hex('#ffc070'), 0.18 * cg] : null, vigCol: [90, 76, 110] });
  },
});
shot(29.2, 31, 'eyes', {
  setup() { this.B0 = solvePose(kneelPose(30)); this.H = this.B0.head; },
  camAt(s) { const H = this.H; return C(m4.xfPoint(H, [0.6, -0.6, 15.5 - 0.5 * s]), m4.xfPoint(H, [0, 1.2, 0]), 40); },
  async paint(Y) {
    this.setup(); const cam = this.camAt(0); this.cam0 = cam;
    const env = ENV.dawn(4); env.hazeDist = 240; env.detail = 0.5;
    this.bg = mkLayer(120, 40, 40);
    paintSkyFor(this.bg, cam, PAL.dawnSky, 17, { sunDir: sunDir(3), glowA: 0.12 });
    { const P = new Painter(this.bg.ctx, 92); paintCity(P, this.bg, cam, env, { filter: (b) => b.main }); }
    const soft = newCanvas(this.bg.canvas.width, this.bg.canvas.height), sc = soft.getContext('2d');
    sc.filter = 'blur(6px)'; sc.drawImage(this.bg.canvas, 0, 0); sc.filter = 'none'; this.bg.canvas = soft; applyPaper(soft, 0.4, 13); await Y();
  },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 2));
    drawLayer(c, this.bg, this.cam0, cam);
    const eg = eyeGlow(t);
    const L = LIGHT.dawn(3);
    const { B } = drawRobot(c, cam, kneelPose(t), { light: L, lineW: 2.2, eyeGlow: eg, lid: lidAt(t), chestGlow: 1, boil: f >> 1, glint: 0.5 });
    for (const sd of [1, -1]) { const p = cam.project(m4.xfPoint(B.head, [sd * 1.95, 0.55, 5.2])); glow(c, p[0], p[1], 260, hex('#ffd27a'), 0.45 * eg); }
    finishFrame(c, f, { wash: [hex('#e9b99a'), 0.2], light: [W * 0.85, H * 0.1, 1000, hex('#ffcf9a'), 0.2] });
  },
});

// ───────── S6 31–35.5 · rooftops wide, the ground rumbles, flocks burst ─────────
shot(31, 35.5, 'rooftops', {
  cam0: C([-300, 100, -430], [-300 + 0.45 * 600, 100 - 0.12 * 600, -430 + 0.88 * 600], 44),
  async paint(Y) {
    const cam = this.cam0, env = ENV.dawn(6); env.hazeDist = 1500; env.detail = 0.9; env.haze = hex('#d8b6b0');
    this.sky = mkLayer(9000, 60, 60);
    const sk = paintSkyFor(this.sky, cam, PAL.dayGold, 18, { sunDir: sunDir(6), glowR: 900, glowA: 0.14, rows: 8, big: 190, small: 18, cloudCols: { mid: hex('#c7b2bd'), lit: hex('#ffd9b0'), hi: hex('#fff0d2'), shade: hex('#9b8fae') } });
    this.sunPos = sk.sun;
    applyPaper(this.sky.canvas, 0.4, 14); await Y();
    this.city = mkLayer(400, 60, 60);
    { const P = new Painter(this.city.ctx, 101), hor = sk.hor[1];
      paintSkyline(P, 0, this.city.canvas.width, hor + 6, { seed: 9, wMin: 16, wMax: 46, hMin: 8, hMax: 40, col: hex('#c3a9b0'), win: hex('#dcc3c0'), winA: 0.35, floorPx: 3, broken: 0.3, lit: hex('#ffe0bc'), litA: 0.4, green: 0.25 });
      paintMist(this.city.ctx, this.city.canvas.width, this.city.canvas.height, hor + 12, 40, hex('#f0d6c6'), 0.3, 21);
      await Y();
      paintGround(P, this.city, cam, env, { zNear: 600, strokes: 600, cracks: 30, puddles: 4, trees: false });
      await Y();
      paintCity(P, this.city, cam, env, {});
    }
    applyPaper(this.city.canvas, 0.4, 15); await Y();
    this.mist = mkLayer(300, 60, 60);
    paintMist(this.mist.ctx, this.mist.canvas.width, this.mist.canvas.height, H * 0.78, 120, hex('#f2dccb'), 0.35, 23);
    // roof launch points for the flocks
    const r = makeRng(31); this.roofs = [];
    for (const b of CITY) { if (b.broken || b.style === 'deck' || b.style === 'pillar') continue; const p = cam.project([(b.x0 + b.x1) / 2, b.h + 1, (b.z0 + b.z1) / 2]); if (p[2] > 30 && p[0] > 40 && p[0] < W - 40 && p[1] > 200 && p[1] < H - 40 && r.chance(0.5)) this.roofs.push([p[0], p[1], p[2], r.range(0, 0.6)]); }
    this.roofs = this.roofs.slice(0, 22);
  },
  draw(c, s, t, f) {
    const rum = t > 31.3 ? 1 : 0;
    const sh = shake(f, rum * lerp(7, 4, s / 4.5), 6, 1);
    const cam = camShifted(this.cam0, sh[0], sh[1]);
    drawLayer(c, this.sky, this.cam0, cam); drawLayer(c, this.city, this.cam0, cam); drawLayer(c, this.mist, this.cam0, cam, 0.45);
    // flocks
    const birdCol = 'rgba(58,44,66,0.92)';
    this.roofs.forEach((rp, i) => {
      const t0 = 31.3 + rp[3], k = t - t0; if (k < 0) return;
      const rr = makeRng(400 + i), n = Math.round(clamp(1800 / rp[2] * 6, 10, 34));
      for (let j = 0; j < n; j++) {
        const vx = rr.range(-60, 160), vy = rr.range(120, 260), dl = rr.range(0, 0.25), kk = Math.max(0, k - dl);
        if (kk <= 0) continue;
        const sz = clamp(9000 / rp[2], 4, 22) * rr.range(0.7, 1.2) * (1 + kk * 0.25);
        const x = rp[0] + sh[0] + vx * kk + Math.sin(kk * 2 + j) * 12, y = rp[1] + sh[1] - vy * kk * (1 - 0.12 * kk) + rr.range(-6, 6);
        drawBird(c, x, y, sz, (onN(t, 1) * rr.range(6, 9) + rr.f()) % 1, Math.atan2(-vy, vx) * 0.15, birdCol);
      }
    });
    const sp = this.sunPos;
    finishFrame(c, f, { wash: [hex('#f6c79a'), 0.22], light: [sp[0] - 60, sp[1] - 60, 1100, hex('#ffd9a8'), 0.18], top: [hex('#ffe0b0'), 0.08, hex('#5d4f80'), 0.26] });
  },
});

// ───────── S7 35.5–48 · low-angle wide, the slow rise ─────────
shot(35.5, 48, 'rise', {
  cam0: C([12, 2.6, 66], [0, 15.5, 0], 46),
  async paint(Y) {
    const cam = this.cam0, env = ENV.dawn(8); env.hazeDist = 420;
    this.sky = mkLayer(9000, 60, 60);
    paintSkyFor(this.sky, cam, PAL.dayGold, 19, { sunDir: sunDir(8), glow: false, rows: 10, big: 150, thresh: 0.46, span: 1400, top: 0, cloudCols: { mid: hex('#c8b4c4'), lit: hex('#ffe0b8'), hi: hex('#fff4dc'), shade: hex('#a296b4') } });
    applyPaper(this.sky.canvas, 0.4, 16); await Y();
    this.city = mkLayer(140, 60, 60);
    { const P = new Painter(this.city.ctx, 111); paintGround(P, this.city, cam, env, { zNear: 70, strokes: 2200, cracks: 140, puddles: 18 }); await Y(); paintCity(P, this.city, cam, env, { filter: (b) => b.main || Math.abs(b.x0) < 160 }); }
    applyPaper(this.city.canvas, 0.45, 17); await Y();
    this.fg = mkLayer(18, 60, 60);
    { const L = this.fg, P = new Painter(L.ctx, 121), w = L.canvas.width, h = L.canvas.height;
      paintRubble(P, 120, h - 10, 560, 230, 131, { grass: 10 }); paintRubble(P, w - 60, h + 10, 460, 200, 132, { grass: 8 });
      for (let i = 0; i < 26; i++) paintGrass(P, P.r.chance(0.5) ? P.r.range(0, 420) : P.r.range(w - 400, w), h - P.r.range(0, 160), P.r.range(30, 80), 1300 + i, { n: 12 }); }
    applyPaper(this.fg.canvas, 0.45, 18);
  },
  draw(c, s, t, f) {
    let sh = [0, 0];
    const hit = (a, amp, len) => { if (s > a && s < a + len) { const k = 1 - (s - a) / len, j = shake(f, amp * k, Math.round(a * 10), 1); sh = [sh[0] + j[0], sh[1] + j[1]]; } };
    hit(1.0, 6, 0.5); hit(4.2, 4, 0.4); hit(5.2, 9, 0.6); hit(10.2, 7, 0.7);
    if (s > 1.2 && s < 8.6) { const j = shake(f, 1.6, 9, 2); sh = [sh[0] + j[0], sh[1] + j[1]]; }
    const cam = camShifted(this.cam0, sh[0], sh[1]);
    drawLayer(c, this.sky, this.cam0, cam); drawLayer(c, this.city, this.cam0, cam);
    const k = riseParams(s);
    const pose = withEars(poseFrom(k), t);
    const L = LIGHT.dawn(8);
    const { B } = drawRobot(c, cam, pose, { light: L, lineW: 1.35, eyeGlow: eyeGlow(t), chestGlow: 1, boil: f >> 1, ground: { on: 1, a: 0.42, ao: 0.28, aoRect: [0, 0, 10, 8], col: [0.3, 0.25, 0.42] } });
    drawCables(c, cam, B, t);
    drawSign(c, cam, B, t);
    // hand press → cracks and dust; knee lift, sign crash, slip, plates, settle
    const hand = cam.project([-7.0, 0, 3.0]);
    drawCracks(c, hand[0], hand[1], 240, easeOut(clamp((s - 1.0) / 0.35), 2), 7, 0.28);
    const dustCol = { lit: 'rgb(232,214,206)', shade: 'rgb(170,152,170)' };
    const puff = (a, wp, R, life, seed, o) => { const p = cam.project(wp); dustCloud(c, p[0], p[1], R / cam.upp(p[2]), onN(s - a, 2), life, seed, dustCol, o); };
    puff(1.0, [-7.2, 0, 3.2], 4, 2.2, 3, { n: 10 });
    puff(3.4, [-2.7, 0, 1.2], 5, 2.6, 4, { n: 12 });
    puff(4.2, [-2.6, 0, 6.5], 5.5, 2.4, 5, { n: 12, wide: 1.8 });
    puff(5.25, [-3.0, 0, -0.2], 6, 2.6, 6, { n: 12, wide: 1.6 });
    puff(10.2, [0, 0, 1.6], 11, 3.2, 8, { n: 16, wide: 2.2, rise: 0.15 });
    // falling rusted plates at 6.2 and 7.0
    for (const [ta, bone, loc, seed] of [[6.2, 'shoulderL', [1.5, 1.2, 1.4], 41], [7.0, 'chest', [-3.8, -1.5, 3.2], 42]]) {
      const p0 = boneP(solvePose(withEars(poseFrom(riseParams(ta)), t)), bone, loc);
      const tt = s - ta;
      if (tt > 0) {
        const sp = debrisChunk(c, cam, p0, [1.5, 1.5, 2.2], onN(tt, 1), 1.6, seed, '#7b4a36');
        if (!sp) { const gp = cam.project([p0[0] + 1.5 * 2, 0, p0[2] + 2.2 * 2]); dustCloud(c, gp[0], gp[1], 70, onN(tt - 1.9, 2), 1.6, seed, dustCol, { n: 8 }); }
      }
    }
    // dust and grit sliding off the body while it rises
    if (s > 5.6 && s < 10) for (let i = 0; i < 26; i++) {
      const ta = 5.6 + hashi(i, 5) * 3.6, tt = s - ta; if (tt < 0) continue;
      const p0 = [lerp(-6, 6, hashi(i, 6)), lerp(8, 24, hashi(i, 7)), lerp(-2, 4, hashi(i, 8))];
      debrisChunk(c, cam, p0, [hashi(i, 9) - 0.5, 0, 1], onN(tt, 2), 0.35, 500 + i, '#8d8090');
    }
    // the sparrow leaves at the first move (1.0)
    if (s < 3.2) {
      const pp = cam.project(perchPoint(B)), sc = 12;
      if (s < 1.0) drawSparrow(c, pp[0], pp[1] - sc * 0.55, sc, -1, { flap: null, legs: true, lit: 0.6 });
      else { const k2 = s - 1.0; drawSparrow(c, pp[0] + k2 * 340, pp[1] - sc * 0.55 - k2 * 260 - k2 * k2 * 40, sc * (1 + k2 * 0.3), 1, { flap: (onN(t, 1) * 12) % 1, lit: 0.6, body: -0.4 }); }
    }
    drawLayer(c, this.fg, this.cam0, cam);
    finishFrame(c, f, { wash: [hex('#f2c8a6'), 0.2], light: [W * 0.9, H * 0.05, 1200, hex('#ffd7a6'), 0.22], top: [hex('#ffe2b8'), 0.12, hex('#5b5088'), 0.16] });
  },
});

// ───────── S8 48–53 · three-quarter face from below, looking up at the sky gap ─────────
shot(48, 53, 'look-up', {
  setup() { const B = solvePose(poseFrom(KP.look)); this.Hd = boneP(B, 'head'); },
  camAt(s) { const Hd = this.Hd, k = 1 - 0.04 * easeInOut(s / 5); return C(v3.add(Hd, v3.mul([12.8, 0.5, 21.8], k)), v3.add(Hd, [0, 3.2, 0]), 42); },
  async paint(Y) {
    this.setup(); const cam = this.camAt(0), env = ENV.dawn(9); env.hazeDist = 380; env.detail = 0.8;
    this.cam0 = cam;
    this.bg = mkLayer(200, 60, 60);
    paintSkyFor(this.bg, cam, PAL.dayGold, 20, { sunDir: sunDir(9), glowA: 0.16, rows: 8, big: 120, top: 0 });
    { const P = new Painter(this.bg.ctx, 141); paintCity(P, this.bg, cam, env, { filter: (b) => b.main || Math.abs(b.x0) < 120 }); }
    applyPaper(this.bg.canvas, 0.45, 19); await Y();
  },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 2));
    drawLayer(c, this.bg, this.cam0, cam);
    const k = Object.assign({}, KP.look, { head: [lerp(-8, -16, easeInOut(clamp(s / 1.2), 2)), 6, 0] });
    const pose = withEars(poseFrom(k), t);
    const eg = eyeGlow(t);
    const { B } = drawRobot(c, cam, pose, { light: LIGHT.dawn(9), lineW: 2.0, eyeGlow: eg, chestGlow: 1, boil: f >> 1 });
    for (const sd of [1, -1]) { const p = cam.project(m4.xfPoint(B.head, [sd * 1.95, 0.55, 5.2])); glow(c, p[0], p[1], 300, hex('#ffd27a'), 0.35 * eg); }
    finishFrame(c, f, { wash: [hex('#f3c9a0'), 0.2], light: [W * 0.4, -100, 1100, hex('#ffe2b4'), 0.25], top: [hex('#fff0d0'), 0.12, hex('#5a5088'), 0.14] });
  },
});

// ───────── S9 53–58 · street-level at the feet: crouch, ignition, the wind ring ─────────
shot(53, 58, 'ignite', {
  cam0: C([10, 1.15, 21], [0, 5.5, 0], 54),
  async paint(Y) {
    const cam = this.cam0, env = ENV.dawn(10); env.hazeDist = 320;
    this.sky = mkLayer(9000, 70, 70);
    paintSkyFor(this.sky, cam, PAL.dayGold, 21, { sunDir: sunDir(10), glow: false, rows: 8, big: 140, top: 0 });
    this.city = mkLayer(100, 70, 70);
    { const P = new Painter(this.city.ctx, 151); paintGround(P, this.city, cam, env, { zNear: 22, strokes: 2600, cracks: 160, puddles: 20 }); await Y(); paintCity(P, this.city, cam, env, { filter: (b) => b.main }); }
    applyPaper(this.city.canvas, 0.45, 20); await Y();
  },
  draw(c, s, t, f) {
    const ign = t >= 53.55, ring = t >= 54.3;
    let sh = [0, 0];
    if (ign) { const k = t < 54.3 ? 0.6 : t < 55 ? 1.6 : 1.0; sh = shake(f, 7 * k, 12, 1); }
    const cam = camShifted(this.cam0, sh[0], sh[1]);
    drawLayer(c, this.sky, this.cam0, cam); drawLayer(c, this.city, this.cam0, cam);
    const cu = easeInOut(clamp((t - 53.0) / 0.45), 2);
    const k = lerpKP(KP.stand, KP.crouch, cu);
    const pose = poseFrom(k);
    const pw = ign ? clamp((t - 53.55) / 0.25) * (0.75 + 0.25 * smoothstep(55, 57.5, t)) : 0;
    const { B } = drawRobot(c, cam, pose, { light: LIGHT.dawn(10), lineW: 2.0, eyeGlow: eyeGlow(t), chestGlow: 1, engine: pw, boil: f >> 1, ground: { on: 1, a: 0.42, ao: 0.3, aoRect: [0, 0.8, 7, 6], col: [0.3, 0.24, 0.42] } });
    // ground flames splash from the soles
    for (const nm of ['ankleL', 'ankleR']) {
      const a = cam.project(boneP(B, nm, [0, -1.3, 0.4]));
      drawFlame(c, a[0] - 20, a[1] + 4, -1, 0.05, 260, 46, f, nm.length * 31, pw);
      drawFlame(c, a[0] + 20, a[1] + 4, 1, 0.05, 260, 46, f + 3, nm.length * 37, pw);
      glow(c, a[0], a[1], 420, hex('#ffb070'), 0.4 * pw);
    }
    if (ring) windRing(c, cam, 0, 0.5, lerp(4, 140, easeOut(clamp((t - 54.3) / 1.6), 1.6)), clamp((t - 54.3) / 1.7), 3);
    const dustCol = { lit: 'rgb(236,220,212)', shade: 'rgb(176,160,176)' };
    if (ign) for (let i = 0; i < 6; i++) { const p = cam.project([lerp(-12, 12, i / 5), 0, lerp(-4, 4, hashi(i, 2))]); dustCloud(c, p[0], p[1], 110, onN((t - 53.6 - i * 0.12) % 2.2, 2), 2.2, 60 + i, dustCol, { n: 10, wide: 2.2, drift: (i - 2.5) * 60 }); }
    if (ring) speedLines(c, f, 30, Math.PI, 0.25 * smoothstep(54.3, 55, t), 4, [0, H * 0.55, W, H * 0.45]);
    finishFrame(c, f, { wash: [hex('#f4c6a0'), 0.18], light: pw > 0 ? [W * 0.45, H * 0.9, 1100, hex('#ffb070'), 0.25 * pw] : null, top: [hex('#ffe4c0'), 0.1, hex('#58508a'), 0.15] });
  },
});

// ───────── S10a 58–61 · heavy lift-off, camera tilts to follow ─────────
function liftY(s) { if (s < 0.5) return 0; if (s < 1.3) return 1.3 * easeIn((s - 0.5) / 0.8, 1.6); const k = s - 1.3; return 1.3 + 1.6 * k + 0.5 * 30 * k * k; }
shot(58, 61, 'liftoff', {
  cam0: C([17, 2.0, 60], [0, 15, 0], 46),
  camAt(s) { const y = liftY(onN(s, 1)); const fol = smoothstep(1.3, 2.4, s); return C([17, 2.0, 60], [0, 15 + y * 0.82 * fol + y * 0.25 * (1 - fol), 0], 46); },
  async paint(Y) {
    const cam = this.cam0, env = ENV.dawn(10); env.hazeDist = 420;
    const mk = (d) => mkLayerR(d, 70, 580, 70, 60);
    this.sky = mk(9000);
    paintSkyFor(this.sky, cam, PAL.dayGold, 22, { sunDir: sunDir(10), glow: false, rows: 12, big: 160, top: 0 });
    this.city = mk(140);
    { const P = new Painter(this.city.ctx, 161); paintGround(P, this.city, cam, env, { zNear: 62, strokes: 2000, cracks: 120 }); await Y(); paintCity(P, this.city, cam, env, { filter: (b) => b.main || Math.abs(b.x0) < 160 }); }
    applyPaper(this.city.canvas, 0.45, 21); await Y();
  },
  draw(c, s, t, f) {
    const q = onN(s, 1);
    const sh = shake(f, s < 1.3 ? 6 : 4, 14, 1);
    const cam = camShifted(this.camAt(s), sh[0], sh[1]);
    drawLayer(c, this.sky, this.cam0, cam); drawLayer(c, this.city, this.cam0, cam);
    const y = liftY(q), hang = smoothstep(0.5, 1.6, q);
    const k = lerpKP(KP.crouch, Object.assign({}, KP.stand, { hy: 9.6 }), hang);
    const pose = poseFrom(k);
    pose.root.pos[1] += y; pose.ik.legL.target[1] += y * hang + (1 - hang) * 0; pose.ik.legR.target[1] += y * hang;
    pose.ik.legL.target[1] += hang * 1.2; pose.ik.legR.target[1] += hang * 1.6; pose.ik.armL.target[1] += y; pose.ik.armR.target[1] += y;
    const { B } = drawRobot(c, cam, pose, { light: LIGHT.dawn(10), lineW: 1.5, eyeGlow: eyeGlow(t), chestGlow: 1, engine: 1, boil: f, ground: { on: 1, a: 0.4, ao: 0.3 * (1 - smoothstep(0, 8, y)), aoRect: [0, 0.8, 7, 6], col: [0.3, 0.24, 0.42] } });
    for (const nm of ['ankleL', 'ankleR']) {
      const a = cam.project(boneP(B, nm, [0, -1.3, 0.4])), b = cam.project(boneP(B, nm, [0, -6, 0.4]));
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      drawFlame(c, a[0], a[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L, 200 + y * 4, 40, f, nm.length * 7, 1);
      glow(c, a[0], a[1], 380, hex('#ffb070'), 0.45);
    }
    const dustCol = { lit: 'rgb(236,220,212)', shade: 'rgb(176,160,176)' };
    for (let i = 0; i < 5; i++) { const p = cam.project([lerp(-14, 14, i / 4), 0, lerp(-3, 3, hashi(i, 4))]); dustCloud(c, p[0], p[1], 130, onN((s + i * 0.3) % 2.0, 2), 2.0, 80 + i, dustCol, { n: 10, wide: 2.4, drift: (i - 2) * 90 }); }
    if (q > 0.5 && q < 2.2) for (let i = 0; i < 18; i++) { const ta = 0.5 + hashi(i, 11) * 1.2, tt = q - ta; if (tt < 0) continue; debrisChunk(c, cam, [lerp(-4, 4, hashi(i, 12)), 1.5 + y * 0.6, lerp(-1, 3, hashi(i, 13))], [hashi(i, 14) * 4 - 2, -2, hashi(i, 15) * 2], tt, 0.5, 700 + i, '#7d6f78'); }
    if (s > 1.8) speedLines(c, f, 46, Math.PI / 2, 0.45 * smoothstep(1.8, 2.3, s), 5);
    finishFrame(c, f, { wash: [hex('#f4c6a0'), 0.18], light: [W * 0.5, H * 0.85, 1000, hex('#ffb070'), 0.2], top: [hex('#ffe4c0'), 0.12, hex('#58508a'), 0.14] });
  },
});

// flight path helpers (world, metres; time in film seconds)
function catmullAt(keysT, t) { // [[t, [x,y,z]], ...]
  if (t <= keysT[0][0]) { const [t0, p0] = keysT[0], [t1, p1] = keysT[1]; return v3.add(p0, v3.mul(v3.sub(p1, p0), (t - t0) / (t1 - t0))); }
  const n = keysT.length;
  if (t >= keysT[n - 1][0]) { const [t0, p0] = keysT[n - 2], [t1, p1] = keysT[n - 1]; return v3.add(p1, v3.mul(v3.sub(p1, p0), (t - t1) / (t1 - t0))); }
  let i = 1; while (keysT[i][0] < t) i++;
  const P = (k) => keysT[clamp(k, 0, n - 1)][1];
  const t1 = keysT[i - 1][0], t2 = keysT[i][0], u = (t - t1) / (t2 - t1);
  const p0 = P(i - 2), p1 = P(i - 1), p2 = P(i), p3 = P(i + 1), u2 = u * u, u3 = u2 * u;
  return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
}

// ───────── S10b 61–64 · rooftop height: it sweeps past, then climbs away on a curving trail ─────────
const PASS_CAM = C([58, 64, 124], [30, 92, 30], 50);
const PASS_PATH = [[60.6, [96, -55, -36]], [61.0, [64, -20, -12]], [61.35, [40, 0, 0]], [61.7, [50, 6, 12]], [62.2, [92, 6, 50]], [62.9, [190, -8, 130]], [64.0, [350, -60, 210]]]
  .map(([t, [d, x, y]]) => [t, v3.add(PASS_CAM.pos, v3.add(v3.mul(PASS_CAM.fwd, d), v3.add(v3.mul(PASS_CAM.right, x), v3.mul(PASS_CAM.up, y))))]);
shot(61, 64, 'pass-by', {
  camAt(s) {
    const t = this.t0 + s, p = catmullAt(PASS_PATH, onN(t, 1) - 0.08);
    return C(PASS_CAM.pos, v3.lerp(PASS_CAM.target, p, 0.68 * smoothstep(-0.1, 0.6, s)), 50);
  },
  async paint(Y) {
    const cam = PASS_CAM, env = ENV.dawn(11); env.hazeDist = 520; env.detail = 0.85;
    this.cam0 = cam;
    this.sky = mkLayerR(9000, 70, 520, 140, 60);
    paintSkyFor(this.sky, cam, PAL.dayGold, 23, { sunDir: sunDir(11), glowR: 800, glowA: 0.12, rows: 16, big: 170, span: 1800, top: 0 });
    applyPaper(this.sky.canvas, 0.4, 22); await Y();
    this.city = mkLayerR(300, 70, 520, 140, 60);
    { const P = new Painter(this.city.ctx, 171); paintGround(P, this.city, cam, env, { zNear: 300, strokes: 1200, cracks: 60 }); await Y(); paintCity(P, this.city, cam, env, { filter: (b) => !(b.x0 < 80 && b.x1 > 40 && b.z0 < 140 && b.z1 > 100) }); }
    applyPaper(this.city.canvas, 0.4, 23); await Y();
    this.fg = mkLayerR(12, 70, 520, 140, 60);
    { const L = this.fg, P = new Painter(L.ctx, 181), w = L.canvas.width, h = L.canvas.height;
      const y0 = lp(L, cam, [58, 61, 118])[1];
      P.shape([[0, y0 + 40], [w, y0 - 30], [w, h], [0, h]], hex('#6a6070'), { angle: 0, density: 0.002, len: [20, 70], sw: [3, 8], edgeA: 0.5 });
      P.ink([[0, y0 + 40], [w, y0 - 30]], 4, hex('#3a3040'), 1);
      for (let i = 0; i < 30; i++) paintGrass(P, P.r.range(0, w), y0 + P.r.range(0, 60), P.r.range(30, 70), 1800 + i, { n: 12 }); }
    applyPaper(this.fg.canvas, 0.45, 24);
  },
  draw(c, s, t, f) {
    const sh = s < 1.0 ? shake(f, 9 * (1 - Math.abs(s - 0.35) / 0.65), 15, 1) : [0, 0];
    const cam = camShifted(this.camAt(s), sh[0], sh[1]);
    drawLayer(c, this.sky, this.cam0, cam); drawLayer(c, this.city, this.cam0, cam);
    const tq = onN(t, 1), path = (x) => catmullAt(PASS_PATH, x);
    const trail = []; for (let k = 0; k <= 40; k++) { const tt = tq - 1.6 + k * 0.04; if (tt < 60.7) continue; trail.push(cam.project(path(tt))); }
    const tr = trail.filter((p) => p[2] > 1);
    cloudTrail(c, tr.slice(0, -3).map((p) => [p[0], p[1]]), 34, { lit: 'rgba(255,248,240,0.9)', shade: 'rgba(214,200,214,0.85)' }, f, 7, 0.9);
    lightTrail(c, tr.map((p) => [p[0], p[1]]), 26, hex('#ffd9a0'), hex('#fffaf0'), 0.9);
    const att = flightAttitude(path, tq);
    const j = jolt(f, 3, 3);
    const pos = v3.add(path(tq), [j[0] * 0.1, j[1] * 0.1, 0]);
    const pose = poseFly(pos, { pitch: att.pitch + j[2], yaw: att.yaw, bank: att.bank }, { tuck: 0.9 });
    const { B } = drawRobot(c, cam, pose, { light: LIGHT.dawn(11), lineW: 1.8, eyeGlow: 1.5, chestGlow: 1, engine: 1, boil: f });
    for (const nm of ['ankleL', 'ankleR']) {
      const a = cam.project(boneP(B, nm, [0, -1.3, 0.4])), b = cam.project(boneP(B, nm, [0, -8, 0.4]));
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (a[2] > 1) drawFlame(c, a[0], a[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L, 3600 / a[2], 700 / a[2], f, nm.length, 1);
    }
    if (s < 1.2) speedLines(c, f, 40, Math.atan2(-0.5, 1), 0.35 * (1 - s / 1.2), 6);
    drawLayer(c, this.fg, this.cam0, cam);
    finishFrame(c, f, { wash: [hex('#f6cfa6'), 0.16], light: [W * 0.85, H * 0.15, 1200, hex('#ffe0b0'), 0.25], top: [hex('#9fb8e0'), 0.14, hex('#ffd9b0'), 0.1] });
  },
});

// ───────── S11a 64–68.5 · follow pan alongside, clouds streaming diagonally ─────────
const CLIMB_V = [0, 110, -150];
function climbPos(t) { const s = t - 64; return v3.add([60, 600, -600], v3.mul(CLIMB_V, s)); }
shot(64, 68.5, 'follow', {
  camAt(s) { const p = climbPos(this.t0 + s), sw = Math.sin(s * 0.7) * 3; return C(v3.add(p, [62 + sw, -6, 12]), v3.add(p, [0, 2, -4]), 46, -8); },
  async paint(Y) {
    this.cam0 = this.camAt(0);
    this.sky = mkLayer(1e6, 0, 0);
    { const c = this.sky.ctx; paintSky(c, W, H, [[0, hex('#3d6aaa')], [0.45, hex('#6f9ad0')], [0.8, hex('#b9cde0')], [1, hex('#f4dcb8')]], 25); }
    applyPaper(this.sky.canvas, 0.4, 25); await Y();
    // painted cumulus cards placed in world along the climb
    const r = makeRng(64); this.cards = [];
    for (let i = 0; i < 46; i++) {
      const tt = 63.6 + r.f() * 5.6, along = climbPos(tt);
      const side = r.range(-260, -60);
      this.cards.push({ p: v3.add(along, [side, r.range(-140, 140), r.range(-120, 120)]), img: r.int(0, CLOUD_CARD_COUNT - 1), size: r.range(80, 220) });
    }
  },
  draw(c, s, t, f) {
    const j = jolt(f, 5, 4);
    const cam = camShifted(this.camAt(s), j[0] * 3, j[1] * 3);
    c.drawImage(this.sky.canvas, 0, 0);
    const behind = [], front = [];
    for (const cd of this.cards) { const p = cam.project(cd.p); if (p[2] < 5) continue; (p[2] > 62 ? behind : front).push([cd, p]); }
    const drawCard = ([cd, p]) => { const img = CLOUD_IMGS[cd.img], sz = cd.size / cam.upp(p[2]); if (sz < 4 || p[0] < -sz || p[0] > W + sz) return; c.globalAlpha = clamp(1.4 - p[2] / 500); c.drawImage(img, p[0] - sz / 2, p[1] - sz * img.height / img.width / 2, sz, sz * img.height / img.width); c.globalAlpha = 1; };
    behind.sort((a, b) => b[1][2] - a[1][2]).forEach(drawCard);
    const tq = onN(t, 1);
    const trail = []; for (let k = 0; k <= 30; k++) trail.push(cam.project(climbPos(tq - 1.4 + k * 0.045)));
    cloudTrail(c, trail.filter((p) => p[2] > 1).slice(0, -2).map((p) => [p[0], p[1]]), 30, { lit: 'rgba(255,250,244,0.85)', shade: 'rgba(205,210,228,0.8)' }, f, 9, 0.8);
    lightTrail(c, trail.filter((p) => p[2] > 1).map((p) => [p[0], p[1]]), 20, hex('#ffe2b0'), hex('#fffaf2'), 0.85);
    const att = { pitch: 90 - Math.atan2(CLIMB_V[1], -CLIMB_V[2]) / DEG + j[2], yaw: 180, bank: Math.sin(s * 1.3) * 6 };
    const { B } = drawRobot(c, cam, poseFly(climbPos(tq), att, { tuck: 1 }), { light: LIGHT.sky(), lineW: 2.0, eyeGlow: 1.5, chestGlow: 1, engine: 1, boil: f });
    for (const nm of ['ankleL', 'ankleR']) { const a = cam.project(boneP(B, nm, [0, -1.3, 0.4])), b = cam.project(boneP(B, nm, [0, -8, 0.4])); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; drawFlame(c, a[0], a[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L, 230, 46, f, nm.length * 3, 1); }
    front.sort((a, b) => b[1][2] - a[1][2]).forEach(drawCard);
    speedLines(c, f, 26, Math.atan2(0.62, 1), 0.3, 7);
    finishFrame(c, f, { wash: [hex('#d8e4f4'), 0.12], light: [W * 0.9, H * 0.05, 1200, hex('#fff0d0'), 0.25], vigCol: [110, 120, 150] });
  },
});

// ───────── S11b 68.5–72 · punching out through the cloud deck; sky deepens to black ─────────
const PUNCH = [0, 2800, 0];
function punchPos(t) { const s = t - 68.5; if (s < 0.05) return v3.add(PUNCH, [0, -12 + s * 240, 0]); const k = s - 0.05; return v3.add(PUNCH, [k * 16, k * 85 + k * k * 10, -k * 60]); }
shot(68.5, 72, 'cloud-punch', {
  cam0: C([70, 2890, 210], [0, 2840, 0], 44),
  camAt(s) { return C([70, 2890, 210], v3.lerp([0, 2840, 0], punchPos(this.t0 + s), 0.75 * smoothstep(0.1, 1.3, s)), 44); },
  async paint(Y) {
    const cam = this.cam0;
    this.deck = mkLayerR(700, 120, 900, 200, 500);
    { const c = this.deck.ctx, w = this.deck.canvas.width, h = this.deck.canvas.height, P = new Painter(c, 191);
      const hor = lp(this.deck, cam, v3.add(cam.pos, [cam.fwd[0] * 9000, 0, cam.fwd[2] * 9000]))[1];
      paintSky(c, w, h, [[0, hex('#0b1030')], [0.5, hex('#1c2f6a')], [0.8, hex('#5379b6')], [0.95, hex('#bcd0e8')], [1, hex('#f2e2c8')]], 26, { y0: 0, y1: hor + 30 });
      const cols = { mid: hex('#dfe6f2'), lit: hex('#fffaf0'), hi: hex('#fff6e2'), shade: hex('#9fb0d0'), base: hex('#a9b8d8') };
      for (let row = 0; row < 18; row++) {
        const z = -2400 + row * 150, y = PUNCH[1] - 30;
        for (let x = -2200; x <= 2200; x += 260) {
          const p = lp(this.deck, cam, [x + (hashi(row, x) - 0.5) * 200, y, z]); if (p[2] < 50) continue;
          const sz = 300 / cam.upp(p[2]);
          if (sz > 460 || p[0] + sz * 1.4 < 0 || p[0] - sz * 1.4 > w || p[1] - sz > h || p[1] + sz < 0) continue;
          paintCumulus(P, p[0], p[1] + sz * 0.3, sz * 2.4, sz * 0.9, cols, row * 100 + x, { lx: 0.6, ly: -0.7, n: Math.min(14, 6 + Math.round(sz / 60)) });
        }
      }
      // the near deck: big soft billows painted as broad strokes under the far cloud heads
      const near = lp(this.deck, cam, [0, PUNCH[1] - 30, -900]);
      const g = P.c.createLinearGradient(0, near[1], 0, h); g.addColorStop(0, css(hex('#dfe6f2'))); g.addColorStop(1, css(hex('#c3cee4')));
      P.c.globalCompositeOperation = 'destination-over'; P.c.fillStyle = g; P.c.fillRect(0, near[1], w, h - near[1]); P.c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 260; i++) { const y = P.r.range(near[1] + 40, h), k = (y - near[1]) / (h - near[1]); cloudPuff(P, P.r.range(-100, w + 100), y, lerp(60, 260, k) * P.r.range(0.7, 1.3), lerp(25, 110, k) * P.r.range(0.7, 1.2), cols, 5000 + i, { lx: 0.6, ly: -0.8, lump: 0.2 }); }
    }
    applyPaper(this.deck.canvas, 0.4, 26); await Y();
  },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 1));
    { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070a20'); g.addColorStop(1, '#22397a'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    drawLayer(c, this.deck, this.cam0, cam);
    const hp = cam.project(PUNCH), open = smoothstep(0.0, 0.9, s);
    if (open > 0) { // the torn hole: shadowed walls, swirling streaks, ragged rim, fragments flung up after the robot
      const R = 46 * open / cam.upp(hp[2]);
      c.save(); c.translate(hp[0], hp[1]); c.scale(1, 0.34);
      const g = c.createRadialGradient(0, R * 0.2, R * 0.05, 0, 0, R);
      g.addColorStop(0, 'rgba(30,44,96,0.96)'); g.addColorStop(0.65, 'rgba(66,88,152,0.92)'); g.addColorStop(1, 'rgba(150,170,214,0.88)');
      c.fillStyle = g; c.beginPath();
      for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, rr = R * (1 + (noise2(k * 0.6, 3.7) - 0.5) * 0.22); k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.fill();
      c.fillStyle = 'rgba(200,214,240,0.55)'; c.beginPath(); c.ellipse(0, -R * 0.55, R * 0.82, R * 0.32, 0, Math.PI, Math.PI * 2); c.fill(); // the lit far wall
      c.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const a0 = i / 16 * Math.PI * 2 + s * 1.2 * (1 + 0.3 * hashi(i, 1)), rr = R * (0.95 + 0.4 * hashi(i, 2));
        c.strokeStyle = i % 3 ? 'rgba(255,252,246,0.85)' : 'rgba(205,216,238,0.85)'; c.lineWidth = R * 0.07 * (0.5 + hashi(i, 4));
        c.beginPath(); c.arc(0, 0, rr, a0, a0 + 0.4 + hashi(i, 3) * 0.7); c.stroke();
      }
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2 + s * 1.4, rr = R * (1.05 + 0.25 * hashi(i, 3)), pr = R * (0.18 + 0.14 * hashi(i, 6));
        c.fillStyle = 'rgba(176,192,224,0.92)'; c.beginPath(); c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, pr * 1.8, pr, a + 1.2, 0, 6.3); c.fill();
        c.fillStyle = 'rgba(255,252,246,0.95)'; c.beginPath(); c.ellipse(Math.cos(a) * rr - pr * 0.2, Math.sin(a) * rr - pr * 0.35, pr * 1.3, pr * 0.65, a + 1.2, 0, 6.3); c.fill();
      }
      c.restore();
      for (let i = 0; i < 18; i++) {
        const tt = s - 0.05 - hashi(i, 5) * 0.3; if (tt < 0 || tt > 1.5) continue;
        const wp = v3.add(PUNCH, [(hashi(i, 6) - 0.5) * 70 * (1 + tt), tt * (18 + hashi(i, 7) * 26) - 6 * tt * tt, (hashi(i, 8) - 0.5) * 70 * (1 + tt)]);
        const p = cam.project(wp); if (p[2] < 1) continue;
        const pr = (2 + hashi(i, 9) * 3.5) * (1 + tt * 0.5) * smoothstep(1.5, 0.9, tt) / cam.upp(p[2]); // swell, then break up
        if (pr < 0.5) continue;
        c.globalAlpha = 1; c.fillStyle = 'rgb(196,208,232)'; c.beginPath(); c.arc(p[0], p[1], pr, 0, 6.3); c.fill();
        c.fillStyle = 'rgb(255,252,246)'; c.beginPath(); c.arc(p[0] - pr * 0.2, p[1] - pr * 0.3, pr * 0.7, 0, 6.3); c.fill(); c.globalAlpha = 1;
      }
    }
    const tq = onN(t, 1);
    const trail = []; for (let k = 0; k <= 30; k++) { const tt = tq - 1.2 + k * 0.04; if (tt > 68.52) trail.push(cam.project(punchPos(tt))); }
    lightTrail(c, trail.map((p) => [p[0], p[1]]), 12, hex('#ffe2b0'), hex('#fffaf2'), 0.9);
    if (s >= 0) {
      const att = flightAttitude(punchPos, tq);
      drawRobot(c, cam, poseFly(punchPos(tq), att, { tuck: 1 }), { light: LIGHT.sky(), lineW: 1.2, eyeGlow: 1.5, chestGlow: 1, engine: 1, boil: f });
    }
    const dark = smoothstep(0.5, 3.5, s);
    c.save(); const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(2,3,12,${0.85 * dark})`); g.addColorStop(0.6, `rgba(6,8,30,${0.5 * dark})`); g.addColorStop(1, 'rgba(6,8,30,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
    finishFrame(c, f, { wash: [hex('#c8d6f0'), 0.1], vigCol: [70, 76, 110] });
  },
});

// ───────── S12a 72–79 · space, medium: engines ease, it glides and looks down at the planet ─────────
shot(72, 79, 'space-awe', {
  camAt(s) { const k = easeInOut(s / 7); return C([36 - 3 * k, -9 + 1 * k, 44 - 2 * k], [2, 1, 0], 40, -5); },
  async paint(Y) { this.cam0 = this.camAt(0); },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 1));
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.drawImage(STARS, -60 - s * 6, -40);
    // planet below: large disc, limb arcs across the lower frame
    drawPlanet(c, W * 0.42, H * 2.32, H * 1.75, -0.1, s, 0.85);
    const eng = 1 - smoothstep(0.4, 2.6, s);
    const look = easeInOut(clamp((onN(s, 2) - 1.8) / 2.4), 2);
    const pos = [s * 0.8, Math.sin(s * 0.35) * 0.4, 0];
    const pose = poseFly(pos, { pitch: 80, yaw: 90, bank: -8 + 4 * Math.sin(s * 0.5) }, { tuck: lerp(1, 0.5, smoothstep(1, 4, s)), headPitch: lerp(-48, 12, look), headYaw: lerp(0, -42, look), headRoll: -10 * look, ear: [lerp(-10, 10, look), 0, -6] });
    const { B } = drawRobot(c, cam, pose, { light: LIGHT.space(), lineW: 1.9, eyeGlow: eyeGlow(t), chestGlow: 1, engine: eng, boil: f >> 1 });
    if (eng > 0.02) for (const nm of ['ankleL', 'ankleR']) { const a = cam.project(boneP(B, nm, [0, -1.3, 0.4])), b = cam.project(boneP(B, nm, [0, -8, 0.4])); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; drawFlame(c, a[0], a[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L, 220, 40, f, nm.length * 5, eng); }
    finishFrame(c, f, { wash: [hex('#8090d0'), 0.1], light: [W * 1.05, H * 0.35, 1300, hex('#ffe6c4'), 0.28], vigCol: [40, 40, 70], grain: 0.06 });
  },
});

// ───────── S12b 79–86 · space, wide: flying on toward the sunrise at the limb; hold; fade ─────────
shot(79, 86, 'space-wide', {
  camAt(s) { const k = easeInOut(clamp(s / 2.2), 1.5) * 0.06; return C([0, 18, 230 * (1 - k)], [10, 0, 0], 36); },
  async paint() { this.cam0 = this.camAt(0); },
  draw(c, s, t, f) {
    const cam = this.camAt(onN(s, 1));
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.drawImage(STARS, -200, -120);
    drawPlanet(c, W * 0.5, H * 3.05, H * 2.25, 0.04, s, 1);
    const sun = [W * 0.8, H * 0.72];
    glow(c, sun[0], sun[1], 1100, hex('#ffd9a0'), 0.4); glow(c, sun[0], sun[1], 280, hex('#fff6e6'), 0.85);
    godRays(c, sun[0], sun[1], 14, 1400, Math.PI * 2, 0, hex('#ffe8c8'), 0.08, 9);
    const p = [lerp(-28, 10, s / 7), 2 + Math.sin(s * 0.6) * 0.3, 0];
    const trail = []; for (let k = 0; k <= 30; k++) { const ss = s - 2 + k * 0.066; trail.push(cam.project([lerp(-28, 10, ss / 7) - 6, 2 + Math.sin(ss * 0.6) * 0.3 - 2, 0])); }
    lightTrail(c, trail.map((q) => [q[0], q[1]]), 10, hex('#ffd7a0'), hex('#fff7ea'), 0.9);
    const pose = poseFly(p, { pitch: 78, yaw: 82, bank: -4 }, { tuck: 0.8, headPitch: -40 });
    const Ls = LIGHT.space(), toSun = v3.norm(v3.sub(cam.unproject(sun[0], sun[1], 2000), cam.pos));
    Object.assign(Ls, { sunDir: toSun, rimDir: toSun, rimCol: [1, 0.86, 0.62], rimOn: 1, amb: [0.7, 0.68, 1.05] });
    drawRobot(c, cam, pose, { light: Ls, lineW: 1.15, eyeGlow: 1.3, chestGlow: 1, engine: 0.5, boil: f >> 1 });
    finishFrame(c, f, { wash: [hex('#8090d0'), 0.1], light: [sun[0], sun[1], 1400, hex('#ffd9a0'), 0.2], vigCol: [30, 30, 60], grain: 0.06, fade: smoothstep(84, 86, t) });
  },
});

// ───────── title 86–91 ─────────
shot(86, 91, 'title', { async paint() {}, draw(c, s, t, f) { drawTitle(c, t, f); } });

// planet: pre-painted texture, drawn as a disc with atmosphere, terminator and a sunrise on the limb
function drawPlanet(c, cx, cy, R, rot, s, glowK) {
  c.save(); c.translate(cx, cy); c.rotate(rot);
  // atmosphere halo
  const g = c.createRadialGradient(0, 0, R * 0.98, 0, 0, R * 1.08);
  g.addColorStop(0, 'rgba(120,190,255,0.85)'); g.addColorStop(0.25, 'rgba(90,150,255,0.35)'); g.addColorStop(1, 'rgba(60,90,200,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 1.08, 0, 6.3); c.fill();
  c.save(); c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.clip();
  c.drawImage(PLANET, -R, -R, R * 2, R * 2);
  c.restore();
  // thin bright limb line + warm sunrise arc on the right
  c.lineWidth = 3; c.strokeStyle = 'rgba(190,230,255,0.8)'; c.beginPath(); c.arc(0, 0, R, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
  c.lineWidth = 6; c.strokeStyle = `rgba(255,200,130,${0.6 * glowK})`; c.beginPath(); c.arc(0, 0, R * 1.003, Math.PI * 1.62, Math.PI * 1.9); c.stroke();
  c.restore();
}
function paintPlanet() {
  const n = 1000, cv = newCanvas(n, n), c = cv.getContext('2d'), img = c.createImageData(n, n), d = img.data;
  const sun = v3.norm([0.85, -0.2, 0.5]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i / n * 2 - 1, y = j / n * 2 - 1, rr = x * x + y * y; if (rr > 1) continue;
    const z = Math.sqrt(1 - rr), k = (j * n + i) * 4;
    const land = fbm3(x * 1.9 + 7, y * 1.9 + 3, z * 1.9, 5) - 0.03 * Math.abs(y * 3);
    let col = land > 0.57 ? mixc(hex('#b39a68'), hex('#5f8048'), clamp((0.66 - land) * 9)) : mixc(hex('#1c4688'), hex('#3577b8'), clamp((land - 0.3) * 3));
    const swirl = fbm3(x * 3.2 + y * 1.5 + 20, y * 6.5 + 9, z * 3.2, 4);
    col = mixc(col, hex('#f3f5fb'), smoothstep(0.56, 0.7, swirl) * 0.92);
    const ndl = x * sun[0] + -y * sun[1] + z * sun[2];
    const lit = smoothstep(-0.12, 0.25, ndl);
    col = mixc(mixc(hex('#0b1236'), hex('#2a2a6a'), clamp(ndl + 0.4)), col, lit);
    const rim = Math.pow(1 - z, 3);
    col = mixc(col, hex('#8fc8ff'), rim * 0.6 * lit + rim * 0.15);
    d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const P = new Painter(c, 300); // brushed cloud streaks
  c.save(); c.beginPath(); c.arc(n / 2, n / 2, n / 2, 0, 6.3); c.clip();
  for (let i = 0; i < 500; i++) { const x = P.r.range(0, n), y = P.r.range(0, n); P.stroke(x, y, P.r.range(-0.3, 0.3), P.r.range(30, 120), P.r.range(2, 8), hex('#f6f8ff'), P.r.range(0.05, 0.14), { bristles: 3 }); }
  c.restore();
  applyPaper(cv, 0.35, 30);
  return cv;
}

// shop signs used on old buildings (each painting context makes its own copy)
function setupSigns() {
  const signs = [['세탁', '#3b5e8f'], ['식당', '#a5473b'], ['여관', '#6b4f8a'], ['수리', '#8a6b2f'], ['철물', '#3f7a5a'], ['약국', '#3f8a6c']].map(([tx, bg], i) => makeSign(tx, { w: 300, h: 90, bg: hex(bg), fg: hex('#f2eee2'), seed: 40 + i }));
  for (const k of ['pre', 'dawn']) { const f = ENV[k]; ENV[k] = (...a) => Object.assign(f(...a), { signs }); }
}
function paintCommonAssets() {
  const clouds = [];
  for (let i = 0; i < CLOUD_CARD_COUNT; i++) { // flight cloud cards
    const cv = newCanvas(820, 520), P = new Painter(cv.getContext('2d'), 600 + i);
    paintCumulus(P, 410, 440, 560, 230, { mid: hex('#e9eef7'), lit: hex('#fffaf0'), hi: hex('#fff3dc'), shade: hex('#a9b6d4'), base: hex('#b3bfd9') }, 600 + i, { lx: 0.55, ly: -0.75 });
    applyPaper(cv, 0.35, 40 + i); clouds.push(cv);
  }
  const stars = newCanvas(W + 400, H + 240); paintStars(stars.getContext('2d'), stars.width, stars.height, 77, { n: 2400 });
  return { SIGN_IMG: makeSign('약국', { w: 360, h: 260, bg: hex('#3f8a6c'), fg: hex('#f4f1e6'), cross: true, seed: 33 }), CLOUD_IMGS: clouds, STARS: stars, PLANET: paintPlanet() };
}
function applyCommonAssets(a) { SIGN_IMG = a.SIGN_IMG; CLOUD_IMGS.length = 0; CLOUD_IMGS.push(...a.CLOUD_IMGS); STARS = a.STARS; PLANET = a.PLANET; }
// a painted shot crosses the worker boundary as plain data + ImageBitmaps
function packShot(sh) {
  const out = {}, transfer = [];
  for (const [k, v] of Object.entries(sh)) {
    if (k === 't0' || k === 't1' || k === 'name' || typeof v === 'function') continue;
    if (v && v.canvas && 'ox' in v) { const bmp = v.canvas.transferToImageBitmap(); out[k] = { __layer: 1, bmp, ox: v.ox, oy: v.oy, depth: v.depth }; transfer.push(bmp); }
    else if (v instanceof Cam) out[k] = { __cam: [v.pos, v.target, v.fov, v.roll, v.shift] };
    else out[k] = v;
  }
  return { out, transfer };
}
function unpackShot(sh, out) {
  for (const [k, v] of Object.entries(out)) sh[k] = v && v.__layer ? { canvas: v.bmp, ox: v.ox, oy: v.oy, depth: v.depth } : v && v.__cam ? new Cam(...v.__cam) : v;
}
// rough paint cost per task, so the slowest ones start first
const PAINT_COST = { 'pass-by': 10, 'city-wide': 6, 'cloud-punch': 6, rooftops: 5, liftoff: 3, common: 2, sparrow: 2, 'look-up': 2, ignite: 2, rise: 2, 'kneel-tilt': 1.5 };

const SCENE = {
  async load(progress, Y) {
    const T0 = performance.now(), mark = (l) => DEBUG && console.log(`load ${l}: ${((performance.now() - T0) / 1000).toFixed(1)} s`);
    grainInit();
    ROBOT = new RobotRenderer(buildBear());
    setupSigns();
    mark('robot + signs');
    const order = ['common', ...SHOTS.map((_, i) => i)].sort((a, b) => (PAINT_COST[typeof b === 'number' ? SHOTS[b].name : b] ?? 0.5) - (PAINT_COST[typeof a === 'number' ? SHOTS[a].name : a] ?? 0.5));
    const done = new Set();
    const tick = (id) => { done.add(id); progress(done.size / order.length, `그림을 그리는 중… ${done.size}/${order.length}`); };
    if (!Q.has('noworker') && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      try { await this.paintParallel(order, tick); mark('parallel painting'); }
      catch (e) { if (DEBUG) console.log('parallel painting failed, painting on the main thread:', e.message); }
    }
    for (const id of order) { // main-thread path (no workers, or whatever the workers did not finish)
      if (done.has(id)) continue;
      await Y();
      if (id === 'common') applyCommonAssets(paintCommonAssets());
      else await SHOTS[id].paint.call(SHOTS[id], Y);
      tick(id);
    }
    mark('main-thread painting');
    await titleInit();
    mark('title');
    // warm-up: draw each shot once so shaders compile and painted layers reach the GPU before playback
    for (const sh of SHOTS) { this.draw(vctx, (sh.t0 + sh.t1) / 2, Math.floor((sh.t0 + sh.t1) / 2 * FPS)); await Y(); }
    mark('warm-up');
    progress(1);
  },
  // paint shots in background workers created from this very script (a blob: URL, no network)
  paintParallel(order, tick) {
    const url = URL.createObjectURL(new Blob([document.getElementById('film').textContent], { type: 'text/javascript' }));
    // leave cores for the three audio render threads that run at the same time
    const n = clamp((navigator.hardwareConcurrency || 4) - 4, 2, 6), queue = order.slice(), workers = [];
    return new Promise((resolve, reject) => {
      let idle = 0, failed = false;
      const finish = () => { workers.forEach((w) => w.terminate()); URL.revokeObjectURL(url); };
      const fail = (err) => { if (failed) return; failed = true; finish(); reject(err); };
      const next = (w) => {
        const id = queue.shift();
        if (id === undefined) { if (++idle === workers.length) { finish(); resolve(); } return; }
        w.postMessage(id);
      };
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        workers.push(w);
        w.onmessage = (e) => {
          const m = e.data;
          if (m.error) return fail(new Error(m.error));
          if (DEBUG) console.log(`  worker task ${m.id === 'common' ? 'common' : SHOTS[m.id].name}: ${m.ms ?? '?'} ms`);
          if (m.id === 'common') applyCommonAssets(m.res); else unpackShot(SHOTS[m.id], m.out);
          tick(m.id); next(w);
        };
        w.onerror = (e) => { e.preventDefault(); fail(new Error(e.message || 'worker error')); };
      }
      workers.forEach(next);
    });
  },
  draw(c, t, f) {
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const sh = SHOTS.find((x) => t >= x.t0 && t < x.t1) || SHOTS[SHOTS.length - 1];
    sh.draw(c, t - sh.t0, t, f);
  },
};
