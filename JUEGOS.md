# Cómo añadir un juego a VIBECODED

La página es una **consola**: una tele, una estantería con la caja de cada juego y el sonido. Cada juego es una carpeta en `juegos/` que se da de alta con `VIBE.registrar({...})`. La consola se encarga de la caja 3D, el disco, el manual, la secuencia de arranque, las perillas de la tele, la música y el aviso para móviles. El juego solo dibuja en la pantalla y lee los controles.

## En 4 pasos

1. Copia `juegos/plantilla/` a `juegos/mi-juego/`.
2. En `juegos/mi-juego/juego.js`, cambia `num`, `titulo`, `genero` y el arte de la portada, y escribe tu juego en `fotograma(dt)`.
3. Añade su `<script>` en `index.html`, después de `consola/psx.js` y **antes** de `consola/arranque.js`:

   ```html
   <script src="juegos/mi-juego/juego.js"></script>
   ```

4. Abre `index.html` con doble clic. El juego aparece en la estantería, ordenado por `num`.

La plantilla es un juego completo y corto (esquivar bloques). Para probarla, quita el comentario de su línea en `index.html`.

## La pantalla

- Mide **320×240** (`W`×`H`). Se dibuja en `g`, el contexto 2D del lienzo `#c`, que la consola amplía con píxeles duros dentro de la tele.
- Debajo hay otro lienzo, `glCv` (`#gl`), del mismo tamaño, por si el juego usa WebGL / three.js (ver el T-55 y DRIFTING).

## 3D con aspecto de PSX: `consola/psx.js`

Los juegos en 3D comparten un solo renderizador y el mismo aspecto de PlayStation:

- `PSX.renderer()`: el renderizador three.js sobre `glCv`. Es único para toda la página (un solo contexto WebGL); cada juego dibuja su escena con él. Lanza un error si no hay WebGL.
- `PSX.material(m)`: aplica a un material vértices que tiemblan (sin precisión subpíxel) y texturas afines.
- `PSX.pantalla(320, 240)`: búfer de baja resolución y su paso final (color de 15 bits con tramado). `pantalla.dibujar(escena, camara)` hace las dos cosas.
- `PSX.textura(n, dibujo, rx, ry)`: textura pequeña de lienzo, sin filtrar y repetida.

En `redimensionar(cw, ch)` llama a `PSX.renderer().setSize(cw, ch)`.
- Al salir no hay que limpiar la pantalla: la consola apaga la tele.

## `VIBE.registrar({...})`

| Campo | Obligatorio | Qué es |
|---|---|---|
| `num` | sí | Número de disco, texto de 2 cifras (`'02'`). Ordena la estantería. |
| `titulo` | sí | Nombre del juego (estantería, portada y manual). |
| `genero` | sí | Etiqueta corta (`'ACTION'`, `'PUZZLE'`…). |
| `fotograma(dt)` | sí | Se llama en cada fotograma mientras el juego está encendido. `dt` en segundos. Actualiza y dibuja. |
| `encender()` | no | Se llama cuando termina el logo de arranque. Prepara la partida y pon `state` en tu primer estado. |
| `apagar()` | no | Se llama al salir. Suelta teclas y para sonidos en bucle. |
| `arte(c, w, h)` | no | Ilustración de la portada, sin letras (`w`×`h` = 246×250). También se usa para el disco. |
| `logo(c, w, h)` | no | Título dibujado encima del arte. Si no está, la consola escribe `titulo`. |
| `portada(c, w, h)` | no | Portada completa hecha a mano (284×250). Sustituye a `arte` y `logo`. |
| `disco(c, n)` | no | Cara del disco hecha a mano (`n`×`n`). Si no está, se usa `arte`. |
| `preparar()` | no | Se llama una vez al montar la caja. Para arte que necesite `foto3D()`. |
| `precargar()` | no | Se llama durante el logo de arranque (p. ej. compilar shaders). |
| `manual` | no | Ruta a un PDF (`'juegos/mi-juego/manual.pdf'`). Sin él, la caja no muestra manual. |
| `musica` | no | `{ pistas, bucles, volumen, rapidas }`. Ver «Música». |
| `modoMusica()` | no | Qué pista suena ahora: `'nombre'`, `['nombre', velocidad]` o `null` (silencio). |
| `audio(AC, master)` | no | Crea sonidos propios cuando se inicia el audio (motores, ruidos en bucle…). |
| `redimensionar(cw, ch)` | no | Tamaño real de la pantalla en píxeles, para ajustar un renderizador WebGL. |

## Lo que la consola te presta

Todos los `<script>` comparten el ámbito global, así que el juego puede usar directamente:

- **Pantalla:** `g`, `cv`, `glCv`, `W`, `H`, `S` (ampliación), `FONT`.
- **Texto y piezas:** `label(texto, x, y, tamaño, color, alineación)`, `outlined(...)`, `bevel(x, y, w, h, color, hundido)`, `hBtn(x, y, 'A')`, `hStick(x, y, 'L')`, `drawSpark(c, x, y, r)`.
- **Sonido:** `boom(volumen, frecuencia, duración)`, `blip(frecuencia, duración)`, `AC`, `master`, `noiseBuf`.
- **Utilidades:** `TAU`, `clamp`, `rnd`, `gauss`, `angDiff`, `toward`.
- **Control:** `state` (tuyo mientras el juego está encendido; `'off'` y `'boot'` son de la consola), `VIBE.activo` (el juego encendido), `powerOff()` (salir a la estantería), `frameDt`.
- **Arte:** `foto3D(escena, camara, N)` devuelve un lienzo con una foto de una escena three.js.

## Reglas para no pisar a otros juegos

- **Mete tu código en un bloque `{ ... }`**, como la plantilla. Si declaras nombres sueltos a nivel global pueden chocar con los de otro juego, y entonces tu archivo no carga. El T-55 es el único que no lo hace: sus nombres globales (`P`, `start`, `key`, `update`, `reset`…) están ocupados.
- **Escucha el teclado y el ratón solo con tu juego encendido.** Comprueba `VIBE.activo === TU_JUEGO && state !== 'off' && state !== 'boot'` al principio de cada listener.
- **Lee el mando tú mismo** con `navigator.getGamepads()` dentro de `fotograma`, como la plantilla.
- **Para salir**, llama a `powerOff()`.

## Música

Formato: `musica: { pistas: { menu: '<ogg en base64>', juego: '...' }, bucles: { menu: [inicio, fin], ... }, volumen: 0.3, rapidas: ['aim'] }`.

- Las pistas van en un `.js` aparte (`window.MI_MUSICA = {...}`) cargado con su propio `<script>` antes del juego. Así funciona con doble clic, sin servidor.
- `bucles` dice qué tramo (en segundos) se repite. Sin bucles se repite la pista entera.
- Conviene que todas las variaciones duren lo mismo en compases: al cambiar de pista, la consola entra en el mismo punto de la canción.
- `rapidas`: pistas que entran y salen sin esperar (por ejemplo, al apuntar).
- El T-55 y DRIFTING generan la suya con `herramientas/render-music.js` en su carpeta (necesita `node` y `ffmpeg`). Ese script solo se usa en tu computadora; la página publicada no necesita Node.

## Carpetas

```
index.html            la página: tele, estantería y aviso legal; carga los scripts
consola/consola.js    la consola: tele, caja 3D, sonido, música, arranque, mando en la estantería
consola/psx.js        el aspecto de PSX y el renderizador 3D compartido
consola/arranque.js   va al final: monta la estantería con los juegos ya registrados
juegos/t55/           T-55 Arcade Game: juego.js, musica.js, manual.pdf y herramientas/
juegos/rally/         DERRAPE: juego.js, musica.js, DISENO.md y herramientas/
juegos/plantilla/     juego mínimo para copiar
vendor/               three.js y la tipografía
```
