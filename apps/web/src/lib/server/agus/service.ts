import "server-only";

import { normalizeCategory } from "@/lib/server/api-contract";
import { validateDiscoveryAction, type AgusIntent, type AgusRequest, type AgusResponse } from "@/lib/server/agus/contracts";
import { createAgusInterpreter } from "@/lib/server/agus/gemini-provider";
import type { AgusInterpreter } from "@/lib/server/agus/provider";
import { requireCompleteDiscoveryAccess, requireRoutableStop } from "@/lib/server/route-helpers";
import { discoverMerchants, getStopDetail, listCategoryL2, runtimeConfig, type DiscoveryRow } from "@/lib/server/rujak-db";

export type AgusServiceResult = { response: AgusResponse; observability: Record<string, string | number | null> };

function limitation(intent: AgusResponse["intent"], reason: string, assistantText: string): AgusServiceResult {
  return { response: { status: "limitation", assistant_text: assistantText, intent, reason, result: null, map_action: null }, observability: { intent, validationFailureCategory: reason } };
}

function deterministicUnsupported(message: string): AgusServiceResult | null {
  const normalized = message.toLocaleLowerCase("id-ID");
  const rules: Array<[RegExp, string, string]> = [
    [/\b(harga|berapa rupiah|biaya)\b/u, "UNSUPPORTED_PRICE", "Data harga tidak tersedia pada data kuliner P0 RUJAK."],
    [/\b(rating(?:nya)?|ulasan|bintang)\b/u, "UNSUPPORTED_RATING", "Data rating atau ulasan tidak tersedia pada data kuliner P0 RUJAK."],
    [/\b(?:buka\s+(?:24\s+jam|sekarang)|24\s+jam|jam\s+(?:buka|operasional(?:nya)?)|buka\s+jam|tutup\s+jam|masih\s+buka|operasional(?:nya)?)\b/u, "UNSUPPORTED_OPENING_HOURS", "Data jam buka tidak tersedia pada dataset kuliner P0 RUJAK."],
    [/\b(terbaik|paling bagus|rekomendasi terbaik|best)\b/u, "UNSUPPORTED_RANKING", "RUJAK tidak membuat peringkat atau rekomendasi kuliner terbaik."],
    [/\b(live transit|bus real.?time|kedatangan bus|posisi bus)\b/u, "UNSUPPORTED_LIVE_TRANSIT", "Data transit langsung tidak tersedia pada P0 RUJAK."],
    [/\b(petunjuk arah|turn by turn|navigasi penuh|rute lengkap)\b/u, "UNSUPPORTED_NAVIGATION", "RUJAK P0 tidak menyediakan navigasi atau rute lengkap."],
  ];
  const match = rules.find(([pattern]) => pattern.test(normalized));
  return match ? limitation("unsupported", match[1], match[2]) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function canonicalCategoryMention(message: string, categories: string[]): string | null {
  const normalizedMessage = message.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("id-ID");
  const matches = categories
    .map((category) => normalizeCategory(category))
    .filter((category) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(category)}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedMessage));
  return matches.length === 1 ? matches[0] : null;
}

function minutesFor(request: AgusRequest, interpretedMinutes: 5 | 10 | undefined): 5 | 10 {
  return interpretedMinutes ?? request.context.selectedMinutes ?? 5;
}

function discoveryAction(stopId: string, minutes: 5 | 10, category: string | null, rows: DiscoveryRow[], highlight: string | null) {
  return validateDiscoveryAction({
    type: "discovery_result",
    stop_id: stopId,
    minutes,
    category_l2: category,
    merchant_ids: rows.map((row) => row.merchant_id),
    highlight_merchant_id: highlight,
    show_isochrone: true,
    fit_bounds: true,
  });
}

function foodText(rows: DiscoveryRow[], minutes: 5 | 10, category: string | null): string {
  const categoryPhrase = category ? ` kategori ${category}` : "";
  return rows.length
    ? `Ditemukan ${rows.length} kuliner${categoryPhrase} yang dapat dijangkau dalam ${minutes} menit berdasarkan data jaringan jalan kaki RUJAK.`
    : `Tidak ada kuliner${categoryPhrase} yang cocok dalam ${minutes} menit pada data RUJAK saat ini.`;
}

function metric(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

function approvedAccessText(stopName: string, quality: NonNullable<NonNullable<Awaited<ReturnType<typeof getStopDetail>>>["access_quality"]>): string {
  const values = [quality.shelter, quality.seating, quality.pedestrian_condition, quality.cleanliness, quality.traffic_condition]
    .filter((value): value is string => Boolean(value));
  const fields = values.length ? ` Catatan yang disetujui: ${values.join("; ")}.` : " Tidak ada atribut terstruktur tambahan yang disetujui.";
  return `Informasi akses transit untuk ${stopName} berasal dari bukti survei yang telah ditinjau manusia.${fields} Kondisi ini menggambarkan titik transit dan akses lokal di sekitarnya, bukan keseluruhan rute menuju merchant.`;
}

export async function answerAgus(request: AgusRequest, interpreter?: AgusInterpreter): Promise<AgusServiceResult> {
  const deterministic = deterministicUnsupported(request.message);
  if (deterministic) return deterministic;
  if (!request.context.selectedStopId) {
    return limitation(null, "STOP_CONTEXT_REQUIRED", "Pilih titik transit terlebih dahulu agar AGUS dapat memakai data RUJAK yang sesuai.");
  }
  await requireRoutableStop(request.context.selectedStopId);
  await requireCompleteDiscoveryAccess(request.context.selectedStopId);
  const categories = await listCategoryL2();
  const activeInterpreter = interpreter ?? createAgusInterpreter();
  const interpreted = await activeInterpreter.interpret({
    message: request.message,
    selectedStopId: request.context.selectedStopId,
    selectedMinutes: request.context.selectedMinutes ?? 5,
    categories,
  });
  const mentionedCategory = canonicalCategoryMention(request.message, categories);
  const interpretation = mentionedCategory && (interpreted.interpretation === "reachable_food" || interpreted.interpretation === "filter_food_category")
    ? { ...interpreted, interpretation: "filter_food_category" as const, categoryL2: mentionedCategory }
    : interpreted;
  if (interpretation.interpretation === "unsupported") {
    return limitation("unsupported", "UNSUPPORTED_REQUEST", "Permintaan tersebut belum didukung oleh RUJAK P0.");
  }
  if (interpretation.interpretation === "unrelated") {
    return limitation("unrelated", "UNRELATED_REQUEST", "AGUS hanya membantu pencarian kuliner P0 dan informasi akses transit yang telah ditinjau.");
  }

  const minutes = minutesFor(request, interpretation.minutes);
  const baseLog = { intent: interpretation.interpretation, stopId: request.context.selectedStopId, minutes };
  if (interpretation.interpretation === "stop_access_info") {
    const detail = await getStopDetail(request.context.selectedStopId);
    if (!detail || detail.access_quality?.review_status !== "approved") {
      return { ...limitation("stop_access_info", "STOP_ACCESS_REVIEW_UNAVAILABLE", "Informasi akses halte yang telah ditinjau belum tersedia untuk titik transit ini."), observability: { ...baseLog, validationFailureCategory: "STOP_ACCESS_REVIEW_UNAVAILABLE" } };
    }
    return {
      response: {
        status: "ok",
        assistant_text: approvedAccessText(detail.stop_name, detail.access_quality),
        intent: "stop_access_info",
        reason: null,
        result: { stop_id: detail.stop_id, review_status: "approved", analysis_version: runtimeConfig().analysisVersion },
        map_action: null,
      },
      observability: baseLog,
    };
  }

  let category: string | null = null;
  if (interpretation.interpretation === "filter_food_category") {
    if (!interpretation.categoryL2) {
      return { ...limitation("filter_food_category", "UNKNOWN_CATEGORY", "Kategori kuliner tersebut tidak tersedia pada data P0 RUJAK."), observability: { ...baseLog, validationFailureCategory: "UNKNOWN_CATEGORY" } };
    }
    category = normalizeCategory(interpretation.categoryL2);
    if (!categories.some((candidate) => normalizeCategory(candidate) === category)) {
      return { ...limitation("filter_food_category", "UNKNOWN_CATEGORY", "Kategori kuliner tersebut tidak tersedia pada data P0 RUJAK."), observability: { ...baseLog, category, validationFailureCategory: "UNKNOWN_CATEGORY" } };
    }
  }
  const rows = await discoverMerchants(request.context.selectedStopId, minutes, category);
  const nearest = interpretation.interpretation === "nearest_food" ? rows[0] ?? null : null;
  const assistantText = nearest
    ? `${nearest.merchant_name} adalah kuliner terdekat pada hasil RUJAK saat ini: ${metric(nearest.walking_distance_m)} dan sekitar ${Math.max(1, Math.round(nearest.walking_time_min))} menit jalan kaki.`
    : foodText(rows, minutes, category);
  const action = discoveryAction(request.context.selectedStopId, minutes, category, rows, nearest?.merchant_id ?? null);
  return {
    response: {
      status: "ok",
      assistant_text: assistantText,
      intent: interpretation.interpretation as AgusIntent,
      reason: null,
      result: {
        stop_id: request.context.selectedStopId,
        minutes,
        category_l2: category,
        merchant_ids: rows.map((row) => row.merchant_id),
        result_count: rows.length,
        analysis_version: runtimeConfig().analysisVersion,
      },
      map_action: action,
    },
    observability: { ...baseLog, category, resultCount: rows.length },
  };
}
