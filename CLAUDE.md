# CLAUDE.md

## Project Overview

Menu bar app that tracks Claude AI usage limits in real time. Electron tray app for macOS, Windows, and Linux. Free and open source (MIT). Reads usage data directly from claude.ai using the user's browser session.

## Commands

```bash
npm install        # Install dependencies
npm start          # Launch the app
npm run dev        # Launch with --dev flag
npm run build      # Build installers (.dmg, .exe, .AppImage, .deb)
```

## Key Files

| File | Purpose |
|---|---|
| `main.js` | Tray, polling, scraping, notifications, login, context menu |
| `popup.html` | Popup UI (360x390px) |
| `popup.css` | Styles, themes, animations |
| `popup.js` | UI logic, rendering, pills, pin, theme toggle |
| `preload.js` | IPC bridge (security boundary) |
| `assets/` | Claw'd mascot SVG, app icons (.icns, .ico), DMG background |
| `scripts/` | Icon generation, DMG background, install guides, screenshot automation |
| `screenshots/` | Marketing images (12 states + 2 install guides) |

## Features

- Live session tracking with animated progress bar + Claw'd mascot
- Weekly limit bars for all models
- Auto-sync intervals (30s to 1hr)
- Native notifications at 80%, 91% ("Oh Nine. Literally."), 100% ("Oh Nein.")
- Dark and light mode
- Pin/Keep on Top
- Tray icon with live usage percentage
- Cross-platform: macOS (ARM + Intel), Windows, Linux
- Font options: system, sans-serif, OpenDyslexic

## Version

Current: 1.0.10

Version check: app queries `studio.raxxo.shop/ohnine-version.json` on startup.
Version is displayed dynamically from app.getVersion() - no hardcoded values in HTML.

## Dev Shortcuts

In the popup, hold Ctrl+Shift plus: 0-9 (preview states), T (theme), A (about), L (login), R (reset to live).

## Privacy

Zero data sent to RAXXO or any third party. No analytics. No telemetry. All data stays on device.

## Rules

- No em dashes
- Text color #F5F5F7 (never #fff)
- Author: RAXXO Studios
- "Claude" is a trademark of Anthropic. OhNine is not affiliated with Anthropic.
