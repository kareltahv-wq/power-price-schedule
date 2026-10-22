# 02 - Theming

All color flows through CSS variables in `src/index.css`. Components reference
semantic Tailwind classes; re-theming rewrites the variables, never the
components. A baked-in literal color survives a theme swap and clashes - zero
palette classes (`bg-blue-500`), zero raw hex/rgb/hsl in component source.

## Semantic tokens

Defined as HSL triples on `:root` (light) and `.dark` (dark) in `src/index.css`:

| Classes | Use for |
|---|---|
| `bg-background text-foreground` | page default |
| `bg-card text-card-foreground` | cards, panels |
| `bg-primary text-primary-foreground` | primary buttons, emphasis |
| `bg-secondary text-secondary-foreground` | secondary elements |
| `bg-muted text-muted-foreground` | subtle/disabled, secondary text |
| `bg-accent text-accent-foreground` | highlights, hover states |
| `bg-destructive text-destructive-foreground` | delete/error |
| `border-border`, `ring-ring` | borders, focus rings |
| `bg-popover text-popover-foreground` | menus, popovers |

`--radius` controls corner rounding. Sidebar-specific vars (`--sidebar-*`)
exist for the `ui/sidebar` primitive.

## Chart tokens

Five categorical colors: `--chart-1` ... `--chart-5`, exposed as
`bg-chart-N` / `text-chart-N` classes and as `'hsl(var(--chart-N))'` values
for Recharts series (via a `ChartConfig` with `ui/chart`).

Class names MUST appear verbatim in `.tsx` source - the Tailwind JIT content
scan cannot see a computed `` `bg-chart-${n}` ``. Map indexes to literals:

```tsx
const CHART_BG = { 1: 'bg-chart-1', 2: 'bg-chart-2', 3: 'bg-chart-3',
                   4: 'bg-chart-4', 5: 'bg-chart-5' } as const;
```

## Dark mode + ThemeProvider contract

- `main.tsx` pre-mounts next-themes' `ThemeProvider` with `attribute="class"`,
  `enableSystem={false}`. Do NOT mount a second provider.
- The mode a first-time visitor sees comes from `--genesis-default-theme` in
  the `:root` block of `src/index.css`: `dark` (the template value, and the
  default when the property is absent) or `light`. A light-first app sets
  `--genesis-default-theme: light;`. A mode the visitor picked later wins. Do
  not call `setTheme` on mount to pick the first mode: the app renders once
  before the provider mounts, so that call is lost.
- Legacy apps (generated before template 2.3.4) that already mount their own
  `ThemeProvider` in the app tree keep working: the `ThemeGate` in `main.tsx`
  detects that provider and stays out of the way, so their theme config wins.
  Do not copy that pattern into new code.
- Dark mode = the `.dark` class on `<html>`; every token flips automatically.
  Never write per-component `dark:` color overrides for tokens - they already
  flip.
- Build toggles with `useTheme()` (from `next-themes`, or the
  `@/hooks/use-theme` shim which re-exports it):

```tsx
const { theme, setTheme } = useTheme();
<Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
```

- `color-scheme` is paired with the theme in `index.css` so native scrollbars
  and form controls match.

## Interface defaults (`src/styles/genesis-base.css`, read-only)

Ships the template's floor: focus-visible rings on controls that declare none,
`touch-action`/tap-highlight on interactive elements, heading
`scroll-margin-top` + `text-wrap`, a themed native `<select>`, thin scrollbars
in `--muted-foreground` inside the agent chat panel, and a reduced-motion
transition reset. Every selector is specificity 0, so any class you write wins.
Do not edit it and do not restate its rules in your components.

## Customizing a theme

Change the app's look by rewriting variable VALUES in `src/index.css` (both
`:root` and `.dark` blocks), keeping the variable names. Components need no
edits. Keep foreground/background pairs at readable contrast in both modes.

Theme tokens live only in the `:root` and `.dark` blocks inside `@layer base`
in `src/index.css`. Change their values there, never in a new rule. The Theme &
Brand panel reads and writes only those two blocks, so a token set anywhere
else locks the owner out of it. For an app the owner wants light only, write
the light values into both blocks.

## Editor theme bridge (do not touch)

`src/lib/theme-bridge.ts` (wired in `main.tsx`) listens for
`TASKADE_THEME_UPDATE` postMessages from the parent Taskade editor and injects
live variable overrides for `:root` and `.dark` (explicit dark values when the
editor sends them, else values derived from the light ones). It also reports
its version and the light or dark mode on screen, so the editor's theme panel
edits the palette the preview shows. It is why the variable names above are
load-bearing: the editor's theme panel writes them. Renaming or hardcoding
around them breaks live re-theming.
