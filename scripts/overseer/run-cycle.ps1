#Requires -Version 5.1
<#
.SYNOPSIS
  Run one Grok Build overseer cycle for Loose Cannon (headless).

.EXAMPLE
  .\scripts\overseer\run-cycle.ps1
  .\scripts\overseer\run-cycle.ps1 -Continue -Yolo
  .\scripts\overseer\run-cycle.ps1 -Resume abc-uuid -MaxTurns 60
#>
param(
  [switch]$Yolo,
  [switch]$Continue,
  [string]$Resume = "",
  [int]$MaxTurns = 80,
  [switch]$Bootstrap,
  [switch]$DryRun,
  [string]$PromptFile = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$SessionFile = Join-Path $PSScriptRoot ".session-id"
$LogDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

if (-not $PromptFile) {
  if ($Bootstrap -or (-not (Test-Path $SessionFile) -and -not $Continue -and -not $Resume)) {
    $PromptFile = Join-Path $PSScriptRoot "prompts\bootstrap.txt"
  } else {
    $PromptFile = Join-Path $PSScriptRoot "prompts\cycle.txt"
  }
}

if (-not (Test-Path $PromptFile)) {
  throw "Prompt file not found: $PromptFile"
}

$grok = Get-Command grok -ErrorAction SilentlyContinue
if (-not $grok) {
  throw "grok CLI not found on PATH. Install: irm https://x.ai/cli/install.ps1 | iex"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $LogDir "cycle-$stamp.log"

$argsList = @(
  "--prompt-file", $PromptFile,
  "--cwd", "$RepoRoot",
  "--max-turns", "$MaxTurns",
  "--output-format", "json",
  "--no-auto-update"
)

if ($Yolo) {
  $argsList += "--always-approve"
}

if ($Resume) {
  $argsList += @("--resume", $Resume)
} elseif ($Continue) {
  $argsList += "--continue"
} elseif (Test-Path $SessionFile) {
  $saved = (Get-Content $SessionFile -Raw).Trim()
  if ($saved) {
    Write-Host "Resuming saved session: $saved"
    $argsList += @("--resume", $saved)
  }
}

Write-Host "=== Loose Cannon overseer cycle ==="
Write-Host "Repo:    $RepoRoot"
Write-Host "Prompt:  $PromptFile"
Write-Host "Log:     $logFile"
Write-Host "Command: grok $($argsList -join ' ')"
Write-Host ""

if ($DryRun) {
  Write-Host "Dry run — not executing."
  exit 0
}

$psi = @{
  FilePath               = "grok"
  ArgumentList           = $argsList
  WorkingDirectory       = "$RepoRoot"
  RedirectStandardOutput = $logFile
  RedirectStandardError  = "$logFile.err"
  PassThru               = $true
  NoNewWindow            = $true
}

$proc = Start-Process @psi

function Stop-GrokProcessTree {
  param([System.Diagnostics.Process]$Process)
  if ($null -eq $Process -or $Process.HasExited) { return }
  $procId = $Process.Id
  try {
    # Kill the whole tree so nested tool children do not linger.
    $null = & taskkill.exe /PID $procId /T /F 2>&1
  } catch {
    # fall through
  }
  try {
    if (-not $Process.HasExited) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # best-effort
  }
}

# Poll so parent overseer-loop (with TreatControlCAsInput) can observe Ctrl+C
# without killing this process. Standalone runs still get normal Ctrl+C behavior
# from the OS when TreatControlCAsInput is off.
# First Ctrl+C: graceful (finish cycle). Second: force-kill grok and exit.
$notifiedStop = $false
$forceStopped = $false
while (-not $proc.HasExited) {
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
        Write-Host "Ctrl+C noted — finishing this cycle (not killing the active run). Loop will stop afterward."
        Write-Host "Press Ctrl+C again to force-stop now."
      } else {
        Write-Host ""
        Write-Host "Second Ctrl+C — force-stopping the active cycle..."
        $global:OverseerStopRequested = $true
        $global:OverseerForceStop = $true
        $forceStopped = $true
        Stop-GrokProcessTree -Process $proc
        $null = $proc.WaitForExit(5000)
        break
      }
    }
  } catch {
    # Non-console host
  }
  if ($forceStopped) { break }
  $null = $proc.WaitForExit(250)
}

if ($forceStopped) {
  if (-not $proc.HasExited) {
    Stop-GrokProcessTree -Process $proc
    $null = $proc.WaitForExit(2000)
  }
  Write-Host "Force-stopped. Exit code: 130"
  exit 130
}

$exit = $proc.ExitCode

# Also tee a short preview
if (Test-Path $logFile) {
  $raw = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
  if ($raw) {
    try {
      $json = $raw | ConvertFrom-Json
      if ($json.sessionId) {
        Set-Content -Path $SessionFile -Value $json.sessionId -NoNewline
        Write-Host "Session ID saved: $($json.sessionId)"
      }
      if ($json.text) {
        Write-Host "--- agent summary (truncated) ---"
        $text = [string]$json.text
        if ($text.Length -gt 2000) { $text = $text.Substring(0, 2000) + "..." }
        Write-Host $text
      }
      if ($json.type -eq "error") {
        Write-Host "ERROR: $($json.message)"
      }
    } catch {
      Write-Host "Output (non-JSON or partial) written to $logFile"
      Get-Content $logFile -TotalCount 40
    }
  }
}

if (Test-Path "$logFile.err") {
  $err = Get-Content "$logFile.err" -Raw -ErrorAction SilentlyContinue
  if ($err -and $err.Trim()) {
    Write-Host "--- stderr ---"
    Write-Host $err
  }
}

Write-Host ""
Write-Host "Exit code: $exit"
exit $exit
