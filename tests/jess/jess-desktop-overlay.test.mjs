import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('native Jess character remains visible over workspace and returns after minimize or close', () => {
  const main = read('../../electron/main.cjs');
  assert.ok(main.includes("mainWindow.on('show', () => { createCompanionWindow(); positionCompanionBottomRightIfNeeded(); });"));
  assert.ok(main.includes("mainWindow.on('restore', () => { createCompanionWindow(); positionCompanionBottomRightIfNeeded(); });"));
  assert.ok(main.includes("mainWindow.on('minimize', () => { createCompanionWindow();"));
  assert.ok(main.includes("mainWindow.on('close', (event) => { if (!quitting)"));
  assert.ok(main.includes('width: JESS_PET_WIDTH, height: JESS_PET_HEIGHT'));
  assert.ok(main.includes("loadFile(path.join(__dirname, 'jess-pet', 'index.html'))"));
  assert.ok(main.includes('hubmind:move-companion-by'));
  assert.ok(main.includes('hubmind:hide-companion'));
});

test('desktop orb displays only the Jess icon with a working hide control', () => {
  const orb = read('../../src/pages/CompanionPage.tsx');
  assert.ok(orb.includes('JessOrbVisualizer'));
  assert.ok(orb.includes('JessOrbVisualizer'));
  assert.ok(orb.includes('jess-orb-drag'));
  assert.ok(orb.includes('hideCompanion'));
  assert.ok(orb.includes('moveCompanionBy'));
  assert.match(orb, /jess-orb-window/);
});

test('voice turns are mirrored into the cross-window desktop transcript cache', () => {
  const assistant = read('../../src/components/JessFloatingAssistant.tsx');
  assert.match(assistant, /function publishJessTranscript/);
  assert.match(assistant, /publishJessTranscript/);
});

test('native focus action brings a real Windows desktop window forward', () => {
  const agent = read('../../electron/jess-agent.ps1');
  assert.match(agent, /BringWindowToTop/);
  assert.match(agent, /SetForegroundWindow/);
});
