export interface HyperVVm {
  id: string;
  name: string;
  state: string;
  status?: string | null;
  uptimeSeconds?: number | null;
  diskSizeBytes?: number | null;
  memoryAssignedBytes?: number | null;
  processorCount?: number | null;
  cpuUsagePercent?: number | null;
  ipAddresses: string[];
}
