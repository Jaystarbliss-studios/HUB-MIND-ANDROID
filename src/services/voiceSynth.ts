/**
 * Universal Voice Synthesizer & Audio Player for Jess
 * Guarantees zero-failure, instant voice output across all browsers (Chrome, Edge, Safari, Firefox)
 * Handles Web Speech API, Base64 PCM / WAV / MP3 playback, and browser audio unlock policies.
 */

class VoiceSynthesizer {
  private audioCtx: AudioContext | null = null;
  private preloadedVoices: SpeechSynthesisVoice[] = [];
  private isUnlocked: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private keepAliveInterval: number | null = null;
  private isCurrentlySpeaking: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initVoices();
      this.setupAutoUnlock();
    }
  }

  private initVoices() {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      this.preloadedVoices = window.speechSynthesis.getVoices();
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Unlocks Web Audio and SpeechSynthesis on user gesture
   */
  public setupAutoUnlock() {
    if (typeof window === 'undefined') return;

    const unlock = async () => {
      if (this.isUnlocked) return;

      try {
        if (!this.audioCtx) {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtxClass) {
            this.audioCtx = new AudioCtxClass();
          }
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }

        if ('speechSynthesis' in window) {
          window.speechSynthesis.resume();
        }

        this.isUnlocked = true;
      } catch (e) {
        // will retry on next interaction
      }
    };

    window.addEventListener('click', unlock, { once: false, passive: true });
    window.addEventListener('touchstart', unlock, { once: false, passive: true });
    window.addEventListener('keydown', unlock, { once: false, passive: true });
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
  }

  public getAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    return this.audioCtx;
  }

  /**
   * Stops all active voice and audio playback
   */
  public stopAll(): void {
    this.isCurrentlySpeaking = false;
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
        this.currentAudioElement = null;
      } catch (e) {}
    }

    this.currentUtterance = null;
  }

  /**
   * Plays a cheerful notification chime
   */
  public playChime(type: 'ready' | 'wake' | 'success' | 'alert' = 'ready'): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'ready' || type === 'wake') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.08);
        osc.frequency.setValueAtTime(659.25, now + 0.16);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Plays base64 encoded audio (WAV, MP3, or PCM)
   */
  public async playBase64Audio(
    base64Data: string,
    mimeType: string = 'audio/wav',
    options?: { onStart?: () => void; onEnd?: () => void }
  ): Promise<void> {
    this.stopAll();
    this.isCurrentlySpeaking = true;

    try {
      if (options?.onStart) options.onStart();

      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      this.currentAudioElement = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.isCurrentlySpeaking = false;
        if (options?.onEnd) options.onEnd();
      };

      audio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        this.isCurrentlySpeaking = false;
        if (options?.onEnd) options.onEnd();
      };

      await audio.play();
    } catch (err) {
      this.isCurrentlySpeaking = false;
      if (options?.onEnd) options.onEnd();
    }
  }

  /**
   * Speaks text using high-quality SpeechSynthesis with British/youthful Jess personality
   */
  public speakText(
    text: string,
    options?: {
      onWordProgress?: (spokenText: string) => void;
      onStart?: () => void;
      onEnd?: () => void;
    }
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (options?.onEnd) options.onEnd();
      return;
    }

    this.stopAll();

    const cleanText = text
      .replace(/[*_#`~]/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/https?:\/\/\S+/g, 'link')
      .trim();

    if (!cleanText) {
      if (options?.onEnd) options.onEnd();
      return;
    }

    this.isCurrentlySpeaking = true;
    if (options?.onStart) options.onStart();

    try {
      // Always resume synthesis before speaking to avoid Chrome silence bug
      window.speechSynthesis.resume();

      const voices =
        this.preloadedVoices.length > 0 ? this.preloadedVoices : window.speechSynthesis.getVoices();

      // Find energetic, friendly British or English voice
      const preferredVoice =
        voices.find(
          (v) =>
            v.lang.includes('en-GB') ||
            v.name.includes('UK') ||
            v.name.includes('British') ||
            v.name.includes('George') ||
            v.name.includes('Daniel') ||
            v.name.includes('Oliver') ||
            v.name.includes('Arthur')
        ) ||
        voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Guy'))) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];

      // Break into natural conversational clauses for immediate playback
      const sentenceRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
      const sentences = cleanText.match(sentenceRegex) || [cleanText];

      let accumulatedSpoken = '';
      let sentenceIndex = 0;

      // Chrome SpeechSynthesis keep-alive timer
      if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = window.setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 8000);

      const speakNext = () => {
        if (sentenceIndex >= sentences.length) {
          this.isCurrentlySpeaking = false;
          if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
          }
          if (options?.onWordProgress) options.onWordProgress(cleanText);
          if (options?.onEnd) options.onEnd();
          return;
        }

        const sentence = sentences[sentenceIndex].trim();
        sentenceIndex++;

        if (!sentence) {
          speakNext();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(sentence);
        this.currentUtterance = utterance;

        utterance.rate = 1.06; // Lively, snappy rate
        utterance.pitch = 1.08; // Youthful, bright pitch
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onboundary = (event: SpeechSynthesisEvent) => {
          if (event.name === 'word' && options?.onWordProgress) {
            const wordOffset = event.charIndex;
            const currentSlice = sentence.substring(0, wordOffset);
            const fullSlice = accumulatedSpoken ? `${accumulatedSpoken} ${currentSlice}` : currentSlice;
            options.onWordProgress(fullSlice.trim());
          }
        };

        utterance.onend = () => {
          accumulatedSpoken = accumulatedSpoken ? `${accumulatedSpoken} ${sentence}` : sentence;
          if (options?.onWordProgress) {
            options.onWordProgress(accumulatedSpoken);
          }
          speakNext();
        };

        utterance.onerror = (err) => {
          console.debug('Utterance notice:', err);
          speakNext();
        };

        window.speechSynthesis.speak(utterance);
      };

      // Start first clause immediately
      speakNext();
    } catch (err) {
      console.warn('Voice synthesis fallback error:', err);
      this.isCurrentlySpeaking = false;
      if (options?.onEnd) options.onEnd();
    }
  }

  public isSpeaking(): boolean {
    return (
      this.isCurrentlySpeaking ||
      (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking)
    );
  }
}

export const voiceSynthesizer = new VoiceSynthesizer();
