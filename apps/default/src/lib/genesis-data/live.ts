/**
 * Live rows without a socket: the attention loop behind `useLiveNodes`.
 *
 * - re-checks when the tab regains visibility after being hidden for at least
 *   `minGapOnReturnMs` (a natural session boundary), and
 * - on a slow backstop interval that only fires while the tab is visible.
 * Every check is a conditional GET; an unchanged project costs the gateway a
 * revision lookup and the app nothing: no new snapshot, no re-render. A hidden
 * tab costs nothing.
 *
 * Framework-free so it can be tested without React; `useLiveNodes` is the
 * thin hook around it.
 */
import { getNodesIfChanged, type GenesisNode, type NodesIfChanged } from './client';

export interface LiveNodesState {
  nodes: GenesisNode[];
  /** True only until the first load settles. */
  loading: boolean;
  /** The last check's error; rows from the previous successful check are kept. */
  error: Error | null;
  /** When the rows last changed (epoch ms), null until the first load. */
  updatedAt: number | null;
}

export interface LiveNodesOptions {
  /** Backstop re-check while the tab stays visible. Default 5 minutes. */
  refreshEveryMs?: number;
  /** Minimum time hidden before a return to the tab re-checks. Default 30 seconds. */
  minGapOnReturnMs?: number;
  /** Test seams. */
  fetchIfChanged?: (projectId: string, etag: string | null) => Promise<NodesIfChanged>;
  now?: () => number;
  isVisible?: () => boolean;
  onVisibilityChange?: (listener: () => void) => () => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface LiveNodes {
  getSnapshot(): LiveNodesState;
  subscribe(listener: () => void): () => void;
  /** Begin checking (initial load now). Idempotent. */
  start(): void;
  /** Stop timers and listeners. */
  stop(): void;
  /**
   * Re-check now. If a check is already in flight, one trailing check is
   * queued after it, so a refresh called right after a write always observes
   * that write (the in-flight request may predate it).
   */
  refresh(): Promise<void>;
}

export const DEFAULT_REFRESH_EVERY_MS = 5 * 60 * 1000;
export const DEFAULT_MIN_GAP_ON_RETURN_MS = 30 * 1000;

function browserVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function onBrowserVisibilityChange(listener: () => void): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

export function createLiveNodes(projectId: string, options: LiveNodesOptions = {}): LiveNodes {
  const refreshEveryMs = options.refreshEveryMs ?? DEFAULT_REFRESH_EVERY_MS;
  const minGapOnReturnMs = options.minGapOnReturnMs ?? DEFAULT_MIN_GAP_ON_RETURN_MS;
  const fetchIfChanged = options.fetchIfChanged ?? getNodesIfChanged;
  const now = options.now ?? Date.now;
  const isVisible = options.isVisible ?? browserVisible;
  const onVisibilityChange = options.onVisibilityChange ?? onBrowserVisibilityChange;
  const schedule = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const unschedule = options.clearInterval ?? ((handle) => clearInterval(handle as number));

  let state: LiveNodesState = { nodes: [], loading: true, error: null, updatedAt: null };
  const listeners = new Set<() => void>();
  let etag: string | null = null;
  let inFlight: Promise<void> | null = null;
  let trailing: Promise<void> | null = null;
  let hiddenAt: number | null = null;
  let timer: unknown = null;
  let unlisten: (() => void) | null = null;
  let started = false;

  // Publish only when something a screen can show changed. A 304 moves no
  // state, so it must not re-render the component.
  function set(patch: Partial<LiveNodesState>) {
    const next = { ...state, ...patch };
    if (
      next.nodes === state.nodes &&
      next.loading === state.loading &&
      next.error === state.error &&
      next.updatedAt === state.updatedAt
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) {
      listener();
    }
  }

  async function runCheck(): Promise<void> {
    try {
      const result = await fetchIfChanged(projectId, etag);
      etag = result.etag;
      if (result.changed) {
        set({ nodes: result.nodes, loading: false, error: null, updatedAt: now() });
      } else {
        set({ loading: false, error: null });
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }

  /** Automatic checks coalesce onto an in-flight one; manual ones queue one trailing check. */
  function check(manual: boolean): Promise<void> {
    if (inFlight != null) {
      if (!manual) {
        return inFlight;
      }
      if (trailing == null) {
        trailing = inFlight.then(() => {
          trailing = null;
          return check(false);
        });
      }
      return trailing;
    }
    inFlight = runCheck().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started) {
        return;
      }
      started = true;
      // A tab that mounts in the background is already away. Without this seed
      // `hiddenAt` stays null, so its first return measures zero away time and
      // skips the re-check, leaving the initial rows stale until the backstop.
      hiddenAt = isVisible() ? null : now();
      void check(false);
      unlisten = onVisibilityChange(() => {
        if (!isVisible()) {
          hiddenAt = now();
          return;
        }
        // "Away" is measured from when the tab went hidden, so a one-second
        // tab switch does not re-check even if the last check is old.
        const away = hiddenAt == null ? 0 : now() - hiddenAt;
        hiddenAt = null;
        if (away >= minGapOnReturnMs) {
          void check(false);
        }
      });
      timer = schedule(() => {
        if (isVisible()) {
          void check(false);
        }
      }, refreshEveryMs);
    },
    stop() {
      started = false;
      if (timer != null) {
        unschedule(timer);
        timer = null;
      }
      if (unlisten != null) {
        unlisten();
        unlisten = null;
      }
    },
    refresh: () => check(true),
  };
}
