/* Fundo do Claude Design. A animação para em abas ocultas, no layout original
   e quando o usuário prefere menos movimento. Não altera dados do painel. */
(function () {
  'use strict';
  const canvas = document.getElementById('bg-flow');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, time = 0, seeds = [];
  const mouse = { x: -999, y: -999 };
  function draw() {
    const dark = document.documentElement.dataset.theme === 'dark';
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.lineWidth = 1;
    seeds.forEach(([sx, sy, red]) => {
      ctx.strokeStyle = red ? (dark ? 'rgba(226,66,56,.5)' : 'rgba(208,48,40,.42)') : (dark ? 'rgba(255,255,255,.1)' : 'rgba(28,26,26,.09)');
      ctx.beginPath(); ctx.moveTo(sx, sy);
      let x = sx, y = sy;
      for (let k = 0; k < 34; k++) {
        const distance = Math.hypot(x - mouse.x, y - mouse.y);
        const angle = (Math.sin(x * .0021 + time) + Math.cos(y * .0027 - time * .7) + Math.sin((x + y) * .0016 + time * .5)) * 1.05 + (reduced.matches ? 0 : Math.max(0, 1 - distance / 220) * 1.6);
        x += Math.cos(angle) * 7; y += Math.sin(angle) * 7; ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seeds = [];
    for (let i = 0; i <= Math.ceil(innerWidth / 22); i++) {
      for (let j = 0; j <= Math.ceil(innerHeight / 90); j++) seeds.push([i * 22 + (j % 2) * 11, j * 90 + ((i * 37) % 60) - 20, (i * 7 + j * 3) % 7 === 0]);
    }
    draw();
  }
  function tick(ts) {
    if (ts - last >= 66) { last = ts; time += .0016; draw(); }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0;
    if (document.documentElement.dataset.layout !== 'original' && !document.hidden) {
      draw(); if (!reduced.matches) frame = requestAnimationFrame(tick);
    }
  }
  addEventListener('resize', resize);
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -999; });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-layout'] });
  resize(); sync();
})();
