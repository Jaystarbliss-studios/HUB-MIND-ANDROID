const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  },
});

export default async function handler(req) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0197530608';
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || 'dev-api-key';
  const appId = process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '1:123311605381:web:hubmind';
  const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123311605381';
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID || 'ai-studio-hubmind-4cac2024-c6eb-4208-80cf-928714dfd430';
  const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';

  // These values are Firebase/Google browser configuration, not authorization
  // credentials. They are fetched at runtime so their values are never embedded
  // in the static build artifacts scanned by Netlify.
  return json({
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
}

export const config = { path: '/api/config' };
