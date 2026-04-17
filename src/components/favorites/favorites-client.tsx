"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CameraListItem } from "@/components/map/types";
import { useFavoritesStore } from "@/store/favorites-store";

type FavoritesApiResponse = {
  count: number;
  items: CameraListItem[];
};

export function FavoritesClient() {
  const cameraIds = useFavoritesStore((state) => state.cameraIds);
  const savedSearches = useFavoritesStore((state) => state.savedSearches);
  const savedRegions = useFavoritesStore((state) => state.savedRegions);
  const removeSearch = useFavoritesStore((state) => state.removeSearch);
  const removeRegion = useFavoritesStore((state) => state.removeRegion);

  const idsKey = useMemo(() => cameraIds.join(","), [cameraIds]);

  const favoritesQuery = useQuery({
    queryKey: ["favorite-cameras", idsKey],
    queryFn: async (): Promise<FavoritesApiResponse> => {
      const response = await fetch(`/api/cameras/favorites?ids=${encodeURIComponent(idsKey)}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Failed to load favorite cameras");
      }

      return response.json() as Promise<FavoritesApiResponse>;
    },
    enabled: cameraIds.length > 0,
    staleTime: 15000,
    refetchOnWindowFocus: false
  });

  return (
    <main className="min-h-[calc(100vh-3.75rem)] bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Favorites</h1>
          <p className="mt-2 text-sm text-slate-600">
            Anonymous favorites are stored locally on this device so you can keep track of cameras, searches, and regions.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Saved Cameras</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cameraIds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                No cameras saved yet. Use the favorite button on a camera page to add one.
              </div>
            ) : favoritesQuery.isError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                Unable to load saved cameras.
              </div>
            ) : (
              (favoritesQuery.data?.items ?? []).map((camera) => (
                <div key={camera.id} className="rounded-xl border border-slate-200 p-4">
                  <Link href={`/camera/${camera.slug}`} className="text-base font-semibold text-slate-900 hover:underline">
                    {camera.name}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    {camera.city ?? "Unknown city"}
                    {camera.stateCode ? `, ${camera.stateCode}` : ""} • {camera.category}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {camera.source.name} • {camera.status}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Saved Searches</h2>
          <div className="mt-4 space-y-3">
            {savedSearches.length === 0 ? (
              <p className="text-sm text-slate-500">No saved searches yet.</p>
            ) : (
              savedSearches.map((search) => {
                const params = new URLSearchParams();
                if (search.q) {
                  params.set("q", search.q);
                }
                if (search.stateCode) {
                  params.set("state", search.stateCode);
                }
                if (search.categories.length > 0) {
                  params.set("categories", search.categories.join(","));
                }
                if (search.sourceTypes.length > 0) {
                  params.set("sourceTypes", search.sourceTypes.join(","));
                }
                if (search.streamTypes.length > 0) {
                  params.set("streamTypes", search.streamTypes.join(","));
                }
                if (search.workingOnly) {
                  params.set("working", "true");
                }
                if (search.liveOnly) {
                  params.set("liveOnly", "true");
                }
                if (search.snapshotOnly) {
                  params.set("snapshotOnly", "true");
                }

                return (
                  <div key={search.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                    <div>
                      <p className="font-medium text-slate-900">{search.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Saved {new Date(search.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/search?${params.toString()}`}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        Open Search
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeSearch(search.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Saved Regions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {savedRegions.length === 0 ? (
              <p className="text-sm text-slate-500">No regions saved yet.</p>
            ) : (
              savedRegions.map((region) => (
                <div key={region} className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2">
                  <Link href={`/search?state=${encodeURIComponent(region)}`} className="text-sm text-slate-700">
                    {region}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeRegion(region)}
                    className="text-xs text-red-600"
                  >
                    remove
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
