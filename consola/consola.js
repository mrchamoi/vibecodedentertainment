/* ============================================================
   VIBECODED — LA CONSOLA
   Todo lo que no es de ningún juego: la tele (con sus perillas), la estantería con la caja 3D, el disco y el
   manual, el sonido general y la música, la secuencia de arranque y el aviso para móviles.
   Los juegos viven en juegos/<nombre>/ y se dan de alta con VIBE.registrar({...}); ver JUEGOS.md.
   Todos los <script> de la página comparten el ámbito global: lo que se declara aquí (g, W, H, S, label, boom…)
   lo pueden usar los juegos directamente.
   ============================================================ */
'use strict';
if (!window.THREE) document.body.innerHTML = '<p style="padding:24px">No se pudo cargar vendor/three.min.js: la carpeta vendor debe ir junto a index.html.</p>';

// La pantalla de la tele: un lienzo 2D (#c) de 320×240 encima de un lienzo para WebGL (#gl) del mismo tamaño.
// W, H, VH van en píxeles de esa pantalla; S es el factor de ampliación a píxeles reales.
const cv = document.getElementById('c'), glCv = document.getElementById('gl');
let g = cv.getContext('2d');                         // «let»: se puede dibujar en otro lienzo cambiando g un momento
const tvc = document.getElementById('tv'), crt = document.getElementById('crt');
const FONT = '"Press Start 2P", monospace';
let W = 320, H = 240, VH = 240, S = 1;
if (document.fonts) document.fonts.load('8px "Press Start 2P"');
// Estado de la consola: 'off' (tele apagada, estantería) → 'boot' (logo de arranque) → lo que use el juego.
// Mientras un juego está encendido, state es suyo; solo 'off' y 'boot' están reservados.
let state = 'off';

/* ---------- utilidades ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const toward = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const rnd = (a, b) => a + Math.random() * (b - a);

const TVSET = { vol: 0.7, bri: 0.5 };               // perillas de la tele (0..1); se recuerdan entre visitas
try { const v = +localStorage.getItem('vibeVol'), b = +localStorage.getItem('vibeBri'); if (localStorage.getItem('vibeVol') !== null) TVSET.vol = clamp(v, 0, 1); if (localStorage.getItem('vibeBri') !== null) TVSET.bri = clamp(b, 0, 1); } catch (e){}

/* ---------- registro de juegos ---------- */
// Cada juego llama a VIBE.registrar({...}) desde su propio archivo. Ver JUEGOS.md para todos los campos.
const VIBE = { juegos: [], activo: null, mando: false };
VIBE.registrar = def => { VIBE.juegos.push(def); VIBE.juegos.sort((a, b) => String(a.num).localeCompare(String(b.num))); return def; };
// Llama a un método opcional del juego activo (o de uno concreto), si lo tiene.
const hook = (j, nombre, ...args) => j && typeof j[nombre] === 'function' ? j[nombre](...args) : undefined;

// ---------- El televisor ----------
// Sprite de 424×292 dibujado a mano: mueble de madera, frontal de plástico, tubo, mandos y altavoz.
// La pantalla del juego (320×240) encaja en el hueco que empieza en (SCRX, SCRY).
const TVW = 424, TVH = 292, SCRX = 24, SCRY = 20;
function drawTV(on){
  tvc.width = TVW; tvc.height = TVH;
  const c = tvc.getContext('2d'), R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const bev = (x, y, w, h, hi, lo) => { R(x, y, w, 2, hi); R(x, y, 2, h, hi); R(x, y + h - 2, w, 2, lo); R(x + w - 2, y, 2, h, lo); };
  R(36, TVH - 10, 40, 10, '#17110c'); R(TVW - 76, TVH - 10, 40, 10, '#17110c');          // patas
  R(0, 0, TVW, TVH - 8, '#5c3d24');                                                        // mueble de madera
  for (let y = 2; y < TVH - 10; y += 2){                                                   // veta
    let x = (y * 37) % 23;
    while (x < TVW){ const w = 14 + (x * 7 + y * 13) % 46; R(x, y, w, 1, (x + y) % 3 ? '#523520' : '#6a482c'); x += w + 6 + (x + y) % 17; }
  }
  bev(0, 0, TVW, TVH - 8, '#8a6442', '#2a1a0e');
  R(8, 8, TVW - 16, TVH - 24, '#28282b'); bev(8, 8, TVW - 16, TVH - 24, '#0e0e10', '#4a4a50');   // frontal de plástico, hundido
  R(SCRX - 8, SCRY - 8, 336, 256, '#0c0c0e'); bev(SCRX - 8, SCRY - 8, 336, 256, '#3c3c42', '#000');   // marco del tubo
  R(SCRX - 2, SCRY - 2, 324, 244, '#050506'); R(SCRX, SCRY, 320, 240, '#000');
  const x0 = SCRX + 320 + 14;                                                              // panel de mandos (52 px)
  c.font = '8px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; drawSpark(c, x0 + 26, 21, 12);                 // la marca de la tele es solo el logo
  for (const [cy, r] of [[58, 16], [104, 12]]){                                            // ruedas de canal y volumen
    c.fillStyle = '#0a0a0c'; c.beginPath(); c.arc(x0 + 26, cy + 1, r + 2, 0, 7); c.fill();
    c.fillStyle = '#b8b09a'; c.beginPath(); c.arc(x0 + 26, cy, r, 0, 7); c.fill();
    c.fillStyle = '#e0d8c0'; c.beginPath(); c.arc(x0 + 24, cy - 2, r - 4, 0, 7); c.fill();
    c.fillStyle = '#8a836f'; c.beginPath(); c.arc(x0 + 26, cy, r - 5, 0, 7); c.fill();
    const a = (-135 + (cy === 58 ? TVSET.vol : TVSET.bri) * 270 - 90) * Math.PI / 180;     // la marca gira 270° con el valor
    for (let k = 3; k < r - 1; k++) R(Math.round(x0 + 25 + Math.cos(a) * k), Math.round(cy - 1 + Math.sin(a) * k), 2, 2, '#2a2a2c');
    for (let i = 0; i < 10; i++){ const a = i * 0.628; R(Math.round(x0 + 26 + Math.cos(a) * (r + 5)), Math.round(cy + Math.sin(a) * (r + 5)), 1, 1, '#77777c'); }
  }
  R(x0 + 1, 40, 3, 4, '#9a9a9f'); R(x0 + 4, 38, 2, 8, '#9a9a9f'); R(x0 + 7, 40, 1, 4, '#9a9a9f');   // icono: altavoz (volumen)
  R(x0 + 3, 92, 3, 3, '#9a9a9f'); for (const [dx, dy] of [[4, -3], [4, 5], [0, 1], [8, 1]]) R(x0 + dx, 91 + dy, 1, 1, '#9a9a9f');   // icono: sol (brillo)
  for (let i = 0; i < 3; i++){ R(x0 + 2 + i * 17, 128, 14, 7, '#0a0a0c'); R(x0 + 3 + i * 17, 129, 12, 4, '#55555a'); }   // botones
  R(x0, 146, 52, 106, '#141416'); for (let y = 148; y < 250; y += 4) R(x0 + 2, y, 48, 2, '#060607');            // altavoz
  R(x0 + 4, 258, 6, 6, '#400a06'); if (on){ R(x0 + 5, 259, 4, 4, '#ff3a20'); R(x0 + 6, 260, 1, 1, '#ffd0c0'); } else R(x0 + 5, 259, 4, 4, '#1c0806');   // piloto
  c.fillStyle = '#77777c'; c.textAlign = 'left'; c.fillText('ON', x0 + 14, 262);
}
// Cristal del tubo, por encima del juego: líneas de barrido, viñeta, reflejo y esquinas redondeadas.
function drawCRT(cw, ch){
  crt.width = cw; crt.height = ch;
  const c = crt.getContext('2d');
  if (S >= 2){ c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = S - 1; y < ch; y += S) c.fillRect(0, y, cw, 1); }
  const v = c.createRadialGradient(cw / 2, ch / 2, ch * 0.45, cw / 2, ch / 2, cw * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = v; c.fillRect(0, 0, cw, ch);
  const gl = c.createLinearGradient(0, 0, cw * 0.6, ch * 0.6);
  gl.addColorStop(0, 'rgba(255,255,255,.07)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(0, 0, cw, ch);
  c.fillStyle = '#050506'; c.beginPath(); c.rect(0, 0, cw, ch); c.roundRect(0, 0, cw, ch, 10 * S); c.fill('evenodd');
}
function resize(){
  const RW = innerWidth, RH = innerHeight - 34;                                // hueco abajo para el aviso de bajar
  const place = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  S = Math.min(RW / TVW, RH / TVH); if (S >= 1) S = Math.floor(S);                         // la tele entera, a múltiplo entero
  const tw = TVW * S, th = TVH * S, tx = Math.round((RW - tw) / 2), ty = Math.round((RH - th) / 2), cw = W * S, ch = H * S;
  const OX = tx + SCRX * S, OY = ty + SCRY * S;
  cv.width = W; cv.height = H;
  place(tvc, tx, ty, tw, th); place(cv, OX, OY, cw, ch); place(crt, OX, OY, cw, ch);
  for (const j of VIBE.juegos) hook(j, 'redimensionar', cw, ch);                 // cada juego ajusta su 3D (si lo tiene)
  place(glCv, OX, OY, cw, ch);
  drawCRT(cw, ch);
}
addEventListener('resize', resize);

/* ---------- sonido ---------- */
// AC y master se crean con el primer clic (los navegadores no dejan sonar nada antes). Todo pasa por master,
// que es la perilla de volumen de la tele. boom() y blip() son efectos rápidos que puede usar cualquier juego.
let AC, master, noiseBuf;
function audioInit(){
  if (AC){ if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new AudioContext();
    master = AC.createGain(); master.gain.value = TVSET.vol; master.connect(AC.destination);   // todo el sonido pasa por la perilla de volumen
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    MUS.gain = AC.createGain(); MUS.gain.gain.value = 0.3; MUS.gain.connect(master);
    for (const j of VIBE.juegos) hook(j, 'audio', AC, master);                    // sonidos propios de cada juego
    if (VIBE.activo) loadMusic(VIBE.activo);
  } catch (e){ AC = null; }
}

function boom(vol, freq, dur){
  if (!AC) return;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const ga = AC.createGain(), t = AC.currentTime;
  ga.gain.setValueAtTime(vol, t); ga.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(ga).connect(master); s.start(); s.stop(t + dur);
}
function blip(freq, dur = 0.12){
  if (!AC) return;
  const o = AC.createOscillator(), ga = AC.createGain(), t = AC.currentTime;
  o.type = 'square'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.8, t + dur);
  ga.gain.setValueAtTime(0.08, t); ga.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(ga).connect(master); o.start(); o.stop(t + dur);
}

/* ---------- música ----------
   Cada juego trae su canción en varias variaciones (pistas OGG en base64, con sus puntos de bucle) y dice en cada
   momento cuál toca con modoMusica(). La consola cambia de variación con un fundido corto, entrando en el mismo
   punto de la canción para que la melodía siga sin saltos. */
const MUS = { gain: null, buf: {}, cur: null, mode: '', rate: 1, lastSw: 0, de: null };
function loadMusic(j){
  if (!AC || !j || !j.musica || MUS.de === j) return;
  MUS.de = j; MUS.buf = {};
  const { pistas = {}, bucles = {} } = j.musica;
  if (j.musica.volumen != null) MUS.gain.gain.value = j.musica.volumen;
  for (const k of Object.keys(pistas)){
    const bin = atob(pistas[k]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    AC.decodeAudioData(a.buffer).then(b => { if (MUS.de === j) MUS.buf[k] = sealLoop(b, bucles[k]); }).catch(() => {});
  }
}

// Cada pista trae música de sobra antes y después del tramo que se repite ([ls, le] en T55_LOOP).
// Para que la costura no se note, el principio del tramo se funde con lo que sonaba justo después del final:
// al saltar del final al principio, la onda sigue exactamente igual que si no hubiera salto.
function sealLoop(b, lp){
  if (!lp){ b.ls = 0; b.le = b.duration; return b; }
  const sr = b.sampleRate, a = Math.round(lp[0] * sr), e = Math.round(lp[1] * sr), F = Math.min(Math.round(sr * 0.05), b.length - e, e - a);
  for (let c = 0; c < b.numberOfChannels; c++){
    const d = b.getChannelData(c);
    for (let i = 0; i < F; i++){ const w = i / F; d[a + i] = d[e + i] * (1 - w) + d[a + i] * w; }
  }
  b.ls = a / sr; b.le = e / sr; return b;
}
// modoMusica() del juego devuelve el nombre de la pista, o [nombre, velocidad] (1 = normal), o null para silencio.
function musicTick(){
  if (!AC || AC.state !== 'running' || !MUS.gain) return;
  let m = state === 'off' || state === 'boot' ? null : hook(VIBE.activo, 'modoMusica'), rate = 1;
  if (Array.isArray(m)) [m, rate] = m;
  const now = AC.currentTime;
  if (!m){ if (MUS.cur){ MUS.cur.g.gain.setTargetAtTime(0, now, 0.3); MUS.cur.src.stop(now + 2); MUS.cur = null; MUS.mode = ''; } return; }
  const buf = MUS.buf[m];
  if (!buf || (m === MUS.mode && rate === MUS.rate)) return;
  const quick = (VIBE.activo.musica && VIBE.activo.musica.rapidas) || [];      // pistas que entran y salen sin esperar
  const fast = quick.includes(m) || quick.includes(MUS.mode);
  if (MUS.cur && !fast && now - MUS.lastSw < 1.2) return;                    // sin cambios a cada rato
  let frac = 0;
  if (MUS.cur){
    const c = MUS.cur, len = c.le - c.ls; frac = ((c.off - c.ls + (now - c.t0) * c.rate) % len) / len;   // en qué punto de la canción iba
    c.g.gain.cancelScheduledValues(now); c.g.gain.setTargetAtTime(0, now, 0.18); c.src.stop(now + 1.2);
  }
  const src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; src.loop = true; src.loopStart = buf.ls; src.loopEnd = buf.le; src.playbackRate.value = rate;
  g.gain.setValueAtTime(0, now); g.gain.setTargetAtTime(1, now, fast ? 0.06 : 0.18);
  const off = buf.ls + frac * (buf.le - buf.ls); src.connect(g).connect(MUS.gain); src.start(now, off);
  MUS.cur = { src, g, t0: now, off, rate, ls: buf.ls, le: buf.le }; MUS.mode = m; MUS.rate = rate; MUS.lastSw = now;
}

/* ---------- piezas de dibujo para la pantalla (en g, a 320×240) ---------- */
// Texto en fuente de píxel, siempre en mayúsculas y en múltiplos de 8 px para que salga nítido.
const fpx = sz => sz >= 36 ? 24 : sz >= 20 ? 16 : 8;
function label(t, x, y, sz = 11, col = '#cfd4b8', al = 'center'){
  g.font = fpx(sz) + 'px ' + FONT; g.fillStyle = col; g.textAlign = al; g.textBaseline = 'middle';
  g.fillText(String(t).toUpperCase(), Math.round(x), Math.round(y) + 1);
}
function outlined(t, x, y, sz, col, al){ label(t, x + 1, y + 1, sz, '#000', al); label(t, x, y, sz, col, al); }
// Caja con bisel de 1 px: en relieve o hundida.
function bevel(x, y, w, h, fill, inset){
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  g.fillStyle = inset ? '#0b0e09' : '#8b9872'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = inset ? '#8b9872' : '#0b0e09'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
}
const BTN_COL = { A: '#34a23a', B: '#d83030', X: '#2f6fd8', Y: '#e0b020' };   // colores de los botones del mando
function hBtn(x, y, t, r = 6){                       // botón redondo del mando, con su color y su letra
  g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r + 1, 0, TAU); g.fill();
  g.fillStyle = BTN_COL[t]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(x - r / 3, y - r / 3, r / 3, 0, TAU); g.fill();
  label(t, x + 1, y + 1, 9, '#000'); label(t, x, y, 9, '#fff');
}
function hStick(x, y, t){                            // stick analógico: base, corona y seta con su letra, y flechas a los lados
  g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fill();
  g.fillStyle = '#4a4e47'; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
  g.fillStyle = '#1c1d1a'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
  g.fillStyle = '#6a7064'; g.beginPath(); g.arc(x, y - 1, 6, 0, TAU); g.fill();
  g.fillStyle = '#2c2f2a'; g.beginPath(); g.arc(x, y - 1, 5, 0, TAU); g.fill();
  label(t, x, y - 1, 9, '#d8dcc4');
  g.fillStyle = '#58d030'; for (const d of [-1, 1]) for (let i = 0; i < 3; i++) g.fillRect(x + d * (13 + i) - (d < 0 ? 0 : 1), y - (2 - i), 1, (2 - i) * 2 + 1);   // flechas hacia fuera
}

/* ---------- perillas de la tele ---------- */
// Perillas de la tele: la de arriba es el volumen y la de abajo el brillo. Se giran arrastrando o con la rueda.
const KNOBS = [{ k: 'vol', x: 384, y: 58, r: 21 }, { k: 'bri', x: 384, y: 104, r: 17 }];
let knob = null;
const knobAt = ev => { const r = tvc.getBoundingClientRect(), x = (ev.clientX - r.left) / S, y = (ev.clientY - r.top) / S; return KNOBS.find(o => Math.hypot(x - o.x, y - o.y) < o.r) || null; };
function applyTV(){
  if (master) master.gain.value = TVSET.vol;
  cv.style.filter = glCv.style.filter = 'brightness(' + (0.35 + TVSET.bri * 1.3).toFixed(2) + ')';   // 0.5 = imagen normal
  try { localStorage.setItem('vibeVol', TVSET.vol.toFixed(2)); localStorage.setItem('vibeBri', TVSET.bri.toFixed(2)); } catch (e){}
  drawTV(state !== 'off');
}
addEventListener('wheel', ev => {
  const kn = knobAt(ev); if (!kn) return;
  ev.preventDefault(); TVSET[kn.k] = clamp(TVSET[kn.k] - Math.sign(ev.deltaY) * 0.05, 0, 1); applyTV(); if (kn.k === 'vol') blip(440, 0.06);
}, { passive: false });
// Las perillas se atienden antes que el juego: si se agarra una, el juego no se entera del clic.
addEventListener('mousedown', ev => {
  const kn = ev.button === 0 && knobAt(ev);
  if (kn){ ev.preventDefault(); ev.stopImmediatePropagation(); audioInit(); knob = { o: kn, x: ev.clientX, y: ev.clientY, v: TVSET[kn.k] }; }
});
addEventListener('mousemove', ev => {
  if (knob){ ev.stopImmediatePropagation(); TVSET[knob.o.k] = clamp(knob.v + ((knob.y - ev.clientY) + (ev.clientX - knob.x)) / (70 * S), 0, 1); applyTV(); return; }
  tvc.style.cursor = knobAt(ev) ? 'grab' : '';
});
addEventListener('mouseup', ev => { if (knob){ ev.stopImmediatePropagation(); if (knob.o.k === 'vol') blip(440, 0.06); knob = null; } });
addEventListener('contextmenu', ev => { if (state !== 'off') ev.preventDefault(); });

/* ============================================================
   CARÁTULA, DISCO Y ENCENDIDO DE LA TELE
   ============================================================ */
// Logo: la chispa de Claude con los cuatro colores del logo de PlayStation, y sombra dura.
const PSC = ['#e8402c', '#f0c020', '#30a860', '#3878d8'];
function drawSpark(c, cx, cy, r, grow = 1){
  const N = 12, len = [1, 0.7, 0.92, 0.66, 0.98, 0.74, 0.9, 0.68, 1, 0.72, 0.94, 0.7];
  for (const sh of [1, 0]) for (let i = 0; i < N; i++){
    const a = i * TAU / N - Math.PI / 2 + 0.13, L = r * len[i] * grow, w = r * 0.13, r0 = r * 0.1, o = sh ? Math.max(1, r * 0.07) : 0;
    const ca = Math.cos(a), sa = Math.sin(a), x = cx + o, y = cy + o;
    c.fillStyle = sh ? '#000' : PSC[Math.floor(i / 3) % 4];
    c.beginPath();
    c.moveTo(x + ca * r0 - sa * w * 0.45, y + sa * r0 + ca * w * 0.45); c.lineTo(x + ca * L - sa * w, y + sa * L + ca * w);
    c.lineTo(x + ca * L + sa * w, y + sa * L - ca * w); c.lineTo(x + ca * r0 + sa * w * 0.45, y + sa * r0 - ca * w * 0.45);
    c.fill();
  }
}

const caseCv = document.getElementById('case');
const coverC = document.createElement('canvas'), discC = document.createElement('canvas'), bookC = document.createElement('canvas');
let cr, cScene, cCam, caseG, lidPivot, disc, caseTray, bookMesh, coverTex, discTex, bookTex, bootT = 0, caseT = 0;
const CM = { x: 0, y: 0, over: false }, ins = { on: false, t: 0, scrolled: false }, CASE = { open: false, t: 0, lift: 0 };

// Una foto de una escena 3D (por ejemplo, el modelo del juego) para usarla en la portada. Devuelve un lienzo N×N
// con fondo transparente. Se puede llamar desde preparar() del juego, cuando la caja ya existe.
function foto3D(escena, camara, N = 256){
  const rtA = new THREE.WebGLRenderTarget(N, N);
  cr.setRenderTarget(rtA); cr.setClearColor(0x000000, 0); cr.clear(); cr.render(escena, camara);
  const px = new Uint8Array(N * N * 4); cr.readRenderTargetPixels(rtA, 0, 0, N, N, px); cr.setRenderTarget(null); rtA.dispose();
  const out = document.createElement('canvas'); out.width = out.height = N;
  const ctx = out.getContext('2d'), id = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) id.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);   // la lectura viene boca abajo
  ctx.putImageData(id, 0, 0); return out;
}
// Portada estilo PSX americana: franja negra a la izquierda con el logo, la marca en vertical y el número de disco;
// a la derecha, el arte del juego (arte) y encima su título (logo, o el título en texto si no lo trae).
// El disco lleva el mismo arte sin letras. Si el juego trae portada(c, w, h) o disco(c, n), se usan esos en su lugar.
const CW = 284, CH = 250, SW = 38;
function paintCover(j, c){
  const ax = SW + (CW - SW) / 2;
  c.fillStyle = '#222'; c.fillRect(0, 0, CW, CH);
  if (j.portada){ j.portada(c, CW, CH); return; }
  c.save(); c.translate(SW, 0); c.beginPath(); c.rect(0, 0, CW - SW, CH); c.clip(); hook(j, 'arte', c, CW - SW, CH); c.restore();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (j.logo){ c.save(); c.translate(SW, 0); j.logo(c, CW - SW, CH); c.restore(); }
  else { c.font = '16px ' + FONT; c.fillStyle = '#000'; c.fillText(j.titulo, ax + 2, 32); c.fillStyle = '#fff'; c.fillText(j.titulo, ax, 30); }
  if (j.genero){ c.font = '8px ' + FONT; const w = c.measureText(j.genero).width + 10; c.fillStyle = '#000'; c.fillRect(CW - w - 4, CH - 16, w, 12); c.fillStyle = '#fff'; c.fillText(j.genero, CW - 4 - w / 2, CH - 9); }
  c.fillStyle = '#000'; c.fillRect(0, 0, SW, CH);                              // franja de la marca
  drawSpark(c, SW / 2, 24, 15);
  c.save(); c.translate(SW / 2 + 1, 140); c.rotate(-Math.PI / 2); c.font = '16px ' + FONT; c.fillStyle = '#fff'; c.fillText('VIBECODED', 0, 0); c.restore();
  c.fillStyle = '#fff'; c.fillRect(6, CH - 30, 26, 24); c.fillStyle = '#000'; c.fillRect(8, CH - 28, 22, 20);
  c.font = '8px ' + FONT; c.fillStyle = '#fff'; c.fillText(j.num, SW / 2, CH - 17);
}
function paintCase(){
  const j = VIBE.juegos[selected]; if (!j) return;
  coverC.width = CW; coverC.height = CH; paintCover(j, coverC.getContext('2d'));
  // disco: el arte de la portada impreso en la cara, sin letras, con el anillo central transparente
  const D = 256, k = discC.getContext('2d'); discC.width = discC.height = D; k.imageSmoothingEnabled = false;
  k.fillStyle = '#0c0c10'; k.fillRect(0, 0, D, D);
  k.save(); k.beginPath(); k.arc(128, 128, 124, 0, TAU); k.clip();
  if (j.disco) j.disco(k, D);
  else { const art = document.createElement('canvas'); art.width = CW - SW; art.height = CH; hook(j, 'arte', art.getContext('2d'), art.width, art.height);
         k.drawImage(art, 34, 4, art.width - 34, art.height - 4, 0, 0, D, D); }        // encuadre centrado
  k.restore();
  k.strokeStyle = '#a8a8b0'; k.lineWidth = 3; k.beginPath(); k.arc(128, 128, 124, 0, TAU); k.stroke();
  k.fillStyle = 'rgba(200,205,215,.85)'; k.beginPath(); k.arc(128, 128, 34, 0, TAU); k.fill();
  k.fillStyle = '#9a9aa2'; k.beginPath(); k.arc(128, 128, 24, 0, TAU); k.fill();
  k.fillStyle = '#0b0a0d'; k.beginPath(); k.arc(128, 128, 15, 0, TAU); k.fill();
  // portada del librillo (la primera hoja del manual)
  const b = bookC.getContext('2d'); bookC.width = 320; bookC.height = 240; b.imageSmoothingEnabled = false;
  b.fillStyle = '#ecebe2'; b.fillRect(0, 0, 320, 240);                         // papel blanco, como los manuales de la época
  b.fillStyle = '#d6d4c8'; for (let i = 0; i < 400; i++) b.fillRect((i * 97) % 320, (i * 61) % 240, 1, 1);
  b.fillStyle = '#111'; b.fillRect(0, 0, 320, 6); b.fillRect(0, 234, 320, 6);
  b.textAlign = 'center'; b.textBaseline = 'middle';
  drawSpark(b, 160, 58, 22);
  b.font = '16px ' + FONT; b.fillStyle = '#111'; b.fillText('INSTRUCCIONES', 160, 118);
  b.fillStyle = '#111'; b.fillRect(60, 136, 200, 2);
  b.font = '8px ' + FONT; b.fillStyle = '#444'; b.fillText(j.titulo, 160, 154);
  b.fillText('VIBECODED · ' + j.num, 160, 214);
  if (coverTex){ coverTex.needsUpdate = true; discTex.needsUpdate = true; bookTex.needsUpdate = true; }
}
// Caja 3D: bandeja con el disco dentro y tapa con la portada, que gira sobre la bisagra izquierda.
// Cerrada: el disco no se ve. Al abrirla, la tapa se abate a la izquierda y deja ver el manual,
// y el disco sale de la bandeja y queda a la derecha, aparte: pulsarlo mete el disco en la consola.
const DISC_OPEN = 2.74, OPEN_X = 0.26, cRay = new THREE.Raycaster(), cNdc = new THREE.Vector2();
function buildCase(){
  cr = new THREE.WebGLRenderer({ canvas: caseCv, antialias: false, alpha: true });
  cr.setPixelRatio(1); cr.setSize(640, 360, false);                           // baja resolución, ampliada con píxeles duros
  for (const j of VIBE.juegos) hook(j, 'preparar');                            // arte que necesite la caja ya hecha (fotos 3D)
  paintCase(); cr.setClearColor(0x000000, 0);
  const tex = cvs => { const t = new THREE.CanvasTexture(cvs); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };
  coverTex = tex(coverC); discTex = tex(discC); bookTex = tex(bookC);
  cScene = new THREE.Scene(); cCam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 60); cCam.position.set(0, 0, 8.6);
  cScene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(-2, 3, 5); cScene.add(dl);
  const L = o => new THREE.MeshLambertMaterial(o), plastic = L({ color: 0x1c1c20 }), clear = L({ color: 0x9aa0a8, transparent: true, opacity: 0.4 });
  caseG = new THREE.Group(); cScene.add(caseG);
  caseTray = new THREE.Mesh(new THREE.BoxGeometry(2.84, 2.5, 0.16), plastic); caseTray.position.z = -0.08;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), L({ color: 0x2a2a30 })); hub.rotation.x = Math.PI / 2; hub.position.z = 0.02;
  disc = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.025, 40), [L({ color: 0x111114 }), L({ map: discTex }), L({ color: 0x0a0a0e })]);
  disc.rotation.x = Math.PI / 2; disc.position.set(0, 0, 0.03);
  lidPivot = new THREE.Group(); lidPivot.position.set(-1.42, 0, 0.06);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.84, 2.5, 0.05), [clear, clear, clear, clear, L({ map: coverTex }), L({ color: 0x2a2a30 })]);
  lid.position.set(1.42, 0, 0.03); lidPivot.add(lid);
  bookMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), L({ map: bookTex }));   // el librillo, metido en la tapa
  bookMesh.rotation.y = Math.PI; bookMesh.position.z = -0.028; lid.add(bookMesh);
  caseG.add(caseTray, hub, disc, lidPivot);
  const hitAt = ev => { cRay.setFromCamera(cNdc.set(ev.offsetX / caseCv.clientWidth * 2 - 1, 1 - ev.offsetY / caseCv.clientHeight * 2), cCam);
    return cRay.intersectObjects([disc, caseTray, lid, bookMesh])[0]?.object; };
  caseCv.addEventListener('mousemove', ev => { CM.x = ev.offsetX / caseCv.clientWidth * 2 - 1; CM.y = ev.offsetY / caseCv.clientHeight * 2 - 1; CM.over = true;
    const o = hitAt(ev); CM.disc = CASE.open && o === disc; CM.hit = !!o;
    caseCv.style.cursor = o ? 'pointer' : 'default'; caseCv.title = !o ? '' : !CASE.open ? 'Abrir la caja' : CM.disc ? 'Meter el disco y jugar' : o === bookMesh ? 'Leer el manual (PDF)' : 'Cerrar la caja'; });
  caseCv.addEventListener('mouseleave', () => { CM.over = false; CM.disc = false; });
  caseCv.addEventListener('click', ev => { const o = hitAt(ev); if (!o) return;
    if (!CASE.open) openCase(); else if (o === disc) insertDisc(); else if (o === bookMesh) openManual(); else closeCase(); });
  caseCv.addEventListener('keydown', ev => {
    if (ev.code === 'Enter' || ev.code === 'Space'){ ev.preventDefault(); CASE.open ? insertDisc() : openCase(); }
    else if (ev.code === 'KeyI' && CASE.open){ ev.preventDefault(); openManual(); }
    else if (ev.code === 'Escape' && CASE.open){ ev.preventDefault(); closeCase(); }
  });
}
function updateHint(){ document.getElementById('hint').textContent = !CASE.open ? 'CLIC EN LA CAJA PARA ABRIRLA' : VIBE.mando ? (VIBE.juegos[selected].manual ? 'Y: MANUAL · ' : '') + 'A: JUGAR · B: CERRAR' : (VIBE.juegos[selected].manual ? 'CLIC EN EL MANUAL PARA LEERLO · ' : '') + 'CLIC EN EL DISCO PARA JUGAR'; }
function openCase(){ if (state !== 'off' || ins.on || CASE.open) return; CASE.open = true; audioInit(); updateHint(); boom(0.12, 900, 0.1); }
function closeCase(){ if (!CASE.open || ins.on) return; CASE.open = false; updateHint(); boom(0.15, 700, 0.08); }
function insertDisc(){ if (state !== 'off' || ins.on) return; if (!CASE.open || CASE.t < 1) return openCase();
  ins.on = true; ins.t = 0; audioInit(); loadMusic(VIBE.juegos[selected]); boom(0.25, 1800, 0.12); }

// El manual: un PDF con las reglas (campo manual del juego). Se abre en otra pestaña.
function openManual(){ const j = VIBE.juegos[selected]; if (!CASE.open || ins.on || !j.manual) return; open(j.manual, '_blank', 'noopener'); }

function caseFrame(t){
  requestAnimationFrame(caseFrame);
  if (state !== 'off' || !cr) return;                                         // con la tele encendida no se dibuja la caja
  const dt = clamp((t - (caseT || t)) / 1000, 0, 0.05), now = t / 1000; caseT = t;
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  CASE.t = clamp(CASE.t + (CASE.open ? dt : -dt) / 1.1, 0, 1);
  const o = ease(CASE.t), ol = ease(CASE.t / 0.7), od = ease((CASE.t - 0.4) / 0.6);
  // cerrada: balanceo suave y se gira hacia el cursor; abierta: plana de frente, para leer el manual
  let ty = Math.sin(now * 0.8) * 0.2 * (1 - o), tx = Math.sin(now * 0.6) * 0.05 * (1 - o), sc = 1;
  if (!CASE.open && CM.over && !ins.on){ ty = CM.x * 0.55; tx = CM.y * 0.42; sc = CM.hit ? 1.06 : 1; }
  const k = Math.min(1, dt * 7);
  caseG.rotation.y += (ty - caseG.rotation.y) * k; caseG.rotation.x += (tx - caseG.rotation.x) * k;
  caseG.scale.setScalar(caseG.scale.x + (sc - caseG.scale.x) * k);
  caseG.position.x = OPEN_X * o; caseG.position.y = Math.sin(now * 1.3) * 0.04 * (1 - o);
  lidPivot.rotation.y = -Math.PI * ol;
  cCam.position.z = 8.6 + 1.0 * o;
  if (!ins.on){                                                               // el disco sale de la bandeja y se aparta a la derecha
    CASE.lift += ((CM.disc && CM.over ? 0.25 : 0) - CASE.lift) * k;
    disc.position.set(DISC_OPEN * od, CASE.lift * 0.3, 0.03 + Math.sin(od * Math.PI) * 0.5 + CASE.lift);
    disc.rotation.set(Math.PI / 2, 0, 0); disc.rotateY(now * 0.6 * od);
  } else {                                                                    // el disco sube girando hacia la tele
    ins.t += dt;
    const up = Math.max(0, ins.t - 0.7);
    disc.position.z = 0.28 + ease(ins.t / 0.5) * 0.9; disc.position.y = up * up * 16;
    disc.rotateY(dt * (3 + ins.t * 16));
    if (ins.t > 1.0 && !ins.scrolled){ ins.scrolled = true; scrollTo({ top: 0, behavior: 'smooth' }); }
    if (ins.t > 2.0) powerOn();
  }
  cr.render(cScene, cCam);
}
const v3c = new THREE.Vector3();
function powerOn(){
  state = 'boot'; bootT = 0; scrollTo(0, 0);
  VIBE.activo = VIBE.juegos[selected]; loadMusic(VIBE.activo);
  hook(VIBE.activo, 'precargar');                                             // tiempo libre durante el logo (p. ej. compilar shaders)
  document.documentElement.style.overflow = 'hidden';                         // se acabó bajar: empieza el juego
  document.getElementById('down').style.display = 'none';
  drawTV(true);
  if (AC){                                                                    // acorde de arranque
    const t0 = AC.currentTime;
    for (const [f, d, v] of [[55, 0, 0.16], [110, 0.05, 0.1], [164.8, 0.5, 0.07], [220, 0.9, 0.06], [329.6, 1.2, 0.05]]){
      const o = AC.createOscillator(), ga = AC.createGain(); o.type = 'triangle'; o.frequency.value = f;
      ga.gain.setValueAtTime(0.0001, t0 + d); ga.gain.exponentialRampToValueAtTime(v, t0 + d + 0.5); ga.gain.exponentialRampToValueAtTime(0.0001, t0 + 3);
      o.connect(ga).connect(master); o.start(t0 + d); o.stop(t0 + 3.1);
    }
  }
}
// Pantalla de la tele antes del juego: apagada, y luego la secuencia de encendido con el logo.
function drawPower(dt){
  g.clearRect(0, 0, W, H); g.fillStyle = state === 'off' ? '#040405' : '#000'; g.fillRect(0, 0, W, H);
  if (state === 'off') return;
  const t = (bootT += dt);
  if (t < 0.4){                                                               // el tubo se enciende: línea blanca que se abre
    const k = t / 0.4, ww = Math.round(W * Math.min(1, k * 3)), hh = Math.max(2, Math.round(H * k * k));
    g.fillStyle = '#fff'; g.fillRect((W - ww) / 2, (H - hh) / 2, ww, hh); return;
  }
  if (t < 3){
    g.fillStyle = '#d4d4d0'; g.fillRect(0, 0, W, H);
    const q = clamp((t - 0.5) / 0.5, 0, 1) - 1, pop = 1 + 2.7 * q * q * q + 1.7 * q * q;      // entra con rebote
    if (t > 0.5) drawSpark(g, 160, 98, 48, Math.max(0.02, pop));
    if (t > 1.1) label('VIBECODED', 160, 172, 20, '#18181c');
    if (t > 1.5) label('VIBE COMPUTER ENTERTAINMENT', 160, 198, 9, '#55555a');
    if (t > 2.6){ g.fillStyle = 'rgba(0,0,0,' + clamp((t - 2.6) / 0.4, 0, 1).toFixed(2) + ')'; g.fillRect(0, 0, W, H); }
    return;
  }
  hook(VIBE.activo, 'encender');                                              // el juego toma la tele
  if (state === 'boot') state = 'on';
}
// Salir: los juegos llaman a powerOff() cuando el jugador elige salir. Apaga la tele y devuelve la página a la
// estantería, con la caja cerrada y el disco dentro.
function powerOff(){
  hook(VIBE.activo, 'apagar');
  state = 'off'; bootT = 0; VIBE.activo = null;
  document.documentElement.style.overflow = ''; document.getElementById('down').style.display = '';
  cv.style.cursor = ''; drawTV(false);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  ins.on = false; ins.t = 0; ins.scrolled = false;
  CASE.open = false; CASE.t = 0; updateHint();
  if (lidPivot){ lidPivot.rotation.y = 0; disc.position.set(0, 0, 0.03); disc.rotation.set(Math.PI / 2, 0, 0); }
  document.getElementById('shelf').scrollIntoView({ behavior: 'smooth' });
}
// Mando con la tele apagada: abrir la caja, leer el manual, meter el disco.
const cpad = { prev: [] };
function pollCasePad(){
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
  if (!gp) return;
  const hit = i => { const d = !!(gp.buttons[i] && gp.buttons[i].value > 0.5), was = cpad.prev[i]; cpad.prev[i] = d; return d && !was; };
  const a = hit(0), b = hit(1), y = hit(3), st = hit(9);
  if (state !== 'off') return;
  if ((a || b || y || st) && !VIBE.mando){ VIBE.mando = true; updateHint(); }  // al usar un mando, la ayuda de la caja pasa a sus botones
  if ((a || st || y) && mobileDlg.open){ mobileDlg.close(); return; }
  if (CASE.open){ if (y) openManual(); if (a || st) insertDisc(); if (b) closeCase(); }
  else if (a || st || y) openCase();
}
addEventListener('mousemove', () => { if (VIBE.mando && state === 'off'){ VIBE.mando = false; updateHint(); } });
// Bucle principal: con la tele apagada o arrancando lo lleva la consola; con un juego encendido, fotograma() del juego.
let frameDt = 0;
function frame(t){
  const dt = clamp((t - (frame.t || t)) / 1000, 0, 0.05); frame.t = t; frameDt = dt;
  pollCasePad();
  if (state === 'off' || state === 'boot') drawPower(dt);
  else hook(VIBE.activo, 'fotograma', dt);
  musicTick();
  requestAnimationFrame(frame);
}

/* ---------- biblioteca de juegos ----------
   La estantería muestra los juegos registrados (VIBE.registrar), ordenados por número, y rellena con huecos
   «PRONTO» hasta tener al menos tres. */
let selected = 0;
function showGame(){
  const gm = VIBE.juegos[selected]; if (!gm) return;
  if (cr) paintCase();
  if (bookMesh) bookMesh.visible = !!gm.manual;
  document.getElementById('gname').textContent = gm.titulo;
  document.getElementById('ggenre').textContent = 'DISCO ' + gm.num + ' · ' + gm.genero;
  updateHint();
  const box = document.getElementById('games'); box.innerHTML = '';
  const slots = [...VIBE.juegos]; while (slots.length < 3) slots.push({ num: String(slots.length + 1).padStart(2, '0') });
  slots.forEach((it, i) => {                           // una ficha por juego, con miniatura de su portada
    const b = document.createElement('button'), c = document.createElement('canvas'), x = c.getContext('2d');
    b.className = 'slot' + (it.titulo ? '' : ' locked') + (i === selected ? ' sel' : ''); b.disabled = !it.titulo;
    c.width = 71; c.height = 62; x.imageSmoothingEnabled = false;
    if (it.titulo){ const full = document.createElement('canvas'); full.width = CW; full.height = CH; paintCover(it, full.getContext('2d')); x.drawImage(full, 0, 0, 71, 62); }
    else { x.fillStyle = '#0e0d12'; x.fillRect(0, 0, 71, 62); x.fillStyle = '#000'; x.fillRect(0, 0, 10, 62);
           x.fillStyle = '#33313c'; x.font = '24px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 41, 34); }
    b.append(c, it.num + ' ' + (it.titulo || 'PRONTO'));
    b.onclick = () => { if (state !== 'off' || ins.on) return; if (i !== selected){ selected = i; CASE.open = false; showGame(); } caseCv.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    box.appendChild(b);
  });
}

// logo de la esquina y ventana de letra pequeña
function drawLogo(){ for (const id of ['logo', 'logo2', 'logo3']){ const c = document.getElementById(id).getContext('2d'); c.clearRect(0, 0, 32, 32); drawSpark(c, 15, 15, 14); } }
const legalDlg = document.getElementById('legal');
document.querySelectorAll('[data-legal]').forEach(b => b.addEventListener('click', () => {
  legalDlg.showModal(); legalDlg.scrollTop = 0;
  const h = b.dataset.legal && document.getElementById(b.dataset.legal); if (h) legalDlg.scrollTop = h.offsetTop - 60;   // saltar a su apartado
}));
legalDlg.querySelector('.close').addEventListener('click', () => legalDlg.close());
legalDlg.addEventListener('click', ev => { if (ev.target === legalDlg) legalDlg.close(); });   // clic fuera = cerrar

/* ---------- arranque ---------- */
{ const f = document.createElement('canvas'); f.width = f.height = 32; drawSpark(f.getContext('2d'), 15, 15, 14);   // favicon: el logo
  const l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/png'; l.href = f.toDataURL('image/png'); document.head.appendChild(l); }
// Móvil o tableta sin ratón: aviso de que hace falta un mando, con su dibujo y el estado de la conexión.
function drawPadArt(){
  const c = document.getElementById('padArt').getContext('2d'), R = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  R('#000', 14, 8, 84, 34); R('#000', 6, 16, 100, 40); R('#000', 2, 30, 30, 32); R('#000', 80, 30, 30, 32);          // contorno
  R('#5c6068', 16, 10, 80, 30); R('#5c6068', 8, 18, 96, 36); R('#5c6068', 4, 32, 26, 28); R('#5c6068', 82, 32, 26, 28);
  R('#7a7f88', 16, 10, 80, 3); R('#3e4148', 34, 50, 44, 4);                                                          // brillo y sombra
  R('#16171a', 18, 26, 18, 6); R('#16171a', 24, 20, 6, 18);                                                          // cruceta
  for (const [k, x, y] of [['Y', 86, 18], ['X', 78, 26], ['B', 94, 26], ['A', 86, 34]]){ R('#000', x - 1, y - 1, 8, 8); R(BTN_COL[k], x, y, 6, 6); }
  for (const x of [38, 62]){ R('#000', x, 38, 12, 12); R('#2a2c30', x + 1, 39, 10, 10); R('#4a4e56', x + 3, 41, 6, 6); }   // sticks
  R('#16171a', 48, 22, 6, 3); R('#16171a', 58, 22, 6, 3);                                                             // select y start
}
const mobileDlg = document.getElementById('mobile'), isMobile = matchMedia('(hover: none) and (pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
function padFound(){
  const st = document.getElementById('padState'); st.className = 'ok'; st.textContent = '● MANDO DETECTADO';
  document.getElementById('mobOk').textContent = 'A JUGAR';
  const tc = document.getElementById('touch'); tc.textContent = 'MANDO LISTO: A JUGAR, Y MANUAL'; tc.style.color = '#58d030';
}
document.getElementById('mobOk').addEventListener('click', () => mobileDlg.close());
addEventListener('gamepadconnected', padFound);
if (isMobile){
  const tc = document.getElementById('touch'); tc.hidden = false; tc.textContent = 'CONECTA UN MANDO PARA JUGAR';
  drawPadArt(); mobileDlg.showModal();
  if (navigator.getGamepads && [...navigator.getGamepads()].some(p => p && p.connected)) padFound();
}   // móvil o tableta sin ratón
