import { create } from "zustand";
import type { KeepAliveSettings } from "../types/settings";
import { DEFAULT_KEEP_ALIVE_SETTINGS } from "../types/settings";
import { wslService } from "../services/wslService";
import { logger } from "../utils/logger";

interface KeepAliveStore {
  settings: KeepAliveSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasLoaded: boolean;

  load: () => Promise<void>;
  isEnabled: (name: string) => boolean;
  setDistroEnabled: (name: string, enabled: boolean) => Promise<void>;
  setEnabledDistros: (names: string[]) => Promise<void>;
}

export const useKeepAliveStore = create<KeepAliveStore>((set, get) => ({
  settings: DEFAULT_KEEP_ALIVE_SETTINGS,
  isLoading: false,
  isSaving: false,
  error: null,
  hasLoaded: false,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await wslService.getKeepAliveSettings();
      set({
        settings: {
          ...DEFAULT_KEEP_ALIVE_SETTINGS,
          ...settings,
          enabledDistros: settings.enabledDistros || [],
        },
        isLoading: false,
        hasLoaded: true,
      });
    } catch (error) {
      logger.error("Failed to load keep alive settings:", "KeepAliveStore", error);
      set({ isLoading: false, hasLoaded: true, error: "Failed to load keep alive settings" });
    }
  },

  isEnabled: (name: string) => get().settings.enabledDistros.includes(name),

  setDistroEnabled: async (name: string, enabled: boolean) => {
    const previous = get().settings;
    const nextNames = enabled
      ? Array.from(new Set([...previous.enabledDistros, name])).sort()
      : previous.enabledDistros.filter((d) => d !== name);

    set({
      settings: { ...previous, enabledDistros: nextNames },
      isSaving: true,
      error: null,
    });

    try {
      const saved = await wslService.setKeepAliveDistro(name, enabled);
      set({ settings: saved, isSaving: false });
    } catch (error) {
      logger.error("Failed to update keep alive distro:", "KeepAliveStore", error);
      set({
        settings: previous,
        isSaving: false,
        error: error instanceof Error ? error.message : "Failed to update keep alive",
      });
    }
  },

  setEnabledDistros: async (names: string[]) => {
    const previous = get().settings;
    const nextNames = Array.from(new Set(names)).sort();

    set({
      settings: { ...previous, enabledDistros: nextNames },
      isSaving: true,
      error: null,
    });

    try {
      const saved = await wslService.setKeepAliveDistros(nextNames);
      set({ settings: saved, isSaving: false });
    } catch (error) {
      logger.error("Failed to update keep alive distros:", "KeepAliveStore", error);
      set({
        settings: previous,
        isSaving: false,
        error: error instanceof Error ? error.message : "Failed to update keep alive",
      });
    }
  },
}));

if (typeof window !== "undefined") {
  (window as unknown as { __keepAliveStore: typeof useKeepAliveStore }).__keepAliveStore =
    useKeepAliveStore;
}
