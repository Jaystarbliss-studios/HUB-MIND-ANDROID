# Jess MCP Runtime

## Purpose

Hub-Mind keeps its existing Firebase workspace, Electron desktop shell, Jess Live voice session, and native Windows helper. The MCP runtime adds an optional bridge to external Model Context Protocol tool servers without importing Open Cowork's separate renderer, session store, agent SDK, or dependency tree.

## Current implementation

- **Transports:** local stdio child processes and HTTPS Streamable HTTP endpoints. Plain HTTP is accepted only for loopback hosts.
- **Lifecycle:** per-account server configuration, connect/reconnect, tool discovery, per-server disconnect/removal, bounded request timeouts, and shutdown cleanup.
- **Tool exposure:** MCP tools are converted to Gemini function declarations with provider-safe names, bounded descriptions/schema depth, and a limit on the number of discovered tools.
- **Execution:** model tool calls return through Jess's existing execution trace and narrow Electron preload bridge. The main process resolves the tool against the signed-in account's connected-server index rather than trusting model-supplied server/tool identifiers.
- **Consent:** adding/connecting a server requires a native confirmation dialog. Every MCP tool call requires its own native approval dialog. Calls are recorded in the existing local audit log without recording full tool arguments.
- **Isolation:** stdio processes launch without a shell and inherit only a small allowlist of environment variables, not Hub-Mind API keys or the full application environment. Custom environment variables are rejected until encrypted secret storage exists.
- **Network:** HTTP redirects are rejected; remote endpoints must use HTTPS. URL credentials and fragments are rejected.
- **Privacy:** server configuration is encrypted at rest using Electron safeStorage and stored in the desktop user's application-data directory, then filtered by the signed-in Hub-Mind user ID. Saving is disabled if secure storage is unavailable. Tool calls and tool lists are not exposed to browser-only clients.
- **Untrusted content:** MCP tool names, descriptions, metadata and returned content are treated as external untrusted data. They cannot provide user consent or override Jess's system instructions.

## Current limitations

- SSE-only legacy transport is not implemented; use Streamable HTTP where supported.
- OAuth, custom authorization headers, and encrypted per-server secrets are not implemented. Do not put credentials in URLs, command arguments, or tool descriptions.
- MCP resources and prompts are not yet exposed to Jess; the current integration is tool-focused.
- MCP tools are not a filesystem sandbox. Any server's actual capabilities depend on that server and the operating system account it runs under. Approve only servers and calls you trust.
- No third-party MCP code or package has been copied from Open Cowork. This bridge uses Node/Electron built-ins and implements the needed JSON-RPC lifecycle directly.

## Verification plan

1. Run the MCP config/schema/stdio execution tests and the full Jess unit suite.
2. Run npm run typecheck, node --check electron/main.cjs, node --check electron/preload.cjs, and the production build.
3. Build the Windows installer and inspect the packaged app's MCP settings screen.
4. In the packaged desktop app, add a local test server, verify tool discovery, cancel a tool call, approve a tool call, remove the server, and confirm a second signed-in account cannot see or call it.
5. Verify a server process cannot inherit application API-key environment variables and that malformed URLs/paths are rejected.

The implementation is not complete until the automated checks pass; the manual Windows acceptance steps must be performed on a packaged desktop app before claiming end-to-end validation.
