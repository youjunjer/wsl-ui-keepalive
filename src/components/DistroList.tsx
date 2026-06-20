import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDistroStore } from "../store/distroStore";
import { useKeepAliveStore } from "../store/keepAliveStore";
import { useResourceStore } from "../store/resourceStore";
import { DistroCard } from "./DistroCard";
import { wslService } from "../services/wslService";
import { CopyIcon, GridIcon, MenuIcon, RunningPersonIcon, SourceIcon } from "./icons";
import type { Distribution, InstallSource } from "../types/distribution";
import { formatBytes, INSTALL_SOURCE_COLORS, INSTALL_SOURCE_NAMES } from "../types/distribution";

type StatusFilter = "all" | "online" | "offline";
type ViewMode = "cards" | "list";
type SortKey = "name" | "state" | "version" | "source" | "disk" | "memory" | "cpu";
type SortDirection = "asc" | "desc";

const VIEW_MODE_STORAGE_KEY = "wslui-dashboard-view-mode";

function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "cards";
  return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "cards";
}

function DistroTable({
  distributions,
  sortKey,
  sortDirection,
  onSortChange,
}: {
  distributions: Distribution[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
}) {
  const { t } = useTranslation("dashboard");
  const { isEnabled: isKeepAliveEnabled } = useKeepAliveStore();
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
          <span className="text-[9px] font-mono uppercase">
            {sortDirection}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-theme-border-primary bg-theme-bg-secondary/40" data-testid="distro-list-view">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-theme-bg-primary/70 border-b border-theme-border-primary">
            <tr className="text-[10px] font-mono uppercase tracking-wider text-theme-text-muted">
              <th className="px-4 py-3 font-medium"><SortHeader id="name">{t('list.name')}</SortHeader></th>
              <th className="px-3 py-3 font-medium"><SortHeader id="state">{t('list.state')}</SortHeader></th>
              <th className="px-3 py-3 font-medium"><SortHeader id="version">{t('list.version')}</SortHeader></th>
              <th className="px-3 py-3 font-medium"><SortHeader id="source">{t('list.source')}</SortHeader></th>
              <th className="px-3 py-3 font-medium text-right"><SortHeader id="disk" align="right">{t('common:label.disk')}</SortHeader></th>
              <th className="px-3 py-3 font-medium text-right"><SortHeader id="memory" align="right">{t('common:label.memory')}</SortHeader></th>
              <th className="px-3 py-3 font-medium text-right"><SortHeader id="cpu" align="right">{t('common:label.cpu')}</SortHeader></th>
              <th className="px-4 py-3 font-medium text-center">{t('card.keepAlive')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border-primary/70">
            {distributions.map((distro) => {
              const resources = distro.state === "Running" ? getDistroResources(distro.name) : undefined;
              const source = distro.metadata?.installSource || "unknown";
              const sourceColor = INSTALL_SOURCE_COLORS[source];
              const keepAliveEnabled = isKeepAliveEnabled(distro.name);

              return (
                <tr key={distro.name} className="hover:bg-theme-bg-hover/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        distro.state === "Running"
                          ? "bg-theme-status-running shadow-[0_0_8px_rgba(var(--status-running-rgb),0.8)]"
                          : "bg-theme-status-stopped"
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm text-theme-text-primary truncate">{distro.name}</span>
                          {distro.isDefault && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-[rgba(var(--accent-primary-rgb),0.1)] text-theme-accent-primary rounded border border-[rgba(var(--accent-primary-rgb),0.3)] font-mono uppercase">
                              {t('common:status.primary')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-theme-text-muted truncate">{distro.osInfo || `WSL ${distro.version}`}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-mono ${
                      distro.state === "Running" ? "text-theme-status-running" : "text-theme-text-muted"
                    }`}>
                      {distro.state === "Running" ? t('common:status.online') : t('common:status.offline')}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-blue-400">v{distro.version}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2" title={INSTALL_SOURCE_NAMES[source]}>
                      <SourceIcon source={source} className="!w-4 !h-4" />
                      <span className="text-xs text-theme-text-secondary" style={{ color: sourceColor }}>
                        {INSTALL_SOURCE_NAMES[source]}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right data-value text-xs text-theme-text-secondary">
                    {distro.diskSize && distro.diskSize > 0 ? formatBytes(distro.diskSize) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right data-value text-xs text-theme-accent-primary">
                    {resources ? formatBytes(resources.memoryUsedBytes) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right data-value text-xs text-theme-status-warning">
                    {resources?.cpuPercent != null ? `${resources.cpuPercent.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center" title={keepAliveEnabled ? t('card.keepAlive') : t('card.keepAliveTooltip')}>
                      <RunningPersonIcon
                        size="sm"
                        className={keepAliveEnabled ? "text-theme-accent-primary" : "text-theme-text-muted/50"}
                      />
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

export function DistroList() {
  const { t } = useTranslation("dashboard");
  const { t: tHeader } = useTranslation("header");
  const { distributions, isLoading } = useDistroStore();
  const { getDistroResources } = useResourceStore();
  const {
    settings: keepAliveSettings,
    isSaving: isKeepAliveSaving,
    setEnabledDistros,
  } = useKeepAliveStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<InstallSource | "all">("all");
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
    // Status filter
    if (statusFilter === "online" && distro.state !== "Running") return false;
    if (statusFilter === "offline" && distro.state === "Running") return false;

    // Source filter
    if (sourceFilter !== "all") {
      const source = distro.metadata?.installSource || "unknown";
      if (source !== sourceFilter) return false;
    }

    // WSL version toggle filter
    if (distro.version === 1 && !wsl1Enabled) return false;
    if (distro.version === 2 && !wsl2Enabled) return false;

    return true;
  });

  // Card mode keeps the original behavior: primary first, then alphabetically by name.
  const cardDistributions = [...filteredDistributions].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  const sortedDistributions = [...filteredDistributions].sort((a, b) => {
    const sourceA = a.metadata?.installSource || "unknown";
    const sourceB = b.metadata?.installSource || "unknown";
    const resourcesA = getDistroResources(a.name);
    const resourcesB = getDistroResources(b.name);
    const valueByKey = (distro: Distribution, key: SortKey) => {
      const resources = distro.name === a.name ? resourcesA : resourcesB;
      switch (key) {
        case "name": return distro.name.toLocaleLowerCase();
        case "state": return distro.state === "Running" ? 0 : 1;
        case "version": return distro.version;
        case "source": return distro === a ? sourceA : sourceB;
        case "disk": return distro.diskSize ?? null;
        case "memory": return resources?.memoryUsedBytes ?? null;
        case "cpu": return resources?.cpuPercent ?? null;
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

  // Get unique sources present in the distributions, in preferred display order
  const sourceOrder: InstallSource[] = ["store", "lxc", "container", "download", "import", "clone", "unknown"];
  const availableSources = sourceOrder.filter(source =>
    distributions.some(d => (d.metadata?.installSource || "unknown") === source)
  );

  // Check if we have WSL 1 or 2 distros
  const hasWsl1 = distributions.some(d => d.version === 1);
  const hasWsl2 = distributions.some(d => d.version === 2);
  const wsl1Count = distributions.filter(d => d.version === 1).length;
  const wsl2Count = distributions.filter(d => d.version === 2).length;
  const distroNames = distributions.map((d) => d.name);
  const keepAliveEnabledCount = distroNames.filter((name) => keepAliveSettings.enabledDistros.includes(name)).length;
  const allKeepAliveChecked = distroNames.length > 0 && keepAliveEnabledCount === distroNames.length;
  const isKeepAlivePartial = keepAliveEnabledCount > 0 && keepAliveEnabledCount < distroNames.length;

  // Count for filters
  const onlineCount = distributions.filter(d => d.state === "Running").length;
  const offlineCount = distributions.filter(d => d.state !== "Running").length;

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== "all" || sourceFilter !== "all" || !wsl1Enabled || !wsl2Enabled;

  const clearFilters = () => {
    setStatusFilter("all");
    setSourceFilter("all");
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
    setSortDirection(nextKey === "name" || nextKey === "state" || nextKey === "source" ? "asc" : "desc");
  };

  return (
    <div>
      {/* Filter Bar - Two rows on mobile, one row on desktop */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 mb-1 bg-theme-bg-primary/95 backdrop-blur-sm border-b border-theme-border-primary/50">
        <div className="relative">
        {/* IP Address - Always top right */}
        {wslIp && (
          <button
            onClick={copyIpToClipboard}
            data-testid="wsl-ip-display"
            className="absolute right-0 top-0 flex items-center gap-2 px-3 py-2 bg-theme-bg-secondary border border-theme-border-primary rounded-lg whitespace-nowrap hover:bg-theme-bg-hover transition-colors group z-10"
            title={t('card.ipTooltip')}
          >
            <span className="text-xs font-mono text-theme-text-muted">{t('common:label.ip')}</span>
            <span className="text-sm font-mono text-theme-accent-primary" data-testid="wsl-ip-value">{wslIp}</span>
            <CopyIcon size="sm" className={`text-theme-text-muted group-hover:text-theme-accent-primary transition-colors ${ipCopied ? 'text-theme-status-running' : ''}`} />
            {ipCopied && <span className="text-[10px] text-theme-status-running" data-testid="ip-copied-indicator">{t('common:label.copied')}</span>}
          </button>
        )}

        {/* Filters */}
        <div className={`flex items-center gap-2 flex-wrap ${wslIp ? 'pr-44 lg:pr-48' : ''}`}>
          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
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

          {/* Source Filters */}
          <div className="flex items-center gap-1 p-1 bg-theme-bg-tertiary/50 rounded-lg border border-theme-border-primary" data-testid="source-filter-group">
            <button
              onClick={() => setSourceFilter("all")}
              data-testid="source-filter-all"
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
                sourceFilter === "all"
                  ? "bg-theme-accent-primary/20 text-theme-accent-primary border-theme-accent-primary/30"
                  : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
              }`}
              title={t('filter.allSources')}
            >
              <span className="hidden sm:inline">{t('filter.allSources')}</span>
              <span className="sm:hidden">{t('filter.allSourcesMobile')}</span>
            </button>
            {availableSources.map((source) => {
              const count = distributions.filter(d => (d.metadata?.installSource || "unknown") === source).length;
              const color = INSTALL_SOURCE_COLORS[source];
              const name = INSTALL_SOURCE_NAMES[source];
              const isSelected = sourceFilter === source;
              return (
                <button
                  key={source}
                  onClick={() => setSourceFilter(source)}
                  data-testid={`source-filter-${source}`}
                  className={`p-1.5 text-xs font-medium rounded-md transition-all border ${
                    isSelected ? "" : "border-transparent text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-hover"
                  }`}
                  style={isSelected ? {
                    backgroundColor: `${color}20`,
                    color: color,
                    borderColor: `${color}50`,
                  } : undefined}
                  title={`${name} (${count})`}
                >
                  <SourceIcon source={source} className="!w-[15px] !h-[15px]" />
                </button>
              );
            })}
          </div>

          {/* Divider - hidden on very small screens */}
          <div className="hidden sm:block w-px h-6 bg-theme-border-secondary" />

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
          </div>

          <div className="ml-auto flex items-center gap-1 p-1 bg-theme-bg-tertiary/50 rounded-lg border border-theme-border-primary" data-testid="view-mode-toggle">
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
        </div>
        </div>
      </div>

      {/* Distribution Grid */}
      {sortedDistributions.length === 0 ? (
        <div className="flex items-center justify-center h-40" data-testid="empty-filter-state">
          <div className="text-center">
            <p className="text-theme-text-muted text-sm" data-testid="empty-filter-message">
              {distributions.length === 0
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
              <DistroCard key={distro.name} distro={distro} index={index} />
            ))}
          </div>
        ) : (
          <DistroTable
            distributions={sortedDistributions}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
          />
        )
      )}
    </div>
  );
}
