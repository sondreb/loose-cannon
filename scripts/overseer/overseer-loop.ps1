#Requires -Version 5.1
<#
.SYNOPSIS
  Repeatedly run Loose Cannon overseer cycles until max cycles or Ctrl+C.

.NOTES
  Ctrl+C behavior:
  - During idle sleep: stop immediately.
  - During an active cycle (1st): request stop after the cycle finishes (do not kill the run).
  - During an active cycle (2nd): force-kill the active grok process and exit.

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

$script:stopRequested = $false
$script:cycleRunning = $false
$script:prevTreatControlCAsInput = $null
$script:treatControlCEnabled = $false

function Test-StopKeyPressed {
  <#
    With [Console]::TreatControlCAsInput = $true, Ctrl+C is a normal key
    (not a process-group interrupt), so active cycles are not killed.
  #>
  $found = $false
  try {
    while ([Console]::KeyAvailable) {
      $key = [Console]::ReadKey($true)
      $isCtrlC =
        ($key.Key -eq [ConsoleKey]::C -and ($key.Modifiers -band [ConsoleModifiers]::Control)) -or
        ($key.KeyChar -eq [char]3)
      if ($isCtrlC) {
        $found = $true
      }
    }
  } catch {
    # Non-console host (or redirected input) — ignore.
  }
  return $found
}

function Wait-SleepOrStop {
  param([int]$Seconds)

  Write-Host "Sleeping ${Seconds}s before next cycle (Ctrl+C stops immediately)..."
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)

  while ([DateTime]::UtcNow -lt $deadline) {
    if ($script:stopRequested) { return }
    if (Test-StopKeyPressed) {
      $script:stopRequested = $true
      Write-Host ""
      Write-Host "Ctrl+C during idle — stopping now."
      return
    }
    $remainingMs = [int]([Math]::Ceiling(($deadline - [DateTime]::UtcNow).TotalMilliseconds))
    if ($remainingMs -le 0) { break }
    Start-Sleep -Milliseconds ([Math]::Min(200, $remainingMs))
  }
}

function Enable-GracefulCtrlC {
  try {
    $script:prevTreatControlCAsInput = [Console]::TreatControlCAsInput
    [Console]::TreatControlCAsInput = $true
    $script:treatControlCEnabled = $true
  } catch {
    Write-Host "Note: could not enable console Ctrl+C-as-input; Ctrl+C may still interrupt an active cycle."
    $script:treatControlCEnabled = $false
  }
}

function Disable-GracefulCtrlC {
  if (-not $script:treatControlCEnabled) { return }
  try {
    if ($null -ne $script:prevTreatControlCAsInput) {
      [Console]::TreatControlCAsInput = $script:prevTreatControlCAsInput
    } else {
      [Console]::TreatControlCAsInput = $false
    }
  } catch {
    # best-effort restore
  }
}

Write-Host "Loose Cannon overseer loop"
Write-Host "  Yolo:         $Yolo"
Write-Host "  Sleep:        ${SleepSeconds}s"
Write-Host "  MaxCycles:    $(if ($MaxCycles -eq 0) { 'unlimited' } else { $MaxCycles })"
Write-Host "  MaxTurns:     $MaxTurns"
Write-Host "  Ctrl+C idle:  stop immediately"
Write-Host "  Ctrl+C busy:  finish current cycle, then stop"
Write-Host "  Ctrl+C x2:    force-kill active cycle and exit"
Write-Host ""

$n = 0
try {
  Enable-GracefulCtrlC

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

    $script:cycleRunning = $true
    $global:OverseerStopRequested = $false
    try {
      & $cycleScript @params
      $code = $LASTEXITCODE
    } catch {
      Write-Host "Cycle threw: $_"
      $code = 1
    } finally {
      $script:cycleRunning = $false
    }

    # Ctrl+C pressed during the cycle (key buffered, and/or flagged by run-cycle)
    if ($global:OverseerStopRequested -or (Test-StopKeyPressed)) {
      $script:stopRequested = $true
    }

    Write-Host "Cycle $n finished with exit code $code"

    if ($script:stopRequested) {
      Write-Host "Stop was requested during the cycle — exiting without starting another."
      break
    }

    if ($MaxCycles -gt 0 -and $n -ge $MaxCycles) {
      Write-Host "Reached MaxCycles=$MaxCycles. Stopping."
      break
    }

    Wait-SleepOrStop -Seconds $SleepSeconds
    if ($script:stopRequested) {
      break
    }
  }
} finally {
  Disable-GracefulCtrlC
}

Write-Host "Overseer loop ended after $n cycle(s)."
