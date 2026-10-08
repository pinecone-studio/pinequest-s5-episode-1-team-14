/* chat.js — hero дахь дуудлагын жишээ яриа */
(() => {
  // Chat demo
  const lines = [
    ['c', 'Сайн байна уу, маргааш үдээс хойш шүд цэвэрлүүлэх цаг авмаар байна.'],
    ['a', 'Сайн байна уу! Маргааш 15:00 болон 16:30 цаг сул байна. Аль нь тохиромжтой вэ?'],
    ['c', '16:30 гэж авъя.'],
    ['a', 'Ойлголоо. Таны нэр, утасны дугаарыг хэлнэ үү.'],
    ['c', 'Болд, 9911 2233.']];
  const FADE = 'transition duration-[350ms] motion-reduce:transition-none ';
  const reveal = n => requestAnimationFrame(() => n.classList.replace('opacity-0', 'opacity-100'));
  const bubble = ([who, text]) => {
    const d = el('div', FADE + 'max-w-[88%] px-[13px] py-[9px] mb-[9px] rounded-xl opacity-0 ' +
      (who === 'c' ? 'bg-[#1F1F28] rounded-bl-[3px]' : 'bg-[var(--bubble)] text-[color:var(--bubble-ink)] ml-auto rounded-br-[3px]'), text);
    $('chat').append(d); reduce ? d.classList.replace('opacity-0', 'opacity-100') : reveal(d);
  };
  const booked = () => {
    const b = el('div', FADE + 'mt-3 border border-[#4A4A5C] rounded-[10px] p-3 opacity-0');
    b.append(el('b', 'block text-white', 'Цаг захиалагдлаа'), 'Маргааш 16:30, шүд цэвэрлэгээ, Болд. Календарьт нэмэгдсэн.');
    $('chat').append(b); reduce ? b.classList.replace('opacity-0', 'opacity-100') : reveal(b);
    bookings.unshift(['Болд', '9911 2233', 'Шүд цэвэрлэгээ', 'Маргааш 16:30', 'Баталгаажсан']);
    calls.unshift(['21:47', '9911 2233', 'Цаг захиалга', '2:40', 'Дууссан', 'ok']);
  };
  let i = 0;
  const typing = () => {
    const d = el('div', 'w-fit px-[13px] py-[11px] mb-[9px] rounded-xl bg-[color-mix(in_srgb,var(--bubble)_80%,transparent)] text-[color:var(--bubble-ink)] ml-auto flex gap-1');
    for (let k = 0; k < 3; k++) { const s = el('span', 'size-1.5 rounded-full bg-current'); s.style.animation = `dot 1s ${k * .15}s infinite`; d.append(s); }
    $('chat').append(d); return d;
  };
  const next = () => {
    if (i >= lines.length) return booked();
    const ai = lines[i][0] === 'a', t = ai ? typing() : null;
    setTimeout(() => { t?.remove(); bubble(lines[i++]); setTimeout(next, ai ? 900 : 1300); }, ai ? 800 : 0);
  };

  if (reduce) { lines.forEach(bubble); booked(); } else setTimeout(next, 600);
})();
