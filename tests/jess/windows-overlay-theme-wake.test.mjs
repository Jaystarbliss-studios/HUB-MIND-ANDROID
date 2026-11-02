import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('workspace CSS explicitly fixes the original dark color scheme', async () => {
  const css = await read('src/index.css');
  assert.match(css, /:root\s*\{\s*color-scheme:\s*dark\s*;?\s*\}/);
  assert.match(css, /html, body, #root\s*\{[\s\S]*?background-color:\s*#020617/i);
});

test('Windows screen sharing uses the thumbnail picker with a safe fallback', async () => {
  const main = await read('electron/main.cjs');
  const start = main.indexOf('setDisplayMediaRequestHandler');
  const end = main.indexOf('const stopHotkeyRegistered', start);
  assert.ok(start >= 0 && end > start);
  const handler = main.slice(start, end);
  assert.match(handler, /desktopCapturer\.getSources/);
  assert.match(handler, /chooseDisplaySource\(unique\)/);
  assert.match(main, /screen-share-picker\.html/);
  assert.match(handler, /thumbnailSize: \{ width: 320, height: 180 \}/);
  assert.match(handler, /callback\(selected \? \{ video: selected \} : \{\}\)/);
});

test('Windows desktop exposes guarded app, command, URL, typing and shortcut actions', async () => {
  const preload = await read('electron/preload.cjs');
  const main = await read('electron/main.cjs');
  for (const method of ['launchApp', 'runSystemCommand', 'openUrl', 'typeText', 'pressShortcut']) {
    assert.match(preload, new RegExp(method));
  }
  assert.match(main, /assertTrustedSender\(event\)/);
  assert.match(main, /Start Jess Full Control before running Windows commands/);
  assert.match(main, /Potentially destructive command blocked|command is blocked/i);
});

test('Jess wake listener accepts short interim wake phrases quickly', async () => {
  const wake = await read('src/services/jessWakeListener.ts');
  assert.match(wake, /interimWakeTimer = window\.setTimeout/);
  assert.match(wake, /\}, 180\);/);
});
