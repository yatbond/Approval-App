import { chromium } from "@playwright/test";
import { performance } from "node:perf_hooks";

const defaultRoutes = [
  "/",
  "/login",
  "/login?mode=setup",
  "/perf-probe",
  "/raw-probe",
  "/logout",
];

const baseUrl = process.env.PERF_BASE_URL || "http://127.0.0.1:3000";
const repeats = Number.parseInt(process.env.PERF_REPEATS || "9", 10);
const warmups = Number.parseInt(process.env.PERF_WARMUPS || "2", 10);
const budgetMs = Number.parseFloat(process.env.PERF_BUDGET_MS || "50");
const routes = (process.env.PERF_ROUTES || defaultRoutes.join(","))
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

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

async function measureRoute(browser, route) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: false,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const url = new URL(route, baseUrl).toString();

  for (let index = 0; index < warmups; index++) {
    await page.goto(url, { waitUntil: "load" });
  }

  const loadDurations = [];
  const domContentLoadedDurations = [];
  const responseDurations = [];

  for (let index = 0; index < repeats; index++) {
    const startedAt = performance.now();
    const response = await page.goto(url, { waitUntil: "load" });
    const navigationFinishedAt = performance.now();
    const timings = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return navigation
        ? {
            domContentLoaded:
              navigation.domContentLoadedEventEnd - navigation.startTime,
            load: navigation.loadEventEnd - navigation.startTime,
          }
        : null;
    });

    loadDurations.push(timings?.load ?? navigationFinishedAt - startedAt);
    domContentLoadedDurations.push(
      timings?.domContentLoaded ?? navigationFinishedAt - startedAt,
    );
    responseDurations.push(navigationFinishedAt - startedAt);

    if (!response?.ok() && response?.status() !== 304) {
      throw new Error(`${route} returned HTTP ${response?.status()}`);
    }
  }

  const finalUrl = page.url();
  await context.close();

  return {
    route,
    finalUrl,
    load: summarize(loadDurations),
    domContentLoaded: summarize(domContentLoadedDurations),
    navigation: summarize(responseDurations),
  };
}

const browser = await chromium.launch();
const results = [];

try {
  for (const route of routes) {
    results.push(await measureRoute(browser, route));
  }
} finally {
  await browser.close();
}

const failed = [];

console.log(
  `Measured ${routes.length} route(s), ${warmups} warmup(s), ${repeats} repeat(s), budget ${budgetMs} ms p95 load.`,
);
console.log("");

for (const result of results) {
  const status = result.load.p95 <= budgetMs ? "PASS" : "FAIL";
  if (status === "FAIL") {
    failed.push(result);
  }

  console.log(
    [
      status.padEnd(4),
      result.route.padEnd(18),
      `load p50=${formatMs(result.load.median)}`,
      `p95=${formatMs(result.load.p95)}`,
      `max=${formatMs(result.load.max)}`,
      `dom p95=${formatMs(result.domContentLoaded.p95)}`,
      `nav p95=${formatMs(result.navigation.p95)}`,
    ].join("  "),
  );
}

if (failed.length) {
  console.log("");
  console.log("Routes over budget:");
  for (const result of failed) {
    console.log(`- ${result.route}: p95 load ${formatMs(result.load.p95)}`);
  }
  process.exitCode = 1;
}
