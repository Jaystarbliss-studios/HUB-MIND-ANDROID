import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tools = fs.readFileSync(path.join(root, 'src/lib/jessTools.ts'), 'utf8');
const live = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');

test('Hub-Mind in-app auto-scroll is available without native Windows permissions', () => {
  assert.match(tools, /name: 'start_hubmind_auto_scroll'/);
  assert.match(tools, /name: 'stop_hubmind_auto_scroll'/);
  assert.match(tools, /function startHubMindAutoScroll/);
  assert.match(tools, /window\.setInterval/);
  assert.match(tools, /target === document\.body \|\| target === document\.documentElement/);
  assert.match(tools, /pixelsPerStep: 30/);
  assert.match(tools, /scroll-boundary-reached/);
  assert.match(live, /name: "start_hubmind_auto_scroll"/);
  assert.match(live, /name: "stop_hubmind_auto_scroll"/);
});

test('system-wide auto-scroll stays in the Windows desktop bridge and stops with Full Control', () => {
  assert.match(tools, /name: 'start_windows_auto_scroll'/);
  assert.match(tools, /name: 'stop_windows_auto_scroll'/);
  assert.match(main, /mouse-wheel events at the current cursor location across desktop apps and browsers/);
  assert.match(main, /stopAutoScroll\('full-control-stopped'\)/);
});
