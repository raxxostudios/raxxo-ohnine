const { app, BrowserWindow, Tray, nativeImage, ipcMain, screen, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const configPath = path.join(app.getPath('userData'), 'config.json');

let tray = null;
let popupWindow = null;
let loginWindow = null;
let lastTrayPct = 0;
let trayRenderSeq = 0;
let isUpdating = false;

let usageData = {
  session: { pct: 0, label: 'Current session', resetIn: '' },
  weekly:  { pct: 0, label: 'All models',      resetAt: '' },
  sonnet:  { pct: 0, label: 'Sonnet only',      resetAt: '' },
  lastUpdated: null,
};

// ─── Config ───────────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch(e) {
    console.error('loadConfig failed, using defaults:', e.message);
  }
  return { checkInterval: 0 };
}
function saveConfig(cfg) {
  try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2)); }
  catch(e) { console.error('saveConfig failed:', e.message); }
}

// ─── Pure-JS PNG encoder (for tray icons) ─────────────────────────────────────
function crc32(buf) {
  let c = 0xffffffff;
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=(v&1)?0xedb88320^(v>>>1):v>>>1;t[n]=v;}
    return t;
  })();
  for (let i=0;i<buf.length;i++) c=table[(c^buf[i])&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function makeChunk(type, data) {
  const tb=Buffer.from(type,'ascii'), len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body=Buffer.concat([tb,data]), crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len,body,crc]);
}
function makePNG(w,h,pixels) {
  const raw=Buffer.alloc(h*(1+w*4));
  for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;for(let x=0;x<w;x++){const d=y*(w*4+1)+1+x*4,s=(y*w+x)*4;raw[d]=pixels[s];raw[d+1]=pixels[s+1];raw[d+2]=pixels[s+2];raw[d+3]=pixels[s+3];}}
  const compressed=zlib.deflateSync(raw),ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),makeChunk('IHDR',ihdr),makeChunk('IDAT',compressed),makeChunk('IEND',Buffer.alloc(0))]);
}
// ─── SVG mascot rasteriser (scanline polygon fill) ────────────────────────────
// Draws the clean Claw'd SVG (viewBox 0 0 40 26) directly into a pixel buffer.
const MASCOT_BODY = [
  {x:40,y:8.1},{x:33.3,y:8.1},{x:33.3,y:4.9},{x:31.6,y:4.9},{x:31.6,y:3.2},
  {x:33.3,y:3.2},{x:33.3,y:0},{x:6.6,y:0},{x:6.6,y:3.2},{x:8.4,y:3.2},
  {x:8.4,y:4.9},{x:6.6,y:4.9},{x:6.6,y:8.1},{x:0,y:8.1},{x:0,y:16.3},
  {x:6.6,y:16.3},{x:6.6,y:21.2},{x:6.6,y:26},{x:9.9,y:26},{x:9.9,y:21.2},
  {x:13.3,y:21.2},{x:13.3,y:26},{x:16.7,y:26},{x:16.7,y:21.2},{x:23.3,y:21.2},
  {x:23.3,y:26},{x:26.6,y:26},{x:26.6,y:21.2},{x:30,y:21.2},{x:30,y:26},
  {x:33.3,y:26},{x:33.3,y:16.3},{x:40,y:16.3},
];

function fillPoly(px, W, H, verts, ox, oy, sc, r, g, b) {
  const pts = verts.map(v => [v.x * sc + ox, v.y * sc + oy]);
  const yMin = Math.floor(Math.min(...pts.map(p => p[1])));
  const yMax = Math.ceil( Math.max(...pts.map(p => p[1])));
  const n = pts.length;
  for (let y = yMin; y <= yMax; y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const [ax,ay] = pts[i], [bx,by] = pts[(i+1)%n];
      if ((ay <= y && by > y) || (by <= y && ay > y))
        xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a,b2) => a-b2);
    for (let i = 0; i+1 < xs.length; i += 2) {
      for (let x = Math.floor(xs[i]); x <= Math.ceil(xs[i+1]); x++) {
        if (x<0||x>=W||y<0||y>=H) continue;
        const idx=(y*W+x)*4; px[idx]=r;px[idx+1]=g;px[idx+2]=b;px[idx+3]=255;
      }
    }
  }
}

function fillRect2(px, W, H, svgX, svgY, svgW, svgH, ox, oy, sc, r, g, b) {
  const x0=Math.floor(svgX*sc+ox), y0=Math.floor(svgY*sc+oy);
  const x1=Math.ceil((svgX+svgW)*sc+ox), y1=Math.ceil((svgY+svgH)*sc+oy);
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) {
    if (x<0||x>=W||y<0||y>=H) continue;
    const idx=(y*W+x)*4; px[idx]=r;px[idx+1]=g;px[idx+2]=b;px[idx+3]=255;
  }
}

function drawMascot(px, W, H, ox, oy, sc) {
  fillPoly( px, W, H, MASCOT_BODY, ox, oy, sc, 0xda, 0x78, 0x59); // salmon body
  fillRect2(px, W, H,  8.4, 3.3, 23.3, 1.6, ox, oy, sc, 0x18, 0x4c, 0x81); // blue band
  fillRect2(px, W, H, 10,   8.1,  3.6, 4.9, ox, oy, sc, 0x2a, 0x00, 0x00); // left eye
  fillRect2(px, W, H, 26.5, 8.1,  3.6, 4.9, ox, oy, sc, 0x2a, 0x00, 0x00); // right eye
}

// ─── Tray bar renderer — clean SVG via offscreen BrowserWindow ────────────────
// CSS size = display pt size. capturePage returns CSS × devicePixelRatio pixels.
// scaleFactor = devicePixelRatio → displayed at exactly CSS pt size.
// % text is baked into the image so it aligns perfectly with the mascot.
let renderCounter = 0;
function renderTrayBar(pct, label = null) {
  return new Promise(resolve => {
    const renderSeq = ++renderCounter;
    const p       = Math.min(Math.max(pct, 0), 100);
    const svgPath = path.join(__dirname, 'assets', 'clawd.svg');
    const dpr     = screen.getPrimaryDisplay().scaleFactor; // 2 on Retina

    const cssH = 16;
    const fillColor = p >= 100 ? '#ff3040' : p >= 75 ? '#ff6b00' : p >= 50 ? '#ffcc00' : '#ffffff';
    const cssW = label ? 100 : 88;
    const displayText = label || `${p}%`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${cssW}px;height:${cssH}px;background:transparent;overflow:hidden;
        -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
      #wrap{display:flex;align-items:center;height:${cssH}px;padding:0 1px}
      img{height:${cssH}px;width:auto;flex-shrink:0;margin-right:4px}
      .track{width:21px;height:9px;background:rgba(255,255,255,0.18);border-radius:2px;
        overflow:hidden;flex-shrink:0;margin-right:-2px;display:${label ? 'none' : 'block'}}
      .fill{height:100%;width:${p}%;background:${fillColor};border-radius:2px}
      .pct{color:rgba(255,255,255,${label ? '0.5' : '0.88'});
        font:${label ? '400' : '600'} 11px -apple-system,BlinkMacSystemFont,sans-serif;
        letter-spacing:-0.2px;flex-shrink:0;min-width:24px;text-align:right}
    </style></head><body>
    <div id="wrap">
      <img src="file://${svgPath}">
      <div class="track"><div class="fill"></div></div>
      <span class="pct">${displayText}</span>
    </div>
    </body></html>`;

    const tmpHtml = path.join(app.getPath('temp'), `clawd-tray-${renderSeq}.html`);
    try { fs.writeFileSync(tmpHtml, html); } catch(e) { console.error('renderTrayBar write failed:', e.message); resolve(null); return; }

    const win = new BrowserWindow({ width: cssW, height: cssH, show: false,
      transparent: true, webPreferences: { offscreen: true } });
    win.loadFile(tmpHtml);
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const raw = await win.webContents.capturePage();
          win.destroy();
          if (!raw || raw.isEmpty()) { resolve(null); return; }
          // captured pixels = cssH × dpr; scaleFactor = dpr → displays at cssH pt
          resolve(nativeImage.createFromBuffer(raw.toPNG(), { scaleFactor: dpr }));
        } catch(e) { win.destroy(); resolve(null); }
      }, 300);
    });
    setTimeout(() => { if (!win.isDestroyed()) { win.destroy(); resolve(null); } }, 4000);
  });
}

function updateTray(pct, label = null) {
  if (!tray) return;
  if (label === null) { lastTrayPct = pct; tray.setToolTip(`Claude: ${pct}% used — click for details`); }
  const seq = ++trayRenderSeq;
  renderTrayBar(pct, label).then(img => {
    if (seq !== trayRenderSeq) return; // stale render — a newer one is coming
    if (!tray || tray.isDestroyed()) return;
    try {
      if (img) { tray.setImage(img); tray.setTitle(''); }
    } catch(e) { console.error('updateTray error:', e.message); }
  });
}

// ─── Session helpers ──────────────────────────────────────────────────────────
// Use a PERSISTENT partition so the user only logs in once
const PARTITION = 'persist:claude-usage';

async function getClaudeSession() {
  return session.fromPartition(PARTITION);
}

async function isLoggedIn() {
  const s = await getClaudeSession();
  const cookies = await s.cookies.get({ domain: 'claude.ai', name: 'sessionKey' });
  return cookies.length > 0 && cookies[0].value.length > 10;
}

// ─── Fetch usage by scraping claude.ai/settings ───────────────────────────────
async function fetchUsage() {
  const claudeSession = await getClaudeSession();

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        session: claudeSession,
        contextIsolation: false,
        nodeIntegration: false,
        javascript: true,
      },
    });

    const done = (result) => {
      clearTimeout(timeoutId);
      if (!win.isDestroyed()) win.destroy();
      resolve(result);
    };

    const timeoutId = setTimeout(() => done(null), 25000);

    win.webContents.once('did-finish-load', async () => {
      const currentUrl = win.webContents.getURL();
      console.log('Loaded:', currentUrl);

      // If redirected to login, session expired
      if (currentUrl.includes('/login')) {
        done(null);
        return;
      }

      try {
        await new Promise(r => setTimeout(r, 5000)); // let React render usage data
        const result = await win.webContents.executeJavaScript(`
          (() => {
            const text = document.body ? document.body.innerText : '';
            const pcts = [...text.matchAll(/(\\d+)%\\s+used/gi)].map(m => parseInt(m[1]));
            const resets = [...text.matchAll(/Resets\\s+([^\\n]+)/gi)].map(m => m[1].trim());
            // Read theme from html[data-mode] and font from body class
            const mode = document.documentElement.getAttribute('data-mode') || '';
            const bodyClass = document.body.className || '';
            const fontMatch = bodyClass.match(/\bfont-(\w+)\b/);
            const font = fontMatch ? fontMatch[1] : 'ui';
            return { pcts, resets, url: location.href, ok: pcts.length > 0,
              appearance: { mode, font } };
          })()
        `);
        console.log('Scrape result:', JSON.stringify(result));
        console.log('Appearance:', JSON.stringify(result.appearance));
        done(result);
      } catch(e) {
        console.error('Scrape error:', e.message);
        done(null);
      }
    });

    win.webContents.on('did-fail-load', (e, code, desc) => {
      console.error('Load failed:', code, desc);
      done(null);
    });

    win.loadURL('https://claude.ai/settings/usage', {
      extraHeaders: 'Accept-Language: en-US,en;q=0.9\n',
    });
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────
const { Notification } = require('electron');
const notified = { 80: false, 100: false };

function maybeNotify(pct) {
  if (pct >= 100 && !notified[100]) {
    notified[100] = true;
    notified[80]  = true;
    new Notification({ title: 'OhNine — Oh Nein! 🚨', body: 'Session limit reached. Time to wait for a reset.' }).show();
  } else if (pct >= 80 && !notified[80]) {
    notified[80] = true;
    new Notification({ title: 'OhNine — Heads up 👀', body: "You're at 80%. Oh nein is coming." }).show();
  } else if (pct < 80) {
    notified[80] = false; notified[100] = false; // reset for next cycle
  }
}

// ─── Update loop ──────────────────────────────────────────────────────────────
async function doUpdate(showSyncing = false) {
  if (isUpdating) return;
  isUpdating = true;
  try {
  if (!await isLoggedIn()) {
    console.log('Not logged in');
    if (tray) {
      tray.setToolTip('OhNine — click to sign in');
      updateTray(lastTrayPct, 'sign in');
    }
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('login-required');
    }
    isUpdating = false; return;
  }

  console.log('Fetching usage…');
  if (showSyncing && tray) { updateTray(lastTrayPct, 'syncing…'); }

  const raw = await fetchUsage();
  console.log('Raw result:', JSON.stringify(raw));

  if (!raw || !raw.pcts || raw.pcts.length === 0) {
    console.log('No usage data scraped — retrying in 60s');
    if (tray) { updateTray(lastTrayPct, 'retry…'); }
    isUpdating = false; setTimeout(doUpdate, 60000);
    return;
  }

  const [sPct=0, wPct=0, nPct=0] = raw.pcts;
  const [sReset='', wReset='', nReset=''] = raw.resets;

  const ap = raw.appearance || {};
  usageData = {
    session: { pct: sPct, resetIn: sReset },
    weekly:  { pct: wPct, resetAt: wReset },
    sonnet:  { pct: nPct, resetAt: nReset },
    lastUpdated: new Date().toISOString(),
    appearance: { theme: ap.mode || '', font: ap.font || 'ui' },
  };

  updateTray(sPct);
  maybeNotify(sPct);
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('usage-update', usageData);
  }
  } finally {
    isUpdating = false;
  }
}

let pollTimer = null;
function startPolling(sec=300) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (sec === 0) return;
  doUpdate();
  pollTimer = setInterval(doUpdate, sec * 1000);
}

// ─── Login window ─────────────────────────────────────────────────────────────
async function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }

  const claudeSession = await getClaudeSession();
  loginWindow = new BrowserWindow({
    width: 520, height: 680,
    title: 'Sign in to Claude',
    alwaysOnTop: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: { session: claudeSession },
  });

  // Inject a minimal address bar so it feels like a real browser
  loginWindow.webContents.on('did-finish-load', () => {
    const host = 'claude.ai';
    loginWindow.webContents.executeJavaScript(`
      if (!document.getElementById('_clawd_bar')) {
        const bar = document.createElement('div');
        bar.id = '_clawd_bar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a1a1a;color:#999;font:12px -apple-system,sans-serif;padding:6px 12px;display:flex;align-items:center;gap:8px;-webkit-app-region:drag';
        const logo = document.createElement('span');
        logo.textContent = "OhNine";
        logo.style.cssText = 'color:#e3fc02;font-weight:600';
        const addr = document.createElement('span');
        addr.textContent = ${JSON.stringify(host)};
        addr.style.cssText = 'flex:1;background:#111;border-radius:4px;padding:3px 8px;color:#666;-webkit-app-region:no-drag';
        const lock = document.createElement('span');
        lock.textContent = '🔒 Secure';
        lock.style.fontSize = '10px';
        bar.append(logo, addr, lock);
        document.body.prepend(bar);
        document.body.style.paddingTop = '32px';
      }
    `).catch(() => {});
  });

  // Make OAuth popups (e.g. Google sign-in) appear on top
  loginWindow.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 520, height: 660,
      alwaysOnTop: true,
      titleBarStyle: 'hiddenInset',
      webPreferences: { session: claudeSession },
    },
  }));

  loginWindow.loadURL('https://claude.ai/login');

  // Poll for login completion
  const checkLogin = setInterval(async () => {
    if (!loginWindow || loginWindow.isDestroyed()) { clearInterval(checkLogin); return; }
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      clearInterval(checkLogin);
      loginWindow.close();
      loginWindow = null;
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.webContents.send('logged-in');
      }
      const c = loadConfig();
      startPolling(c.hasOwnProperty('checkInterval') ? c.checkInterval : 0);
    }
  }, 2000);

  loginWindow.on('closed', () => { clearInterval(checkLogin); loginWindow = null; });
}

// ─── Popup window ─────────────────────────────────────────────────────────────
function createPopupWindow(trayBounds) {
  const W = 360, H = 380;
  const cfg = loadConfig();
  const pinned = cfg.pinned || false;

  let x, y;
  const pb = cfg.pinnedBounds;
  const onScreen = pb && Number.isFinite(pb.x) && Number.isFinite(pb.y) &&
    screen.getAllDisplays().some(d => {
      const a = d.workArea;
      return pb.x < a.x + a.width && pb.x + W > a.x && pb.y < a.y + a.height && pb.y + H > a.y;
    });
  if (pinned && onScreen) {
    x = pb.x;
    y = pb.y;
  } else {
    // Position directly below the tray icon, horizontally centred on it
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const workArea = display.workArea;
    x = Math.round(trayBounds.x + trayBounds.width / 2 - W / 2);
    y = Math.round(trayBounds.y + trayBounds.height + 4);
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width  - W));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - H));
  }

  popupWindow = new BrowserWindow({
    width: W, height: H, x, y,
    frame: false, resizable: false, movable: true, alwaysOnTop: pinned,
    skipTaskbar: true, transparent: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  popupWindow.loadFile('popup.html');
  popupWindow.on('blur', () => {
    if (!popupWindow || popupWindow.isDestroyed()) return;
    const c = loadConfig();
    if (!c.pinned) popupWindow.hide();
  });
  popupWindow.on('moved', () => {
    if (!popupWindow || popupWindow.isDestroyed()) return;
    const c = loadConfig();
    const b = popupWindow.getBounds();
    c.pinnedBounds = { x: b.x, y: b.y };
    saveConfig(c);
  });
  popupWindow.on('closed', () => { popupWindow = null; });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('get-usage', () => usageData);
ipcMain.handle('refresh-now', async () => { await doUpdate(true); return usageData; });
ipcMain.handle('is-logged-in', () => isLoggedIn());
ipcMain.handle('open-login', () => openLoginWindow());
ipcMain.handle('get-interval', () => {
  const cfg = loadConfig();
  return cfg.hasOwnProperty('checkInterval') ? cfg.checkInterval : 0;
});
ipcMain.handle('get-theme', () => loadConfig().theme || '');
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));
ipcMain.handle('get-pin', () => loadConfig().pinned || false);
ipcMain.handle('toggle-pin', () => {
  const cfg = loadConfig();
  cfg.pinned = !cfg.pinned;
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.setAlwaysOnTop(cfg.pinned);
    if (cfg.pinned) {
      const b = popupWindow.getBounds();
      cfg.pinnedBounds = { x: b.x, y: b.y };
    }
  }
  saveConfig(cfg);
  return cfg.pinned;
});
ipcMain.handle('set-theme', (_, t) => { const cfg = loadConfig(); cfg.theme = t; saveConfig(cfg); });
ipcMain.handle('set-interval', (_, sec) => {
  const cfg = loadConfig();
  cfg.checkInterval = sec;
  saveConfig(cfg);
  startPolling(sec);
});
ipcMain.handle('logout', async () => {
  const s = await getClaudeSession();
  await s.clearStorageData({ storages: ['cookies'] });
  usageData = { session: { pct:0, resetIn:'' }, weekly: { pct:0, resetAt:'' }, sonnet: { pct:0, resetAt:'' }, lastUpdated: null };
  lastTrayPct = 0;
  if (tray) { updateTray(0, 'sign in'); }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.dock && app.dock.hide();

  // Start with blank; async SVG render replaces it within ~300ms
  tray = new Tray(nativeImage.createFromBuffer(makePNG(1, 1, new Uint8Array(4))));
  tray.setToolTip('OhNine');
  renderTrayBar(0).then(img => { if (img && tray && !tray.isDestroyed()) tray.setImage(img); });

  function buildContextMenu() {
    const cfg = loadConfig();
    return require('electron').Menu.buildFromTemplate([
      { label: 'Sync Now', click: () => doUpdate(true) },
      { type: 'separator' },
      { label: 'Open claude.ai', click: () => shell.openExternal('https://claude.ai') },
      { type: 'separator' },
      { label: 'Keep on Top', type: 'checkbox', checked: cfg.pinned || false,
        click: (item) => {
          const c = loadConfig(); c.pinned = item.checked;
          if (popupWindow && !popupWindow.isDestroyed()) popupWindow.setAlwaysOnTop(c.pinned);
          saveConfig(c);
          if (popupWindow && !popupWindow.isDestroyed()) {
            popupWindow.webContents.send('pin-changed', c.pinned);
          }
        }
      },
      { type: 'separator' },
      { label: `About  v${app.getVersion()}`, click: () => {
          if (!popupWindow || popupWindow.isDestroyed()) return;
          popupWindow.show();
          popupWindow.webContents.send('show-about');
        }
      },
      { type: 'separator' },
      { label: 'Launch at Login', type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
      },
      { type: 'separator' },
      { label: 'Quit OhNine', click: () => app.quit() },
    ]);
  }

  tray.on('right-click', () => tray.popUpContextMenu(buildContextMenu()));

  tray.on('click', (e, bounds) => {
    if (!popupWindow || popupWindow.isDestroyed()) {
      createPopupWindow(bounds);
      popupWindow.once('ready-to-show', () => {
        popupWindow.show();
        popupWindow.webContents.send('usage-update', usageData);
      });
      doUpdate(true);
    } else if (popupWindow.isVisible()) {
      popupWindow.hide();
    } else {
      popupWindow.show();
      popupWindow.webContents.send('usage-update', usageData);
      doUpdate(true);
    }
  });

  const initCfg = loadConfig();
  startPolling(initCfg.hasOwnProperty('checkInterval') ? initCfg.checkInterval : 0);
});

app.on('window-all-closed', e => e.preventDefault());
