# Claude Usage Meter 🦀

A system tray app that shows your Claude API usage as **Claw'd** — the crab mascot — walking a sprint lane from 0–100%.

## Setup

```bash
npm install
npm start
```

Click the 🦀 icon in your menu bar to open the usage popup.  
First time: click ⚙ to add your Anthropic API key (`sk-ant-...`).

## How it works

- Makes a minimal API ping to read rate-limit headers (no tokens wasted on data)
- Updates automatically every 60 seconds
- Claw'd walks the lane based on % used
- At 100%: Claw'd goes to sleep 😴, walks back to start, shows reset countdown
- Mac: shows `🦀 45%` in menu bar text

## Share with coworkers

```bash
git clone <this-repo>
cd claude-usage-meter
npm install
npm start
```

Each person needs their own Anthropic API key.

## Requirements

- Node.js 18+
- Works on macOS and Windows
