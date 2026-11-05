// Clean up tsx injected global.__dirname so ESM packages like vite-plugin-pwa don't receive "." in createRequire
if (typeof (globalThis as any).__dirname === "string" && !(globalThis as any).__dirname.startsWith("/")) {
  delete (globalThis as any).__dirname;
}
if (typeof (global as any).__dirname === "string" && !(global as any).__dirname.startsWith("/")) {
  delete (global as any).__dirname;
}

import { coreIdentity, groqAdapter, ollamaAdapter, geminiAdapter } from "./src/ai/prompts/adapters.ts";
import { getJessToolsForRuntime } from "./src/shared/jessNativeToolNames.ts";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer, createLogger } from "vite";
import OpenAI from "openai";
import { WebSocketServer } from "ws";
import { createHash, randomUUID } from "node:crypto";
import { firebaseAdminRequest, firestoreDocumentUrl, firebaseAuthAdminUrl, decodeFirestoreFields, encodeFirestoreFields } from "./src/server/firebaseAdminRest.ts";
import { getFullRepositoryStatus, fetchHubMindReleases, fetchHubMindCommits, inspectCodebase } from "./src/server/githubService.ts";
import { performGlobalWebSearch } from "./src/server/webSearchService.ts";

const customLogger = createLogger();
const origLoggerError = customLogger.error.bind(customLogger);
const origLoggerWarn = customLogger.warn.bind(customLogger);
const origLoggerInfo = customLogger.info.bind(customLogger);

const isBenignViteNotice = (msg: unknown) => {
  const l = String(msg || '').toLowerCase();
  return l.includes('websocket') || l.includes('ws') || l.includes('hmr') || l.includes('[vite]') || l.includes('vite:') || l.includes('failed to connect') || l.includes('vite');
};

customLogger.error = (msg, options) => {
  if (isBenignViteNotice(msg)) return;
  origLoggerError(msg, options);
};
customLogger.warn = (msg, options) => {
  if (isBenignViteNotice(msg)) return;
  origLoggerWarn(msg, options);
};
customLogger.info = (msg, options) => {
  if (isBenignViteNotice(msg)) return;
  origLoggerInfo(msg, options);
};

const origConsoleLog = console.log;
const origConsoleWarn = console.warn;
const origConsoleError = console.error;
const origConsoleInfo = console.info;
const origConsoleDebug = console.debug;

const isViteLog = (...args: any[]) => {
  return args.some((arg) => {
    if (!arg) return false;
    const str = typeof arg === 'string' ? arg : (typeof arg === 'object' ? (arg.message || String(arg)) : String(arg));
    const lower = str.toLowerCase();
    return lower.includes('[vite]') || lower.includes('vite:') || lower.includes('failed to connect to websocket') || lower.includes('vite-hmr');
  });
};

console.log = (...args) => { if (!isViteLog(...args)) origConsoleLog.apply(console, args); };
console.warn = (...args) => { if (!isViteLog(...args)) origConsoleWarn.apply(console, args); };
console.error = (...args) => { if (!isViteLog(...args)) origConsoleError.apply(console, args); };
console.info = (...args) => { if (!isViteLog(...args)) origConsoleInfo.apply(console, args); };
console.debug = (...args) => { if (!isViteLog(...args)) origConsoleDebug.apply(console, args); };


const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0197530608';
    const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || 'dev-api-key';
    const appId = process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '1:123311605381:web:hubmind';
    const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123311605381';
    const authDomain = process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
    const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID || 'ai-studio-hubmind-4cac2024-c6eb-4208-80cf-928714dfd430';
    const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      firebase: {
        apiKey,
        projectId,
        appId,
        messagingSenderId,
        authDomain,
        storageBucket,
        firestoreDatabaseId,
      },
      googleClientId,
    });
  });

  const bootstrapAdminEmails = new Set(['johnrufai242@gmail.com', 'rufaijohnny@gmail.com']);
  const verifyAdminRequest = async (req: any) => {
    const authHeader = String(req.headers.authorization || '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken || idToken.length > 10000) { const e: any = new Error('Sign in again to manage users.'); e.status = 401; throw e; }
    const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
    if (!apiKey) { const e: any = new Error('Firebase token verification is not configured on this server.'); e.status = 503; throw e; }
    const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(10000),
    });
    const data: any = await response.json().catch(() => ({}));
    const identity = data?.users?.[0];
    if (!response.ok || !identity?.localId || identity.disabled) { const e: any = new Error('Your sign-in session is invalid or expired.'); e.status = 401; throw e; }
    const email = String(identity.email || '').trim().toLowerCase();
    let profile: any = null;
    try { const doc = await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(identity.localId))); profile = decodeFirestoreFields(doc?.fields || {}); }
    catch (error: any) { if (error?.status !== 404) throw error; }
    if (!((profile?.role === 'admin' && profile?.status === 'active') || bootstrapAdminEmails.has(email))) {
      const e: any = new Error('Administrator permission is required for this action.'); e.status = 403; throw e;
    }
    return { uid: identity.localId, email, profile };
  };
  const authenticatedDeviceSessionCache = new Map<string, { uid: string; email: string; profile: any; expiresAt: number }>();
  const verifyAuthenticatedHubMindRequest = async (req: any) => {
    const authHeader = String(req.headers.authorization || '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken || idToken.length > 10000) {
      const error: any = new Error('Sign in to Hub-Mind before using device controls.');
      error.status = 401;
      throw error;
    }

    const cacheKey = createHash('sha256').update(idToken).digest('hex');
    const cachedSession = authenticatedDeviceSessionCache.get(cacheKey);
    if (cachedSession && cachedSession.expiresAt > Date.now()) {
      return { uid: cachedSession.uid, email: cachedSession.email, profile: cachedSession.profile };
    }

    const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      const error: any = new Error('Firebase token verification is not configured on this server.');
      error.status = 503;
      throw error;
    }

    const response = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data: any = await response.json().catch(() => ({}));
    const identity = data?.users?.[0];
    if (!response.ok || !identity?.localId || identity.disabled) {
      const error: any = new Error('Your Hub-Mind sign-in session is invalid or expired.');
      error.status = 401;
      throw error;
    }

    const profileResponse: any = await firebaseAdminRequest(
      firestoreDocumentUrl('users/' + encodeURIComponent(identity.localId)),
    );
    const profile = decodeFirestoreFields(profileResponse?.fields || {});
    if (profile?.status !== 'active' || !['admin', 'staff'].includes(String(profile?.role || ''))) {
      const error: any = new Error('Your Hub-Mind account is not active for device control.');
      error.status = 403;
      throw error;
    }
    const verifiedSession = {
      uid: identity.localId,
      email: String(identity.email || '').trim().toLowerCase(),
      profile,
      expiresAt: Date.now() + 30_000,
    };
    authenticatedDeviceSessionCache.set(cacheKey, verifiedSession);
    if (authenticatedDeviceSessionCache.size > 5000) {
      for (const [key, value] of authenticatedDeviceSessionCache) {
        if (value.expiresAt <= Date.now()) authenticatedDeviceSessionCache.delete(key);
      }
    }
    return { uid: verifiedSession.uid, email: verifiedSession.email, profile: verifiedSession.profile };
  };

  const listAdminUserProfiles = async () => {
    const data: any = await firebaseAdminRequest(firestoreDocumentUrl('users?pageSize=1000'));
    return (data?.documents || []).map((entry: any) => ({ id: String(entry.name || '').split('/').pop() || '', ...decodeFirestoreFields(entry.fields || {}) }));
  };
  const logAdminUserAction = async (actorId: string, action: string, targetId: string, details: string) => {
    try {
      await firebaseAdminRequest(firestoreDocumentUrl('activityLogs'), { method: 'POST', body: JSON.stringify({ fields: encodeFirestoreFields({
        userId: actorId, actorId, action, entityType: 'user', entityId: targetId, details, createdAt: new Date().toISOString(),
      }) }) });
    } catch (error: any) { console.warn('[Admin] Could not write user-management audit log:', error?.message || error); }
  };

  app.patch('/api/admin/users/:uid', async (req, res) => {
    try {
      const actor = await verifyAdminRequest(req);
      const uid = String(req.params.uid || '');
      if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) return res.status(400).json({ error: 'Invalid user ID.' });
      const patch: Record<string, any> = {};
      if (req.body?.role !== undefined) {
        if (!['admin', 'staff'].includes(req.body.role)) return res.status(400).json({ error: 'Role must be admin or staff.' });
        patch.role = req.body.role;
      }
      if (req.body?.status !== undefined) {
        if (!['active', 'suspended', 'inactive'].includes(req.body.status)) return res.status(400).json({ error: 'Status must be active, suspended, or inactive.' });
        patch.status = req.body.status;
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Provide a role or status to update.' });
      if (uid === actor.uid && (patch.role && patch.role !== 'admin' || patch.status && patch.status !== 'active')) return res.status(400).json({ error: 'You cannot remove your own administrator access.' });
      const targetResponse: any = await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)));
      const target = decodeFirestoreFields(targetResponse?.fields || {});
      if (bootstrapAdminEmails.has(String(target.email || '').toLowerCase())) return res.status(403).json({ error: 'The bootstrap administrator account is protected from role changes.' });
      if ((patch.role && patch.role !== 'admin' || patch.status && patch.status !== 'active') && target.role === 'admin' && target.status === 'active') {
        const admins = (await listAdminUserProfiles()).filter((user: any) => user.role === 'admin' && user.status === 'active');
        if (admins.length <= 1) return res.status(409).json({ error: 'Keep at least one active administrator in Hub-Mind.' });
      }
      const params = new URLSearchParams();
      Object.keys(patch).forEach(key => params.append('updateMask.fieldPaths', key));
      await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)) + '?' + params.toString(), { method: 'PATCH', body: JSON.stringify({ fields: encodeFirestoreFields(patch) }) });
      await logAdminUserAction(actor.uid, 'updated access for', uid, JSON.stringify(patch));
      return res.json({ success: true, uid, ...patch });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Admin] User update failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not update this user. Check server administrative credentials and logs.' : (error?.message || 'User update failed.') });
    }
  });

  app.delete('/api/admin/users/:uid', async (req, res) => {
    try {
      const actor = await verifyAdminRequest(req);
      const uid = String(req.params.uid || '');
      if (!/^[A-Za-z0-9_-]{10,128}$/.test(uid)) return res.status(400).json({ error: 'Invalid user ID.' });
      if (uid === actor.uid) return res.status(400).json({ error: 'You cannot delete your own signed-in administrator account.' });
      const targetResponse: any = await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)));
      const target = decodeFirestoreFields(targetResponse?.fields || {});
      if (bootstrapAdminEmails.has(String(target.email || '').toLowerCase())) return res.status(403).json({ error: 'The bootstrap administrator account is protected from deletion.' });
      if (target.role === 'admin' && target.status === 'active') {
        const admins = (await listAdminUserProfiles()).filter((user: any) => user.role === 'admin' && user.status === 'active');
        if (admins.length <= 1) return res.status(409).json({ error: 'You cannot delete the last active administrator.' });
      }
      await firebaseAdminRequest(firebaseAuthAdminUrl('update'), { method: 'POST', body: JSON.stringify({ localId: uid, disableUser: true }) });
      await firebaseAdminRequest(firestoreDocumentUrl('users/' + encodeURIComponent(uid)), { method: 'DELETE' });
      await firebaseAdminRequest(firebaseAuthAdminUrl('delete'), { method: 'POST', body: JSON.stringify({ localId: uid }) });
      await logAdminUserAction(actor.uid, 'deleted account for', uid, 'Firebase Authentication account and users profile deleted; authored workspace records retained.');
      return res.json({ success: true, uid, message: 'Sign-in account and user profile deleted. Existing workspace records were retained.' });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Admin] User deletion failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not delete this account. Check server administrative credentials and logs; the account may have been disabled if deletion failed part-way through.' : (error?.message || 'User deletion failed.') });
    }
  });


  // Authenticated cross-device command plane. Device records and commands are scoped
  // to the verified Firebase uid; clients can never address another user's device paths.
  const androidActionTypes = new Set([
    'TAP', 'DOUBLE_TAP', 'LONG_PRESS', 'SWIPE', 'SCROLL', 'TYPE_TEXT', 'CLEAR_TEXT',
    'OPEN_APP', 'GET_INSTALLED_APPS', 'GET_SCREEN_HIERARCHY', 'CAPTURE_SCREEN',
    'SET_CLIPBOARD', 'GET_CLIPBOARD', 'NAVIGATE_BACK', 'GO_HOME', 'OPEN_RECENTS',
    'OPEN_NOTIFICATIONS', 'OPEN_QUICK_SETTINGS',
  ]);
  // Windows commands are accepted only for the registered Windows endpoint; the
  // desktop receiver performs a second local Full Control check before execution.
  const windowsActionTypes = new Set([
    'list_windows', 'manage_windows', 'control_mouse', 'drag_windows_mouse',
    'type_windows_text', 'press_windows_keys', 'control_system_volume',
    'control_screen_brightness', 'take_windows_screenshot',
    'find_windows_ui_element', 'list_windows_ui_elements', 'invoke_windows_ui_element',
    'set_windows_ui_value', 'read_windows_screen', 'open_local_windows_path',
    'launch_windows_application', 'get_windows_time', 'get_windows_system_info',
    'chrome_bridge_status', 'chrome_list_tabs', 'chrome_open_tab', 'chrome_close_tab',
    'chrome_activate_tab', 'chrome_navigate_tab', 'chrome_reload_tab',
    'chrome_read_page', 'chrome_find_element', 'chrome_click_element',
    'chrome_fill_field', 'chrome_scroll', 'chrome_capture_screenshot',
    'manage_windows_files', 'manage_windows_clipboard', 'control_windows_power',
    'scan_windows_storage', 'clean_windows_storage_candidates',
    'start_windows_auto_scroll', 'stop_windows_auto_scroll', 'show_hub_mind_workspace',
    'jess_stop', 'desktop_run_readonly_command', 'desktop_open_website',
  ]);
  const safeDeviceId = (value: unknown) => /^[A-Za-z0-9_-]{6,128}$/.test(String(value || ''));
  const userDevicePath = (uid: string, suffix = '') =>
    'users/' + encodeURIComponent(uid) + '/devices' + suffix;
  const userCommandPath = (uid: string, suffix = '') =>
    'users/' + encodeURIComponent(uid) + '/deviceCommands' + suffix;
  const readFirestoreDoc = async (path: string) => {
    try {
      return await firebaseAdminRequest(firestoreDocumentUrl(path));
    } catch (error: any) {
      if (Number(error?.status) === 404) return null;
      throw error;
    }
  };
  const patchFirestoreDoc = async (path: string, values: Record<string, any>) => {
    const params = new URLSearchParams();
    Object.keys(values).forEach(key => params.append('updateMask.fieldPaths', key));
    return firebaseAdminRequest(firestoreDocumentUrl(path) + '?' + params.toString(), {
      method: 'PATCH',
      body: JSON.stringify({ fields: encodeFirestoreFields(values) }),
    });
  };
  const createFirestoreDoc = async (collectionPath: string, documentId: string, values: Record<string, any>) => {
    return firebaseAdminRequest(
      firestoreDocumentUrl(collectionPath) + '?documentId=' + encodeURIComponent(documentId),
      { method: 'POST', body: JSON.stringify({ fields: encodeFirestoreFields(values) }) },
    );
  };
  const getDeviceRecord = async (uid: string, deviceId: string): Promise<Record<string, any> | null> => {
    const raw: any = await readFirestoreDoc(userDevicePath(uid, '/' + encodeURIComponent(deviceId)));
    return raw ? { id: deviceId, ...decodeFirestoreFields(raw.fields || {}) } : null;
  };

  app.get('/api/devices', async (req, res) => {
    try {
      const actor = await verifyAuthenticatedHubMindRequest(req);
      const result: any = await firebaseAdminRequest(
        firestoreDocumentUrl(userDevicePath(actor.uid) + '?pageSize=100'),
      );
      const devices = (result?.documents || []).map((entry: any) => ({
        id: String(entry.name || '').split('/').pop() || '',
        ...decodeFirestoreFields(entry.fields || {}),
      }));
      return res.json({ success: true, devices });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Devices] Could not list devices:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not load registered devices.' : (error?.message || 'Device list failed.') });
    }
  });

  app.post('/api/devices/register', async (req, res) => {
    try {
      const actor = await verifyAuthenticatedHubMindRequest(req);
      const deviceId = String(req.body?.deviceId || '').trim();
      if (!safeDeviceId(deviceId)) return res.status(400).json({ error: 'Invalid device ID.' });

      const platform = String(req.body?.platform || 'ANDROID').trim().toUpperCase();
      if (!['ANDROID', 'WINDOWS'].includes(platform)) return res.status(400).json({ error: 'Device platform must be ANDROID or WINDOWS.' });
      const defaultName = platform === 'WINDOWS' ? 'Windows desktop' : 'Android device';
      const deviceName = String(req.body?.deviceName || defaultName).trim().slice(0, 120) || defaultName;
      const capabilities = Array.isArray(req.body?.capabilities)
        ? req.body.capabilities.map((item: unknown) => String(item).slice(0, 80)).slice(0, 40)
        : [];
      const now = new Date().toISOString();
      const values = {
        deviceId,
        deviceName,
        platform,
        status: 'ONLINE',
        capabilities,
        clientVersion: String(req.body?.clientVersion || 'unknown').slice(0, 40),
        model: String(req.body?.model || '').slice(0, 100),
        lastSeenAt: now,
        registeredAt: String(req.body?.registeredAt || now).slice(0, 40),
        fullControlActive: req.body?.fullControlActive === true,
        isCurrentDevice: true,
        permissionMode: String(req.body?.permissionMode || 'ask').slice(0, 40),
        ...(Number.isFinite(Number(req.body?.batteryPercent)) ? { batteryPercent: Math.max(0, Math.min(100, Number(req.body.batteryPercent))) } : {}),
      };

      const path = userDevicePath(actor.uid, '/' + encodeURIComponent(deviceId));
      const existing = await readFirestoreDoc(path);
      if (existing) {
        await patchFirestoreDoc(path, values);
      } else {
        await createFirestoreDoc(userDevicePath(actor.uid), deviceId, values);
      }
      return res.json({ success: true, device: values });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Devices] Device registration failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not register this Android device.' : (error?.message || 'Device registration failed.') });
    }
  });

  app.post('/api/devices/dispatch', async (req, res) => {
    try {
      const actor = await verifyAuthenticatedHubMindRequest(req);
      const targetDeviceId = String(req.body?.targetDeviceId || '').trim();
      const requestedAction = String(req.body?.actionType || '').trim();
      const parameters = req.body?.parameters && typeof req.body.parameters === 'object' && !Array.isArray(req.body.parameters)
        ? req.body.parameters
        : {};
      if (!safeDeviceId(targetDeviceId)) return res.status(400).json({ error: 'Choose a registered phone or computer.' });
      if (JSON.stringify(parameters).length > 20000) return res.status(413).json({ error: 'Device command parameters are too large.' });

      const device = await getDeviceRecord(actor.uid, targetDeviceId);
      if (!device || !['ANDROID', 'WINDOWS'].includes(String(device.platform || ''))) {
        return res.status(404).json({ error: 'That device is not registered to this Hub-Mind account.' });
      }
      const platform = String(device.platform).toUpperCase();
      const actionType = platform === 'ANDROID' ? requestedAction.toUpperCase() : requestedAction;
      if (platform === 'ANDROID' && !androidActionTypes.has(actionType)) return res.status(400).json({ error: 'Unsupported Android device action.' });
      if (platform === 'WINDOWS' && !windowsActionTypes.has(actionType)) return res.status(400).json({ error: 'Unsupported Windows device action.' });
      if (device.status !== 'ONLINE') return res.status(409).json({ error: 'The target device is offline or has not checked in recently.' });
      if (platform === 'WINDOWS' && device.fullControlActive !== true) {
        return res.status(409).json({ error: 'Windows Full Control is not active on the target laptop. Open Hub-Mind on that laptop and enable Jess Full Control.' });
      }

      const now = Date.now();
      const commandId = 'cmd_' + randomUUID().replace(/-/g, '');
      const command = {
        commandId,
        issuingUserId: actor.uid,
        sourceDeviceId: String(req.body?.sourceDeviceId || 'hubmind-workspace-client').slice(0, 128),
        targetDeviceId,
        actionType,
        parameters,
        status: 'PENDING',
        requiresConfirmation: req.body?.requiresConfirmation === true,
        createdAt: new Date(now).toISOString(),
        expiresAt: now + 90000,
      };
      await createFirestoreDoc(userCommandPath(actor.uid), commandId, command);
      return res.status(202).json({ success: true, commandId, status: 'PENDING', expiresAt: command.expiresAt });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Devices] Command dispatch failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not dispatch the Android device command.' : (error?.message || 'Device command dispatch failed.') });
    }
  });

  app.post('/api/devices/poll', async (req, res) => {
    try {
      const actor = await verifyAuthenticatedHubMindRequest(req);
      const deviceId = String(req.body?.deviceId || '').trim();
      if (!safeDeviceId(deviceId)) return res.status(400).json({ error: 'Invalid Android device ID.' });
      const device = await getDeviceRecord(actor.uid, deviceId);
      if (!device || !['ANDROID', 'WINDOWS'].includes(String(device.platform || ''))) {
        return res.status(404).json({ error: 'This device is not registered to this Hub-Mind account.' });
      }
      const platform = String(device.platform).toUpperCase();
      const fullControlActive = req.body?.fullControlActive === true
        ? true
        : platform === 'ANDROID' ? device.fullControlActive === true : false;
      await patchFirestoreDoc(userDevicePath(actor.uid, '/' + encodeURIComponent(deviceId)), {
        status: 'ONLINE',
        lastSeenAt: new Date().toISOString(),
        fullControlActive,
      });
      if (platform === 'WINDOWS' && !fullControlActive) {
        return res.json({ success: true, commands: [], note: 'Windows Full Control is not active; no remote actions were returned.' });
      }

      let result: any = null;
      try {
        result = await firebaseAdminRequest(firestoreDocumentUrl(userCommandPath(actor.uid) + '?pageSize=100'));
      } catch (error: any) {
        if (Number(error?.status) !== 404) throw error;
      }

      const candidates = (result?.documents || [])
        .map((entry: any) => ({
          id: String(entry.name || '').split('/').pop() || '',
          ...decodeFirestoreFields(entry.fields || {}),
        }))
        .filter((command: any) =>
          command.targetDeviceId === deviceId &&
          ['PENDING', 'CREATED'].includes(String(command.status || '')) &&
          Number(command.expiresAt || 0) > Date.now(),
        )
        .slice(0, 5);

      const commands = [];
      for (const command of candidates) {
        await patchFirestoreDoc(userCommandPath(actor.uid, '/' + encodeURIComponent(command.id)), {
          status: 'RUNNING',
          claimedAt: new Date().toISOString(),
        });
        commands.push(command);
      }
      return res.json({ success: true, commands });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Devices] Command polling failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not poll Android device commands.' : (error?.message || 'Device polling failed.') });
    }
  });

  app.post('/api/devices/result', async (req, res) => {
    try {
      const actor = await verifyAuthenticatedHubMindRequest(req);
      const deviceId = String(req.body?.deviceId || '').trim();
      const commandId = String(req.body?.commandId || '').trim();
      const statusValue = String(req.body?.status || '').trim().toUpperCase();
      if (!safeDeviceId(deviceId) || !safeDeviceId(commandId)) return res.status(400).json({ error: 'Invalid device or command ID.' });
      if (!['COMPLETED', 'SENT_UNVERIFIED', 'FAILED', 'EXPIRED'].includes(statusValue)) return res.status(400).json({ error: 'Unsupported Android command result status.' });

      const raw: any = await readFirestoreDoc(userCommandPath(actor.uid, '/' + encodeURIComponent(commandId)));
      if (!raw) return res.status(404).json({ error: 'Command was not found.' });
      const command = decodeFirestoreFields(raw.fields || {});
      if (command.targetDeviceId !== deviceId) return res.status(403).json({ error: 'This command belongs to another device.' });
      if (!['RUNNING', 'PENDING', 'CREATED'].includes(String(command.status || ''))) return res.status(409).json({ error: 'This command is no longer awaiting a result.' });

      const result = req.body?.result && typeof req.body.result === 'object' ? req.body.result : {};
      await patchFirestoreDoc(userCommandPath(actor.uid, '/' + encodeURIComponent(commandId)), {
        status: statusValue,
        result: {
          success: result.success === true,
          verified: result.verified === true,
          outputText: String(result.outputText || '').slice(0, 4000),
          error: String(result.error || '').slice(0, 1000),
          durationMs: Math.max(0, Math.min(Number(result.durationMs) || 0, 120000)),
          ...(typeof result.imageDataUrl === 'string' && result.imageDataUrl.length <= 650000
            ? { imageDataUrl: result.imageDataUrl }
            : {}),
        },
        completedAt: new Date().toISOString(),
      });
      return res.json({ success: true, commandId, status: statusValue });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Devices] Command result write failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not save the Android command result.' : (error?.message || 'Command result failed.') });
    }
  });

  app.get('/api/devices/commands/:commandId', async (req, res) => {
    try {
      const actor = await verifyAuthenticatedHubMindRequest(req);
      const commandId = String(req.params.commandId || '').trim();
      if (!safeDeviceId(commandId)) return res.status(400).json({ error: 'Invalid command ID.' });
      const raw: any = await readFirestoreDoc(userCommandPath(actor.uid, '/' + encodeURIComponent(commandId)));
      if (!raw) return res.status(404).json({ error: 'Command was not found.' });
      const command = { id: commandId, ...decodeFirestoreFields(raw.fields || {}) };
      return res.json({ success: true, command });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error('[Devices] Command status lookup failed:', error?.message || error);
      return res.status(status).json({ error: status === 500 ? 'Could not read Android command status.' : (error?.message || 'Command status lookup failed.') });
    }
  });

  const liveTokenRateLimits = new Map<string, { count: number; resetAt: number }>();
  const liveTokenIdentityCache = new Map<string, { localId: string; expiresAt: number }>();
  app.post(["/api/live-token", "/live-token"], async (req, res) => {
    const clientKey = String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 160);
    const now = Date.now();
    const bucket = liveTokenRateLimits.get(clientKey);
    if (bucket && bucket.resetAt > now && bucket.count >= 20) {
      return res.status(429).json({ error: "Too many Jess session requests. Please wait a minute and try again." });
    }
    if (!bucket || bucket.resetAt <= now) liveTokenRateLimits.set(clientKey, { count: 1, resetAt: now + 60_000 });
    else bucket.count += 1;
    if (liveTokenRateLimits.size > 5000) {
      for (const [key, value] of liveTokenRateLimits) if (value.resetAt <= now) liveTokenRateLimits.delete(key);
    }

    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!idToken || idToken.length > 10000) return res.status(401).json({ error: "Authentication required. Please sign in again." });

      const tokenFingerprint = createHash("sha256").update(idToken).digest("hex");
      const cachedIdentity = liveTokenIdentityCache.get(tokenFingerprint);
      let verifiedUser: { localId: string } | null = cachedIdentity && cachedIdentity.expiresAt > now
        ? { localId: cachedIdentity.localId }
        : null;

      // Validate each Firebase ID token with Firebase Auth, but avoid repeating
      // that network round-trip when a just-verified token is immediately used
      // to reconnect a Live session. The short cache is keyed by a one-way hash.
      if (!verifiedUser) {
        const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
        if (!firebaseApiKey) return res.status(503).json({ error: "Firebase token verification is not configured on this server." });

        const identityResponse = await fetch(
          "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(firebaseApiKey),
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(10_000) },
        );
        if (!identityResponse.ok) return res.status(401).json({ error: "Your Hub-Mind session is invalid or expired. Please sign in again." });
        const identityData = await identityResponse.json() as any;
        const identity = identityData?.users?.[0];
        if (!identity?.localId || identity.disabled) return res.status(401).json({ error: "Your Hub-Mind account is unavailable." });

        verifiedUser = { localId: identity.localId };
        liveTokenIdentityCache.set(tokenFingerprint, { localId: identity.localId, expiresAt: now + 30_000 });
      }

      if (liveTokenIdentityCache.size > 5000) {
        for (const [key, value] of liveTokenIdentityCache) {
          if (value.expiresAt <= now) liveTokenIdentityCache.delete(key);
        }
      }

      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return res.status(503).json({ error: "GEMINI_API_KEY is not configured on the server." });

      const tokenResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const tokenData = await tokenResponse.json() as any;
      if (!tokenResponse.ok || !tokenData?.name) {
        console.error("Live ephemeral-token provisioning failed:", tokenData?.error?.message || tokenResponse.status);
        return res.status(502).json({ error: "Gemini Live token provisioning failed. Please try again shortly." });
      }
      return res.json({ token: tokenData.name, userId: verifiedUser.localId, expiresAt: tokenData.expireTime || null });
    } catch (error: any) {
      console.error("Jess live-token error:", error?.message || error);
      return res.status(500).json({ error: "Could not initialize Jess Live. Please try again." });
    }
  });

  let memories = [];
  let conversations = [];

  app.get("/api/memories", (req, res) => {
    res.json({ memories });
  });

  app.post("/api/memories", (req, res) => {
    const memory = { id: Date.now().toString(), ...req.body, timestamp: new Date().toISOString() };
    memories.unshift(memory);
    res.json({ memory });
  });

  app.delete("/api/memories/:id", (req, res) => {
    memories = memories.filter(m => m.id !== req.params.id);
    res.json({ success: true });
  });

  app.get("/api/conversations", (req, res) => {
    res.json({ conversations });
  });

  app.post("/api/conversations", (req, res) => {
    const conversation = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
    conversations.unshift(conversation);
    res.json({ conversation });
  });

  app.delete("/api/conversations/:id", (req, res) => {
    conversations = conversations.filter(c => c.id !== req.params.id);
    res.json({ success: true });
  });

  app.get("/api/world-pulse", (req, res) => {
    res.json({
      pulse: [
        {
          id: "1",
          region: "Space",
          title: "Jupiter's Giant Storm",
          summary: "The Great Red Spot on Jupiter is a storm so big that Earth could fit inside it!",
          jessNote: "Woah! Imagine flying a spaceship right through that giant red storm!"
        },
        {
          id: "2",
          region: "Prehistoric",
          title: "T-Rex Had Feathers?",
          summary: "Scientists think that many dinosaurs, even relatives of the T-Rex, might have been covered in fluffy feathers.",
          jessNote: "A giant fluffy T-Rex? That's hilarious and awesome at the same time!"
        },
        {
          id: "3",
          region: "Oceans",
          title: "The Immortal Jellyfish",
          summary: "There is a type of jellyfish that can revert back to its baby stage when it gets old, meaning it can technically live forever.",
          jessNote: "A real-life cheat code for infinite lives! I want an immortal jellyfish as a pet."
        }
      ]
    });
  });

  // Global Web Search Endpoint for Jess
  app.post("/api/web-search", async (req, res) => {
    try {
      const query = String(req.body?.query || req.query?.query || '').trim();
      const result = await performGlobalWebSearch(query);
      res.json(result);
    } catch (err: any) {
      console.error("[Server] /api/web-search error:", err);
      res.status(500).json({ success: false, error: err?.message || "Web search error" });
    }
  });

  // Live GitHub Repository Status for Jaystarbliss-studios/HUB-MIND
  app.get("/api/repository-context", async (req, res) => {
    try {
      const force = req.query.fresh === 'true';
      const status = await getFullRepositoryStatus(force);
      res.json(status);
    } catch (err: any) {
      console.error("[Server] /api/repository-context error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to load repository status" });
    }
  });

  // Desktop Releases & Version History
  app.get("/api/github/releases", async (req, res) => {
    try {
      const force = req.query.fresh === 'true';
      const releases = await fetchHubMindReleases(force);
      res.json({ success: true, releases, count: releases.length });
    } catch (err: any) {
      console.error("[Server] /api/github/releases error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to load releases" });
    }
  });

  // Recent Commits
  app.get("/api/github/commits", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const commits = await fetchHubMindCommits(limit);
      res.json({ success: true, commits, count: commits.length });
    } catch (err: any) {
      console.error("[Server] /api/github/commits error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to load commits" });
    }
  });

  // Codebase Inspector (Local Workspace + GitHub API)
  app.get("/api/github/codebase", async (req, res) => {
    try {
      const targetPath = String(req.query.path || '').trim();
      const branch = String(req.query.branch || 'main').trim();
      const result = await inspectCodebase(targetPath, branch);
      res.json(result);
    } catch (err: any) {
      console.error("[Server] /api/github/codebase error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to inspect codebase" });
    }
  });


  
  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is required for voice model." });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"] as any,
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        res.json({ audio: base64Audio });
      } else {
        res.status(500).json({ error: "No audio generated." });
      }
    } catch (e: any) {
      if (e.status === 429 || e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED")) {
        console.warn("TTS Quota exceeded. Using client fallback.");
      } else {
        console.warn("TTS Error. Using client fallback.", e.message);
      }
      res.status(200).json({ fallback: true });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, tools } = req.body;
      let systemInstruction = req.body.systemInstruction;
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
          const configDoc: any = await firebaseAdminRequest(firestoreDocumentUrl('systemSettings/jess'));
          const adminConfig = decodeFirestoreFields(configDoc?.fields || {});
          const extraInstructions = String(adminConfig.adminInstructions || '').trim();
          if (extraInstructions) {
            const existingText = typeof systemInstruction === 'string' ? systemInstruction : (systemInstruction?.parts?.[0]?.text || '');
            systemInstruction = { parts: [{ text: existingText + '\n\nWorkspace administrator guidance (follow unless it conflicts with safety or platform rules):\n' + extraInstructions }] };
          }
        } catch (configError: any) {
          if (configError?.status !== 404) console.warn('[Jess] Administrator guidance could not be loaded:', configError?.message || configError);
        }
      }
      
      const mapTypes = (params, toUpper) => {
        if (!params) return params;
        const newParams = { ...params };
        if (newParams.type) {
           newParams.type = toUpper ? newParams.type.toUpperCase() : newParams.type.toLowerCase();
        }
        if (newParams.properties) {
           newParams.properties = {};
           for (const k in params.properties) {
              newParams.properties[k] = mapTypes(params.properties[k], toUpper);
           }
        }
        if (newParams.items) {
           newParams.items = mapTypes(params.items, toUpper);
        }
        return newParams;
      };

      const groqApiKey = process.env.GROQ_API_KEY;
      const ollamaUrl = process.env.OLLAMA_API_URL;
      const geminiApiKey = process.env.GEMINI_API_KEY;

      // Prefer Groq / Ollama as requested
      const hasScreenImage = Array.isArray(messages) && messages.some((message: any) => Array.isArray(message.parts) && message.parts.some((part: any) => part?.inlineData?.data));
      const requiresGoogleGrounding = req.body.useSearch === true || req.body.searchGrounding === true || req.body.useMaps === true || req.body.mapsGrounding === true;
      // Search/map grounding must go through Gemini's grounding tools. The Groq/Ollama
      // compatibility path silently ignored these flags, which made Jess claim to search
      // without returning grounded results or source links.
      if ((groqApiKey || ollamaUrl) && !hasScreenImage && !requiresGoogleGrounding) {
        try {
          const openai = new OpenAI({
            apiKey: groqApiKey || "ollama",
            baseURL: groqApiKey ? "https://api.groq.com/openai/v1" : (ollamaUrl || "http://localhost:11434/v1")
          });

          const groqTools = tools?.[0]?.functionDeclarations?.map((f: any) => ({
            type: "function",
            function: {
              name: f.name,
              description: f.description,
              parameters: mapTypes(f.parameters, false)
            }
          }));

          const groqMessages: any[] = [];
          if (systemInstruction) {
            const baseText = typeof systemInstruction === 'string' ? systemInstruction : (systemInstruction.parts?.[0]?.text || "");
            const isOllama = !groqApiKey && !!ollamaUrl;
            const adapter = isOllama ? ollamaAdapter : groqAdapter;
            const fullSystemPrompt = coreIdentity + "\n" + adapter + "\n\n--- Context ---\n" + baseText;
            groqMessages.push({ role: 'system', content: fullSystemPrompt });
          }

          for (const msg of messages) {
            const role = msg.role === 'model' ? 'assistant' : msg.role;
            if (msg.parts[0].text) {
              groqMessages.push({ role, content: msg.parts[0].text });
            } else if (msg.parts[0].functionResponse) {
              groqMessages.push({
                role: 'tool',
                tool_call_id: msg.parts[0].functionResponse.id,
                name: msg.parts[0].functionResponse.name,
                content: JSON.stringify(msg.parts[0].functionResponse.response)
              });
            } else if (msg.parts[0].functionCall) {
              groqMessages.push({
                role: 'assistant',
                content: null,
                tool_calls: msg.parts.map((p: any) => ({
                  id: p.functionCall.id,
                  type: 'function',
                  function: {
                    name: p.functionCall.name,
                    arguments: JSON.stringify(p.functionCall.args)
                  }
                }))
              });
            }
          }

          const modelName = groqApiKey ? "llama-3.3-70b-versatile" : "llama3.2"; // Groq or Ollama model
          
          const completion = await openai.chat.completions.create({
            model: modelName,
            messages: groqMessages,
            tools: groqTools?.length ? groqTools : undefined,
            tool_choice: groqTools?.length ? 'auto' : undefined
          });

          const choice = completion.choices[0];
          let responseText = choice.message.content || "";
          let functionCalls: any[] = [];
          let responseParts: any[] = [];

          if (choice.message.tool_calls) {
            for (const tc of choice.message.tool_calls) {
              const tcAny = tc as any;
              const args = JSON.parse(tcAny.function.arguments || "{}");
              functionCalls.push({
                name: tcAny.function.name,
                args: args,
                id: tcAny.id
              });
              responseParts.push({
                functionCall: { name: tcAny.function.name, args: args, id: tcAny.id }
              });
            }
          }

          if (responseText) {
            responseParts.push({ text: responseText });
          }
          if (responseParts.length === 0) {
            responseParts.push({ text: "Done." });
          }

          return res.json({
            text: responseText,
            functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
            message: {
              role: 'model',
              parts: responseParts
            }
          });

        } catch (err: any) {
          console.warn("Groq/Ollama failed, falling back to Gemini", err.message);
        }
      }

      // Primary Gemini models (gemini-3.8-flash for general, gemini-3.1-pro-preview for complex, gemini-3.1-flash-lite for fast)
      const requestedModel = req.body.model;
      const candidateModels = requestedModel
        ? [requestedModel, "gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"]
        : ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"];
      
      let lastError: any = null;
      let response = null;

      if (!geminiApiKey) {
        if (requiresGoogleGrounding) {
          return res.status(503).json({ error: "Jess web search requires GEMINI_API_KEY because public web grounding is not available through the configured Groq/Ollama fallback. Configure the server-side Gemini key and retry." });
        }
        return res.status(500).json({ error: "No AI provider configured. Add GROQ_API_KEY, OLLAMA_API_URL or GEMINI_API_KEY." });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Prepare tools with support for function declarations, Google Search, and Google Maps grounding
      const geminiTools: any[] = [];
      const hasSearchGrounding = req.body.useSearch || req.body.searchGrounding;
      const hasMapsGrounding = req.body.useMaps || req.body.mapsGrounding;

      if (hasSearchGrounding) {
        geminiTools.push({ googleSearch: {} });
      }
      if (hasMapsGrounding) {
        geminiTools.push({ googleMaps: {} });
      }

      if (tools && tools.length > 0) {
        for (const t of tools) {
          if (t.functionDeclarations) {
            geminiTools.push({
              functionDeclarations: t.functionDeclarations.map((f: any) => ({
                ...f,
                parameters: f.parameters ? mapTypes(f.parameters, true) : undefined,
              })),
            });
          } else if (t.googleSearch) {
            if (!geminiTools.some((gt) => gt.googleSearch)) geminiTools.push(t);
          } else if (t.googleMaps) {
            if (!geminiTools.some((gt) => gt.googleMaps)) geminiTools.push(t);
          }
        }
      }

      const hasBuiltInTools = geminiTools.some((t) => t.googleSearch || t.googleMaps);
      const hasFunctionTools = geminiTools.some((t) => t.functionDeclarations);
      const toolConfig: any = {};
      if (hasBuiltInTools && hasFunctionTools) {
        toolConfig.includeServerSideToolInvocations = true;
      }
      if (req.body.location && hasMapsGrounding) {
        toolConfig.retrievalConfig = {
          latLng: {
            latitude: req.body.location.latitude || req.body.location.lat,
            longitude: req.body.location.longitude || req.body.location.lng,
          },
        };
      }

      for (const modelName of candidateModels) {
        let attempts = 0;
        while (attempts < 2) {
          try {
            response = await ai.models.generateContent({
              model: modelName,
              contents: messages,
              config: {
                tools: geminiTools.length > 0 ? geminiTools : undefined,
                toolConfig: Object.keys(toolConfig).length > 0 ? toolConfig : undefined,
                systemInstruction: systemInstruction ? {
                  role: 'system',
                  parts: [{ text: coreIdentity + "\n" + geminiAdapter + "\n\n--- Context ---\n" + (typeof systemInstruction === 'string' ? systemInstruction : (systemInstruction.parts?.[0]?.text || "")) }]
                } : undefined
              }
            });
            if (response) break;
          } catch (err: any) {
            lastError = err;
            if (err.message && (err.message.includes("503") || err.message.includes("429"))) {
              attempts++;
              if (attempts < 2) await delay(2000);
            } else {
              break; // break the retry loop for other errors
            }
          }
        }
        if (response) break; // break the model loop if successful
      }

      if (!response) {
        throw lastError || new Error("All AI models are currently busy.");
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = (groundingMetadata?.groundingChunks || [])
        .map((chunk: any) => chunk?.web?.uri ? {
          title: String(chunk.web.title || chunk.web.uri).slice(0, 300),
          url: String(chunk.web.uri).slice(0, 2000),
        } : null)
        .filter(Boolean);
      const textContent = response.text
        || response.candidates?.[0]?.content?.parts?.map((part: any) => part?.text).filter(Boolean).join("\n")
        || "";

      res.json({
        text: textContent,
        functionCalls: response.functionCalls,
        message: response.candidates?.[0]?.content,
        groundingChunks: groundingMetadata?.groundingChunks || [],
        webSearchQueries: groundingMetadata?.webSearchQueries || [],
        sources,
        grounded: sources.length > 0 || (groundingMetadata?.webSearchQueries || []).length > 0,
        model: response.modelVersion || null,
      });
    } catch (error: any) {
      console.error("API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate response" });
    }
  });


  // Handle Web Share Target
  app.post("/share-target", (req, res) => {
    res.redirect(303, '/inbox?shared=true');
  });

  // In development, use Vite middleware. In production, serve the compiled dist/ directory.
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
      customLogger,
    });
    app.use(vite.middlewares);
  } else {
    const staticDirName = fs.existsSync(path.join(process.cwd(), 'dist')) ? 'dist' : 'build';
    const distPath = path.join(process.cwd(), staticDirName);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

    const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ noServer: true });
  const hmrWss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has("vite-hmr")) return "vite-hmr";
      if (protocols.has("vite-ping")) return "vite-ping";
      const first = Array.from(protocols)[0];
      return first || false;
    },
  });

  // Heartbeat ping interval to keep connection alive through proxies
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (e) {}
    });
  }, 20000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => {});

    try {
      const host = request.headers.host || "localhost:3000";
      const url = new URL(request.url || "", `http://${host}`);
      const cleanPath = url.pathname.replace(/\/+$/, "");

      if (
        cleanPath === "/api/live-ws" ||
        cleanPath === "/live-ws" ||
        cleanPath === "/live" ||
        cleanPath === "/api/ws" ||
        cleanPath.startsWith("/api/live-ws")
      ) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        // Accept Vite HMR / ping websocket requests cleanly so the browser never throws "WebSocket closed without opened."
        hmrWss.handleUpgrade(request, socket, head, (ws) => {
          ws.on("error", () => {});
          try {
            ws.send(JSON.stringify({ type: "connected" }));
          } catch {}
          ws.on("message", (raw) => {
            try {
              const msg = JSON.parse(String(raw || "{}"));
              if (msg?.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
              }
            } catch {}
          });
        });
      }
    } catch (err) {
      try {
        socket.destroy();
      } catch {}
    }
  });

  const LIVE_TOOLS = [
    {
      functionDeclarations: [
        {
          name: "create_calendar_event",
          description: "Schedule a Google Calendar event with an attached notification reminder. Use whenever the user asks to schedule an event, set a calendar reminder, or set a reminder alarm.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Title or summary of the event/reminder" },
              startDateTime: { type: "STRING", description: "ISO 8601 start date-time (e.g. 2026-08-17T14:30:00Z)" },
              endDateTime: { type: "STRING", description: "ISO 8601 end date-time (optional)" },
              reminderMinutes: { type: "NUMBER", description: "Minutes before event for notification (e.g. 10 or 15)" },
              description: { type: "STRING", description: "Optional description or notes" },
            },
            required: ["title", "startDateTime"],
          },
        },
        {
          name: "list_calendar_events",
          description: "List upcoming Google Calendar events.",
          parameters: {
            type: "OBJECT",
            properties: {
              timeMin: { type: "STRING", description: "ISO 8601 start boundary" },
              timeMax: { type: "STRING", description: "ISO 8601 end boundary" },
            },
          },
        },
        {
          name: "create_task",
          description: "Create a new operational task in Hub-Mind.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Task title" },
              description: { type: "STRING", description: "Task description or checklist" },
              priority: { type: "STRING", description: "Task priority: urgent, high, medium, low" },
              deadline: { type: "STRING", description: "Deadline date string" },
              assignedTo: { type: "STRING", description: "Assignee name or user ID" },
            },
            required: ["title"],
          },
        },
        {
          name: "update_task",
          description: "Update an existing operational task in Hub-Mind.",
          parameters: {
            type: "OBJECT",
            properties: {
              taskId: { type: "STRING", description: "The ID of the task to update" },
              title: { type: "STRING", description: "Task title" },
              description: { type: "STRING", description: "Task description" },
              priority: { type: "STRING", description: "Task priority: urgent, high, medium, low" },
              status: { type: "STRING", description: "Task status: pending, in-progress, completed" },
              deadline: { type: "STRING", description: "Deadline date string" },
            },
            required: ["taskId"],
          },
        },
        {
          name: "list_tasks",
          description: "List operational tasks in Hub-Mind. Filter by status or priority.",
          parameters: {
            type: "OBJECT",
            properties: {
              status: { type: "STRING", description: "Filter: pending, in-progress, or completed" },
              priority: { type: "STRING", description: "Filter: urgent, high, medium, or low" },
            },
          },
        },
        {
          name: "create_document",
          description: "Create a new document in Hub-Mind.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Document title" },
              content: { type: "STRING", description: "Initial HTML or text content of the document" },
            },
            required: ["title"],
          },
        },
        {
          name: "update_document",
          description: "Update an existing document in Hub-Mind.",
          parameters: {
            type: "OBJECT",
            properties: {
              documentId: { type: "STRING", description: "The ID of the document to update" },
              title: { type: "STRING", description: "New document title" },
              content: { type: "STRING", description: "Updated content" },
            },
            required: ["documentId"],
          },
        },
        {
          name: "list_documents",
          description: "List documents in Hub-Mind.",
          parameters: {
            type: "OBJECT",
            properties: {
              limit: { type: "NUMBER", description: "Number of documents to return (max 20)" },
            },
          },
        },
        {
          name: "get_document_content",
          description: "Get full text content of a specific document.",
          parameters: {
            type: "OBJECT",
            properties: {
              documentId: { type: "STRING", description: "Document ID" },
            },
            required: ["documentId"],
          },
        },
        {
          name: "request_document_delete",
          description: "Request confirmation to delete a document in Hub-Mind.",
          parameters: {
            type: "OBJECT",
            properties: {
              documentId: { type: "STRING", description: "Document ID to delete" },
              documentTitle: { type: "STRING", description: "Title of the document" },
              confirmed: { type: "BOOLEAN", description: "Must be true if user explicitly confirmed" },
            },
            required: ["documentId", "documentTitle"],
          },
        },
        {
          name: "open_colleagues",
          description: "Open the Colleagues & Team Directory tab on screen.",
          parameters: {
            type: "OBJECT",
            properties: {},
          },
        },
        {
          name: "open_project",
          description: "Open a project by ID or name on screen.",
          parameters: {
            type: "OBJECT",
            properties: {
              projectId: { type: "STRING", description: "Project ID or name (e.g. UPHIX)" },
            },
            required: ["projectId"],
          },
        },
        {
          name: "open_task",
          description: "Open a task by ID or title on screen.",
          parameters: {
            type: "OBJECT",
            properties: {
              taskId: { type: "STRING", description: "Task ID or title" },
            },
            required: ["taskId"],
          },
        },
        {
          name: "open_client",
          description: "Open a client profile by ID or name on screen.",
          parameters: {
            type: "OBJECT",
            properties: {
              clientId: { type: "STRING", description: "Client ID or name" },
            },
            required: ["clientId"],
          },
        },
        {
          name: "find_document",
          description: "Find and open a document by title or keyword.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Document title or search keyword" },
            },
            required: ["title"],
          },
        },
        {
          name: "edit_document",
          description: "Edit or update an existing document's content or title in Hub-Mind and update the live editor.",
          parameters: {
            type: "OBJECT",
            properties: {
              documentId: { type: "STRING", description: "Document ID or title" },
              content: { type: "STRING", description: "Updated content (HTML or markdown)" },
              title: { type: "STRING", description: "Optional updated title" },
              mode: { type: "STRING", enum: ["replace", "append"] },
            },
            required: ["content"],
          },
        },
        {
          name: "navigate_app",
          description: "Navigate user to a specific section or tab in Hub-Mind (e.g. /colleagues, /tasks, /calendar, /documents, /projects, /clients, /knowledge, /follow-ups, /inbox, /admin).",
          parameters: {
            type: "OBJECT",
            properties: {
              path: { type: "STRING", description: "Path: /, /colleagues, /tasks, /projects, /knowledge, /clients, /calendar, /documents, /follow-ups, /inbox, /admin" },
            },
            required: ["path"],
          },
        },
        {
          name: "get_workspace_overview",
          description: "Get an overview summary of active tasks, recent documents, and workspace state.",
          parameters: {
            type: "OBJECT",
            properties: {},
          },
        },
        {
          name: "search_workspace",
          description: "Search across tasks and documents using a keyword query.",
          parameters: {
            type: "OBJECT",
            properties: {
              query: { type: "STRING", description: "Search term" },
            },
            required: ["query"],
          },
        },
        {
          name: "set_preferred_name",
          description: "Update the user's preferred name so Jess addresses them by this name.",
          parameters: {
            type: "OBJECT",
            properties: {
              preferredName: { type: "STRING", description: "The name the user wishes to be called" },
            },
            required: ["preferredName"],
          },
        },
        {
          name: "save_user_memory",
          description: "Save a permanent user detail, preference, working habit, personal fact, or instruction noticed during conversation into persistent memory.",
          parameters: {
            type: "OBJECT",
            properties: {
              content: { type: "STRING", description: "The specific fact or preference remembered about the user" },
              key: { type: "STRING", description: "Short identifier for the memory (e.g. working_hours, client_preference)" },
              category: { type: "STRING", enum: ["preference", "instruction", "personal", "workflow", "fact", "schedule"], description: "Category of memory" },
              importance: { type: "STRING", enum: ["high", "medium", "low"], description: "Importance level" },
            },
            required: ["content"],
          },
        },
        {
          name: "get_user_memories",
          description: "Retrieve all stored user memories and personal preferences across past sessions.",
          parameters: {
            type: "OBJECT",
            properties: {
              category: { type: "STRING", enum: ["preference", "instruction", "personal", "workflow", "fact", "schedule"] },
            },
          },
        },
        {
          name: "forget_user_memory",
          description: "Remove or forget a specific saved memory.",
          parameters: {
            type: "OBJECT",
            properties: {
              keyOrMemoryId: { type: "STRING", description: "ID or key of the memory to remove" },
            },
            required: ["keyOrMemoryId"],
          },
        },
        {
          name: "delete_task",
          description: "Delete a task from Hub-Mind. Triggers dashboard confirmation modal.",
          parameters: { type: "OBJECT", properties: { taskId: { type: "STRING" }, confirmed: { type: "BOOLEAN" } }, required: ["taskId"] }
        },
        {
          name: "delete_document",
          description: "Delete a document from Hub-Mind. Triggers confirmation modal.",
          parameters: { type: "OBJECT", properties: { documentId: { type: "STRING" }, confirmed: { type: "BOOLEAN" } }, required: ["documentId"] }
        },
        {
          name: "create_project",
          description: "Create a new project.",
          parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, description: { type: "STRING" }, status: { type: "STRING", enum: ["active", "completed", "on_hold"] } }, required: ["name"] }
        },
        {
          name: "update_project",
          description: "Update an existing project.",
          parameters: { type: "OBJECT", properties: { projectId: { type: "STRING" }, name: { type: "STRING" }, description: { type: "STRING" }, status: { type: "STRING" } }, required: ["projectId"] }
        },
        {
          name: "delete_project",
          description: "Delete a project. Triggers confirmation modal.",
          parameters: { type: "OBJECT", properties: { projectId: { type: "STRING" }, confirmed: { type: "BOOLEAN" } }, required: ["projectId"] }
        },
        {
          name: "create_client",
          description: "Create a new client profile.",
          parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, type: { type: "STRING" }, email: { type: "STRING" }, phone: { type: "STRING" }, address: { type: "STRING" }, notes: { type: "STRING" }, status: { type: "STRING" } }, required: ["name"] }
        },
        {
          name: "update_client",
          description: "Update a client profile.",
          parameters: { type: "OBJECT", properties: { clientId: { type: "STRING" }, name: { type: "STRING" }, type: { type: "STRING" }, email: { type: "STRING" }, phone: { type: "STRING" }, address: { type: "STRING" }, notes: { type: "STRING" }, status: { type: "STRING" } }, required: ["clientId"] }
        },
        {
          name: "delete_client",
          description: "Delete a client profile. Triggers confirmation modal.",
          parameters: { type: "OBJECT", properties: { clientId: { type: "STRING" }, confirmed: { type: "BOOLEAN" } }, required: ["clientId"] }
        },
        {
          name: "create_follow_up",
          description: "Create a tracked follow-up for a person, client, payment, proposal, response, promise or other pending action.",
          parameters: { type: "OBJECT", properties: { title: {type:"STRING"}, person:{type:"STRING"}, reason:{type:"STRING"}, dueAt:{type:"STRING"}, priority:{type:"STRING", enum:["urgent","high","medium","low"]}}, required:["title","dueAt"] }
        },
        {
          name: "update_follow_up",
          description: "Update a follow-up item status, due date, or notes.",
          parameters: { type: "OBJECT", properties: { followUpId: { type: "STRING" }, title: { type: "STRING" }, person: { type: "STRING" }, dueAt: { type: "STRING" }, status: { type: "STRING" }, priority: { type: "STRING" }, notes: { type: "STRING" } }, required: ["followUpId"] }
        },
        {
          name: "delete_follow_up",
          description: "Delete a follow-up item. Triggers confirmation modal.",
          parameters: { type: "OBJECT", properties: { followUpId: { type: "STRING" }, confirmed: { type: "BOOLEAN" } }, required: ["followUpId"] }
        },
        {
          name: "create_knowledge",
          description: "Create a knowledge base article, SOP, or template in Hub-Mind.",
          parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, content: { type: "STRING" }, category: { type: "STRING" }, tags: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "content"] }
        },
        {
          name: "update_knowledge",
          description: "Update a knowledge base article.",
          parameters: { type: "OBJECT", properties: { knowledgeId: { type: "STRING" }, title: { type: "STRING" }, content: { type: "STRING" }, category: { type: "STRING" } }, required: ["knowledgeId"] }
        },
        {
          name: "delete_knowledge",
          description: "Delete a knowledge article. Triggers confirmation modal.",
          parameters: { type: "OBJECT", properties: { knowledgeId: { type: "STRING" }, confirmed: { type: "BOOLEAN" } }, required: ["knowledgeId"] }
        },
        {
          name: "list_follow_ups",
          description: "List active follow-ups and their due dates/statuses.",
          parameters: { type: "OBJECT", properties: { status:{type:"STRING"}, limit:{type:"NUMBER"} } }
        },
        {
          name: "open_document",
          description: "Open a document in the Hub-Mind editor.",
          parameters: { type: "OBJECT", properties: { documentId:{type:"STRING"}, documentTitle:{type:"STRING"} } }
        },
        {
          name: "edit_document_live",
          description: "Open a document and stream approved edits into the visible editor.",
          parameters: { type: "OBJECT", properties: { documentId:{type:"STRING"}, documentTitle:{type:"STRING"}, contentToInsert:{type:"STRING"}, summary:{type:"STRING"}, mode:{type:"STRING", enum:["append","prepend","replace"]} }, required:["contentToInsert"] }
        },
        {
          name: "background_edit_document",
          description: "Apply a document edit in the background while the user continues chatting.",
          parameters: { type: "OBJECT", properties: { documentId:{type:"STRING"}, documentTitle:{type:"STRING"}, contentToInsertOrUpdate:{type:"STRING"}, taskDescription:{type:"STRING"} }, required:["documentId","contentToInsertOrUpdate"] }
        },
        {
          name: "get_user_profile",
          description: "Get the active Hub-Mind user profile, role, name, preferred name, email, and permissions.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "get_current_user_profile",
          description: "Get the signed-in user's identity, name, preferred name, email, role, and preferences.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "get_schedule",
          description: "Get the user's complete schedule for any date range, day, or named period (e.g. today, tomorrow, this_week, next_week, this_month). Automatically includes ALL one-time meetings, appointments, events, AND recurring schedules/classes (daily, weekly, monthly routines) in chronological order.",
          parameters: {
            type: "OBJECT",
            properties: {
              period: { type: "STRING", enum: ["today", "tomorrow", "this_week", "next_week", "this_month", "custom"], description: "Named period to fetch schedule for" },
              startDate: { type: "STRING", description: "Start date in YYYY-MM-DD or ISO string" },
              endDate: { type: "STRING", description: "End date in YYYY-MM-DD or ISO string" },
              limit: { type: "NUMBER", description: "Max events to return" }
            }
          }
        },
        {
          name: "request_share_document",
          description: "Request confirmation before sharing a document.",
          parameters: { type: "OBJECT", properties: { documentId:{type:"STRING"}, documentTitle:{type:"STRING"}, recipient:{type:"STRING"}, confirmed:{type:"BOOLEAN"} }, required:["documentId","documentTitle"] }
        },
        {
          name: "list_projects",
          description: "List active Hub-Mind projects.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "list_clients",
          description: "List active Hub-Mind clients.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "create_recurring_schedule",
          description: "Create a repeating schedule (e.g. music classes, weekly team meetings, daily routines) in Hub-Mind that generates recurring calendar instances automatically.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              type: { type: "STRING", enum: ["class", "meeting", "appointment", "school_event", "other"] },
              frequency: { type: "STRING", enum: ["weekly", "daily", "monthly"] },
              daysOfWeek: { type: "ARRAY", items: { type: "NUMBER" } },
              startTime: { type: "STRING" },
              endTime: { type: "STRING" },
              startDate: { type: "STRING" },
              endDate: { type: "STRING" },
              location: { type: "STRING" },
              description: { type: "STRING" },
              syncToGoogleCalendar: { type: "BOOLEAN" }
            },
            required: ["title", "frequency", "startTime"]
          }
        },
        {
          name: "list_recurring_schedules",
          description: "List recurring schedule templates in Hub-Mind.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "delete_recurring_schedule",
          description: "Delete a recurring schedule template from Hub-Mind.",
          parameters: { type: "OBJECT", properties: { templateId: { type: "STRING" } }, required: ["templateId"] }
        },
        {
          name: "create_meeting",
          description: "Schedule a single meeting on the Hub-Mind calendar.",
          parameters: { type: "OBJECT", properties: { title: { type: "STRING" }, date: { type: "STRING" }, location: { type: "STRING" }, notes: { type: "STRING" } }, required: ["title", "date"] }
        },
        {
          name: "update_meeting",
          description: "Update a scheduled meeting on the calendar.",
          parameters: { type: "OBJECT", properties: { meetingId: { type: "STRING" }, title: { type: "STRING" }, date: { type: "STRING" }, location: { type: "STRING" }, status: { type: "STRING" } }, required: ["meetingId"] }
        },
        {
          name: "delete_meeting",
          description: "Delete a meeting from the calendar.",
          parameters: { type: "OBJECT", properties: { meetingId: { type: "STRING" } }, required: ["meetingId"] }
        },
        {
          name: "set_language_preference",
          description: "Set the user's preferred spoken and written language (default is English 90%+ of the time, but smoothly switches to any user-requested language such as Spanish, French, Yoruba, German, etc.).",
          parameters: { type: "OBJECT", properties: { language: { type: "STRING" }, reason: { type: "STRING" } }, required: ["language"] }
        },
        {
          name: "set_voice_isolation_mode",
          description: "Tune noise suppression and dominant speaker isolation to focus on the highest voice and ignore background chatter and noises.",
          parameters: { type: "OBJECT", properties: { mode: { type: "STRING", enum: ["high_priority_voice", "balanced", "ambient_allowed"] } }, required: ["mode"] }
        },
        {
          name: "connect_google_calendar",
          description: "Connect the user's account to Google Calendar with one-time persistent authorization.",
          parameters: { type: "OBJECT", properties: {} }
        },
// Native Windows and Chrome tools. Keep these names and schemas aligned with
        // JESS_TOOLS_DECLARATIONS in src/lib/jessTools.ts. The client executes each
        // tool through executeJessTool and returns the result to this Live session.
        {
          name: "jess_full_control",
          description: "Start the native Windows Full Control Session only after the user explicitly asks Jess to take full control.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "jess_stop",
          description: "Immediately stop Jess native Windows control when the user asks Jess to stop.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "show_hub_mind_workspace",
          description: "Bring the Hub-Mind desktop workspace to the foreground.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "list_windows",
          description: "List visible Windows desktop windows, titles, process names, bounds, state and foreground status. Requires Full Control.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "manage_windows",
          description: "Focus, close, minimize, maximize, restore, move, resize or snap a real Windows desktop window. Snap supports halves, corners, thirds, and an optional monitorId from list_windows; verify the resulting state.",
          parameters: { type: "OBJECT", properties: {
            action: { type: "STRING", enum: ["focus_window", "close_window", "minimize_window", "maximize_window", "restore_window", "move_window", "resize_window", "snap_window", "show_desktop", "minimize_all", "start_menu", "switch_window"] },
            title: { type: "STRING" }, handle: { type: "STRING" }, x: { type: "NUMBER" }, y: { type: "NUMBER" },
            width: { type: "NUMBER" }, height: { type: "NUMBER" }, monitorId: { type: "STRING" },
            position: { type: "STRING", enum: ["left", "right", "top-left", "top-right", "bottom-left", "bottom-right", "left-third", "center-third", "right-third"] }
          }, required: ["action"] }
        },
        {
          name: "control_mouse",
          description: "Move or click the Windows mouse, or scroll at physical screen coordinates. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["mouse_move", "click", "double_click", "right_click", "scroll"] }, x: { type: "NUMBER" }, y: { type: "NUMBER" }, delta: { type: "NUMBER" } }, required: ["action", "x", "y"] }
        },
        {
          name: "start_windows_auto_scroll",
          description: "Start continuous real Windows mouse-wheel scrolling at the current cursor position across Hub-Mind, browsers, and other desktop apps. Direction up/down and speed 1–15 wheel steps per second. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { direction: { type: "STRING", enum: ["up", "down"] }, speed: { type: "NUMBER" } } }
        },
        {
          name: "stop_windows_auto_scroll",
          description: "Stop continuous system-wide mouse-wheel scrolling immediately. Requires the Windows desktop app.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "start_hubmind_auto_scroll",
          description: "Start adjustable auto-scroll in the current Hub-Mind reading pane, available in browser, desktop and mobile views. Scrolls only this page; use system-wide Windows auto-scroll for other apps.",
          parameters: { type: "OBJECT", properties: { direction: { type: "STRING", enum: ["up", "down"] }, speed: { type: "NUMBER" } } }
        },
        {
          name: "stop_hubmind_auto_scroll",
          description: "Stop in-app Hub-Mind reading-pane auto-scroll.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "show_windows_ui_numbers",
          description: "Show temporary Wheelhouse-style numbered badges over accessible controls in the foreground Windows app. Then activate a selected number using its exact expectedName. Requires Full Control.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "hide_windows_ui_numbers",
          description: "Hide the temporary numbered Windows UI Automation overlay.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "drag_windows_mouse",
          description: "Drag the Windows mouse from one physical screen coordinate to another. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { fromX: { type: "NUMBER" }, fromY: { type: "NUMBER" }, toX: { type: "NUMBER" }, toY: { type: "NUMBER" } }, required: ["fromX", "fromY", "toX", "toY"] }
        },
        {
          name: "type_windows_text",
          description: "Type text into the currently focused Windows app. Never use for password or payment fields. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] }
        },
        {
          name: "press_windows_keys",
          description: "Send a key or key combination to the active Windows app, such as CTRL+S or ALT+TAB. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { keys: { type: "STRING" }, holdMs: { type: "NUMBER" } }, required: ["keys"] }
        },
        {
          name: "control_system_volume",
          description: "Send a Windows volume up, down, or mute key event. The actual audio state must be checked separately; some audio drivers may not expose a readable state. Requires Full Control Session.",
          parameters: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["volume_up", "volume_down", "volume_mute"] } }, required: ["action"] }
        },
        {
          name: "control_screen_brightness",
          description: "Send a Windows brightness up or down key event. Hardware and display-driver support varies; do not claim the brightness changed without independent verification. Requires Full Control Session.",
          parameters: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["brightness_up", "brightness_down"] } }, required: ["action"] }
        },
        {
          name: "take_windows_screenshot",
          description: "Capture a fresh Windows screenshot for visual inspection and action verification. Defaults to the primary monitor in standard detail; use detail high with an exact monitorName from list_windows for a sharper single-monitor capture. Use monitorName all for standard-detail captures of connected monitors. Requires Full Control Session.",
          parameters: { type: "OBJECT", properties: { monitorName: { type: "STRING" }, detail: { type: "STRING", enum: ["standard", "high"] } } }
        },
        {
          name: "find_windows_ui_element",
          description: "Find an accessible Windows UI element by its visible name and return automation metadata and bounds. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] }
        },
        {
          name: "list_windows_ui_elements",
          description: "List up to 50 visible, enabled accessible controls in the foreground Windows window with temporary indices. For numbered activation, pass the returned index and exact expectedName to invoke_windows_ui_element. Requires Full Control.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "invoke_windows_ui_element",
          description: "Activate an accessible Windows UI element by visible name, or by temporary index from list_windows_ui_elements. Tries Microsoft UI Automation Invoke, SelectionItem, Toggle, and ExpandCollapse patterns; numbered activation requires exact expectedName to prevent stale-target actions. Verify the result with a screen read. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, index: { type: "NUMBER" }, expectedName: { type: "STRING" } } }
        },
        {
          name: "set_windows_ui_value",
          description: "Set and verify a uniquely matched, non-read-only visible Windows control through Microsoft UI Automation ValuePattern. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, value: { type: "STRING" } }, required: ["name", "value"] }
        },
        {
          name: "read_windows_screen",
          description: "Read accessible Windows UI text with OCR fallback where available. Secure desktop and protected content remain unavailable. Requires Full Control.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "open_local_windows_path",
          description: "Open an existing local file or folder with its default Windows application; do not execute it as a command. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] }
        },
        {
          name: "launch_windows_application",
          description: "Launch an installed Windows desktop application by its visible Start Menu name or executable name and check whether its window appears. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] }
        },
        {
          name: "run_windows_command_native",
          description: "Run a bounded, non-elevated PowerShell command as the current Windows user. Destructive commands are blocked. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { command: { type: "STRING" }, timeoutMs: { type: "NUMBER" } }, required: ["command"] }
        },
        {
          name: "manage_windows_files",
          description: "Manage local files with explicit bounded operations: list, read, write, copy, move, rename, search, or send to Recycle Bin. Writes and file changes follow the configured permission mode; permanent deletion is not offered.",
          parameters: { type: "OBJECT", properties: {
            action: { type: "STRING", enum: ["list", "read", "write", "copy", "move", "rename", "search", "recycle"] },
            path: { type: "STRING" }, destination: { type: "STRING" }, content: { type: "STRING" }, pattern: { type: "STRING" }, offset: { type: "NUMBER" }, limit: { type: "NUMBER" }
          }, required: ["action", "path"] }
        },
        {
          name: "manage_windows_clipboard",
          description: "Read, set, clear or paste the current Windows clipboard. Clipboard reads are bounded; paste uses Ctrl+V in the focused app. Mutating operations follow the configured permission mode.",
          parameters: { type: "OBJECT", properties: {
            action: { type: "STRING", enum: ["read", "write", "clear", "paste"] }, text: { type: "STRING" }
          }, required: ["action"] }
        },
        {
          name: "control_windows_power",
          description: "Lock the Windows workstation, schedule shutdown/restart in 15 seconds, or cancel a pending shutdown/restart. Shutdown/restart require a fresh spoken yes/no confirmation.",
          parameters: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["lock", "shutdown", "restart", "cancel_shutdown"] } }, required: ["action"] }
        },
        {
          name: "get_windows_time",
          description: "Read the local Windows time and time zone.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "get_windows_system_info",
          description: "Read basic Windows computer and operating-system information.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "chrome_list_tabs",
          description: "List open Chrome tabs with IDs, titles, URLs and loading status. Requires the Jess Chrome extension and Full Control.",
          parameters: { type: "OBJECT", properties: {} }
        },
        {
          name: "chrome_open_tab",
          description: "Open an HTTP or HTTPS website in a new Chrome tab. Requires the Jess Chrome extension and Full Control.",
          parameters: { type: "OBJECT", properties: { url: { type: "STRING" }, active: { type: "BOOLEAN" } }, required: ["url"] }
        },
        {
          name: "chrome_close_tab",
          description: "Close a specific Chrome tab by its tab ID; never close an unspecified active tab. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" } }, required: ["tabId"] }
        },
        {
          name: "chrome_activate_tab",
          description: "Activate a Chrome tab by ID, or the current active tab when omitted. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" } } }
        },
        {
          name: "chrome_navigate_tab",
          description: "Navigate a Chrome tab to an HTTP or HTTPS URL. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" }, url: { type: "STRING" }, active: { type: "BOOLEAN" } }, required: ["url"] }
        },
        {
          name: "chrome_reload_tab",
          description: "Reload a Chrome tab by ID, or the active tab when omitted. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" } } }
        },
        {
          name: "chrome_read_page",
          description: "Read visible page text and title from a Chrome tab without bypassing browser protections. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" } } }
        },
        {
          name: "chrome_find_element",
          description: "Find an element by visible text or CSS selector; this does not click it. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" }, selector: { type: "STRING" }, text: { type: "STRING" } } }
        },
        {
          name: "chrome_click_element",
          description: "Click a page element identified by visible text or CSS selector. Follow with a page read to verify the result. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" }, selector: { type: "STRING" }, text: { type: "STRING" } } }
        },
        {
          name: "chrome_fill_field",
          description: "Fill a specific input, textarea or select identified by CSS selector. Never use on password or payment fields. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" }, selector: { type: "STRING" }, value: { type: "STRING" } }, required: ["selector", "value"] }
        },
        {
          name: "chrome_scroll",
          description: "Scroll a Chrome page by a bounded amount. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" }, delta: { type: "NUMBER" }, axis: { type: "STRING", enum: ["x", "y"] }, target: { type: "STRING" } }, required: ["delta"] }
        },
        {
          name: "chrome_capture_screenshot",
          description: "Capture a compressed thumbnail preview of the active visible Chrome tab. The preview is shown to the user; use page text or screen OCR for actual content analysis. Requires Full Control.",
          parameters: { type: "OBJECT", properties: { tabId: { type: "NUMBER" } } }
        },
        {
          name: "dispatch_device_command",
          description: "Perform one explicitly requested action on the selected, registered Hub-Mind Windows laptop or Android phone. The device must be online. Windows requires local Jess Full Control to be active. Never retry uncertain actions automatically.",
          parameters: {
            type: "OBJECT",
            properties: {
              actionType: { type: "STRING", enum: [
                "TAP","DOUBLE_TAP","LONG_PRESS","SWIPE","SCROLL","TYPE_TEXT","CLEAR_TEXT","OPEN_APP","GET_INSTALLED_APPS","GET_SCREEN_HIERARCHY","SET_CLIPBOARD","GET_CLIPBOARD","NAVIGATE_BACK","GO_HOME","OPEN_RECENTS","OPEN_NOTIFICATIONS","OPEN_QUICK_SETTINGS",
                "list_windows","manage_windows","control_mouse","drag_windows_mouse","type_windows_text","press_windows_keys","control_system_volume","control_screen_brightness","take_windows_screenshot","find_windows_ui_element","list_windows_ui_elements","invoke_windows_ui_element","set_windows_ui_value","read_windows_screen","open_local_windows_path","launch_windows_application","get_windows_time","get_windows_system_info","chrome_bridge_status","chrome_list_tabs","chrome_open_tab","chrome_close_tab","chrome_activate_tab","chrome_navigate_tab","chrome_reload_tab","chrome_read_page","chrome_find_element","chrome_click_element","chrome_fill_field","chrome_scroll","chrome_capture_screenshot","manage_windows_files","manage_windows_clipboard","control_windows_power","scan_windows_storage","clean_windows_storage_candidates","start_windows_auto_scroll","stop_windows_auto_scroll","show_hub_mind_workspace","jess_stop","desktop_run_readonly_command","desktop_open_website"
              ]},
              targetDeviceId: { type: "STRING", description: "Optional exact target device ID; otherwise use the selected workspace target." },
              userExplicitlyRequested: { type: "BOOLEAN", description: "Must be true only for a direct device-action request from the user in this turn." },
              parameters: {
                type: "OBJECT",
                properties: {
                  x:{type:"NUMBER"}, y:{type:"NUMBER"}, startX:{type:"NUMBER"}, startY:{type:"NUMBER"}, endX:{type:"NUMBER"}, endY:{type:"NUMBER"},
                  text:{type:"STRING"}, appName:{type:"STRING"}, packageName:{type:"STRING"}, action:{type:"STRING"}, value:{type:"STRING"},
                  durationMs:{type:"NUMBER"}, title:{type:"STRING"}, handle:{type:"STRING"}, width:{type:"NUMBER"}, height:{type:"NUMBER"},
                  position:{type:"STRING"}, monitorId:{type:"STRING"}, delta:{type:"NUMBER"}, keys:{type:"STRING"}, name:{type:"STRING"},
                  index:{type:"NUMBER"}, expectedName:{type:"STRING"}, path:{type:"STRING"}, destination:{type:"STRING"}, content:{type:"STRING"},
                  pattern:{type:"STRING"}, offset:{type:"NUMBER"}, limit:{type:"NUMBER"}, root:{type:"STRING"},
                  largeThresholdMB:{type:"NUMBER"}, inactiveDays:{type:"NUMBER"}, maxSeconds:{type:"NUMBER"}, maxFiles:{type:"NUMBER"},
                  detectDuplicates:{type:"BOOLEAN"}, scanId:{type:"STRING"}, candidateIds:{type:"ARRAY",items:{type:"STRING"}},
                  monitorName:{type:"STRING"}, detail:{type:"STRING"}, url:{type:"STRING"}, selector:{type:"STRING"},
                  deltaY:{type:"NUMBER"}, deltaX:{type:"NUMBER"}, direction:{type:"STRING",enum:["up","down"]},
                  speed:{type:"NUMBER"}, commandName:{type:"STRING",enum:["ipconfig","systemInfo","runningProcesses"]}
                }
              }
            },
            required: ["actionType","userExplicitlyRequested"]
          }
        },
        {
          name: "end_session",
          description: "Put the AI assistant to sleep and end the live voice session when the user says 'end this session', 'go to sleep', 'sleep', or 'deactivate'.",
          parameters: { type: "OBJECT", properties: { reason: { type: "STRING" } } }
        }
      ],
    },
        {
          name: "get_hubmind_repository_status",
          description: "Fetch live public GitHub facts for Jaystarbliss-studios/HUB-MIND: recent commits and pull requests with merged/open status, summaries, and links. Use when asked what changed or what is implemented versus proposed. An open PR is not production; merged status alone is not runtime test evidence.",
          parameters: { type: "OBJECT", properties: {} }
        },
  ];

  const JESS_PROMPT_INSTRUCTION = `You are an intelligent, capable AI operations assistant inside Hub-Mind. You are not a
chatbot bolted onto the app — you have real, live access to its data via
function calls, and you are expected to use it.

## NOISE SUPPRESSION & DOMINANT SPEAKER FOCUS
- You strictly listen to the primary, highest voice speaking directly into the microphone.
- Ignore background noises, keyboard typing, room chatter, TV audio, and ambient murmurs.
- When multiple faint voices or background noise exist, prioritize the dominant nearby speaker.

## LANGUAGE POLICY & USER PREFERENCE
- Default Language: Conduct 90%+ of all conversations and operations in English by default.
- Dynamic Switching: If the user explicitly asks you to speak or reply in another language (e.g. Spanish, French, Yoruba, German, etc.), immediately switch, answer in that language, and record their preference using \`set_language_preference\` or \`save_user_memory\`.
- If the user later requests to switch back to English or another language, seamlessly adapt and update the preference.

## USER RECOGNITION & IDENTITY (CRITICAL RULE)
- You always know who is speaking with you.
- Always address the person by the name/preferred name tied to their currently logged-in Hub-Mind account.
- If the user asks "Who am I?", "What is my name?", "Do you know who I am?", "Do you remember me?", or asks about their account, immediately and confidently identify them by their name.
- If you ever need to verify the user profile, use \`get_user_profile\` or \`get_current_user_profile\`.

## RECURRING SCHEDULES ARE CALENDAR SCHEDULES (CRITICAL RULE)
- In Hub-Mind, recurring schedule templates (music classes, weekly meetings, daily standups, appointments, routines) ARE full calendar schedules.
- Whenever the user asks for their schedule, calendar events, meetings, or agenda for a particular day or time range (e.g. "what's my schedule today?", "what are my schedules for this week?", "what do I have on Tuesday?", "what is coming up between 9 AM and 2 PM?"):
  1. Call \`get_schedule\` or \`list_meetings\` with the period/dates.
  2. \`get_schedule\` evaluates BOTH single meetings AND all active recurring schedules/classes that fall into that queried time period.
  3. Announce ALL scheduled items chronologically with their start times, end times, and titles so that recurring classes and meetings are always recognized and included.
  4. Never tell the user they have nothing on their schedule if there are recurring schedules or classes set for that time period.

## PERSONA INITIALIZATION & IDENTITY RULE
- When greeting the user or opening a conversation, greet them professionally and neutrally by their name (e.g. "Hello [Name], how may I assist you today?").
- Do NOT proactively introduce yourself by name or say "I am Jess" or "My name is Jess" in standard greetings or conversational replies unless the user explicitly asks for your name, who you are, or your identity.
- Only state your name ("Jess") when the user specifically asks "What's your name?", "Who are you?", or similar questions.

## SESSION DEACTIVATION & SLEEP COMMAND
- When the user says "end this session", "go to sleep", "sleep", "deactivate", "stop session", or asks to conclude, politely bid them goodbye (e.g. "Ending session now. Have a wonderful day!") and immediately call the \`end_session\` tool to put the assistant into sleep mode.

## ATTENTIVE MEMORY & CONTINUOUS DETAIL RETENTION
- You actively listen for and notice small details, personal preferences, working styles, schedule constraints, colleague roles, client nuances, family or pet mentions, and project goals dropped in conversation.
- Whenever the user mentions any small detail or preference (e.g. "I prefer concise bullet points", "Don't schedule before 10 AM", "Sarah is the lead for project X", "I usually work late on Thursdays"), proactively and discreetly save it to their persistent memory using \`save_user_memory\` with a descriptive key and content.
- When the user comes into the operations hub in any future session, use these stored memories to personalize the conversation effortlessly without requiring them to repeat themselves.

## HARD RULE: GROUND EVERYTHING IN TOOL CALLS
Never state that a task, document, event, or piece of data exists, was
created, was updated, or was deleted unless you have just received
confirmation of it from an actual tool call in this turn. If you're unsure
whether something exists, call list_tasks, list_documents, search_workspace,
or list_calendar_events to check — never guess or assume based on earlier
conversation. If a tool call fails or returns an error, tell the user
plainly that it failed; never narrate success you haven't actually received
back from a function result.

## ASYNCHRONOUS BACKGROUND PROCESSING & CONCURRENT CONVERSATION
- When given long-running, multi-step tasks (such as document drafting, workspace audits, or batch operations), initiate them using background queue tools like start_background_operation so they process asynchronously.
- Stay fully conversational and responsive while tasks process in the background.
- When the user asks about the status of any task (e.g., "Have you done that?", "What is the progress?"), check get_background_tasks_status or review your queue context, and report the exact percentage (e.g. 50% complete, 75% complete, 100% complete) and current stage.

## IDENTITY & ADDRESSING USERS
- Always address the person by the name/preferred name tied to their currently
  logged-in Hub-Mind account. Never assume an incorrect name.
- If a user's preferred name hasn't been set yet, you can ask for it and store it using set_preferred_name.
- You have full operational authorization matching the user's role (Admin, Assistant, or Staff).

## CONFIRMATION-GATED ACTIONS
Deleting a document, and sharing a private document/task, both require
explicit user confirmation in the same conversation before you call the
underlying write. Restate exactly what you're about to do, wait for a clear
yes, then act — and confirm back with what actually happened once the tool
call returns.`;

  wss.on("connection", async (clientWs: any, request) => {
    console.log("Client connected to Live WebSocket");
    clientWs.isAlive = true;

    clientWs.on("pong", () => {
      clientWs.isAlive = true;
    });

    let liveSession: any = null;
    let isSessionActive = false;
    let isFallbackMode = false;
    let conversationalHistory: Array<{ role: string; parts: Array<any> }> = [];
    const MAX_FALLBACK_TOOL_ROUNDS = 8;
    let fallbackToolRounds = 0;
    let fallbackToolCallFingerprints: string[] = [];
    const requestUrl = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    const isDesktopRuntime = requestUrl.searchParams.get("runtime") === "desktop";
    const connectionTools = getJessToolsForRuntime(LIVE_TOOLS, isDesktopRuntime);
    const activeDocumentId = requestUrl.searchParams.get("documentId");
    const activeDocumentTitle = requestUrl.searchParams.get("documentTitle");
    const currentUserName = requestUrl.searchParams.get("userName") || requestUrl.searchParams.get("name") || "";
    const currentUserId = requestUrl.searchParams.get("userId") || "";
    const currentUserRole = requestUrl.searchParams.get("userRole") || "";
    const currentPage = requestUrl.searchParams.get("page") || "";

    const userGreetingName = currentUserName ? currentUserName.split(' ')[0] : 'there';
    const userIntroInstruction = currentUserName
      ? `\n\n## CURRENT SIGNED-IN USER RECOGNITION (CRITICAL)\n- The signed-in user is "${currentUserName}" (Username/ID: ${currentUserId || 'active-user'}, Role: ${currentUserRole || 'member'}).\n- Always address and greet this user as "${userGreetingName}".\n- You know them immediately and without hesitation: if they ask "Who am I?", "What is my name?", "Do you know me?", "What's my account name?", answer confidently that they are ${currentUserName}.`
      : `\n\n## USER IDENTITY\n- Address the signed-in user warmly. You can query get_current_user_profile or get_user_profile if needed.`;

    const liveSystemPrompt = JESS_PROMPT_INSTRUCTION +
      userIntroInstruction +
      (currentPage ? `\n\n## ACTIVE VIEW\nThe user is currently viewing the "${currentPage}" section in Hub-Mind.` : "") +
      (activeDocumentId
        ? `\n\n## CURRENT DOCUMENT\nThe user is currently working in "${activeDocumentTitle || 'Current document'}" (document ID: ${activeDocumentId}). If the user asks about this document, its contents, a section, or requests an edit, use the document tools with this ID before answering. Do not guess document contents.`
        : "");

    const geminiApiKey = process.env.GEMINI_API_KEY;

    // Try connecting to Gemini Live API
    if (!geminiApiKey) {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "error", message: "Jess Live is not configured. Add GEMINI_API_KEY to the server environment." }));
      }
      return;
    }

    try {
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      try {
        liveSession = await ai.live.connect({
          model: "gemini-3.8-live",
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            tools: connectionTools as any,
            systemInstruction: {
              parts: [{
                text: liveSystemPrompt
              }]
            },
          },
          callbacks: {
            onmessage: (message: any) => {
              if (clientWs.readyState !== 1) return;

              // Check for tool calls
              if (message.toolCall) {
                const functionCalls = message.toolCall.functionCalls || [];
                clientWs.send(
                  JSON.stringify({
                    type: "tool_call",
                    toolCall: message.toolCall,
                    functionCalls: functionCalls,
                    functionCall: functionCalls[0],
                  })
                );
              }

              // Check for audio parts
              const parts = message.serverContent?.modelTurn?.parts;
              if (parts && parts.length > 0) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    clientWs.send(
                      JSON.stringify({
                        type: "audio",
                        audio: Buffer.isBuffer(part.inlineData.data)
                          ? part.inlineData.data.toString("base64")
                          : (part.inlineData.data as any) instanceof Uint8Array
                          ? Buffer.from(part.inlineData.data as any).toString("base64")
                          : part.inlineData.data,
                        mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
                      })
                    );
                  }
                }
              }

              // Check for user speech transcription
              const inputTx =
                (message as any).serverContent?.inputTranscription?.text ||
                (message as any).inputTranscription?.text ||
                (message as any).serverContent?.inputAudioTranscription?.text;
              if (inputTx) {
                clientWs.send(
                  JSON.stringify({
                    type: "input_transcription",
                    text: inputTx,
                  })
                );
              }

              // Check for model speech transcription
              const outputTx =
                (message as any).serverContent?.outputTranscription?.text ||
                (message as any).outputTranscription?.text ||
                (message as any).serverContent?.outputAudioTranscription?.text;
              if (outputTx) {
                clientWs.send(
                  JSON.stringify({
                    type: "output_transcription",
                    text: outputTx,
                  })
                );
              }

              // Check for model turnaround done
              if (message.serverContent?.turnComplete) {
                clientWs.send(
                  JSON.stringify({
                    type: "turn_complete",
                  })
                );
              }

              // Check for interruption event
              if (message.serverContent?.interrupted) {
                clientWs.send(
                  JSON.stringify({
                    type: "interrupted",
                  })
                );
              }
            },
            onclose: () => {
              console.log("Gemini Live upstream session closed");
              if (isSessionActive && !isFallbackMode) {
                isFallbackMode = true;
                console.log("Switching to resilient fallback voice mode");
              }
            },
            onerror: (err: any) => {
              console.warn("Gemini Live session warning:", err?.message || err);
              if (!isFallbackMode) {
                isFallbackMode = true;
                console.log("Activated resilient voice bridge fallback mode");
              }
            },
          },
        });

        isSessionActive = true;
        clientWs.send(JSON.stringify({ type: "ready", message: "Connected to Live Voice" }));
      } catch (liveErr: any) {
        console.warn("Native Live API connection unavailable, activating Voice Bridge mode:", liveErr.message);
        isFallbackMode = true;
        isSessionActive = true;
        clientWs.send(JSON.stringify({ type: "ready", message: "Connected to Jess Assistant (Voice Bridge)" }));
      }

      // Handler for client messages
      // Fallback mode is a real multi-turn tool loop: after a tool response, ask the model
      // to continue with the observed result instead of leaving the conversation stalled.
      const generateFallbackTurn = async (chatAi: any) => {
        const chatRes = await chatAi.models.generateContent({
          model: "gemini-3.8-flash",
          contents: conversationalHistory as any,
          config: {
            systemInstruction: liveSystemPrompt,
            tools: connectionTools as any,
          },
        });

        const replyText = chatRes.text || "";
        const functionCalls = chatRes.functionCalls || [];
        const candidateContent = chatRes.candidates?.[0]?.content;
        if (candidateContent?.parts?.length) {
          conversationalHistory.push(candidateContent);
        } else {
          const parts: any[] = [];
          for (const call of functionCalls) {
            parts.push({ functionCall: { name: call.name, args: call.args, id: call.id } });
          }
          if (replyText) parts.push({ text: replyText });
          if (parts.length) conversationalHistory.push({ role: "model", parts });
        }

        if (functionCalls.length > 0) {
          const fingerprints = functionCalls.map((call: any) => `${call.name}:${JSON.stringify(call.args || {})}`);
          const repeatsTooOften = fingerprints.some(
            (fingerprint: string) => fallbackToolCallFingerprints.filter((seen) => seen === fingerprint).length >= 2,
          );
          fallbackToolRounds += 1;
          if (fallbackToolRounds > MAX_FALLBACK_TOOL_ROUNDS || repeatsTooOften) {
            conversationalHistory.push({
              role: "user",
              parts: functionCalls.map((call: any) => ({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: { error: "Tool loop stopped to prevent repeated execution." },
                },
              })),
            });
            if (clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({
                type: "error",
                message: "Jess paused this turn after repeated tool calls. Please rephrase the request or ask for a different approach.",
              }));
              clientWs.send(JSON.stringify({ type: "turn_complete" }));
            }
            fallbackToolRounds = 0;
            fallbackToolCallFingerprints = [];
            return;
          }
          fallbackToolCallFingerprints.push(...fingerprints);
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({
              type: "tool_call",
              functionCalls,
              functionCall: functionCalls[0],
            }));
          }
        }

        if (replyText && clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ type: "output_transcription", text: replyText }));
          try {
            const ttsRes = await chatAi.models.generateContent({
              model: "gemini-3.8-flash-lite-tts",
              contents: [{ parts: [{ text: replyText }] }],
              config: {
                responseModalities: ["AUDIO"] as any,
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
                },
              },
            });
            const audioB64 = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (audioB64 && clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({
                type: "audio",
                audio: audioB64,
                mimeType: "audio/pcm;rate=24000",
              }));
            }
          } catch (ttsErr) {
            console.warn("TTS synthesis warning in voice bridge:", ttsErr);
          }
        }

        // Do not signal the turn as complete while Jess is waiting for a tool to run.
        if (functionCalls.length === 0) {
          fallbackToolRounds = 0;
          fallbackToolCallFingerprints = [];
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: "turn_complete" }));
          }
        }
      };

      // Handler for client messages

      clientWs.on("message", async (data: any) => {
        try {
          const payload = JSON.parse(data.toString());

          // Handle heartbeat ping from client
          if (payload.type === "ping") {
            clientWs.isAlive = true;
            if (clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            }
            return;
          }

          // If Live API is active, pipe to liveSession
          if (!isFallbackMode && liveSession && isSessionActive) {
            if (payload.type === "audio") {
              liveSession.sendRealtimeInput({
                audio: { mimeType: "audio/pcm;rate=16000", data: payload.audio },
              });
            } else if (payload.type === "text") {
              liveSession.sendRealtimeInput({ text: payload.text });
            } else if (payload.type === "video") {
              liveSession.sendRealtimeInput({
                video: { mimeType: "image/jpeg", data: payload.image },
              });
            } else if (payload.type === "function_response" || payload.type === "tool_response") {
              const functionResponses =
                payload.functionResponses || (payload.functionResponse ? [payload.functionResponse] : []);
              if (functionResponses.length > 0) {
                liveSession.sendToolResponse({ functionResponses });
              }
            }
            return;
          }

          // Fallback Bridge Mode: Handle text/tool requests over the same WebSocket
          if (isFallbackMode && isSessionActive) {
            if (payload.type === "text" && payload.text) {
              fallbackToolRounds = 0;
              fallbackToolCallFingerprints = [];
              clientWs.send(JSON.stringify({ type: "input_transcription", text: payload.text }));

              conversationalHistory.push({ role: "user", parts: [{ text: payload.text }] });

              const chatAi = new GoogleGenAI({
                apiKey: geminiApiKey,
                httpOptions: {
                  headers: {
                    'User-Agent': 'aistudio-build',
                  },
                },
              });
              await generateFallbackTurn(chatAi);
            } else if (payload.type === "function_response" || payload.type === "tool_response") {
              const functionResponses =
                payload.functionResponses || (payload.functionResponse ? [payload.functionResponse] : []);
              if (functionResponses.length > 0) {
                // Keep Gemini's native function-response shape so call IDs and tool names
                // remain associated with the result in the next model turn.
                conversationalHistory.push({
                  role: "user",
                  parts: functionResponses.map((resp: any) => ({
                    functionResponse: {
                      name: resp.name,
                      id: resp.id,
                      response: resp.response,
                    },
                  })),
                });

                const chatAi = new GoogleGenAI({
                  apiKey: geminiApiKey,
                  httpOptions: {
                    headers: {
                      'User-Agent': 'aistudio-build',
                    },
                  },
                });
                await generateFallbackTurn(chatAi);
              }
            }
          }
        } catch (err: any) {
          console.error("Error processing client message:", err);
          // Never leave the voice UI waiting forever after a failed tool-result or model turn.
          if (clientWs.readyState === 1) {
            const message = String(err?.message || "Jess could not complete this voice turn. Please try again.")
              .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted API key]")
              .slice(0, 500);
            clientWs.send(JSON.stringify({ type: "error", message }));
            clientWs.send(JSON.stringify({ type: "turn_complete" }));
          }
        }
      });

      clientWs.on("close", () => {
        console.log("Client WebSocket disconnected");
        if (liveSession) {
          try {
            liveSession.close();
          } catch (e) {}
        }
        isSessionActive = false;
      });
    } catch (err: any) {
      console.error("Failed to initialize Live session:", err);
      if (clientWs.readyState === 1) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: err?.message || "Failed to start Live session",
          })
        );
        setTimeout(() => {
          if (clientWs.readyState === 1) clientWs.close();
        }, 500);
      }
    }
  });
}

startServer();
