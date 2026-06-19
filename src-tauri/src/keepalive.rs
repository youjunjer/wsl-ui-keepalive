use crate::settings::{get_executable_paths, KeepAliveSettings};
use crate::utils::{get_config_dir, hidden_command, is_mock_mode};
use serde::Serialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

const TASK_NAME: &str = "WSL-UI-KeepAlive";
const WATCHER_SCRIPT: &str = "watch-all-wsl.ps1";
const INSTALL_SCRIPT: &str = "install-keepalive-task.ps1";
const CONFIG_FILE: &str = "keepalive-config.json";
const LOG_FILE: &str = "watch-all-wsl.log";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepAliveRuntimeConfig {
    pub enabled_distros: Vec<String>,
    pub check_interval_secs: u64,
    pub log_path: String,
}

pub fn reconcile_keepalive(
    previous: &KeepAliveSettings,
    next: &KeepAliveSettings,
) -> Result<(), String> {
    write_keepalive_files(next)?;

    let removed = removed_distros(previous, next);
    if !removed.is_empty() {
        stop_keepalive_clients(&removed)?;
    }

    if next.enabled_distros.is_empty() {
        stop_task()?;
        stop_keepalive_clients(&previous.enabled_distros)?;
        return Ok(());
    }

    install_task(next)?;
    start_task()?;
    run_once(next)?;
    Ok(())
}

fn removed_distros(previous: &KeepAliveSettings, next: &KeepAliveSettings) -> Vec<String> {
    let next_set: BTreeSet<&String> = next.enabled_distros.iter().collect();
    previous
        .enabled_distros
        .iter()
        .filter(|name| !next_set.contains(name))
        .cloned()
        .collect()
}

fn keepalive_dir() -> PathBuf {
    get_config_dir().join("keepalive")
}

fn write_keepalive_files(settings: &KeepAliveSettings) -> Result<(), String> {
    let dir = keepalive_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create keep alive directory: {}", e))?;

    let runtime_config = KeepAliveRuntimeConfig {
        enabled_distros: settings.enabled_distros.clone(),
        check_interval_secs: settings.check_interval_secs,
        log_path: dir.join(LOG_FILE).to_string_lossy().to_string(),
    };

    let config_json = serde_json::to_string_pretty(&runtime_config)
        .map_err(|e| format!("Failed to serialize keep alive config: {}", e))?;
    fs::write(dir.join(CONFIG_FILE), config_json)
        .map_err(|e| format!("Failed to write keep alive config: {}", e))?;

    fs::write(dir.join(WATCHER_SCRIPT), watcher_script())
        .map_err(|e| format!("Failed to write keep alive watcher: {}", e))?;
    fs::write(dir.join(INSTALL_SCRIPT), install_script())
        .map_err(|e| format!("Failed to write keep alive installer: {}", e))?;

    Ok(())
}

fn install_task(settings: &KeepAliveSettings) -> Result<(), String> {
    if is_mock_mode() {
        return Ok(());
    }

    let dir = keepalive_dir();
    let installer = dir.join(INSTALL_SCRIPT);
    run_powershell_file(
        &installer,
        &[
            ("TaskName", TASK_NAME.to_string()),
            (
                "WatcherPath",
                dir.join(WATCHER_SCRIPT).to_string_lossy().to_string(),
            ),
            (
                "CheckIntervalSeconds",
                settings.check_interval_secs.to_string(),
            ),
        ],
    )
}

fn start_task() -> Result<(), String> {
    if is_mock_mode() {
        return Ok(());
    }
    run_powershell_command(&format!(
        "Start-ScheduledTask -TaskName {} -ErrorAction Stop",
        ps_quote(TASK_NAME)
    ))
}

fn stop_task() -> Result<(), String> {
    if is_mock_mode() {
        return Ok(());
    }
    run_powershell_command(&format!(
        "if (Get-ScheduledTask -TaskName {task} -ErrorAction SilentlyContinue) {{ Stop-ScheduledTask -TaskName {task} -ErrorAction SilentlyContinue }}",
        task = ps_quote(TASK_NAME)
    ))
}

fn run_once(settings: &KeepAliveSettings) -> Result<(), String> {
    if is_mock_mode() {
        return Ok(());
    }
    let watcher = keepalive_dir().join(WATCHER_SCRIPT);
    run_powershell_file(
        &watcher,
        &[
            (
                "ConfigPath",
                keepalive_dir().join(CONFIG_FILE).to_string_lossy().to_string(),
            ),
            ("Once", String::new()),
            (
                "CheckIntervalSeconds",
                settings.check_interval_secs.to_string(),
            ),
        ],
    )
}

fn stop_keepalive_clients(distros: &[String]) -> Result<(), String> {
    if is_mock_mode() || distros.is_empty() {
        return Ok(());
    }

    let distro_array = distros
        .iter()
        .map(|name| ps_quote(name))
        .collect::<Vec<_>>()
        .join(",");
    let command = format!(
        r#"
$distros = @({distro_array})
foreach ($distro in $distros) {{
    $escaped = [regex]::Escape($distro)
    $pattern = "(^|\s)-d\s+(`"?$escaped`"?)\s+--exec\s+sleep\s+infinity(\s|$)"
    Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" |
        Where-Object {{ $_.CommandLine -and $_.CommandLine -match $pattern }} |
        ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}
}}
"#
    );
    run_powershell_command(&command)
}

fn run_powershell_file(path: &PathBuf, params: &[(&str, String)]) -> Result<(), String> {
    let powershell = get_executable_paths().powershell;
    let mut command = hidden_command(&powershell);
    command
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(path);

    for (name, value) in params {
        command.arg(format!("-{}", name));
        if !value.is_empty() {
            command.arg(value);
        }
    }

    run_command(command)
}

fn run_powershell_command(script: &str) -> Result<(), String> {
    let powershell = get_executable_paths().powershell;
    let mut command = hidden_command(&powershell);
    command
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script);

    run_command(command)
}

fn run_command(mut command: std::process::Command) -> Result<(), String> {
    let output = command
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {}", e))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if stderr.is_empty() {
        stdout
    } else {
        stderr
    })
}

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn watcher_script() -> &'static str {
    r#"[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "keepalive-config.json"),
    [int]$CheckIntervalSeconds = 60,
    [switch]$Once
)

$ErrorActionPreference = "Continue"

function Read-KeepAliveConfig {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        return [pscustomobject]@{
            enabledDistros = @()
            checkIntervalSecs = $CheckIntervalSeconds
            logPath = (Join-Path $PSScriptRoot "watch-all-wsl.log")
        }
    }

    try {
        return Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        return [pscustomobject]@{
            enabledDistros = @()
            checkIntervalSecs = $CheckIntervalSeconds
            logPath = (Join-Path $PSScriptRoot "watch-all-wsl.log")
        }
    }
}

function Write-KeepAliveLog {
    param([string]$Message)
    $config = Read-KeepAliveConfig
    $logPath = if ($config.logPath) { $config.logPath } else { Join-Path $PSScriptRoot "watch-all-wsl.log" }
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Get-EnabledDistros {
    $config = Read-KeepAliveConfig
    return @($config.enabledDistros) | Where-Object { $_ }
}

function Get-KeepaliveProcess {
    param([Parameter(Mandatory)][string]$Distro)
    $escapedDistro = [regex]::Escape($Distro)
    $pattern = "(^|\s)-d\s+(`"?$escapedDistro`"?)\s+--exec\s+sleep\s+infinity(\s|$)"

    Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -match $pattern }
}

function Start-Keepalive {
    param([Parameter(Mandatory)][string]$Distro)

    $existing = Get-KeepaliveProcess -Distro $Distro
    if ($existing) { return }

    try {
        Start-Process -FilePath "wsl.exe" `
            -ArgumentList @("-d", $Distro, "--exec", "sleep", "infinity") `
            -WindowStyle Hidden
        Write-KeepAliveLog "Started keepalive for distro '$Distro'."
    }
    catch {
        Write-KeepAliveLog "Failed to start keepalive for distro '$Distro': $($_.Exception.Message)"
    }
}

function Invoke-WslKeepaliveCheck {
    $distros = @(Get-EnabledDistros)
    foreach ($distro in $distros) {
        Start-Keepalive -Distro $distro
    }
}

Write-KeepAliveLog "WSL UI keepalive watcher started. Once=$Once."

do {
    $config = Read-KeepAliveConfig
    Invoke-WslKeepaliveCheck
    if ($Once) { break }
    $interval = if ($config.checkIntervalSecs) { [int]$config.checkIntervalSecs } else { $CheckIntervalSeconds }
    Start-Sleep -Seconds $interval
}
while ($true)

Write-KeepAliveLog "WSL UI keepalive watcher exited."
"#
}

fn install_script() -> &'static str {
    r#"[CmdletBinding()]
param(
    [string]$TaskName = "WSL-UI-KeepAlive",
    [Parameter(Mandatory)][string]$WatcherPath,
    [int]$CheckIntervalSeconds = 60
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WatcherPath)) {
    throw "Watcher script not found: $WatcherPath"
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatcherPath`" -CheckIntervalSeconds $CheckIntervalSeconds"

$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Keep selected WSL distros running for the logged-in user." `
    -User $currentUser `
    -Force | Out-Null
"#
}
