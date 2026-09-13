"use client";
/* eslint-disable @next/next/no-img-element */

import type { StopDetail } from "@/lib/client/rujak-types";

function mediaUrls(media: unknown): string[] {
  if (!Array.isArray(media)) return [];
  return media.filter((value): value is string => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  });
}

type Props = { stop: StopDetail | null; status: "idle" | "loading" | "success" | "error"; error: string | null };

export default function TransitEvidence({ stop, status, error }: Props) {
  if (status === "idle" || !stop) return null;
  if (status === "loading") return <section className="panel evidence-panel"><p className="loading-copy">Memuat bukti survei halte…</p></section>;
  if (status === "error") return <section className="panel evidence-panel"><p className="subtle-error">{error ?? "Bukti survei tidak tersedia."}</p></section>;
  const approved = stop.access_quality?.review_status === "approved" ? stop.access_quality : null;
  return (
    <section className="panel evidence-panel">
      <div className="eyebrow">Bukti titik transit</div>
      <h2>{stop.stop_name}</h2>
      <p className="evidence-disclaimer">Catatan ini menggambarkan titik transit yang disurvei dan kondisi akses di sekitarnya, bukan keseluruhan rute menuju merchant.</p>
      {stop.description_raw ? <p className="evidence-text">{stop.description_raw}</p> : <p className="empty-copy">Tidak ada narasi survei untuk titik ini.</p>}
      {approved ? (
        <div className="quality-tags">
          {[approved.shelter, approved.seating, approved.pedestrian_condition, approved.cleanliness, approved.traffic_condition]
            .filter((value): value is string => Boolean(value))
            .map((value) => <span key={value}>{value}</span>)}
        </div>
      ) : null}
      {mediaUrls(stop.media).length ? (
        <div className="media-strip">
          {mediaUrls(stop.media).map((url) => <img key={url} src={url} alt={`Dokumentasi survei ${stop.stop_name}`} onError={(event) => { event.currentTarget.hidden = true; }} />)}
        </div>
      ) : null}
    </section>
  );
}
