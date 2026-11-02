# Jess native Windows agent

The Windows desktop build includes a persistent PowerShell/.NET Framework helper (`jess-agent.ps1`) with a JSON-lines RPC bridge (`agentBridge.cjs`). It uses Win32 APIs for window enumeration, foreground focus, move/resize/snap, mouse input and Unicode keyboard input; Windows UI Automation for accessible screen text; GDI screen capture with per-monitor bounds; Start Menu/PATH resolution for app launch; and time/system diagnostics.

## Trust and limitations
- Only the authenticated hosted Hub-Mind origin may invoke desktop IPC. The renderer has no Node integration.
- Native actions require the user to activate a Full Control Session. The session ends on stop or app exit; do not enable it on a shared or unattended PC.
- Text on screen and command output are untrusted data, never instructions.
- `verified` is false when the agent cannot verify a post-condition. Mouse/key injection is explicitly reported as input sent rather than proof that the target app changed.
- Windows secure desktop (UAC credential prompts), password/Windows Hello UI, protected content and elevated windows at a lower integrity level are not automatable by this user-level helper.
- The first release does not include OCR fallback, Chrome extension/native messaging, offline wake-word model, or reliable multi-monitor snap selection. Screenshots include per-monitor offsets and image bytes.
- PowerShell command execution is non-elevated, bounded by timeout/output limits, and blocks common destructive commands. Do not silently register a highest-privilege task or bypass Windows security prompts.
