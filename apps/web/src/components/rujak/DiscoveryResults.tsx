"use client";

import type { MerchantResult } from "@/lib/client/rujak-types";

type Props = {
  status: "idle" | "loading" | "success" | "error";
  results: MerchantResult[];
  selectedMerchantId: string | null;
  error: string | null;
  onSelect: (merchantId: string) => void;
  onRetry: () => void;
};

function formatDistance(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

function formatMinutes(value: number) {
  return `${Math.max(1, Math.round(value))} min jalan kaki`;
}

export default function DiscoveryResults({ status, results, selectedMerchantId, error, onSelect, onRetry }: Props) {
  return (
    <section className="panel results-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Kuliner terjangkau</div>
          <h2>Hasil penemuan</h2>
        </div>
        {status === "success" ? <span className="count-badge">{results.length}</span> : null}
      </div>
      {status === "idle" ? <p className="empty-copy">Pilih transit untuk memulai pencarian kuliner.</p> : null}
      {status === "loading" ? <p className="loading-copy">Memuat kuliner dan jarak berjalan…</p> : null}
      {status === "error" ? (
        <div className="state-error" role="alert">
          <p>{error ?? "Hasil penemuan tidak dapat dimuat."}</p>
          <button type="button" onClick={onRetry}>Coba lagi</button>
        </div>
      ) : null}
      {status === "success" && results.length === 0 ? <p className="empty-copy">Tidak ada kuliner yang cocok untuk kriteria ini.</p> : null}
      {status === "success" && results.length > 0 ? (
        <div className="result-list">
          {results.map((merchant) => (
            <button
              key={merchant.merchant_id}
              id={`merchant-card-${merchant.merchant_id}`}
              type="button"
              className={merchant.merchant_id === selectedMerchantId ? "merchant-card is-selected" : "merchant-card"}
              onClick={() => onSelect(merchant.merchant_id)}
            >
              <span className="merchant-card__title">{merchant.merchant_name}</span>
              {merchant.category_l2 ? <span className="merchant-card__category">{merchant.category_l2}</span> : null}
              {merchant.address ? <span className="merchant-card__address">{merchant.address}</span> : null}
              <span className="merchant-card__metrics">{formatDistance(merchant.walking_distance_m)} · {formatMinutes(merchant.walking_time_min)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
