"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, Tooltip, useMap } from "react-leaflet";
import { divIcon, type LatLngBoundsExpression, type Map as LeafletMap } from "leaflet";
import { geoJsonPointToLeafletLatLng, geographicBoundsToLeafletLatLngBounds } from "@/lib/client/geojson-coordinates";
import type { Isochrone, MerchantResult, Position, StopSummary } from "@/lib/client/rujak-types";

const studyAreaBounds: LatLngBoundsExpression = geographicBoundsToLeafletLatLngBounds({
  west: 112.72841800864781,
  east: 112.75938099634507,
  south: -7.275481894144229,
  north: -7.248349086279674,
});

function mapPosition(coordinates: Position): [number, number] {
  return geoJsonPointToLeafletLatLng(coordinates);
}

function markerIcon(kind: "stop" | "merchant", selected: boolean) {
  return divIcon({
    className: "rujak-marker-shell",
    html: `<span class="rujak-marker rujak-marker--${kind}${selected ? " is-selected" : ""}" aria-hidden="true"></span>`,
    iconSize: selected ? [26, 26] : [20, 20],
    iconAnchor: selected ? [13, 13] : [10, 10],
  });
}

function ViewportController({ focus, revision }: { focus?: Position; revision: number }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo(geoJsonPointToLeafletLatLng(focus), Math.max(map.getZoom(), 16), { duration: 0.45 });
  }, [focus, map, revision]);
  return null;
}

function DiscoveryFitController({ stops, selectedStopId, merchants, revision }: { stops: StopSummary[]; selectedStopId: string | null; merchants: MerchantResult[]; revision: number }) {
  const map = useMap();
  useEffect(() => {
    if (revision === 0 || !selectedStopId) return;
    const stop = stops.find((candidate) => candidate.stop_id === selectedStopId);
    const positions = [
      ...(stop ? [mapPosition(stop.geometry.coordinates)] : []),
      ...merchants.map((merchant) => mapPosition(merchant.geometry.coordinates)),
    ];
    if (positions.length > 1) map.fitBounds(positions, { padding: [36, 36], maxZoom: 16 });
  }, [map, merchants, revision, selectedStopId, stops]);
  return null;
}

type MaplibreMapEvent = "load" | "error";

type ManagedMaplibreMap = {
  resize: () => void;
  isStyleLoaded?: () => boolean | void;
  on?: (event: MaplibreMapEvent, listener: () => void) => void;
  off?: (event: MaplibreMapEvent, listener: () => void) => void;
};

type ManagedLeafletLayer = {
  addTo: (map: LeafletMap) => unknown;
  remove: () => void;
  getMaplibreMap?: () => ManagedMaplibreMap;
};

function MapResizeController({ maplibreLayer }: { maplibreLayer: MutableRefObject<ManagedLeafletLayer | null> }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let animationFrame: number | null = null;
    const synchronizeSize = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        map.invalidateSize({ animate: false, pan: false });
        maplibreLayer.current?.getMaplibreMap?.().resize();
      });
    };

    const observer = new ResizeObserver(synchronizeSize);
    observer.observe(container);
    synchronizeSize();

    return () => {
      observer.disconnect();
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, [map, maplibreLayer]);

  return null;
}

function MapidVectorBasemap({ apiKey, onLayerChange, onStatusChange }: { apiKey: string | undefined; onLayerChange: (layer: ManagedLeafletLayer | null) => void; onStatusChange: (status: "unavailable" | "loading" | "ready" | "error") => void }) {
  const map = useMap();

  useEffect(() => {
    if (!apiKey) {
      onStatusChange("unavailable");
      return;
    }
    let cancelled = false;
    let layer: ManagedLeafletLayer | null = null;
    let maplibreMap: ManagedMaplibreMap | undefined;
    const markReady = () => {
      if (!cancelled) onStatusChange("ready");
    };
    const markError = () => {
      if (!cancelled) onStatusChange("error");
    };

    onStatusChange("loading");

    void (async () => {
      try {
        const { setWorkerUrl } = await import("maplibre-gl");
        if (cancelled) return;

        setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

        const { maplibreGL } = await import("@maplibre/maplibre-gl-leaflet");
        if (cancelled) return;

        const createdLayer = maplibreGL({
          style: `https://basemap.mapid.io/styles/light/style.json?key=${apiKey}`,
          interactive: false,
          attributionControl: {
            customAttribution: "MAPID Maps · OpenMapTiles · © OpenStreetMap contributors",
          },
        });
        layer = createdLayer;
        createdLayer.addTo(map);
        onLayerChange(createdLayer);
        maplibreMap = createdLayer.getMaplibreMap?.();
        maplibreMap?.on?.("load", markReady);
        maplibreMap?.on?.("error", markError);
        if (maplibreMap?.isStyleLoaded?.() === true) markReady();
      } catch {
        markError();
      }
    })();

    return () => {
      cancelled = true;
      maplibreMap?.off?.("load", markReady);
      maplibreMap?.off?.("error", markError);
      onLayerChange(null);
      layer?.remove();
    };
  }, [apiKey, map, onLayerChange, onStatusChange]);

  return null;
}

type Props = {
  stops: StopSummary[];
  selectedStopId: string | null;
  isochrone: Isochrone | null;
  merchants: MerchantResult[];
  selectedMerchantId: string | null;
  onStopSelect: (stopId: string) => void;
  onMerchantSelect: (merchantId: string) => void;
  focus: Position | undefined;
  viewportRevision: number;
  fitResultsRevision: number;
};

export default function RujakMap({
  stops,
  selectedStopId,
  isochrone,
  merchants,
  selectedMerchantId,
  onStopSelect,
  onMerchantSelect,
  focus,
  viewportRevision,
  fitResultsRevision,
}: Props) {
  const mapidKey = process.env.NEXT_PUBLIC_MAPID_MAPS_API_KEY;
  const maplibreLayer = useRef<ManagedLeafletLayer | null>(null);
  const [basemapStatus, setBasemapStatus] = useState<"unavailable" | "loading" | "ready" | "error">(mapidKey ? "loading" : "unavailable");
  const setMaplibreLayer = useCallback((layer: ManagedLeafletLayer | null) => {
    maplibreLayer.current = layer;
  }, []);

  return (
    <div className="map-frame" aria-label="Peta akses kuliner RUJAK">
      <MapContainer bounds={studyAreaBounds} boundsOptions={{ padding: [28, 28] }} className="rujak-map" zoomControl>
        <MapidVectorBasemap apiKey={mapidKey} onLayerChange={setMaplibreLayer} onStatusChange={setBasemapStatus} />
        <MapResizeController maplibreLayer={maplibreLayer} />
        {isochrone ? (
          <GeoJSON
            data={isochrone.geometry as never}
            style={{ color: "#ea580c", fillColor: "#fb923c", fillOpacity: 0.18, weight: 2 }}
          />
        ) : null}
        {stops.map((stop) => (
          <Marker
            key={stop.stop_id}
            position={mapPosition(stop.geometry.coordinates)}
            icon={markerIcon("stop", stop.stop_id === selectedStopId)}
            eventHandlers={{ click: () => onStopSelect(stop.stop_id) }}
          >
            <Tooltip direction="top" offset={[0, -10]}>{stop.stop_name}</Tooltip>
          </Marker>
        ))}
        {merchants.map((merchant) => (
          <CircleMarker
            key={merchant.merchant_id}
            center={mapPosition(merchant.geometry.coordinates)}
            radius={merchant.merchant_id === selectedMerchantId ? 9 : 6}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: merchant.merchant_id === selectedMerchantId ? "#b91c1c" : "#0f766e", fillOpacity: 1 }}
            eventHandlers={{ click: () => onMerchantSelect(merchant.merchant_id) }}
          >
            <Tooltip direction="top">{merchant.merchant_name}</Tooltip>
          </CircleMarker>
        ))}
        <ViewportController focus={focus} revision={viewportRevision} />
        <DiscoveryFitController stops={stops} selectedStopId={selectedStopId} merchants={merchants} revision={fitResultsRevision} />
      </MapContainer>
      {!mapidKey ? (
        <div className="map-config-error" role="alert">
          <strong>MAPID Maps belum dapat dimuat.</strong>
          <span>Tambahkan konfigurasi MAPID yang disetujui untuk menampilkan basemap.</span>
        </div>
      ) : null}
      {basemapStatus === "loading" ? <div className="map-status" aria-live="polite">Memuat basemap MAPID…</div> : null}
      {basemapStatus === "error" ? (
        <div className="map-config-error" role="alert">
          <strong>Basemap MAPID gagal dimuat.</strong>
          <span>Data halte dan hasil akses tetap dapat digunakan. Periksa konfigurasi domain/key MAPID atau koneksi, lalu muat ulang.</span>
        </div>
      ) : null}
    </div>
  );
}
