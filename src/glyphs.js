// ───────────────────────────── glyphs: hand-built stroke lettering (cap emblem and street signs), no font files ─────────────────────────────
function arcPts(cx, cy, rx, ry, a0, a1, n = 18) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * DEG; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return p;
}
// cap print: the DAWN BEAR emblem — a sun rising over a horizon, with rays (drawn, not lettered)
function drawDawnEmblem(ctx, cx, cy, size, rng) {
  const r = size * 0.36, base = cy + size * 0.12;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const j = () => (rng ? (rng.f() - 0.5) * size * 0.012 : 0);
  ctx.beginPath(); // half sun
  for (let i = 0; i <= 28; i++) { const a = Math.PI + Math.PI * i / 28; const x = cx + Math.cos(a) * r + j(), y = base + Math.sin(a) * r + j(); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = size * 0.07;
  for (let k = 0; k < 7; k++) { // rays
    const a = Math.PI + Math.PI * (k + 0.5) / 7, r0 = r * 1.28, r1 = r * (k % 2 ? 1.62 : 1.8);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0 + j(), base + Math.sin(a) * r0 + j()); ctx.lineTo(cx + Math.cos(a) * r1 + j(), base + Math.sin(a) * r1 + j()); ctx.stroke();
  }
  ctx.lineWidth = size * 0.08; // horizon
  ctx.beginPath(); ctx.moveTo(cx - size * 0.62 + j(), base + size * 0.1); ctx.lineTo(cx + size * 0.62 + j(), base + size * 0.1); ctx.stroke();
  ctx.lineWidth = size * 0.05; // ground wave
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) { const u = i / 20, x = cx - size * 0.42 + u * size * 0.84, y = base + size * 0.24 + Math.sin(u * Math.PI * 3) * size * 0.035; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
}
// Hangul syllables used on painted signs; box 0..100
const HANGUL = {
  '약': [['o', 30, 26, 15], [[66, 6], [66, 52]], [[66, 20], [82, 20]], [[66, 36], [82, 36]], [[18, 64], [80, 64], [80, 95]]],
  '국': [[[22, 8], [76, 8], [76, 30]], [[10, 42], [90, 42]], [[50, 42], [50, 58]], [[22, 68], [78, 68], [78, 95]]],
  '세': [[[40, 12], [16, 82]], [[30, 42], [52, 80]], [[50, 46], [64, 46]], [[64, 12], [64, 88]], [[84, 6], [84, 94]]],
  '탁': [[[52, 8], [12, 8], [12, 48], [56, 48]], [[12, 28], [50, 28]], [[74, 4], [74, 56]], [[74, 28], [90, 28]], [[16, 66], [82, 66], [82, 96]]],
  '식': [[[36, 8], [14, 52]], [[28, 28], [50, 52]], [[72, 4], [72, 58]], [[16, 68], [82, 68], [82, 96]]],
  '당': [[[54, 8], [14, 8], [14, 50], [56, 50]], [[74, 4], [74, 58]], [[74, 30], [90, 30]], ['o', 50, 80, 15]],
  '여': [['o', 30, 50, 18], [[74, 8], [74, 92]], [[56, 36], [74, 36]], [[56, 62], [74, 62]]],
  '관': [[[12, 8], [46, 8], [46, 30]], [[30, 34], [30, 48]], [[8, 50], [58, 50]], [[76, 4], [76, 66]], [[76, 32], [92, 32]], [[18, 72], [18, 94], [86, 94]]],
  '수': [[[50, 8], [20, 46]], [[42, 24], [80, 46]], [[8, 60], [92, 60]], [[50, 60], [50, 96]]],
  '리': [[[12, 10], [54, 10], [54, 34], [12, 34], [12, 60], [56, 60]], [[76, 6], [76, 94]]],
  '철': [[[18, 4], [40, 4]], [[10, 14], [50, 14]], [[30, 16], [12, 46]], [[30, 30], [48, 46]], [[68, 4], [68, 52]], [[54, 26], [68, 26]], [[18, 60], [80, 60], [80, 74], [18, 74], [18, 92], [82, 92]]],
  '물': [[[16, 6], [16, 30], [72, 30], [72, 6], [16, 6]], [[8, 44], [92, 44]], [[50, 44], [50, 56]], [[18, 64], [80, 64], [80, 76], [18, 76], [18, 94], [82, 94]]],
};

// draw a stroke list into ctx with a wobbly pen; box→ (x, y, size); returns nothing
function drawStrokes(ctx, strokes, x, y, sx, sy, width, rng, wobble = 0.6) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = width;
  for (const s of strokes) {
    let pts;
    if (s[0] === 'o') pts = arcPts(s[1], s[2], s[3], s[3] * 1.05, -90, 270, 22);
    else pts = s;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const jx = rng ? (rng.f() - 0.5) * wobble : 0, jy = rng ? (rng.f() - 0.5) * wobble : 0;
      const X = x + p[0] * sx + jx, Y = y + p[1] * sy + jy;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.stroke();
  }
}
function drawHangul(ctx, text, x, y, size, width, rng, gap = 0.12) {
  let cx = x;
  for (const ch of text) { if (HANGUL[ch]) drawStrokes(ctx, HANGUL[ch], cx, y, size / 100, size / 100, width, rng, size * 0.01); cx += size * (1 + gap); }
}
