# Docs index

Focused chapters - read only what the task needs. The comprehensive
single-file guide is `HOW_TO_USE.md`; the agent quick contract is the
package-root `AGENTS.md`.

| Chapter                                                | Covers                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01_data_layer.md](./01_data_layer.md)                 | Project rows via `@/lib/genesis-data`, field-name vs field-path keys, flows via `@/lib/genesis-flows`, secret proxy via `@taskade/genesis-client` |
| [02_theming.md](./02_theming.md)                       | CSS variable tokens, dark mode, ThemeProvider contract, chart vars, editor theme bridge                                                           |
| [03_routing_pages.md](./03_routing_pages.md)           | Router setup, pages/app-shell pattern, file organization                                                                                          |
| [04_agent_chat.md](./04_agent_chat.md)                 | FloatingAgentChat wiring, agentId vs publicAgentId, SDK v2 useChat split, tool approval, reading past conversations                               |
| [05_deployment_publish.md](./05_deployment_publish.md) | Preview vs published runtime differences, error boundary, relative paths                                                                          |

Component references live next to the code: `src/components/README.md` (map),
`src/components/blocks/README.md` (block props + adapters),
`src/lib/agent-chat/v2/README.md` (chat SDK).
