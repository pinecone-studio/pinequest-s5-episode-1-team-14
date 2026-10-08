/* history.js — дээд цэснээс нээгдэх захиалга, дуудлагын түүхийн цонх */
(() => {
  // Захиалга, дуудлагын түүх (дээд цэснээс нээгдэх цонх)
  const PILL = { ok: 'text-[#1E8A57] border-[#1E8A57]', warn: 'text-[#B26A00] border-[#B26A00]', bad: 'text-[#C0392B] border-[#C0392B]' };
  let tab = 'b';
  const renderHist = () => {
    const t = $('tbl'); t.replaceChildren();
    const heads = tab === 'b' ? ['Нэр', 'Утас', 'Үйлчилгээ', 'Цаг', 'Төлөв'] : ['Цаг', 'Дугаар', 'Зорилго', 'Үргэлжилсэн', 'Төлөв'];
    const hr = el('tr'); heads.forEach(h => hr.append(el('th', '', h))); t.append(hr);
    (tab === 'b' ? bookings : calls).forEach(r => {
      const tr = el('tr');
      r.slice(0, 5).forEach((v, k) => {
        const td = el('td');
        if (k === 4) td.append(el('span', `pill ${PILL[tab === 'b' ? 'ok' : r[5]]}`, v)); else td.textContent = v;
        tr.append(td);
      });
      t.append(tr);
    });
  };
  const setTab = x => { tab = x; $('tabB').setAttribute('aria-selected', x === 'b'); $('tabC').setAttribute('aria-selected', x === 'c'); renderHist(); };
  $('tabB').onclick = () => setTab('b'); $('tabC').onclick = () => setTab('c');
  const hist = $('hist');
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { setTab(b.dataset.open); hist.showModal(); });
  $('hclose').onclick = () => hist.close();
  hist.addEventListener('click', e => { if (e.target === hist) hist.close(); });
})();
