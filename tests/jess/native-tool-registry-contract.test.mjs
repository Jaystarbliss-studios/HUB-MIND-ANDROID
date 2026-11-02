import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getJessToolsForRuntime, JESS_NATIVE_TOOL_NAMES } from '../../src/shared/jessNativeToolNames.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function balancedObject(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return '';
}

function frontendNativeDeclaration(source, name) {
  const needle = `name: '${name}'`;
  const index = source.indexOf(needle);
  if (index < 0) return '';
  const start = source.lastIndexOf('\n  { name:', index);
  const next = source.indexOf('\n  { name:', index + needle.length);
  return source.slice(start < 0 ? index : start + 1, next < 0 ? source.length : next);
}

function serverNativeDeclaration(source, name) {
  const needle = `name: "${name}"`;
  const index = source.indexOf(needle);
  if (index < 0) return '';
  const start = source.lastIndexOf('\n        {', index);
  const end = source.indexOf('\n        },', index);
  return source.slice(start < 0 ? index : start + 1, end < 0 ? index + 1500 : end + 10);
}

function frontendArgumentSchema(declaration) {
  const match = declaration.match(/parameters:\s*object\(\s*\{/);
  if (!match) return [];
  const openIndex = match.index + match[0].lastIndexOf('{');
  const body = balancedObject(declaration, openIndex);
  return [...body.matchAll(/(?:^|,)\s*([A-Za-z][A-Za-z0-9]*):\s*\{\s*type:\s*'?(string|number|boolean|object)'?/g)]
    .map((item) => [item[1], item[2]])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function serverArgumentSchema(declaration) {
  const match = declaration.match(/properties:\s*\{/);
  if (!match) return [];
  const openIndex = match.index + match[0].lastIndexOf('{');
  const body = balancedObject(declaration, openIndex);
  return [...body.matchAll(/(?:^|,)\s*([A-Za-z][A-Za-z0-9]*):\s*\{\s*type:\s*"(STRING|NUMBER|BOOLEAN|OBJECT)"/g)]
    .map((item) => [item[1], item[2].toLowerCase()])
    .sort((a, b) => a[0].localeCompare(b[0]));
}



function frontendRequiredFields(declaration) {
  const marker = 'parameters: object(';
  const markerIndex = declaration.indexOf(marker);
  if (markerIndex < 0) return [];
  const openIndex = declaration.indexOf('(', markerIndex);
  let depth = 0;
  let closeIndex = -1;
  for (let i = openIndex; i < declaration.length; i += 1) {
    if (declaration[i] === '(') depth += 1;
    if (declaration[i] === ')') {
      depth -= 1;
      if (depth === 0) { closeIndex = i; break; }
    }
  }
  const body = declaration.slice(openIndex + 1, closeIndex);
  const match = body.match(/,\s*\[([^\]]*)\]\s*$/);
  return match
    ? [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]).sort()
    : [];
}

function serverRequiredFields(declaration) {
  const match = declaration.match(/required:\s*\[([^\]]*)\]/);
  return match
    ? [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]).sort()
    : [];
}

function declaredEnums(declaration) {
  return [...declaration.matchAll(/enum:\s*\[([^\]]*)\]/g)]
    .map((match) => [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]));
}

const nativeToolNames = [
  'jess_full_control',
  'jess_stop',
  'show_hub_mind_workspace',
  'list_windows',
  'manage_windows',
  'control_mouse',
  'start_windows_auto_scroll',
  'stop_windows_auto_scroll',
  'show_windows_ui_numbers',
  'hide_windows_ui_numbers',
  'drag_windows_mouse',
  'type_windows_text',
  'press_windows_keys',
  'control_system_volume',
  'control_screen_brightness',
  'take_windows_screenshot',
  'find_windows_ui_element',
  'invoke_windows_ui_element',
  'set_windows_ui_value',
  'read_windows_screen',
  'open_local_windows_path',
  'launch_windows_application',
  'run_windows_command_native',
  'manage_windows_files',
  'manage_windows_clipboard',
  'control_windows_power',
  'get_windows_time',
  'get_windows_system_info',
  'chrome_list_tabs',
  'chrome_open_tab',
  'chrome_close_tab',
  'chrome_activate_tab',
  'chrome_navigate_tab',
  'chrome_reload_tab',
  'chrome_read_page',
  'chrome_find_element',
  'chrome_click_element',
  'chrome_fill_field',
  'chrome_scroll',
  'chrome_capture_screenshot',
];

test('server Live tool registry exposes every native tool declared by Jess', async () => {
  const [server, tools, liveClient, sharedNativeTools] = await Promise.all([
    read('../../server.ts'),
    read('../../src/lib/jessTools.ts'),
    read('../../src/services/liveAudioClient.ts'),
    read('../../src/shared/jessNativeToolNames.ts'),
  ]);

  const liveStart = server.indexOf('const LIVE_TOOLS = [');
  const liveEnd = server.indexOf('\n  ];', liveStart);
  assert.notEqual(liveStart, -1, 'server.ts must declare LIVE_TOOLS');
  assert.notEqual(liveEnd, -1, 'server.ts must close the Live registry');
  const liveRegistry = server.slice(liveStart, liveEnd);

  for (const name of nativeToolNames) {
    assert.match(tools, new RegExp(`name: ['"]${name}['"]`), `Jess tool catalogue is missing ${name}`);
    assert.match(sharedNativeTools, new RegExp(name), `shared native tool list is missing ${name}`);
    assert.match(liveRegistry, new RegExp(`name: ["']${name}["']`), `server LIVE_TOOLS is missing ${name}`);
  }

  assert.ok(
    liveClient.includes('isDesktopClient ? !desktopOnlyDomTools.has(tool.name) : !JESS_NATIVE_TOOL_NAME_SET.has(tool.name)'),
    'direct Live must hide native tools in web-only runtimes while retaining desktop UI tools',
  );

  const chromeScrollStart = liveRegistry.indexOf('name: "chrome_scroll"');
  const chromeScrollEnd = liveRegistry.indexOf('name: "end_session"', chromeScrollStart);
  const chromeScroll = liveRegistry.slice(chromeScrollStart, chromeScrollEnd);
  assert.match(chromeScroll, /delta:.*type: "NUMBER"/, 'Chrome scroll must use the frontend delta argument');
  assert.doesNotMatch(chromeScroll, /deltaY|deltaX/, 'Chrome scroll must not advertise mismatched argument names');
});

test('native tool results can travel from the desktop executor back to the Live model', async () => {
  const [server, assistant, executor, sharedRuntime] = await Promise.all([
    read('../../server.ts'),
    read('../../src/components/JessFloatingAssistant.tsx'),
    read('../../src/services/liveAudioClient.ts'),
    read('../../src/shared/jessNativeToolNames.ts'),
  ]);

  assert.match(server, /payload\.type === "function_response" \|\| payload\.type === "tool_response"/);
  assert.match(server, /liveSession\.sendToolResponse\(\{ functionResponses \}\)/);
  assert.match(server, /requestUrl\.searchParams\.get\("runtime"\) === "desktop"/);
  assert.match(server, /const connectionTools = getJessToolsForRuntime\(LIVE_TOOLS, isDesktopRuntime\)/);
  assert.match(sharedRuntime, /declaration: any\) => isDesktopRuntime \|\| !JESS_NATIVE_TOOL_NAME_SET\.has\(declaration\?\.name\)/);
  assert.equal((server.match(/tools: connectionTools as any/g) || []).length, 2);
  assert.doesNotMatch(server, /tools: LIVE_TOOLS as any/);
  assert.match(server, /const generateFallbackTurn = async \(chatAi: any\)/);
  assert.match(server, /await generateFallbackTurn\(chatAi\);/);
  assert.match(server, /functionResponse: \{[\s\S]*?name: resp\.name,[\s\S]*?id: resp\.id,[\s\S]*?response: resp\.response/);
  assert.match(server, /Do not signal the turn as complete while Jess is waiting for a tool to run/);
  assert.match(server, /Never leave the voice UI waiting forever after a failed tool-result or model turn/);
  assert.match(server, /MAX_FALLBACK_TOOL_ROUNDS = 8/);
  assert.match(server, /repeatsTooOften/);
  assert.match(server, /Tool loop stopped to prevent repeated execution/);
  assert.match(server, /type: "error", message \}/);
  assert.match(server, /type: "turn_complete" \}\)\);/);
  assert.match(assistant, /MAX_JESS_TOOL_CALLS_PER_TURN = 12/);
  assert.match(assistant, /toolLoopRef\.current\.rounds > MAX_JESS_TOOL_CALLS_PER_TURN/);
  assert.match(assistant, /previousCalls >= 2/);
  assert.match(assistant, /executionId => executeJessTool\(fc\.name/);
  assert.match(assistant, /sendFunctionResponse\(\{ name: fc\.name, id: fc\.id, response: result\.result \}\)/);
  assert.match(assistant, /A tool failure must become a tool response/);
  assert.match(executor, /tools: \[\{ functionDeclarations: availableTools as any \}\]/);
});


test('Full Control uses saved main-process consent and a main-process session secret', async () => {
  const main = await read('../../electron/main.cjs');
  const start = main.indexOf("ipcMain.handle('hubmind:full-control-start'");
  const end = main.indexOf("ipcMain.handle('hubmind:full-control-stop'", start);
  assert.notEqual(start, -1, 'main process must register Full Control start');
  assert.notEqual(end, -1, 'main process must register Full Control stop');
  const handler = main.slice(start, end);
  assert.match(handler, /process\.platform !== 'win32'/);
  assert.match(handler, /jessPreferences\.fullControlEnabled/);
  assert.match(handler, /permissionMode === 'allow-everything'/);
  assert.match(main, /buttons: \['Cancel', 'Allow everything'\]/);
  assert.match(main, /fullControlConsentGranted/);
  assert.match(main, /controlSessionSecret = randomUUID\(\)/);
  assert.match(main, /assertTrustedSender\(event\)/);
  assert.match(main, /Control\+Alt\+Shift\+J/);
  assert.match(main, /jess-native-audit\.jsonl/);
});


test('window operations reject ambiguous titles and validate stable handles', async () => {
  const [main, nativeAgent] = await Promise.all([
    read('../../electron/main.cjs'),
    read('../../electron/jess-agent.ps1'),
  ]);
  assert.match(main, /Window handle must be a positive integer returned by list_windows/);
  assert.match(main, /Window title must be a string no longer than 300 characters/);
  assert.match(nativeAgent, /Window title is ambiguous; provide the exact window handle/);
  assert.match(nativeAgent, /StringComparison\]::OrdinalIgnoreCase/);
  assert.match(nativeAgent, /ShowWindowAsync\(\$h,6\)/);
  assert.match(nativeAgent, /ShowWindowAsync\(\$h,3\)/);
  assert.match(nativeAgent, /ShowWindowAsync\(\$h,9\)/);
  assert.match(nativeAgent, /\$verified=\$after\.state -eq 'minimized'/);
  assert.match(nativeAgent, /\$verified=\$after\.state -eq 'maximized'/);
});


test('native tool argument property names and types match across registries', async () => {
  const [server, tools] = await Promise.all([
    read('../../server.ts'),
    read('../../src/lib/jessTools.ts'),
  ]);
  for (const name of nativeToolNames) {
    const frontendDeclaration = frontendNativeDeclaration(tools, name);
    const serverDeclaration = serverNativeDeclaration(server, name);
    assert.ok(frontendDeclaration, `frontend declaration missing for ${name}`);
    assert.ok(serverDeclaration, `server declaration missing for ${name}`);
    assert.deepEqual(
      serverArgumentSchema(serverDeclaration),
      frontendArgumentSchema(frontendDeclaration),
      `argument property/type mismatch for ${name}`,
    );
    assert.deepEqual(
      serverRequiredFields(serverDeclaration),
      frontendRequiredFields(frontendDeclaration),
      `required argument mismatch for ${name}`,
    );
    assert.deepEqual(
      declaredEnums(serverDeclaration),
      declaredEnums(frontendDeclaration),
      `enum mismatch for ${name}`,
    );
  }
});


test('runtime filtering hides native tools outside the installed desktop app', () => {
  const groups = [{
    functionDeclarations: [
      { name: 'get_user_profile' },
      { name: 'list_windows' },
      { name: 'chrome_open_tab' },
    ],
  }];
  const webTools = getJessToolsForRuntime(groups, false);
  const desktopTools = getJessToolsForRuntime(groups, true);
  assert.deepEqual(webTools[0].functionDeclarations.map((tool) => tool.name), ['get_user_profile']);
  assert.deepEqual(desktopTools[0].functionDeclarations.map((tool) => tool.name), [
    'get_user_profile',
    'list_windows',
    'chrome_open_tab',
  ]);
  assert.ok(JESS_NATIVE_TOOL_NAMES.length >= 37, 'native registry should retain the baseline desktop tools');
  assert.equal(new Set(JESS_NATIVE_TOOL_NAMES).size, JESS_NATIVE_TOOL_NAMES.length, 'native tool registry must not contain duplicate names');
});


test('execution correlation IDs reach native IPC and the local audit log', async () => {
  const [runtime, assistant, tools, preload, main] = await Promise.all([
    read('../../src/services/jessExecutionRuntime.ts'),
    read('../../src/components/JessFloatingAssistant.tsx'),
    read('../../src/lib/jessTools.ts'),
    read('../../electron/preload.cjs'),
    read('../../electron/main.cjs'),
  ]);
  assert.match(runtime, /const executionId = makeExecutionId\(\)/);
  assert.match(assistant, /runJessToolExecution/);
  assert.match(assistant, /executionId: execution\.executionId/);
  assert.match(tools, /desktop\.nativeAction\(method, payload, user\.id, executionId\)/);
  assert.match(tools, /desktop\.chromeAction\(name, args \|\| \{\}, user\.id, executionId\)/);
  assert.match(preload, /nativeAction: \(method, args, userId, executionId\)/);
  assert.match(preload, /chromeAction: \(method, args, userId, executionId\)/);
  assert.match(main, /executionId: correlationId/);
  assert.match(main, /jess-exec-\[A-Za-z0-9_-\]/);
});


test('Jess account preferences are enforced by the assistant and tool executor', async () => {
  const [settings, assistant, tools, liveClient, main] = await Promise.all([
    read('../../src/pages/JessSettings.tsx'),
    read('../../src/components/JessFloatingAssistant.tsx'),
    read('../../src/lib/jessTools.ts'),
    read('../../src/services/liveAudioClient.ts'),
    read('../../electron/main.cjs'),
  ]);
  assert.match(settings, /doc\(db, 'users', profile\.id, 'private', 'jessSettings'\)/);
  assert.match(settings, /memoryEnabled/);
  assert.match(settings, /webResearchEnabled/);
  assert.match(settings, /filter\(event => event\.userId === profile\.id\)/);
  assert.match(settings, /\}, \[profile\?\.id\]\);/);
  assert.match(settings, /permissionMode/);
  assert.match(assistant, /jessPreferencesRef\.current\.memoryEnabled !== false/);
  assert.match(assistant, /jessPreferencesRef\.current\.webResearchEnabled === false/);
  assert.match(tools, /prefs\.memoryEnabled === false && name === 'save_user_memory'/);
  assert.match(tools, /prefs\.webResearchEnabled === false/);
  assert.match(liveClient, /context\?\.personalization/);
  assert.match(liveClient, /context\?\.contextEnabled === false/);
  assert.match(liveClient, /context\?\.screenVerificationEnabled === false/);
  assert.match(main, /jessPreferences\.permissionMode === 'allow-routine'/);
  assert.match(main, /jessPreferences\.permissionMode === 'allow-everything'/);
  assert.match(settings, /window\.setTimeout/);
  assert.match(settings, /Main-process mode/);
});


test('MCP tools use explicit desktop consent, scoped tool discovery, and no shell execution', async () => {
  const [bridge, main, preload, live, tools, settings, settingsPage] = await Promise.all([
    read('../../electron/mcpBridge.cjs'),
    read('../../electron/main.cjs'),
    read('../../electron/preload.cjs'),
    read('../../src/services/liveAudioClient.ts'),
    read('../../src/lib/jessTools.ts'),
    read('../../src/components/JessMcpServersSettings.tsx'),
    read('../../src/pages/JessSettings.tsx'),
  ]);
  assert.match(bridge, /shell: false/);
  assert.match(bridge, /ALLOWED_MCP_ENV_KEYS/);assert.match(bridge, /ANONYMIZED_TELEMETRY/);assert.match(bridge, /Secrets and arbitrary environment overrides are not supported/);
  assert.match(bridge, /Only HTTPS is allowed|MCP HTTP servers must use HTTPS/);
  assert.match(main, /ipcMain\.handle\('hubmind:mcp-tool-call'/);
  assert.match(main, /Approve Jess MCP tool call/);
  assert.match(main, /requireEncryptedStorage: true/);
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /safeStorage\.decryptString/);
  assert.match(main, /MCP access is scoped to the currently active Hub-Mind account/);
  assert.match(main, /mcpBridge\.resolveTool\(owner/);
  assert.match(main, /mcp-tool-call-approved/);
  assert.match(preload, /mcpCallTool: .*hubmind:mcp-tool-call/);
  assert.match(live, /await desktop\.mcpListTools\(context\.userId\)/);
  assert.match(live, /\.\.\.mcpToolDeclarations/);
  assert.match(tools, /name\.startsWith\('mcp_'\)/);
  assert.match(settings, /Add and connect/);
  assert.match(settingsPage, /JessMcpServersSettings userId=\{profile\?\.id \|\| ''\}/);
});

test('high-impact native and external tool calls pause for a fresh spoken yes',async()=>{const [assistant,live,settings]=await Promise.all([read('../../src/components/JessFloatingAssistant.tsx'),read('../../src/services/liveAudioClient.ts'),read('../../src/pages/JessSettings.tsx')]);assert.match(assistant,/highRiskJessConfirmation/);assert.match(assistant,/confirmationRequired: true/);assert.match(assistant,/pendingHighRiskConfirmationRef/);assert.match(assistant,/isSpokenYes\(text\)/);assert.match(assistant,/confirmHighRiskOutLoud !== false/);assert.match(live,/HIGH-IMPACT SPOKEN CONFIRMATION/);assert.match(settings,/Ask out loud before high-impact actions/);});

test('Jess refreshes and validates stored memories during the live session and queries installed app version',async()=>{const [live,main]=await Promise.all([read('../../src/services/liveAudioClient.ts'),read('../../electron/main.cjs')]);assert.match(live,/MEMORY VALIDATION: When memory is enabled, refresh relevant stored memories with get_user_memories at the start of each user turn/);assert.match(main,/hubMindDesktopVersion = app\.getVersion\(\)/);});
