/* ============================================================
   PLANTILLA — juego mínimo para la consola VIBECODED
   Cópiala a juegos/<tu-juego>/juego.js, cambia los datos de VIBE.registrar(...) y añade su <script> en index.html
   (antes de consola/arranque.js). Ver JUEGOS.md.
   Juego de ejemplo: esquiva los bloques que caen. Flechas / A-D o el stick para moverte, Esc / Start para salir.
   Todo va dentro de un bloque { } para no chocar con los nombres de otros juegos.
   ============================================================ */
'use strict';
{
  // Estado propio del juego. La pantalla mide W×H = 320×240 y se dibuja en g (lienzo 2D de la consola).
  let x = 160, rocks = [], t = 0, score = 0, over = false;
  const keys = {};
  const prev = [];                                    // botones del mando en el fotograma anterior

  function reiniciar(){ x = 160; rocks = []; t = 0; score = 0; over = false; }

  // Lee el mando (si hay). Devuelve el eje horizontal y los botones recién pulsados.
  function leerMando(){
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
    if (!gp) return { ax: 0, a: false, start: false };
    const hit = i => { const d = !!(gp.buttons[i] && gp.buttons[i].value > 0.5), was = prev[i]; prev[i] = d; return d && !was; };
    const ax = Math.abs(gp.axes[0] || 0) > 0.25 ? gp.axes[0] : (gp.buttons[15]?.pressed ? 1 : 0) - (gp.buttons[14]?.pressed ? 1 : 0);
    return { ax, a: hit(0), start: hit(9) };
  }

  function fotograma(dt){
    const pad = leerMando();
    if (pad.start) return powerOff();                                       // salir: la consola apaga la tele
    if (over){ if (pad.a || keys.Enter || keys.Space){ keys.Enter = keys.Space = false; reiniciar(); blip(660); } }
    else {
      const dir = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) || pad.ax;
      x = clamp(x + dir * 160 * dt, 10, W - 10);
      t += dt; score += dt * 10;
      if (Math.random() < dt * (1.2 + t * 0.08)) rocks.push({ x: rnd(8, W - 8), y: -8, v: rnd(60, 110) + t * 3 });
      for (const r of rocks) r.y += r.v * dt;
      rocks = rocks.filter(r => r.y < H + 10);
      if (rocks.some(r => Math.abs(r.x - x) < 11 && Math.abs(r.y - 214) < 10)){ over = true; boom(0.5, 400, 0.6); }
    }
    // dibujo
    g.fillStyle = '#101826'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c84030'; for (const r of rocks) g.fillRect(Math.round(r.x - 6), Math.round(r.y - 6), 12, 12);
    g.fillStyle = '#58d030'; g.fillRect(Math.round(x - 8), 208, 16, 12);
    outlined('PUNTOS ' + Math.floor(score), 8, 12, 8, '#ffe9a0', 'left');
    if (over){ outlined('TE DIERON', W / 2, 100, 16, '#fff'); label('ENTER O A: OTRA VEZ', W / 2, 130, 8, '#cfd4b8'); label('ESC O START: SALIR', W / 2, 146, 8, '#cfd4b8'); }
  }

  // Teclado: solo cuando este juego está encendido.
  const mio = () => VIBE.activo === JUEGO && state !== 'off' && state !== 'boot';
  addEventListener('keydown', ev => { if (!mio()) return; if (ev.code === 'Escape') return powerOff(); keys[ev.code] = true; ev.preventDefault(); });
  addEventListener('keyup', ev => { if (mio()) keys[ev.code] = false; });

  // Arte de la portada (sin letras, 246×250). Se usa también para el disco.
  function arte(c, w, h){
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0a1430'); sky.addColorStop(1, '#2a5080');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c84030'; for (let i = 0; i < 9; i++) c.fillRect(20 + (i * 67) % (w - 40), 70 + (i * 41) % 110, 18, 18);
    c.fillStyle = '#58d030'; c.fillRect(w / 2 - 16, h - 46, 32, 22);
  }

  const JUEGO = VIBE.registrar({
    num: '99', titulo: 'PLANTILLA', genero: 'DEMO',
    // manual: 'juegos/plantilla/manual.pdf',     // opcional: PDF que se abre al pulsar el manual de la caja
    // musica: { pistas: {...}, bucles: {...} },  // opcional: ver JUEGOS.md
    arte,
    encender(){ reiniciar(); state = 'play'; cv.style.cursor = 'none'; },
    fotograma,
    apagar(){ for (const k in keys) keys[k] = false; }
  });
}
