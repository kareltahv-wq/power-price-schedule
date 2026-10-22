/**
 * Subpath entry for this block. It re-exports exactly what `@/components/blocks`
 * exports for the block. Prefer the barrel import: `@/components/blocks`.
 */
export { LeadCaptureForm, ThankYou } from './LeadCaptureForm';
export type {
  LeadFieldType,
  LeadField,
  LeadVariant,
  LeadFormStep,
  LeadCaptureFormProps,
  ThankYouProps,
} from './LeadCaptureForm';

export {
  scoreLead,
  DEFAULT_LEAD_THRESHOLDS,
  REAL_ESTATE_LEAD_RULES,
  REAL_ESTATE_LEAD_FIELDS,
  REAL_ESTATE_LEAD_STEPS,
  SCORE_LEAD_WIRING,
} from './scoreLead';
export type {
  LeadBucket,
  LeadMatchKind,
  LeadScoreRule,
  LeadScoreThresholds,
  LeadScoreResult,
} from './scoreLead';

export { nodeToLeadDefaults } from './fromNodes';
