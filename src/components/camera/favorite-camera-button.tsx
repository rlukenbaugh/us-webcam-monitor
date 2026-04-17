"use client";

import { useFavoritesStore } from "@/store/favorites-store";

export function FavoriteCameraButton({ cameraId }: { cameraId: string }) {
  const isFavorite = useFavoritesStore((state) => state.isFavorite(cameraId));
  const toggleCamera = useFavoritesStore((state) => state.toggleCamera);

  return (
    <button
      type="button"
      onClick={() => toggleCamera(cameraId)}
      className={`rounded-xl px-4 py-2 text-sm font-medium ${
        isFavorite
          ? "bg-amber-100 text-amber-900"
          : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      {isFavorite ? "Saved To Favorites" : "Save To Favorites"}
    </button>
  );
}
