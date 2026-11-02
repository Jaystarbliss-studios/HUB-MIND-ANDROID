# Jess Hands-Free Voice Architecture

## 1. Overview & Voice Pipeline

The hands-free voice architecture in Hub-Mind Android provides continuous, natural speech interaction with **Jess**. Built natively on Android APIs (`TextToSpeech`, `SpeechRecognizer`, `AudioRecord`), the voice engine streams user speech, presents live transcripts, routes commands to internal intelligence, and synthesizes responses using Android's native text-to-speech engine.

```text
 ┌────────────────────────────────────────────────────────┐
 │                    User Voice Input                    │
 └───────────────────────────┬────────────────────────────┘
                             │ Audio PCM / Recognizer
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │               Android SpeechRecognizer                 │
 │ - Continuous listening in foreground voice session     │
 │ - Intermediate partial speech results                  │
 └───────────────────────────┬────────────────────────────┘
                             │ Recognized Text Transcript
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                 Jess Voice ViewModel                   │
 │ - State Machine: IDLE ➔ LISTENING ➔ THINKING ➔ SPEAKING│
 │ - Interruption Handling (tts.stop() on mic tap)        │
 └───────────────────────────┬────────────────────────────┘
                             │ Prompt & Natural Intent
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                Hub-Mind Control Transport              │
 │ - Resolves target device ("my phone" vs "my laptop")   │
 │ - Dispatches commands & receives verified results      │
 └───────────────────────────┬────────────────────────────┘
                             │ Synthesized Response
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                 Android TextToSpeech                   │
 │ - Synthesizes spoken output                            │
 │ - Supports instant voice interruption and cancellation │
 └────────────────────────────────────────────────────────┘
```

---

## 2. Active Hands-Free Session Lifecycle

1. **User Initiation**: User taps the microphone or launches a voice session from the Hub-Mind UI.
2. **Foreground Notification**: `HubMindAgentForegroundService` posts an ongoing notification ("Jess Active Voice Session").
3. **Sequential Conversation Loop**:
   - **Listening**: Captures user speech, updating live transcript in real-time.
   - **Thinking**: Dispatches prompt to Jess intelligence and evaluates device control intents.
   - **Speaking**: Synthesizes speech response. If user speaks or taps the mic during speech output, `tts.stop()` interrupts TTS immediately.
4. **Session Termination**: User says "Jess, stop listening" or taps the mic button to close the session.

---

## 3. Optional VoiceInteractionService (Default Digital Assistant Role)

On supported Android 10+ devices, Hub-Mind declares `HubMindVoiceInteractionService` and `HubMindVoiceInteractionSessionService`. When selected by the user in **Android Settings > Apps > Default Apps > Digital Assistant App**:
- Long-pressing the Home button or invoking the system assistant gesture launches Jess directly over the active screen.
- A setup guide in **Settings > Assistant Role Setup** explains device-specific OS limitations.
