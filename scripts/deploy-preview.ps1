[CmdletBinding()]
param(
  [string]$Project = "approval-app",
  [string]$Team = "team_LPbk7bp4UBMSijEI2bBgaTJm",
  [string]$Branch = "codex/approval-tracking",
  [string]$Alias = "approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app",
  [switch]$SkipTests,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host "> $File $($Arguments -join ' ')"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $File @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) {
    throw "$File exited with code $exitCode."
  }
}

function Invoke-CaptureChecked {
  param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host "> $File $($Arguments -join ' ')"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $File @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $output | ForEach-Object { Write-Host $_ }
  if ($exitCode -ne 0) {
    throw "$File exited with code $exitCode."
  }
  return $output
}

function Get-FirstUrl {
  param([Parameter(Mandatory = $true)][object[]]$Lines)

  $matches = @()
  foreach ($line in $Lines) {
    $lineMatches = [regex]::Matches([string]$line, "https://[^\s]+\.vercel\.app")
    foreach ($match in $lineMatches) {
      $matches += $match.Value
    }
  }

  if ($matches.Count -eq 0) {
    return ""
  }

  return $matches[$matches.Count - 1]
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -eq "HEAD") {
  throw "Refusing to deploy from detached HEAD. Switch to $Branch first."
}

if ($currentBranch -ne $Branch -and -not $Force) {
  throw "Current branch is $currentBranch. Expected $Branch. Pass -Force only for deliberate exceptions."
}

$dirty = @(& git status --porcelain)
if ($dirty.Count -gt 0) {
  throw "Refusing to deploy with uncommitted changes. Commit or stash first."
}

if (-not $SkipTests) {
  Invoke-Checked "npm" @("test")
}

$commit = (& git rev-parse HEAD).Trim()
Invoke-Checked "git" @("push", "origin", "HEAD:$Branch")

if (-not (Test-Path ".vercel/project.json")) {
  Invoke-Checked "vercel" @("link", "--yes", "--team", $Team, "--project", $Project)
}

$deploymentOutput = Invoke-CaptureChecked "vercel" @(
  "deploy",
  "--yes",
  "--target", "preview",
  "--scope", $Team,
  "--meta", "gitBranch=$Branch",
  "--meta", "gitCommitSha=$commit"
)
$deploymentUrl = Get-FirstUrl $deploymentOutput
if (-not $deploymentUrl) {
  throw "Vercel deploy succeeded but no deployment URL was found in CLI output."
}

Invoke-Checked "vercel" @("alias", "set", $deploymentUrl, $Alias, "--scope", $Team)

$inspectOutput = Invoke-CaptureChecked "vercel" @("inspect", $Alias, "--scope", $Team)
$resolvedUrl = Get-FirstUrl $inspectOutput
if ($resolvedUrl -ne $deploymentUrl) {
  throw "Alias verification failed. $Alias resolved to $resolvedUrl, expected $deploymentUrl."
}

Write-Host ""
Write-Host "Deployment ready."
Write-Host "Commit: $commit"
Write-Host "Deployment: $deploymentUrl"
Write-Host "Alias: https://$Alias"
