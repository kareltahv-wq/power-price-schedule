/**
 * Genesis Data SDK - read & write a Taskade project's rows (nodes) from a Genesis app,
 * natively (no iframe). Thin typed wrappers over the `/api/taskade/projects/:id/nodes`
 * gateway routes. All writes funnel through the backend's single OT write path.
 */
import { gatewayGetIfChanged, gatewayRequest, isEmptyString } from '../genesis-gateway';
import type { ClientOptions, GatewayResponse } from '../genesis-gateway';

/**
 * A serialized project row. `fieldValues` is keyed by the field's display name (e.g.
 * `Status`, `Email`); the field path is also available as a key. Read it via
 * `getFieldValue` / `getFieldNumber` from `./fields` - not by direct indexing. To show a
 * Select, read `getFieldLabel(row, '@key')`: it returns the option name.
 * `parentId` is the parent row id, or null for a top-level row. In a flat database
 * (the common case) EVERY row has `parentId: null`.
 */
export interface GenesisNode {
  id: string;
  fieldValues: Record<string, string>;
  parentId: string | null;
  /**
   * The row's node text, present only when non-empty. A LAST-RESORT DISPLAY FALLBACK,
   * NOT queryable data — read it via `getTitle` (from `./fields`), never build filters
   * or sorts on it. Real display/sort/filter values must live in `fieldValues`.
   */
  content?: string;
  /**
   * When the row was created, as an ISO 8601 UTC string. The server sets it on insert,
   * so sort a feed or show a submitted time with it, not with a custom field. It can be
   * absent on an older row, so sort a row without it last.
   */
  createdAt?: string;
  /**
   * The option name of each Select field, keyed like `fieldValues`. Read it with
   * `getFieldLabel`. An older gateway sends none.
   */
  selectLabels?: Record<string, string>;
}

/**
 * Fields for a new row. Keys are field display names (e.g. `Status`); the value type
 * must MATCH the field type: a number field takes a plain number (no `String()`
 * wrapper), a checkbox takes a real boolean, and every text-shaped field (text, note,
 * select, date, link) takes a string. The gateway validates the whole body against a
 * per-field JSON schema BEFORE it coerces anything, so a type mismatch is a loud 400,
 * never a silent write. Pass `parentId` to nest the row under an existing one.
 */
export type NewNodeFields = Record<string, string | number | boolean> & { parentId?: string };

/** The rows path. `selectLabels=1` adds each row's Select option names (`getFieldLabel`). */
function nodesPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/nodes?selectLabels=1`;
}

/**
 * Fetches ALL rows of a project as one FLAT array (children included). Use the array
 * as-is; NEVER filter by `parentId` to find data rows - in a flat database every row
 * has `parentId === null`, so `rows.filter((r) => r.parentId !== null)` returns nothing.
 *
 * @example
 * ```typescript
 * const rows = await getNodes('project-123');
 * ```
 */
export async function getNodes(projectId: string, options?: ClientOptions): Promise<GenesisNode[]> {
  if (isEmptyString(projectId)) {
    throw new Error('Project ID cannot be empty');
  }
  const data = await gatewayRequest<GatewayResponse<{ nodes: GenesisNode[] }>>(
    nodesPath(projectId),
    { method: 'GET' },
    options,
  );
  return data.payload?.nodes ?? [];
}

/** `getNodesIfChanged` result: rows only when the project revision moved. */
export type NodesIfChanged =
  | { changed: false; etag: string | null }
  | { changed: true; etag: string | null; nodes: GenesisNode[] };

/**
 * Like `getNodes`, but revalidates with the ETag from the previous call. When
 * nothing changed the gateway answers 304 (a revision lookup, no rows sent)
 * and `changed` is false. Used by `useLiveNodes`; call it directly only if
 * you are building your own refresh loop.
 */
export async function getNodesIfChanged(
  projectId: string,
  etag: string | null,
  options?: ClientOptions,
): Promise<NodesIfChanged> {
  if (isEmptyString(projectId)) {
    throw new Error('Project ID cannot be empty');
  }
  const result = await gatewayGetIfChanged<GatewayResponse<{ nodes: GenesisNode[] }>>(
    nodesPath(projectId),
    etag,
    options,
  );
  if (!result.changed) {
    return { changed: false, etag: result.etag };
  }
  return { changed: true, etag: result.etag, nodes: result.body.payload?.nodes ?? [] };
}

/** What a write reports back: the row's id and any keys the project had no field for. */
export type WriteResult = {
  /** The written row's id, or null when the gateway did not report one. */
  id: string | null;
  /** Request keys that matched no field and were NOT written. Empty means every key landed. */
  ignoredKeys: string[];
};

/** The `payload` of a create/update response. Every member is optional: an older gateway sends none. */
type WritePayload = { node?: { id?: string }; ignoredKeys?: string[] };

function readWriteResult(data: GatewayResponse<WritePayload> | undefined): WriteResult {
  const id = data?.payload?.node?.id;
  const ignoredKeys = data?.payload?.ignoredKeys;
  return {
    id: typeof id === 'string' && id !== '' ? id : null,
    // Element-wise guard: a malformed payload such as [null, 1] must not
    // escape typed as string[] - keep only the string entries.
    ignoredKeys: Array.isArray(ignoredKeys)
      ? ignoredKeys.filter((key): key is string => typeof key === 'string')
      : [],
  };
}

/**
 * Creates a new row in a project. Resolves once the row is saved; the result
 * carries the new row's id and any keys the project had no field for. A
 * resolved promise IS the success signal - do not treat a missing id as a
 * failed save. When the gateway refuses a value that does not fit its field, the
 * call saves nothing and throws a `GatewayInvalidFieldsError` whose message names
 * the columns: show `error.message` and keep the answers on screen.
 *
 * @example
 * ```typescript
 * const { id, ignoredKeys } = await createNode('project-123', { Name: 'Maria', Status: 'New' });
 * ```
 */
export async function createNode(
  projectId: string,
  fields: NewNodeFields,
  options?: ClientOptions,
): Promise<WriteResult> {
  if (isEmptyString(projectId)) {
    throw new Error('Project ID cannot be empty');
  }
  const data = await gatewayRequest<GatewayResponse<WritePayload>>(
    `/projects/${encodeURIComponent(projectId)}/nodes`,
    { method: 'POST', body: JSON.stringify(fields) },
    options,
  );
  return readWriteResult(data);
}

/**
 * Updates field values on an existing row. Only the provided fields are changed.
 * Each value's type must match its field type, same contract as `createNode`, and
 * the result carries the same `{ id, ignoredKeys }` shape: a resolved promise is
 * the success signal, and a non-empty `ignoredKeys` names the keys that were not
 * written.
 */
export async function updateNode(
  projectId: string,
  nodeId: string,
  fields: Record<string, string | number | boolean>,
  options?: ClientOptions,
): Promise<WriteResult> {
  if (isEmptyString(projectId) || isEmptyString(nodeId)) {
    throw new Error('Project ID and node ID cannot be empty');
  }
  const data = await gatewayRequest<GatewayResponse<WritePayload>>(
    `/projects/${encodeURIComponent(projectId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'PATCH', body: JSON.stringify(fields) },
    options,
  );
  return readWriteResult(data);
}

/**
 * Deletes a row from a project.
 */
export async function deleteNode(
  projectId: string,
  nodeId: string,
  options?: ClientOptions,
): Promise<void> {
  if (isEmptyString(projectId) || isEmptyString(nodeId)) {
    throw new Error('Project ID and node ID cannot be empty');
  }
  await gatewayRequest(
    `/projects/${encodeURIComponent(projectId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'DELETE' },
    options,
  );
}
