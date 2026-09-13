"use client";

import type { StopSummary } from "@/lib/client/rujak-types";

type Props = {
  stops: StopSummary[];
  selectedStopId: string | null;
  minutes: 5 | 10;
  categoryL2: string | null;
  categories: string[];
  busy: boolean;
  onStopChange: (stopId: string) => void;
  onMinutesChange: (minutes: 5 | 10) => void;
  onCategoryChange: (category: string | null) => void;
  onReset: () => void;
};

export default function DiscoveryControls({
  stops,
  selectedStopId,
  minutes,
  categoryL2,
  categories,
  busy,
  onStopChange,
  onMinutesChange,
  onCategoryChange,
  onReset,
}: Props) {
  return (
    <section className="panel controls-panel" aria-label="Kontrol penemuan kuliner">
      <div className="eyebrow">Mulai dari transit</div>
      <label className="field-label" htmlFor="stop-select">Titik transit</label>
      <select
        id="stop-select"
        className="field-select"
        value={selectedStopId ?? ""}
        onChange={(event) => event.target.value && onStopChange(event.target.value)}
        disabled={busy || stops.length === 0}
      >
        <option value="">Pilih halte di peta atau daftar</option>
        {stops.map((stop) => <option key={stop.stop_id} value={stop.stop_id}>{stop.stop_name}</option>)}
      </select>

      <div className="field-label">Waktu berjalan</div>
      <div className="segmented" role="group" aria-label="Batas waktu berjalan">
        {[5, 10].map((value) => (
          <button
            key={value}
            type="button"
            className={minutes === value ? "segment is-active" : "segment"}
            onClick={() => onMinutesChange(value as 5 | 10)}
            disabled={!selectedStopId || busy}
          >
            {value} min
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="category-select">Kategori kuliner</label>
      <select
        id="category-select"
        className="field-select"
        value={categoryL2 ?? ""}
        onChange={(event) => onCategoryChange(event.target.value || null)}
        disabled={!selectedStopId || busy || categories.length === 0}
      >
        <option value="">Semua kategori</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      {!selectedStopId ? <p className="hint">Pilih titik transit untuk melihat kuliner yang dapat dicapai.</p> : null}
      {selectedStopId && categories.length === 0 && !busy ? <p className="hint">Kategori tersedia setelah hasil ditemukan.</p> : null}

      <button type="button" className="reset-button" onClick={onReset} disabled={!selectedStopId && !categoryL2}>
        Atur ulang pencarian
      </button>
    </section>
  );
}
