import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

// This is intentionally an authenticated Preview qualification, not a mocked
// component test. Run only after the Step 5 feature and fact-delta migration
// are enabled in Preview. The offline contract suite covers every typed schema;
// this script proves browser focus, keyboard, responsive, live status, and axe.
const previewUrl = required("E2E_PREVIEW_SHARE_URL");
const origin = new URL(previewUrl).origin;
const email = required("E2E_USER_EMAIL");
const password = required("E2E_USER_PASSWORD");
const pendingMapStorageKey = "approval-template-copilot-v2-pending-map-edit";
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const storageState = await authenticatedStorageState(browser);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1100 } });
    const page = await copilotPage(context);
    await page.getByLabel(/Language|語言|语言/).selectOption(locale);
    await start(page);
    const map = page.getByLabel(/Authoritative workflow map|權威流程地圖|权威流程地图/);
    await map.waitFor();
    await scan(page, `${locale} light`);
    await setTheme(page, "dark");
    await scan(page, `${locale} dark`);
    await setTheme(page, "light");
    await assertKeyboardCancelAndFocus(page, map);
    const longValue = await assertLocalizedValidationAndStructuredSave(page, map, locale);
    await assertCommittedAndNotApplicableCorrection(page, map, locale);
    await assertMobileTargets(page, map, longValue);
    await page.close();
    await context.close();
  }
  await assertTwoTabStaleRecovery(browser, storageState);
  await assertLostResponseRemountRecovery(browser, storageState);
  console.log("template_copilot_v2_step5_browser=PASS");
} finally {
  if (browser) await browser.close();
}

async function authenticatedStorageState(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([page.waitForURL((url) => url.origin === origin && url.pathname === "/"), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  const storageState = await context.storageState();
  await context.close();
  return storageState;
}

async function copilotPage(context) {
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Workflow", exact: true }).click();
  await page.getByText("Template Copilot", { exact: true }).waitFor();
  return page;
}

async function start(page) {
  const response = page.waitForResponse((item) => item.request().method() === "POST" && /\/copilot\/sessions$/.test(new URL(item.url()).pathname));
  await page.getByRole("button", { name: /Start guided interview|開始引導訪談|开始引导访谈/ }).click();
  const created = await response;
  assert.equal(created.status(), 201);
  const payload = await created.json();
  const sessionId = String(payload.sessionId || payload.result?.sessionId || "");
  const revision = Number(payload.revision || payload.result?.revision);
  assert.match(sessionId, /^[0-9a-f-]{36}$/i, "start returns the authoritative session id for race qualification");
  assert.ok(Number.isInteger(revision) && revision >= 1, "start returns an authoritative revision");
  return { sessionId, revision };
}

async function assertKeyboardCancelAndFocus(page, map) {
  const edit = map.getByRole("button", { name: /Edit saved fact|編輯已儲存事實|编辑已保存事实/ }).first();
  await edit.focus();
  await page.keyboard.press("Enter");
  const editor = map.locator('[id^="copilot-map-editor-"]');
  await editor.waitFor();
  await page.waitForFunction(() => {
    const editor = document.querySelector('[id^="copilot-map-editor-"]');
    return Boolean(editor?.contains(document.activeElement));
  });
  const controls = editor.locator("input, textarea, select, button");
  assert.ok(await controls.count() > 0, "editor has keyboard-reachable controls");
  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY", "Tab never loses focus to the document");
  await editor.getByRole("button", { name: /Cancel|取消/ }).click();
  await page.waitForFunction(() => document.activeElement?.id.startsWith("copilot-map-edit-"));
  assert.equal(await page.locator('[aria-live="polite"]').count() > 0, true, "authoritative map exposes a live status region");
}

async function assertLocalizedValidationAndStructuredSave(page, map, locale) {
  await map.locator('[id="copilot-map-edit-request.fields"]').click();
  const editor = map.locator('[id="copilot-map-editor-request.fields"]');
  await editor.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  const error = editor.getByRole("alert");
  await error.waitFor();
  assert.match(await error.innerText(), locale === "en" ? /Correct these fields/ : /請修正以下欄位|请修正以下字段/, "validation is localized and announced");
  await editor.getByRole("button", { name: /Add|新增/ }).focus();
  await page.keyboard.press("Enter");
  const longValue = `Long ${locale} ${"流程說明".repeat(24)}`;
  await editor.getByLabel(/Label|名稱|名称/).first().fill(longValue);
  const save = page.waitForResponse((item) => item.request().method() === "POST" && /\/facts$/.test(new URL(item.url()).pathname));
  await editor.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  assert.equal((await save).status(), 200, "structured editor writes one authoritative fact mutation");
  const live = map.locator('[aria-live="polite"]');
  await page.waitForFunction((node) => Boolean(node?.textContent?.trim()), await live.elementHandle());
  assert.match(await live.innerText(), locale === "en" ? /Authoritative change saved/ : /權威變更已儲存|权威更改已保存/, "localized success is live-announced");
  await map.getByText(longValue, { exact: true }).waitFor();
  return longValue;
}

async function assertCommittedAndNotApplicableCorrection(page, map, locale) {
  const firstName = `Initial committed ${locale} workflow`;
  const correctedName = `Corrected ${locale} workflow`;
  await map.locator('[id="copilot-map-edit-workflow.name"]').click();
  let nameEditor = map.locator('[id="copilot-map-editor-workflow.name"]');
  await nameEditor.locator("input, textarea").first().fill(firstName);
  const commit = page.waitForResponse((item) => item.request().method() === "POST" && /\/facts$/.test(new URL(item.url()).pathname));
  await nameEditor.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  assert.equal((await commit).status(), 200, "unresolved fact is genuinely committed first");
  await map.getByText(firstName, { exact: true }).waitFor();
  await map.locator('[id="copilot-map-edit-workflow.name"]').click();
  nameEditor = map.locator('[id="copilot-map-editor-workflow.name"]');
  await nameEditor.locator("input, textarea").first().fill(correctedName);
  const replace = page.waitForResponse((item) => item.request().method() === "POST" && /\/facts$/.test(new URL(item.url()).pathname));
  await nameEditor.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  assert.equal((await replace).status(), 200, "committed fact uses an authoritative correction mutation");
  await map.getByText(correctedName, { exact: true }).waitFor();
  await map.getByText(firstName, { exact: true }).waitFor();
  const editAttachments = map.locator('[id="copilot-map-edit-attachments.requirements"]');
  await editAttachments.click();
  const attachments = map.locator('[id="copilot-map-editor-attachments.requirements"]');
  await attachments.getByLabel(/Why this does not apply|不適用原因|不适用原因/).fill("No documents in this scenario");
  const markNa = page.waitForResponse((item) => item.request().method() === "POST" && /\/facts$/.test(new URL(item.url()).pathname));
  await attachments.getByRole("button", { name: /Mark not applicable|標示為不適用|标为不适用/ }).click();
  assert.equal((await markNa).status(), 200, "N/A transition is server-confirmed");
  await editAttachments.click();
  const correction = map.locator('[id="copilot-map-editor-attachments.requirements"]');
  await correction.getByRole("button", { name: /Add|新增/ }).click();
  await correction.getByLabel(/Label|名稱|名称/).first().fill("Corrected invoice");
  const restore = page.waitForResponse((item) => item.request().method() === "POST" && /\/facts$/.test(new URL(item.url()).pathname));
  await correction.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  assert.equal((await restore).status(), 200, "N/A fact is corrected through the same revisioned mutation path");
  await map.getByText("Corrected invoice", { exact: true }).waitFor();
  await map.getByText(/No documents in this scenario/).waitFor();
}

async function assertTwoTabStaleRecovery(browser, storageState) {
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1100 } });
  const page = await copilotPage(context);
  const session = await start(page);
  const map = page.getByLabel("Authoritative workflow map");
  await map.waitFor();
  const secondTab = await context.newPage();
  await secondTab.goto(origin, { waitUntil: "networkidle" });
  const body = { expectedRevision: session.revision, idempotencyKey: `step5-stale-${Date.now()}`, factId: "workflow.purpose", transition: { operation: "human_commit", payload: { canonicalValue: "Second-tab purpose", provenance: [{ kind: "human_editor", sourceId: "step5-second-tab", sourceMessageIds: [] }] } } };
  const second = await secondTab.evaluate(async ({ endpoint, payload }) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }, { endpoint: `${origin}/api/template-authoring/copilot/sessions/${session.sessionId}/facts`, payload: body });
  assert.equal(second.status, 200, "second tab commits the competing revision");
  await map.locator('[id="copilot-map-edit-workflow.name"]').click();
  const editor = map.locator('[id="copilot-map-editor-workflow.name"]');
  await editor.locator("input, textarea").first().fill("Stale first-tab value");
  const reload = page.waitForResponse((item) => item.request().method() === "GET" && new URL(item.url()).pathname.endsWith(`/copilot/sessions/${session.sessionId}`));
  await editor.getByRole("button", { name: /Save authoritative change/ }).click();
  assert.equal((await reload).status(), 200, "stale first tab reloads the authoritative session");
  await editor.getByRole("alert").waitFor();
  assert.match(await editor.getByRole("alert").innerText(), /Another edit was saved first/, "stale first tab never overwrites the second tab");
  await secondTab.close();
  await page.close();
  await context.close();
}

async function assertLostResponseRemountRecovery(browser, storageState) {
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1100 } });
  const page = await copilotPage(context);
  const session = await start(page);
  const map = page.getByLabel("Authoritative workflow map");
  await map.waitFor();
  let committedRequestBody;
  let committedStatus;
  const factsPattern = `**/api/template-authoring/copilot/sessions/${session.sessionId}/facts`;
  await page.route(factsPattern, async (route) => {
    committedRequestBody = route.request().postDataJSON();
    const upstream = await route.fetch();
    committedStatus = upstream.status();
    await route.abort("failed");
  }, { times: 1 });
  await map.locator('[id="copilot-map-edit-workflow.name"]').click();
  const editor = map.locator('[id="copilot-map-editor-workflow.name"]');
  await editor.locator("input, textarea").first().fill("Lost response exact replay");
  await editor.getByRole("button", { name: "Save authoritative change" }).click();
  await editor.getByRole("alert").waitFor();
  assert.equal(committedStatus, 200, "the server committed before the response was intentionally lost");
  const storedBefore = await page.evaluate((key) => sessionStorage.getItem(key), pendingMapStorageKey);
  assert.ok(storedBefore, "ambiguous response preserves the exact pending command");
  const pendingBefore = JSON.parse(storedBefore);
  assert.equal(pendingBefore.idempotencyKey, committedRequestBody.idempotencyKey);
  assert.equal(pendingBefore.expectedRevision, committedRequestBody.expectedRevision);
  await page.unroute(factsPattern);
  await page.reload({ waitUntil: "networkidle" });
  const storedAfter = await page.evaluate((key) => sessionStorage.getItem(key), pendingMapStorageKey);
  assert.equal(storedAfter, storedBefore, "remount preserves byte-identical pending command storage");
  const exactBody = pendingCommandBody(JSON.parse(storedAfter));
  let replayedBody;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith(`/copilot/sessions/${session.sessionId}/facts`)) replayedBody = request.postDataJSON();
  });
  const replay = await page.evaluate(async ({ endpoint, body }) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  }, { endpoint: `${origin}/api/template-authoring/copilot/sessions/${session.sessionId}/facts`, body: exactBody });
  assert.equal(replay.status, 200, "exact remount replay resolves through the durable idempotency receipt");
  assert.deepEqual(replayedBody, committedRequestBody, "remount network replay keeps the exact body and key");
  assert.equal(replayedBody.idempotencyKey, pendingBefore.idempotencyKey);
  await page.close();
  await context.close();
}

function pendingCommandBody(command) {
  const transition = command.operation === "mark_unknown"
    ? { operation: command.operation }
    : command.operation === "mark_not_applicable"
      ? { operation: command.operation, reason: command.reason }
      : { operation: command.operation, payload: { canonicalValue: command.canonicalValue, provenance: [{ kind: "human_editor", sourceId: `map:${command.idempotencyKey}`, sourceMessageIds: [] }] } };
  return { expectedRevision: command.expectedRevision, idempotencyKey: command.idempotencyKey, factId: command.factId, transition };
}

async function assertMobileTargets(page, map, longValue) {
  await page.setViewportSize({ width: 390, height: 844 });
  const savedValue = map.getByText(longValue, { exact: true });
  await savedValue.waitFor();
  for (let index = 0; index < await map.getByRole("button").count(); index += 1) {
    const box = await map.getByRole("button").nth(index).boundingBox();
    if (box) assert.ok(box.height >= 40, `map touch target ${index} is smaller than 40px`);
  }
  const box = await map.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, "map does not overflow the mobile viewport");
  const valueBox = await savedValue.boundingBox();
  assert.ok(valueBox && valueBox.x >= 0 && valueBox.x + valueBox.width <= 390, "saved long CJK value wraps within the mobile viewport");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "saved long CJK map content creates no horizontal page overflow");
  await scan(page, "saved long CJK mobile map");
  await page.setViewportSize({ width: 1440, height: 1100 });
}

async function setTheme(page, theme) { await page.locator("html").evaluate((element, next) => { element.dataset.theme = next; }, theme); }
async function scan(page, label) { const result = await new AxeBuilder({ page }).analyze(); assert.equal(result.violations.length, 0, `${label}: ${result.violations.map((item) => item.id).join(", ")}`); }
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required for the Step 5 Preview qualification.`); return value; }
