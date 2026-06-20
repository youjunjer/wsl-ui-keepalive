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
  openRdp: (name: string) => Promise<void>;
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
    set({ actionInProgress: `Starting ${name}...` });
    try {
      await hypervService.startVm(name);
      await get().fetchVms(true);
    } finally {
      set({ actionInProgress: null });
    }
  },

  stopVm: async (name: string) => {
    set({ actionInProgress: `Stopping ${name}...` });
    try {
      await hypervService.stopVm(name);
      await get().fetchVms(true);
    } finally {
      set({ actionInProgress: null });
    }
  },

  pauseVm: async (name: string) => {
    set({ actionInProgress: `Pausing ${name}...` });
    try {
      await hypervService.pauseVm(name);
      await get().fetchVms(true);
    } finally {
      set({ actionInProgress: null });
    }
  },

  resumeVm: async (name: string) => {
    set({ actionInProgress: `Resuming ${name}...` });
    try {
      await hypervService.resumeVm(name);
      await get().fetchVms(true);
    } finally {
      set({ actionInProgress: null });
    }
  },

  openRdp: async (name: string) => {
    await hypervService.openRdp(name);
  },
}));

if (typeof window !== "undefined") {
  (window as unknown as { __hypervStore: typeof useHyperVStore }).__hypervStore = useHyperVStore;
}
