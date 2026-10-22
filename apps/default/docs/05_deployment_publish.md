# 05 - Preview vs published

The same app source runs in two environments. Code defensively for both; never
branch on environment yourself unless listed below.

| | Director Preview (editing) | Published app |
|---|---|---|
| Audience | the builder, inside the Taskade editor iframe | end users (non-technical) |
| Error boundary | raw error + stack shown; reported to "Fix with AI" | friendly copy only, no stack |
| Lifecycle logger | injected as `window.__TASKADE_APP_LIFECYCLE_LOGGER__` | absent (reporting is a no-op) |
| Theme bridge | live `TASKADE_THEME_UPDATE` messages apply instantly | last saved tokens baked into `index.css` |
| Hot reload | yes | no |

## What stays identical

- Gateway calls: relative `/api/taskade/*` paths work in both (the proxy
  rewrites and authenticates them). Never hardcode an absolute backend host.
- `GenesisClient` (secret proxy) defaults to same-origin `/_taskade/api/v2`
  and works in both.
- OIDC auth (`<GenesisAuth>`) discovers config from `/_genesis/auth` on the
  current origin in both.
- SPA routing: published apps serve `index.html` for non-asset paths, so
  `BrowserRouter` deep links survive refresh.

## Error handling contract

`main.tsx` wraps the app in `GenesisRoot` (an ErrorBoundary). A render-phase
throw shows a friendly fallback instead of a blank page and, in preview,
triggers the "Fix with AI" popup. Two implications:

- Do not add your own top-level error boundary; add granular ones only around
  risky subtrees if needed (`react-error-boundary` is bundled).
- End users must never see raw errors or state enums; keep user-facing failure
  copy friendly (the prebuilt blocks already do this).

## Publishing facts

- Published apps can live on custom domains (CNAME, auto-SSL) and behind
  password protection - platform-side settings, no code changes.
- No environment variables exist at runtime. Configuration is code: ids
  (project, agent, flow) are literals in `src/`.
- Assets: import from `src/`, reference external https URLs, or ship them
  verbatim via the top-level `public/` folder (next section).

## Static files: `public/`

Files under a top-level `public/` folder ship verbatim at the published site
root (`/robots.txt`, `/llms.txt`, ...). Every file needs an extension: outside
`.well-known/`, an extensionless URL is routed to the app shell, not the file
(`public/download` would never serve; `public/download.pdf` does). On a name
collision your `public/`
file wins over the template default, with one exception: the builder always
generates the root `index.html`, so a `public/index.html` is ignored. Typical
uses: `robots.txt` and `sitemap.xml` overrides (on the app's own Taskade
address, `*.taskade.app` by default or the base the owner picked; a connected
custom domain serves platform copies of
those two files), `llms.txt`,
domain-verification files, `ads.txt`, `.well-known/*`, and downloadable
assets. Binary files travel as base64 file nodes; no extra handling needed.
