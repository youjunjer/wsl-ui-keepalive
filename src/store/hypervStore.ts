import { create } from "zustand";
import type { HyperVVm } from "../types/hyperv";
import { hypervService } from "../services/hypervService";
import { logger } from "../utils/logger";

interface HyperVStore {
  vms: HyperVVm[];
  isLoading: boolean;
  error: string | null;
  actionInProgress: string | null;

  fetchVms: (silent?: boolean) => Promise<void>;
  startVm: (name: string) => Promise<void>;
  stopVm: (name: string) => Promise<void>;
  pauseVm: (name: string) => Promise<void>;
  resumeVm: (name: string) => Promise<void>;
  openRdp: (id: string, name: string) => Promise<void>;
}

export const useHyperVStore = create<HyperVStore>((set, get) => ({
  vms: [],
  isLoading: false,
  error: null,
  actionInProgress: null,

  fetchVms: async (silent?: boolean) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      const vms = await hypervService.listVms();
      set(silent ? { vms, error: null } : { vms, isLoading: false, error: null });
    } catch (error) {
      logger.error("Failed to fetch Hyper-V VMs:", "HyperVStore", error);
      set(silent ? { error: String(error) } : { error: String(error), isLoading: false });
    }
  },

  startVm: async (name: string) => {
    set({ actionInProgress: name, error: null });
    try {
      await hypervService.startVm(name);
      await get().fetchVms(true);
    } catch (error) {
      logger.error("Failed to start Hyper-V VM:", "HyperVStore", name, error);
      set({ error: String(error) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  stopVm: async (name: string) => {
    set({ actionInProgress: name, error: null });
    try {
      await hypervService.stopVm(name);
      await get().fetchVms(true);
    } catch (error) {
      logger.error("Failed to stop Hyper-V VM:", "HyperVStore", name, error);
      set({ error: String(error) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  pauseVm: async (name: string) => {
    set({ actionInProgress: name, error: null });
    try {
      await hypervService.pauseVm(name);
      await get().fetchVms(true);
    } catch (error) {
      logger.error("Failed to pause Hyper-V VM:", "HyperVStore", name, error);
      set({ error: String(error) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  resumeVm: async (name: string) => {
    set({ actionInProgress: name, error: null });
    try {
      await hypervService.resumeVm(name);
      await get().fetchVms(true);
    } catch (error) {
      logger.error("Failed to resume Hyper-V VM:", "HyperVStore", name, error);
      set({ error: String(error) });
    } finally {
      set({ actionInProgress: null });
    }
  },

  openRdp: async (id: string, name: string) => {
    set({ error: null });
    try {
      await hypervService.openRdp(id);
    } catch (error) {
      logger.error("Failed to open Hyper-V console:", "HyperVStore", name, error);
      set({ error: String(error) });
    }
  },
}));

if (typeof window !== "undefined") {
  (window as unknown as { __hypervStore: typeof useHyperVStore }).__hypervStore = useHyperVStore;
}
