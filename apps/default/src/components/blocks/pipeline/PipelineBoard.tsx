'use client';

import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { createStageMatcher } from './matchStage';

/** A column in the board. The enum order IS the workflow order. */
export interface PipelineStage {
  /** Also the value written to the host's status field. */
  id: string;
  label: string;
  /** Chart-token ramp index for the column header accent + count chip. */
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

/** A record rendered as a draggable card within a column. */
export interface PipelineCard {
  id: string;
  title: string;
  subtitle?: string;
  /** Which column the card currently sits in (= a `PipelineStage.id`). */
  stageId: string;
  /** Optional small fields shown on the card body. */
  meta?: { label: string; value: string }[];
}

/** Emitted after a drag completes (or a fallback move). */
export interface PipelineMoveEvent {
  cardId: string;
  fromStageId: string;
  toStageId: string;
  toIndex: number;
}

export interface PipelineBoardProps {
  stages: PipelineStage[];
  /** DATA IN - grouped by `stageId` internally. Never fetched here. */
  cards: PipelineCard[];
  /**
   * Fired after a drag completes. Host persists, e.g.
   * `updateNode(projectId, cardId, { [statusField]: toStageId })`.
   */
  onMove?: (event: PipelineMoveEvent) => void;
  /**
   * Optional opt-in stage-transition automation. Host wires, e.g.
   * `runFlow(flowId, { nodeId, from, to })`.
   */
  onStageChange?: (event: PipelineMoveEvent) => void;
  title?: string;
  className?: string;
}

/**
 * Literal chart-background classes for the column header accent bar. Every value
 * must appear verbatim in source so the Tailwind JIT content scan (`.tsx` only)
 * emits them - `bg-chart-${n}` would resolve to nothing in a built app.
 */
const STAGE_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
} as const;

/**
 * Literal chart-text classes for the column title accent. Every value must
 * appear verbatim in source (see `STAGE_BG`).
 */
const STAGE_TEXT = {
  1: 'text-chart-1',
  2: 'text-chart-2',
  3: 'text-chart-3',
  4: 'text-chart-4',
  5: 'text-chart-5',
} as const;

/**
 * Groups cards by the stage that `matchStage` gives their `stageId` (an exact id,
 * else a stage id or label without case), preserving input order within each stage.
 */
function groupByStage(
  stages: PipelineStage[],
  cards: PipelineCard[],
  matchStage: (stageId: string) => string,
): Record<string, PipelineCard[]> {
  const groups: Record<string, PipelineCard[]> = {};
  for (const stage of stages) {
    groups[stage.id] = [];
  }
  for (const card of cards) {
    (groups[matchStage(card.stageId)] ??= []).push(card);
  }
  return groups;
}

export function PipelineBoard({
  stages,
  cards,
  onMove,
  onStageChange,
  title = 'Deal Pipeline',
  className,
}: PipelineBoardProps) {
  // Local, optimistic ordering so a drag feels instant before the host persists.
  const [items, setItems] = React.useState<PipelineCard[]>(cards);

  // Re-sync when the host supplies a new card set (e.g. after a refetch).
  React.useEffect(() => {
    setItems(cards);
  }, [cards]);

  const matchStage = React.useMemo(() => createStageMatcher(stages), [stages]);
  const grouped = React.useMemo(
    () => groupByStage(stages, items, matchStage),
    [stages, items, matchStage],
  );

  const handleDragEnd = React.useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      // Dropped outside any column, or a true no-op.
      if (!destination) {
        return;
      }
      if (destination.droppableId === source.droppableId && destination.index === source.index) {
        return;
      }

      const fromStageId = source.droppableId;
      const toStageId = destination.droppableId;
      const toIndex = destination.index;

      setItems((prev) => {
        const next = [...prev];
        const movingIndex = next.findIndex((c) => c.id === draggableId);
        if (movingIndex === -1) {
          return prev;
        }
        const [moving] = next.splice(movingIndex, 1);
        const updated: PipelineCard = { ...moving, stageId: toStageId };

        // Reinsert relative to the destination column's existing members so the
        // drop index maps back to a position in the flat list.
        const destMembers = next.filter((c) => matchStage(c.stageId) === toStageId);
        const anchor = destMembers[toIndex];
        const insertAt = anchor !== undefined ? next.indexOf(anchor) : next.length;
        next.splice(insertAt, 0, updated);
        return next;
      });

      const event: PipelineMoveEvent = {
        cardId: draggableId,
        fromStageId,
        toStageId,
        toIndex,
      };
      onMove?.(event);
      if (fromStageId !== toStageId) {
        onStageChange?.(event);
      }
    },
    [matchStage, onMove, onStageChange],
  );

  return (
    <div data-genesis-block="pipeline-board" className={cn('flex flex-col gap-4', className)}>
      <div className="bg-accent text-accent-foreground flex flex-col gap-1 rounded-xl px-6 py-5">
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <ScrollArea className="w-full">
          <div className="flex items-start gap-4 pb-4">
            {stages.map((stage) => {
              const colorIndex = stage.colorIndex ?? 1;
              const stageCards = grouped[stage.id] ?? [];
              return (
                <div
                  key={stage.id}
                  className="bg-muted/50 flex w-72 shrink-0 flex-col gap-3 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 px-1">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', STAGE_BG[colorIndex])}
                      aria-hidden
                    />
                    <span className="text-foreground text-sm font-semibold">{stage.label}</span>
                    <Badge
                      variant="secondary"
                      className={cn('ml-auto tabular-nums', STAGE_TEXT[colorIndex])}
                    >
                      {stageCards.length}
                    </Badge>
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'flex min-h-24 flex-col gap-2 rounded-lg transition-colors',
                          snapshot.isDraggingOver && 'bg-accent ring-ring ring-2',
                        )}
                      >
                        {stageCards.length === 0 && !snapshot.isDraggingOver ? (
                          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
                            No items
                          </p>
                        ) : null}

                        {stageCards.map((card, index) => (
                          <Draggable key={card.id} draggableId={card.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                data-genesis-row
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                              >
                                <Card
                                  className={cn(
                                    'bg-card text-card-foreground gap-2 py-3 shadow-sm transition-shadow',
                                    dragSnapshot.isDragging && 'ring-ring shadow-md ring-2',
                                  )}
                                >
                                  <CardHeader className="px-3">
                                    <CardTitle className="text-sm font-medium">
                                      {card.title}
                                    </CardTitle>
                                    {card.subtitle ? (
                                      <p className="text-muted-foreground text-xs">
                                        {card.subtitle}
                                      </p>
                                    ) : null}
                                  </CardHeader>
                                  {card.meta && card.meta.length > 0 ? (
                                    <CardContent className="flex flex-col gap-1 px-3">
                                      {card.meta.map((field) => (
                                        <div
                                          key={field.label}
                                          className="flex items-baseline justify-between gap-2 text-xs"
                                        >
                                          <span className="text-muted-foreground">
                                            {field.label}
                                          </span>
                                          <span className="text-foreground tabular-nums">
                                            {field.value}
                                          </span>
                                        </div>
                                      ))}
                                    </CardContent>
                                  ) : null}
                                </Card>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </DragDropContext>
    </div>
  );
}

/**
 * ICP-grounded default stages - the small-business sales deal pipeline
 * (Morcan / RevOS). The enum order IS the workflow order; `colorIndex` cycles
 * over the chart-token ramp.
 */
export const DEAL_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'new', label: 'New Lead', colorIndex: 1 },
  { id: 'contacted', label: 'Contacted', colorIndex: 2 },
  { id: 'proposal', label: 'Proposal Sent', colorIndex: 3 },
  { id: 'negotiation', label: 'Negotiation', colorIndex: 4 },
  { id: 'won', label: 'Closed Won', colorIndex: 5 },
  { id: 'lost', label: 'Closed Lost', colorIndex: 1 },
];

/** ICP-grounded default cards matching `DEAL_PIPELINE_STAGES`. */
export const DEAL_PIPELINE_CARDS: PipelineCard[] = [
  {
    id: 'deal-1',
    title: 'Website inquiry - Acme Co',
    subtitle: 'Acme Co',
    stageId: 'new',
    meta: [
      { label: 'Value', value: '$12,000' },
      { label: 'Owner', value: 'Roger' },
      { label: 'Last touch', value: 'Today' },
    ],
  },
  {
    id: 'deal-2',
    title: 'Demo follow-up - Bright Ltd',
    subtitle: 'Bright Ltd',
    stageId: 'contacted',
    meta: [
      { label: 'Value', value: '$8,500' },
      { label: 'Owner', value: 'Roger' },
      { label: 'Last touch', value: '2d ago' },
    ],
  },
  {
    id: 'deal-3',
    title: 'Q3 renewal - Harborline',
    subtitle: 'Harborline',
    stageId: 'proposal',
    meta: [
      { label: 'Value', value: '$24,000' },
      { label: 'Owner', value: 'Sam' },
      { label: 'Last touch', value: 'Yesterday' },
    ],
  },
  {
    id: 'deal-4',
    title: 'Enterprise - Northwind',
    subtitle: 'Northwind',
    stageId: 'negotiation',
    meta: [
      { label: 'Value', value: '$50,000' },
      { label: 'Owner', value: 'Roger' },
      { label: 'Last touch', value: '3h ago' },
    ],
  },
  {
    id: 'deal-5',
    title: 'Signed - Delta Group',
    subtitle: 'Delta Group',
    stageId: 'won',
    meta: [
      { label: 'Value', value: '$18,000' },
      { label: 'Owner', value: 'Sam' },
      { label: 'Last touch', value: '1w ago' },
    ],
  },
];

/**
 * ICP-grounded alternate - helpdesk / support triage queue (Athens Ops). The
 * triage agent tags tickets technical/billing/sales/general with an SLA clock.
 */
export const TRIAGE_QUEUE_STAGES: PipelineStage[] = [
  { id: 'new', label: 'New', colorIndex: 1 },
  { id: 'triaged', label: 'Triaged', colorIndex: 2 },
  { id: 'in_progress', label: 'In Progress', colorIndex: 3 },
  { id: 'waiting', label: 'Waiting on Customer', colorIndex: 4 },
  { id: 'resolved', label: 'Resolved', colorIndex: 5 },
];

/** ICP-grounded default cards matching `TRIAGE_QUEUE_STAGES`. */
export const TRIAGE_QUEUE_CARDS: PipelineCard[] = [
  {
    id: 'ticket-1',
    title: 'Site is down since this morning',
    subtitle: 'Olympia Cafe',
    stageId: 'new',
    meta: [
      { label: 'Category', value: 'Technical' },
      { label: 'Priority', value: 'Urgent' },
      { label: 'SLA', value: 'Due in 2h' },
    ],
  },
  {
    id: 'ticket-2',
    title: 'Question about last invoice',
    subtitle: 'Nikos T.',
    stageId: 'triaged',
    meta: [
      { label: 'Category', value: 'Billing' },
      { label: 'Priority', value: 'Normal' },
      { label: 'SLA', value: 'Due in 1d' },
    ],
  },
  {
    id: 'ticket-3',
    title: 'Add a new team member seat',
    subtitle: 'Aegean Travel',
    stageId: 'in_progress',
    meta: [
      { label: 'Category', value: 'Sales' },
      { label: 'Priority', value: 'Normal' },
      { label: 'SLA', value: 'Due in 1d' },
    ],
  },
  {
    id: 'ticket-4',
    title: 'How do I reset my password?',
    subtitle: 'Maria K.',
    stageId: 'waiting',
    meta: [
      { label: 'Category', value: 'General' },
      { label: 'Priority', value: 'Low' },
      { label: 'SLA', value: 'Awaiting reply' },
    ],
  },
];

/**
 * ICP-grounded alternate - real-estate buyer pipeline (Andrew / Real Estate
 * Dynamics), with Hot/Warm/Cold lead scoring surfaced on the card meta.
 */
export const BUYER_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'new', label: 'New Lead', colorIndex: 1 },
  { id: 'nurturing', label: 'Nurturing', colorIndex: 2 },
  { id: 'showing', label: 'Showing Scheduled', colorIndex: 3 },
  { id: 'offer', label: 'Offer Made', colorIndex: 4 },
  { id: 'under_contract', label: 'Under Contract', colorIndex: 5 },
  { id: 'closed', label: 'Closed', colorIndex: 1 },
];

/** ICP-grounded default cards matching `BUYER_PIPELINE_STAGES`. */
export const BUYER_PIPELINE_CARDS: PipelineCard[] = [
  {
    id: 'buyer-1',
    title: 'Greg Allen',
    subtitle: 'San Diego - North County',
    stageId: 'new',
    meta: [
      { label: 'Budget', value: '$750,000' },
      { label: 'Score', value: 'Hot' },
      { label: 'Agent', value: 'Andrew' },
    ],
  },
  {
    id: 'buyer-2',
    title: 'Priya Nair',
    subtitle: 'Downtown condos',
    stageId: 'nurturing',
    meta: [
      { label: 'Budget', value: '$480,000' },
      { label: 'Score', value: 'Warm' },
      { label: 'Agent', value: 'Andres C.' },
    ],
  },
  {
    id: 'buyer-3',
    title: 'Dana Cole',
    subtitle: 'Carmel Valley',
    stageId: 'showing',
    meta: [
      { label: 'Budget', value: '$1,100,000' },
      { label: 'Score', value: 'Hot' },
      { label: 'Agent', value: 'Andrew' },
    ],
  },
  {
    id: 'buyer-4',
    title: 'The Okafors',
    subtitle: 'Chula Vista new builds',
    stageId: 'under_contract',
    meta: [
      { label: 'Budget', value: '$690,000' },
      { label: 'Score', value: 'Hot' },
      { label: 'Agent', value: 'Andrew' },
    ],
  },
];
