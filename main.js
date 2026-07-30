const { app, BrowserWindow, Tray, nativeImage, ipcMain, net, screen, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// Dev mode (npm run dev). Only affects the local preview, never the shipped app:
// keeps the popup focused + pinned so the Ctrl+Shift+0-9 state shortcuts work and
// the window does not auto-hide while tweaking visuals.
const IS_DEV = process.argv.includes('--dev');

// Suppress EPIPE crashes when stdout/stderr pipe breaks (terminal closed)
process.stdout?.on('error', () => {});
process.stderr?.on('error', () => {});
process.on('uncaughtException', (e) => {
  if (e.code === 'EPIPE') return;
  console.error('Uncaught:', e);
  app.exit(1);
});

const configPath = path.join(app.getPath('userData'), 'config.json');

let tray = null;
let popupWindow = null;
let loginWindow = null;
let loginPending = false;
let lastTrayPct = 0;
let trayRenderSeq = 0;
let isUpdating = false;

let usageData = {
  session: { pct: 0, label: 'Current session', resetIn: '' },
  weekly:  { pct: 0, label: 'All models',      resetAt: '' },
  sonnet:  { pct: 0, label: '',                  resetAt: '' },
  lastUpdated: null,
  email: '',
  plan: '',
  org: '',
};

let updateInfo = { available: false, url: '' };
let retryCount = 0;
const MAX_RETRIES = 5;

// ─── Version check ────────────────────────────────────────────────────────────
async function checkForUpdate() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://studio.raxxo.shop/ohnine-version.json', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.version && data.version !== app.getVersion()) {
      // Simple comparison: any mismatch where remote is not current = update available
      const remote = data.version.split('.').map(Number);
      const local  = app.getVersion().split('.').map(Number);
      let newer = false;
      for (let i = 0; i < Math.max(remote.length, local.length); i++) {
        const r = remote[i] || 0, l = local[i] || 0;
        if (r > l) { newer = true; break; }
        if (r < l) break;
      }
      if (newer) {
        // Pick platform-specific URL if available
        let url = data.url || 'https://raxxo.shop';
        if (data.urls) {
          const arch = process.arch; // arm64 or x64
          const platform = process.platform; // darwin, win32, linux
          if (platform === 'darwin' && arch === 'arm64' && data.urls['mac-arm64']) url = data.urls['mac-arm64'];
          else if (platform === 'darwin' && data.urls['mac-x64']) url = data.urls['mac-x64'];
          else if (platform === 'win32' && data.urls['win']) url = data.urls['win'];
          else if (platform === 'linux' && data.urls['linux']) url = data.urls['linux'];
        }
        updateInfo = { available: true, url };
      }
    }
  } catch(e) { console.error('Version check failed:', e.message); }
}

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
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=(v&1)?0xedb88320^(v>>>1):v>>>1;t[n]=v;}
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i=0;i<buf.length;i++) c=CRC32_TABLE[(c^buf[i])&0xff]^(c>>>8);
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

// ─── Tray bar renderer, reuses a persistent offscreen BrowserWindow ───────────
// CSS size = display pt size. capturePage returns CSS x devicePixelRatio pixels.
// scaleFactor = devicePixelRatio, displayed at exactly CSS pt size.
// % text is baked into the image so it aligns perfectly with the mascot.
let renderCounter = 0;
let persistentTrayWin = null;

function ensureTrayWindow(cssW, cssH) {
  if (persistentTrayWin && !persistentTrayWin.isDestroyed()) {
    persistentTrayWin.setSize(cssW, cssH);
    return persistentTrayWin;
  }
  persistentTrayWin = new BrowserWindow({ width: cssW, height: cssH, show: false,
    transparent: true, webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  return persistentTrayWin;
}

function renderTrayBar(pct, label = null) {
  // Windows/Linux: square icon with percentage. macOS: wide mascot + bar + text.
  const isWide = process.platform === 'darwin';
  return new Promise(resolve => {
    const renderSeq = ++renderCounter;
    const p       = Math.min(Math.max(pct, 0), 100);
    const svgB64 = fs.readFileSync(path.join(__dirname, 'assets', 'clawd.svg')).toString('base64');
    const svgDataUri = `data:image/svg+xml;base64,${svgB64}`;
    const dpr     = screen.getPrimaryDisplay().scaleFactor;

    const fillColor = p >= 100 ? '#FF0079' : p >= 75 ? '#ff6b00' : p >= 50 ? '#ffcc00' : '#e3fc02';
    const displayText = label || `${p}%`;

    let cssW, cssH, html;

    if (isWide) {
      // macOS: wide format with mascot + bar + percentage
      cssH = 16;
      cssW = label ? 100 : 88;
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:${cssW}px;height:${cssH}px;background:transparent;overflow:hidden;
          -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
        #wrap{display:flex;align-items:center;height:${cssH}px;padding:0 1px}
        img{height:${cssH}px;width:auto;flex-shrink:0;margin-right:4px}
        .track{width:20px;height:9px;background:rgba(245,245,247,0.18);border-radius:2px;
          overflow:hidden;flex-shrink:0;margin-right:3px;display:${label ? 'none' : 'block'}}
        .fill{height:100%;width:${p}%;background:${fillColor};border-radius:2px}
        .pct{color:rgba(245,245,247,${label ? '0.5' : '0.88'});
          font:${label ? '400' : '600'} 11px 'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI','Ubuntu','Noto Sans',sans-serif;
          letter-spacing:-0.2px;flex-shrink:0;min-width:24px;text-align:right}
      </style></head><body>
      <div id="wrap">
        <img src="${svgDataUri}">
        <div class="track"><div class="fill"></div></div>
        <span class="pct">${displayText}</span>
      </div>
      </body></html>`;
    } else {
      // Windows/Linux: square icon with color-coded percentage number
      cssW = 16;
      cssH = 16;
      const textColor = label ? '#F5F5F7' : fillColor;
      const fontSize = label ? '7' : (p === 100 ? '9' : '11');
      const shortLabel = label ? label.replace('syncing\u2026', 'sync').replace('sign in', 'key').substring(0, 4) : `${p}`;
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:${cssW}px;height:${cssH}px;background:transparent;overflow:hidden;
          -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
        #wrap{display:flex;align-items:center;justify-content:center;width:${cssW}px;height:${cssH}px}
        .num{color:${textColor};font:700 ${fontSize}px 'Segoe UI','Ubuntu','Noto Sans',sans-serif;
          text-align:center;line-height:1;-webkit-text-stroke:0.5px ${textColor}}
      </style></head><body>
      <div id="wrap"><span class="num">${shortLabel}</span></div>
      </body></html>`;
    }

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    const win = ensureTrayWindow(cssW, cssH);

    win.loadURL(dataUrl);
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const raw = await win.webContents.capturePage();
          if (!raw || raw.isEmpty()) { resolve(null); return; }
          resolve(nativeImage.createFromBuffer(raw.toPNG(), { scaleFactor: dpr }));
        } catch(e) {
          console.error('renderTrayBar capture failed:', e.message);
          resolve(null);
        }
      }, 300);
    });
    setTimeout(() => { resolve(null); }, 4000);
  });
}

function updateTray(pct, label = null) {
  if (!tray) return;
  if (label === null) {
    lastTrayPct = pct;
    const reset = usageData?.session?.resetIn;
    tray.setToolTip(reset ? `OhNine: ${pct}% used · resets ${reset}` : `OhNine: ${pct}% used`);
  }
  const seq = ++trayRenderSeq;
  renderTrayBar(pct, label).then(img => {
    if (seq !== trayRenderSeq) return; // stale render, a newer one is coming
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

// ─── Usage via the API, no page render ────────────────────────────────────────
// Added v1.1.0. The old path booted a full BrowserWindow every poll, loaded
// claude.ai/settings/usage, waited 6s+4s+4s for React to paint, then called this
// same API from inside the page. That is 6-14s of work and a browser window
// created and destroyed every 30 seconds, and it was the shared root cause of
// all three reported faults:
//   - unreliable sync: any slow render, bot-check subframe or 35s timeout lost a cycle
//   - random "signed out": ANY redirect whose URL contained "/login" was treated as
//     session expiry, so a Cloudflare interstitial logged you out of the app
//   - stale model row: see pickModelWindow below
// net.fetch runs on the same persistent session, so cookies apply, but nothing
// renders. A cycle is now one JSON request instead of a browser.

function titleCaseModel(key) {
  return key.split('_').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Find the model-specific weekly window WITHOUT hardcoding a model name.
// Anthropic renames this key as the lineup changes (seven_day_sonnet became
// seven_day_fable). The old code read u.seven_day_sonnet directly, so once the
// key disappeared it fell back to `|| {}` and reported 0%, which is why the app
// showed "Sonnet only 0%" while claude.ai showed "Fable 3%". Discovering the key
// means the next rename costs nothing.
function pickModelWindow(u) {
  const keys = Object.keys(u || {}).filter(k =>
    /^seven_day_.+/.test(k) && u[k] && typeof u[k] === 'object' && 'utilization' in u[k]);
  if (!keys.length) return null;
  // Prefer a window that is actually reporting usage; otherwise take the first.
  const key = keys.find(k => (u[k].utilization || 0) > 0) || keys[0];
  return { key, label: titleCaseModel(key.replace(/^seven_day_/, '')), data: u[key] };
}

// NOTE (v1.1.0): calling this API directly from the main process with net.fetch
// does NOT work, and it is not worth trying again. Tested on 2026-07-30 against a
// live logged-in session with four header sets (bare, UA only, UA+Referer+Origin,
// and a full Chrome fingerprint incl. sec-ch-ua and Sec-Fetch-*). Every one
// returned 403. Cloudflare fingerprints the TLS handshake, not just the headers,
// so a real renderer context is required. That is why the usage read below runs
// INSIDE the page. Do not "optimise" it back out.

// ─── Fetch usage by scraping claude.ai/settings ───────────────────────────────
async function fetchUsage() {
  const claudeSession = await getClaudeSession();

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        session: claudeSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        javascript: true,
      },
    });

    const done = (result) => {
      clearTimeout(timeoutId);
      if (!win.isDestroyed()) win.destroy();
      resolve(result);
    };

    const timeoutId = setTimeout(() => done({ error: 'timeout', message: 'Page took too long to load' }), 35000);

    win.webContents.once('did-finish-load', async () => {
      const currentUrl = win.webContents.getURL();
      // A URL containing "/login" is NOT proof of a signed-out session, and
      // treating it as proof is what made the app demand a sign-in at random
      // (reported 2026-07-30: "not logged in all the time"). claude.ai bounces
      // through interstitials and bot checks whose URLs can carry /login while
      // the session is perfectly valid, and a single false positive wipes the
      // tray into "sign in" until the user intervenes.
      //
      // The cookie is the authority. Only declare expiry when the sessionKey is
      // actually gone. If the cookie still exists we treat it as a transient
      // failure, which flows into the normal retry with backoff instead.
      if (currentUrl.includes('/login')) {
        let stillHasCookie = false;
        try {
          const c = await claudeSession.cookies.get({ domain: 'claude.ai', name: 'sessionKey' });
          stillHasCookie = c.length > 0 && c[0].value && c[0].value.length > 10;
        } catch (_) { /* treat a cookie read failure as "unknown", not as logout */ }
        if (!stillHasCookie) {
          done({ error: 'session_expired', message: 'Session expired. Sign in again.' });
          return;
        }
        console.log('[OhNine] Hit a /login URL but sessionKey is still valid: treating as transient, not logout');
        done({ error: 'bot_check', message: 'Blocked by a bot check, will retry' });
        return;
      }

      try {
        // Try IMMEDIATELY, then back off only if the read did not succeed.
        // Until v1.1.0 this slept a flat 6s before the first attempt and 4s before
        // each retry, so every single cycle cost at least 6s even when the data was
        // already available. The usage read is an API call made from inside the page,
        // and it does not need React to have painted, only the document to exist.
        // Sleeping first just widened the window for a bot check or the 35s timeout
        // to kill an otherwise healthy cycle. Common case is now ~1s instead of ~6s,
        // which is the single biggest reliability win available here: fewer seconds
        // in flight means fewer cycles lost.
        let result = null;
        const waits = [0, 3000, 5000];
        for (let attempt = 0; attempt < 3; attempt++) {
          if (waits[attempt]) await new Promise(r => setTimeout(r, waits[attempt]));
          // The window may have been resolved/destroyed elsewhere (timeout, login
          // redirect) while we waited. Bail quietly instead of throwing on a dead handle.
          if (win.isDestroyed()) return;
          result = await win.webContents.executeJavaScript(`
            (async () => {
              const text = document.body ? document.body.innerText : '';
              // PRIMARY (language-independent): claude.ai's structured usage API.
              // Returns utilization + ISO resets_at per limit, so it works in any
              // account language and at 100%, unlike scraping localized "Resets" text.
              let apiPcts = null, apiResets = null, apiModelKey = '', apiModelLabel = '';
              try {
                const ents = performance.getEntriesByType('resource').map(e => e.name);
                let orgId = (ents.find(u => /\\/api\\/organizations\\/[0-9a-f-]+\\/usage/.test(u)) || '').match(/organizations\\/([0-9a-f-]+)\\/usage/);
                orgId = orgId ? orgId[1] : null;
                if (!orgId) {
                  const orgs = await (await fetch('/api/organizations', { credentials: 'include' })).json();
                  if (Array.isArray(orgs)) orgId = (orgs.find(o => o && o.uuid) || orgs[0] || {}).uuid || null;
                }
                if (orgId) {
                  const u = await (await fetch('/api/organizations/' + orgId + '/usage', { credentials: 'include' })).json();
                  // Recognize the usage payload even if a given window is null this cycle
                  // (fresh session, or Anthropic toggling a key). As long as the object
                  // carries any known limit window we trust the API: it is language
                  // independent and returns ISO resets_at. Reads are defensive so new or
                  // renamed sibling keys (seven_day_opus, _cowork, tangelo, etc.) never throw.
                  // PREFERRED: the \`limits\` array. Verified against the live API
                  // 2026-07-30. This is the shape claude.ai's own Usage panel renders,
                  // and it carries the model's display_name, so the label is correct in
                  // any account language without a lookup table.
                  //   {kind:'session',       percent, resets_at}
                  //   {kind:'weekly_all',    percent, resets_at}
                  //   {kind:'weekly_scoped', percent, resets_at, scope:{model:{display_name:'Fable'}}}
                  //
                  // The old seven_day_sonnet / _opus / _cowork keys still EXIST but are
                  // all null now. Reading them is why the app showed a flat 0% on the
                  // third bar while claude.ai showed Fable at 3%.
                  if (u && Array.isArray(u.limits) && u.limits.length) {
                    const byKind = (k) => u.limits.find(l => l && l.kind === k) || null;
                    const ses = byKind('session');
                    const all = byKind('weekly_all');
                    const scoped = byKind('weekly_scoped')
                      || u.limits.find(l => l && l.group === 'weekly' && l.scope && l.scope.model);
                    apiPcts = [ses ? ses.percent || 0 : 0, all ? all.percent || 0 : 0, scoped ? scoped.percent || 0 : 0];
                    apiResets = [ses ? ses.resets_at || '' : '', all ? all.resets_at || '' : '', scoped ? scoped.resets_at || '' : ''];
                    apiModelLabel = (scoped && scoped.scope && scoped.scope.model && scoped.scope.model.display_name) || '';
                    apiModelKey = scoped ? (scoped.kind || '') : '';
                  } else if (u && typeof u === 'object' && ('five_hour' in u || 'seven_day' in u)) {
                    // LEGACY fallback for older payloads.
                    const s = u.five_hour || {}, w = u.seven_day || {};
                    const mk = Object.keys(u).filter(k => /^seven_day_.+/.test(k) && u[k] && typeof u[k] === 'object' && 'utilization' in u[k]);
                    const key = mk.find(k => (u[k].utilization || 0) > 0) || mk[0];
                    const n = key ? u[key] : {};
                    apiModelKey = key || '';
                    apiPcts = [s.utilization || 0, w.utilization || 0, n.utilization || 0];
                    apiResets = [s.resets_at || '', w.resets_at || '', n.resets_at || ''];
                  }
                }
              } catch(e) { /* fall back to DOM scrape below */ }
              // DOM fallback (only runs if the API path above failed). The API is the
              // primary, language-independent source; this just keeps the app alive if
              // the endpoint ever changes. English first, then a language-independent
              // pass: on /settings/usage the only percentages are the usage bars, so a
              // bare "NN %" harvest works for German, French, and every other account
              // language without hardcoding localized words.
              let pcts = [...text.matchAll(/(\\d+)\\s*%\\s+used/gi)].map(m => parseInt(m[1]));
              if (pcts.length === 0) {
                pcts = [...text.matchAll(/(\\d+)\\s*%/g)].map(m => parseInt(m[1])).filter(n => n >= 0 && n <= 100);
              }
              // Fallback: try progress bar aria values
              if (pcts.length === 0) {
                document.querySelectorAll('[role="progressbar"], [aria-valuenow]').forEach(el => {
                  const v = parseInt(el.getAttribute('aria-valuenow'));
                  if (!isNaN(v) && v >= 0 && v <= 100) pcts.push(v);
                });
              }
              const resets = [...text.matchAll(/Resets?\\s+([^\\n]+)/gi)].map(m => m[1].trim());
              const mode = document.documentElement.getAttribute('data-mode') || '';
              const bodyClass = document.body.className || '';
              const fontMatch = bodyClass.match(/\\bfont-(\\w+)\\b/);
              const font = fontMatch ? fontMatch[1] : 'ui';
              // Find account email from page text or DOM
              let email = '';
              const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
              if (emailMatch) email = emailMatch[0];
              // Search ALL DOM elements for email (might be in hidden dropdown or data attrs)
              if (!email) {
                const allEls = document.querySelectorAll('*');
                for (const el of allEls) {
                  // Check text content of leaf nodes
                  if (el.children.length === 0) {
                    const t = (el.textContent || '').trim();
                    const m = t.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/);
                    if (m) { email = m[0]; break; }
                  }
                  // Check data attributes and aria labels
                  for (const attr of el.attributes || []) {
                    const m = attr.value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
                    if (m) { email = m[0]; break; }
                  }
                  if (email) break;
                }
              }
              // Check inline scripts / __NEXT_DATA__ / window state
              if (!email) {
                const html = document.documentElement.innerHTML;
                const m = html.match(/"email(?:_address)?"\\s*:\\s*"([^"@]+@[^"]+)"/);
                if (m) email = m[1];
              }
              // Try API for email + plan
              let plan = '';
              try {
                const r = await fetch('/api/auth/current_account', { credentials: 'include' });
                if (r.ok) {
                  const d = await r.json();
                  if (!email) email = d?.account?.email_address || d?.account?.email || d?.email || '';
                }
              } catch(e) { console.log('API error:', e.message); }
              // Scrape plan from page text (English "Max plan" or German "Max-Plan")
              if (!plan) {
                const planMatch = text.match(/(Free|Pro|Max|Team|Enterprise)[\\s-]+[Pp]lan/i);
                if (planMatch) plan = planMatch[1];
              }
              // Account name: find DOM element containing "X plan" and grab sibling text
              let org = '';
              const allEls = document.querySelectorAll('*');
              for (const el of allEls) {
                const t = (el.textContent || '').trim();
                if (/(Free|Pro|Max|Team|Enterprise)[\s-]+[Pp]lan/i.test(t) && t.length < 20) {
                  // Found the plan label element - check parent/siblings for account name
                  const parent = el.parentElement;
                  if (parent) {
                    for (const child of parent.children) {
                      const ct = (child.textContent || '').trim();
                      if (ct && ct !== t && ct.length > 1 && ct.length < 50 && !/(plan|free|pro|max|team)/i.test(ct)) {
                        org = ct;
                        break;
                      }
                    }
                    // Try grandparent if parent didn't have it
                    if (!org && parent.parentElement) {
                      for (const child of parent.parentElement.children) {
                        const ct = (child.textContent || '').trim();
                        if (ct && !/(plan|free|pro|max|team)/i.test(ct) && ct.length > 1 && ct.length < 50 && ct !== t) {
                          // Strip the plan text from the candidate
                          const clean = ct.replace(/(Free|Pro|Max|Team|Enterprise)[\s-]+[Pp]lan/gi, '').trim();
                          if (clean && clean.length > 1) { org = clean; break; }
                        }
                      }
                    }
                  }
                  if (org) break;
                }
              }
              // Language-agnostic session reset. claude.ai renders by account
              // language (ignores ?lang=en), so the English "Resets" regex misses
              // German pages. The session is the first usage block (heading / reset
              // / "N% used"); grab the reset line by its time/date token (EN + DE),
              // independent of the surrounding word.
              let sessionReset = '';
              try {
                const timeTok = /(\\d{1,2}:\\d{2}|\\bin\\b|\\b(hr|hrs|hour|hours|min|mins|minute|minutes|day|days|std|stunde|stunden|tag|tage)\\b|\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januar|februar|m\\u00e4rz|april|mai|juni|juli|august|september|oktober|november|dezember)\\b)/i;
                for (const el of document.querySelectorAll('div,section,li')) {
                  const lines = (el.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
                  if (lines.length < 2 || lines.length > 6) continue;
                  if (lines.findIndex(l => /\\d+\\s*%/.test(l)) < 0) continue;
                  const resetLine = lines.find(l => !/\\d+\\s*%/.test(l) && /\\d/.test(l) && timeTok.test(l));
                  if (resetLine) { sessionReset = resetLine.replace(/^(Resets?|Wird|Setzt|Noch)\\s+/i, '').trim(); break; }
                }
              } catch(e) {}
              const usePcts   = (apiPcts && apiPcts.length)     ? apiPcts   : pcts;
              const useResets = (apiResets && apiResets.length) ? apiResets : resets;
              const sessReset = (apiResets && apiResets[0])     ? apiResets[0] : sessionReset;
              return { pcts: usePcts, resets: useResets, sessionReset: sessReset,
                source: apiPcts ? 'api' : 'dom', modelKey: apiModelKey, modelLabel: apiModelLabel, url: location.href, ok: usePcts.length > 0,
                email, plan, org, appearance: { mode, font } };
            })()
          `);
          if (result && result.ok) break;
        }
        if (!result || !result.ok) {
          done({ error: 'page_changed', message: 'Could not read usage data. Page layout may have changed.' });
          return;
        }
        done(result);
      } catch(e) {
        console.error('Scrape error:', e.message);
        done({ error: 'scrape_failed', message: 'Failed to read page content' });
      }
    });

    // Only a MAIN-frame failure matters. claude.ai's settings page now embeds
    // third-party subframes (Cloudflare Turnstile bot-check, isolated-segment and
    // about:srcdoc helpers) that routinely abort with ERR_ABORTED (-3). The old
    // handler treated ANY did-fail-load as fatal and destroyed the window mid-load,
    // so the usage read never ran. That is exactly what broke the app when claude.ai
    // shipped the bot-check around the Opus 4.8 launch. Ignore subframe failures, and
    // ignore main-frame -3 too (it fires on client-side redirects that then load fine).
    win.webContents.on('did-fail-load', (e, code, desc, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      console.error('Load failed:', code, desc);
      const isNetwork = code === -2 || code === -6 || code === -7 || code === -105 || code === -106;
      done({ error: isNetwork ? 'network' : 'load_failed', message: isNetwork ? 'No internet connection' : `Page load failed (${desc})` });
    });

    // Force English rendering for consistent scraping
    claudeSession.cookies.set({ url: 'https://claude.ai', name: 'CH-prefers-language', value: 'en' }).catch(() => {});
    win.loadURL('https://claude.ai/settings/usage?lang=en', {
      extraHeaders: 'Accept-Language: en-US,en;q=0.9\n',
    });
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────
const { Notification } = require('electron');
const notified = { 9: false, 80: false, 100: false };

const notifIcon = path.join(__dirname, 'assets',
  process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.iconset/icon_256x256.png');
function notify(title, body) {
  new Notification({ title, body, icon: notifIcon }).show();
}

function maybeNotify(pct) {
  if (pct >= 100 && !notified[100]) {
    notified[100] = true;
    notified[80]  = true;
    notified[9]   = true;
    const reset = usageData?.session?.resetIn;
    notify('OhNine. Oh Nein.', reset ? `Session limit reached. Resets ${reset}.` : 'Session limit reached. Time to wait for a reset.');
  } else if (pct >= 91 && !notified[9]) {
    notified[9] = true;
    notified[80] = true;
    notify('OhNine. Literally.', '9% left. This is the moment. Oh nein.');
  } else if (pct >= 80 && !notified[80]) {
    notified[80] = true;
    notify('OhNine. Heads up.', "You're at 80%. Oh nein is coming.");
  } else if (pct < 80) {
    notified[9] = false; notified[80] = false; notified[100] = false;
  }
}

// ─── Update loop ──────────────────────────────────────────────────────────────
async function doUpdate(showSyncing = false) {
  if (isUpdating) return;
  isUpdating = true;
  try {
  if (!await isLoggedIn()) {
    if (tray) {
      tray.setToolTip('OhNine. Click to sign in.');
      updateTray(lastTrayPct, 'sign in');
    }
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('login-required');
    }
    isUpdating = false; return;
  }

  if (showSyncing && tray) { updateTray(lastTrayPct, 'syncing…'); }

  const raw = await fetchUsage();
  if (!raw || raw.error || !raw.pcts || raw.pcts.length === 0) {
    // Handle session expired separately (don't retry, prompt login)
    if (raw && raw.error === 'session_expired') {
      if (tray) { updateTray(lastTrayPct, 'sign in'); }
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.webContents.send('login-required');
      }
      isUpdating = false;
      return;
    }
    retryCount++;
    const errorLabel = raw && raw.error === 'network' ? 'No connection'
      : raw && raw.error === 'timeout' ? 'Timed out'
      : raw && raw.error === 'bot_check' ? 'Bot check'
      : raw && raw.error === 'page_changed' ? 'Page changed'
      : 'Sync failed';
    if (retryCount >= MAX_RETRIES) {
      if (tray) { updateTray(lastTrayPct, errorLabel); }
      isUpdating = false;
      return;
    }
    if (tray) { updateTray(lastTrayPct, 'retry…'); }
    // Exponential backoff: 30s, 60s, 120s, 240s, 480s
    const backoff = Math.min(30000 * Math.pow(2, retryCount - 1), 480000);
    isUpdating = false; setTimeout(doUpdate, backoff);
    return;
  }
  retryCount = 0;
  console.log('[OhNine] Sync:', JSON.stringify({ org: raw.org, plan: raw.plan, pcts: raw.pcts, source: raw.source, modelKey: raw.modelKey || '', modelLabel: raw.modelLabel || '' }));

  const [sPct=0, wPct=0, nPct=0] = raw.pcts;
  const [, wReset='', nReset=''] = raw.resets;
  const sReset = raw.sessionReset || (raw.resets && raw.resets[0]) || '';

  // The render fallback returns modelKey only; normalise it to a label here so
  // both paths feed the UI the same shape.
  if (!raw.modelLabel && raw.modelKey) raw.modelLabel = titleCaseModel(String(raw.modelKey).replace(/^seven_day_/, ''));

  const ap = raw.appearance || {};
  usageData = {
    session: { pct: sPct, resetIn: sReset },
    weekly:  { pct: wPct, resetAt: wReset },
    sonnet:  { pct: nPct, resetAt: nReset, label: raw.modelLabel || usageData.sonnet?.label || '' },
    lastUpdated: new Date().toISOString(),
    email: raw.email || usageData.email || '',
    plan: raw.plan || usageData.plan || '',
    org: raw.org || usageData.org || '',
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
  if (sec <= 0) return;
  const actual = Math.max(sec, 30); // minimum 30s, each fetch takes ~6s
  doUpdate();
  pollTimer = setInterval(() => doUpdate(), actual * 1000);
}

// ─── Login window ─────────────────────────────────────────────────────────────
async function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
  loginPending = true;

  const claudeSession = await getClaudeSession();
  loginWindow = new BrowserWindow({
    width: 520, height: 680,
    title: 'Sign in to Claude',
    webPreferences: { session: claudeSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // Make OAuth popups (e.g. Google sign-in) work, but only for known providers
  const allowedOAuthPatterns = [
    /^https:\/\/([a-z0-9-]+\.)?google\.com\//,
    /^https:\/\/accounts\.google\.com\//,
    /^https:\/\/([a-z0-9-]+\.)?clerk\.com\//,
    /^https:\/\/([a-z0-9-]+\.)?claude\.ai\//,
    /^https:\/\/([a-z0-9-]+\.)?anthropic\.com\//,
  ];
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && allowedOAuthPatterns.some(re => re.test(url))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520, height: 660,
          webPreferences: { session: claudeSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    return { action: 'deny' };
  });

  loginWindow.loadURL('https://claude.ai/login');

  // Poll for login completion
  const checkLogin = setInterval(async () => {
    if (!loginWindow || loginWindow.isDestroyed()) { clearInterval(checkLogin); return; }
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      clearInterval(checkLogin);
      // Navigate to settings to grab email, then to usage for workspace switching
      loginWindow.setTitle('Loading account info...');
      loginWindow.loadURL('https://claude.ai/settings');
      // Wait for settings page to load, grab email
      loginWindow.webContents.once('did-finish-load', async () => {
        try {
          await new Promise(r => setTimeout(r, 3000));
          const email = await loginWindow.webContents.executeJavaScript(`
            (() => {
              const text = document.body ? document.body.innerText : '';
              const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
              return m ? m[0] : '';
            })()
          `);
          if (email) {
            usageData.email = email;
            console.log('[OhNine] Email from login:', email);
            // Save email to config so it persists across restarts
            const cfg = loadConfig();
            cfg.email = email;
            saveConfig(cfg);
          }
        } catch(e) { console.error('Email fetch failed:', e.message); }
        // Now go to usage page for workspace switching
        loginWindow.setTitle('Switch to your paid workspace if needed, then close this window');
        loginWindow.loadURL('https://claude.ai/settings/usage');
      });
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.webContents.send('logged-in');
      }
    }
  }, 2000);

  loginWindow.on('closed', async () => {
    clearInterval(checkLogin);
    loginWindow = null;
    loginPending = false;
    // When user closes the window after picking workspace, start syncing
    if (await isLoggedIn()) {
      const c = loadConfig();
      startPolling(c.hasOwnProperty('checkInterval') ? c.checkInterval : 0);
    }
  });
}

// ─── Popup window ─────────────────────────────────────────────────────────────
function createPopupWindow(trayBounds) {
  const W = 360, H = 390;
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
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const workArea = display.workArea;
    // Fallback if tray bounds are zero (Windows overflow tray)
    const tb = (trayBounds.width === 0 && trayBounds.height === 0)
      ? { x: workArea.x + workArea.width - W - 10, y: workArea.y + workArea.height - H - 10, width: 0, height: 0 }
      : trayBounds;
    x = Math.round(tb.x + tb.width / 2 - W / 2);
    // macOS: popup below menu bar icon. Windows/Linux: popup above taskbar icon.
    y = process.platform === 'darwin'
      ? Math.round(tb.y + tb.height + 4)
      : Math.round(tb.y - H - 4);
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width  - W));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - H));
  }

  const themeBg = cfg.theme === 'light' ? '#f5f4ef' : '#1f1f21';
  popupWindow = new BrowserWindow({
    width: W, height: H, x, y,
    frame: false, resizable: false, movable: true, alwaysOnTop: pinned,
    skipTaskbar: true, transparent: true, show: false, backgroundColor: themeBg,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: IS_DEV ? ['--dev'] : [] },
  });
  popupWindow.loadFile('popup.html');
  // Dev preview: open DevTools so visual tweaks can be inspected/live-edited and
  // states driven from the console (window.api.fakeState(0..9)) without needing
  // the frameless window to hold OS keyboard focus.
  if (IS_DEV) popupWindow.webContents.once('did-finish-load', () => popupWindow.webContents.openDevTools({ mode: 'detach' }));
  popupWindow.on('blur', () => {
    if (!popupWindow || popupWindow.isDestroyed()) return;
    if (IS_DEV) return; // keep the preview window on screen while tweaking
    const c = loadConfig();
    if (c.pinned) return;
    if (loginPending || (loginWindow && !loginWindow.isDestroyed())) return;
    popupWindow.hide();
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
ipcMain.handle('check-update', async () => {
  await checkForUpdate();
  return updateInfo;
});
ipcMain.handle('get-usage', () => usageData);
ipcMain.handle('refresh-now', async () => { await doUpdate(true); return usageData; });
ipcMain.handle('is-logged-in', () => isLoggedIn());
ipcMain.handle('open-login', () => openLoginWindow());
ipcMain.handle('get-interval', () => {
  const cfg = loadConfig();
  return cfg.hasOwnProperty('checkInterval') ? cfg.checkInterval : 0;
});
ipcMain.handle('get-theme', () => loadConfig().theme || '');
ipcMain.handle('open-url', (_, url) => {
  try {
    const u = new URL(url);
    const allowed = ['raxxo.shop', 'raxxo-studio-dev.vercel.app', 'support.claude.com', 'claude.ai'];
    if (u.protocol === 'https:' && allowed.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) {
      shell.openExternal(url);
    }
  } catch(e) { console.error('open-url invalid URL:', e.message); }
});
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
ipcMain.handle('set-theme', (_, t) => {
  const allowed = ['dark', 'light', 'system', ''];
  if (typeof t !== 'string' || !allowed.includes(t)) return;
  const cfg = loadConfig(); cfg.theme = t; saveConfig(cfg);
});
// Demo mode: Shift+0 through Shift+9 in popup to preview states (for screenshots/recording)
const fakeStates = [
  { s: 0,   w: 5,  n: 1,  sr: 'in 4 hr 58 min', wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 0 = fresh
  { s: 12,  w: 18, n: 3,  sr: 'in 3 hr 22 min', wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 1 = warming up
  { s: 25,  w: 29, n: 8,  sr: 'in 2 hr 55 min', wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 2 = quarter
  { s: 38,  w: 35, n: 14, sr: 'in 2 hr 30 min', wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 3 = building
  { s: 50,  w: 48, n: 22, sr: 'in 2 hr 5 min',  wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 4 = halfway (yellow)
  { s: 65,  w: 55, n: 31, sr: 'in 1 hr 40 min', wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 5 = getting warm
  { s: 76,  w: 68, n: 42, sr: 'in 1 hr 12 min', wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 6 = orange zone
  { s: 85,  w: 74, n: 51, sr: 'in 48 min',      wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 7 = heads up (80% notif)
  { s: 91,  w: 79, n: 55, sr: 'in 28 min',      wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 8 = Oh Nine. Literally.
  { s: 100, w: 87, n: 62, sr: 'in 15 min',      wr: 'Fri 4:00 PM', nr: 'Tue 8:00 PM' }, // 9 = Oh Nein. (walkback)
];
ipcMain.handle('fake-state', (_, n) => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 9) return;
  const f = fakeStates[Math.min(Math.round(n), 9)];
  // Reset notification flags so they fire fresh
  notified[9] = false; notified[80] = false; notified[100] = false;
  usageData = {
    session: { pct: f.s, resetIn: f.sr },
    weekly:  { pct: f.w, resetAt: f.wr },
    sonnet:  { pct: f.n, resetAt: f.nr },
    lastUpdated: new Date().toISOString(),
    appearance: { theme: '', font: 'ui' },
  };
  updateTray(f.s);
  maybeNotify(f.s);
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('usage-update', usageData);
  }
});
ipcMain.handle('set-interval', (_, sec) => {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return;
  const clamped = Math.max(0, Math.min(Math.round(sec), 3600));
  const cfg = loadConfig();
  cfg.checkInterval = clamped;
  saveConfig(cfg);
  startPolling(clamped);
});
ipcMain.handle('logout', async () => {
  const s = await getClaudeSession();
  await s.clearStorageData({ storages: ['cookies'] });
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  usageData = { session: { pct:0, resetIn:'' }, weekly: { pct:0, resetAt:'' }, sonnet: { pct:0, resetAt:'' }, lastUpdated: null, email: '', plan: '', org: '' };
  lastTrayPct = 0;
  if (tray) { updateTray(0, 'sign in'); }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.dock && app.dock.hide();

  // Clean up stale tray render temp files from previous sessions
  try {
    const tmpDir = app.getPath('temp');
    const staleFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith('clawd-tray-') && f.endsWith('.html'));
    for (const f of staleFiles) {
      try { fs.unlinkSync(path.join(tmpDir, f)); } catch(e) { console.error('Failed to clean stale tray file:', e.message); }
    }
  } catch(e) { console.error('Tray temp cleanup failed:', e.message); }

  // Start with blank; async SVG render replaces it within ~300ms
  tray = new Tray(nativeImage.createFromBuffer(makePNG(1, 1, new Uint8Array(4))));
  tray.setToolTip('OhNine');
  renderTrayBar(0).then(img => { if (img && tray && !tray.isDestroyed()) tray.setImage(img); });

  function buildContextMenu() {
    const cfg = loadConfig();
    return require('electron').Menu.buildFromTemplate([
      { label: `OhNine v${app.getVersion()}`, enabled: false },
      ...(usageData.org || usageData.plan ? [{
        label: [usageData.org, usageData.plan ? usageData.plan + ' plan' : ''].filter(Boolean).join(' \u00b7 '),
        enabled: false
      }] : []),
      { type: 'separator' },
      ...(process.platform === 'linux' ? [{
        label: 'Show OhNine', click: () => {
          if (popupWindow && !popupWindow.isDestroyed()) { popupWindow.show(); popupWindow.focus(); }
        }
      }] : []),
      { label: 'Sync Now', click: () => doUpdate(true) },
      { label: 'Open claude.ai', click: () => shell.openExternal('https://claude.ai') },
      { label: 'Switch Workspace', click: async () => {
          const claudeSession = await getClaudeSession();
          const wsWindow = new BrowserWindow({
            width: 520, height: 680,
            title: 'Switch to the workspace you want to track, then close this window',
            webPreferences: { session: claudeSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
          });
          wsWindow.loadURL('https://claude.ai/settings/usage');
          wsWindow.on('closed', () => {
            doUpdate(true);
          });
        }
      },
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
      ...(process.platform !== 'linux' ? [{
        label: 'Launch at Login', type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
      }] : []),
      { type: 'separator' },
      { label: 'Report a Bug', click: () => {
          const v = app.getVersion();
          const os = `${process.platform} ${process.arch}`;
          const subject = encodeURIComponent(`OhNine Bug Report v${v}`);
          const body = encodeURIComponent(`Hi,\n\nI found a bug in OhNine v${v} (${os}).\n\nWhat happened:\n\n\nWhat I expected:\n\n\nScreenshot (if possible):\n\n`);
          shell.openExternal(`mailto:help@raxxo.shop?subject=${subject}&body=${body}`);
        }
      },
      { label: 'About', click: () => {
          if (!popupWindow || popupWindow.isDestroyed()) return;
          popupWindow.show();
          popupWindow.webContents.send('show-about');
        }
      },
      { label: 'Quit OhNine', click: () => app.quit() },
    ]);
  }

  tray.on('right-click', () => tray.popUpContextMenu(buildContextMenu()));
  if (process.platform === 'linux') tray.setContextMenu(buildContextMenu());
  if (process.platform === 'win32') {
    tray.on('double-click', (e, bounds) => tray.emit('click', e, bounds));
  }

  tray.on('click', (e, bounds) => {
    if (!popupWindow || popupWindow.isDestroyed()) {
      createPopupWindow(bounds);
      popupWindow.once('ready-to-show', () => {
        popupWindow.show();
        if (IS_DEV) { app.focus({ steal: true }); popupWindow.focus(); }
        if (usageData.lastUpdated) popupWindow.webContents.send('usage-update', usageData);
      });
      doUpdate(true);
    } else if (popupWindow.isVisible()) {
      popupWindow.hide();
    } else {
      popupWindow.show();
      if (IS_DEV) { app.focus({ steal: true }); popupWindow.focus(); }
      if (usageData.lastUpdated) popupWindow.webContents.send('usage-update', usageData);
      doUpdate(true);
    }
  });

  const initCfg = loadConfig();
  if (initCfg.email) usageData.email = initCfg.email;
  startPolling(initCfg.hasOwnProperty('checkInterval') ? initCfg.checkInterval : 0);

});

app.on('window-all-closed', e => e.preventDefault()); // tray app, keep running on all platforms (macOS, Windows, Linux)
app.on('before-quit', () => { if (pollTimer) clearInterval(pollTimer); });
