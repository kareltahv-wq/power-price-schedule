'use client';

import { cn } from '@/lib/utils';

export interface GoalBarData {
  name: string;
  current: number;
  target: number;
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Literal chart-background classes. Every value must appear verbatim in source
 * so the Tailwind JIT content scan (`.tsx` only) emits them - `bg-chart-${n}`
 * would resolve to nothing in a built app.
 */
const CHART_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
} as const;

export function GoalBar({ name, current, target, colorIndex = 1 }: GoalBarData) {
  // ui/progress.tsx hardcodes `bg-primary` with no indicatorClassName prop, so we
  // render our own track + indicator to apply a chart token to the fill.
  const pct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;

  return (
    <div data-genesis-block="goal-bar" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground text-sm font-medium">{name}</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {current} / {target}
        </span>
      </div>
      <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
        <div
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={target}
          className={cn('h-full transition-all', CHART_BG[colorIndex])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
