export type JessExecutionStatus =
  | 'started'
  | 'completed'
  | 'done_verified'
  | 'sent_unverified'
  | 'failed';

export interface JessExecutionEvent {
  executionId: string;
  turnId?: string;
  userId?: string;
  toolName: string;
  status: JessExecutionStatus;
  startedAt: number;
  at: number;
  durationMs: number;
  retrySafe: boolean;
  argumentKeys: string[];
  message?: string;
}

export interface JessExecutionTrace {
  executionId: string;
  status: Exclude<JessExecutionStatus, 'started'>;
  retrySafe: boolean;
  durationMs: number;
  value: any;
}

export interface JessExecutionInput {
  toolName: string;
  args: unknown;
  userId?: string;
  turnId?: string;
  onEvent?: (event: JessExecutionEvent) => void;
}

const EVENT_STORAGE_KEY = 'hubmind.jess.executionEvents.v1';
const MAX_STORED_EVENTS = 200;

// Read-only operations are safe to retry after a lost response. Unknown tools are
// conservatively treated as non-idempotent so an uncertain write is never repeated
// automatically just because the model did not receive its result.
const RETRY_SAFE_TOOLS = new Set([
  'get_current_context',
  'get_user_profile',
  'get_current_user_profile',
  'get_workspace_overview',
  'search_workspace',
  'list_projects',
  'list_meetings',
  'list_follow_ups',
  'get_document_content',
  'get_task',
  'list_tasks',
  'scan_windows_storage',
  'list_windows',
  'read_windows_screen',
  'take_windows_screenshot',
  'get_windows_time',
  'get_windows_system_info',
  'chrome_bridge_status',
  'chrome_list_tabs',
  'chrome_read_page',
  'chrome_find_element',
  'search_web',
  'google_search',
  'get_hubmind_repository_status',
  'get_desktop_version_history',
  'inspect_github_codebase',
  'open_visual_updates_panel',
]);

function makeExecutionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `jess-exec-${crypto.randomUUID()}`;
    }
  } catch {}
  return `jess-exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function resultStatus(value: any): Exclude<JessExecutionStatus, 'started'> {
  const result = value?.result && typeof value.result === 'object' ? value.result : value;
  if (result?.status === 'done_verified') return 'done_verified';
  if (result?.status === 'sent_unverified') return 'sent_unverified';
  if (result?.status === 'failed' || result?.success === false || result?.ok === false) return 'failed';
  if (result?.verified === true) return 'done_verified';
  return 'completed';
}

function safeMessage(value: unknown): string | undefined {
  if (value instanceof Error) return value.message.slice(0, 400);
  if (typeof value === 'string') return value.slice(0, 400);
  return undefined;
}

function recordEvent(event: JessExecutionEvent, onEvent?: (event: JessExecutionEvent) => void): void {
  try {
    if (typeof window !== 'undefined') {
      const previous = JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY) || '[]');
      const events = Array.isArray(previous) ? previous : [];
      events.push(event);
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events.slice(-MAX_STORED_EVENTS)));
      window.dispatchEvent(new CustomEvent('hubmind:jess-execution-event', { detail: event }));
    }
  } catch {
    // Trace persistence is best-effort and must never interrupt an actual tool call.
  }
  try { onEvent?.(event); } catch {}
}

export async function runJessToolExecution<T>(
  input: JessExecutionInput,
  execute: (executionId: string) => Promise<T>,
): Promise<JessExecutionTrace> {
  const executionId = makeExecutionId();
  const startedAt = Date.now();
  const retrySafe = RETRY_SAFE_TOOLS.has(input.toolName);
  const args = input.args && typeof input.args === 'object' ? input.args as Record<string, unknown> : {};
  const argumentKeys = Object.keys(args).slice(0, 40).sort();
  const base = {
    executionId,
    turnId: input.turnId,
    userId: input.userId,
    toolName: input.toolName,
    startedAt,
    retrySafe,
    argumentKeys,
  };
  recordEvent({ ...base, status: 'started', at: startedAt, durationMs: 0 }, input.onEvent);

  try {
    const value = await execute(executionId);
    const at = Date.now();
    const status = resultStatus(value);
    const result = {
      executionId,
      status,
      retrySafe,
      durationMs: Math.max(0, at - startedAt),
      value,
    };
    recordEvent({
      ...base,
      status,
      at,
      durationMs: result.durationMs,
      ...(status === 'failed' ? { message: safeMessage((value as any)?.result?.error || (value as any)?.error) } : {}),
    }, input.onEvent);
    return result;
  } catch (error) {
    const at = Date.now();
    const message = safeMessage(error) || 'Tool execution failed.';
    const durationMs = Math.max(0, at - startedAt);
    recordEvent({ ...base, status: 'failed', at, durationMs, message }, input.onEvent);
    return {
      executionId,
      status: 'failed',
      retrySafe,
      durationMs,
      value: { result: { success: false, error: message } },
    };
  }
}

export function readJessExecutionEvents(): JessExecutionEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(-MAX_STORED_EVENTS) : [];
  } catch {
    return [];
  }
}
