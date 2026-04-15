const { contextBridge, ipcRenderer } = require('electron');

// Dev mode enables fakeState for preview screenshots
const isDev = process.argv.includes('--dev');

const api = {
  getUsage:       () => ipcRenderer.invoke('get-usage'),
  refreshNow:     () => ipcRenderer.invoke('refresh-now'),
  isLoggedIn:     () => ipcRenderer.invoke('is-logged-in'),
  openLogin:      () => ipcRenderer.invoke('open-login'),
  onUsageUpdate:  (cb) => { ipcRenderer.removeAllListeners('usage-update');   ipcRenderer.on('usage-update',   (_, d) => cb(d)); },
  onLoginRequired:(cb) => { ipcRenderer.removeAllListeners('login-required'); ipcRenderer.on('login-required', () => cb()); },
  onLoggedIn:     (cb) => { ipcRenderer.removeAllListeners('logged-in');      ipcRenderer.on('logged-in',      () => cb()); },
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
  checkUpdate:    () => ipcRenderer.invoke('check-update'),
};

// Only expose fakeState in dev mode (launched with --dev flag)
if (isDev) {
  api.fakeState = (n) => ipcRenderer.invoke('fake-state', n);
}

contextBridge.exposeInMainWorld('api', api);
