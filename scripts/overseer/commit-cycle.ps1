#Requires -Version 5.1
<#
.SYNOPSIS
  After an overseer cycle: commit all worktree changes and push to origin.

.DESCRIPTION
  Builds a commit message from the latest docs/OVERSEER_LOG.md Focus line when
  available, otherwise from a short file-change summary. No-op if the tree is clean.

.PARAMETER CycleNumber
  Loop index for the subject line (optional).

.PARAMETER SkipPush
  Commit only; do not git push.

.EXAMPLE
  .\scripts\overseer\commit-cycle.ps1 -CycleNumber 3
#>
param(
  [int]$CycleNumber = 0,
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

function Get-OverseerCommitMessage {
  param([int]$Cycle)

  $subject = $null
  $bodyLines = [System.Collections.Generic.List[string]]::new()

  $logPath = Join-Path $RepoRoot "docs\OVERSEER_LOG.md"
  if (Test-Path $logPath) {
    $lines = Get-Content $logPath
    $pastEntriesHeader = $false
    $inEntry = $false
    foreach ($line in $lines) {
      # Skip template block; real entries start after "## Entries"
      if ($line -match '^##\s+Entries') {
        $pastEntriesHeader = $true
        continue
      }
      if (-not $pastEntriesHeader) { continue }

      if ($line -match '^###\s+(.+)$') {
        if ($inEntry) { break }
        $inEntry = $true
        $header = $Matches[1].Trim()
        # Prefer "cycle N (title)" from header
        if ($header -match 'cycle\s+\d+\s*\((.+)\)') {
          $subject = $Matches[1].Trim()
        } elseif ($header -match '[—–-]\s*(.+)$') {
          $subject = $Matches[1].Trim()
        } else {
          $subject = $header
        }
        # Drop leading "cycle N " if still present
        if ($subject -match '^cycle\s+\d+\s*(.*)$') {
          $rest = $Matches[1].Trim()
          if ($rest) { $subject = $rest }
        }
        continue
      }
      if (-not $inEntry) { continue }
      if ($line -match '^---\s*$') { break }
      if ($line -match '^###\s+') { break }
      if ($line -match '^- \*\*Focus:\*\*\s*(.+)$' -or $line -match '^- Focus:\s*(.+)$') {
        $focus = $Matches[1].Trim()
        # Prefer focus when header was just a date
        if ($subject -match '^\d{4}-\d{2}-\d{2}' -or $subject.Length -lt 12) {
          $subject = $focus
        }
        $bodyLines.Add("Focus: $focus") | Out-Null
        continue
      }
      if ($line -match '^- \*\*Done:\*\*' -or $line -match '^- Done:') { continue }
      if ($line -match '^\s+-\s+(.+)$' -and $bodyLines.Count -lt 8) {
        $bodyLines.Add("- $($Matches[1].Trim())") | Out-Null
        continue
      }
      if ($line -match '^- \*\*Next:\*\*\s*(.+)$' -or $line -match '^- Next:\s*(.+)$') {
        $bodyLines.Add("Next: $($Matches[1].Trim())") | Out-Null
      }
    }
  }

  if (-not $subject) {
    # Fallback: first changed path basename
    $changed = git status --porcelain 2>$null | ForEach-Object { $_.Substring(3).Trim() } | Select-Object -First 5
    if ($changed) {
      $subject = "update " + (($changed | ForEach-Object { Split-Path $_ -Leaf }) -join ", ")
      if ($subject.Length -gt 72) { $subject = $subject.Substring(0, 69) + "..." }
    } else {
      $subject = "cycle complete"
    }
  }

  # Clean subject for git (single line, reasonable length)
  $subject = ($subject -replace '\s+', ' ').Trim()
  if ($subject.Length -gt 72) { $subject = $subject.Substring(0, 69) + "..." }

  $prefix = if ($Cycle -gt 0) { "overseer cycle ${Cycle}: " } else { "overseer: " }
  $fullSubject = $prefix + $subject
  if ($fullSubject.Length -gt 100) {
    $fullSubject = $fullSubject.Substring(0, 97) + "..."
  }

  $body = ""
  if ($bodyLines.Count -gt 0) {
    $body = ($bodyLines -join "`n")
  }
  $body += "$(if ($body) { "`n`n" })Automated commit after overseer cycle."

  return [pscustomobject]@{
    Subject = $fullSubject
    Body    = $body.Trim()
  }
}

# Ensure we're in a git repo
try {
  git rev-parse --is-inside-work-tree 2>$null | Out-Null
} catch {
  Write-Host "commit-cycle: not a git repo — skip."
  exit 0
}

$status = git status --porcelain
if (-not $status) {
  Write-Host "commit-cycle: working tree clean — nothing to commit."
  exit 0
}

Write-Host "commit-cycle: changes detected:"
git status --short

$msg = Get-OverseerCommitMessage -Cycle $CycleNumber
Write-Host "commit-cycle: subject: $($msg.Subject)"

# Stage everything (respects .gitignore — logs/session-id stay out)
git add -A

# Re-check after add (all ignored?)
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "commit-cycle: nothing staged after git add (ignored only) — skip."
  exit 0
}

# Commit with subject + body (PowerShell-safe, no HEREDOC required)
$env:GIT_AUTHOR_DATE = $null
git commit -m $msg.Subject -m $msg.Body
if ($LASTEXITCODE -ne 0) {
  Write-Host "commit-cycle: git commit failed (exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}

Write-Host "commit-cycle: committed."

if ($SkipPush) {
  Write-Host "commit-cycle: SkipPush set — not pushing."
  exit 0
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "commit-cycle: pushing to origin/$branch ..."
git push -u origin HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Host "commit-cycle: git push failed (exit $LASTEXITCODE). Commit is local."
  exit $LASTEXITCODE
}

Write-Host "commit-cycle: push OK."
exit 0
