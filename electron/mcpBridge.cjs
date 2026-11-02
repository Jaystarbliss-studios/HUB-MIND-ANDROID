const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');

const PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = 30_000;
// First-run stdio servers may create a virtual environment and install their dependencies before initialize completes.
const MCP_INITIALIZE_TIMEOUT_MS = 90_000;
const MAX_TOOL_OUTPUT_CHARS = 60_000;
const MAX_LINE_CHARS = 2_000_000;
const MAX_TOOLS_PER_SERVER = 100;

function cleanString(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeMcpDiagnostic(value, max = 2000) {
  return String(value ?? '')
    .replace(/(["']?(?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"'\s,;}{]+["']?/ig, '$1[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/ig, 'Bearer [redacted]')
    .slice(-max);
}

function sanitizeServerConfig(input, userId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('MCP server configuration must be an object.');
  const id = cleanString(input.id, 80) || ('mcp-' + randomUUID());
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(id)) throw new Error('MCP server ID must use letters, numbers, underscores or hyphens.');
  const name = cleanString(input.name, 80);
  if (!name) throw new Error('Give this MCP server a name.');
  const transport = input.transport === 'streamable-http' ? 'streamable-http' : input.transport === 'stdio' ? 'stdio' : '';
  if (!transport) throw new Error('Supported MCP transports are stdio and Streamable HTTP.');
  const enabled = input.enabled !== false;
  const config = { id, userId, name, transport, enabled };
  if (transport === 'stdio') {
    const command = cleanString(input.command, 500);
    if (!command) throw new Error('A stdio MCP server requires an executable path.');
    if (/[\r\n\0]/.test(command)) throw new Error('The executable path contains unsupported characters.');
    const args = Array.isArray(input.args) ? input.args.slice(0, 80).map(v => {
      if (typeof v !== 'string' || v.length > 2000 || /[\0]/.test(v)) throw new Error('MCP arguments must be strings no longer than 2,000 characters.');
      return v;
    }) : [];
    const env = sanitizeMcpEnvironment(input.env);

    const cwd = cleanString(input.cwd, 1000);
    if (cwd && !path.isAbsolute(cwd)) throw new Error('The MCP working directory must be an absolute path.');
    return { ...config, command, args, ...(cwd ? { cwd } : {}), ...(Object.keys(env).length ? { env } : {}) };
  }
  let url;
  try { url = new URL(cleanString(input.url, 2000)); } catch { throw new Error('Enter a valid MCP Streamable HTTP URL.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('MCP HTTP servers must use HTTPS. Plain HTTP is only allowed for localhost.');
  }
  if (url.username || url.password || url.hash) throw new Error('MCP URL must not contain credentials or a fragment.');
  return { ...config, url: url.toString() };
}

function safeModelToolName(serverId, originalName, used = new Set()) {
  const clean = value => String(value || '').trim().replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'tool';
  const base = 'mcp_' + clean(serverId) + '_' + clean(originalName);
  const suffix = createHash('sha256').update(String(serverId) + ':' + String(originalName)).digest('hex').slice(0, 8);
  let candidate = base.length <= 64 ? base : base.slice(0, 55) + '_' + suffix;
  if (used.has(candidate)) candidate = candidate.slice(0, 55) + '_' + suffix;
  let counter = 2;
  while (used.has(candidate)) {
    const tail = '_' + suffix + '_' + counter++;
    candidate = base.slice(0, 64 - tail.length) + tail;
  }
  used.add(candidate);
  return candidate;
}

function toGeminiSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 5) return { type: 'OBJECT', properties: {} };
  const typeMap = { object: 'OBJECT', string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY' };
  const type = typeMap[schema.type] || 'OBJECT';
  const out = { type };
  if (typeof schema.description === 'string') out.description = schema.description.slice(0, 1000);
  if (Array.isArray(schema.enum)) out.enum = schema.enum.filter(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean').slice(0, 100);
  if (type === 'OBJECT') {
    const properties = {};
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, value] of Object.entries(schema.properties).slice(0, 80)) {
        if (/^[a-zA-Z0-9_-]{1,80}$/.test(key)) properties[key] = toGeminiSchema(value, depth + 1);
      }
    }
    out.properties = properties;
    if (Array.isArray(schema.required)) out.required = schema.required.filter(k => typeof k === 'string' && Object.hasOwn(properties, k)).slice(0, 80);
  }
  if (type === 'ARRAY' && schema.items) out.items = toGeminiSchema(schema.items, depth + 1);
  return out;
}

const ALLOWED_MCP_ENV_KEYS = new Set([
  'ANONYMIZED_TELEMETRY',
  'WINDOWS_MCP_EXCLUDE_TOOLS',
  'WINDOWS_MCP_TOOLS',
  'WINDOWS_MCP_SCREENSHOT_SCALE',
  'WINDOWS_MCP_SCREENSHOT_BACKEND',
  'WINDOWS_MCP_DISABLE_FLASH',
]);

function sanitizeMcpEnvironment(input) {
  if (input === undefined || input === null) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('MCP environment settings must be an object.');
  const env = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_MCP_ENV_KEYS.has(key)) throw new Error('MCP environment key is not allowlisted: ' + key + '. Secrets and arbitrary environment overrides are not supported.');
    if (typeof value !== 'string' || value.length > 1000 || /[\r\n\0]/.test(value)) throw new Error('MCP environment values must be short, single-line strings.');
    env[key] = value;
  }
  return env;
}

function getSafeChildEnvironment(extra = {}) {
  const allowed = process.platform === 'win32'
    ? ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432']
    : ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL'];
  const env = {};
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  Object.assign(env, sanitizeMcpEnvironment(extra));
  return env;
}

function truncateToolResult(value) {
  let serialized;
  try { serialized = JSON.stringify(value); } catch { serialized = String(value); }
  if (serialized.length > MAX_TOOL_OUTPUT_CHARS) {
    return { content: [{ type: 'text', text: serialized.slice(0, MAX_TOOL_OUTPUT_CHARS) + '\n[Output truncated by Hub-Mind.]' }], isError: false, truncated: true };
  }
  return value;
}

class McpBridge {
  constructor({ userDataPath, spawnImpl = spawn, timeoutMs = REQUEST_TIMEOUT_MS, initializeTimeoutMs = MCP_INITIALIZE_TIMEOUT_MS, encryptConfig = null, decryptConfig = null, requireEncryptedStorage = false } = {}) {
    this.userDataPath = userDataPath || process.cwd();
    this.configPath = path.join(this.userDataPath, 'jess-mcp-servers.json');
    this.spawnImpl = spawnImpl;
    this.timeoutMs = timeoutMs;
    this.initializeTimeoutMs = Number.isFinite(initializeTimeoutMs) && initializeTimeoutMs > 0
      ? Math.max(this.timeoutMs, initializeTimeoutMs)
      : Math.max(this.timeoutMs, MCP_INITIALIZE_TIMEOUT_MS);
    this.encryptConfig = typeof encryptConfig === 'function' ? encryptConfig : null;
    this.decryptConfig = typeof decryptConfig === 'function' ? decryptConfig : null;
    this.requireEncryptedStorage = requireEncryptedStorage === true;
    this.configs = new Map();
    this.connections = new Map();
    this.toolIndex = new Map();
    this.requestCounter = 0;
    this.loadConfigs();
  }

  loadConfigs() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      let parsed;
      if (stored && stored.encrypted === true && typeof stored.payload === 'string') {
        if (!this.decryptConfig) return;
        parsed = JSON.parse(this.decryptConfig(stored.payload));
      } else {
        if (this.requireEncryptedStorage) return;
        parsed = stored;
      }
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        try {
          const config = sanitizeServerConfig(item, cleanString(item.userId, 256));
          if (config.userId) this.configs.set(this.key(config.userId, config.id), config);
        } catch { /* Ignore malformed persisted entries and keep the app launchable. */ }
      }
    } catch { /* First launch or unavailable device encryption. */ }
  }

  persistConfigs() {
    if (this.requireEncryptedStorage && !this.encryptConfig) {
      throw new Error('Encrypted MCP configuration storage is unavailable on this device. Configure Windows secure storage before saving MCP servers.');
    }
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const rows = JSON.stringify([...this.configs.values()], null, 2);
    const stored = this.encryptConfig
      ? JSON.stringify({ encrypted: true, payload: this.encryptConfig(rows) })
      : rows;
    const temp = this.configPath + '.tmp';
    fs.writeFileSync(temp, stored, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, this.configPath);
  }

  key(userId, id) { return userId + ':' + id; }

  listServers(userId) {
    return [...this.configs.values()].filter(c => c.userId === userId).map(c => {
      const connection = this.connections.get(this.key(userId, c.id));
      return { id: c.id, name: c.name, transport: c.transport, enabled: c.enabled, connected: !!connection?.connected, toolCount: connection?.tools?.length || 0, error: connection?.error || null };
    });
  }

  async saveServer(input, userId) {
    if (!cleanString(userId, 256)) throw new Error('A signed-in Hub-Mind user is required.');
    const config = sanitizeServerConfig(input, userId);
    const key = this.key(userId, config.id);
    const previous = this.configs.get(key);
    await this.disconnectServer(userId, config.id);
    this.configs.set(key, config);
    try {
      this.persistConfigs();
    } catch (error) {
      if (previous) this.configs.set(key, previous);
      else this.configs.delete(key);
      throw error;
    }
    if (config.enabled) await this.connectServer(userId, config.id);
    return this.listServers(userId);
  }

  async removeServer(userId, id) {
    const key = this.key(userId, id);
    const previous = this.configs.get(key);
    await this.disconnectServer(userId, id);
    this.configs.delete(key);
    try {
      this.persistConfigs();
    } catch (error) {
      if (previous) this.configs.set(key, previous);
      throw error;
    }
    return this.listServers(userId);
  }

  async connectServer(userId, id) {
    const key = this.key(userId, id);
    const config = this.configs.get(key);
    if (!config) throw new Error('MCP server configuration was not found for this account.');
    if (!config.enabled) throw new Error('This MCP server is disabled.');
    await this.disconnectServer(userId, id);
    const state = { connected: false, config, tools: [], pending: new Map(), nextId: 0, process: null, sessionId: null, protocolVersion: PROTOCOL_VERSION, buffer: '', stderr: '', processError: '' };
    this.connections.set(key, state);
    try {
      if (config.transport === 'stdio') await this.connectStdio(key, state);
      else await this.connectHttp(key, state);
      const response = await this.request(state, 'tools/list', {});
      const tools = Array.isArray(response?.tools) ? response.tools.slice(0, MAX_TOOLS_PER_SERVER) : [];
      const used = new Set(this.toolIndex.keys());
      state.tools = tools.filter(tool => tool && typeof tool.name === 'string' && /^[\w.-]{1,200}$/.test(tool.name)).map(tool => ({
        name: safeModelToolName(config.id, tool.name, used),
        originalName: tool.name,
        serverId: config.id,
        serverName: config.name,
        description: cleanString(tool.description, 1000) || ('Tool from ' + config.name),
        parameters: toGeminiSchema(tool.inputSchema),
      }));
      state.connected = true;
      for (const tool of state.tools) this.toolIndex.set(tool.name, { ...tool, userId, serverKey: key });
      return this.listServers(userId);
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message.slice(0, 500) : 'MCP server connection failed.';
      const diagnostic = safeMcpDiagnostic(state.stderr || state.processError, 1200);
      const message = diagnostic && !baseMessage.includes(diagnostic) ? baseMessage + ' Server diagnostic: ' + diagnostic : baseMessage;
      await this.disconnectServer(userId, id);
      this.connections.set(key, { config, connected: false, tools: [], error: message });
      throw new Error('Could not connect to ' + config.name + ': ' + message);
    }
  }

  async connectStdio(key, state) {
    const config = state.config;
    const child = this.spawnImpl(config.command, config.args || [], {
      cwd: config.cwd || undefined,
      env: getSafeChildEnvironment(config.env),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    state.process = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => this.consumeStdout(state, chunk));
    child.stderr.on('data', chunk => {
      // Retain only a short redacted diagnostic for the connection error UI; never write raw stderr to logs.
      state.stderr = safeMcpDiagnostic(state.stderr + String(chunk), 2000);
    });
    child.on('error', error => {
      state.processError = safeMcpDiagnostic(error?.message || error, 1000);
      this.failPending(state, new Error('MCP process launch failed: ' + state.processError));
    });
    child.on('exit', (code, signal) => {
      state.connected = false;
      const detail = state.stderr ? ' Server diagnostic: ' + safeMcpDiagnostic(state.stderr, 1200) : '';
      this.failPending(state, new Error('MCP process exited (' + (code ?? signal ?? 'unknown') + ').' + detail));
    });
    await this.request(state, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'Hub-Mind Jess', version: '0.1.0' },
    }, this.initializeTimeoutMs);
    this.notify(state, 'notifications/initialized', {});
  }

  async connectHttp(key, state) {
    const response = await this.httpRequest(state, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'Hub-Mind Jess', version: '0.1.0' },
    }, true);
    state.sessionId = response.sessionId || null;
    state.protocolVersion = response.protocolVersion || PROTOCOL_VERSION;
    await this.httpRequest(state, 'notifications/initialized', {}, false, true);
  }

  consumeStdout(state, chunk) {
    state.buffer += chunk;
    if (state.buffer.length > MAX_LINE_CHARS * 2) {
      state.buffer = '';
      this.failPending(state, new Error('MCP server output exceeded the message limit.'));
      try { state.process?.kill(); } catch {}
      return;
    }
    let newline;
    while ((newline = state.buffer.indexOf('\n')) >= 0) {
      const line = state.buffer.slice(0, newline).trim();
      state.buffer = state.buffer.slice(newline + 1);
      if (!line) continue;
      if (line.length > MAX_LINE_CHARS) {
        this.failPending(state, new Error('MCP server message exceeded the message limit.'));
        try { state.process?.kill(); } catch {}
        return;
      }
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message && message.id !== undefined && state.pending.has(String(message.id))) {
        const pending = state.pending.get(String(message.id));
        state.pending.delete(String(message.id));
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(cleanString(message.error.message, 1000) || 'MCP JSON-RPC error.'));
        else pending.resolve(message.result || {});
      }
    }
  }

  failPending(state, error) {
    if (!state || !(state.pending instanceof Map)) return;
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    state.pending.clear();
  }

  request(state, method, params, timeoutMs = this.timeoutMs) {
    if (state.config.transport === 'streamable-http') return this.httpRequest(state, method, params, false);
    if (!state.process || state.process.killed || !state.process.stdin.writable) return Promise.reject(new Error('MCP server process is not running.'));
    const id = ++this.requestCounter;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(String(id));
        const diagnostic = safeMcpDiagnostic(state.stderr || state.processError, 1200);
        reject(new Error('MCP ' + method + ' timed out.' + (diagnostic ? ' Server diagnostic: ' + diagnostic : ' No startup diagnostic was written to stderr.')));
      }, timeoutMs);
      state.pending.set(String(id), { resolve, reject, timer });
      state.process.stdin.write(JSON.stringify(payload) + '\n', error => {
        if (!error) return;
        clearTimeout(timer);
        state.pending.delete(String(id));
        reject(error);
      });
    });
  }

  notify(state, method, params) {
    if (state.config.transport === 'streamable-http') {
      void this.httpRequest(state, method, params, false, true).catch(() => {});
      return;
    }
    try { state.process?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); } catch {}
  }

  async readSseResponse(response, expectedId) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('MCP server returned an unreadable event stream.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let dataLines = [];
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          let line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line === '') {
            if (dataLines.length) {
              const raw = dataLines.join('\n');
              dataLines = [];
              if (raw !== '[DONE]') {
                let message;
                try { message = JSON.parse(raw); } catch { continue; }
                if (String(message?.id) === String(expectedId)) return message;
              }
            }
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }
    throw new Error('MCP event stream ended before returning the requested response.');
  }

  async httpRequest(state, method, params, initialize = false, notification = false) {
    const body = { jsonrpc: '2.0', ...(notification ? {} : { id: ++this.requestCounter }), method, params };
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (!initialize && state.sessionId) headers['Mcp-Session-Id'] = state.sessionId;
    if (!initialize && state.protocolVersion) headers['MCP-Protocol-Version'] = state.protocolVersion;
    const response = await fetch(state.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    if (response.status === 202 && notification) return {};
    if (!response.ok) throw new Error('MCP HTTP request failed (' + response.status + ').');
    const sessionId = response.headers.get('mcp-session-id');
    const contentType = response.headers.get('content-type') || '';
    if (notification || response.status === 204) return { sessionId };
    let result;
    if (contentType.includes('application/json')) {
      const message = await response.json();
      if (message?.error) throw new Error(cleanString(message.error.message, 1000) || 'MCP JSON-RPC error.');
      result = message?.result || {};
    } else if (contentType.includes('text/event-stream')) {
      const message = await this.readSseResponse(response, body.id);
      if (message?.error) throw new Error(cleanString(message.error.message, 1000) || 'MCP JSON-RPC error.');
      result = message?.result || {};
    } else {
      throw new Error('MCP server returned an unsupported response content type.');
    }
    return { ...result, sessionId };
  }

  async disconnectServer(userId, id) {
    const key = this.key(userId, id);
    const state = this.connections.get(key);
    if (state) {
      state.connected = false;
      this.failPending(state, new Error('MCP server disconnected.'));
      try { state.process?.kill(); } catch {}
      for (const [name, entry] of this.toolIndex) if (entry.serverKey === key) this.toolIndex.delete(name);
    }
    this.connections.delete(key);
    return this.listServers(userId);
  }

  listTools(userId) {
    return [...this.toolIndex.entries()]
      .filter(([, entry]) => entry.userId === userId && this.connections.get(entry.serverKey)?.connected)
      .map(([name, entry]) => ({
        name, description: entry.description, parameters: entry.parameters,
        serverId: entry.serverId, serverName: entry.serverName, originalName: entry.originalName,
      }));
  }

  resolveTool(userId, modelName) {
    const entry = this.toolIndex.get(modelName);
    if (!entry || entry.userId !== userId) return null;
    const state = this.connections.get(entry.serverKey);
    if (!state?.connected) return null;
    return { entry, state };
  }

  async callTool(userId, modelName, args) {
    const resolved = this.resolveTool(userId, modelName);
    if (!resolved) throw new Error('MCP tool is not available for this signed-in user or its server is disconnected.');
    const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const result = await this.request(resolved.state, 'tools/call', { name: resolved.entry.originalName, arguments: safeArgs });
    return truncateToolResult(result);
  }

  shutdown() {
    const keys = [...this.connections.keys()];
    for (const key of keys) {
      const index = key.indexOf(':');
      const userId = key.slice(0, index);
      const id = key.slice(index + 1);
      void this.disconnectServer(userId, id);
    }
  }
}

module.exports = { McpBridge, sanitizeServerConfig, safeModelToolName, toGeminiSchema, getSafeChildEnvironment };
