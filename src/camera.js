// ───────────────────────────── camera: one projection shared by the painted layers and the GPU robot ─────────────────────────────
class Cam {
  constructor(pos, target, fov = 40, roll = 0, shift = [0, 0]) {
    this.pos = pos; this.target = target; this.fov = fov; this.roll = roll; this.shift = shift;
    this.update();
  }
  clone() { return new Cam(this.pos.slice(), this.target.slice(), this.fov, this.roll, this.shift.slice()); }
  update() {
    const fwd = v3.norm(v3.sub(this.target, this.pos));
    const right = v3.norm(v3.cross(fwd, Math.abs(fwd[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]));
    const up = v3.cross(right, fwd);
    const cr = Math.cos(this.roll * DEG), sr = Math.sin(this.roll * DEG);
    this.up = v3.add(v3.mul(up, cr), v3.mul(right, sr));
    this.right = v3.add(v3.mul(right, cr), v3.mul(up, -sr));
    this.fwd = fwd;
    this.view = m4.lookAt(this.pos, this.target, this.up);
    this.near = 0.3; this.far = 20000;
    const p = m4.persp(this.fov * DEG, W / H, this.near, this.far);
    p[8] = -2 * this.shift[0] / W; p[9] = 2 * this.shift[1] / H; // lens shift in pixels (x right, y down)
    this.proj = p;
    this.vp = m4.mul(p, this.view);
    this.f = (H / 2) / Math.tan(this.fov * DEG / 2);
    return this;
  }
  // world → screen pixels; z = view depth (positive in front)
  project(p) {
    const v = this.view, x = p[0], y = p[1], z = p[2];
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12], vy = v[1] * x + v[5] * y + v[9] * z + v[13], vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    const d = -vz;
    return [W / 2 + (vx / d) * this.f + this.shift[0], H / 2 - (vy / d) * this.f + this.shift[1], d];
  }
  // screen pixel + depth → world point
  unproject(sx, sy, d) {
    const x = (sx - W / 2 - this.shift[0]) / this.f * d, y = -(sy - H / 2 - this.shift[1]) / this.f * d;
    return v3.add(this.pos, v3.add(v3.mul(this.right, x), v3.add(v3.mul(this.up, y), v3.mul(this.fwd, d))));
  }
  // world-units per pixel at depth d
  upp(d) { return d / this.f; }
}

// A painted layer was made with cam0; find the 2D similarity that keeps it registered under cam(t).
// layer: { canvas, ox, oy, depth }   (canvas pixel = cam0 screen pixel + (ox, oy))
function layerXform(layer, cam0, cam) {
  const d = layer.depth;
  const a = cam.project(cam0.unproject(W / 2, H / 2, d));
  const b = cam.project(cam0.unproject(W / 2 + 400, H / 2, d));
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const s = Math.hypot(dx, dy) / 400, r = Math.atan2(dy, dx);
  return { a, s, r };
}
function drawLayer(ctx, layer, cam0, cam, alpha = 1) {
  if (alpha <= 0) return;
  const { a, s, r } = cam ? layerXform(layer, cam0, cam) : { a: [W / 2, H / 2], s: 1, r: 0 };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(a[0], a[1]); ctx.rotate(r); ctx.scale(s, s);
  ctx.drawImage(layer.canvas, -W / 2 - layer.ox, -H / 2 - layer.oy);
  ctx.restore();
}
