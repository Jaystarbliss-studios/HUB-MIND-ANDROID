import test from 'node:test';
import assert from 'node:assert/strict';
import { runJessToolExecution } from '../../src/services/jessExecutionRuntime.ts';

test('execution runtime records a successful read-only operation without persisting argument values', async () => {
  const events = [];
  const trace = await runJessToolExecution({
    toolName: 'list_windows',
    args: { title: 'private-window-title', includeHidden: false },
    userId: 'user-1',
    turnId: 'turn-1',
    onEvent: event => events.push(event),
  }, async () => ({ result: { success: true, windows: [] } }));

  assert.equal(trace.status, 'completed');
  assert.equal(trace.retrySafe, true);
  assert.ok(trace.executionId.startsWith('jess-exec-'));
  assert.equal(events.length, 2);
  assert.equal(events[0].status, 'started');
  assert.equal(events[1].status, 'completed');
  assert.deepEqual(events[0].argumentKeys, ['includeHidden', 'title']);
  assert.doesNotMatch(JSON.stringify(events), /private-window-title/);
});

test('execution runtime distinguishes verified, unverified and failed native actions', async () => {
  const verified = await runJessToolExecution({ toolName: 'manage_windows', args: {} }, async () => ({
    result: { success: true, status: 'done_verified', verified: true },
  }));
  const unverified = await runJessToolExecution({ toolName: 'type_windows_text', args: { text: 'sensitive' } }, async () => ({
    result: { success: true, status: 'sent_unverified', verified: false },
  }));
  const failed = await runJessToolExecution({ toolName: 'run_windows_command_native', args: { command: 'echo test' } }, async () => ({
    result: { success: false, error: 'blocked' },
  }));

  assert.equal(verified.status, 'done_verified');
  assert.equal(unverified.status, 'sent_unverified');
  assert.equal(unverified.retrySafe, false);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.retrySafe, false);
});

test('thrown tool errors become normalized failed results and never escape unreported', async () => {
  const events = [];
  const trace = await runJessToolExecution({
    toolName: 'update_document',
    args: { documentId: 'doc-1', content: 'private content' },
    onEvent: event => events.push(event),
  }, async () => { throw new Error('document write failed'); });

  assert.equal(trace.status, 'failed');
  assert.equal(trace.value.result.success, false);
  assert.equal(trace.value.result.error, 'document write failed');
  assert.equal(events.at(-1).status, 'failed');
  assert.equal(events.at(-1).retrySafe, false);
});
