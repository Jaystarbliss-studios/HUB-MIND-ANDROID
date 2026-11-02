import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, orb, workspaceCss, layout] = await Promise.all([
  readFile(new URL('../../electron/main.cjs', import.meta.url), 'utf8'),
  readFile(new URL('../../src/pages/CompanionPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/Layout.tsx', import.meta.url), 'utf8'),
]);

test('Windows shell identifies itself as an installed app and uses the native display-share picker', () => {
  assert.match(main, /app\.setAppUserModelId\(['"]studios\.jaystarbliss\.hubmind['"]\)/);
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /desktopCapturer\.getSources/);
  assert.match(main, /chooseDisplaySource\(unique\)/);
  assert.match(main, /Choose what to share/);
  assert.match(main, /screen-share-picker\.html/);
});

test('Jess desktop character is movable, closeable and rendered locally', () => {
  assert.ok(main.includes('width: JESS_PET_WIDTH, height: JESS_PET_HEIGHT'));
  assert.ok(main.includes("loadFile(path.join(__dirname, 'jess-pet', 'index.html'))"));
  assert.ok(!main.includes("loadURL(APP_URL + '/companion')"));
  assert.match(main, /transparent: true/);
  assert.match(main, /alwaysOnTop: true/);
  assert.match(main, /hubmind:move-companion-by/);
  assert.match(main, /hubmind:hide-companion/);
  assert.ok(orb.includes('jess-orb-drag'));
  assert.ok(orb.includes('hideCompanion'));
  assert.ok(orb.includes('moveCompanionBy'));
  assert.ok(orb.includes('JessOrbVisualizer'));
  assert.ok(orb.includes('JessOrbVisualizer'));
  assert.match(orb, /jess-orb-window/);
});

test('authenticated workspace explicitly preserves the established dark background', () => {
  assert.match(workspaceCss, /--color-slate-950:\s*#020617/i);
  assert.match(workspaceCss, /color-scheme:\s*dark/i);
  assert.match(workspaceCss, /background-color:\s*#020617\s*!important/i);
  assert.match(layout, /backgroundColor:\s*"#020617"/);
});

test('Windows startup is explicit per-user opt-in, not an elevated scheduled task', () => {
  assert.match(main, /Start Hub-Mind at Windows sign-in \(this user\)/);
  assert.match(main, /app\.setLoginItemSettings\(\{ openAtLogin: item\.checked \}\)/);
  assert.match(main, /app\.getLoginItemSettings\(\)\.openAtLogin/);
});
