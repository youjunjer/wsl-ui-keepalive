import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useResourceStore } from "./resourceStore";
import type { ResourceStats, DistroResourceUsage } from "../services/wslService";

// Note: @tauri-apps/api/core is mocked in test/setup.ts

const mockStats: ResourceStats = {
  global: {
    memoryUsedBytes: 2147483648, // 2GB
    memoryLimitBytes: 8589934592, // 8GB
    gpu: {
      name: "Mock GPU",
      utilizationPercent: 42,
      memoryUsedBytes: 3 * 1024 * 1024 * 1024,
      memoryTotalBytes: 8 * 1024 * 1024 * 1024,
    },
  },
  perDistro: [
    {
      name: "Ubuntu",
      ipAddress: "192.168.0.5",
      memoryUsedBytes: 1073741824, // 1GB
      cpuPercent: 15.5,
      networkRxBytes: 10_000,
      networkTxBytes: 5_000,
    },
    {
      name: "Debian",
      ipAddress: "192.168.0.6",
      memoryUsedBytes: 536870912, // 512MB
      cpuPercent: 5.2,
      networkRxBytes: 20_000,
      networkTxBytes: 8_000,
    },
  ],
};

describe("resourceStore", () => {
  beforeEach(() => {
    // Reset store state
    useResourceStore.setState({
      stats: null,
      lastRawStats: null,
      lastFetchedAt: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have null stats initially", () => {
      const state = useResourceStore.getState();
      expect(state.stats).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("fetchStats", () => {
    it("sets loading state while fetching (non-silent)", async () => {
      vi.mocked(invoke).mockResolvedValue(mockStats);

      const fetchPromise = useResourceStore.getState().fetchStats();

      expect(useResourceStore.getState().isLoading).toBe(true);

      await fetchPromise;

      expect(useResourceStore.getState().isLoading).toBe(false);
    });

    it("does not set loading state when silent", async () => {
      vi.mocked(invoke).mockResolvedValue(mockStats);

      const fetchPromise = useResourceStore.getState().fetchStats(true);

      expect(useResourceStore.getState().isLoading).toBe(false);

      await fetchPromise;

      expect(useResourceStore.getState().isLoading).toBe(false);
    });

    it("stores fetched stats", async () => {
      vi.mocked(invoke).mockResolvedValue(mockStats);

      await useResourceStore.getState().fetchStats();

      expect(useResourceStore.getState().stats).toEqual(mockStats);
    });

    it("calls invoke with correct command", async () => {
      vi.mocked(invoke).mockResolvedValue(mockStats);

      await useResourceStore.getState().fetchStats();

      expect(invoke).toHaveBeenCalledWith("get_resource_stats");
    });

    it("sets error on fetch failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Fetch failed"));

      await useResourceStore.getState().fetchStats();

      expect(useResourceStore.getState().error).toBe("Error: Fetch failed");
      expect(useResourceStore.getState().isLoading).toBe(false);
    });

    it("sets error when silent on failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Silent error"));

      await useResourceStore.getState().fetchStats(true);

      expect(useResourceStore.getState().error).toBe("Error: Silent error");
      // Loading should not have been set
      expect(useResourceStore.getState().isLoading).toBe(false);
    });

    it("handles string errors", async () => {
      vi.mocked(invoke).mockRejectedValue("String error");

      await useResourceStore.getState().fetchStats();

      expect(useResourceStore.getState().error).toBe("String error");
    });
  });

  describe("clearStats", () => {
    it("clears stats and error", () => {
      useResourceStore.setState({
        stats: mockStats,
        error: "Some error",
      });

      useResourceStore.getState().clearStats();

      expect(useResourceStore.getState().stats).toBeNull();
      expect(useResourceStore.getState().error).toBeNull();
    });
  });

  describe("getDistroResources", () => {
    it("returns resources for existing distro", () => {
      useResourceStore.setState({ stats: mockStats });

      const resources = useResourceStore.getState().getDistroResources("Ubuntu");

      expect(resources).toEqual({
        name: "Ubuntu",
        ipAddress: "192.168.0.5",
        memoryUsedBytes: 1073741824,
        cpuPercent: 15.5,
        networkRxBytes: 10_000,
        networkTxBytes: 5_000,
      });
    });

    it("returns undefined for non-existing distro", () => {
      useResourceStore.setState({ stats: mockStats });

      const resources = useResourceStore.getState().getDistroResources("NonExistent");

      expect(resources).toBeUndefined();
    });

    it("returns undefined when stats is null", () => {
      const resources = useResourceStore.getState().getDistroResources("Ubuntu");

      expect(resources).toBeUndefined();
    });

    it("returns undefined when perDistro is null", () => {
      useResourceStore.setState({
        stats: {
          global: mockStats.global,
          perDistro: null as unknown as DistroResourceUsage[],
        },
      });

      const resources = useResourceStore.getState().getDistroResources("Ubuntu");

      expect(resources).toBeUndefined();
    });

    it("finds distro case-sensitively", () => {
      useResourceStore.setState({ stats: mockStats });

      const resourcesLower = useResourceStore.getState().getDistroResources("ubuntu");
      const resourcesUpper = useResourceStore.getState().getDistroResources("Ubuntu");

      expect(resourcesLower).toBeUndefined();
      expect(resourcesUpper).toBeDefined();
    });
  });

  describe("global resource stats", () => {
    it("stores global memory usage correctly", async () => {
      vi.mocked(invoke).mockResolvedValue(mockStats);

      await useResourceStore.getState().fetchStats();

      const stats = useResourceStore.getState().stats;
      expect(stats?.global.memoryUsedBytes).toBe(2147483648);
      expect(stats?.global.memoryLimitBytes).toBe(8589934592);
    });

    it("handles null memory limit", async () => {
      const statsWithNullLimit: ResourceStats = {
        global: {
          memoryUsedBytes: 1073741824,
          memoryLimitBytes: null,
          gpu: null,
        },
        perDistro: [],
      };
      vi.mocked(invoke).mockResolvedValue(statsWithNullLimit);

      await useResourceStore.getState().fetchStats();

      expect(useResourceStore.getState().stats?.global.memoryLimitBytes).toBeNull();
    });
  });

  describe("per-distro resource stats", () => {
    it("stores per-distro stats correctly", async () => {
      vi.mocked(invoke).mockResolvedValue(mockStats);

      await useResourceStore.getState().fetchStats();

      const stats = useResourceStore.getState().stats;
      expect(stats?.perDistro).toHaveLength(2);
      expect(stats?.perDistro[0].name).toBe("Ubuntu");
      expect(stats?.perDistro[1].name).toBe("Debian");
    });

    it("handles null CPU percent", async () => {
      const statsWithNullCpu: ResourceStats = {
        global: mockStats.global,
        perDistro: [
          {
            name: "Ubuntu",
            ipAddress: "192.168.0.5",
            memoryUsedBytes: 1073741824,
            cpuPercent: null,
            networkRxBytes: 10_000,
            networkTxBytes: 5_000,
          },
        ],
      };
      vi.mocked(invoke).mockResolvedValue(statsWithNullCpu);

      await useResourceStore.getState().fetchStats();

      const resources = useResourceStore.getState().getDistroResources("Ubuntu");
      expect(resources?.cpuPercent).toBeNull();
    });

    it("calculates network rates from consecutive snapshots", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-06-19T00:00:00Z"));
        vi.mocked(invoke)
          .mockResolvedValueOnce(mockStats)
          .mockResolvedValueOnce({
            ...mockStats,
            perDistro: [
              {
                ...mockStats.perDistro[0],
                networkRxBytes: 2_107_152,
                networkTxBytes: 1_053_576,
              },
              mockStats.perDistro[1],
            ],
          });

        await useResourceStore.getState().fetchStats();
        expect(useResourceStore.getState().getDistroResources("Ubuntu")?.networkRxMbps).toBeUndefined();

        vi.setSystemTime(new Date("2026-06-19T00:00:05Z"));
        await useResourceStore.getState().fetchStats(true);

        const resources = useResourceStore.getState().getDistroResources("Ubuntu");
        expect(resources?.networkTxMbps).toBe(0.2);
        expect(resources?.networkRxMbps).toBe(0.4);
      } finally {
        vi.useRealTimers();
      }
    });

    it("handles empty perDistro array", async () => {
      const statsWithNoDistros: ResourceStats = {
        global: mockStats.global,
        perDistro: [],
      };
      vi.mocked(invoke).mockResolvedValue(statsWithNoDistros);

      await useResourceStore.getState().fetchStats();

      expect(useResourceStore.getState().stats?.perDistro).toEqual([]);
    });
  });
});
