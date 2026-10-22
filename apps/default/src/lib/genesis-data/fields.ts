/**
 * Canonical field-access helpers for Genesis project rows - THE data path for generated
 * apps. Always read `fieldValues` through these helpers instead of indexing it directly;
 * they encode the gateway read contract:
 *
 * - `getNodes` returns EVERY row of the project as one FLAT array. In a flat database
 *   (the common case) every row has `parentId === null` - use the array as-is and NEVER
 *   filter by `parentId` to find data rows: `nodes.filter((n) => n.parentId !== null)`
 *   discards the entire database.
 * - Each field value is emitted under its stable field path (e.g. `/attributes/@statu`)
 *   AND, when the field's display name is unique, that name too (e.g. `Status`). Some
 *   fields emit under only one key form, so pass every key you know (display name first,
 *   then field path) and let the helper fall back. A bare field key (`@statu`) reads the
 *   field path `/attributes/@statu`, the same key form a write accepts.
 * - Values are serialized primitives - usually strings, but some field types (e.g.
 *   Rating) arrive as numbers. Use `getFieldNumber` for numeric fields instead of
 *   trusting `typeof` or calling `Number()` by hand. A date field that arrives as an
 *   object (a range, an event, a DateTime) reads as ISO text.
 * - To show a Select, read `getFieldLabel(row, '@key')`: it returns the option name.
 *   `getFieldValue` gives the option id on the field path, so compare ids with it.
 */
import type { GenesisNode } from './client';

/**
 * Reads a field value with multi-key fallback: returns the value at the first key
 * present on the row, always as a string, or null when no key matches.
 *
 * @example
 * ```typescript
 * const status = getFieldValue(row, 'Status', '/attributes/@statu');
 * ```
 */
export function getFieldValue(node: GenesisNode, ...fieldKeys: string[]): string | null {
  for (const fieldKey of fieldKeys) {
    // Typed as string, but some field types serialize to number/boolean at runtime.
    const value = readKey(node.fieldValues, fieldKey);
    if (value != null) {
      return toFieldText(value);
    }
  }
  return null;
}

/**
 * Reads a field for display: the option name of a Select (`No photos`), else the same
 * text as `getFieldValue`. Takes the same keys and fallback order as `getFieldValue`.
 * Compare option ids with `getFieldValue`, which this does not change.
 *
 * @example
 * ```typescript
 * <Badge>{getFieldLabel(row, '@perm') ?? 'Not set'}</Badge>
 * ```
 */
export function getFieldLabel(node: GenesisNode, ...fieldKeys: string[]): string | null {
  for (const fieldKey of fieldKeys) {
    const label = node.selectLabels != null ? readKey(node.selectLabels, fieldKey) : undefined;
    if (typeof label === 'string') {
      return label;
    }
    const value = getFieldValue(node, fieldKey);
    if (value != null) {
      return value;
    }
  }
  return null;
}

/**
 * The value at one key. Rows are never keyed by a bare `@key`, only by its path, so a
 * bare key that matches no display name reads the path (writes accept both spellings).
 */
function readKey(values: Record<string, unknown>, fieldKey: string): unknown {
  return (
    values[fieldKey] ?? (fieldKey.startsWith('@') ? values[`/attributes/${fieldKey}`] : undefined)
  );
}

/**
 * Text for one field value. A date field can arrive as an object: a date range or
 * an event as `{ start, end }`, and a DateTime as `{ type: 'DateTime', dateTime:
 * { date, time } }`. Those read as ISO text (the start of a range), so date code
 * can parse them. Every other value reads as `String(value)`.
 */
function toFieldText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value != null) {
    if ('start' in value && typeof value.start === 'string') {
      return value.start;
    }
    if ('dateTime' in value && typeof value.dateTime === 'object' && value.dateTime != null) {
      const { date, time } = value.dateTime as { date?: unknown; time?: unknown };
      if (typeof date === 'string') {
        return typeof time === 'string' && time.length > 0 ? `${date}T${time}` : date;
      }
    }
  }
  return String(value);
}

/**
 * Reads a numeric field with the same multi-key fallback, coerced via `Number()`.
 * Returns null (never NaN) for missing values, empty strings, and non-numeric text.
 *
 * @example
 * ```typescript
 * const kills = getFieldNumber(row, 'Kills', '/attributes/@kills') ?? 0;
 * ```
 */
export function getFieldNumber(node: GenesisNode, ...fieldKeys: string[]): number | null {
  const raw = getFieldValue(node, ...fieldKeys);
  if (raw == null || raw.trim().length === 0) {
    // Guard: Number('') and Number('   ') are 0, not NaN.
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolves a row's display title. Prefers an explicit title/name custom field (pass the
 * keys you expect, display name first), and falls back to the row's node text (`content`)
 * only when no such field is present — so a card renders a real label instead of
 * "Untitled" even if the row's name was seeded into node text rather than a field.
 * Returns null when neither is available; the caller decides the empty-state label.
 *
 * Prefer a real title field: `content` is a last-resort fallback, not queryable data.
 *
 * @example
 * ```typescript
 * const title = getTitle(row, 'Name', 'Title') ?? 'Untitled';
 * ```
 */
export function getTitle(node: GenesisNode, ...titleFieldKeys: string[]): string | null {
  // Check each key for a NON-BLANK value: `getFieldValue(node, ...keys)` stops at the
  // first *present* key, so a blank earlier key ('   ') would mask a later real title.
  for (const key of titleFieldKeys) {
    const field = getFieldValue(node, key);
    if (field != null && field.trim().length > 0) {
      return field;
    }
  }
  const content = node.content;
  if (content != null && content.trim().length > 0) {
    return content;
  }
  return null;
}
