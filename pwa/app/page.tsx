import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CallbackForm } from "@/components/callback-form";
import { Icon, type IconName } from "@/components/ui";
import "./landing.css";

export const metadata: Metadata = {
  title: "CallAI — нэг ч дуудлага алдахгүй AI хүлээн авагч",
  description: "Завгүй үед ч, ажлын цаг дууссан ч AI хүлээн авагч таны бизнесийн утсанд хариулж, асуултад хариулан, цагийг шууд захиална.",
};

// Туршилтын дугаарыг кодод бичихгүй — байршуулах үед NEXT_PUBLIC_DEMO_NUMBER-ээр өгнө.
const DEMO_NUMBER = process.env.NEXT_PUBLIC_DEMO_NUMBER?.trim() ?? "";
const DEMO_HREF = "tel:" + DEMO_NUMBER.replace(/[^+\d]/g, "");

const SECTORS: { icon: IconName; label: string; job: string; photo: string; alt: string }[] = [
  { icon: "coffee", label: "Ресторан, кафе", job: "Ширээ захиална", photo: "restaurant", alt: "Кафедаа аяга барин инээмсэглэж буй хормогчтой ажилтан" },
  { icon: "scissors", label: "Гоо сайхны салон", job: "Үйлчилгээний цаг товлоно", photo: "salon", alt: "Гэгээлэг салонд үйлчлүүлэгчийн үсийг засаж буй үсчин" },
  { icon: "heart", label: "Эмнэлэг, клиник", job: "Үзлэгийн цаг бүртгэнэ", photo: "clinic", alt: "Эмнэлэгт инээмсэглэн зогсож буй ажилтан" },
  { icon: "activity", label: "Фитнес, спорт", job: "Хуваарь, үнээ хэлнэ", photo: "fitness", alt: "Шавьдаа урам өгч буй инээмсэглэсэн дасгалжуулагч" },
  { icon: "tool", label: "Засвар, үйлчилгээ", job: "Засварын цаг авна", photo: "repair", alt: "Дугуй засаж буй засварчин" },
];

const OPTIONS: { icon: IconName; title: string; pains: string[] }[] = [
  { icon: "phone", title: "Өөрөө авах", pains: ["Үйлчлүүлэгчтэйгээ байхдаа ажлаа тасална", "Оргил үед бүгдийг нь амжихгүй"] },
  { icon: "x", title: "Авахгүй өнгөрөөх", pains: ["Харилцагч дахин залгахгүй байж магадгүй", "Хэн, юу асуухаар залгасныг мэдэхгүй үлдэнэ"] },
  { icon: "user", title: "Хүн ажиллуулах", pains: ["Сар бүрийн цалин, сургалт", "Зөвхөн ажлын цагаар л хариулна"] },
];

const GAINS = ["Ажлаа таслахгүй", "Оргил үед ч, шөнө ч хариулна", "Дуудлага бүр бүртгэгдэнэ"];

const JOURNEY = [
  { title: "Шууд хариулна", text: "Харилцагчийг хүлээлгэхгүй. Таны бизнесийн нэрээр мэндэлнэ." },
  { title: "Асуултад хариулна", text: "Үйлчилгээ, үнэ, ажлын цаг — зөвхөн таны оруулсан мэдээллээс." },
  { title: "Цаг захиална", text: "Сул цагийг шалгаж, нэр, утсыг авч, календарьт бүртгэнэ." },
  { title: "Танд тайлагнана", text: "Дуудлагын зорилго, үр дүн, яриа хянах самбарт үлдэнэ." },
];

const TOPICS = ["Үйлчилгээ", "Үнэ", "Ажлын цаг", "Хаяг", "Түгээмэл асуулт"];

const STEPS = [
  { title: "Мэдээллээ оруулна", text: "Үйлчилгээ, үнэ, ажлын цаг, түгээмэл асуултаа нэг удаа бүртгэнэ." },
  { title: "Календараа холбоно", text: "Google Calendar-аа холбосноор AI зөвхөн жинхэнэ сул цагийг санал болгоно." },
  { title: "Дугаараа шилжүүлнэ", text: "Одоогийн дугаар дээрээ дуудлага шилжүүлэлт асаана. Дугаар тань хэвээрээ." },
];

const FAQ = [
  { q: "Ямар бизнест тохирох вэ?", a: "Утсаар асуулт авдаг, цаг захиалгаар ажилладаг ямар ч бизнест. AI таны оруулсан үйлчилгээ, үнэ, цагийн хуваариар хариулдаг тул салбараас хамаарахгүй." },
  { q: "Одоогийн утасны дугаараа солих уу?", a: "Үгүй. Одоогийн дугаар дээрээ дуудлага шилжүүлэлт тохируулахад л хангалттай. Харилцагчид урьдын адил таны дугаар руу залгана." },
  { q: "AI мэдэхгүй зүйл асуувал яах вэ?", a: "Таны оруулсан мэдээлэлд байхгүй бол «энэ мэдээлэл бүртгэгдээгүй байна» гэж үнэнээр хэлнэ. Үнэ, цагийг таамаглаж хэлэхгүй." },
  { q: "Харилцагч AI-тай ярьж байгаагаа мэдэх үү?", a: "Асуувал AI туслах гэдгээ үнэнээр хэлнэ. Хүн гэж хэзээ ч худлаа хэлэхгүй." },
  { q: "Захиалга давхцах уу?", a: "Үгүй. AI захиалга үүсгэхээсээ өмнө таны Google Calendar-аас тухайн цаг сул эсэхийг шалгадаг. Завгүй цагт захиалга авахгүй." },
  { q: "Юу ярьсныг дараа нь харж болох уу?", a: "Болно. Дуудлага бүрийн зорилго, үр дүн, ярианы бичвэр хянах самбарт хадгалагдана." },
];

// Чимэглэлийн дүрслэл: дууны долгион (өндрүүд нь тогтмол тул сервер, хөтөч дээр ижил зурагдана).
const WAVE = [22, 40, 64, 34, 78, 52, 92, 60, 36, 70, 100, 58, 82, 44, 66, 30, 54, 88, 48, 72, 38, 60, 26, 46];
// Сарын хуанлийн дүрслэл: 0 сул, 1 завгүй, 2 шинэ захиалга.
const CALENDAR = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 2, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0];

function Brand() {
  return <Link className="lp-brand" href="/"><Image src="/logo-mark.png" alt="" width={34} height={34} priority /><span>Call<b>AI</b></span></Link>;
}

function PrimaryCta() {
  return DEMO_NUMBER
    ? <a className="lp-btn lp-btn-primary" href={DEMO_HREF}><Icon name="phone" />Залгаж турших · {DEMO_NUMBER}</a>
    : <Link className="lp-btn lp-btn-primary" href="/dashboard">Хянах самбар үзэх<Icon name="arrow" /></Link>;
}

function Heading({ kicker, title, lead, id }: { kicker: string; title: React.ReactNode; lead?: string; id: string }) {
  return <div className="lp-heading"><p className="lp-kicker">{kicker}</p><div className="lp-heading-row"><h2 id={id}>{title}</h2>{lead && <p className="lp-lead">{lead}</p>}</div></div>;
}

function Photo({ name, alt, sizes, priority }: { name: string; alt: string; sizes: string; priority?: boolean }) {
  return <Image src={"/landing/" + name + ".jpg"} alt={alt} fill sizes={sizes} priority={priority} />;
}

export default function LandingPage() {
  return <div className="lp">
    <header className="lp-nav">
      <Brand />
      <nav aria-label="Үндсэн цэс">
        <a href="#call">Хэрхэн ажилладаг</a>
        <a href="#why">Онцлог</a>
        <a href="#start">Эхлэх</a>
        <a href="#faq">Асуулт</a>
      </nav>
      <div className="lp-auth">
        <Link className="lp-btn lp-btn-small lp-btn-quiet" href="/login">Нэвтрэх</Link>
        <Link className="lp-btn lp-btn-small lp-btn-light" href="/signup">Бүртгүүлэх</Link>
      </div>
    </header>

    <main>
      <section className="lp-hero">
        <div className="lp-hero-layout">
          <div className="lp-hero-copy">
            <h1>Нэг ч дуудлага<br /><em>алдахгүй</em></h1>
            <p className="lp-lead">Завгүй үед ч, ажлын цаг дууссан ч AI хүлээн авагч таны бизнесийн утсанд хариулж, асуултад хариулан, цагийг шууд захиална.</p>
            <div className="lp-actions">
              <Link className="lp-btn" href="/dashboard">Хянах самбар үзэх<Icon name="arrow" /></Link>
              <a className="lp-btn" href="#call">Хэрхэн ажилладаг вэ</a>
            </div>
            <ul className="lp-facts">
              <li>Өдөр шөнөгүй</li><li>Таны өөрийн дуу хоолойгоор</li><li>Google Calendar-тай</li>
            </ul>
          </div>
          <div className="lp-hero-demo">
            <div className="lp-mascot" aria-hidden="true">
              <span /><span /><span />
              <Image src="/logo-mark.png" alt="" width={80} height={80} priority />
            </div>
            <h2>AI хүлээн авагчтай<br />ярьж үзээрэй</h2>
            <CallbackForm />
          </div>
        </div>
        <ul className="lp-strip" aria-label="Хэнд тохирох вэ">
          {SECTORS.map((sector, index) => <li key={sector.label}>
            <Photo name={sector.photo} alt={sector.alt} sizes="(max-width: 640px) 62vw, 240px" priority={index < 3} />
            <span className="lp-strip-label"><i aria-hidden="true"><Icon name={sector.icon} size={15} /></i>{sector.label}</span>
            <span className="lp-chip"><Icon name="check" size={14} />{sector.job}</span>
          </li>)}
        </ul>
      </section>

      <section className="lp-section" aria-labelledby="options-title">
        <Heading id="options-title" kicker="Асуудал" title={<>Утас дуугарахад танд<br />гурван сонголт байдаг</>} lead="Гурвуулаа ямар нэг зүйлээ золиослодог." />
        <div className="lp-problem">
          <figure className="lp-photo">
            <Photo name="owner" alt="Ширээндээ ажиллангаа утсаар ярьж буй эмэгтэй" sizes="(max-width: 940px) 100vw, 500px" />
            <figcaption className="lp-chip"><Icon name="phone" size={14} />Ажлын дундуур утас дуугарна</figcaption>
          </figure>
          <div className="lp-options">
            {OPTIONS.map((option) => <article key={option.title}>
              <span className="lp-option-icon" aria-hidden="true"><Icon name={option.icon} size={18} /></span>
              <div>
                <h3>{option.title}</h3>
                <ul>{option.pains.map((pain) => <li key={pain}><Icon name="x" size={14} />{pain}</li>)}</ul>
              </div>
            </article>)}
          </div>
        </div>
        <article className="lp-answer">
          <div className="lp-answer-text">
            <p className="lp-answer-kicker">Дөрөв дэх зам</p>
            <h3>AI хүлээн авагч<br />бүх дуудлагыг авна</h3>
            <ul>{GAINS.map((gain) => <li key={gain}><Icon name="check" size={16} />{gain}</li>)}</ul>
          </div>
          <figure className="lp-photo">
            <Photo name="caller" alt="Цонхны дэргэд утсаар ярьж буй харилцагч" sizes="(max-width: 640px) 100vw, 380px" />
            <figcaption className="lp-chip"><span className="lp-dot" aria-hidden="true" />Харилцагч хүлээхгүй</figcaption>
          </figure>
        </article>
      </section>

      <section className="lp-section is-navy" id="call" aria-labelledby="call-title">
        <Heading id="call-title" kicker="Хэрхэн ажилладаг" title={<>Нэг дуудлага <em>эхнээсээ дуустал</em></>} lead="Харилцагч таны дугаар руу залгах мөчөөс хянах самбарт бүртгэгдэх хүртэл." />
        <ol className="lp-journey">
          <li className="is-blue">
            <div className="lp-media"><Photo name="caller2" alt="Утсандаа инээмсэглэн ярьж буй харилцагч" sizes="(max-width: 640px) 100vw, 220px" /><span className="lp-ring" aria-hidden="true"><Icon name="phone" size={18} /></span></div>
            <div className="lp-journey-copy"><span className="lp-count">01</span><h3>{JOURNEY[0].title}</h3><p>{JOURNEY[0].text}</p></div>
          </li>
          <li>
            <div className="lp-media lp-topics" aria-hidden="true">{TOPICS.map((topic) => <span key={topic}><Icon name="tag" size={13} />{topic}</span>)}</div>
            <div className="lp-journey-copy"><span className="lp-count">02</span><h3>{JOURNEY[1].title}</h3><p>{JOURNEY[1].text}</p></div>
          </li>
          <li className="is-blue">
            <div className="lp-media lp-slots" aria-hidden="true"><span>Завгүй</span><span className="is-free"><Icon name="check" size={15} />Сул цаг</span><span>Завгүй</span></div>
            <div className="lp-journey-copy"><span className="lp-count">03</span><h3>{JOURNEY[2].title}</h3><p>{JOURNEY[2].text}</p></div>
          </li>
          <li>
            <div className="lp-media lp-shot"><Image src="/landing/calls.png" alt="Хянах самбарын дуудлагын жагсаалт" fill sizes="(max-width: 640px) 100vw, 220px" /></div>
            <div className="lp-journey-copy"><span className="lp-count">04</span><h3>{JOURNEY[3].title}</h3><p>{JOURNEY[3].text}</p></div>
          </li>
        </ol>
      </section>

      <section className="lp-section" id="why" aria-labelledby="why-title">
        <Heading id="why-title" kicker="Онцлог" title={<>Таны нэрийн өмнөөс<br />ярих тул нарийн хийсэн</>} />
        <div className="lp-bento">
          <article className="lp-tile lp-tile-wide is-blue">
            <div className="lp-wave" aria-hidden="true">{[...WAVE, ...WAVE].map((height, index) => <i key={index} style={{ height: height + "%", animationDelay: index * -0.13 + "s" }} />)}</div>
            <h3>Таны өөрийн дуу хоолойгоор</h3>
            <p>Эзэмшигчийн дуу хоолойг хувилдаг тул харилцагч танил дуугаар угтуулна. Робот биш, таны бизнесийн дуу.</p>
          </article>
          <article className="lp-tile is-soft">
            <span className="lp-tile-icon" aria-hidden="true"><Icon name="shield" size={22} /></span>
            <h3>Зохиож ярихгүй</h3>
            <p>Бүртгээгүй үнэ, цагийг таамаглахгүй. Мэдэхгүй бол мэдэхгүй гэж хэлнэ.</p>
          </article>
          <article className="lp-tile">
            <div className="lp-calendar" aria-hidden="true">{CALENDAR.map((state, index) => <i key={index} className={state === 2 ? "is-new" : state === 1 ? "is-busy" : undefined} />)}</div>
            <h3>Захиалга давхцахгүй</h3>
            <p>Сул цагийг Google Calendar-аас шалгасны дараа л захиалга үүсгэнэ.</p>
          </article>
          <article className="lp-tile">
            <div className="lp-interrupt" aria-hidden="true"><span>AI ярьж байна</span><span>Харилцагч</span></div>
            <h3>Яриаг таслаж болно</h3>
            <p>Харилцагч дундуур нь ярихад AI зогсоод сонсоно. Хүнтэй ярьж байгаа мэт.</p>
          </article>
          <article className="lp-tile is-violet">
            <span className="lp-tile-icon" aria-hidden="true"><Icon name="user" size={22} /></span>
            <h3>AI гэдгээ нуухгүй</h3>
            <p>Асуувал AI гэдгээ үнэнээр хэлнэ. Хүн мэт дүр эсгэхгүй.</p>
          </article>
        </div>
        <article className="lp-board">
          <div className="lp-board-text">
            <p className="lp-answer-kicker">Хянах самбар</p>
            <h3>Дуудлага бүр ил тод</h3>
            <p>Хэн залгасан, юу асуусан, захиалга болсон эсэх, яг юу ярьсан — бүгд нэг дор.</p>
            <Link className="lp-btn lp-btn-primary" href="/dashboard">Хянах самбар үзэх<Icon name="arrow" /></Link>
          </div>
          <div className="lp-board-visual">
            <div className="lp-frame"><Image src="/landing/calls.png" alt="CallAI хянах самбар: дуудлагын түүх, зорилго, үргэлжилсэн хугацаа, төлөв" width={1280} height={800} sizes="(max-width: 940px) 100vw, 640px" /></div>
          </div>
        </article>
      </section>

      <section className="lp-section is-tint" id="start" aria-labelledby="start-title">
        <div className="lp-start-layout">
          <Heading id="start-title" kicker="Эхлэх" title={<>Гурван алхам.<br />Дугаар тань хэвээрээ.</>} />
          <ol className="lp-steps">
            {STEPS.map((step, index) => <li key={step.title}><span className="lp-step-number" aria-hidden="true">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}
          </ol>
        </div>
      </section>

      <section className="lp-section lp-faq-section" id="faq" aria-labelledby="faq-title">
        <Heading id="faq-title" kicker="Асуулт" title="Түгээмэл асуулт" />
        <div className="lp-faq">
          {FAQ.map(({ q, a }) => <details key={q}><summary>{q}<Icon name="chevron" /></summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="lp-final" aria-labelledby="final-title">
        <div className="lp-final-inner">
          <Image src="/logo-mark.png" alt="" width={72} height={72} />
          <div className="lp-final-copy">
            <h2 id="final-title">{DEMO_NUMBER ? <>Өөрөө <em>залгаад</em> үзээрэй</> : <>Хянах самбарыг <em>үзээрэй</em></>}</h2>
            <p className="lp-lead">{DEMO_NUMBER ? "Цаг захиалж, үнэ асууж, яриаг нь тасалж үзээрэй." : "Дуудлага, захиалга, ярианы бичвэр нэг дор."}</p>
          </div>
          <PrimaryCta />
        </div>
      </section>
    </main>

    <footer className="lp-footer"><Brand /><span>© 2026 CallAI</span></footer>
  </div>;
}
