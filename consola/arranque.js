/* VIBECODED — arranque. Va después de todos los juegos: con ellos ya registrados, monta la caja y la tele. */
'use strict';
resize(); applyTV();
try { buildCase(); } catch (e){ console.error(e); }
drawLogo(); showGame();
if (document.fonts) document.fonts.ready.then(() => { drawTV(state !== 'off'); showGame(); });
requestAnimationFrame(frame); requestAnimationFrame(caseFrame);
