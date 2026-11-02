const { contextBridge, ipcRenderer } = require("electron");

// The pet page is local and receives a deliberately small API.
// It does not receive Jess's full desktop-control or shell-execution bridge.
contextBridge.exposeInMainWorld('jessPet', Object.freeze({
  activateVoice: (gesture) => ipcRenderer.invoke("hubmind:pet-activate-voice", gesture),
  openHubMind: () => ipcRenderer.invoke("hubmind:pet-open-app"),
  hide: () => ipcRenderer.invoke("hubmind:pet-hide"),
  moveBy: (dx, dy) => ipcRenderer.invoke("hubmind:pet-move-by", dx, dy),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("hubmind:pet-state", listener);
    return () => ipcRenderer.removeListener("hubmind:pet-state", listener);
  },
  onVisualState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, visualState) => callback(visualState);
    ipcRenderer.on("hubmind:pet-visual-state", listener);
    return () => ipcRenderer.removeListener("hubmind:pet-visual-state", listener);
  },
  onSpeech: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hubmind:pet-speech", listener);
    return () => ipcRenderer.removeListener("hubmind:pet-speech", listener);
  }
}));
