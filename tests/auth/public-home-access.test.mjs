import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../../src/pages/PublicHome.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const electronMain = fs.readFileSync(new URL('../../electron/main.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../../electron/preload.cjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/windows-release.yml', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../../src/lib/auth.tsx', import.meta.url), 'utf8');
const login = fs.readFileSync(new URL('../../src/pages/Login.tsx', import.meta.url), 'utf8');

test('public landing page keeps invite-only access and release-gated installer', () => {
  assert.match(home, /Get Invite/i);
  assert.match(home, /\/login\?invite=/);
  assert.match(home, /releases\/latest/);
  assert.match(home, /\.exe\$/i);
  assert.match(home, /This Google account|invitation/i);
  assert.match(auth, /acceptInvitation\(inviteId, firebaseUser\.uid, userEmail\)/);
  assert.match(auth, /if \(!inviteId\)/);
  assert.match(auth, /if \(isAdminByEmail\)/);
  assert.doesNotMatch(auth, /isWorkspaceEmpty/);
  assert.doesNotMatch(auth, /hubmind_existing_auth_login/);
  assert.doesNotMatch(login, /hubmind_existing_auth_login/);
});

test('workspace routes remain under authenticated workspace path', () => {
  assert.match(app, /path="\/workspace"/);
  assert.match(app, /ProtectedRoute/);
  assert.match(app, /path="\/login"/);
});

test('Electron renderer is isolated and native file opening asks first', () => {
  assert.match(electronMain, /contextIsolation: true/);
  assert.match(electronMain, /nodeIntegration: false/);
  assert.match(electronMain, /sandbox: true/);
  assert.match(electronMain, /showMessageBox/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /\b(?:exec|spawn|writeFile|readFile)\s*\(/);
});

test('Windows release is tag/dispatch driven and publishes an installer', () => {
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /electron-builder --win nsis/);
  assert.match(workflow, /contents: write/);
});
