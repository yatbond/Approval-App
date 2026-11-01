// Checks that the sectioned Describe keeps what the author typed when they look at another tab and come back.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { connectSimulatedUser } from "./api.mjs";

const appUrl = process.argv[2] ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const user = await connectSimulatedUser({
  appUrl, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, label: "persist",
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
page.setDefaultTimeout(120_000);
try {
  await page.goto(`${appUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(`${appUrl}/?tab=workflow`, { waitUntil: "load" });
  await page.getByRole("button", { name: /^copilot$/i }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll("select option")].some((option) => option.textContent === "Simulation Unit"));
  await page.waitForTimeout(1500);
  const box = page.getByLabel(/What is this workflow for/);
  await box.fill("Create a Persistence Check workflow to test tabs.");
  await page.getByRole("button", { name: /^builder$/i }).first().click();
  await page.waitForTimeout(800);
  const hiddenWhileAway = await box.isVisible();
  await page.getByRole("button", { name: /^copilot$/i }).first().click();
  await page.waitForTimeout(800);
  const value = await box.inputValue();
  console.log(JSON.stringify({ hiddenWhileAway: !hiddenWhileAway, textKept: value === "Create a Persistence Check workflow to test tabs." }));
} finally {
  await browser.close();
}
