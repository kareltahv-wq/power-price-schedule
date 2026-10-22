# Agent contract

Non-negotiables for any agent editing this app. Details live in `docs/`; read
a chapter only when you need it.

> Enforcement: the protected files in rules 1, 3, 6 and 9 are refused at write
> time by the platform (#27627), not just discouraged here. There is no override -
> every edit tool you have will refuse them. Make your change in your own feature
> files instead (wrap or compose the protected module); if the app genuinely
> cannot work without changing one, stop and say so. The single source of truth
> for the protected set is `isProtectedFilePath` in `@taskade/parade-shared` -
> keep these rules in sync with it.

## Hard rules

1. Work ONLY in `src/`, plus the top-level `public/` folder for static files
   (see "Static files: public/" below). Never modify `src/main.tsx`,
   `src/styles/genesis-base.css` (the template's interface defaults - every
   rule there is specificity 0, so your own styles already win),
   `src/lib/genesis.tsx`, `src/lib/genesis-auth.tsx`, `src/lib/genesis-gateway.ts`,
   `src/lib/gateway-auth.tsx`, config files, or anything else outside `src/`
   and `public/`.
2. Verify before import. If a path or package is not in this tree or
   `package.json`, it does not exist - do not import it. No new dependencies.
   Icons: import from `@/lib/icons` - every real lucide-react icon name
   resolves there, but an invented icon name fails the whole build. A component
   that renders a Leaflet map must import `@/lib/leaflet-setup` itself so the
   map alone loads Leaflet's CSS and bundled marker icons.
3. NEVER edit files under `src/components/ui/` or `src/components/blocks/`.
   Theme via `src/index.css` tokens; wrap primitives in your own components.
4. ThemeProvider (next-themes, `attribute="class"`) is pre-mounted in
   `main.tsx`. Do NOT mount a second one; toggle with `useTheme()`. The
   first-visit mode is `--genesis-default-theme` in the `:root` block of
   `src/index.css` (`dark` or `light`, dark when absent). Set it there, never
   with a `setTheme` call on mount.
5. Color via semantic tokens only (`bg-card`, `text-muted-foreground`, ...).
   No literal palette classes, no raw hex. Chart classes stay literal
   (`bg-chart-1` ... `bg-chart-5`), never computed strings. Bind every chart
   `dataKey`/`nameKey` to a field name that actually exists in your data rows -
   a mismatched key renders an EMPTY chart with no error, silently.
6. Data via the gateway helpers, never hand-rolled endpoints:
   `getNodes/createNode/updateNode/deleteNode` from `@/lib/genesis-data`,
   `submitForm/runFlow/getFlowRuns` from `@/lib/genesis-flows`. Rows arrive FLAT (do not
   filter by `parentId`); read fields with `getFieldValue`/`getFieldNumber`,
   never by indexing `fieldValues` directly. An intake form (contact / lead /
   survey) saves with `createNode` ONLY - one submit, one writer. Never also
   `submitForm` the same values to a flow, or every submission writes two rows.
   Build the write payload from the exact keys your form state stores: reading
   a differently-cased key (`fields.Result` when the state key is `result`)
   yields `undefined`, which JSON silently drops from the saved row and string
   templates render as the literal text "undefined" - no error either way.
   `runFlow` and `submitForm` run on a click, never on a timer: recurring work is
   a Schedule flow that writes rows, and the app reads the rows.
7. Secrets stay server-side: third-party keyed APIs go through
   `GenesisClient.proxy()` (`@taskade/genesis-client`) with `{{secret}}`
   substitution. Never embed a key.
8. Agent chat: use `<FloatingAgentChat agentId publicAgentId? />` from
   `@/components/blocks`, or the SDK v2 two-component split. `useChat` crashes
   on `undefined` chat. Never link to a relative `/a/...` URL: that route only
   exists on www.taskade.com, so on the app's own origin (preview or published)
   it opens a blank unauthorized page. Past chats: persist `conversationId`
   (localStorage / `createPersistentStore`) and read with `listConversations` /
   `getConversation`; the API cannot list every conversation.
9. Auth, when needed: wrap with `<GenesisAuth>` from `@/lib/genesis-auth`.
   Never build custom login flows. `signinRedirect()` returns the user to the
   page it was called from, so never add a return-path flag or bounce-back
   component. A "Sign up" button calls `signUpToApp()` from
   `@/lib/genesis-auth`, which opens the create-account page directly.
   `signUpToApp({ email })` and `signInToApp({ email })` pre-fill the email.
10. NEVER import an identifier that shadows a built-in global constructor
    (`Map`, `Set`, `Date`, `Image`, `Promise`, `Proxy`, `RegExp`, ...) and then
    `new` it. e.g. `import { Map } from 'lucide-react'` makes `new Map()` throw
    `Map is not a constructor` and white-screens the app. Rename the icon
    (`import { Map as MapIcon } from 'lucide-react'`) or use `new globalThis.Map()`.
11. Match the app's surface to its spec. Every entity or section the user
    names gets a real page under `src/pages/`, routed in `App.tsx` and linked
    from the nav. A single-page shell over a multi-section request is an
    incomplete build, not a style choice.
12. Hand-authored forms carry the QA selector contract: `data-genesis-form` on
    the form element, `data-genesis-field="<field name>"` on each field
    wrapper, `data-genesis-submit` on the primary submit button, and
    `data-genesis-next` on the step-advance button of a multi-step form, so
    platform QA tooling can drive them. The shipped blocks already do.

## Static files: public/

The one sanctioned place outside `src/`: files under a top-level `public/`
folder are copied verbatim into the published site root. Give every file an
extension (`download.pdf`, not `download`): outside `.well-known/`, an
extensionless URL is treated as an app route and serves the app shell instead
of the file. The builder always owns the root `index.html` - a
`public/index.html` is ignored. Typical uses:
`robots.txt` and `sitemap.xml` overrides, `llms.txt`, domain-verification
files, `ads.txt`, `.well-known/*`, and downloadable assets. Binary files ride
as base64 file nodes; no extra handling needed. One limit: `robots.txt` and
`sitemap.xml` overrides apply on the app's own Taskade address only (`*.taskade.app` by default, or the `taskade.page` / `taskade.cc` base the owner picked);
on a connected custom domain the platform serves its own copies of those two
files, so bundle copies are not reachable there.

```
public/
├── robots.txt
├── llms.txt
└── .well-known/
    └── security.txt
```

## Read more (on demand)

| Topic                                          | File                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Project rows, field names, flows, secret proxy | `docs/01_data_layer.md`                                       |
| Tokens, dark mode, chart vars                  | `docs/02_theming.md`                                          |
| Router, pages, app shell                       | `docs/03_routing_pages.md`                                    |
| Agent chat wiring, ids, history reads          | `docs/04_agent_chat.md`                                       |
| Preview vs published behavior                  | `docs/05_deployment_publish.md`                               |
| Components map / block props                   | `src/components/README.md`, `src/components/blocks/README.md` |
| Comprehensive guide                            | `docs/HOW_TO_USE.md`                                          |
