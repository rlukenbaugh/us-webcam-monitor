"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source
} from "react-map-gl/maplibre";
import Supercluster from "supercluster";
import type { CameraListItem, StormAlertsApiResponse } from "@/components/map/types";

const CATEGORY_COLORS: Record<string, string> = {
  traffic: "#f97316",
  weather: "#2563eb",
  aviation: "#0ea5e9",
  beach: "#f59e0b",
  tourism: "#10b981",
  downtown: "#64748b",
  mountain: "#16a34a",
  park: "#65a30d",
  harbor: "#0891b2",
  ski: "#06b6d4",
  other: "#71717a"
};

const alertFillLayer: any = {
  id: "storm-alerts-fill",
  type: "fill",
  paint: {
    "fill-color": [
      "match",
      ["coalesce", ["get", "severity"], "Unknown"],
      "Extreme",
      "#7f1d1d",
      "Severe",
      "#dc2626",
      "Moderate",
      "#f97316",
      "Minor",
      "#eab308",
      "#94a3b8"
    ],
    "fill-opacity": 0.2
  }
};

const alertLineLayer: any = {
  id: "storm-alerts-line",
  type: "line",
  paint: {
    "line-color": [
      "match",
      ["coalesce", ["get", "severity"], "Unknown"],
      "Extreme",
      "#7f1d1d",
      "Severe",
      "#b91c1c",
      "Moderate",
      "#ea580c",
      "Minor",
      "#ca8a04",
      "#64748b"
    ],
    "line-width": 1.5,
    "line-opacity": 0.75
  }
};

type BoundsTuple = [number, number, number, number];

type Props = {
  mapRef: React.RefObject<any>;
  filtersStormView: boolean;
  stormAlerts: StormAlertsApiResponse | undefined;
  clusters: Array<any>;
  clusterIndex: Supercluster<CameraListItem>;
  nearCameraIds: Set<string>;
  userLocation: { lat: number; lng: number } | null;
  onMoveEnd: () => void;
};

export function MapCanvas({
  mapRef,
  filtersStormView,
  stormAlerts,
  clusters,
  clusterIndex,
  nearCameraIds,
  userLocation,
  onMoveEnd
}: Props) {
  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LNG ?? -98.5795),
        latitude: Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LAT ?? 39.8283),
        zoom: Number(process.env.NEXT_PUBLIC_MAP_INITIAL_ZOOM ?? 3.5)
      }}
      mapStyle={process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://demotiles.maplibre.org/style.json"}
      onMoveEnd={onMoveEnd}
    >
      <NavigationControl position="top-right" />

      {filtersStormView && (stormAlerts?.count ?? 0) > 0 ? (
        <Source id="storm-alerts" type="geojson" data={stormAlerts as unknown as any}>
          <Layer {...alertFillLayer} />
          <Layer {...alertLineLayer} />
        </Source>
      ) : null}

      {clusters.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates;
        const props = feature.properties as Record<string, unknown>;

        if (props.cluster) {
          const clusterId = Number(props.cluster_id);
          const pointCount = Number(props.point_count ?? 0);

          return (
            <Marker key={`cluster-${feature.id}`} longitude={longitude} latitude={latitude}>
              <button
                type="button"
                onClick={() => {
                  const expansionZoom = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), 18);
                  mapRef.current?.flyTo({
                    center: [longitude, latitude],
                    zoom: expansionZoom,
                    duration: 450
                  });
                }}
                className={`rounded-full border-2 border-white px-3 py-2 text-xs font-semibold text-white shadow ${
                  filtersStormView ? "bg-red-700" : "bg-slate-900"
                }`}
              >
                {pointCount}
              </button>
            </Marker>
          );
        }

        const camera = props as unknown as CameraListItem;
        const isNear = nearCameraIds.has(camera.id);
        return (
          <Marker key={camera.id} longitude={longitude} latitude={latitude} anchor="center">
            <button
              type="button"
              title={camera.name}
              onClick={() => {
                window.location.href = `/camera/${camera.slug}`;
              }}
              className={`rounded-full border border-white shadow ${
                isNear ? "h-4 w-4 ring-2 ring-indigo-500" : "h-3.5 w-3.5"
              }`}
              style={{
                backgroundColor: CATEGORY_COLORS[camera.category] ?? CATEGORY_COLORS.other
              }}
            />
          </Marker>
        );
      })}

      {userLocation ? (
        <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-600 shadow" title="Your location" />
        </Marker>
      ) : null}
    </Map>
  );
}
