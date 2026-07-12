# Deployment Runbook

Use one stable preview URL for testing:

https://approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app

## Canonical Branch

- GitHub remote: `https://github.com/yatbond/Approval-App.git`
- Working branch: `codex/approval-tracking`
- Vercel project: `approval-app`
- Vercel team: `team_LPbk7bp4UBMSijEI2bBgaTJm`

## Deploy Preview

From a clean checkout on `codex/approval-tracking`:

```powershell
npm run deploy:preview
```

The script does four things in order:

1. Refuses to deploy if the working tree has uncommitted changes.
2. Runs the test suite unless `-SkipTests` is passed directly to the script.
3. Pushes `HEAD` to `origin/codex/approval-tracking`.
4. Waits for the Vercel GitHub integration to produce a Ready preview deployment for the pushed commit.
5. Points the stable preview alias at that Ready deployment and verifies the alias.

This avoids the failure mode where a new deployment exists but the branch URL still points at an older Vercel deployment.

## Manual Verification

Check the alias target:

```powershell
vercel inspect approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app --scope team_LPbk7bp4UBMSijEI2bBgaTJm
```

The `url` shown by `vercel inspect` should be the newest deployment URL created by the deploy script.

## Promote to Production

Promote the verified preview deployment so Vercel rebuilds the same source with
Production environment variables:

```powershell
vercel promote https://approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app --yes
vercel promote status approval-app
vercel inspect approval-app-derrick-pangs-projects.vercel.app
```

Confirm required Production variables exist before promotion. Never assume
Preview-only variables will be available to the Production rebuild.

## Browser Regression

Run the authenticated browser regression suite after changes to parsing, routing,
Queue actions, Tracking, or email delivery:

```powershell
$env:APP_URL = "https://approval-app-derrick-pangs-projects.vercel.app"
$env:E2E_EMAIL = "your-test-user@example.com"
$env:E2E_PASSWORD = "your-test-password"
$env:E2E_SEQUENTIAL_REQUEST = "E2E-SEQ-..."
$env:E2E_PARALLEL_REQUEST = "E2E-PAR-..."
$env:E2E_CONDITIONAL_REQUEST = "E2E-COND-..."
npm run e2e:regression
```

The three request variables are optional. When supplied, the runner verifies
parsed values and the sequential, parallel, and conditional workflow history.
It always checks authentication, primary navigation, Workflow Library, and
Queue reject controls.

To send a real test notification through the configured provider, set
`E2E_TEST_EMAIL_TO`. Email verification is deliberately opt-in because every
run creates an external email attempt. Secrets must stay in environment
variables and must never be committed.
