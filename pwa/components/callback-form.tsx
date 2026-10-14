"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui";

type State = "idle" | "sending" | "calling" | "invalid" | "limited" | "failed";

const MESSAGES: Partial<Record<State, string>> = {
  calling: "Таны утас руу залгаж байна. Гадаад дугаараас дуудлага ирнэ.",
  invalid: "8 оронтой утасны дугаараа оруулна уу.",
  limited: "Түр хүлээгээд дахин оролдоно уу.",
  failed: "Одоогоор залгаж чадсангүй. Дараа дахин оролдоно уу.",
};

export function CallbackForm() {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (phone.replace(/\D/g, "").length < 8) return setState("invalid");
    setState("sending");
    try {
      const response = await fetch("/api/callback", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }),
      });
      setState(response.ok ? "calling" : response.status === 400 ? "invalid" : response.status === 429 ? "limited" : "failed");
    } catch {
      setState("failed");
    }
  }

  const message = MESSAGES[state];
  return <form className="lp-callback" onSubmit={submit} noValidate>
    <div className="lp-callback-row">
      <label className="lp-callback-field">
        <span className="sr-only">Утасны дугаар</span>
        <span aria-hidden="true">+976</span>
        <input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="Утасны дугаар" maxLength={12}
          value={phone} onChange={(event) => { setPhone(event.target.value); setState("idle"); }} />
      </label>
      <button className="lp-btn lp-btn-primary" type="submit" disabled={state === "sending" || state === "calling"}>
        <Icon name="phone" />{state === "sending" ? "Залгаж байна…" : "Над руу залга"}
      </button>
    </div>
    <p className={"lp-callback-note" + (message && state !== "calling" ? " is-error" : "")} role="status">
      {message ?? "Дугаараа оруулбал AI хүлээн авагч тан руу залгана."}
    </p>
  </form>;
}
