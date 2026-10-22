/**
 * Field reads shared by the block adapters (`<block>/fromNodes.ts`). Every read
 * goes through the template readers `getFieldValue` / `getFieldNumber`, so a bare
 * `@key` reads its `/attributes/@key` path and a date object reads as ISO text.
 * A runtime number or checkbox under the exact key keeps the type the adapters
 * gave it before these helpers existed.
 */
import { getFieldNumber, getFieldValue } from '@/lib/genesis-data';
import type { GenesisNode } from '@/lib/genesis-data';

/** The field as text, or `''` when the row has no value for it. */
export function fieldText(node: GenesisNode, key: string): string {
  return getFieldValue(node, key) ?? '';
}

/** The field as text, or `undefined` when the row has no value for it. */
export function optionalFieldText(node: GenesisNode, key: string): string | undefined {
  return getFieldValue(node, key) ?? undefined;
}

/**
 * The field as a table or card cell. A runtime number (a Rating field) stays a
 * number, so a table sorts and formats it as a number.
 */
export function fieldCell(node: GenesisNode, key: string): string | number {
  const raw: unknown = node.fieldValues[key];
  return typeof raw === 'number' ? raw : fieldText(node, key);
}

/**
 * The field as a finite number, or 0 when it is missing or not numeric (never
 * `NaN`, which renders as the text "NaN"). A checkbox reads as 1 or 0.
 */
export function fieldNumber(node: GenesisNode, key: string): number {
  const raw: unknown = node.fieldValues[key];
  if (typeof raw === 'boolean') {
    return raw ? 1 : 0;
  }
  return getFieldNumber(node, key) ?? 0;
}
