// Local animation manifest. Kept as a script instead of fetch() so file:// startup is offline-safe.
// Source frame size is detected per strip: the original strips are 96x96, while the replacement walk strip is 128x128.
window.JessPetManifest = Object.freeze({
  columns: 5,
  rows: 6,
  animations: {
    idle:      { frames: [{ row: 0, col: 4 }], fps: 1, loop: true, label: "Idle" },
    stride:    { frames: [0, 1, 2, 3, 4].map(col => ({ row: 0, col })), fps: 5, loop: true, label: "Moving" },
    run:       { frames: [{ row: 1, col: 0 }, { row: 1, col: 1 }], fps: 8, loop: true, label: "Running" },
    jump:      { frames: [{ row: 1, col: 2 }, { row: 1, col: 3 }], fps: 6, loop: false, label: "Jumping" },
    think:     { frames: [{ row: 1, col: 4 }], fps: 1, loop: true, label: "Thinking" },
    happy:     { frames: [{ row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 }], fps: 6, loop: true, label: "Happy" },
    walk:      { frames: [0, 1, 2, 3, 4].map(col => ({ row: 3, col })), fps: 6, loop: true, label: "Walking" },
    tired:     { frames: [0, 1, 2, 3, 4].map(col => ({ row: 4, col })), fps: 3, loop: true, label: "Tired" },
    celebrate: { frames: [0, 1, 2, 3, 4].map(col => ({ row: 5, col })), fps: 6, loop: false, label: "Celebrating" }
  },
  expressions: {
    happy: { row: 2, col: 0 },
    happyEyesClosed: { row: 2, col: 1 },
    concerned: { row: 2, col: 2 },
    surprised: { row: 2, col: 3 },
    annoyed: { row: 2, col: 4 }
  },
  rowAssets: [
    "./assets/rows/jess-row-0.webp",
    "./assets/rows/jess-row-1.webp",
    "./assets/rows/jess-row-2.webp",
    "./assets/rows/jess-row-3.webp",
    "./assets/rows/jess-row-4.webp",
    "./assets/rows/jess-row-5.webp"
  ]
});
