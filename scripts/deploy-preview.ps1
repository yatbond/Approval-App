[CmdletBinding()]
param(
  [string]$Project = "approval-app",
  [string]$Team = "team_LPbk7bp4UBMSijEI2bBgaTJm",
  [string]$Branch = "codex/approval-tracking",
  [string]$Alias = "approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app",
  [int]$DeployTimeoutSeconds = 300,
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
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$Quiet
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
  if (-not $Quiet) {
    $output | ForEach-Object { Write-Host $_ }
  }
  if ($exitCode -ne 0) {
    throw "$File exited with code $exitCode."
  }
  return $output
}

function Convert-JsonOutput {
  param([Parameter(Mandatory = $true)][object[]]$Lines)

  $jsonText = ($Lines | ForEach-Object { [string]$_ }) -join "`n"
  try {
    return $jsonText | ConvertFrom-Json
  } catch {
    throw "Unable to parse Vercel JSON output: $($_.Exception.Message)"
  }
}

function Get-ReadyGithubDeploymentForCommit {
  param(
    [Parameter(Mandatory = $true)][string]$CommitSha,
    [Parameter(Mandatory = $true)][string]$ExpectedBranch
  )

  $listOutput = Invoke-CaptureChecked "vercel" @(
    "ls",
    $Project,
    "--scope", $Team,
    "--format", "json"
  ) -Quiet
  $deployments = Convert-JsonOutput $listOutput

  foreach ($deployment in $deployments.deployments) {
    if (
      $deployment.state -eq "READY" -and
      $deployment.meta.githubCommitSha -eq $CommitSha -and
      $deployment.meta.githubCommitRef -eq $ExpectedBranch
    ) {
      return $deployment
    }
  }

  return $null
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

$deadline = (Get-Date).AddSeconds($DeployTimeoutSeconds)
$deployment = $null
while ((Get-Date) -lt $deadline) {
  $deployment = Get-ReadyGithubDeploymentForCommit -CommitSha $commit -ExpectedBranch $Branch
  if ($null -ne $deployment) {
    break
  }

  Write-Host "Waiting for Vercel GitHub deployment for $commit..."
  Start-Sleep -Seconds 10
}

if ($null -eq $deployment) {
  throw "Timed out waiting for a Ready Vercel GitHub deployment for commit $commit."
}

$deploymentUrl = "https://$($deployment.url)"
Invoke-Checked "vercel" @("alias", "set", $deploymentUrl, $Alias, "--scope", $Team)

$inspectOutput = Invoke-CaptureChecked "vercel" @(
  "inspect",
  $Alias,
  "--scope", $Team,
  "--format", "json"
) -Quiet
$inspection = Convert-JsonOutput $inspectOutput
$resolvedUrl = "https://$($inspection.url)"
if ($resolvedUrl -ne $deploymentUrl) {
  throw "Alias verification failed. $Alias resolved to $resolvedUrl, expected $deploymentUrl."
}

Write-Host ""
Write-Host "Deployment ready."
Write-Host "Commit: $commit"
Write-Host "Deployment: $deploymentUrl"
Write-Host "Alias: https://$Alias"
