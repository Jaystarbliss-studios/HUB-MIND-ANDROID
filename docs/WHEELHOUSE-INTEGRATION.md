# Wheelhouse integration plan for Jess

Status: **audited candidate; not yet bundled or enabled by default**.

Source repository: https://github.com/wheelhouse-project/Wheelhouse

## What the source currently establishes

Wheelhouse is a complete Windows desktop voice-control application, not just a speech-recognition library. Its documented features include local dictation, spoken punctuation, keyboard and mouse commands, window switching, and control selection by name or numbered labels. The project documents Apache-2.0 licensing for its own source.

The documented setup requires 64-bit Windows 10/11, at least 8 GB RAM (16 GB recommended), about 10 GB free disk, a microphone, and internet access for installation/model downloads. Its default Parakeet engine runs locally after the model is installed. Four or more CPU cores are recommended. A local STT engine does not make a hosted AI model or cloud STT provider offline.

The Parakeet model is separately licensed under Creative Commons Attribution 4.0. Wheelhouse's NOTICE and PROVENANCE files identify additional components and assets; these must be carried forward if any of the relevant files or models are redistributed.

## How it should fit into Jess

Jess remains the user-facing assistant and owns the mode coordinator:

1. **Dictation** — Wheelhouse performs local speech recognition and text insertion. Dictated content is never interpreted as an executable desktop command.
2. **Live conversation** — Jess's existing conversation pipeline owns the microphone and generates responses. Wheelhouse must pause/release microphone capture while Jess Live owns it.
3. **Voice command** — Wheelhouse recognises deterministic local commands and sends a typed intent to Jess's existing command router. Destructive or externally visible actions still go through Jess's permission checks and confirmation rules.
4. **Mode switching** — phrases such as “Jess, dictate”, “Jess, let's converse”, and “Jess, voice command” are control intents, not ordinary dictated text. A single coordinator must arbitrate the microphone and mode state; the user should not need to open settings to change modes.

## Integration boundary

Do not import Wheelhouse's internal Python objects or use its private shared-memory/pickle protocol as an external API. Its architecture describes a supervisor with separate logic, input, GUI, and speech-provider processes; the speech provider streams word events to Wheelhouse's own logic process over WebSocket.

The next engineering step is a small, versioned local bridge in the Windows desktop shell. It should expose only a narrow, authenticated local protocol for:
- starting/stopping local dictation;
- reporting recognition readiness and current mode;
- emitting transcript events with source and timestamp;
- accepting explicit mode-switch intents;
- reporting errors and health.

The bridge must use loopback-only or named-pipe IPC, validate every message, and never expose a general unauthenticated remote-control endpoint. The native Windows action registry and permission checks remain owned by Hub-Mind/Jess. Wheelhouse commands must not bypass those controls.

## Hardware and release gates

The HP EliteBook Revolve 810 G3 previously identified for this project uses an Intel Core i7-5600U, a 2-core/4-thread CPU. Wheelhouse recommends four or more CPU cores and at least 8 GB RAM. The laptop therefore needs a measured benchmark before the Parakeet engine is enabled by default; the CPU recommendation is not met, and installed RAM/free disk still need checking.

Benchmark on the actual target laptop:
- cold startup, first recognition latency, real-time factor and sustained CPU;
- RAM pressure while Hub-Mind, Chrome and Wheelhouse are open together;
- fixed speech samples including Nigerian English accents, punctuation and common command phrases;
- offline dictation after installation with the network disabled;
- microphone handoff between dictation and Jess Live;
- accidental command activation while dictating;
- crash recovery, stop/cancel, clean install, update and uninstall;
- confirmation that audio/transcripts do not leave the device when a local provider is selected.

## Release policy

- Keep the existing System.Speech/browser fallback available until the bridge passes acceptance tests.
- Download models as a separately versioned installer asset rather than silently increasing the main Hub-Mind package.
- Pin the Wheelhouse source revision and model checksum; include Apache-2.0, CC BY 4.0 attribution and all required third-party notices.
- Make local STT, cloud STT and AI reasoning separate settings with explicit privacy labels.
- Do not claim full offline AI conversation unless a local reasoning model is installed and tested too.
- Do not ship or enable Wheelhouse by default until the target-device benchmark and Windows acceptance tests pass.

## Source-of-truth files reviewed

- Wheelhouse README: https://github.com/wheelhouse-project/Wheelhouse/blob/main/README.md
- Architecture: https://github.com/wheelhouse-project/Wheelhouse/blob/main/ARCHITECTURE.md
- Installation: https://github.com/wheelhouse-project/Wheelhouse/blob/main/INSTALL.md
- Privacy: https://github.com/wheelhouse-project/Wheelhouse/blob/main/PRIVACY.md
- License: https://github.com/wheelhouse-project/Wheelhouse/blob/main/LICENSE
- Third-party notices: https://github.com/wheelhouse-project/Wheelhouse/blob/main/NOTICE
- Asset provenance: https://github.com/wheelhouse-project/Wheelhouse/blob/main/PROVENANCE.toml
