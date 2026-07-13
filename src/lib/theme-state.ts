export type AppTheme = "light" | "dark";

export const appThemeStorageKey = "approval-app-theme";

export function resolveInitialTheme({
  storedTheme,
  prefersDark,
}: {
  storedTheme?: string | null;
  prefersDark: boolean;
}): AppTheme {
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return prefersDark ? "dark" : "light";
}

export function getNextTheme(theme: AppTheme): AppTheme {
  return theme === "dark" ? "light" : "dark";
}
