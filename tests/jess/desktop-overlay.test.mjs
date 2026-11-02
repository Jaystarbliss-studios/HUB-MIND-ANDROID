import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const legacyCss = readFileSync(new URL('../../src/pages/companion.css', import.meta.url), 'utf8');
const petCss = readFileSync(new URL('../../electron/jess-pet/pet.css', import.meta.url), 'utf8');
const petPage = readFileSync(new URL('../../electron/jess-pet/index.html', import.meta.url), 'utf8');
const rootCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const electronMain = readFileSync(new URL('../../electron/main.cjs', import.meta.url), 'utf8');

test('desktop Jess uses a local character window and keeps the transcript overlay separate', () => {
  assert.match(legacyCss, /\.jess-orb-window\s*\{[^}]*width:\s*96px/s);
  assert.match(petCss, /\.pet-shell\s*\{[^}]*width:\s*130px/s);
  assert.match(petCss, /height:\s*150px/);
  assert.match(petPage, /jess-canvas/);
  assert.match(electronMain, /createTranscriptOverlayWindow/);
  assert.match(electronMain, /width: JESS_PET_WIDTH, height: JESS_PET_HEIGHT/);
  assert.match(electronMain, /function createTranscriptOverlayWindow\(\)/);
  assert.match(electronMain, /movable: false, focusable: false/);
  assert.match(electronMain, /area\.x \+ \(area\.width - width\) \/ 2/);
  assert.match(electronMain, /legacy compatibility route only; the native companion now renders Jess from bundled local sprites/i);
});

test('workspace palette remains dark regardless of Windows/browser theme preferences', () => {
  assert.match(rootCss, /color-scheme:\s*dark\s*!important/);
  assert.match(rootCss, /background-color:\s*#020617\s*!important/);
});

test('Electron desktop screen sharing checks trusted-origin permissions and presents an explicit source chooser', () => {
  assert.match(electronMain, /setPermissionCheckHandler/);
  assert.match(electronMain, /setDisplayMediaRequestHandler/);
  assert.match(electronMain, /Choose what to share/);
  assert.match(electronMain, /callback\(selected \? \{ video: selected \} : \{\}\)/);
  assert.match(electronMain, /chooseDisplaySource\(unique\)/);
});
