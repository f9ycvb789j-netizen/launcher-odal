const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
  launch: () => ipcRenderer.invoke('launch'),
  on: (channel, cb) => ipcRenderer.on(channel, (_, data) => cb(data))
});
