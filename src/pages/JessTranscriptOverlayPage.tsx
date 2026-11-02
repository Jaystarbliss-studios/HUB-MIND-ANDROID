import React, { useCallback, useEffect, useRef, useState } from 'react';
import './jess-transcript-overlay.css';

type TranscriptEntry = {
  id: string;
  speaker: 'user' | 'jess';
  text: string;
  at: number;
};

const TRANSCRIPT_KEY = 'hubmind.jess.desktopTranscript.v1';
const HIDE_AFTER_MS = 7000;

/**
 * Dedicated, non-draggable desktop caption surface. The Electron main process
 * owns its fixed screen position; this renderer only supplies transcript content
 * and asks the main process to show/hide it.
 */
export function JessTranscriptOverlayPage() {
  const [entry, setEntry] = useState<TranscriptEntry | null>(null);
  const snapshotRef = useRef('');
  const hideTimerRef = useRef<number | null>(null);
  const hideAtRef = useRef(0);
  const visibleRef = useRef(false);

  const setVisible = useCallback((visible: boolean) => {
    if (visibleRef.current === visible) return;
    visibleRef.current = visible;
    if ((window as any).hubMindDesktop?.isDesktopApp) {
      void (window as any).hubMindDesktop.setTranscriptOverlayVisible?.(visible).catch(() => undefined);
    }
  }, []);

  const loadTranscript = useCallback((showOnChange: boolean) => {
    try {
      const raw = localStorage.getItem(TRANSCRIPT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const entries: TranscriptEntry[] = Array.isArray(parsed)
        ? parsed.filter((item: any) =>
            item &&
            typeof item.id === 'string' &&
            (item.speaker === 'user' || item.speaker === 'jess') &&
            typeof item.text === 'string' &&
            typeof item.at === 'number'
          ).slice(-40)
        : [];
      const latest = entries.length ? entries[entries.length - 1] : null;
      const snapshot = latest ? JSON.stringify(latest) : '';
      const changed = snapshot !== snapshotRef.current;
      snapshotRef.current = snapshot;
      setEntry(latest);

      const fresh = !!latest && Date.now() - latest.at < HIDE_AFTER_MS + 1500 && latest.at > hideAtRef.current;
      if ((showOnChange && changed && latest) || fresh) {
        setVisible(true);
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          hideAtRef.current = Date.now();
          setVisible(false);
          hideTimerRef.current = null;
        }, HIDE_AFTER_MS);
      } else if (!latest || !fresh) {
        setVisible(false);
      }
    } catch {
      setVisible(false);
    }
  }, [setVisible]);

  useEffect(() => {
    if (!(window as any).hubMindDesktop?.isDesktopApp) return;
    loadTranscript(false);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === TRANSCRIPT_KEY) loadTranscript(true);
    };
    window.addEventListener('storage', onStorage);
    const interval = window.setInterval(() => loadTranscript(true), 350);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideAtRef.current = Date.now();
      setVisible(false);
    };
  }, [loadTranscript, setVisible]);

  if (!(window as any).hubMindDesktop?.isDesktopApp || !entry?.text) return null;

  return (
    <main className="jess-transcript-overlay-page" aria-live="polite" aria-atomic="true">
      <div className="jess-transcript-overlay-caption">
        <div className="jess-transcript-overlay-label">
          <span className={entry.speaker === 'jess' ? 'jess-transcript-dot is-jess' : 'jess-transcript-dot'} />
          {entry.speaker === 'user' ? 'YOU' : 'JESS'}
        </div>
        <p key={entry.id}>{entry.text}</p>
      </div>
    </main>
  );
}
