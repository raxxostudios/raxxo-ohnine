const $ = id => document.getElementById(id);

const mainView    = $('mainView');
const loginView   = $('loginView');
const loadingView = $('loadingView');
const aboutView   = $('aboutView');

const laneCrab    = $('laneCrab');
const clawdImg    = $('clawdImg');
const sessionFill = $('sessionFill');
const sessionPct  = $('sessionPct');
const sessionReset= $('sessionReset');
const weeklyFill  = $('weeklyFill');
const weeklyPct   = $('weeklyPct');
const weeklyReset = $('weeklyReset');
const sonnetFill  = $('sonnetFill');
const sonnetPct   = $('sonnetPct');
const sonnetReset = $('sonnetReset');
const sonnetLabel = $('sonnetLabel');
const sonnetRow   = $('sonnetRow');
const lastUpdated = $('lastUpdated');

$('refreshBtn').addEventListener('click', handleRefresh);
$('aboutBtn').addEventListener('click', showAbout);
$('aboutBackBtn').addEventListener('click', showMain);
$('aboutBackBtn2').addEventListener('click', showMain);
$('legalPrivacyBtn').addEventListener('click', () => window.api.openUrl('https://raxxo.shop/pages/datenschutz'));
$('legalTosBtn').addEventListener('click', () => window.api.openUrl('https://raxxo.shop/pages/terms'));
let pendingUpdateUrl = null;
$('checkUpdateBtn').addEventListener('click', async () => {
  const btn = $('checkUpdateBtn');
  if (pendingUpdateUrl) {
    window.api.openUrl(pendingUpdateUrl);
    return;
  }
  btn.textContent = 'Checking...';
  const result = await window.api.checkUpdate();
  if (result && result.available) {
    pendingUpdateUrl = result.url;
    btn.textContent = 'Update available';
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';
  } else {
    btn.textContent = 'Up to date';
    setTimeout(() => { btn.textContent = 'Check for updates'; }, 2000);
  }
});
$('loginAboutBtn').addEventListener('click', showAbout);
$('learnMoreBtn').addEventListener('click', (e) => { e.preventDefault(); window.api.openUrl('https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work'); });
$('manualRefreshBtn').addEventListener('click', handleRefresh);
$('loginBtn').addEventListener('click', () => window.api.openLogin());
$('logoutBtn').addEventListener('click', async () => { await window.api.logout(); showLogin(); });

// ── Helpers ───────────────────────────────────────────────────────────────────
function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}
function fillColor(p) {
  return p>=100 ? cssVar('--red') : p>=75 ? cssVar('--orange') : p>=50 ? cssVar('--yellow') : cssVar('--green');
}
function pctClass(p) {
  return p>=100?'pct-red':p>=75?'pct-warn':p>=50?'pct-mid':'pct-ok';
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12: true }).toLowerCase();
}

// Weekly/Sonnet resets come from the API as ISO timestamps. Show a friendly
// date + time; pass through anything that is not an ISO string unchanged.
function fmtResetAt(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}t/i.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12: true }).toLowerCase();
  }
  return v;
}

// ── Session reset countdown ─────────────────────────────────────────────────────
// claude.ai only prints a static reset string (e.g. "in 4 hr 58 min"). We turn it
// into an absolute target timestamp at sync time, then tick a live countdown so the
// answer to "how long until I can continue?" is always on screen, including at 100%
// and in the 91-99% danger zone where the reset used to be hidden.
let sessionPctState    = 0;
let sessionResetTarget = null;  // ms timestamp, or null when unknown/unparseable
let sessionResetRaw    = '';    // raw claude string, used as fallback text
let lastResetText      = null;
let lastResetClass     = null;
let countdownTimer     = null;
let zeroRefreshFired   = false;

function parseResetToTarget(str) {
  if (!str) return null;
  // ISO timestamp from claude.ai's usage API (e.g. 2026-05-25T13:29:59+00:00).
  // Language-independent and exact, so this is the primary path. Check it first,
  // before the clock branch (an ISO string also contains "13:29").
  if (/^\d{4}-\d{2}-\d{2}t/i.test(String(str).trim())) {
    const t = Date.parse(str);
    if (!isNaN(t)) return t;
  }
  const s = String(str).trim().toLowerCase().replace(/^(in|at)\s+/, '');
  // Clock time ("4:00 pm", "fri 4:00 pm", "16:00") -> next occurrence of that time
  if (/\d{1,2}:\d{2}/.test(s)) {
    const c = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
    if (!c) return null;
    let hr = parseInt(c[1]); const min = parseInt(c[2]); const ap = c[3];
    if (ap === 'pm' && hr < 12) hr += 12;
    if (ap === 'am' && hr === 12) hr = 0;
    const now = new Date();
    const target = new Date(now); target.setHours(hr, min, 0, 0);
    const days = ['sun','mon','tue','wed','thu','fri','sat'];
    const dm = s.match(/\b(sun|mon|tue|wed|thu|fri|sat)/);
    if (dm) {
      let delta = (days.indexOf(dm[1]) - now.getDay() + 7) % 7;
      if (delta === 0 && target <= now) delta = 7;
      target.setDate(now.getDate() + delta);
    } else if (target <= now) {
      target.setDate(now.getDate() + 1);
    }
    return target.getTime();
  }
  // Duration ("4 hr 58 min", "2 hours 30 minutes", "28 min", "45 sec").
  // Units are listed longest-first so "hr" never matches as a bare "h".
  const m = s.match(/(?:(\d+)\s*(?:hours|hour|hrs|hr|h)\b)?\s*(?:(\d+)\s*(?:minutes|minute|mins|min|m)\b)?\s*(?:(\d+)\s*(?:seconds|second|secs|sec|s)\b)?/);
  if (m && (m[1] || m[2] || m[3])) {
    const ms = ((parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) * 60 + parseInt(m[3] || 0)) * 1000;
    if (ms > 0) return Date.now() + ms;
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h > 0) return `${h} hr ${m} min`;
  if (m >= 5) return `${m} min`;
  if (m >= 1) return `${m} min ${s} s`;
  return `${s} s`;
}

function setReset(text, p) {
  if (text !== lastResetText) { sessionReset.textContent = text; lastResetText = text; }
  const cls = 'reset-line' + (p >= 100 ? ' reset-red' : p >= 91 ? ' reset-warn' : '');
  if (cls !== lastResetClass) { sessionReset.className = cls; lastResetClass = cls; }
}

function renderSessionReset() {
  const p = sessionPctState;
  const remaining = sessionResetTarget ? sessionResetTarget - Date.now() : null;

  // Countdown elapsed: pull fresh numbers once. The 5h window may have rolled
  // forward (more usage = later reset), so re-sync instead of claiming a reset.
  if (sessionResetTarget && remaining <= 0 && !zeroRefreshFired) {
    zeroRefreshFired = true;
    sessionResetTarget = null;
    setReset(p >= 100 ? 'Oh Nein. Checking for reset…' : 'Resetting. Syncing…', p);
    window.api.refreshNow().then(d => { if (d && d.lastUpdated) renderUsage(d); }).catch(() => {});
    return;
  }

  const countdown = remaining != null ? formatCountdown(remaining) : null;
  const resetPhrase = countdown ? `Resets in ${countdown}`
    : sessionResetRaw ? `Resets ${sessionResetRaw}` : '';

  let text;
  if (p >= 100) {
    text = countdown ? `Oh Nein. Back in ${countdown}`
      : sessionResetRaw ? `Oh Nein. Resets ${sessionResetRaw}`
      : 'Oh Nein. Waiting for reset.';
  } else if (p >= 91) {
    text = resetPhrase ? `Oh Nine. Literally. · ${resetPhrase}` : 'Oh Nine. Literally.';
  } else {
    text = resetPhrase;
  }
  setReset(text, p);
}

function startCountdownTimer() {
  if (countdownTimer) return;
  countdownTimer = setInterval(renderSessionReset, 1000);
}

let isWalkingBack = false;

function moveCrabTo(pct, instant=false) {
  laneCrab.style.transition = instant ? 'none' : 'left 0.7s ease';
  laneCrab.style.left = `${Math.max(0, Math.min(100, pct))}%`;
}

function triggerWalkBack() {
  if (isWalkingBack) return;
  isWalkingBack = true;
  moveCrabTo(100, true);
  clawdImg.classList.add('walking');
  requestAnimationFrame(() => {
    laneCrab.style.transition = 'left 20s linear';
    laneCrab.style.left = '0%';
    setTimeout(() => {
      isWalkingBack = false;
      clawdImg.classList.remove('walking');
    }, 21000);
  });
}

// ── Appearance ────────────────────────────────────────────────────────────────
let currentTheme = ''; // '' | 'light' | 'dark'

function applyTheme(theme) {
  currentTheme = theme;
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark');
  if (theme === 'light') body.classList.add('theme-light');
  else if (theme === 'dark') body.classList.add('theme-dark');
  // Re-render bars so fill colors pick up the new --green/--red etc.
  if (lastUsageData) requestAnimationFrame(() => renderUsage(lastUsageData));
  // show current state: sun = light mode, moon = dark mode
  const isLight = theme === 'light' || (theme === '' && window.matchMedia('(prefers-color-scheme: light)').matches);
  $('iconSun').style.display  = isLight ? 'block' : 'none';
  $('iconMoon').style.display = isLight ? 'none'  : 'block';
  $('themeToggle').dataset.tip = isLight ? 'Switch to dark mode' : 'Switch to light mode';
}

function applyAppearance(ap) {
  if (!ap) return;
  // Font: font-ui (default) | font-sans | font-system | font-dyslexic
  const body = document.body;
  body.classList.remove('font-sans', 'font-system', 'font-dyslexic');
  const allowedFonts = ['sans', 'system', 'dyslexic'];
  if (ap.font && allowedFonts.includes(ap.font)) body.classList.add(`font-${ap.font}`);
  // Never override user's manual theme choice
}

$('themeToggle').addEventListener('click', async () => {
  const next = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  await window.api.setTheme(next);
});

let lastUsageData = null;

// ── Render ────────────────────────────────────────────────────────────────────
function renderUsage(data) {
  lastUsageData = data;
  if (!data || !data.session) return;

  showMain();
  applyAppearance(data.appearance);

  const sPct = Math.min(data.session?.pct || 0, 100);
  const wPct = Math.min(data.weekly?.pct  || 0, 100);
  const nPct = Math.min(data.sonnet?.pct  || 0, 100);

  // Session bar + Claw'd
  sessionFill.style.width      = `${sPct}%`;
  sessionFill.style.background = fillColor(sPct);
  sessionPct.textContent = `${sPct}%`;
  sessionPct.className   = 'lane-pct ' + pctClass(sPct);

  // Re-arm the live reset countdown from this sync. If a sync returns no reset
  // (e.g. a transient scrape miss), keep the last still-valid countdown ticking
  // instead of wiping it, so the time survives the climb into 100%.
  sessionPctState = sPct;
  const newResetRaw = data.session.resetIn || '';
  const newTarget   = parseResetToTarget(newResetRaw);
  if (newTarget) {
    sessionResetRaw    = newResetRaw;
    sessionResetTarget = newTarget;
    zeroRefreshFired   = false;
  } else if (!(sessionResetTarget && sessionResetTarget - Date.now() > 0)) {
    sessionResetRaw    = newResetRaw;
    sessionResetTarget = null;
  }
  renderSessionReset();

  if (sPct >= 100) {
    laneCrab.classList.add('tired');
    if (!isWalkingBack) triggerWalkBack();
  } else {
    laneCrab.classList.remove('tired');
    moveCrabTo(sPct);
    clawdImg.classList.add('walking');
    setTimeout(() => clawdImg.classList.remove('walking'), 900);
  }

  // Weekly
  weeklyFill.style.width      = `${wPct}%`;
  weeklyFill.style.background = fillColor(wPct);
  weeklyPct.textContent = `${wPct}%`;
  weeklyPct.className   = 'compact-pct ' + pctClass(wPct);
  weeklyReset.textContent = data.weekly?.resetAt ? `Resets ${fmtResetAt(data.weekly.resetAt)}` : '';

  // Model-specific weekly limit. The label comes from the API key name
  // (seven_day_fable -> "Fable"), never hardcoded: Anthropic renames it as the
  // model lineup changes and the app used to show a stale "Sonnet only 0%".
  // Accounts without a model-scoped cap get no row at all. Showing a permanent
  // "0%" bar there would repeat the exact confusion the stale "Sonnet only 0%"
  // caused, just for a different reason.
  const hasScoped = !!(data.sonnet?.label) || nPct > 0;
  if (sonnetRow) sonnetRow.style.display = hasScoped ? '' : 'none';
  if (sonnetLabel) sonnetLabel.textContent = data.sonnet?.label || 'Model limit';
  sonnetFill.style.width      = `${nPct}%`;
  sonnetFill.style.background = fillColor(nPct);
  sonnetPct.textContent = `${nPct}%`;
  sonnetPct.className   = 'compact-pct ' + pctClass(nPct);
  sonnetReset.textContent = data.sonnet?.resetAt ? `Resets ${fmtResetAt(data.sonnet.resetAt)}` : '';

  if (data.lastUpdated) {
    lastUpdated.textContent = `last sync ${fmtTime(data.lastUpdated)}`;
  }

  // Badge stays as "beta" - plan detection unreliable across account types
}

// ── View switching ────────────────────────────────────────────────────────────
function showMain()    { mainView.classList.remove('hidden'); loginView.classList.add('hidden'); loadingView.classList.add('hidden'); aboutView.classList.add('hidden'); }
function showLogin()   { mainView.classList.add('hidden'); loginView.classList.remove('hidden'); loadingView.classList.add('hidden'); aboutView.classList.add('hidden'); }
function showLoading() { mainView.classList.add('hidden'); loginView.classList.add('hidden'); loadingView.classList.remove('hidden'); aboutView.classList.add('hidden'); }
function showAbout()   { mainView.classList.add('hidden'); loginView.classList.add('hidden'); loadingView.classList.add('hidden'); aboutView.classList.remove('hidden'); }

// ── Refresh ───────────────────────────────────────────────────────────────────
let refreshing = false;
async function handleRefresh() {
  if (refreshing) return;
  refreshing = true;
  const btn = $('refreshBtn');
  btn.style.transition = 'transform 0.8s linear';
  btn.style.transform = 'rotate(360deg)';
  btn.removeAttribute('data-tip'); // hide tooltip while spinning
  lastUpdated.textContent = 'syncing…';
  try {
    const data = await window.api.refreshNow();
    if (data && data.lastUpdated) renderUsage(data);
  } catch(e) {
    console.error('handleRefresh failed:', e.message || e);
    lastUpdated.textContent = 'sync failed';
  }
  finally {
    setTimeout(() => {
      btn.style.transform=''; btn.style.transition=''; refreshing=false;
      btn.dataset.tip = 'Sync'; // restore tooltip
    }, 850);
  }
}

// ── IPC events ────────────────────────────────────────────────────────────────
window.api.onUsageUpdate(data => renderUsage(data));
window.api.onLoginRequired(() => showLogin());
window.api.onLoggedIn(() => { showLoading(); setTimeout(handleRefresh, 500); });
window.api.onPinChanged(pinned => applyPin(pinned));
window.api.onShowAbout(() => showAbout());

// ── Interval pills ────────────────────────────────────────────────────────────
const pills = document.querySelectorAll('.interval-pill:not(.oneoff-pill)');
const oneoffPill = $('oneoffPill');
const intervalLabel = $('intervalLabel');

function setOneoffMode(on) {
  oneoffPill.classList.toggle('active', on);
  oneoffPill.setAttribute('aria-pressed', String(on));
  intervalLabel.classList.toggle('oneoff-active', on);
}

function setActivePill(sec) {
  pills.forEach(p => {
    const active = parseInt(p.dataset.sec) === sec;
    p.classList.toggle('active', active);
    p.setAttribute('aria-pressed', String(active));
  });
  setOneoffMode(sec === 0);
}

function triggerOneoff() {
  window.api.setInterval(0);
  setActivePill(0);
  window.api.refreshNow();
}

oneoffPill.addEventListener('click', triggerOneoff);

pills.forEach(pill => {
  pill.addEventListener('click', async () => {
    const sec = parseInt(pill.dataset.sec);
    const isActive = pill.classList.contains('active');
    if (isActive) {
      triggerOneoff();
    } else {
      await window.api.setInterval(sec);
      setActivePill(sec);
    }
  });
  pill.addEventListener('dblclick', () => triggerOneoff());
});

// ── Pin button ────────────────────────────────────────────────────────────────
const pinBtn = $('pinBtn');
const isMac = navigator.userAgent.includes('Mac');
const labelPin   = isMac ? 'Keep on Top' : 'Always on Top';
const labelUnpin = isMac ? 'Don\'t Keep on Top' : 'Disable Always on Top';

function applyPin(pinned) {
  pinBtn.classList.toggle('pinned', pinned);
  pinBtn.dataset.tip = pinned ? labelUnpin : labelPin;
}

async function initPin() {
  applyPin(await window.api.getPin());
}

pinBtn.addEventListener('click', async () => {
  applyPin(await window.api.togglePin());
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  showLoading();
  const loggedIn = await window.api.isLoggedIn();
  if (!loggedIn) { showLogin(); return; }

  const [sec, savedTheme, version] = await Promise.all([window.api.getInterval(), window.api.getTheme(), window.api.getVersion()]);
  if (version) {
    $('versionNum').textContent = version;
    $('aboutVersion').textContent = 'v' + version;
    document.querySelectorAll('.login-version-num').forEach(el => el.textContent = version);
  }
  initPin();
  startCountdownTimer();

  // Persist defaults on first run
  if (!savedTheme) window.api.setTheme('dark');

  setActivePill(sec); // 0 = off (hot-pink), any other = interval pill

  applyTheme(savedTheme || 'dark');

  const cached = await window.api.getUsage();
  if (cached && cached.lastUpdated) {
    renderUsage(cached);
  } else {
    showLoading();
    await handleRefresh();
  }

  // One-time version check (non-blocking)
  window.api.checkUpdate().then(result => {
    if (result && result.available) {
      pendingUpdateUrl = result.url;
      const aboutBtn = $('aboutBtn');
      aboutBtn.classList.add('has-update');
      aboutBtn.dataset.tip = 'Update available';
      const updateBtn = $('checkUpdateBtn');
      updateBtn.textContent = 'Update available';
      updateBtn.style.borderColor = 'var(--green)';
      updateBtn.style.color = 'var(--green)';
      const dot = $('updateDot');
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        window.api.openUrl(result.url);
      });
    }
  }).catch(() => {});
}

init().catch(e => {
  console.error('init failed:', e.message || e);
  showLogin();
});

// Demo mode: hold Ctrl+Shift + key to preview states (for screenshots/recording)
document.addEventListener('keydown', e => {
  if (!e.ctrlKey || !e.shiftKey) return;
  const c = e.code;
  if (c.startsWith('Digit')) window.api.fakeState(parseInt(c[5]));
  else if (c === 'KeyT') $('themeToggle').click();
  else if (c === 'KeyA') showAbout();
  else if (c === 'KeyL') showLogin();
  else if (c === 'KeyR') window.api.refreshNow().then(d => { if (d) renderUsage(d); });
});
