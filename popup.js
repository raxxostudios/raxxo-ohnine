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
const lastUpdated = $('lastUpdated');

$('refreshBtn').addEventListener('click', handleRefresh);
$('aboutBtn').addEventListener('click', showAbout);
$('aboutBackBtn').addEventListener('click', showMain);
$('aboutBackBtn2').addEventListener('click', showMain);
$('legalPrivacyBtn').addEventListener('click', () => window.api.openUrl('https://raxxo.shop/policies/privacy-policy'));
$('legalTosBtn').addEventListener('click', () => window.api.openUrl('https://raxxo.shop/policies/terms-of-service'));
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
  return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
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
    laneCrab.style.transition = 'left 3s linear';
    laneCrab.style.left = '0%';
    setTimeout(() => {
      isWalkingBack = false;
      clawdImg.classList.remove('walking');
    }, 3200);
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

  const sPct = data.session?.pct || 0;
  const wPct = data.weekly?.pct  || 0;
  const nPct = data.sonnet?.pct  || 0;

  // Session bar + Claw'd
  sessionFill.style.width      = `${sPct}%`;
  sessionFill.style.background = fillColor(sPct);
  sessionPct.textContent = `${sPct}%`;
  sessionPct.className   = 'lane-pct ' + pctClass(sPct);
  sessionReset.textContent = (sPct >= 91 && sPct < 100) ? 'Oh Nine. Literally.' :
    sPct >= 100 ? 'Oh Nein. Wait for reset.' :
    data.session.resetIn ? `Resets ${data.session.resetIn}` : '';

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
  weeklyReset.textContent = data.weekly.resetAt ? `Resets ${data.weekly.resetAt}` : '';

  // Sonnet
  sonnetFill.style.width      = `${nPct}%`;
  sonnetFill.style.background = fillColor(nPct);
  sonnetPct.textContent = `${nPct}%`;
  sonnetPct.className   = 'compact-pct ' + pctClass(nPct);
  sonnetReset.textContent = data.sonnet.resetAt ? `Resets ${data.sonnet.resetAt}` : '';

  if (data.lastUpdated) {
    lastUpdated.textContent = `last sync ${fmtTime(data.lastUpdated)}`;
  }
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
    console.error('handleRefresh failed:', e);
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
  intervalLabel.classList.toggle('oneoff-active', on);
}

function setActivePill(sec) {
  pills.forEach(p => p.classList.toggle('active', parseInt(p.dataset.sec) === sec));
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
const isMac = navigator.platform.toUpperCase().includes('MAC');
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
  if (version) { $('versionNum').textContent = version; $('aboutVersion').textContent = 'v' + version; }
  initPin();

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
}

init().catch(e => {
  console.error('init failed:', e);
  showLogin();
});
