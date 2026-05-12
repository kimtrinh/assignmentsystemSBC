// Lightweight identity helper. Stores a display name in localStorage so
// it survives reloads; falls back to "" when unset. Used to label audit
// log entries when there's no real auth gate.

const KEY = "ed-display-name:v1";

export function loadDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) window.localStorage.setItem(KEY, trimmed);
  else window.localStorage.removeItem(KEY);
}
