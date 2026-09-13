"use client";

import type { MerchantDetail as MerchantDetailType, MerchantResult } from "@/lib/client/rujak-types";

type Props = {
  result: MerchantResult | null;
  detail: MerchantDetailType | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
};

export default function MerchantDetail({ result, detail, status, error }: Props) {
  if (!result) return null;
  return (
    <section className="panel detail-panel" aria-live="polite">
      <div className="eyebrow">Pilihan di peta</div>
      <h2>{result.merchant_name}</h2>
      {result.category_l2 ? <p className="detail-category">{result.category_l2}</p> : null}
      {result.address ? <p className="detail-address">{result.address}</p> : null}
      <div className="detail-metrics">
        <div><span>Jarak jalan</span><strong>{result.walking_distance_m >= 1000 ? `${(result.walking_distance_m / 1000).toFixed(1)} km` : `${Math.round(result.walking_distance_m)} m`}</strong></div>
        <div><span>Estimasi</span><strong>{Math.max(1, Math.round(result.walking_time_min))} menit</strong></div>
      </div>
      {status === "loading" ? <p className="loading-copy">Memuat detail lokasi…</p> : null}
      {status === "error" ? <p className="subtle-error">{error ?? "Detail tambahan tidak tersedia."}</p> : null}
      {status === "success" && detail?.phone ? <p className="detail-phone">Telepon: {detail.phone}</p> : null}
    </section>
  );
}
