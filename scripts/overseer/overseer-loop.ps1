#Requires -Version 5.1
<#
.SYNOPSIS
  Repeatedly run Loose Cannon overseer cycles until max cycles or Ctrl+C.

.EXAMPLE
  .\scripts\overseer\overseer-loop.ps1
  .\scripts\overseer\overseer-loop.ps1 -Yolo -SleepSeconds 90 -MaxCycles 10
#>
param(
  [switch]$Yolo,
  [int]$SleepSeconds = 60,
  [int]$MaxCycles = 0,
  [int]$MaxTurns = 80,
  [switch]$BootstrapFirst
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$cycleScript = Join-Path $PSScriptRoot "run-cycle.ps1"
$SessionFile = Join-Path $PSScriptRoot ".session-id"

Write-Host "Loose Cannon overseer loop"
Write-Host "  Yolo:         $Yolo"
Write-Host "  Sleep:        ${SleepSeconds}s"
Write-Host "  MaxCycles:    $(if ($MaxCycles -eq 0) { 'unlimited' } else { $MaxCycles })"
Write-Host "  MaxTurns:     $MaxTurns"
Write-Host "  Ctrl+C to stop"
Write-Host ""

$n = 0
while ($true) {
  $n++
  Write-Host "========================================"
  Write-Host "=== Overseer cycle $n starting $(Get-Date -Format o) ==="
  Write-Host "========================================"

  $params = @{
    MaxTurns = $MaxTurns
  }
  if ($Yolo) { $params.Yolo = $true }

  if ($n -eq 1) {
    if ($BootstrapFirst -or -not (Test-Path $SessionFile)) {
      $params.Bootstrap = $true
    } elseif (Test-Path $SessionFile) {
      $params.Continue = $true
    }
  } else {
    $params.Continue = $true
  }

  try {
    & $cycleScript @params
    $code = $LASTEXITCODE
  } catch {
    Write-Host "Cycle threw: $_"
    $code = 1
  }

  Write-Host "Cycle $n finished with exit code $code"

  if ($MaxCycles -gt 0 -and $n -ge $MaxCycles) {
    Write-Host "Reached MaxCycles=$MaxCycles. Stopping."
    break
  }

  Write-Host "Sleeping ${SleepSeconds}s before next cycle..."
  Start-Sleep -Seconds $SleepSeconds
}

Write-Host "Overseer loop ended after $n cycle(s)."
