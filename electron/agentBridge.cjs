const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const { randomUUID } = require('node:crypto');

let child = null, nextId = 0;
let childReady = false, childReadyPromise = null;
let lastStartedAt = null, lastExitedAt = null, lastError = null, lastExitCode = null, lastExitSignal = null, lastStderr = null, lastScriptPath = null;
const pending = new Map();

function safeDiagnostic(value) {
  return String(value ?? '')
    .replace(/(["']?(?:token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"'\s,;}{]+["']?/ig, '$1[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/ig, 'Bearer [redacted]')
    .slice(0, 500);
}

function resolveScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'jess-agent.ps1')
    : path.join(__dirname, 'jess-agent.ps1');
}

function status() {
  const scriptPath = lastScriptPath || resolveScriptPath();
  return {
    available: process.platform === 'win32',
    running: !!child && child.exitCode === null && !child.killed,
    ready: childReady,
    pid: child?.pid ?? null,
    pendingRequests: pending.size,
    lastStartedAt,
    lastExitedAt,
    lastError,
    lastExitCode,
    lastExitSignal,
    lastStderr,
    scriptExists: fs.existsSync(scriptPath),
    scriptPath,
  };
}
const MAX_RESPONSE_LINE_CHARS = 16 * 1024 * 1024;
const MAX_STDERR_CHARS = 1200;

function audit(event, details = {}) {
  try {
    const file = path.join(app.getPath('userData'), 'jess-agent-runtime.jsonl');
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event, ...details }) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn('[Jess agent audit] Could not write runtime log:', error?.message || error);
  }
}

function ensureAgent() {
  if (child && child.exitCode === null && !child.killed) return child;
  const scriptPath = resolveScriptPath();
  lastScriptPath = scriptPath;
  if (!fs.existsSync(scriptPath)) { lastError = 'Jess native agent script is missing from this build: ' + scriptPath; throw new Error(lastError); }

  const spawned = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  });
  child = spawned;
  let processBuffer = '';
  childReady = false;
  lastStartedAt = new Date().toISOString();
  lastError = null;
  lastExitCode = null;
  lastExitSignal = null;
  lastStderr = null;
  let readyResolve;
  let readyReject;
  let readySettled = false;
  const readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  childReadyPromise = readyPromise;
  let readyTimer = null;
  const settleReady = error => {
    if (readySettled) return;
    readySettled = true;
    if (readyTimer) clearTimeout(readyTimer);
    if (error) readyReject(error);
    else { childReady = true; readyResolve(); }
  };
  readyTimer = setTimeout(() => {
    const message = 'Native helper startup timed out before the ready handshake (60 seconds).';
    lastError = message;
    audit('sidecar-startup-timeout', { pid: spawned.pid, error: message });
    settleReady(new Error(message + (lastStderr ? ' Diagnostic: ' + lastStderr : '')));
    if (child === spawned) { child = null; childReady = false; if (childReadyPromise === readyPromise) childReadyPromise = null; }
    try { spawned.kill(); } catch {}
  }, 60000);
  spawned.stdout.setEncoding('utf8');
  audit('sidecar-started', { pid: spawned.pid, scriptPath });

  spawned.stdout.on('data', chunk => {
    processBuffer += chunk;
    if (processBuffer.length > MAX_RESPONSE_LINE_CHARS && !processBuffer.includes('\n')) {
      lastError = 'Native helper response exceeded the 16 MB protocol limit.';
      audit('sidecar-protocol-overflow', { pid: spawned.pid, bufferedChars: processBuffer.length, error: lastError });
      try { spawned.kill(); } catch {}
      return;
    }
    while (true) {
      const at = processBuffer.indexOf('\n');
      if (at < 0) break;
      const line = processBuffer.slice(0, at).trim();
      processBuffer = processBuffer.slice(at + 1);
      if (!line) continue;
      if (line.length > MAX_RESPONSE_LINE_CHARS) {
        lastError = 'Native helper returned a response line above the 16 MB protocol limit.';
        audit('sidecar-oversized-line', { pid: spawned.pid, chars: line.length, error: lastError });
        continue;
      }
      try {
        const message = JSON.parse(line);
        if (message?.type === 'ready') {
          settleReady();
          audit('sidecar-ready', { pid: spawned.pid, elapsedMs: Date.now() - Date.parse(lastStartedAt) });
          continue;
        }
        const wait = pending.get(message.id);
        if (wait) {
          pending.delete(message.id);
          clearTimeout(wait.timer);
          audit('action-completed', { method: wait.method, durationMs: Date.now() - wait.started, ok: message.result?.ok === true, verified: message.result?.verified === true });
          wait.resolve(message.result);
        }
      } catch (error) {
        lastError = safeDiagnostic('Native helper returned invalid JSON: ' + String(error?.message || error));
        audit('sidecar-invalid-json', { pid: spawned.pid, error: lastError });
      }
    }
  });

  spawned.stderr.on('data', chunk => {
    const message = safeDiagnostic(String(chunk).slice(0, MAX_STDERR_CHARS));
    lastStderr = message.slice(-500);
    lastError = lastStderr;
    console.warn('[Jess native agent]', message);
    audit('sidecar-stderr', { pid: spawned.pid, message });
  });
  spawned.on('error', error => {
    lastError = safeDiagnostic(error?.message || error);
    settleReady(new Error('Native helper process failed to start: ' + lastError));
    audit('sidecar-process-error', { pid: spawned.pid, error: lastError });
  });
  spawned.on('exit', (code, signal) => {
    lastExitedAt = new Date().toISOString();
    lastExitCode = code;
    lastExitSignal = signal;
    if (!readySettled) settleReady(new Error('Native helper exited before the ready handshake (' + (code ?? signal ?? 'unknown') + ').' + (lastStderr ? ' Diagnostic: ' + lastStderr : '')));
    if (code !== 0 || signal) lastError = lastError || safeDiagnostic('Native helper exited (' + (code ?? signal ?? 'unknown') + ').');
    else if (pending.size > 0) lastError = safeDiagnostic('Native helper exited while requests were pending.');
    audit('sidecar-exited', { pid: spawned.pid, code, signal, pending: pending.size });
    for (const [id, wait] of pending) {
      clearTimeout(wait.timer);
      wait.reject(new Error('Jess native agent exited (' + (code ?? signal ?? 'unknown') + ')'));
      pending.delete(id);
    }
    if (child === spawned) { child = null; childReady = false; if (childReadyPromise === readyPromise) childReadyPromise = null; }
  });
  return spawned;
}

function awaitReady(proc) {
  const readiness = childReadyPromise;
  if (!readiness) return Promise.reject(new Error('Native helper startup handshake is unavailable.'));
  return readiness.then(() => {
    if (child !== proc || proc.exitCode !== null || proc.killed || !childReady) throw new Error('Native helper exited immediately after startup.');
  });
}

function call(method, args = {}, timeout = 15000) {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, verified: false, evidence: null, error: 'Native Windows control is only available in the Windows desktop build.' });
  let proc;
  try { proc = ensureAgent(); }
  catch (error) {
    lastError = safeDiagnostic(error?.message || error);
    audit('sidecar-start-failed', { method, error: lastError });
    return Promise.reject(new Error(lastError));
  }
  return awaitReady(proc).then(() => new Promise((resolve, reject) => {
  if (!proc.stdin?.writable) { reject(new Error('Native helper stdin is not writable after startup.')); return; }
  const id = (++nextId) + '-' + randomUUID();
  const started = Date.now();
    const timer = setTimeout(() => {
      pending.delete(id);
      lastError = safeDiagnostic('Native action timed out: ' + method + '.');
      audit('action-timeout', { method, durationMs: Date.now() - started, timeoutMs: timeout, error: lastError });
      if (child === proc && proc.exitCode === null) {
        try { proc.kill(); } catch {}
        child = null;
        childReady = false;
        childReadyPromise = null;
      }
      reject(new Error('Native action timed out: ' + method + '. The sidecar was stopped to prevent a hung command from blocking later actions.'));
    }, timeout);
    pending.set(id, { resolve, reject, timer, method, started });
    audit('action-started', { method, timeoutMs: timeout });
    proc.stdin.write(JSON.stringify({ id, method, args }) + '\n', error => {
      if (!error) return;
      const wait = pending.get(id);
      if (!wait) return;
      pending.delete(id);
      clearTimeout(timer);
      lastError = safeDiagnostic('Could not write request to native helper: ' + String(error?.message || error));
      audit('action-write-failed', { method, error: lastError });
      reject(new Error(lastError));
    });
  }));
}

function stop() {
  childReady = false;
  childReadyPromise = null;
  if (child) {
    audit('sidecar-stop-requested', { pid: child.pid, pending: pending.size });
    try { child.kill(); } catch {}
    child = null;
  }
  for (const [id, wait] of pending) {
    clearTimeout(wait.timer);
    wait.reject(new Error('Jess native agent stopped'));
    pending.delete(id);
  }
}

app.on('before-quit', stop);
module.exports = { call, stop, status };
