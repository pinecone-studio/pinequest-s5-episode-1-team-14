/* sections.js — "Хэрхэн ажилладаг", эмнэлгүүдийн карт, демо дугаар */
(() => {
  // Steps
  [['Эмнэлгийн мэдээллээ оруулах', 'Үйлчилгээ, үнэ, эмч нарын хуваарийг нэг удаа бүртгэнэ.'],
   ['Календараа холбох', 'Google Calendar холбосноор AI зөвхөн бодит сул цагийг санал болгоно.'],
   ['Дугаараа шилжүүлэх', 'Дуудлага AI руу орж, цаг захиалсан тохиолдол бүр самбарт харагдана.']
  ].forEach(([t, d], i) => {
    const li = el('li', 'bg-surface border border-line rounded-xl p-[22px] transition hover:-translate-y-1 motion-reduce:transition-none');
    li.append(el('div', 'grid place-items-center size-8 rounded-full bg-ink text-bg font-bold mb-3.5', i + 1), el('b', 'block mb-1.5', t), el('span', 'text-muted', d));
    $('steps').append(li);
  });

  // Clinics
  CLINICS.forEach(c => {
    const d = el('div', 'bg-surface border border-line rounded-xl p-5 transition hover:-translate-y-1 motion-reduce:transition-none');
    const t = el('p', 'm-0 mb-1.5 text-muted');
    if (c.phone) { const a = el('a', 'text-accent font-bold no-underline', c.phone); a.href = 'tel:' + c.phone.replace(/[^+\d]/g, ''); t.append(a); }
    else t.textContent = 'Утасны дугаар удахгүй';
    d.append(el('h3', 'm-0 mb-2.5 text-lg', c.name), el('p', 'm-0 mb-1.5 text-muted', c.address || 'Байршил удахгүй'), t);
    $('clinicList').append(d);
  });

  // Demo number
  if (DEMO_NUMBER) { const b = $('callBtn'); b.href = 'tel:' + DEMO_NUMBER; b.removeAttribute('aria-disabled'); $('demoNum').textContent = DEMO_NUMBER; }
})();
