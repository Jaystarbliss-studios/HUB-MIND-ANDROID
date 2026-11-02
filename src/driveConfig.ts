import { GOOGLE_CLIENT_ID } from './firebaseConfig';

export let driveConfig = {
  clientId: GOOGLE_CLIENT_ID,
};

export async function initDriveConfig() {
  if (driveConfig.clientId) return driveConfig.clientId;

  try {
    const res = await fetch('/api/config', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();

    if (data.googleClientId) {
      driveConfig.clientId = data.googleClientId;
    }
  } catch (e) {
    console.error('Failed to load Drive config', e);
  }

  return driveConfig.clientId;
}
