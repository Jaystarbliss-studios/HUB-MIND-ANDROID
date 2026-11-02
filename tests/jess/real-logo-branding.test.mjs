import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the official Hub-Mind logo is used consistently in public, login, and workspace branding', () => {
  const login = read('../../src/pages/Login.tsx');
  const sidebar = read('../../src/components/DesktopSidebar.tsx');
  const publicHome = read('../../src/pages/PublicHome.tsx');
  const index = read('../../index.html');
  const vite = read('../../vite.config.ts');

  assert.match(login, /src="\/hub-mind%20logo\.png"/);
  assert.doesNotMatch(login, /src="\/icon\.svg"/);
  assert.match(sidebar, /src="\/hub-mind%20logo\.png"/);
  assert.doesNotMatch(sidebar, /<Brain\s/);
  assert.match(publicHome, /src="\/hub-mind%20logo\.png"/);
  assert.match(index, /rel="icon" type="image\/png" href="\/hub-mind%20logo\.png"/);
  assert.match(vite, /src: '\/hub-mind%20logo\.png'/);
});
