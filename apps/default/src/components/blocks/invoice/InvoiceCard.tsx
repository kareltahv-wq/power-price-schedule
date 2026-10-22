'use client';

import { Check, FileText, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface InvoiceLineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface InvoiceCardProps {
  invoice: {
    id: string;
    number: string;
    status: string;
    issueDate?: string;
    dueDate?: string;
    billTo: { name: string; email?: string; address?: string };
    lineItems: InvoiceLineItem[];
    taxRate?: number;
    currency?: string;
  };
  onMarkPaid?: (id: string) => void;
  onSend?: (id: string) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* JIT-literal status-bucket Record                                   */
/* Every value appears verbatim so the Tailwind JIT content scan      */
/* (.tsx only) emits it - a computed `bg-${x}` would resolve to        */
/* nothing in a built app. Invoice status is categorical -> tokens.   */
/* ------------------------------------------------------------------ */

const STATUS_BADGE = {
  paid: 'bg-primary text-primary-foreground',
  unpaid: 'bg-muted text-muted-foreground',
  overdue: 'bg-destructive text-destructive-foreground',
  __default: 'bg-muted text-muted-foreground',
} as const;

type StatusBucket = keyof typeof STATUS_BADGE;

/**
 * Map a free-text invoice status onto a semantic bucket. Defaults the common
 * service-pro vocabulary (paid / unpaid / overdue) and falls back to the neutral
 * `__default` so an unknown status still renders a (muted) Badge rather than
 * resolving to no class.
 */
function statusBucketFor(status: string): StatusBucket {
  const key = status.trim().toLowerCase();
  if (key === 'paid') {
    return 'paid';
  }
  if (key === 'overdue') {
    return 'overdue';
  }
  if (key === 'unpaid' || key === 'due' || key === 'open' || key === 'sent') {
    return 'unpaid';
  }
  return '__default';
}

/* ------------------------------------------------------------------ */
/* Money helper                                                        */
/* ------------------------------------------------------------------ */

/**
 * Format a number as currency via `Intl.NumberFormat` - never a hardcoded `$`,
 * so re-themed apps in other locales/currencies format correctly. A non-finite
 * amount falls back to a zero-formatted value so a missing field never renders
 * "NaN" or "$undefined".
 */
function formatMoney(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(safe);
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Presentational single-invoice card - the terminal output of a service-pro /
 * CRM job. Data in via `invoice`; never fetched here. Totals (subtotal, tax,
 * total) are computed IN-BLOCK from `lineItems` as pure render math. Optional
 * `onMarkPaid` / `onSend` callbacks wire the footer Buttons; when omitted the
 * Buttons are not rendered.
 */
export function InvoiceCard({ invoice, onMarkPaid, onSend, className }: InvoiceCardProps) {
  const currency = invoice.currency ?? 'USD';
  const taxRate =
    typeof invoice.taxRate === 'number' && Number.isFinite(invoice.taxRate) ? invoice.taxRate : 0;

  // Pure render math - no fetch, no side effects.
  const lineAmounts = invoice.lineItems.map((item) => {
    const qty = Number.isFinite(item.qty) ? item.qty : 0;
    const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
    return { item, qty, unitPrice, amount: qty * unitPrice };
  });
  const subtotal = lineAmounts.reduce((sum, line) => sum + line.amount, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const statusBucket = statusBucketFor(invoice.status);
  const showActions = Boolean(onMarkPaid) || Boolean(onSend);

  return (
    <Card
      data-genesis-block="invoice-card"
      className={cn('bg-card text-card-foreground', className)}
    >
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <FileText className="text-muted-foreground size-5" aria-hidden />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground text-lg font-semibold">{invoice.number}</span>
              <span className="text-muted-foreground text-sm">Invoice</span>
            </div>
          </div>
          <Badge className={STATUS_BADGE[statusBucket]}>{invoice.status}</Badge>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          {invoice.issueDate ? (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Issued</span>
              <span className="text-foreground tabular-nums">{invoice.issueDate}</span>
            </div>
          ) : null}
          {invoice.dueDate ? (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Due</span>
              <span className="text-foreground tabular-nums">{invoice.dueDate}</span>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex flex-col gap-6">
        {/* Bill-to block */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Bill to
          </span>
          <span className="text-foreground font-medium">{invoice.billTo.name}</span>
          {invoice.billTo.email ? (
            <span className="text-muted-foreground text-sm">{invoice.billTo.email}</span>
          ) : null}
          {invoice.billTo.address ? (
            <span className="text-muted-foreground text-sm">{invoice.billTo.address}</span>
          ) : null}
        </div>

        {/* Line-items table - amount + unit price right-aligned tabular-nums */}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineAmounts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="text-muted-foreground h-20 text-center">
                    No line items
                  </TableCell>
                </TableRow>
              ) : (
                lineAmounts.map((line) => (
                  <TableRow key={line.item.id}>
                    <TableCell className="text-foreground font-medium">
                      {line.item.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.qty}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {formatMoney(line.unitPrice, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(line.amount, currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="text-muted-foreground text-right">
                  Subtotal
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(subtotal, currency)}
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="text-muted-foreground text-right">
                  Tax ({(taxRate * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%)
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(tax, currency)}
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="text-foreground text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-foreground text-right font-semibold tabular-nums">
                  {formatMoney(total, currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>

      {showActions ? (
        <>
          <Separator />
          <CardContent className="flex flex-wrap items-center justify-end gap-2">
            {onSend ? (
              <Button variant="outline" onClick={() => onSend(invoice.id)}>
                <Send aria-hidden />
                Send
              </Button>
            ) : null}
            {onMarkPaid ? (
              <Button onClick={() => onMarkPaid(invoice.id)}>
                <Check aria-hidden />
                Mark paid
              </Button>
            ) : null}
          </CardContent>
        </>
      ) : null}
    </Card>
  );
}
