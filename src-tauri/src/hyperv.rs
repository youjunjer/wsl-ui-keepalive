use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperVVm {
    pub name: String,
    pub state: String,
    pub status: Option<String>,
    pub uptime_seconds: Option<u64>,
    pub memory_assigned_bytes: Option<u64>,
    pub processor_count: Option<u32>,
    pub cpu_usage_percent: Option<f64>,
    pub ip_addresses: Vec<String>,
}

#[cfg(not(target_os = "windows"))]
pub fn list_vms() -> Result<Vec<HyperVVm>, String> {
    Ok(Vec::new())
}

#[cfg(target_os = "windows")]
pub fn list_vms() -> Result<Vec<HyperVVm>, String> {
    let script = r#"
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
  '[]'
  exit 0
}

$items = Get-VM | ForEach-Object {
  $vm = $_
  $ips = @()
  try {
    $ips = @(Get-VMNetworkAdapter -VMName $vm.Name -ErrorAction SilentlyContinue | ForEach-Object { $_.IPAddresses } | Where-Object { $_ })
  } catch {}

  [PSCustomObject]@{
    name = $vm.Name
    state = [string]$vm.State
    status = if ($vm.Status) { [string]$vm.Status } else { $null }
    uptimeSeconds = if ($vm.Uptime) { [int64]$vm.Uptime.TotalSeconds } else { $null }
    memoryAssignedBytes = if ($null -ne $vm.MemoryAssigned) { [int64]$vm.MemoryAssigned } else { $null }
    processorCount = if ($null -ne $vm.ProcessorCount) { [int]$vm.ProcessorCount } else { $null }
    cpuUsagePercent = if ($null -ne $vm.CPUUsage) { [double]$vm.CPUUsage } else { $null }
    ipAddresses = @($ips)
  }
}

@($items) | ConvertTo-Json -Depth 5 -Compress
"#;

    let output = powershell(script, &[])?;
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("Failed to parse Hyper-V VM list: {}", e))?;

    if value.is_null() {
        return Ok(Vec::new());
    }

    if value.is_array() {
        serde_json::from_value(value).map_err(|e| format!("Invalid Hyper-V VM list: {}", e))
    } else {
        let vm: HyperVVm = serde_json::from_value(value)
            .map_err(|e| format!("Invalid Hyper-V VM: {}", e))?;
        Ok(vec![vm])
    }
}

#[cfg(not(target_os = "windows"))]
pub fn start_vm(_name: &str) -> Result<(), String> {
    Err("Hyper-V is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn start_vm(name: &str) -> Result<(), String> {
    run_vm_command("Start-VM -Name $args[0] -ErrorAction Stop", name)
}

#[cfg(not(target_os = "windows"))]
pub fn stop_vm(_name: &str) -> Result<(), String> {
    Err("Hyper-V is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn stop_vm(name: &str) -> Result<(), String> {
    run_vm_command("Stop-VM -Name $args[0] -Shutdown -ErrorAction Stop", name)
}

#[cfg(not(target_os = "windows"))]
pub fn pause_vm(_name: &str) -> Result<(), String> {
    Err("Hyper-V is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn pause_vm(name: &str) -> Result<(), String> {
    run_vm_command("Suspend-VM -Name $args[0] -ErrorAction Stop", name)
}

#[cfg(not(target_os = "windows"))]
pub fn resume_vm(_name: &str) -> Result<(), String> {
    Err("Hyper-V is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn resume_vm(name: &str) -> Result<(), String> {
    run_vm_command("Resume-VM -Name $args[0] -ErrorAction Stop", name)
}

#[cfg(target_os = "windows")]
fn run_vm_command(script: &str, name: &str) -> Result<(), String> {
    let _ = powershell(script, &[name])?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn powershell(script: &str, args: &[&str]) -> Result<String, String> {
    let output = crate::utils::hidden_command("powershell.exe")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-OutputFormat")
        .arg("Text")
        .arg("-Command")
        .arg(script)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("PowerShell exited with status {}", output.status)
        } else {
            stderr
        })
    }
}
