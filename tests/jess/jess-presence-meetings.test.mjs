import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../../src/components/JessFloatingAssistant.tsx', import.meta.url), 'utf8');
const liveClient = await readFile(new URL('../../src/services/liveAudioClient.ts', import.meta.url), 'utf8');

test('active Jess sessions keep the live transcript visible and identify its speaker', () => {
  assert.match(component, /\(active \|\| speechState\.visible\) && speechState\.text/);
  assert.match(component, /Live transcript/);
  assert.match(component, /speechState\.speaker === 'user' \? 'You' : 'Jess'/);
});

test('screen sharing has explicit lifecycle state and stops when Jess disconnects', () => {
  assert.match(component, /const stopScreenSharing = useCallback/);
  assert.match(component, /await stopScreenSharing\(false\);\s*await clientRef\.current\?\.disconnect\(\)/);
  assert.match(component, /stopShareCommand/);
  assert.match(component, /setScreenSharingActive\(true\)/);
  assert.match(component, /setScreenSharingActive\(false\)/);
});

test('Jess instructions support requested Christian prayer and grounded meeting observations', () => {
  assert.match(liveClient, /FAITH, PRAYER & SPIRITUAL SUPPORT/);
  assert.match(liveClient, /Lord’s Prayer/);
  assert.match(liveClient, /MEETING NOTES & LIVE TUTORING OBSERVATION/);
  assert.match(liveClient, /periodic snapshots, not continuous video/);
});
