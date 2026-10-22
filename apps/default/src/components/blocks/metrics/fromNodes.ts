/**
 * Pure adapters mapping a project's rows (`GenesisNode[]`) into block props.
 *
 * These read fields through `getFieldValue` / `getFieldNumber` (see
 * `../fieldReads.ts`) and guard numbers to 0. They do NOT fetch data - call
 * `getNodes` yourself and pass the result in. Keeping the adapters pure means
 * blocks stay presentational and these stay unit-testable.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import { fieldCell, fieldNumber, fieldText, optionalFieldText } from '../fieldReads';
import type { GoalBarData } from './GoalBar';
import type { MetricCardData } from './MetricCard';

/** Maps node field paths onto `MetricCardData` props. */
export interface MetricsConfig {
  /** Field path read for the card's `label`. */
  labelField: string;
  /** Field path read for the card's `value`. */
  valueField: string;
  /** Optional field path read for the card's `change` text. */
  changeField?: string;
  /** Optional field path whose lowercased value `down` maps to a down trend. */
  trendField?: string;
  /** Chart token applied to every produced card. */
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

/** Maps node field paths onto `GoalBarData` props. */
export interface GoalsConfig {
  /** Field path read for the goal's `name`. */
  nameField: string;
  /** Field path read (and `Number()`-coerced) for `current`. */
  currentField: string;
  /** Field path read (and `Number()`-coerced) for `target`. */
  targetField: string;
  /** Chart token applied to every produced goal. */
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

export function nodesToMetrics(nodes: GenesisNode[], config: MetricsConfig): MetricCardData[] {
  return nodes.map((node) => {
    const rawTrend = config.trendField
      ? optionalFieldText(node, config.trendField)?.toLowerCase()
      : undefined;
    return {
      label: fieldText(node, config.labelField),
      value: fieldCell(node, config.valueField),
      change: config.changeField ? optionalFieldText(node, config.changeField) : undefined,
      trend: rawTrend === 'up' || rawTrend === 'down' ? rawTrend : undefined,
      colorIndex: config.colorIndex,
    };
  });
}

export function nodesToGoals(nodes: GenesisNode[], config: GoalsConfig): GoalBarData[] {
  return nodes.map((node) => ({
    name: fieldText(node, config.nameField),
    current: fieldNumber(node, config.currentField),
    target: fieldNumber(node, config.targetField),
    colorIndex: config.colorIndex,
  }));
}
