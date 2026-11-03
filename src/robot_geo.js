// ───────────────────────────── robot_geo: 새벽곰 (Dawn Bear) mecha — procedural meshes, skeleton, pose solver ─────────────────────────────
// Materials (index → shader table in robot_gl.js)
const MAT = { FUR: 0, FURL: 1, NOSE: 2, HOOD: 3, CAP: 4, GOLD: 5, METAL: 6, EYE: 7, CREAM: 8, GLASS: 9, EARIN: 10, PAD: 11, VINE: 12, LEAF: 13, NOZZLE: 14, MUZZLE: 15, PLATE: 16 };

function meshFromGrid(nu, nv, fn, closedU = true) {
  // fn(u, v) → [x,y,z]; normals from the grid's partial derivatives
  const pos = [], nor = [], idx = [];
  const cols = closedU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) pos.push(fn(i / nu, j / nv));
  const P = (i, j) => pos[clamp(j, 0, nv) * cols + (closedU ? ((i % nu) + nu) % nu : clamp(i, 0, nu))];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    let du = v3.sub(P(i + 1, j), P(i - 1, j)), dv = v3.sub(P(i, j + 1), P(i, j - 1));
    if (v3.len(du) < 1e-7) du = v3.sub(P(i + 1, j + (j === 0 ? 1 : -1)), P(i - 1, j + (j === 0 ? 1 : -1)));
    let n = v3.cross(dv, du);
    if (v3.len(n) < 1e-9) n = v3.sub(P(i, j), [0, 0, 0]);
    nor.push(v3.norm(n));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + (closedU ? (i + 1) % nu : i + 1), c = (j + 1) * cols + i, d = (j + 1) * cols + (closedU ? (i + 1) % nu : i + 1);
    idx.push(a, c, b, b, c, d);
  }
  return { pos: new Float32Array(pos.flat()), nor: new Float32Array(nor.flat()), idx: new Uint32Array(idx) };
}
const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
// superellipsoid; v from south (0) to north (1); vMax < 1 gives a cut hemisphere
function meshSuper(nu, nv, e1 = 1, e2 = 1, v0 = 0, v1 = 1) {
  const m = meshFromGrid(nu, nv, (u, v) => {
    const th = u * Math.PI * 2, ph = -Math.PI / 2 + Math.PI * (v0 + (v1 - v0) * v);
    const cp = spow(Math.cos(ph), e1), sp = spow(Math.sin(ph), e1);
    return [cp * spow(Math.sin(th), e2), sp, cp * spow(Math.cos(th), e2)];
  });
  // analytic normals for the unit superellipsoid (smooth at poles)
  const p = m.pos, n = m.nor;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (e1 === 1 && e2 === 1) { const l = Math.hypot(x, y, z) || 1; n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l; continue; }
    const a = 2 / e2, b = 2 / e1, g = Math.pow(Math.abs(x), a) + Math.pow(Math.abs(z), a) + 1e-12;
    const k = (e2 / e1) * Math.pow(g, e2 / e1 - 1) * a;
    const nx = k * Math.pow(Math.abs(x), a - 1) * Math.sign(x), nz = k * Math.pow(Math.abs(z), a - 1) * Math.sign(z), ny = b * Math.pow(Math.abs(y), b - 1) * Math.sign(y);
    const l = Math.hypot(nx, ny, nz) || 1; n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
  }
  return m;
}
function meshTorus(R, r, nu = 48, nv = 16) {
  return meshFromGrid(nu, nv, (u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    return [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)];
  });
}
// tube along points (parallel transport), radius may be a function of t
function meshTube(pts, rad, seg = 10, samples = 0) {
  const path = samples ? catmull(pts, samples) : pts, n = path.length;
  const T = [];
  for (let i = 0; i < n; i++) T.push(v3.norm(v3.sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)])));
  let N0 = v3.norm(v3.cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i) { const b = v3.cross(T[i - 1], T[i]); if (v3.len(b) > 1e-6) { const ax = v3.norm(b), ang = Math.acos(clamp(v3.dot(T[i - 1], T[i]), -1, 1)); N0 = rotAxis(N0, ax, ang); } }
    frames.push([N0, v3.cross(T[i], N0)]);
  }
  const radf = typeof rad === 'function' ? rad : () => rad;
  const m = meshFromGrid(seg, n - 1, (u, v) => {
    const i = Math.round(v * (n - 1)), a = u * Math.PI * 2, [N, B] = frames[i], r = radf(i / (n - 1));
    return v3.add(path[i], v3.add(v3.mul(N, Math.cos(a) * r), v3.mul(B, Math.sin(a) * r)));
  });
  return m;
}
function rotAxis(v, k, a) { // Rodrigues
  const c = Math.cos(a), s = Math.sin(a);
  return v3.add(v3.add(v3.mul(v, c), v3.mul(v3.cross(k, v), s)), v3.mul(k, v3.dot(k, v) * (1 - c)));
}
function catmull(pts, per) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function meshDisc(seg = 40) { // facing +z, radius 1
  return meshFromGrid(seg, 2, (u, v) => { const a = u * Math.PI * 2, r = v; return [Math.cos(a) * r, Math.sin(a) * r, -0.02 * r * r]; });
}
// cap crown: hemisphere with a tall, steep front panel (unit-ish; scaled by part)
function meshCrown() {
  return meshFromGrid(128, 40, (u, v) => {
    const th = u * Math.PI * 2, ph = (v * 0.5) * Math.PI; // 0 = rim, π/2 = top
    let x = Math.cos(ph) * Math.sin(th), y = Math.sin(ph), z = Math.cos(ph) * Math.cos(th);
    const front = clamp(z, 0, 1);
    y *= 1 + 0.2 * front;                  // tall front
    z += 0.22 * y * y * (z > 0 ? 0.6 : 0.2); // steepen front panel
    x *= 1 - 0.06 * y;
    return [x, y, z];
  });
}
// curved brim as a closed thin shell; local frame: attached around crown rim front (rim radius rx, rz), extends +z
function meshBrim(rx, rz, len, thick) {
  const span = 56 * DEG, cs = Math.cos(span);
  const surf = (s, t, side) => {
    const a = s * span, sa = Math.sin(a), ca = Math.cos(a);
    const ax = rx * sa, az = rz * ca;
    const L = len * Math.pow(clamp((ca - cs) / (1 - cs)), 0.5);
    const dir = v3.norm([sa * rz, 0, ca * rx]);
    const x = ax + dir[0] * L * t, z = az + dir[2] * L * t;
    const y = -0.85 * s * s * (0.2 + t) - 0.3 * t * t + side * thick * 0.5 * (1 - 0.35 * t);
    return [x, y, z];
  };
  // stitch top surface, tip edge, bottom surface into one strip ring
  return meshFromGrid(64, 36, (u, v) => {
    const s = -1 + 2 * u;
    if (v < 0.45) return surf(s, v / 0.45, 1);
    if (v < 0.55) { const k = (v - 0.45) / 0.1; return surf(s, 1 + 0.02 * Math.sin(k * Math.PI), 1 - 2 * k); }
    return surf(s, 1 - (v - 0.55) / 0.45, -1);
  }, false);
}

// snap a point to the outside of an axis-aligned ellipsoid (centre c, radii r) plus offset
function onEllipsoid(p, c, r, off) {
  const d = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]], l = Math.hypot(...d) || 1;
  const s = [c[0] + d[0] / l * r[0], c[1] + d[1] / l * r[1], c[2] + d[2] / l * r[2]];
  const n = v3.norm([d[0] / r[0], d[1] / r[1], d[2] / r[2]]);
  return v3.add(s, v3.mul(n, off));
}

// ── skeleton ──
const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 9.6, 0]],
  ['spine', 'hips', [0, 1.2, 0]],
  ['chest', 'spine', [0, 4.2, 0]],
  ['neck', 'chest', [0, 5.2, 0.2]],
  ['head', 'neck', [0, 5.0, 0.4]],
  ['earL', 'head', [5.15, 3.45, -1.3]], ['earR', 'head', [-5.15, 3.45, -1.3]],
  ['shoulderL', 'chest', [6.5, 3.3, 0]], ['elbowL', 'shoulderL', [0, -4.8, 0]], ['handL', 'elbowL', [0, -4.4, 0]],
  ['shoulderR', 'chest', [-6.5, 3.3, 0]], ['elbowR', 'shoulderR', [0, -4.8, 0]], ['handR', 'elbowR', [0, -4.4, 0]],
  ['hipL', 'hips', [2.5, -0.6, 0]], ['kneeL', 'hipL', [0, -4.4, 0]], ['ankleL', 'kneeL', [0, -3.8, 0]],
  ['hipR', 'hips', [-2.5, -0.6, 0]], ['kneeR', 'hipR', [0, -4.4, 0]], ['ankleR', 'kneeR', [0, -3.8, 0]],
];
const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// pose: { root:{pos,rot:[x,y,z]}, rot:{bone:[x,y,z]}, ik:{ankleL:{target,pole,footRot}, handR:{target,pole}} , eyes, ears }
function solvePose(pose) {
  const M = {};
  const rotOf = (name) => { const r = pose.rot?.[name]; return r ? m4.euler(r[0], r[1], r[2]) : m4.ident(); };
  for (const [name, parent, off] of BONES) {
    if (name === 'root') { const r = pose.root.rot || [0, 0, 0]; M.root = m4.mul(m4.trans(...pose.root.pos), m4.mul(m4.ry(r[1] * DEG), m4.mul(m4.rx(r[0] * DEG), m4.rz(r[2] * DEG)))); continue; }
    M[name] = m4.mul(M[parent], m4.mul(m4.trans(...off), rotOf(name)));
  }
  // two-bone IK chains
  const chain = (a, b, c, spec) => {
    if (!spec) return;
    const A = m4.xfPoint(M[a], [0, 0, 0]);
    const L1 = v3.len(BONES[BONE_INDEX[b]][2]), L2 = v3.len(BONES[BONE_INDEX[c]][2]);
    let T = spec.target, d = v3.sub(T, A), dl = v3.len(d);
    const maxL = (L1 + L2) * 0.999;
    if (dl > maxL) { d = v3.mul(d, maxL / dl); T = v3.add(A, d); dl = maxL; }
    const dir = v3.norm(d);
    const pole = v3.norm(v3.sub(spec.pole, v3.mul(dir, v3.dot(spec.pole, dir))));
    const cosA = clamp((L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const B = v3.add(A, v3.add(v3.mul(dir, cosA * L1), v3.mul(pole, sinA * L1)));
    const frame = (p, q, polev) => {
      const y = v3.norm(v3.sub(p, q)); // bone -Y points to child
      let z = v3.sub(polev, v3.mul(y, v3.dot(polev, y))); z = v3.norm(z);
      const x = v3.cross(y, z);
      return m4.fromBasis(x, y, z, p);
    };
    // pole for the upper bone frame: bend direction
    M[a] = frame(A, B, spec.facing || pole);
    const bendOut = v3.norm(v3.sub(v3.add(A, T), v3.mul(B, 2))); // from knee toward the chord
    M[b] = frame(B, T, spec.facing || v3.mul(bendOut, -1));
    const parentRot = spec.endRot ? m4.mul(m4.trans(...T), spec.endRot) : m4.mul(m4.trans(...T), rotOnly(M[b]));
    M[c] = parentRot;
  };
  const ik = pose.ik || {};
  chain('hipL', 'kneeL', 'ankleL', ik.legL); chain('hipR', 'kneeR', 'ankleR', ik.legR);
  chain('shoulderL', 'elbowL', 'handL', ik.armL); chain('shoulderR', 'elbowR', 'handR', ik.armR);
  return M;
}
function rotOnly(m) { const r = m.slice(); r[12] = r[13] = r[14] = 0; return r; }

// ── model: parts on bones ──
// part: { bone, mesh(key), mat, xf (local mat4), id, flags }
function buildBear() {
  const meshes = {
    sph: meshSuper(64, 40), sphHi: meshSuper(128, 80), sphLo: meshSuper(28, 16),
    torso: meshSuper(96, 64, 0.9, 0.9), plate: meshSuper(48, 28, 0.55, 0.7), box: meshSuper(32, 20, 0.25, 0.25),
    crown: meshCrown(), disc: meshDisc(48), cyl: meshSuper(32, 16, 0.12, 1), half: meshSuper(48, 24, 1, 1, 0.5, 1),
  };
  const parts = [];
  let nid = 1;
  const add = (bone, mesh, mat, pos, scl, rot = [0, 0, 0], extra = {}) => {
    const xf = m4.mul(m4.trans(...pos), m4.mul(m4.euler(...rot), m4.scale(...scl)));
    const p = Object.assign({ bone, mesh, mat, xf, scl, id: extra.id ?? nid++ }, extra);
    parts.push(p); return p;
  };
  const mirror = (fn) => { fn(1, 'L'); fn(-1, 'R'); };

  // head (centre = head bone). head ellipsoid radii
  const HR = [5.75, 5.2, 5.4];
  const head = add('head', 'sphHi', MAT.FUR, [0, 0, 0], HR, [0, 0, 0], { decal: 1 });
  add('head', 'sph', MAT.MUZZLE, [0, -1.75, 3.95], [2.75, 2.05, 2.05], [-6, 0, 0], { decal: 2 });
  add('head', 'sph', MAT.NOSE, [0, -0.85, 5.92], [1.0, 0.68, 0.62], [-12, 0, 0]);
  mirror((s, k) => {
    const eye = onEllipsoid([s * 1.95, 0.55, 5], [0, 0, 0], HR, -0.12);
    add('head', 'sph', MAT.EYE, eye, [0.78, 0.92, 0.42], [-4, s * 21, 0], { eye: s, decal: 3 });
    // ears: disc + inner + metal rim
    add('ear' + k, 'sph', MAT.FUR, [0, 0, 0], [1.95, 1.95, 0.95], [0, s * 28, s * -14]);
    add('ear' + k, 'sph', MAT.EARIN, [s * 0.32, 0.05, 0.62], [1.2, 1.2, 0.42], [0, s * 28, s * -14]);
  });
  // cap crown (navy) — sits on the head, rim tilted down at the front
  const capY = 2.75, crownR = [5.3, 4.4, 5.2];
  add('head', 'crown', MAT.CAP, [0, capY, -0.3], crownR, [5, 0, 0], { decal: 5, capCrown: 1 });
  add('head', 'sphLo', MAT.CAP, [0, capY + 4.42, 0.15], [0.5, 0.3, 0.5], [5, 0, 0]); // button
  meshes.brim = meshBrim(crownR[0], crownR[2], 4.5, 0.3);
  add('head', 'brim', MAT.CAP, [0, capY + 0.02, -0.3], [1, 1, 1], [9, 0, 0], { decal: 6 });

  // glasses: rings, bridge, temples running back under the cap to the ears
  const ringR = 1.62, ringZ = 5.62, ringY = 0.5;
  meshes.ring = meshTorus(ringR, 0.17, 72, 14);
  mirror((s) => {
    add('head', 'ring', MAT.GOLD, [s * 2.05, ringY, ringZ], [1, 1, 1], [90 - 4, s * 18, 0], { glasses: 1, side: s });
  });
  meshes.bridge = meshTube(catmull([[-0.55, ringY + 0.75, ringZ + 0.45], [0, ringY + 0.98, ringZ + 0.6], [0.55, ringY + 0.75, ringZ + 0.45]], 6), 0.15, 10);
  add('head', 'bridge', MAT.GOLD, [0, 0, 0], [1, 1, 1], [0, 0, 0], { glasses: 1 });
  mirror((s, k) => {
    const pts = [[s * 3.62, ringY + 0.12, ringZ - 0.55], [s * 4.9, ringY + 0.45, 3.2], [s * 5.55, ringY + 0.75, 1.0], [s * 5.55, ringY + 1.0, -0.9], [s * 5.05, ringY + 0.4, -2.0]]
      .map((p, i) => i ? onEllipsoid(p, [0, 0, 0], HR, 0.12) : p);
    meshes['temple' + k] = meshTube(pts, 0.13, 8, 6);
    add('head', 'temple' + k, MAT.GOLD, [0, 0, 0], [1, 1, 1], [0, 0, 0], { glasses: 1 });
  });

  // neck collar (metal) + hood bunched around the neck
  add('neck', 'sph', MAT.METAL, [0, 0.9, 0], [2.6, 1.6, 2.4], [0, 0, 0]);
  meshes.hoodRoll = meshTorus(3.7, 1.35, 64, 18);
  add('neck', 'hoodRoll', MAT.HOOD, [0, -0.2, -0.6], [1.08, 0.75, 1.0], [-12, 0, 0]);
  add('chest', 'sph', MAT.HOOD, [0, 3.2, -4.0], [3.9, 3.3, 1.55], [16, 0, 0]); // hood hanging on the back

  // torso hoodie
  add('chest', 'torso', MAT.HOOD, [0, 0.4, 0.1], [5.25, 5.5, 4.35], [0, 0, 0], { decal: 7 });
  meshes.band = meshTorus(4.45, 0.62, 64, 12);
  add('chest', 'band', MAT.HOOD, [0, -4.55, 0.1], [1.1, 1, 0.93], [0, 0, 0]);
  // drawstrings
  mirror((s, k) => {
    const pts = [[s * 1.15, 4.4, 3.35], [s * 1.25, 3.0, 4.4], [s * 1.35, 1.0, 4.75], [s * 1.25, -1.0, 4.85]];
    meshes['string' + k] = meshTube(pts, 0.2, 8, 6);
    add('chest', 'string' + k, MAT.CREAM, [0, 0, 0], [1, 1, 1], [0, 0, 0], { string: s });
    add('chest', 'cyl', MAT.CREAM, [s * 1.25, -1.45, 4.85], [0.3, 0.55, 0.3], [6, 0, 0], { string: s });
  });
  // chest window
  meshes.chestRim = meshTorus(1.35, 0.32, 48, 12);
  add('chest', 'chestRim', MAT.METAL, [0, 1.6, 4.6], [1, 1, 1], [90 - 12, 0, 0]);
  add('chest', 'disc', MAT.GLASS, [0, 1.6, 4.62], [1.18, 1.18, 1], [-12, 0, 0], { chest: 1 });
  // back pack + thrusters + cable sockets
  add('chest', 'box', MAT.PLATE, [0, 0.4, -4.5], [3.4, 3.4, 1.3], [0, 0, 0]);
  mirror((s) => { add('chest', 'cyl', MAT.METAL, [s * 1.7, -2.6, -5.3], [0.85, 1.0, 0.85], [0, 0, 0]); add('chest', 'disc', MAT.NOZZLE, [s * 1.7, -3.62, -5.3], [0.7, 0.7, 1], [90, 0, 0]); });

  // pelvis
  add('hips', 'sph', MAT.HOOD, [0, -0.3, 0], [4.7, 2.8, 3.8], [0, 0, 0]);
  add('hips', 'box', MAT.METAL, [0, -0.6, 0], [3.2, 1.4, 3.1], [0, 0, 0]);

  // arms
  mirror((s, k) => {
    add('shoulder' + k, 'plate', MAT.PLATE, [s * 0.35, 0.85, 0], [2.85, 1.85, 2.8], [0, 0, s * -16], { plate: 1, moss: 1 });
    add('shoulder' + k, 'sph', MAT.HOOD, [0, -2.3, 0], [2.0, 2.95, 2.0], [0, 0, 0]);
    add('elbow' + k, 'sph', MAT.METAL, [0, 0, 0], [1.42, 1.42, 1.42], [0, 0, 0]);
    add('elbow' + k, 'sph', MAT.HOOD, [0, -2.2, 0], [1.9, 2.55, 1.9], [0, 0, 0]);
    add('elbow' + k, 'torus' + k, MAT.METAL, [0, -3.75, 0], [1, 1, 1], [0, 0, 0]);
    meshes['torus' + k] = meshTorus(1.72, 0.42, 40, 10);
    // paw: palm + fingers + thumb
    add('hand' + k, 'sph', MAT.FUR, [0, -1.65, 0.15], [1.9, 1.8, 1.7], [0, 0, 0]);
    for (let f = 0; f < 4; f++) add('hand' + k, 'sph', MAT.FUR, [s * (-0.98 + f * 0.65), -2.75, 1.25], [0.6, 0.72, 0.7], [38, 0, 0], { finger: 1 });
    add('hand' + k, 'sph', MAT.FUR, [s * -1.5, -1.45, 1.3], [0.6, 0.9, 0.66], [20, 0, s * 25]);
    add('hand' + k, 'sph', MAT.PAD, [0, -1.9, -0.95], [1.25, 1.05, 0.55], [0, 0, 0]);
  });
  // legs
  mirror((s, k) => {
    add('hip' + k, 'sph', MAT.FUR, [0, -2.2, 0], [2.45, 2.95, 2.45], [0, 0, 0]);
    add('knee' + k, 'sph', MAT.METAL, [0, 0, 0], [1.6, 1.5, 1.6], [0, 0, 0]);
    add('knee' + k, 'plate', MAT.PLATE, [0, 0.1, 1.35], [1.5, 1.6, 0.7], [0, 0, 0], { plate: 1 });
    add('knee' + k, 'sph', MAT.FUR, [0, -1.9, 0], [2.1, 2.45, 2.1], [0, 0, 0]);
    add('ankle' + k, 'sph', MAT.FUR, [0, 0.0, 0.85], [2.0, 1.12, 2.75], [0, 0, 0], { foot: 1 });
    add('ankle' + k, 'sph', MAT.PAD, [0, -0.62, 0.85], [1.7, 0.45, 2.35], [0, 0, 0]);
    for (let f = 0; f < 3; f++) add('ankle' + k, 'sphLo', MAT.FURL, [(-0.85 + f * 0.85), 0.25, 3.25], [0.55, 0.5, 0.45], [0, 0, 0]);
    add('ankle' + k, 'cyl', MAT.METAL, [0, -0.95, 0.4], [0.95, 0.3, 0.95], [0, 0, 0], { nozzle: s });
    add('ankle' + k, 'disc', MAT.NOZZLE, [0, -1.26, 0.4], [0.8, 0.8, 1], [90, 0, 0]);
  });

  // creeping vines: around the left arm, over the right shoulder and down the right thigh
  const vine = (bone, pts, key) => {
    meshes[key] = meshTube(pts, (t) => 0.26 * (1 - t * 0.5), 7, 5);
    add(bone, key, MAT.VINE, [0, 0, 0], [1, 1, 1]);
    const r = makeRng(key.length * 77 + pts.length);
    const path = catmull(pts, 5);
    for (let i = 2; i < path.length - 1; i += 2) {
      const p = path[i], q = path[i + 1], d = v3.norm(v3.sub(q, p));
      const yaw = Math.atan2(d[0], d[2]) / DEG + r.range(-70, 70), pitch = r.range(-40, 40);
      add(bone, 'sphLo', MAT.LEAF, v3.add(p, [r.range(-0.3, 0.3), r.range(-0.2, 0.2), r.range(-0.3, 0.3)]), [0.62, 0.09, 0.95].map((x) => x * r.range(0.8, 1.25)), [pitch, yaw, r.range(-30, 30)], { leaf: 1 });
    }
  };
  const helix = (r0, y0, y1, turns, off = 0) => { const p = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = off + t * turns * Math.PI * 2; p.push([Math.cos(a) * r0, lerp(y0, y1, t), Math.sin(a) * r0]); } return p; };
  vine('shoulderL', helix(2.2, 0.5, -4.6, 1.2, 0.4), 'vineArmL');
  vine('elbowL', helix(2.0, -0.4, -3.6, 0.9, 2.2), 'vineForeL');
  vine('chest', [[-6.4, 6.0, 1.2], [-5.0, 5.2, 3.2], [-3.8, 3.2, 4.4], [-4.6, 0.4, 4.1], [-5.6, -2.0, 3.0], [-5.2, -4.4, 2.8]], 'vineChest');
  vine('hipR', helix(2.55, -0.3, -3.6, 0.8, 1.0), 'vineThighR');
  vine('head', [[-4.6, 4.2, -2.8], [-5.6, 1.8, -2.0], [-5.6, -0.8, -1.4], [-4.4, -3.6, -1.6]], 'vineHead');

  return { meshes, parts };
}
