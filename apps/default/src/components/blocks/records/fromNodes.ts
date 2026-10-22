/**
 * Pure adapter mapping a project's rows (`GenesisNode[]`) into `RecordsTable` props.
 *
 * Reads fields through `getFieldValue` / `getFieldNumber` (see `../fieldReads.ts`),
 * guards `numericFields` to 0, and always carries `node.id` through as the row `id`.
 * It does NOT fetch - call `getNodes` yourself and pass the result in. Keeping the
 * adapter pure means the block stays presentational and this stays unit-testable.
 * Mirrors `metrics/fromNodes.ts`.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import { fieldCell, fieldNumber } from '../fieldReads';
import type { RecordRow, RecordsTableColumn } from './RecordsTable';

/** Maps node field paths onto `RecordRow`s and `RecordsTableColumn`s. */
export interface RecordsConfig {
  /** Field keys (= `GenesisNode.fieldValues` keys) to surface as columns, in order. */
  fields: string[];
  /** Optional per-field header overrides; defaults to the field key. */
  headers?: Record<string, string>;
  /** Field keys that are sortable. */
  sortable?: string[];
  /** Numeric field keys -> `Number()` coercion + right align. */
  numericFields?: string[];
  /** Field key that renders as a status `Badge` in the table. */
  statusField?: string;
}

/**
 * Map nodes -> table rows. Missing fields default to `''`; `numericFields` are
 * `Number()`-coerced (guarded to 0). `id` always comes from `node.id`. Pure.
 */
export function nodesToRecords(nodes: GenesisNode[], config: RecordsConfig): RecordRow[] {
  const numeric = new Set(config.numericFields ?? []);
  return nodes.map((node) => {
    const row: RecordRow = { id: node.id };
    for (const field of config.fields) {
      row[field] = numeric.has(field) ? fieldNumber(node, field) : fieldCell(node, field);
    }
    return row;
  });
}

/**
 * Derive ordered `RecordsTableColumn`s from the same config. Numeric fields are
 * right-aligned; sortable fields are flagged; headers fall back to the field key.
 * Pure.
 */
export function recordsColumns(config: RecordsConfig): RecordsTableColumn[] {
  const numeric = new Set(config.numericFields ?? []);
  const sortable = new Set(config.sortable ?? []);
  return config.fields.map((field) => ({
    key: field,
    header: config.headers?.[field] ?? field,
    sortable: sortable.has(field),
    align: numeric.has(field) ? ('right' as const) : ('left' as const),
  }));
}

/**
 * Narrow `rows` to those whose `ownerField` equals `viewerId`. Pure; no side effects.
 *
 * SECURITY DISCLOSURE - this is a DISPLAY-ONLY convenience, NOT an access-control
 * boundary. The full `rows` array is still present in the client bundle and in
 * memory; this helper only changes what is *rendered*. Anyone can read the
 * unfiltered data via devtools or the network response. Real per-user privacy
 * requires GATEWAY ROW SCOPING (rubric G3/G4/G5) so each user only ever
 * *receives* their own rows. The owner turns on Private per-user data in the
 * Publish menu, or asks Taskade EVE. Never treat this filter as a
 * privacy guarantee.
 *
 * Returns ALL rows unchanged when `viewerId` is null/undefined (no viewer in
 * context = nothing to scope to = show everything, e.g. admin/server render).
 * Comparison is by string value of the field so numeric owner ids match too.
 */
export function filterByOwner<Row extends RecordRow>(
  rows: Row[],
  ownerField: string,
  viewerId: string | null | undefined,
): Row[] {
  if (viewerId == null) {
    return rows;
  }
  return rows.filter((row) => String(row[ownerField] ?? '') === viewerId);
}

/**
 * Activity-log column preset for EV-02 (warehouse roles + activity log) - "an
 * activity log of who changed what" (ICP: IndyRyde). Surfaces the who/what/when
 * audit shape: actor, action, target, timestamp. Pair with `ACTIVITY_LOG_ROWS`
 * for a ready example, or map your own nodes through `nodesToRecords`.
 *
 * `action` doubles as the `statusField` so verbs (created / updated / deleted)
 * pick up a semantic status `Badge` via the table's keyword heuristic.
 */
export const ACTIVITY_LOG_COLUMNS: RecordsTableColumn[] = [
  { key: 'actor', header: 'Actor', sortable: true },
  { key: 'action', header: 'Action', sortable: true },
  { key: 'target', header: 'Target', sortable: true },
  { key: 'timestamp', header: 'When', sortable: true, align: 'right' },
];

/** Field key in `ACTIVITY_LOG_COLUMNS` intended for the table's `statusField`. */
export const ACTIVITY_LOG_STATUS_FIELD = 'action' as const;

/** Realistic activity-log example rows for EV-02 (who changed what, when). */
export const ACTIVITY_LOG_ROWS: RecordRow[] = [
  {
    id: 'log-1',
    actor: 'Priya Nadar',
    action: 'Updated',
    target: 'SKU-4821 stock count',
    timestamp: '2026-06-29 14:02',
  },
  {
    id: 'log-2',
    actor: 'Marcus Hale',
    action: 'Created',
    target: 'Inbound shipment #INB-309',
    timestamp: '2026-06-29 11:47',
  },
  {
    id: 'log-3',
    actor: 'Priya Nadar',
    action: 'Shipped',
    target: 'Order #ORD-1188',
    timestamp: '2026-06-28 16:20',
  },
  {
    id: 'log-4',
    actor: 'Dana Office',
    action: 'Deleted',
    target: 'Duplicate location row',
    timestamp: '2026-06-28 09:05',
  },
];
