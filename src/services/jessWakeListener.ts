export interface JessWakeListenerOptions {
  onWake: (prompt: string) => void;
  onStateChange?: (listening: boolean) => void;
}

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: {
    isFinal: boolean;
    [index: number]: { transcript: string };
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const WAKE_PATTERN = /\bjess\b/i;
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return typeof Recognition === 'function' ? Recognition as SpeechRecognitionConstructor : null;
}

export function isJessInstalledApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const native = (window as any).Capacitor?.isNativePlatform?.() === true;
  const desktop = (window as any).hubMindDesktop?.isDesktopApp === true
    || (window as any).electronAPI !== undefined
    || /Electron/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as any).standalone === true;
  return native || standalone || desktop;
}

export function isJessPcWakeSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (MOBILE_UA.test(navigator.userAgent)) return false;
  if ((navigator as any).userAgentData?.mobile === true) return false;
  if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) return false;
  return getSpeechRecognition() !== null;
}

export function extractJessWakeCommand(transcript: string): string | null {
  const text = String(transcript || '').replace(/\s+/g, ' ').trim();
  // Only activate when Jess is addressed at the start of the utterance. This
  // avoids false activation from phrases such as "what do you think, Jess?"
  const wakeMatch = text.match(/^(?:(?:hey|hello|hi|okay|ok|yo|what(?:'s| is) up)[\s,.:;!?-]+)?jess\b/i);
  if (!wakeMatch) return null;
  let command = text.slice(wakeMatch[0].length).replace(/^[\s,:;.!?\-]+/, '').trim();
  for (let i = 0; i < 3; i++) command = command.replace(/^jess[\s,:;.!?\-]*/i, '').trim();
  return command;
}

export class JessPcWakeListener {
  private recognition: SpeechRecognitionLike | null = null;
  private running = false;
  private restarting = false;
  private restartTimer: number | null = null;
  private interimWakeTimer: number | null = null;
  private interimWakeTranscript = '';

  constructor(private readonly options: JessWakeListenerOptions) {}

  start(): void {
    if (this.running || !isJessPcWakeSupported()) return;
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    this.running = true;
    this.restarting = false;
    this.createRecognition(Recognition);
    this.beginRecognition();
  }

  stop(): void {
    this.running = false;
    this.restarting = false;

    if (this.interimWakeTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.interimWakeTimer);
      this.interimWakeTimer = null;
    }
    this.interimWakeTranscript = '';

    if (this.restartTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const recognition = this.recognition;
    this.recognition = null;

    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.abort?.();
        recognition.stop();
      } catch {
        // Recognition may already be stopped by the browser.
      }
    }

    this.options.onStateChange?.(false);
  }

  private createRecognition(Recognition: SpeechRecognitionConstructor): void {
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-NG';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      this.restarting = false;
      this.options.onStateChange?.(true);
    };

    recognition.onresult = (event) => {
      if (!this.running) return;

      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const transcript = String(result?.[0]?.transcript || '').replace(/\s+/g, ' ').trim();
        if (!transcript) continue;
        const command = extractJessWakeCommand(transcript);
        if (command === null) continue;

        // Browser speech recognition can take a long time to mark a short wake
        // phrase final. For installed apps, accept a stable interim transcript
        // after a short debounce; final transcripts still wake immediately.
        if (!result.isFinal) {
          this.interimWakeTranscript = transcript;
          if (this.interimWakeTimer !== null) window.clearTimeout(this.interimWakeTimer);
          this.interimWakeTimer = window.setTimeout(() => {
            this.interimWakeTimer = null;
            if (!this.running || this.interimWakeTranscript !== transcript) return;
            this.triggerWake(recognition, command || '');
          }, 180);
          continue;
        }
        this.triggerWake(recognition, command || '');
        return;
      }
    };

    recognition.onerror = (event) => {
      this.options.onStateChange?.(false);
      if (!this.running) return;

      const error = String(event?.error || '');
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        this.running = false;
        return;
      }

      this.scheduleRestart();
    };

    recognition.onend = () => {
      this.options.onStateChange?.(false);
      if (this.running) this.scheduleRestart();
    };

    this.recognition = recognition;
  }

  private triggerWake(recognition: SpeechRecognitionLike, command: string): void {
    if (!this.running) return;
    this.running = false;
    if (this.interimWakeTimer !== null && typeof window !== 'undefined') window.clearTimeout(this.interimWakeTimer);
    this.interimWakeTimer = null;
    try { recognition.abort?.(); recognition.stop(); } catch { /* ignore shutdown races */ }
    this.options.onStateChange?.(false);
    this.options.onWake(command);
  }

  private beginRecognition(): void {
    const recognition = this.recognition;
    if (!recognition || !this.running) return;

    try {
      recognition.start();
    } catch {
      this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    if (!this.running || this.restarting || typeof window === 'undefined') return;

    this.restarting = true;
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      this.restarting = false;

      if (!this.running || !isJessPcWakeSupported()) return;

      const Recognition = getSpeechRecognition();
      if (!Recognition) return;

      this.createRecognition(Recognition);
      this.beginRecognition();
    }, 700);
  }
}
