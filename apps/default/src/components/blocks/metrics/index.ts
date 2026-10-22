/**
 * Subpath entry for this block. It re-exports exactly what `@/components/blocks`
 * exports for the block. Prefer the barrel import: `@/components/blocks`.
 */
export { MetricsDashboard } from './MetricsDashboard';
export type { MetricsDashboardProps } from './MetricsDashboard';

export { MetricCard } from './MetricCard';
export type { MetricCardData, Trend } from './MetricCard';

export { GoalBar } from './GoalBar';
export type { GoalBarData } from './GoalBar';

export { nodesToMetrics, nodesToGoals } from './fromNodes';
