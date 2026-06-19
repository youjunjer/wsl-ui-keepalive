import { create } from "zustand";
import { wslService, type ResourceStats, type DistroResourceUsage } from "../services/wslService";
import { logger } from "../utils/logger";

interface ResourceStore {
  stats: ResourceStats | null;
  lastRawStats: ResourceStats | null;
  lastFetchedAt: number | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStats: (silent?: boolean) => Promise<void>;
  clearStats: () => void;

  // Selectors
  getDistroResources: (name: string) => DistroResourceUsage | undefined;
}

const bytesDeltaToMbps = (
  previousBytes: number | null | undefined,
  currentBytes: number | null | undefined,
  elapsedSeconds: number,
): number | null => {
  if (
    previousBytes == null
    || currentBytes == null
    || elapsedSeconds <= 0
    || currentBytes < previousBytes
  ) {
    return null;
  }

  return (currentBytes - previousBytes) / 1024 / 1024 / elapsedSeconds;
};

const withNetworkRates = (
  current: ResourceStats,
  previous: ResourceStats | null,
  elapsedSeconds: number,
): ResourceStats => {
  if (!previous || !Array.isArray(current.perDistro) || !Array.isArray(previous.perDistro)) {
    return current;
  }

  const previousByName = new Map(previous.perDistro.map((distro) => [distro.name, distro]));

  return {
    ...current,
    perDistro: current.perDistro.map((distro) => {
      const previousDistro = previousByName.get(distro.name);
      return {
        ...distro,
        networkRxMbps: bytesDeltaToMbps(
          previousDistro?.networkRxBytes,
          distro.networkRxBytes,
          elapsedSeconds,
        ),
        networkTxMbps: bytesDeltaToMbps(
          previousDistro?.networkTxBytes,
          distro.networkTxBytes,
          elapsedSeconds,
        ),
      };
    }),
  };
};

export const useResourceStore = create<ResourceStore>((set, get) => ({
  stats: null,
  lastRawStats: null,
  lastFetchedAt: null,
  isLoading: false,
  error: null,

  fetchStats: async (silent?: boolean) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      const stats = await wslService.getResourceStats();
      const now = Date.now();
      const { lastRawStats, lastFetchedAt } = get();
      const elapsedSeconds = lastFetchedAt ? (now - lastFetchedAt) / 1000 : 0;
      const statsWithRates = withNetworkRates(stats, lastRawStats, elapsedSeconds);
      logger.info("Fetched stats:", "ResourceStore", stats);
      set(silent
        ? { stats: statsWithRates, lastRawStats: stats, lastFetchedAt: now }
        : { stats: statsWithRates, lastRawStats: stats, lastFetchedAt: now, isLoading: false }
      );
    } catch (error) {
      logger.error("Failed to fetch resource stats:", "ResourceStore", error);
      set(silent ? { error: String(error) } : { error: String(error), isLoading: false });
    }
  },

  clearStats: () => {
    set({ stats: null, lastRawStats: null, lastFetchedAt: null, error: null });
  },

  getDistroResources: (name: string) => {
    const { stats } = get();
    if (!stats || !stats.perDistro) return undefined;
    return stats.perDistro.find((d) => d.name === name);
  },
}));

// Expose store for e2e testing (allows direct store access from browser.execute)
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__resourceStore = useResourceStore;
}
