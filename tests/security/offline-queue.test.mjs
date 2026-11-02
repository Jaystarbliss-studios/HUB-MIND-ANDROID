import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('offline actions remain recoverable after the automatic retry limit', () => {
  const queue = read('../../src/lib/offlineQueue.ts');
  assert.match(queue, /item\.status === 'failed' && \(item\.retryCount \|\| 0\) >= 5/);
  assert.match(queue, /item\.status = item\.retryCount >= 5 \? 'failed' : 'pending'/);
  assert.match(queue, /remaining\.push\(item\)/);
  assert.doesNotMatch(queue, /exceeded max retries, dropping/);
  assert.match(queue, /status: remaining\.length === 0 \? 'synced' : hasExhaustedFailures \? 'failed' : 'pending'/);
});

test('failed offline actions can be explicitly retried and the UI exposes recovery', () => {
  const queue = read('../../src/lib/offlineQueue.ts');
  const indicator = read('../../src/components/SyncStatusIndicator.tsx');
  assert.match(queue, /export async function retryFailedOfflineActions/);
  assert.match(queue, /item\.retryCount = 0/);
  assert.match(queue, /delete item\.error/);
  assert.match(indicator, /retryFailedOfflineActions/);
  assert.match(indicator, /Retry failed actions/);
  assert.match(indicator, /Failed actions:/);
});
