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
