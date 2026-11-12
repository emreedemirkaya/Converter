const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onShow: (cb) => ipcRenderer.on('show', (_e, data) => cb(data)),
  choose: (index) => ipcRenderer.send('choose', index),
  close: () => ipcRenderer.send('close'),
  // Eksik araç kurulsun mu sorusu (Windows)
  onAsk: (cb) => ipcRenderer.on('ask', (_e, data) => cb(data)),
  answer: (yes) => ipcRenderer.send('answer', yes),
});