// ───────────────────────────── anim: key poses, hand-timed rise, flight attitude ─────────────────────────────
// A pose parameter set (world-space IK targets; robot faces +z at the origin for ground scenes)
const KP = {
  kneel: {
    hy: 6.0, hx: 0, hz: -0.6, hp: 6, hr: 0,
    spine: [10, 0, -2], chest: [8, 4, 3], neck: [8, 0, 0], head: [15, -8, 6],
    earL: [-22, 0, -16], earR: [-22, 0, 16],
    fL: [2.7, 1.1, 4.4], fLr: [0, -8, 0], pL: [0, 0.7, 1],
    fR: [-2.6, 1.15, -3.2], fRr: [160, 0, 0], pR: [0, -0.5, 1],
    hL: [3.7, 6.6, 6.0], phL: [1, 0, -0.6],
    hR: [-7.0, 4.9, 3.0], phR: [-0.4, 0, -1],
  },
};
KP.press = Object.assign({}, KP.kneel, { hy: 5.85, hR: [-7.0, 4.35, 3.0], spine: [11, 0, -3] });
KP.upper = Object.assign({}, KP.press, { hy: 6.45, hp: 6, spine: [6, 0, -1], chest: [6, 2, 1], neck: [6, 0, 0], head: [8, -4, 2], hR: [-7.0, 4.45, 3.0], hL: [3.3, 7.4, 5.2], earL: [-14, 0, -12], earR: [-14, 0, 12] });
KP.knee = Object.assign({}, KP.upper, {
  hy: 8.1, hx: 0.7, hz: 0.2, hp: 9, spine: [10, 0, 2], chest: [6, 0, 0], neck: [4, 0, 0], head: [6, 0, 0],
  fR: [-2.7, 1.1, 0.6], fRr: [0, 6, 0], pR: [0, 0.6, 1], hR: [-4.3, 8.0, 3.8], hL: [3.9, 8.0, 4.6],
});
KP.slip = Object.assign({}, KP.knee, { hy: 7.1, hx: 0.3, hz: 0.6, hp: 15, fR: [-2.95, 1.1, -0.3], spine: [14, 0, -4], head: [12, 0, -6], hR: [-6.9, 5.6, 3.4] });
KP.stand = {
  hy: 9.45, hx: 0, hz: 0, hp: 0, hr: 0,
  spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [-2, 0, 0],
  earL: [0, 0, 0], earR: [0, 0, 0],
  fL: [2.65, 1.1, 2.2], fLr: [0, -6, 0], pL: [0, 0.1, 1],
  fR: [-2.65, 1.1, 0.6], fRr: [0, 6, 0], pR: [0, 0.1, 1],
  hL: [7.3, 9.7, 1.2], phL: [0.4, 0, -1],
  hR: [-7.3, 9.7, 1.2], phR: [-0.4, 0, -1],
};
KP.over = Object.assign({}, KP.stand, { hy: 9.58, spine: [-4, 0, 0], chest: [-3, 0, 0], head: [-9, 0, 0], hL: [7.5, 9.9, 2.0], hR: [-7.5, 9.9, 2.0] });
KP.settle = Object.assign({}, KP.stand, { head: [-4, 0, 0] });
KP.look = Object.assign({}, KP.stand, { head: [-16, 6, 0], neck: [-6, 0, 0], earL: [6, 0, 4], earR: [6, 0, -4] });
KP.crouch = Object.assign({}, KP.stand, {
  hy: 7.0, hp: 14, spine: [8, 0, 0], chest: [4, 0, 0], neck: [-14, 0, 0], head: [-18, 0, 0],
  fL: [2.9, 1.1, 1.6], fR: [-2.9, 1.1, 0.4], pL: [0.2, 0.3, 1], pR: [-0.2, 0.3, 1],
  hL: [8.0, 8.6, -1.6], hR: [-8.0, 8.6, -1.6], earL: [8, 0, 6], earR: [8, 0, -6],
});

function lerpKP(a, b, u) {
  const o = {};
  for (const k in a) {
    const x = a[k], y = b[k] ?? x;
    o[k] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * u) : x + (y - x) * u;
  }
  return o;
}
// keyed sequence of KP with per-segment curve: [[t, kp, curve], ...]
function seqKP(seq, t) {
  if (t <= seq[0][0]) return seq[0][1];
  for (let i = 1; i < seq.length; i++) if (t <= seq[i][0]) {
    const [t0, a] = seq[i - 1], [t1, b, cv] = seq[i];
    const u = (t - t0) / (t1 - t0);
    return lerpKP(a, b, cv ? cv(u) : easeInOut(u, 2));
  }
  return seq[seq.length - 1][1];
}

// parameters → pose for solvePose (root yaw/offset optional)
function poseFrom(k, o = {}) {
  const yaw = o.yaw ?? 0, base = o.at ?? [0, 0, 0];
  const R = m4.ry(yaw * DEG);
  const W = (p) => v3.add(base, m4.xfDir(R, p));
  const footRot = (r) => m4.mul(R, m4.euler(r[0], r[1], r[2]));
  return {
    root: { pos: W([k.hx, k.hy - 9.6, k.hz]), rot: [0, yaw, 0] },
    rot: { hips: [k.hp, 0, k.hr], spine: k.spine, chest: k.chest, neck: k.neck, head: k.head, earL: k.earL, earR: k.earR },
    ik: {
      legL: { target: W(k.fL), pole: m4.xfDir(R, k.pL), endRot: footRot(k.fLr) },
      legR: { target: W(k.fR), pole: m4.xfDir(R, k.pR), endRot: footRot(k.fRr) },
      armL: { target: W(k.hL), pole: m4.xfDir(R, k.phL) },
      armR: { target: W(k.hR), pole: m4.xfDir(R, k.phR) },
    },
  };
}

// small seeded tremble for creaking holds (held on 2s)
function tremble(k, s, amt) {
  if (amt <= 0) return k;
  const f = Math.floor(s * FPS / 2), j = (i) => (hashi(f, i, 77) - 0.5) * amt;
  return Object.assign({}, k, { spine: [k.spine[0] + j(1), k.spine[1], k.spine[2] + j(2)], head: [k.head[0] + j(3), k.head[1] + j(4), k.head[2]], hy: k.hy + j(5) * 0.02 });
}

// S7: the slow rise, s = seconds from 35.5
const RISE_SEQ = [
  [0, KP.kneel], [1.0, KP.kneel], [1.15, KP.press, (u) => easeOut(u, 2)],
  [2.4, KP.upper, (u) => easeInOut(u, 2.6)], [3.0, KP.upper],
  [5.2, KP.knee, (u) => easeInOut(u, 2.2)],
  [5.6, KP.slip, (u) => easeIn(u, 3)],
  [8.6, KP.stand, (u) => easeInOut(u, 2.6)],
  [9.4, KP.over, (u) => easeOut(u, 2)],
  [10.2, KP.settle, (u) => easeInOut(u, 2)],
  [12.5, KP.settle],
];
function riseParams(s) {
  const hold = s > 5.1 && s < 5.75 ? 1 : 2; // the slip is drawn on 1s, everything else on 2s
  const q = onN(s, hold);
  let k = seqKP(RISE_SEQ, q);
  const creak = (q > 1.2 && q < 3.05 ? 0.9 : 0) + (q > 5.6 && q < 8.6 ? 0.45 : 0);
  return tremble(k, q, creak);
}

// attitude from velocity history: body faces where it was heading 0.3 s ago, banks into turns
function flightAttitude(pathFn, t, lag = 0.3) {
  const tl = t - lag, dt = 1 / 24;
  const v = v3.sub(pathFn(tl + dt), pathFn(tl - dt));
  const v2 = v3.sub(pathFn(tl + dt * 4), pathFn(tl + dt * 2));
  const sp = v3.len(v) || 1e-6;
  const yaw = Math.atan2(v[0], v[2]) / DEG;
  const climb = Math.atan2(v[1], Math.hypot(v[0], v[2])) / DEG;
  const yaw2 = Math.atan2(v2[0], v2[2]) / DEG;
  let dyaw = yaw2 - yaw; if (dyaw > 180) dyaw -= 360; if (dyaw < -180) dyaw += 360;
  return { yaw, pitch: 90 - climb, bank: clamp(-dyaw * 6, -35, 35), speed: sp / (2 * dt) };
}
// 1–2 frame turbulence jolts
function jolt(f, seed, amt) {
  const h = hashi(f >> 1, seed, 3);
  if (h < 0.86) return [0, 0, 0];
  return [(hashi(f, seed, 5) - 0.5) * amt, (hashi(f, seed, 6) - 0.5) * amt, (hashi(f, seed, 7) - 0.5) * amt];
}
// flying pose (FK): body pitched along travel, arms swept back, legs trailing, head looking ahead
function poseFly(pos, att, o = {}) {
  const tuck = o.tuck ?? 1;
  const headUp = o.headPitch ?? -clamp(att.pitch - 20, 0, 60);
  const R = m4.mul(m4.ry(att.yaw * DEG), m4.mul(m4.rx(att.pitch * DEG), m4.rz(att.bank * DEG)));
  return {
    root: { pos: v3.sub(pos, m4.xfDir(R, [0, 14, 0])), rot: [att.pitch, att.yaw, att.bank] },
    rot: {
      hips: [6 * tuck, 0, 0], spine: [4, 0, 0], chest: [2, 0, 0],
      neck: [headUp * 0.4, (o.headYaw ?? 0) * 0.4, 0], head: [headUp * 0.6 + (o.headPitch2 ?? 0), (o.headYaw ?? 0) * 0.6, o.headRoll ?? 0],
      shoulderL: [lerp(10, 72, tuck), 0, lerp(30, 12, tuck)], elbowL: [lerp(-35, -8, tuck), 0, 0],
      shoulderR: [lerp(10, 72, tuck), 0, -lerp(30, 12, tuck)], elbowR: [lerp(-35, -8, tuck), 0, 0],
      hipL: [lerp(-8, 4, tuck), 0, 3], kneeL: [lerp(22, 8, tuck), 0, 0], ankleL: [lerp(10, 40, tuck), 0, 0],
      hipR: [lerp(-14, 8, tuck), 0, -3], kneeR: [lerp(30, 14, tuck), 0, 0], ankleR: [lerp(10, 40, tuck), 0, 0],
      earL: o.ear ?? [-10, 0, -8], earR: o.ear ? [o.ear[0], o.ear[1], -o.ear[2]] : [-10, 0, 8],
    },
  };
}
