# Deployment Runbook

The release identity has five distinct states:

1. **Local** — the app runs outside Vercel and reports no hosted artifact identity.
2. **Integration Preview** — Vercel Git builds a branch in the Preview environment.
3. **Staged Production** — Vercel Git builds `main` with Production configuration, but no Production domain is assigned.
4. **Live Production** — Vercel promotes that exact staged deployment by immutable deployment ID. It does not rebuild.
5. **Manifest tag** — only after live identity verification, the release name is pushed as an annotated Git tag whose message records the deployment manifest.

Never treat a branch alias as release identity. A preview alias is only a convenient integration-test URL and may move at any time.

## Fixed Project Contract

- GitHub remote: `https://github.com/yatbond/Approval-App.git`
- Vercel project: `approval-app`
- Vercel team: `team_LPbk7bp4UBMSijEI2bBgaTJm`
- Vercel Production branch: `main`
- Canonical Production domain: `https://approval-app-three.vercel.app`
- Stable integration alias: `https://approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app`
- Tested and required Vercel CLI: `53.3.2`

The Vercel project must keep all three settings:

- Production branch is `main`.
- Automatically expose System Environment Variables is enabled.
- Auto-assign Custom Production Domains is disabled.

The Production release script verifies these settings through the Vercel API and stops before promotion if any setting differs.
Both deployment scripts also call `vercel --version` and require exactly `53.3.2`.
The CLI is intentionally not an application dependency; install and manage this
operator tool separately so its dependency tree is not shipped with the app.

## Release Manifest

`release.json` is committed with the application:

```json
{
  "schemaVersion": 1,
  "name": "production-YYYY-MM-DD-description",
  "productionBranch": "main"
}
```

The release name is also the annotated Git tag name. It must be unique locally and on `origin`.

Every hosted candidate must answer `GET /api/version` with:

- the exact release name from `release.json`;
- the full Git revision and a valid short revision;
- `vercel-git` provenance;
- the immutable Vercel deployment ID as both artifact and deployment identity;
- the correct Vercel environment; and
- the correct `canonicalProduction` value.

The scripts reject missing or approximate identity. A matching short SHA alone is not sufficient.

## Authentication

Use an authenticated Vercel CLI session:

```powershell
npm install --global vercel@53.3.2
vercel login
```

For non-interactive execution, set `VERCEL_TOKEN` in the process environment. The scripts pass it to Vercel without printing it:

```powershell
$env:VERCEL_TOKEN = "<token supplied by the secret store>"
```

Do not put tokens in the repository or in command history.

## 1. Local Verification

Start from a clean checkout and run the complete repository gate:

```powershell
npm ci
npm run verify
```

For local development:

```powershell
npm run dev
```

Local `/api/version` reports the committed release name and local source/artifact state. It is not evidence of a Vercel deployment.

## 2. Integration Preview

From a clean integration branch:

```powershell
npm run deploy:preview
```

For another branch and alias, invoke the script explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-preview.ps1 `
  -Branch "codex/version-visibility" `
  -Alias "approval-app-git-codex-version-visibility-derrick-pangs-projects.vercel.app"
```

The preview script performs the complete sequence:

1. Requires the exact named branch and a clean worktree.
2. Runs `npm run verify`.
3. Pushes the full local SHA to the same branch on `origin`.
4. Waits for a READY Vercel deployment whose source is Git and whose full `githubCommitSha` and `githubCommitRef` match.
5. Resolves the immutable deployment URL and `dpl_...` ID through the Vercel API.
6. Calls the immutable deployment exactly as follows:

   ```powershell
   vercel curl /api/version --deployment <immutable-url> --scope team_LPbk7bp4UBMSijEI2bBgaTJm
   ```

7. Requires Preview environment identity and `canonicalProduction: false`.
8. Only after immutable identity passes, assigns the stable preview alias.
9. Resolves and calls the alias again to prove it points to the same deployment ID and API identity.

The preview alias must never be passed to `vercel promote`.

## 3. Create the Staged Production Candidate

Open and merge the release pull request into protected `main`. The merge commit must include the intended `release.json`.

Vercel Git integration then creates a Production-environment deployment from `main`. Because Auto-assign Custom Production Domains is disabled, that deployment remains staged and the live domains do not move.

Vercel can still attach the automatic `git-main` branch alias to this staged
artifact. That convenience alias is not a Production domain and does not make
the candidate live. The release script allows branch aliases, but rejects any
candidate already serving one of the project's configured Production aliases.

The live identity check also tolerates Vercel CLI/native-curl progress records
being merged onto the same captured line as the JSON response. The release must
still parse and verify the exact `/api/version` payload before it creates and
pushes the annotated Production tag.

Confirm CI passes on the exact `main` SHA. Do not create a Production deployment with `vercel deploy`, `vercel --prod`, a redeploy button, or a Preview promotion. Those paths either create another artifact or lose the native Git identity required by this release contract.

## 4. Verify and Promote the Exact Candidate

Use a clean, current checkout of `main`:

```powershell
git switch main
git pull --ff-only origin main
npm run release:production
```

The Production script:

1. Requires clean local `main`.
2. Fetches `origin/main` and requires the full local and remote SHAs to be identical.
3. Rejects an invalid or colliding release tag before touching Production.
4. Runs `npm run verify`.
5. Verifies the Vercel project, owner, Production branch, System Environment Variables, and disabled domain auto-assignment.
6. Finds exactly one READY, staged, Git-created Production deployment with the full SHA and ref `main`.
7. Rejects CLI deployments, Preview deployments, already-live deployments, mutable aliases, wrong projects, and incomplete metadata.
8. Calls `/api/version` on the immutable deployment URL using `vercel curl`.
9. Requires Production identity and `canonicalProduction: true`.
10. Promotes only the immutable `dpl_...` deployment ID.

There is deliberately no deployment or rebuild command in `scripts/release-production.ps1`.

## 5. Live Verification and Manifest Tag

After Vercel promotion completes, the same script:

1. Resolves `approval-app-three.vercel.app` through the Vercel API.
2. Requires that alias to resolve to the promoted immutable deployment ID and URL.
3. Calls the live alias `/api/version`.
4. Requires the same release name, full revision, Vercel artifact/deployment IDs, Production environment, and `canonicalProduction: true`.
5. Creates the `release.json` name as an annotated tag at the exact release commit.
6. Stores a compact JSON deployment manifest in the annotated tag message.
7. Pushes the tag without force. A concurrent tag collision fails; the newly created local tag is removed if its push fails.

Inspect the resulting tag:

```powershell
git show production-YYYY-MM-DD-description
```

Inspect live identity:

```powershell
vercel curl /api/version `
  --deployment approval-app-three.vercel.app `
  --scope team_LPbk7bp4UBMSijEI2bBgaTJm
```

## Failure and Recovery

Before promotion, every mismatch stops without changing Production.

The script prints the previous Production deployment ID before promotion. If promotion succeeds but a later live check fails, preserve the output and investigate before making another release. An authorized operator can restore that exact prior deployment with:

```powershell
vercel rollback <previous-dpl-id> --scope team_LPbk7bp4UBMSijEI2bBgaTJm
```

Never roll back by guessing a URL or by rebuilding an old commit.

## Authenticated Browser Regression

Run the authenticated browser suite against an immutable candidate URL before promotion when changes affect parsing, routing, Inbox actions, Tracking, or email delivery:

```powershell
$env:APP_URL = "https://<immutable-deployment>.vercel.app"
$env:E2E_EMAIL = "your-test-user@example.com"
$env:E2E_PASSWORD = "your-test-password"
$env:E2E_SEQUENTIAL_REQUEST = "E2E-SEQ-..."
$env:E2E_PARALLEL_REQUEST = "E2E-PAR-..."
$env:E2E_CONDITIONAL_REQUEST = "E2E-COND-..."
npm run e2e:regression
```

The three request variables are optional. To send a real test notification, set `E2E_TEST_EMAIL_TO`; email delivery remains deliberately opt-in because it has an external side effect.
