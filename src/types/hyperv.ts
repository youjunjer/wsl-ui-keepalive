export interface HyperVVm {
  name: string;
  state: string;
  status?: string | null;
  uptimeSeconds?: number | null;
  memoryAssignedBytes?: number | null;
  processorCount?: number | null;
  cpuUsagePercent?: number | null;
  ipAddresses: string[];
}

