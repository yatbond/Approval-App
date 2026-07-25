import { chromium } from "@playwright/test";
import { performance } from "node:perf_hooks";

const defaultPublicRoutes = [
  "/",
  "/login",
  "/login?mode=setup",
  "/perf-probe",
  "/raw-probe",
  "/logout",
];
const defaultAuthenticatedRoutes = [
  "/?tab=queue",
  "/?tab=tracking",
  "/?tab=drafts",
  "/?tab=upload",
  "/?tab=workflow",
  "/?tab=forms",
  "/?tab=admin",
];

const baseUrl = process.env.PERF_BASE_URL || "http://127.0.0.1:3000";
const repeats = Number.parseInt(process.env.PERF_REPEATS || "30", 10);
const warmups = Number.parseInt(process.env.PERF_WARMUPS || "2", 10);
const cooldownMs = Number.parseInt(process.env.PERF_COOLDOWN_MS || "100", 10);
const budgetMs = Number.parseFloat(process.env.PERF_BUDGET_MS || "50");
const budgetPercentile = Number.parseInt(
  process.env.PERF_BUDGET_PERCENTILE || "50",
  10,
);
const publicRoutes = (process.env.PERF_ROUTES || defaultPublicRoutes.join(","))
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const authenticatedRoutes = (
  process.env.PERF_AUTH_ROUTES || defaultAuthenticatedRoutes.join(",")
)
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const authEmail = process.env.PERF_EMAIL || process.env.E2E_EMAIL || "";
const authPassword = process.env.PERF_PASSWORD || process.env.E2E_PASSWORD || "";
const authBypass = process.env.PERF_AUTH_BYPASS === "true";
const authBypassToken = process.env.PERF_AUTH_TOKEN || "";
const blockWorkspaceSync = process.env.PERF_BLOCK_WORKSPACE_SYNC === "true";

if (authBypass && authBypassToken.length < 32) {
  throw new Error(
    "PERF_AUTH_TOKEN must contain at least 32 characters when PERF_AUTH_BYPASS=true.",
  );
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function summarize(values) {
  return {
    min: Math.min(...values),
    median: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
  };
}

function formatMs(value) {
  return `${value.toFixed(1)} ms`;
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function createAuthenticatedStorageState(browser) {
  if (authBypass) {
    return { cookies: [], origins: [] };
  }

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: false,
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  try {
    await page.goto(new URL("/login", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[name="email"]').fill(authEmail);
    await page.locator('input[name="password"]').fill(authPassword);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 20_000,
      }),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    await page.waitForLoadState("load");
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function measureRoute(browser, route, storageState) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: false,
    serviceWorkers: "block",
    ...(storageState ? { storageState } : {}),
    ...(storageState && authBypass
      ? {
          extraHTTPHeaders: {
            "x-approval-local-performance-auth": authBypassToken,
          },
        }
      : {}),
  });
  const url = new URL(route, baseUrl).toString();
  const createPage = async () => {
    const page = await context.newPage();
    if (blockWorkspaceSync) {
      await page.route("**/api/workspace", (route) => route.abort());
    }
    return page;
  };
  const waitForWorkspaceView = async (page) => {
    if (!storageState) {
      return;
    }
    const routeTab = new URL(page.url()).searchParams.get("tab");
    if (!routeTab) {
      return;
    }
    const view = page.locator(`[data-workspace-view="${routeTab}"]`);
    await view.waitFor({ state: "attached", timeout: 10_000 });
    await view.locator("[data-workspace-view-loading]").waitFor({
      state: "detached",
      timeout: 10_000,
    });
  };

  const warmupPage = await createPage();
  try {
    for (let index = 0; index < warmups; index++) {
      await warmupPage.goto(url, { waitUntil: "load" });
      await waitForWorkspaceView(warmupPage);
    }
  } finally {
    await warmupPage.close();
  }

  const loadDurations = [];
  const domContentLoadedDurations = [];
  const responseStartDurations = [];
  const responseEndDurations = [];
  const responseDurations = [];
  const readyDurations = [];
  let finalUrl = url;

  for (let index = 0; index < repeats; index++) {
    const page = await createPage();
    try {
      const startedAt = performance.now();
      const response = await page.goto(url, { waitUntil: "load" });
      const navigationFinishedAt = performance.now();
      const timings = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        return navigation
          ? {
              responseStart: navigation.responseStart - navigation.startTime,
              responseEnd: navigation.responseEnd - navigation.startTime,
              domContentLoaded:
                navigation.domContentLoadedEventEnd - navigation.startTime,
              load: navigation.loadEventEnd - navigation.startTime,
            }
          : null;
      });

      loadDurations.push(timings?.load ?? navigationFinishedAt - startedAt);
      responseStartDurations.push(
        timings?.responseStart ?? navigationFinishedAt - startedAt,
      );
      responseEndDurations.push(
        timings?.responseEnd ?? navigationFinishedAt - startedAt,
      );
      domContentLoadedDurations.push(
        timings?.domContentLoaded ?? navigationFinishedAt - startedAt,
      );
      responseDurations.push(navigationFinishedAt - startedAt);
      await waitForWorkspaceView(page);
      readyDurations.push(performance.now() - startedAt);
      finalUrl = page.url();

      if (!response?.ok() && response?.status() !== 304) {
        throw new Error(`${route} returned HTTP ${response?.status()}`);
      }
    } finally {
      await page.close();
      await sleep(cooldownMs);
    }
  }

  await context.close();

  if (storageState && new URL(finalUrl).pathname.startsWith("/login")) {
    throw new Error(`${route} redirected to login instead of loading authenticated content`);
  }

  return {
    route,
    finalUrl,
    load: summarize(loadDurations),
    responseStart: summarize(responseStartDurations),
    responseEnd: summarize(responseEndDurations),
    domContentLoaded: summarize(domContentLoadedDurations),
    navigation: summarize(responseDurations),
    ready: summarize(readyDurations),
  };
}

const browser = await chromium.launch();
const results = [];

try {
  for (const route of publicRoutes) {
    results.push(await measureRoute(browser, route));
  }

  if (authBypass || (authEmail && authPassword)) {
    const storageState = await createAuthenticatedStorageState(browser);
    for (const route of authenticatedRoutes) {
      results.push(await measureRoute(browser, route, storageState));
    }
  } else {
    console.log(
      "Authenticated workspace routes skipped. Set PERF_AUTH_BYPASS=true for a development server or provide PERF_EMAIL and PERF_PASSWORD.",
    );
    console.log("");
  }
} finally {
  await browser.close();
}

const failed = [];

console.log(
  `Measured ${results.length} route(s), ${warmups} warmup(s), ${repeats} repeat(s), ${cooldownMs} ms cooldown, budget ${budgetMs} ms p${budgetPercentile} load.`,
);
console.log("");

const routeWidth = Math.max(18, ...results.map((result) => result.route.length));

for (const result of results) {
  const budgetValue =
    budgetPercentile === 95 ? result.load.p95 : result.load.median;
  const status = budgetValue <= budgetMs ? "PASS" : "FAIL";
  if (status === "FAIL") {
    failed.push(result);
  }

  console.log(
    [
      status.padEnd(4),
      result.route.padEnd(routeWidth),
      `load p50=${formatMs(result.load.median)}`,
      `p95=${formatMs(result.load.p95)}`,
      `max=${formatMs(result.load.max)}`,
      `ttfb p95=${formatMs(result.responseStart.p95)}`,
      `response p95=${formatMs(result.responseEnd.p95)}`,
      `dom p95=${formatMs(result.domContentLoaded.p95)}`,
      `nav p95=${formatMs(result.navigation.p95)}`,
      `ready p95=${formatMs(result.ready.p95)}`,
    ].join("  "),
  );
}

if (failed.length) {
  console.log("");
  console.log("Routes over budget:");
  for (const result of failed) {
    const budgetValue =
      budgetPercentile === 95 ? result.load.p95 : result.load.median;
    console.log(
      `- ${result.route}: p${budgetPercentile} load ${formatMs(budgetValue)}`,
    );
  }
  process.exitCode = 1;
}
