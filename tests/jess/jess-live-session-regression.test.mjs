import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Gemini Live WebSocket URLs are never captured by the Vite development mock', () => {
  const html = read('../../index.html');
  assert.match(html, /window\.location\.hostname === 'localhost'/);
  assert.match(html, /window\.location\.hostname === '127\.0\.0\.1'/);
  assert.doesNotMatch(html, /urlStr\.includes\(['"]token=['"]\)/i);
  assert.doesNotMatch(html, /access_token=/i);
});

test('3D renderer failure cannot prevent the Jess pet voice bridge from initializing', () => {
  const pet = read('../../electron/jess-pet/pet.js');
  assert.match(pet, /const THREE = window\.THREE \|\| null/);
  assert.match(pet, /function initializeMaterials\(\)/);
  assert.match(pet, /if \(!THREE \|\| typeof THREE\.WebGLRenderer !== "function"\)/);
  assert.match(pet, /Three\.js or WebGL is unavailable; using the lightweight avatar fallback/);
  assert.match(pet, /drawFallback2D\(\)/);
  assert.match(pet, /const fallbackCanvas = canvas\.cloneNode\(false\)/);
  assert.match(pet, /canvas\.replaceWith\(fallbackCanvas\)/);
  assert.match(pet, /if \(!leftArm \|\| !rightArm \|\| !headRig\) return/);
  assert.match(pet, /window\.jessPet\?\.onVisualState\?\./);
  assert.match(pet, /window\.jessPet\?\.activateVoice\?\./);
});

test('repeated avatar activation does not cancel an in-progress Gemini Live handshake', () => {
  const pet = read('../../electron/jess-pet/pet.js');
  const assistant = read('../../src/components/JessFloatingAssistant.tsx');
  assert.match(pet, /gesture === "toggle" && visualState\.connection === "connecting"/);
  assert.match(assistant, /if \(connection === 'connected'\) void stop\(\);\s*else if \(connection === 'connecting'\)/);
  assert.match(assistant, /another click won't cancel the attempt/);
  assert.doesNotMatch(assistant, /if \(connection === 'connected' \|\| connection === 'connecting'\) void stop\(\)/);
});

test('saved Allow Everything consent bypasses product prompts but still requires the active Full Control session', () => {
  const main = read('../../electron/main.cjs');
  const assistant = read('../../src/components/JessFloatingAssistant.tsx');
  const settings = read('../../src/pages/JessSettings.tsx');
  assert.match(main, /const allowEverything = fullControlActive && !!controlSessionSecret && jessPreferences\.fullControlEnabled && jessPreferences\.permissionMode === 'allow-everything'/);
  assert.match(main, /!allowEverything && jessPreferences\.allowShellCommands/);
  assert.match(main, /method === 'filesystem_scan' && !allowEverything &&/);
  assert.match(main, /!allowEverything && jessPreferences\.allowAutomatedFileManagement/);
  assert.match(main, /if \(!allowEverything\) \{[\s\S]*?Confirm Windows storage cleanup/);
  assert.match(main, /allowUnrestricted: allowEverything \|\| jessPreferences\.allowShellCommands === true/);
  assert.match(assistant, /const allowEverything = jessPreferencesRef\.current\.fullControlEnabled === true && jessPreferencesRef\.current\.permissionMode === 'allow-everything'/);
  assert.match(settings, /permissionMode: 'allow-everything', confirmHighRiskOutLoud: false/);
  assert.match(settings, /disabled=\{prefs\.permissionMode === 'allow-everything'\}/);
  assert.match(main, /Native action blocked because Jess Full Control is not active/);
  assert.ok(main.includes("if (!allowEverything) {"));
  assert.ok(main.includes("Set up Chrome bridge"));
});

test('Jess server endpoints verify Firebase identity and active Hub-Mind membership', () => {
  const chat = read('../../netlify/functions/chat.ts');
  const liveToken = read('../../netlify/functions/live-token.mjs');
  const googleAuth = read('../../netlify/functions/lib/googleOAuth.mjs');
  assert.match(chat, /getBearer, verifyFirebaseUser/);
  assert.match(chat, /await verifyFirebaseUser\(idToken\)/);
  assert.match(chat, /isChatRateLimited\(user\.localId\)/);
  assert.match(liveToken, /import \{ verifyFirebaseUser \} from '\.\/lib\/googleOAuth\.mjs'/);
  assert.doesNotMatch(liveToken, /profile fetch non-fatal fallback/);
  assert.match(googleAuth, /fields\.status\?\.stringValue !== 'active'/);
});

test('Firestore collection lists and payment creation are constrained to the current user', () => {
  const rules = read('../../firestore.rules');
  assert.match(rules, /match \/connections\/\{id\}[\s\S]*?allow list: if admin\(\) \|\| \(member\(\) && \(resource\.data\.requesterId == request\.auth\.uid \|\| resource\.data\.recipientId == request\.auth\.uid\)\)/);
  assert.match(rules, /match \/shares\/\{id\}[\s\S]*?allow list: if admin\(\) \|\| \(member\(\) && \(resource\.data\.ownerId == request\.auth\.uid \|\| resource\.data\.recipientUserId == request\.auth\.uid\)\)/);
  assert.match(rules, /match \/inbox\/\{id\}[\s\S]*?allow list: if admin\(\) \|\| \(member\(\) &&/);
  assert.match(rules, /match \/payments\/\{id\}[\s\S]*?allow update, delete: if admin\(\)/);
  assert.match(rules, /request\.resource\.data\.status in \['pending','awaiting_confirmation','awaiting_payment','pending_confirmation'\]/);
});
