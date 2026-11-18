/* ============================================================
   VIBECODED — PSX: el aspecto de PlayStation, compartido por los juegos en 3D
   - PSX.renderer(): un único renderizador three.js sobre el lienzo #gl (glCv). Todos los juegos lo comparten,
     así la página tiene un solo contexto WebGL. Lanza un error si el navegador no tiene WebGL.
   - PSX.material(m): vértices que tiemblan (sin precisión subpíxel) y texturas afines (se deforman con la
     perspectiva), como en la consola. Se aplica material a material.
   - PSX.pantalla(w, h): búfer de baja resolución y su paso final: se amplía sin suavizar, con color de 15 bits
     y tramado ordenado 4×4. pantalla.dibujar(escena, camara) hace las dos cosas.
   - PSX.textura(n, dibujo, rx, ry): textura pequeña de lienzo, sin filtrar y repetida.
   Lo usan juegos/t55 y juegos/rally. Va después de consola.js y antes de los juegos.
   ============================================================ */
'use strict';
const PSX = (() => {
  // Rejilla de 320×240: cada vértice cae en un píxel entero de la pantalla.
  const SNAP = '\n\tif (gl_Position.w > 0.0) gl_Position.xy = floor(gl_Position.xy / gl_Position.w * vec2(160.0, 120.0) + 0.5) / vec2(160.0, 120.0) * gl_Position.w;\n';
  function material(m){
    const affine = !!m.map;
    m.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + SNAP + (affine ? '\tvAff = vec3(vUv * gl_Position.w, gl_Position.w);\n' : ''));
      if (affine){
        s.vertexShader = 'varying vec3 vAff;\n' + s.vertexShader;
        s.fragmentShader = 'varying vec3 vAff;\n' + s.fragmentShader.replace('#include <map_fragment>',
          'vec4 texelColor = texture2D(map, vAff.xy / vAff.z);\n\ttexelColor = mapTexelToLinear(texelColor);\n\tdiffuseColor *= texelColor;');
      }
    };
    m.customProgramCacheKey = () => affine ? 'psxAffine' : 'psxSnap';
    return m;
  }

  let ren = null;
  function renderer(){
    if (!ren){ ren = new THREE.WebGLRenderer({ canvas: glCv, antialias: false }); ren.setPixelRatio(1); }
    return ren;
  }

  function pantalla(w = 320, h = 240){
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: { t: { value: rt.texture }, res: { value: new THREE.Vector2(w, h) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D t; uniform vec2 res; varying vec2 vUv;
        float b2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
        float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
        void main(){
          vec3 c = texture2D(t, vUv).rgb;
          c = floor(c * 31.0 + b4(vUv * res)) / 31.0;       // 5 bits por canal + tramado ordenado 4×4
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return {
      rt, mat, scene, cam,
      dibujar(escena, camara){ const r = renderer(); r.setRenderTarget(rt); r.render(escena, camara); r.setRenderTarget(null); r.render(scene, cam); }
    };
  }

  function textura(n, draw, rx = 1, ry = 1){
    const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
  }

  return { material, renderer, pantalla, textura, SNAP };
})();
