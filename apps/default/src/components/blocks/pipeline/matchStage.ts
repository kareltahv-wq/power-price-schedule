import type { PipelineStage } from './PipelineBoard';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns a function that maps a card's `stageId` to the id of the stage it
 * belongs to. An exact stage id always wins. Otherwise the value matches a stage
 * id, then a stage label, without case or outer spaces. So a Select read as its
 * label ("Won") lands in a stage keyed by its option id (`s-won`, label "Won").
 * A value that matches no stage comes back unchanged.
 */
export function createStageMatcher(stages: PipelineStage[]): (stageId: string) => string {
  const ids = new Set(stages.map((stage) => stage.id));
  const byKey = new Map<string, string>();
  for (const stage of stages) {
    const key = normalize(stage.id);
    if (!byKey.has(key)) {
      byKey.set(key, stage.id);
    }
  }
  for (const stage of stages) {
    const key = normalize(stage.label);
    if (!byKey.has(key)) {
      byKey.set(key, stage.id);
    }
  }
  return (stageId) => {
    // Hand-built cards can carry a runtime number; an object key reads it as text.
    const value = String(stageId);
    if (ids.has(value)) {
      return value;
    }
    const key = normalize(value);
    return key.length > 0 ? (byKey.get(key) ?? value) : value;
  };
}
