# Jess presence, screen sharing, meetings, and personal guidance

## Included in this change

- The in-app live transcript remains visible for the duration of an active Jess session instead of fading away after every turn. It labels whether the visible transcript is from the user or Jess.
- Screen sharing has an explicit active indicator, tells the Live session that periodic frames are being sent, and has a shared cleanup path for stopping tracks/timers/listeners.
- Saying a direct command such as “stop screen sharing” or “turn off screen sharing” stops the active capture in the current browser/desktop bridge. Ending Jess's voice session also stops capture.
- Jess's Live instructions now explicitly permit requested Christian prayer, including the Lord's Prayer, without claiming personal spiritual experience or supernatural authority.
- Meeting-note guidance asks Jess to capture heard discussion, decisions, action items, owners, and follow-ups. Tutoring observations are restricted to evidence in frames actually received; periodic screenshots are not continuous video.
- Explicit user instructions about recurring preferences and interaction style should be saved using existing memory tools when available.

## Platform limits

A normal browser/PWA cannot guarantee an always-on-top orb or transcript over unrelated desktop applications after its window is minimized. The in-app orb/transcript works while Hub-Mind is visible. A true cross-application overlay needs a supported native desktop shell/plugin or a separate Picture-in-Picture window implementation with browser support and user activation. Mobile cross-app overlays and background capture require native OS permissions and native implementation.

Screen-share frames are periodic snapshots, not continuous recording. Jess can only comment on what the received frames and microphone transcript support. Meeting notes are generated from audio/transcript actually available to the Live model; this change does not add hidden system-audio capture or claim that all meeting participants can always be heard.
