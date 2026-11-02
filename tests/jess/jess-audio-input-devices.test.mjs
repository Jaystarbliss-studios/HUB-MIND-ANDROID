import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../../src/components/JessFloatingAssistant.tsx', import.meta.url), 'utf8');
const client = await readFile(new URL('../../src/services/liveAudioClient.ts', import.meta.url), 'utf8');

test('Jess exposes connected audio input devices and remembers the selected microphone', () => {
  assert.match(component, /Microphone input/);
  assert.match(component, /enumerateDevices\(\)/);
  assert.match(component, /hubmind\.jess\.audioInputDeviceId/);
  assert.match(component, /Audio input changed\. Jess is reconnecting/);
  assert.match(client, /deviceId: \{ exact: this\.preferredInputDeviceId \}/);
});

test('Jess retries the system default input if a selected microphone is unavailable', () => {
  assert.match(client, /If a remembered device was unplugged/i);
  assert.match(client, /this\.preferredInputDeviceId = null/);
});
