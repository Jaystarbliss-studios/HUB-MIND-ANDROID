import React, { useEffect, useRef, useState, useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { X } from 'lucide-react';
import { JessOrbVisualizer } from '../components/JessOrbVisualizer';
import { JessState } from '../services/liveAudioClient';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { watchJessSession, JessSessionOwner } from '../services/jessSessionCoordinator';
import './companion.css';

declare global {
  interface Window {
    hubMindDesktop?: {
      showMain: () => Promise<boolean>;
      hideCompanion: () => Promise<boolean>;
      moveCompanionBy: (dx: number, dy: number) => Promise<boolean>;
      setCompanionInteractive?: (interactive: boolean) => Promise<boolean>;
      setCompanionTranscriptVisible?: (visible: boolean) => Promise<boolean>;
      nativeStatus: () => Promise<{ active: boolean; startedAt?: string | null; userId?: string | null }>;
    };
  }
}

export function CompanionPage() {
  const { profile } = useAuth();
  const [owner, setOwner] = useState<JessSessionOwner | null>(null);
  const [requestError, setRequestError] = useState('');
  const [controlActive, setControlActive] = useState(false);
  const [dismissMode, setDismissMode] = useState(false);
  const [orbVisual, setOrbVisual] = useState<{
    state: JessState;
    inputLevel: number;
    outputLevel: number;
    connected: boolean;
  }>({
    state: 'idle',
    inputLevel: 0,
    outputLevel: 0,
    connected: false,
  });

  const pointerRef = useRef({
    down: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    holdTimer: null as number | null,
    lastTap: 0,
  });

  const bridgeChannelRef = useRef<BroadcastChannel | null>(null);

  // Cross-window BroadcastChannel setup
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('hubmind-jess-desktop-bridge');
      bridgeChannelRef.current = channel;
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'orb-state') {
          setOrbVisual({
            state: data.state || 'idle',
            inputLevel: Number.isFinite(data.inputLevel) ? data.inputLevel : 0,
            outputLevel: Number.isFinite(data.outputLevel) ? data.outputLevel : 0,
            connected: data.connected === true,
          });
        }
      };
      return () => {
        channel.close();
        bridgeChannelRef.current = null;
      };
    } catch {}
  }, []);

  // Sync state from localStorage fallback
  useEffect(() => {
    const key = 'hubmind.jess.desktopOrbState.v1';
    const load = () => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || '{}');
        const allowed = new Set(['idle', 'listening', 'thinking', 'speaking', 'interrupted', 'muted', 'error']);
        if (allowed.has(value.state)) {
          setOrbVisual({
            state: value.state as JessState,
            inputLevel: Number.isFinite(value.inputLevel) ? Math.max(0, Math.min(1, value.inputLevel)) : 0,
            outputLevel: Number.isFinite(value.outputLevel) ? Math.max(0, Math.min(1, value.outputLevel)) : 0,
            connected: value.connected === true,
          });
        }
      } catch {}
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === key) load();
    };
    window.addEventListener('storage', onStorage);
    const interval = window.setInterval(load, 250);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    return watchJessSession(profile.id, setOwner);
  }, [profile?.id]);

  useEffect(() => {
    if (!window.hubMindDesktop?.nativeStatus) return;
    let alive = true;
    const refresh = () =>
      window.hubMindDesktop!
        .nativeStatus()
        .then((status) => {
          if (alive) setControlActive(status.active && status.userId === profile?.id);
        })
        .catch(() => {
          if (alive) setControlActive(false);
        });
    void refresh();
    const interval = window.setInterval(refresh, 1500);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [profile?.id]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = pointerRef.current;
    p.down = true;
    p.moved = false;
    p.startX = event.screenX;
    p.startY = event.screenY;
    p.lastX = event.screenX;
    p.lastY = event.screenY;

    // Long press detection for drag-to-dismiss (450ms)
    p.holdTimer = window.setTimeout(() => {
      if (p.down) {
        setDismissMode(true);
      }
    }, 450);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = pointerRef.current;
    if (!p.down) return;

    const dx = event.screenX - p.lastX;
    const dy = event.screenY - p.lastY;
    const distFromStart = Math.hypot(event.screenX - p.startX, event.screenY - p.startY);

    if (distFromStart > 5) {
      p.moved = true;
    }

    if (dx || dy) {
      p.lastX = event.screenX;
      p.lastY = event.screenY;
      void window.hubMindDesktop?.moveCompanionBy(dx, dy);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = pointerRef.current;
    p.down = false;
    if (p.holdTimer !== null) {
      window.clearTimeout(p.holdTimer);
      p.holdTimer = null;
    }

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}

    // If dragged downward while in dismiss mode (>60px down), dismiss the orb
    if (dismissMode && event.screenY - p.startY > 60) {
      setDismissMode(false);
      void window.hubMindDesktop?.hideCompanion();
      return;
    }
    setDismissMode(false);

    // If moved, it was a drag gesture
    if (p.moved) {
      p.moved = false;
      return;
    }

    // Tap / double-tap handling
    const now = Date.now();
    if (now - p.lastTap < 380) {
      // Double tap: restore full workspace
      p.lastTap = 0;
      void window.hubMindDesktop?.showMain();
    } else {
      // Single tap: toggle listening or activate voice
      p.lastTap = now;
      handleOrbTap();
    }
  };

  const handleOrbTap = useCallback(async () => {
    // Broadcast immediately to main workspace
    bridgeChannelRef.current?.postMessage({ type: 'toggle-listen' });

    if (owner && owner.leaseUntil > Date.now()) {
      if (owner.client === 'windows-desktop') {
        // Voice session is active in this desktop client
        return;
      }
    }

    if (!profile?.id) return;
    try {
      const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `request-${Date.now()}`;
      await setDoc(doc(db, 'users', profile.id, 'private', 'jessActivationRequest'), {
        requestId,
        requestedAt: Date.now(),
        requestedBy: 'windows-desktop-companion',
        prompt: '',
      });
      setRequestError('');
    } catch (error) {
      console.warn('[Jess companion] Activation request failed:', error);
    }
  }, [owner, profile?.id]);

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void window.hubMindDesktop?.hideCompanion();
  };

  const isActive = !!owner && owner.leaseUntil > Date.now();
  const localActive = isActive && owner?.client === 'windows-desktop';

  return (
    <main className="jess-orb-window" aria-label="Jess desktop companion">
      <div
        className={`jess-orb-drag ${dismissMode ? 'is-dismiss-mode' : ''}`}
        title="Tap to talk · Double-click to open workspace · Drag to move · Click X or drag down to dismiss"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="jess-orb-launch">
          <JessOrbVisualizer
            state={orbVisual.state}
            inputLevel={orbVisual.inputLevel}
            outputLevel={orbVisual.outputLevel}
            connected={orbVisual.connected}
          />
        </div>
      </div>

      {/* Tiny X close button right beside the orb */}
      <button
        type="button"
        title="Close Jess orb"
        aria-label="Close Jess orb"
        className="jess-orb-tiny-close"
        onClick={handleCloseClick}
      >
        <X size={11} strokeWidth={2.5} />
      </button>

      {/* Status dot indicator */}
      {isActive && (
        <span
          className={`jess-status-dot ${localActive ? 'is-local' : 'is-remote'}`}
          title={localActive ? 'Jess voice active' : 'Active elsewhere'}
        />
      )}

      {/* Full Control indicator */}
      {controlActive && (
        <span
          className="jess-control-indicator"
          title="Full Control active (Ctrl+Alt+Shift+J to stop)"
        />
      )}

      {/* Dismiss target hint when holding */}
      {dismissMode && (
        <div className="jess-orb-dismiss-hint">
          <X size={14} />
          <span>Release to dismiss</span>
        </div>
      )}
    </main>
  );
}
