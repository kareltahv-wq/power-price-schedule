/**
 * Subpath entry for this block. It re-exports exactly what `@/components/blocks`
 * exports for the block. Prefer the barrel import: `@/components/blocks`.
 */
export {
  PipelineBoard,
  DEAL_PIPELINE_STAGES,
  DEAL_PIPELINE_CARDS,
  TRIAGE_QUEUE_STAGES,
  TRIAGE_QUEUE_CARDS,
  BUYER_PIPELINE_STAGES,
  BUYER_PIPELINE_CARDS,
} from './PipelineBoard';
export type {
  PipelineStage,
  PipelineCard,
  PipelineMoveEvent,
  PipelineBoardProps,
} from './PipelineBoard';

export { nodesToCards, toStages } from './fromNodes';
export type { PipelineConfig } from './fromNodes';
