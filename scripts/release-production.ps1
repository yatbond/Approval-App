[CmdletBinding()]
param(
  [string]$Project = "approval-app",
  [string]$Team = "team_LPbk7bp4UBMSijEI2bBgaTJm",
  [string]$ProductionAlias = "approval-app-three.vercel.app",
  [int]$DeployTimeoutSeconds = 300,
  [int]$AliasTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$gitSafetyArguments = @(
  "-c",
  "safe.directory=$($repoRoot.Replace('\', '/'))"
)

$requiredVercelCliVersion = "53.3.2"
$productionBranch = "main"
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
  Assert-ExactValue (Get-ObjectProperty $release "productionBranch") $productionBranch "release.json productionBranch"
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
    [Parameter(Mandatory = $true)][string]$DeploymentId
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
  Assert-ExactValue (Get-ObjectProperty $deployment "environment") "production" "Version API environment"
  Assert-ExactValue (Get-ObjectProperty $deployment "id") $DeploymentId "Version API deployment id"

  $canonicalValue = Get-ObjectProperty $Identity "canonicalProduction"
  if ($canonicalValue -isnot [bool] -or $canonicalValue -ne $true) {
    throw "Version API canonicalProduction was '$canonicalValue'; expected 'True'."
  }
}

function Test-LocalTagExists {
  param([Parameter(Mandatory = $true)][string]$TagName)

  & git @gitSafetyArguments show-ref --verify --quiet "refs/tags/$TagName"
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    return $true
  }
  if ($exitCode -eq 1) {
    return $false
  }
  throw "Unable to check local Git tag '$TagName' (exit code $exitCode)."
}

function Test-RemoteTagExists {
  param([Parameter(Mandatory = $true)][string]$TagName)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $null = & git @gitSafetyArguments ls-remote --exit-code --tags origin "refs/tags/$TagName" 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -eq 0) {
    return $true
  }
  if ($exitCode -eq 2) {
    return $false
  }
  throw "Unable to check remote Git tag '$TagName' (exit code $exitCode)."
}

function Assert-StagedProductionDeployment {
  param(
    [Parameter(Mandatory = $true)][object]$Deployment,
    [Parameter(Mandatory = $true)][object]$VercelProject,
    [Parameter(Mandatory = $true)][string]$CommitSha
  )

  Assert-ExactValue (Get-ObjectProperty $Deployment "readyState") "READY" "Deployment readyState"
  Assert-ExactValue (Get-ObjectProperty $Deployment "readySubstate") "STAGED" "Deployment readySubstate"
  Assert-ExactValue (Get-ObjectProperty $Deployment "source") "git" "Deployment source"
  Assert-ExactValue (Get-ObjectProperty $Deployment "target") "production" "Deployment target"
  Assert-ExactValue (Get-ObjectProperty $Deployment "projectId") (Get-ObjectProperty $VercelProject "id") "Deployment project id"
  Assert-ExactValue (Get-ObjectProperty $Deployment "ownerId") (Get-ObjectProperty $VercelProject "accountId") "Deployment owner id"

  $aliasAssigned = Get-ObjectProperty $Deployment "aliasAssigned"
  if ($aliasAssigned -isnot [bool] -or $aliasAssigned -ne $false) {
    throw "Deployment is not staged: aliasAssigned was '$aliasAssigned'; expected 'False'."
  }

  $deploymentId = [string](Get-ObjectProperty $Deployment "id")
  if ($deploymentId -notmatch '^dpl_[A-Za-z0-9]+$') {
    throw "Deployment id '$deploymentId' is not an immutable Vercel deployment id."
  }

  $meta = Get-ObjectProperty $Deployment "meta"
  Assert-ExactValue (Get-ObjectProperty $meta "githubCommitSha") $CommitSha "Deployment Git SHA"
  Assert-ExactValue (Get-ObjectProperty $meta "githubCommitRef") $productionBranch "Deployment Git ref"
}

function Get-StagedProductionDeployment {
  param(
    [Parameter(Mandatory = $true)][object]$VercelProject,
    [Parameter(Mandatory = $true)][string]$CommitSha
  )

  $arguments = @(
    "list", $Project,
    "--scope", $Team,
    "--environment", "production",
    "--status", "READY",
    "--meta", "githubCommitSha=$CommitSha",
    "--meta", "githubCommitRef=$productionBranch",
    "--format", "json"
  ) + $vercelAuthArguments
  $listOutput = @(Invoke-CaptureChecked "vercel" $arguments -Quiet)
  $deployments = Convert-JsonOutput $listOutput
  $matches = @(
    @(Get-ObjectProperty $deployments "deployments") |
      Where-Object {
        $meta = Get-ObjectProperty $_ "meta"
        (Get-ObjectProperty $_ "state") -ceq "READY" -and
        (Get-ObjectProperty $_ "target") -ceq "production" -and
        (Get-ObjectProperty $meta "githubCommitSha") -ceq $CommitSha -and
        (Get-ObjectProperty $meta "githubCommitRef") -ceq $productionBranch
      } |
      Sort-Object -Property createdAt -Descending
  )

  $stagedDeployments = @()
  foreach ($match in $matches) {
    $listedHost = Normalize-DeploymentHost ([string](Get-ObjectProperty $match "url"))
    $candidate = Get-VercelDeployment $listedHost
    $candidateHost = Normalize-DeploymentHost ([string](Get-ObjectProperty $candidate "url"))
    if ($candidateHost -cne $listedHost) {
      throw "Listed Production deployment '$listedHost' resolved to different canonical deployment '$candidateHost'."
    }
    if (
      (Get-ObjectProperty $candidate "source") -ceq "git" -and
      (Get-ObjectProperty $candidate "target") -ceq "production" -and
      (Get-ObjectProperty $candidate "readyState") -ceq "READY" -and
      (Get-ObjectProperty $candidate "readySubstate") -ceq "STAGED" -and
      (Get-ObjectProperty $candidate "aliasAssigned") -is [bool] -and
      (Get-ObjectProperty $candidate "aliasAssigned") -eq $false
    ) {
      $stagedDeployments += $candidate
    }
  }

  if ($stagedDeployments.Count -eq 0) {
    return $null
  }
  if ($stagedDeployments.Count -gt 1) {
    $candidateIds = $stagedDeployments |
      ForEach-Object { [string](Get-ObjectProperty $_ "id") }
    throw "Multiple staged Production deployments match ${CommitSha}: $($candidateIds -join ', ')."
  }

  Assert-StagedProductionDeployment $stagedDeployments[0] $VercelProject $CommitSha
  return $stagedDeployments[0]
}

function Wait-ForProductionAlias {
  param(
    [Parameter(Mandatory = $true)][string]$Alias,
    [Parameter(Mandatory = $true)][string]$ExpectedDeploymentId
  )

  $deadline = (Get-Date).AddSeconds($AliasTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $resolvedDeployment = Get-VercelDeployment $Alias
    if ((Get-ObjectProperty $resolvedDeployment "id") -ceq $ExpectedDeploymentId) {
      return $resolvedDeployment
    }
    Start-Sleep -Seconds 5
  }

  throw "Production alias '$Alias' did not resolve to '$ExpectedDeploymentId' within $AliasTimeoutSeconds seconds."
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

$currentBranch = (& git @gitSafetyArguments rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $currentBranch -cne $productionBranch) {
  throw "Production releases must run from the '$productionBranch' branch; current branch is '$currentBranch'."
}

$dirty = @(& git @gitSafetyArguments status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect the Git working tree."
}
if ($dirty.Count -gt 0) {
  throw "Refusing to release with uncommitted changes."
}

Assert-VercelCliVersion
Invoke-Checked "git" ($gitSafetyArguments + @(
  "fetch", "origin", $productionBranch
))

$commit = (& git @gitSafetyArguments rev-parse HEAD).Trim()
$originCommit = (& git @gitSafetyArguments rev-parse "refs/remotes/origin/$productionBranch").Trim()
if (
  $LASTEXITCODE -ne 0 -or
  $commit -notmatch '^[0-9a-f]{40}$' -or
  $originCommit -notmatch '^[0-9a-f]{40}$'
) {
  throw "Unable to resolve full lowercase Git revisions for local and origin/$productionBranch."
}
Assert-ExactValue $commit $originCommit "Local HEAD versus origin/$productionBranch"

$releaseDefinition = Get-ReleaseDefinition $repoRoot
$releaseName = [string](Get-ObjectProperty $releaseDefinition "name")
Invoke-Checked "git" ($gitSafetyArguments + @(
  "check-ref-format", "refs/tags/$releaseName"
))
if (Test-LocalTagExists $releaseName) {
  throw "Release tag '$releaseName' already exists locally."
}
if (Test-RemoteTagExists $releaseName) {
  throw "Release tag '$releaseName' already exists on origin."
}

Invoke-Checked "npm" @("run", "verify")

$vercelProject = Get-VercelProject $Project
Assert-ExactValue (Get-ObjectProperty $vercelProject "name") $Project "Vercel project name"
Assert-ExactValue (Get-ObjectProperty $vercelProject "accountId") $Team "Vercel project owner"
$projectLink = Get-ObjectProperty $vercelProject "link"
Assert-ExactValue (Get-ObjectProperty $projectLink "productionBranch") $productionBranch "Vercel production branch"

$autoExposeSystemEnvs = Get-ObjectProperty $vercelProject "autoExposeSystemEnvs"
if ($autoExposeSystemEnvs -isnot [bool] -or $autoExposeSystemEnvs -ne $true) {
  throw "Vercel autoExposeSystemEnvs must be True."
}
$autoAssignCustomDomains = Get-ObjectProperty $vercelProject "autoAssignCustomDomains"
if ($autoAssignCustomDomains -isnot [bool] -or $autoAssignCustomDomains -ne $false) {
  throw "Vercel autoAssignCustomDomains must be False so Production builds remain staged."
}

$normalizedProductionAlias = Normalize-DeploymentHost $ProductionAlias
$productionTarget = Get-ObjectProperty (Get-ObjectProperty $vercelProject "targets") "production"
$configuredProductionAliases = @(
  @(Get-ObjectProperty $productionTarget "alias") +
  @(Get-ObjectProperty $productionTarget "automaticAliases")
) | Where-Object { $null -ne $_ } | ForEach-Object { ([string]$_).ToLowerInvariant() }
if ($configuredProductionAliases -notcontains $normalizedProductionAlias) {
  throw "Production alias '$normalizedProductionAlias' is not configured on Vercel project '$Project'."
}

$previousProduction = Get-VercelDeployment $normalizedProductionAlias
$previousDeploymentId = [string](Get-ObjectProperty $previousProduction "id")
if ($previousDeploymentId -notmatch '^dpl_[A-Za-z0-9]+$') {
  throw "Unable to resolve the current Production deployment from '$normalizedProductionAlias'."
}

$deadline = (Get-Date).AddSeconds($DeployTimeoutSeconds)
$deployment = $null
while ((Get-Date) -lt $deadline) {
  $deployment = Get-StagedProductionDeployment $vercelProject $commit
  if ($null -ne $deployment) {
    break
  }

  Write-Host "Waiting for a READY staged Vercel Git Production deployment for $commit..."
  Start-Sleep -Seconds 10
}

if ($null -eq $deployment) {
  throw "Timed out waiting for a READY staged Vercel Git Production deployment for $commit."
}

$deploymentId = [string](Get-ObjectProperty $deployment "id")
if ($deploymentId -ceq $previousDeploymentId) {
  throw "Deployment '$deploymentId' is already serving '$normalizedProductionAlias'; it is not a staged release candidate."
}
$deploymentHost = Normalize-DeploymentHost ([string](Get-ObjectProperty $deployment "url"))
$deploymentUrl = "https://$deploymentHost"

$immutableIdentity = Get-VersionIdentity $deploymentUrl
Assert-VersionIdentity $immutableIdentity $releaseName $commit $deploymentId

Write-Host ""
Write-Host "Release candidate verified."
Write-Host "Release: $releaseName"
Write-Host "Commit: $commit"
Write-Host "Deployment ID: $deploymentId"
Write-Host "Immutable deployment: $deploymentUrl"
Write-Host "Previous Production deployment: $previousDeploymentId"

$promoteArguments = @(
  "promote", $deploymentId,
  "--yes",
  "--timeout", "10m",
  "--scope", $Team
) + $vercelAuthArguments
Invoke-Checked "vercel" $promoteArguments

$liveDeployment = Wait-ForProductionAlias $normalizedProductionAlias $deploymentId
Assert-ExactValue (Normalize-DeploymentHost ([string](Get-ObjectProperty $liveDeployment "url"))) $deploymentHost "Production alias canonical deployment"
Assert-ExactValue (Get-ObjectProperty $liveDeployment "projectId") (Get-ObjectProperty $vercelProject "id") "Live deployment project id"
Assert-ExactValue (Get-ObjectProperty $liveDeployment "ownerId") (Get-ObjectProperty $vercelProject "accountId") "Live deployment owner id"

$liveIdentity = Get-VersionIdentity $normalizedProductionAlias
Assert-VersionIdentity $liveIdentity $releaseName $commit $deploymentId

$tagManifest = [ordered]@{
  schemaVersion = 1
  release = $releaseName
  revision = $commit
  deploymentId = $deploymentId
  deploymentUrl = $deploymentUrl
  productionAlias = "https://$normalizedProductionAlias"
  project = $Project
  owner = $Team
  promotedAt = [DateTimeOffset]::UtcNow.ToString("o")
}
$tagMessage = $tagManifest | ConvertTo-Json -Compress
Invoke-Checked "git" ($gitSafetyArguments + @(
  "tag", "--annotate", $releaseName, $commit, "--message", $tagMessage
))
try {
  Invoke-Checked "git" ($gitSafetyArguments + @(
    "push", "origin",
    "refs/tags/${releaseName}:refs/tags/${releaseName}"
  ))
} catch {
  Invoke-Checked "git" ($gitSafetyArguments + @(
    "tag", "--delete", $releaseName
  ))
  throw
}

Write-Host ""
Write-Host "Production release verified and tagged."
Write-Host "Release: $releaseName"
Write-Host "Commit: $commit"
Write-Host "Deployment ID: $deploymentId"
Write-Host "Production: https://$normalizedProductionAlias"
Write-Host "Tag: $releaseName"
