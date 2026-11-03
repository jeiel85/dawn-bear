// ───────────────────────────── robot_gl: WebGL2 cel shading, hard self-shadows, ink lines from depth/normal/material ─────────────────────────────
const MATS = [
  /* FUR    */ { base: '#dd8553', shade: '#b76d45', deep: '#6b412e', hi: '#f39e66', spec: 0, wear: 1, ink: 0 },
  /* FURL   */ { base: '#f39e66', shade: '#d4814f', deep: '#8a5236', hi: '#ffc290', spec: 0, wear: 0.5, ink: 0 },
  /* NOSE   */ { base: '#674f3f', shade: '#4a382d', deep: '#2e221b', hi: '#b89a82', spec: 1, ink: 0 },
  /* HOOD   */ { base: '#556271', shade: '#363e47', deep: '#242a31', hi: '#7d8a99', spec: 0, rust: 0.3, wear: 1, ink: 1 },
  /* CAP    */ { base: '#56626f', shade: '#3d444e', deep: '#272c33', hi: '#7f8b98', spec: 0.35, wear: 0.4, ink: 1 },
  /* GOLD   */ { base: '#b87a49', shade: '#8a5732', deep: '#5a3418', hi: '#e7af68', spec: 1, ink: 2 },
  /* METAL  */ { base: '#5f6772', shade: '#3d434c', deep: '#272b31', hi: '#a3abb5', spec: 0.6, rust: 1, wear: 1, ink: 1 },
  /* EYE    */ { base: '#3b2519', shade: '#2a1910', deep: '#160d09', hi: '#ffffff', spec: 1, ink: 3 },
  /* CREAM  */ { base: '#e3e0c8', shade: '#b9b49c', deep: '#8a8572', hi: '#fffbea', spec: 0, ink: 4 },
  /* GLASS  */ { base: '#7a6a58', shade: '#5c4e40', deep: '#2a1f18', hi: '#fff4d8', spec: 1, ink: 3 },
  /* EARIN  */ { base: '#8e5638', shade: '#6b412e', deep: '#4a2c1f', hi: '#b0704a', spec: 0, ink: 0 },
  /* PAD    */ { base: '#6b412e', shade: '#4f2f20', deep: '#352016', hi: '#8a5a40', spec: 0, ink: 0 },
  /* VINE   */ { base: '#4d6c3a', shade: '#30472a', deep: '#22331d', hi: '#7c9a52', spec: 0, ink: 5 },
  /* LEAF   */ { base: '#6f9044', shade: '#46612f', deep: '#2f4422', hi: '#b2c56a', spec: 0, ink: 5 },
  /* NOZZLE */ { base: '#2b2729', shade: '#1b1819', deep: '#0f0d0e', hi: '#585052', spec: 0, ink: 1 },
  /* MUZZLE */ { base: '#f39e66', shade: '#d4814f', deep: '#8a5236', hi: '#ffc290', spec: 0, wear: 0.5, ink: 0 },
  /* PLATE  */ { base: '#4f5a68', shade: '#333a44', deep: '#21262d', hi: '#8f9aa8', spec: 0.5, rust: 1, wear: 1, ink: 1 },
];
const INK_COLS = ['#3a1f13', '#171b28', '#4a2a12', '#140b07', '#5b5241', '#1b2614'];

const GLSL_NOISE = `
float h31(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n3(p); p=p*2.03+7.1; a*=.5; } return s/.9375; }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float aastep(float x){ float w = max(fwidth(x)*0.7, 1e-4); return smoothstep(-w, w, x); }
float aaline(float d, float w){ float fw = fwidth(d); w = max(w, fw*0.55); return 1. - smoothstep(w - fw*0.8, w + fw*0.8, abs(d)); }
`;

const VS_MAIN = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
uniform mat4 uModel, uVP; uniform mat3 uNM; uniform vec3 uScl;
out vec3 vW; out vec3 vN; out vec3 vObj; out vec3 vLoc;
void main(){ vec4 w = uModel*vec4(aPos,1.); vW=w.xyz; vN=normalize(uNM*aNor); vObj=aPos; vLoc=aPos*uScl; gl_Position=uVP*w; }`;

const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec3 vObj; in vec3 vLoc;
uniform vec3 uCamPos; uniform mat4 uView;
uniform int uMat, uDecal; uniform float uId, uSide;
uniform vec3 uBase, uShade, uDeep, uHi; uniform float uSpec, uRust, uWear, uMoss;
uniform vec3 uSunDir, uSunCol, uAmb, uSkyCol; uniform float uSunOn, uSkyFill;
uniform vec3 uRimDir, uRimCol; uniform float uRimOn;
uniform vec4 uBand; uniform float uBand2, uBandW, uBandOn;
uniform sampler2DShadow uShadow; uniform mat4 uLightVP; uniform float uShadowOn;
uniform sampler2D uCapTex;
uniform float uLid, uEyeGlow, uChestGlow, uEngine; uniform vec3 uGlowCol;
uniform vec3 uFogCol; uniform float uFog;
layout(location=0) out vec4 oCol; layout(location=1) out vec4 oNI;
${GLSL_NOISE}
float shadowAt(vec3 p, vec3 n){
  if (uShadowOn < .5) return 1.;
  vec4 lp = uLightVP*vec4(p + n*0.12, 1.); vec3 s = lp.xyz/lp.w*.5+.5;
  if (s.x<0.||s.x>1.||s.y<0.||s.y>1.||s.z>1.) return 1.;
  vec2 t = vec2(1./2048.); float b = 0.0012, k = 0.;
  k += texture(uShadow, vec3(s.xy+vec2(-.5,-.5)*t, s.z-b)); k += texture(uShadow, vec3(s.xy+vec2(.5,-.5)*t, s.z-b));
  k += texture(uShadow, vec3(s.xy+vec2(-.5,.5)*t, s.z-b)); k += texture(uShadow, vec3(s.xy+vec2(.5,.5)*t, s.z-b));
  return smoothstep(.3,.7,k*.25);
}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vW);
  vec3 base = uBase, shade = uShade, deep = uDeep, hi = uHi;
  float ink = 0.; vec3 inkCol = vec3(0.09,0.06,0.07);
  float emis = 0.; vec3 emisCol = uGlowCol;
  vec3 P = vLoc;
  // ── weathering (object space, sticks to the part) ──
  if (uRust > 0.) {
    float r = fbm3(P*0.55 + uId*3.1);
    float streak = n3(vec3(P.x*2.2, P.y*0.25, P.z*2.2) + uId);
    float m = aastep(r - 0.71 + streak*0.06) * uRust;
    base = mix(base, vec3(.58,.32,.2), m*.85); shade = mix(shade, vec3(.38,.2,.13), m*.85);
    float m2 = aastep(r - 0.78) * uRust; base = mix(base, vec3(.42,.22,.14), m2*.8); shade = mix(shade, vec3(.27,.14,.09), m2*.8);
  }
  if (uWear > 0.) {
    float c = fbm3(P*1.6 + 11. + uId);
    float chip = aastep(c - 0.72) * uWear;
    base = mix(base, base*1.12 + .04, chip*.7); shade = mix(shade, shade*1.15 + .03, chip*.6);
    float grime = aastep(fbm3(vec3(P.x*.7, P.y*.12, P.z*.7) + 4.) - 0.62) * uWear;
    base = mix(base, base*.86, grime*.6); shade = mix(shade, shade*.86, grime*.6);
  }
  if (uMoss > 0. && N.y > 0.35) {
    float m = aastep(fbm3(P*0.9 + 2.) - 0.5 - (1.-N.y)*0.35) * uMoss;
    base = mix(base, vec3(.44,.52,.26), m); shade = mix(shade, vec3(.27,.35,.18), m); deep = mix(deep, vec3(.17,.23,.12), m);
  }
  // ── decals ──
  vec3 o = vObj;
  if (uDecal == 1) { // head panel seams + rivets
    float side = abs(o.x) > .62 && o.y < .55 && o.y > -.75 ? 1. : 0.;
    ink = max(ink, aaline(o.z - 0.08 + o.y*0.12, 0.012) * side);
    ink = max(ink, aaline(o.y + 0.08, 0.01) * (o.z < -0.25 ? 1. : 0.));
    vec2 rv = vec2(o.y*14., 0.); float riv = side * aaline(o.z - 0.17 + o.y*0.12, 0.02) * aastep(0.25 - length(vec2(fract(o.y*7.)-.5, 0.)));
    ink = max(ink, riv*.7);
  } else if (uDecal == 2) { // mouth: line from the nose, then a gentle smile
    if (o.z > 0.3) {
      float vline = aaline(o.x, 0.028) * step(-0.38, o.y) * step(o.y, 0.32);
      float sm = o.y - (-0.38 + 0.36*pow(abs(o.x)/0.6, 2.0));
      float smile = aaline(sm, 0.03) * step(abs(o.x), 0.62);
      ink = max(ink, max(vline, smile));
    }
  } else if (uDecal == 3) { // eye: lid, iris glow, highlight
    float lidY = 1.0 - 2.0*uLid;
    if (o.y > lidY) { base = vec3(.867,.522,.325); shade = vec3(.718,.427,.271); deep = vec3(.42,.255,.18); hi = base; emis = 0.; }
    else {
      float rr = length(o.xy*vec2(1.,.85));
      float iris = aastep(0.62 - rr);
      vec3 ic = mix(vec3(.18,.11,.07), uGlowCol, uEyeGlow);
      base = mix(base, ic, iris*(.4+.6*uEyeGlow)); shade = mix(shade, ic*.8, iris*(.4+.6*uEyeGlow));
      emis = uEyeGlow * (0.55 + 0.45*aastep(0.42 - rr));
      float hl = aastep(0.2 - length(o.xy - vec2(-0.28*uSide, 0.36))) + aastep(0.1 - length(o.xy - vec2(0.25*uSide, -0.3)));
      base = mix(base, vec3(1.), hl*.92); shade = mix(shade, vec3(.95), hl*.92); emis = max(emis, hl*.6);
    }
    ink = max(ink, aaline(o.y - lidY, 0.07) * step(abs(o.x), .98));
  } else if (uDecal == 4) { // cheek plate rivets
    ink = max(ink, aastep(0.12 - length(vec2(o.x - .55, o.y + .2))) + aastep(0.12 - length(vec2(o.x + .1, o.y - .55))))*.8;
  } else if (uDecal == 5) { // cap crown: panel seams, eyelets, flat-printed emblem
    float ph = atan(o.x, o.z);
    float seam = 0.;
    for (int i=0;i<6;i++){ float a = -2.618 + float(i)*1.0472; seam = max(seam, aaline(sin(ph - a)*length(o.xz), 0.012)); }
    ink = max(ink, seam*.55 * step(0.06, o.y));
    ink = max(ink, aaline(o.y - 0.09, 0.008)*.45); // stitch row above the rim
    vec2 tuv = vec2(ph/0.95*0.5+0.5, 1.0 - (o.y - 0.12)/0.62);
    if (o.z > 0. && tuv.x>0. && tuv.x<1. && tuv.y>0. && tuv.y<1.) {
      float a = texture(uCapTex, tuv).a;
      float worn = aastep(fbm3(o*14.) - 0.78);
      a *= 1. - worn*.8;
      base = mix(base, vec3(.953,.945,.918), a); shade = mix(shade, vec3(.953,.945,.918)*.78, a); deep = mix(deep, vec3(.6), a);
    }
  } else if (uDecal == 6) { // brim: stitching lines following the edge
    float r = length(o.xz*vec2(1./6.15, 1./6.25));
    ink = max(ink, aaline(fract(r*7.)-.5, .03) * step(1.05, r) * step(o.y, 0.2) * 0.35);
  } else if (uDecal == 7) { // hoodie torso: kangaroo pocket + side seams
    if (o.z > 0.4) {
      float top = aaline(o.y + 0.2, 0.012) * step(abs(o.x), 0.38);
      float sideL = aaline((o.x - (0.38 + (-0.2 - o.y)*0.55)), 0.012) * step(o.y, -0.2) * step(-0.72, o.y);
      float sideR = aaline((o.x + (0.38 + (-0.2 - o.y)*0.55)), 0.012) * step(o.y, -0.2) * step(-0.72, o.y);
      ink = max(ink, max(top, max(sideL, sideR)));
    }
    ink = max(ink, aaline(abs(o.x) - 0.96, 0.01) * 0.6);
  }
  // ── cel lighting ──
  float ndl = dot(N, uSunDir);
  float band = 1.;
  if (uBandOn > .5) { float d = dot(vW, uBand.xyz); band = smoothstep(uBand.w - uBandW, uBand.w + uBandW, d) * (1. - smoothstep(uBand2 - uBandW, uBand2 + uBandW, d)); }
  float lit = aastep(ndl - 0.04) * shadowAt(vW, N) * band * uSunOn;
  vec3 litC = base * mix(vec3(1.), uSunCol, .32);
  vec3 shC = shade * uAmb;
  float sky = aastep(N.y - 0.42) * uSkyFill;
  shC = mix(shC, mix(shade, base, .42) * mix(uAmb, uSkyCol, .3), sky);
  float dp = aastep(-N.y - 0.55) * (1. - lit);
  shC = mix(shC, deep * uAmb, dp*.75);
  vec3 col = mix(shC, litC, lit);
  if (uSpec > 0.) {
    float s = max(dot(reflect(-uSunDir, N), V), 0.);
    col = mix(col, hi, aastep(s - 0.93) * uSpec * max(lit, .35*uSunOn));
    col = mix(col, hi, aastep(dot(N, normalize(vec3(-.3,.8,.5))) - .93) * uSpec * .5 * (1.-uSunOn));
  }
  float rim = aastep((1. - max(dot(N, V), 0.)) - 0.6) * aastep(dot(N, uRimDir) - 0.05) * uRimOn;
  col = mix(col, uRimCol * mix(base, vec3(1.), .35) * 1.35, rim*.85);
  if (uMat == 9) { emis = uChestGlow; emisCol = uGlowCol; float rr = length(o.xy); col = mix(col, vec3(1.,.97,.85), uChestGlow*aastep(.45-rr)); }
  if (uMat == 14) { emis = uEngine*.9; emisCol = vec3(1.,.82,.5); }
  col = mix(col, emisCol, clamp(emis,0.,1.));
  col = mix(col, inkCol, clamp(ink,0.,1.)*.88);
  col = mix(col, uFogCol, uFog);
  oCol = vec4(col, 1.);
  vec3 vn = normalize(mat3(uView)*N);
  oNI = vec4(vn.xy*.5+.5, uId/255., float(uMat)/31.);
}`;

const VS_SHADOW = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uModel, uLightVP;
void main(){ gl_Position = uLightVP*uModel*vec4(aPos,1.); }`;
const FS_SHADOW = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.); }`;

// glass lenses: tint + diagonal anime glints, blended onto colour only
const FS_LENS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec3 vObj; in vec3 vLoc;
uniform float uSunOn, uGlint, uSide; uniform vec3 uFogCol; uniform float uFog;
${GLSL_NOISE}
out vec4 oCol;
void main(){
  vec2 p = vObj.xy;
  float r = length(p);
  float a = 0.1;
  float d = (p.x*uSide*0.8 + p.y);
  float g1 = aastep(0.16 - abs(d - 0.32)) * aastep(0.9 - r);
  float g2 = aastep(0.06 - abs(d - 0.66)) * aastep(0.9 - r);
  float g = max(g1, g2*.9) * uGlint;
  vec3 c = mix(vec3(.82,.9,1.), vec3(1.), g);
  a = mix(a, .78, g);
  c = mix(c, uFogCol, uFog);
  oCol = vec4(c*a, a);
}`;

const VS_QUAD = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
out vec2 vUv; void main(){ vec2 p = P[gl_VertexID]; vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

// pass A: binary edges (silhouette / depth / material / crease)
const FS_EDGE = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uCol, uNI, uDepth; uniform vec2 uTexel; uniform float uNear, uFar, uDepthTh, uNormTh;
out vec4 o;
float linZ(vec2 uv){ float d = texture(uDepth, uv).r; if (d >= 1.) return 1e7; float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
vec3 dec(vec4 ni){ vec2 xy = ni.xy*2.-1.; return vec3(xy, sqrt(max(0., 1.-dot(xy,xy)))); }
void main(){
  float a0 = texture(uCol, vUv).a; vec4 ni0 = texture(uNI, vUv); float z0 = linZ(vUv);
  float e = 0., sil = 0., mat = ni0.a;
  vec2 offs[4] = vec2[4](vec2(1,0), vec2(-1,0), vec2(0,1), vec2(0,-1));
  for (int i=0;i<4;i++){
    vec2 uv = vUv + offs[i]*uTexel;
    float a1 = texture(uCol, uv).a; vec4 ni1 = texture(uNI, uv);
    bool b0 = a0 < .5, b1 = a1 < .5;
    if (b0 && b1) continue;
    if (b0 != b1) { e = 1.; sil = 1.; if (b0) mat = ni1.a; continue; }
    float z1 = linZ(uv);
    float dz = (z1 - z0) / min(z0, z1);
    if (dz > uDepthTh) { e = 1.; sil = max(sil, .75); }
    if (abs(ni0.b - ni1.b) > .5/255. && z0 <= z1 * 1.002) { e = max(e, 1.); sil = max(sil, .35); }
    if (dot(dec(ni0), dec(ni1)) < uNormTh && abs(dz) < uDepthTh) e = max(e, .7);
  }
  o = vec4(e, sil, mat, 1.);
}`;

// pass B: variable-width, wobbling hand-inked lines + ground shadow catcher, premultiplied output
const FS_INK = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec2 vUv;
uniform sampler2D uCol, uEdge; uniform vec2 uTexel; uniform float uW, uBoil, uInkFog;
uniform vec3 uInk[6]; uniform vec3 uFogCol;
uniform float uGroundOn, uGroundY, uGroundA, uAOA; uniform vec3 uGroundCol; uniform mat4 uInvVP; uniform vec3 uCamPos;
uniform sampler2DShadow uShadow; uniform mat4 uLightVP; uniform vec4 uAO;
out vec4 o;
${GLSL_NOISE}
void main(){
  vec2 px = vUv / uTexel;
  vec2 wob = (vec2(n2(px*0.012 + uBoil*3.1), n2(px*0.012 + uBoil*3.1 + 17.)) - .5) * 1.5 * uTexel;
  float press = 0.72 + 0.56*n2(px*0.006 + uBoil*1.7 + 40.);
  float cov = 0., mat = 0.;
  for (int y=-3; y<=3; y++) for (int x=-3; x<=3; x++) {
    vec2 of = vec2(x, y); float d = length(of); if (d > 3.4) continue;
    vec4 e = texture(uEdge, vUv + wob + of*uTexel);
    if (e.r <= 0.) continue;
    float w = uW * mix(.5, 1., e.g) * press;
    float c = e.r * clamp(w + .5 - d, 0., 1.);
    if (c > cov) { cov = c; mat = e.b; }
  }
  vec4 col = texture(uCol, vUv);
  int mi = int(mat*31. + .5);
  int ic = mi==3||mi==4||mi==6||mi==14||mi==16 ? 1 : mi==5 ? 2 : mi==7||mi==9 ? 3 : mi==8 ? 4 : mi==12||mi==13 ? 5 : 0;
  vec3 ink = mix(uInk[ic], uFogCol, uInkFog);
  float a = col.a;
  vec3 rgb = col.rgb;
  if (a < .5 && uGroundOn > .5) {
    vec4 p0 = uInvVP*vec4(vUv*2.-1., -1., 1.), p1 = uInvVP*vec4(vUv*2.-1., 1., 1.);
    vec3 r0 = p0.xyz/p0.w, r1 = p1.xyz/p1.w, rd = r1 - r0;
    if (rd.y < 0.) {
      float t = (uGroundY - r0.y)/rd.y; vec3 g = r0 + rd*t;
      float sa = 0.;
      vec4 lp = uLightVP*vec4(g, 1.); vec3 s = lp.xyz/lp.w*.5+.5;
      if (s.x>0.&&s.x<1.&&s.y>0.&&s.y<1.) sa = (1. - texture(uShadow, vec3(s.xy, s.z - .002))) * uGroundA;
      float ao = (1. - smoothstep(.55, 1., length((g.xz - uAO.xy)/uAO.zw))) * uAOA;
      float sh = max(sa, ao);
      rgb = uGroundCol; a = sh;
    }
  }
  vec3 outc = mix(rgb, ink, cov);
  float oa = cov + a*(1. - cov);
  o = vec4(outc*oa, oa);
}`;

class RobotRenderer {
  constructor(model) {
    this.canvas = newCanvas(W, H);
    const gl = this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true, depth: true });
    if (!gl) throw new Error('WebGL2 is required');
    this.model = model;
    this.prog = {
      main: this.program(VS_MAIN, FS_MAIN), shadow: this.program(VS_SHADOW, FS_SHADOW), lens: this.program(VS_MAIN, FS_LENS),
      edge: this.program(VS_QUAD, FS_EDGE), ink: this.program(VS_QUAD, FS_INK),
    };
    this.vaos = {};
    for (const [k, m] of Object.entries(model.meshes)) this.vaos[k] = this.upload(m);
    this.emptyVao = gl.createVertexArray();
    // shadow map
    this.shadowTex = this.depthTex(2048, 2048, true);
    this.shadowFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    // g-buffer
    this.colTex = this.colorTex(W, H); this.niTex = this.colorTex(W, H); this.depth = this.depthTex(W, H, false);
    this.gFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.niTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depth, 0);
    this.edgeTex = this.colorTex(W, H);
    this.edgeFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgeFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.edgeTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // cap emblem texture
    const cap = newCanvas(512, 256), cx = cap.getContext('2d');
    cx.fillStyle = '#fff'; cx.strokeStyle = '#fff';
    drawDawnEmblem(cx, 256, 132, 190, makeRng(5));
    this.capTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.capTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cap);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.matCols = MATS.map((m) => ({ base: hex(m.base).map((x) => x / 255), shade: hex(m.shade).map((x) => x / 255), deep: hex(m.deep).map((x) => x / 255), hi: hex(m.hi).map((x) => x / 255) }));
    this.inkCols = INK_COLS.map((c) => hex(c).map((x) => x / 255)).flat();
  }
  program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    p.loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i), name = u.name.replace(/\[0\]$/, ''); p.loc[name] = gl.getUniformLocation(p, u.name); }
    return p;
  }
  upload(m) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, m.nor, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: m.idx.length };
  }
  colorTex(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  depthTex(w, h, compare) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    const f = compare ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (compare) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); }
    return t;
  }

  // world matrices of every part for a solved pose
  partMatrices(bones, rootXf) {
    return this.model.parts.map((p) => {
      let m = m4.mul(bones[p.bone], p.xf);
      if (rootXf) m = m4.mul(rootXf, m);
      return m;
    });
  }
  // screen-space bounds of the robot from projected part extremities (8 corners of every part's unit box)
  bounds(mats, cam, parts = this.model.parts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zmin = 1e9;
    parts.forEach((p, i) => {
      const pos = this.model.meshes[p.mesh].pos, stride = 3 * Math.max(1, Math.floor(pos.length / 3 / 400));
      for (let k = 0; k < pos.length; k += stride) {
        const s = cam.project(m4.xfPoint(mats[i], [pos[k], pos[k + 1], pos[k + 2]]));
        if (s[2] <= 0) continue;
        x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); zmin = Math.min(zmin, s[2]);
      }
    });
    return { x0, y0, x1, y1, zmin };
  }

  render(st) {
    const gl = this.gl, parts = this.model.parts, mats = st.mats;
    const cam = st.cam, L = st.light;
    // light frustum fitted around the robot
    const c = st.center, R = st.radius;
    const lpos = v3.add(c, v3.mul(L.sunDir, R * 2.5));
    const lview = m4.lookAt(lpos, c, Math.abs(L.sunDir[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]);
    const lproj = m4.ortho(-R, R, -R, R, R * 0.5, R * 5);
    const lightVP = m4.mul(lproj, lview);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    // shadow pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.viewport(0, 0, 2048, 2048); gl.clear(gl.DEPTH_BUFFER_BIT);
    let p = this.prog.shadow; gl.useProgram(p);
    gl.uniformMatrix4fv(p.loc.uLightVP, false, lightVP);
    parts.forEach((part, i) => { if (st.hide?.(part)) return; gl.uniformMatrix4fv(p.loc.uModel, false, mats[i]); this.draw(part.mesh); });
    // main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gFB);
    gl.viewport(0, 0, W, H);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    p = this.prog.main; gl.useProgram(p);
    const U = p.loc;
    gl.uniformMatrix4fv(U.uVP, false, cam.vp); gl.uniformMatrix4fv(U.uView, false, cam.view); gl.uniform3fv(U.uCamPos, cam.pos);
    gl.uniform3fv(U.uSunDir, L.sunDir); gl.uniform3fv(U.uSunCol, L.sunCol); gl.uniform1f(U.uSunOn, L.sunOn);
    gl.uniform3fv(U.uAmb, L.amb); gl.uniform3fv(U.uSkyCol, L.skyCol); gl.uniform1f(U.uSkyFill, L.skyFill);
    gl.uniform3fv(U.uRimDir, L.rimDir); gl.uniform3fv(U.uRimCol, L.rimCol); gl.uniform1f(U.uRimOn, L.rimOn);
    const band = L.band || { n: [1, 0, 0], d0: -1e5, d1: 1e5, w: 1, on: 0 };
    gl.uniform4fv(U.uBand, [...band.n, band.d0]); gl.uniform1f(U.uBand2, band.d1); gl.uniform1f(U.uBandW, band.w); gl.uniform1f(U.uBandOn, band.on);
    gl.uniformMatrix4fv(U.uLightVP, false, lightVP); gl.uniform1f(U.uShadowOn, L.sunOn > 0 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(U.uShadow, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.capTex); gl.uniform1i(U.uCapTex, 1);
    gl.uniform1f(U.uLid, st.lid ?? 0); gl.uniform1f(U.uEyeGlow, st.eyeGlow ?? 0); gl.uniform1f(U.uChestGlow, st.chestGlow ?? 0); gl.uniform1f(U.uEngine, st.engine ?? 0);
    gl.uniform3fv(U.uGlowCol, st.glowCol || [1, 0.8, 0.45]);
    gl.uniform3fv(U.uFogCol, st.fogCol || [0, 0, 0]); gl.uniform1f(U.uFog, st.fog || 0);
    const lensParts = [];
    parts.forEach((part, i) => {
      if (st.hide?.(part)) return;
      const mc = this.matCols[part.mat], md = MATS[part.mat];
      gl.uniformMatrix4fv(U.uModel, false, mats[i]); gl.uniformMatrix3fv(U.uNM, false, m4.normalMat(mats[i]));
      gl.uniform3fv(U.uScl, part.scl);
      gl.uniform1i(U.uMat, part.mat); gl.uniform1i(U.uDecal, part.decal || 0); gl.uniform1f(U.uId, part.id); gl.uniform1f(U.uSide, part.eye || 1);
      gl.uniform3fv(U.uBase, mc.base); gl.uniform3fv(U.uShade, mc.shade); gl.uniform3fv(U.uDeep, mc.deep); gl.uniform3fv(U.uHi, mc.hi);
      gl.uniform1f(U.uSpec, md.spec || 0); gl.uniform1f(U.uRust, (md.rust || 0) * (st.rust ?? 1)); gl.uniform1f(U.uWear, (md.wear || 0) * (st.wear ?? 1)); gl.uniform1f(U.uMoss, part.moss ? (st.moss ?? 1) : 0);
      this.draw(part.mesh);
      if (part.glasses && part.mesh === 'ring') lensParts.push(i);
    });
    // lenses (blended over colour only, depth-tested, no depth write)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.depthMask(false);
    p = this.prog.lens; gl.useProgram(p);
    gl.uniformMatrix4fv(p.loc.uVP, false, cam.vp);
    gl.uniform1f(p.loc.uSunOn, L.sunOn); gl.uniform1f(p.loc.uGlint, st.glint ?? 1);
    gl.uniform3fv(p.loc.uFogCol, st.fogCol || [0, 0, 0]); gl.uniform1f(p.loc.uFog, st.fog || 0);
    for (const i of lensParts) {
      const part = parts[i];
      const lm = m4.mul(mats[i], m4.mul(m4.rx(-90 * DEG), m4.scale(1.62, 1.62, 1)));
      gl.uniformMatrix4fv(p.loc.uModel, false, lm); gl.uniformMatrix3fv(p.loc.uNM, false, m4.normalMat(lm)); gl.uniform3fv(p.loc.uScl, [1, 1, 1]);
      gl.uniform1f(p.loc.uSide, part.side || 1);
      this.draw('disc');
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    // pass A: edges
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgeFB);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    p = this.prog.edge; gl.useProgram(p);
    this.bindTex(p, 'uCol', this.colTex, 0); this.bindTex(p, 'uNI', this.niTex, 1); this.bindTex(p, 'uDepth', this.depth, 2);
    gl.uniform2f(p.loc.uTexel, 1 / W, 1 / H); gl.uniform1f(p.loc.uNear, cam.near); gl.uniform1f(p.loc.uFar, cam.far);
    gl.uniform1f(p.loc.uDepthTh, st.depthTh ?? 0.035); gl.uniform1f(p.loc.uNormTh, st.normTh ?? 0.45);
    gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // pass B: ink to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    p = this.prog.ink; gl.useProgram(p);
    this.bindTex(p, 'uCol', this.colTex, 0); this.bindTex(p, 'uEdge', this.edgeTex, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(p.loc.uShadow, 2);
    gl.uniform2f(p.loc.uTexel, 1 / W, 1 / H); gl.uniform1f(p.loc.uW, st.lineW ?? 1.6); gl.uniform1f(p.loc.uBoil, st.boil ?? 0);
    gl.uniform3fv(p.loc.uInk, this.inkCols); gl.uniform3fv(p.loc.uFogCol, st.fogCol || [0, 0, 0]); gl.uniform1f(p.loc.uInkFog, st.inkFog ?? (st.fog || 0));
    const G = st.ground || {};
    gl.uniform1f(p.loc.uGroundOn, G.on ? 1 : 0); gl.uniform1f(p.loc.uGroundY, G.y ?? 0); gl.uniform1f(p.loc.uGroundA, (G.a ?? 0.4) * (L.sunOn > 0 ? 1 : 0));
    gl.uniform1f(p.loc.uAOA, G.ao ?? 0.3); gl.uniform4fv(p.loc.uAO, G.aoRect || [0, 0, 8, 6]);
    gl.uniform3fv(p.loc.uGroundCol, G.col || [0.2, 0.18, 0.3]);
    gl.uniformMatrix4fv(p.loc.uInvVP, false, m4.invert(cam.vp)); gl.uniformMatrix4fv(p.loc.uLightVP, false, lightVP);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
  bindTex(p, name, tex, unit) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(p.loc[name], unit); }
  draw(meshKey) { const gl = this.gl, v = this.vaos[meshKey]; gl.bindVertexArray(v.vao); gl.drawElements(gl.TRIANGLES, v.count, gl.UNSIGNED_INT, 0); }
}
