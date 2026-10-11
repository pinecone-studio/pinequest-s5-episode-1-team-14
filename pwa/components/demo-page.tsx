"use client";

import { useEffect, useRef, useState } from "react";

type Message = { id: number; from: "caller" | "ai"; text: string };

const greeting: Message = { id: 0, from: "ai", text: "Сайн байна уу, танд юугаар туслах вэ?" };

const samples = [
  "Маргааш үдээс хойш цаг авмаар байна",
  "Үйлчилгээний үнэ хэд вэ?",
  "Хэдэн цагт ажилладаг вэ?",
  "Танай хаяг хаана вэ?",
];

function mockReply(text: string): string {
  const t = text.toLowerCase();
  if (/\d{8}/.test(t)) return "Баярлалаа. Таны дугаарыг бүртгэлээ. Цагийг баталгаажуулах мессеж удахгүй очно.";
  if (/(цаг|захиал|авъя|авмаар)/.test(t) && !/(хэдэн цаг|ажил)/.test(t)) return "Маргааш 15:00 болон 16:30 цаг сул байна. Аль нь тохиромжтой вэ?";
  if (/(үнэ|хэд вэ|төлбөр)/.test(t)) return "Үнэ нь үйлчилгээнээс хамаарна. Ямар үйлчилгээ сонирхож байгаагаа хэлвэл үнийг хэлье.";
  if (/(ажил|хэдэн цаг|нээлттэй|хаах|нээх)/.test(t)) return "Бид өдөр бүр 09:00-аас 18:00 цаг хүртэл ажиллана.";
  if (/(хаяг|хаана|байршил)/.test(t)) return "oroogui";
  if (/(сайн байна уу|сайн уу|мэнд)/.test(t)) return "Сайн байна уу! Цаг захиалах, үнэ эсвэл ажлын цагийн талаар асууж болно.";
  return "Уучлаарай, ойлгосонгүй. Цаг захиалах, үнэ, ажлын цаг эсвэл хаягийн талаар асууна уу.";
}

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [fallback, setFallback] = useState(false);
  const nextId = useRef(1);
  const session = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || typing) return;

    const callerMessage: Message = { id: nextId.current++, from: "caller", text: content };
    const history = [...messages, callerMessage];
    setMessages(history);
    setDraft("");
    setTyping(true);

    const currentSession = session.current;
    let reply: string;
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ from, text }) => ({ from, text })) }),
      });
      if (!response.ok) throw new Error("request failed");
      const data = (await response.json()) as { reply?: string };
      if (!data.reply) throw new Error("empty reply");
      reply = data.reply;
      setFallback(false);
    } catch {
      reply = mockReply(content);
      setFallback(true);
    }

    if (currentSession !== session.current) return;
    const aiId = nextId.current++;
    setMessages((prev) => [...prev, { id: aiId, from: "ai", text: reply }]);
    setTyping(false);
  }

  function reset() {
    session.current += 1;
    setMessages([greeting]);
    setDraft("");
    setTyping(false);
    setFallback(false);
    nextId.current = 1;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return <>
    <div className="page-heading">
      <div>
        <p className="eyebrow">ТУРШИЛТЫН ДУУДЛАГА</p>
        <h1>Туршилтын дуудлага</h1>
        <p className="page-description">Дуудлага хийгчийн оронд бичиж, AI туслах хэрхэн хариулахыг шалгана уу.</p>
      </div>
      {fallback && <span className="waiting-badge"><span aria-hidden="true" />AI холбогдоогүй</span>}
    </div>
    <p className="calls-notice">
      {fallback
        ? "AI-тай холбогдож чадсангүй тул жишээ хариулт харуулж байна. API түлхүүр болон сүлжээгээ шалгана уу."
        : "Хариултыг AI бодитоор үүсгэнэ. Google Calendar холбогдоогүй тул сул цагууд жишээ байна."}
    </p>

    <div className="dashboard-grid">
      <section className="panel" aria-labelledby="chat-title">
        <div className="panel-heading">
          <div><p className="eyebrow">ИРЖ БУЙ ДУУДЛАГА</p><h2 id="chat-title">Дуудлагын яриа</h2></div>
          <button type="button" className="calls-button" onClick={reset}>Дахин эхлүүлэх</button>
        </div>

        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Дуудлагын харилцан яриа" tabIndex={0}>
          {messages.map((message) => (
            <p key={message.id} className={`bubble bubble-${message.from}`}>
              <span className="sr-only">{message.from === "ai" ? "AI туслах: " : "Дуудлага хийгч: "}</span>
              {message.text}
            </p>
          ))}
          {typing && <span className="bubble-typing" aria-label="AI туслах бичиж байна"><i /><i /><i /></span>}
        </div>

        <form className="chat-form" onSubmit={submit}>
          <input type="text" value={draft} maxLength={500} placeholder="Дуудлага хийгчийн үгийг бичнэ үү" aria-label="Дуудлага хийгчийн үг" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="calls-button settings-save" disabled={!draft.trim() || typing}>Илгээх</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="samples-title">
        <div className="panel-heading">
          <div><p className="eyebrow">ЖИШЭЭ АСУУЛТ</p><h2 id="samples-title">Түргэн сонгох</h2></div>
        </div>
        <ul className="sample-list">
          {samples.map((sample) => (
            <li key={sample}>
              <button type="button" className="sample-button" disabled={typing} onClick={() => void send(sample)}>{sample}</button>
            </li>
          ))}
        </ul>
        <p className="connection-note">Жишээ асуултыг дарж эсвэл өөрийн үгээр бичиж болно.</p>
      </section>
    </div>
  </>;
}