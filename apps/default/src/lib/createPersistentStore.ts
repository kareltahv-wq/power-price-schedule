import { create, type StateCreator } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';

/**
 * Thin wrapper around zustand's `create` that persists the store to
 * `localStorage` by default, so user-entered state survives a hard refresh.
 *
 * Usage mirrors `create`, except it takes a required unique `name` as the first
 * argument for the storage key (namespace it per-app to avoid collisions on a
 * shared origin):
 *
 * ```ts
 * interface CounterState {
 *   count: number;
 *   increment: () => void;
 * }
 *
 * export const useCounter = createPersistentStore<CounterState>('my-app:counter', (set) => ({
 *   count: 0,
 *   increment: () => set((state) => ({ count: state.count + 1 })),
 * }));
 * ```
 *
 * Pass `options` to customize persistence (e.g. `partialize`, `version`,
 * `migrate`); `name` and the localStorage backend are provided for you.
 */
export function createPersistentStore<T>(
  name: string,
  initializer: StateCreator<T, [['zustand/persist', unknown]], []>,
  options?: Omit<PersistOptions<T>, 'name' | 'storage'>,
) {
  return create<T>()(
    persist(initializer, {
      // Spread caller options FIRST so the helper's guarantees below cannot be
      // overridden — even by untyped/`as any` callers (the `Omit` type only
      // stops typed ones). `name` keeps per-app namespacing.
      ...options,
      name,
      storage: getDefaultStorage<T>(),
    }),
  );
}

/**
 * `localStorage`-backed storage, or `undefined` when storage is unavailable:
 * non-browser contexts (SSR, build-time eval, Node tests) or restricted
 * browser contexts (sandboxed iframes / storage disabled, where touching
 * `window.localStorage` throws a `SecurityError`).
 *
 * The unavailable case MUST resolve to an `undefined` `storage` option, not an
 * `undefined` return from the `createJSONStorage` getter: `createJSONStorage`
 * only bails out when the getter THROWS — if it merely returns `undefined`, it
 * still hands persist a storage wrapper around a missing backend, and every
 * subsequent `set()` would throw. With `storage: undefined`, persist itself
 * degrades to a plain non-persisted store instead of crashing.
 */
function getDefaultStorage<T>(): PersistOptions<T>['storage'] {
  try {
    if (typeof window === 'undefined' || window.localStorage == null) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return createJSONStorage<T>(() => window.localStorage);
}
