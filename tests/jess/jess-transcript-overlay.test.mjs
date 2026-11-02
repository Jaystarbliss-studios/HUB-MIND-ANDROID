import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('desktop transcript is a separate fixed and click-through window', async () => {
  const [main, preload, page, css] = await Promise.all([
    read('../../electron/main.cjs'),
    read('../../electron/preload.cjs'),
    read('../../src/pages/JessTranscriptOverlayPage.tsx'),
    read('../../src/pages/jess-transcript-overlay.css'),
  ]);

  assert.match(main, /let transcriptOverlayWindow;/);
  assert.match(main, /function createTranscriptOverlayWindow\(\)/);
  assert.match(main, /movable: false, focusable: false/);
  assert.match(main, /transcriptOverlayWindow\.setIgnoreMouseEvents\(true, \{ forward: true \}\)/);
  assert.match(main, /function positionTranscriptOverlayWindow\(\)/);
  assert.match(main, /area\.x \+ \(area\.width - width\) \/ 2/);
  assert.match(main, /hubmind:set-transcript-overlay-visible/);
  assert.ok(main.includes("setBackgroundMaterial('acrylic')"));
  assert.ok(main.includes("setBackgroundMaterial('acrylic')"));
  assert.match(preload, /setTranscriptOverlayVisible: .*hubmind:set-transcript-overlay-visible/);
  assert.match(page, /hubmind\.jess\.desktopTranscript\.v1/);
  assert.match(page, /setTranscriptOverlayVisible/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /backdrop-filter: blur/);
  assert.match(css, /justify-content: center/);
});

test('workspace route changes do not unmount Jess or rebuild Live callbacks', async () => {
  const [app, assistant] = await Promise.all([
    read('../../src/App.tsx'),
    read('../../src/components/JessFloatingAssistant.tsx'),
  ]);

  assert.match(app, /const desktopOverlayRoute = \['\/companion', '\/companion-transcript', '\/orb'\]/);
  assert.match(app, /Keep the actual[\s\S]{0,100}Jess session mounted across authenticated route changes/);
  assert.match(app, /<JessFloatingAssistant \/>/);
  assert.match(assistant, /const locationPathRef = useRef\(location\.pathname\)/);
  assert.match(assistant, /locationPathRef\.current = location\.pathname/);
  assert.match(assistant, /resolveJessContext\(locationPathRef\.current\)/);
  assert.match(assistant, /!isDesktopShell && speechState\.text/);
  assert.doesNotMatch(assistant, /\}, \[connection, location\.pathname, navigate, profile/);
});

test('movable Jess character keeps its own size when transcript appears', async () => {
  const [main, css] = await Promise.all([
    read('../../electron/main.cjs'),
    read('../../src/pages/companion.css'),
  ]);
  assert.match(main, /width: JESS_PET_WIDTH, height: JESS_PET_HEIGHT/);
  assert.match(main, /minWidth: JESS_PET_WIDTH, minHeight: JESS_PET_HEIGHT/);
  assert.match(main, /hubmind:set-companion-transcript-visible/);
  assert.match(main, /Legacy compatibility route only; the native companion now renders Jess from bundled local sprites/);
  assert.match(main, /createTranscriptOverlayWindow/);
});


test('Jess exposes google_search as the canonical external research tool while preserving search_web compatibility', async () => {
  const tools = await read('../../src/lib/jessTools.ts');
  assert.match(tools, /name: 'google_search'/);
  assert.match(tools, /case 'google_search':[\s\S]{0,80}case 'search_web':/);
  assert.match(tools, /\['search_web', 'google_search', 'desktop_open_website'\]/);
});

test('transcript and screen-share chooser use stronger transparent glass surfaces and stay above other apps', async () => {
  const [css, main, picker] = await Promise.all([
    read('../../src/pages/jess-transcript-overlay.css'),
    read('../../electron/main.cjs'),
    read('../../electron/screen-share-picker.html'),
  ]);
  assert.ok(css.includes('rgba(15, 23, 42, .46)'));
  assert.ok(css.includes('blur(26px) saturate(165%)'));
  assert.match(main, /picker\.setVisibleOnAllWorkspaces\(true, \{ visibleOnFullScreen: true \}\)/);
  assert.ok(main.includes("title: 'Choose what to share · Jess'"));
  assert.ok(main.includes("backgroundColor: '#00000000'"));
  assert.ok(picker.includes('backdrop-filter:blur(34px) saturate(180%)'));
});


test('GitHub repository service supports authenticated release, commit and metadata requests', async () => {
  const service = await read('../../src/server/githubService.ts');
  assert.ok(service.includes('process.env.GITHUB_TOKEN || process.env.GH_TOKEN'));
  assert.match(service, /export async function fetchHubMindReleases/);
  assert.match(service, /export async function fetchHubMindCommits/);
  assert.match(service, /export async function fetchHubMindOverview/);
  assert.ok(service.includes('Authorization = `Bearer ${token}`'));
});

test('screen-share chooser is a separate transparent always-on-top Electron window', async () => {
  const main = await read('../../electron/main.cjs');
  assert.ok(main.includes('function chooseDisplaySource(sources)'));
  assert.ok(main.includes('const picker = new BrowserWindow({'));
  assert.ok(main.includes('frame: false, transparent: true'));
  assert.ok(main.includes("picker.setAlwaysOnTop(true, 'screen-saver')"));
  assert.ok(main.includes("picker.loadFile(path.join(__dirname, 'screen-share-picker.html'))"));
});
