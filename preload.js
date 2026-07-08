const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  loginSite: (username, password) => ipcRenderer.invoke('login-site', username, password),
  registerSite: (mc_username, email, password) => ipcRenderer.invoke('register-site', mc_username, email, password),
  launch: () => ipcRenderer.invoke('launch'),
  on: (channel, cb) => ipcRenderer.on(channel, (_, data) => cb(data)),
  openUrl: (url) => ipcRenderer.send('open-url', url),
  getSiteApi: () => ipcRenderer.invoke('get-site-api'),
  saveCredentials: (username, password) => ipcRenderer.invoke('save-credentials', username, password),
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  getLastAccount: () => ipcRenderer.invoke('get-last-account'),
  loginWithSavedAccount: (username) => ipcRenderer.invoke('login-with-saved-account', username),
  removeAccount: (username) => ipcRenderer.invoke('remove-account', username),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSystemMemoryGB: () => ipcRenderer.invoke('get-system-memory-gb'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getNews: () => ipcRenderer.invoke('get-news'),
  logout: () => ipcRenderer.invoke('logout'),
  openGameFolder: (key) => ipcRenderer.invoke('open-game-folder', key)
});
