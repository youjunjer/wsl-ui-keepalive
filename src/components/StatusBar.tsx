import { useEffect, useState, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDistroStore } from "../store/distroStore";
import { useHyperVStore } from "../store/hypervStore";
import { useResourceStore } from "../store/resourceStore";
import { useSettingsStore } from "../store/settingsStore";
import { useMountStore } from "../store/mountStore";
import { useHealthStore } from "../store/healthStore";
import { usePollingStore } from "../store/pollingStore";
import { useNotificationStore } from "../store/notificationStore";
import { usePreflightStore } from "../store/preflightStore";
import { wslService } from "../services/wslService";
import { MountedDisksPanel } from "./MountedDisksPanel";
import { ChartBarIcon, FolderIcon, GpuIcon, NetworkIcon, PlayIcon, ServerIcon } from "./icons";

// Check if running in Tauri or browser (mock mode)
const isMockMode = (): boolean => {
  return typeof window !== "undefined" && !("__TAURI__" in window);
};

// Format bytes to human readable string
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

// Health status color mapping
const healthColors = {
  stopped: "bg-theme-status-stopped",
  healthy: "bg-theme-status-running",
  warning: "bg-theme-status-warning",
  unhealthy: "bg-theme-status-error",
};

const healthGlowColors = {
  stopped: "",
  healthy: "shadow-[0_0_8px_rgba(var(--status-running-rgb),1)]",
  warning: "shadow-[0_0_8px_rgba(var(--status-warning-rgb),1)]",
  unhealthy: "shadow-[0_0_8px_rgba(var(--status-error-rgb),1)]",
};

// Minimum time to display status message (ms) - ensures users see feedback
const MIN_STATUS_DISPLAY_TIME = 800;

function StatusMetric({
  icon,
  value,
  title,
  className = "text-theme-text-secondary",
}: {
  icon: ReactNode;
  value: ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-help"
      title={title}
      aria-label={title}
    >
      <span className="text-theme-text-muted">{icon}</span>
      <span className={`data-value text-xs ${className}`}>{value}</span>
    </div>
  );
}

export function StatusBar() {
  const { t } = useTranslation("statusbar");
  const { distributions, actionInProgress, isLoading, setActionInProgress } = useDistroStore();
  const { vms: hypervVms } = useHyperVStore();
  const { stats: resourceStats } = useResourceStore();
  const { settings } = useSettingsStore();
  const { mountedDisks, loadMountedDisks, openMountDialog } = useMountStore();
  const { health, versionInfo, fetchVersion } = useHealthStore();
  const { hasBackoff, getBackoffMessage } = usePollingStore();
  const { addNotification } = useNotificationStore();
  const { isReady: wslReady, status: preflightStatus, message: preflightMessage } = usePreflightStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMountPanel, setShowMountPanel] = useState(false);
  const [displayedStatus, setDisplayedStatus] = useState<string | null>(null);
  const statusStartTimeRef = useRef<number | null>(null);
  const diskButtonRef = useRef<HTMLButtonElement>(null);
  const runningCount = distributions.filter((d) => d.state === "Running").length;
  const runningVmCount = hypervVms.filter((vm) => vm.state.toLowerCase() === "running").length;
  const combinedInstanceCount = distributions.length + hypervVms.length;
  const combinedRunningCount = runningCount + runningVmCount;
  const defaultDistro = distributions.find((d) => d.isDefault);
  const mockMode = isMockMode();
  const isBackedOff = hasBackoff();
  const backoffMessage = getBackoffMessage();

  // Show status immediately, but keep it visible for a minimum duration
  // This ensures users see feedback even for fast operations
  const currentStatus = actionInProgress || (isLoading ? "Syncing..." : null);
  useEffect(() => {
    if (currentStatus) {
      // Show status immediately and track start time
      setDisplayedStatus(currentStatus);
      statusStartTimeRef.current = Date.now();
    } else if (statusStartTimeRef.current !== null) {
      // Status cleared - ensure minimum display time before hiding
      const elapsed = Date.now() - statusStartTimeRef.current;
      const remaining = MIN_STATUS_DISPLAY_TIME - elapsed;

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setDisplayedStatus(null);
          statusStartTimeRef.current = null;
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        setDisplayedStatus(null);
        statusStartTimeRef.current = null;
      }
    }
  }, [currentStatus]);

  // Load mounted disks when WSL is ready
  useEffect(() => {
    if (wslReady) {
      loadMountedDisks();
    }
  }, [wslReady, loadMountedDisks]);

  // Handle WSL update
  const handleUpdate = async () => {
    setIsUpdating(true);
    setActionInProgress("Updating WSL...");
    try {
      // Pass current version for before/after comparison
      const result = await wslService.updateWsl(settings.usePreReleaseUpdates, versionInfo?.wslVersion);
      // Show success notification
      addNotification({
        type: "success",
        title: "WSL Update",
        message: result || "Update completed successfully",
        autoDismiss: 5000,
      });
      // Refresh version info after update
      fetchVersion();
    } catch (error) {
      // Tauri errors can be strings, Error objects, or objects with message property
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : (error as { message?: string })?.message || "Update failed";
      const isCancelled = message.toLowerCase().includes("cancelled");
      // User cancellation is a warning with auto-dismiss; real errors stay visible
      addNotification({
        type: isCancelled ? "warning" : "error",
        title: isCancelled ? "WSL Update" : "WSL Update Failed",
        message,
        autoDismiss: isCancelled ? 3000 : 0,
      });
    } finally {
      setIsUpdating(false);
      setActionInProgress(null);
    }
  };

  // Build tooltip for version info
  const versionTooltip = versionInfo
    ? `WSL version: ${versionInfo.wslVersion}\nKernel: ${versionInfo.kernelVersion}\nWSLg: ${versionInfo.wslgVersion}\nWindows: ${versionInfo.windowsVersion}`
    : "Loading...";

  // Calculate memory stats
  const memoryStats = resourceStats && resourceStats.perDistro.length > 0 ? (() => {
    const wslMemory = resourceStats.perDistro.reduce((sum, d) => sum + d.memoryUsedBytes, 0);
    const hypervMemory = hypervVms.reduce((sum, vm) => (
      vm.state.toLowerCase() === "running" && vm.memoryAssignedBytes
        ? sum + vm.memoryAssignedBytes
        : sum
    ), 0);
    const totalMemory = wslMemory + hypervMemory;
    const memoryLimit = resourceStats.global.memoryLimitBytes;
    return { totalMemory, memoryLimit };
  })() : (() => {
    const hypervMemory = hypervVms.reduce((sum, vm) => (
      vm.state.toLowerCase() === "running" && vm.memoryAssignedBytes
        ? sum + vm.memoryAssignedBytes
        : sum
    ), 0);
    return hypervMemory > 0 ? { totalMemory: hypervMemory, memoryLimit: undefined } : null;
  })();
  const totalDiskSize = distributions.reduce((sum, distro) => (
    distro.diskSize && distro.diskSize > 0 ? sum + distro.diskSize : sum
  ), 0) + hypervVms.reduce((sum, vm) => (
    vm.diskSizeBytes && vm.diskSizeBytes > 0 ? sum + vm.diskSizeBytes : sum
  ), 0);
  const networkStats = resourceStats && resourceStats.perDistro.length > 0 ? (() => {
    const totals = resourceStats.perDistro.reduce((sum, distro) => ({
      tx: Math.max(sum.tx, distro.networkTxMbps ?? 0),
      rx: Math.max(sum.rx, distro.networkRxMbps ?? 0),
      hasValue: sum.hasValue || distro.networkTxMbps != null || distro.networkRxMbps != null,
    }), { tx: 0, rx: 0, hasValue: false });
    return totals.hasValue ? totals : null;
  })() : null;
  const gpuStats = resourceStats?.global.gpu;
  const gpuValue = gpuStats ? (() => {
    const usage = gpuStats.utilizationPercent != null
      ? `${gpuStats.utilizationPercent.toFixed(0)}%`
      : "—";
    const memory = gpuStats.memoryUsedBytes != null
      ? formatBytes(gpuStats.memoryUsedBytes)
      : "—";
    return `${usage} / ${memory}`;
  })() : null;
  const gpuTooltip = gpuStats ? [
    gpuStats.name,
    gpuStats.memoryUsedBytes != null && gpuStats.memoryTotalBytes != null
      ? `${formatBytes(gpuStats.memoryUsedBytes)} / ${formatBytes(gpuStats.memoryTotalBytes)}`
      : null,
  ].filter(Boolean).join("\n") : undefined;

  return (
    <footer data-testid="status-bar" className="relative px-6 py-2 border-t border-theme-border-primary bg-gradient-to-r from-theme-bg-primary via-theme-bg-secondary to-theme-bg-primary">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/20 to-transparent" />

      <div className="flex items-center justify-between gap-3">
        {/* Left: System telemetry */}
        <div className="flex items-center gap-4 min-w-0 flex-1 overflow-hidden">
          {/* Status indicator - single light for health/connection status */}
          {/* Priority: backoff > preflight failure > health status */}
          <div
            className="cursor-help"
            title={
              isBackedOff
                ? (backoffMessage || "Connection issues - auto-refresh slowed")
                : !wslReady && preflightStatus
                  ? `WSL Not Ready: ${preflightMessage}`
                  : (health?.message || "Loading...")
            }
          >
            <div className={`w-2.5 h-2.5 rounded-full ${
              isBackedOff
                ? "bg-theme-status-warning animate-pulse shadow-[0_0_8px_rgba(var(--status-warning-rgb),1)]"
                : !wslReady && preflightStatus
                  ? `${healthColors.unhealthy} ${healthGlowColors.unhealthy}`
                  : health
                    ? `${healthColors[health.status]} ${healthGlowColors[health.status]}`
                    : "bg-theme-status-stopped"
            }`} />
          </div>

          {/* WSL Version */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="data-label">{t('wsl')}</span>
            <span
              className="data-value text-xs text-theme-accent-primary cursor-help"
              title={versionTooltip}
            >
              v{versionInfo?.wslVersion || "..."}
            </span>
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              data-testid="wsl-update-button"
              className="p-1 rounded hover:bg-theme-bg-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed group min-w-[44px] flex justify-center"
              title={
                isUpdating
                  ? t('updateWsl.updating')
                  : settings.usePreReleaseUpdates
                    ? t('updateWsl.preRelease')
                    : t('updateWsl.default')
              }
            >
              {isUpdating ? (
                <div className="flex items-center gap-1" data-testid="wsl-update-spinner">
                  <div className="w-3 h-3 border border-theme-status-warning border-t-transparent rounded-full animate-spin" />
                  <span className="text-[9px] text-theme-status-warning font-medium animate-pulse">{t('updateWsl.uac')}</span>
                </div>
              ) : (
                <svg className="w-3 h-3 text-theme-text-muted group-hover:text-theme-accent-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 0-9-9M3 12a9 9 0 0 0 9 9m0-18v6m0 12v-6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 3l3 3-3 3M12 21l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          {/* Disk Mount Button */}
          <div className="relative shrink-0">
            <button
              ref={diskButtonRef}
              onClick={() => setShowMountPanel(!showMountPanel)}
              data-testid="disk-mounts-button"
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-theme-bg-tertiary transition-colors group"
              title={mountedDisks.length > 0 ? t('diskMounts.count', { count: mountedDisks.length }) : t('diskMounts.empty')}
            >
              <svg className="w-3.5 h-3.5 text-theme-text-muted group-hover:text-theme-accent-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {mountedDisks.length > 0 && (
                <span className="data-value text-[10px] text-theme-accent-primary">
                  {mountedDisks.length}
                </span>
              )}
            </button>
            <MountedDisksPanel
              isOpen={showMountPanel}
              onClose={() => setShowMountPanel(false)}
              onMountNew={openMountDialog}
              anchorRef={diskButtonRef}
            />
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-theme-border-secondary shrink-0" />

          {/* Distribution stats */}
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            {mockMode && (
              <span className="px-2 py-0.5 bg-[rgba(var(--status-warning-rgb),0.1)] text-theme-status-warning rounded text-[10px] font-mono font-semibold border border-[rgba(var(--status-warning-rgb),0.3)] uppercase tracking-wider shrink-0">
                {t('dev')}
              </span>
            )}

            <StatusMetric
              icon={<ServerIcon size="sm" />}
              value={combinedInstanceCount}
              title={`${t('instances')}\nWSL ${distributions.length} / Hyper-V ${hypervVms.length}`}
            />

            <StatusMetric
              icon={<PlayIcon size="sm" />}
              value={combinedRunningCount}
              title={`${t('active')}\nWSL ${runningCount} / Hyper-V ${runningVmCount}`}
              className={combinedRunningCount > 0 ? 'text-theme-status-running' : 'text-theme-text-muted'}
            />

            {memoryStats && memoryStats.totalMemory > 0 && (
              <StatusMetric
                icon={<ChartBarIcon size="sm" />}
                value={formatBytes(memoryStats.totalMemory)}
                title={`${t('mem')}\nWSL + Hyper-V`}
              />
            )}

            {totalDiskSize > 0 && (
              <StatusMetric
                icon={<FolderIcon size="sm" />}
                value={formatBytes(totalDiskSize)}
                title={`${t('diskTotal')}\nWSL + Hyper-V`}
              />
            )}

            {networkStats && (
              <StatusMetric
                icon={<NetworkIcon size="sm" />}
                value={`${networkStats.tx.toFixed(2)}/${networkStats.rx.toFixed(2)}`}
                title={`${t('networkTotal')}\n${t('networkTooltip')}`}
                className="text-theme-accent-primary"
              />
            )}

            {gpuValue && (
              <StatusMetric
                icon={<GpuIcon size="sm" />}
                value={gpuValue}
                title={[t('gpu'), gpuTooltip].filter(Boolean).join("\n")}
                className="text-theme-status-running"
              />
            )}

            {defaultDistro && (
              <div className="hidden 2xl:flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <span className="data-label">{t('primary')}</span>
                <span className="data-value text-xs text-theme-accent-primary">{defaultDistro.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Status - fixed width to prevent jumping */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="relative z-10 flex items-center gap-3 shrink-0 justify-end min-w-4 xl:min-w-28"
        >
          {displayedStatus ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-3 h-3 shrink-0 border-2 border-theme-accent-primary border-t-transparent rounded-full animate-spin" />
              <span
                className="data-value text-xs text-theme-accent-primary truncate"
                title={displayedStatus}
              >
                {displayedStatus}
              </span>
            </div>
          ) : combinedRunningCount > 0 ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 shrink-0 rounded-full bg-theme-status-running shadow-[0_0_8px_rgba(var(--status-running-rgb),1)] animate-pulse" />
              <span className="hidden xl:inline data-value text-xs text-theme-status-running">{t('common:status.operational')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 shrink-0 rounded-full bg-theme-status-stopped" />
              <span className="hidden xl:inline data-value text-xs text-theme-text-muted">{t('common:status.standby')}</span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
