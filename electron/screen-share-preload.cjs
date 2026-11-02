'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jessScreenSharePicker', Object.freeze({
  onSources(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, sources) => callback(Array.isArray(sources) ? sources : []);
    ipcRenderer.on('hubmind:screen-share-sources', listener);
    return () => ipcRenderer.removeListener('hubmind:screen-share-sources', listener);
  },
  selectSource(sourceId) { ipcRenderer.send('hubmind:screen-share-select', String(sourceId || '')); },
  cancel() { ipcRenderer.send('hubmind:screen-share-cancel'); },
}));
