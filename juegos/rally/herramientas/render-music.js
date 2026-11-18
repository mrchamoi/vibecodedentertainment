// Renderiza la banda sonora de DRIFTING (rock de carreras de los 90 en mi menor, en 6 variaciones) a juegos/rally/musica.js.
// Uso:  node juegos/rally/herramientas/render-music.js        (necesita ffmpeg con libvorbis)
// Solo se usa en tu computadora para fabricar juegos/rally/musica.js; la página publicada no lo necesita.
// Mismas limitaciones de época que la del T-55: 22 050 Hz, muestras de instrumentos afinadas por velocidad,
// 24 voces como máximo, reverb estéreo y compresión ADPCM de 4 bits (bloques de 28 muestras) antes del OGG.
// Todas las variaciones duran 8 compases: la consola cambia de una a otra entrando en el mismo punto de la canción.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SR = 22050, PAD = SR / 2, TAU = Math.PI * 2, OUT = path.join(__dirname, '..');
let seed = 7654321; const noise = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2147483648 - 1; };

/* ---------- muestras de instrumentos ---------- */
const mk = (sec, fn) => { const d = new Float32Array(Math.round(sec * SR)); fn(d, d.length);
  let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < d.length; i++) d[i] /= m; return d; };
const midiOf = f => 69 + 12 * Math.log2(f / 440);
// Oscilador limitado en banda: suma de armónicos con amplitud amp(h); voices = desafinaciones; vib = vibrato.
function osc(f, sec, amp, { voices = [0], vib = 0, vibHz = 5.5, vibDelay = 0.15, env = () => 1 } = {}){
  return mk(sec, (d, n) => {
    for (const dv of voices){
      const ph = new Float64Array(48).map(() => (noise() + 1) * Math.PI);
      for (let i = 0; i < n; i++){
        const t = i / SR, fr = f * (1 + dv) * (1 + vib * Math.min(1, Math.max(0, t - vibDelay) / 0.3) * Math.sin(TAU * vibHz * t));
        let s = 0;
        for (let h = 1; h < 48; h++){ const hz = fr * h; if (hz > 9500) break; const a = amp(h); if (a < 0.002) continue; ph[h] += TAU * hz / SR; s += a * Math.sin(ph[h]); }
        d[i] += s * env(t);
      }
    }
  });
}
const saw = h => 1 / h, square = h => h % 2 ? 1 / h : 0, pulse25 = h => Math.abs(Math.sin(Math.PI * h * 0.25)) / h;
// Filtro paso bajo de un polo con corte que cambia en el tiempo: cut(t) en Hz.
function lowpass(d, cut){ let y = 0; for (let i = 0; i < d.length; i++){ const a = 1 - Math.exp(-TAU * cut(i / SR) / SR); y += a * (d[i] - y); d[i] = y; } return d; }
// Acorde de quinta de guitarra eléctrica (fundamental, quinta y octava), desafinado y saturado.
function powerChord(sec, notes, drive, env, cut){
  const n = Math.round(sec * SR), d = new Float32Array(n);
  for (const [m, v] of notes){ const o = osc(E2 * m, sec, saw, { voices: [-0.003, 0.003] }); for (let i = 0; i < n; i++) d[i] += o[i] * v; }
  for (let i = 0; i < n; i++){ const t = i / SR; d[i] = Math.tanh(d[i] * drive) * env(t); }
  return lowpass(lowpass(d, cut), cut);
}
const E2 = 82.41, A4 = 440, A3 = 220;
const SMP = {
  // bajo de sintetizador: diente de sierra con el filtro que se cierra (pegada) y cola corta
  bass:  { base: midiOf(E2), pan: 0, b: lowpass(lowpass(osc(E2, 0.9, saw, { voices: [-0.002, 0.002], env: t => Math.exp(-t * 2.2) }), t => 300 + 2400 * Math.exp(-t * 14)), () => 900) },
  // guitarra sostenida
  gtr:   { base: midiOf(E2), pan: -0.3, b: powerChord(1.6, [[1, 1], [1.4983, 0.8], [2, 0.6]], 3.2, t => Math.min(1, t / 0.004) * (0.75 + 0.25 * Math.exp(-t * 3)), () => 2800) },
  // la misma guitarra con la palma apagando las cuerdas: golpe corto y sordo
  mute:  { base: midiOf(E2), pan: 0.3, b: powerChord(0.22, [[1, 1], [1.4983, 0.7]], 4, t => Math.min(1, t / 0.003) * Math.exp(-t * 18), t => 700 + 1500 * Math.exp(-t * 30)) },
  // solista: onda de pulso estrecha con vibrato que entra tarde, como los sintetizadores de los juegos de carreras
  lead:  { base: midiOf(A4), pan: 0.1, b: osc(A4, 2.2, pulse25, { voices: [0, 0.004], vib: 0.006 }) },
  // pulsado corto para los arpegios
  pluck: { base: midiOf(A4), pan: -0.15, b: lowpass(osc(A4, 0.5, square, { env: t => Math.exp(-t * 9) }), t => 1200 + 4000 * Math.exp(-t * 20)) },
  // colchón de cuerdas sintéticas
  pad:   { base: midiOf(A3), pan: 0, b: lowpass(osc(A3, 3.2, saw, { voices: [-0.006, -0.002, 0.002, 0.006], vib: 0.002, vibHz: 4 }), () => 1400) },
  // batería
  kick:  { b: mk(0.45, (d, n) => { let ph = 0; for (let i = 0; i < n; i++){ const t = i / SR; ph += TAU * (46 + 120 * Math.exp(-t * 35)) / SR;
           d[i] = Math.sin(ph) * Math.exp(-t * 7) + (i < 60 ? noise() * 0.5 * (1 - i / 60) : 0); } }) },
  snare: { pan: 0.05, b: mk(0.28, (d, n) => { let lp = 0; for (let i = 0; i < n; i++){ const t = i / SR, x = noise(); lp += 0.45 * (x - lp);
           d[i] = (x - lp) * Math.exp(-t * 15) + 0.7 * Math.sin(TAU * 190 * t) * Math.exp(-t * 30) + 0.3 * Math.sin(TAU * 330 * t) * Math.exp(-t * 40); } }) },
  hat:   { pan: 0.25, b: mk(0.06, (d, n) => { let pv = 0; for (let i = 0; i < n; i++){ const x = noise(); d[i] = (x - pv) * Math.exp(-i / SR * 60); pv = x; } }) },
  ohat:  { pan: 0.25, b: mk(0.35, (d, n) => { let pv = 0; for (let i = 0; i < n; i++){ const x = noise(); d[i] = (x - pv) * Math.exp(-i / SR * 9); pv = x; } }) },
  crash: { pan: -0.25, b: mk(1.8, (d, n) => { const fr = [317, 421, 553, 709, 887, 1093, 1327, 1613]; let hp = 0, pv = 0;
           for (let i = 0; i < n; i++){ const t = i / SR; let s = 0; for (const f of fr) s += Math.sign(Math.sin(TAU * f * t));
             const x = noise() * 2 + s * 0.15; hp = x - pv; pv = x; d[i] = hp * Math.exp(-t * 2.6); } }) }
};

/* ---------- la canción: "Polvo y gloria", en mi menor ---------- */
// [paso, nota MIDI, duración en pasos]; 16 pasos por compás, 8 compases (frase A y frase B)
const MEL = [
  [0, 71, 2], [2, 74, 2], [4, 76, 4], [8, 74, 2], [10, 71, 2], [12, 67, 4],
  [16, 72, 2], [18, 71, 2], [20, 72, 4], [24, 76, 4], [28, 79, 4],
  [32, 78, 3], [35, 76, 1], [36, 74, 4], [40, 78, 2], [42, 81, 2], [44, 78, 4],
  [48, 79, 6], [54, 78, 2], [56, 76, 8],
  [64, 76, 2], [66, 79, 2], [68, 83, 4], [72, 81, 2], [74, 79, 2], [76, 76, 4],
  [80, 79, 2], [82, 76, 2], [84, 72, 4], [88, 76, 2], [90, 79, 2], [92, 84, 4],
  [96, 83, 3], [99, 81, 1], [100, 78, 4], [104, 74, 2], [106, 78, 2], [108, 81, 4],
  [112, 78, 4], [116, 75, 4], [120, 71, 8] ];
// acordes de cada compás: [bajo, notas del acorde]   Mim · Do · Re · Mim · Mim · Do · Re · Si
const CHORD = [[40, [64, 67, 71]], [36, [64, 67, 72]], [38, [66, 69, 74]], [40, [64, 67, 71]],
               [40, [64, 67, 71]], [36, [64, 67, 72]], [38, [66, 69, 74]], [35, [63, 66, 71]]];
const BASS = [0, -1, 0, -1, 12, -1, 0, 0, 0, -1, 0, -1, 12, -1, 7, -1];              // −1 = silencio
const KICK = { menu: [0, 8], break: [0, 3, 8, 10], four: [0, 4, 8, 12, 14] };
const MODES = {
  menu:    { bpm: 120, kick: 'menu', hat: 1, bass: 1, pad: 1, lead: 'lead', leadV: 0.07, arp: 1 },                   // el tema, tranquilo
  race:    { bpm: 150, kick: 'break', snare: 1, hat: 2, bass: 2, gtr: 1, lead: 'lead', leadV: 0.085, crash: 4 },        // en carrera
  final:   { bpm: 160, kick: 'four', snare: 2, hat: 3, bass: 2, gtr: 2, lead: 'lead', leadV: 0.095, lead2: 1, crash: 1, arp: 1 },   // última vuelta
  results: { bpm: 104, kick: 'menu', hat: 1, bass: 1, pad: 1, lead: 'pluck', leadV: 0.08, arp: 1 },                  // resultados
  over:    { bpm: 84,  tr: -2, pad: 1, bass: 1, lead: 'pluck', leadV: 0.06, lp: 1300 },                              // se acabó el tiempo
  pause:   { bpm: 150, kick: 'break', hat: 1, bass: 2, pad: 1, lp: 650 }                                              // pausa: la carrera, apagada
};

function render(m){
  const sd = 15 / m.bpm, steps = 128, loopN = Math.round(steps * sd * SR), total = loopN * 3, tr = m.tr || 0;
  const L = new Float32Array(total), R = new Float32Array(total), voices = [];
  const voice = (k, midi, t, dur, vol, atk = 0.004, rel = 0.08) => {
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
    const t = (rep * steps + s) * sd, bar = s >> 4, st = s & 15, [root, ch] = CHORD[bar], second = bar >= 4;
    // batería
    if (m.kick && KICK[m.kick].includes(st)) voice('kick', null, t, 0, st === 0 ? 0.5 : 0.38);
    if (m.snare && (st === 4 || st === 12)) voice('snare', null, t, 0, 0.32);
    if (m.snare === 2 && bar % 4 === 3 && st >= 12) voice('snare', null, t + sd / 2, 0, 0.12 + 0.04 * (st - 12));   // redoble al final de la frase
    if (m.snare === 1 && st === 15 && bar % 2) voice('snare', null, t, 0, 0.1);
    if (m.hat === 1 && st % 4 === 2) voice('hat', null, t, 0, 0.1);
    if (m.hat === 2 && st % 2 === 0) voice(st === 14 ? 'ohat' : 'hat', null, t, 0, st % 4 ? 0.09 : 0.13);
    if (m.hat === 3) voice(st === 6 || st === 14 ? 'ohat' : 'hat', null, t, 0, st % 2 ? 0.06 : 0.12);
    if (m.crash && st === 0 && bar % m.crash === 0) voice('crash', null, t, 0, 0.13);
    // bajo
    if (m.bass === 1 && (st === 0 || st === 6 || st === 10)) voice('bass', root + tr + 12, t, sd * (st === 0 ? 5 : 3), 0.3, 0.004, 0.05);
    if (m.bass === 2 && BASS[st] >= 0) voice('bass', root + tr + 12 + BASS[st], t, sd * 1.6, 0.3, 0.003, 0.03);
    // guitarra: acordes sostenidos y golpes apagados
    if (m.gtr === 1){ if (st === 0 || st === 10) voice('gtr', root + tr + 12, t, sd * (st === 0 ? 6 : 5.5), 0.13, 0.004, 0.06);
                      else if (st % 2 === 0 && st > 6) voice('mute', root + tr + 12, t, 0, 0.12); }
    if (m.gtr === 2){ if (st === 0 || st === 6 || st === 12) voice('gtr', root + tr + 12, t, sd * 3.5, 0.13, 0.004, 0.05); else voice('mute', root + tr + 12, t, 0, st % 2 ? 0.07 : 0.11); }
    // colchón
    if (m.pad && st === 0) for (const n of ch) voice('pad', n + tr - 12, t, sd * 15.6, 0.045, 0.3, 0.5);
    // arpegio de semicorcheas sobre el acorde (en la segunda frase)
    if (m.arp && second){ const n = ch[st % 3] + (st % 6 >= 3 ? 12 : 0); voice('pluck', n + tr, t, 0, st % 4 ? 0.035 : 0.05); }
    // melodía (con eco a 3/16, como los juegos de la época)
    if (m.lead) for (const n of MEL) if (n[0] === s){
      voice(m.lead, n[1] + tr, t, n[2] * sd * 0.9, m.leadV, 0.01, 0.1);
      voice(m.lead, n[1] + tr, t + 3 * sd, n[2] * sd * 0.6, m.leadV * 0.3, 0.01, 0.1);
      if (m.lead2 && second) voice('lead', n[1] + tr - 12, t, n[2] * sd * 0.9, m.leadV * 0.5, 0.01, 0.1);
    }
  }
  // reverb pequeña (peines y pasa-todo) y, si toca, un paso bajo que lo apaga todo
  const comb = [558, 594, 638, 678, 711, 745, 778, 808], ap = [278, 220, 170, 112];
  const rev = (x, sp) => { const out = new Float32Array(x.length);
    for (const c of comb){ const n = c + sp, buf = new Float32Array(n); let p = 0, f = 0;
      for (let i = 0; i < x.length; i++){ const o = buf[p]; f = o * 0.6 + f * 0.4; buf[p] = x[i] + f * 0.78; p = (p + 1) % n; out[i] += o; } }
    for (const a of ap){ const n = a + sp, buf = new Float32Array(n); let p = 0;
      for (let i = 0; i < x.length; i++){ const b = buf[p], y = -out[i] + b; buf[p] = out[i] + b * 0.5; p = (p + 1) % n; out[i] = y; } }
    return out; };
  const mono = L.map((v, i) => (v + R[i]) * 0.5), wl = rev(mono, 0), wr = rev(mono, 12);
  for (let i = 0; i < total; i++){ L[i] += wl[i] * 0.03; R[i] += wr[i] * 0.03; }
  if (m.lp){ const a = 1 - Math.exp(-TAU * m.lp / SR); let yl = 0, yr = 0, zl = 0, zr = 0;
    for (let i = 0; i < total; i++){ yl += a * (L[i] - yl); zl += a * (yl - zl); L[i] = zl; yr += a * (R[i] - yr); zr += a * (yr - zr); R[i] = zr; } }
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
        const nb = Math.max(-8, Math.min(7, Math.round((x[i] - pr) / q))); const y = Math.max(-32768, Math.min(32767, nb * q + pr));
        e += (y - x[i]) ** 2; dec.push(y); p2 = p1; p1 = y; }
      if (!best || e < best.e) best = { e, dec, p1, p2 };
    }
    out.set(best.dec, b); h1 = best.p1; h2 = best.p2;
  }
  return out;
}

/* ---------- escribir ---------- */
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
  const tmp = path.join(require('os').tmpdir(), 'derrape-' + k + '.wav'); fs.writeFileSync(tmp, wav);
  const ogg = tmp.replace('.wav', '.ogg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '1', ogg]);
  packed[k] = fs.readFileSync(ogg).toString('base64'); fs.unlinkSync(tmp); fs.unlinkSync(ogg);
  console.log(k, (n / SR).toFixed(2) + ' s', (packed[k].length * 0.75 / 1024).toFixed(0) + ' KB');
}
fs.writeFileSync(path.join(OUT, 'musica.js'), 'window.DERRAPE_MUSIC = ' + JSON.stringify(packed) + ';\nwindow.DERRAPE_LOOP = ' + JSON.stringify(loops) + ';\n');
