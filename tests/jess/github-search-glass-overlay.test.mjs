import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
test('google_search is a configured grounded Jess tool', async () => {
 const [tools,runtime]=await Promise.all([read('../../src/lib/jessTools.ts'),read('../../src/services/jessExecutionRuntime.ts')]);
 assert.ok(tools.includes("name: 'google_search'"));
 assert.ok(tools.includes("case 'google_search':"));
 assert.ok(runtime.includes("'google_search'"));
});
test('GitHub service supports server-side authentication and repository snapshot data', async () => {
 const [service,env]=await Promise.all([read('../../src/server/githubService.ts'),read('../../.env.example')]);
 assert.ok(service.includes('GITHUB_TOKEN'));
 assert.ok(service.includes('X-GitHub-Api-Version'));
 assert.ok(service.includes('fetchHubMindReleases'));
 assert.ok(service.includes('fetchHubMindCommits'));
 assert.ok(service.includes('fetchHubMindOverview'));
 assert.ok(service.includes('getFullRepositoryStatus'));
 assert.ok(env.includes('GITHUB_TOKEN='));
});
test('transcript stays subtly translucent and click-through while the screen-share picker remains a glass overlay', async () => {
 const [css,main,html]=await Promise.all([read('../../src/pages/jess-transcript-overlay.css'),read('../../electron/main.cjs'),read('../../electron/screen-share-picker.html')]);
 assert.ok(css.includes('rgba(2, 6, 23, .10)'));
 assert.ok(css.includes('backdrop-filter: none'));
 assert.ok(css.includes('pointer-events: none'));
 assert.ok(main.includes('transparent: true, resizable: true, movable: true'));
 assert.ok(main.includes("picker.setAlwaysOnTop(true, 'screen-saver')"));
 assert.ok(html.includes('class="glass-panel"'));
 assert.ok(html.includes('backdrop-filter:blur(34px) saturate(180%)'));
});
