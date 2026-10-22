/**
 * Blocks - presentational, props-driven building blocks composed from
 * `@/components/ui/*` + bundled deps. See ./README.md for the re-token contract.
 */
export { MetricsDashboard } from './metrics/MetricsDashboard';
export type { MetricsDashboardProps } from './metrics/MetricsDashboard';

export { MetricCard } from './metrics/MetricCard';
export type { MetricCardData, Trend } from './metrics/MetricCard';

export { GoalBar } from './metrics/GoalBar';
export type { GoalBarData } from './metrics/GoalBar';

export { nodesToMetrics, nodesToGoals } from './metrics/fromNodes';

export {
  RecordsTable,
  SERVICE_PRO_JOB_COLUMNS,
  SERVICE_PRO_JOB_ROWS,
} from './records/RecordsTable';
export type {
  RecordRow,
  RecordsTableColumn,
  RecordRowAction,
  RecordsTableProps,
  StatusBucket,
} from './records/RecordsTable';

export { nodesToRecords, recordsColumns } from './records/fromNodes';
export type { RecordsConfig } from './records/fromNodes';

export {
  filterByOwner,
  ACTIVITY_LOG_COLUMNS,
  ACTIVITY_LOG_STATUS_FIELD,
  ACTIVITY_LOG_ROWS,
} from './records/fromNodes';

export {
  PipelineBoard,
  DEAL_PIPELINE_STAGES,
  DEAL_PIPELINE_CARDS,
  TRIAGE_QUEUE_STAGES,
  TRIAGE_QUEUE_CARDS,
  BUYER_PIPELINE_STAGES,
  BUYER_PIPELINE_CARDS,
} from './pipeline/PipelineBoard';
export type {
  PipelineStage,
  PipelineCard,
  PipelineMoveEvent,
  PipelineBoardProps,
} from './pipeline/PipelineBoard';

export { nodesToCards, toStages } from './pipeline/fromNodes';
export type { PipelineConfig } from './pipeline/fromNodes';

export { LeadCaptureForm, ThankYou } from './lead-capture/LeadCaptureForm';
export type {
  LeadFieldType,
  LeadField,
  LeadVariant,
  LeadFormStep,
  LeadCaptureFormProps,
  ThankYouProps,
} from './lead-capture/LeadCaptureForm';

export {
  scoreLead,
  DEFAULT_LEAD_THRESHOLDS,
  REAL_ESTATE_LEAD_RULES,
  REAL_ESTATE_LEAD_FIELDS,
  REAL_ESTATE_LEAD_STEPS,
  SCORE_LEAD_WIRING,
} from './lead-capture/scoreLead';
export type {
  LeadBucket,
  LeadMatchKind,
  LeadScoreRule,
  LeadScoreThresholds,
  LeadScoreResult,
} from './lead-capture/scoreLead';

export { nodeToLeadDefaults } from './lead-capture/fromNodes';

export {
  AIAssistantPanel,
  DEFAULT_ASSISTANT_SUGGESTIONS,
  DEFAULT_ASSISTANT_LABELS,
} from './ai-assistant/AIAssistantPanel';
export type { AIAssistantPanelProps, AIAssistantLabels } from './ai-assistant/AIAssistantPanel';

export { FloatingAgentChat } from './agent-chat/FloatingAgentChat';
export type {
  FloatingAgentChatProps,
  FloatingAgentChatLabels,
} from './agent-chat/FloatingAgentChat';

export { StatusTracker } from './status/StatusTracker';
// `StatusBucket` is already re-exported above from records/RecordsTable (the
// status block copies the identical semantic-bucket Record), so it is omitted
// here to avoid a duplicate-identifier conflict in the barrel.
export type { StatusTrackerProps, ChecklistItem } from './status/StatusTracker';

export {
  nodesToChecklist,
  RECEIVING_CHECKLIST_ITEMS,
  ONBOARDING_CHECKLIST_ITEMS,
} from './status/fromNodes';
export type { ChecklistConfig } from './status/fromNodes';

export { InvoiceCard } from './invoice/InvoiceCard';
// `StatusBucket` is a private local type inside InvoiceCard (semantic status
// buckets paid/unpaid/overdue) and is intentionally NOT exported, so it does
// not collide with the `StatusBucket` already re-exported from records/RecordsTable.
export type { InvoiceCardProps, InvoiceLineItem } from './invoice/InvoiceCard';

export { nodeToInvoice, SERVICE_PRO_INVOICE } from './invoice/fromNodes';
export type { InvoiceFieldMap } from './invoice/fromNodes';

export { PortalShell, CLIENT_PORTAL_SECTIONS } from './portal/PortalShell';
export type { PortalShellProps, PortalSection } from './portal/PortalShell';
