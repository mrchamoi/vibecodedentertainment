#!/usr/bin/env python3
"""Fabrica manual.pdf a partir de tools/manual.html, con el arte de la portada y del disco dibujado por el propio juego
(se abre index.html en Chrome sin ventana). Uso: python3 tools/make-manual.py  (necesita google-chrome)"""
import os, subprocess, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
tpl = open(os.path.join(ROOT, 'tools', 'manual.html'), encoding='utf-8').read()
inject = r'''<script>
addEventListener('load', async () => {
  await document.fonts.ready; paintCase();
  const html = TPL.replaceAll('{{COVER}}', coverC.toDataURL()).replaceAll('{{DISC}}', discC.toDataURL());
  document.head.innerHTML = '<meta charset="utf-8"><title>T-55 ARCADE GAME - INSTRUCCIONES</title>' +
    '<style>@font-face{font-family:"Press Start 2P";src:url("vendor/PressStart2P-Regular.ttf")}</style>';
  document.body.innerHTML = html; document.body.style.cssText = '';
  await document.fonts.load('12px "Press Start 2P"');
  // comprobación: páginas cuyo contenido no cabe
  const over = [...document.querySelectorAll('.pg:not(.cover):not(.back)')].map((e, i) => [...e.children].some(c => c.className !== 'num' && c.getBoundingClientRect().bottom > e.getBoundingClientRect().bottom - 12 * 3.78) ? i + 1 : 0).filter(Boolean).map(n => n + 1);   // +1: la portada no cuenta en la lista pero sí en el PDF
  document.title = 'OVER[' + over.join(',') + ']';
});
</script></body>'''.replace('TPL', __import__('json').dumps(tpl))
fd, tmp = tempfile.mkstemp(suffix='.html', dir=ROOT); os.close(fd)
try:
    open(tmp, 'w', encoding='utf-8').write(src.replace('</body>', inject, 1))
    chrome = ['google-chrome', '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--virtual-time-budget=4000']
    dom = subprocess.run(chrome + ['--dump-dom', 'file://' + tmp], capture_output=True, text=True).stdout
    over = dom.split('OVER[', 1)[1].split(']', 1)[0] if 'OVER[' in dom else '?'
    print('páginas que no caben:', over or 'ninguna')
    subprocess.run(chrome + ['--no-pdf-header-footer', '--print-to-pdf=' + os.path.join(ROOT, 'manual.pdf'),
                    'file://' + tmp], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
finally:
    os.remove(tmp)
print('manual.pdf', os.path.getsize(os.path.join(ROOT, 'manual.pdf')) // 1024, 'KB')
