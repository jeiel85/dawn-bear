// ───────────────────────────── title: "새벽곰" painted in the backgrounds' gouache over a MaruBuri Bold skeleton ─────────────────────────────
const TITLE_FONT_B64 = '/*@INLINE title_font.b64*/';
const TITLE = { variants: [], cx: 0, cy: 0 };
const TITLE_TEXT = '새벽곰', TITLE_INK_PX = 80, TITLE_SLANT = 11;

async function titleInit() {
  const face = new FontFace('DawnTitleSerif', `url(data:font/woff2;base64,${TITLE_FONT_B64})`);
  await face.load();
  document.fonts.add(face);
  for (let v = 0; v < 3; v++) TITLE.variants.push(paintTitle(v));
}

// one painted drawing of the title; three of them cycle on 3s for a faint line boil
function paintTitle(v) {
  const S = 2; // paint at 2x, then downsample
  const probe = newCanvas(10, 10).getContext('2d');
  probe.font = `100px DawnTitleSerif`;
  const m0 = probe.measureText(TITLE_TEXT);
  const size = 100 * TITLE_INK_PX / (m0.actualBoundingBoxAscent + m0.actualBoundingBoxDescent) * S;
  const wpx = Math.ceil(m0.width / 100 * size + size), hpx = Math.ceil(size * 1.6);
  // 1) skeleton mask: slanted ~11°
  const M = newCanvas(wpx, hpx), mc = M.getContext('2d');
  mc.font = `${size}px DawnTitleSerif`; mc.fillStyle = '#fff'; mc.textBaseline = 'alphabetic';
  const base = hpx * 0.72;
  mc.setTransform(1, 0, -Math.tan(TITLE_SLANT * DEG), 1, size * 0.32 + base * Math.tan(TITLE_SLANT * DEG), 0);
  mc.fillText(TITLE_TEXT, 0, base);
  mc.setTransform(1, 0, 0, 1, 0, 0);
  // 2) hand-wobbled edges: shear the mask in thin strips by low-frequency noise (different per drawing)
  const A = newCanvas(wpx, hpx), ac = A.getContext('2d');
  for (let y = 0; y < hpx; y += 2) ac.drawImage(M, 0, y, wpx, 2, (fbm2(y * 0.018 + v * 13.7, 3.1, 3) - 0.5) * 2.6 * S, y, wpx, 2);
  const B = newCanvas(wpx, hpx), bc = B.getContext('2d');
  for (let x = 0; x < wpx; x += 2) bc.drawImage(A, x, 0, 2, hpx, x, (fbm2(x * 0.018 + v * 7.9, 9.4, 3) - 0.5) * 2.6 * S, 2, hpx);
  // 3) gouache: warm white base + bristle strokes in near-whites, clipped to the wobbled mask
  const Pc = newCanvas(wpx, hpx), pc = Pc.getContext('2d'), P = new Painter(pc, 900 + v * 31);
  pc.fillStyle = '#f3f1ea'; pc.fillRect(0, 0, wpx, hpx);
  const tones = [hex('#f6f3ea'), hex('#ece6d6'), hex('#fbf8f1'), hex('#efe7d2'), hex('#e6dfcd'), hex('#f3f1ea')];
  for (let i = 0; i < 1400; i++) {
    const x = P.r.range(0, wpx), y = P.r.range(hpx * 0.1, hpx * 0.95);
    P.stroke(x, y, -1.2 + P.r.range(-0.5, 0.5) + (P.r.chance(0.4) ? Math.PI / 2 : 0), P.r.range(14, 60) * S, P.r.range(3, 9) * S, P.r.pick(tones), P.r.range(0.18, 0.5), { bristles: 4, cj: 0.03 });
  }
  pc.globalCompositeOperation = 'destination-in'; pc.drawImage(B, 0, 0); pc.globalCompositeOperation = 'source-over';
  applyPaper(Pc, 0.7, 50 + v);
  // pigment pooling along the edge: a faint darker rim just inside the letter
  const E = newCanvas(wpx, hpx), ec = E.getContext('2d');
  ec.drawImage(B, 0, 0); ec.globalCompositeOperation = 'source-in'; ec.fillStyle = 'rgba(176,160,136,1)'; ec.fillRect(0, 0, wpx, hpx);
  ec.globalCompositeOperation = 'destination-out'; ec.drawImage(B, 1.5 * S, 1.5 * S);
  pc.globalAlpha = 0.35; pc.globalCompositeOperation = 'source-atop'; pc.drawImage(E, 0, 0); pc.globalAlpha = 1; pc.globalCompositeOperation = 'source-over';
  // 4) downsample to 1x
  const out = newCanvas(wpx / S, hpx / S), oc = out.getContext('2d');
  oc.imageSmoothingQuality = 'high'; oc.drawImage(Pc, 0, 0, wpx / S, hpx / S);
  // ink bounding box (for exact centring)
  const d = oc.getImageData(0, 0, out.width, out.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) if (d[(y * out.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { img: out, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, inkH: y1 - y0 + 1 };
}

function drawTitle(c, t, f) {
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const a = t < 86.8 ? 0 : t < 88.0 ? (t - 86.8) / 1.2 : t < 90.0 ? 1 : Math.max(0, (91.0 - t) / 1.0);
  if (a <= 0 || !TITLE.variants.length) return;
  const v = TITLE.variants[Math.floor(f / 3) % 3];
  c.globalAlpha = a;
  c.drawImage(v.img, Math.round(W / 2 - v.cx), Math.round(H / 2 - v.cy));
  c.globalAlpha = 1;
}
