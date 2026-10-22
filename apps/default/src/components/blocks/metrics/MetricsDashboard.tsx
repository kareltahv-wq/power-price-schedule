'use client';

import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { GoalBar, type GoalBarData } from './GoalBar';
import { MetricCard, type MetricCardData } from './MetricCard';

interface QuickStat {
  label: string;
  value: string | number;
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

interface TrendPoint {
  name: string;
  value: number;
}

export interface MetricsDashboardProps {
  title?: string;
  subtitle?: string;
  cards: MetricCardData[];
  goals?: GoalBarData[];
  quickStats?: QuickStat[];
  trend?: TrendPoint[];
  /**
   * Skeleton stat cards while the HOST fetches (the block itself never fetches).
   * Per the design styleguide: skeleton/shimmer, never a spinner or a blank panel.
   */
  loading?: boolean;
}

/**
 * Literal chart-text classes for quick-stat values. Every value must appear
 * verbatim in source so the Tailwind JIT content scan (`.tsx` only) emits them.
 */
const CHART_TEXT = {
  1: 'text-chart-1',
  2: 'text-chart-2',
  3: 'text-chart-3',
  4: 'text-chart-4',
  5: 'text-chart-5',
} as const;

const trendChartConfig = {
  value: {
    label: 'Value',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export function MetricsDashboard({
  title = 'Overview',
  subtitle,
  cards,
  goals,
  quickStats,
  trend,
  loading = false,
}: MetricsDashboardProps) {
  const hasAnyData =
    cards.length > 0 ||
    (quickStats?.length ?? 0) > 0 ||
    (trend?.length ?? 0) > 0 ||
    (goals?.length ?? 0) > 0;

  if (loading) {
    // Skeleton stat cards per the design styleguide (never a spinner/blank panel).
    return (
      <div data-genesis-block="metrics-dashboard" className="flex flex-col gap-6">
        <div className="bg-accent text-accent-foreground flex flex-col gap-1 rounded-xl px-6 py-5">
          <h2 className="text-xl font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm opacity-80">{subtitle}</p> : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={`skeleton-${index}`} className="bg-card text-card-foreground">
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!hasAnyData) {
    // Designed zero-data state (styleguide: never a blank panel).
    return (
      <div data-genesis-block="metrics-dashboard" className="flex flex-col gap-6">
        <div className="bg-accent text-accent-foreground flex flex-col gap-1 rounded-xl px-6 py-5">
          <h2 className="text-xl font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm opacity-80">{subtitle}</p> : null}
        </div>
        <Card className="bg-card text-card-foreground">
          <CardContent>
            <Empty>
              <EmptyMedia variant="icon">
                <BarChart3 aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No metrics yet</EmptyTitle>
              <EmptyDescription>Add data and your KPIs will show up here.</EmptyDescription>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-genesis-block="metrics-dashboard" className="flex flex-col gap-6">
      <div className="bg-accent text-accent-foreground flex flex-col gap-1 rounded-xl px-6 py-5">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm opacity-80">{subtitle}</p> : null}
      </div>

      {cards.length > 0 ? (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {cards.map((card, index) => (
            <motion.div key={`${card.label}-${index}`} variants={item}>
              <MetricCard {...card} />
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {quickStats && quickStats.length > 0 ? (
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {quickStats.map((stat, index) => (
              <div key={`${stat.label}-${index}`} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium">{stat.label}</span>
                <span
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    CHART_TEXT[stat.colorIndex ?? 1],
                  )}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {trend && trend.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="h-[220px] w-full">
              <AreaChart data={trend} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area
                  dataKey="value"
                  type="natural"
                  fill="var(--color-value)"
                  fillOpacity={0.2}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {goals && goals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Goals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {goals.map((goal, index) => (
              <GoalBar key={`${goal.name}-${index}`} {...goal} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
