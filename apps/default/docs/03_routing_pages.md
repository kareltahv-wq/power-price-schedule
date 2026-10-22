# 03 - Routing and pages

`react-router-dom` v7 is bundled. Use `BrowserRouter` + `Routes` + `Route`.
Published apps serve `index.html` for every non-asset path, so deep links and
refreshes work.

## App shell pattern

`src/App.tsx` ships as a working router shell with one route to
`src/pages/HomePage.tsx`. Keep it thin: router, shared layout, page routes.
Extend it by adding pages, never by growing a surface inline.

```tsx
import { lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FloatingAgentChat } from '@/components/blocks';
import { GenesisSection } from '@/lib/genesis';
import { AppShell } from '@/components/AppShell';

const HomePage = lazy(() => import('@/pages/HomePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route
            path="/"
            element={
              <GenesisSection name="Home">
                <HomePage />
              </GenesisSection>
            }
          />
          <Route
            path="/settings"
            element={
              <GenesisSection name="Settings">
                <SettingsPage />
              </GenesisSection>
            }
          />
        </Routes>
      </AppShell>
      <FloatingAgentChat agentId={AGENT_ID} publicAgentId={PUBLIC_AGENT_ID} />
    </BrowserRouter>
  );
}
```

`AppShell` is your hand-authored layout component (header/nav/sidebar wrapping
`children`) - compose it from `ui/` primitives (`sidebar`, `sheet`, `tabs`,
`navigation-menu`). Mount app-wide chrome (FloatingAgentChat, sonner
`<Toaster />`) once here, not per page.

## Fault isolation (required for multi-section apps)

Every route element is wrapped in `<GenesisSection>` (from `@/lib/genesis`) and
its page is `React.lazy`-imported. This is not optional polish: a single
top-level boundary means one render-phase throw in any section white-screens the
whole app - login, nav, and every other tab included. `GenesisSection` combines
a per-section error boundary (localized "this section hit an error, the rest
still works" card + retry) with a `Suspense` boundary for the lazy chunk, so a
broken or failed-to-load section degrades to one card while the shell keeps
working. Pass `name` for clearer logs. A tripped boundary already recovers on
navigation on its own (it keys on the current pathname), so you do not need to
wire that up; pass `resetKeys={[someParam]}` only to ALSO reset on something
else, and it is added to the pathname key rather than replacing it.

## Adding a page

1. Create `src/pages/NewPage.tsx` (a `default` export so `React.lazy` can import it).
2. `const NewPage = lazy(() => import('@/pages/NewPage'));` at the top of `App.tsx`.
3. Add `<Route path="/new" element={<GenesisSection name="New"><NewPage /></GenesisSection>} />`.
4. Link with `<Link to="/new">` or `useNavigate()` - never `<a href>` for
   internal navigation (full reload loses state).

## File organization

| Dir               | Contents                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `src/pages/`      | route pages                                                           |
| `src/components/` | reusable components (yours; `ui/` and `blocks/` are read-only)        |
| `src/hooks/`      | custom hooks (data fetching per `docs/01_data_layer.md`)              |
| `src/stores/`     | zustand stores (`createPersistentStore` for localStorage persistence) |
| `src/lib/`        | utilities (pre-wired SDKs live here - do not rewrite them)            |

## Reserved paths

Do not define routes that shadow platform paths: `/api/taskade/*` (data
gateway), `/_taskade/*` (internal API), `/_genesis/*` (auth). Client routes
never intercept these (they are network requests), but do not create page
routes at those paths either.
