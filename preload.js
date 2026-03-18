const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsage:       () => ipcRenderer.invoke('get-usage'),
  refreshNow:     () => ipcRenderer.invoke('refresh-now'),
  isLoggedIn:     () => ipcRenderer.invoke('is-logged-in'),
  openLogin:      () => ipcRenderer.invoke('open-login'),
  onUsageUpdate:  (cb) => { ipcRenderer.removeAllListeners('usage-update');   ipcRenderer.on('usage-update',   (_, d) => cb(d)); },
  onLoginRequired:(cb) => { ipcRenderer.removeAllListeners('login-required'); ipcRenderer.once('login-required', () => cb()); },
  onLoggedIn:     (cb) => { ipcRenderer.removeAllListeners('logged-in');      ipcRenderer.once('logged-in',      () => cb()); },
  logout:         () => ipcRenderer.invoke('logout'),
  setInterval:    (min) => ipcRenderer.invoke('set-interval', min),
  getInterval:    () => ipcRenderer.invoke('get-interval'),
  setTheme:       (t) => ipcRenderer.invoke('set-theme', t),
  getTheme:       () => ipcRenderer.invoke('get-theme'),
  openUrl:        (url) => ipcRenderer.invoke('open-url', url),
  onPinChanged:   (cb) => { ipcRenderer.removeAllListeners('pin-changed'); ipcRenderer.on('pin-changed', (_, v) => cb(v)); },
  onShowAbout:    (cb) => { ipcRenderer.removeAllListeners('show-about');  ipcRenderer.on('show-about',  () => cb()); },
  togglePin:      () => ipcRenderer.invoke('toggle-pin'),
  getPin:         () => ipcRenderer.invoke('get-pin'),
  getVersion:     () => ipcRenderer.invoke('get-version'),
  fake100:        () => ipcRenderer.invoke('fake-100'), // TEMP: remove before release
});
