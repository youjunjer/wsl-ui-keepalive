import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDistroStore } from "../store/distroStore";
import { useKeepAliveStore } from "../store/keepAliveStore";
import { useResourceStore } from "../store/resourceStore";
import { useHyperVStore } from "../store/hypervStore";
import { DistroCard } from "./DistroCard";
import { wslService } from "../services/wslService";
import { CopyIcon, GridIcon, MenuIcon, MonitorIcon, PlayIcon, RunningPersonIcon, StopIcon } from "./icons";
import type { Distribution } from "../types/distribution";
import { formatBytes } from "../types/distribution";
import type { HyperVVm } from "../types/hyperv";

type StatusFilter = "all" | "online" | "offline";
type TypeFilter = "all" | "wsl" | "hyperv";
type ViewMode = "cards" | "list";
type SortKey = "name" | "type" | "state" | "version" | "disk" | "memory" | "cpu";
type SortDirection = "asc" | "desc";
type DashboardInstance =
  | { type: "wsl"; name: string; distro: Distribution }
  | { type: "hyperv"; name: string; vm: HyperVVm };
type HyperVInstance = Extract<DashboardInstance, { type: "hyperv" }>;

const VIEW_MODE_STORAGE_KEY = "wslui-dashboard-view-mode";

function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "cards";
  return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "cards";
}

function DistroTable({
  instances,
  sortKey,
  sortDirection,
  onSortChange,
}: {
  instances: DashboardInstance[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
}) {
  const { t } = useTranslation("dashboard");
  const {
    isEnabled: isKeepAliveEnabled,
    setDistroEnabled,
    isSaving: isKeepAliveSaving,
  } = useKeepAliveStore();
  const { getDistroResources } = useResourceStore();

  const SortHeader = ({
    id,
    children,
    align = "left",
  }: {
    id: SortKey;
    children: ReactNode;
    align?: "left" | "right";
  }) => {
    const active = sortKey === id;
    return (
      <button
        type="button"
        onClick={() => onSortChange(id)}
        className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-theme-accent-primary ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-theme-accent-primary" : "text-theme-text-muted"}`}
        title={t('list.sortBy', { column: children })}
      >
        <span>{children}</span>
        {active && (
          <span className="text-[10px] font-mono leading-none">
            {sortDirection === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-theme-border-primary bg-theme-bg-secondary/40" data-testid="distro-list-view">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead className="bg-theme-bg-primary/70 border-b border-theme-border-primary">
            <tr className="text-[10px] font-mono uppercase tracking-wider text-theme-text-muted">
              <th className="px-4 py-3 font-medium"><SortHeader id="name">{t('list.name')}</SortHeader></th>
              <th className="px-3 py-3 font-medium"><SortHeader id="type">類型</SortHeader></th>
              <th className="px-3 py-3 font-medium"><SortHeader id="state">{t('list.state')}</SortHeader></th>
              <th className="px-3 py-3 font-medium"><SortHeader id="version">{t('list.version')}</SortHeader></th>
              <th className="px-3 py-3 font-medium text-right"><SortHeader id="disk" align="right">{t('common:label.disk')}</SortHeader></th>
              <th className="px-3 py-3 font-medium text-right"><SortHeader id="memory" align="right">{t('common:label.memory')}</SortHeader></th>
              <th className="px-3 py-3 font-medium text-right"><SortHeader id="cpu" align="right">{t('common:label.cpu')}</SortHeader></th>
              <th className="px-4 py-3 font-medium text-center">{t('card.keepAlive')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border-primary/70">
            {instances.map((instance) => {
              const isWsl = instance.type === "wsl";
              const distro = isWsl ? instance.distro : null;
              const vm = instance.type === "hyperv" ? instance.vm : null;
              const running = isWsl ? distro!.state === "Running" : isHyperVRunning(vm!.state);
              const vmIpAddress = vm?.ipAddresses.find((ip) => ip && !ip.includes(":"));
              const resources = isWsl && running ? getDistroResources(distro!.name) : undefined;
              const keepAliveEnabled = isWsl ? isKeepAliveEnabled(distro!.name) : false;
              const rowKey = `${instance.type}:${instance.name}`;

              return (
                <tr key={rowKey} className="hover:bg-theme-bg-hover/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        running
                          ? "bg-theme-status-running shadow-[0_0_8px_rgba(var(--status-running-rgb),0.8)]"
                          : "bg-theme-status-stopped"
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm text-theme-text-primary truncate">{instance.name}</span>
                          {distro?.isDefault && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-[rgba(var(--accent-primary-rgb),0.1)] text-theme-accent-primary rounded border border-[rgba(var(--accent-primary-rgb),0.3)] font-mono uppercase">
                              {t('common:status.primary')}
                            </span>
                          )}
                        </div>
                        {(isWsl || (running && vmIpAddress)) && (
                          <div className="text-xs text-theme-text-muted truncate">
                            {isWsl ? (distro!.osInfo || `WSL ${distro!.version}`) : `IP ${vmIpAddress}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${
                      isWsl
                        ? "bg-[rgba(var(--accent-primary-rgb),0.08)] text-theme-accent-primary border-[rgba(var(--accent-primary-rgb),0.25)]"
                        : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                    }`}>
                      {isWsl ? "WSL" : "Hyper-V"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-mono ${
                      running ? "text-theme-status-running" : "text-theme-text-muted"
                    }`}>
                      {running ? "執行" : "關閉"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-blue-400">{isWsl ? `v${distro!.version}` : "—"}</span>
                  </td>
                  <td className="px-3 py-3 text-right data-value text-xs text-theme-text-secondary">
                    {isWsl
                      ? (distro?.diskSize && distro.diskSize > 0 ? formatBytes(distro.diskSize) : "—")
                      : (vm!.diskSizeBytes ? formatBytes(vm!.diskSizeBytes) : "—")}
                  </td>
                  <td className="px-3 py-3 text-right data-value text-xs text-theme-accent-primary">
                    {isWsl
                      ? (resources ? formatBytes(resources.memoryUsedBytes) : "—")
                      : (vm!.memoryAssignedBytes ? formatBytes(vm!.memoryAssignedBytes) : "—")}
                  </td>
                  <td className="px-3 py-3 text-right data-value text-xs text-theme-status-warning">
                    {isWsl
                      ? (resources?.cpuPercent != null ? `${resources.cpuPercent.toFixed(1)}%` : "—")
                      : (running && vm!.cpuUsagePercent != null ? `${vm!.cpuUsagePercent.toFixed(1)}%` : "—")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center" title={keepAliveEnabled ? t('card.keepAlive') : t('card.keepAliveTooltip')}>
                      {isWsl ? (
                        <button
                          type="button"
                          onClick={() => setDistroEnabled(distro!.name, !keepAliveEnabled)}
                          disabled={isKeepAliveSaving}
                          data-testid="keep-alive-list-button"
                          aria-label={t('card.keepAlive')}
                          aria-pressed={keepAliveEnabled}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            keepAliveEnabled
                              ? "bg-[rgba(var(--accent-primary-rgb),0.16)] text-theme-accent-primary border-[rgba(var(--accent-primary-rgb),0.42)] hover:bg-[rgba(var(--accent-primary-rgb),0.24)]"
                              : "bg-theme-bg-tertiary hover:bg-theme-bg-hover text-theme-text-secondary hover:text-theme-text-primary border-theme-border-secondary"
                          }`}
                        >
                          <RunningPersonIcon size="sm" className={keepAliveEnabled ? "text-theme-accent-primary" : ""} />
                        </button>
                      ) : (
                        <span className="text-theme-text-muted/40">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isHyperVRunning(state: string): boolean {
  return state.toLowerCase() === "running";
}

function HyperVCard({ vm }: { vm: HyperVVm }) {
  const { t } = useTranslation("dashboard");
  const { startVm, stopVm, openRdp, actionInProgress } = useHyperVStore();
  const running = isHyperVRunning(vm.state);
  const disabled = actionInProgress === vm.name;
  const ipAddress = vm.ipAddresses.find((ip) => ip && !ip.includes(":"));

  return (
    <div className="module-card p-4 animate-fade-slide-in">
      <div className="flex items-center justify-between mb-3">
        <span className="btn-cyber text-[10px] font-mono font-semibold px-2 py-1 rounded uppercase tracking-wider leading-none bg-sky-500/10 text-sky-400 border border-sky-500/40">
          Hyper-V
        </span>
        <span className={`text-[10px] font-mono font-semibold px-3 py-1 rounded uppercase tracking-wider ${
          running
            ? "bg-[rgba(var(--status-running-rgb),0.1)] text-theme-status-running border border-[rgba(var(--status-running-rgb),0.3)]"
            : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary"
        }`}>
          {running ? "執行" : "關閉"}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className={`status-indicator ${running ? "running" : ""}`}>
          <div className={`w-3 h-3 rounded-full transition-all ${
            running
              ? "bg-theme-status-running shadow-lg shadow-[rgba(var(--status-running-rgb),0.5)]"
              : "bg-theme-status-stopped"
          }`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-theme-text-primary text-lg break-words">{vm.name}</h3>
          <p className="text-xs font-mono text-theme-text-muted mt-0.5 truncate">
            IP {ipAddress || "-"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 p-2.5 bg-theme-bg-primary/50 rounded-lg border border-theme-border-primary">
        <div className="text-center">
          <span className="data-label block mb-1">{t('common:label.disk')}</span>
          <span className="data-value text-sm text-theme-text-secondary">
            {vm.diskSizeBytes ? formatBytes(vm.diskSizeBytes) : "—"}
          </span>
        </div>
        <div className="text-center border-x border-theme-border-primary">
          <span className="data-label block mb-1">{t('common:label.memory')}</span>
          <span className="data-value text-sm text-theme-accent-primary">
            {vm.memoryAssignedBytes ? formatBytes(vm.memoryAssignedBytes) : "—"}
          </span>
        </div>
        <div className="text-center">
          <span className="data-label block mb-1">{t('common:label.cpu')}</span>
          <span className="data-value text-sm text-theme-status-warning">
            {running && vm.cpuUsagePercent != null ? `${vm.cpuUsagePercent.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => running ? stopVm(vm.name) : startVm(vm.name)}
          disabled={disabled}
          className={`btn-cyber px-2.5 py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            running
              ? "bg-[rgba(var(--status-warning-rgb),0.1)] text-theme-status-warning border border-[rgba(var(--status-warning-rgb),0.3)] hover:bg-[rgba(var(--status-warning-rgb),0.2)]"
              : "bg-[rgba(var(--status-running-rgb),0.1)] text-theme-status-running border border-[rgba(var(--status-running-rgb),0.3)] hover:bg-[rgba(var(--status-running-rgb),0.2)]"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
            {running ? <StopIcon size="sm" /> : <PlayIcon size="sm" />}
            {disabled ? "處理中" : (running ? "關閉" : "執行")}
          </span>
        </button>
        <button
          onClick={() => openRdp(vm.id, vm.name)}
          disabled={disabled || !running}
          className="btn-cyber p-2 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-theme-bg-tertiary hover:bg-theme-bg-hover text-blue-500 hover:text-blue-400 border-theme-border-secondary"
          title={t('card.openRdp')}
        >
          <MonitorIcon size="sm" />
        </button>
      </div>
    </div>
  );
}

export function DistroList() {
  const { t } = useTranslation("dashboard");
  const { t: tHeader } = useTranslation("header");
  const { distributions, isLoading } = useDistroStore();
  const { getDistroResources } = useResourceStore();
  const { vms: hypervVms, error: hypervError, fetchVms } = useHyperVStore();
  const {
    settings: keepAliveSettings,
    isSaving: isKeepAliveSaving,
    setEnabledDistros,
  } = useKeepAliveStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // WSL version toggles - both enabled by default (show all)
  const [wsl1Enabled, setWsl1Enabled] = useState(true);
  const [wsl2Enabled, setWsl2Enabled] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [wslIp, setWslIp] = useState<string | null>(null);
  const [ipCopied, setIpCopied] = useState(false);

  // Fetch WSL IP - uses wsl --system so doesn't require user distros to be running
  useEffect(() => {
    wslService.getWslIp().then(setWslIp).catch(() => setWslIp(null));
  }, []);

  useEffect(() => {
    fetchVms(true);
    const timer = window.setInterval(() => fetchVms(true), 10000);
    return () => window.clearInterval(timer);
  }, [fetchVms]);

  const copyIpToClipboard = useCallback(() => {
    if (wslIp) {
      navigator.clipboard.writeText(wslIp).then(() => {
        setIpCopied(true);
        setTimeout(() => setIpCopied(false), 1500);
      });
    }
  }, [wslIp]);

  if (isLoading && distributions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {/* Cyber loading spinner */}
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 border-2 border-[rgba(var(--accent-primary-rgb),0.3)] rounded-full" />
            <div className="absolute inset-0 border-2 border-transparent border-t-theme-accent-primary rounded-full animate-spin" />
            <div className="absolute inset-2 border-2 border-transparent border-b-[rgba(var(--accent-primary-rgb),0.5)] rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-theme-accent-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(var(--accent-primary-rgb),1)]" />
            </div>
          </div>
          <p className="text-theme-text-muted font-mono text-sm uppercase tracking-wider">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (distributions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center animate-fade-slide-in">
          {/* Empty state icon */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-theme-bg-tertiary rounded-xl border border-theme-border-secondary flex items-center justify-center">
              <svg
                className="w-10 h-10 text-theme-status-stopped"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-3 h-px bg-gradient-to-r from-theme-accent-primary/50 to-transparent" />
            <div className="absolute top-0 left-0 w-px h-3 bg-gradient-to-b from-theme-accent-primary/50 to-transparent" />
            <div className="absolute bottom-0 right-0 w-3 h-px bg-gradient-to-l from-theme-accent-primary/50 to-transparent" />
            <div className="absolute bottom-0 right-0 w-px h-3 bg-gradient-to-t from-theme-accent-primary/50 to-transparent" />
          </div>

          <h3 className="text-lg font-semibold text-theme-text-secondary mb-2">{t('emptyState.title')}</h3>
          <p className="text-theme-text-muted text-sm font-mono">
            {t('emptyState.description')}
          </p>

          {/* Decorative line */}
          <div className="w-32 h-px mx-auto mt-6 bg-gradient-to-r from-transparent via-theme-border-secondary to-transparent" />
        </div>
      </div>
    );
  }

  // Filter distributions
  const filteredDistributions = distributions.filter((distro) => {
    if (typeFilter === "hyperv") return false;

    // Status filter
    if (statusFilter === "online" && distro.state !== "Running") return false;
    if (statusFilter === "offline" && distro.state === "Running") return false;

    // WSL version toggle filter
    if (distro.version === 1 && !wsl1Enabled) return false;
    if (distro.version === 2 && !wsl2Enabled) return false;

    return true;
  });

  const filteredHyperVInstances: HyperVInstance[] = typeFilter !== "wsl"
    ? hypervVms
        .filter((vm) => {
          const running = isHyperVRunning(vm.state);
          if (statusFilter === "online") return running;
          if (statusFilter === "offline") return !running;
          return true;
        })
        .map((vm) => ({ type: "hyperv", name: vm.name, vm }))
    : [];

  // Card mode keeps the original behavior: primary first, then alphabetically by name.
  const cardDistributions = [...filteredDistributions].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  const listInstances: DashboardInstance[] = [
    ...filteredDistributions.map((distro) => ({ type: "wsl" as const, name: distro.name, distro })),
    ...filteredHyperVInstances,
  ];

  const sortedInstances = [...listInstances].sort((a, b) => {
    const valueByKey = (instance: DashboardInstance, key: SortKey) => {
      const isWsl = instance.type === "wsl";
      const distro = isWsl ? instance.distro : null;
      const vm = instance.type === "hyperv" ? instance.vm : null;
      const resources = isWsl ? getDistroResources(distro!.name) : null;
      switch (key) {
        case "name": return instance.name.toLocaleLowerCase();
        case "type": return instance.type;
        case "state": return isWsl ? (distro!.state === "Running" ? 0 : 1) : (isHyperVRunning(vm!.state) ? 0 : 1);
        case "version": return isWsl ? distro!.version : null;
        case "disk": return isWsl ? (distro!.diskSize ?? null) : (vm!.diskSizeBytes ?? null);
        case "memory": return isWsl ? (resources?.memoryUsedBytes ?? null) : (vm!.memoryAssignedBytes ?? null);
        case "cpu": return isWsl ? (resources?.cpuPercent ?? null) : (vm!.cpuUsagePercent ?? null);
      }
    };

    const valueA = valueByKey(a, sortKey);
    const valueB = valueByKey(b, sortKey);
    const direction = sortDirection === "asc" ? 1 : -1;

    if (valueA == null && valueB == null) return a.name.localeCompare(b.name);
    if (valueA == null) return 1;
    if (valueB == null) return -1;

    if (typeof valueA === "number" && typeof valueB === "number") {
      return (valueA - valueB) * direction || a.name.localeCompare(b.name);
    }

    return String(valueA).localeCompare(String(valueB)) * direction || a.name.localeCompare(b.name);
  });

  // Check if we have WSL 1 or 2 distros
  const hasWsl1 = distributions.some(d => d.version === 1);
  const hasWsl2 = distributions.some(d => d.version === 2);
  const wsl1Count = distributions.filter(d => d.version === 1).length;
  const wsl2Count = distributions.filter(d => d.version === 2).length;
  const wslCount = distributions.length;
  const hypervCount = hypervVms.length;
  const distroNames = distributions.map((d) => d.name);
  const keepAliveEnabledCount = distroNames.filter((name) => keepAliveSettings.enabledDistros.includes(name)).length;
  const allKeepAliveChecked = distroNames.length > 0 && keepAliveEnabledCount === distroNames.length;
  const isKeepAlivePartial = keepAliveEnabledCount > 0 && keepAliveEnabledCount < distroNames.length;

  // Count for filters
  const onlineCount = distributions.filter(d => d.state === "Running").length + hypervVms.filter(vm => isHyperVRunning(vm.state)).length;
  const offlineCount = distributions.filter(d => d.state !== "Running").length + hypervVms.filter(vm => !isHyperVRunning(vm.state)).length;

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || !wsl1Enabled || !wsl2Enabled;

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setWsl1Enabled(true);
    setWsl2Enabled(true);
  };

  const handleKeepAliveAllChange = async () => {
    await setEnabledDistros(allKeepAliveChecked ? [] : distroNames);
  };

  const handleViewModeChange = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode);
  };

  const handleSortChange = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "name" || nextKey === "type" || nextKey === "state" ? "asc" : "desc");
  };

  return (
    <div>
      {/* Filter Bar */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 mb-1 bg-theme-bg-primary/95 backdrop-blur-sm border-b border-theme-border-primary/50">
        <div className="flex items-center gap-2 flex-wrap">
              {/* Status Filters */}
              <div className="flex items-center gap-1 p-1 bg-theme-bg-tertiary/50 rounded-lg border border-theme-border-primary" data-testid="status-filter-group">
            <button
              onClick={() => setStatusFilter("all")}
              data-testid="status-filter-all"
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
                statusFilter === "all"
                  ? "bg-theme-accent-primary/20 text-theme-accent-primary border-theme-accent-primary/30"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
            >
              {t('filter.all')}
            </button>
            <button
              onClick={() => setStatusFilter("online")}
              data-testid="status-filter-online"
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all border flex items-center gap-1.5 ${
                statusFilter === "online"
                  ? "bg-theme-status-running/20 text-theme-status-running border-theme-status-running/30"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
              title={t('filter.onlineTooltip', { count: onlineCount })}
            >
              <span className="w-2 h-2 rounded-full bg-theme-status-running" />
              <span className="text-[10px]" data-testid="online-count">{onlineCount}</span>
            </button>
            <button
              onClick={() => setStatusFilter("offline")}
              data-testid="status-filter-offline"
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all border flex items-center gap-1.5 ${
                statusFilter === "offline"
                  ? "bg-theme-text-muted/20 text-theme-text-secondary border-theme-text-muted/30"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
              title={t('filter.offlineTooltip', { count: offlineCount })}
            >
              <span className="w-2 h-2 rounded-full bg-theme-status-stopped" />
              <span className="text-[10px]" data-testid="offline-count">{offlineCount}</span>
            </button>
              </div>

              {/* Divider - hidden on very small screens */}
              <div className="hidden sm:block w-px h-6 bg-theme-border-secondary" />

              {/* Type Filters */}
              <div className="flex items-center gap-1 p-1 bg-theme-bg-tertiary/50 rounded-lg border border-theme-border-primary" data-testid="type-filter-group">
            <button
              onClick={() => setTypeFilter("all")}
              data-testid="type-filter-all"
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
                typeFilter === "all"
                  ? "bg-theme-accent-primary/20 text-theme-accent-primary border-theme-accent-primary/30"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
              title={`全部 (${wslCount + hypervCount})`}
            >
              全部
            </button>
            <button
              onClick={() => setTypeFilter("wsl")}
              data-testid="type-filter-wsl"
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all border flex items-center gap-1 ${
                typeFilter === "wsl"
                  ? "bg-[rgba(var(--accent-primary-rgb),0.18)] text-theme-accent-primary border-[rgba(var(--accent-primary-rgb),0.35)]"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
              title={`WSL (${wslCount})`}
            >
              WSL
              <span className="text-[10px] opacity-70">{wslCount}</span>
            </button>
            <button
              onClick={() => setTypeFilter("hyperv")}
              data-testid="type-filter-hyperv"
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all border flex items-center gap-1 ${
                typeFilter === "hyperv"
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/35"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
              title={`Hyper-V (${hypervCount})`}
            >
              Hyper-V
              <span className="text-[10px] opacity-70">{hypervCount}</span>
            </button>
              </div>

            {/* WSL Version Toggle Buttons */}
            <div className="flex items-center gap-1 p-1 bg-theme-bg-tertiary/50 rounded-lg border border-theme-border-primary" data-testid="version-filter-group">
              {hasWsl1 && (
                <button
                  onClick={() => setWsl1Enabled(!wsl1Enabled)}
                  data-testid="version-filter-wsl1"
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all border flex items-center gap-1 ${
                    wsl1Enabled
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "border-transparent text-theme-text-muted/50 hover:text-theme-text-muted hover:bg-theme-bg-hover line-through"
                  }`}
                  title={wsl1Enabled ? t('filter.hideWsl1', { count: wsl1Count }) : t('filter.showWsl1', { count: wsl1Count })}
                >
                  {t('filter.v1')}
                  <span className="text-[10px] opacity-70" data-testid="wsl1-count">{wsl1Count}</span>
                </button>
              )}
              {hasWsl2 && (
                <button
                  onClick={() => setWsl2Enabled(!wsl2Enabled)}
                  data-testid="version-filter-wsl2"
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all border flex items-center gap-1 ${
                    wsl2Enabled
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "border-transparent text-theme-text-muted/50 hover:text-theme-text-muted hover:bg-theme-bg-hover line-through"
                  }`}
                  title={wsl2Enabled ? t('filter.hideWsl2', { count: wsl2Count }) : t('filter.showWsl2', { count: wsl2Count })}
                >
                  {t('filter.v2')}
                  <span className="text-[10px] opacity-70" data-testid="wsl2-count">{wsl2Count}</span>
                </button>
              )}
            </div>

            {/* All keep-alive toggle - selects only current distributions */}
            <button
              type="button"
              onClick={handleKeepAliveAllChange}
              disabled={distroNames.length === 0 || isKeepAliveSaving}
              data-testid="keep-alive-all-checkbox"
              aria-pressed={allKeepAliveChecked}
              className={`btn-cyber px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                allKeepAliveChecked
                  ? "bg-[rgba(var(--accent-primary-rgb),0.18)] text-theme-accent-primary border-[rgba(var(--accent-primary-rgb),0.45)]"
                  : isKeepAlivePartial
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/35"
                    : "bg-theme-bg-tertiary hover:bg-theme-bg-hover text-theme-text-secondary hover:text-theme-text-primary border-theme-border-secondary"
              }`}
              title={tHeader('keepAlive.allTooltip')}
            >
              <span className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                allKeepAliveChecked || isKeepAlivePartial
                  ? "border-theme-accent-primary bg-theme-accent-primary/20"
                  : "border-theme-border-secondary"
              }`}>
                {allKeepAliveChecked && <span className="w-1.5 h-1.5 rounded-[1px] bg-theme-accent-primary" />}
                {isKeepAlivePartial && !allKeepAliveChecked && <span className="w-1.5 h-px bg-amber-400" />}
              </span>
              <span className="whitespace-nowrap">{tHeader('keepAlive.all')}</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <div className="flex items-center gap-1 p-1 bg-theme-bg-tertiary/50 rounded-lg border border-theme-border-primary" data-testid="view-mode-toggle">
                <button
                  type="button"
                  onClick={() => handleViewModeChange("cards")}
                  data-testid="view-mode-cards"
                  aria-pressed={viewMode === "cards"}
                  className={`p-1.5 rounded-md border transition-all ${
                    viewMode === "cards"
                      ? "bg-theme-accent-primary/20 text-theme-accent-primary border-theme-accent-primary/30"
                      : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
                  }`}
                  title={t('view.cards')}
                >
                  <GridIcon size="sm" />
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange("list")}
                  data-testid="view-mode-list"
                  aria-pressed={viewMode === "list"}
                  className={`p-1.5 rounded-md border transition-all ${
                    viewMode === "list"
                      ? "bg-theme-accent-primary/20 text-theme-accent-primary border-theme-accent-primary/30"
                      : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
                  }`}
                  title={t('view.list')}
                >
                  <MenuIcon size="sm" />
                </button>
              </div>

              {/* IP Address */}
              {wslIp && (
                <button
                  onClick={copyIpToClipboard}
                  data-testid="wsl-ip-display"
                  className="flex items-center gap-2 px-3 py-2 bg-theme-bg-secondary border border-theme-border-primary rounded-lg whitespace-nowrap hover:bg-theme-bg-hover transition-colors group shrink-0"
                  title={t('card.ipTooltip')}
                >
                  <span className="text-xs font-mono text-theme-text-muted">{t('common:label.ip')}</span>
                  <span className="text-sm font-mono text-theme-accent-primary" data-testid="wsl-ip-value">{wslIp}</span>
                  <CopyIcon size="sm" className={`text-theme-text-muted group-hover:text-theme-accent-primary transition-colors ${ipCopied ? 'text-theme-status-running' : ''}`} />
                  {ipCopied && <span className="text-[10px] text-theme-status-running" data-testid="ip-copied-indicator">{t('common:label.copied')}</span>}
                </button>
              )}
            </div>
          </div>
        </div>

      {hypervError && (
        <div className="mb-4 rounded-lg border border-theme-status-error/30 bg-theme-status-error/10 px-4 py-3 text-xs font-mono text-theme-status-error">
          Hyper-V: {hypervError}
        </div>
      )}

      {/* Distribution Grid */}
      {listInstances.length === 0 ? (
        <div className="flex items-center justify-center h-40" data-testid="empty-filter-state">
          <div className="text-center">
            <p className="text-theme-text-muted text-sm" data-testid="empty-filter-message">
              {distributions.length === 0 && hypervVms.length === 0
                ? t('emptyFilter.noDistros')
                : t('emptyFilter.noMatch')}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                data-testid="clear-filters-button"
                className="mt-2 text-xs text-theme-accent-primary hover:underline"
              >
                {t('emptyFilter.clearFilters')}
              </button>
            )}
          </div>
        </div>
      ) : (
        viewMode === "cards" ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" data-testid="distro-card-view">
            {cardDistributions.map((distro, index) => (
              <DistroCard key={`wsl:${distro.name}`} distro={distro} index={index} />
            ))}
            {filteredHyperVInstances.map((instance) => (
              <HyperVCard key={`hyperv:${instance.name}`} vm={instance.vm} />
            ))}
          </div>
        ) : (
          <DistroTable
            instances={sortedInstances}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
          />
        )
      )}
    </div>
  );
}
