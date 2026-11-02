# Jess native control and Wheelhouse integration status

Status: implementation branch; Windows runtime and production acceptance tests still required.

## Implemented in this branch

- **Chrome native-host installer:** removed the `Set-Acl` call that attempted privileged owner/SACL handling and failed with `SeSecurityPrivilege`. The installer now restricts the per-user bridge token's DACL with `icacls.exe`, checks the exit code, and stops with a useful error if the ACL cannot be applied.
- **Global wheel auto-scroll:** added a Windows desktop start/stop IPC boundary and Jess tools. It sends real Windows mouse-wheel events at the current cursor position, so the focused Hub-Mind window, browser, or other desktop app can respond. Direction is up/down and speed is configurable from 1 to 15 wheel steps per second. It stops on Full Control shutdown and on native-agent failure.
- **In-app reading auto-scroll:** added a separate page-only auto-scroll tool that works in Hub-Mind browser, desktop, and mobile views without native permissions. It selects the focused scrollable area or the largest visible reading pane, supports up/down and adjustable speed, and stops at a scroll boundary or on an explicit stop command.
- **Microsoft UI Automation and Wheelhouse-style numbering:** implemented the previously declared `find_ui_element` action, which was missing from the PowerShell dispatcher; added a bounded `set_ui_value` action using `ValuePattern`, rejecting ambiguous and read-only targets. Activation tries Invoke, SelectionItem, Toggle, and (in the follow-up branch) ExpandCollapse patterns as available. Added transparent, click-through numbered badges over visible UI Automation controls, with a 20-second timeout and automatic dismissal after a numbered activation. The native helper still rechecks the exact expected name before activating a numbered target.
- **Jess web search:** forced search/maps requests away from the Groq/Ollama compatibility path, which does not provide Google grounding; added a clear configuration error when Gemini grounding is requested but `GEMINI_API_KEY` is missing. The server response now returns normalized source URLs, and the Netlify chat response includes `url` as well as `uri` so the client can render citations.
- **Repository awareness:** added a read-only `/api/repository-context` endpoint and `get_hubmind_repository_status` Jess tool. It fetches recent public commits and pull requests, with a rule that open PRs are proposed work and merged status is not the same as runtime acceptance.

## Wheelhouse alignment

Jess continues to own the assistant, permissions, audit trail, and native action registry. The current implementation now draws a temporary click-through numbered overlay inspired by Wheelhouse. It is a Hub-Mind implementation, not Wheelhouse code, and still needs real-app and mixed-DPI acceptance tests. A Wheelhouse local STT/command provider is not yet bundled or running from this branch. Do not describe those pieces as completed.

## Chrome extension impact

No Chrome extension source change is required for global auto-scroll: that feature uses the Windows mouse wheel and works at the pointer location in Chrome and other applications. The Chrome native-host installer changed, so an updated desktop build must be installed and the **Install Chrome Bridge** action rerun to repair the token permissions and complete registration.

## Required acceptance checks

1. Run `npm test`, `npm run build`, and `npm run build:native:win` in CI or a Windows build environment.
2. Re-run the Chrome bridge installer as a standard (non-elevated) user; verify it completes, token file ACL is restricted to the current user, registry manifest is present, and extension handshake succeeds.
3. On Windows, test UIA list/find/invoke/value-setting against Notepad, Settings, File Explorer, and at least one third-party app; verify ambiguous controls are rejected.
4. Start auto-scroll with the cursor over Hub-Mind, Chrome, Notepad, and a long document; verify down/up direction, slow/fast rates, and immediate stop. Confirm it stops when Full Control ends.
5. Verify the deployed `/api/chat` response includes grounded source URLs and that the client renders them. Verify a missing Gemini key produces a clear configuration error rather than a fake search result.
6. Call `/api/repository-context` and verify recent commits/PRs match GitHub. Ensure Jess distinguishes open PRs, merged PRs, and runtime-tested features.
7. Benchmark the actual Wheelhouse local STT/provider separately on the target laptop before making offline dictation the default.

## Not claimed as complete

- No Windows device tests have been run from the GitHub editing environment.
- No production deployment has been verified.
- No Wheelhouse speech provider has been launched or bundled.
- The on-screen numbered overlay has been implemented but still requires multi-monitor/DPI and real-app acceptance tests.
- Web grounding still depends on a valid server-side Gemini API key and API availability.
