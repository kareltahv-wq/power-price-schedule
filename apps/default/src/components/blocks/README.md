# Blocks (optional plumbing - hand-author primary surfaces)

Blocks are OPTIONAL commodity accelerators, not the app's identity. The app's
visual identity is hand-authored: Tailwind + Radix + `@/components/ui/*`
primitives, styled through the `src/index.css` tokens. Reach for a block only
for commodity plumbing (agent chat wiring, a lead-capture submit), never for
the dashboard or any primary surface users see first. When in doubt,
hand-author.

All blocks are presentational and props-driven: data in via props, events out
via callbacks. They never fetch (one sanctioned exception: `FloatingAgentChat`
delegates all network to `@/lib/agent-chat/v2`). Import from
`@/components/blocks` (the barrel). Each block folder also has an `index.ts`
with the same names, so `@/components/blocks/agent-chat` resolves too.

## Rules (when a block IS used)

1. Never fork or edit a block file. Blocks re-theme through the CSS variables
   in `src/index.css` (including `--chart-1` ... `--chart-5`).
2. Fetch in the page or a hook, pass results in as props. No `getNodes` inside
   a block.
3. Chart/accent classes stay literal (`bg-chart-1` ... `bg-chart-5`). The
   Tailwind JIT scan only sees verbatim class strings in `.tsx` source; a
   computed `` `bg-chart-${n}` `` resolves to nothing in a built app. Map an
   index to a literal via a `Record` with all five values present in source.
4. Semantic tokens only (`bg-card`, `text-muted-foreground`, `bg-primary`,
   ...). Zero literal palette classes (`bg-blue-500`), zero raw hex/rgb/hsl.

## Block reference

`colorIndex` is always `1 | 2 | 3 | 4 | 5` (chart-token ramp). `className`
passes through everywhere it is listed.

### FloatingAgentChat

Complete floating agent chat: launcher, mobile-responsive panel, Agent Chat SDK
v2 wiring, error/retry state, hosted-iframe fallback. The default way to
satisfy the mandatory agent interface. Renders nothing when both ids are absent.

The defaults come from the agent's public profile (`getAgentProfile`), so the
block matches the hosted `/a/` page and the website widget with no props. Every
prop below wins over the profile.

| Prop | Type | Req | Default |
|---|---|---|---|
| `agentId` | `string` | no | - (SpaceAgent id from the `manage_agent` result; drives the SDK. NOT the `/a/...` id) |
| `publicAgentId` | `string` | no | - (trailing segment of the `/a/...` URL; drives the hosted fallback) |
| `title` | `string` | no | the agent's custom header title, then its name, then `'Assistant'` |
| `accent` | `1-5` | no | - (chart-token launcher color, wins over every hex color) |
| `accentColor` | `string` (hex) | no | the agent's Customize color, then `bg-primary` |
| `suggestions` | `readonly (string \| { text, prompt })[]` | no | the agent's starters (none when the owner hid them), then panel defaults |
| `placeholder` | `string` | no | the agent's input placeholder |
| `emptyDescription` | `string` | no | the agent's welcome message |
| `footerText` | `string` | no | the agent's footer text (small line under the composer) |
| `notice` | `string` | no | the agent's notice (dismissable banner above the chat) |
| `labels` | `Partial<FloatingAgentChatLabels>` | no | English machinery strings (close, retry, connecting, tool status) |
| `position` | `'bottom-right' \| 'bottom-left'` | no | `'bottom-right'` (corner of the launcher and the desktop panel) |
| `defaultOpen` | `boolean` | no | `false` |
| `className` | `string` | no | - (added to the open panel) |

The launcher shows the chat button emoji the owner picked in the Customize tab.
With no emoji, it shows a chat icon.

The open panel has one header: the agent's avatar (its emoji or image, else a
sparkles glyph), the title and a close button. Do not wrap the block in a
header or a card of your own.

To keep the block off checkout and pricing routes, hide it there:
`<div hidden={/^\/(checkout|pricing)(\/|$)/.test(pathname)}><FloatingAgentChat ... /></div>`.
Never leave it out of the JSX: an unmount drops an open conversation. The
`(\/|$)` ends the match at the segment, so `/checkout-faq` keeps its chat.
Read `pathname` with `useLocation()` in a small component inside
`<BrowserRouter>`, never in `App` itself: `App` renders the router, so the hook
throws there.

```tsx
<FloatingAgentChat agentId={AGENT_ID} publicAgentId={PUBLIC_AGENT_ID} />
```

### AIAssistantPanel

Chat panel UI only; the host owns `useChat` (see `docs/04_agent_chat.md`).
Renders all message parts including inline approval buttons. Tool calls show a
plain "Working on it..." status while they run and nothing once they finish
successfully - never the tool's name, input, or output (this is an end-user
surface). The exceptional terminal states keep a short plain-language row:
"Something went wrong" (`output-error`) and "Skipped" (`output-denied`).

| Prop | Type | Req | Default |
|---|---|---|---|
| `messages` | `UIMessage[]` | yes | - |
| `onSend` | `(text: string) => void \| Promise<void>` | yes | - |
| `busy` | `boolean` | no | `false` |
| `status` | `ChatStatus` | no | - (drives submit spinner/stop) |
| `onStop` | `() => void` | no | - |
| `onApprove` | `(id: string, approved: boolean) => void` | no | - (`id` = `part.approval.id`, NOT `toolCallId`) |
| `suggestions` | `readonly string[]` | no | `DEFAULT_ASSISTANT_SUGGESTIONS` |
| `title`, `placeholder`, `emptyTitle`, `emptyDescription`, `className` | `string` | no | - |
| `hideHeader` | `boolean` | no | `false` (set it only when your own header wraps the panel, so the chat shows one header) |
| `emptyStateAlign` | `'start' \| 'end'` | no | `'start'` (`'end'` puts the greeting just above the starter chips, for a compact panel) |

```tsx
const { messages, status, stop, addToolApprovalResponse } = useChat({ chat, id: chat.id });
<AIAssistantPanel
  messages={messages}
  onSend={(text) => chat.sendMessage({ id: ulid(), role: 'user', parts: [{ type: 'text', text }] })}
  busy={status === 'submitted' || status === 'streaming'}
  status={status}
  onApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
/>
```

### RecordsTable

Sortable, searchable, filterable data table with status badges, skeleton
loading, and a designed empty state.

| Prop | Type | Req | Default |
|---|---|---|---|
| `rows` | `RecordRow[]` (`{ id: string; [key]: string \| number }`) | yes | - |
| `columns` | `RecordsTableColumn[]` (`{ key, header, sortable?, align?, render? }`) | yes | - |
| `statusField` | `string` | no | - (column rendered as a status `Badge`) |
| `statusColors` | `Record<string, StatusBucket>` | no | keyword heuristic |
| `searchable` | `boolean` | no | `true` |
| `filterField` | `string` | no | - (Select-driven exact-match filter) |
| `ownerField` + `viewerId` | `string` | no | - (display-only viewer scoping; NOT a security boundary - the full array still ships to the client; real privacy = gateway row scoping) |
| `actions` | `RecordRowAction[]` (`{ label, icon?, onSelect, variant? }`) | no | - |
| `onRowOpen` | `(row) => void` | no | - |
| `title`, `emptyText`, `emptyDescription`, `className` | `string` | no | - |
| `loading` | `boolean` | no | `false` (skeleton rows, never a spinner) |

```tsx
<RecordsTable rows={rows} columns={columns} statusField="Status" filterField="Status" />
```

### PipelineBoard

Drag-and-drop kanban columns with optimistic local ordering.

| Prop | Type | Req | Default |
|---|---|---|---|
| `stages` | `PipelineStage[]` (`{ id, label, colorIndex? }`; array order = workflow order; `id` = status value) | yes | - |
| `cards` | `PipelineCard[]` (`{ id, title, subtitle?, stageId, meta? }`) | yes | - |
| `onMove` | `(e: PipelineMoveEvent) => void` | no | - (`{ cardId, fromStageId, toStageId, toIndex }`; persist here) |
| `onStageChange` | `(e: PipelineMoveEvent) => void` | no | - (opt-in automation hook) |
| `title` | `string` | no | `'Deal Pipeline'` |

```tsx
<PipelineBoard stages={stages} cards={cards}
  onMove={(e) => updateNode(PROJECT_ID, e.cardId, { Status: e.toStageId })} />
```

### LeadCaptureForm / ThankYou

Zod-validated intake form (single-page or multi-step) with an inline success
state. Never networks; the host submits.

| Prop | Type | Req | Default |
|---|---|---|---|
| `onSubmit` | `(values: Record<string, string \| boolean>) => void \| Promise<void>` | yes | - (awaited; rejection keeps the form mounted with an error) |
| `variant` | `'lead' \| 'contact' \| 'newsletter'` | no | `'lead'` (selects default field set) |
| `fields` | `LeadField[]` (`{ name, label, type, required?, placeholder?, options? }`; type: text/email/tel/textarea/select/checkbox) | no | variant defaults |
| `steps` | `LeadFormStep[]` (`{ title, fields }`) | no | - (multi-step mode) |
| `title`, `description`, `submitLabel`, `successTitle`, `successMessage` | `string` | no | `submitLabel: 'Submit'` |
| `submitting`, `success` | `boolean` | no | - (host-forced states) |

`ThankYou`: `{ title?, message?, onReset? }` - the success state, also usable standalone.

The host persists the row itself with `createNode` - one submit, one writer. Never
also `submitForm` the same values to a flow that adds the task (duplicate rows).
Map the form's value keys onto the project's exact field names; the gateway matches
keys exactly and silently drops the ones it does not know, so forwarding `v`
unmapped writes an empty row.

```tsx
<LeadCaptureForm
  variant="lead"
  onSubmit={(v) =>
    createNode(LEADS_PROJECT_ID, {
      Name: String(v.name ?? ''),
      Email: String(v.email ?? ''),
      Status: 'New',
    })
  }
/>
```

### MetricsDashboard / MetricCard / GoalBar

KPI overview: stat cards, quick stats, an area-chart trend, and goal bars.

`MetricsDashboard` props:

| Prop | Type | Req | Default |
|---|---|---|---|
| `cards` | `MetricCardData[]` | yes | - |
| `title` / `subtitle` | `string` | no | `'Overview'` / - |
| `goals` | `GoalBarData[]` | no | - |
| `quickStats` | `{ label, value, colorIndex? }[]` | no | - |
| `trend` | `{ name, value }[]` | no | - |
| `loading` | `boolean` | no | `false` (skeleton cards) |

`MetricCard` (= `MetricCardData`): `{ label, value, change?, trend?: 'up' | 'down', icon?: LucideIcon, colorIndex? }`.
`GoalBar` (= `GoalBarData`): `{ name, current, target, colorIndex? }`.

```tsx
<MetricsDashboard cards={cards} goals={goals} trend={trend} />
```

### StatusTracker

Checklist with optional accordion grouping, progress summary, and optimistic
checkbox toggles.

| Prop | Type | Req | Default |
|---|---|---|---|
| `items` | `ChecklistItem[]` (`{ id, label, status, done?, group?, owner?, dueDate?, meta? }`) | yes | - |
| `title` | `string` | no | - |
| `groupBy` | `keyof ChecklistItem` | no | - (buckets into Accordion sections) |
| `showProgress` | `boolean` | no | `true` |
| `statusColors` | `Record<string, StatusBucket>` | no | keyword heuristic |
| `onToggle` | `(item, done: boolean) => void` | no | - (optimistic; persist here) |
| `emptyText` | `string` | no | `'Nothing to track'` |

```tsx
<StatusTracker items={items} groupBy="group"
  onToggle={(item, done) => updateNode(PROJECT_ID, item.id, { Status: done ? 'Done' : 'Open' })} />
```

### InvoiceCard

Single-invoice card; totals (subtotal, tax, total) computed in-block from
`lineItems`. Currency via `Intl.NumberFormat` (never a hardcoded `$`).

| Prop | Type | Req | Default |
|---|---|---|---|
| `invoice` | `{ id, number, status, issueDate?, dueDate?, billTo: { name, email?, address? }, lineItems: { id, description, qty, unitPrice }[], taxRate?, currency? }` | yes | - |
| `onMarkPaid` / `onSend` | `(id: string) => void` | no | - (footer buttons; hidden when omitted) |

```tsx
<InvoiceCard invoice={invoice} onMarkPaid={(id) => updateNode(PROJECT_ID, id, { Status: 'Paid' })} />
```

### PortalShell

Client/member portal frame: branded header, viewer chip, tabbed section nav, a
host-filled content slot. Does NO auth - pass the already-authenticated viewer.

| Prop | Type | Req | Default |
|---|---|---|---|
| `brand` | `{ name: string; logo?: ReactNode }` | yes | - |
| `sections` | `PortalSection[]` (`{ id, label, icon? }`) | yes | - |
| `children` | `ReactNode` | yes | - |
| `viewer` | `{ name, email?, avatarUrl? }` | no | - |
| `activeSection` | `string` | no | first section |
| `onSectionChange` | `(id: string) => void` | no | - (display-only nav when absent) |
| `onSignOut` | `() => void` | no | - |
| `showOwnerNote` | `boolean` | no | `true` |

```tsx
<PortalShell brand={{ name: 'Acme Portal' }} sections={sections} viewer={viewer}>
  <RecordsTable rows={filterByOwner(rows, 'Owner', viewer.email)} columns={columns} />
</PortalShell>
```

## Adapters: `GenesisNode[]` -> block props

Pure functions in each block's `fromNodes.ts`. They read every field through
`getFieldValue` / `getFieldNumber` and never fetch - call `getNodes` yourself
(see `docs/01_data_layer.md`). A field key can be the display name (`Stage`),
the field path (`/attributes/@stage`) or the bare `@stage`. Numeric fields are
guarded to 0 (never `NaN`). A Select reads as its label on the display name and
as its option id on the field path. To show a Select in your own page, read
`getFieldLabel(row, '@key')`: it returns the option name. `PipelineBoard` puts
a card in the stage whose id or label matches its `stageId`, without case.
`doneStatuses` is matched against the value that `statusField` reads, so list
the labels for a display name and the option ids for a field path.

| Adapter | Signature |
|---|---|
| `nodesToMetrics` | `(nodes, { labelField, valueField, changeField?, trendField?, colorIndex? }) => MetricCardData[]` |
| `nodesToGoals` | `(nodes, { nameField, currentField, targetField, colorIndex? }) => GoalBarData[]` |
| `nodesToRecords` | `(nodes, { fields, headers?, sortable?, numericFields?, statusField? }) => RecordRow[]` |
| `recordsColumns` | `(sameConfig) => RecordsTableColumn[]` (derive columns from the same config) |
| `filterByOwner` | `(rows, ownerField, viewerId) => Row[]` (display-only; all rows when viewerId is null) |
| `nodesToCards` | `(nodes, { statusField, titleField, subtitleField?, metaFields?, metaLabels? }) => PipelineCard[]` |
| `toStages` | `(stageIds, labels?) => PipelineStage[]` (colorIndex cycles 1-5) |
| `nodeToLeadDefaults` | `(node, fields) => Record<string, string \| boolean>` (prefill/edit) |
| `nodesToChecklist` | `(nodes, { labelField, statusField, groupField?, ownerField?, doneStatuses? }) => ChecklistItem[]` |
| `nodeToInvoice` | `(invoiceNode, lineItemNodes, fieldMap) => InvoiceCardProps['invoice']` |
| `scoreLead` | `(values, rules, thresholds?) => { bucket: 'Hot' \| 'Warm' \| 'Cold', score, reasons }` (pure, deterministic) |

```ts
const nodes = await getNodes(PROJECT_ID); // you fetch; adapters never do
const rows = nodesToRecords(nodes, cfg);
const columns = recordsColumns(cfg);
```

## Example presets (opt-in data, pass as props)

`SERVICE_PRO_JOB_COLUMNS/ROWS`, `ACTIVITY_LOG_COLUMNS/ROWS/STATUS_FIELD`,
`DEAL_PIPELINE_STAGES/CARDS`, `TRIAGE_QUEUE_STAGES/CARDS`,
`BUYER_PIPELINE_STAGES/CARDS`, `REAL_ESTATE_LEAD_FIELDS/STEPS/RULES`,
`DEFAULT_LEAD_THRESHOLDS`, `SCORE_LEAD_WIRING`,
`RECEIVING_CHECKLIST_ITEMS`, `ONBOARDING_CHECKLIST_ITEMS`,
`SERVICE_PRO_INVOICE`, `CLIENT_PORTAL_SECTIONS`,
`DEFAULT_ASSISTANT_SUGGESTIONS`. Never consumed implicitly by a block.

---

_Dev note: the internal EVE eval -> block coverage map lives in `.tasks/`
(dev-only, not shipped)._
