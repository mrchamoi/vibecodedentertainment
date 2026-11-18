// Renderiza la banda sonora del T-55 (una marcha de guerra en re menor, en 8 variaciones) a juegos/t55/musica.js.
// Uso:  node juegos/t55/herramientas/render-music.js        (necesita ffmpeg con libvorbis)
// Solo se usa en tu computadora para fabricar juegos/t55/musica.js; la página publicada no necesita Node: es un archivo estático más.
// Limitaciones de la época, al estilo de la consola: 22 050 Hz, muestras de instrumentos afinadas por velocidad,
// 24 voces como máximo, reverb de sala estéreo y compresión ADPCM de 4 bits (bloques de 28 muestras) antes del OGG.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SR = 22050, PAD = SR / 2, TAU = Math.PI * 2, OUT = path.join(__dirname, '..');
let seed = 1234567; const noise = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2147483648 - 1; };

/* ---------- muestras de instrumentos (orquesta militar) ---------- */
const mk = (sec, fn) => { const d = new Float32Array(Math.round(sec * SR)); fn(d, d.length);
  let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < d.length; i++) d[i] /= m; return d; };
const midiOf = f => 69 + 12 * Math.log2(f / 440);
// Síntesis aditiva con timbre que cambia en el tiempo: amp(h, hz, t) da la amplitud de cada armónico.
// voices = desafinaciones de cada intérprete de la sección; vib = vibrato.
function additive(f, sec, amp, { voices = [0], vib = 0, vibHz = 5, env = () => 1, breath = 0 } = {}){
  return mk(sec, (d, n) => {
    for (const dv of voices){
      const ph = new Float64Array(32).map(() => (noise() + 1) * Math.PI), vp = (noise() + 1) * Math.PI;
      for (let i = 0; i < n; i++){
        const t = i / SR, fr = f * (1 + dv) * (1 + vib * Math.min(1, t / 0.4) * Math.sin(TAU * vibHz * t + vp));
        let s = 0;
        for (let h = 1; h < 32; h++){ const hz = fr * h; if (hz > 10000) break; const a = amp(h, hz, t); if (a < 0.001) continue;
          ph[h] += TAU * hz / SR; s += a * Math.sin(ph[h]); }
        d[i] += s * env(t);
      }
    }
    if (breath){ let lp = 0; for (let i = 0; i < n; i++){ lp += 0.2 * (noise() - lp); d[i] += lp * breath; } }
  });
}
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
// metales: el brillo sube al soplar (los armónicos agudos entran un poco después que el fundamental)
const brassAmp = (bright, top) => (h, hz, t) => { const b = 1 + bright * Math.min(1, t / 0.07) * (0.85 + 0.15 * Math.exp(-t * 3));
  return Math.exp(-(h - 1) / b) / (1 + (hz / top) ** 4); };
const SMP = {
  // trompeta (corneta de llamada): brillante y al frente
  tpt:   { base: midiOf(441), pan: 0.12, b: additive(441, 3, brassAmp(6, 5200), { vib: 0.004, voices: [0, 0.002] }) },
  // trompas: más oscuras y redondas
  horn:  { base: midiOf(220.5), pan: -0.1, b: additive(220.5, 4, brassAmp(2.6, 1800), { vib: 0.003, voices: [-0.002, 0.002, 0] }) },
  // trombones: graves y con mordida, para los golpes de acorde
  tbn:   { base: midiOf(110.25), pan: 0.2, b: additive(110.25, 3, brassAmp(5, 2400), { voices: [-0.0015, 0.0015] }) },
  // coro masculino cantando "ah" (formantes de la vocal a)
  choir: { base: midiOf(147), pan: 0, b: additive(147, 5, (h, hz) => (gauss(hz, 700, 160) + 0.7 * gauss(hz, 1150, 180) + 0.25 * gauss(hz, 2600, 300) + 0.15 / h),
           { voices: [-0.004, 0, 0.0035, 0.007], vib: 0.005, vibHz: 4.6, breath: 0.04 }) },
  // cuerdas graves sostenidas (violonchelos y contrabajos)
  str:   { base: midiOf(110.25), pan: -0.2, b: additive(110.25, 5, (h, hz) => 1 / h / (1 + (hz / 2400) ** 2), { voices: [-0.003, -0.001, 0.001, 0.003], vib: 0.004 }) },
  // cuerdas en spiccato: el ostinato que empuja hacia adelante
  spic:  { base: midiOf(110.25), pan: -0.25, b: additive(110.25, 0.35, (h, hz, t) => 1 / h / (1 + (hz / (1500 + 3000 * Math.exp(-t * 20))) ** 2),
           { voices: [-0.002, 0.002], env: t => Math.min(1, t / 0.006) * Math.exp(-t * 11) }) },
  // tambor militar con bordonera
  snare: { pan: 0.08, b: mk(0.3, (d, n) => { let lp = 0, hp = 0; for (let i = 0; i < n; i++){ const t = i / SR, x = noise(); lp += 0.5 * (x - lp); hp = x - lp;
           d[i] = hp * (0.9 * Math.exp(-t * 16) + 0.25 * Math.exp(-t * 6)) + 0.6 * Math.sin(TAU * 185 * t) * Math.exp(-t * 35) + 0.3 * Math.sin(TAU * 330 * t) * Math.exp(-t * 45); } }) },
  // bombo de orquesta
  bd:    { b: mk(1.1, (d, n) => { let ph = 0, lp = 0; for (let i = 0; i < n; i++){ const t = i / SR; ph += TAU * (42 + 30 * Math.exp(-t * 12)) / SR; lp += 0.05 * (noise() - lp);
           d[i] = Math.sin(ph) * Math.exp(-t * 3.2) + lp * 3 * Math.exp(-t * 14); } }) },
  // tambores de guerra graves (tipo taiko)
  taiko: { pan: -0.15, b: mk(0.7, (d, n) => { let ph = 0, lp = 0; for (let i = 0; i < n; i++){ const t = i / SR; ph += TAU * (70 + 60 * Math.exp(-t * 25)) / SR; lp += 0.12 * (noise() - lp);
           d[i] = Math.sin(ph) * Math.exp(-t * 6) + lp * 2.5 * Math.exp(-t * 30); } }) },
  // timbales afinados
  timp:  { base: midiOf(98), b: mk(1.4, (d, n) => { for (let i = 0; i < n; i++){ const t = i / SR, w = TAU * 98 * t;
           d[i] = Math.sin(w) * Math.exp(-2.2 * t) + 0.5 * Math.sin(w * 1.5) * Math.exp(-3.5 * t) + 0.35 * Math.sin(w * 1.98) * Math.exp(-5 * t) + 0.4 * noise() * Math.exp(-60 * t); } }) },
  // platillo de choque
  crash: { pan: 0.3, b: mk(2.2, (d, n) => { const fr = [317, 421, 553, 709, 887, 1093, 1327, 1613]; let hp = 0, pv = 0;
           for (let i = 0; i < n; i++){ const t = i / SR; let s = 0; for (const f of fr) s += Math.sign(Math.sin(TAU * f * t));
             const x = noise() * 2 + s * 0.15; hp = x - pv; pv = x; d[i] = hp * Math.exp(-t * 2.2); } }) }
};

/* ---------- la canción: "Columna de acero", marcha en re menor ---------- */
// [paso, nota MIDI, duración en pasos]; 16 pasos por compás, 4 compases
const MEL = [ [0, 62, 3], [3, 62, 1], [4, 69, 6], [10, 67, 2], [12, 65, 2], [14, 64, 2],
  [16, 62, 3], [19, 62, 1], [20, 65, 4], [24, 70, 6], [30, 69, 2],
  [32, 67, 3], [35, 67, 1], [36, 72, 4], [40, 70, 2], [42, 69, 2], [44, 67, 4],
  [48, 69, 4], [52, 73, 4], [56, 69, 8] ];
const CHORD = [[38, 50, 57, 62, 65], [34, 46, 53, 58, 62], [36, 48, 55, 60, 64], [33, 45, 52, 57, 61]];   // Rem · Si♭ · Do · La
// cadencia del tambor militar (1 = acento, 0 = nada); 'r' = redoble
const DRUM = [1, 0, .45, .45, .8, 0, .45, 0, 1, 0, .45, .45, .8, .35, 'r', 'r'];
// Cada variación: tempo, tono y qué instrumentos tocan. Todas duran 8 compases (el tema dos veces).
const MODES = {
  menu:   { bpm: 70,  tr: 0,  pad: 'choir', low: 1, mel: 'tpt', melV: 0.09, timp: 1, mel2half: 'horn' },              // corneta lejana sobre el coro
  calm:   { bpm: 96,  tr: 0,  pad: 'str', low: 1, mel: 'horn', melV: 0.13, snare: 1, osti: 1, timp: 1, mel2half: 'tpt' }, // marcha en columna
  fight:  { bpm: 122, tr: 0,  low: 1, mel: 'horn', melV: 0.15, mel2: 'tpt', snare: 2, osti: 2, bd: 2, timp: 2, hits: 1, crash: 1 },
  danger: { bpm: 140, tr: 1,  low: 1, mel: 'horn', melV: 0.15, mel2: 'tpt', snare: 2, osti: 3, bd: 2, taiko: 1, timp: 2, hits: 1, alarm: 1, crash: 1 },
  boss:   { bpm: 112, tr: -3, pad: 'choir', padV: 0.07, low: 1, mel: 'tbn', melV: 0.16, mel2: 'horn', snare: 2, osti: 2, bd: 2, taiko: 1, timp: 2, hits: 1, crash: 1 },
  shop:   { bpm: 84,  tr: 0,  pad: 'str', low: 1, mel: 'horn', melV: 0.1, snare: 1, snareV: 0.5, osti: 1 },               // respiro entre batallas
  dead:   { bpm: 52,  tr: -2, pad: 'choir', low: 1, mel: 'tpt', melV: 0.08, timp: 1 },                                     // lamento
  aim:    { bpm: 84,  tr: 0,  pad: 'str', padV: 0.05, low: 1, mel: 'choir', melV: 0.06, bd: 3, lp: 1100 }                  // por la mira: contiene la respiración
};

function render(m){
  const sd = 15 / m.bpm, steps = 128, loopN = Math.round(steps * sd * SR), total = loopN * 3;
  const L = new Float32Array(total), R = new Float32Array(total), voices = [];
  const voice = (k, midi, t, dur, vol, atk = 0.008, rel = 0.1) => {
    const sm = SMP[k]; for (let i = voices.length - 1; i >= 0; i--) if (voices[i] <= t) voices.splice(i, 1);
    if (voices.length >= 24) return;                                   // sin voces libres, la nota se pierde
    const rate = midi == null ? 1 : 2 ** ((midi - sm.base) / 12), blen = sm.b.length / SR / rate;
    const hold = dur > 0 ? Math.min(dur, blen - rel) : 0, end = hold ? t + hold + rel : t + blen; voices.push(end);
    const pan = sm.pan || 0, gl = Math.cos((pan + 1) * Math.PI / 4) * 1.414, gr = Math.sin((pan + 1) * Math.PI / 4) * 1.414;
    const i0 = Math.round(t * SR), n = Math.round((end - t) * SR), b = sm.b;
    for (let j = 0; j < n && i0 + j < total; j++){
      const tt = j / SR; let env = atk > 0 && tt < atk ? tt / atk : 1;
      if (hold && tt > hold) env *= Math.max(0, 1 - (tt - hold) / rel);
      const p = j * rate; if (p >= b.length - 1) break;
      const ip = p | 0, s = b[ip] + (b[ip + 1] - b[ip]) * (p - ip), v = s * env * vol;
      L[i0 + j] += v * gl; R[i0 + j] += v * gr;
    }
  };
  for (let rep = 0; rep < 3; rep++) for (let s = 0; s < steps; s++){
    const t = (rep * steps + s) * sd, half = s >> 6, ss = s & 63, bar = ss >> 4, st = ss & 15, ch = CHORD[bar], tr = m.tr;
    if (m.pad && st === 0) for (let i = 2; i < 5; i++) voice(m.pad, ch[i] + tr - (m.pad === 'choir' ? 12 : 0), t, sd * 15.5, m.padV || 0.06, 0.35, 0.5);
    if (m.low && st === 0) voice('str', ch[0] + tr, t, sd * 15.5, 0.1, 0.25, 0.4);
    if (m.osti){                                                       // ostinato de cuerdas
      const on = m.osti === 1 ? st % 4 === 0 : m.osti === 2 ? st % 2 === 0 : true;
      if (on){ const acc = st % 4 === 0 ? 1 : 0.6, up = (m.osti > 1 && st % 8 === 6) ? 7 : 0;
        voice('spic', ch[1] + up + tr, t, 0, 0.12 * acc); if (m.osti > 1) voice('spic', ch[0] + tr, t, 0, 0.08 * acc); }
    }
    for (const n of MEL) if (n[0] === ss){
      voice(m.mel, n[1] + tr - (m.mel === 'tbn' ? 12 : 0), t, n[2] * sd * 0.92, m.melV, 0.03, 0.15);
      if (m.mel2) voice(m.mel2, n[1] + tr + (m.mel2 === 'tpt' ? 0 : -12), t, n[2] * sd * 0.92, m.melV * (half ? 0.6 : 0.35), 0.03, 0.15);
      else if (m.mel2half && half) voice(m.mel2half, n[1] + tr - 12, t, n[2] * sd * 0.92, m.melV * 0.5, 0.05, 0.2);
    }
    if (m.hits && (st === 0 || st === 6 || st === 10)) for (const i of [0, 2, 3]) voice('tbn', ch[i] + 12 + tr, t, sd * (st === 10 ? 4 : 1.5), 0.07, 0.01, 0.12);   // golpes de metal
    if (m.alarm && half) voice('spic', ch[4] + 12 + tr, t, 0, 0.05);  // violines en trémolo
    if (m.snare){
      const a = DRUM[st], sv = (m.snareV || 1) * (m.snare === 2 ? 0.16 : 0.1);
      if (a === 'r'){ if (m.snare === 2 || bar === 3) for (let k = 0; k < 3; k++) voice('snare', null, t + k * sd / 3, 0, sv * (0.4 + 0.2 * k)); }
      else if (a) voice('snare', null, t, 0, sv * a);
    }
    if (m.bd === 2 && st % 4 === 0) voice('bd', null, t, 0, st === 0 ? 0.5 : 0.35);
    if (m.bd === 3 && (st % 8 === 0 || st % 8 === 3)) voice('bd', null, t, 0, st % 8 ? 0.3 : 0.45);   // latido
    if (m.taiko && [0, 3, 6, 10, 12, 14].includes(st)) voice('taiko', null, t, 0, st === 0 ? 0.4 : 0.25);
    if (m.timp === 1 && st === 0) voice('timp', ch[0] + 12 + tr, t, 0, 0.3);
    if (m.timp === 2){ if (st === 0) voice('timp', ch[0] + 12 + tr, t, 0, 0.3); if (st === 8) voice('timp', ch[0] + 7 + tr, t, 0, 0.25);
      if (bar === 3 && st >= 12) for (let k = 0; k < 2; k++) voice('timp', ch[0] + 12 + tr, t + k * sd / 2, 0, 0.1 + 0.04 * (st - 12)); }   // redoble de timbal
    if (m.crash && ss === 0) voice('crash', null, t, 0, half ? 0.06 : 0.09);
  }
  // reverb de sala estéreo (peines + pasatodos, como la unidad de reverb de la consola)
  const comb = [558, 594, 638, 678, 711, 745, 778, 808], ap = [278, 220, 170, 112];
  const rev = (x, sp) => { const out = new Float32Array(x.length);
    for (const c of comb){ const n = c + sp, buf = new Float32Array(n); let p = 0, f = 0;
      for (let i = 0; i < x.length; i++){ const o = buf[p]; f = o * 0.55 + f * 0.45; buf[p] = x[i] + f * 0.84; p = (p + 1) % n; out[i] += o; } }
    for (const a of ap){ const n = a + sp, buf = new Float32Array(n); let p = 0;
      for (let i = 0; i < x.length; i++){ const b = buf[p], y = -out[i] + b; buf[p] = out[i] + b * 0.5; p = (p + 1) % n; out[i] = y; } }
    return out; };
  const mono = L.map((v, i) => (v + R[i]) * 0.5), wl = rev(mono, 0), wr = rev(mono, 12);
  for (let i = 0; i < total; i++){ L[i] += wl[i] * 0.04; R[i] += wr[i] * 0.04; }
  if (m.lp){ const a = 1 - Math.exp(-TAU * m.lp / SR); let yl = 0, yr = 0, zl = 0, zr = 0;
    for (let i = 0; i < total; i++){ yl += a * (L[i] - yl); zl += a * (yl - zl); L[i] = zl; yr += a * (R[i] - yr); zr += a * (yr - zr); R[i] = zr; } }
  // La vuelta del medio, con medio segundo de la vuelta anterior delante y de la siguiente detrás: así el compresor
  // tiene contexto a ambos lados de la costura y el juego repite solo el tramo [PAD, PAD + vuelta], sin clics.
  return [L.slice(loopN - PAD, loopN * 2 + PAD), R.slice(loopN - PAD, loopN * 2 + PAD), loopN];
}

/* ---------- compresión ADPCM de 4 bits (bloques de 28 muestras, 5 filtros predictores) ---------- */
const FILT = [[0, 0], [60 / 64, 0], [115 / 64, -52 / 64], [98 / 64, -55 / 64], [122 / 64, -60 / 64]];
function adpcm(x){   // x en enteros de 16 bits; devuelve lo que el chip de sonido volvería a decodificar
  const out = new Float32Array(x.length); let h1 = 0, h2 = 0;
  for (let b = 0; b < x.length; b += 28){
    let best = null;
    for (const [f0, f1] of FILT){
      let mx = 0, p1 = h1, p2 = h2; for (let i = b; i < Math.min(b + 28, x.length); i++){ const r = x[i] - (p1 * f0 + p2 * f1); mx = Math.max(mx, Math.abs(r)); p2 = p1; p1 = x[i]; }
      let sh = 12; while (sh > 0 && mx > 7 * 2 ** (12 - sh)) sh--;
      const q = 2 ** (12 - sh), dec = []; let e = 0; p1 = h1; p2 = h2;
      for (let i = b; i < Math.min(b + 28, x.length); i++){ const pr = p1 * f0 + p2 * f1;
        const nb = Math.max(-8, Math.min(7, Math.round((x[i] - pr) / q))); let y = Math.max(-32768, Math.min(32767, nb * q + pr));
        e += (y - x[i]) ** 2; dec.push(y); p2 = p1; p1 = y; }
      if (!best || e < best.e) best = { e, dec, p1, p2 };
    }
    out.set(best.dec, b); h1 = best.p1; h2 = best.p2;
  }
  return out;
}

/* ---------- escribir ---------- */
fs.mkdirSync(OUT, { recursive: true });
const rendered = {}, packed = {}, loops = {}; let peak = 0;
for (const [k, m] of Object.entries(MODES)){ rendered[k] = render(m); for (const c of rendered[k].slice(0, 2)) for (const v of c) peak = Math.max(peak, Math.abs(v)); }
const norm = 0.89 / peak;   // misma ganancia para todas: las variaciones conservan su volumen relativo
console.log('ganancia aplicada', norm.toFixed(3));
for (const [k, [L, R, loopN]] of Object.entries(rendered)){
  loops[k] = [PAD / SR, (PAD + loopN) / SR];
  const cl = adpcm(L.map(v => Math.round(v * norm * 32767))), cr = adpcm(R.map(v => Math.round(v * norm * 32767)));
  const n = cl.length, wav = Buffer.alloc(44 + n * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++){ wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(cl[i]))), 44 + i * 4); wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(cr[i]))), 46 + i * 4); }
  const tmp = path.join(require('os').tmpdir(), 't55-' + k + '.wav'); fs.writeFileSync(tmp, wav);
  const ogg = tmp.replace('.wav', '.ogg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '1', ogg]);
  packed[k] = fs.readFileSync(ogg).toString('base64'); fs.unlinkSync(tmp); fs.unlinkSync(ogg);
  console.log(k, (n / SR).toFixed(2) + ' s', (packed[k].length * 0.75 / 1024).toFixed(0) + ' KB');
}
// Todo en un solo .js con <script>: así suena también abriendo index.html con doble clic (file://), sin servidor.
fs.writeFileSync(path.join(OUT, 'musica.js'), 'window.T55_MUSIC = ' + JSON.stringify(packed) + ';\nwindow.T55_LOOP = ' + JSON.stringify(loops) + ';\n');
