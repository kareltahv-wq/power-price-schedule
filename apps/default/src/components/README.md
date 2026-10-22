# Components map

Three directories, three roles. Hand-author the app's surfaces by composing
`ui/` primitives with Tailwind; that is the default. Blocks are optional
plumbing.

| Dir | What | Rule |
|---|---|---|
| `ui/` | 50+ shadcn primitives (button, card, table, tabs, dialog, sheet, sidebar, select, form, chart, command, calendar, carousel, skeleton, empty, spinner, sonner, ...) | Import as-is. NEVER edit, regenerate, or restyle these files. Theme via the `src/index.css` CSS variables; wrap in your own component when you need variants. |
| `ai-elements/` | Pre-built chat UI (Conversation, Message, PromptInput, Suggestion, Tool, Confirmation, Reasoning, CodeBlock, Shimmer, ...) | Use for any chat surface instead of hand-rolling. Docs: `src/lib/agent-chat/v2/README.md`. |
| `blocks/` | Optional pre-composed accelerators (FloatingAgentChat, LeadCaptureForm, RecordsTable, PipelineBoard, ...) | Commodity plumbing only, never the primary surface. Props in, callbacks out, no fetching. Reference: `blocks/README.md`. |

## How to decide

1. Check `ui/` first - a primitive probably exists. Compose it with Tailwind
   utility classes and the semantic tokens (`bg-card`, `text-muted-foreground`,
   `bg-primary`, ...). This is where the app's visual identity comes from.
2. Chat surface? Use `ai-elements/` + the Agent Chat SDK v2, or render
   `<FloatingAgentChat />` from `@/components/blocks` for the standard floating
   chat (`import { FloatingAgentChat } from '@/components/blocks';`).
3. A block fits exactly (intake form submit, agent chat)? Use it via
   `@/components/blocks`, pass data as props, never edit the block file.
4. Everything else: write your own component under `src/components/` using
   `ui/` primitives. Explicit Props interface, `cn()` from `@/lib/utils` for
   conditional classes, semantic tokens only.

More: `docs/README.md` (index), `docs/02_theming.md` (tokens),
`docs/01_data_layer.md` (fetching data to feed components).
