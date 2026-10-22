/**
 * Pure, deterministic lead-scoring helper for `LeadCaptureForm`.
 *
 * This file is intentionally framework-free: no React, no zod, no network. It
 * takes the plain `values` object the form hands to `onSubmit` plus a set of
 * weighted rules and returns a bucket (`Hot` / `Warm` / `Cold`), a numeric
 * score, and the human-readable reasons that produced it.
 *
 * The form itself is PRESENTATIONAL and does NOT auto-score. The HOST calls
 * `scoreLead` on submit and decides what to do with the result (e.g. build a
 * `RecordsTable` row, persist to a leads list). See the wiring example at the
 * bottom of this file and in `LeadCaptureForm`'s JSDoc.
 *
 * Determinism guarantees:
 *  - Same `values` + same `rules` always yield the same output.
 *  - Rules are evaluated in array order, so `reasons` is stably ordered.
 *  - No `Date.now()`, no `Math.random()`, no mutation of inputs.
 */

/** The three lead temperatures. */
export type LeadBucket = 'Hot' | 'Warm' | 'Cold';

/**
 * How a rule matches a field value:
 *  - `equals`   - case-insensitive exact match against `value`.
 *  - `oneOf`    - case-insensitive match against any entry in `values`.
 *  - `contains` - case-insensitive substring match against `value`.
 *  - `filled`   - the field is present and non-empty (any truthy string/`true`).
 */
export type LeadMatchKind = 'equals' | 'oneOf' | 'contains' | 'filled';

/**
 * One weighted matcher. When the matcher fires, `weight` is added to the score
 * and `reason` (or a generated default) is appended to `reasons`.
 *
 * `weight` may be negative to penalize disqualifying answers (e.g. "Just
 * browsing" timelines), though the default real-estate set only uses positives.
 */
export interface LeadScoreRule {
  /** Form value key to read (matches `LeadField.name`). */
  field: string;
  /** Match strategy. Default `'equals'`. */
  kind?: LeadMatchKind;
  /** Comparison value for `equals` / `contains`. Ignored by `filled`. */
  value?: string;
  /** Candidate values for `oneOf`. Ignored by other kinds. */
  values?: string[];
  /** Points added to the score when the rule fires (may be negative). */
  weight: number;
  /** Reason text recorded when the rule fires. Defaults to a generated label. */
  reason?: string;
}

/** Score thresholds. A score `>= hot` is Hot; `>= warm` is Warm; else Cold. */
export interface LeadScoreThresholds {
  /** Inclusive lower bound for `Hot`. Default 60. */
  hot: number;
  /** Inclusive lower bound for `Warm`. Default 30. */
  warm: number;
}

export interface LeadScoreResult {
  bucket: LeadBucket;
  score: number;
  reasons: string[];
}

/** Default thresholds: Hot >= 60, Warm 30-59, Cold < 30. */
export const DEFAULT_LEAD_THRESHOLDS: LeadScoreThresholds = { hot: 60, warm: 30 };

/** Normalize a raw form value to a trimmed lowercase string for comparison. */
function norm(raw: string | boolean | undefined): string {
  if (raw === true) {
    return 'true';
  }
  if (raw === false || raw == null) {
    return '';
  }
  return String(raw).trim().toLowerCase();
}

/** Whether a single rule fires for the given values. Pure; never throws. */
function ruleFires(rule: LeadScoreRule, values: Record<string, string | boolean>): boolean {
  const actual = norm(values[rule.field]);
  switch (rule.kind ?? 'equals') {
    case 'filled':
      return actual.length > 0 && actual !== 'false';
    case 'oneOf':
      return (rule.values ?? []).some((candidate) => norm(candidate) === actual);
    case 'contains':
      return rule.value != null && actual.includes(norm(rule.value));
    case 'equals':
    default:
      return rule.value != null && actual === norm(rule.value);
  }
}

/** Default reason text when a rule does not supply its own. */
function defaultReason(rule: LeadScoreRule): string {
  const sign = rule.weight >= 0 ? '+' : '';
  const label =
    rule.value ??
    (rule.values && rule.values.length > 0 ? rule.values.join('/') : `${rule.field} provided`);
  return `${label} (${sign}${rule.weight})`;
}

/**
 * Score a lead from its submitted `values` against a weighted `rules` set.
 *
 * Pure and deterministic: iterates `rules` in order, sums the weights of every
 * rule that fires, clamps the score to `>= 0`, and maps it onto a bucket using
 * `thresholds`. Returns the firing reasons in rule order so the host can show
 * "why" alongside the bucket.
 *
 * @example
 * const { bucket, score, reasons } = scoreLead(values, REAL_ESTATE_LEAD_RULES);
 * // bucket: 'Hot', score: 80, reasons: ['Pre-approved (+30)', 'ASAP (+25)', ...]
 */
export function scoreLead(
  values: Record<string, string | boolean>,
  rules: LeadScoreRule[],
  thresholds: LeadScoreThresholds = DEFAULT_LEAD_THRESHOLDS,
): LeadScoreResult {
  let score = 0;
  const reasons: string[] = [];

  for (const rule of rules) {
    if (ruleFires(rule, values)) {
      score += rule.weight;
      reasons.push(rule.reason ?? defaultReason(rule));
    }
  }

  // Clamp to a non-negative floor so penalties can't produce a confusing
  // negative score in the UI; bucketing still keeps anything below `warm` Cold.
  score = Math.max(0, score);

  const bucket: LeadBucket =
    score >= thresholds.hot ? 'Hot' : score >= thresholds.warm ? 'Warm' : 'Cold';

  return { bucket, score, reasons };
}

/* ------------------------------------------------------------------ */
/* Real-estate default rule set (Andrew's buyer funnel, EV-05)        */
/* Weighted matchers grounded in buyer-readiness signals. A maxed-out  */
/* lead (pre-approved + ASAP + working with a realtor + healthy        */
/* budget + specific location) lands comfortably in Hot.              */
/* ------------------------------------------------------------------ */

/**
 * Default real-estate buyer-funnel rules. Tuned so:
 *  - Pre-approved + ASAP alone (=55) sits just under Hot, nudged over by any
 *    additional readiness signal (realtor / budget / location).
 *  - A browser with no financing and a "Just looking" timeline stays Cold.
 */
export const REAL_ESTATE_LEAD_RULES: LeadScoreRule[] = [
  // Financing readiness - the strongest buyer signal.
  {
    field: 'lenderStatus',
    value: 'Pre-approved',
    weight: 30,
    reason: 'Pre-approved with a lender (+30)',
  },
  { field: 'lenderStatus', value: 'Pre-qualified', weight: 18, reason: 'Pre-qualified (+18)' },
  {
    field: 'lenderStatus',
    value: 'Needs a lender',
    weight: 5,
    reason: 'Open to a lender intro (+5)',
  },

  // Timeline - urgency to transact.
  { field: 'timeline', value: 'ASAP', weight: 25, reason: 'Ready to buy ASAP (+25)' },
  { field: 'timeline', value: '1-3 months', weight: 18, reason: 'Buying in 1-3 months (+18)' },
  { field: 'timeline', value: '3-6 months', weight: 10, reason: 'Buying in 3-6 months (+10)' },
  { field: 'timeline', value: '6-12 months', weight: 5, reason: 'Buying in 6-12 months (+5)' },

  // Representation - an active realtor relationship signals seriousness.
  {
    field: 'realtorStatus',
    value: 'Working with a realtor',
    weight: 12,
    reason: 'Working with a realtor (+12)',
  },
  { field: 'realtorStatus', value: 'Need a realtor', weight: 8, reason: 'Needs a realtor (+8)' },

  // Budget - a stated, sizable budget signals capacity.
  { field: 'budget', value: '$750k+', weight: 15, reason: 'Budget $750k+ (+15)' },
  { field: 'budget', value: '$500k-$750k', weight: 12, reason: 'Budget $500k-$750k (+12)' },
  { field: 'budget', value: '$250k-$500k', weight: 8, reason: 'Budget $250k-$500k (+8)' },
  { field: 'budget', value: 'Under $250k', weight: 4, reason: 'Budget under $250k (+4)' },

  // Specificity - a concrete location/home type means the search is real.
  { field: 'location', kind: 'filled', weight: 6, reason: 'Target location provided (+6)' },
  { field: 'homeType', kind: 'filled', weight: 4, reason: 'Home type specified (+4)' },
];

/* ------------------------------------------------------------------ */
/* EV-05 multi-step field + step config                               */
/* The 9 real-estate fields grouped into 3 steps:                     */
/* Contact / Property / Readiness. Pass FIELDS as `fields` and STEPS  */
/* as `steps` to LeadCaptureForm to render the multi-step funnel.     */
/* ------------------------------------------------------------------ */

/**
 * The 9 EV-05 fields. Typed loosely as the form's `LeadField[]` shape via a
 * structural literal so this file stays import-free of the component (keeping
 * it trivially unit-testable). The form re-exports a `LeadField` type the host
 * can use to assert assignability if desired.
 */
export const REAL_ESTATE_LEAD_FIELDS = [
  { name: 'name', label: 'Full Name', type: 'text', required: true, placeholder: 'Jane Smith' },
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com' },
  { name: 'phone', label: 'Phone', type: 'tel', required: true, placeholder: '(555) 123-4567' },
  {
    name: 'budget',
    label: 'Budget',
    type: 'select',
    required: true,
    placeholder: 'Select a range',
    options: [
      { label: 'Under $250k', value: 'Under $250k' },
      { label: '$250k-$500k', value: '$250k-$500k' },
      { label: '$500k-$750k', value: '$500k-$750k' },
      { label: '$750k+', value: '$750k+' },
    ],
  },
  {
    name: 'homeType',
    label: 'Home Type',
    type: 'select',
    required: true,
    placeholder: 'Choose a type',
    options: [
      { label: 'Single-family', value: 'Single-family' },
      { label: 'Condo', value: 'Condo' },
      { label: 'Townhouse', value: 'Townhouse' },
      { label: 'Multi-family', value: 'Multi-family' },
      { label: 'Land', value: 'Land' },
    ],
  },
  {
    name: 'location',
    label: 'Preferred Location',
    type: 'text',
    required: true,
    placeholder: 'City, neighborhood, or ZIP',
  },
  {
    name: 'lenderStatus',
    label: 'Financing Status',
    type: 'select',
    required: true,
    placeholder: 'Where are you with financing?',
    options: [
      { label: 'Pre-approved', value: 'Pre-approved' },
      { label: 'Pre-qualified', value: 'Pre-qualified' },
      { label: 'Needs a lender', value: 'Needs a lender' },
      { label: 'Paying cash', value: 'Paying cash' },
    ],
  },
  {
    name: 'realtorStatus',
    label: 'Realtor Status',
    type: 'select',
    required: true,
    placeholder: 'Are you working with an agent?',
    options: [
      { label: 'Working with a realtor', value: 'Working with a realtor' },
      { label: 'Need a realtor', value: 'Need a realtor' },
      { label: 'Just browsing', value: 'Just browsing' },
    ],
  },
  {
    name: 'timeline',
    label: 'Buying Timeline',
    type: 'select',
    required: true,
    placeholder: 'When are you looking to buy?',
    options: [
      { label: 'ASAP', value: 'ASAP' },
      { label: '1-3 months', value: '1-3 months' },
      { label: '3-6 months', value: '3-6 months' },
      { label: '6-12 months', value: '6-12 months' },
      { label: 'Just looking', value: 'Just looking' },
    ],
  },
] as const;

/**
 * The 3-step grouping for the EV-05 funnel. Pass directly to
 * `LeadCaptureForm`'s `steps` prop. Field names match
 * `REAL_ESTATE_LEAD_FIELDS` exactly.
 */
export const REAL_ESTATE_LEAD_STEPS: { title: string; fields: string[] }[] = [
  { title: 'Contact', fields: ['name', 'email', 'phone'] },
  { title: 'Property', fields: ['budget', 'homeType', 'location'] },
  { title: 'Readiness', fields: ['lenderStatus', 'realtorStatus', 'timeline'] },
];

/* ------------------------------------------------------------------ */
/* Host wiring example (submit -> scoreLead -> RecordsTable row)      */
/* ------------------------------------------------------------------ */

/**
 * Reference for how a HOST wires the form's submit into `scoreLead` and a leads
 * list / `RecordsTable`. The form never scores itself; the host owns scoring,
 * persistence, and any per-user display filtering.
 *
 * NOTE on privacy: filtering rows by `owner` in the UI is DISPLAY ONLY and is
 * NOT access control. Real per-user privacy requires gateway row scoping: the
 * owner turns on Private per-user data in the Publish menu, or asks Taskade
 * EVE. Never present client-side filtering as security.
 *
 * @example
 * import { scoreLead, REAL_ESTATE_LEAD_RULES, REAL_ESTATE_LEAD_FIELDS, REAL_ESTATE_LEAD_STEPS } from './scoreLead';
 *
 * function handleSubmit(values: Record<string, string | boolean>) {
 *   const { bucket, score, reasons } = scoreLead(values, REAL_ESTATE_LEAD_RULES);
 *   // Persist to your leads list however you like (saveNode / mutation / etc.).
 *   const row = {
 *     id: crypto.randomUUID(),
 *     name: String(values.name ?? ''),
 *     email: String(values.email ?? ''),
 *     budget: String(values.budget ?? ''),
 *     timeline: String(values.timeline ?? ''),
 *     score,
 *     status: bucket, // RecordsTable colors this via its statusField/statusColors
 *   };
 *   return saveLead(row, { reasons });
 * }
 *
 * <LeadCaptureForm
 *   fields={[...REAL_ESTATE_LEAD_FIELDS]}
 *   steps={REAL_ESTATE_LEAD_STEPS}
 *   onSubmit={handleSubmit}
 * />
 *
 * // Then render the saved rows. Map bucket -> a RecordsTable StatusBucket:
 * <RecordsTable
 *   rows={leads}
 *   columns={[ ... , { key: 'score', header: 'Score', align: 'right' }, { key: 'status', header: 'Lead' } ]}
 *   statusField="status"
 *   statusColors={{ Hot: 'danger', Warm: 'warning', Cold: 'neutral' }}
 * />
 */
export const SCORE_LEAD_WIRING =
  'see JSDoc above for the submit -> scoreLead -> RecordsTable example';
