# AI Front-Desk landing page

PR #14-ийн баталсан загвар `pwa/public/landing/` дотор байрлана.
Repository root-оос `npm run dev:pwa` ажиллуулаад `http://localhost:3000/` нээнэ.
Next.js `/` хүсэлтийг `/landing/index.html` рүү rewrite хийнэ; хөтчийн хаяг `/` хэвээр үлдэнэ.
HTML, CSS, script нь dashboard-оос тусдаа document-д ажиллана. Хянах самбарын холбоос `/dashboard` руу орно.

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

Одоогоор Tailwind CDN болон Google Fonts-д интернэт холболт шаардлагатай.
Hero яриа, захиалга, дуудлагын түүх нь зохиомол демо; backend/Calendar руу хүсэлт явуулахгүй.
Эмнэлгийн нэр, дугаар нь placeholder бөгөөд `DEMO_NUMBER` хоосон үед залгах холбоос идэвхгүй.

`pwa/README.md`-ийн түр Playwright Core tooling-ийг ашиглаж, ажиллаж буй сервер дээр
`node pwa/scripts/check-landing.cjs` ажиллуулна. `DASHBOARD_URL` серверийн хаягийг тохируулна.
