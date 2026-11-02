import { db, auth } from '../firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { 
  CALENDAR_SCOPES, 
  getCachedCalendarToken, 
  setCachedCalendarToken, 
  clearGoogleTokens,
  disconnectPersistentGoogleConnection,
  requestGoogleAccessToken 
} from './googleAuthToken';

export interface CalendarEventPayload {
  summary: string;
  description?: string;
  startDateTime: string; // ISO string or YYYY-MM-DDTHH:mm:ss
  endDateTime?: string;   // ISO string or YYYY-MM-DDTHH:mm:ss
  reminderMinutes?: number | number[];
  location?: string;
  recurrenceRule?: string; // e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR' or 'RRULE:FREQ=DAILY'
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
  recurrence?: string[];
}


const CALENDAR_EVENTS_CACHE_PREFIX = 'hubmind_gcal_events_v2_';
const CALENDAR_EVENTS_SYNC_PREFIX = 'hubmind_gcal_events_sync_v2_';
function userKey(base: string) { return `${base}_${auth.currentUser?.uid || 'anonymous'}`; }
function calendarEventsCacheKey() { return `${CALENDAR_EVENTS_CACHE_PREFIX}${auth.currentUser?.uid || 'anonymous'}`; }

export function getCachedGoogleCalendarEvents(timeMin?: string, timeMax?: string): GoogleCalendarEvent[] {
  try {
    const raw = localStorage.getItem(calendarEventsCacheKey());
    const events = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(events)) return [];
    const min = timeMin ? new Date(timeMin).getTime() : -Infinity;
    const max = timeMax ? new Date(timeMax).getTime() : Infinity;
    return events.filter((event: GoogleCalendarEvent) => {
      const value = new Date(event.start?.dateTime || event.start?.date || 0).getTime();
      return value >= min && value <= max;
    });
  } catch { return []; }
}

function cacheGoogleCalendarEvents(events: GoogleCalendarEvent[]) {
  try {
    const existing = getCachedGoogleCalendarEvents(undefined, undefined);
    const map = new Map<string, GoogleCalendarEvent>();
    existing.forEach(event => map.set(event.id, event));
    events.forEach(event => map.set(event.id, event));
    localStorage.setItem(calendarEventsCacheKey(), JSON.stringify(Array.from(map.values()).slice(-300)));
    localStorage.setItem(userKey(CALENDAR_EVENTS_SYNC_PREFIX), String(Date.now()));
  } catch {}
}

export async function refreshGoogleCalendarEvents(timeMin?: string, timeMax?: string): Promise<GoogleCalendarEvent[]> {
  const events = await listGoogleCalendarEvents(timeMin, timeMax);
  cacheGoogleCalendarEvents(events);
  return events;
}

const STORAGE_CONNECTED_KEY = 'hubmind_gcal_connected';
const STORAGE_EMAIL_KEY = 'hubmind_gcal_email';
const STORAGE_EXP_KEY = 'hubmind_gcal_token_exp';

export function isGoogleCalendarConnected(): boolean {
  try {
    const isConn = localStorage.getItem(userKey(STORAGE_CONNECTED_KEY)) === 'true';
    return isConn;
  } catch {
    return !!getCachedCalendarToken();
  }
}

export async function hydrateGoogleCalendarConnection(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const rootConnected = snap.exists() && snap.data()?.googleCalendarConnected === true;
    const privateConnection = await getDoc(doc(db, 'users', user.uid, 'private', 'googleConnection'));
    const connected = rootConnected || privateConnection.exists();
    localStorage.setItem(userKey(STORAGE_CONNECTED_KEY), connected ? 'true' : 'false');
    if (connected && snap.data()?.googleCalendarEmail) {
      localStorage.setItem(userKey(STORAGE_EMAIL_KEY), String(snap.data().googleCalendarEmail));
    }
    return connected;
  } catch {
    return isGoogleCalendarConnected();
  }
}

export function getGoogleCalendarConnectionInfo(): {
  connected: boolean;
  email: string | null;
  expiresAt: number;
} {
  try {
    const isConn = localStorage.getItem(userKey(STORAGE_CONNECTED_KEY)) === 'true';
    const savedExp = Number(localStorage.getItem(userKey(STORAGE_EXP_KEY))) || 0;
    const email = localStorage.getItem(userKey(STORAGE_EMAIL_KEY)) || auth.currentUser?.email || null;
    const isValid = isConn;
    return { connected: isValid, email: isValid ? email : null, expiresAt: savedExp };
  } catch {
    return { connected: false, email: null, expiresAt: 0 };
  }
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await disconnectPersistentGoogleConnection();
  clearGoogleTokens();
  const current = auth.currentUser;
  if (current) {
    try {
      await updateDoc(doc(db, 'users', current.uid), {
        googleCalendarConnected: false,
        googleCalendarDisconnectedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Could not update user doc on gcal disconnect:', e);
    }
  }
}

export async function getCalendarAccessToken(forcePrompt = false): Promise<string> {
  if (!forcePrompt) {
    const existing = getCachedCalendarToken();
    if (existing) return existing;
  }

  const token = await requestGoogleAccessToken(CALENDAR_SCOPES, forcePrompt);
  if (!token) {
    throw new Error('Google Calendar access token could not be obtained.');
  }

  try {
    localStorage.setItem(userKey(STORAGE_CONNECTED_KEY), 'true');
    if (auth.currentUser?.email) {
      localStorage.setItem(userKey(STORAGE_EMAIL_KEY), auth.currentUser.email);
    }
  } catch {}

  const user = auth.currentUser;
  if (user) {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        googleCalendarConnected: true,
        googleCalendarConnectedAt: new Date().toISOString(),
        googleCalendarEmail: auth.currentUser?.email || null,
      });
    } catch (e) {
      console.warn('Could not sync gcal connection to user doc:', e);
    }
  }

  return token;
}

/**
 * One-time connection helper for Google Calendar.
 * Prompts user once to grant permission and persists the token and connection state.
 */
export async function connectGoogleCalendarOnce(): Promise<{
  success: boolean;
  message: string;
  email?: string;
}> {
  try {
    const token = await getCalendarAccessToken(true);
    // Verify token by making a test calendar request
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    let primaryEmail = auth.currentUser?.email || 'your Google account';
    if (res.ok) {
      const calData = await res.json().catch(() => ({}));
      if (calData.id) {
        primaryEmail = calData.id;
        try {
          localStorage.setItem(userKey(STORAGE_EMAIL_KEY), primaryEmail);
        } catch {}
      }
    }

    return {
      success: true,
      email: primaryEmail,
      message: `Google Calendar successfully connected for ${primaryEmail}. Hub-Mind will sync events and recurring schedules seamlessly.`,
    };
  } catch (error: any) {
    console.error('Google Calendar connection error:', error);
    return {
      success: false,
      message: error?.message || 'Failed to connect Google Calendar. Please allow popups for this site.',
    };
  }
}

/**
 * Creates a Google Calendar event (supports single and recurring events with reminders).
 */
export async function createGoogleCalendarEvent(payload: CalendarEventPayload): Promise<{
  success: boolean;
  event?: GoogleCalendarEvent;
  htmlLink?: string;
  message: string;
}> {
  const token = await getCalendarAccessToken();

  const startDate = new Date(payload.startDateTime);
  let endDate = payload.endDateTime ? new Date(payload.endDateTime) : new Date(startDate.getTime() + 45 * 60 * 1000);
  if (endDate <= startDate) {
    endDate = new Date(startDate.getTime() + 45 * 60 * 1000);
  }

  const reminderMinutes = payload.reminderMinutes !== undefined ? payload.reminderMinutes : 15;
  const reminderList = Array.isArray(reminderMinutes) ? reminderMinutes : [reminderMinutes];

  const eventBody: any = {
    summary: payload.summary,
    description: payload.description || 'Created by Jess via Hub-Mind',
    start: {
      dateTime: startDate.toISOString(),
    },
    end: {
      dateTime: endDate.toISOString(),
    },
    location: payload.location || undefined,
    reminders: {
      useDefault: false,
      overrides: [
        ...reminderList.filter((m: any) => Number.isFinite(Number(m)) && Number(m) >= 0).slice(0, 5).flatMap((minutes: any) => [
          { method: 'popup', minutes: Number(minutes) },
          { method: 'email', minutes: Number(minutes) },
        ]),
      ],
    },
  };

  // Support recurring Google Calendar events via RRULE
  if (payload.recurrenceRule) {
    const cleanRule = payload.recurrenceRule.startsWith('RRULE:')
      ? payload.recurrenceRule
      : `RRULE:${payload.recurrenceRule}`;
    eventBody.recurrence = [cleanRule];
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Calendar API error: ${res.statusText}`);
  }

  const event: GoogleCalendarEvent = await res.json();
  const recurringText = payload.recurrenceRule ? ' (Recurring schedule)' : '';
  return {
    success: true,
    event,
    htmlLink: event.htmlLink,
    message: `Created Calendar event "${event.summary}"${recurringText} starting ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} with a ${reminderMinutes}-minute reminder popup.`,
  };
}

export async function listGoogleCalendarEvents(timeMin?: string, timeMax?: string): Promise<GoogleCalendarEvent[]> {
  const cached = getCachedGoogleCalendarEvents(timeMin, timeMax);
  let cachedAt = 0;
  try { cachedAt = Number(localStorage.getItem(userKey(CALENDAR_EVENTS_SYNC_PREFIX))) || 0; } catch {}
  // Voice queries should be instantaneous when a warm calendar snapshot exists.
  // Refresh it in the background; do not make Jess wait for Google on every turn.
  if (cached.length && Date.now() - cachedAt < 60_000) {
    void refreshGoogleCalendarEvents(timeMin, timeMax).catch(() => {});
    return cached;
  }

  let token: string;
  try {
    token = await getCalendarAccessToken(false);
  } catch {
    // A previously connected account may have an expired token or revoked grant.
    // Never open an interactive popup from a background schedule read.
    return cached;
  }

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin || new Date().toISOString());
  if (timeMax) {
    url.searchParams.set('timeMax', timeMax);
  }
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '30');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to fetch events: ${res.statusText}`);
  }

  const data = await res.json();
  const events = data.items || [];
  cacheGoogleCalendarEvents(events);
  return events;
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<boolean> {
  const token = await getCalendarAccessToken();

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Failed to delete calendar event: ${res.statusText}`);
  }

  return true;
}
