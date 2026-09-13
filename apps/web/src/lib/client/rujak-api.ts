import type { DiscoveryResponse, Isochrone, MerchantDetail, StopDetail, StopSummary } from "@/lib/client/rujak-types";

export class RujakApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

type ApiErrorPayload = { error?: { code?: unknown; message?: unknown; request_id?: unknown } };

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { accept: "application/json", ...init.headers } });
  const body = await response.json().catch(() => null) as ApiErrorPayload | T | null;
  if (!response.ok) {
    const error = body as ApiErrorPayload | null;
    throw new RujakApiError(
      response.status,
      typeof error?.error?.code === "string" ? error.error.code : "NETWORK_ERROR",
      typeof error?.error?.message === "string" ? error.error.message : "The request could not be completed.",
      typeof error?.error?.request_id === "string" ? error.error.request_id : undefined,
    );
  }
  return body as T;
}

export async function getStops(signal?: AbortSignal): Promise<StopSummary[]> {
  const payload = await requestJson<{ stops: StopSummary[] }>("/api/stops", { signal });
  return payload.stops;
}

export async function getStop(stopId: string, signal?: AbortSignal): Promise<StopDetail> {
  const payload = await requestJson<{ stop: StopDetail }>(`/api/stops/${encodeURIComponent(stopId)}`, { signal });
  return payload.stop;
}

export async function getIsochrone(stopId: string, minutes: 5 | 10, signal?: AbortSignal): Promise<Isochrone> {
  return requestJson<Isochrone>(`/api/stops/${encodeURIComponent(stopId)}/isochrones?minutes=${minutes}`, { signal });
}

export async function discover(stopId: string, minutes: 5 | 10, category: string | null, signal?: AbortSignal): Promise<DiscoveryResponse> {
  return requestJson<DiscoveryResponse>("/api/discovery", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stop_id: stopId, max_walk_time: minutes, category }),
  });
}

export async function getMerchant(merchantId: string, signal?: AbortSignal): Promise<MerchantDetail> {
  const payload = await requestJson<{ merchant: MerchantDetail }>(`/api/merchants/${encodeURIComponent(merchantId)}`, { signal });
  return payload.merchant;
}
