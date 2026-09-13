"use client";

import { useState, type FormEvent } from "react";
import type { AgusResponse } from "@/lib/client/rujak-types";

type Props = {
  selectedStopName: string | null;
  minutes: 5 | 10;
  status: "idle" | "loading" | "success" | "error";
  response: AgusResponse | null;
  error: string | null;
  actionError: string | null;
  onSubmit: (message: string) => void;
  onApplyAction: () => void;
};

export default function AgusPanel({ selectedStopName, minutes, status, response, error, actionError, onSubmit, onApplyAction }: Props) {
  const [message, setMessage] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (message.trim()) onSubmit(message.trim());
  };
  return (
    <section className="panel agus-panel" aria-label="AGUS, asisten RUJAK">
      <div className="panel-heading"><div><div className="eyebrow">AGUS</div><h2>Asisten data RUJAK</h2></div></div>
      <p className="hint">{selectedStopName ? `Konteks: ${selectedStopName} · ${minutes} menit` : "Pilih titik transit untuk memakai AGUS."}</p>
      <form className="agus-form" onSubmit={submit}>
        <label className="field-label" htmlFor="agus-question">Tanyakan akses kuliner</label>
        <textarea id="agus-question" value={message} maxLength={800} onChange={(event) => setMessage(event.target.value)} placeholder="Contoh: Kuliner apa yang bisa dijangkau dalam 10 menit?" disabled={status === "loading"} />
        <button type="submit" className="agus-submit" disabled={!message.trim() || status === "loading"}>{status === "loading" ? "Memeriksa data…" : "Tanya AGUS"}</button>
      </form>
      {status === "error" ? <p className="subtle-error" role="alert">{error ?? "AGUS tidak tersedia. Kontrol peta tetap dapat digunakan."}</p> : null}
      {response ? <div className={response.status === "limitation" ? "agus-response agus-response--limitation" : "agus-response"} aria-live="polite"><p>{response.assistant_text}</p>{response.map_action ? <button type="button" className="agus-map-action" onClick={onApplyAction}>Tampilkan di peta</button> : null}</div> : null}
      {actionError ? <p className="subtle-error" role="alert">{actionError}</p> : null}
    </section>
  );
}
