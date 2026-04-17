"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { FavoriteCameraButton } from "@/components/camera/favorite-camera-button";
import type { CameraListItem, CamerasApiResponse } from "@/components/map/types";
import { useFavoritesStore } from "@/store/favorites-store";

const US_BBOX = "-125,24,-66,49.5";
const GLOBAL_BBOX = "-180,-85,180,85";

const CATEGORY_OPTIONS = [
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

const SOURCE_TYPE_OPTIONS = ["dot", "weather", "tourism", "manual"];
const STREAM_TYPE_OPTIONS = ["hls", "mjpeg", "jpeg", "iframe", "youtube", "unknown"];

type SearchFilters = {
  scope: "us" | "global";
  q: string;
  state: string;
  categories: string[];
  sourceTypes: string[];
  streamTypes: string[];
  working: boolean;
  liveOnly: boolean;
  snapshotOnly: boolean;
};

function parseList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function buildInitialFilters(searchParams: ReadonlyURLSearchParams): SearchFilters {
  return {
    scope: searchParams.get("scope") === "global" ? "global" : "us",
    q: searchParams.get("q") ?? "",
    state: searchParams.get("state") ?? "",
    categories: parseList(searchParams.get("categories")),
    sourceTypes: parseList(searchParams.get("sourceTypes")),
    streamTypes: parseList(searchParams.get("streamTypes")),
    working: searchParams.get("working") === "true",
    liveOnly: searchParams.get("liveOnly") === "true",
    snapshotOnly: searchParams.get("snapshotOnly") === "true"
  };
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
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

export function SearchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const saveSearch = useFavoritesStore((state) => state.saveSearch);
  const saveRegion = useFavoritesStore((state) => state.saveRegion);
  const initialFilters = useMemo(() => buildInitialFilters(searchParams), [searchParams]);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [results, setResults] = useState<CameraListItem[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  useEffect(() => {
    void runSearch(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilters.scope, initialFilters.q, initialFilters.state, initialFilters.categories.join(","), initialFilters.sourceTypes.join(","), initialFilters.streamTypes.join(","), initialFilters.working, initialFilters.liveOnly, initialFilters.snapshotOnly]);

  async function runSearch(nextFilters: SearchFilters) {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        bbox: nextFilters.scope === "global" ? GLOBAL_BBOX : US_BBOX,
        scope: nextFilters.scope,
        limit: "200"
      });

      if (nextFilters.q.trim()) {
        params.set("q", nextFilters.q.trim());
      }
      if (nextFilters.state.trim()) {
        params.set("state", nextFilters.state.trim().toUpperCase());
      }
      if (nextFilters.categories.length > 0) {
        params.set("categories", nextFilters.categories.join(","));
      }
      if (nextFilters.sourceTypes.length > 0) {
        params.set("sourceTypes", nextFilters.sourceTypes.join(","));
      }
      if (nextFilters.streamTypes.length > 0) {
        params.set("streamTypes", nextFilters.streamTypes.join(","));
      }
      if (nextFilters.working) {
        params.set("working", "true");
      }
      if (nextFilters.liveOnly) {
        params.set("liveOnly", "true");
      }
      if (nextFilters.snapshotOnly) {
        params.set("snapshotOnly", "true");
      }

      const response = await fetch(`/api/cameras?${params.toString()}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as CamerasApiResponse & { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Search failed");
      }

      setResults(payload.items);
      setResultCount(payload.count);
      setHasMore(payload.hasMore);
    } catch (nextError) {
      setResults([]);
      setResultCount(0);
      setHasMore(false);
      setError(nextError instanceof Error ? nextError.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  function applyFilters() {
    const params = new URLSearchParams();

    if (filters.q.trim()) {
      params.set("q", filters.q.trim());
    }
    if (filters.scope === "global") {
      params.set("scope", "global");
    }
    if (filters.state.trim()) {
      params.set("state", filters.state.trim().toUpperCase());
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
    if (filters.working) {
      params.set("working", "true");
    }
    if (filters.liveOnly) {
      params.set("liveOnly", "true");
    }
    if (filters.snapshotOnly) {
      params.set("snapshotOnly", "true");
    }

    router.replace(params.toString() ? `/search?${params.toString()}` : "/search");
  }

  function handleSaveSearch() {
    saveSearch({
      label: filters.q.trim() || (filters.state ? `${filters.state.toUpperCase()} cameras` : "National webcam search"),
      q: filters.q.trim(),
      stateCode: filters.state.trim().toUpperCase(),
      categories: filters.categories,
      sourceTypes: filters.sourceTypes,
      streamTypes: filters.streamTypes,
      workingOnly: filters.working,
      liveOnly: filters.liveOnly,
      snapshotOnly: filters.snapshotOnly
    });
    setSaveMessage("Saved this search to Favorites.");
  }

  function handleSaveRegion() {
    if (!filters.state.trim()) {
      return;
    }

    saveRegion(filters.state.trim().toUpperCase());
    setSaveMessage(`Saved ${filters.state.trim().toUpperCase()} to Favorite regions.`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {filters.scope === "global" ? "Global Camera Search" : "National Camera Search"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {filters.scope === "global"
                ? "Search across the broader camera index, including Europe, without moving the map."
                : "Search the full camera index without moving the map. This is the quickest way to save common searches, browse by state, or inspect a source category across the whole dataset."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveSearch}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Save Search
            </button>
            <button
              type="button"
              onClick={handleSaveRegion}
              disabled={!filters.state.trim()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save State
            </button>
          </div>
        </div>

        {saveMessage ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {saveMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Search scope</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["us", "global"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, scope, state: scope === "global" ? "" : current.state }))}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      filters.scope === scope
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {scope === "global" ? "Global" : "U.S."}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Search term</label>
              <input
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="City, state, camera name, or source"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">State code</label>
              <input
                value={filters.state}
                onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value.toUpperCase() }))}
                maxLength={2}
                placeholder={filters.scope === "global" ? "US only" : "CA"}
                disabled={filters.scope === "global"}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.working}
                onChange={(event) => setFilters((current) => ({ ...current, working: event.target.checked }))}
                className="mr-2"
              />
              Only working
            </label>
            <label className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.liveOnly}
                onChange={(event) => setFilters((current) => ({ ...current, liveOnly: event.target.checked }))}
                className="mr-2"
              />
              Only live video
            </label>
            <label className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.snapshotOnly}
                onChange={(event) => setFilters((current) => ({ ...current, snapshotOnly: event.target.checked }))}
                className="mr-2"
              />
              Only snapshots
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Categories</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      categories: toggleValue(current.categories, value)
                    }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    filters.categories.includes(value)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Source types</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SOURCE_TYPE_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      sourceTypes: toggleValue(current.sourceTypes, value)
                    }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    filters.sourceTypes.includes(value)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Stream types</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STREAM_TYPE_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      streamTypes: toggleValue(current.streamTypes, value)
                    }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    filters.streamTypes.includes(value)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Apply Search
          </button>
          <Link
            href="/search"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Reset
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Results</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isLoading
                ? `Searching ${filters.scope === "global" ? "global" : "national"} camera index...`
                : `${resultCount} result${resultCount === 1 ? "" : "s"} loaded`}
              {hasMore ? " (showing the first 200)" : ""}
            </p>
          </div>
          <Link
            href="/map"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Open Map
          </Link>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {results.map((camera) => (
            <article key={camera.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {camera.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {camera.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {camera.source.type}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${verificationBadgeClass(
                        camera.verification.isVerified,
                        camera.verification.sourceClass
                      )}`}
                    >
                      {camera.verification.label}
                    </span>
                  </div>
                  <Link href={`/camera/${camera.slug}`} className="mt-3 block text-lg font-semibold text-slate-900 hover:underline">
                    {camera.name}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    {camera.city ?? "Unknown city"}
                    {camera.stateCode ? `, ${camera.stateCode}` : ""} • {camera.source.name}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
                    {camera.lastCheckedAt ? ` • checked ${new Date(camera.lastCheckedAt).toLocaleString()}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <FavoriteCameraButton cameraId={camera.id} />
                  <Link
                    href={`/camera/${camera.slug}`}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    {camera.verification.isVerified ? "View Camera" : "View Details"}
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {!isLoading && results.length === 0 && !error ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No cameras matched this search. Try clearing a filter or broadening the state/category mix.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
