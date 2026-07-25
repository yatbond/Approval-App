"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  appThemeStorageKey,
  getNextTheme,
  type AppTheme,
} from "@/lib/theme-state";

const appThemeChangeEvent = "approval-app-theme-change";

function readDocumentTheme(): AppTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyDocumentTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(appThemeStorageKey, theme);
  window.dispatchEvent(new CustomEvent<AppTheme>(appThemeChangeEvent, { detail: theme }));
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(appThemeChangeEvent, onStoreChange);
  return () => window.removeEventListener(appThemeChangeEvent, onStoreChange);
}

export function useAppTheme() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readDocumentTheme,
    (): AppTheme => "light",
  );

  const toggleTheme = useCallback(() => {
    applyDocumentTheme(getNextTheme(readDocumentTheme()));
  }, []);

  return { theme, toggleTheme };
}
