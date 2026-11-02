import { callbackUri, json, verifyOAuthState } from './lib/googleOAuth.mjs';

export default async function handler(req) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(req.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error') || '';
  try {
    const stateData = await verifyOAuthState(state);
    if (stateData.redirectUri !== callbackUri(req)) throw new Error('Google OAuth redirect URI mismatch.');
  } catch (err) {
    return new Response(`<!doctype html><html><body><script>window.opener?.postMessage({type:'hubmind-google-oauth',error:${JSON.stringify(err?.message || 'Invalid OAuth state')}},'*');window.close();</script><p>Google connection could not be validated. You can close this window.</p></body></html>`, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const payload = JSON.stringify({ type: 'hubmind-google-oauth', code, state, error });
  return new Response(`<!doctype html><html><body><script>window.opener?.postMessage(${payload},window.location.origin);window.close();</script><p>Returning to Hub-Mind…</p></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export const config = { path: '/api/google-oauth-callback' };
