import { invoke } from "@tauri-apps/api/core";
import type { HyperVVm } from "../types/hyperv";
import { debug, info } from "../utils/logger";

export const hypervService = {
  async listVms(): Promise<HyperVVm[]> {
    debug("[hypervService] Listing Hyper-V VMs");
    return await invoke<HyperVVm[]>("list_hyperv_vms");
  },

  async startVm(name: string): Promise<void> {
    info(`[hypervService] Starting VM: ${name}`);
    await invoke("start_hyperv_vm", { name });
  },

  async stopVm(name: string): Promise<void> {
    info(`[hypervService] Stopping VM: ${name}`);
    await invoke("stop_hyperv_vm", { name });
  },

  async pauseVm(name: string): Promise<void> {
    info(`[hypervService] Pausing VM: ${name}`);
    await invoke("pause_hyperv_vm", { name });
  },

  async resumeVm(name: string): Promise<void> {
    info(`[hypervService] Resuming VM: ${name}`);
    await invoke("resume_hyperv_vm", { name });
  },
};

