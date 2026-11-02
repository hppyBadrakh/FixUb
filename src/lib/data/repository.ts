import type { DemoState } from "../types";
import { buildSeedState } from "./seed";

/**
 * Where demo state lives. The UI only talks to this interface (through the store),
 * so it can later be replaced by an HTTP client for the real `/api/v1` endpoints.
 */
export interface FixubRepository {
  load(): DemoState;
  save(state: DemoState): void;
  reset(): DemoState;
  /** Fires when another tab changes the data. */
  subscribe(onExternalChange: (state: DemoState) => void): () => void;
}

const KEY = "fixub-demo-state-v1";

function readJson(): DemoState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    // Older saved data (schema 1, before subcategories and priority) is replaced by a fresh seed.
    return parsed.schema === 2 && Array.isArray(parsed.reports) && Array.isArray(parsed.categories) ? parsed : null;
  } catch {
    return null;
  }
}

export function createLocalRepository(): FixubRepository {
  let memory: DemoState | null = null;
  return {
    load() {
      const stored = readJson();
      if (stored) return (memory = stored);
      const seeded = buildSeedState(Date.now());
      this.save(seeded);
      return seeded;
    },
    save(state) {
      memory = state;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        // Storage full or blocked (private mode): keep working from memory for this tab.
      }
    },
    reset() {
      const seeded = buildSeedState(Date.now());
      this.save(seeded);
      return seeded;
    },
    subscribe(onExternalChange) {
      const handler = (e: StorageEvent) => {
        if (e.key !== KEY) return;
        const next = readJson();
        if (next && next !== memory) {
          memory = next;
          onExternalChange(next);
        }
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}
