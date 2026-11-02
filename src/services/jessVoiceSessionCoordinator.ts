/**
 * Single-owner coordinator for Jess microphone consumers in the renderer.
 * Each acquisition returns a lease so stale async cleanup cannot release a
 * newer session's microphone. Electron remains the authority for native actions.
 */
export type JessAudioOwner = 'live-conversation' | 'dictation';
export interface JessAudioLease {
  readonly owner: JessAudioOwner;
  readonly token: symbol;
}

type Listener = (owner: JessAudioOwner | null) => void;
let activeLease: JessAudioLease | null = null;
const listeners = new Set<Listener>();

function publish() {
  for (const listener of listeners) {
    try { listener(activeLease?.owner ?? null); }
    catch (error) { console.warn('[Jess audio session] Listener failed:', error); }
  }
}

export function claimJessAudio(owner: JessAudioOwner): JessAudioLease | null {
  // Every claim is a distinct capture session. Even the same owner cannot claim
  // twice; callers must release their exact lease before starting another session.
  if (activeLease !== null) return null;
  const lease: JessAudioLease = { owner, token: Symbol(owner) };
  activeLease = lease;
  publish();
  return lease;
}

export function releaseJessAudio(lease: JessAudioLease | null | undefined): void {
  if (!lease || activeLease?.token !== lease.token) return;
  activeLease = null;
  publish();
}

export function getJessAudioOwner(): JessAudioOwner | null {
  return activeLease?.owner ?? null;
}

export function subscribeJessAudioOwner(listener: Listener): () => void {
  listeners.add(listener);
  listener(activeLease?.owner ?? null);
  return () => listeners.delete(listener);
}
