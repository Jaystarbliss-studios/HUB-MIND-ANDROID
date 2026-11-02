import { CALENDAR_SCOPES, GMAIL_SCOPES, requestGoogleAccessToken, getCachedCalendarToken } from './googleAuthToken';

export const initGoogleApi = async () => {
  return true;
};

export const getGoogleToken = async (): Promise<string> => {
  const cached = getCachedCalendarToken();
  if (cached) return cached;
  return requestGoogleAccessToken([...CALENDAR_SCOPES, ...GMAIL_SCOPES]);
};

export const getCalendarEvents = async (timeMin: string, timeMax: string) => {
  const token = await getGoogleToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error("Failed to fetch calendar");
  return res.json();
};

export const sendEmail = async (to: string, subject: string, body: string) => {
  const token = await getGoogleToken();
  const rawMessage = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
  const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });
  if (!res.ok) throw new Error("Failed to send email");
  return res.json();
};

export const createCalendarEvent = async (summary: string, description: string, start: string, end: string) => {
  const token = await getGoogleToken();
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end }
    })
  });
  if (!res.ok) throw new Error("Failed to create calendar event");
  return res.json();
};
