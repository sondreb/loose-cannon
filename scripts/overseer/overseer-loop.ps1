#Requires -Version 5.1
<#
.SYNOPSIS
  Repeatedly run Loose Cannon overseer cycles until max cycles, idle stop, or Ctrl+C.

.NOTES
  Each iteration calls run-cycle.ps1 (streaming-json, session health, stall timeout,
  C# stdout pump, -Yolo → --always-approve). Continuity lives in docs/STATUS.md;
  bloated sessions are auto-bootstrapped by run-cycle.

  After each cycle (except force-kill 130), if the worktree is dirty: git commit + push
  via commit-cycle.ps1 (message from OVERSEER_LOG Focus when present).

  Idle stop (no more Mode A work):
  - Agent writes gitignored scripts/overseer/NO_WORK and/or prints OVERSEER_STOP: no_work
  - Loop exits after that cycle (no more sleep/repeat empty health-check commits)
  - If NO_WORK already exists at loop start, exit immediately without burning a cycle
  - Clear with -ClearNoWork when you reopen the backlog and want the loop again

  Ctrl+C behavior:
  - During idle sleep: stop immediately.
  - During an active cycle (1st): request stop after the cycle finishes (do not kill the run).
  - During an active cycle (2nd): force-kill the active grok process and exit.

.EXAMPLE
  .\scripts\overseer\overseer-loop.ps1 -Yolo
  .\scripts\overseer\overseer-loop.ps1 -Yolo -SleepSeconds 90 -MaxCycles 10
  .\scripts\overseer\overseer-loop.ps1 -Yolo -NoPush
  .\scripts\overseer\overseer-loop.ps1 -Yolo -ClearNoWork
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
  [switch]$NoCommit,
  # Remove scripts/overseer/NO_WORK before starting (reopen backlog after idle stop)
  [switch]$ClearNoWork
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$cycleScript = Join-Path $PSScriptRoot "run-cycle.ps1"
$commitScript = Join-Path $PSScriptRoot "commit-cycle.ps1"
$SessionFile = Join-Path $PSScriptRoot ".session-id"
$NoWorkFile = Join-Path $PSScriptRoot "NO_WORK"
$LogDir = Join-Path $PSScriptRoot "logs"

$script:stopRequested = $false
$script:idleStop = $false
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

function Test-NoWorkFile {
  return (Test-Path -LiteralPath $NoWorkFile)
}

function Get-NoWorkFileReason {
  if (-not (Test-NoWorkFile)) { return $null }
  try {
    $line = (Get-Content -LiteralPath $NoWorkFile -TotalCount 1 -ErrorAction Stop)
    if ($line) { return $line.Trim() }
  } catch { }
  return "(no reason recorded)"
}

function Test-OverseerIdleStopSignal {
  <#
    True when the agent reported empty Mode A backlog this cycle.
    Only trust machine signals from *this* run — not stale OVERSEER_LOG text
    (an old "health-check stop" entry must not kill a new cycle that failed
    before rewriting the log).

    Sources (any one is enough):
      1. scripts/overseer/NO_WORK exists
      2. Latest cycle log contains OVERSEER_STOP: no_work
  #>
  if (Test-NoWorkFile) { return $true }

  if (Test-Path -LiteralPath $LogDir) {
    $latestLog = Get-ChildItem -LiteralPath $LogDir -Filter "cycle-*.log" -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if ($latestLog) {
      try {
        $hit = Select-String -LiteralPath $latestLog.FullName -Pattern 'OVERSEER_STOP:\s*no_work' -Quiet -ErrorAction SilentlyContinue
        if ($hit) { return $true }
      } catch { }
    }
  }

  return $false
}

function Write-IdleStopMessage {
  param([string]$When = "after cycle")
  $reason = Get-NoWorkFileReason
  Write-Host ""
  Write-Host "=== IDLE STOP ($When) ==="
  Write-Host "Mode A backlog is empty (or agent signaled OVERSEER_STOP: no_work)."
  if ($reason) {
    Write-Host "NO_WORK: $reason"
  }
  Write-Host "Exiting loop — will not sleep/repeat empty health-check cycles."
  Write-Host "To run again after reopening work: delete scripts/overseer/NO_WORK"
  Write-Host "  or: .\scripts\overseer\overseer-loop.ps1 -Yolo -ClearNoWork"
  Write-Host ""
}

if ($ClearNoWork -and (Test-NoWorkFile)) {
  Remove-Item -LiteralPath $NoWorkFile -Force
  Write-Host "Cleared scripts/overseer/NO_WORK (-ClearNoWork)."
}

Write-Host "Loose Cannon overseer loop"
Write-Host "  Yolo:         $Yolo"
Write-Host "  Sleep:        ${SleepSeconds}s"
Write-Host "  MaxCycles:    $(if ($MaxCycles -eq 0) { 'unlimited' } else { $MaxCycles })"
Write-Host "  MaxTurns:     $MaxTurns"
Write-Host "  Sessions:     FRESH every cycle (no --resume; STATUS.md is continuity)"
Write-Host "  Runner:       run-cycle.ps1 (streaming logs; startup stall 90s / working 20m)"
Write-Host "  Git:          $(if ($NoCommit) { 'off' } elseif ($NoPush) { 'commit only (no push)' } else { 'commit + push after each cycle' })"
Write-Host "  Idle stop:    NO_WORK file or OVERSEER_STOP: no_work ends the loop"
Write-Host "  Ctrl+C idle:  stop immediately"
Write-Host "  Ctrl+C busy:  finish current cycle, then stop"
Write-Host "  Ctrl+C x2:    force-kill active cycle and exit"
if (-not $Yolo) {
  Write-Host ""
  Write-Host "WARNING: without -Yolo, headless tool prompts can hang. Prefer: -Yolo"
}
Write-Host ""

# Already idle from a previous cycle — do not burn API / re-stamp docs
if (Test-NoWorkFile) {
  Write-IdleStopMessage -When "before first cycle"
  Write-Host "Overseer loop ended after 0 cycle(s) (already idle)."
  exit 0
}

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

    # Idle / no-work: agent finished Mode A backlog — stop after publish, do not loop
    if (-not $script:stopRequested -and $code -ne 124 -and $code -ne 130) {
      if (Test-OverseerIdleStopSignal) {
        $script:idleStop = $true
        $script:stopRequested = $true
        Write-IdleStopMessage -When "after cycle $n"
      }
    }

    # Commit + push after the cycle (skip force-kill mid-run — tree may be half-written)
    # Still publish one last idle-stop doc stamp if the agent wrote one.
    if (-not $NoCommit -and $code -ne 130) {
      Write-Host "--- git publish (cycle $n) ---"
      try {
        $commitParams = @{ CycleNumber = $n }
        if ($NoPush) { $commitParams.SkipPush = $true }
        & $commitScript @commitParams
        $gitCode = $LASTEXITCODE
        if ($null -eq $gitCode) { $gitCode = 0 }
        if ($gitCode -ne 0) {
          Write-Host "commit-cycle exited $gitCode (loop continues unless idle/stop)."
        }
      } catch {
        Write-Host "commit-cycle error: $_ (loop continues unless idle/stop)."
      }
    }

    if ($script:stopRequested) {
      if ($script:idleStop) {
        Write-Host "Idle stop — exiting without starting another cycle."
      } else {
        Write-Host "Stop was requested — exiting without starting another cycle."
      }
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

    # Belt-and-suspenders: agent may have written NO_WORK during the previous cycle
    # and we already handled it; if something else created it during sleep, exit.
    if (Test-NoWorkFile) {
      $script:idleStop = $true
      Write-IdleStopMessage -When "before next cycle"
      break
    }
  }
} finally {
  Disable-GracefulCtrlC
}

Write-Host "Overseer loop ended after $n cycle(s)$(if ($script:idleStop) { ' (idle stop)' } else { '' })."
