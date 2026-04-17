import { create } from "zustand";

export type MapFiltersState = {
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
  setScope: (scope: "us" | "global") => void;
  setQ: (q: string) => void;
  toggleCategory: (category: string) => void;
  toggleSourceType: (sourceType: string) => void;
  toggleStreamType: (streamType: string) => void;
  setStateCode: (stateCode: string) => void;
  setWorkingOnly: (enabled: boolean) => void;
  setLiveOnly: (enabled: boolean) => void;
  setSnapshotOnly: (enabled: boolean) => void;
  setStormView: (enabled: boolean) => void;
  reset: () => void;
};

const initialState = {
  scope: "us" as const,
  q: "",
  categories: [],
  sourceTypes: [],
  streamTypes: [],
  stateCode: "",
  workingOnly: false,
  liveOnly: false,
  snapshotOnly: false,
  stormView: false
};

export const useMapFiltersStore = create<MapFiltersState>((set) => ({
  ...initialState,
  setScope: (scope) => set({ scope }),
  setQ: (q) => set({ q }),
  toggleCategory: (category) =>
    set((state) => ({
      categories: state.categories.includes(category)
        ? state.categories.filter((item) => item !== category)
        : [...state.categories, category]
    })),
  toggleSourceType: (sourceType) =>
    set((state) => ({
      sourceTypes: state.sourceTypes.includes(sourceType)
        ? state.sourceTypes.filter((item) => item !== sourceType)
        : [...state.sourceTypes, sourceType]
    })),
  toggleStreamType: (streamType) =>
    set((state) => ({
      streamTypes: state.streamTypes.includes(streamType)
        ? state.streamTypes.filter((item) => item !== streamType)
        : [...state.streamTypes, streamType]
    })),
  setStateCode: (stateCode) => set({ stateCode: stateCode.toUpperCase() }),
  setWorkingOnly: (workingOnly) => set({ workingOnly }),
  setLiveOnly: (liveOnly) => set({ liveOnly }),
  setSnapshotOnly: (snapshotOnly) => set({ snapshotOnly }),
  setStormView: (stormView) => set({ stormView }),
  reset: () => set(initialState)
}));
