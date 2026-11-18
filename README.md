# VIBECODED

Una consola de juegos para navegador con estética de PSX: una tele dibujada, una estantería con las cajas de los juegos y un disco que se mete para jugar. Es un sitio estático, sin compilación ni servidor.

Juegos (320×240, texturas sin filtrar, tramado y vértices que tiemblan):

- **T-55 Arcade Game**: tanques contra oleadas.
- **DRIFTING — Rally '97**: rally arcade de tres tramos contra el reloj y cinco rivales, con un hatchback de rally de finales de los 90. Diseño en [juegos/rally/DISENO.md](juegos/rally/DISENO.md).

**Para añadir un juego, lee [JUEGOS.md](JUEGOS.md).**

## Jugar en local

Abre `index.html` en Chrome o Firefox. Hace falta WebGL.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Elige la rama `main` y la carpeta `/ (root)`, y guarda.
4. En uno o dos minutos el sitio estará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

Todas las rutas son relativas, así que funciona igual en un repositorio de proyecto que en un dominio propio.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | La página: tele, estantería y aviso legal; carga los scripts |
| `consola/` | La consola: tele, caja 3D, sonido, música y arranque; `psx.js` es el aspecto de PSX que comparten los juegos en 3D |
| `juegos/t55/` | T-55 Arcade Game: código, música, manual y herramientas |
| `juegos/rally/` | DRIFTING: código, música, diseño y la herramienta que fabrica la música |
| `juegos/plantilla/` | Juego mínimo para copiar al crear uno nuevo |
| `JUEGOS.md` | Cómo añadir un juego |
| `vendor/three.min.js` | three.js r128 (licencia MIT) |
| `vendor/PressStart2P-Regular.ttf` | Tipografía Press Start 2P (licencia OFL, texto en `vendor/PressStart2P-OFL.txt`) |
| `404.html` | Página de «no encontrado» de GitHub Pages |
| `.nojekyll` | Le dice a GitHub Pages que sirva los archivos tal cual |

## Controles del T-55

- **Teclado y ratón:** WASD mover · el cañón sigue al ratón · clic cañón · clic derecho mira · Espacio ametralladora · R cargar · M radar grande · Esc pausa.
- **Mando:** L2/R2 orugas · L1/R1 marcha atrás · stick derecho torreta · stick izquierdo ametralladora (apunta y dispara) · A cañón · B radar grande · X cargar · Y mira · Start pausa.

## Aviso

Proyecto de aficionado sin ánimo de lucro, no afiliado a Sony Interactive Entertainment ni a Anthropic. El aviso legal completo está en el pie de la página.

## Controles de DRIFTING

- **Teclado:** W o ↑ acelerar · S o ↓ frenar y marcha atrás · A D o ← → girar · Espacio freno de mano · C cámara · Esc pausa.
- **Mando:** R2 (o A) acelerar · L2 (o X) frenar · stick izquierdo o cruceta girar · B o R1 freno de mano · Y cámara · Start pausa.
