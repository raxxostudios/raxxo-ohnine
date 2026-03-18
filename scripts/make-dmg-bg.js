// Generate DMG background image using Electron's rendering
// Run with: npx electron scripts/make-dmg-bg.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.dock.hide();

const W = 1080, H = 760; // 2x Retina (540x380 logical)

const html = `<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px;
    background: #0d0d0d;
    font-family: 'Outfit', -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  /* Glow orbs */
  .orb {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(120px);
  }
  .orb-1 {
    top: -15%;
    left: 20%;
    width: 500px;
    height: 500px;
    background: rgba(227,252,2,0.06);
  }
  .orb-2 {
    bottom: -10%;
    right: 15%;
    width: 400px;
    height: 400px;
    background: rgba(255,0,64,0.03);
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
  }

  .mascot {
    width: 64px;
    height: auto;
    filter: drop-shadow(0 4px 20px rgba(227,252,2,0.15));
    margin-bottom: -8px;
  }

  .title {
    font-size: 48px;
    font-weight: 800;
    color: #e3fc02;
    letter-spacing: -2px;
    text-align: center;
    line-height: 1;
  }

  .subtitle {
    font-size: 18px;
    font-weight: 400;
    color: rgba(245,245,247,0.35);
    text-align: center;
    letter-spacing: 0.5px;
  }

  /* Arrow hint */
  .arrow-row {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-top: 24px;
  }

  .arrow-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(227,252,2,0.2);
  }
  .arrow-dot:nth-child(2) { background: rgba(227,252,2,0.3); }
  .arrow-dot:nth-child(3) { background: rgba(227,252,2,0.4); }
  .arrow-dot:nth-child(4) { background: rgba(227,252,2,0.5); }

  .arrow-chevron {
    width: 0;
    height: 0;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-left: 12px solid rgba(227,252,2,0.5);
  }

  .drag-text {
    font-size: 13px;
    font-weight: 600;
    color: rgba(245,245,247,0.2);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-top: 8px;
  }

  /* Bottom branding */
  .brand {
    position: absolute;
    bottom: 32px;
    font-size: 12px;
    color: rgba(245,245,247,0.12);
    letter-spacing: 1px;
  }

  /* Subtle border line at top */
  .top-line {
    position: absolute;
    top: 0;
    left: 25%;
    right: 25%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(227,252,2,0.15), transparent);
  }
</style>
</head>
<body>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="top-line"></div>

  <div class="content">
    <img src="file://${path.join(__dirname, '..', 'assets', 'clawd.svg')}" class="mascot" />
    <div class="title">OhNine</div>
    <div class="subtitle">Don't get caught at zero.</div>
    <div class="arrow-row">
      <div class="arrow-dot"></div>
      <div class="arrow-dot"></div>
      <div class="arrow-dot"></div>
      <div class="arrow-dot"></div>
      <div class="arrow-chevron"></div>
    </div>
    <div class="drag-text">Drag to Applications</div>
  </div>

  <div class="brand">RAXXO Studios</div>
</body>
</html>`;

app.whenReady().then(async () => {
  const tmpHtml = path.join(app.getPath('temp'), 'dmg-bg.html');
  fs.writeFileSync(tmpHtml, html);

  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: { offscreen: true },
  });

  await win.loadFile(tmpHtml);
  await new Promise(r => setTimeout(r, 2000)); // let fonts + orbs render

  const img = await win.capturePage();
  const png = img.toPNG({ scaleFactor: 2.0 });

  const outPath = path.join(__dirname, '..', 'assets', 'dmg-bg.png');
  fs.writeFileSync(outPath, png);
  console.log(`DMG background saved: ${outPath} (${png.length} bytes)`);

  fs.unlinkSync(tmpHtml);
  app.quit();
});
