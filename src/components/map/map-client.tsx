"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Supercluster from "supercluster";
import { useShallow } from "zustand/react/shallow";
import {
  ApproximateLocationApiResponse,
  CameraListItem,
  CamerasApiResponse,
  ManualLocationApiResponse,
  NearMeApiResponse,
  StormAlertsApiResponse,
  TrendingApiResponse
} from "@/components/map/types";
import { ClientErrorBoundary } from "@/components/system/client-error-boundary";
import { useMapFiltersStore } from "@/store/map-filters";

const CATEGORIES = [
  "traffic",
  "weather",
  "aviation",
  "beach",
  "tourism",
  "downtown",
  "mountain",
  "park",
  "harbor",
  "ski",
  "other"
];

const SOURCE_TYPES = ["dot", "weather", "tourism", "manual"];
const STREAM_TYPES = ["hls", "mjpeg", "jpeg", "iframe", "youtube", "unknown"];

type BoundsTuple = [number, number, number, number];
type UserLocation = {
  lat: number;
  lng: number;
};

type FilterSnapshot = {
  scope: "us" | "global";
  q: string;
  categories: string[];
  sourceTypes: string[];
  streamTypes: string[];
  stateCode: string;
  workingOnly: boolean;
  liveOnly: boolean;
  snapshotOnly: boolean;
  stormView: boolean;
};

const US_BOUNDS: BoundsTuple = [-125, 24, -66, 49.5];
const GLOBAL_BOUNDS: BoundsTuple = [-180, -85, 180, 85];

const MapCanvas = dynamic(
  () => import("@/components/map/map-canvas").then((mod) => mod.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-200 text-sm text-slate-600">
        Loading interactive map...
      </div>
    )
  }
);

function buildCameraQuery(bounds: BoundsTuple, zoom: number, filters: FilterSnapshot) {
  const params = new URLSearchParams();
  params.set("scope", filters.scope);
  params.set("bbox", bounds.join(","));
  params.set("zoom", String(zoom));
  params.set("limit", "3000");

  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  if (filters.categories.length > 0) {
    params.set("categories", filters.categories.join(","));
  }
  if (filters.sourceTypes.length > 0) {
    params.set("sourceTypes", filters.sourceTypes.join(","));
  }
  if (filters.streamTypes.length > 0) {
    params.set("streamTypes", filters.streamTypes.join(","));
  }
  if (filters.stateCode.trim()) {
    params.set("state", filters.stateCode.trim());
  }

  params.set("working", String(filters.workingOnly));
  params.set("liveOnly", String(filters.liveOnly));
  params.set("snapshotOnly", String(filters.snapshotOnly));
  params.set("stormView", String(filters.stormView));

  return params;
}

function buildStormAlertQuery(bounds: BoundsTuple, filters: FilterSnapshot) {
  const params = new URLSearchParams();
  params.set("scope", filters.scope);
  params.set("bbox", bounds.join(","));
  if (filters.stateCode.trim()) {
    params.set("state", filters.stateCode.trim());
  }
  return params;
}

function useMapFiltersSnapshot(): FilterSnapshot {
  return useMapFiltersStore(
    useShallow((state) => ({
      q: state.q,
      scope: state.scope,
      categories: state.categories,
      sourceTypes: state.sourceTypes,
      streamTypes: state.streamTypes,
      stateCode: state.stateCode,
      workingOnly: state.workingOnly,
      liveOnly: state.liveOnly,
      snapshotOnly: state.snapshotOnly,
      stormView: state.stormView
    }))
  );
}

function severityBadgeClass(severity: string | null): string {
  switch (severity) {
    case "Extreme":
      return "bg-red-900 text-red-100";
    case "Severe":
      return "bg-red-600 text-white";
    case "Moderate":
      return "bg-orange-500 text-white";
    case "Minor":
      return "bg-yellow-400 text-slate-900";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

function verificationBadgeClass(isVerified: boolean, sourceClass: "official" | "community" | "seed") {
  if (isVerified) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (sourceClass === "seed") {
    return "bg-amber-100 text-amber-900";
  }
  if (sourceClass === "community") {
    return "bg-blue-100 text-blue-800";
  }
  return "bg-slate-100 text-slate-700";
}

export default function MapClient() {
  const mapRef = useRef<any>(null);
  const filters = useMapFiltersSnapshot();
  const filterActions = useMapFiltersStore(
    useShallow((state) => ({
      setQ: state.setQ,
      setScope: state.setScope,
      toggleCategory: state.toggleCategory,
      toggleSourceType: state.toggleSourceType,
      toggleStreamType: state.toggleStreamType,
      setStateCode: state.setStateCode,
      setWorkingOnly: state.setWorkingOnly,
      setLiveOnly: state.setLiveOnly,
      setSnapshotOnly: state.setSnapshotOnly,
      setStormView: state.setStormView,
      reset: state.reset
    }))
  );

  const [zoom, setZoom] = useState<number>(Number(process.env.NEXT_PUBLIC_MAP_INITIAL_ZOOM ?? 3.5));
  const [bounds, setBounds] = useState<BoundsTuple>(US_BOUNDS);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [manualLocationQuery, setManualLocationQuery] = useState("");
  const [nearMeError, setNearMeError] = useState<string>("");
  const [nearMeHint, setNearMeHint] = useState<string>("");
  const [isSearchingManualLocation, setIsSearchingManualLocation] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const nextBounds = filters.scope === "global" ? GLOBAL_BOUNDS : US_BOUNDS;
    const nextView =
      filters.scope === "global"
        ? { center: [10, 24] as [number, number], zoom: 1.7 }
        : {
            center: [
              Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LNG ?? -98.5795),
              Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LAT ?? 39.8283)
            ] as [number, number],
            zoom: Number(process.env.NEXT_PUBLIC_MAP_INITIAL_ZOOM ?? 3.5)
          };

    setBounds(nextBounds);
    setZoom(nextView.zoom);

    mapRef.current?.flyTo({
      center: nextView.center,
      zoom: nextView.zoom,
      duration: 550
    });
  }, [filters.scope]);

  const queryKey = ["cameras", bounds, zoom, filters];

  const camerasQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<CamerasApiResponse> => {
      const params = buildCameraQuery(bounds, zoom, filters);
      const response = await fetch(`/api/cameras?${params.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Failed to load cameras (${response.status})`);
      }

      return response.json() as Promise<CamerasApiResponse>;
    },
    staleTime: 15000,
    refetchOnWindowFocus: false
  });

  const trendingQuery = useQuery({
    queryKey: ["trending-cameras"],
    queryFn: async (): Promise<TrendingApiResponse> => {
      const response = await fetch("/api/cameras/trending?limit=8", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Failed to load trending cameras");
      }

      return response.json() as Promise<TrendingApiResponse>;
    },
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  const stormAlertsQuery = useQuery({
    queryKey: ["storm-alerts", bounds, filters.stateCode, filters.stormView],
    queryFn: async (): Promise<StormAlertsApiResponse> => {
      const params = buildStormAlertQuery(bounds, filters);
      const response = await fetch(`/api/storm/alerts?${params.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Failed to load storm alerts");
      }

      return response.json() as Promise<StormAlertsApiResponse>;
    },
    enabled: filters.stormView,
    staleTime: 180000,
    refetchOnWindowFocus: false
  });

  const nearMeQuery = useQuery({
    queryKey: ["near-me-cameras", userLocation?.lat, userLocation?.lng, filters.workingOnly],
    queryFn: async (): Promise<NearMeApiResponse> => {
      if (!userLocation) {
        throw new Error("User location unavailable");
      }

      const params = new URLSearchParams({
        lat: userLocation.lat.toString(),
        lng: userLocation.lng.toString(),
        radiusMiles: "75",
        limit: "20",
        working: String(filters.workingOnly)
      });

      const response = await fetch(`/api/cameras/near?${params.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Failed to load nearby cameras");
      }

      return response.json() as Promise<NearMeApiResponse>;
    },
    enabled: Boolean(userLocation),
    staleTime: 45000,
    refetchOnWindowFocus: false
  });

  const cameraPoints = useMemo(() => {
    const items = camerasQuery.data?.items ?? [];

    return items.map((camera) => ({
      type: "Feature" as const,
      properties: camera,
      geometry: {
        type: "Point" as const,
        coordinates: [camera.longitude, camera.latitude] as [number, number]
      }
    }));
  }, [camerasQuery.data?.items]);

  const clusterIndex = useMemo(() => {
    const index = new Supercluster<CameraListItem>({
      radius: 64,
      maxZoom: 18,
      minPoints: 2
    });
    index.load(cameraPoints);
    return index;
  }, [cameraPoints]);

  const clusters = useMemo(() => {
    return clusterIndex.getClusters(bounds, Math.round(zoom));
  }, [clusterIndex, bounds, zoom]);

  const nearCameraIds = useMemo(
    () => new Set((nearMeQuery.data?.items ?? []).map((camera) => camera.id)),
    [nearMeQuery.data?.items]
  );

  const handleMoveEnd = () => {
    const map = mapRef.current?.getMap();
    if (!map) {
      return;
    }

    const mapBounds = map.getBounds();
    if (!mapBounds) {
      return;
    }

    setZoom(map.getZoom());
    setBounds([
      mapBounds.getWest(),
      mapBounds.getSouth(),
      mapBounds.getEast(),
      mapBounds.getNorth()
    ]);
  };

  const applyLocation = useCallback((nextLocation: UserLocation) => {
    setUserLocation(nextLocation);
    mapRef.current?.flyTo({
      center: [nextLocation.lng, nextLocation.lat],
      zoom: 8,
      duration: 550
    });
  }, []);

  const handleManualLocationSearch = async () => {
    const nextQuery = manualLocationQuery.trim();

    if (!nextQuery) {
      setNearMeError("Enter a ZIP code or city, state to find nearby cameras.");
      setNearMeHint("");
      return;
    }

    setIsSearchingManualLocation(true);
    setNearMeError("");
    setNearMeHint("");

    try {
      const params = new URLSearchParams({ q: nextQuery });
      const response = await fetch(`/api/location/search?${params.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Unable to search that location");
      }

      const payload = (await response.json()) as ManualLocationApiResponse;
      applyLocation({
        lat: payload.lat,
        lng: payload.lng
      });
      setNearMeHint(`Showing cameras near ${payload.matchedAddress} via ${payload.source}.`);
    } catch (error) {
      setNearMeError(error instanceof Error ? error.message : "Unable to search that location");
    } finally {
      setIsSearchingManualLocation(false);
    }
  };

  const resolveApproximateLocation = useCallback(
    async (reason: string) => {
      try {
        const response = await fetch("/api/location", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Approximate location service unavailable");
        }

        const payload = (await response.json()) as ApproximateLocationApiResponse;
        applyLocation({
          lat: payload.lat,
          lng: payload.lng
        });
        setNearMeHint(
          `${reason} Using approximate location from ${payload.source}${payload.region ? ` near ${payload.region}` : ""}.`
        );
        setNearMeError("");
      } catch (fallbackError) {
        setNearMeError(
          `${reason} Approximate location also failed: ${
            fallbackError instanceof Error ? fallbackError.message : "Unknown error"
          }`
        );
      }
    },
    [applyLocation]
  );

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      void resolveApproximateLocation("Browser geolocation is not available.");
      return;
    }

    setNearMeError("");
    setNearMeHint("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        applyLocation(nextLocation);
      },
      (error) => {
        void resolveApproximateLocation(error.message || "Unable to determine current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000
      }
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.75rem)] w-full overflow-hidden bg-slate-100">
      <aside className="w-full max-w-[390px] overflow-y-auto border-r border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {filters.scope === "global" ? "Global Webcam Map" : "U.S. Webcam Map"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {filters.scope === "global"
            ? "Browse webcams across the United States and Europe with a world-scale viewport."
            : "Traffic, weather, storm, and tourism cameras in one viewport-aware U.S. map."}
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Coverage note: this desktop build currently includes seed data plus limited source adapters, so national density is still sparse.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => filterActions.setScope(filters.scope === "global" ? "us" : "global")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              {filters.scope === "global" ? "Switch To U.S. Mode" : "Switch To Global Mode"}
            </button>
            <button
              type="button"
              onClick={() => filterActions.setStormView(!filters.stormView)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                filters.stormView
                  ? "bg-red-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              {filters.stormView ? "Storm View On" : "Storm View"}
            </button>
            <button
              type="button"
              onClick={handleNearMe}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              Cams Near Me
            </button>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Manual Location</p>
            <div className="flex gap-2">
              <input
                value={manualLocationQuery}
                onChange={(event) => setManualLocationQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleManualLocationSearch();
                  }
                }}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="ZIP or city, state"
              />
              <button
                type="button"
                onClick={() => void handleManualLocationSearch()}
                disabled={isSearchingManualLocation}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSearchingManualLocation ? "Finding..." : "Find"}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Use this if Windows blocks location services or you want to search another area.
            </p>
          </div>

          {nearMeError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{nearMeError}</p>
          ) : null}

          {nearMeHint ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{nearMeHint}</p>
          ) : null}

          <input
            value={filters.q}
            onChange={(event) => filterActions.setQ(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search city, state, source, or camera"
          />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">State</p>
            <input
              value={filters.stateCode}
              maxLength={2}
              onChange={(event) => filterActions.setStateCode(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
              placeholder={filters.scope === "global" ? "US only" : "Any"}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => filterActions.toggleCategory(category)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    filters.categories.includes(category)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Source Type</p>
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPES.map((sourceType) => (
                <button
                  key={sourceType}
                  type="button"
                  onClick={() => filterActions.toggleSourceType(sourceType)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    filters.sourceTypes.includes(sourceType)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {sourceType}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Stream Type</p>
            <div className="flex flex-wrap gap-2">
              {STREAM_TYPES.map((streamType) => (
                <button
                  key={streamType}
                  type="button"
                  onClick={() => filterActions.toggleStreamType(streamType)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    filters.streamTypes.includes(streamType)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {streamType}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.workingOnly}
                onChange={(event) => filterActions.setWorkingOnly(event.target.checked)}
              />
              Only show working cameras
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.liveOnly}
                onChange={(event) => filterActions.setLiveOnly(event.target.checked)}
              />
              Only show live video
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.snapshotOnly}
                onChange={(event) => filterActions.setSnapshotOnly(event.target.checked)}
              />
              Only show snapshots
            </label>
          </div>

          <button
            type="button"
            onClick={filterActions.reset}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Reset Filters
          </button>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-xs uppercase text-slate-500">Results in current map bounds</p>
          <p className="mt-1 text-sm text-slate-700">
            {camerasQuery.isFetching ? "Refreshing..." : `${camerasQuery.data?.count ?? 0} cameras`}
          </p>

          {filters.stormView ? (
            <p className="mt-1 text-xs text-slate-600">
              Active alerts: {stormAlertsQuery.isFetching ? "..." : stormAlertsQuery.data?.count ?? 0}
            </p>
          ) : null}

          {camerasQuery.isError ? <p className="mt-2 text-sm text-red-600">Unable to load cameras.</p> : null}

          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {(camerasQuery.data?.items ?? []).slice(0, 80).map((camera) => (
              <li key={camera.id} className="rounded-md border border-slate-200 p-3">
                <Link href={`/camera/${camera.slug}`} className="font-medium text-slate-900 hover:underline">
                  {camera.name}
                </Link>
                <p className="text-xs text-slate-600">
                  {(camera.city ?? "Unknown city")}, {camera.stateCode ?? "N/A"}
                </p>
                <p className="text-xs text-slate-500">
                  {camera.category} • {camera.source.name}
                </p>
                <p className="mt-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${verificationBadgeClass(
                      camera.verification.isVerified,
                      camera.verification.sourceClass
                    )}`}
                  >
                    {camera.verification.label}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-xs uppercase text-slate-500">Near Me</p>
          <ul className="mt-2 space-y-2">
            {(nearMeQuery.data?.items ?? []).slice(0, 6).map((camera) => (
              <li key={camera.id} className="rounded-md border border-slate-200 p-3">
                <Link href={`/camera/${camera.slug}`} className="text-sm font-medium text-slate-900 hover:underline">
                  {camera.name}
                </Link>
                <p className="text-xs text-slate-600">
                  {camera.distanceMiles.toFixed(1)} mi • {camera.city ?? "Unknown city"}, {camera.stateCode ?? "N/A"}
                </p>
                <p className="mt-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${verificationBadgeClass(
                      camera.verification.isVerified,
                      camera.verification.sourceClass
                    )}`}
                  >
                    {camera.verification.label}
                  </span>
                </p>
              </li>
            ))}
            {userLocation && !nearMeQuery.isFetching && (nearMeQuery.data?.count ?? 0) === 0 ? (
              <li className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                No cameras found within 75 miles.
              </li>
            ) : null}
            {nearMeQuery.data?.fallbackToNearest ? (
              <li className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                No cameras were found within 75 miles, so the closest known cameras are shown instead.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-xs uppercase text-slate-500">Trending Cameras</p>
          <ul className="mt-2 space-y-2">
            {(trendingQuery.data?.items ?? []).slice(0, 8).map((camera) => (
              <li key={camera.id} className="rounded-md border border-slate-200 p-3">
                <Link href={`/camera/${camera.slug}`} className="text-sm font-medium text-slate-900 hover:underline">
                  {camera.name}
                </Link>
                <p className="text-xs text-slate-600">
                  Score {camera.stats.trendingScore.toFixed(1)} • {camera.city ?? "Unknown city"}, {camera.stateCode ?? "N/A"}
                </p>
                <p className="mt-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${verificationBadgeClass(
                      camera.verification.isVerified,
                      camera.verification.sourceClass
                    )}`}
                  >
                    {camera.verification.label}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        {filters.stormView ? (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="text-xs uppercase text-slate-500">Active Alerts</p>
            <ul className="mt-2 space-y-2">
              {(stormAlertsQuery.data?.features ?? []).slice(0, 6).map((alert) => (
                <li key={alert.id} className="rounded-md border border-slate-200 p-3">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${severityBadgeClass(alert.properties.severity)}`}>
                    {alert.properties.severity ?? "Unknown"}
                  </span>
                  <p className="mt-1 text-sm font-medium text-slate-900">{alert.properties.event ?? "Weather Alert"}</p>
                  <p className="text-xs text-slate-600">{alert.properties.areaDesc ?? "United States"}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <section className="relative flex-1">
        {!isMounted ? (
          <div className="flex h-full items-center justify-center bg-slate-200 text-sm text-slate-600">
            Preparing interactive map...
          </div>
        ) : (
          <ClientErrorBoundary
            fallback={
              <div className="flex h-full flex-col items-center justify-center bg-slate-100 p-6 text-center">
                <h2 className="text-lg font-semibold text-slate-900">Map view is temporarily unavailable.</h2>
                <p className="mt-2 max-w-md text-sm text-slate-600">
                  The camera sidebar is still usable, and the app can keep loading data while we isolate the browser map issue.
                </p>
              </div>
            }
          >
            <MapCanvas
              mapRef={mapRef}
              filtersStormView={filters.stormView}
              stormAlerts={stormAlertsQuery.data}
              clusters={clusters}
              clusterIndex={clusterIndex}
              nearCameraIds={nearCameraIds}
              userLocation={userLocation}
              onMoveEnd={handleMoveEnd}
            />
          </ClientErrorBoundary>
        )}
      </section>
    </div>
  );
}
