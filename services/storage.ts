export function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const parsed = safeParseJson<T>(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/private mode errors
  }
}





