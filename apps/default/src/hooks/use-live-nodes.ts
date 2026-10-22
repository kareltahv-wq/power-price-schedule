import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { createLiveNodes, type LiveNodesState } from '@/lib/genesis-data/live';

export interface UseLiveNodesOptions {
  /** Backstop re-check while the tab stays visible. Default 5 minutes. */
  refreshEveryMs?: number;
  /** Minimum time away before a return to the tab re-checks. Default 30 seconds. */
  minGapOnReturnMs?: number;
}

export interface UseLiveNodesResult extends LiveNodesState {
  /** Re-check now (e.g. right after the app wrote a row). */
  refresh: () => Promise<void>;
}

const IDLE: LiveNodesState = { nodes: [], loading: false, error: null, updatedAt: null };
const noopRefresh = async () => {};

/**
 * A project's rows that stay true while the screen is open: loads once, then
 * re-checks when the person comes back to the tab and on a slow backstop while
 * it is visible. Each re-check is a conditional GET, so an unchanged project
 * sends no rows and causes no re-render. Use it for dashboards, boards, and
 * lists people keep open; keep `getNodes` for one-shot reads.
 *
 * @example
 * ```tsx
 * const { nodes, loading, updatedAt, refresh } = useLiveNodes(projectId);
 *
 * async function handleAdd() {
 *   // writes live in event handlers, never in render
 *   await createNode(projectId, { Name: 'Maria' });
 *   await refresh(); // show the new row now instead of on the next check
 * }
 * ```
 */
export function useLiveNodes(
  projectId: string | null | undefined,
  options: UseLiveNodesOptions = {},
): UseLiveNodesResult {
  const { refreshEveryMs, minGapOnReturnMs } = options;
  const live = useMemo(
    () =>
      projectId == null || projectId === ''
        ? null
        : createLiveNodes(projectId, { refreshEveryMs, minGapOnReturnMs }),
    [projectId, refreshEveryMs, minGapOnReturnMs],
  );

  useEffect(() => {
    if (live == null) {
      return;
    }
    live.start();
    return () => live.stop();
  }, [live]);

  const getSnapshot = live == null ? () => IDLE : live.getSnapshot;
  const subscribe = live == null ? () => () => {} : live.subscribe;
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { ...state, refresh: live == null ? noopRefresh : live.refresh };
}
