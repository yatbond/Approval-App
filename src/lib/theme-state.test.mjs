import assert from "node:assert/strict";
import test from "node:test";
import { getNextTheme, resolveInitialTheme } from "./theme-state.ts";

test("uses a saved app theme before the system preference", () => {
  assert.equal(resolveInitialTheme({ storedTheme: "light", prefersDark: true }), "light");
  assert.equal(resolveInitialTheme({ storedTheme: "dark", prefersDark: false }), "dark");
});

test("uses the system preference when no app theme was saved", () => {
  assert.equal(resolveInitialTheme({ storedTheme: null, prefersDark: true }), "dark");
  assert.equal(resolveInitialTheme({ storedTheme: "invalid", prefersDark: false }), "light");
});

test("toggles between light and dark themes", () => {
  assert.equal(getNextTheme("light"), "dark");
  assert.equal(getNextTheme("dark"), "light");
});
