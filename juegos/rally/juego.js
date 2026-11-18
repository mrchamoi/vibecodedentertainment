/* ============================================================
   DRIFTING — RALLY '97 — juego para la consola VIBECODED (disco 02)
   Rally arcade en 3D (three.js) a 320×240 con estética de PSX (consola/psx.js, el mismo código que el T-55).
   Diseño: juegos/rally/DISENO.md.   Lógica en el plano (x, z) del mundo; la altura sale de la pista.
   Teclado: W/↑ acelerar · S/↓ frenar y marcha atrás · A D/← → girar · Espacio freno de mano · C cámara · Esc pausa.
   Mando: R2 (o A) acelerar · L2 (o X) frenar · stick o cruceta girar · B o R1 freno de mano · Y cámara · Start pausa.
   Todo va dentro de un bloque { } para no chocar con los nombres del T-55 (ver JUEGOS.md).
   ============================================================ */
'use strict';
{
/* ---------- constantes de conducción (metros, segundos) ---------- */
const G = 9.8, G_AIR = 14, STEP = 1 / 120;
const VMAX = 54, ACC = 10.5, BRAKE = 13, REV = 6, VREV = 9, HB_DEC = 3.5, ROLL = 0.22, DRAG = 0.0011;
const WB = 2.5, GRIP_K = 1.3, YAW_K = 1.55, YAW_RESP = 9;
const GEARS = [12, 20, 28, 36, 45, 56];                 // velocidad máxima de cada marcha (m/s)
const LAPS = 2, LAPS_TT = 3, POINTS = [10, 8, 6, 5, 4, 3];
const KMH = 3.6;

/* ---------- los tramos ----------
   pts: puntos de control de una curva cerrada (Catmull-Rom centrípeta), en metros. w: ancho de la pista.
   mu: agarre de la superficie. ref: velocidad media de referencia (m/s) con la que se reparte el tiempo de los controles.
   hA: amplitud de las colinas. saltos: cuántas crestas para saltar. sc: escala del trazado. */
const STAGES = [
  { nombre: 'LA ARCILLA', sub: 'TIERRA SECA', tema: 'arcilla', w: 10, mu: 0.95, ref: 26.5, hA: 7, saltos: 3, seed: 3, sc: 1.25,
    pts: [[0,0],[150,0],[290,0],[340,15],[355,60],[352,150],[368,200],[410,214],[470,214],[505,235],[508,275],[480,296],[400,300],[330,300],[290,320],[280,370],[310,420],[300,470],[250,500],[170,500],[120,470],[60,480],[0,520],[-60,520],[-90,480],[-80,420],[-120,380],[-170,360],[-190,300],[-160,250],[-110,230],[-100,180],[-140,140],[-150,90],[-120,40],[-60,8]] },
  { nombre: 'EL PINAR', sub: 'GRAVA Y BARRO', tema: 'pinar', w: 8.5, mu: 0.86, ref: 20, hA: 10, saltos: 3, seed: 7, sc: 1.1,
    pts: [[0,0],[110,0],[170,20],[185,70],[160,110],[110,120],[85,155],[100,200],[150,215],[210,200],[255,215],[270,260],[245,300],[190,310],[170,345],[200,390],[250,400],[290,430],[285,480],[240,500],[180,490],[130,460],[80,470],[40,510],[-10,520],[-50,490],[-50,440],[-20,400],[-40,350],[-100,340],[-150,370],[-200,350],[-210,300],[-170,265],[-170,215],[-220,180],[-230,120],[-190,80],[-130,70],[-100,30],[-60,5]] },
  { nombre: 'LA CUMBRE', sub: 'NIEVE', tema: 'nieve', w: 11, mu: 0.64, ref: 26.5, hA: 12, saltos: 3, seed: 11, sc: 1.2,
    pts: [[0,0],[220,0],[380,20],[470,80],[490,170],[440,240],[350,250],[300,290],[310,360],[380,400],[430,460],[410,530],[330,560],[200,560],[120,520],[100,450],[40,400],[-40,420],[-110,470],[-180,450],[-200,380],[-150,320],[-170,250],[-240,210],[-260,140],[-210,70],[-120,20]] }
];
// Pilotos rivales (ficticios). col: carrocería, col2: franjas.
const RIVALS = [
  { name: 'J. ARRIETA',  col: 0x1f4fb4, col2: 0xf0c020, col3: 0xf0f0f0, sk: 0.97, body: 'sedan', liv: 'band',  num: 1, pod: true },
  { name: 'T. VIRTA',    col: 0xe8e8e0, col2: 0x2050c0, col3: 0xd02020, sk: 0.95, body: 'hatch', liv: 'split', num: 3 },
  { name: 'C. DUVAL',    col: 0xc82828, col2: 0xf0f0f0, col3: 0x202020, sk: 0.93, body: 'sedan', liv: 'band',  num: 4 },
  { name: 'H. KOVAC',    col: 0x202024, col2: 0xf08020, col3: 0xf0f0f0, sk: 0.91, body: 'hatch', liv: 'split', num: 6, pod: true },
  { name: 'M. BRANDT',   col: 0x2a8a3a, col2: 0xf0f0f0, col3: 0xf0c020, sk: 0.89, body: 'sedan', liv: 'band',  num: 8 }
];

/* ---------- estado ---------- */
let state0 = 'menu';                                   // estado propio mientras el disco está puesto (la consola usa `state`)
let TR = null, R = null, PL = null, camMode = 0, msg = '', msgT = 0, msg2 = '', shake = 0;
const K = {};                                          // teclas pulsadas
const pad = { on: false, prev: [], vv: 0, hh: 0 };
let best = {}; try { best = JSON.parse(localStorage.getItem('derrapeBest') || '{}') || {}; } catch (e){ best = {}; }
const saveBest = () => { try { localStorage.setItem('derrapeBest', JSON.stringify(best)); } catch (e){} };
let rng = 1;                                           // aleatorio con semilla: cada tramo sale siempre igual
const srnd = (a = 0, b = 1) => { rng = (rng * 16807) % 2147483647; return a + (rng - 1) / 2147483646 * (b - a); };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* ============================================================
   LA PISTA: curva, alturas, saltos, notas del copiloto
   ============================================================ */
function sampleLoop(pts, step){
  const n = pts.length, raw = [];
  for (let i = 0; i < n; i++){
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
    const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < 40; k++){
      const t = t1 + (t2 - t1) * k / 40;
      const L = (a, b, ta, tb) => [a[0] * (tb - t) / (tb - ta) + b[0] * (t - ta) / (tb - ta), a[1] * (tb - t) / (tb - ta) + b[1] * (t - ta) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      raw.push(L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2));
    }
  }
  const cum = [0];
  for (let i = 1; i <= raw.length; i++){ const a = raw[i - 1], b = raw[i % raw.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = cum[raw.length], N = Math.round(len / step), out = [];
  let j = 0;
  for (let i = 0; i < N; i++){
    const s = i * len / N; while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]), a = raw[j], b = raw[(j + 1) % raw.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
// Colinas del terreno (sin la pista).
function hillsH(st, x, z){
  const s = st.seed;
  return st.hA * (0.6 * Math.sin(x * 0.0081 + z * 0.0023 + s) + 0.5 * Math.sin(z * 0.0097 - x * 0.0031 + s * 1.7)
       + 0.25 * Math.sin((x + z) * 0.021 + s * 0.3) + 0.12 * Math.sin(x * 0.047 + s) * Math.sin(z * 0.043));
}
function buildTrack(st){
  rng = st.seed * 7919 + 1;
  const P = sampleLoop(st.pts.map(([x, z]) => [x * st.sc, z * st.sc]), 2), N = P.length, L = N * 2;
  const T = { st, N, L, ds: 2, hw: st.w / 2, px: new Float32Array(N), pz: new Float32Array(N), py: new Float32Array(N),
              tx: new Float32Array(N), tz: new Float32Array(N), k: new Float32Array(N), ks: new Float32Array(N), line: new Float32Array(N), jump: new Float32Array(N) };
  T.wall = T.hw + 5.5;
  for (let i = 0; i < N; i++){ T.px[i] = P[i][0]; T.pz[i] = P[i][1]; }
  const W = i => (i % N + N) % N;
  for (let i = 0; i < N; i++){
    const a = W(i - 1), b = W(i + 1), dx = T.px[b] - T.px[a], dz = T.pz[b] - T.pz[a], l = Math.hypot(dx, dz);
    T.tx[i] = dx / l; T.tz[i] = dz / l;
  }
  for (let i = 0; i < N; i++){                                  // curvatura con signo (+ = a la derecha)
    const a = W(i - 3), b = W(i + 3);
    T.k[i] = angDiff(Math.atan2(T.tz[b], T.tx[b]), Math.atan2(T.tz[a], T.tx[a])) / 12;
  }
  const box = (src, r) => { const o = new Float32Array(N); let acc = 0; for (let j = -r; j <= r; j++) acc += src[W(j)];
    for (let i = 0; i < N; i++){ o[i] = acc / (2 * r + 1); acc += src[W(i + r + 1)] - src[W(i - r)]; } return o; };
  T.ks = box(box(T.k, 4), 4);
  // alturas: las colinas bajo la pista, muy suavizadas (sin baches bruscos)
  let h = new Float32Array(N); for (let i = 0; i < N; i++) h[i] = hillsH(st, T.px[i], T.pz[i]);
  h = box(box(box(h, 22), 22), 22);
  // saltos: crestas en tramos rectos (subida larga y caída corta, para volar)
  // (los tramos más rectos de la pista, separados entre sí y lejos de la salida)
  const straight = [];
  for (let i = 80; i < N - 30; i++){ let m = 0; for (let j = -22; j <= 14; j++) m = Math.max(m, Math.abs(T.ks[W(i + j)])); straight.push([m, i]); }
  straight.sort((a, b) => a[0] - b[0]);
  const spots = [];
  const curvy = {};
  for (const [m, i] of straight){ if (spots.length >= st.saltos) break; if (spots.every(s => Math.abs(s - i) > 170)){ spots.push(i); curvy[i] = m > 1 / 180; } }
  spots.sort((a, b) => a - b);
  T.jumps = spots;
  for (const c of spots){
    const A = curvy[c] ? 1.5 : st.tema === 'nieve' ? 2.0 : 2.6;          // en curva, cresta más baja: se aterriza a tiempo de girar
    for (let j = -20; j <= 6; j++){
      const ds = j * 2, f = ds < 0 ? smooth(-40, 0, ds) : 1 - smooth(0, 11, ds);
      h[W(c + j)] += A * f; T.jump[W(c + j)] = ds < 0 ? 1 : 2;
    }
  }
  T.py = h;
  // trazada de la IA: hacia el interior de las curvas, adelantada para llegar ya colocada
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++){ const k = T.ks[W(i + 8)]; raw[i] = Math.sign(k) * Math.min(T.hw * 0.62, Math.abs(k) * 260); }   // + = derecha = interior de una curva a la derecha
  T.line = box(box(raw, 10), 10);
  // notas del copiloto: cada curva con su lado y su dureza (6 = rápida … 1 = horquilla), y los saltos
  T.notes = [];
  let i = 0;
  while (i < N){
    if (Math.abs(T.ks[i]) > 1 / 170){
      const dir = Math.sign(T.ks[i]); let j = i, kmax = 0;
      while (j < N + i && Math.sign(T.ks[W(j)]) === dir && Math.abs(T.ks[W(j)]) > 1 / 240){ kmax = Math.max(kmax, Math.abs(T.ks[W(j)])); j++; }
      const R = 1 / kmax, g = R > 150 ? 6 : R > 105 ? 5 : R > 75 ? 4 : R > 55 ? 3 : R > 40 ? 2 : 1;
      if (j - i > 6) T.notes.push({ i, e: j, dir, g, R });
      i = j + 1;
    } else i++;
  }
  for (const c of spots) T.notes.push({ i: W(c - 6), e: W(c + 4), jump: true });
  T.notes.sort((a, b) => a.i - b.i);
  // controles de paso: tres por vuelta (el último es la meta)
  T.cps = [Math.round(N / 3), Math.round(2 * N / 3), N];
  // rejilla gruesa para buscar el punto de pista más cercano
  T.coarse = []; for (let i = 0; i < N; i += 6) T.coarse.push(i);
  return T;
}
// Punto de pista más cercano a (x, z), buscando cerca de la última posición conocida (o en toda la pista si no hay).
function locate(T, x, z, hint){
  let bi = 0, bd = 1e12;
  if (hint == null){ for (const i of T.coarse){ const d = (T.px[i] - x) ** 2 + (T.pz[i] - z) ** 2; if (d < bd){ bd = d; bi = i; } } hint = bi; }
  bd = 1e12;
  for (let j = -14; j <= 14; j++){
    const i = ((hint + j) % T.N + T.N) % T.N, d = (T.px[i] - x) ** 2 + (T.pz[i] - z) ** 2;
    if (d < bd){ bd = d; bi = i; }
  }
  // proyección sobre el segmento: distancia a lo largo (t) y lateral (d, + a la derecha)
  const i = bi, dx = x - T.px[i], dz = z - T.pz[i];
  const t = dx * T.tx[i] + dz * T.tz[i];
  const j = t >= 0 ? (i + 1) % T.N : (i - 1 + T.N) % T.N, f = clamp(Math.abs(t) / T.ds, 0, 1);
  const y = T.py[i] + (T.py[j] - T.py[i]) * f;
  return { i, s: i * T.ds + t, d: -dx * T.tz[i] + dz * T.tx[i], y };
}

/* ============================================================
   ESCENA 3D
   ============================================================ */
let renderer = null, post = null;
try { renderer = PSX.renderer(); post = PSX.pantalla(320, 240); } catch (e){ console.error(e); }
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(62, 4 / 3, 0.4, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x404030, 0.75), sun = new THREE.DirectionalLight(0xffffff, 0.75);
sun.position.set(-0.5, 1, -0.35); scene.add(hemi, sun);
scene.fog = new THREE.Fog(0xcccccc, 120, 500);
const world = new THREE.Group(), dyn = new THREE.Group(); scene.add(world, dyn);
const mat = (o) => PSX.material(new THREE.MeshLambertMaterial(o));

// Junta muchas piezas estáticas en una sola malla (una llamada de dibujo por material).
class Merge {
  constructor(){ this.p = []; this.n = []; this.u = []; this.c = []; }
  add(geo, m4, col = 0xffffff){
    const g2 = geo.index ? (geo._ni || (geo._ni = geo.toNonIndexed())) : geo, P = g2.attributes.position, N = g2.attributes.normal, U = g2.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(m4), v = new THREE.Vector3(), c = new THREE.Color(col);
    for (let i = 0; i < P.count; i++){
      v.fromBufferAttribute(P, i).applyMatrix4(m4); this.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
      if (U) this.u.push(U.getX(i), U.getY(i)); else this.u.push(0, 0);
      this.c.push(c.r, c.g, c.b);
    }
    return this;
  }
  mesh(m){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return new THREE.Mesh(g, m);
  }
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), EU = new THREE.Euler();
const place = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => M4.compose(V1.set(x, y, z), Q.setFromEuler(EU.set(rx, ry, rz)), V2.set(sx, sy, sz));

// Temas de cada tramo: cielo, niebla, luz y colores.
const THEMES = {
  arcilla: { sky: [0x3d78c8, 0xe8d6a8], fog: 0xdcc8a0, fogN: 150, fogF: 560, sun: 0xfff0d0, amb: [0xfff4e0, 0x6a5038],
             ground: [0x9a8a4a, 0x8a7a3c, 0xa89858, 0x7c7038], road: 0xb86a3c, verge: 0x9c8040 },
  pinar:   { sky: [0x6c7c88, 0xb8c0b8], fog: 0x9aa49c, fogN: 90, fogF: 380, sun: 0xd8e0d0, amb: [0xdce4dc, 0x303828],
             ground: [0x3c5a2c, 0x34502a, 0x48663a, 0x2c4424], road: 0x7a6a58, verge: 0x4a5a30 },
  nieve:   { sky: [0x7c98c8, 0xe0e8f0], fog: 0xd4dce8, fogN: 110, fogF: 440, sun: 0xffffff, amb: [0xf0f4ff, 0x60687c],
             ground: [0xe8ecf4, 0xdce2ec, 0xf4f6fa, 0xd0d8e4], road: 0xc8d0dc, verge: 0xe0e6f0 }
};

/* ---------- texturas ----------
   Pequeñas, sin filtrar y pintadas a mano con ruido (PSX.textura). Las de cada tramo se pintan al cargarlo y con
   semilla, así el mismo tramo sale siempre igual. */
const TEX = {};
const px = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const dots = (c, n, cols, count, w = 1, h = 1) => { for (let i = 0; i < count; i++) px(c, cols[i % cols.length], srnd(0, n) | 0, srnd(0, n) | 0, w, h); };
const poly = (c, col, pts) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
const PAL = {
  arcilla: { road: '#b06438', grit: ['#c47a48', '#9e5632', '#c88a58', '#a45c34', '#bc7040'], rut: '#7c4024', stone: ['#e2cba4', '#d0ae86', '#8a6448'],
             edge: '#c69a62', tuft: ['#9a9446', '#7e7a38'], verge: '#a08a48', vgrit: ['#b09a58', '#8a7a3c', '#c0aa68', '#7a6a34', '#b4703e'] },
  pinar:   { road: '#7c6e5a', grit: ['#8a7c66', '#6c5e4c', '#9a8c76', '#625646', '#857560'], rut: '#4a3e32', stone: ['#b4b0a4', '#9a958a', '#5c544a'],
             edge: '#6e6a4c', tuft: ['#4c6a30', '#3a5426'], verge: '#4a5c2e', vgrit: ['#58703a', '#3e5028', '#6a7c44', '#6a5a3c', '#34461f'] },
  nieve:   { road: '#aebcd0', grit: ['#c4d0e0', '#9aaac0', '#d4dcea', '#8e9cb2', '#b8c4d6'], rut: '#6a7488', stone: ['#ffffff', '#f2f6fa', '#7e8a9c'],
             edge: '#eef2f8', tuft: ['#ffffff', '#f4f8fc'], verge: '#e6ecf4', vgrit: ['#f4f7fb', '#d6dfea', '#ffffff', '#c8d4e2', '#e0e8f2'] }
};
function themeTextures(tm){
  const P = PAL[tm];
  // pista: a lo ancho va de un borde al otro; a lo largo se repite cada 8 m. Dos rodadas pisadas, piedras y grava suelta en los bordes.
  TEX.road = PSX.textura(64, (c, n) => {
    px(c, P.road, 0, 0, n, n); dots(c, n, P.grit, 900, 2, 1);
    for (const cx of [18, 46]) for (let y = 0; y < n; y++){
      c.globalAlpha = 0.45; px(c, P.rut, cx - 5 + (srnd(0, 2) | 0), y, 10, 1);
      c.globalAlpha = 0.55; px(c, P.rut, cx - 2 + (srnd(0, 3) | 0), y, 3, 1);
      if (tm === 'nieve' && srnd() < 0.3){ c.globalAlpha = 0.7; px(c, '#f4f8ff', cx - 1 + (srnd(0, 2) | 0), y, 1, 2); }   // hielo que brilla
    }
    c.globalAlpha = 1; dots(c, n, P.stone, 110);
    for (let y = 0; y < n; y++){ c.globalAlpha = 0.6; px(c, P.edge, 0, y, 3 + (srnd(0, 4) | 0), 1); px(c, P.edge, n - 3 - (srnd(0, 4) | 0), y, 7, 1); }
    c.globalAlpha = 1;
    for (let i = 0; i < 40; i++) px(c, P.tuft[i % 2], srnd() < 0.5 ? srnd(0, 3) | 0 : n - 1 - (srnd(0, 3) | 0), srnd(0, n) | 0, 1, 2);
  });
  // cuneta: de la pista (izquierda de la textura) al límite; grava que se pierde entre hierba, agujas o nieve
  TEX.verge = PSX.textura(32, (c, n) => {
    px(c, P.verge, 0, 0, n, n); dots(c, n, P.vgrit, 420, 1, 2);
    for (let i = 0; i < 160; i++){ const x = Math.floor(Math.pow(srnd(), 2.2) * 12); px(c, P.grit[i % P.grit.length], x, srnd(0, n) | 0, 2, 1); }
    if (tm !== 'nieve') for (let i = 0; i < 40; i++) px(c, P.tuft[i % 2], srnd(4, n) | 0, srnd(0, n) | 0, 1, 3);
  });
  // terreno: solo detalle en grises; el color lo ponen los vértices
  TEX.ground = PSX.textura(32, (c, n) => {
    px(c, '#c4c4c4', 0, 0, n, n); dots(c, n, ['#a8a8a8', '#d8d8d8', '#b4b4b4', '#9c9c9c'], 260, tm === 'nieve' ? 2 : 1, tm === 'nieve' ? 1 : 2);
  });
  return THEMES[tm];
}
// Árboles y matas: siluetas pintadas en una textura con transparencia, puestas en dos planos cruzados.
const TREE_TEX = {};
function treeTex(kind){
  if (TREE_TEX[kind]) return TREE_TEX[kind];
  rng = 4242 + kind.length * 31;
  const t = PSX.textura(64, (c, n) => {
    if (kind === 'pino' || kind === 'pinoNieve'){                         // pino: pisos de ramas cada vez más anchos
      px(c, '#3e2a1c', 30, 48, 4, 16);
      for (let k = 0; k < 6; k++){
        const y = 2 + k * 8, w = 8 + k * 8;
        poly(c, k % 2 ? '#24401f' : '#2c4c26', [[32, y], [32 + w / 2, y + 14], [32 - w / 2, y + 14]]);
        for (let i = 0; i < w; i += 2) px(c, '#3c6232', 32 - w / 2 + i + (srnd(0, 2) | 0), y + 12 + (srnd(0, 2) | 0), 1, 1);
        if (kind === 'pinoNieve'){ c.fillStyle = '#f2f6fc'; c.beginPath(); c.moveTo(32, y); c.lineTo(32 + w / 3, y + 9); c.lineTo(32 - w / 3, y + 9); c.fill(); px(c, '#ffffff', 32 - w / 2 + 1, y + 12, w - 2, 1); }
      }
    } else if (kind === 'olivo'){                                          // olivo: tronco retorcido y copa gris verdosa
      c.strokeStyle = '#4a4034'; c.lineWidth = 4; c.beginPath(); c.moveTo(30, 64); c.quadraticCurveTo(26, 50, 33, 40); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.moveTo(32, 46); c.lineTo(42, 36); c.moveTo(30, 44); c.lineTo(22, 34); c.stroke();
      for (let i = 0; i < 26; i++){ c.fillStyle = ['#6c7a50', '#5a6842', '#7e8c60', '#4c5a38'][i % 4]; c.beginPath(); c.ellipse(srnd(12, 52), srnd(10, 36), srnd(5, 10), srnd(4, 7), 0, 0, TAU); c.fill(); }
      dots(c, 48, ['#8e9a6c', '#3e4a2c'], 60);
    } else if (kind === 'cipres'){                                         // ciprés: llama alta y oscura
      for (let y = 0; y < 62; y++){ const w = Math.sin(Math.PI * Math.min(1, (y + 4) / 50)) * 9 + 1; px(c, y % 3 ? '#26381f' : '#30462a', 32 - w, y, w * 2, 1); }
      px(c, '#3a2a1c', 31, 58, 2, 6); dots(c, 64, ['#3c5432'], 40);
    } else if (kind === 'mata'){                                           // mata baja
      for (let i = 0; i < 18; i++){ c.fillStyle = ['#7a7038', '#6a6230', '#8a8248', '#5a5428'][i % 4]; c.beginPath(); c.ellipse(srnd(14, 50), srnd(44, 58), srnd(5, 10), srnd(4, 8), 0, 0, TAU); c.fill(); }
    } else if (kind === 'helecho'){                                        // helechos del pinar
      for (let i = 0; i < 14; i++){ const a = -Math.PI / 2 + srnd(-1.2, 1.2); c.strokeStyle = i % 2 ? '#4e7a34' : '#3c6428'; c.lineWidth = 2; c.beginPath(); c.moveTo(32, 64); c.lineTo(32 + Math.cos(a) * 26, 64 + Math.sin(a) * 18); c.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (TREE_TEX[kind] = t);
}
// Público: ocho personas de 16×32 en una tira (chaquetas de colores, alguno con los brazos arriba).
let crowdTex = null;
function makeCrowdTex(){
  if (crowdTex) return crowdTex;
  rng = 99;
  crowdTex = PSX.textura(128, (c) => {
    const jk = ['#d83020', '#2050c0', '#f0c020', '#30a040', '#f07020', '#e8e8e8', '#202020', '#a02878'], sk = ['#f0c8a0', '#d8a878', '#a8784c', '#f4d4b4'];
    for (let i = 0; i < 8; i++){
      const x = i * 16, up = i % 3 === 0;
      px(c, ['#2a3a5c', '#3a3a3a', '#4a3a2a'][i % 3], x + 5, 20, 3, 12); px(c, ['#2a3a5c', '#3a3a3a', '#4a3a2a'][i % 3], x + 9, 20, 3, 12);   // piernas
      px(c, jk[i], x + 4, 9, 9, 12);                                                                    // chaqueta
      if (up){ px(c, jk[i], x + 2, 2, 2, 9); px(c, jk[i], x + 13, 2, 2, 9); px(c, sk[i % 4], x + 2, 1, 2, 2); px(c, sk[i % 4], x + 13, 1, 2, 2); }
      else { px(c, jk[i], x + 2, 10, 2, 8); px(c, jk[i], x + 13, 10, 2, 8); }
      px(c, sk[i % 4], x + 6, 3, 5, 6);                                                                 // cara
      px(c, i % 2 ? '#2a1c10' : '#5a3a1c', x + 6, 2, 5, 2);                                              // pelo
      if (i % 4 === 1){ px(c, jk[(i + 3) % 8], x + 5, 1, 7, 2); }                                        // gorro
    }
  });
  crowdTex.wrapS = crowdTex.wrapT = THREE.ClampToEdgeWrapping;
  return crowdTex;
}
// Pancarta con texto (arcos de meta y de control).
function bannerTex(text, bg, fg){
  const c = document.createElement('canvas'); c.width = 128; c.height = 16; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 128, 16); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 14, 128, 2);
  x.font = '8px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = fg; x.fillText(text, 64, 8);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}
const texChevron = PSX.textura(32, (c, n) => { px(c, '#d02018', 0, 0, n, n); c.fillStyle = '#fff';
  for (const x0 of [4, 16]) poly(c, '#fff', [[x0, 4], [x0 + 8, 16], [x0, 28], [x0 + 5, 28], [x0 + 13, 16], [x0 + 5, 4]]); });
const texChecker = PSX.textura(16, (c, n) => { for (let y = 0; y < n; y += 4) for (let x = 0; x < n; x += 4) px(c, (x + y) % 8 ? '#111' : '#f4f4f4', x, y, 4, 4); });
const texRock = PSX.textura(32, (c, n) => { px(c, '#b0aca4', 0, 0, n, n); rng = 5; dots(c, n, ['#8c8880', '#c8c4bc', '#9c988e', '#6e6a62'], 300, 2, 2); });
const texTape = PSX.textura(16, (c, n) => { for (let x = 0; x < n; x += 4) px(c, x % 8 ? '#f4f4f4' : '#d82018', x, 0, 4, n); });
const texBale = PSX.textura(16, (c, n) => { px(c, '#d8b858', 0, 0, n, n); rng = 8; dots(c, n, ['#c0a040', '#e8cc70', '#a88a30'], 80, 2, 1); px(c, '#8a6a20', 0, 7, n, 1); });
const texWood = PSX.textura(16, (c, n) => { px(c, '#6a4a30', 0, 0, n, n); rng = 9; for (let y = 0; y < n; y += 3) px(c, '#523824', 0, y, n, 1); dots(c, n, ['#7c5a3a'], 20); });
// Cielo: degradado con nubes; las montañas lejanas van en un anillo aparte, con transparencia.
function skyTex(th){
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  const top = '#' + new THREE.Color(th.sky[0]).getHexString(), hor = '#' + new THREE.Color(th.sky[1]).getHexString(), fog = '#' + new THREE.Color(th.fog).getHexString();
  const gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, top); gr.addColorStop(1, hor); x.fillStyle = gr; x.fillRect(0, 0, 256, 64);
  x.fillStyle = fog; x.fillRect(0, 64, 256, 64);
  rng = 77;
  for (let i = 0; i < 26; i++){                                                // nubes: grupos de óvalos claros
    const cx = srnd(0, 256), cy = srnd(14, 54), w = srnd(14, 40);
    for (let k = 0; k < 6; k++){ x.fillStyle = k < 3 ? 'rgba(255,255,255,.55)' : 'rgba(220,226,236,.5)'; x.beginPath(); x.ellipse((cx + srnd(-w, w)) % 256, cy + srnd(-3, 3), srnd(8, w * 0.6), srnd(2, 5), 0, 0, TAU); x.fill(); }
  }
  const t = new THREE.CanvasTexture(x.canvas); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; return t;
}
function mountainTex(th, tm){
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
  rng = 31;
  const far = new THREE.Color(th.fog).lerp(new THREE.Color(th.sky[0]), 0.35), near = new THREE.Color(th.fog).lerp(new THREE.Color(tm === 'pinar' ? 0x2c4028 : tm === 'nieve' ? 0x8090a8 : 0x8a7050), 0.45);
  for (const [col, base, amp, snow] of [[far, 34, 26, tm !== 'arcilla'], [near, 48, 14, tm === 'nieve']]){
    let y = base; const pts = [];
    for (let i = 0; i <= 512; i += 8){ y = clamp(y + srnd(-amp * 0.4, amp * 0.4), base - amp, base + 6); pts.push([i, y]); }
    pts[pts.length - 1][1] = pts[0][1];                                          // que case al dar la vuelta
    x.fillStyle = '#' + col.getHexString(); x.beginPath(); x.moveTo(0, 64); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(512, 64); x.fill();
    if (snow){ x.fillStyle = 'rgba(250,252,255,.85)'; for (const [a, b] of pts) if (b < base - amp * 0.45) x.fillRect(a - 3, b, 7, 3); }
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; return t;
}
const sky = new THREE.Group(); scene.add(sky);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(800, 16, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
const skyRing = new THREE.Mesh(new THREE.CylinderGeometry(760, 760, 150, 32, 1, true), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, transparent: true }));
skyRing.position.y = 40; skyDome.renderOrder = skyRing.renderOrder = -2; sky.add(skyDome, skyRing);

// Construye el tramo entero: terreno, pista, cunetas y lo que hay en los bordes.
let minimap = null;
// Libera lo del tramo anterior (geometrías, materiales y las texturas pintadas para él) antes de construir otro.
function disposeWorld(){
  const keep = new Set([...Object.values(TREE_TEX), crowdTex, texChevron, texChecker, texRock, texTape, texBale, texWood]);
  world.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)){ if (m.map && !keep.has(m.map)) m.map.dispose(); m.dispose(); }
  });
  world.clear();
}
function buildStage(idx){
  const st = STAGES[idx];
  TR = buildTrack(st);
  disposeWorld();
  const th = themeTextures(st.tema);
  scene.background = new THREE.Color(th.sky[1]); scene.fog.color.setHex(th.fog); scene.fog.near = th.fogN; scene.fog.far = th.fogF;
  hemi.color.setHex(th.amb[0]); hemi.groundColor.setHex(th.amb[1]); sun.color.setHex(th.sun);
  if (skyDome.material.map) skyDome.material.map.dispose();
  if (skyRing.material.map) skyRing.material.map.dispose();
  skyDome.material.map = skyTex(th); skyRing.material.map = mountainTex(th, st.tema); skyRing.material.map.repeat.x = 2;
  skyDome.material.needsUpdate = skyRing.material.needsUpdate = true;
  world.add(buildRoad(TR, th), buildTerrain(TR, th));
  buildBorders(TR, th);
  buildMinimap(TR);
}
// Pista y cunetas: tiras que siguen la curva, con varios vértices a lo ancho (la textura afín se deforma menos).
function buildRoad(T, th){
  const g = new THREE.Group();
  const strip = (offs, map, col) => {
    const pos = [], uv = [], idx = [], cols = offs.length;
    for (let i = 0; i <= T.N; i++){
      const k = i % T.N, rx = -T.tz[k], rz = T.tx[k];
      offs.forEach((o, j) => { pos.push(T.px[k] + rx * o, T.py[k], T.pz[k] + rz * o); uv.push(j / (cols - 1), i * T.ds / 8); });
    }
    for (let i = 0; i < T.N; i++) for (let j = 0; j < cols - 1; j++){
      const a = i * cols + j, b = a + cols;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat({ color: col, map }));
  };
  const hw = T.hw, vw = T.wall + 3;
  g.add(strip([-hw, -hw / 2, 0, hw / 2, hw], TEX.road, 0xffffff));
  // las dos cunetas, con la textura girada para que la grava quede pegada a la pista
  const vr = strip([hw, (hw + vw) / 2, vw], TEX.verge, 0xffffff), vl = strip([-hw, -(hw + vw) / 2, -vw], TEX.verge, 0xffffff);
  const flip = vl.geometry.index.array; for (let k = 0; k < flip.length; k += 3){ const t = flip[k + 1]; flip[k + 1] = flip[k + 2]; flip[k + 2] = t; }
  vl.geometry.computeVertexNormals(); g.add(vr, vl);
  // meta (cuadros) y controles (amarillo), cada uno con su arco y su pancarta
  const wood = mat({ color: 0xffffff, map: texWood });
  for (const [i, meta] of [[0, true], [T.cps[0], false], [T.cps[1], false]]){
    const k = i % T.N, a = Math.atan2(T.tz[k], T.tx[k]), x = T.px[k], z = T.pz[k], y = T.py[k];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, T.st.w), mat(meta ? { color: 0xffffff, map: texChecker } : { color: 0xf0c020 }));
    if (meta) texChecker.repeat.set(1, T.st.w / 1.6);
    line.rotation.set(-Math.PI / 2, 0, -a); line.position.set(x, y + 0.03, z); g.add(line);
    const arch = new THREE.Group(); arch.position.set(x, y, z); arch.rotation.y = -a;
    const span = T.hw + 2.2;
    for (const sd of [-1, 1]){ const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), wood); post.position.set(0, 3, sd * span); arch.add(post); }
    // pancarta: una viga y el texto por las dos caras (mira a los que llegan, −X local, y a los que se van, +X)
    const bt = bannerTex(meta ? 'SALIDA  META' : 'CONTROL', meta ? '#c81e1e' : '#1e3c9c', '#fff'), bm = mat({ map: bt });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, span * 2 + 0.6), mat({ color: 0x202020 })); beam.position.y = 5.6;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 + 0.6, 1.3), bm); front.rotation.y = -Math.PI / 2; front.position.set(-0.16, 5.6, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 + 0.6, 1.3), bm); back.rotation.y = Math.PI / 2; back.position.set(0.16, 5.6, 0);
    arch.add(beam, front, back);
    g.add(arch);
  }
  return g;
}
// Terreno: rejilla de 10 m. Junto a la pista baja un poco por debajo de ella; lejos sube a colinas que tapan el borde.
function buildTerrain(T, th){
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < T.N; i++){ x0 = Math.min(x0, T.px[i]); x1 = Math.max(x1, T.px[i]); z0 = Math.min(z0, T.pz[i]); z1 = Math.max(z1, T.pz[i]); }
  const C = 10, MG = 480; x0 = Math.floor((x0 - MG) / C) * C; z0 = Math.floor((z0 - MG) / C) * C;
  const nx = Math.ceil((x1 + MG - x0) / C), nz = Math.ceil((z1 + MG - z0) / C);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  const gc = th.ground.map(h => new THREE.Color(h)), tc = new THREE.Color();
  T.terrain = { x0, z0, C, nx, nz, h: new Float32Array((nx + 1) * (nz + 1)), d: new Float32Array((nx + 1) * (nz + 1)) };
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++){
    const x = x0 + ix * C, z = z0 + iz * C, v = iz * (nx + 1) + ix;
    let bi = 0, bd = 1e12;
    for (const i of T.coarse){ const d = (T.px[i] - x) ** 2 + (T.pz[i] - z) ** 2; if (d < bd){ bd = d; bi = i; } }
    for (let j = -4; j <= 4; j++){ const i = ((bi + j) % T.N + T.N) % T.N, d = (T.px[i] - x) ** 2 + (T.pz[i] - z) ** 2; if (d < bd){ bd = d; bi = i; } }
    const d = Math.sqrt(bd), far = Math.max(0, d - 110) * 0.24 + Math.max(0, d - 260) * 0.45;
    const ht = hillsH(T.st, x, z) + far + Math.sin(x * 0.13 + z * 0.07) * 0.6;
    const y = lerp(T.py[bi] - 0.8, ht, smooth(T.wall + 3, T.wall + 45, d));
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; T.terrain.h[v] = y; T.terrain.d[v] = d;
    uv[v * 2] = x / 16; uv[v * 2 + 1] = z / 16;
    const n = (Math.sin(x * 0.031 + z * 0.017) + Math.sin(x * 0.011 - z * 0.023)) * 0.5;   // manchas de color
    tc.copy(gc[(n > 0.35 ? 2 : n > -0.1 ? 0 : n > -0.5 ? 1 : 3)]); tc.multiplyScalar(0.92 + 0.08 * Math.sin(x * 0.7 + z * 0.3));
    col[v * 3] = tc.r; col[v * 3 + 1] = tc.g; col[v * 3 + 2] = tc.b;
  }
  const idx = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++){ const a = iz * (nx + 1) + ix, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat({ vertexColors: true, map: TEX.ground }));
}
// Altura del terreno en (x, z) (para colocar cosas fuera de la pista).
function groundAt(T, x, z){
  const t = T.terrain, fx = (x - t.x0) / t.C, fz = (z - t.z0) / t.C, ix = clamp(Math.floor(fx), 0, t.nx - 1), iz = clamp(Math.floor(fz), 0, t.nz - 1);
  const u = fx - ix, w = fz - iz, h = (a, b) => t.h[(iz + b) * (t.nx + 1) + ix + a];
  return lerp(lerp(h(0, 0), h(1, 0), u), lerp(h(0, 1), h(1, 1), u), w);
}
// Bordes del tramo. Lo que hay en la línea del límite (T.wall) marca dónde choca el coche; detrás, el bosque de relleno.
const quadGeo = new THREE.PlaneGeometry(1, 1); quadGeo.translate(0, 0.5, 0);
const crowdGeos = [...Array(8)].map((_, i) => { const q = quadGeo.clone(), uv = q.attributes.uv;   // una persona de la tira de 8
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / 8, 0.75 + uv.getY(k) * 0.25); return q; });
const rockGeo = new THREE.DodecahedronGeometry(1, 0), logGeo = new THREE.CylinderGeometry(0.28, 0.28, 4, 7), postGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12), boxGeo = new THREE.BoxGeometry(1, 1, 1);
logGeo.rotateZ(Math.PI / 2);
const BORDER = {                                     // [tipo, peso] en la línea del límite, y árboles del relleno
  arcilla: { line: [['olivo', 4], ['mata', 3], ['roca', 2], ['cipres', 1], [null, 3]], fill: ['olivo', 'olivo', 'cipres', 'mata'], nFill: 900, crowdJk: 0 },
  pinar:   { line: [['pino', 7], ['helecho', 2], ['roca', 1], ['troncos', 1], [null, 1]], fill: ['pino'], nFill: 2600 },
  nieve:   { line: [['banco', 10]], fill: ['pinoNieve', 'pinoNieve', 'pino'], nFill: 1300 }
};
const TREE_SIZE = { pino: [7, 11], pinoNieve: [7, 10], olivo: [6, 5.5], cipres: [3.2, 9], mata: [3, 2.2], helecho: [2.6, 1.6] };
function buildBorders(T, th){
  const tm = T.st.tema, B = BORDER[tm], merges = {}, rocks = new Merge(), snow = new Merge(), props = new Merge(), crowd = new Merge();
  const tree = (kind, x, z, s, tint) => {
    const [w, h] = TREE_SIZE[kind], y = groundAt(T, x, z) - 0.2, m = merges[kind] || (merges[kind] = new Merge()), r = srnd(0, 3);
    m.add(quadGeo, place(x, y, z, r, w * s, h * s, 1), tint); m.add(quadGeo, place(x, y, z, r + Math.PI / 2, w * s, h * s, 1), tint);
  };
  const tint = () => new THREE.Color().setHSL(0, 0, srnd(0.82, 1)).getHex();
  const total = B.line.reduce((a, [, w]) => a + w, 0);
  const pick = () => { let r = srnd(0, total); for (const [k, w] of B.line){ if ((r -= w) <= 0) return k; } return null; };
  const at = (i, off) => [T.px[i] - T.tz[i] * off, T.pz[i] + T.tx[i] * off];
  // línea del límite, a los dos lados
  for (let i = 0; i < T.N; i += tm === 'nieve' ? 2 : 3) for (const side of [-1, 1]){
    const kind = pick(); if (!kind) continue;
    const [x, z] = at(i, side * (T.wall + 1.2 + srnd(0, kind === 'banco' ? 0.6 : 2.5)));
    if (kind === 'roca'){ const s = srnd(0.8, 1.6); rocks.add(rockGeo, place(x, groundAt(T, x, z) + 0.2, z, srnd(0, 3), s * 1.3, s * 0.8, s, srnd(-0.3, 0.3)), tint()); }
    else if (kind === 'troncos'){ const a = -Math.atan2(T.tz[i], T.tx[i]), y = groundAt(T, x, z) + 0.3;
      for (const [dy, dz] of [[0, -0.3], [0, 0.3], [0.5, 0]]) props.add(logGeo, place(x, y + dy, z, a, 1, 1, 1).multiply(new THREE.Matrix4().makeTranslation(0, 0, dz)), 0xc8a888); }
    else if (kind === 'banco'){                                        // muro de nieve apartada por la quitanieves
      const a = -Math.atan2(T.tz[i], T.tx[i]); snow.add(rockGeo, place(x, T.py[i] - 0.1, z, a, 2.6, srnd(0.8, 1.3), 1.5), 0xffffff);
      if (srnd() < 0.35){ const [x2, z2] = at(i, side * (T.wall + srnd(5, 10))); tree('pinoNieve', x2, z2, srnd(0.7, 1.1), tint()); }
    }
    else tree(kind, x, z, srnd(0.75, 1.25), tint());
  }
  // relleno: árboles sueltos por el campo, sin pisar la pista
  const t = T.terrain;
  for (let n = 0; n < B.nFill; n++){
    const x = t.x0 + srnd(0, t.nx * t.C), z = t.z0 + srnd(0, t.nz * t.C);
    const ix = Math.round((x - t.x0) / t.C), iz = Math.round((z - t.z0) / t.C), d = t.d[iz * (t.nx + 1) + ix];
    if (d < T.wall + 9 || d > 260) continue;
    tree(B.fill[n % B.fill.length], x, z, srnd(0.8, 1.4), tint());
  }
  // curvas cerradas: señales de flecha, balas de paja y público detrás de la cinta, por fuera
  for (const nt of T.notes){
    if (nt.jump || nt.g > 2) continue;
    const out = -nt.dir, mid = (nt.i + Math.floor(((nt.e - nt.i + T.N) % T.N) / 2)) % T.N;
    for (let k = 0; k < 3; k++){                                       // tres flechas mirando a los que llegan
      const i = (nt.i + k * 4) % T.N, [x, z] = at(i, out * (T.wall + 0.6)), a = Math.atan2(T.tx[i], T.tz[i]) + Math.PI, y = groundAt(T, x, z);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), mat({ map: texChevron, side: THREE.DoubleSide }));
      sg.position.set(x, y + 1.3, z); sg.rotation.y = a; sg.scale.x = nt.dir > 0 ? 1 : -1; world.add(sg);
      props.add(postGeo, place(x, y + 0.5, z), 0x6a5a48);
    }
    for (let k = -3; k <= 3; k++){                                      // balas de paja en el exterior del vértice
      const i = (mid + k * 2 + T.N) % T.N, [x, z] = at(i, out * (T.wall + 0.3));
      props.add(boxGeo, place(x, T.py[i] + 0.45, z, -Math.atan2(T.tz[i], T.tx[i]), 1.8, 0.9, 1), tm === 'nieve' ? 0xf8f8f8 : 0xffffff);
    }
    let tp = null;
    for (let k = -8; k <= 8; k++){                                      // público y cinta
      const i = (mid + k * 2 + T.N) % T.N;
      for (let row = 0; row < 2; row++){
        if (srnd() < 0.25) continue;
        const [x, z] = at(i, out * (T.wall + 4 + row * 1.6 + srnd(0, 0.8))), y = groundAt(T, x, z) + row * 0.15;
        crowd.add(crowdGeos[srnd(0, 8) | 0], place(x, y, z, Math.atan2(out * T.tz[i], -out * T.tx[i]), 0.9, 1.8, 1), 0xffffff);
      }
      const [x, z] = at(i, out * (T.wall + 2.8)), y = groundAt(T, x, z);
      props.add(postGeo, place(x, y + 0.5, z), 0x888888);
      if (tp){ const dx = x - tp[0], dz = z - tp[1], L = Math.hypot(dx, dz);
        props.add(boxGeo, place((x + tp[0]) / 2, y + 0.95, (z + tp[1]) / 2, -Math.atan2(dz, dx), L, 0.1, 0.03), 0xe8402c); }
      tp = [x, z];
    }
  }
  // público también en la salida
  for (let k = -10; k <= 6; k++) for (const side of [-1, 1]){
    if (srnd() < 0.4) continue;
    const i = (k * 2 + T.N) % T.N, [x, z] = at(i, side * (T.wall + 3 + srnd(0, 2))), y = groundAt(T, x, z);
    crowd.add(crowdGeos[srnd(0, 8) | 0], place(x, y, z, Math.atan2(side * T.tz[i], -side * T.tx[i]), 0.9, 1.8, 1), 0xffffff);
  }
  const leafMat = kind => mat({ map: treeTex(kind), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
  for (const k in merges) world.add(merges[k].mesh(leafMat(k)));
  if (rocks.p.length) world.add(rocks.mesh(mat({ map: texRock, vertexColors: true, color: tm === 'arcilla' ? 0xd8b898 : 0xffffff })));
  if (snow.p.length) world.add(snow.mesh(mat({ vertexColors: true, map: TEX.ground, color: 0xf4f8ff })));
  if (props.p.length) world.add(props.mesh(mat({ vertexColors: true, map: tm === 'pinar' ? texWood : texBale })));
  if (crowd.p.length) world.add(crowd.mesh(mat({ map: makeCrowdTex(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true })));
}
function buildMinimap(T){
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < T.N; i++){ x0 = Math.min(x0, T.px[i]); x1 = Math.max(x1, T.px[i]); z0 = Math.min(z0, T.pz[i]); z1 = Math.max(z1, T.pz[i]); }
  const S = 56 / Math.max(x1 - x0, z1 - z0);
  minimap = { S, x0, z0, w: (x1 - x0) * S, h: (z1 - z0) * S };
}

/* ============================================================
   COCHES
   ============================================================ */
// El coche: carrocería hecha por secciones transversales (de morro a cola) unidas entre sí, como un loft.
// Cada sección: [x, ancho y alto del bajo, ancho y alto de la cintura, ancho y alto del techo] (medias anchuras, metros).
// El frente mira a +X y la derecha es +Z. La textura (128×128) lleva la decoración: laterales, ventanillas, vista
// de arriba (capó, parabrisas, techo, luneta), morro y cola.
const BODY = {
  // hatchback de tres puertas, a lo E110 de rally: morro bajo, parabrisas tumbado, techo corto y portón casi vertical
  hatch: [[2.08, .74, .24, .77, .50, .64, .60], [1.96, .86, .21, .88, .64, .76, .70], [1.25, .90, .21, .90, .78, .78, .84],
          [0.62, .90, .21, .90, .84, .76, .89], [-0.22, .90, .21, .90, .88, .62, 1.36], [-1.30, .90, .21, .90, .90, .63, 1.33],
          [-1.94, .88, .25, .88, .87, .70, 1.00], [-2.06, .82, .28, .84, .56, .74, 0.86]],
  // berlina de tres volúmenes para algunos rivales
  sedan: [[2.08, .74, .24, .77, .50, .64, .60], [1.96, .86, .21, .88, .64, .76, .70], [1.25, .90, .21, .90, .78, .78, .84],
          [0.66, .90, .21, .90, .84, .76, .89], [-0.10, .90, .21, .90, .88, .62, 1.34], [-0.95, .90, .21, .90, .90, .63, 1.31],
          [-1.50, .89, .23, .89, .88, .72, 0.98], [-1.98, .87, .26, .87, .86, .74, 0.95], [-2.07, .82, .28, .84, .56, .74, 0.86]]
};
const XF = 2.1, LEN = 4.2, pX = x => (XF - x) / LEN * 128;          // posición de x en la textura (morro a la izquierda)
const bodyGeos = {};
function bodyGeo(kind){
  if (bodyGeos[kind]) return bodyGeos[kind];
  const S = BODY[kind], pos = [], uv = [];
  const prof = s => [[-s[1], s[2]], [-s[3], s[4]], [-s[5], s[6]], [s[5], s[6]], [s[3], s[4]], [s[1], s[2]]];
  const UV = (band, x, y, z, s0) => {                                // de un punto de la carrocería a la textura (píxeles → 0..1)
    let u, v;
    if (band === 0 || band === 4){ u = pX(x); v = (band ? 24 : 0) + (1 - clamp((y - 0.15) / 0.8, 0, 1)) * 24; if (band) u = 128 - u; }
    else if (band === 1 || band === 3){ u = pX(x); v = (band === 3 ? 62 : 48) + (1 - clamp((y - 0.5) / 0.9, 0, 1)) * 14; if (band === 3) u = 128 - u; }
    else if (band === 2){ u = pX(x); v = 76 + (z + 0.9) / 1.8 * 28; }
    else if (band === 5){ u = 2; v = 126; }                          // bajos: negro
    else { const fr = band === 6; u = (fr ? 0 : 64) + (fr ? (0.9 - z) : (z + 0.9)) / 1.8 * 64; v = 104 + (1 - clamp((y - s0[2]) / (s0[6] - s0[2]), 0, 1)) * 24; }
    return [u / 128, 1 - v / 128];
  };
  const tri = (a, b, c, ba, bb, bc) => { for (const [p, bd] of [[a, ba], [b, bb], [c, bc]]){ pos.push(p[0], p[1], p[2]); const t = UV(bd[0], p[0], p[1], p[2], bd[1]); uv.push(t[0], t[1]); } };
  for (let i = 0; i < S.length - 1; i++){
    const A = prof(S[i]), Bp = prof(S[i + 1]), xa = S[i][0], xb = S[i + 1][0];
    for (let j = 0; j < 6; j++){                                     // 5 bandas alrededor y el bajo (j = 5, del último punto al primero)
      const j2 = (j + 1) % 6, band = j;
      const p1 = [xa, A[j][1], A[j][0]], p2 = [xb, Bp[j][1], Bp[j][0]], p3 = [xb, Bp[j2][1], Bp[j2][0]], p4 = [xa, A[j2][1], A[j2][0]];
      const bd = [band, S[i]];
      tri(p1, p2, p3, bd, bd, bd); tri(p1, p3, p4, bd, bd, bd);
    }
  }
  for (const [s, fr] of [[S[0], true], [S[S.length - 1], false]]){   // tapas: morro y cola, en abanico desde el centro
    const P = prof(s), cy = (s[2] + s[6]) / 2, c = [s[0], cy, 0], bd = [fr ? 6 : 7, s];
    for (let j = 0; j < 6; j++){ const a = [s[0], P[j][1], P[j][0]], b = [s[0], P[(j + 1) % 6][1], P[(j + 1) % 6][0]]; if (fr) tri(c, a, b, bd, bd, bd); else tri(c, b, a, bd, bd, bd); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return (bodyGeos[kind] = g);
}
// Decoración. def.liv: 'wrc' (blanco con franjas roja y verde, el del jugador), 'band' (franja ancha) o 'split' (dos colores en diagonal).
function carAtlas(def){
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), S = BODY[def.body];
  const hex = n => '#' + new THREE.Color(n).getHexString(), B = hex(def.col), C2 = hex(def.col2), C3 = def.col3 != null ? hex(def.col3) : '#1a1a1a';
  const glass = '#18222e', glassHi = '#4c6278';
  const xWs = S[3][0], xRoofF = S[4][0], xRoofR = S[5][0], xBack = S[6][0];
  rng = def.num * 131 + 7;
  // laterales (izquierdo arriba, derecho espejado debajo)
  for (const [y0, mir] of [[0, false], [24, true]]){
    c.save(); if (mir){ c.translate(128, 0); c.scale(-1, 1); }
    px(c, B, 0, y0, 128, 24);
    if (def.liv === 'wrc'){
      poly(c, C3, [[0, y0 + 17], [pX(0.4), y0 + 16], [pX(-1.1), y0 + 9], [128, y0 + 5], [128, y0 + 24], [0, y0 + 24]]);
      poly(c, C2, [[0, y0 + 13], [pX(0.4), y0 + 12], [pX(-1.1), y0 + 5], [128, y0 + 1], [128, y0 + 5], [pX(-1.1), y0 + 9], [pX(0.4), y0 + 16], [0, y0 + 17]]);
      poly(c, C2, [[0, y0 + 4], [pX(1.5), y0 + 4], [pX(1.0), y0 + 10], [0, y0 + 10]]);
    } else if (def.liv === 'band'){ px(c, C2, 0, y0 + 9, 128, 6); px(c, C3, 0, y0 + 15, 128, 2); poly(c, C2, [[pX(-1.2), y0], [128, y0], [128, y0 + 15], [pX(-0.6), y0 + 15]]); }
    else { poly(c, C2, [[0, y0 + 24], [0, y0 + 14], [pX(-0.4), y0 + 6], [128, y0 + 2], [128, y0 + 24]]); px(c, C3, 0, y0 + 13, 128, 1); }
    for (const wx of [1.3, -1.25]){ c.fillStyle = '#0c0c0e'; c.beginPath(); c.ellipse(pX(wx), y0 + 25, 12, 10, 0, Math.PI, 0); c.fill(); }   // pasos de rueda
    px(c, 'rgba(0,0,0,.4)', pX(xWs - 0.05), y0 + 1, 1, 19); px(c, 'rgba(0,0,0,.4)', pX(-0.8), y0 + 1, 1, 19);   // puerta
    px(c, '#222', pX(-0.62), y0 + 5, 3, 1); px(c, '#1a1a1a', 0, y0 + 21, 128, 3);                               // tirador y taloneras
    for (let i = 0; i < 70; i++) px(c, ['rgba(110,80,50,.5)', 'rgba(90,70,50,.35)'][i % 2], srnd(0, 128) | 0, y0 + 15 + (srnd(0, 7) | 0), 2, 1);   // barro
    c.restore();
    // dorsal y pegatinas, siempre legibles
    const nx = mir ? 128 - pX(0.05) : pX(0.05);
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(nx, y0 + 9, 7, 6, 0, 0, TAU); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 1; c.stroke();
    c.font = '8px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#111'; c.fillText(String(def.num), nx + 0.5, y0 + 10);
    const sx = mir ? 128 - pX(0.95) : pX(0.95); px(c, '#111', sx - 9, y0 + 7, 18, 5); px(c, '#ffe060', sx - 8, y0 + 8, 16, 3);
  }
  // franja de ventanillas: chapa en el capó y la cola, cristal en la cabina (pilar B en las de tres puertas)
  for (const [y0, mir] of [[48, false], [62, true]]){
    c.save(); if (mir){ c.translate(128, 0); c.scale(-1, 1); }
    px(c, B, 0, y0, 128, 14);
    poly(c, glass, [[pX(xWs - 0.05), y0 + 13], [pX(xRoofF + 0.05), y0 + 2], [pX(xRoofR - 0.02), y0 + 2], [pX(xBack + 0.25), y0 + 13]]);
    px(c, B, pX(-0.85), y0, 3, 14);
    px(c, glassHi, pX(0.2), y0 + 4, 2, 6); px(c, glassHi, pX(-1.0), y0 + 4, 2, 6);
    c.restore();
  }
  // vista de arriba: capó con franjas, parabrisas, techo con dorsal y toma de aire, luneta
  px(c, B, 0, 76, 128, 28);
  if (def.liv === 'wrc'){ poly(c, C2, [[0, 82], [pX(xWs), 86], [pX(xWs), 94], [0, 98]]); poly(c, C3, [[0, 86], [pX(1.0), 88], [pX(1.0), 92], [0, 94]]); }
  else px(c, C2, 0, 86, pX(xWs), 8);
  poly(c, glass, [[pX(xWs), 79], [pX(xRoofF), 81], [pX(xRoofF), 99], [pX(xWs), 101]]); px(c, glassHi, pX(xWs) + 3, 82, 2, 16);
  px(c, '#fff', pX(-0.75) - 7, 84, 14, 12); c.fillStyle = '#111'; c.font = '8px ' + FONT; c.textAlign = 'center'; c.fillText(String(def.num), pX(-0.75) + 0.5, 91);
  px(c, '#222', pX(xRoofF) + 2, 87, 4, 6);
  poly(c, glass, [[pX(xRoofR), 81], [pX(xBack), 80], [pX(xBack), 100], [pX(xRoofR), 99]]);
  // morro: faros alargados, rejilla fina y tomas grandes en el paragolpes
  px(c, B, 0, 104, 64, 24); px(c, '#151515', 0, 117, 64, 11);
  for (const x of [3, 45]){ px(c, '#202020', x, 106, 16, 7); px(c, '#e8ecf0', x + 1, 107, 14, 5); px(c, '#ffffff', x + 2, 108, 5, 3); }
  px(c, '#101010', 22, 108, 20, 3); px(c, '#0a0a0a', 8, 119, 48, 6); px(c, '#0a0a0a', 2, 120, 4, 4); px(c, '#0a0a0a', 58, 120, 4, 4);
  for (const x of [12, 50]){ px(c, '#f0e080', x, 121, 3, 2); }
  // cola: pilotos rojos, portón y paragolpes
  px(c, B, 64, 104, 64, 24); px(c, '#1c1c1c', 64, 119, 64, 9);
  for (const x of [66, 110]){ px(c, '#200808', x, 109, 16, 7); px(c, '#d01810', x + 1, 110, 14, 5); px(c, '#ff6040', x + 2, 110, 4, 2); px(c, '#f0a020', x + (x < 90 ? 11 : 1), 112, 3, 3); }
  px(c, '#e8e8e8', 88, 120, 16, 5); px(c, '#202020', 90, 121, 12, 3); px(c, '#555', 70, 124, 4, 3);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}
const texTire = PSX.textura(16, (c, n) => { px(c, '#1c1c1c', 0, 0, n, n); for (let x = 0; x < n; x += 3) px(c, '#2e2e2e', x, 0, 1, n); });
const texRim = PSX.textura(32, (c, n) => {
  px(c, '#161616', 0, 0, n, n); c.fillStyle = '#e8e8e4'; c.beginPath(); c.arc(16, 16, 11, 0, TAU); c.fill();
  c.fillStyle = '#9a9a96'; c.beginPath(); c.arc(16, 16, 9, 0, TAU); c.fill();
  c.strokeStyle = '#f4f4f0'; c.lineWidth = 2; for (let k = 0; k < 6; k++){ const a = k * TAU / 6; c.beginPath(); c.moveTo(16, 16); c.lineTo(16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10); c.stroke(); }
  c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(16, 16, 3, 0, TAU); c.fill();
});
const texShadow = PSX.textura(32, (c, n) => { const g2 = c.createRadialGradient(16, 16, 4, 16, 16, 16); g2.addColorStop(0, 'rgba(0,0,0,.6)'); g2.addColorStop(0.7, 'rgba(0,0,0,.45)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.fillRect(0, 0, n, n); });
const texPod = PSX.textura(32, (c, n) => { px(c, '#111', 0, 0, n, n); for (let k = 0; k < 4; k++){ c.fillStyle = '#d8d8c8'; c.beginPath(); c.arc(4 + k * 8, 16, 3.4, 0, TAU); c.fill(); c.fillStyle = '#fffff0'; c.fillRect(3 + k * 8, 14, 2, 2); } });
const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12); wheelGeo.rotateX(Math.PI / 2);
const shadowGeo = new THREE.PlaneGeometry(5.0, 2.6); shadowGeo.rotateX(-Math.PI / 2);
const wheelMats = [mat({ map: texTire }), mat({ map: texRim }), mat({ map: texRim })];
const boxGeos = {};
const boxG = (w, h, d) => boxGeos[w + ',' + h + ',' + d] || (boxGeos[w + ',' + h + ',' + d] = new THREE.BoxGeometry(w, h, d));
function makeCar(def){
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  // los materiales de cada piloto se hacen una vez y se reutilizan en todas las carreras
  const M = def._m || (def._m = { mb: mat({ map: carAtlas(def) }), mc: mat({ color: def.col }), m2: mat({ color: def.col2 }), mk: mat({ color: 0x141414 }),
    pod: mat({ map: texPod }), sh: new THREE.MeshBasicMaterial({ map: texShadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) });
  const { mb, mc, m2, mk } = M;
  body.add(new THREE.Mesh(bodyGeo(def.body), mb));
  const B = (w, h, d, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(boxG(w, h, d), m); o.position.set(x, y, z); o.rotation.z = rz; body.add(o); return o; };
  const S = BODY[def.body], xT = S[S.length - 2][0], yT = S[S.length - 2][6];
  // alerón grande sobre el portón (o sobre el maletero), con sus derivas
  B(0.5, 0.06, 1.64, m2, xT + 0.05, yT + 0.36, 0, 0.12); for (const z of [-0.8, 0.8]) B(0.56, 0.3, 0.04, mc, xT + 0.05, yT + 0.25, z);
  for (const z of [-0.45, 0.45]) B(0.08, 0.3, 0.06, mk, xT + 0.12, yT + 0.16, z);
  B(0.4, 0.07, 0.32, mk, S[4][0] - 0.25, S[4][6] + 0.03, 0);                          // toma de aire del techo
  if (def.pod){ const p = new THREE.Mesh(boxG(0.1, 0.18, 1.3), [M.pod, mk, mk, mk, mk, mk]); p.position.set(2.1, 0.62, 0); body.add(p); }   // faros auxiliares
  for (const z of [-0.98, 0.98]) B(0.1, 0.1, 0.16, mc, 0.5, 0.95, z);                // retrovisores
  for (const [x, z] of [[0.8, 0.82], [0.8, -0.82], [-1.75, 0.82], [-1.75, -0.82]]) B(0.03, 0.28, 0.34, m2, x, 0.26, z);   // faldillas
  const wheels = [];
  for (const [x, z] of [[1.3, 0.8], [1.3, -0.8], [-1.25, 0.8], [-1.25, -0.8]]){
    const piv = new THREE.Group(); piv.position.set(x, 0.34, z); const w = new THREE.Mesh(wheelGeo, wheelMats); if (z < 0) w.rotation.y = Math.PI; piv.add(w); g.add(piv); wheels.push({ piv, w, front: x > 0, side: Math.sign(z) });
  }
  const shadow = new THREE.Mesh(shadowGeo, M.sh);
  return { g, body, wheels, shadow, slope: 0 };
}

// Un coche en carrera. Lo comparten el jugador y los rivales.
function newCar(def, i, isPlayer){
  const row = Math.floor(i / 2), col = i % 2;
  const si = ((TR.N - 6 - row * 5) % TR.N + TR.N) % TR.N, lat = (col ? 1 : -1) * TR.hw * 0.42;   // rejilla: dos filas, 10 m entre filas
  const x = TR.px[si] - TR.tz[si] * lat, z = TR.pz[si] + TR.tx[si] * lat, h = Math.atan2(TR.tz[si], TR.tx[si]);
  const c = { def, name: def.name, player: isPlayer, x, z, y: TR.py[si], vy: 0, h, vx: 0, vz: 0, r: 0, steer: 0, air: false, airT: 0,
              ti: si, s: si * TR.ds, prog: si * TR.ds - TR.L, d: lat, thr: 0, brk: 0, hb: false, gear: 0, rpm: 900, shiftT: 0,
              u: 0, v: 0, slip: 0, offroad: false, lap: -1, finished: false, finT: 0, sk: def.sk || 1,
              lane: (Math.random() - 0.5) * 2.5, roll: 0, pitch: 0, wspin: 0, hit: 0, wrongT: 0, pw: isPlayer ? 1 : (def.sk || 1) * R.diff };
  c.m = makeCar(def); dyn.add(c.m.g, c.m.shadow);
  return c;
}

/* ---------- físicas ----------
   Modelo arcade: el rumbo gira según el volante (limitado por el agarre) y la velocidad lo sigue con el agarre
   lateral disponible. Si el rumbo gira más rápido de lo que el agarre puede doblar la trayectoria, el coche desliza.
   El freno de mano quita agarre atrás y deja girar más: cruza el coche. */
function stepCar(c, dt){
  const T = TR, loc = locate(T, c.x, c.z, c.ti);
  c.ti = loc.i; c.d = loc.d;
  const off = Math.abs(loc.d) > T.hw + 0.4; c.offroad = off;
  const mu = T.st.mu * (off ? 0.78 : 1);
  const fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  let u = c.vx * fx + c.vz * fz, v = c.vx * rx + c.vz * rz;
  if (!c.air){
    let a = 0;
    const cut = c.shiftT > 0 ? 0.35 : 1;
    if (c.thr > 0 && !c.hb){                                                   // con el freno de mano no hay tracción
      if (u > -0.5) a += c.thr * ACC * c.pw * cut * (1 - Math.pow(clamp(u / (VMAX * Math.sqrt(c.pw)), 0, 1), 1.7)) * (0.6 + 0.4 * mu);
      else a += c.thr * BRAKE * mu;                                          // acelerar yendo hacia atrás: frena
    }
    if (c.brk > 0){ if (u > 0.6) a -= c.brk * BRAKE * mu; else a -= c.brk * REV * (1 - clamp(-u / VREV, 0, 1)); }
    if (c.hb && Math.abs(u) > 0.5) a -= Math.sign(u) * HB_DEC * mu;
    a -= Math.sign(u) * (ROLL + (off ? 2.6 : 0)) + DRAG * u * Math.abs(u);
    const nu = u + a * dt;
    u = (c.thr === 0 && c.brk === 0 && Math.sign(nu) !== Math.sign(u) && Math.abs(u) < 1.5) ? 0 : nu;
    // agarre lateral: quita velocidad de lado hasta lo que da la superficie
    const spin = c.thr > 0.5 && Math.abs(v) > 1.5 ? 0.85 : 1;                // con gas en pleno derrape las ruedas patinan
    const grip = mu * G * GRIP_K * (c.hb ? 0.3 : 1) * spin;
    const dv = clamp(v, -grip * dt, grip * dt);
    v -= dv;
    if (c.thr > 0) u += Math.abs(dv) * 0.32 * Math.sign(u || 1);           // el derrape conserva parte de la velocidad
    // giro: geometría del volante, limitado por lo que deja el agarre (más con freno de mano)
    const dmax = 0.62 / (1 + Math.abs(u) / 11);
    let rT = u * Math.tan(c.steer * dmax) / WB;
    const rMax = mu * G * YAW_K * (c.hb ? 2.1 : 1) / Math.max(Math.abs(u), 4);
    rT = clamp(rT, -rMax, rMax);
    c.r += (rT - c.r) * Math.min(1, dt * YAW_RESP * (0.5 + 0.5 * mu));
  } else c.r *= 1 - dt * 0.6;
  c.h += c.r * dt;
  c.u = u; c.v = v; c.slip = Math.atan2(Math.abs(v), Math.abs(u) + 0.5);
  c.vx = fx * u + rx * v; c.vz = fz * u + rz * v;
  c.x += c.vx * dt; c.z += c.vz * dt;
  // muros (árboles, rocas, nieve): rebote seco que frena
  const lim = T.wall - 1.0;
  if (Math.abs(c.d) > lim){
    const sd = Math.sign(c.d), nx = -T.tz[loc.i] * sd, nz = T.tx[loc.i] * sd, vn = c.vx * nx + c.vz * nz;
    c.x -= nx * (Math.abs(c.d) - lim); c.z -= nz * (Math.abs(c.d) - lim);
    if (vn > 0){
      c.vx -= nx * vn * 1.3; c.vz -= nz * vn * 1.3;
      const keep = 1 - Math.min(0.55, vn * 0.05); c.vx *= keep; c.vz *= keep; c.r *= 0.5;
      c.hit = Math.max(c.hit, vn); if (vn > 3) c.hits = (c.hits || 0) + 1; if (c.player) onHit(vn);
    }
  }
  // altura: pegado a la pista; en una cresta, si el suelo cae más deprisa que la gravedad, vuela
  const gy = locate(T, c.x, c.z, c.ti).y;
  if (c.air){
    c.vy -= G_AIR * dt; c.y += c.vy * dt; c.airT += dt;
    if (c.y <= gy){ if (c.player) onLand(-c.vy, c.airT); c.y = gy; c.vy = 0; c.air = false; c.airT = 0; }
  } else {
    const vyG = (gy - c.y) / dt;
    if (vyG < c.vy - G_AIR * dt * 1.5 && c.vy > 0.5){ c.air = true; c.vy -= G_AIR * dt; c.y += c.vy * dt; }
    else { c.vy = c.vy + (vyG - c.vy) * 0.5; c.y = gy; }
  }
  // marchas (automáticas) y vueltas del motor, para el sonido y el cuentarrevoluciones
  const au = Math.abs(u); let g = 0; while (g < GEARS.length - 1 && au > GEARS[g] * 0.96) g++;
  if (g !== c.gear){ if (g > c.gear) c.shiftT = 0.14; c.gear = g; if (c.player) onShift(); }
  c.shiftT -= dt;
  const lo = g ? GEARS[g - 1] * 0.62 : 0, target = c.air && c.thr > 0 ? 7600 : c.thr > 0 && c.brk > 0.5 && au < 1 ? 2400 + 4600 * c.thr :   // en la salida, gas con el freno: sube de vueltas
     1000 + 6600 * clamp((au - lo) / (GEARS[g] - lo), 0, 1) + (c.thr > 0 && c.slip > 0.3 ? 900 : 0);
  c.rpm += (target - c.rpm) * Math.min(1, dt * 10);
  // progreso en la carrera (sin saltos al cruzar la meta)
  let ds = loc.s - c.s; if (ds < -T.L / 2) ds += T.L; if (ds > T.L / 2) ds -= T.L;
  c.s = (loc.s + T.L) % T.L; c.prog += ds;
}
// Choques entre coches: círculos que se empujan y se reparten la velocidad.
function collideCars(cars){
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++){
    const a = cars[i], b = cars[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), R0 = 2.15;
    if (d >= R0 || d < 0.001 || Math.abs(a.y - b.y) > 1.6) continue;
    const nx = dx / d, nz = dz / d, push = (R0 - d) / 2;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0){
      const imp = -rv * 0.65; a.vx -= nx * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vz += nz * imp;
      a.r += (Math.random() - 0.5) * imp * 0.15; b.r += (Math.random() - 0.5) * imp * 0.15;
      if (a.player || b.player) onBump(-rv);
    }
  }
}

/* ---------- pilotos rivales ---------- */
function driveAI(c, dt){
  const T = TR, W = i => (i % T.N + T.N) % T.N;
  if (c.finished || R.phase === 'over'){ c.thr = 0; c.brk = 0.4; c.hb = false; c.steer *= 0.9; return; }
  const look = Math.round((5 + Math.abs(c.u) * 0.5) / T.ds), k = W(c.ti + look);
  let lane = T.line[k] + c.lane;
  // esquivar al que va delante si está muy cerca y en la misma trazada
  for (const o of R.cars){
    if (o === c) continue;
    const ahead = o.prog - c.prog;
    if (ahead > 0 && ahead < 14 && Math.abs(o.d - c.d) < 2.4){ lane = o.d + (o.d > 0 ? -3 : 3); break; }
  }
  lane = clamp(lane, -T.hw + 1.1, T.hw - 1.1);
  const tx = T.px[k] - T.tz[k] * lane, tz = T.pz[k] + T.tx[k] * lane;
  const err = angDiff(Math.atan2(tz - c.z, tx - c.x), c.h);
  const dmax = 0.62 / (1 + Math.abs(c.u) / 11), ff = Math.atan(WB * T.ks[W(c.ti + 3)]) / dmax;   // volante que pide la curva
  const edge = Math.abs(c.d) > T.hw - 0.5 ? -Math.sign(c.d) * (Math.abs(c.d) - T.hw + 0.5) * 0.25 : 0;   // abriéndose a la cuneta: corrige
  c.steer = clamp(ff * 0.8 + err * 2.2 + edge - c.r * 0.12, -1, 1);
  // velocidad objetivo: la menor de las curvas que vienen, contando con lo que se puede frenar antes
  let sk = c.sk * R.diff;
  const gap = c.prog - PL.prog;                                    // ventaja sobre el jugador (m): se dejan alcanzar o aprietan un poco
  if (R.mode === 'champ'){ if (gap > 100) sk *= 0.93; else if (gap < -80) sk *= 1.05; }
  c.pw = c.sk * R.diff * (gap > 100 ? 0.93 : gap < -80 ? 1.05 : 1);
  const mu = T.st.mu * 0.97, b = BRAKE * mu * 0.62;
  let vT = 99;
  for (let j = 0; j < 70; j += 2){
    const kk = Math.abs(T.ks[W(c.ti + j)]), vc = kk > 1e-4 ? Math.sqrt(mu * G * GRIP_K * 0.98 / kk) * sk : 99;
    vT = Math.min(vT, Math.sqrt(vc * vc + 2 * b * j * T.ds));
  }
  if (T.jump[W(c.ti + 6)] === 1) vT = Math.min(vT, 33 * sk);         // sin pasarse en los saltos
  vT = Math.min(vT, VMAX * sk);
  const wide = c.slip > 0.22 && Math.sign(c.v) === -Math.sign(T.ks[c.ti]) ? 0.4 : 1;   // deslizando hacia fuera: levanta el pie
  c.thr = c.u < vT ? wide : 0;
  c.brk = c.u > vT + 1.2 ? clamp((c.u - vT) / 4, 0.2, 1) : 0;
  c.hb = Math.abs(T.ks[W(c.ti + 4)]) > 1 / 45 && c.u > 17;
  if (c.u < 2 && R.t > 4){ c.stuck = (c.stuck || 0) + dt; if (c.stuck > 2.5){ resetCar(c); c.stuck = 0; } } else c.stuck = 0;
}
// Vuelve a dejar el coche en el centro de la pista (si un rival se queda atascado).
function resetCar(c){
  const i = c.ti; c.x = TR.px[i]; c.z = TR.pz[i]; c.y = TR.py[i]; c.h = Math.atan2(TR.tz[i], TR.tx[i]); c.vx = c.vz = c.r = 0; c.air = false;
}

/* ============================================================
   LA CARRERA
   ============================================================ */
// Campeonato: puntos acumulados de cada piloto (0 = el jugador, 1… = los rivales en el orden de RIVALS).
let CH = null;
function newChampionship(){ CH = { stage: 0, pts: [0, 0, 0, 0, 0, 0] }; }
const PLAYER_DEF = { name: 'TU', col: 0xf2f2ee, col2: 0xd8261e, col3: 0x15683a, body: 'hatch', liv: 'wrc', num: 5, pod: true, sk: 1 };
const DRIVERS = [PLAYER_DEF, ...RIVALS];
// mode: 'champ' (campeonato), 'tt' (contrarreloj, solo) o 'demo' (la carrera de fondo del menú, todos con IA)
function startRace(mode, stageIdx){
  dyn.clear(); if (!TR || TR.st !== STAGES[stageIdx]) buildStage(stageIdx);
  R = { mode, stage: stageIdx, laps: mode === 'tt' ? LAPS_TT : LAPS, t: 0, phase: 'count', countT: mode === 'demo' ? 0.01 : 4.2, cars: [], acc: 0,
        clock: 0, nextCp: 0, lapT: 0, lapTimes: [], diff: [0.9, 0.93, 0.96][stageIdx], finishOrder: [], endT: 0, auto: mode === 'demo',
        drift: { on: false, sc: 0, t: 0, end: -9, chain: 0, tot: 0 }, hits: 0, noteSeen: -1 };
  const grid = mode === 'tt' ? [PLAYER_DEF] : [...RIVALS, PLAYER_DEF];
  grid.forEach((d, i) => { const c = newCar(d, i, d === PLAYER_DEF); c.prog0 = c.prog; R.cars.push(c); if (c.player) PL = c; });
  // reloj: lo que se tarda en el primer tercio a la velocidad de referencia, más la salida
  R.clock = mode === 'champ' ? (TR.L / 3) / TR.st.ref + 6 : 0;
  UI.screen = mode === 'demo' ? UI.screen : null; UI.t = 0;
  state0 = mode === 'demo' ? 'menu' : 'race';
  camYaw = PL.h; camPos.set(PL.x - Math.cos(PL.h) * 8, PL.y + 3, PL.z - Math.sin(PL.h) * 8); shot.t = 0;
  msgT = 0; shake = 0; parts = []; ghostSetup();
}
const restartStage = () => startRace(R.mode, R.stage);
function say(t, t2 = ''){ msg = t; msg2 = t2; msgT = 2.2; }

function updateRace(dt){
  const r = R;
  if (r.phase === 'count'){
    const before = Math.ceil(r.countT); r.countT -= dt;
    if (Math.ceil(r.countT) !== before && r.countT > 0 && before <= 3 && r.mode !== 'demo') blip(440, 0.18);
    if (r.countT <= 0){ r.phase = 'race'; if (r.mode !== 'demo'){ blip(880, 0.4); say('¡YA!'); } }
  }
  readInput(dt);
  const coolDown = r.phase === 'done' || r.phase === 'over';
  for (const c of r.cars) if (!c.player || r.auto || r.phase === 'done') driveAI(c, dt);
  if (r.phase === 'count') for (const c of r.cars){ c.brk = 1; c.hb = false; if (!c.player) c.thr = 0; }   // en la salida, frenados (el gas solo sube vueltas)
  if (r.phase === 'over'){ PL.thr = 0; PL.brk = 0.6; PL.hb = false; PL.steer *= 0.95; }
  // física a paso fijo
  r.acc += dt;
  while (r.acc >= STEP){
    r.acc -= STEP;
    for (const c of r.cars) stepCar(c, STEP);
    collideCars(r.cars);
    if (r.phase === 'count') for (const c of r.cars){ c.vx = c.vz = c.r = 0; }
  }
  if (r.phase === 'count') return;
  r.t += dt; ghostRecord(dt);
  if (coolDown){ r.endT += dt; if (r.endT > 3.2 && !UI.screen && r.mode !== 'demo') endScreen(); }
  if (r.phase === 'race'){
    r.lapT += dt;
    if (r.mode === 'champ'){
      r.clock -= dt;
      if (r.clock <= 0){ r.clock = 0; r.phase = 'over'; r.endT = 0; boom(0.4, 300, 0.8); return; }
      if (r.clock < 10 && Math.ceil(r.clock) !== Math.ceil(r.clock + dt)) blip(1200, 0.06);
    }
  }
  // vueltas y meta (de todos: los rivales siguen corriendo cuando el jugador ya ha llegado)
  for (const c of r.cars){
    if (c.finished) continue;
    const lapNow = Math.floor(c.prog / TR.L);
    if (lapNow > c.lap){ c.lap = lapNow; if (c.player && r.phase === 'race') onLap(); }
    if (c.prog >= r.laps * TR.L){ c.finished = true; c.finT = r.t; r.finishOrder.push(c); if (c.player && r.phase === 'race') onFinish(); }
  }
  if (r.mode === 'demo' && (r.t > 75 || r.finishOrder.length)) startRace('demo', (r.stage + 1) % STAGES.length);
  if (r.phase !== 'race' || r.mode === 'demo') return;
  // controles de paso: cada tercio de vuelta suma tiempo al reloj
  if (r.mode === 'champ'){
    const cpS = (r.nextCp + 1) * TR.L / 3;
    if (PL.prog >= cpS){
      const ext = (TR.L / 3) / TR.st.ref;
      r.clock += ext; r.nextCp++;
      if (r.nextCp % 3) say('CONTROL', '+' + ext.toFixed(1) + ' S');
      blip(988, 0.12); setTimeout(() => blip(1318, 0.18), 120);
    }
  }
  // derrape: ángulo, velocidad y duración → décimas para el reloj
  const D = r.drift, ang = PL.slip, spd = Math.hypot(PL.vx, PL.vz);
  if (!PL.air && ang > 0.28 && spd > 11){ if (!D.on){ D.on = true; D.sc = 0; } D.t = 0; D.sc += ang * spd * dt; }
  else if (D.on && (D.t += dt) > 0.35){
    D.on = false;
    if (D.sc > 6){
      D.chain = r.t - D.end < 1.6 ? D.chain + 1 : 1; D.end = r.t;
      const bonus = Math.min(2.5, D.sc * 0.022 * D.chain);
      if (r.mode === 'champ') r.clock += bonus; D.tot += bonus;
      say('DERRAPE' + (D.chain > 1 ? ' x' + D.chain : ''), r.mode === 'champ' ? '+' + bonus.toFixed(1) + ' S' : Math.round(D.sc * 10) + ' PTS'); blip(660 + D.chain * 80, 0.1);
    }
  }
  // sentido contrario
  const fwd = Math.cos(PL.h) * TR.tx[PL.ti] + Math.sin(PL.h) * TR.tz[PL.ti];
  PL.wrongT = fwd < -0.3 && spd > 4 ? PL.wrongT + dt : 0;
}
function onHit(vn){
  if (vn > 2.5){ shake = Math.min(1.2, vn * 0.08); boom(Math.min(0.6, vn * 0.05), 500, 0.25); R.hits++;
    const sd = Math.sign(PL.d), x = PL.x - Math.sin(PL.h) * 0 - TR.tz[PL.ti] * sd * 1, z = PL.z + TR.tx[PL.ti] * sd * 1;
    burstAt(x, PL.y + 0.6, z, Math.min(20, 4 + vn * 2), TR.st.tema === 'nieve' ? [0.95, 0.97, 1] : TR.st.tema === 'pinar' ? [0.3, 0.42, 0.2] : [0.62, 0.55, 0.42], 3, 0.3); }
  if (vn > 4 && R.drift.on){ R.drift.on = false; R.drift.sc = 0; say('DERRAPE PERDIDO'); }
}
function onBump(v){ if (v > 2 && R.mode !== 'demo'){ boom(Math.min(0.5, v * 0.06), 800, 0.15); shake = Math.min(0.8, v * 0.06); } }
function onLand(v, t){ if (t > 0.25 && R.mode !== 'demo'){ shake = Math.min(1, v * 0.07); boom(Math.min(0.5, v * 0.05), 260, 0.3); burstAt(PL.x, PL.y + 0.2, PL.z, 14, DUST[TR.st.tema], 4, 0.8, 1.2); } }
function onShift(){ SND.shift = 0.12; if (PL.thr > 0.8 && PL.gear >= 2 && Math.random() < 0.5) pop(1); }
function onLap(){
  const r = R;
  if (PL.lap >= 1 && PL.lap <= r.laps){
    const lt = r.lapT; r.lapTimes.push(lt); r.lapT = 0; ghostLap(lt);
    if (PL.lap < r.laps) say(PL.lap === r.laps - 1 ? 'ULTIMA VUELTA' : 'VUELTA ' + (PL.lap + 1), fmtTime(lt));
  }
}
function onFinish(){
  const r = R; r.phase = 'done'; r.endT = 0;
  r.pos = r.finishOrder.indexOf(PL) + 1;
  say(r.mode === 'tt' ? 'META' : r.pos + 'º PUESTO', fmtTime(r.t)); blip(1046, 0.3);
  if (r.mode === 'tt'){                                // récords de contrarreloj: vuelta rápida y tiempo total
    const k = 'tt' + r.stage, b = best[k] || {}, lap = Math.min(...r.lapTimes);
    r.newLap = !b.lap || lap < b.lap; r.newTot = !b.tot || r.t < b.tot;
    best[k] = { lap: r.newLap ? lap : b.lap, tot: r.newTot ? r.t : b.tot }; saveBest();
  }
}
// Clasificación del tramo: los que no han llegado se estiman con su velocidad media hasta ahora.
function standings(){
  return R.cars.map(c => {
    const done = c.finished, avg = Math.max(6, (c.prog - c.prog0) / Math.max(1, R.t));
    return { c, t: done ? c.finT : R.t + Math.max(0, R.laps * TR.L - c.prog) / avg, est: !done };
  }).sort((a, b) => a.t - b.t);
}
// Al acabar (meta o tiempo): la pantalla que toca.
function endScreen(){
  const r = R;
  if (r.phase === 'over'){ toScreen('over'); return; }
  if (r.mode === 'tt'){ toScreen('ttEnd'); return; }
  r.table = standings(); r.pos = r.table.findIndex(x => x.c === PL) + 1; r.ok = r.pos <= 3;
  if (r.ok){ r.table.forEach((x, i) => CH.pts[DRIVERS.indexOf(x.c.def)] += POINTS[i]); }
  if (r.ok && r.pos === 1 && !best['ch' + r.stage]){ best['ch' + r.stage] = 1; saveBest(); }
  toScreen('results');
}
function nextStage(){
  CH.stage++;
  if (CH.stage >= STAGES.length){ const tb = champTable(); if (tb[0].i === 0){ best.champ = (best.champ || 0) + 1; saveBest(); } toScreen('champEnd'); }
  else startRace('champ', CH.stage);
}
const champTable = () => DRIVERS.map((d, i) => ({ d, i, p: CH.pts[i] })).sort((a, b) => b.p - a.p || a.i - b.i);
function fmtTime(t){ const m = Math.floor(t / 60), s = t - m * 60; return m + "'" + (s < 10 ? '0' : '') + s.toFixed(2).replace('.', '"'); }
// Puesto actual (por distancia recorrida; los que ya han llegado, por orden de llegada).
function racePos(c){
  if (c.finished) return R.finishOrder.indexOf(c) + 1;
  let p = 1; for (const o of R.cars) if (o !== c && (o.finished || o.prog > c.prog)) p++; return p;
}

/* ============================================================
   CONTROLES
   ============================================================ */
function readPad(){
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
  const res = { st: 0, thr: 0, brk: 0, hb: false, a: false, b: false, x: false, y: false, start: false, up: false, down: false, left: false, right: false };
  if (!gp) return res;
  const val = i => gp.buttons[i] ? gp.buttons[i].value : 0;
  const hit = i => { const d = val(i) > 0.5, was = pad.prev[i]; pad.prev[i] = d; return d && !was; };
  const ax = gp.axes[0] || 0;
  res.st = Math.abs(ax) > 0.12 ? (ax - Math.sign(ax) * 0.12) / 0.88 : 0;
  if (gp.buttons[14] && gp.buttons[14].pressed) res.st = -1;
  if (gp.buttons[15] && gp.buttons[15].pressed) res.st = 1;
  res.thr = Math.max(val(7), val(0)); res.brk = Math.max(val(6), val(2)); res.hb = val(1) > 0.5 || val(5) > 0.5;
  res.a = hit(0); res.b = hit(1); res.x = hit(2); res.y = hit(3); res.start = hit(9);
  const h12 = hit(12), h13 = hit(13), h14 = hit(14), h15 = hit(15);
  const sy = gp.axes[1] || 0, vv = Math.abs(sy) > 0.6 ? Math.sign(sy) : 0, hh = Math.abs(ax) > 0.6 ? Math.sign(ax) : 0;
  res.up = h12 || (vv < 0 && pad.vv >= 0); res.down = h13 || (vv > 0 && pad.vv <= 0);
  res.left = h14 || (hh < 0 && pad.hh >= 0); res.right = h15 || (hh > 0 && pad.hh <= 0); pad.vv = vv; pad.hh = hh;
  if (res.thr > 0.1 || res.brk > 0.1 || Math.abs(res.st) > 0.2 || res.a || res.start || res.up || res.down) pad.on = true;
  return res;
}
let PADNOW = readPad();
function readInput(dt){
  const kb = (K.ArrowLeft || K.KeyA ? -1 : 0) + (K.ArrowRight || K.KeyD ? 1 : 0);
  const kThr = K.ArrowUp || K.KeyW ? 1 : 0, kBrk = K.ArrowDown || K.KeyS ? 1 : 0, kHb = !!K.Space;
  if (kb || kThr || kBrk || kHb || !pad.on){
    // teclado: el volante va hacia el tope poco a poco y vuelve al centro más deprisa
    const rate = kb === 0 || Math.sign(kb) !== Math.sign(PL.steer) ? 7 : 3.6;
    PL.steer = toward(PL.steer, kb, rate * dt);
    PL.thr = kThr; PL.brk = kBrk; PL.hb = kHb;
  } else {
    PL.steer = toward(PL.steer, PADNOW.st, 8 * dt);
    PL.thr = PADNOW.thr; PL.brk = PADNOW.brk; PL.hb = PADNOW.hb;
  }
}

/* ============================================================
   CÁMARAS
   ============================================================ */
let camYaw = 0; const camPos = new THREE.Vector3();
const setFov = f => { if (Math.abs(cam.fov - f) > 0.1){ cam.fov = f; cam.updateProjectionMatrix(); } };
function updateCamera(dt){
  if (window.DERRAPE_DEBUG && DERRAPE_DEBUG.camFree) return;          // depuración: cámara colocada a mano
  if (R.mode === 'demo' || ((R.phase === 'done' || R.phase === 'over') && R.endT > 1.2)){ cineCamera(dt, R.mode === 'demo' ? leader() : PL); return; }
  const c = PL, sp = Math.hypot(c.vx, c.vz);
  // la cámara mira entre el morro y la dirección en que se mueve el coche: así se ve el derrape
  const velA = sp > 3 ? Math.atan2(c.vz, c.vx) : c.h, tgtYaw = c.h + angDiff(velA, c.h) * 0.55;
  camYaw += angDiff(tgtYaw, camYaw) * Math.min(1, dt * 4.5);
  const cx = Math.cos(camYaw), cz = Math.sin(camYaw);
  const sh = shake * 0.25, jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
  if (camMode === 1){                                     // capó
    cam.position.set(c.x + Math.cos(c.h) * 0.6 + jx, c.y + 1.45 + jy, c.z + Math.sin(c.h) * 0.6);
    cam.lookAt(c.x + Math.cos(c.h) * 20, c.y + 1.0, c.z + Math.sin(c.h) * 20);
  } else {
    let dist = camMode === 2 ? 11.5 : 7.2, hgt = camMode === 2 ? 4.6 : 2.7;
    if (R.phase === 'count'){ const k = smooth(0, 4.2, R.countT); dist += k * 26; hgt += k * 16; }   // presentación: baja desde lo alto
    camPos.x = c.x - cx * dist; camPos.z = c.z - cz * dist; camPos.y += (c.y + hgt - camPos.y) * Math.min(1, dt * (R.phase === 'count' ? 20 : 6));
    camPos.y = Math.max(camPos.y, locate(TR, camPos.x, camPos.z, c.ti).y + 1.2);
    cam.position.set(camPos.x + jx, camPos.y + jy, camPos.z);
    cam.lookAt(c.x + cx * 3, c.y + 1.1, c.z + cz * 3);
  }
  setFov(60 + clamp(sp, 0, 50) * 0.22);
  shake = Math.max(0, shake - dt * 2.5);
}
const leader = () => R.cars.reduce((a, b) => (b.prog > a.prog ? b : a));
// Cámaras de televisión para la demo del menú y tras la meta: planos que cambian cada pocos segundos.
const shot = { t: 0, kind: 0, spot: -1, x: 0, y: 0, z: 0, side: 1 };
function cineCamera(dt, c){
  shot.t -= dt;
  if (shot.t <= 0){ shot.t = 5 + Math.random() * 2; shot.kind = (shot.kind + 1 + (Math.random() * 2 | 0)) % 4; shot.spot = -1; shot.side = Math.random() < 0.5 ? -1 : 1; }
  const T = TR, fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  if (shot.kind === 0){                                   // cámara fija junto a la pista: el coche se acerca y pasa
    if (shot.spot < 0 || ((c.ti - shot.spot + T.N) % T.N) < T.N / 2 && ((c.ti - shot.spot + T.N) % T.N) > 12){
      shot.spot = (c.ti + 40) % T.N; const off = shot.side * (T.wall + 3);
      shot.x = T.px[shot.spot] - T.tz[shot.spot] * off; shot.z = T.pz[shot.spot] + T.tx[shot.spot] * off; shot.y = groundAt(T, shot.x, shot.z) + 2.5 + Math.random() * 3;
    }
    cam.position.set(shot.x, shot.y, shot.z); cam.lookAt(c.x, c.y + 0.8, c.z);
    setFov(clamp(2 * Math.atan(5 / Math.hypot(c.x - shot.x, c.z - shot.z)) * 57.3, 14, 55));
  } else if (shot.kind === 1){                            // helicóptero: alto, por detrás y a un lado
    cam.position.set(c.x - fx * 22 + rx * shot.side * 12, c.y + 16, c.z - fz * 22 + rz * shot.side * 12); cam.lookAt(c.x + fx * 6, c.y, c.z + fz * 6); setFov(48);
  } else if (shot.kind === 2){                            // a ras de suelo, al lado de la rueda, por delante
    cam.position.set(c.x + fx * 3.2 + rx * shot.side * 2.1, c.y + 0.45, c.z + fz * 3.2 + rz * shot.side * 2.1); cam.lookAt(c.x - fx * 2, c.y + 0.7, c.z - fz * 2); setFov(58);
  } else {                                                // de frente, retrocediendo delante del coche
    cam.position.set(c.x + fx * 9, c.y + 1.6, c.z + fz * 9); cam.lookAt(c.x, c.y + 0.9, c.z); setFov(42);
  }
}

/* ============================================================
   EFECTOS: polvo, grava, nieve, chispas y el fantasma de la contrarreloj
   ============================================================ */
// Partículas: cuadrados planos (como en la consola), con tamaño y transparencia propios, todos en una sola malla de puntos.
const PMAX = 900, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX), pAlpha = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('pcol', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('psize', new THREE.BufferAttribute(pSize, 1)); pGeo.setAttribute('palpha', new THREE.BufferAttribute(pAlpha, 1));
const pMat = new THREE.ShaderMaterial({
  uniforms: { scale: { value: 200 }, fogCol: { value: new THREE.Color() }, fogN: { value: 100 }, fogF: { value: 400 } },
  vertexShader: `attribute vec3 pcol; attribute float psize, palpha; uniform float scale, fogN, fogF; uniform vec3 fogCol; varying vec4 vC;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(floor(psize * scale / -mv.z + 0.5), 1.0, 64.0);
      vC = vec4(mix(pcol, fogCol, smoothstep(fogN, fogF, -mv.z)), palpha); }`,
  fragmentShader: `varying vec4 vC; void main(){ if (vC.a < 0.03) discard; gl_FragColor = vC; }`,
  transparent: true, depthWrite: false
});
const pPoints = new THREE.Points(pGeo, pMat); pPoints.frustumCulled = false; scene.add(pPoints);
let parts = [];
function emit(x, y, z, vx, vy, vz, life, size, grow, col, alpha, grav = 0, drag = 1.5){
  if (parts.length >= PMAX) parts.shift();
  parts.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r: col[0], g: col[1], b: col[2], alpha, grav, drag });
}
const DUST = { arcilla: [0.8, 0.55, 0.36], pinar: [0.52, 0.47, 0.38], nieve: [0.94, 0.96, 1] }, CHIP = { arcilla: [0.45, 0.26, 0.16], pinar: [0.25, 0.2, 0.14], nieve: [0.85, 0.9, 0.98] };
function carEffects(c, dt){
  const sp = Math.hypot(c.vx, c.vz); if (c.air || sp < 3 || R.phase === 'count') return;
  const tm = TR.st.tema, fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx, dust = DUST[tm];
  const rate = (c.player ? 1 : 0.55) * (sp / 22 + c.slip * 3 + (c.offroad ? 1 : 0) + (c.thr > 0.5 && c.slip > 0.25 ? 1 : 0)) * (tm === 'nieve' ? 1.3 : 1);
  c.pe = (c.pe || 0) + rate * dt * 26;
  while (c.pe >= 1){
    c.pe--;
    const sd = Math.random() < 0.5 ? -1 : 1, x = c.x - fx * 1.7 + rx * sd * 0.8, z = c.z - fz * 1.7 + rz * sd * 0.8;
    const k = 0.92 + Math.random() * 0.12;
    emit(x, c.y + 0.25, z, c.vx * 0.2 + rnd(-1.5, 1.5), rnd(0.8, 2.6), c.vz * 0.2 + rnd(-1.5, 1.5), rnd(0.9, 1.8), 0.7, 2.6, [dust[0] * k, dust[1] * k, dust[2] * k], tm === 'nieve' ? 0.7 : 0.5, -0.3, 1.2);
    if (c.slip > 0.25 || c.offroad || (c.thr > 0.6 && sp < 15))       // piedras y terrones que salen despedidos
      emit(x, c.y + 0.3, z, -fx * rnd(3, 8) + rx * sd * rnd(1, 4) + c.vx * 0.3, rnd(1.5, 4), -fz * rnd(3, 8) + rz * sd * rnd(1, 4) + c.vz * 0.3, rnd(0.4, 0.8), 0.12, 0, CHIP[tm], 1, 14, 0.3);
  }
}
function burstAt(x, y, z, n, col, spd, size, life = 0.9){ for (let i = 0; i < n; i++) emit(x, y, z, rnd(-spd, spd), rnd(0.5, spd), rnd(-spd, spd), rnd(life * 0.5, life), size, size * 1.5, col, 0.8, 4, 1.5); }
function updateParts(dt){
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--){
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0){ parts.splice(i, 1); continue; }
    const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += p.grow * dt;
  }
  for (const p of parts){
    const k = p.life / p.max;
    pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z;
    pCol[n * 3] = p.r; pCol[n * 3 + 1] = p.g; pCol[n * 3 + 2] = p.b; pSize[n] = p.size; pAlpha[n] = p.alpha * Math.min(1, k * 1.6); n++;
  }
  pGeo.setDrawRange(0, n);
  for (const a of ['position', 'pcol', 'psize', 'palpha']) pGeo.attributes[a].needsUpdate = true;
  pMat.uniforms.scale.value = 240 / (2 * Math.tan(cam.fov * Math.PI / 360));
  pMat.uniforms.fogCol.value.copy(scene.fog.color); pMat.uniforms.fogN.value = scene.fog.near; pMat.uniforms.fogF.value = scene.fog.far;
}
// Nieve que cae en LA CUMBRE: copos alrededor de la cámara, que vuelven arriba al llegar al suelo.
const FLAKES = 500, fPos = new Float32Array(FLAKES * 3), fGeo = new THREE.BufferGeometry();
for (let i = 0; i < FLAKES; i++){ fPos[i * 3] = rnd(-40, 40); fPos[i * 3 + 1] = rnd(-5, 25); fPos[i * 3 + 2] = rnd(-40, 40); }
fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
const flakes = new THREE.Points(fGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
flakes.frustumCulled = false; scene.add(flakes);
function updateFlakes(dt){
  flakes.visible = TR && TR.st.tema === 'nieve'; if (!flakes.visible) return;
  const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z, t = performance.now() / 1000;
  for (let i = 0; i < FLAKES; i++){
    let y = fPos[i * 3 + 1] - dt * (2.2 + (i % 5) * 0.3); if (y < -6) y += 31; fPos[i * 3 + 1] = y;
    fPos[i * 3] += Math.sin(t + i) * dt * 0.6;
  }
  flakes.position.set(Math.round(ox / 80) * 80, oy, Math.round(oz / 80) * 80);
  for (let i = 0; i < FLAKES; i++){                                // que siempre rodeen a la cámara
    const wx = flakes.position.x + fPos[i * 3], wz = flakes.position.z + fPos[i * 3 + 2];
    if (wx - ox > 40) fPos[i * 3] -= 80; else if (wx - ox < -40) fPos[i * 3] += 80;
    if (wz - oz > 40) fPos[i * 3 + 2] -= 80; else if (wz - oz < -40) fPos[i * 3 + 2] += 80;
  }
  fGeo.attributes.position.needsUpdate = true;
}
// Fantasma de la contrarreloj: la mejor vuelta grabada (posición y rumbo cada 1/20 s), en un coche translúcido.
const GHOST_DT = 0.05;
let ghostCar = null;
const ghostMat = PSX.material(new THREE.MeshBasicMaterial({ color: 0x9cc8ff, transparent: true, opacity: 0.35, depthWrite: false }));
function loadGhost(stage){ try { const g = JSON.parse(localStorage.getItem('derrapeGhost' + stage) || 'null'); return g && g.f && g.f.length > 80 ? g : null; } catch (e){ return null; } }
function saveGhost(stage, g){ try { localStorage.setItem('derrapeGhost' + stage, JSON.stringify({ lap: g.lap, f: g.f.map(v => Math.round(v * 10) / 10) })); } catch (e){} }
function ghostSetup(){
  if (ghostCar){ dyn.remove(ghostCar.g); ghostCar = null; }
  if (R.mode !== 'tt') return;
  R.ghost = loadGhost(R.stage); R.rec = []; R.recT = 0;
  const m = makeCar({ ...PLAYER_DEF, _m: PLAYER_DEF._m }); m.g.traverse(o => { if (o.isMesh) o.material = ghostMat; });
  ghostCar = m; m.g.visible = false; dyn.add(m.g);
}
function ghostTick(dt){
  if (!ghostCar || R.mode !== 'tt') return;
  const G = R.ghost; ghostCar.g.visible = false;
  if (!G || R.phase !== 'race' || PL.lap < 1) return;
  const f = R.lapT / GHOST_DT, i = Math.floor(f), k = f - i, n = G.f.length / 4;
  if (i + 1 >= n) return;
  const a = i * 4, b = a + 4, L = (o) => G.f[a + o] + (G.f[b + o] - G.f[a + o]) * k;
  ghostCar.g.visible = true; ghostCar.g.position.set(L(0), L(1), L(2)); ghostCar.g.rotation.set(0, -(G.f[a + 3] + angDiff(G.f[b + 3], G.f[a + 3]) * k), 0);
}
// Grabación de la vuelta en curso (en la lógica de la carrera, a paso fijo).
function ghostRecord(dt){
  if (R.mode !== 'tt' || !R.rec || R.phase !== 'race' || PL.lap < 1) return;
  R.recT += dt; while (R.recT >= GHOST_DT){ R.recT -= GHOST_DT; R.rec.push(PL.x, PL.y, PL.z, PL.h); }
}
// Al cerrar una vuelta lanzada: si es la mejor, pasa a ser el fantasma.
function ghostLap(lt){
  if (R.mode !== 'tt' || !R.rec) return;
  if (PL.lap >= 2 && R.rec.length > 80 && (!R.ghost || lt < R.ghost.lap)){ R.ghost = { lap: lt, f: R.rec }; saveGhost(R.stage, R.ghost); }
  R.rec = []; R.recT = 0;
}

/* ---------- sonido ----------
   Motor de cuatro cilindros (diente de sierra y cuadrada, saturadas y filtradas), silbido del turbo, grava bajo las
   ruedas, el derrape, el viento y el motor del rival más cercano. Al levantar el pie a altas vueltas, petardeo. */
const SND = {};
function rallyAudio(AC, master){
  const out = AC.createGain(); out.gain.value = 0; out.connect(master); SND.out = out;
  const shaper = AC.createWaveShaper(), curve = new Float32Array(256);
  for (let i = 0; i < 256; i++){ const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.6); } shaper.curve = curve;
  SND.o1 = AC.createOscillator(); SND.o1.type = 'sawtooth'; SND.o2 = AC.createOscillator(); SND.o2.type = 'square';
  const g1 = AC.createGain(), g2 = AC.createGain(); g1.gain.value = 0.55; g2.gain.value = 0.35;
  SND.lp = AC.createBiquadFilter(); SND.lp.type = 'lowpass'; SND.lp.Q.value = 3;
  SND.eg = AC.createGain(); SND.eg.gain.value = 0;
  SND.o1.connect(g1).connect(shaper); SND.o2.connect(g2).connect(shaper); shaper.connect(SND.lp).connect(SND.eg).connect(out);
  SND.tb = AC.createOscillator(); SND.tb.type = 'sine'; SND.tg = AC.createGain(); SND.tg.gain.value = 0; SND.tb.connect(SND.tg).connect(out);
  const noise = (type, f, q) => { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = AC.createGain(); gn.gain.value = 0; s.connect(fl).connect(gn).connect(out); s.start(); return { fl, gn }; };
  SND.road = noise('bandpass', 700, 0.8); SND.slide = noise('bandpass', 1400, 1.2); SND.wind = noise('highpass', 1800, 0.5);
  SND.ro = AC.createOscillator(); SND.ro.type = 'sawtooth'; const rl = AC.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 600;
  SND.rg = AC.createGain(); SND.rg.gain.value = 0;
  if (AC.createStereoPanner){ SND.rp = AC.createStereoPanner(); SND.ro.connect(rl).connect(SND.rg).connect(SND.rp).connect(out); } else SND.ro.connect(rl).connect(SND.rg).connect(out);
  for (const o of [SND.o1, SND.o2, SND.tb, SND.ro]) o.start();
  SND.prevThr = 0; SND.shift = 0;
}
function pop(n = 2){ for (let i = 0; i < n; i++) setTimeout(() => { boom(0.13, 1700, 0.05); if (PL && Math.random() < 0.6) emit(PL.x - Math.cos(PL.h) * 2.2, PL.y + 0.35, PL.z - Math.sin(PL.h) * 2.2, -Math.cos(PL.h) * 3, 0.3, -Math.sin(PL.h) * 3, 0.12, 0.35, 1, [1, 0.6, 0.15], 1); }, 40 + i * rnd(50, 110)); }
function updateAudio(dt){
  if (!SND.out || !AC) return;
  const t = AC.currentTime, live = state0 === 'race' && UI.screen !== 'pause' && R && PL;
  SND.out.gain.setTargetAtTime(live ? 1 : 0, t, 0.15);
  if (!live) return;
  const c = PL, sp = Math.hypot(c.vx, c.vz), f = Math.max(30, c.rpm / 60 * 2), tm = TR.st.tema;
  SND.o1.frequency.setTargetAtTime(f, t, 0.03); SND.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
  SND.lp.frequency.setTargetAtTime(260 + c.thr * 1500 + c.rpm * 0.12, t, 0.05);
  SND.shift = Math.max(0, SND.shift - dt);
  SND.eg.gain.setTargetAtTime((0.035 + c.thr * 0.04) * (SND.shift > 0 ? 0.35 : 1), t, 0.03);
  SND.tb.frequency.setTargetAtTime(1800 + c.rpm * 0.25, t, 0.05); SND.tg.gain.setTargetAtTime(c.thr * clamp((c.rpm - 3000) / 4000, 0, 1) * 0.006, t, 0.1);
  if (SND.prevThr > 0.5 && c.thr < 0.2 && c.rpm > 4800 && !c.air) pop(2 + (Math.random() * 2 | 0));   // petardeo al levantar
  SND.prevThr = c.thr;
  const ground = c.air ? 0 : 1;
  SND.road.fl.frequency.value = tm === 'nieve' ? 2600 : c.offroad ? 450 : tm === 'pinar' ? 560 : 760;
  SND.road.gn.gain.setTargetAtTime(ground * clamp(sp / 40, 0, 1) * (c.offroad ? 0.14 : 0.08), t, 0.05);
  SND.slide.fl.frequency.value = tm === 'nieve' ? 3200 : 1300;
  SND.slide.gn.gain.setTargetAtTime(ground * clamp((c.slip - 0.12) * 2, 0, 1) * clamp(sp / 20, 0, 1) * 0.12, t, 0.04);
  SND.wind.gn.gain.setTargetAtTime(Math.pow(clamp(sp / 50, 0, 1), 2) * 0.04, t, 0.1);
  // el rival más cercano, por su lado
  let near = null, nd = 1e9; for (const o of R.cars) if (o !== c){ const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < nd){ nd = d; near = o; } }
  if (near){
    SND.ro.frequency.setTargetAtTime(Math.max(30, near.rpm / 60 * 2), t, 0.05);
    SND.rg.gain.setTargetAtTime(clamp(1 - nd / 60, 0, 1) * 0.035, t, 0.1);
    if (SND.rp){ const side = (near.x - c.x) * -Math.sin(c.h) + (near.z - c.z) * Math.cos(c.h); SND.rp.pan.setTargetAtTime(clamp(side / 15, -1, 1), t, 0.1); }
  }
}
// Copiloto: dos pitidos de radio cuando aparece una nota nueva.
function radio(){ blip(1500, 0.035); setTimeout(() => blip(1100, 0.05), 70); }

/* ============================================================
   SINCRONIZAR 3D
   ============================================================ */
function syncCars(dt){
  for (const c of R.cars){
    const m = c.m;
    m.g.position.set(c.x, c.y, c.z); m.g.rotation.set(0, -c.h, 0);
    // cabeceo por la pendiente de la pista (en el aire, el morro cae poco a poco)
    const fy = locate(TR, c.x + Math.cos(c.h) * 1.5, c.z + Math.sin(c.h) * 1.5, c.ti).y, by = locate(TR, c.x - Math.cos(c.h) * 1.5, c.z - Math.sin(c.h) * 1.5, c.ti).y;
    m.slope = c.air ? m.slope - dt * 0.25 : Math.atan2(fy - by, 3);
    // balanceo y cabeceo de la carrocería por las fuerzas (visual)
    const latA = c.u * c.r, rollT = clamp(-latA * 0.011, -0.09, 0.09), pitchT = c.air ? 0 : clamp(c.thr * 0.02 - c.brk * 0.04, -0.04, 0.03);
    c.roll += (rollT - c.roll) * Math.min(1, dt * 6); c.pitch += (pitchT - c.pitch) * Math.min(1, dt * 6);
    m.g.rotation.z = m.slope; m.body.rotation.x = c.roll; m.body.rotation.z = c.pitch;
    c.wspin += c.u / 0.34 * dt;
    for (const w of m.wheels){ w.w.rotation.z = -c.wspin * w.side; if (w.front) w.piv.rotation.y = -c.steer * 0.45; }
    // sombra: siempre en el suelo, más pequeña y clara cuanto más alto vuela el coche
    const gy = c.air ? locate(TR, c.x, c.z, c.ti).y : c.y, up = c.y - gy;
    m.shadow.position.set(c.x, gy + 0.05, c.z); m.shadow.rotation.y = -c.h; m.shadow.scale.setScalar(clamp(1 - up * 0.08, 0.5, 1));
    m.shadow.material.opacity = clamp(1 - up * 0.15, 0.3, 1);
    carEffects(c, dt);
  }
  ghostTick(dt); updateParts(dt); updateFlakes(dt);
  sky.position.copy(cam.position);
}

/* ============================================================
   HUD
   ============================================================ */
function drawHud(){
  const r = R;
  if (r.mode === 'champ'){                                // reloj arcade arriba en el centro
    const low = r.clock < 10, blink = low && (performance.now() / 250 | 0) % 2;
    outlined('TIEMPO', W / 2, 9, 9, '#ffe9a0');
    outlined(String(Math.ceil(r.clock)).padStart(2, '0'), W / 2, 26, 20, blink ? '#f03020' : low ? '#ff9040' : '#fff');
    const p = racePos(PL), pw = String(p).length * 16;
    outlined(String(p), 8, 18, 20, p <= 3 ? '#ffe060' : '#ff9040', 'left'); outlined('º', 8 + pw, 14, 9, p <= 3 ? '#ffe060' : '#ff9040', 'left');
    outlined('/' + r.cars.length, 18 + pw, 22, 9, '#cfd4b8', 'left');
  }
  outlined('VUELTA ' + clamp(PL.lap + 1, 1, r.laps) + '/' + r.laps, 8, r.mode === 'champ' ? 36 : 12, 9, '#cfd4b8', 'left');
  outlined(fmtTime(r.t), W - 6, 10, 9, '#cfd4b8', 'right');
  if (r.lapTimes.length) outlined('V ' + fmtTime(Math.min(...r.lapTimes)), W - 6, 22, 9, '#8b9872', 'right');
  if (r.mode === 'tt'){ const b = best['tt' + r.stage]; if (b) outlined('REC ' + fmtTime(b.lap), W - 6, 34, 9, '#58d030', 'right'); }
  drawTach(W - 33, H - 8, 28);
  drawMinimap(8, H - 8 - minimap.h);
  drawNotes();
  if (msgT > 0 && r.phase !== 'count'){ outlined(msg, W / 2, 84, 20, '#ffe9a0'); if (msg2) outlined(msg2, W / 2, 102, 9, '#fff'); }
  const D = r.drift;
  if (D.on && D.sc > 4){                                   // marcador del derrape en curso
    const chain = r.t - D.end < 1.6 ? D.chain + 1 : 1, k = clamp(D.sc / 60, 0, 1);
    outlined('DERRAPE' + (chain > 1 ? ' x' + chain : ''), W / 2, H - 34, 9, '#ff9040');
    g.fillStyle = '#000'; g.fillRect(W / 2 - 41, H - 27, 82, 5); g.fillStyle = k > 0.8 ? '#ffe060' : '#ff9040'; g.fillRect(W / 2 - 40, H - 26, Math.round(80 * k), 3);
  }
  if (PL.wrongT > 1.2 && (performance.now() / 300 | 0) % 2) outlined('SENTIDO CONTRARIO', W / 2, 120, 9, '#f03020');
  if (r.phase === 'count'){
    const n = Math.ceil(r.countT);
    if (n <= 3) outlined(String(n), W / 2, 112, 36, '#ffe060');
    else {                                                // presentación del tramo
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 76, W, 58);
      outlined((r.mode === 'tt' ? 'CONTRARRELOJ' : 'TRAMO ' + (r.stage + 1) + ' DE 3'), W / 2, 86, 9, '#ffe060');
      outlined(TR.st.nombre, W / 2, 104, 20, '#fff'); outlined(TR.st.sub + ' - ' + r.laps + ' VUELTAS', W / 2, 124, 9, '#cfd4b8');
    }
  }
  if (r.phase === 'over') outlined('TIEMPO', W / 2, 112, 36, '#f03020');
}
// Cuentarrevoluciones: media esfera con marcas cada 1000 vueltas, zona roja y aguja; dentro, la marcha; al lado, la velocidad.
function drawTach(cx, cy, R0){
  g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(cx, cy, R0 + 2, Math.PI, TAU); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#c02818'; g.beginPath(); g.arc(cx, cy, R0 - 2, Math.PI + Math.PI * 6.5 / 8, TAU); g.stroke();
  for (let k = 0; k <= 8; k++){
    const a = Math.PI + Math.PI * k / 8, c = Math.cos(a), s2 = Math.sin(a);
    g.fillStyle = k >= 7 ? '#f03020' : '#d8dcc4'; g.fillRect(Math.round(cx + c * (R0 - 5)), Math.round(cy + s2 * (R0 - 5)), 2, 2);
  }
  const a = Math.PI + Math.PI * clamp(PL.rpm / 8000, 0, 1);
  g.lineWidth = 2; g.strokeStyle = '#ff5030'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R0 - 3), cy + Math.sin(a) * (R0 - 3)); g.stroke();
  g.fillStyle = '#000'; g.fillRect(cx - 7, cy - 15, 14, 14);
  outlined(PL.u < -0.5 ? 'R' : String(PL.gear + 1), cx + 1, cy - 8, 9, '#ffe060');
  outlined(String(Math.round(Math.abs(PL.u) * KMH)), cx - R0 - 6, cy - 16, 20, '#fff', 'right');
  outlined('KM/H', cx - R0 - 6, cy - 3, 9, '#cfd4b8', 'right');
}
// Notas del copiloto: la próxima curva (lado y dureza, 6 = rápida … 1 = horquilla) o un salto, unos 150 m antes.
function nextNote(){
  const T = TR; let bestN = null, bd = 1e9;
  for (const n of T.notes){ const d = ((n.i - PL.ti + T.N) % T.N) * T.ds; if (d < bd && d < 160){ bd = d; bestN = n; } }
  return bestN;
}
function drawNotes(){
  if (R.phase !== 'race') return;
  const n = nextNote();
  if (n && n !== R.noteSeen){ R.noteSeen = n; radio(); }
  if (!n) return;
  const cx = W / 2, cy = R.mode === 'champ' ? 54 : 34;
  bevel(cx - 30, cy - 12, 60, 24, '#141a30', false);
  if (n.jump){ outlined('SALTO', cx, cy, 9, '#ffe060'); g.fillStyle = '#ffe060'; g.fillRect(cx - 4, cy - 9, 8, 2); return; }
  // flecha: sube y se dobla hacia el lado; cuanto más cerrada la curva, más se dobla
  const bend = (7 - n.g) * 0.45, d = n.dir, ix = cx - 14 - d * 3, iy = cy + 9;
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix, iy - 7);
  let x = ix, y = iy - 7, a = -Math.PI / 2;
  for (let k = 0; k < 6; k++){ a += d * bend / 6; x += Math.cos(a) * 2.2; y += Math.sin(a) * 2.2; g.lineTo(x, y); }
  g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); g.lineTo(x + Math.cos(a + 2.3) * 3.5, y + Math.sin(a + 2.3) * 3.5); g.lineTo(x + Math.cos(a - 2.3) * 3.5, y + Math.sin(a - 2.3) * 3.5); g.fill();
  outlined(String(n.g), cx + 12, cy + 1, 20, n.g <= 2 ? '#ff7050' : n.g <= 4 ? '#ffe060' : '#9fd060');
}
function drawMinimap(x0, y0){
  const mm = minimap, T = TR;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0 - 2, y0 - 2, mm.w + 4, mm.h + 4);
  g.fillStyle = '#d8dcc4';
  for (let i = 0; i < T.N; i += 4) g.fillRect(Math.round(x0 + (T.px[i] - mm.x0) * mm.S), Math.round(y0 + (T.pz[i] - mm.z0) * mm.S), 1, 1);
  for (const c of R.cars){
    g.fillStyle = c.player ? '#ff3020' : '#ffe060';
    g.fillRect(Math.round(x0 + (c.x - mm.x0) * mm.S) - 1, Math.round(y0 + (c.z - mm.z0) * mm.S) - 1, 3, 3);
  }
}

/* ============================================================
   MENÚS Y PANTALLAS
   Cada pantalla tiene su lista de opciones; se manejan igual con teclado, mando o ratón.
   ============================================================ */
const UI = { screen: 'title', sel: 0, st: 0, t: 0 };
function toScreen(s){ UI.screen = s; UI.sel = 0; UI.t = 0; blip(520, 0.08); }
function toTitle(){ startRace('demo', 0); toScreen('title'); }
const SCREENS = {
  title:    { y: 136, items: () => [['CAMPEONATO', () => { newChampionship(); startRace('champ', 0); }], ['CONTRARRELOJ', () => toScreen('tt')], ['CONTROLES', () => toScreen('controls')], ['SALIR', () => powerOff()]] },
  tt:       { y: 160, back: 'title', items: () => [['< ' + STAGES[UI.st].nombre + ' >', () => startRace('tt', UI.st), d => { UI.st = (UI.st + d + STAGES.length) % STAGES.length; }], ['VOLVER', () => toScreen('title')]] },
  controls: { y: 200, back: 'title', items: () => [['VOLVER', () => toScreen('title')]] },
  pause:    { y: 108, back: null, items: () => [['CONTINUAR', () => { UI.screen = null; }], ['REINICIAR TRAMO', restartStage], ['SALIR AL MENU', toTitle]] },
  results:  { y: 196, items: () => R.ok ? [[CH.stage < STAGES.length - 1 ? 'SIGUIENTE TRAMO' : 'CLASIFICACION FINAL', nextStage]] : [['REINTENTAR TRAMO', restartStage], ['SALIR AL MENU', toTitle]] },
  over:     { y: 140, items: () => [['REINTENTAR TRAMO', restartStage], ['SALIR AL MENU', toTitle]] },
  champEnd: { y: 206, items: () => [['SALIR AL MENU', toTitle]] },
  ttEnd:    { y: 178, items: () => [['REPETIR', restartStage], ['OTRO TRAMO', () => { toTitle(); toScreen('tt'); }], ['SALIR AL MENU', toTitle]] }
};
const itemY = i => SCREENS[UI.screen].y + i * 16;
function menuCmd(cmd){
  const sc = SCREENS[UI.screen]; if (!sc) return;
  const items = sc.items();
  if (cmd === 'up' || cmd === 'down'){ UI.sel = (UI.sel + (cmd === 'up' ? items.length - 1 : 1)) % items.length; blip(330, 0.05); }
  else if ((cmd === 'left' || cmd === 'right') && items[UI.sel][2]){ items[UI.sel][2](cmd === 'left' ? -1 : 1); blip(392, 0.05); }
  else if (cmd === 'ok'){ if (UI.t < 0.35) return; blip(660, 0.1); items[UI.sel][1](); }
  else if (cmd === 'back'){ if (sc.back) toScreen(sc.back); else if (sc.back === null) UI.screen = null; }
}
function itemAt(){ const sc = SCREENS[UI.screen]; if (!sc) return -1; return sc.items().findIndex((o, i) => Math.abs(MS.y - itemY(i)) < 8 && Math.abs(MS.x - W / 2) < 110); }
function menuClick(btn){
  const i = itemAt(); if (i < 0 || btn !== 0) return;
  const it = SCREENS[UI.screen].items()[i]; UI.sel = i;
  if (it[2] && Math.abs(MS.x - W / 2) > 60) menuCmd(MS.x < W / 2 ? 'left' : 'right'); else menuCmd('ok');
}
// Ventana azul de menú con bisel, como la del T-55.
function panel(x, y, w, h){ bevel(x, y, w, h, '#1c2440', false); bevel(x + 3, y + 3, w - 6, h - 6, '#141a30', true); }
function drawItems(){
  const sc = SCREENS[UI.screen];
  sc.items().forEach(([t], i) => {
    const on = i === UI.sel, y = itemY(i);
    outlined(t, W / 2, y, 9, on ? '#ffe9a0' : '#8b9872');
    if (on && (performance.now() / 250 | 0) % 2) outlined('>', W / 2 - t.length * 4 - 12, y, 9, '#f03020');
  });
}
function drawLogo(y){
  outlined('DRIFTING', W / 2 + 2, y + 2, 36, '#a01810'); outlined('DRIFTING', W / 2, y, 36, '#ffe060');
  outlined("RALLY '97", W / 2, y + 28, 20, '#fff');
}
function drawScreen(){
  const s = UI.screen, sc = SCREENS[s];
  if (s === 'title' || s === 'tt' || s === 'controls'){
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, 18); g.fillRect(0, H - 18, W, 18);              // franjas de cine
  }
  if (s === 'title'){
    drawLogo(70);
    drawItems();
    const won = best.champ ? 'CAMPEON x' + best.champ : '';
    if (won) outlined(won, W / 2, 206, 9, '#58d030');
    outlined(pad.on ? 'CRUCETA Y A' : 'FLECHAS Y ENTER', W / 2, H - 9, 9, '#8b9872');
  } else if (s === 'tt'){
    drawLogo(50);
    panel(40, 100, 240, 76);
    outlined('CONTRARRELOJ - 3 VUELTAS', W / 2, 114, 9, '#ffe060');
    const b = best['tt' + UI.st];
    outlined(STAGES[UI.st].sub, W / 2, 132, 9, '#cfd4b8');
    outlined(b ? 'VUELTA ' + fmtTime(b.lap) + '  TOTAL ' + fmtTime(b.tot) : 'SIN TIEMPOS', W / 2, 146, 9, b ? '#58d030' : '#8b9872');
    drawItems();
    outlined(pad.on ? 'IZQ/DER: TRAMO' : '< > ELEGIR TRAMO', W / 2, H - 9, 9, '#8b9872');
  } else if (s === 'controls'){
    panel(16, 26, W - 32, 164);
    outlined('CONTROLES', W / 2, 40, 20, '#ffe060');
    const rows = [['', 'TECLADO', 'MANDO'], ['ACELERAR', 'W / ARRIBA', 'R2 / A'], ['FRENAR', 'S / ABAJO', 'L2 / X'], ['GIRAR', 'A D / < >', 'STICK'],
                  ['FRENO MANO', 'ESPACIO', 'B / R1'], ['CAMARA', 'C', 'Y'], ['PAUSA', 'ESC', 'START']];
    rows.forEach(([a, b, c], i) => { const y = 62 + i * 15, col = i ? '#d8dcc4' : '#ffe060';
      label(a, 26, y, 9, i ? '#8b9872' : col, 'left'); label(b, 128, y, 9, col, 'left'); label(c, 228, y, 9, col, 'left'); });
    label('EL FRENO DE MANO CRUZA EL COCHE.', W / 2, 168, 9, '#cfd4b8'); label('DERRAPAR LARGO DA TIEMPO.', W / 2, 180, 9, '#cfd4b8');
    drawItems();
  } else if (s === 'pause'){
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, W, H);
    panel(60, 60, 200, 100); outlined('PAUSA', W / 2, 80, 20, '#ffe060'); drawItems();
  } else if (s === 'over'){
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H);
    panel(40, 60, 240, 110); outlined('TIEMPO AGOTADO', W / 2, 82, 20, '#f03020');
    outlined('LLEGA A CADA CONTROL ANTES', W / 2, 106, 9, '#cfd4b8'); outlined('DE QUE SE ACABE EL RELOJ', W / 2, 118, 9, '#cfd4b8');
    drawItems();
  } else if (s === 'results'){
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H);
    panel(14, 12, W - 28, 216);
    outlined(TR.st.nombre + ' - RESULTADO', W / 2, 26, 9, '#ffe060');
    R.table.forEach((x, i) => {
      const y = 46 + i * 15, me = x.c.player, col = me ? '#ffe9a0' : '#d8dcc4';
      if (me){ g.fillStyle = '#28346a'; g.fillRect(22, y - 7, W - 44, 14); }
      label((i + 1) + 'º', 28, y, 9, col, 'left'); label(x.c.name, 60, y, 9, col, 'left');
      label(x.est ? '--' : fmtTime(x.t), 214, y, 9, col, 'right');
      if (R.ok) label('+' + POINTS[i], 252, y, 9, '#58d030', 'right');
      label(CH.pts[DRIVERS.indexOf(x.c.def)] + '', W - 26, y, 9, col, 'right');
    });
    label('PTS', W - 26, 34, 9, '#8b9872', 'right');
    if (R.ok) outlined(R.pos === 1 ? '¡GANAS EL TRAMO!' : 'CLASIFICADO', W / 2, 146, 20, '#58d030');
    else { outlined('NO CLASIFICADO', W / 2, 146, 20, '#f03020'); outlined('HAY QUE ACABAR ENTRE LOS 3 PRIMEROS', W / 2, 166, 9, '#cfd4b8'); }
    if (R.ok) outlined('DERRAPES: +' + R.drift.tot.toFixed(1) + ' S  GOLPES: ' + R.hits, W / 2, 166, 9, '#cfd4b8');
    drawItems();
  } else if (s === 'champEnd'){
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H);
    panel(14, 12, W - 28, 216);
    const tb = champTable(), me = tb.findIndex(x => x.i === 0) + 1;
    outlined(me === 1 ? '¡CAMPEON!' : 'CAMPEONATO', W / 2, 30, 20, me === 1 ? '#ffe060' : '#fff');
    tb.forEach((x, i) => { const y = 56 + i * 15, col = x.i === 0 ? '#ffe9a0' : '#d8dcc4';
      if (x.i === 0){ g.fillStyle = '#28346a'; g.fillRect(22, y - 7, W - 44, 14); }
      label((i + 1) + 'º', 28, y, 9, col, 'left'); label(x.d.name, 60, y, 9, col, 'left'); label(x.p + ' PTS', W - 28, y, 9, col, 'right'); });
    outlined(me === 1 ? 'EL TITULO ES TUYO' : 'TERMINAS ' + me + 'º. ¡OTRA VEZ!', W / 2, 160, 9, me === 1 ? '#58d030' : '#cfd4b8');
    drawItems();
  } else if (s === 'ttEnd'){
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H);
    panel(30, 20, W - 60, 196);
    outlined(TR.st.nombre, W / 2, 36, 20, '#ffe060');
    R.lapTimes.forEach((t, i) => label('VUELTA ' + (i + 1) + '   ' + fmtTime(t), W / 2, 64 + i * 14, 9, t === Math.min(...R.lapTimes) ? '#ffe9a0' : '#d8dcc4'));
    label('TOTAL   ' + fmtTime(R.t), W / 2, 112, 9, '#fff');
    if (R.newLap) outlined('¡RECORD DE VUELTA!', W / 2, 134, 9, '#58d030');
    if (R.newTot) outlined('¡RECORD DEL TRAMO!', W / 2, 148, 9, '#58d030');
    drawItems();
  }
}
// Cursor de bloques para el ratón en los menús.
function drawCursor(){
  if (pad.on || !MS.seen || !UI.screen) return;
  const x = Math.round(MS.x), y = Math.round(MS.y);
  g.fillStyle = '#000'; g.fillRect(x - 3, y - 3, 7, 7); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 2, 5, 5);
}

/* ============================================================
   BUCLE
   ============================================================ */
function frame(dt){
  PADNOW = readPad();
  if (msgT > 0) msgT -= dt;
  UI.t += dt;
  if (!R) startRace('demo', 0);
  // mando en los menús
  if (UI.screen){
    if (PADNOW.up) menuCmd('up'); if (PADNOW.down) menuCmd('down'); if (PADNOW.left) menuCmd('left'); if (PADNOW.right) menuCmd('right');
    if (PADNOW.a) menuCmd('ok'); if (PADNOW.b) menuCmd('back'); if (PADNOW.start) (UI.screen === 'pause' ? menuCmd('back') : menuCmd('ok'));
  } else if (state0 === 'race'){
    if (PADNOW.start) toScreen('pause');
    if (PADNOW.y) camMode = (camMode + 1) % 3;
  }
  if (UI.screen !== 'pause') updateRace(dt);
  syncCars(dt); updateCamera(dt);
  updateAudio(dt);
  if (post) post.dibujar(scene, cam);
  g.clearRect(0, 0, W, H);
  if (state0 === 'race' && UI.screen !== 'results' && UI.screen !== 'champEnd' && UI.screen !== 'ttEnd') drawHud();
  if (UI.screen) drawScreen();
  drawCursor();
}

/* ---------- teclado y ratón ---------- */
const MS = { x: 160, y: 120, seen: false };
const mio = () => VIBE.activo === JUEGO && state !== 'off' && state !== 'boot';
addEventListener('keydown', ev => {
  if (!mio()) return;
  const nav = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back' }[ev.code];
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(ev.code)) ev.preventDefault();
  pad.on = false;
  if (UI.screen){ if (nav && !ev.repeat) menuCmd(nav); return; }
  if (ev.code === 'Escape'){ if (state0 === 'race') toScreen('pause'); return; }
  if (ev.code === 'KeyC' && !ev.repeat) camMode = (camMode + 1) % 3;
  K[ev.code] = true;
});
addEventListener('keyup', ev => { if (mio()) K[ev.code] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; });
const toScr = ev => { const r = cv.getBoundingClientRect(); MS.x = (ev.clientX - r.left) / S; MS.y = (ev.clientY - r.top) / S; MS.seen = true; };
addEventListener('mousemove', ev => {
  if (!mio()) return;
  toScr(ev); pad.on = false;
  if (UI.screen){ const i = itemAt(); if (i >= 0 && i !== UI.sel){ UI.sel = i; blip(330, 0.04); } }
});
addEventListener('mousedown', ev => { if (!mio()) return; ev.preventDefault(); audioInit(); toScr(ev); if (UI.screen) menuClick(ev.button); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mio() && state0 === 'race' && !UI.screen) toScreen('pause'); });

/* ---------- música ----------
   Una canción en seis variaciones (juegos/rally/musica.js, hecha con juegos/rally/herramientas/render-music.js).
   La consola la reproduce; aquí solo se decide cuál toca. En la cuenta atrás, silencio. */
function musicMode(){
  if (!R || state0 === 'menu') return 'menu';
  if (UI.screen === 'pause') return 'pause';
  if (UI.screen === 'over' || R.phase === 'over') return 'over';
  if (UI.screen || R.phase === 'done') return 'results';
  if (R.phase === 'count') return null;
  return PL.lap >= R.laps - 1 || (R.mode === 'champ' && R.clock < 10) ? 'final' : 'race';
}

/* ---------- portada y disco ---------- */
// El coche de la portada es el modelo del juego, fotografiado de tres cuartos y cruzado, como en pleno derrape.
let carArt = null;
function prepararArte(){
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff0e0, 0x403020, 0.9));
  const d = new THREE.DirectionalLight(0xffe0b0, 0.9); d.position.set(-3, 5, 4); sc.add(d);
  const m = makeCar({ ...PLAYER_DEF }); m.g.rotation.set(0, -0.5, 0); m.body.rotation.x = -0.06;
  for (const w of m.wheels) if (w.front) w.piv.rotation.y = 0.35;
  sc.add(m.g);
  const cm = new THREE.PerspectiveCamera(30, 1, 0.5, 100); cm.position.set(6.2, 2.6, 7.4); cm.lookAt(-0.2, 0.55, 0);
  carArt = foto3D(sc, cm, 256);
}
// Arte sin letras (246×250): atardecer, montañas, polvo levantado y el coche.
function arte(c, w, h){
  const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#20306c'); sky.addColorStop(0.45, '#c8582c'); sky.addColorStop(0.7, '#f4b048');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffe8a0'; c.beginPath(); c.arc(w * 0.72, 118, 22, 0, TAU); c.fill();
  c.fillStyle = '#6a3a3c'; c.beginPath(); c.moveTo(0, 150);
  for (let x = 0; x <= w; x += 12) c.lineTo(x, 140 - Math.abs(Math.sin(x * 0.04)) * 26 - Math.sin(x * 0.11) * 6); c.lineTo(w, 170); c.lineTo(0, 170); c.fill();
  c.fillStyle = '#8a4a28'; c.fillRect(0, 160, w, h - 160);
  c.fillStyle = '#a85a30'; for (let i = 0; i < 90; i++) c.fillRect((i * 53) % w, 164 + (i * 29) % 80, 4, 1);
  for (let i = 0; i < 40; i++){                                              // nube de polvo detrás del coche
    const x = 20 + (i * 37) % 120, y = 150 + (i * 23) % 50, r = 10 + (i * 7) % 18;
    c.fillStyle = 'rgba(214,150,96,' + (0.25 + (i % 4) * 0.08).toFixed(2) + ')'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.strokeStyle = 'rgba(255,240,200,.55)'; c.lineWidth = 1;                // rayas de velocidad
  for (let i = 0; i < 9; i++){ const y = 120 + i * 12; c.beginPath(); c.moveTo(0, y); c.lineTo(60 + (i * 17) % 40, y + 6); c.stroke(); }
  if (carArt) c.drawImage(carArt, -6, 40, 262, 262);
}
function logo(c, w){
  const ax = w / 2;
  c.save(); c.translate(ax, 30); c.transform(1, 0, -0.18, 1, 0, 0);       // letras inclinadas, de carreras
  c.font = '24px ' + FONT; c.fillStyle = '#000'; c.fillText('DRIFTING', 3, 3); c.fillStyle = '#c02818'; c.fillText('DRIFTING', 1, 1); c.fillStyle = '#ffe060'; c.fillText('DRIFTING', 0, 0);
  c.restore();
  c.font = '16px ' + FONT; c.fillStyle = '#000'; c.fillText("RALLY '97", ax + 2, 58); c.fillStyle = '#fff'; c.fillText("RALLY '97", ax, 56);
}

const JUEGO = VIBE.registrar({
  num: '02', titulo: 'DRIFTING', genero: 'RACING',
  arte, logo, preparar: prepararArte,
  manual: 'juegos/rally/manual.pdf',
  musica: { pistas: window.DERRAPE_MUSIC, bucles: window.DERRAPE_LOOP, volumen: 0.4, rapidas: ['pause'] },
  modoMusica: musicMode,
  redimensionar(cw, ch){ if (renderer) renderer.setSize(cw, ch); },
  audio: rallyAudio,
  precargar(){ if (!R){ startRace('demo', 0); UI.screen = 'title'; } try { renderer.compile(scene, cam); } catch (e){} },
  encender(){ state = 'on'; cv.style.cursor = 'none'; startRace('demo', 0); UI.screen = 'title'; UI.sel = 0; UI.t = 0; },
  fotograma: frame,
  apagar(){ for (const k in K) K[k] = false; UI.screen = 'title'; if (SND.out && AC) SND.out.gain.setTargetAtTime(0, AC.currentTime, 0.05); }
});
// Para probar desde la consola del navegador: DERRAPE_DEBUG.sim(segundos, true) corre la carrera sin dibujar,
// con el jugador en piloto automático (lo conduce la misma IA que a los rivales).
window.DERRAPE_DEBUG = { get R(){ return R; }, get TR(){ return TR; }, get PL(){ return PL; }, get UI(){ return UI; }, K, startRace, newChampionship, STAGES, cam, camFree: false, carAtlas, PLAYER_DEF, RIVALS, toScreen, menuCmd,
  sim(sec, auto){ R.auto = auto; for (let t = 0; t < sec && R.phase !== 'done' && R.phase !== 'over'; t += 1 / 60) updateRace(1 / 60); return R.phase; } };
}
