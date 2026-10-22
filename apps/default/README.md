# Genesis Base Template v2

React 18 + TypeScript + Tailwind CSS 3 + Radix. Every Genesis app starts from
this tree. Work only in `src/` (plus top-level `public/` for static files);
start at `src/App.tsx`; import via `@/`.

## Tree

```
src/
├── App.tsx              # Router shell (routes + layout only; add pages, don't grow this)
├── pages/               # One file per route - HomePage.tsx ships as the pattern
├── main.tsx             # Fixed entry: GenesisRoot error boundary + ThemeProvider (do not modify)
├── index.css            # Tailwind + CSS variable tokens (the theming surface)
├── components/
│   ├── ui/              # 50+ shadcn primitives - import as-is, never edit
│   ├── ai-elements/     # Pre-built chat UI (Conversation, Message, PromptInput, ...)
│   ├── blocks/          # Optional accelerators (FloatingAgentChat, LeadCaptureForm, ...)
│   └── README.md        # Components map + how to decide
├── hooks/               # use-theme, use-mobile, use-toast
└── lib/
    ├── utils.ts             # cn()
    ├── genesis-data/        # getNodes/createNode/updateNode/deleteNode (project rows)
    ├── genesis-flows/       # submitForm/runFlow (trigger automations)
    ├── genesis-gateway.ts   # shared fetch helper for /api/taskade/*
    ├── agent-chat/v2/       # Agent Chat SDK (createConversation + createAgentChat + useChat)
    ├── genesis-auth.tsx     # <GenesisAuth> OIDC wrapper (end-user login), signUpToApp() + "Sign in to continue" screen
    ├── gateway-auth.tsx     # forwards the signed-in user's id_token to the gateway; raises the sign-in gate on a 401
    ├── createPersistentStore.ts  # zustand + localStorage persistence
    ├── leaflet-setup.ts     # import from map surfaces for CSS + marker icons
    └── theme-bridge.ts      # live theme overrides from the Taskade editor
docs/                    # Focused chapters - see docs/README.md
AGENTS.md                # Agent quick contract (read first)
```

## The four layers of a Genesis app

| Layer | Where | How the app touches it |
|---|---|---|
| Data | Taskade projects | `@/lib/genesis-data` gateway hooks - `docs/01_data_layer.md` |
| Intelligence | Taskade agents | `<FloatingAgentChat />` or SDK v2 - `docs/04_agent_chat.md` |
| Automation | Taskade flows | `submitForm` / `runFlow` - `docs/01_data_layer.md` |
| UI | this template | hand-authored Tailwind + `ui/` primitives - `src/components/README.md` |

## Essentials

- **Theming**: semantic tokens (`bg-background`, `bg-card`, `bg-primary`, ...)
  defined as CSS variables in `src/index.css`; dark mode flips via the `.dark`
  class. ThemeProvider is pre-mounted. `docs/02_theming.md`.
- **Routing**: `react-router-dom` v7, `BrowserRouter`. `docs/03_routing_pages.md`.
- **State**: zustand (or `createPersistentStore` for localStorage persistence).
- **Maps**: import `@/lib/leaflet-setup` from each map surface that uses
  `react-leaflet`; normal apps leave Leaflet out of their startup bundle.
- **Third-party APIs with keys**: `GenesisClient.proxy()` from
  `@taskade/genesis-client` - never embed a raw key. `docs/01_data_layer.md`.
- **Full guide**: `docs/HOW_TO_USE.md`; per-topic chapters in `docs/README.md`.
