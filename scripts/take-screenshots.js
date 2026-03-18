// TEMP: Screenshot capture script for OhNine marketing materials
// Run with: npx electron scripts/take-screenshots.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 360, H = 390;
const outDir = path.join(__dirname, '..', 'screenshots');

const states = [
  {
    name: '01-dark-12pct',
    theme: 'dark',
    data: {
      session: { pct: 12, resetIn: 'in 3 hr 22 min' },
      weekly: { pct: 29, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 3, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '02-dark-45pct',
    theme: 'dark',
    data: {
      session: { pct: 45, resetIn: 'in 2 hr 10 min' },
      weekly: { pct: 52, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 18, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '03-dark-72pct',
    theme: 'dark',
    data: {
      session: { pct: 72, resetIn: 'in 1 hr 5 min' },
      weekly: { pct: 68, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 41, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '04-dark-91pct-ohnine',
    theme: 'dark',
    data: {
      session: { pct: 91, resetIn: 'in 28 min' },
      weekly: { pct: 79, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 55, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '05-dark-100pct-ohnein',
    theme: 'dark',
    data: {
      session: { pct: 100, resetIn: 'in 15 min' },
      weekly: { pct: 87, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 62, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '06-light-35pct',
    theme: 'light',
    data: {
      session: { pct: 35, resetIn: 'in 2 hr 45 min' },
      weekly: { pct: 42, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 12, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '07-light-91pct-ohnine',
    theme: 'light',
    data: {
      session: { pct: 91, resetIn: 'in 28 min' },
      weekly: { pct: 79, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 55, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
  {
    name: '08-light-100pct-ohnein',
    theme: 'light',
    data: {
      session: { pct: 100, resetIn: 'in 15 min' },
      weekly: { pct: 87, resetAt: 'Fri 4:00 PM' },
      sonnet: { pct: 62, resetAt: 'Tue 8:00 PM' },
      lastUpdated: new Date().toISOString(),
      appearance: { theme: '', font: 'ui' },
    },
  },
];

const viewStates = [
  { name: '09-login-view', view: 'login', theme: 'dark' },
  { name: '10-loading-view', view: 'loading', theme: 'dark' },
  { name: '11-about-view', view: 'about', theme: 'dark' },
  { name: '12-about-view-light', view: 'about', theme: 'light' },
];

app.dock.hide();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    frame: false,
    resizable: false,
    show: false,
    transparent: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Stub out the IPC calls that popup.js expects
  const { ipcMain } = require('electron');
  ipcMain.handle('is-logged-in', () => true);
  ipcMain.handle('get-usage', () => null);
  ipcMain.handle('get-interval', () => 60);
  ipcMain.handle('get-theme', () => 'dark');
  ipcMain.handle('get-version', () => '1.0.1');
  ipcMain.handle('get-pin', () => false);
  ipcMain.handle('refresh-now', () => states[0].data);
  ipcMain.handle('set-theme', () => {});
  ipcMain.handle('set-interval', () => {});
  ipcMain.handle('open-url', () => {});
  ipcMain.handle('open-login', () => {});
  ipcMain.handle('logout', () => {});
  ipcMain.handle('toggle-pin', () => false);

  await win.loadFile(path.join(__dirname, '..', 'popup.html'));
  await new Promise(r => setTimeout(r, 1500)); // let init run

  // Capture usage states
  for (const state of states) {
    // Set theme via IPC (same as real app)
    ipcMain.removeHandler('get-theme');
    ipcMain.handle('get-theme', () => state.theme);
    // Use insertCSS to force theme class since we can't touch DOM directly
    await win.webContents.executeJavaScript(`
      try {
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add('theme-${state.theme}');
        var isLight = '${state.theme}' === 'light';
        document.getElementById('iconSun').style.display = isLight ? 'block' : 'none';
        document.getElementById('iconMoon').style.display = isLight ? 'none' : 'block';
      } catch(e) {}
      void 0;
    `);

    // Send data via IPC event (same as real app)
    win.webContents.send('usage-update', state.data);

    await new Promise(r => setTimeout(r, 800));

    // For 100% states, wait a bit more for the walkback to start
    if (state.data.session.pct >= 100) {
      await new Promise(r => setTimeout(r, 1500));
    }

    win.show();
    await new Promise(r => setTimeout(r, 200));

    const img = await win.capturePage();
    const pngBuffer = img.toPNG();
    const outPath = path.join(outDir, `${state.name}.png`);
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`Saved: ${state.name}.png (${pngBuffer.length} bytes)`);
  }

  // Capture view states
  for (const vs of viewStates) {
    await win.webContents.executeJavaScript(`
      try {
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add('theme-${vs.theme}');
        var isLight = '${vs.theme}' === 'light';
        document.getElementById('iconSun').style.display = isLight ? 'block' : 'none';
        document.getElementById('iconMoon').style.display = isLight ? 'none' : 'block';
      } catch(e) {}
      void 0;
    `);

    if (vs.view === 'login') {
      win.webContents.send('login-required');
    } else if (vs.view === 'loading') {
      // No IPC for loading - use JS
      await win.webContents.executeJavaScript(`
        try {
          document.getElementById('mainView').classList.add('hidden');
          document.getElementById('loginView').classList.add('hidden');
          document.getElementById('loadingView').classList.remove('hidden');
          document.getElementById('aboutView').classList.add('hidden');
        } catch(e) { console.error(e); }
      `);
    } else if (vs.view === 'about') {
      win.webContents.send('show-about');
    }

    await new Promise(r => setTimeout(r, 500));
    win.show();
    await new Promise(r => setTimeout(r, 200));

    const img = await win.capturePage();
    const pngBuffer = img.toPNG();
    const outPath = path.join(outDir, `${vs.name}.png`);
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`Saved: ${vs.name}.png (${pngBuffer.length} bytes)`);
  }

  console.log(`\nDone! ${states.length + viewStates.length} screenshots saved to ${outDir}`);
  app.quit();
});
