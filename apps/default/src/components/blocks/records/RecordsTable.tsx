'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, MoreHorizontal, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { filterByOwner } from './fromNodes';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface RecordRow {
  id: string;
  [key: string]: string | number | undefined;
}

export interface RecordsTableColumn<Row extends RecordRow = RecordRow> {
  /** Field key into the row. */
  key: string;
  /** Column label. */
  header: string;
  /** Whether the header toggles client-side sort. Default false. */
  sortable?: boolean;
  /** Cell alignment. Use `right` for numeric/tabular-nums columns. Default `left`. */
  align?: 'left' | 'right';
  /** Custom cell renderer; defaults to `String(row[key])`. */
  render?: (row: Row) => React.ReactNode;
}

export interface RecordRowAction<Row extends RecordRow = RecordRow> {
  label: string;
  icon?: LucideIcon;
  onSelect: (row: Row) => void;
  /** `destructive` maps to a `text-destructive` menu item. */
  variant?: 'default' | 'destructive';
}

export interface RecordsTableProps<Row extends RecordRow = RecordRow> {
  /** DATA IN - never fetched here. */
  rows: Row[];
  columns: RecordsTableColumn<Row>[];
  /** Which column renders as a status `Badge`. */
  statusField?: keyof Row & string;
  /**
   * Optional map of a status value -> a key of `STATUS_BADGE` (semantic bucket).
   * Falls back to a built-in keyword heuristic, then to `__default`.
   */
  statusColors?: Record<string, StatusBucket>;
  /** Client-side free-text across all columns. Default true. */
  searchable?: boolean;
  /** Optional `Select`-driven exact-match filter (usually = `statusField`). */
  filterField?: keyof Row & string;
  /**
   * DISPLAY-ONLY per-owner scoping field. When BOTH `ownerField` and `viewerId`
   * are set, rows are filtered to those whose `ownerField` matches `viewerId`,
   * and a small inline note is rendered.
   *
   * SECURITY DISCLOSURE: this is a presentational convenience for "show me my
   * own records" views (EV-11 storefront, EV-07 client portal) - it is NOT a
   * security boundary. The full `rows` array still ships to and lives in the
   * client; this only changes what is rendered. Real per-user privacy requires
   * GATEWAY ROW SCOPING (rubric G3/G4/G5) so each user only ever *receives*
   * their own rows. The owner turns on Private per-user data in the Publish
   * menu, or asks Taskade EVE. Client-side filtering is never
   * access control.
   *
   * When either prop is absent, every row is shown (behavior unchanged).
   */
  ownerField?: keyof Row & string;
  /** Viewer id compared against `ownerField` (display-only - see `ownerField`). */
  viewerId?: string;
  /** Per-row dropdown actions (edit / delete / open). */
  actions?: RecordRowAction<Row>[];
  /** Row click / open affordance. */
  onRowOpen?: (row: Row) => void;
  title?: string;
  /**
   * Skeleton rows while the HOST fetches (the block itself never fetches).
   * Per the design styleguide: skeleton/shimmer, never a spinner or a blank panel.
   */
  loading?: boolean;
  /** Zero-data empty-state title. Default 'No records'. */
  emptyText?: string;
  /** Zero-data empty-state body copy. Default 'Records you add will show up here.'. */
  emptyDescription?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* JIT-literal status-color Record                                    */
/* Every value appears verbatim so the Tailwind JIT content scan      */
/* (.tsx only) emits it - a computed `bg-${x}` would resolve to        */
/* nothing in a built app. Status is categorical -> semantic tokens.   */
/* ------------------------------------------------------------------ */

const STATUS_BADGE = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-primary text-primary-foreground',
  warning: 'bg-secondary text-secondary-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  __default: 'bg-muted text-muted-foreground',
} as const;

export type StatusBucket = keyof typeof STATUS_BADGE;

/**
 * Default keyword -> bucket heuristic for the ICP status vocabularies (service-pro
 * jobs, real-estate leads, commerce orders). Lets the table color statuses sensibly
 * with zero config while `statusColors` stays available for explicit overrides.
 */
const STATUS_KEYWORDS: Record<string, StatusBucket> = {
  quoted: 'neutral',
  new: 'accent',
  lost: 'neutral',
  scheduled: 'accent',
  contacted: 'warning',
  'in progress': 'warning',
  packing: 'warning',
  pending: 'warning',
  qualified: 'primary',
  shipped: 'primary',
  completed: 'success',
  delivered: 'success',
  won: 'success',
  paid: 'success',
  invoiced: 'success',
  active: 'success',
  overdue: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  urgent: 'danger',
};

function bucketFor(value: string, overrides?: Record<string, StatusBucket>): StatusBucket {
  if (overrides && overrides[value]) {
    return overrides[value];
  }
  const key = value.trim().toLowerCase();
  return STATUS_KEYWORDS[key] ?? '__default';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

type SortDir = 'asc' | 'desc';

function cellText(value: string | number | undefined): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

function compareValues(a: string | number | undefined, b: string | number | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: 'base' });
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Presentational records table. Data in via `rows` - never fetched here.
 *
 * Optional per-owner DISPLAY filtering: pass both `ownerField` and `viewerId` to
 * show only the viewer's own rows (EV-11 storefront, EV-07 client portal). This is
 * a DISPLAY-ONLY convenience and NOT a security boundary - the full `rows` array
 * still ships to the client. Real per-user privacy requires gateway row scoping
 * (rubric G3/G4/G5): the owner turns on Private per-user data in the Publish
 * menu, or asks Taskade EVE. Never treat client-side filtering as access control.
 */
export function RecordsTable<Row extends RecordRow = RecordRow>({
  rows,
  columns,
  statusField,
  statusColors,
  searchable = true,
  filterField,
  ownerField,
  viewerId,
  actions,
  onRowOpen,
  title,
  loading = false,
  emptyText = 'No records',
  emptyDescription = 'Records you add will show up here.',
  className,
}: RecordsTableProps<Row>) {
  const [query, setQuery] = React.useState('');
  const [filterValue, setFilterValue] = React.useState<string>('__all');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');

  // DISPLAY-ONLY per-owner scoping. When either prop is absent this is exactly
  // `rows` (reference-identical), so all downstream behavior is unchanged. This is
  // NOT a security boundary - see `ownerField` JSDoc / `filterByOwner`.
  const ownerScoped = React.useMemo(
    () => (ownerField ? filterByOwner(rows, ownerField, viewerId) : rows),
    [rows, ownerField, viewerId],
  );
  const ownerFilterActive = Boolean(ownerField) && viewerId !== undefined;

  const filterOptions = React.useMemo(() => {
    if (!filterField) {
      return [];
    }
    const seen = new Set<string>();
    for (const row of ownerScoped) {
      const v = cellText(row[filterField]);
      if (v) {
        seen.add(v);
      }
    }
    return Array.from(seen);
  }, [ownerScoped, filterField]);

  const visibleRows = React.useMemo(() => {
    let next = ownerScoped;

    if (filterField && filterValue !== '__all') {
      next = next.filter((row) => cellText(row[filterField]) === filterValue);
    }

    if (searchable && query.trim()) {
      const q = query.trim().toLowerCase();
      next = next.filter((row) =>
        columns.some((col) => cellText(row[col.key]).toLowerCase().includes(q)),
      );
    }

    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      next = [...next].sort((a, b) => compareValues(a[sortKey], b[sortKey]) * dir);
    }

    return next;
  }, [ownerScoped, columns, filterField, filterValue, searchable, query, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const hasToolbar = Boolean(title) || searchable || Boolean(filterField);

  return (
    <div
      data-genesis-block="records-table"
      className={cn('bg-card text-card-foreground rounded-xl border', className)}
    >
      {hasToolbar ? (
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {title ? <h3 className="text-foreground text-base font-semibold">{title}</h3> : null}
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {searchable ? (
              <div className="relative w-full sm:max-w-xs">
                <Search
                  className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search records…"
                  className="pl-9"
                  aria-label="Search records"
                />
              </div>
            ) : null}
            {filterField ? (
              <Select value={filterValue} onValueChange={setFilterValue}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All</SelectItem>
                  {filterOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
      ) : null}

      {ownerFilterActive ? (
        // DISPLAY-ONLY note. Honest disclosure that this convenience filter is not
        // a privacy guarantee - real per-user scoping needs gateway row scoping
        // (rubric G3/G4/G5). Token-only: text-muted-foreground, no palette/#hex.
        <p className="text-muted-foreground border-t px-4 py-2 text-xs">
          Showing your records.{' '}
          <span className="opacity-80">
            Display-only convenience - not a security boundary. Per-user privacy needs Private
            per-user data, which the app owner turns on in the Publish menu.
          </span>
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const isActive = sortKey === col.key;
              const SortIcon = !isActive ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <TableHead
                  key={col.key}
                  className={col.align === 'right' ? 'text-right' : undefined}
                >
                  {col.sortable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        '-ml-2 h-8 px-2 font-medium',
                        col.align === 'right' && 'ml-auto',
                      )}
                    >
                      {col.header}
                      <SortIcon
                        className={cn(
                          'size-3.5',
                          isActive ? 'opacity-100' : 'text-muted-foreground',
                        )}
                        aria-hidden
                      />
                    </Button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
            {actions && actions.length > 0 ? (
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            // Skeleton rows per the design styleguide (never a spinner/blank panel).
            Array.from({ length: 3 }, (_, index) => (
              <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <Skeleton
                      className={cn('h-4 w-full max-w-32', col.align === 'right' && 'ml-auto')}
                    />
                  </TableCell>
                ))}
                {actions && actions.length > 0 ? (
                  <TableCell>
                    <Skeleton className="ml-auto size-8" />
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          ) : visibleRows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length + (actions && actions.length > 0 ? 1 : 0)}
                className={cn(
                  'text-muted-foreground text-center',
                  query.trim() || filterValue !== '__all' ? 'h-24' : 'p-0',
                )}
              >
                {query.trim() || filterValue !== '__all' ? (
                  'No matching records'
                ) : (
                  // Designed zero-data state (styleguide: never a blank panel).
                  <Empty>
                    <EmptyMedia variant="icon">
                      <Inbox aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle>{emptyText}</EmptyTitle>
                    <EmptyDescription>{emptyDescription}</EmptyDescription>
                  </Empty>
                )}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((row) => (
              <TableRow
                key={row.id}
                data-genesis-row
                onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                className={onRowOpen ? 'cursor-pointer' : undefined}
              >
                {columns.map((col) => {
                  const raw = row[col.key];
                  const isStatus = statusField === col.key;
                  return (
                    <TableCell
                      key={col.key}
                      className={cn(
                        col.align === 'right' && 'text-right tabular-nums',
                        col.key !== statusField &&
                          !col.render &&
                          col.align !== 'right' &&
                          'text-muted-foreground',
                      )}
                    >
                      {col.render ? (
                        col.render(row)
                      ) : isStatus ? (
                        <Badge className={STATUS_BADGE[bucketFor(cellText(raw), statusColors)]}>
                          {cellText(raw)}
                        </Badge>
                      ) : (
                        cellText(raw)
                      )}
                    </TableCell>
                  );
                })}
                {actions && actions.length > 0 ? (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Row actions"
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {actions.map((action) => {
                          const ActionIcon = action.icon;
                          return (
                            <DropdownMenuItem
                              key={action.label}
                              variant={action.variant}
                              onClick={(e) => e.stopPropagation()}
                              onSelect={() => action.onSelect(row)}
                            >
                              {ActionIcon ? <ActionIcon className="size-4" aria-hidden /> : null}
                              {action.label}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="text-muted-foreground border-t px-4 py-2.5 text-xs">
        {loading ? (
          <Skeleton className="h-3 w-20" />
        ) : visibleRows.length === ownerScoped.length ? (
          `${ownerScoped.length} ${ownerScoped.length === 1 ? 'record' : 'records'}`
        ) : (
          `${visibleRows.length} of ${ownerScoped.length} records`
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ICP-grounded default example props (service-pro "Jobs")            */
/* Drawn from the David Acevedo Service Pro Dashboard scope.          */
/* ------------------------------------------------------------------ */

/** Default "Jobs" columns - the canonical service-pro hero shape. */
export const SERVICE_PRO_JOB_COLUMNS: RecordsTableColumn[] = [
  { key: 'job', header: 'Job', sortable: true },
  { key: 'customer', header: 'Customer', sortable: true },
  { key: 'service', header: 'Service Type' },
  { key: 'assigned', header: 'Assigned To' },
  { key: 'scheduled', header: 'Scheduled', sortable: true },
  {
    key: 'value',
    header: 'Job Value',
    sortable: true,
    align: 'right',
    render: (row) =>
      typeof row.value === 'number' ? `$${row.value.toLocaleString()}` : cellText(row.value),
  },
  { key: 'status', header: 'Status', sortable: true },
];

/** Default "Jobs" rows - realistic field-service work, not lorem ipsum. */
export const SERVICE_PRO_JOB_ROWS: RecordRow[] = [
  {
    id: 'job-1',
    job: 'AC unit replacement',
    customer: 'Maria Gomez',
    service: 'HVAC Install',
    assigned: 'Carlos R.',
    scheduled: '2026-07-02',
    value: 4200,
    status: 'Scheduled',
  },
  {
    id: 'job-2',
    job: 'Water heater repair',
    customer: 'Tom Bradley',
    service: 'Plumbing',
    assigned: 'Devin K.',
    scheduled: '2026-06-29',
    value: 380,
    status: 'In Progress',
  },
  {
    id: 'job-3',
    job: 'Quarterly maintenance',
    customer: 'Riverside Cafe',
    service: 'HVAC Service',
    assigned: 'Carlos R.',
    scheduled: '2026-06-25',
    value: 250,
    status: 'Completed',
  },
  {
    id: 'job-4',
    job: 'Panel upgrade quote',
    customer: 'Janet Wu',
    service: 'Electrical',
    assigned: 'Unassigned',
    scheduled: '',
    value: 1800,
    status: 'Quoted',
  },
];
