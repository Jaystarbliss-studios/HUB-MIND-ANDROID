import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('packaged Windows app unpacks and resolves the Jess PowerShell sidecar', () => {
  const builder = read('../../electron-builder.yml');
  const bridge = read('../../electron/agentBridge.cjs');
  assert.match(builder, /asarUnpack:[\s\S]*electron\/jess-agent\.ps1/);
  assert.match(bridge, /app\.asar\.unpacked/);
  assert.match(bridge, /existsSync\(scriptPath\)/);
});

test('desktop Jess is a crisp procedural Three.js character connected to the existing Live voice controller', () => {
  const main = read('../../electron/main.cjs');
  const page = read('../../electron/jess-pet/index.html');
  const style = read('../../electron/jess-pet/pet.css');
  const pet = read('../../electron/jess-pet/pet.js');
  const three = read('../../electron/jess-pet/assets/js/three.min.js');
  const preload = read('../../electron/jess-pet/preload.cjs');
  const desktopPreload = read('../../electron/preload.cjs');
  const assistant = read('../../src/components/JessFloatingAssistant.tsx');
  const app = read('../../src/App.tsx');
  const settings = read('../../src/pages/JessSettings.tsx');

  assert.match(main, /const JESS_PET_WIDTH = 130/);
  assert.match(main, /const JESS_PET_HEIGHT = 150/);
  assert.match(main, /JESS_PET_STATES = new Set\([\s\S]{0,140}listening[\s\S]{0,100}speaking/);
  assert.match(main, /loadFile\(path\.join\(__dirname, 'jess-pet', 'index\.html'\)\)/);
  assert.doesNotMatch(main, /loadURL\(APP_URL \+ '\/companion'\)/);
  assert.match(page, /src="\.\/assets\/js\/three\.min\.js" defer><\/script>[\s\S]*src="\.\/pet\.js" defer><\/script>/);
  assert.doesNotMatch(page, /type="module"/);
  assert.match(page, /id="jess-canvas"/);
  assert.match(page, /id="jess-visualizer"/);
  assert.match(page, /class="connection-status" id="status"/);
  assert.doesNotMatch(page, /manifest\.js|pet-toolbar|offline-ready|data-state="walk"/);
  assert.match(style, /\.pet-shell\s*\{[^}]*width:\s*130px/s);
  assert.match(style, /height:\s*150px/);
  assert.match(pet, /const THREE = window\.THREE/);
  assert.match(three, /WebGLRenderer/);
  assert.match(three, /Copyright 2010-2023 Three\.js Authors/);
  assert.match(pet, /new THREE\.WebGLRenderer/);
  assert.match(pet, /new THREE\.MeshStandardMaterial/);
  assert.match(pet, /new THREE\.TubeGeometry/);
  assert.match(pet, /function createHead\(\)/);
  assert.match(pet, /function createAvatar\(\)/);
  assert.match(pet, /function applyVisualState\(payload\)/);
  assert.match(pet, /requestVoiceActivation\("toggle"\)/);
  assert.match(pet, /requestVoiceActivation\("mute"\)/);
  assert.match(pet, /visualState\.inputLevel/);
  assert.match(pet, /visualState\.outputLevel/);
  assert.doesNotMatch(pet, /manifest\.rowAssets\.map\(loadImage\)|drawImage\(/);
  assert.match(preload, /hubmind:pet-activate-voice/);
  assert.match(preload, /onVisualState/);
  assert.match(desktopPreload, /onPetVoiceActivation/);
  assert.match(desktopPreload, /setJessPetVisualState/);
  assert.match(main, /hubmind:pet-activate-voice/);
  assert.match(main, /hubmind:pet-voice-activation/);
  assert.match(assistant, /getPendingPetVoiceActivation/);
  assert.match(assistant, /clientRef\.current\.toggleMute\(\)/);
  assert.match(assistant, /listening: 'listening'/);
  assert.match(assistant, /speaking: 'speaking'/);
  assert.match(app, /publicOrLoginRoute && !isDesktopShell/);
  assert.match(settings, /Show Jess character/);
  assert.match(settings, /Hide Jess character/);
  assert.match(main, /hubmind:pet-set-visual-state/);
  assert.match(main, /hubmind:pet-visual-state/);
  assert.match(main, /label: 'Show Jess character'/);
  assert.match(main, /label: 'Hide Jess character'/);
  assert.match(main, /await showMainVerified\(\)/);
  assert.match(main, /app\.commandLine\.appendSwitch\(['"]autoplay-policy['"],\s*['"]no-user-gesture-required['"]\)/);
  assert.match(style, /background: transparent/);
});

test('Three.js is bundled locally and licensed for fully offline avatar rendering', () => {
  const three = read('../../electron/jess-pet/assets/js/three.min.js');
  const license = read('../../electron/jess-pet/assets/js/THREE-LICENSE.txt');
  assert.match(three, /Three\.js Authors/);
  assert.match(three, /WebGLRenderer/);
  assert.match(license, /MIT License/);
  assert.doesNotMatch(three, /from ["']https?:\/\//);
});

test('screen sharing uses Electron capture plumbing and a thumbnail source picker', () => {
  const main = read('../../electron/main.cjs');
  const handlerStart = main.indexOf('setDisplayMediaRequestHandler');
  const handlerEnd = main.indexOf('const stopHotkeyRegistered', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = main.slice(handlerStart, handlerEnd);
  assert.match(handler, /desktopCapturer\.getSources/);
  assert.match(handler, /chooseDisplaySource\(unique\)/);
  assert.match(main, /screen-share-picker\.html/);
  assert.match(handler, /thumbnailSize: \{ width: 320, height: 180 \}/);
  assert.match(handler, /callback\(selected \? \{ video: selected \} : \{\}\)/);
});

test('workspace palette remains pinned to Hub-Mind dark colors', () => {
  const css = read('../../src/index.css');
  const html = read('../../index.html');
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /background-color:\s*#020617/);
  assert.match(html, /theme-color" content="#020617"/);
});

test('desktop action responses distinguish verified from unverified input', () => {
  const tools = read('../../src/lib/jessTools.ts');
  assert.match(tools, /done_verified/);
  assert.match(tools, /sent_unverified/);
  assert.match(tools, /Do not repeat non-idempotent actions automatically/);
});


test('Gemini Live ephemeral tokens use the SDK-supported API version', () => {
  const client = read('../../src/services/liveAudioClient.ts');
  assert.match(client, /apiKey:\s*token[\s\S]{0,100}apiVersion:\s*'v1alpha'/);
  assert.doesNotMatch(client, /apiKey:\s*token[\s\S]{0,100}apiVersion:\s*'v1beta'/);
});


test('Live token endpoints mint short-lived tokens without overriding browser session setup', () => {
  const netlify = read('../../netlify/functions/live-token.mjs');
  const server = read('../../server.ts');
  for (const source of [netlify, server]) {
    assert.ok(source.includes('v1beta/auth_tokens'));
    assert.ok(source.includes('newSessionExpireTime'));
    assert.ok(!source.includes('liveConnectConstraints'));
    assert.ok(!source.includes('bidiGenerateContentSetup'));
  }
});
