/**
 * Pure adapter mapping a project's rows (`GenesisNode[]`) into `InvoiceCard` props.
 *
 * `nodeToInvoice` reads the invoice node and the supplied `lineItemNodes`
 * (typically the invoice node's children) through `getFieldValue` /
 * `getFieldNumber` (see `../fieldReads.ts`) and guards qty / unitPrice / taxRate
 * to 0. It does NOT fetch - call
 * `getNodes` yourself and pass the result in. Keeping the adapter pure means the
 * block stays presentational and this stays unit-testable. Mirrors
 * `records/fromNodes.ts`.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import { fieldNumber, fieldText, optionalFieldText } from '../fieldReads';
import type { InvoiceCardProps, InvoiceLineItem } from './InvoiceCard';

/** Maps node field paths onto the invoice header + bill-to + line-item shape. */
export interface InvoiceFieldMap {
  /** Field key read for the invoice `number`. */
  number: string;
  /** Field key read for the invoice `status`. */
  status: string;
  /** Optional field key read for the `issueDate`. */
  issueDate?: string;
  /** Optional field key read for the `dueDate`. */
  dueDate?: string;
  /** Field key read for the bill-to `name`. */
  billToName: string;
  /** Optional field key read for the bill-to `email`. */
  billToEmail?: string;
  /** Optional field key read for the bill-to `address`. */
  billToAddress?: string;
  /** Optional field key (`Number()`-coerced) read for the `taxRate`. */
  taxRate?: string;
  /** Optional field key read for the `currency` (ISO code, e.g. "USD"). */
  currency?: string;
  /** Field key read for each line item's `description`. */
  lineDescription: string;
  /** Field key (`Number()`-coerced) read for each line item's `qty`. */
  lineQty: string;
  /** Field key (`Number()`-coerced) read for each line item's `unitPrice`. */
  lineUnitPrice: string;
}

/**
 * Map an invoice node + its line-item nodes -> `InvoiceCardProps["invoice"]`.
 * Missing string fields default to `''`; qty / unitPrice / taxRate are
 * `Number()`-coerced (guarded to 0). `id` always comes from `node.id`. Pure.
 */
export function nodeToInvoice(
  invoiceNode: GenesisNode,
  lineItemNodes: GenesisNode[],
  fieldMap: InvoiceFieldMap,
): InvoiceCardProps['invoice'] {
  const lineItems: InvoiceLineItem[] = lineItemNodes.map((node) => ({
    id: node.id,
    description: fieldText(node, fieldMap.lineDescription),
    qty: fieldNumber(node, fieldMap.lineQty),
    unitPrice: fieldNumber(node, fieldMap.lineUnitPrice),
  }));

  return {
    id: invoiceNode.id,
    number: fieldText(invoiceNode, fieldMap.number),
    status: fieldText(invoiceNode, fieldMap.status),
    issueDate: fieldMap.issueDate ? fieldText(invoiceNode, fieldMap.issueDate) : undefined,
    dueDate: fieldMap.dueDate ? fieldText(invoiceNode, fieldMap.dueDate) : undefined,
    billTo: {
      name: fieldText(invoiceNode, fieldMap.billToName),
      email: fieldMap.billToEmail ? fieldText(invoiceNode, fieldMap.billToEmail) : undefined,
      address: fieldMap.billToAddress ? fieldText(invoiceNode, fieldMap.billToAddress) : undefined,
    },
    lineItems,
    taxRate: fieldMap.taxRate ? fieldNumber(invoiceNode, fieldMap.taxRate) : undefined,
    currency: fieldMap.currency ? optionalFieldText(invoiceNode, fieldMap.currency) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* ICP-grounded default example (service-pro: David Acevedo, HVAC)    */
/* The terminal output of a service-pro job - a real install invoice. */
/* ------------------------------------------------------------------ */

/**
 * Realistic default invoice for the David Acevedo service-pro shape: an HVAC
 * system install billed to a residential customer. Line items, tax and totals
 * are computed in-block by `InvoiceCard`; this default only supplies the inputs.
 * Use it for previews/storybook-style rendering - not as live data.
 */
export const SERVICE_PRO_INVOICE: InvoiceCardProps['invoice'] = {
  id: 'inv-1042',
  number: 'INV-1042',
  status: 'unpaid',
  issueDate: '2026-06-29',
  dueDate: '2026-07-13',
  billTo: {
    name: 'Maria Gomez',
    email: 'maria.gomez@example.com',
    address: '418 Sycamore Ln, Austin, TX 78704',
  },
  lineItems: [
    {
      id: 'li-1',
      description: '3-ton 16 SEER AC condenser + air handler',
      qty: 1,
      unitPrice: 3600,
    },
    { id: 'li-2', description: 'Install labor (2 techs, full day)', qty: 8, unitPrice: 95 },
    { id: 'li-3', description: 'Refrigerant line set + copper', qty: 1, unitPrice: 240 },
    { id: 'li-4', description: 'Smart thermostat + setup', qty: 1, unitPrice: 180 },
    { id: 'li-5', description: 'Permit + inspection fee', qty: 1, unitPrice: 120 },
  ],
  taxRate: 0.0825,
  currency: 'USD',
};
