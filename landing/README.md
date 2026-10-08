# AI Front-Desk landing page

Нээх: `index.html`-ийг хөтөч дээр шууд нээнэ.

| Файл | Юуны тулд |
|---|---|
| `index.html` | Хуудасны бүтэц (HTML) болон Tailwind-ийн component style |
| `assets/css/styles.css` | Өнгө, цайвар/бараан горим, дэвсгэр, хөдөлгөөн |
| `assets/js/tailwind.config.js` | Tailwind-ийн өнгө, фонт |
| `assets/js/config.js` | **Өөрийн мэдээлэл**: `CLINICS`, `DEMO_NUMBER` |
| `assets/js/data.js` | Захиалга, дуудлагын жишээ өгөгдөл |
| `assets/js/utils.js` | Туслах функцууд |
| `assets/js/sections.js` | Алхмууд, эмнэлгүүдийн карт, демо дугаар |
| `assets/js/history.js` | Захиалга, дуудлагын түүхийн цонх |
| `assets/js/chat.js` | Hero дахь жишээ яриа |
| `assets/js/background.js` | Bloom дэвсгэр (canvas) |
| `assets/js/page.js` | Гүйлгэх хөдөлгөөн, дээд зураас, горим солих |

Script-ийн дараалал `index.html` дотор чухал (`utils` -> `config` -> `data` -> бусад).
Tailwind-ийн `@apply`-тай component style нь CDN-ийн шаардлагаар `index.html` дотор үлдсэн.
