import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SavedSearch = {
  id: string;
  label: string;
  q: string;
  stateCode: string;
  categories: string[];
  sourceTypes: string[];
  streamTypes: string[];
  workingOnly: boolean;
  liveOnly: boolean;
  snapshotOnly: boolean;
  createdAt: string;
};

type FavoritesState = {
  cameraIds: string[];
  savedSearches: SavedSearch[];
  savedRegions: string[];
  toggleCamera: (cameraId: string) => void;
  isFavorite: (cameraId: string) => boolean;
  saveSearch: (search: Omit<SavedSearch, "id" | "createdAt">) => void;
  removeSearch: (id: string) => void;
  saveRegion: (region: string) => void;
  removeRegion: (region: string) => void;
};

function createId() {
  return `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      cameraIds: [],
      savedSearches: [],
      savedRegions: [],
      toggleCamera: (cameraId) =>
        set((state) => ({
          cameraIds: state.cameraIds.includes(cameraId)
            ? state.cameraIds.filter((id) => id !== cameraId)
            : [...state.cameraIds, cameraId]
        })),
      isFavorite: (cameraId) => get().cameraIds.includes(cameraId),
      saveSearch: (search) =>
        set((state) => ({
          savedSearches: [
            {
              ...search,
              id: createId(),
              createdAt: new Date().toISOString()
            },
            ...state.savedSearches
          ].slice(0, 20)
        })),
      removeSearch: (id) =>
        set((state) => ({
          savedSearches: state.savedSearches.filter((search) => search.id !== id)
        })),
      saveRegion: (region) =>
        set((state) => ({
          savedRegions: state.savedRegions.includes(region)
            ? state.savedRegions
            : [...state.savedRegions, region].slice(0, 20)
        })),
      removeRegion: (region) =>
        set((state) => ({
          savedRegions: state.savedRegions.filter((entry) => entry !== region)
        }))
    }),
    {
      name: "us-webcam-monitor-favorites",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
