/**
 * Pure adapter mapping a project's rows (`GenesisNode[]`) into `StatusTracker`
 * props (`ChecklistItem[]`).
 *
 * Reads fields through `getFieldValue` (see `../fieldReads.ts`; missing fields
 * default to `''`), carries `node.id` through as the item `id`, and derives `done`
 * from whether the status is in `doneStatuses`. It does NOT fetch - call `getNodes`
 * yourself and pass the result in. Keeping the adapter pure means the block stays
 * presentational and this stays unit-testable. Mirrors `records/fromNodes.ts`.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import { fieldText } from '../fieldReads';
import type { ChecklistItem } from './StatusTracker';

/** Maps node field paths onto `ChecklistItem`s. */
export interface ChecklistConfig {
  /** Field key read for the item's `label`. */
  labelField: string;
  /** Field key read for the item's `status`. */
  statusField: string;
  /** Optional field key read for the item's `group`. */
  groupField?: string;
  /** Optional field key read for the item's `owner`. */
  ownerField?: string;
  /**
   * Status values (matched case-insensitively) that mark an item `done`. When
   * omitted, `done` is left `undefined` and the tracker treats the item as open.
   */
  doneStatuses?: string[];
}

/**
 * Map nodes -> checklist items. Missing fields default to `''`; `id` always comes
 * from `node.id`; `done` is `true` when the status matches `doneStatuses`
 * (case-insensitive). Pure.
 */
export function nodesToChecklist(nodes: GenesisNode[], config: ChecklistConfig): ChecklistItem[] {
  const done = config.doneStatuses?.map((status) => status.trim().toLowerCase());
  return nodes.map((node) => {
    const status = fieldText(node, config.statusField);
    const item: ChecklistItem = {
      id: node.id,
      label: fieldText(node, config.labelField),
      status,
    };
    if (done) {
      item.done = done.includes(status.trim().toLowerCase());
    }
    if (config.groupField) {
      item.group = fieldText(node, config.groupField);
    }
    if (config.ownerField) {
      item.owner = fieldText(node, config.ownerField);
    }
    return item;
  });
}

/* ------------------------------------------------------------------ */
/* ICP-grounded default example props                                 */
/* ------------------------------------------------------------------ */

/**
 * Receiving / inbound checklist for EV-02 (warehouse roles + activity log) - the
 * IndyRyde / James Container "verify what just arrived" flow. Realistic dock
 * steps, not lorem ipsum, with a worker owner and the inbound-shipment group.
 */
export const RECEIVING_CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'recv-1',
    label: 'Verify packing slip vs PO',
    status: 'Done',
    done: true,
    group: 'Inbound #INB-309',
    owner: 'Marcus Hale',
    dueDate: '2026-06-29',
  },
  {
    id: 'recv-2',
    label: 'Inspect for damage',
    status: 'In Progress',
    done: false,
    group: 'Inbound #INB-309',
    owner: 'Marcus Hale',
    dueDate: '2026-06-29',
  },
  {
    id: 'recv-3',
    label: 'Scan SKUs into inventory',
    status: 'Blocked',
    done: false,
    group: 'Inbound #INB-309',
    owner: 'Priya Nadar',
    dueDate: '2026-06-29',
    meta: [{ label: 'Reason', value: 'Scanner offline' }],
  },
  {
    id: 'recv-4',
    label: 'Sign off + file BOL',
    status: 'Open',
    done: false,
    group: 'Inbound #INB-309',
    owner: 'Dana Office',
    dueDate: '2026-06-30',
  },
];

/**
 * Client onboarding checklist for EV-07 (client portal) - the Paul-K agency
 * "get a new client live" flow. Realistic kickoff steps with a client-success
 * owner and a per-client group.
 */
export const ONBOARDING_CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'onb-1',
    label: 'Sign engagement agreement',
    status: 'Completed',
    done: true,
    group: 'Northwind Co',
    owner: 'Paul K.',
    dueDate: '2026-06-24',
  },
  {
    id: 'onb-2',
    label: 'Upload ID/docs',
    status: 'In Progress',
    done: false,
    group: 'Northwind Co',
    owner: 'Client',
    dueDate: '2026-06-30',
  },
  {
    id: 'onb-3',
    label: 'Schedule kickoff call',
    status: 'Pending',
    done: false,
    group: 'Northwind Co',
    owner: 'Paul K.',
    dueDate: '2026-07-01',
  },
  {
    id: 'onb-4',
    label: 'Grant portal access',
    status: 'Open',
    done: false,
    group: 'Northwind Co',
    owner: 'Paul K.',
    dueDate: '2026-07-02',
  },
];
