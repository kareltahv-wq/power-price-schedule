/**
 * Pure adapters mapping a project's rows (`GenesisNode[]`) into `PipelineBoard`
 * props. These read fields through `getFieldValue` (see `../fieldReads.ts`) - they
 * do NOT fetch data. Call `getNodes` yourself and pass the result in. Keeping the
 * adapters pure means the board stays presentational and these stay unit-testable.
 * Mirrors `metrics/fromNodes.ts`.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import { fieldText, optionalFieldText } from '../fieldReads';
import type { PipelineCard, PipelineStage } from './PipelineBoard';

/** Maps node field paths onto `PipelineCard` props. */
export interface PipelineConfig {
  /** Field key whose value identifies the card's current `stageId`. */
  statusField: string;
  /** Field key read for the card `title`. */
  titleField: string;
  /** Optional field key read for the card `subtitle`. */
  subtitleField?: string;
  /** Field keys rendered as small `{ label, value }` rows on the card. */
  metaFields?: string[];
  /** Optional per-field label overrides for `metaFields`; defaults to the key. */
  metaLabels?: Record<string, string>;
}

/**
 * Maps each node into a `PipelineCard`. Reads the `config.statusField` value as
 * `stageId`, defaulting missing values to `''`. A Select reads as its label on the
 * display-name key and as its option id on the field path. `PipelineBoard` places
 * the card in the stage whose id or label matches that value. Pure; never fetches.
 */
export function nodesToCards(nodes: GenesisNode[], config: PipelineConfig): PipelineCard[] {
  return nodes.map((node) => {
    const meta = (config.metaFields ?? [])
      .map((key) => ({
        label: config.metaLabels?.[key] ?? key,
        value: fieldText(node, key),
      }))
      .filter((entry) => entry.value !== '');

    return {
      id: node.id,
      title: fieldText(node, config.titleField),
      subtitle: config.subtitleField ? optionalFieldText(node, config.subtitleField) : undefined,
      stageId: fieldText(node, config.statusField),
      meta: meta.length > 0 ? meta : undefined,
    };
  });
}

/**
 * Derives ordered, color-cycled stages from a list of stage ids. The enum order
 * IS the workflow order. `colorIndex` cycles over the five chart tokens via
 * `(i % 5) + 1`. Optional `labels` overrides the display label per id. Pure.
 */
export function toStages(stageIds: string[], labels?: Record<string, string>): PipelineStage[] {
  return stageIds.map((id, i) => ({
    id,
    label: labels?.[id] ?? id,
    colorIndex: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
  }));
}
