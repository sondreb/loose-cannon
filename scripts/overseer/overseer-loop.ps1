#Requires -Version 5.1
<#
.SYNOPSIS
  Repeatedly run Loose Cannon overseer cycles until max cycles or Ctrl+C.

.NOTES
  Each iteration calls run-cycle.ps1 (streaming-json, session health, stall timeout,
  C# stdout pump, -Yolo → --always-approve). Continuity lives in docs/STATUS.md;
  bloated sessions are auto-bootstrapped by run-cycle.

  After each cycle (except force-kill 130), if the worktree is dirty: git commit + push
  via commit-cycle.ps1 (message from OVERSEER_LOG Focus when present).

  Ctrl+C behavior:
  - During idle sleep: stop immediately.
  - During an active cycle (1st): request stop after the cycle finishes (do not kill the run).
  - During an active cycle (2nd): force-kill the active grok process and exit.

.EXAMPLE
  .\scripts\overseer\overseer-loop.ps1 -Yolo
  .\scripts\overseer\overseer-loop.ps1 -Yolo -SleepSeconds 90 -MaxCycles 10
  .\scripts\overseer\overseer-loop.ps1 -Yolo -NoPush
#>
param(
  [switch]$Yolo,
  [int]$SleepSeconds = 60,
  [int]$MaxCycles = 0,
  [int]$MaxTurns = 80,
  [switch]$BootstrapFirst,
  # Commit after each cycle but do not git push
  [switch]$NoPush,
  # Skip commit and push entirely
  [switch]$NoCommit
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$cycleScript = Join-Path $PSScriptRoot "run-cycle.ps1"
$commitScript = Join-Path $PSScriptRoot "commit-cycle.ps1"
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
Write-Host "  Sessions:     FRESH every cycle (no --resume; STATUS.md is continuity)"
Write-Host "  Runner:       run-cycle.ps1 (streaming logs; startup stall 90s / working 20m)"
Write-Host "  Git:          $(if ($NoCommit) { 'off' } elseif ($NoPush) { 'commit only (no push)' } else { 'commit + push after each cycle' })"
Write-Host "  Ctrl+C idle:  stop immediately"
Write-Host "  Ctrl+C busy:  finish current cycle, then stop"
Write-Host "  Ctrl+C x2:    force-kill active cycle and exit"
if (-not $Yolo) {
  Write-Host ""
  Write-Host "WARNING: without -Yolo, headless tool prompts can hang. Prefer: -Yolo"
}
Write-Host ""

$n = 0
$stallStreak = 0
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

    # Always fresh sessions — headless --resume hangs too often after session/load.
    # First cycle may use bootstrap prompt; later cycles use cycle.txt (default).
    if ($n -eq 1 -and $BootstrapFirst) {
      $params.Bootstrap = $true
    }

    $script:cycleRunning = $true
    $global:OverseerStopRequested = $false
    $global:OverseerForceStop = $false
    $global:OverseerStalled = $false
    try {
      & $cycleScript @params
      $code = $LASTEXITCODE
      if ($null -eq $code) { $code = 0 }
    } catch {
      Write-Host "Cycle threw: $_"
      $code = 1
    } finally {
      $script:cycleRunning = $false
    }

    # User stop only (not stall — stall retries)
    if ($global:OverseerForceStop -or (Test-StopKeyPressed)) {
      $script:stopRequested = $true
    } elseif ($global:OverseerStopRequested -and $code -ne 124) {
      $script:stopRequested = $true
    }

    Write-Host "Cycle $n finished with exit code $code"

    if ($code -eq 130) {
      $script:stopRequested = $true
    } elseif ($code -eq 124 -or $global:OverseerStalled) {
      $stallStreak++
      Write-Host "Stall ($stallStreak) — will retry with a FRESH session after sleep."
      # Higher threshold: false stalls used to kill productive loops mid-smoke.
      if ($stallStreak -ge 5) {
        Write-Host "Five stalls in a row — stopping. Check grok auth, network, and debug logs."
        $script:stopRequested = $true
      }
    } else {
      $stallStreak = 0
    }

    # Commit + push after the cycle (skip force-kill mid-run — tree may be half-written)
    if (-not $NoCommit -and $code -ne 130) {
      Write-Host "--- git publish (cycle $n) ---"
      try {
        $commitParams = @{ CycleNumber = $n }
        if ($NoPush) { $commitParams.SkipPush = $true }
        & $commitScript @commitParams
        $gitCode = $LASTEXITCODE
        if ($null -eq $gitCode) { $gitCode = 0 }
        if ($gitCode -ne 0) {
          Write-Host "commit-cycle exited $gitCode (loop continues)."
        }
      } catch {
        Write-Host "commit-cycle error: $_ (loop continues)."
      }
    }

    if ($script:stopRequested) {
      Write-Host "Stop was requested — exiting without starting another cycle."
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
