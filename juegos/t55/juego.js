/* ============================================================
   T-55 ARCADE GAME — juego para la consola VIBECODED
   Tanque en 3D (three.js) a 320×240 con estética de PSX; la lógica es 2D (x, y sobre el suelo).
   Teclado y ratón: WASD mover · el cañón sigue al ratón · clic cañón · clic derecho mira · Espacio
   ametralladora · R cargar · Esc pausa.   Mando: L2/R2 orugas · L1/R1 atrás · stick derecho torreta ·
   stick izquierdo ametralladora (apunta y dispara) · A cañón · B radar grande · X cargar · Y mira · Start pausa.
   Se da de alta al final del archivo con VIBE.registrar(...). Usa piezas de la consola (g, W, H, S, label, boom…).
   ============================================================ */
'use strict';

/* ---------- constantes ---------- */
const WS = 2400, GS = 0.5;                         // lado del mundo y escala de la textura del suelo
const SPEED = 70, TURRET = 0.35, MAXAMMO = 18, RAM = 0.9;
const MG_RATE = 1.6;                               // ametralladora: velocidad de puntería (rad/s); gira por su cuenta
const AIM_SENS = 0.0012, AIM_LEAD = 0.15;          // mira con ratón: radianes por píxel y adelanto máximo del punto
/* ---------- estado ---------- */
let P, PM, buildings, trees, blocks = [], fires = [], enemies, shells, parts, crates, wave, waveT, heat = 0;   // state (de la consola): menu → play → upgrade → dead
let msg = '', msgT = 0, shake = 0, score = 0, combo = 0, comboT = 0, best = 0, banner = '', bannerT = 0;
let camH = -Math.PI / 2, groundDirty = true, groundT = 0, deadAt = 0;
try { best = +localStorage.getItem('t55best') || 0; } catch (e){}
const M = { x: 0, y: 0, seen: false };
const K = { F: false, B: false, L: false, R: false, mg: false, big: false };   // W, S, A, D y Espacio (ametralladora)
const pad = { L: 0, R: 0, tx: 0, sx: 0, sy: 0, sv: 0, sh: 0, mg: false, big: false, on: false, prev: [] };   // mando: gatillos = orugas, stick derecho = torreta
const ground = document.createElement('canvas'); ground.width = ground.height = WS * GS;
const gg = ground.getContext('2d');

/* ============================================================
   ESCENA 3D   —   juego (x, y)  →  three (x, altura, y)
   ============================================================ */
// --- Estilo PSX (consola/psx.js, compartido con los demás juegos en 3D) ---
// 1) Vértices que "tiemblan" y texturas afines: se aplica material a material con psx(); el suelo NO lo lleva,
//    porque con triángulos tan grandes temblaba entero y a veces desaparecía.
// 2) Se dibuja a 240 líneas en un búfer aparte y 3) se amplía sin suavizar, con color de 15 bits y tramado.
const psx = PSX.material, PSX_H = 240;
const { rt, mat: postMat, scene: postScene, cam: postCam } = PSX.pantalla(320, PSX_H);

let renderer;
try { renderer = PSX.renderer(); }
catch (e){
  document.body.innerHTML = '<p style="padding:24px;font-size:16px;line-height:1.5">Este visor no tiene WebGL, así que no puede dibujar el juego en 3D.<br>Abre <b>index.html</b> en Chrome o Firefox.</p>';
  throw e;
}
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8c8a80); scene.fog = new THREE.Fog(0x8c8a80, 280, 1050);   // cielo encapotado, con humo
const cam = new THREE.PerspectiveCamera(55, 1, 2, 4200);
// Vista actual: normal (pantalla entera, con niebla) o mira del artillero (círculo central, sin niebla).
const VIEW = { fp: false, R: 100, cx: 160, cy: 120, w: 1, h: 1, aspect: 1, fog: [280, 1050] };
scene.add(new THREE.HemisphereLight(0xcfcdc4, 0x3a3428, 0.8));
const sun = new THREE.DirectionalLight(0xe6dcc8, 0.8);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 10, far: 1300 });
scene.add(sun, sun.target);

const groundTex = new THREE.CanvasTexture(ground);
groundTex.magFilter = THREE.NearestFilter;
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(WS, WS, 24, 24), new THREE.MeshLambertMaterial({ map: groundTex }));
groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.set(WS / 2, 0, WS / 2); groundMesh.receiveShadow = true;
const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0x4a4633 }));
outer.rotation.x = -Math.PI / 2; outer.position.set(WS / 2, -6, WS / 2);
const world = new THREE.Group(), dyn = new THREE.Group();
scene.add(groundMesh, outer, world, dyn);

// Texturas procedurales pequeñas y sin filtrar. Son grises: el color del material las tiñe.
const makeTex = PSX.textura;
function speckle(c, n, cols, count){ for (let i = 0; i < count; i++){ c.fillStyle = cols[i % cols.length]; c.fillRect(Math.random() * n | 0, Math.random() * n | 0, 1 + Math.random() * 2 | 0, 1 + Math.random() * 2 | 0); } }
const texCamo = makeTex(32, (c, n) => {                       // chapa de guerra: pintura gastada, barro, óxido, hollín y arañazos
  c.fillStyle = '#b6b6b6'; c.fillRect(0, 0, n, n); speckle(c, n, ['#989898', '#cacaca', '#a6a6a6', '#888888'], 170);
  c.fillStyle = '#8c8c8c'; for (let i = 0; i < 5; i++){ c.beginPath(); c.ellipse(Math.random() * n, Math.random() * n, 4 + Math.random() * 5, 3 + Math.random() * 3, Math.random() * 3, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(0,0,0,.28)'; for (let i = 0; i < 3; i++){ c.beginPath(); c.ellipse(Math.random() * n, Math.random() * n * 0.6, 3 + Math.random() * 4, 2 + Math.random() * 3, 0, 0, 7); c.fill(); }   // hollín
  c.fillStyle = 'rgba(128,62,28,.5)'; for (let i = 0; i < 7; i++) c.fillRect(Math.random() * n | 0, Math.random() * n * 0.6 | 0, 1, 5 + Math.random() * 11);                                      // óxido que chorrea
  c.fillStyle = 'rgba(74,58,40,.62)'; c.fillRect(0, n - 8, n, 8);                                                                                                                                 // barro en los bajos
  for (let i = 0; i < 16; i++){ const hh = 2 + Math.random() * 9; c.fillRect(Math.random() * n | 0, n - 8 - hh, 1 + Math.random() * 2, hh); }
  c.strokeStyle = 'rgba(236,236,236,.5)'; c.lineWidth = 1;
  for (let i = 0; i < 5; i++){ const x = Math.random() * n, y = Math.random() * n; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.random() * 8 - 4, y + Math.random() * 5); c.stroke(); }             // arañazos
  c.fillStyle = '#5e5e5e'; c.fillRect(0, 15, n, 1); c.fillRect(15, 0, 1, n);
  c.fillStyle = '#e4e4e4'; for (let i = 3; i < n; i += 8){ c.fillRect(i, 13, 1, 1); c.fillRect(13, i, 1, 1); }
});
const texTrack = makeTex(16, (c, n) => { c.fillStyle = '#909090'; c.fillRect(0, 0, n, n); c.fillStyle = '#3c3c3c'; for (let x = 0; x < n; x += 4) c.fillRect(x, 0, 2, n); c.fillStyle = '#5a5a5a'; c.fillRect(0, 7, n, 2); }, 6, 1);
const texWall = makeTex(64, (c, n) => {                       // hormigón castigado: ventanas rotas o tapiadas, hollín, grietas e impactos
  c.fillStyle = '#b0b0b0'; c.fillRect(0, 0, n, n); speckle(c, n, ['#9a9a9a', '#c4c4c4', '#888888', '#a6a6a6'], 460);
  c.fillStyle = '#848484'; for (const k of [0, 32]){ c.fillRect(0, k, n, 1); c.fillRect(k, 0, 1, n); }
  [[8, 12], [40, 12], [8, 42], [40, 42]].forEach(([x, y], i) => {
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x + 2, y - 8, 12, 8); c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 4, y - 12, 8, 4);   // hollín
    c.fillStyle = '#121416'; c.fillRect(x, y, 16, 14);
    if (i % 2){ c.fillStyle = '#6c6254'; c.fillRect(x, y + 2, 16, 3); c.fillRect(x, y + 8, 16, 3); c.fillStyle = '#4c4438'; c.fillRect(x, y + 5, 16, 1); }   // tapiada con tablas
    else { c.fillStyle = '#566068'; c.fillRect(x + 1, y + 8, 4, 5); c.fillRect(x + 11, y + 1, 4, 4); }                                           // cristales rotos
    c.fillStyle = '#d2d2d2'; c.fillRect(x - 1, y + 14, 18, 1);
  });
  c.strokeStyle = '#454545'; c.lineWidth = 1;
  for (let k = 0; k < 4; k++){ let x = Math.random() * n, y = Math.random() * n; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 5; j++){ x += Math.random() * 10 - 5; y += Math.random() * 8 + 2; c.lineTo(x, y); } c.stroke(); }
  for (let k = 0; k < 16; k++){ const x = Math.random() * n | 0, y = Math.random() * n | 0; c.fillStyle = '#343434'; c.fillRect(x, y, 2, 2); c.fillStyle = '#dcdcdc'; c.fillRect(x + 2, y, 1, 1); }
});
const texConcrete = makeTex(32, (c, n) => {                   // hormigón de búnker: tablas del encofrado y chorretones
  c.fillStyle = '#b8b8b8'; c.fillRect(0, 0, n, n); speckle(c, n, ['#a0a0a0', '#cacaca', '#8e8e8e'], 180);
  c.fillStyle = '#8a8a8a'; for (let y = 7; y < n; y += 8) c.fillRect(0, y, n, 1);
  c.fillStyle = 'rgba(40,36,30,.35)'; for (let k = 0; k < 6; k++) c.fillRect(Math.random() * n | 0, 0, 2, 8 + Math.random() * 20);
}, 2, 1);
const texSand = makeTex(16, (c, n) => {                       // sacos terreros
  c.fillStyle = '#c6c6c6'; c.fillRect(0, 0, n, n); speckle(c, n, ['#b0b0b0', '#d6d6d6'], 40);
  c.fillStyle = '#7c7c7c'; c.fillRect(0, 7, n, 1); c.fillRect(0, 15, n, 1); c.fillRect(7, 0, 1, 7); c.fillRect(15, 8, 1, 7);
}, 2, 1);
const texRoof = makeTex(32, (c, n) => { c.fillStyle = '#c4c4c4'; c.fillRect(0, 0, n, n); c.fillStyle = '#8c8c8c'; for (let x = 0; x < n; x += 4) c.fillRect(x, 0, 1, n); speckle(c, n, ['#a0a0a0', '#d8d8d8'], 60); }, 3, 3);
const texLeaf = makeTex(32, (c, n) => { c.fillStyle = '#bcbcbc'; c.fillRect(0, 0, n, n); speckle(c, n, ['#8c8c8c', '#e8e8e8', '#a4a4a4', '#6e6e6e'], 420); }, 2, 2);
const texBark = makeTex(16, (c, n) => { c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, n, n); c.fillStyle = '#808080'; for (let x = 1; x < n; x += 3) c.fillRect(x, 0, 1, n); speckle(c, n, ['#989898'], 30); });
const texCrate = makeTex(32, (c, n) => {                      // caja de tablas con refuerzo en cruz
  c.fillStyle = '#d2d2d2'; c.fillRect(0, 0, n, n); c.fillStyle = '#a2a2a2'; for (let y = 7; y < n; y += 8) c.fillRect(0, y, n, 1);
  c.strokeStyle = '#7a7a7a'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, n - 3, n - 3);
  c.beginPath(); c.moveTo(2, 2); c.lineTo(n - 2, n - 2); c.moveTo(n - 2, 2); c.lineTo(2, n - 2); c.stroke();
});
const mat = (c, map) => psx(new THREE.MeshLambertMaterial(map ? { color: c, map } : { color: c }));
const deadMat = mat(0x1d1d1b);
function box(w, h, d, m, x, y, z){ const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }
function cyl(r, len, m, x, y, z, axis){
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m);
  if (axis === 'x') o.rotation.z = Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  o.position.set(x, y, z); o.castShadow = true; return o;
}

// Modelo de tanque: el frente mira a +X. Casco y torreta son grupos separados (la torreta gira aparte).
function makeTank(cHull, cTur){
  const hull = new THREE.Group(), tur = new THREE.Group();
  const mh = mat(cHull, texCamo), mt = mat(cTur, texCamo), mk = mat(0x46423a, texTrack), mb = mat(0x2c2b24), mw = mat(0x36332a);
  for (const z of [-11.5, 11.5]){
    hull.add(box(46, 8, 7, mk, 0, 4, z), box(47, 1, 8, mh, 0, 8.6, z));
    for (let i = 0; i < 5; i++) hull.add(cyl(3.7, 1, mw, -17 + i * 8.5, 3.9, z + Math.sign(z) * 3.6, 'z'));
  }
  hull.add(box(40, 7, 17, mh, -1, 8.5, 0));
  const gl = box(11, 2.5, 17, mh, 19.5, 8.6, 0); gl.rotation.z = -0.55; hull.add(gl);            // glacis inclinado
  hull.add(cyl(3, 8, mt, -24.5, 10, -5, 'z'), cyl(3, 8, mt, -24.5, 10, 5, 'z'));                  // bidones
  hull.add(box(8, 1, 12, mk, -15, 12.1, 0));                                                      // rejilla del motor
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10.5, 18, 10, 0, TAU, 0, Math.PI / 2), mt);
  dome.scale.set(1.12, 0.62, 0.95); dome.position.set(-1, 12, 0); dome.castShadow = true;
  const barrel = new THREE.Group(); barrel.position.set(8, 15, 0);
  barrel.add(cyl(1.5, 34, mb, 17, 0, 0, 'x'), cyl(2.4, 6, mb, 29, 0, 0, 'x'), box(5, 4.5, 6, mt, 0, 0, 0));
  tur.add(dome, barrel, cyl(2.6, 1.6, mt, -4, 18.4, 4.5), cyl(2.2, 1.4, mt, -3, 18.4, -4.5));
  return { hull, tur, barrel, mats: [mh, mt] };
}
function makeJeep(){                                  // todoterreno militar con lanzacohetes de cuatro tubos en la caja
  const hull = new THREE.Group(), mb = mat(0x55523a, texCamo), md = mat(0x1e1e1a), mw = mat(0x2a2924, texTrack), mg = mat(0x18262c);
  hull.add(box(27, 3, 10, md, 0, 4.6, 0), box(9, 4.5, 10.5, mb, 9, 8.2, 0), box(7.5, 7, 11, mb, 1, 9.6, 0), box(0.8, 3.4, 9.4, mg, 5, 11, 0),
           box(11, 3.4, 11, mb, -8, 7.6, 0), box(1.4, 1.8, 11.4, md, 14, 5.6, 0), cyl(3, 1.8, mw, -14.2, 9, 0, 'x'));
  for (const x of [-8.5, 8.5]) for (const z of [-5.8, 5.8]) hull.add(cyl(3.5, 2.8, mw, x, 3.5, z, 'z'), box(8.5, 0.9, 3.2, mb, x, 7.4, z));   // ruedas y aletas
  const rack = new THREE.Group(); rack.position.set(-8, 11.4, 0); rack.rotation.z = 0.24;
  for (const y of [0, 2.6]) for (const z of [-1.4, 1.4]) rack.add(cyl(1.25, 13, md, 1, y, z, 'x'));
  rack.add(box(3, 5.4, 6, mb, -2, 1.3, 0)); hull.add(rack);
  return { hull, mats: [] };
}
function makeTD(){                                    // cazacarros: casamata inclinada y cañón largo fijo, sobre el mismo tren de rodaje que los tanques
  const hull = new THREE.Group(), mh = mat(0x504c38, texCamo), mc = mat(0x5c5740, texCamo), mk = mat(0x46423a, texTrack), mb = mat(0x2c2b24), mw = mat(0x36332a);
  for (const z of [-11.5, 11.5]){
    hull.add(box(46, 8, 7, mk, 0, 4, z), box(47, 1, 8, mh, 0, 8.6, z));
    for (let i = 0; i < 5; i++) hull.add(cyl(3.7, 1, mw, -17 + i * 8.5, 3.9, z + Math.sign(z) * 3.6, 'z'));
  }
  const front = box(15, 2.6, 18, mc, 17.5, 13.4, 0); front.rotation.z = -0.72;                   // frontal muy inclinado
  const back = box(11, 2.2, 17.6, mc, -9.5, 14.8, 0); back.rotation.z = 0.62;
  hull.add(box(40, 7, 17, mh, -1, 8.5, 0), box(20, 8, 18, mc, 3, 15.6, 0), front, back,
           box(6, 6, 8, mh, 14.5, 15.4, 0), cyl(1.8, 36, mb, 34, 15.4, 0, 'x'), cyl(2.6, 5, mb, 50, 15.4, 0, 'x'),   // mantelete, cañón y freno de boca
           cyl(2.8, 2, mh, 2, 20.4, -5), box(8, 1, 12, mk, -18, 12.1, 0),                                             // cúpula y rejilla del motor
           cyl(3, 8, mh, -24.5, 10, -5, 'z'), cyl(3, 8, mh, -24.5, 10, 5, 'z'));                                      // bidones
  return { hull, mats: [] };
}
const rotorDiscMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0a, transparent: true, opacity: 0.2, depthWrite: false });
function makeHeli(){                                  // helicóptero de ataque: cabinas en tándem, alas cortas con cohetes y botalón de cola
  const hull = new THREE.Group(), mb = mat(0x4c4a36, texCamo), mu = mat(0x3a3a2c, texCamo), mg = mat(0x16242a), md = mat(0x1a1a18), rotor = new THREE.Group();
  const boom = box(27, 3.2, 3.2, mb, -25, 3.4, 0); boom.rotation.z = -0.07;
  const fin = box(5, 12, 1.4, mb, -38, 9, 0); fin.rotation.z = 0.4;
  hull.add(box(27, 9, 9, mb, 0, 0, 0), box(9, 6, 7.4, mb, 16, -1.5, 0), box(4, 3.4, 5, mu, 21, -2.6, 0),            // fuselaje y morro
           box(7, 4, 6.2, mg, 14.5, 3, 0), box(7.5, 4.6, 6.8, mg, 7.5, 5.6, 0),                                    // cabinas
           box(15, 4.4, 7.4, mu, -3.5, 6.4, 0), cyl(1.6, 5, md, -12, 6.6, -2.4, 'x'), cyl(1.6, 5, md, -12, 6.6, 2.4, 'x'),   // turbinas y escapes
           boom, fin, box(7, 1, 1.2, md, -37, 12, 1.6),                                                            // cola y rotor de cola
           box(6, 1.3, 28, mu, -2, -1.4, 0), cyl(0.8, 7, md, 23, -4.6, 0, 'x'),                                     // alas cortas y cañón de morro
           box(1.6, 3.4, 1.6, md, 9, -6, 0), cyl(1.6, 1.4, md, 9, -7.8, 0, 'z'), cyl(1.6, 1.4, md, -6, -6.4, -5.4, 'z'), cyl(1.6, 1.4, md, -6, -6.4, 5.4, 'z'),   // tren
           cyl(1.1, 4, md, -2, 9.4, 0));
  for (const z of [-9, -13, 9, 13]) hull.add(cyl(1.7, 8, md, -1, -3.4, z, 'x'));                                    // contenedores de cohetes
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.2, 14), rotorDiscMat), box(56, 0.5, 2.4, md, 0, 0, 0), box(2.4, 0.5, 56, md, 0, 0, 0));
  rotor.position.set(-2, 11.6, 0); hull.add(rotor);
  return { hull, rotor, mats: [] };
}
function makeMortar(){                                // mortero: tubo sobre bípode y placa, tras un parapeto de sacos en herradura
  const hull = new THREE.Group(), md = mat(0x2e3028), mc = mat(0x5a4a30, texCrate);
  const tube = cyl(2, 19, md, 1.5, 8.6, 0, 'x'); tube.rotation.z = 1.1 - Math.PI / 2;               // apunta arriba y al frente
  hull.add(cyl(5.5, 1.2, md, -3, 0.8, 0), tube, box(7, 4, 5, mc, -9, 2, 8), box(6, 3, 4, mc, -10, 1.5, -8));
  for (const sd of [-1, 1]){ const leg = box(1, 10.5, 1, md, 6, 5, sd * 2.6); leg.rotation.x = sd * 0.3; leg.rotation.z = 0.2; hull.add(leg); }
  for (let i = -2; i <= 2; i++){ const a = i * 0.52, bag = box(5, 4.4, 9.5, sandMat, Math.cos(a) * 16, 2.2, Math.sin(a) * 16); bag.rotation.y = -a; hull.add(bag); }
  for (let i = -1.5; i <= 1.5; i++){ const a = i * 0.52, bag = box(5, 4.2, 9.5, sandMat, Math.cos(a) * 16, 6.4, Math.sin(a) * 16); bag.rotation.y = -a; hull.add(bag); }
  return { hull, mats: [] };
}
function darken(m){ for (const o of [m.hull, m.tur]) if (o) o.traverse(c => { if (c.isMesh) c.material = deadMat; }); if (m.tur) m.tur.rotation.x = 0.13; }

const trunkGeo = new THREE.CylinderGeometry(1.4, 2, 14, 6), coneGeo = new THREE.ConeGeometry(1, 2.8, 7), ballGeo = new THREE.SphereGeometry(1, 7, 6);
const trunkMat = mat(0x4a3c2a, texBark), leafMats = [mat(0x2f3024, texLeaf), mat(0x3b3828, texLeaf), mat(0x292a21, texLeaf)];   // agujas secas y cubiertas de ceniza
const wallCols = [0x8c8880, 0x7a766c, 0x9a9488], roofMat = mat(0x5a5048, texRoof);
const concreteMat = mat(0x7c7a70, texConcrete), rubbleMat = mat(0x504c44, texConcrete), brickMat = mat(0x6e4a3a, texConcrete), darkMat = mat(0x121210),
      rustMat = mat(0x5c3a26), sandMat = mat(0x8a7a58, texSand), burntMat = mat(0x2a241e, texBark), poleMat = mat(0x4a3c2c, texBark);
const crateMats = { hp: mat(0x4fae40, texCrate), he: mat(0xd8b428, texCrate) };
const shellGeo = new THREE.SphereGeometry(1.5, 6, 6);
const shellMats = [psx(new THREE.MeshBasicMaterial({ color: 0xffe9a0 })), psx(new THREE.MeshBasicMaterial({ color: 0xff5030 }))];

// partículas: reserva fija de esferas
const strikeRingGeo = new THREE.RingGeometry(0.86, 1, 24), strikeFillGeo = new THREE.CircleGeometry(1, 20);
const strikeMat = new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
const POOL = [], partGeo = new THREE.SphereGeometry(1, 6, 5);
for (let i = 0; i < 400; i++){
  const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  m.visible = false; m.frustumCulled = false; scene.add(m); POOL.push(m);
}
// Ajuste del 3D al tamaño de la tele (lo llama la consola al cambiar el tamaño de la ventana).
function t55Resize(cw, ch){
  renderer.setPixelRatio(1); renderer.setSize(cw, ch);
  VIEW.w = cw; VIEW.h = ch; VIEW.aspect = cw / ch;
  rt.setSize(320, PSX_H); postMat.uniforms.res.value.set(320, PSX_H);
  setView(false);
}
// Ajusta cámara, niebla y zona de dibujo. En la mira solo se dibuja el cuadrado que contiene el círculo:
// el visor y el recorte (scissor) se reducen a él y la cámara pasa a proporción 1:1, de modo que todo lo
// que queda fuera ni se rasteriza ni pasa el descarte por frustum. Eso compensa quitar la niebla.
function setView(fp){
  const R = Math.floor(Math.min(W, VH) * 0.42), cx = Math.round(W / 2), cy = Math.round(VH / 2);
  VIEW.fp = fp; VIEW.R = R; VIEW.cx = cx; VIEW.cy = cy;
  scene.fog.near = fp ? 1e5 : VIEW.fog[0]; scene.fog.far = fp ? 2e5 : VIEW.fog[1];
  const fov = fp ? 20 : 55, asp = fp ? 1 : VIEW.aspect;
  if (cam.fov !== fov || cam.aspect !== asp){ cam.fov = fov; cam.aspect = asp; cam.updateProjectionMatrix(); }
  if (fp) rt.viewport.set(cx - R, H - (cy + R), 2 * R, 2 * R); else rt.viewport.set(0, 0, 320, PSX_H);   // visor del búfer (origen abajo)
  rt.scissor.copy(rt.viewport); rt.scissorTest = fp;
}
function start(withMenu = true){
  audioInit(); reset(); cv.style.cursor = 'none'; MENU.paused = false; menuT = 0;
  if (withMenu){ state = 'menu'; MENU.page = -1; MENU.sel = 0; }
}
// Pausa: vuelve al menú sin tocar la partida (solo se simula en estado 'play').
function pauseGame(){
  if (state !== 'play') return;
  setAim(false); K.F = K.B = K.L = K.R = K.mg = false;
  state = 'menu'; MENU.page = -1; MENU.sel = 0; MENU.paused = true;
}
const v3 = new THREE.Vector3();
function toScreen(x, y, h){
  v3.set(x, h, y).project(cam); if (v3.z > 1) return null;
  if (VIEW.fp) return Math.hypot(v3.x, v3.y) > 1 ? null : { x: VIEW.cx + v3.x * VIEW.R, y: VIEW.cy - v3.y * VIEW.R };
  return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * VH };
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function cursorAngle(){                              // rumbo desde el tanque al punto del suelo bajo el cursor
  if (VIEW.fp) ndc.set(clamp((M.x - VIEW.cx) / VIEW.R, -1, 1), clamp((VIEW.cy - M.y) / VIEW.R, -1, 1));
  else ndc.set(M.x / W * 2 - 1, -(clamp(M.y, 0, VH) / VH) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const o = ray.ray.origin, d = ray.ray.direction, t = d.y < -0.02 ? -o.y / d.y : 5000;
  return Math.atan2(o.z + d.z * t - P.y, o.x + d.x * t - P.x);
}

/* ============================================================
   LÓGICA
   ============================================================ */
function say(t){ msg = t; msgT = 2.5; }
function inBuilding(x, y, m = 0){
  for (const b of buildings) if (x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m) return b;
  return null;
}

// Suelo de campo de batalla: barro, hierba muerta, ceniza, caminos con rodadas, quemaduras, cráteres y charcos.
function paintGround(){
  gg.setTransform(GS, 0, 0, GS, 0, 0);
  gg.fillStyle = '#4a4633'; gg.fillRect(0, 0, WS, WS);
  for (let i = 0; i < 2600; i++){
    gg.fillStyle = ['rgba(62,58,40,.3)', 'rgba(88,86,56,.22)', 'rgba(52,48,36,.3)', 'rgba(96,90,78,.14)'][i & 3];
    gg.beginPath(); gg.ellipse(rnd(0, WS), rnd(0, WS), rnd(10, 60), rnd(8, 40), rnd(0, 3), 0, TAU); gg.fill();
  }
  for (let i = 0; i < 26000; i++){
    gg.fillStyle = ['#3c3a2a', '#57543a', '#625e44', '#45422f', '#6a6452', '#33312a'][i % 6];
    gg.fillRect(rnd(0, WS), rnd(0, WS), rnd(2, 7), rnd(2, 7));
  }
  gg.lineCap = 'round'; gg.lineJoin = 'round';
  for (let r = 0; r < 3; r++){                         // caminos de barro removido, con dos rodadas
    const pts = []; let x = rnd(0, WS), y = 0; pts.push([x, y]);
    while (y < WS){ x += rnd(-220, 220); y += rnd(150, 300); pts.push([x, y]); }
    gg.save(); if (r === 2){ gg.translate(WS, 0); gg.rotate(Math.PI / 2); }
    for (const [w, col, offs] of [[rnd(30, 40), 'rgba(54,47,35,.9)', [0]], [5, 'rgba(28,24,18,.55)', [-9, 9]]]) for (const off of offs){
      gg.lineWidth = w; gg.strokeStyle = col; gg.beginPath(); pts.forEach(([px, py], i) => i ? gg.lineTo(px + off, py) : gg.moveTo(px + off, py)); gg.stroke();
    }
    gg.restore();
  }
  for (let i = 0; i < 22; i++){ gg.fillStyle = 'rgba(20,18,16,.32)'; gg.beginPath(); gg.ellipse(rnd(0, WS), rnd(0, WS), rnd(30, 85), rnd(24, 60), rnd(0, 3), 0, TAU); gg.fill(); }   // quemaduras
  for (let i = 0; i < 50; i++){                        // cráteres: borde de tierra levantada, hoyo, a veces agua, y cascotes alrededor
    const x = rnd(40, WS - 40), y = rnd(40, WS - 40), r = rnd(12, 34);
    gg.fillStyle = 'rgba(104,96,74,.55)'; gg.beginPath(); gg.arc(x, y, r + 5, 0, TAU); gg.fill();
    gg.fillStyle = 'rgba(30,26,20,.88)'; gg.beginPath(); gg.arc(x, y, r, 0, TAU); gg.fill();
    gg.fillStyle = 'rgba(14,12,10,.6)'; gg.beginPath(); gg.arc(x + r * 0.15, y + r * 0.15, r * 0.6, 0, TAU); gg.fill();
    if (i % 4 === 0){ gg.fillStyle = 'rgba(62,72,78,.85)'; gg.beginPath(); gg.ellipse(x, y, r * 0.62, r * 0.5, 0, 0, TAU); gg.fill(); }
    gg.fillStyle = 'rgba(96,88,68,.7)'; for (let k = 0; k < 12; k++){ const a = rnd(0, TAU), d = r + rnd(6, 26); gg.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(2, 5), rnd(2, 5)); }
  }
  groundDirty = true;
}
// Un edificio según su tipo. Todos chocan como su rectángulo (lista `buildings`).
function addBuilding(b, n){
  const cx = b.x + b.w / 2, cz = b.y + b.h / 2, ht = b.ht, ruin = b.kind === 'ruin';
  const wt = texWall.clone(); wt.needsUpdate = true;
  wt.repeat.set(ruin ? 1 : Math.max(1, Math.round(Math.max(b.w, b.h) / 50)), Math.max(1, Math.round(ht / 34)));
  const wm = mat(wallCols[n % 3], wt);
  if (b.kind === 'block'){                             // bloque de viviendas aún en pie
    world.add(box(b.w, ht, b.h, wm, cx, ht / 2, cz), box(b.w + 6, 4, b.h + 6, roofMat, cx, ht + 2, cz));
  } else if (b.kind === 'bunker'){                     // búnker bajo de hormigón con troneras en los cuatro lados
    world.add(box(b.w, ht, b.h, concreteMat, cx, ht / 2, cz), box(b.w * 0.72, 4, b.h * 0.72, concreteMat, cx, ht + 2, cz));
    world.add(box(b.w * 0.5, 3, 1.4, darkMat, cx, ht * 0.62, b.y - 0.3), box(b.w * 0.5, 3, 1.4, darkMat, cx, ht * 0.62, b.y + b.h + 0.3),
              box(1.4, 3, b.h * 0.5, darkMat, b.x - 0.3, ht * 0.62, cz), box(1.4, 3, b.h * 0.5, darkMat, b.x + b.w + 0.3, ht * 0.62, cz));
  } else if (b.kind === 'factory'){                    // nave con tejado en diente de sierra y chimenea humeante
    world.add(box(b.w, ht, b.h, wm, cx, ht / 2, cz));
    for (let k = 0; k < 3; k++){ const r = box(b.w / 3 + 1, 3, b.h + 4, roofMat, b.x + b.w / 6 + k * b.w / 3, ht + 5, cz); r.rotation.z = 0.32; world.add(r); }
    const ch = rnd(90, 125); world.add(cyl(6, ch, brickMat, b.x + 10, ch / 2, b.y + 10)); fires.push({ x: b.x + 10, y: b.y + 10, h: ch });
  } else {                                             // ruina: muros a medio caer, sin techo, con escombros dentro
    const th = 7, side = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), parts_ = Math.max(2, Math.round(len / 34)), horiz = z0 === z1;
      for (let k = 0; k < parts_; k++){
        const hh = ht * (Math.random() < 0.22 ? 0.1 : rnd(0.3, 1)), f = (k + 0.5) / parts_, sl = len / parts_ + 0.5;
        world.add(box(horiz ? sl : th, hh, horiz ? th : sl, wm, x0 + (x1 - x0) * f, hh / 2, z0 + (z1 - z0) * f));
      }
    };
    side(b.x, b.y + th / 2, b.x + b.w, b.y + th / 2); side(b.x, b.y + b.h - th / 2, b.x + b.w, b.y + b.h - th / 2);
    side(b.x + th / 2, b.y, b.x + th / 2, b.y + b.h); side(b.x + b.w - th / 2, b.y, b.x + b.w - th / 2, b.y + b.h);
    world.add(box(b.w - th, 2, b.h - th, rubbleMat, cx, 1, cz));
    for (let k = 0; k < 7; k++){ const r = box(rnd(6, 16), rnd(3, 9), rnd(6, 16), rubbleMat, rnd(b.x + 12, b.x + b.w - 12), 3, rnd(b.y + 12, b.y + b.h - 12)); r.rotation.set(rnd(-0.4, 0.4), rnd(0, 3), rnd(-0.4, 0.4)); world.add(r); }
    if (fires.length < 8 && Math.random() < 0.6) fires.push({ x: cx + rnd(-10, 10), y: cz + rnd(-10, 10), h: 6, fire: true });
  }
}
function genWorld(){
  paintGround(); world.clear(); dyn.clear();
  buildings = []; blocks = []; fires = [];
  const free = (x, y, m) => x > 30 && y > 30 && x < WS - 30 && y < WS - 30 && !inBuilding(x, y, m) && Math.hypot(x - WS / 2, y - WS / 2) > 90;
  const spot = m => { let x, y, k = 0; do { x = rnd(60, WS - 60); y = rnd(60, WS - 60); } while (!free(x, y, m) && ++k < 60); return [x, y]; };

  const KINDS = ['ruin', 'block', 'bunker', 'ruin', 'factory', 'ruin', 'block', 'bunker', 'ruin'];
  for (let i = 0; i < 400 && buildings.length < 18; i++){
    const kind = KINDS[buildings.length % KINDS.length];
    const b = kind === 'bunker' ? { w: rnd(50, 90), h: rnd(50, 90), ht: rnd(15, 21) }
            : kind === 'factory' ? { w: rnd(120, 170), h: rnd(80, 120), ht: rnd(40, 54) }
            : { w: rnd(60, 150), h: rnd(60, 150), ht: rnd(36, 78) };
    b.kind = kind; b.x = rnd(80, WS - 260); b.y = rnd(80, WS - 260);
    if (Math.hypot(b.x + b.w / 2 - WS / 2, b.y + b.h / 2 - WS / 2) < 280) continue;
    if (buildings.some(o => b.x < o.x + o.w + 60 && b.x + b.w + 60 > o.x && b.y < o.y + o.h + 60 && b.y + b.h + 60 > o.y)) continue;
    buildings.push(b); addBuilding(b, buildings.length);
  }

  // Árboles quemados, alguna conífera oscura y postes de telégrafo: todo se puede aplastar.
  trees = [];
  while (trees.length < 100){
    const t = { x: rnd(30, WS - 30), y: rnd(30, WS - 30), r: rnd(9, 14), down: false, fall: 0 };
    if (!free(t.x, t.y, 12)) continue;
    trees.push(t);
    t.mesh = new THREE.Group(); t.inner = new THREE.Group(); t.mesh.add(t.inner); t.mesh.position.set(t.x, 0, t.y);
    const k = Math.random();
    if (k < 0.6){                                      // tronco calcinado con ramas peladas
      const tr = new THREE.Mesh(trunkGeo, burntMat), sy = rnd(0.9, 1.5); tr.scale.y = sy; tr.position.y = 7 * sy; tr.castShadow = true; t.inner.add(tr);
      for (let j = 0; j < 3; j++){
        const pv = new THREE.Group(), L = rnd(5, 9), a = rnd(0.6, 1.1), y0 = rnd(8, 13) * sy; pv.rotation.y = rnd(0, TAU);
        const br = box(1, L, 1, burntMat, -Math.sin(a) * L / 2, y0 + Math.cos(a) * L / 2, 0); br.rotation.z = a; pv.add(br); t.inner.add(pv);
      }
    } else if (k < 0.85){                              // conífera superviviente
      const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 7; tr.castShadow = true;
      const leaf = new THREE.Mesh(coneGeo, leafMats[trees.length % 3]); leaf.scale.setScalar(t.r * 0.95); leaf.position.y = 12 + t.r * 1.3; leaf.castShadow = true;
      t.inner.add(tr, leaf);
    } else {                                           // poste torcido con su cruceta
      t.inner.add(cyl(0.8, 26, poleMat, 0, 13, 0), box(9, 1, 1, poleMat, 0, 23, 0), box(6, 1, 1, poleMat, 0, 20, 0));
      t.inner.rotation.x = rnd(-0.2, 0.2);
    }
    world.add(t.mesh);
  }

  // Erizos checos (trampas antitanque) en hileras: no se pueden atravesar.
  for (let i = 0; i < 7; i++){
    const [x, y] = spot(24), a = rnd(0, TAU);
    for (let k = 0; k < 5; k++){
      const px = x + Math.cos(a) * k * 30, pz = y + Math.sin(a) * k * 30; if (!free(px, pz, 14)) continue;
      const gp = new THREE.Group(); gp.position.set(px, 5.5, pz); gp.rotation.y = rnd(0, TAU);
      for (const [rx, rz] of [[0.95, 0], [-0.95, 0], [0, Math.PI / 2]]){ const m = box(1.8, 15, 1.8, rustMat, 0, 0, 0); m.rotation.set(rx, 0, rz); gp.add(m); }
      world.add(gp); blocks.push({ x: px, y: pz, r: 8 });
    }
  }
  // Parapetos de sacos terreros, en dos hiladas.
  for (let i = 0; i < 9; i++){
    const [x, y] = spot(24), a = rnd(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < 5; k++){
      const px = x + ca * k * 12, pz = y + sa * k * 12; if (!free(px, pz, 12)) continue;
      const s1 = box(12, 5, 6, sandMat, px, 2.5, pz); s1.rotation.y = -a; world.add(s1);
      if (k < 4){ const s2 = box(12, 5, 6, sandMat, px + ca * 6, 7.5, pz + sa * 6); s2.rotation.y = -a; world.add(s2); }
      blocks.push({ x: px, y: pz, r: 7 });
    }
  }
  // Restos de tanques calcinados, todavía humeando.
  for (let i = 0; i < 3; i++){
    const [x, y] = spot(40); if (Math.hypot(x - WS / 2, y - WS / 2) < 220) continue;
    const w = makeTank(0x33322c, 0x33322c); darken(w);
    w.hull.position.set(x, 0, y); w.tur.position.set(x, 0, y); w.hull.rotation.y = rnd(0, TAU); w.tur.rotation.y = rnd(0, TAU);
    world.add(w.hull, w.tur); blocks.push({ x, y, r: 20 }); fires.push({ x, y, h: 14, fire: true });
  }
  // Alambradas: postes y dos hilos (solo decoración).
  for (let i = 0; i < 8; i++){
    const [x, y] = spot(20), a = rnd(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < 5; k++){ const p = box(1, 9, 1, poleMat, x + ca * k * 16, 4.5, y + sa * k * 16); p.rotation.z = rnd(-0.15, 0.15); world.add(p); }
    for (const hy of [4.5, 8]){ const wr = box(64, 0.5, 0.5, darkMat, x + ca * 32, hy, y + sa * 32); wr.rotation.y = -a; world.add(wr); }
  }
  // Montones de escombros sueltos.
  for (let i = 0; i < 26; i++){
    const [x, y] = spot(10);
    for (let k = 0; k < 4; k++){ const r = box(rnd(3, 9), rnd(2, 5), rnd(3, 9), rubbleMat, x + rnd(-9, 9), 1.5, y + rnd(-9, 9)); r.rotation.set(rnd(-0.5, 0.5), rnd(0, 3), rnd(-0.5, 0.5)); world.add(r); }
  }
}

function reset(){
  if (PM) scene.remove(PM.hull, PM.tur);
  genWorld(); U = newU(); upT = 0;
  P = { x: WS / 2, y: WS / 2, h: -Math.PI / 2, ta: -Math.PI / 2, v: 0, vL: 0, vR: 0, w: 0, hp: 100, ap: 12, mg: 250, mgT: 0, aim: false, aimWant: 0, mga: -Math.PI / 2, inL: 0, inR: 0,
        breech: 'AP', ram: 0, ramType: null, recoil: 0, hurt: 0 };
  PM = makeTank(0x56533a, 0x605c40); scene.add(PM.hull, PM.tur);   // verde oliva apagado y sucio
  enemies = []; shells = []; parts = []; crates = []; queue = []; strikes = []; heat = 0;
  wave = 0; waveT = 1.5; score = 0; combo = 0; comboT = 0; camH = P.h;
  state = 'play';
}

// Tipos de enemigo. sp = velocidad, turn = giro del casco, tr = giro de la torreta, stop = distancia a la que se para,
// rl = recarga del cañón, pow = multiplicador de daño, sc = escala del modelo.
// Mejoras: tras cada oleada se ofrecen tres al azar y eliges una. U guarda lo acumulado en la partida.
let U, UP = [], upT = 0, retreatT = 0;
const newU = () => ({ speed: 1, tur: 1, ram: 1, maxHp: 100, maxAp: MAXAMMO, mgRange: 1, disp: 1, dmg: 1, lv: {} });
const UPG = [
  { k: 'speed',   t: 'MOTOR',         d: '+12% DE VELOCIDAD',                 f: u => u.speed *= 1.12 },
  { k: 'tur',     t: 'TORRETA',       d: 'EL CAÑON GIRA UN 25% MAS RAPIDO',   f: u => u.tur *= 1.25 },
  { k: 'ram',     t: 'CARGADOR',      d: 'CARGA UN 15% MAS RAPIDA',           f: u => u.ram *= 0.85 },
  { k: 'maxHp',   t: 'BLINDAJE',      d: '+20 DE BLINDAJE MAXIMO',            f: u => { u.maxHp += 20; P.hp += 20; } },
  { k: 'maxAp',   t: 'BODEGA',        d: '+4 PROYECTILES DE CAPACIDAD',       f: u => { u.maxAp += 4; P.ap += 4; } },
  { k: 'mgRange', t: 'AMETRALLADORA', d: '+25% DE ALCANCE',                   f: u => u.mgRange *= 1.25 },
  { k: 'disp',    t: 'ESTABILIZADOR', d: 'TIRO MAS PRECISO EN MARCHA',        f: u => u.disp *= 0.7 },
  { k: 'dmg',     t: 'MUNICION',      d: 'EL CAÑON HACE UN 20% MAS DE DAÑO',  f: u => u.dmg *= 1.2 },
  { k: 'fix',     t: 'REPARACION',    d: 'RECUPERA 50 DE BLINDAJE AHORA',     f: u => P.hp = Math.min(u.maxHp, P.hp + 50) },
  { k: 'sup',     t: 'SUMINISTROS',   d: 'LLENA PROYECTILES Y AMETRALLADORA', f: u => { P.ap = u.maxAp; P.mg = 500; } }
];
function openUpgrade(){
  setAim(false); K.F = K.B = K.L = K.R = K.mg = false;
  const pool = UPG.filter(o => o.k !== 'fix' || P.hp < U.maxHp); UP = [];
  while (UP.length < 3) UP.push(pool.splice(Math.random() * pool.length | 0, 1)[0]);
  UP.t = performance.now(); PICK.sel = 0; state = 'upgrade'; blip(660, 0.25);
}
function chooseUpgrade(i){
  const o = UP[i]; if (!o || performance.now() - UP.t < 450) return;   // un momento de gracia, para no elegir sin querer
  o.f(U); U.lv[o.k] = (U.lv[o.k] || 0) + 1;
  say(o.t + ' mejorado'); blip(880, 0.3); state = 'play'; waveT = 1.2;
}
// Listas con cursor (mejoras y game over): se manejan igual con ratón, teclado o mando.
const PICK = { sel: 0 }, DEAD_OPTS = ['REINTENTAR', 'VOLVER AL MENU'];
const pickN = () => state === 'dead' ? DEAD_OPTS.length : UP.length;
const pickY = i => state === 'dead' ? 163 + i * 16 : 84 + i * 42;
const pickAt = () => { for (let i = 0; i < pickN(); i++) if (Math.abs(M.y - pickY(i)) < (state === 'dead' ? 8 : 19) && Math.abs(M.x - W / 2) < 145) return i; return -1; };
function pickCmd(c){
  const n = pickN();
  if (c === 'up' || c === 'down'){ PICK.sel = (PICK.sel + (c === 'up' ? n - 1 : 1)) % n; blip(330, 0.05); return; }
  if (state === 'dead'){
    if (performance.now() - deadAt < 900) return;
    if (c === 'back' || (c === 'ok' && PICK.sel === 1)) start(true); else if (c === 'ok') start(false);
  } else if (c === 'ok') chooseUpgrade(PICK.sel);
}
function pickHover(){ const i = pickAt(); if (i >= 0 && i !== PICK.sel){ PICK.sel = i; blip(330, 0.05); } }
function pickClick(btn){ const i = pickAt(); if (btn === 0 && i >= 0){ PICK.sel = i; pickCmd('ok'); } }

const ETYPE = {
  jeep:   { hp: 60,  r: 11, pts: 120, soft: true, crush: true, sp: 52, turn: 1.8, stop: 290, rl: 5.8 },   // todoterreno lanzacohetes: cohetes lentos que se pueden esquivar
  mortar: { hp: 100, r: 12, pts: 250, soft: true, crush: true },                    // tira por encima de los edificios; el impacto se avisa en el suelo
  heli:   { hp: 60,  r: 14, pts: 400, soft: true, fly: true, sp: 88 },              // helicóptero: te rodea y ametralla; cae con la ametralladora
  td:     { tank: true, fixed: true, hp: 100, r: 15, pts: 350, sp: 30, turn: 0.75, tr: 0, stop: 470, rl: 6.2, pow: 1, sc: 1, ssp: 640, mz: 50 },   // cazacarros: sin torreta, tira de lejos y rápido
  tank:   { tank: true, hp: 100, r: 16, pts: 300, sp: 34, turn: 0.6,  tr: 0.5, stop: 300, rl: 6.5, pow: 1, sc: 1,    cols: [0x5e5746, 0x6a6350] },
  light:  { tank: true, hp: 50,  r: 13, pts: 200, sp: 74, turn: 1.3,  tr: 1.6, stop: 170,                 sc: 0.76, cols: [0x66665a, 0x74746a] },   // rápido, solo ametralladora
  heavy:  { tank: true, hp: 250, r: 21, pts: 600, sp: 19, turn: 0.33, tr: 0.3, stop: 340, rl: 8.5, pow: 2, sc: 1.32, cols: [0x3c3c38, 0x484842] },   // lento, blindado, doble daño
  boss:   { tank: true, hp: 600, r: 27, pts: 2500, sp: 16, turn: 0.3, tr: 0.42, stop: 380, rl: 6.5, pow: 2, sc: 1.7, cols: [0x4a2c26, 0x3a2622], salvo: 1 }   // jefe: dos disparos seguidos y llama kamikazes
};
const SPAWN = { jeep: [380, 800], mortar: [650, 1100], heli: [600, 900], td: [550, 950], tank: [500, 950], light: [450, 800], heavy: [550, 900], boss: [600, 800] };   // distancia al jugador
let queue = [], strikes = [];                        // refuerzos pendientes y granadas de mortero en el aire
function spawnEnemy(kind, ox = P.x, oy = P.y, dMin = SPAWN[kind][0], dMax = SPAWN[kind][1]){
  const T = ETYPE[kind]; let x, y, k = 0;
  do { const a = rnd(0, TAU), d = rnd(dMin, dMax); x = ox + Math.cos(a) * d; y = oy + Math.sin(a) * d; }
  while ((x < 100 || y < 100 || x > WS - 100 || y > WS - 100 || inBuilding(x, y, 28) || Math.hypot(x - P.x, y - P.y) < 200) && ++k < 600);
  x = clamp(x, 60, WS - 60); y = clamp(y, 60, WS - 60);
  const a = Math.atan2(P.y - y, P.x - x);
  enemies.push({ kind, tank: !!T.tank, x, y, h: a, ta: a, hp: T.hp, maxHp: T.hp, r: T.r, rl: rnd(3.5, 6), burst: 0, bt: 0, alive: true, los: false, losT: 0, side: Math.random() < 0.5 ? -1 : 1 });
}
// Cada oleada trae un grupo inicial y unos refuerzos que llegan después, más cerca, para que siempre haya algo encima.
function waveKinds(w){
  const n = (k, c) => Array(c).fill(k);
  if (w === 1) return [[...n('jeep', 2), 'tank'], []];
  if (w === 2) return [[...n('jeep', 2), 'tank', 'light'], ['heli']];
  if (w === 3) return [[...n('jeep', 2), 'heavy', 'mortar'], ['td', ...n('jeep', 2)]];
  if (w === 4) return [[...n('jeep', 4), 'tank', 'td', 'mortar'], ['light', 'heli']];
  if (w === 5) return [['boss', 'mortar', ...n('jeep', 2)], ['light', 'heli']];
  const k = w - 5;                                   // a partir de la 6 crece sola; jefe cada 5 oleadas
  return [[...(w % 5 === 0 ? ['boss'] : []), ...n('jeep', 2 + 2 * Math.min(k, 3)), ...n('tank', 1 + Math.min(k >> 1, 3)), ...n('heavy', Math.min(k >> 1, 2)), ...n('td', 1 + Math.min(k >> 1, 2)), ...n('mortar', 1 + Math.min(k >> 1, 3))],
          [...n('light', 1 + Math.min(k >> 1, 3)), ...n('heli', Math.min(1 + (k >> 1), 3)), ...n('jeep', 2)]];
}
const WAVE_TAG = { 2: 'HELICOPTERO', 3: 'PESADO Y CAZACARROS', 4: 'ASALTO TOTAL' };
function spawnWave(){
  wave++;
  let wrecks = 0;                                     // se retiran los restos viejos: quedan solo los 8 tanques más recientes
  for (let i = enemies.length - 1; i >= 0; i--){ const e = enemies[i]; if (!e.alive && (!e.tank || ++wrecks > 8)) e.gone = true; }
  const [first, later] = waveKinds(wave);
  let mate = null;                                     // los todoterrenos llegan en parejas
  for (const kind of first){
    if (kind === 'jeep' && mate){ spawnEnemy('jeep', mate.x, mate.y, 22, 45); mate = null; }
    else { spawnEnemy(kind); mate = kind === 'jeep' ? enemies[enemies.length - 1] : mate; }
  }
  queue = later.map((kind, i) => ({ kind, t: 15 + i * 2.5, first: i === 0 }));
  const tag = first.includes('boss') ? 'JEFE' : WAVE_TAG[wave];
  banner = 'OLEADA ' + wave + (tag ? ' - ' + tag : ''); bannerT = 2.6;
}
function updQueue(dt){
  const quiet = !enemies.some(e => e.alive);          // si ya no queda nadie, los refuerzos entran enseguida
  for (let i = queue.length - 1; i >= 0; i--){
    const q = queue[i]; q.t -= dt * (quiet ? 6 : 1);
    if (q.t <= 0){ if (q.first){ banner = '¡REFUERZOS!'; bannerT = 1.8; blip(700, 0.2); } spawnEnemy(q.kind); queue.splice(i, 1); }
  }
}

function blocked(x1, y1, x2, y2){
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 14);
  for (let i = 1; i < n; i++) if (inBuilding(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)) return true;
  return false;
}
function pushOut(o, r){
  let hit = false;
  for (const b of buildings){
    const cx = clamp(o.x, b.x, b.x + b.w), cy = clamp(o.y, b.y, b.y + b.h);
    const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d < r){ hit = true; if (d > 0.001){ o.x = cx + dx / d * r; o.y = cy + dy / d * r; } else o.y = b.y - r; }
  }
  for (const c of blocks){                             // erizos, sacos y restos: frenan el paso pero no las balas ni la vista
    const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy), m = r + c.r - 6;
    if (d < m && d > 0.001){ hit = true; o.x = c.x + dx / d * m; o.y = c.y + dy / d * m; }
  }
  o.x = clamp(o.x, 20, WS - 20); o.y = clamp(o.y, 20, WS - 20);
  return hit;
}

/* ---------- sonido del tanque ---------- */
let engOsc, engGain;
const trk = {};                                    // traqueteo de cada oruga: { lvl, lfo }
function t55Audio(AC, master){
  engOsc = AC.createOscillator(); engOsc.type = 'sawtooth';
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
  engGain = AC.createGain(); engGain.gain.value = 0;
  engOsc.connect(f).connect(engGain).connect(master); engOsc.start();
    // Traqueteo de orugas: ruido filtrado que "late" con los eslabones. Cada oruga suena por su lado:
    // la izquierda por el altavoz izquierdo y la derecha por el derecho; si se mueven las dos, por ambos.
    for (const [side, panTo] of [['L', -1], ['R', 1]]){
      const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.9;
      const trem = AC.createGain(); trem.gain.value = 0.55;
      const lfo = AC.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 6;
      const depth = AC.createGain(); depth.gain.value = 0.45; lfo.connect(depth).connect(trem.gain);
      const lvl = AC.createGain(); lvl.gain.value = 0;
      src.connect(bp).connect(trem).connect(lvl);
      if (AC.createStereoPanner){ const pn = AC.createStereoPanner(); pn.pan.value = panTo; lvl.connect(pn).connect(master); } else lvl.connect(master);
      src.start(); lfo.start(); trk[side] = { lvl, lfo, pan: panTo };
    }
}
/* ---------- música ----------
   Una sola canción en varias variaciones (juegos/t55/musica.js, hecha con juegos/t55/herramientas/render-music.js).
   La consola la reproduce; aquí solo se decide cuál toca. */
function musicMode(){
  if (state === 'dead') return 'dead';
  if (state === 'upgrade') return 'shop';
  if (state !== 'play') return 'menu';
  if (P.aim) return 'aim';
  // en combate la canción sube un semitono por oleada (más aguda y más rápida, como subir la velocidad de la cinta)
  const rate = 2 ** (clamp(wave - 1, 0, 3) / 12);
  if (P.hp <= 30) return ['danger', rate];
  if (enemies.some(e => e.alive && e.kind === 'boss')) return 'boss';
  return [heat > 0 || enemies.some(e => e.alive && e.los && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < 270000) ? 'fight' : 'calm', rate];
}

const distVol = (x, y) => clamp(1 - Math.hypot(x - P.x, y - P.y) / 1100, 0.08, 1);

/* ---------- efectos ---------- */
function burst(x, y, n, size, fire, z = 4){
  for (let i = 0; i < n; i++){
    const a = rnd(0, TAU), s = rnd(10, 90) * size;
    parts.push({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rnd(20, 110) * size, r: rnd(3, 8) * size, life: rnd(0.3, 0.9), max: 0.9, fire: fire && i % 2 === 0 });
  }
}
function floatText(x, y, txt, col){ parts.push({ x, y, z: 26, vx: 0, vy: 0, vz: 22, r: 0, life: 1.2, max: 1.2, txt, col }); }

/* ---------- jugador ---------- */
// Sin estabilizador: parado el tiro va donde apuntas; en marcha o girando se abre mucho.
const dispersion = () => 0.004 + (Math.abs(P.v) * 0.0009 + Math.abs(P.w) * 0.06) * U.disp;
function fire(){
  if (state !== 'play') return;
  if (!P.breech){ say(P.ram > 0 ? 'Cargando…' : 'Recámara vacía — pulsa ' + (pad.on ? 'X' : 'R') + ' para cargar'); boom(0.08, 900, 0.06); return; }
  const a = P.ta + gauss() * dispersion();
  const mx = P.x + Math.cos(P.ta) * 40, my = P.y + Math.sin(P.ta) * 40;
  shells.push({ x: mx, y: my, a, sp: 950, type: P.breech, own: 0, dist: 0 });
  P.breech = null; P.recoil = 1; shake = 7;
  burst(mx, my, 12, 0.7, true, 15); boom(0.7, 500, 0.9); heat = 4;
}
function load(t){
  if (state !== 'play') return;
  if (P.breech || P.ram > 0){ say('La recámara ya está cargada'); return; }
  if (P.ap <= 0){ say('Sin proyectiles БР: recoge cajas'); return; }
  P.ap--; P.ramType = t; P.ram = RAM * U.ram * (combo >= 3 ? 0.5 : 1); boom(0.15, 500, 0.2);   // con racha de 3 o más, carga el doble de rápido
}
// Ametralladora coaxial ПКТ: ráfaga rápida, poco daño, sin recarga manual. Buena contra cañones, floja contra tanques.
function fireMG(){
  P.mgT = 0.09; P.mg--;
  const a = P.mga + gauss() * (0.018 + dispersion() * 0.5);   // dispara hacia donde apunta la ametralladora, no el cañón
  shells.push({ x: P.x, y: P.y, a, sp: 900, type: 'MG', own: 0, dist: 0 });     // sale del centro del tanque, no del cañón
  burst(P.x + Math.cos(a) * 6, P.y + Math.sin(a) * 6, 1, 0.35, true, 19); boom(0.1, 2400, 0.05);
}
// Mando (disposición estándar): L2 / R2 = oruga izquierda / derecha adelante (analógicas), L1 / R1 = esa oruga
// hacia atrás, stick derecho = torreta, stick izquierdo = ametralladora (apunta y dispara), A = cañón,
// B (mantener) = radar ampliado, X = cargar, Y = mira, Start = empezar / pausa.
function pollPad(){
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
  if (!gp){ pad.L = pad.R = pad.tx = pad.sx = pad.sy = 0; pad.mg = pad.big = false; return; }
  const val = i => gp.buttons[i] ? gp.buttons[i].value : 0;
  const hit = i => { const d = val(i) > 0.5, was = pad.prev[i]; pad.prev[i] = d; return d && !was; };
  pad.L = val(6) - (val(4) > 0.5 ? 1 : 0); pad.R = val(7) - (val(5) > 0.5 ? 1 : 0);
  const ax = gp.axes[2] || 0; pad.tx = Math.abs(ax) < 0.18 ? 0 : ax;
  pad.sx = gp.axes[0] || 0; pad.sy = gp.axes[1] || 0;                       // stick izquierdo
  const sv = Math.abs(pad.sy) > 0.6 ? Math.sign(pad.sy) : 0, sh = Math.abs(pad.sx) > 0.6 ? Math.sign(pad.sx) : 0;
  const stUp = sv < 0 && pad.sv >= 0, stDn = sv > 0 && pad.sv <= 0, stLf = sh < 0 && pad.sh >= 0, stRt = sh > 0 && pad.sh <= 0; pad.sv = sv; pad.sh = sh;
  const fireB = hit(0), ap = hit(2), aimB = hit(3), go = hit(9), bk = hit(1), h12 = hit(12), h13 = hit(13), h14 = hit(14), h15 = hit(15);
  const up = h12 || stUp, dn = h13 || stDn, lf = h14 || stLf, rt = h15 || stRt;   // cruceta o stick, para el menú
  pad.mg = Math.hypot(pad.sx, pad.sy) > 0.35;        // empujar el stick izquierdo apunta y dispara la ametralladora
  pad.big = val(1) > 0.5;                            // B mantenido: radar ampliado
  if (pad.L || pad.R || pad.tx || pad.mg || sv || sh || fireB || ap || aimB || go) pad.on = true;   // el HUD pasa a mostrar los botones del mando
  if (state === 'off'){
    if (pad.on !== pad.hintOn){ pad.hintOn = pad.on; updateHint(); }          // al usar un mando, la ayuda de la caja pasa a sus botones
    if ((fireB || go || aimB) && mobileDlg.open){ mobileDlg.close(); return; }
    if (CASE.open){ if (aimB) openManual(); if (fireB || go) insertDisc(); if (bk) closeCase(); }
    else if (fireB || go || aimB) openCase();
    return;
  }
  if (state === 'boot') return;
  if (state === 'menu'){ if (up) menuCmd('up'); if (dn) menuCmd('down'); if (lf) menuCmd('left'); if (rt) menuCmd('right'); if (fireB || go) menuCmd('ok'); if (bk) menuCmd('back'); return; }
  if (state === 'dead' || state === 'upgrade'){ if (up) pickCmd('up'); if (dn) pickCmd('down'); if (fireB || (go && state === 'dead')) pickCmd('ok'); if (bk) pickCmd('back'); return; }
  if (go){ pauseGame(); return; }                    // Start en partida: pausa
  if (fireB) fire();
  if (ap) load('AP');
  if (aimB) P.aim = !P.aim;
}
function hurtPlayer(s){
  const mgHit = s.type === 'MG', rel = Math.abs(angDiff(s.a + Math.PI, P.h));
  const dmg = mgHit ? 1 : s.dmg || (rel < 1 ? 10 : rel < 2.2 ? 20 : 32) * (s.pow || 1);      // frontal / flanco / trasero; el pesado, el doble
  P.hp -= dmg; P.hurt = mgHit ? 0.1 : 0.35; shake = Math.max(shake, mgHit ? 2 : s.pow > 1 ? 16 : 11);
  if (mgHit){ burst(s.x, s.y, 2, 0.4, true, 12); boom(0.12, 1600, 0.06); }
  else {
    combo = 0; burst(s.x, s.y, 12, 1, true, 12); boom(0.8, 300, 0.6);
    floatText(P.x, P.y, '−' + dmg + (s.dmg ? ' cohete' : rel < 1 ? ' frontal' : rel < 2.2 ? ' flanco' : ' ¡trasero!'), s.pow > 1 ? '#ff3020' : '#ff7050');
  }
  heat = 5; playerDown();
}
function playerDown(){
  if (P.hp > 0) return;
  P.hp = 0; state = 'dead'; deadAt = performance.now(); setAim(false); PICK.sel = 0;
  burst(P.x, P.y, 60, 2.2, true); boom(1, 200, 1.6);
  if (score > best){ best = score; try { localStorage.setItem('t55best', best); } catch (e){} }
}
function blastPlayer(dmg, txt){                       // explosiones: kamikazes y morteros
  P.hp -= dmg; P.hurt = 0.35; shake = Math.max(shake, 13); combo = 0; heat = 5;
  floatText(P.x, P.y, '−' + dmg + ' ' + txt, '#ff7050'); playerDown();
}

function updPlayer(dt){
  const p = P;
  // Teclado: W / S mueven las dos orugas; A y D frenan una (con W o S) o las contrarrotan (solas).
  // A gira a la izquierda y D a la derecha (ver el mapa de teclas). Sin teclas, manda el mando.
  const f = K.F ? 1 : K.B ? -1 : 0; let kL = 0, kR = 0;
  if (f){ kL = f * (K.R && !K.L ? 0.35 : 1); kR = f * (K.L && !K.R ? 0.35 : 1); }
  else if (K.L && K.R) kL = kR = 1;
  else if (K.L){ kL = 1; kR = -1; }
  else if (K.R){ kL = -1; kR = 1; }
  const keys = f || K.L || K.R;
  p.inL = keys ? kL : pad.L; p.inR = keys ? kR : pad.R;
  for (const s of ['L', 'R']){
    const in_ = p['in' + s], v = p['v' + s];
    const tv = SPEED * U.speed * (in_ < 0 ? in_ * 0.6 : in_);  // marcha atrás al 60 %
    const speedingUp = tv * v >= 0 && Math.abs(tv) > Math.abs(v);
    p['v' + s] = toward(v, tv, (speedingUp ? 45 : 160) * dt);
  }
  p.v = (p.vL + p.vR) / 2;
  p.w = clamp((p.vL - p.vR) / 80, -1.1, 1.1);
  p.h += p.w * dt; p.ta += p.w * dt;                 // la torreta va montada en el casco
  // Torreta con ratón: fuera de la mira sigue al cursor; dentro de la mira (clic derecho) el ratón está
  // capturado y mueve un punto de puntería, como en un shooter. En ambos casos gira a su velocidad, despacio.
  if (!pad.on && M.seen){
    if (p.aim){
      p.aimWant += p.w * dt;                                               // el casco arrastra también la puntería
      p.aimWant = p.ta + clamp(angDiff(p.aimWant, p.ta), -AIM_LEAD, AIM_LEAD);   // el punto no se aleja más de lo que cabe en la mira
    }
    p.ta += clamp(angDiff(p.aim ? p.aimWant : cursorAngle(), p.ta), -TURRET * U.tur * dt, TURRET * U.tur * dt);
  }
  p.ta += pad.tx * TURRET * U.tur * 1.6 * dt;                // mando: stick derecho
  // Ametralladora: va en su propio afuste en el centro del tanque y gira con independencia del cañón, mucho más rápido.
  p.mga += p.w * dt;
  if (pad.on){ if (Math.hypot(pad.sx, pad.sy) > 0.35) p.mga += clamp(angDiff(camH + Math.atan2(pad.sx, -pad.sy), p.mga), -MG_RATE * dt, MG_RATE * dt); }   // mando: hacia donde empujas el stick izquierdo (arriba = al frente)
  else if (M.seen) p.mga += clamp(angDiff(p.aim ? p.aimWant : cursorAngle(), p.mga), -MG_RATE * dt, MG_RATE * dt);
  p.x += Math.cos(p.h) * p.v * dt; p.y += Math.sin(p.h) * p.v * dt;
  if (pushOut(p, 18)){ p.vL *= 0.9; p.vR *= 0.9; }
  for (const t of trees) if (!t.down && (t.x - p.x) ** 2 + (t.y - p.y) ** 2 < 300){
    t.down = true; t.mesh.rotation.y = -p.h; boom(0.15, 700, 0.25); burst(t.x, t.y, 5, 0.5, false);
  }
  if (Math.abs(p.vL) > 4 || Math.abs(p.vR) > 4){
    gg.save(); gg.translate(p.x, p.y); gg.rotate(p.h); gg.fillStyle = 'rgba(45,38,22,.16)';
    gg.fillRect(-20, -14, 6, 6); gg.fillRect(-20, 8, 6, 6); gg.restore(); groundDirty = true;
  }
  // aplastar cañones y recoger cajas
  for (const e of enemies) if (e.alive && ETYPE[e.kind].crush && Math.abs(p.v) > 25 && Math.hypot(e.x - p.x, e.y - p.y) < 24) killEnemy(e, '¡APLASTADO!');
  for (let i = crates.length - 1; i >= 0; i--){
    const c = crates[i];
    if (Math.hypot(c.x - p.x, c.y - p.y) < 26){
      if (c.kind === 'hp'){ p.hp = Math.min(U.maxHp, p.hp + 30); floatText(c.x, c.y, '+30 blindaje', '#9fd060'); }
      else { p.ap = Math.min(U.maxAp, p.ap + 4); p.mg = Math.min(500, p.mg + 100); floatText(c.x, c.y, '+4 БР +100 ПКТ', '#ffe060'); }
      blip(520, 0.18); if (c.mesh) dyn.remove(c.mesh); crates.splice(i, 1);
    }
  }
  if (p.ram > 0){ p.ram -= dt; if (p.ram <= 0){ p.breech = p.ramType; boom(0.2, 1200, 0.08); } }
  p.mgT -= dt;
  if ((K.mg || pad.mg) && p.mgT <= 0){
    if (p.aim){ p.mgT = 0.8; say('La mira es solo para el cañón'); }
    else if (p.mg > 0) fireMG(); else { p.mgT = 0.4; say('Ametralladora sin munición'); }
  }
  p.recoil = Math.max(0, p.recoil - dt * 4); p.hurt = Math.max(0, p.hurt - dt);
}

/* ---------- enemigos ---------- */
function updEnemies(dt){
  for (const e of enemies){
    if (!e.alive) continue;
    const T = ETYPE[e.kind], dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    e.losT -= dt;
    if (e.losT <= 0){ e.losT = 0.25; e.los = !blocked(e.x, e.y, P.x, P.y); }
    if (e.kind === 'jeep'){                            // todoterreno: se acerca, se para y lanza cohetes lentos
      const df = angDiff(ang, e.h); e.h += clamp(df, -T.turn * dt, T.turn * dt); e.ta = e.h;
      if (d > T.stop || !e.los){
        e.x += Math.cos(e.h) * T.sp * dt; e.y += Math.sin(e.h) * T.sp * dt;
        if (pushOut(e, e.r + 1)){ e.x += Math.cos(e.h + e.side * 1.57) * T.sp * 0.8 * dt; e.y += Math.sin(e.h + e.side * 1.57) * T.sp * 0.8 * dt; }
      } else if ((e.rl -= dt) <= 0 && Math.abs(df) < 0.15){
        e.rl = T.rl * rnd(0.85, 1.25);
        shells.push({ x: e.x + Math.cos(e.h) * 10, y: e.y + Math.sin(e.h) * 10, a: e.h + gauss() * 0.04, sp: 230, type: 'RK', own: 1, dist: 0, dmg: 8 });
        burst(e.x - Math.cos(e.h) * 10, e.y - Math.sin(e.h) * 10, 5, 0.5, false, 14); boom(0.3 * distVol(e.x, e.y), 1000, 0.4);
      }
      continue;
    }
    if (e.kind === 'heli'){                            // helicóptero: vuela por encima de todo, da vueltas a tu alrededor y suelta ráfagas
      e.los = true; e.orb = (e.orb ?? ang + Math.PI) + e.side * 0.38 * dt;
      const tx = P.x + Math.cos(e.orb) * 210, ty = P.y + Math.sin(e.orb) * 210, td = Math.hypot(tx - e.x, ty - e.y) || 1, v = Math.min(T.sp, td * 1.2);
      e.vx = (e.vx || 0) + ((tx - e.x) / td * v - (e.vx || 0)) * Math.min(1, dt * 1.6); e.vy = (e.vy || 0) + ((ty - e.y) / td * v - (e.vy || 0)) * Math.min(1, dt * 1.6);   // con inercia: vuela suave
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.h += clamp(angDiff(ang, e.h), -1.4 * dt, 1.4 * dt); e.ta = e.h;
      if (d < 300 && (e.rl -= dt) <= 0 && Math.abs(angDiff(ang, e.h)) < 0.2){ e.burst = 5; e.rl = rnd(3.2, 4.4); }
      if (e.burst > 0 && (e.bt -= dt) <= 0){
        e.bt = 0.09; e.burst--;
        shells.push({ x: e.x + Math.cos(e.h) * 12, y: e.y + Math.sin(e.h) * 12, a: e.h + gauss() * 0.07, sp: 560, type: 'MG', own: 1, dist: 0, zh: 38, fly: true });
        boom(0.1 * distVol(e.x, e.y), 2200, 0.05);
      }
      if ((e.ct = (e.ct ?? 0) - dt) <= 0){ e.ct = 0.13; if (d < 600) boom(0.04 * distVol(e.x, e.y), 220, 0.06); }   // batir de palas
      continue;
    }
    if (e.kind === 'mortar'){                          // mortero: no necesita verte; apunta adonde vas a estar
      if (e.retreat){ e.x -= Math.cos(ang) * 45 * dt; e.y -= Math.sin(ang) * 45 * dt; continue; }   // retirada: se aleja y deja de tirar
      e.ta += clamp(angDiff(ang, e.ta), -0.8 * dt, 0.8 * dt); e.h = e.ta;
      if (d < 1150 && d > 140 && (e.rl -= dt) <= 0){
        e.rl = rnd(6.5, 8.5);
        strikes.push({ x: clamp(P.x + Math.cos(P.h) * P.v * 1.4 + rnd(-28, 28), 10, WS - 10), y: clamp(P.y + Math.sin(P.h) * P.v * 1.4 + rnd(-28, 28), 10, WS - 10), t: 2.8, max: 2.8, r: 38 });
        burst(e.x, e.y, 5, 0.5, false, 16); boom(0.3 * distVol(e.x, e.y), 180, 0.5);
      }
      continue;
    }
    if (e.tank && (d > T.stop || !e.los)){
      const df = angDiff(ang, e.h), sp = T.sp * (d > 650 ? 1.4 : 1);   // de lejos vienen a toda marcha
      e.h += clamp(df, -T.turn * dt, T.turn * dt);
      if (Math.abs(df) < 0.6){ e.x += Math.cos(e.h) * sp * dt; e.y += Math.sin(e.h) * sp * dt; pushOut(e, e.r + 1); }
    } else if (T.fixed) e.h += clamp(angDiff(ang, e.h), -T.turn * dt, T.turn * dt);   // el cazacarros apunta con todo el casco
    if (e.kind === 'boss' && (e.ct = (e.ct ?? 8) - dt) <= 0){   // el jefe pide apoyo aéreo cada poco
      e.ct = 15;
      if (enemies.filter(o => o.alive && o.kind === 'heli').length < 2){ spawnEnemy('heli', e.x, e.y, 80, 160); say('¡El jefe pide apoyo aéreo!'); }
    }
    const tr = e.tank ? T.tr : 0.8;
    e.ta += clamp(angDiff(ang, e.ta), -tr * dt, tr * dt);
    if (T.fixed) e.ta = e.h;
    const aim = Math.abs(angDiff(ang, e.ta)), mz = (T.mz || 28) * (T.sc || 1), mx = e.x + Math.cos(e.ta) * mz, my = e.y + Math.sin(e.ta) * mz;
    if (e.kind === 'light'){                           // ligero: ráfagas de ametralladora a corta distancia
      if (e.los && d < 300){ e.rl -= dt; if (e.rl <= 0 && aim < 0.12){ e.burst = 8; e.rl = rnd(1.6, 2.4); } }
      if (e.burst > 0 && (e.bt -= dt) <= 0){
        e.bt = 0.1; e.burst--;
        shells.push({ x: mx, y: my, a: e.ta + gauss() * 0.06, sp: 620, type: 'MG', own: 1, dist: 0 });
        burst(mx, my, 1, 0.35, true, 10); boom(0.1 * distVol(e.x, e.y), 2200, 0.05);
      }
    } else if (e.los && d < 620){                      // cañón: un proyectil por recarga (el del pesado pega el doble)
      const shoot = () => {
        shells.push({ x: mx, y: my, a: e.ta + gauss() * (0.025 + Math.abs(P.v) * 0.0008), sp: T.ssp || 520, type: 'AP', own: 1, dist: 0, pow: T.pow || 1 });
        burst(mx, my, T.pow > 1 ? 12 : 6, T.pow > 1 ? 0.9 : 0.6, true, 12); boom((T.pow > 1 ? 0.6 : 0.4) * distVol(e.x, e.y), T.pow > 1 ? 300 : 450, 0.5);
      };
      e.rl -= dt;
      if (e.burst > 0 && (e.bt -= dt) <= 0){ e.burst--; shoot(); }      // segundo disparo de la salva
      if (e.rl <= 0 && aim < 0.05){ shoot(); e.rl = (e.tank ? T.rl : 5) * rnd(0.85, 1.2); if (T.salvo){ e.burst = T.salvo; e.bt = 0.45; } }
    }
  }
}

function killEnemy(e, tag){
  e.alive = false; shake = Math.max(shake, 9);
  burst(e.x, e.y, 34, 1.6, true); boom(0.6 * distVol(e.x, e.y), 220, 1.2);
  combo++; comboT = 6; heat = 5;
  if (e.kind === 'heli'){ e.gone = true; burst(e.x, e.y, 20, 1.2, true, 45); }   // el helicóptero estalla en el aire y no deja restos
  if (combo === 3) say('¡Racha! Carga rápida');
  const pts = ETYPE[e.kind].pts * combo;
  score += pts;
  floatText(e.x, e.y, (tag ? tag + ' ' : '') + '+' + pts + (combo > 1 ? '  ×' + combo : ''), '#ffe9a0');
  blip(300 + combo * 60);
  if (e.tank)        // solo los tanques sueltan cajas
    crates.push({ x: e.x + rnd(-14, 14), y: e.y + rnd(-14, 14), kind: P.hp < 60 || Math.random() < 0.4 ? 'hp' : 'he' });
  if (e.kind === 'boss'){ burst(e.x, e.y, 60, 2.4, true); boom(1, 160, 1.8); shake = 18; }
  checkClear(e.kind === 'boss');
}
function checkClear(boss){
  if (waveT > 0 || upT > 0 || queue.length || enemies.some(o => o.alive)) return;
  upT = 1.8;                                            // un respiro, y a elegir mejora score += 250 * wave; banner = (boss ? '¡JEFE DESTRUIDO!' : 'OLEADA ' + wave + ' DESPEJADA') + '  +' + 250 * wave; bannerT = 2.4;
  P.hp = Math.min(U.maxHp, P.hp + 25); P.ap = Math.min(U.maxAp, P.ap + 6); P.mg = Math.min(500, P.mg + 80);
}
// Granadas de mortero: caen donde marca el círculo rojo del suelo al acabarse la cuenta.
function updStrikes(dt){
  for (let i = strikes.length - 1; i >= 0; i--){
    const s = strikes[i]; s.t -= dt;
    if (s.t > 0) continue;
    const v = distVol(s.x, s.y);
    burst(s.x, s.y, 24, 1.3, true); boom(0.75 * v, 240, 0.9); shake = Math.max(shake, 7 * v);
    gg.fillStyle = 'rgba(18,14,9,.55)'; gg.beginPath(); gg.arc(s.x, s.y, 15, 0, TAU); gg.fill(); groundDirty = true;   // cráter
    if (state === 'play' && Math.hypot(P.x - s.x, P.y - s.y) < s.r) blastPlayer(12, 'mortero');
    if (s.ring) dyn.remove(s.ring, s.fill, s.sh);
    strikes.splice(i, 1);
  }
}

// Impacto de un proyectil de cañón contra el suelo o un muro.
function explode(s){ burst(s.x, s.y, 8, 0.6, true); boom(0.3 * distVol(s.x, s.y), 600, 0.3); }

function updShells(dt){
  for (let i = shells.length - 1; i >= 0; i--){
    const s = shells[i]; let move = s.sp * dt, dead = false;
    const cx = Math.cos(s.a), cy = Math.sin(s.a);
    while (move > 0 && !dead){
      const st = Math.min(6, move); move -= st; s.x += cx * st; s.y += cy * st; s.dist += st;
      const mg = s.type === 'MG', range = mg ? (s.own ? 320 : 320 * U.mgRange) : s.type === 'RK' ? 640 : 1000;   // la ametralladora es de corto alcance
      if (s.x < 0 || s.y < 0 || s.x > WS || s.y > WS || s.dist > range){ dead = true; if (!mg && s.dist > range) explode(s); break; }
      if (!s.fly && inBuilding(s.x, s.y)){ dead = true; if (mg) burst(s.x, s.y, 2, 0.4, false, 12); else explode(s); break; }
      if (s.own === 0){
        for (const e of enemies) if (e.alive && (e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (e.r + 3) ** 2){
          dead = true;
          if (mg){                                   // ametralladora: 3 impactos tumban un cañón; a un tanque apenas lo araña
            burst(s.x, s.y, 2, 0.4, true, 10);
            e.hp -= ETYPE[e.kind].soft ? 34 : Math.abs(angDiff(s.a + Math.PI, e.h)) < 0.9 ? 2 : 5;
            if (e.hp <= 0) killEnemy(e);
          }
          else {
            burst(s.x, s.y, 10, 0.8, true, 12);
            if (!e.tank) killEnemy(e);
            else {
              const front = Math.abs(angDiff(s.a + Math.PI, e.h)) < 0.9;
              e.hp -= (front ? 50 : 100) * U.dmg;
              if (e.hp <= 0) killEnemy(e, front ? '' : '¡FLANCO!');
              else { floatText(e.x, e.y, 'blindaje frontal', '#cfd4b8'); boom(0.4 * distVol(e.x, e.y), 900, 0.3); }
            }
          }
          break;
        }
      } else if (state === 'play' && (P.x - s.x) ** 2 + (P.y - s.y) ** 2 < 256){ dead = true; hurtPlayer(s); }
    }
    if (dead){ if (s.mesh) dyn.remove(s.mesh); shells.splice(i, 1); }
  }
}

function update(dt){
  if (msgT > 0) msgT -= dt;
  if (bannerT > 0) bannerT -= dt;
  shake = Math.max(0, shake - dt * 30);
  for (let i = parts.length - 1; i >= 0; i--){
    const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (!p.txt){ p.vx *= 0.94; p.vy *= 0.94; if (p.fire) p.vz -= 160 * dt; else p.vz *= 0.97; if (p.z < 1){ p.z = 1; p.vz = 0; } }
    if (p.life <= 0) parts.splice(i, 1);
  }
  if (state === 'play'){
    updPlayer(dt); updEnemies(dt); updQueue(dt); updStrikes(dt);
    if (heat > 0) heat -= dt;
    if (upT > 0 && (upT -= dt) <= 0 && state === 'play') openUpgrade();
    if (comboT > 0){ comboT -= dt; if (comboT <= 0) combo = 0; }
    if (waveT > 0){ waveT -= dt; if (waveT <= 0) spawnWave(); }
    // Si solo quedan morteros y no faltan refuerzos, sin escolta se retiran y la oleada se da por ganada.
    const left = enemies.filter(e => e.alive);
    if (waveT <= 0 && upT <= 0 && !queue.length && left.length && left.every(e => e.kind === 'mortar')){
      if (!left[0].retreat){ for (const e of left) e.retreat = true; say('Los morteros se retiran'); retreatT = 3; }
      else if ((retreatT -= dt) <= 0){ for (const e of left){ e.alive = false; e.gone = true; } checkClear(false); }
    }
  }
  if (state !== 'menu' && state !== 'upgrade') updShells(dt);               // en pausa los proyectiles también se quedan quietos
  if (AC){
    const k = state === 'play' ? Math.max(Math.abs(P.vL), Math.abs(P.vR)) / SPEED : 0;
    engOsc.frequency.value = 34 + k * 60;
    engGain.gain.value = state === 'play' ? 0.035 + k * 0.04 : 0;
    for (const side of ['L', 'R']) if (trk[side]){     // cada oruga suena según su propia velocidad
      const kv = state === 'play' ? Math.abs(P['v' + side]) / SPEED : 0;
      trk[side].lvl.gain.value = kv > 0.04 ? 0.05 + kv * 0.14 : 0; trk[side].lfo.frequency.value = 5 + kv * 17;
    }
  }
}

// Menú: secuencia de planos de cine. Cada plano dura SHOT segundos y mueve la cámara despacio entre dos puntos;
// en los cortes hay un fundido a negro (menuFade).
const SHOT = 5; let menuT = 0, menuFade = 0;
function menuCam(dt){
  menuT += dt;
  const n = Math.floor(menuT / SHOT), u = (menuT % SHOT) / SHOT, e = u * u * (3 - 2 * u), L = (a, b) => a + (b - a) * e;
  const fx = Math.cos(P.h), fz = Math.sin(P.h), rx = -fz, rz = fx;
  const tb = buildings.length ? buildings[n % buildings.length] : null, fr = fires.length ? fires[n % fires.length] : null;
  let px, py, pz, lx, ly, lz;
  switch (n % 6){
    case 0: { const a = P.h + 2.4 + e * 0.8;                                    // órbita general alrededor del tanque
      px = P.x + Math.cos(a) * 120; pz = P.y + Math.sin(a) * 120; py = L(40, 58); lx = P.x; ly = 10; lz = P.y; break; }
    case 1: { const d = L(-34, 30);                                             // travelling a ras de suelo junto a las orugas
      px = P.x + rx * 30 + fx * d; pz = P.y + rz * 30 + fz * d; py = 5; lx = P.x + fx * (d + 12); ly = 6; lz = P.y + fz * (d + 12); break; }
    case 2: { const d = L(62, 84);                                              // de frente a la boca del cañón, alejándose
      px = P.x + Math.cos(P.ta) * d + rx * 9; pz = P.y + Math.sin(P.ta) * d + rz * 9; py = L(19, 14); lx = P.x; ly = 14; lz = P.y; break; }
    case 3: if (tb){ const cx = tb.x + tb.w / 2, cz = tb.y + tb.h / 2;         // grúa que baja sobre un edificio del mapa
      px = cx - 190 + e * 60; pz = cz + 150; py = L(150, 105); lx = cx; ly = 20; lz = cz; break; }
    case 4: if (fr){ const a = n + e * 0.7;                                     // rodeando un incendio, subiendo con el humo
      px = fr.x + Math.cos(a) * 70; pz = fr.y + Math.sin(a) * 70; py = L(16, 30); lx = fr.x; ly = L(10, fr.h + 14); lz = fr.y; break; }
    default:                                                                    // por encima de la torreta, mirando al frente
      px = P.x - fx * L(46, 30) + rx * L(-20, 6); pz = P.y - fz * L(46, 30) + rz * L(-20, 6); py = L(34, 26); lx = P.x + fx * 30; ly = 12; lz = P.y + fz * 30;
  }
  cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz);
  camH = Math.atan2(lz - pz, lx - px);
  menuFade = clamp(1 - Math.min(u, 1 - u) * SHOT / 0.35, 0, 1);
}

/* ============================================================
   SINCRONIZAR ESCENA 3D CON LA LÓGICA
   ============================================================ */
function sync3D(dt){
  PM.hull.position.set(P.x, 0, P.y); PM.hull.rotation.y = -P.h;
  PM.tur.position.set(P.x, 0, P.y); PM.tur.rotation.y = -P.ta; PM.barrel.position.x = 8 - P.recoil * 5;
  if (state === 'dead' && !PM.dead){ PM.dead = true; darken(PM); }
  else if (!PM.dead) for (const m of PM.mats) m.emissive.setHex(P.hurt > 0 ? 0x802010 : 0);

  if (enemies.some(e => e.gone)){ for (const e of enemies) if (e.gone && e.m){ dyn.remove(e.m.hull); if (e.m.tur) dyn.remove(e.m.tur); } enemies = enemies.filter(e => !e.gone); }
  for (const e of enemies){
    if (!e.m){
      const T = ETYPE[e.kind];
      if (e.kind === 'jeep') e.m = makeJeep();
      else if (e.kind === 'heli') e.m = makeHeli();
      else if (e.kind === 'td') e.m = makeTD();
      else if (e.kind === 'mortar') e.m = makeMortar();
      else if (e.tank){
        e.m = makeTank(T.cols[0], T.cols[1]); e.m.hull.scale.setScalar(T.sc); e.m.tur.scale.setScalar(T.sc);
        if (e.kind === 'light') e.m.barrel.scale.set(0.62, 0.6, 0.6);       // cañón corto y fino: es una ametralladora
        if (e.kind === 'heavy' || e.kind === 'boss') e.m.barrel.scale.set(1.12, 1.5, 1.5);   // cañón largo y grueso
      }
      dyn.add(e.m.hull); if (e.m.tur) dyn.add(e.m.tur);
    }
    e.m.hull.position.set(e.x, e.m.rotor ? 46 : 0, e.y); e.m.hull.rotation.y = -e.h;
    if (e.m.tur){ e.m.tur.position.set(e.x, 0, e.y); e.m.tur.rotation.y = -e.ta; }
    if (e.m.rotor){ e.m.rotor.rotation.y += dt * 19; e.m.hull.rotation.z = -0.1; }   // morro un poco abajo, como al avanzar
    if (!e.alive && !e.m.dead){ e.m.dead = true; darken(e.m); }
    if (!e.alive && e.tank && Math.random() < dt * 6)
      parts.push({ x: e.x + rnd(-5, 5), y: e.y + rnd(-5, 5), z: 14, vx: rnd(-6, 6), vy: rnd(-6, 6), vz: rnd(25, 45), r: rnd(4, 8), life: 1.4, max: 1.4, fire: false });
  }
  for (const s of shells){
    if (!s.mesh){ s.mesh = new THREE.Mesh(shellGeo, shellMats[s.own]); if (s.type === 'MG') s.mesh.scale.set(2.4, 0.45, 0.45); else s.mesh.scale.set(s.own ? 4 : 5, s.own ? 1.5 : 1, s.own ? 1.5 : 1); dyn.add(s.mesh); }
    s.mesh.position.set(s.x, 15 + (s.zh ? s.zh * Math.max(0, 1 - s.dist / 190) : 0), s.y); s.mesh.rotation.y = -s.a;
    if (s.type === 'RK' && Math.random() < dt * 28) parts.push({ x: s.x, y: s.y, z: 15, vx: rnd(-4, 4), vy: rnd(-4, 4), vz: rnd(4, 12), r: rnd(2, 4), life: 0.7, max: 0.7, fire: false });   // estela del cohete
  }
  for (const s of strikes){                            // aviso del mortero: aro rojo, disco que se llena y la granada cayendo
    if (!s.ring){
      s.ring = new THREE.Mesh(strikeRingGeo, strikeMat); s.fill = new THREE.Mesh(strikeFillGeo, strikeMat); s.sh = new THREE.Mesh(shellGeo, shellMats[1]);
      for (const o of [s.ring, s.fill]){ o.rotation.x = -Math.PI / 2; o.position.set(s.x, 2, s.y); }
      s.ring.scale.setScalar(s.r); s.sh.scale.set(1.6, 5, 1.6); dyn.add(s.ring, s.fill, s.sh);
    }
    s.fill.scale.setScalar(Math.max(0.01, s.r * (1 - s.t / s.max))); s.ring.visible = (s.t * 10 | 0) % 2 === 0 || s.t > 1;
    s.sh.position.set(s.x, 12 + Math.max(0, s.t) * 330, s.y);
  }
  const now = performance.now() / 1000;
  for (const c of crates){
    if (!c.mesh){ c.mesh = box(14, 12, 14, crateMats[c.kind], c.x, 8, c.y); dyn.add(c.mesh); }
    c.mesh.position.y = 9 + Math.sin(now * 4) * 2; c.mesh.rotation.y = now * 1.5;
  }
  for (const f of fires) if (Math.hypot(f.x - P.x, f.y - P.y) < 950 && Math.random() < dt * (f.fire ? 5 : 3)){   // columnas de humo y pavesas
    parts.push({ x: f.x + rnd(-3, 3), y: f.y + rnd(-3, 3), z: f.h, vx: 7 + rnd(-3, 3), vy: rnd(-3, 3), vz: rnd(20, 36), r: rnd(5, 10), life: 3, max: 3, fire: false });
    if (f.fire && Math.random() < 0.5) parts.push({ x: f.x + rnd(-4, 4), y: f.y + rnd(-4, 4), z: f.h, vx: rnd(-6, 6), vy: rnd(-6, 6), vz: rnd(30, 60), r: rnd(2, 4), life: 0.6, max: 0.9, fire: true });
  }
  for (const t of trees) if (t.down && t.fall < 1.45){ t.fall = Math.min(1.45, t.fall + dt * 5); t.inner.rotation.z = -t.fall; }

  let n = 0;
  for (const p of parts){
    if (p.txt || n >= POOL.length) continue;
    const m = POOL[n++], k = clamp(p.life / p.max, 0, 1);
    m.visible = true; m.position.set(p.x, p.z, p.y); m.scale.setScalar(p.r * (1.4 - k * 0.6));
    if (p.fire){ m.material.color.setRGB(1, 0.45 + 0.5 * k, 0.15); m.material.opacity = k; }
    else { m.material.color.setRGB(0.22, 0.21, 0.2); m.material.opacity = k * 0.6; }
  }
  for (; n < POOL.length && POOL[n].visible; n++) POOL[n].visible = false;

  // cámara: mira del artillero en primera persona (con zoom) o persecución detrás del casco
  const fp = P.aim && state === 'play';
  setView(fp);
  PM.hull.visible = PM.tur.visible = !fp;            // desde dentro del cañón no se ve el propio tanque
  if (fp){
    camH = P.ta;
    const cx = Math.cos(camH), cz = Math.sin(camH), k = shake * 0.08;
    cam.position.set(P.x + cx * 12 + rnd(-k, k), 15.5 + rnd(-k, k), P.y + cz * 12 + rnd(-k, k));
    cam.lookAt(P.x + cx * 500, 13, P.y + cz * 500);
  } else if (state === 'menu') menuCam(dt);          // planos de cine por el tanque y el mapa
  else {
    camH += angDiff(P.h, camH) * Math.min(1, dt * 4);
    const cx = Math.cos(camH), cz = Math.sin(camH);
    cam.position.set(P.x - cx * 125 + rnd(-shake, shake) * 0.4, 68 + rnd(-shake, shake) * 0.3, P.y - cz * 125 + rnd(-shake, shake) * 0.4);
    cam.lookAt(P.x + cx * 60, 6, P.y + cz * 60);
  }
  sun.position.set(P.x + 260, 430, P.y + 160); sun.target.position.set(P.x, 0, P.y);

  groundT -= dt;
  if (groundDirty && groundT <= 0){ groundTex.needsUpdate = true; groundDirty = false; groundT = 0.2; }
}

/* ============================================================
   HUD (lienzo 2D por encima)
   ============================================================ */

// Retícula de la mira del artillero (primera persona): el color indica el estado de la recámara.
function drawSight(){
  const x = VIEW.cx, y = VIEW.cy, R = VIEW.R, u = 1;
  const col = P.breech ? '#58d030' : P.ram > 0 ? '#f0b020' : '#f03020';
  // interior del tubo: todo negro salvo el círculo por el que se ve
  g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, W, VH); g.arc(x, y, R, 0, TAU, true); g.fill('evenodd');
  g.lineWidth = 3; g.strokeStyle = '#1c1c1a'; g.beginPath(); g.arc(x, y, R - 1, 0, TAU); g.stroke();
  g.lineWidth = 1; g.strokeStyle = '#3a3a36'; g.beginPath(); g.arc(x, y, R - 3, 0, TAU); g.stroke();
  g.fillStyle = col;                                 // marcas del borde, cada 30°
  for (let i = 0; i < 12; i++){ const a = i * TAU / 12; g.fillRect(Math.round(x + Math.cos(a) * (R - 7)), Math.round(y + Math.sin(a) * (R - 7)), u, u); }
  for (const [c, o] of [['#000', 1], [col, 0]]){
    g.fillStyle = c;
    g.fillRect(x - 30 * u + o, y + o, 24 * u, 1); g.fillRect(x + 6 * u + o, y + o, 24 * u, 1);      // horizontal con hueco
    g.fillRect(x + o, y + 4 * u + o, 1, 22 * u);                                                    // asta inferior
    for (let i = 1; i <= 3; i++) g.fillRect(x - 3 * u + o, y + (4 + i * 6) * u + o, 6 * u + 1, 1);   // marcas de alcance
    for (const s of [-1, 1]) for (let i = 1; i <= 2; i++) g.fillRect(x + s * (6 + i * 8) * u + o, y - 2 * u + o, 1, 4 * u + 1);
    for (let i = 0; i < 3 * u; i++){ g.fillRect(x - i + o, y - 3 * u + i + o, 1, 1); g.fillRect(x + i + o, y - 3 * u + i + o, 1, 1); }  // cheurón
  }
  outlined('ПРИЦЕЛ', x, y + R - 16, 9, col);
}
function drawField(){
  if (P.aim && state === 'play') drawSight();
  for (const p of parts) if (p.txt){
    const s = toScreen(p.x, p.y, p.z); if (!s) continue;
    outlined(p.txt, s.x, s.y, 15, p.col);
  }
  for (const e of enemies) if (e.alive && e.tank && e.hp < e.maxHp){
    const s = toScreen(e.x, e.y, 30); if (!s) continue;
    const bx = Math.round(s.x) - 12, by = Math.round(s.y);
    g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, 26, 5); g.fillStyle = '#e05038'; g.fillRect(bx, by, Math.round(24 * e.hp / e.maxHp), 3);
  }
  for (const c of crates){ const s = toScreen(c.x, c.y, 26); if (s) outlined(c.kind === 'hp' ? '+HP' : 'MUN', s.x, s.y, 11, c.kind === 'hp' ? '#9fd060' : '#ffe060'); }
  if (bannerT > 0 && (bannerT > 0.5 || (bannerT * 16 | 0) % 2)) outlined(banner, W / 2, VH * 0.3, 11, '#ffe9a0');   // parpadea al irse
  if (msgT > 0){                                     // caben 38 letras por línea: si hay más, se parte en dos
    const cutAt = msg.length > 38 ? msg.lastIndexOf(' ', 38) : -1;
    if (cutAt < 0) outlined(msg, W / 2, VH - 46, 15, '#ffe9a0');
    else { outlined(msg.slice(0, cutAt), W / 2, VH - 52, 15, '#ffe9a0'); outlined(msg.slice(cutAt + 1), W / 2, VH - 40, 15, '#ffe9a0'); }
  }
  if (combo > 1){
    const cy = 36, cs = 11;
    outlined('COMBO ×' + combo, W / 2, cy, cs, '#ff9040');
    g.fillStyle = '#000'; g.fillRect(W / 2 - 41, cy + 6, 82, 4); g.fillStyle = '#ff9040'; g.fillRect(W / 2 - 40, cy + 7, Math.round(80 * comboT / 6), 2);
  }
}

// Radar: pantalla circular de fósforo verde centrada en el tanque, con el frente arriba. Anillos de distancia,
// barrido giratorio con estela, y ecos que se encienden cuando el barrido pasa por ellos y luego se van apagando.
// Lo que queda fuera de alcance aparece como un punto pequeño pegado al borde.
const RADAR_RANGE = 800;
let radarR = 24;                        // radio actual del radar (se anima) y duración del último fotograma
function drawRadar(cx, cy, R){
  const sw = (performance.now() / 1000 * 2.4) % TAU, rot = -camH - Math.PI / 2;
  g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, R + 3, 0, TAU); g.fill();
  g.fillStyle = '#6a7064'; g.beginPath(); g.arc(cx, cy, R + 2, 0, TAU); g.fill();          // aro metálico
  g.fillStyle = '#03120a'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  for (let i = 0; i < 10; i++){                                                            // estela del barrido
    g.fillStyle = 'rgba(60,255,110,' + (0.24 * (1 - i / 10)).toFixed(3) + ')';
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, sw - (i + 1) * 0.11, sw - i * 0.11); g.fill();
  }
  g.strokeStyle = 'rgba(60,220,100,.38)'; g.lineWidth = 1;
  for (const k of [1 / 3, 2 / 3, 1]){ g.beginPath(); g.arc(cx, cy, R * k - 0.5, 0, TAU); g.stroke(); }   // anillos de distancia
  g.fillStyle = 'rgba(60,220,100,.28)'; g.fillRect(cx - R, cy, R * 2, 1); g.fillRect(cx, cy - R, 1, R * 2);
  g.strokeStyle = '#a8ffc0'; g.beginPath(); g.moveTo(cx + 0.5, cy + 0.5); g.lineTo(cx + 0.5 + Math.cos(sw) * R, cy + 0.5 + Math.sin(sw) * R); g.stroke();
  const blip = (wx, wy, size, col) => {
    const dx = wx - P.x, dy = wy - P.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + rot;
    const rr = Math.min(d / RADAR_RANGE, 1) * (R - 2), s2 = d > RADAR_RANGE ? 1 : size;
    const age = (((sw - a) % TAU) + TAU) % TAU / TAU;                                      // 0 = el barrido acaba de pasar
    g.globalAlpha = Math.max(0.2, 1 - age * 1.15); g.fillStyle = col;
    g.fillRect(Math.round(cx + Math.cos(a) * rr - s2 / 2), Math.round(cy + Math.sin(a) * rr - s2 / 2), s2, s2);
  };
  for (const c of crates) blip(c.x, c.y, 2, '#f4f490');
  for (const s of strikes) blip(s.x, s.y, 3, '#ff5038');
  for (const e of enemies) if (e.alive) blip(e.x, e.y, e.kind === 'boss' ? 5 : e.kind === 'heavy' ? 4 : e.tank ? 3 : 2, e.kind === 'heli' ? '#ff9040' : e.tank ? '#50ff78' : '#b8ffc8');
  g.globalAlpha = 1; g.restore();
  g.fillStyle = '#fff'; g.fillRect(cx - 1, cy - 1, 3, 3);
}

// Brújula: arriba es el frente del casco. Aguja roja = cañón; varilla blanca, más fina y corta = ametralladora.
function drawCompass(cx, cy, R){
  g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, R + 2, 0, TAU); g.fill();
  g.fillStyle = '#6a7064'; g.beginPath(); g.arc(cx, cy, R + 1, 0, TAU); g.fill();
  g.fillStyle = '#14170f'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.fillStyle = '#8b9872'; for (let i = 0; i < 8; i++){ const a = i * TAU / 8; g.fillRect(Math.round(cx + Math.cos(a) * (R - 2)), Math.round(cy + Math.sin(a) * (R - 2)), 1, 1); }
  g.fillStyle = '#ffe9a0'; g.fillRect(cx, cy - R + 1, 1, 3);                                 // marca del frente
  g.fillStyle = '#4a5240'; g.fillRect(cx - 2, cy - 3, 5, 7);                                 // el casco, visto desde arriba
  const a = P.ta - P.h - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  const b = P.mga - P.h - Math.PI / 2;
  g.lineWidth = 1; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(cx + 0.5, cy + 0.5); g.lineTo(cx + 0.5 + Math.cos(b) * (R - 5), cy + 0.5 + Math.sin(b) * (R - 5)); g.stroke();
  g.lineWidth = 2; g.strokeStyle = '#f03020'; g.beginPath(); g.moveTo(cx + 0.5, cy + 0.5); g.lineTo(cx + 0.5 + ca * (R - 2), cy + 0.5 + sa * (R - 2)); g.stroke();   // la roja se dibuja después: queda encima
  g.fillStyle = '#fff'; g.fillRect(cx, cy, 1, 1);
}

// Interfaz PSX: todo cabe en 320×240, superpuesto a la imagen y reducido a lo imprescindible.
function drawHudPsx(){
  // arriba izquierda: blindaje a bloques
  outlined('HP', 6, 10, 9, '#cfd4b8', 'left');
  g.fillStyle = '#000'; g.fillRect(25, 5, 62, 10);
  g.fillStyle = P.hp > 50 ? '#58d030' : P.hp > 25 ? '#f0b020' : '#f03020';
  for (let i = 0, n = Math.ceil(P.hp / U.maxHp * 10); i < n; i++) g.fillRect(26 + i * 6, 6, 5, 8);
  // arriba centro: puntos y oleada
  outlined(String(score).padStart(6, '0'), W / 2, 10, 9, '#ffe9a0');
  outlined('OLEADA ' + wave, W / 2, 21, 9, '#cfd4b8');
  const bs = enemies.find(e => e.alive && e.kind === 'boss');
  if (bs){                                             // barra de vida del jefe
    g.fillStyle = '#000'; g.fillRect(W / 2 - 51, 28, 102, 6);
    g.fillStyle = '#f03020'; g.fillRect(W / 2 - 50, 29, Math.ceil(100 * bs.hp / bs.maxHp), 4);
    outlined('JEFE', W / 2 - 56, 31, 9, '#f03020', 'right');
  }
  // arriba derecha: radar
  radarR += ((pad.big || K.big ? 38 : 24) - radarR) * Math.min(1, frameDt * 12);   // B (o M) mantenido lo agranda, con transición suave
  const rr = Math.round(radarR);
  drawRadar(W - 7 - rr, 7 + rr, rr); drawCompass(W - 25 - rr * 2, 18, 11);
  // abajo izquierda: las dos palancas como barras (L2 y R2)
  // (crecen hacia arriba al avanzar y hacia abajo, en rojo, al ir marcha atrás)
  [['L', 6], ['R', 16]].forEach(([s, x]) => {
    const v = P['v' + s], hh = Math.round(11 * clamp(Math.abs(v) / SPEED, 0, 1));
    g.fillStyle = '#000'; g.fillRect(x, 210, 8, 24);
    g.fillStyle = '#3a4234'; g.fillRect(x + 1, 211, 6, 22);
    g.fillStyle = v < 0 ? '#f03020' : Math.abs(P['in' + s]) > 0.1 ? '#ffe9a0' : '#8b9872';
    g.fillRect(x + 1, v < 0 ? 222 : 222 - hh, 6, hh);
    g.fillStyle = '#000'; g.fillRect(x + 1, 222, 6, 1);
  });
  // recámara: aro con el proyectil dentro y su estado
  const bx = BREECH.x, by = BREECH.y, shown = P.breech || (P.ram > 0 ? P.ramType : null);
  g.fillStyle = '#000'; g.beginPath(); g.arc(bx, by, 11, 0, TAU); g.fill();
  g.fillStyle = '#6a7064'; g.beginPath(); g.arc(bx, by, 10, 0, TAU); g.fill();
  g.fillStyle = '#050505'; g.beginPath(); g.arc(bx, by, 7, 0, TAU); g.fill();
  if (shown){ g.fillStyle = '#d8a838'; g.beginPath(); g.arc(bx, by, 7 * (P.breech ? 1 : 0.3 + 0.7 * (1 - P.ram / RAM)), 0, TAU); g.fill(); }
  const empty = !P.breech && P.ram <= 0;
  if (!empty || (performance.now() / 300 | 0) % 2)
    outlined(P.breech ? (P.breech === 'AP' ? 'БР' : 'ОФ') + ' OK' : P.ram > 0 ? 'CARGA' : 'VACÍA', 56, 222, 9, P.breech ? '#58d030' : P.ram > 0 ? '#f0b020' : '#f03020', 'left');
  // abajo derecha: munición con el botón que la carga
  outlined((pad.on ? '' : 'R ') + 'БР ' + String(P.ap).padStart(2, '0'), W - 6, 215, 9, P.ap ? '#cfd4b8' : '#f03020', 'right');
  if (pad.on) hBtn(W - 54, 215, 'X', 5);
  if (pad.on){ g.fillStyle = '#000'; g.beginPath(); g.arc(W - 70, 229, 6, 0, TAU); g.fill(); g.fillStyle = '#4a4e47'; g.beginPath(); g.arc(W - 70, 229, 5, 0, TAU); g.fill(); label('L', W - 70, 229, 9, '#d8dcc4'); }   // stick izquierdo
  outlined((pad.on ? '' : 'ESP ') + 'ПКТ ' + String(P.mg).padStart(3, '0'), W - 6, 229, 9, P.mg ? (pad.mg || K.mg ? '#ffe9a0' : '#cfd4b8') : '#f03020', 'right');
}

/* ---------- menú inicial y «Cómo jugar» ---------- */
const MENU = { page: -1, sel: 0, paused: false };    // page −1 = menú principal; 0… = páginas de ayuda
const menuOpts = () => [MENU.paused ? 'CONTINUAR' : 'JUGAR', 'SALIR'];
function menuCmd(c){
  if (MENU.page < 0){
    if (c === 'up' || c === 'down'){ MENU.sel = (MENU.sel + 1) % 2; blip(330, 0.05); }
    else if (c === 'ok'){ blip(520, 0.1); if (MENU.sel === 0) state = 'play'; else powerOff(); }
  }
}
const menuOptAt = () => menuOpts().findIndex((o, i) => Math.abs(M.y - (136 + i * 20)) < 9 && Math.abs(M.x - W / 2) < 100);
function menuHover(){ if (MENU.page < 0){ const i = menuOptAt(); if (i >= 0 && i !== MENU.sel){ MENU.sel = i; blip(330, 0.05); } } }
function menuClick(btn){
  if (MENU.page < 0){ const i = menuOptAt(); if (btn === 0 && i >= 0){ MENU.sel = i; menuCmd('ok'); } }
  else menuCmd(btn === 2 ? 'back' : M.x < W / 3 ? 'left' : 'right');                       // clic a la izquierda: atrás; resto: adelante
}
// piezas de los botones del mando que salen en pantalla
function drawMenu(){
  g.fillStyle = 'rgba(0,0,0,' + (0.2 + menuFade * 0.8).toFixed(2) + ')'; g.fillRect(0, 0, W, H);   // penumbra, y fundido a negro en los cortes
  g.fillStyle = '#000'; g.fillRect(0, 0, W, 20); g.fillRect(0, H - 20, W, 20);                       // franjas de cine
  if (MENU.page < 0){
    outlined('Т-55', W / 2, 62, 36, '#ffe060'); outlined('ARCADE GAME', W / 2, 90, 20, '#fff');
    menuOpts().forEach((o, i) => {
      const on = i === MENU.sel, y = 136 + i * 20;
      outlined(o, W / 2, y, 20, on ? '#ffe9a0' : '#8b9872');
      if (on && (performance.now() / 250 | 0) % 2) outlined('>', W / 2 - o.length * 8 - 14, y, 20, '#f03020');
    });
    outlined('RECORD ' + String(Math.max(best, score)).padStart(6, '0'), W / 2, 202, 9, '#cfd4b8');
    outlined(pad.on ? 'CRUCETA O STICK, Y A' : 'RATON O W S Y ENTER', W / 2, 230, 9, '#8b9872');
    return;
  }
}

function drawCursor(){
  if (pad.on || (P.aim && state === 'play')) return;   // en la mira no hay cursor: el ratón está capturado
  const x = Math.round(M.x), y = Math.round(M.y);
  if (state !== 'play'){ g.fillStyle = '#000'; g.fillRect(x - 3, y - 3, 7, 7); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 2, 5, 5); return; }
  // mira de bloques: el color indica el estado de la recámara
  const col = P.breech ? '#58d030' : P.ram > 0 ? '#f0b020' : '#f03020';
  for (const [c, o] of [['#000', 1], [M.y < VH ? col : '#fff', 0]]){
    g.fillStyle = c;
    g.fillRect(x - 11 + o, y + o, 7, 1); g.fillRect(x + 5 + o, y + o, 7, 1);
    g.fillRect(x + o, y - 11 + o, 1, 7); g.fillRect(x + o, y + 5 + o, 1, 7);
    g.fillRect(x + o, y + o, 1, 1);
  }
}

function drawUpgrade(){
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H);
  outlined('ELIGE UNA MEJORA', W / 2, 44, 20, '#ffe060');
  UP.forEach((o, i) => {
    const on = i === PICK.sel, y = pickY(i), lv = U.lv[o.k] || 0;
    bevel(18, y - 18, W - 36, 36, on ? '#28346a' : '#141a30', false);
    if (on && (performance.now() / 250 | 0) % 2) label('>', 30, y - 7, 9, '#f03020');
    label(o.t, 40, y - 7, 9, on ? '#ffe9a0' : '#cfd4b8', 'left');
    if (lv) label('NV ' + (lv + 1), W - 28, y - 7, 9, '#58d030', 'right');
    label(o.d, 28, y + 8, 9, on ? '#fff' : '#8b9872', 'left');
  });
  if (pad.on){ outlined('ELEGIR', W / 2 - 34, 200, 9, '#8b9872', 'right'); hStick(W / 2 - 18, 200, 'L'); outlined('ACEPTAR', W / 2 + 74, 200, 9, '#8b9872', 'right'); hBtn(W / 2 + 86, 200, 'A', 5); }
  else outlined('RATON O W S Y ENTER', W / 2, 200, 9, '#8b9872');
}
function drawDead(){
  overlay('GAME OVER', ['TANQUE DESTRUIDO', '', score + ' PUNTOS - OLEADA ' + wave, score >= best && score > 0 ? '¡NUEVO RÉCORD!' : 'RÉCORD: ' + best, '', '', '', '', '']);
  DEAD_OPTS.forEach((o, i) => {
    const on = i === PICK.sel, y = pickY(i);
    label(o, W / 2, y, 9, on ? '#ffe9a0' : '#8b9872');
    if (on && (performance.now() / 250 | 0) % 2) label('>', W / 2 - o.length * 4 - 12, y, 9, '#f03020');
  });
  if (pad.on){ hBtn(W / 2 - 48, 198, 'A', 5); label('ELEGIR', W / 2 - 38, 198, 9, '#8b9872', 'left'); hBtn(W / 2 + 22, 198, 'B', 5); label('MENU', W / 2 + 32, 198, 9, '#8b9872', 'left'); }
}
function overlay(title, lines){
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, H);
  const lh = 12, bh = lines.length * lh + 70, bw = Math.min(W - 16, 520), x0 = Math.round((W - bw) / 2), y0 = Math.round((H - bh) / 2);
  bevel(x0, y0, bw, bh, '#1c2440', false); bevel(x0 + 3, y0 + 3, bw - 6, bh - 6, '#141a30', true);   // ventana azul de menú
  outlined(title, W / 2, y0 + 28, 20, '#f03020');
  lines.forEach((l, i) => {
    const blink = l[0] === '>', hi = l[0] === '#';
    if (!blink || (performance.now() / 400 | 0) % 2) label(l.replace(/^[>#]/, ''), W / 2, y0 + 62 + i * lh, 11, blink || hi ? '#ffe9a0' : '#d8dcc4');
  });
}
function t55Frame(dt){
  pollPad();
  update(dt); sync3D(dt);
  renderer.setRenderTarget(rt); renderer.render(scene, cam);          // a 320×240 en un búfer…
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);   // …y ampliado con tramado de 15 bits
  g.clearRect(0, 0, W, H);
  if (state === 'menu') drawMenu(); else { drawField(); drawHudPsx(); }
  if (state === 'dead') drawDead(); else if (state === 'upgrade') drawUpgrade();
  drawCursor();
}

/* ---------- entrada: teclado y ratón (el mando va en pollPad) ---------- */
const BREECH = { x: 40, y: 222 };                    // recámara en el HUD
const toScr = ev => { const r = cv.getBoundingClientRect(); M.x = (ev.clientX - r.left) / S; M.y = (ev.clientY - r.top) / S; M.seen = true; pad.on = false; };
const mine = () => VIBE.activo === T55 && state !== 'off' && state !== 'boot';   // solo con este disco puesto y la tele encendida
addEventListener('mousedown', ev => {
  if (!mine()) return;                                // con la tele apagada el ratón es del navegador (bajar, clic en el disco)
  ev.preventDefault(); audioInit(); toScr(ev);
  if (state === 'dead' || state === 'upgrade'){ pickClick(ev.button); return; }
  if (state === 'menu'){ menuClick(ev.button); return; }
  if (ev.button === 2){ setAim(true); return; }      // clic derecho mantenido: apuntar por la mira
  if (ev.button !== 0) return;
  if (P.aim){ fire(); return; }                      // en la mira, el clic izquierdo siempre dispara
  fire();                                             // clic izquierdo: ¡fuego!
});
addEventListener('mousemove', ev => {
  if (!mine()) return;
  if (document.pointerLockElement === cv){             // ratón capturado: su movimiento desplaza el punto de puntería
    if (state === 'play' && P.aim){ P.aimWant += ev.movementX * AIM_SENS; pad.on = false; M.seen = true; }
    return;
  }
  toScr(ev);
  if (state === 'menu') menuHover(); else if (state === 'dead' || state === 'upgrade') pickHover();
});
// Entrar o salir de la mira. Con ratón se captura el puntero, igual que al apuntar en un shooter.
function setAim(on){
  if (!P) return;
  if (on && state !== 'play') on = false;
  P.aim = on; P.aimWant = P.ta;
  if (on && !pad.on){ if (cv.requestPointerLock && document.pointerLockElement !== cv){ const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } }
  else if (document.pointerLockElement === cv) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== cv && P && P.aim && !pad.on) P.aim = false; });   // Esc suelta la mira
addEventListener('mouseup', ev => {
  if (!mine()) return;
  if (ev.button === 2){ if (state === 'play') setAim(false); return; }   // soltar el clic derecho: salir de la mira
  if (ev.button !== 0) return;
});
function key(ev, down){
  if (!mine()) return;
  if (state === 'menu'){
    const c = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Enter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back' }[ev.code];
    if (c){ ev.preventDefault(); if (down && !ev.repeat){ pad.on = false; menuCmd(c); } }
    return;
  }
  if (state === 'dead' || state === 'upgrade'){
    const c = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', Enter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back' }[ev.code];
    if (c){ ev.preventDefault(); if (down && !ev.repeat){ pad.on = false; pickCmd(c); } }
    return;
  }
  const s = { KeyW: 'F', KeyS: 'B', KeyA: 'R', KeyD: 'L', Space: 'mg', KeyM: 'big' }[ev.code];   // A gira a la izquierda, D a la derecha; M amplía el radar
  const once = down && !ev.repeat;
  if (ev.code === 'Escape'){ if (once){ if (state === 'play') pauseGame(); else if (state === 'dead') start(true); } return; }   // pausa / volver al menú
  if (ev.code === 'KeyQ'){ if (once && state === 'play'){ pad.on = false; setAim(!P.aim); } return; }   // mira fija, sin mantener
  if (ev.code === 'KeyR'){ if (once){ load('AP'); pad.on = false; } return; }                           // cargar
  if (!s) return;
  if (down) pad.on = false;
  K[s] = down; ev.preventDefault();
}
addEventListener('keydown', ev => key(ev, true));
addEventListener('keyup', ev => key(ev, false));
addEventListener('blur', () => { K.L = K.R = K.F = K.B = K.mg = K.big = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && mine()) pauseGame(); });   // al cambiar de pestaña, pausa

/* ---------- portada ---------- */
// El tanque de la portada es el modelo 3D del juego, fotografiado una vez (la consola presta su renderizador).
let tankArt;
function t55Prepare(){
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff0d8, 0x30281c, 0.95));
  const d = new THREE.DirectionalLight(0xffe0b0, 1.1); d.position.set(60, 80, 40); sc.add(d);
  const tk = makeTank(0x4f6238, 0x5c7040); tk.tur.rotation.y = 0.4; tk.barrel.rotation.z = 0.14;
  sc.add(tk.hull, tk.tur);
  const cm = new THREE.PerspectiveCamera(30, 1, 1, 500); cm.position.set(64, 17, 54); cm.lookAt(4, 11, 0);
  tankArt = foto3D(sc, cm, 256);
}
// Arte sin letras (w×h = 246×250): cielo de atardecer, rayos, tierra y el tanque. Sirve también para el disco.
function t55Art(c, w, h){
  const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#1a1030'); sky.addColorStop(0.5, '#b83a1c'); sky.addColorStop(0.8, '#f0a838');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  const ax = w / 2, ay = 150;                                                 // resplandor a rayos detrás del tanque
  c.fillStyle = 'rgba(255,220,120,.16)';
  for (let i = 0; i < 16; i += 2){ c.beginPath(); c.moveTo(ax, ay); c.arc(ax, ay, 300, i * TAU / 16, (i + 1) * TAU / 16); c.fill(); }
  c.fillStyle = '#3a2414'; c.fillRect(0, 196, w, h - 196); c.fillStyle = '#5a3a1c'; c.fillRect(0, 196, w, 3);
  for (let i = 0; i < 160; i++){ c.fillStyle = i % 2 ? '#2c1a0e' : '#4a3018'; c.fillRect((i * 53) % w, 200 + (i * 29) % 48, 3, 1); }
  if (tankArt) c.drawImage(tankArt, 2, 22, 240, 240);
}
// Título de la portada, encima del arte.
function t55Logo(c, w){
  const ax = w / 2;
  c.font = '32px ' + FONT; c.fillStyle = '#000'; c.fillText('Т-55', ax + 3, 31); c.fillStyle = '#c02818'; c.fillText('Т-55', ax + 1, 29); c.fillStyle = '#ffe060'; c.fillText('Т-55', ax, 28);
  c.font = '16px ' + FONT; c.fillStyle = '#000'; c.fillText('ARCADE GAME', ax + 2, 56); c.fillStyle = '#fff'; c.fillText('ARCADE GAME', ax, 54);
}

/* ---------- alta en la consola ---------- */
const T55 = VIBE.registrar({
  num: '01', titulo: 'T-55 ARCADE GAME', genero: 'ACTION',
  manual: 'juegos/t55/manual.pdf',
  musica: { pistas: window.T55_MUSIC, bucles: window.T55_LOOP, volumen: 0.3, rapidas: ['aim'] },
  arte: t55Art, logo: t55Logo, preparar: t55Prepare,
  audio: t55Audio,
  redimensionar: t55Resize,
  precargar(){ try { renderer.compile(scene, cam); } catch (e){} },             // shaders listos antes del primer fotograma
  encender(){ start(); },
  fotograma: t55Frame,
  modoMusica: musicMode,
  apagar(){
    setAim(false); K.F = K.B = K.L = K.R = K.mg = K.big = false;
    if (engGain) engGain.gain.value = 0;
    for (const side of ['L', 'R']) if (trk[side]) trk[side].lvl.gain.value = 0;
  }
});

