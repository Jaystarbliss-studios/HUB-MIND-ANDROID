'use strict';
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PIPE_NAME = '\\\\.\\pipe\\hubmind-jess-chrome-v1';
const MAX_LINE = 1024 * 1024;
let server = null;
let client = null;
let buffer = '';
let authenticated = false;
let authTimer = null;
let lastHandshakeAt = null;
let lastDisconnectAt = null;
let lastError = null;
let serverRestartTimer = null;
let serverRestartAttempt = 0;
let shuttingDown = false;
const pending = new Map();
function readBridgeToken() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const file = path.join(local, 'Jaystarbliss', 'Hub-Mind', 'JessChromeBridge', 'bridge-token');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}
function tokenMatches(received) {
  const expected = readBridgeToken();
  if (!expected || typeof received !== 'string') return false;
  const left = Buffer.from(expected, 'utf8'), right = Buffer.from(received, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function scheduleServerRestart() {
  if (process.platform !== 'win32' || shuttingDown || serverRestartTimer) return;
  const delayMs = Math.min(30000, 500 * (2 ** Math.min(serverRestartAttempt, 6)));
  serverRestartAttempt += 1;
  serverRestartTimer = setTimeout(() => {
    serverRestartTimer = null;
    if (!server?.listening) {
      server = null;
      start();
    }
  }, delayMs);
  serverRestartTimer.unref?.();
}

function start() {
  if (process.platform !== 'win32' || server?.listening || shuttingDown) return;
  if (server) return;
  const instance = net.createServer(socket => {
    if (client && !client.destroyed) { socket.destroy(); return; }
    client = socket;
    authenticated = false;
    buffer = '';
    if (authTimer) clearTimeout(authTimer);
    authTimer = setTimeout(() => { if (client === socket && !authenticated) { lastError = 'Chrome native host handshake timed out before authentication.'; socket.destroy(); } }, 5000);
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > MAX_LINE * 2) { socket.destroy(); return; }
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        let response;
        try { response = JSON.parse(line); } catch { socket.destroy(); return; }
        if (!authenticated) {
          if (response?.type !== 'hello' || !tokenMatches(response.token)) { lastError = 'Rejected unauthenticated Chrome native-messaging client.'; console.warn('[Jess Chrome bridge] Rejected unauthenticated named-pipe client.'); socket.destroy(); return; }
          authenticated = true;
          lastHandshakeAt = new Date().toISOString();
          lastError = null;
          if (authTimer) clearTimeout(authTimer);
          authTimer = null;
          socket.write(JSON.stringify({ type: 'hello-ack' }) + '\n');
          continue;
        }
        const waiter = pending.get(String(response.id || ''));
        if (!waiter) continue;
        pending.delete(String(response.id));
        clearTimeout(waiter.timer);
        waiter.resolve(response.result || { ok: false, verified: false, error: 'Chrome extension returned an empty result.' });
      }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (client === socket) { client = null; authenticated = false; lastDisconnectAt = new Date().toISOString(); if (!lastError) lastError = 'Chrome native-messaging connection closed.'; }
      if (authTimer) { clearTimeout(authTimer); authTimer = null; }
      for (const [id, waiter] of pending) {
        clearTimeout(waiter.timer);
        waiter.resolve({ ok: false, verified: false, error: 'Chrome native messaging connection closed.' });
        pending.delete(id);
      }
    });
  });
  instance.on('listening', () => {
    if (server !== instance) return;
    serverRestartAttempt = 0;
    lastError = null;
  });
  instance.on('error', error => {
    lastError = String(error?.message || error).slice(0, 500);
    console.error('[Jess Chrome bridge]', lastError);
    if (server === instance) server = null;
    try { instance.close(); } catch {}
    scheduleServerRestart();
  });
  instance.on('close', () => {
    if (server === instance) server = null;
    if (!shuttingDown) scheduleServerRestart();
  });
  server = instance;
  try { instance.listen(PIPE_NAME); }
  catch (error) {
    lastError = String(error?.message || error).slice(0, 500);
    server = null;
    scheduleServerRestart();
  }
}

function status() {
  const connected = !!client && !client.destroyed;
  return {
    available: connected && authenticated,
    serverListening: !!server?.listening,
    connected,
    authenticated,
    pendingRequests: pending.size,
    lastHandshakeAt,
    lastDisconnectAt,
    lastError,
    transport: 'Authenticated Chrome Native Messaging',
    pipe: PIPE_NAME,
  };
}

function request(method, args = {}, timeoutMs = 12000) {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, verified: false, error: 'Chrome native messaging is available only in the Windows desktop app.' });
  if (!client || client.destroyed || !authenticated) return Promise.resolve({ ok: false, verified: false, error: 'Chrome bridge is not connected. Install/enable the Jess Chrome extension and keep Hub-Mind running.' });
  const id = crypto.randomUUID();
  const message = JSON.stringify({ id, method, args });
  if (Buffer.byteLength(message, 'utf8') > MAX_LINE) return Promise.resolve({ ok: false, verified: false, error: 'Chrome request exceeds the 1 MiB limit.' });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, verified: false, error: 'Chrome action timed out: ' + method });
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    client.write(message + '\n', error => {
      if (!error) return;
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      clearTimeout(timer);
      resolve({ ok: false, verified: false, error: 'Chrome request could not be sent: ' + error.message });
    });
  });
}

function cancelPending(reason = 'Full Control Session stopped.') {
  const socket = client;
  client = null;
  authenticated = false;
  if (authTimer) { clearTimeout(authTimer); authTimer = null; }
  for (const [id, waiter] of pending) {
    clearTimeout(waiter.timer);
    waiter.resolve({ ok: false, verified: false, error: reason });
    pending.delete(id);
  }
  try { socket?.destroy(); } catch {}
}

function stop() {
  shuttingDown = true;
  if (serverRestartTimer) { clearTimeout(serverRestartTimer); serverRestartTimer = null; }
  cancelPending('Chrome bridge stopped.');
  const current = server;
  server = null;
  try { current?.close(); } catch {}
}
module.exports = { start, stop, status, request, cancelPending };
