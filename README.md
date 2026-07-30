# OhNine

[![MIT License](https://img.shields.io/badge/license-MIT-e3fc02)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/raxxostudios/raxxo-ohnine)](https://github.com/raxxostudios/raxxo-ohnine/releases/latest)

**Don't get caught at zero.**

OhNine is a free, open-source menu bar app that tracks your Claude AI usage limits in real time. Session usage, weekly caps, model-specific limits. One glance tells you exactly where you stand before Claude says no.

Oh nine. Oh nein.

Built by [RAXXO Studios](https://raxxo.shop) in Berlin.

---

## Features

- **Live session tracking** with animated progress bar and Claw'd mascot that walks along (and gets tired at 100%)
- **Live reset countdown** that ticks down so at 100% you see exactly how long until you can continue, no digging through Usage Settings
- **Weekly limit bars** for all models and the model-scoped cap (labelled from the API, so it follows model renames)
- **Auto-sync intervals** from 30 seconds to 1 hour, or manual/on-demand
- **Native notifications** at 80%, 91% ("Oh Nine. Literally."), and 100% ("Oh Nein.")
- **Dark and light mode** with one-click toggle (adapts all colors, bars, and UI)
- **Pin/Keep on Top** so the window stays visible while you work
- **Tray icon** with live usage bar and percentage baked into the menu bar
- **Right-click menu**: Sync Now, Open claude.ai, Switch Workspace, Keep on Top, Launch at Login, Report a Bug, About, Quit
- **Update checker** built in (checks on startup, manual check in About view)
- **Font options**: system default, sans-serif, OpenDyslexic (reads from Claude settings)
- **Color-coded bars**: green (safe), yellow (50%+), orange (75%+), red (100%)
- **Cross-platform**: macOS (Apple Silicon + Intel), Windows, Linux

## Privacy

OhNine reads your usage data directly from claude.ai using your own browser session.

- No data is sent to RAXXO Studios or any third party
- No analytics, telemetry, or tracking of any kind
- Your Claude session credentials are stored locally by the Electron framework
- Everything stays on your device

Full privacy policy: https://raxxo.shop/pages/datenschutz

---

## Install (macOS)

1. Download the `.dmg` for your Mac (Apple Silicon or Intel) from [studio.raxxo.shop/ohnine-download](https://studio.raxxo.shop/ohnine-download)
2. Open the `.dmg` and drag OhNine into Applications
3. **First launch security warning:** macOS will say the app "can't be opened because Apple cannot check it for malicious software." This is normal for indie apps without a paid Apple Developer certificate.

   **How to open it:**
   - Right-click (or Control-click) OhNine in Applications
   - Click **Open**
   - macOS asks again, click **Open**
   - Done. It opens normally from now on.

4. Click the OhNine icon in your menu bar
5. Sign in with your Claude account (one-time)
6. Done. OhNine starts tracking.

## Install (Windows)

1. Download the `.exe` installer from [studio.raxxo.shop/ohnine-download](https://studio.raxxo.shop/ohnine-download)
2. Double-click to run. Windows SmartScreen may show "Windows protected your PC."
   - Click **More info**
   - Click **Run anyway**
3. Find OhNine in your system tray, sign in with your Claude account. Done.

## Install (Linux)

1. Download the `.AppImage` from [studio.raxxo.shop/ohnine-download](https://studio.raxxo.shop/ohnine-download)
2. Make it executable and run: `chmod +x OhNine*.AppImage && ./OhNine*.AppImage`

---

## Requirements

- macOS 12+ (Apple Silicon and Intel), Windows 10+, or Linux (x64)
- Active Claude Pro or Team subscription
- Internet connection (to reach claude.ai)

---

## For developers

### Run from source

```bash
git clone <repo-url>
cd raxxo-ohnine
npm install
npm start
```

### Build installers

```bash
npm run build      # .dmg (arm64 + x64), .exe, .AppImage, .deb via electron-builder
```

### Dev mode

```bash
npm run dev        # launches with --dev flag
```

### Generate screenshots

```bash
npx electron scripts/take-screenshots.js      # 12 app state screenshots
npx electron scripts/make-install-guides.js    # macOS + Windows install guides
npx electron scripts/make-dmg-bg.js            # DMG background image
```

### Dev shortcuts

In the popup, hold `Ctrl+Shift` plus:

| Key | Action |
|-----|--------|
| `0-9` | Preview usage states (0% fresh to 9 limit reached) |
| `T` | Toggle dark/light theme |
| `A` | Show About view |
| `L` | Show Login view |
| `R` | Reset to live data |

### Version check system

The app checks `studio.raxxo.shop/ohnine-version.json` on startup.

To release a new version:
1. Bump version in `package.json`
2. `npm run build`
3. Copy the new installers into `public/downloads/` in the `raxxo-studios` repo. The Vercel deploy is a full snapshot, so keep the existing files for any platform you did not rebuild.
4. Bump `public/ohnine-version.json` and the download page version in `raxxo-studios`
5. Deploy `raxxo-studios` to Vercel (`vercel --prod`). This publishes the installers to `studio.raxxo.shop/downloads` and the update feed users check on startup.
6. (Optional) Mirror the installers to GitHub Releases.

### Project structure

```
main.js           Tray, polling, scraping, notifications, login, context menu
popup.html        Popup UI (360x390px)
popup.css         Styles, themes, animations
popup.js          UI logic, rendering, pills, pin, theme
preload.js        IPC bridge (security boundary)
assets/
  clawd.svg       Claw'd mascot
  icon.icns       macOS app icon
  icon.ico        Windows app icon
  dmg-bg.png      DMG installer background
scripts/
  make-icon-node.js       Generate app icon
  make-dmg-bg.js          Generate DMG background
  make-install-guides.js  Generate install guide images
  take-screenshots.js     Generate all app state screenshots
screenshots/              Marketing images (12 states + 2 install guides)
dist/                     Built installers
```

---

## Version

Current: **1.0.8**

## Contributing

Found a bug? Have an idea? PRs welcome.

1. Fork the repo
2. Create your branch (`git checkout -b fix/something`)
3. Commit your changes
4. Push and open a PR

## License

MIT License. Free and open source.

OhNine is an independent product by RAXXO Studios. Not affiliated with, endorsed by, or connected to Anthropic, PBC. "Claude" is a trademark of Anthropic.

## Support

help@raxxo.shop

---

Made by [RAXXO Studios](https://raxxo.shop) in Berlin.
