/* page.js — гүйлгэх үеийн хөдөлгөөн, дээд зураас, гэрэл/бараан горим */
(() => {
  // Scroll reveal + progress
  document.querySelectorAll('main section').forEach(sec => sec.classList.add('rv'));
  const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: .1 });
  document.querySelectorAll('.rv').forEach(sec => rio.observe(sec));
  addEventListener('scroll', () => { const h = document.documentElement; $('bar').style.transform = `scaleX(${scrollY / Math.max(h.scrollHeight - innerHeight, 1)})`; }, { passive: true });

  // Theme toggle (auto / light / dark)
  const root = document.documentElement, modes = ['auto', 'light', 'dark']; let m = 0;
  try { m = Math.max(0, modes.indexOf(localStorage.getItem('theme'))); } catch {}
  const applyTheme = () => {
    modes[m] === 'auto' ? root.removeAttribute('data-theme') : root.dataset.theme = modes[m];
    $('themeBtn').textContent = ['◐', '☀', '☾'][m]; $('themeBtn').title = 'Загвар: ' + ['автомат', 'цайвар', 'бараан'][m];
  };
  $('themeBtn').onclick = () => { m = (m + 1) % 3; try { localStorage.setItem('theme', modes[m]); } catch {} applyTheme(); };
  applyTheme();
})();
