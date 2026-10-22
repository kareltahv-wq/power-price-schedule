# Genesis Base Template v2 - AI Development Guide

> Focused per-topic chapters live in this folder - see [docs/README.md](./README.md)
> (data layer, theming, routing, agent chat, preview vs published). The agent
> quick contract is the package-root `AGENTS.md`. This file remains the
> comprehensive single-pass guide.

## Core Rules

1. **Work ONLY in `src/`** - Create/modify files only under `src/` (plus the top-level `public/` folder for static files - see AGENTS.md "Static files: public/"), never touch anything else outside
2. **Don't modify `src/main.tsx`** - Entry point is fixed
3. **`src/App.tsx` is a router shell** - it ships with one route to
   `src/pages/HomePage.tsx`. Each page gets its own `src/pages/*.tsx` file
   registered as one more `<Route>`; never grow a page inline in `App.tsx`
4. **Use `@/` imports** - `import { cn } from '@/lib/utils'` not relative paths

## File Structure

```
src/
├── App.tsx                    # Router shell (routes + shared layout only)
├── pages/                     # One file per route (HomePage.tsx ships as the pattern)
├── main.tsx                   # Entry point (don't modify)
├── index.css                  # Tailwind + CSS variables
├── components/ui/             # Base UI components (Button, Dialog, etc.)
├── components/ai-elements/    # Pre-built AI chat UI components
└── lib/
    ├── utils.ts               # cn() utility
    └── agent-chat/v2/         # Agent Chat SDK (useChat + createAgentChat)
```

## Available Dependencies

### Core

- react 18, react-dom 18, typescript 5, tailwindcss 3

### UI & Styling

- **@radix-ui/react-\*** - Dialog, Dropdown Menu, Select, Switch, Tabs, Tooltip, Progress, Separator
- **lucide-react** - Icons (1000+ available)
- **framer-motion** 12 - Animations
- **next-themes** 0.4 - Dark mode
- **tailwind-merge** + **clsx** - `cn()` utility
- **class-variance-authority** 0.7 - Variant styling
- **@radix-ui/colors** 3 - Color system

### Forms & Validation

- **react-hook-form** 7
- **@hookform/resolvers** 3 at runtime (the manifest declares 5)
- **zod** 3 at runtime (the manifest declares 4) - Schema validation. Use only zod APIs that exist in both majors.

### State & Routing

- **zustand** 4 - State management
- **react-router-dom** 7 - Routing
- **react-oidc-context** 3 - OIDC auth client
- **axios** 1 - HTTP client

### UI Components

- **cmdk** 1 - Command palette
- **sonner** 2 - Toasts
- **@hello-pangea/dnd** 18 - Drag & drop
- **@formkit/auto-animate** 0.8 - Auto animations
- **react-textarea-autosize** 8 - Auto-growing textarea
- **react-intersection-observer** 9 - Visibility detection
- **react-error-boundary** 5 - Error boundaries

### Content & Data

- **react-markdown** 10 + **remark-gfm** 4 - Markdown
- **recharts** 2 - Charts
- **date-fns** 4 - Date utilities

### Maps

- **leaflet** + **react-leaflet** - Import `@/lib/leaflet-setup` from a map
  component to load Leaflet CSS and bundled marker icons only with that surface

### AI Chat

- **@ai-sdk/react** - `useChat` hook for AI chat interfaces
- **ai** - AI SDK core (types, transports)
- **ai-elements** - Pre-built chat UI components at `@/components/ai-elements/`
- **ulidx** - ULID generation for message IDs

## Authentication (OIDC)

A pre-built auth wrapper is available at `@/lib/genesis-auth`. Use it instead of configuring `AuthProvider` manually.

### When to add auth

Add auth when the app needs to identify individual users (login, signup, per-user data, multi-user features).
Do NOT add auth for single-purpose tools with no user concept.

### Usage

```tsx
import { GenesisAuth } from '@/lib/genesis-auth';

function App() {
  return (
    <GenesisAuth>
      <ProtectedApp />
    </GenesisAuth>
  );
}
```

Access user profile after login:

```tsx
import { useAuth } from 'react-oidc-context';

function Profile() {
  const auth = useAuth();
  if (!auth.isAuthenticated) {
    return <button onClick={() => auth.signinRedirect()}>Sign in</button>;
  }
  const { email, name, preferred_username, sub } = auth.user?.profile ?? {};
  return <div>Hello {name}</div>;
}
```

- `auth.signinRedirect()` - trigger login (Genesis provides the login/signup UI). It brings the user back to the page it was called from, path, query and hash included, so a gate on `/admin` needs no return flag of its own. Never write a `sessionStorage` marker or a bounce-back component for this.
- `signUpToApp()` from `@/lib/genesis-auth` - for a "Sign up" button. It opens the hosted create-account page directly, not the sign-in page. Like `signinRedirect()`, it returns the user to the page it was called from. On an invite-only app the page says "This app is invite-only" and creates no account.
- `signUpToApp({ email })` and `signInToApp({ email })` - pre-fill the email on the hosted page when the app already knows it (for example from a lead form). The page ignores a value that is not a valid email.
- In an app whose `genesis-auth.tsx` has no `signUpToApp`, the build reports a missing export. Use `auth.signinRedirect({ prompt: 'create' })` there.
- `auth.signoutRedirect()` — logout
- `auth.isAuthenticated` — check login state
- `auth.error` - a sign-in or session renewal that failed. A visitor with no session is not an error: `auth.error` stays empty for them, so test `auth.isAuthenticated` and show the sign-in button, not an error card. A renewal that finds no session signs the user out (`isAuthenticated` turns false) with `auth.error` empty.
- `auth.user?.profile` - `{ email, name, preferred_username, sub, role }`

Do not build custom login forms or custom auth flows unless explicitly asked.

### When the owner requires sign-in

The app's owner can turn on "Require sign-in to use this app" in the Publish
menu. From then on every project, agent, form and automation call from a
visitor who is not signed in is refused by the server with a 401. The template
handles that for you: `GenesisRoot` shows a "Sign in to continue" screen with a
Sign in button over the app the moment such a refusal comes back, whichever
way the call was made (`fetch`, axios, the data helpers). Do not build your own
401 handling for it. The screen reads the app's sign-up mode from the realm
discovery document (`taskade_signup_mode`): on an invite-only app it tells the
visitor to ask the app owner for an account instead of offering sign-up. Your
own gates can read the same value with `useSignupMode()` from
`@/lib/genesis-auth` (`'open' | 'invite' | null` when unknown).

### Admin and member pages

The app's owner makes each app user an Admin or a Member in App Users (a new
account is a Member). The sign-in token carries it as a `role` claim. Use the
helpers from `@/lib/genesis-auth`, never a hand-built users table with a role
column:

```tsx
import { RequireRole, useGenesisRole } from '@/lib/genesis-auth';

<Route
  path="/admin"
  element={
    <RequireRole role="admin">
      <AdminPage />
    </RequireRole>
  }
/>;

function Nav() {
  const role = useGenesisRole(); // 'admin' | 'member', or null when signed out
  return role === 'admin' ? <Link to="/admin">Admin</Link> : null;
}
```

- `<RequireRole role="admin">` shows its children to admins only. A member sees
  "This page is for admins. Ask the app owner for access." and a signed-out
  visitor sees the "Sign in to continue" screen. `role="member"` admits every
  signed-in user.
- The role decides what the app SHOWS. The server does not filter project data
  by role yet, so do not present an admin page as a security boundary.
- A role change reaches a signed-in user within 15 minutes.
- In an app whose `genesis-auth.tsx` predates the helpers, the build reports a
  missing export. Check `auth.user?.profile.role === 'admin'` from `useAuth()`
  there instead.

### Project data is auto-authenticated

When the app is wrapped in `<GenesisAuth>`, the signed-in user's identity is attached automatically to Taskade project data calls (the `/api/taskade/...` gateway). You do not need to set an `Authorization` header on those calls yourself; just `fetch`/`axios` them as usual. Third-party APIs are never sent this token (use the Workspace Secrets proxy below for those).

## External APIs (Workspace Secrets)

For any third-party API that requires an API key, use `GenesisClient.proxy()` from `@taskade/genesis-client`. Never embed the raw key in client code — the proxy resolves a named secret server-side and substitutes `{{secret}}` into the URL and headers.

### Usage

```tsx
import { GenesisClient } from '@taskade/genesis-client';

const taskade = new GenesisClient({ spaceId: SPACE_ID });

const res = await taskade.proxy({
  secretAlias: 'openai', // matches the Key saved in Space Settings → Secrets
  url: 'https://api.openai.com/v1/chat/completions',
  method: 'POST',
  headers: { Authorization: 'Bearer {{secret}}' }, // {{secret}} substituted server-side
  body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] },
});
const data = await res.json();
```

- The `{{secret}}` placeholder is a literal string — leave it as-is, the server replaces it.
- Returns the raw upstream `Response`; call `.json()`, `.text()`, `.arrayBuffer()` etc.
- Works identically in preview and in published apps.

### When to use the proxy

- **Yes**: any third-party API requiring an API key (LLM providers, payments, email, SMS, paid weather/maps tiers).
- **No**: public open-data endpoints (no key needed); Taskade-internal endpoints (project/automation/agent); APIs already exposed through an Automation flow piece.

### Before the app can use a new secret

Tell the user, in chat, to:

1. Open **Space Settings → Secrets**.
2. Add a secret with the exact key name you used in `secretAlias` (e.g. `openai`, `stripe`, `resend`).
3. Set spending limits in the provider's dashboard — calls are charged to **their** provider account, not Taskade.

## Pre-built Components

**Base UI** (`@/components/ui/`) — Button, Dialog, Select, Switch, Tabs, etc.

**AI Elements** (`@/components/ai-elements/`) — Pre-built chat UI components:

- `Conversation`, `ConversationContent`, `ConversationScrollButton` — Scrollable chat container
- `Message`, `MessageContent`, `MessageResponse` — Message bubbles with streaming markdown
- `PromptInput`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputSubmit` — Chat input form
- `Suggestions`, `Suggestion` — Quick-reply suggestion pills
- `Reasoning`, `ReasoningTrigger`, `ReasoningContent` — Collapsible thinking display
- `CodeBlock` — Syntax-highlighted code with copy button

See `src/lib/agent-chat/v2/README.md` for full Agent Chat SDK docs + AI Elements usage examples.

Create custom components freely in `src/components/` using Radix UI primitives.

## CSS Design System

Use semantic color classes (automatically supports light/dark mode):

- `bg-background text-foreground` - Page default
- `bg-primary text-primary-foreground` - Primary buttons
- `bg-secondary text-secondary-foreground` - Secondary elements
- `bg-muted text-muted-foreground` - Disabled/subtle
- `bg-accent text-accent-foreground` - Highlights
- `bg-destructive text-destructive-foreground` - Delete/error
- `bg-card text-card-foreground` - Cards
- `border-border` - Borders
- `ring-ring` - Focus rings

## Component Patterns

### TypeScript

- Define explicit Props interfaces for all components
- Use `React.FC<Props>` and function declarations
- Use Zod schemas with `z.infer<typeof schema>` for form types

### Styling

- Use Tailwind utility classes
- Use `cn()` from `@/lib/utils` for conditional classes
- Use semantic color classes for theme consistency

### File Organization

- `src/components/` - Reusable components
- `src/pages/` - Route pages
- `src/hooks/` - Custom hooks
- `src/stores/` - Zustand stores
- `src/lib/` - Utilities

## Key Libraries Usage

### Routing

- Use `react-router-dom` with `BrowserRouter`, `Routes`, `Route`

### State Management

- Use `zustand` with `create<State>()` for global state

### Forms

- Use `react-hook-form` with `useForm()` and `zodResolver()` for validation

### Icons

- Import from `lucide-react`: `import { Home, User, Settings } from 'lucide-react'`

### Dark Mode

- A next-themes `ThemeProvider` (`attribute="class"`) is already pre-mounted in `src/main.tsx`. Do NOT mount a second provider
- The first-visit mode is `--genesis-default-theme` in the `:root` block of `src/index.css`: `dark` (default) or `light`
- Build theme toggles with the `useTheme()` hook (from `next-themes` or the `@/hooks/use-theme` shim); the theme applies via the `.dark` class

### HTTP

- Use `axios` for API calls

## Summary

React 18 + TypeScript + Tailwind CSS template. Work only in `src/` (plus top-level `public/` for static files). Use Radix UI primitives for accessible components, Zustand for state, React Router for routing, react-hook-form + Zod for forms, Lucide for icons. Build custom components as needed.
