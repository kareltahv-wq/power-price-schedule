'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type Trend = 'up' | 'down';

export interface MetricCardData {
  label: string;
  value: string | number;
  change?: string;
  trend?: Trend;
  icon?: LucideIcon;
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Literal chart-text classes. Every value must appear verbatim in source so the
 * Tailwind JIT content scan (`.tsx` only) emits them - `text-chart-${n}` would
 * resolve to nothing in a built app.
 */
const CHART_TEXT = {
  1: 'text-chart-1',
  2: 'text-chart-2',
  3: 'text-chart-3',
  4: 'text-chart-4',
  5: 'text-chart-5',
} as const;

export function MetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  colorIndex = 1,
}: MetricCardData) {
  const TrendIcon = trend === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <motion.div
      data-genesis-block="metric-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="bg-card text-card-foreground">
        <CardContent className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-sm font-medium">{label}</span>
            <span className="text-foreground text-2xl font-semibold tabular-nums">{value}</span>
            {change ? (
              <Badge variant={trend === 'down' ? 'destructive' : 'default'} className="mt-1">
                {trend ? <TrendIcon aria-hidden /> : null}
                {change}
              </Badge>
            ) : null}
          </div>
          {Icon ? (
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Icon className={cn('size-5', CHART_TEXT[colorIndex])} aria-hidden />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
