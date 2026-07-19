const btnMin    = document.getElementById('btn-min');
const btnClose  = document.getElementById('btn-close');
const btnSettings   = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const ramSlider = document.getElementById('ram-slider');
const ramValue  = document.getElementById('ram-value');
const closeOnLaunch = document.getElementById('close-on-launch');
const btnJoin   = document.getElementById('btn-join');
const userInfo  = document.getElementById('user-info');
const usernameDisplay = document.getElementById('username-display');
const rememberMe  = document.getElementById('remember-me');
const progressBar = document.getElementById('progress-bar');
const statusText  = document.getElementById('status-text');
const authZone    = document.getElementById('auth-zone');

let isLoggedIn  = false;
let currentView = 'login'; // 'login' | 'register'
let showAddAccountForm = true; // affiche le formulaire manuel (connexion/inscription)
let siteApi = 'odalmc.fr';
let savedAccounts = [];
let skinViewer = null;

function initSkinViewer() {
  const canvas = document.getElementById('skin-viewer-3d');
  skinViewer = new skinview3d.SkinViewer({ canvas, width: 190, height: 300 });
  skinViewer.autoRotate = true;
  skinViewer.autoRotateSpeed = 0.6;
  skinViewer.zoom = 0.9;
  skinViewer.controls.enableZoom = false;
}

function setSkinHead(username) {
  if (!skinViewer) return;
  skinViewer.loadSkin(`https://${siteApi}/api/skin_full.php?user=${encodeURIComponent(username)}&t=${Date.now()}`).catch(() => {});
}

function onLoginSuccess(username, grade) {
  usernameDisplay.textContent = username;
  document.getElementById('grade-display').textContent = grade || 'Membre';
  setSkinHead(username);
  isLoggedIn = true;
  showAddAccountForm = false;
  btnJoin.disabled = false;
  refreshAccountsUI();
  updateAuthView();
}

function closeAccountDropdown() {
  document.getElementById('account-dropdown-menu').classList.add('hidden');
  document.getElementById('account-dropdown-trigger').classList.remove('open');
}

function updateAccountDropdownLabel() {
  const label = document.getElementById('account-dropdown-label');
  label.textContent = (isLoggedIn && usernameDisplay.textContent) ? usernameDisplay.textContent : 'Choisir un compte';
}

function renderAccountList(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!savedAccounts.length) { el.innerHTML = ''; return; }
  el.innerHTML = savedAccounts.map((a) => `
    <div class="account-row${isLoggedIn && a.username === usernameDisplay.textContent ? ' active' : ''}" data-username="${escapeHtml(a.username)}">
      <img class="account-row-avatar" src="https://${siteApi}/api/skin_head.php?user=${encodeURIComponent(a.username)}&size=32&t=${Date.now()}" alt="">
      <span class="account-row-name">${escapeHtml(a.username)}</span>
      <button class="account-row-remove" data-username="${escapeHtml(a.username)}" title="Oublier ce compte">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('.account-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.account-row-remove')) return;
      loginWithAccount(row.dataset.username);
    });
  });
  el.querySelectorAll('.account-row-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.launcher.removeAccount(btn.dataset.username);
      await refreshAccountsUI();
    });
  });
}

async function refreshAccountsUI() {
  savedAccounts = await window.launcher.getAccounts();
  renderAccountList('account-picker-list');
  renderAccountList('settings-account-list');
  updateAccountDropdownLabel();
  updateAuthView();
}

let accountSwitchBusy = false;

async function loginWithAccount(username) {
  if (accountSwitchBusy) return;
  accountSwitchBusy = true;
  closeAccountDropdown();
  btnJoin.disabled = true;
  setStatus('Connexion...');
  setProgress(0);
  try {
    const result = await window.launcher.loginWithSavedAccount(username);
    if (!result.success) {
      setStatus(result.error || 'Erreur de connexion');
      return;
    }
    onLoginSuccess(result.username, result.grade);
    setStatus('');
  } finally {
    btnJoin.disabled = false;
    accountSwitchBusy = false;
  }
}

function updateAuthView() {
  const hasAccounts = savedAccounts.length > 0;
  const showForm = !isLoggedIn || showAddAccountForm;
  const showLogin = showForm && currentView === 'login';
  const showRegister = showForm && currentView === 'register';

  document.getElementById('account-picker').classList.toggle('hidden', !hasAccounts);
  document.getElementById('btn-show-manual').classList.toggle('hidden', !hasAccounts || showForm);
  document.querySelector('#btn-show-manual button').textContent = isLoggedIn ? '+ Ajouter un compte' : '+ Utiliser un autre compte';

  authZone.style.display = showForm ? 'flex' : 'none';
  document.getElementById('login-view').classList.toggle('hidden', !showLogin);
  document.getElementById('register-view').classList.toggle('hidden', !showRegister);

  userInfo.style.display = (isLoggedIn && !showAddAccountForm) ? 'flex' : 'none';

  btnJoin.textContent = showRegister ? 'Créer mon compte' : 'Rejoindre Odal';
  setStatus('');
}

function openAddAccountForm() {
  closeAccountDropdown();
  showAddAccountForm = true;
  currentView = 'login';
  settingsOverlay.classList.add('hidden');
  updateAuthView();
}
window.openAddAccountForm = openAddAccountForm;

const accountDropdownTrigger = document.getElementById('account-dropdown-trigger');
const accountDropdownMenu = document.getElementById('account-dropdown-menu');
accountDropdownTrigger.addEventListener('click', () => {
  const isOpen = !accountDropdownMenu.classList.contains('hidden');
  accountDropdownMenu.classList.toggle('hidden', isOpen);
  accountDropdownTrigger.classList.toggle('open', !isOpen);
});
document.addEventListener('click', (e) => {
  if (!document.getElementById('account-picker').contains(e.target)) closeAccountDropdown();
});

(async () => {
  initSkinViewer();
  siteApi = await window.launcher.getSiteApi();
  await refreshAccountsUI();

  showAddAccountForm = savedAccounts.length === 0;
  currentView = 'login';
  updateAuthView();

  const last = await window.launcher.getLastAccount();
  if (last && savedAccounts.some((a) => a.username === last.username)) {
    setStatus('Connexion automatique...');
    const result = await window.launcher.loginWithSavedAccount(last.username);
    if (result.success) {
      onLoginSuccess(result.username, result.grade);
    } else {
      updateAuthView();
    }
  }

  const maxRam = await window.launcher.getSystemMemoryGB();
  ramSlider.max = maxRam;
  const settings = await window.launcher.getSettings();
  ramSlider.value = Math.min(settings.ramGB, maxRam);
  ramValue.textContent = ramSlider.value;
  closeOnLaunch.checked = !!settings.closeOnLaunch;
})();

function openSettings(tab) {
  settingsOverlay.classList.remove('hidden');
  document.querySelectorAll('.settings-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.settings-tab-content').forEach((c) => c.classList.toggle('hidden', c.id !== `tab-${tab}`));
  if (tab === 'account') {
    document.getElementById('settings-username').textContent = usernameDisplay.textContent || 'Non connecté';
  }
  if (tab === 'skin') {
    const skinImg = document.getElementById('settings-skin');
    const skinEmpty = document.getElementById('skin-tab-empty');
    const btnChangeSkin = document.getElementById('btn-change-skin');
    const uploadStatus = document.getElementById('skin-upload-status');
    uploadStatus.style.display = 'none';
    if (usernameDisplay.textContent) {
      skinEmpty.style.display = 'none';
      skinImg.style.display = '';
      skinImg.src = `https://${siteApi}/api/skin_head.php?user=${encodeURIComponent(usernameDisplay.textContent)}&size=128&t=${Date.now()}`;
      btnChangeSkin.style.display = '';
    } else {
      skinEmpty.style.display = '';
      skinImg.style.display = 'none';
      btnChangeSkin.style.display = 'none';
    }
  }
}

document.getElementById('btn-change-skin').addEventListener('click', async () => {
  const uploadStatus = document.getElementById('skin-upload-status');
  const filePath = await window.launcher.pickSkinFile();
  if (!filePath) return;

  uploadStatus.style.display = '';
  uploadStatus.style.color = 'rgba(232,213,176,0.6)';
  uploadStatus.textContent = 'Envoi en cours...';

  const result = await window.launcher.uploadSkin(filePath);
  if (result.success) {
    uploadStatus.style.color = '#4ade80';
    uploadStatus.textContent = 'Skin mis à jour !';
    const username = usernameDisplay.textContent;
    document.getElementById('settings-skin').src = `https://${siteApi}/api/skin_head.php?user=${encodeURIComponent(username)}&size=128&t=${Date.now()}`;
    setSkinHead(username);
  } else {
    uploadStatus.style.color = '#e07a7a';
    uploadStatus.textContent = result.error || "Erreur lors de l'envoi du skin";
  }
});

document.querySelectorAll('.settings-tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => openSettings(tabBtn.dataset.tab));
});

btnSettings.addEventListener('click', () => openSettings('params'));
userInfo.addEventListener('click', () => openSettings('account'));
settingsClose.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

document.querySelectorAll('[data-folder]').forEach((btn) => {
  btn.addEventListener('click', () => window.launcher.openGameFolder(btn.dataset.folder));
});

document.getElementById('btn-add-account').addEventListener('click', () => {
  openAddAccountForm();
});

ramSlider.addEventListener('input', () => {
  ramValue.textContent = ramSlider.value;
});
ramSlider.addEventListener('change', () => {
  window.launcher.saveSettings({ ramGB: Number(ramSlider.value) });
});
closeOnLaunch.addEventListener('change', () => {
  window.launcher.saveSettings({ closeOnLaunch: closeOnLaunch.checked });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

async function loadNews() {
  const newsList = document.getElementById('news-list');
  const news = await window.launcher.getNews();
  if (!news.length) {
    newsList.innerHTML = '<div class="news-empty">Aucune actualité pour le moment</div>';
    return;
  }
  newsList.innerHTML = news.map((n) => `
    <div class="news-card">
      <div class="news-date">${escapeHtml(n.date)}</div>
      <div class="news-title">${escapeHtml(n.title)}</div>
      <div class="news-excerpt">${escapeHtml(n.excerpt)}</div>
    </div>
  `).join('');
}
loadNews();

async function refreshServerStatus() {
  const dot  = document.getElementById('server-status-dot');
  const text = document.getElementById('server-status-text');
  const status = await window.launcher.getServerStatus();
  if (status.online) {
    dot.className = 'online';
    text.textContent = `${status.players} / ${status.max} joueurs en ligne`;
  } else {
    dot.className = 'offline';
    text.textContent = 'Serveur hors ligne';
  }
}
refreshServerStatus();
setInterval(refreshServerStatus, 30000);

const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.4 18.4 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

document.querySelectorAll('.toggle-pw').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.classList.toggle('active', isHidden);
    btn.innerHTML = isHidden ? EYE_OFF : EYE_OPEN;
  });
});

function switchAuth(view) {
  currentView = view;
  showAddAccountForm = true;
  updateAuthView();
}
window.switchAuth = switchAuth;

btnMin.addEventListener('click', () => window.launcher.minimize());
btnClose.addEventListener('click', () => window.launcher.close());

btnJoin.addEventListener('click', async () => {
  if (isLoggedIn && !showAddAccountForm) {
    btnJoin.disabled = true;
    setStatus('Démarrage...');
    await window.launcher.launch();
    return;
  }

  if (currentView === 'register') {
    const mc_username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;

    if (!mc_username || !email || !password || !confirm) { setStatus('Remplis tous les champs'); return; }
    if (password !== confirm) { setStatus('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 6)  { setStatus('Mot de passe : 6 caractères minimum'); return; }

    btnJoin.disabled = true;
    setStatus('Création du compte...');
    setProgress(0);

    const result = await window.launcher.registerSite(mc_username, email, password);
    if (!result.success) {
      setStatus(result.error || 'Erreur inscription');
      btnJoin.disabled = false;
      return;
    }

    await window.launcher.saveCredentials(mc_username, password);
    onLoginSuccess(result.username, result.grade);

  } else {
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value;

    if (!username || !password) { setStatus('Remplis tous les champs'); return; }

    btnJoin.disabled = true;
    setStatus('Connexion...');
    setProgress(0);

    const result = await window.launcher.loginSite(username, password);
    if (!result.success) {
      setStatus(result.error || 'Erreur de connexion');
      btnJoin.disabled = false;
      return;
    }

    if (rememberMe.checked) {
      await window.launcher.saveCredentials(username, password);
    }

    onLoginSuccess(result.username, result.grade);
  }

  btnJoin.disabled = true;
  setStatus('Démarrage...');
  await window.launcher.launch();
});

// Entrée clavier
document.getElementById('input-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('input-password').focus();
});
document.getElementById('input-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});
document.getElementById('reg-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('reg-email').focus();
});
document.getElementById('reg-email').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('reg-password').focus();
});
document.getElementById('reg-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('reg-confirm').focus();
});
document.getElementById('reg-confirm').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

window.launcher.on('update-status', ({ status, version, progress, path: dmgPath, message }) => {
  const banner = document.getElementById('update-banner');
  const text   = document.getElementById('update-text');
  banner.style.display = 'flex';
  document.getElementById('update-btn').style.display = 'none';

  if (status === 'downloading') {
    text.textContent = `Mise à jour v${version} en cours de téléchargement...`;
  } else if (status === 'progress') {
    text.textContent = `Mise à jour : ${progress}%`;
  } else if (status === 'mac-ready') {
    text.textContent = 'Mise à jour téléchargée — installe le DMG qui vient de s\'ouvrir, puis relance.';
  } else if (status === 'error') {
    text.textContent = message || 'Mise à jour indisponible pour le moment.';
    setTimeout(() => { banner.style.display = 'none'; }, 6000);
  }
});

window.launcher.on('progress', (val) => setProgress(val));
window.launcher.on('status',   (msg) => setStatus(msg));
window.launcher.on('game-closed', () => {
  btnJoin.disabled = false;
  setStatus('');
  setProgress(0);
});

function setProgress(val) {
  progressBar.style.width = Math.min(100, val) + '%';
}
function setStatus(msg) {
  statusText.textContent = msg;
}

// Particules de fond
(function spawnParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 2;
    p.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${Math.random() * 100}%;
      animation-duration: ${Math.random() * 12 + 8}s;
      animation-delay: ${Math.random() * 10}s;
    `;
    container.appendChild(p);
  }
})();
