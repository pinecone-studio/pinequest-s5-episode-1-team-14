/* background.js — hero-гийн хөдөлгөөнт bloom дэвсгэр (canvas) */
(() => {
  // Bloom дэвсгэр: хар дэвсгэр дээр цэнхэр-нил ягаан, цагаан туяат дэлбэрэлт
  (() => {
    const cv = $('burst'), ctx = cv.getContext('2d'), N = 150, S = .5;
    const rays = Array.from({ length: N }, (_, i) => ({ a: i / N * Math.PI * 2, sp: .4 + Math.random() * 1.1, ph: Math.random() * 6.28, w: .5 + Math.random() * .8 }));
    const bg = $('bg'), heroEl = document.querySelector('.hero-stick');
    let W, H;
    const size = () => {
      const h = Math.ceil(heroEl.getBoundingClientRect().bottom + scrollY); bg.style.height = h + 'px';
      W = cv.width = Math.ceil(innerWidth * S); H = cv.height = Math.ceil(h * S);
    };
    const draw = t => {
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const cx = W * .5, cy = H * .52, r = Math.min(W, H) * .3 * (1 + .05 * Math.sin(t * .0009)), r0 = r * .2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.5);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.35, 'rgba(60,30,200,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 2 * Math.PI * r / N * 1.5;
      rays.forEach(k => {
        const n = .5 + .5 * Math.sin(t * .0006 * k.sp + k.ph), L = r * (.7 + .65 * n * k.w) , c = Math.cos(k.a), s = Math.sin(k.a);
        const lg = ctx.createLinearGradient(cx + c * r0, cy + s * r0, cx + c * L, cy + s * L);
        lg.addColorStop(0, 'rgba(10,0,70,0)'); lg.addColorStop(.35, 'rgba(70,45,235,.5)'); lg.addColorStop(.75, 'rgba(195,182,255,.75)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = lg; ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * L, cy + s * L); ctx.stroke();
      });
    };
    size(); addEventListener('resize', () => { size(); draw(performance.now()); });
    new ResizeObserver(() => { size(); draw(performance.now()); }).observe(heroEl);
    if (reduce) { draw(0); return; }
    const loop = t => { if (!document.hidden) draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })();
})();
