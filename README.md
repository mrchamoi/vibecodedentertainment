# VIBECODED · T-55 Arcade Game

Juego de tanques para navegador con estética de PSX: 320×240, texturas sin filtrar, tramado y vértices que tiemblan, todo dentro de una tele dibujada. Es un sitio estático, sin compilación ni servidor.

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
| `index.html` | La página y el juego completos |
| `vendor/three.min.js` | three.js r128 (licencia MIT) |
| `vendor/PressStart2P-Regular.ttf` | Tipografía Press Start 2P (licencia OFL, texto en `vendor/PressStart2P-OFL.txt`) |
| `404.html` | Página de «no encontrado» de GitHub Pages |
| `.nojekyll` | Le dice a GitHub Pages que sirva los archivos tal cual |

## Controles

- **Teclado y ratón:** WASD mover · el cañón sigue al ratón · clic cañón · clic derecho mira · Espacio ametralladora · R cargar · M radar grande · Esc pausa.
- **Mando:** L2/R2 orugas · L1/R1 marcha atrás · stick derecho torreta · stick izquierdo ametralladora (apunta y dispara) · A cañón · B radar grande · X cargar · Y mira · Start pausa.

## Aviso

Proyecto de aficionado sin ánimo de lucro, no afiliado a Sony Interactive Entertainment ni a Anthropic. El aviso legal completo está en el pie de la página.
