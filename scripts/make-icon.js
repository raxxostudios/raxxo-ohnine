// Generates assets/icon.icns from assets/clawd.svg
// Run: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');

const SIZES = [16,32,64,128,256,512,1024];
const svgPath    = path.resolve(__dirname, '../assets/clawd.svg');
const iconsetDir = path.resolve(__dirname, '../assets/icon.iconset');
const icnsOut    = path.resolve(__dirname, '../assets/icon.icns');

if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

app.dock && app.dock.hide();
app.whenReady().then(async () => {
  for (const size of SIZES) await renderIcon(size);
  try {
    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsOut]);
    console.log('✓ assets/icon.icns created');
  } catch(e) { console.error('iconutil failed:', e.message); }
  app.quit();
});

function getIconNames(size) {
  return {
    16:   ['icon_16x16.png'],
    32:   ['icon_16x16@2x.png', 'icon_32x32.png'],
    64:   ['icon_32x32@2x.png'],
    128:  ['icon_128x128.png'],
    256:  ['icon_128x128@2x.png', 'icon_256x256.png'],
    512:  ['icon_256x256@2x.png', 'icon_512x512.png'],
    1024: ['icon_512x512@2x.png'],
  }[size] || [];
}

function renderIcon(size) {
  return new Promise(resolve => {
    const radius = Math.round(size * 0.22);
    const imgSize = Math.round(size * 0.72);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${size}px;height:${size}px;background:transparent;overflow:hidden}
      .wrap{width:${size}px;height:${size}px;background:#1a1a1a;border-radius:${radius}px;
        display:flex;align-items:center;justify-content:center;}
      img{width:${imgSize}px;height:auto;}
    </style></head><body>
    <div class="wrap"><img src="file://${svgPath}"></div>
    </body></html>`;
    const tmp = path.join(os.tmpdir(), `clawd-icon-${size}.html`);
    fs.writeFileSync(tmp, html);

    const win = new BrowserWindow({ width: size, height: size, show: false,
      transparent: true, webPreferences: { offscreen: true } });
    win.loadFile(tmp);
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage({ x:0, y:0, width:size, height:size });
          const png = img.toPNG();
          for (const name of getIconNames(size)) {
            fs.writeFileSync(path.join(iconsetDir, name), png);
          }
          console.log(`✓ ${size}x${size}`);
        } catch(e) { console.error(`${size} failed:`, e.message); }
        if (!win.isDestroyed()) win.destroy();
        resolve();
      }, 400);
    });
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); resolve(); }, 6000);
  });
}
