import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { McpBridge, sanitizeServerConfig, safeModelToolName, toGeminiSchema, getSafeChildEnvironment } from '../../electron/mcpBridge.cjs';

test('MCP server configuration rejects unsafe transport and malformed executable settings', () => {
  assert.throws(() => sanitizeServerConfig({ name: 'Remote', transport: 'streamable-http', url: 'http://example.com/mcp' }, 'user-a'), /HTTPS/);
  assert.throws(() => sanitizeServerConfig({ name: 'Remote', transport: 'streamable-http', url: 'https://user:pass@example.com/mcp' }, 'user-a'), /credentials/);
  assert.throws(() => sanitizeServerConfig({ name: 'Local', transport: 'stdio', command: 'node', cwd: 'relative/path' }, 'user-a'), /absolute path/);
  assert.throws(() => sanitizeServerConfig({ name: 'Local', transport: 'stdio', command: 'node\nwhoami' }, 'user-a'), /unsupported characters/);
  assert.throws(() => sanitizeServerConfig({ name: 'Local', transport: 'stdio', command: 'node', env: { API_TOKEN: 'plaintext-secret' } }, 'user-a'), /not allowlisted/);
  assert.equal(Object.hasOwn(getSafeChildEnvironment(), 'OPENAI_API_KEY'), false);
});

test('MCP tool schema conversion and generated names stay within Gemini constraints', () => {
  const schema = toGeminiSchema({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text' },
      limit: { type: 'integer', enum: [1, 2, 3] },
      filters: { type: 'array', items: { type: 'string' } },
    },
    required: ['query', 'missing'],
  });
  assert.equal(schema.type, 'OBJECT');
  assert.equal(schema.properties.query.type, 'STRING');
  assert.equal(schema.properties.limit.type, 'INTEGER');
  assert.deepEqual(schema.required, ['query']);
  assert.equal(schema.properties.filters.items.type, 'STRING');

  const used = new Set();
  const longName = safeModelToolName('a-server-id-that-is-very-long', 'a-tool-name-that-is-also-extremely-long-and-should-be-truncated-to-fit-the-provider-limit', used);
  const duplicate = safeModelToolName('a-server-id-that-is-very-long', 'a-tool-name-that-is-also-extremely-long-and-should-be-truncated-to-fit-the-provider-limit', used);
  assert.ok(longName.length <= 64);
  assert.ok(duplicate.length <= 64);
  assert.notEqual(longName, duplicate);
});

test('stdio MCP servers initialize, publish tools, execute calls, and stay scoped to the owning user', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hubmind-mcp-test-'));
  const bridge = new McpBridge({ userDataPath, timeoutMs: 5000 });
  const fakeServer = [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "rl.on('line', line => {",
    "  let message; try { message = JSON.parse(line); } catch { return; }",
    "  let result = {};",
    "  if (message.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-server', version: '1' } };",
    "  else if (message.method === 'tools/list') result = { tools: [{ name: 'echo_tool', description: 'Echo a message', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }] };",
    "  else if (message.method === 'tools/call') result = { content: [{ type: 'text', text: String(message.params.arguments.message) }] };",
    "  if (message.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n');",
    "});",
  ].join('\n');

  try {
    const servers = await bridge.saveServer({
      id: 'test-server',
      name: 'Local test server',
      transport: 'stdio',
      command: process.execPath,
      args: ['-e', fakeServer],
      enabled: true,
    }, 'user-a');

    assert.equal(servers.length, 1);
    assert.equal(servers[0].connected, true);
    assert.equal(servers[0].toolCount, 1);

    const tools = bridge.listTools('user-a');
    assert.equal(tools.length, 1);
    assert.match(tools[0].name, /^mcp_test_server_echo_tool$/);
    assert.equal(bridge.listTools('user-b').length, 0);

    const result = await bridge.callTool('user-a', tools[0].name, { message: 'hello from Jess' });
    assert.equal(result.content[0].text, 'hello from Jess');
    await assert.rejects(() => bridge.callTool('user-b', tools[0].name, { message: 'unauthorized' }), /not available/);

    await bridge.removeServer('user-a', 'test-server');
    assert.equal(bridge.listTools('user-a').length, 0);
  } finally {
    await bridge.shutdown();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('MCP server configuration is encrypted at rest when secure storage is required', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hubmind-mcp-encrypted-test-'));
  const encryptConfig = value => Buffer.from(value, 'utf8').toString('base64');
  const decryptConfig = value => Buffer.from(value, 'base64').toString('utf8');
  const bridge = new McpBridge({ userDataPath, encryptConfig, decryptConfig, requireEncryptedStorage: true });
  try {
    await bridge.saveServer({
      id: 'stored-server',
      name: 'Stored server',
      transport: 'stdio',
      command: 'secret-command.exe',
      args: ['--demo'],
      enabled: false,
    }, 'user-a');
    const stored = fs.readFileSync(path.join(userDataPath, 'jess-mcp-servers.json'), 'utf8');
    assert.match(stored, /"encrypted":true/);
    assert.doesNotMatch(stored, /secret-command\.exe/);
    const reloaded = new McpBridge({ userDataPath, encryptConfig, decryptConfig, requireEncryptedStorage: true });
    assert.equal(reloaded.listServers('user-a').length, 1);
    await reloaded.shutdown();
  } finally {
    await bridge.shutdown();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('Streamable HTTP transport reads an MCP response before an SSE stream closes', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hubmind-mcp-http-test-'));
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
        res.writeHead(400); res.end(); return;
      }
      if (message.method === 'notifications/initialized') {
        res.writeHead(202, { 'Mcp-Session-Id': 'test-session' }); res.end(); return;
      }
      let result = {};
      if (message.method === 'initialize') {
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'http-test', version: '1' } };
      } else if (message.method === 'tools/list') {
        result = { tools: [{ name: 'http_echo', description: 'Echo over HTTP', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }] };
      } else if (message.method === 'tools/call') {
        result = { content: [{ type: 'text', text: String(message.params.arguments.message) }] };
      }
      if (message.method === 'initialize' || message.method === 'tools/call') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'test-session' });
        res.write('data: ' + JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n\n');
        const timeout = setTimeout(() => res.end(), 10000);
        res.on('close', () => clearTimeout(timeout));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'test-session' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const bridge = new McpBridge({ userDataPath, timeoutMs: 5000 });
  try {
    await bridge.saveServer({
      id: 'http-server',
      name: 'Local HTTP test',
      transport: 'streamable-http',
      url: 'http://127.0.0.1:' + address.port + '/mcp',
      enabled: true,
    }, 'user-a');
    const tool = bridge.listTools('user-a')[0];
    assert.equal(tool.originalName, 'http_echo');
    const result = await bridge.callTool('user-a', tool.name, { message: 'streamed hello' });
    assert.equal(result.content[0].text, 'streamed hello');
  } finally {
    bridge.shutdown();
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('MCP environment only permits non-secret Windows-MCP settings and telemetry can be disabled', () => {
  const config = sanitizeServerConfig({
    id: 'windows-mcp', name: 'Windows-MCP', transport: 'stdio', command: 'uvx',
    args: ['windows-mcp', 'serve'],
    env: { ANONYMIZED_TELEMETRY: 'false', WINDOWS_MCP_EXCLUDE_TOOLS: 'PowerShell,Registry,Process,FileSystem,Screenshot' },
  }, 'user-a');
  assert.equal(config.env.ANONYMIZED_TELEMETRY, 'false');
  assert.equal(getSafeChildEnvironment(config.env).ANONYMIZED_TELEMETRY, 'false');
  assert.throws(() => sanitizeServerConfig({ name: 'Unsafe', transport: 'stdio', command: 'node', env: { API_TOKEN: 'secret' } }, 'user-a'), /not allowlisted/);
  assert.throws(() => sanitizeServerConfig({ name: 'Unsafe', transport: 'stdio', command: 'node', env: { ANONYMIZED_TELEMETRY: 'false\nINJECTED=1' } }, 'user-a'), /single-line/);
});

test('MCP stdio startup diagnostics are redacted and included when initialization times out', async () => {
  const source = fs.readFileSync(path.resolve('electron/mcpBridge.cjs'), 'utf8');
  assert.match(source, /state\.stderr = safeMcpDiagnostic/);
  assert.match(source, /Server diagnostic:/);
  assert.match(source, /if \(!state \|\| !\(state\.pending instanceof Map\)\) return/);
  assert.match(source, /No startup diagnostic was written to stderr/);
  assert.match(source, /Bearer \[redacted\]/);
});

test('stdio MCP initialization has a separate budget for first-run dependency installation', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hubmind-mcp-startup-budget-test-'));
  const bridge = new McpBridge({ userDataPath, timeoutMs: 100, initializeTimeoutMs: 5000 });
  const fakeServer = [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "rl.on('line', line => {",
    "  let message; try { message = JSON.parse(line); } catch { return; }",
    "  if (message.method === 'initialize') {",
    "    setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'slow-start-server', version: '1' } } }) + '\\n'), 350);",
    "  } else if (message.method === 'tools/list' && message.id !== undefined) {",
    "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [] } }) + '\\n');",
    "  }",
    "});",
  ].join('\n');

  try {
    const servers = await bridge.saveServer({
      id: 'slow-start-server',
      name: 'Slow first-run server',
      transport: 'stdio',
      command: process.execPath,
      args: ['-e', fakeServer],
      enabled: true,
    }, 'user-a');
    assert.equal(servers[0].connected, true);
    assert.equal(servers[0].toolCount, 0);
  } finally {
    await bridge.shutdown();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('MCP stdio initialization uses a distinct configurable startup timeout', () => {
  const source = fs.readFileSync(path.resolve('electron/mcpBridge.cjs'), 'utf8');
  assert.match(source, /MCP_INITIALIZE_TIMEOUT_MS = 90_000/);
  assert.match(source, /initializeTimeoutMs = MCP_INITIALIZE_TIMEOUT_MS/);
  assert.match(source, /request\(state, method, params, timeoutMs = this\.timeoutMs\)/);
  assert.match(source, /this\.request\(state, 'initialize',[\s\S]{0,350}this\.initializeTimeoutMs\)/);
});

test('MCP initialize timeout includes a redacted child startup diagnostic', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hubmind-mcp-timeout-test-'));
  const bridge = new McpBridge({ userDataPath, timeoutMs: 700, initializeTimeoutMs: 700 });
  try {
    await assert.rejects(
      () => bridge.saveServer({
        id: 'timeout-server',
        name: 'Timeout diagnostic server',
        transport: 'stdio',
        command: process.execPath,
        args: ['-e', "process.stderr.write('TypeError: Cannot read properties of undefined (reading values)\\n'); process.stdin.resume();"],
        enabled: true,
      }, 'user-a'),
      /MCP initialize timed out\. Server diagnostic: TypeError/
    );
    const saved = bridge.listServers('user-a');
    assert.equal(saved.length, 1);
    assert.match(saved[0].error, /Server diagnostic: TypeError/);
  } finally {
    await bridge.shutdown();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
