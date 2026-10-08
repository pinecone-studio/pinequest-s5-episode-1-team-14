import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ерөнхий тойм · AI Front-Desk Mongolia" };

const metrics = ["Нийт дуудлага", "AI хариулсан хувь", "Нийт захиалга", "Захиалга болсон хувь", "Тооцоолсон орлого", "Дундаж ярианы хугацаа"];
const connections = [
  { letter: "A", title: "AI туслах", detail: "Монгол хэлээр харилцах" },
  { letter: "T", title: "Утасны суваг", detail: "Ирж буй дуудлага" },
  { letter: "C", title: "Хуанли", detail: "Цаг ба захиалга" },
  { letter: "K", title: "Мэдээллийн сан", detail: "Бизнесийн баталгаатай мэдээлэл" },
];

export default function DashboardPage() {
  return <>
    <div className="page-heading">
      <div><p className="eyebrow">ТАНЫ БИЗНЕС, НЭГ ЦОНХОНД</p><h1>Ерөнхий тойм</h1><p className="page-description">Дуудлага, захиалга, харилцагчийн мэдээллээ нэг дороос.</p></div>
      <span className="waiting-badge"><span aria-hidden="true" />Мэдээлэл хүлээж байна</span>
    </div>
    <section aria-label="Үйл ажиллагааны үзүүлэлтүүд" aria-describedby="metrics-note">
      <dl className="metrics-grid">
        {metrics.map((label, index) => <div className="metric-card" key={label}>
          <dt>{label}<span className="metric-number" aria-hidden="true">0{index + 1}</span></dt>
          <dd><span aria-hidden="true">—</span><span className="sr-only">Мэдээлэл алга</span></dd>
        </div>)}
      </dl>
      <p className="metrics-note" id="metrics-note">Үзүүлэлтүүд мэдээлэл холбогдсоны дараа харагдана.</p>
    </section>
    <div className="dashboard-grid">
      <section className="panel activity-panel" aria-labelledby="activity-title">
        <div className="panel-heading"><div><p className="eyebrow">ХАРИЛЦАГЧИЙН ХАРИЛЦАА</p><h2 id="activity-title">Сүүлийн үйл ажиллагаа</h2></div></div>
        <div className="empty-state">
          <div className="empty-illustration" aria-hidden="true"><div className="illustration-sheet"><span /><span /><span /></div><span className="illustration-bubble">✳</span></div>
          <h3>Шинэ харилцааны эхлэл.</h3>
          <p>Дуудлага, захиалгын мэдээлэл холбогдмогц<br className="desktop-break" /> таны сүүлийн үйл ажиллагаа энд харагдана.</p>
          <a className="text-link" href="#connections">Холболтуудыг харах <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <section className="panel connections-panel" id="connections" tabIndex={-1} aria-labelledby="connections-title">
        <div className="panel-heading"><div><p className="eyebrow">НЭГДСЭН АЖЛЫН ОРЧИН</p><h2 id="connections-title">Холболтууд</h2></div><span className="connection-count">04</span></div>
        <ul className="connection-list">
          {connections.map((connection) => <li key={connection.title}>
            <span className="connection-icon" aria-hidden="true">{connection.letter}</span>
            <div><h3>{connection.title}</h3><p>{connection.detail}</p></div>
            <span className="connection-status">Шалгаагүй</span>
          </li>)}
        </ul>
        <p className="connection-note">Холболтын төлөвийн мэдээлэл хараахан ирээгүй байна.</p>
      </section>
    </div>
  </>;
}
