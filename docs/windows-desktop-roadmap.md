# Hub-Mind public entry and Windows desktop

## Public website
- Public landing page is the root route. Authenticated workspace routes live below `/workspace`.
- `/login` remains the Google sign-in entry. Existing account profiles are sent to `/workspace`; a new invitee keeps the invitation query through sign-in.
- Invitation modal accepts a full URL or invitation document ID. This uses the existing invitation system, which verifies active status, seven-day expiry, and invited email at acceptance. It is not a separate, human-readable access-code database.
- Windows download is displayed only when the GitHub repository has a published release with an `.exe` asset.

## Windows desktop shell
Electron is scaffolded with context isolation, sandboxed renderer, disabled Node integration, a strict preload bridge, and a permission-confirmed allowlist for opening a user-selected path. The initial shell loads the hosted Hub-Mind app; authentication continues to use Firebase Google sign-in. The companion window is a separate frameless, always-on-top window that can be shown from the tray.

## Important release requirements
- Configure GitHub Actions secrets `GH_RELEASE_TOKEN` only if the release workflow needs to publish assets; prefer the built-in `GITHUB_TOKEN` with contents write permission where repository policy permits.
- A public GitHub release with the built Windows `.exe` is needed before the homepage can show a download.
- Code signing requires a valid Windows code-signing certificate and secrets configured in CI. Without it, Windows SmartScreen may show an unknown publisher warning.
- The companion currently hosts the web Jess experience; unrestricted OS control, global keyboard injection, and reading arbitrary files are intentionally not enabled. Add narrowly scoped native actions only with explicit user approval and audit logging.
- Electron has not been locally packaged or installed in this environment. CI must be green and a real Windows installer smoke test is required before calling the desktop release production-ready.
