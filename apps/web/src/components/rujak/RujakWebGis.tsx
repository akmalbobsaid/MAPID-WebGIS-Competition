"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useReducer, useRef } from "react";
import AgusPanel from "@/components/rujak/AgusPanel";
import DiscoveryControls from "@/components/rujak/DiscoveryControls";
import DiscoveryResults from "@/components/rujak/DiscoveryResults";
import MerchantDetail from "@/components/rujak/MerchantDetail";
import TransitEvidence from "@/components/rujak/TransitEvidence";
import { askAgus, discover, getIsochrone, getMerchant, getStop, getStops, RujakApiError } from "@/lib/client/rujak-api";
import { validateAgusActionStageOne, validateAgusActionStageTwo } from "@/lib/client/agus-map-action";
import type { AgusResponse, DiscoveryResponse, DiscoveryResultAction, Isochrone, MerchantDetail as MerchantDetailType, MerchantResult, StopDetail, StopSummary } from "@/lib/client/rujak-types";

const RujakMap = dynamic(() => import("@/components/rujak/RujakMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Menyiapkan peta RUJAK…</div>,
});

type Status = "idle" | "loading" | "success" | "error";
type Resource<T> = { status: Status; data: T | null; error: string | null };
type State = {
  stops: Resource<StopSummary[]>;
  selectedStopId: string | null;
  minutes: 5 | 10;
  categoryL2: string | null;
  stop: Resource<StopDetail>;
  isochrone: Resource<Isochrone>;
  discovery: Resource<DiscoveryResponse>;
  unfiltered: DiscoveryResponse | null;
  selectedMerchantId: string | null;
  merchant: Resource<MerchantDetailType>;
  agus: Resource<AgusResponse>;
  pendingAgusAction: DiscoveryResultAction | null;
  agusActionError: string | null;
  actionFitRevision: number;
  viewportRevision: number;
  retryVersion: number;
  stopsRetryVersion: number;
};

export const AGUS_ACTION_TIMEOUT_MS = 15_000;

const idle = <T,>(): Resource<T> => ({ status: "idle", data: null, error: null });
export const initialState: State = {
  stops: idle<StopSummary[]>(), selectedStopId: null, minutes: 5, categoryL2: null,
  stop: idle<StopDetail>(), isochrone: idle<Isochrone>(), discovery: idle<DiscoveryResponse>(),
  unfiltered: null, selectedMerchantId: null, merchant: idle<MerchantDetailType>(), agus: idle<AgusResponse>(), pendingAgusAction: null, agusActionError: null, actionFitRevision: 0, viewportRevision: 0, retryVersion: 0, stopsRetryVersion: 0,
};

type Action =
  | { type: "STOPS"; resource: Resource<StopSummary[]> }
  | { type: "SELECT_STOP"; stopId: string }
  | { type: "SET_MINUTES"; minutes: 5 | 10 }
  | { type: "SET_CATEGORY"; category: string | null }
  | { type: "REQUEST_START" }
  | { type: "STOP"; resource: Resource<StopDetail> }
  | { type: "ISOCHRONE"; resource: Resource<Isochrone> }
  | { type: "DISCOVERY"; resource: Resource<DiscoveryResponse>; unfiltered?: DiscoveryResponse | null }
  | { type: "SELECT_MERCHANT"; merchantId: string }
  | { type: "MERCHANT"; resource: Resource<MerchantDetailType> }
  | { type: "AGUS"; resource: Resource<AgusResponse> }
  | { type: "APPLY_AGUS_ACTION"; action: DiscoveryResultAction }
  | { type: "AGUS_ACTION_COMMIT"; action: DiscoveryResultAction }
  | { type: "AGUS_ACTION_ERROR"; error: string }
  | { type: "AGUS_ACTION_TIMEOUT"; action: DiscoveryResultAction }
  | { type: "RETRY" }
  | { type: "RETRY_STOPS" }
  | { type: "RESET" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "STOPS": return { ...state, stops: action.resource };
    case "SELECT_STOP": return { ...state, selectedStopId: action.stopId, categoryL2: null, selectedMerchantId: null, merchant: idle(), stop: idle(), isochrone: idle(), discovery: idle(), unfiltered: null, pendingAgusAction: null, agusActionError: null, viewportRevision: state.viewportRevision + 1 };
    case "SET_MINUTES": return { ...state, minutes: action.minutes, categoryL2: null, selectedMerchantId: null, merchant: idle(), isochrone: idle(), discovery: idle(), unfiltered: null, viewportRevision: state.viewportRevision + 1 };
    case "SET_CATEGORY": return { ...state, categoryL2: action.category, selectedMerchantId: null, merchant: idle(), discovery: idle() };
    case "REQUEST_START": return { ...state, stop: { status: "loading", data: null, error: null }, isochrone: { status: "loading", data: null, error: null }, discovery: { status: "loading", data: null, error: null }, unfiltered: null };
    case "STOP": return { ...state, stop: action.resource };
    case "ISOCHRONE": return { ...state, isochrone: action.resource };
    case "DISCOVERY": return { ...state, discovery: action.resource, ...(action.unfiltered !== undefined ? { unfiltered: action.unfiltered } : {}) };
    case "SELECT_MERCHANT": return { ...state, selectedMerchantId: action.merchantId, merchant: { status: "loading", data: null, error: null }, viewportRevision: state.viewportRevision + 1 };
    case "MERCHANT": return { ...state, merchant: action.resource };
    case "AGUS": return { ...state, agus: action.resource, agusActionError: null };
    case "APPLY_AGUS_ACTION": return { ...state, selectedStopId: action.action.stop_id, minutes: action.action.minutes, categoryL2: action.action.category_l2, selectedMerchantId: null, merchant: idle(), stop: idle(), isochrone: idle(), discovery: idle(), unfiltered: null, pendingAgusAction: action.action, agusActionError: null, viewportRevision: state.viewportRevision + 1, retryVersion: state.retryVersion + 1 };
    case "AGUS_ACTION_COMMIT": return { ...state, pendingAgusAction: null, selectedMerchantId: action.action.highlight_merchant_id, merchant: action.action.highlight_merchant_id ? { status: "loading", data: null, error: null } : idle(), agusActionError: null, actionFitRevision: state.actionFitRevision + 1, viewportRevision: state.viewportRevision + 1 };
    case "AGUS_ACTION_ERROR": return { ...state, pendingAgusAction: null, agusActionError: action.error };
    case "AGUS_ACTION_TIMEOUT": {
      if (state.pendingAgusAction !== action.action) return state;
      return {
        ...state,
        pendingAgusAction: null,
        agusActionError: "Aksi AGUS terlalu lama menunggu hasil penemuan terbaru. Silakan coba lagi.",
        discovery: state.discovery.status === "loading"
          ? { status: "error", data: null, error: "Hasil penemuan terlalu lama dimuat. Silakan coba lagi." }
          : state.discovery,
      };
    }
    case "RETRY": return { ...state, viewportRevision: state.viewportRevision + 1, retryVersion: state.retryVersion + 1 };
    case "RETRY_STOPS": return { ...state, stopsRetryVersion: state.stopsRetryVersion + 1 };
    case "RESET": return { ...initialState, stops: state.stops, viewportRevision: state.viewportRevision + 1 };
  }
}

function message(error: unknown): string {
  if (error instanceof RujakApiError) return error.message;
  return "Koneksi ke layanan RUJAK terganggu. Silakan coba lagi.";
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function RujakWebGis() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const criteriaRevision = useRef(0);
  const selectedResult = state.discovery.data?.results.find((merchant) => merchant.merchant_id === state.selectedMerchantId) ?? null;
  const categories = useMemo(() => Array.from(new Set((state.unfiltered?.results ?? []).flatMap((merchant) => merchant.category_l2 ? [merchant.category_l2] : []))).sort((left, right) => left.localeCompare(right, "id")), [state.unfiltered]);
  const focus = selectedResult?.geometry.coordinates ?? state.stop.data?.geometry.coordinates;

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: "STOPS", resource: { status: "loading", data: null, error: null } });
    getStops(controller.signal)
      .then((stops) => dispatch({ type: "STOPS", resource: { status: "success", data: stops, error: null } }))
      .catch((error) => { if (!isAbort(error)) dispatch({ type: "STOPS", resource: { status: "error", data: null, error: message(error) } }); });
    return () => controller.abort();
  }, [state.stopsRetryVersion]);

  const { selectedStopId, minutes, categoryL2, retryVersion } = state;

  useEffect(() => {
    if (!selectedStopId) return;
    const controller = new AbortController();
    const revision = ++criteriaRevision.current;
    const current = () => revision === criteriaRevision.current;
    dispatch({ type: "REQUEST_START" });
    getStop(selectedStopId, controller.signal)
      .then((stop) => { if (current()) dispatch({ type: "STOP", resource: { status: "success", data: stop, error: null } }); })
      .catch((error) => { if (current() && !isAbort(error)) dispatch({ type: "STOP", resource: { status: "error", data: null, error: message(error) } }); });
    getIsochrone(selectedStopId, minutes, controller.signal)
      .then((isochrone) => { if (current()) dispatch({ type: "ISOCHRONE", resource: { status: "success", data: isochrone, error: null } }); })
      .catch((error) => { if (current() && !isAbort(error)) dispatch({ type: "ISOCHRONE", resource: { status: "error", data: null, error: message(error) } }); });
    const unfiltered = discover(selectedStopId, minutes, null, controller.signal);
    const visible = categoryL2 ? discover(selectedStopId, minutes, categoryL2, controller.signal) : unfiltered;
    Promise.all([unfiltered, visible])
      .then(([unfilteredResponse, response]) => {
        if (current()) dispatch({ type: "DISCOVERY", resource: { status: "success", data: response, error: null }, unfiltered: unfilteredResponse });
      })
      .catch((error) => { if (current() && !isAbort(error)) dispatch({ type: "DISCOVERY", resource: { status: "error", data: null, error: message(error) }, unfiltered: null }); });
    return () => controller.abort();
  }, [selectedStopId, minutes, categoryL2, retryVersion]);

  useEffect(() => {
    const action = state.pendingAgusAction;
    if (!action) return;
    if (state.discovery.status === "error") {
      dispatch({ type: "AGUS_ACTION_ERROR", error: "Aksi AGUS tidak dapat diterapkan karena hasil penemuan terbaru tidak tersedia." });
      return;
    }
    if (state.discovery.status !== "success" || !state.discovery.data) return;
    if (!validateAgusActionStageTwo(action, state.discovery.data)) {
      dispatch({ type: "AGUS_ACTION_ERROR", error: "Aksi AGUS sudah tidak sesuai dengan hasil data terbaru, sehingga peta tidak diubah." });
      return;
    }
    dispatch({ type: "AGUS_ACTION_COMMIT", action });
  }, [state.pendingAgusAction, state.discovery]);

  useEffect(() => {
    const action = state.pendingAgusAction;
    if (!action) return;
    const timeout = setTimeout(() => dispatch({ type: "AGUS_ACTION_TIMEOUT", action }), AGUS_ACTION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [state.pendingAgusAction]);

  useEffect(() => {
    if (!state.selectedMerchantId) return;
    const controller = new AbortController();
    const merchantId = state.selectedMerchantId;
    getMerchant(merchantId, controller.signal)
      .then((merchant) => { if (merchantId === state.selectedMerchantId) dispatch({ type: "MERCHANT", resource: { status: "success", data: merchant, error: null } }); })
      .catch((error) => { if (!isAbort(error) && merchantId === state.selectedMerchantId) dispatch({ type: "MERCHANT", resource: { status: "error", data: null, error: message(error) } }); });
    return () => controller.abort();
  }, [state.selectedMerchantId]);

  const retry = () => {
    dispatch({ type: "RETRY" });
  };
  const stops = state.stops.data ?? [];
  const merchants: MerchantResult[] = state.discovery.data?.results ?? [];
  const busy = state.discovery.status === "loading";
  const selectedStopName = stops.find((stop) => stop.stop_id === state.selectedStopId)?.stop_name ?? null;
  const submitAgus = (question: string) => {
    const controller = new AbortController();
    dispatch({ type: "AGUS", resource: { status: "loading", data: null, error: null } });
    askAgus(question, state.selectedStopId, state.minutes, controller.signal)
      .then((response) => dispatch({ type: "AGUS", resource: { status: "success", data: response, error: null } }))
      .catch((error) => { if (!isAbort(error)) dispatch({ type: "AGUS", resource: { status: "error", data: null, error: message(error) } }); });
  };
  const applyAgusAction = () => {
    const action = state.agus.data?.map_action ? validateAgusActionStageOne(state.agus.data.map_action, stops) : null;
    if (!action) {
      dispatch({ type: "AGUS_ACTION_ERROR", error: "Aksi peta AGUS tidak valid dan tidak diterapkan." });
      return;
    }
    dispatch({ type: "APPLY_AGUS_ACTION", action });
  };

  return (
    <main className="rujak-shell">
      <header className="app-header">
        <div><p className="brand-kicker">RUJAK · MAPID WebGIS Competition 2026</p><h1>Transit ke kuliner, berdasarkan jangkauan jalan kaki.</h1></div>
        <p>Temukan pilihan kuliner dari titik transit dengan data jangkauan jaringan yang telah dianalisis.</p>
      </header>
      <div className="webgis-layout">
        <aside className="sidebar">
          {state.stops.status === "error" ? <div className="panel state-error" role="alert"><p>{state.stops.error}</p><button type="button" onClick={() => dispatch({ type: "RETRY_STOPS" })}>Coba lagi</button></div> : null}
          <DiscoveryControls stops={stops} selectedStopId={state.selectedStopId} minutes={state.minutes} categoryL2={state.categoryL2} categories={categories} busy={busy} onStopChange={(stopId) => dispatch({ type: "SELECT_STOP", stopId })} onMinutesChange={(minutes) => dispatch({ type: "SET_MINUTES", minutes })} onCategoryChange={(category) => dispatch({ type: "SET_CATEGORY", category })} onReset={() => dispatch({ type: "RESET" })} />
          <AgusPanel selectedStopName={selectedStopName} minutes={state.minutes} status={state.agus.status} response={state.agus.data} error={state.agus.error} actionError={state.agusActionError} onSubmit={submitAgus} onApplyAction={applyAgusAction} />
          <DiscoveryResults status={state.discovery.status} results={merchants} selectedMerchantId={state.selectedMerchantId} error={state.discovery.error} onSelect={(merchantId) => dispatch({ type: "SELECT_MERCHANT", merchantId })} onRetry={retry} />
          <MerchantDetail result={selectedResult} detail={state.merchant.data} status={state.merchant.status} error={state.merchant.error} />
          <TransitEvidence stop={state.stop.data} status={state.stop.status} error={state.stop.error} />
        </aside>
        <section className="map-column">
          <RujakMap stops={stops} selectedStopId={state.selectedStopId} isochrone={state.isochrone.data} merchants={merchants} selectedMerchantId={state.selectedMerchantId} onStopSelect={(stopId) => dispatch({ type: "SELECT_STOP", stopId })} onMerchantSelect={(merchantId) => dispatch({ type: "SELECT_MERCHANT", merchantId })} focus={focus} viewportRevision={state.viewportRevision} fitResultsRevision={state.actionFitRevision} />
          {state.isochrone.status === "loading" ? <div className="map-status">Memuat jangkauan jaringan {state.minutes} menit…</div> : null}
          {state.isochrone.status === "error" ? <div className="map-status map-status--error" role="alert">{state.isochrone.error}</div> : null}
        </section>
      </div>
    </main>
  );
}
