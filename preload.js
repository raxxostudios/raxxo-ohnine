const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsage:       () => ipcRenderer.invoke('get-usage'),
  refreshNow:     () => ipcRenderer.invoke('refresh-now'),
  isLoggedIn:     () => ipcRenderer.invoke('is-logged-in'),
  openLogin:      () => ipcRenderer.invoke('open-login'),
  onUsageUpdate:  (cb) => ipcRenderer.on('usage-update',    (_, d) => cb(d)),
  onLoginRequired:(cb) => ipcRenderer.on('login-required',  ()     => cb()),
  onLoggedIn:     (cb) => ipcRenderer.on('logged-in',       ()     => cb()),
  logout:         () => ipcRenderer.invoke('logout'),
  setInterval:    (min) => ipcRenderer.invoke('set-interval', min),
  getInterval:    () => ipcRenderer.invoke('get-interval'),
  setTheme:       (t) => ipcRenderer.invoke('set-theme', t),
  getTheme:       () => ipcRenderer.invoke('get-theme'),
  openUrl:        (url) => ipcRenderer.invoke('open-url', url),
  importCookie:   (val) => ipcRenderer.invoke('import-cookie', val),
  togglePin:      () => ipcRenderer.invoke('toggle-pin'),
  getPin:         () => ipcRenderer.invoke('get-pin'),
  getVersion:     () => ipcRenderer.invoke('get-version'),
});
