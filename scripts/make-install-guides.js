// Generate install guide images for macOS and Windows
// Run with: npx electron scripts/make-install-guides.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.dock.hide();

const W = 800, H = 520;

const macHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px;
    background: #0d0d0d;
    font-family: 'Outfit', sans-serif;
    padding: 40px;
    position: relative;
    overflow: hidden;
  }
  .orb {
    position: absolute; border-radius: 50%; pointer-events: none; filter: blur(100px);
  }
  .orb-1 { top: -20%; right: 10%; width: 400px; height: 400px; background: rgba(227,252,2,0.05); }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; background: rgba(227,252,2,0.1);
    border: 1px solid rgba(227,252,2,0.2); border-radius: 100px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500;
    color: #e3fc02; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px;
  }

  h1 {
    font-size: 28px; font-weight: 800; color: #F5F5F7;
    margin-bottom: 32px; letter-spacing: -1px;
  }
  h1 span { color: #e3fc02; }

  .steps {
    display: flex; gap: 20px;
  }

  .step {
    flex: 1;
    padding: 20px 18px;
    border-radius: 14px;
    background: rgba(109,109,109,0.12);
    border: 1px solid rgba(255,255,255,0.07);
    display: flex; flex-direction: column; gap: 12px;
  }

  .step-num {
    width: 28px; height: 28px; border-radius: 8px;
    background: rgba(227,252,2,0.1);
    display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700;
    color: #e3fc02;
  }

  .step h3 {
    font-size: 14px; font-weight: 700; color: #F5F5F7; line-height: 1.3;
  }

  .step p {
    font-size: 12px; color: rgba(245,245,247,0.5); line-height: 1.5;
  }

  .step .highlight {
    background: rgba(227,252,2,0.08); color: #e3fc02;
    padding: 8px 12px; border-radius: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    line-height: 1.6; margin-top: 4px;
  }

  .step .highlight strong { color: #F5F5F7; }

  .brand {
    position: absolute; bottom: 20px; right: 40px;
    font-size: 11px; color: rgba(245,245,247,0.12); letter-spacing: 1px;
  }

  .mascot {
    position: absolute; bottom: 16px; left: 40px; width: 32px; height: auto;
    filter: drop-shadow(0 2px 8px rgba(227,252,2,0.1)); opacity: 0.4;
  }
</style>
</head>
<body>
  <div class="orb orb-1"></div>
  <img src="file://${path.join(__dirname, '..', 'assets', 'clawd.svg')}" class="mascot" />

  <div class="badge">macOS Install</div>
  <h1>How to install <span>OhNine</span></h1>

  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <h3>Open the .dmg</h3>
      <p>Double-click the downloaded file. Drag OhNine into Applications.</p>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <h3>Right-click to open</h3>
      <p>macOS blocks unsigned apps on first launch. This is normal.</p>
      <div class="highlight">
        <strong>Right-click</strong> the app<br>
        Click <strong>Open</strong><br>
        Click <strong>Open</strong> again
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <h3>Sign in</h3>
      <p>Click the menu bar icon. Sign in with your Claude account. Done. It opens normally from now on.</p>
    </div>
  </div>

  <div class="brand">RAXXO Studios</div>
</body>
</html>`;

const winHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px;
    background: #0d0d0d;
    font-family: 'Outfit', sans-serif;
    padding: 40px;
    position: relative;
    overflow: hidden;
  }
  .orb {
    position: absolute; border-radius: 50%; pointer-events: none; filter: blur(100px);
  }
  .orb-1 { top: -20%; right: 10%; width: 400px; height: 400px; background: rgba(0,120,215,0.05); }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; background: rgba(0,120,215,0.1);
    border: 1px solid rgba(0,120,215,0.2); border-radius: 100px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 500;
    color: #0078d7; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px;
  }

  h1 {
    font-size: 28px; font-weight: 800; color: #F5F5F7;
    margin-bottom: 32px; letter-spacing: -1px;
  }
  h1 span { color: #e3fc02; }

  .steps {
    display: flex; gap: 20px;
  }

  .step {
    flex: 1;
    padding: 20px 18px;
    border-radius: 14px;
    background: rgba(109,109,109,0.12);
    border: 1px solid rgba(255,255,255,0.07);
    display: flex; flex-direction: column; gap: 12px;
  }

  .step-num {
    width: 28px; height: 28px; border-radius: 8px;
    background: rgba(0,120,215,0.1);
    display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700;
    color: #0078d7;
  }

  .step h3 {
    font-size: 14px; font-weight: 700; color: #F5F5F7; line-height: 1.3;
  }

  .step p {
    font-size: 12px; color: rgba(245,245,247,0.5); line-height: 1.5;
  }

  .step .highlight {
    background: rgba(0,120,215,0.08); color: #5ba3d9;
    padding: 8px 12px; border-radius: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    line-height: 1.6; margin-top: 4px;
  }

  .step .highlight strong { color: #F5F5F7; }

  .brand {
    position: absolute; bottom: 20px; right: 40px;
    font-size: 11px; color: rgba(245,245,247,0.12); letter-spacing: 1px;
  }

  .mascot {
    position: absolute; bottom: 16px; left: 40px; width: 32px; height: auto;
    filter: drop-shadow(0 2px 8px rgba(0,120,215,0.1)); opacity: 0.4;
  }
</style>
</head>
<body>
  <div class="orb orb-1"></div>
  <img src="file://${path.join(__dirname, '..', 'assets', 'clawd.svg')}" class="mascot" />

  <div class="badge">Windows Install</div>
  <h1>How to install <span>OhNine</span></h1>

  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <h3>Run the installer</h3>
      <p>Double-click the downloaded .exe file.</p>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <h3>Allow SmartScreen</h3>
      <p>Windows may show "Windows protected your PC." This is normal for new apps.</p>
      <div class="highlight">
        Click <strong>More info</strong><br>
        Click <strong>Run anyway</strong>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <h3>Sign in</h3>
      <p>Find OhNine in your system tray. Click it, sign in with your Claude account. Done.</p>
    </div>
  </div>

  <div class="brand">RAXXO Studios</div>
</body>
</html>`;

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, '..', 'screenshots');
  const items = [['install-mac', macHtml], ['install-windows', winHtml]];

  const win = new BrowserWindow({
    width: W, height: H, show: false, frame: false,
    webPreferences: { offscreen: true },
  });

  for (const [name, html] of items) {
    const tmpPath = path.join(app.getPath('temp'), `ohnine-${name}-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html);

    await win.loadFile(tmpPath);
    await new Promise(r => setTimeout(r, 2500));

    const img = await win.capturePage();
    const png = img.toPNG({ scaleFactor: 2.0 });
    const outPath = path.join(outDir, `${name}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`Saved: ${name}.png (${png.length} bytes)`);

    try { fs.unlinkSync(tmpPath); } catch(e) {}
  }

  console.log('Done!');
  app.quit();
});
