# OhNine

**Don't get caught at zero.**

OhNine sits in your macOS menu bar and tracks your Claude usage limits in real-time. Session limits, weekly caps, model-specific tracking. Know before Claude says no.

Oh nine. Oh nein.

---

## Install (macOS)

1. Download the `.dmg` for your Mac (Apple Silicon or Intel)
2. Open the `.dmg` and drag OhNine into Applications
3. **First launch security warning:** macOS will say the app "can't be opened because Apple cannot check it for malicious software." This is normal for indie apps without a $99/year Apple Developer certificate.

   **How to open it:**
   - Right-click (or Control-click) OhNine in Applications
   - Click **Open**
   - macOS asks again. Click **Open**
   - Done. It opens normally from now on.

   See `screenshots/install-mac.png` for a visual guide.

4. Click the OhNine icon in your menu bar
5. Sign in with your Claude account
6. Done. OhNine starts tracking.

## Install (Windows)

1. Download the `.exe` installer
2. Double-click to run. Windows SmartScreen may show "Windows protected your PC." This is normal for new apps.
   - Click **More info**
   - Click **Run anyway**

   See `screenshots/install-windows.png` for a visual guide.

3. Find OhNine in your system tray, sign in with your Claude account. Done.

---

## What it tracks

- **Session usage** - live progress bar with mascot that walks along and gets tired at 100%
- **Weekly limits** - all models and Sonnet-specific caps
- **Auto-sync** - every 30 seconds to once an hour, or manual
- **Notifications** - native macOS alerts at 80%, 91% (Oh Nine. Literally.), and 100% (Oh Nein.)

## Features

- Dark and light mode (toggle with one click)
- Keep on Top / pin window (stays visible while you work)
- Right-click tray menu: Sync Now, Open claude.ai, Keep on Top, Launch at Login, About, Quit
- Check for updates built in (About view or automatic on startup)
- AM/PM time format for last sync
- Color-coded bars: green, yellow, orange, red based on usage level

## Privacy

OhNine reads your usage data directly from claude.ai using your own browser session.

- No data is sent to RAXXO Studios or any third party
- No analytics, telemetry, or tracking of any kind
- Your Claude session credentials are stored locally by the Electron framework
- Everything stays on your device

Full privacy policy: https://raxxo.shop/policies/privacy-policy

## Requirements

- macOS 12+ (Apple Silicon and Intel) or Windows 10+
- Active Claude Pro or Team subscription
- Internet connection (to reach claude.ai)

---

## For developers

### Run from source

```bash
npm install
npm start
```

### Build installers

```bash
npm run build      # .dmg (arm64 + x64) via electron-builder
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

The app checks `raxxo-studio-dev.vercel.app/ohnine-version.json` on startup.

To release a new version:
1. Bump version in `package.json`
2. `npm run build`
3. Update `public/ohnine-version.json` in the `raxxo-studios` repo
4. Deploy: `npx vercel link --yes --project raxxo-studio-dev && npx vercel --prod --yes`
5. Re-link: `npx vercel link --yes --project raxxo-studio`
6. Upload new `.dmg` to Shopify product page

### Project structure

```
main.js           - Tray, polling, scraping, notifications, login, context menu
popup.html        - Popup UI (360x390px)
popup.css         - Styles, themes, animations
popup.js          - UI logic, rendering, pills, pin, theme
preload.js        - IPC bridge (security boundary)
assets/
  clawd.svg       - Mascot
  icon.icns       - App icon (all sizes)
  dmg-bg.png      - DMG installer background
scripts/
  make-icon-node.js       - Generate app icon
  make-dmg-bg.js          - Generate DMG background
  make-install-guides.js  - Generate install guide images
  take-screenshots.js     - Generate all app state screenshots
screenshots/              - Marketing images (12 states + 2 install guides)
dist/                     - Built .dmg files
```

---

## License

Single-user license. Do not redistribute or resell. Provided as-is with no warranty.

OhNine is an independent product by RAXXO Studios. Not affiliated with, endorsed by, or connected to Anthropic, PBC. "Claude" is a trademark of Anthropic.

## Support

help@raxxo.shop

---

Made by [RAXXO Studios](https://raxxo.shop) in Berlin.
