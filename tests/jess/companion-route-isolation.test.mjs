import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');

test('the native companion route never mounts the full workspace assistant overlay', () => {
  assert.match(app, /function AuthenticatedAssistantWidgets\(\)/);
  assert.match(app, /const location = useLocation\(\)/);
  assert.match(app, /const desktopOverlayRoute = \['\/companion', '\/companion-transcript', '\/orb'\]/);
  assert.match(app, /if \(desktopOverlayRoute \|\| \(publicOrLoginRoute && !isDesktopShell\)\) return null/);
  assert.match(app, /if \(!user \|\| !profile \|\| profile\.status !== 'active'\) return null/);
  assert.match(app, /<Route path="\/companion" element={<ProtectedRoute><CompanionPage \/><\/ProtectedRoute>} \/>/);
  assert.match(app, /<Route path="\/companion-transcript" element={<JessTranscriptOverlayPage \/>} \/>/);
});
