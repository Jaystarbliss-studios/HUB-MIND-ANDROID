import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { claimJessAudio, releaseJessAudio, type JessAudioLease } from '../services/jessVoiceSessionCoordinator';
import { normalizeJessDictationTranscript } from '../services/jessDictationText';

interface VoiceDictationProps {
  onTranscript: (transcript: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  placeholder?: string;
}

export function VoiceDictation({
  onTranscript,
  size = 'md',
  className = '',
}: VoiceDictationProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isSessionBusy, setIsSessionBusy] = useState(false);
  const recognitionRef = useRef<any>(null);
  const nativeDictationRef = useRef(false);
  const nativeDictationActiveRef = useRef(false);
  const audioLeaseRef = useRef<JessAudioLease | null>(null);
  const claimDictationAudio = () => {
    const lease = claimJessAudio('dictation');
    if (!lease) return false;
    audioLeaseRef.current = lease;
    return true;
  };
  const releaseDictationAudio = () => {
    const lease = audioLeaseRef.current;
    audioLeaseRef.current = null;
    releaseJessAudio(lease);
  };
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const resumeDesktopWake = () => {
    const desktop = (window as any).hubMindDesktop;
    if (desktop?.isDesktopApp && typeof desktop.startOfflineWake === 'function') {
      void Promise.resolve(desktop.startOfflineWake()).catch((error) => console.warn('[Jess] Could not resume offline wake listener:', error));
    }
  };

  useEffect(() => {
    const desktop = (window as any).hubMindDesktop;
    const nativeAvailable = desktop?.isDesktopApp
      && typeof desktop.startOfflineDictation === 'function'
      && typeof desktop.onOfflineDictation === 'function';

    if (nativeAvailable) {
      nativeDictationRef.current = true;
      setIsSupported(true);
      const removeListener = desktop.onOfflineDictation((payload: { transcript?: string; error?: string }) => {
        if (payload?.error) {
          nativeDictationActiveRef.current = false;
          releaseDictationAudio();
          setIsListening(false);
          setIsSessionBusy(false);
          console.warn('[Jess] Local dictation failed:', payload.error);
          resumeDesktopWake();
          return;
        }
        const transcript = typeof payload?.transcript === 'string' ? payload.transcript.trim() : '';
        if (transcript) onTranscriptRef.current(normalizeJessDictationTranscript(transcript));
      });
      return () => {
        try { removeListener?.(); } catch {}
        if (nativeDictationActiveRef.current) {
          nativeDictationActiveRef.current = false;
          void Promise.resolve(desktop.stopOfflineWake?.()).catch(() => undefined);
        }
        nativeDictationRef.current = false;
        releaseDictationAudio();
      };
    }

    nativeDictationRef.current = false;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript.trim()) onTranscriptRef.current(normalizeJessDictationTranscript(finalTranscript));
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          releaseDictationAudio();
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        releaseDictationAudio();
        setIsListening(false);
        resumeDesktopWake();
      };

      recognitionRef.current = recognition;
      setIsSupported(true);
    } catch (error) {
      console.warn('SpeechRecognition initialization error:', error);
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      releaseDictationAudio();
    };
  }, []);

  const toggleListening = async () => {
    if (nativeDictationRef.current) {
      const desktop = (window as any).hubMindDesktop;
      if (isListening) {
        try { await desktop.stopOfflineWake(); }
        catch (error) { console.warn('[Jess] Could not stop local dictation:', error); }
        nativeDictationActiveRef.current = false;
        releaseDictationAudio();
        setIsListening(false);
        setIsSessionBusy(false);
        resumeDesktopWake();
        return;
      }

      if (!claimDictationAudio()) {
        setIsSessionBusy(true);
        return;
      }
      setIsSessionBusy(false);
      try {
        await desktop.stopOfflineWake();
        const result = await desktop.startOfflineDictation();
        if (!result?.started) throw new Error(result?.error || 'Windows local dictation could not start.');
        nativeDictationActiveRef.current = true;
        setIsListening(true);
      } catch (error) {
        nativeDictationActiveRef.current = false;
        releaseDictationAudio();
        setIsListening(false);
        console.warn('[Jess] Local dictation start failed:', error);
        resumeDesktopWake();
      }
      return;
    }

    if (!recognitionRef.current) return;
    if (isListening) {
      try { recognitionRef.current.stop(); } catch {}
      releaseDictationAudio();
      setIsListening(false);
      setIsSessionBusy(false);
    } else {
      if (!claimDictationAudio()) {
        setIsSessionBusy(true);
        return;
      }
      setIsSessionBusy(false);
      try {
        const desktop = (window as any).hubMindDesktop;
        if (desktop?.isDesktopApp && typeof desktop.stopOfflineWake === 'function') {
          await desktop.stopOfflineWake();
        }
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        releaseDictationAudio();
        console.warn('Speech start error:', error);
        setIsListening(false);
        resumeDesktopWake();
      }
    }
  };

  if (!isSupported) return null;

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3.5 py-1.5 text-sm gap-2',
    lg: 'px-4 py-2 text-base gap-2.5',
  }[size];

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`inline-flex items-center font-medium rounded-lg transition-all cursor-pointer ${
        isListening
          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 animate-pulse'
          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
      } ${sizeClasses} ${className}`}
      title={isListening ? 'Stop Voice Recording' : isSessionBusy ? 'Jess microphone is busy. Stop the active voice session first.' : nativeDictationRef.current ? 'Start offline Windows dictation' : 'Start Voice Dictation'}
    >
      {isListening ? (
        <>
          <MicOff className={`${iconSizes} animate-bounce text-white`} />
          <span>Recording... (Click to stop)</span>
        </>
      ) : (
        <>
          <Mic className={`${iconSizes} text-teal-400`} />
          <span>{isSessionBusy ? 'Mic busy' : nativeDictationRef.current ? 'Offline Dictate' : 'Dictate'}</span>
        </>
      )}
    </button>
  );
}
