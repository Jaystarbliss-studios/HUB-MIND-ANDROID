# Jess local desktop companion

This directory contains the transparent, offline-first character window for Hub-Mind.

- index.html is the local-only entry point.
- pet.js draws and animates frames from local WebP row strips.
- manifest.js defines animation states without fetching JSON over file://.
- preload.cjs exposes a narrow API for open, hide, move, animation state and short speech messages.
- Each sprite strip may use its own square frame size; the renderer derives source crop dimensions from the loaded image.
- assets/rows holds the six generated transparent sprite strips.

The character assets must be included in the installer. Do not replace these paths with CDN URLs. The pet must be able to launch and animate before the main Hub-Mind web UI or any model provider connects.

## States

idle, walk, run, jump, think, tired and celebrate are local animation states. The main renderer may trigger them through hubMindDesktop.setJessPetState(state) after mapping real task events to states. The desktop renderer must only announce success after its tool reports success.

## Offline smoke test

1. Build and launch the Windows desktop app with network access disabled.
2. Confirm Jess appears without waiting for APP_URL to load.
3. Close or hide the main Hub-Mind window; confirm Jess remains.
4. Use Walk and Yay!; confirm the animation continues offline.
5. Double-click Jess or press Open; the main window can reconnect independently of the pet renderer.
6. Hide Jess and use the tray's Show Jess action to restore her.

The sprite sheet is 2D artwork. A genuine 3D avatar would require a separately licensed or created VRM model and a 3D renderer.
