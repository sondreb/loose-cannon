#Requires -Version 5.1
<#
.SYNOPSIS
  Run one Grok Build overseer cycle for Loose Cannon (headless).

.NOTES
  Common failure mode: resuming a bloated / mid-tool session hangs with empty logs.
  This script:
  - Uses streaming-json so logs grow during the run
  - Tees progress to the console
  - Auto-bootstraps when the saved session looks unhealthy
  - Stall-timeouts (no log output) and force-kills hung grok processes
  - First Ctrl+C: note stop; second: force-kill

.EXAMPLE
  .\scripts\overseer\run-cycle.ps1 -Yolo
  .\scripts\overseer\run-cycle.ps1 -Bootstrap -Yolo
  .\scripts\overseer\run-cycle.ps1 -Continue -Yolo -MaxTurns 60
#>
param(
  [switch]$Yolo,
  [switch]$Continue,
  [string]$Resume = "",
  [int]$MaxTurns = 80,
  [switch]$Bootstrap,
  [switch]$DryRun,
  [string]$PromptFile = "",
  # Abort if grok produces no stdout for this many seconds (0 = disabled)
  [int]$StallTimeoutSeconds = 180,
  # Auto-bootstrap when chat_history exceeds this many lines
  [int]$MaxSessionChatLines = 200,
  # Auto-bootstrap when updates.jsonl exceeds this many MB
  [double]$MaxSessionUpdatesMb = 3.0,
  # Force resume even if session looks unhealthy
  [switch]$ForceResume
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$SessionFile = Join-Path $PSScriptRoot ".session-id"
$LogDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function Get-GrokSessionDir {
  param([string]$SessionId)
  if (-not $SessionId) { return $null }
  $cwdKey = [uri]::EscapeDataString($RepoRoot)
  $dir = Join-Path $env:USERPROFILE ".grok\sessions\$cwdKey\$SessionId"
  if (Test-Path -LiteralPath $dir) { return $dir }
  # Fallback: scan sessions root for the id (cwd encoding can vary)
  $root = Join-Path $env:USERPROFILE ".grok\sessions"
  if (-not (Test-Path $root)) { return $null }
  $hit = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
    ForEach-Object {
      $candidate = Join-Path $_.FullName $SessionId
      if (Test-Path -LiteralPath $candidate) { $candidate }
    } |
    Select-Object -First 1
  return $hit
}

function Get-SessionHealth {
  param([string]$SessionId)

  $result = [ordered]@{
    Ok           = $false
    Exists       = $false
    ChatLines    = 0
    UpdatesMb    = 0.0
    LastEvent    = ""
    Reasons      = [System.Collections.Generic.List[string]]::new()
  }

  $dir = Get-GrokSessionDir -SessionId $SessionId
  if (-not $dir) {
    $result.Reasons.Add("session directory not found")
    return [pscustomobject]$result
  }
  $result.Exists = $true

  $chat = Join-Path $dir "chat_history.jsonl"
  $updates = Join-Path $dir "updates.jsonl"
  $events = Join-Path $dir "events.jsonl"

  if (Test-Path -LiteralPath $chat) {
    $result.ChatLines = (Get-Content -LiteralPath $chat | Measure-Object -Line).Lines
  } else {
    $result.Reasons.Add("missing chat_history.jsonl")
  }

  if (Test-Path -LiteralPath $updates) {
    $result.UpdatesMb = [math]::Round((Get-Item -LiteralPath $updates).Length / 1MB, 2)
  }

  if (Test-Path -LiteralPath $events) {
    $last = Get-Content -LiteralPath $events -Tail 1 -ErrorAction SilentlyContinue
    if ($last) {
      $result.LastEvent = $last
      # Mid-tool / permission wait is a common hang source when replaying resume
      if ($last -match '"phase":"tool_execution"' -or
          $last -match '"phase":"permission_prompt"' -or
          $last -match '"type":"tool_started"' -or
          $last -match '"type":"permission_requested"') {
        $result.Reasons.Add("last event looks like an incomplete tool turn (mid-tool hang risk)")
      }
    }
  }

  if ($result.ChatLines -gt $MaxSessionChatLines) {
    $result.Reasons.Add("chat_history has $($result.ChatLines) lines (limit $MaxSessionChatLines) — bloated context often hangs headless resume")
  }
  if ($result.UpdatesMb -gt $MaxSessionUpdatesMb) {
    $result.Reasons.Add("updates.jsonl is $($result.UpdatesMb) MB (limit ${MaxSessionUpdatesMb} MB)")
  }

  $result.Ok = ($result.Reasons.Count -eq 0)
  return [pscustomobject]$result
}

function Stop-GrokProcessTree {
  param([System.Diagnostics.Process]$Process)
  if ($null -eq $Process) { return }
  try {
    if ($Process.HasExited) { return }
  } catch { return }
  $procId = $Process.Id
  try {
    $null = & taskkill.exe /PID $procId /T /F 2>&1
  } catch { }
  try {
    if (-not $Process.HasExited) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  } catch { }
}

# --- resolve which session / prompt to use ---
$savedSession = ""
if ($Resume) {
  $savedSession = $Resume.Trim()
} elseif ($Continue) {
  # --continue lets grok pick most recent for cwd; still prefer saved id when healthy
  if (Test-Path $SessionFile) {
    $savedSession = (Get-Content $SessionFile -Raw).Trim()
  }
} elseif (-not $Bootstrap -and (Test-Path $SessionFile)) {
  $savedSession = (Get-Content $SessionFile -Raw).Trim()
}

$useBootstrap = [bool]$Bootstrap
$resumeId = ""

if ($savedSession -and -not $Bootstrap) {
  $health = Get-SessionHealth -SessionId $savedSession
  Write-Host "Saved session: $savedSession"
  Write-Host "  chat_lines=$($health.ChatLines) updates_mb=$($health.UpdatesMb) exists=$($health.Exists) ok=$($health.Ok)"
  if (-not $health.Ok) {
    foreach ($r in $health.Reasons) {
      Write-Host "  ! $r"
    }
    if ($ForceResume -or $Resume) {
      Write-Host "  ForceResume/explicit -Resume: continuing anyway (may hang)."
      $resumeId = $savedSession
    } else {
      Write-Host "  Auto-bootstrap: starting a FRESH session (docs/STATUS carry continuity)."
      Write-Host "  To force the old session: -ForceResume or -Resume $savedSession"
      $useBootstrap = $true
      $resumeId = ""
      # Drop pointer so the next loop does not keep re-selecting a dead session
      if (Test-Path $SessionFile) {
        Remove-Item $SessionFile -Force -ErrorAction SilentlyContinue
      }
    }
  } else {
    $resumeId = $savedSession
  }
}

# Never use bare `grok --continue` — in this cwd it can attach to an interactive
# TUI session. Only resume an explicit healthy .session-id, else start fresh.
if (-not $resumeId -and $Continue -and -not $useBootstrap) {
  Write-Host "No healthy .session-id to resume — starting NEW session (not using grok --continue)."
  $useBootstrap = $true
}

if (-not $PromptFile) {
  if ($useBootstrap -or -not $resumeId) {
    $PromptFile = Join-Path $PSScriptRoot "prompts\bootstrap.txt"
  } else {
    $PromptFile = Join-Path $PSScriptRoot "prompts\cycle.txt"
  }
}

if (-not (Test-Path $PromptFile)) {
  throw "Prompt file not found: $PromptFile"
}

$grokCmd = Get-Command grok -ErrorAction SilentlyContinue
if (-not $grokCmd) {
  throw "grok CLI not found on PATH. Install: irm https://x.ai/cli/install.ps1 | iex"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $LogDir "cycle-$stamp.log"
$errFile = "$logFile.err"
$debugFile = Join-Path $LogDir "cycle-$stamp.debug.log"

# streaming-json: live events (empty "json" logs until exit is a major UX bug)
$argsList = [System.Collections.Generic.List[string]]::new()
$argsList.AddRange([string[]]@(
  "--prompt-file", $PromptFile,
  "--cwd", $RepoRoot,
  "--max-turns", "$MaxTurns",
  "--output-format", "streaming-json",
  "--debug-file", $debugFile
))

if ($Yolo) {
  $argsList.Add("--always-approve")
} else {
  Write-Host "WARNING: without -Yolo, headless runs can hang forever on tool permission prompts."
  Write-Host "         Prefer: .\scripts\overseer\run-cycle.ps1 -Yolo"
}

if ($resumeId) {
  $argsList.AddRange([string[]]@("--resume", $resumeId))
  Write-Host "Resuming session: $resumeId"
} else {
  Write-Host "Starting NEW session (bootstrap/fresh)"
}

Write-Host "=== Loose Cannon overseer cycle ==="
Write-Host "Repo:     $RepoRoot"
Write-Host "Prompt:   $PromptFile"
Write-Host "Log:      $logFile"
Write-Host "Debug:    $debugFile"
Write-Host "Command:  grok $($argsList -join ' ')"
Write-Host "Stall:    $(if ($StallTimeoutSeconds -gt 0) { "${StallTimeoutSeconds}s no-output timeout" } else { 'disabled' })"
Write-Host ""

if ($DryRun) {
  Write-Host "Dry run — not executing."
  exit 0
}

# Async stdout/stderr via C# handlers (NOT PowerShell scriptblocks).
# Scriptblock OutputDataReceived handlers run on a thread-pool thread with no
# Runspace and crash: "There is no Runspace available to run scripts in this thread".
if (-not ("GrokLinePump" -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Collections.Concurrent;
public static class GrokLinePump {
  public static void Attach(Process p, ConcurrentQueue<string> stdoutQ, ConcurrentQueue<string> stderrQ) {
    p.OutputDataReceived += (sender, e) => { if (e.Data != null) stdoutQ.Enqueue(e.Data); };
    p.ErrorDataReceived  += (sender, e) => { if (e.Data != null) stderrQ.Enqueue(e.Data); };
  }
}
"@
}

$outQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$errQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $grokCmd.Source
$psi.WorkingDirectory = $RepoRoot
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
$psi.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
foreach ($a in $argsList) {
  [void]$psi.ArgumentList.Add($a)
}

$proc = [System.Diagnostics.Process]::new()
$proc.StartInfo = $psi
[GrokLinePump]::Attach($proc, $outQueue, $errQueue)
[void]$proc.Start()
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

$logWriter = New-Object System.IO.StreamWriter($logFile, $false, [System.Text.UTF8Encoding]::new($false))
$logWriter.AutoFlush = $true
$errWriter = New-Object System.IO.StreamWriter($errFile, $false, [System.Text.UTF8Encoding]::new($false))
$errWriter.AutoFlush = $true

$script:capturedSessionId = $null
$script:lastOutputUtc = [DateTime]::UtcNow
$notifiedStop = $false
$forceStopped = $false
$stallKilled = $false
$startedUtc = [DateTime]::UtcNow

function Write-OutLine {
  param([string]$line)
  $script:lastOutputUtc = [DateTime]::UtcNow
  $logWriter.WriteLine($line)
  # Compact console: show type + short snippet for streaming-json
  try {
    $obj = $line | ConvertFrom-Json -ErrorAction Stop
    if ($obj.sessionId -and -not $script:capturedSessionId) {
      $script:capturedSessionId = [string]$obj.sessionId
    }
    if ($obj.type -eq "end" -and $obj.sessionId) {
      $script:capturedSessionId = [string]$obj.sessionId
    }
    switch ($obj.type) {
      "text" {
        Write-Host -NoNewline $obj.data
      }
      "thought" {
        # quiet — too noisy; leave in log only
      }
      "tool_start" {
        Write-Host ""
        Write-Host "[tool] $($obj.name)"
      }
      "tool_end" {
        Write-Host "[tool done] $($obj.name)"
      }
      "end" {
        Write-Host ""
        Write-Host "[end] stopReason=$($obj.stopReason) sessionId=$($obj.sessionId)"
      }
      "error" {
        Write-Host ""
        Write-Host "[error] $($obj.message)"
      }
      default {
        if ($line.Length -gt 200) {
          Write-Host ($line.Substring(0, 200) + "...")
        } else {
          Write-Host $line
        }
      }
    }
  } catch {
    Write-Host $line
  }
}

function Drain-Queues {
  $line = $null
  while ($outQueue.TryDequeue([ref]$line)) {
    Write-OutLine $line
  }
  while ($errQueue.TryDequeue([ref]$line)) {
    $script:lastOutputUtc = [DateTime]::UtcNow
    $errWriter.WriteLine($line)
    Write-Host "[stderr] $line"
  }
}

try {
  while (-not $proc.HasExited) {
    Drain-Queues

    # Ctrl+C as key (when parent set TreatControlCAsInput)
    try {
      while ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true)
        $isCtrlC =
          ($key.Key -eq [ConsoleKey]::C -and ($key.Modifiers -band [ConsoleModifiers]::Control)) -or
          ($key.KeyChar -eq [char]3)
        if (-not $isCtrlC) { continue }

        if (-not $notifiedStop) {
          $notifiedStop = $true
          $global:OverseerStopRequested = $true
          Write-Host ""
          Write-Host "Ctrl+C noted — finishing this cycle if possible. Press Ctrl+C again to force-stop."
        } else {
          Write-Host ""
          Write-Host "Second Ctrl+C — force-stopping the active cycle..."
          $global:OverseerStopRequested = $true
          $global:OverseerForceStop = $true
          $forceStopped = $true
          Stop-GrokProcessTree -Process $proc
          break
        }
      }
    } catch {
      # non-console host
    }

    if ($forceStopped) { break }

    # Stall detection: bloated resume hangs with silence
    if ($StallTimeoutSeconds -gt 0) {
      $silentFor = ([DateTime]::UtcNow - $script:lastOutputUtc).TotalSeconds
      $aliveFor = ([DateTime]::UtcNow - $startedUtc).TotalSeconds
      if ($silentFor -ge $StallTimeoutSeconds) {
        Write-Host ""
        Write-Host "STALL: no grok output for ${StallTimeoutSeconds}s (alive ${aliveFor}s)."
        Write-Host "This usually means a bloated/corrupt session resume hang."
        Write-Host "Force-killing. Next run will auto-bootstrap if you delete .session-id or re-run without -ForceResume."
        Write-Host "Debug log: $debugFile"
        $stallKilled = $true
        $global:OverseerStopRequested = $true
        Stop-GrokProcessTree -Process $proc
        break
      }
    }

    Start-Sleep -Milliseconds 150
  }

  # Final drain after exit
  Start-Sleep -Milliseconds 400
  Drain-Queues
  try { $null = $proc.WaitForExit(5000) } catch { }
}
finally {
  try { $logWriter.Flush(); $logWriter.Dispose() } catch { }
  try { $errWriter.Flush(); $errWriter.Dispose() } catch { }
}

if ($forceStopped -or $stallKilled) {
  if (-not $proc.HasExited) {
    Stop-GrokProcessTree -Process $proc
    try { $proc.WaitForExit(3000) | Out-Null } catch { }
  }
  # Unhealthy pointer: prefer fresh next time after a stall
  if ($stallKilled -and (Test-Path $SessionFile)) {
    Write-Host "Clearing .session-id after stall so the next cycle bootstraps fresh."
    Remove-Item $SessionFile -Force -ErrorAction SilentlyContinue
  }
  $code = if ($stallKilled) { 124 } else { 130 }
  Write-Host "Stopped. Exit code: $code"
  exit $code
}

$exit = 0
try { $exit = $proc.ExitCode } catch { $exit = 1 }

# Persist session id from stream or end event
if ($script:capturedSessionId) {
  Set-Content -Path $SessionFile -Value $script:capturedSessionId -NoNewline
  Write-Host "Session ID saved: $($script:capturedSessionId)"
} elseif (Test-Path $logFile) {
  # Fallback: scan log for sessionId
  $hit = Select-String -Path $logFile -Pattern '"sessionId"\s*:\s*"([^"]+)"' | Select-Object -Last 1
  if ($hit) {
    $sid = $hit.Matches[0].Groups[1].Value
    Set-Content -Path $SessionFile -Value $sid -NoNewline
    Write-Host "Session ID saved: $sid"
  }
}

# Summary from log
if (Test-Path $logFile) {
  $textBits = Select-String -Path $logFile -Pattern '"type"\s*:\s*"text"' -ErrorAction SilentlyContinue
  if ($textBits) {
    Write-Host "--- agent text (from stream) ---"
    $acc = ""
    Get-Content $logFile | ForEach-Object {
      try {
        $o = $_ | ConvertFrom-Json -ErrorAction Stop
        if ($o.type -eq "text") { $acc += [string]$o.data }
      } catch { }
    }
    if ($acc.Length -gt 2000) { $acc = $acc.Substring(0, 2000) + "..." }
    if ($acc) { Write-Host $acc }
  }
}

if ((Test-Path $errFile) -and (Get-Item $errFile).Length -gt 0) {
  Write-Host "--- stderr ---"
  Get-Content $errFile -TotalCount 40
}

if ((Test-Path $debugFile) -and $exit -ne 0) {
  Write-Host "--- debug tail ---"
  Get-Content $debugFile -Tail 20
}

Write-Host ""
Write-Host "Exit code: $exit"
exit $exit
