[CmdletBinding()]
param(
  [string]$Project = "approval-app",
  [string]$Team = "team_LPbk7bp4UBMSijEI2bBgaTJm",
  [string]$Branch = "codex/approval-tracking",
  [string]$Alias = "approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app",
  [int]$DeployTimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$gitSafetyArguments = @(
  "-c",
  "safe.directory=$($repoRoot.Replace('\', '/'))"
)

$requiredVercelCliVersion = "53.3.2"
$vercelAuthArguments = @()
if (-not [string]::IsNullOrWhiteSpace($env:VERCEL_TOKEN)) {
  $vercelAuthArguments = @("--token", $env:VERCEL_TOKEN)
}

function Format-CommandArguments {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $displayArguments = @()
  $redactNext = $false
  foreach ($argument in $Arguments) {
    if ($redactNext) {
      $displayArguments += "<redacted>"
      $redactNext = $false
      continue
    }

    $displayArguments += $argument
    if ($argument -eq "--token") {
      $redactNext = $true
    }
  }

  return $displayArguments -join " "
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host "> $File $(Format-CommandArguments $Arguments)"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $exitCode = $null
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

  Write-Host "> $File $(Format-CommandArguments $Arguments)"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $exitCode = $null
  try {
    $output = @(& $File @Arguments 2>&1)
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

function Assert-VercelCliVersion {
  $output = @(Invoke-CaptureChecked "vercel" @("--version") -Quiet)
  $versions = @(
    $output |
      ForEach-Object {
        [regex]::Matches([string]$_, '(?<!\d)(\d+\.\d+\.\d+)(?!\d)') |
          ForEach-Object { $_.Groups[1].Value }
      } |
      Sort-Object -Unique
  )

  if ($versions.Count -ne 1 -or $versions[0] -cne $requiredVercelCliVersion) {
    throw "Vercel CLI version must be exactly $requiredVercelCliVersion; found '$($versions -join ', ')'."
  }
}

function Convert-JsonOutput {
  param([Parameter(Mandatory = $true)][object[]]$Lines)

  $textLines = @($Lines | ForEach-Object { [string]$_ })
  for ($start = 0; $start -lt $textLines.Count; $start++) {
    $trimmed = $textLines[$start].TrimStart()
    if (-not ($trimmed.StartsWith("{") -or $trimmed.StartsWith("["))) {
      continue
    }

    for ($end = $textLines.Count - 1; $end -ge $start; $end--) {
      $jsonText = ($textLines[$start..$end]) -join "`n"
      try {
        return $jsonText | ConvertFrom-Json -ErrorAction Stop
      } catch {
        # Vercel can write notices before or after JSON. Keep trimming trailing lines.
      }
    }
  }

  throw "Unable to parse JSON from command output."
}

function Get-ObjectProperty {
  param(
    [AllowNull()][object]$Value,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ($null -eq $Value) {
    return $null
  }
  $property = $Value.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }
  return $property.Value
}

function Assert-ExactValue {
  param(
    [AllowNull()][object]$Actual,
    [AllowNull()][object]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ([string]$Actual -cne [string]$Expected) {
    throw "$Label was '$Actual'; expected '$Expected'."
  }
}

function Normalize-DeploymentHost {
  param([Parameter(Mandatory = $true)][string]$Value)

  $candidate = $Value.Trim()
  if ($candidate.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase)) {
    $uri = [Uri]$candidate
    if ($uri.AbsolutePath -ne "/" -or -not [string]::IsNullOrEmpty($uri.Query)) {
      throw "Deployment URL must not contain a path or query: $Value"
    }
    $candidate = $uri.Host
  }

  if (
    $candidate.Contains("/") -or
    [Uri]::CheckHostName($candidate) -eq [UriHostNameType]::Unknown
  ) {
    throw "Invalid deployment hostname: $Value"
  }
  return $candidate.ToLowerInvariant()
}

function Get-ReleaseDefinition {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)

  $releasePath = Join-Path $RepoRoot "release.json"
  if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) {
    throw "Missing release manifest: $releasePath"
  }

  try {
    $release = Get-Content -LiteralPath $releasePath -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Unable to parse release.json: $($_.Exception.Message)"
  }

  Assert-ExactValue (Get-ObjectProperty $release "schemaVersion") 1 "release.json schemaVersion"
  Assert-ExactValue (Get-ObjectProperty $release "productionBranch") "main" "release.json productionBranch"
  $releaseName = [string](Get-ObjectProperty $release "name")
  if ([string]::IsNullOrWhiteSpace($releaseName) -or $releaseName -cne $releaseName.Trim()) {
    throw "release.json name must be a non-empty, trimmed string."
  }
  return $release
}

function Get-VercelProject {
  param([Parameter(Mandatory = $true)][string]$ProjectName)

  $escapedProject = [Uri]::EscapeDataString($ProjectName)
  $arguments = @(
    "api", "/v9/projects/$escapedProject",
    "--scope", $Team,
    "--raw"
  ) + $vercelAuthArguments
  $output = @(Invoke-CaptureChecked "vercel" $arguments -Quiet)
  return Convert-JsonOutput $output
}

function Get-VercelDeployment {
  param([Parameter(Mandatory = $true)][string]$Deployment)

  $hostName = Normalize-DeploymentHost $Deployment
  $escapedDeployment = [Uri]::EscapeDataString($hostName)
  $arguments = @(
    "api", "/v13/deployments/$escapedDeployment",
    "--scope", $Team,
    "--raw"
  ) + $vercelAuthArguments
  $output = @(Invoke-CaptureChecked "vercel" $arguments -Quiet)
  return Convert-JsonOutput $output
}

function Get-VersionIdentity {
  param([Parameter(Mandatory = $true)][string]$Deployment)

  $arguments = @(
    "curl", "/api/version",
    "--deployment", $Deployment,
    "--scope", $Team
  ) + $vercelAuthArguments
  $output = @(Invoke-CaptureChecked "vercel" $arguments -Quiet)
  return Convert-JsonOutput $output
}

function Assert-VersionIdentity {
  param(
    [Parameter(Mandatory = $true)][object]$Identity,
    [Parameter(Mandatory = $true)][string]$ReleaseName,
    [Parameter(Mandatory = $true)][string]$Revision,
    [Parameter(Mandatory = $true)][string]$DeploymentId,
    [Parameter(Mandatory = $true)][string]$Environment,
    [Parameter(Mandatory = $true)][bool]$CanonicalProduction
  )

  Assert-ExactValue (Get-ObjectProperty $Identity "schemaVersion") 1 "Version API schemaVersion"
  Assert-ExactValue (Get-ObjectProperty $Identity "application") "approval-app" "Version API application"

  $release = Get-ObjectProperty $Identity "release"
  Assert-ExactValue (Get-ObjectProperty $release "name") $ReleaseName "Version API release name"

  $source = Get-ObjectProperty $Identity "source"
  if ($null -eq $source) {
    throw "Version API source identity is missing."
  }
  Assert-ExactValue (Get-ObjectProperty $source "revision") $Revision "Version API revision"
  Assert-ExactValue (Get-ObjectProperty $source "provenance") "vercel-git" "Version API provenance"
  $shortRevision = [string](Get-ObjectProperty $source "shortRevision")
  if (
    $shortRevision.Length -lt 7 -or
    $shortRevision.Length -gt $Revision.Length -or
    -not $Revision.StartsWith($shortRevision, [StringComparison]::Ordinal)
  ) {
    throw "Version API shortRevision '$shortRevision' is not a valid prefix of '$Revision'."
  }

  $artifact = Get-ObjectProperty $Identity "artifact"
  Assert-ExactValue (Get-ObjectProperty $artifact "id") $DeploymentId "Version API artifact id"
  Assert-ExactValue (Get-ObjectProperty $artifact "origin") "vercel" "Version API artifact origin"

  $deployment = Get-ObjectProperty $Identity "deployment"
  Assert-ExactValue (Get-ObjectProperty $deployment "platform") "vercel" "Version API deployment platform"
  Assert-ExactValue (Get-ObjectProperty $deployment "environment") $Environment "Version API environment"
  Assert-ExactValue (Get-ObjectProperty $deployment "id") $DeploymentId "Version API deployment id"

  $canonicalValue = Get-ObjectProperty $Identity "canonicalProduction"
  if ($canonicalValue -isnot [bool] -or $canonicalValue -ne $CanonicalProduction) {
    throw "Version API canonicalProduction was '$canonicalValue'; expected '$CanonicalProduction'."
  }
}

function Assert-PreviewDeployment {
  param(
    [Parameter(Mandatory = $true)][object]$Deployment,
    [Parameter(Mandatory = $true)][object]$VercelProject,
    [Parameter(Mandatory = $true)][string]$CommitSha,
    [Parameter(Mandatory = $true)][string]$ExpectedBranch
  )

  Assert-ExactValue (Get-ObjectProperty $Deployment "readyState") "READY" "Deployment readyState"
  Assert-ExactValue (Get-ObjectProperty $Deployment "source") "git" "Deployment source"
  Assert-ExactValue (Get-ObjectProperty $Deployment "projectId") (Get-ObjectProperty $VercelProject "id") "Deployment project id"
  Assert-ExactValue (Get-ObjectProperty $Deployment "ownerId") (Get-ObjectProperty $VercelProject "accountId") "Deployment owner id"

  $target = Get-ObjectProperty $Deployment "target"
  if ($null -ne $target -and [string]$target -cne "preview") {
    throw "Deployment target was '$target'; expected Preview."
  }

  $deploymentId = [string](Get-ObjectProperty $Deployment "id")
  if ($deploymentId -notmatch '^dpl_[A-Za-z0-9]+$') {
    throw "Deployment id '$deploymentId' is not an immutable Vercel deployment id."
  }

  $meta = Get-ObjectProperty $Deployment "meta"
  Assert-ExactValue (Get-ObjectProperty $meta "githubCommitSha") $CommitSha "Deployment Git SHA"
  Assert-ExactValue (Get-ObjectProperty $meta "githubCommitRef") $ExpectedBranch "Deployment Git ref"
}

function Get-ReadyGitPreviewForCommit {
  param(
    [Parameter(Mandatory = $true)][object]$VercelProject,
    [Parameter(Mandatory = $true)][string]$CommitSha,
    [Parameter(Mandatory = $true)][string]$ExpectedBranch
  )

  $arguments = @(
    "list", $Project,
    "--scope", $Team,
    "--environment", "preview",
    "--status", "READY",
    "--meta", "githubCommitSha=$CommitSha",
    "--meta", "githubCommitRef=$ExpectedBranch",
    "--format", "json"
  ) + $vercelAuthArguments
  $listOutput = @(Invoke-CaptureChecked "vercel" $arguments -Quiet)
  $deployments = Convert-JsonOutput $listOutput
  $matches = @(
    @(Get-ObjectProperty $deployments "deployments") |
      Where-Object {
        $meta = Get-ObjectProperty $_ "meta"
        (Get-ObjectProperty $_ "state") -ceq "READY" -and
        (Get-ObjectProperty $meta "githubCommitSha") -ceq $CommitSha -and
        (Get-ObjectProperty $meta "githubCommitRef") -ceq $ExpectedBranch
      } |
      Sort-Object -Property createdAt -Descending
  )

  if ($matches.Count -eq 0) {
    return $null
  }

  $listedHost = Normalize-DeploymentHost ([string](Get-ObjectProperty $matches[0] "url"))
  $deployment = Get-VercelDeployment $listedHost
  Assert-PreviewDeployment $deployment $VercelProject $CommitSha $ExpectedBranch
  Assert-ExactValue (
    Normalize-DeploymentHost ([string](Get-ObjectProperty $deployment "url"))
  ) $listedHost "Listed Preview deployment URL"
  return $deployment
}

$resolvedRepoRootOutput = @(& git @gitSafetyArguments rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or $resolvedRepoRootOutput.Count -eq 0) {
  throw "Unable to resolve the Git repository root."
}
$resolvedRepoRoot = ($resolvedRepoRootOutput -join "`n").Trim()
if (
  [IO.Path]::GetFullPath($resolvedRepoRoot).TrimEnd('\') -cne
  $repoRoot.TrimEnd('\')
) {
  throw "Script repository root '$repoRoot' does not match Git root '$resolvedRepoRoot'."
}
Set-Location $repoRoot

$releaseDefinition = Get-ReleaseDefinition $repoRoot
$releaseName = [string](Get-ObjectProperty $releaseDefinition "name")

$currentBranch = (& git @gitSafetyArguments rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $currentBranch -eq "HEAD") {
  throw "Refusing to deploy from detached HEAD."
}
if ($currentBranch -cne $Branch) {
  throw "Current branch is '$currentBranch'. Expected '$Branch'."
}

$dirty = @(& git @gitSafetyArguments status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect the Git working tree."
}
if ($dirty.Count -gt 0) {
  throw "Refusing to deploy with uncommitted changes."
}

Assert-VercelCliVersion
Invoke-Checked "npm" @("run", "verify")

$commit = (& git @gitSafetyArguments rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
  throw "Unable to resolve a full lowercase Git revision."
}
Invoke-Checked "git" ($gitSafetyArguments + @(
  "push", "origin", "HEAD:refs/heads/$Branch"
))

$vercelProject = Get-VercelProject $Project
Assert-ExactValue (Get-ObjectProperty $vercelProject "name") $Project "Vercel project name"
Assert-ExactValue (Get-ObjectProperty $vercelProject "accountId") $Team "Vercel project owner"
$autoExposeSystemEnvs = Get-ObjectProperty $vercelProject "autoExposeSystemEnvs"
if ($autoExposeSystemEnvs -isnot [bool] -or $autoExposeSystemEnvs -ne $true) {
  throw "Vercel must automatically expose System Environment Variables before preview validation."
}

$normalizedAlias = Normalize-DeploymentHost $Alias
$productionTarget = Get-ObjectProperty (Get-ObjectProperty $vercelProject "targets") "production"
$productionAliases = @(
  @(Get-ObjectProperty $productionTarget "alias") +
  @(Get-ObjectProperty $productionTarget "automaticAliases")
) | Where-Object { $null -ne $_ } | ForEach-Object { ([string]$_).ToLowerInvariant() }
if ($productionAliases -contains $normalizedAlias) {
  throw "Refusing to use Production domain '$normalizedAlias' as a preview alias."
}

$deadline = (Get-Date).AddSeconds($DeployTimeoutSeconds)
$deployment = $null
while ((Get-Date) -lt $deadline) {
  $deployment = Get-ReadyGitPreviewForCommit $vercelProject $commit $Branch
  if ($null -ne $deployment) {
    break
  }

  Write-Host "Waiting for a READY Vercel Git Preview deployment for $commit..."
  Start-Sleep -Seconds 10
}

if ($null -eq $deployment) {
  throw "Timed out waiting for a READY Vercel Git Preview deployment for $commit on '$Branch'."
}

$deploymentId = [string](Get-ObjectProperty $deployment "id")
$deploymentHost = Normalize-DeploymentHost ([string](Get-ObjectProperty $deployment "url"))
$deploymentUrl = "https://$deploymentHost"

$immutableIdentity = Get-VersionIdentity $deploymentUrl
Assert-VersionIdentity $immutableIdentity $releaseName $commit $deploymentId "preview" $false

$aliasArguments = @(
  "alias", "set", $deploymentUrl, $normalizedAlias,
  "--scope", $Team
) + $vercelAuthArguments
Invoke-Checked "vercel" $aliasArguments

$aliasDeployment = Get-VercelDeployment $normalizedAlias
Assert-ExactValue (Get-ObjectProperty $aliasDeployment "id") $deploymentId "Preview alias deployment id"
Assert-ExactValue (Normalize-DeploymentHost ([string](Get-ObjectProperty $aliasDeployment "url"))) $deploymentHost "Preview alias canonical deployment"

$aliasIdentity = Get-VersionIdentity $normalizedAlias
Assert-VersionIdentity $aliasIdentity $releaseName $commit $deploymentId "preview" $false

Write-Host ""
Write-Host "Preview deployment verified and aliased."
Write-Host "Release: $releaseName"
Write-Host "Commit: $commit"
Write-Host "Deployment ID: $deploymentId"
Write-Host "Immutable deployment: $deploymentUrl"
Write-Host "Preview alias: https://$normalizedAlias"
