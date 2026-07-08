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
const skinHead    = document.getElementById('skin-head');
const rememberMe  = document.getElementById('remember-me');
const progressBar = document.getElementById('progress-bar');
const statusText  = document.getElementById('status-text');
const authZone    = document.getElementById('auth-zone');

let isLoggedIn  = false;
let currentView = 'login'; // 'login' | 'register'
let siteApi = 'odalmc.fr';

function setSkinHead(username) {
  skinHead.src = `https://${siteApi}/api/skin_head.php?user=${encodeURIComponent(username)}&size=64&t=${Date.now()}`;
}

(async () => {
  siteApi = await window.launcher.getSiteApi();
  const saved = await window.launcher.loadCredentials();
  if (saved) {
    document.getElementById('input-username').value = saved.username;
    document.getElementById('input-password').value = saved.password;
    rememberMe.checked = true;
  }

  const maxRam = await window.launcher.getSystemMemoryGB();
  ramSlider.max = maxRam;
  const settings = await window.launcher.getSettings();
  ramSlider.value = Math.min(settings.ramGB, maxRam);
  ramValue.textContent = ramSlider.value;
  closeOnLaunch.checked = !!settings.closeOnLaunch;
})();

btnSettings.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
settingsClose.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
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
  document.getElementById('login-view').classList.toggle('hidden', view !== 'login');
  document.getElementById('register-view').classList.toggle('hidden', view !== 'register');
  btnJoin.textContent = view === 'register' ? '⚓ Créer mon compte' : '⚓ Rejoindre Odal';
  setStatus('En attente...');
}
window.switchAuth = switchAuth;

btnMin.addEventListener('click', () => window.launcher.minimize());
btnClose.addEventListener('click', () => window.launcher.close());

btnJoin.addEventListener('click', async () => {
  if (isLoggedIn) {
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

    usernameDisplay.textContent = result.username;
    setSkinHead(result.username);
    userInfo.style.display = 'flex';
    authZone.style.display = 'none';
    isLoggedIn = true;
    btnJoin.textContent = '⚓ Rejoindre Odal';

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
    } else {
      await window.launcher.clearCredentials();
    }

    usernameDisplay.textContent = result.username;
    setSkinHead(result.username);
    userInfo.style.display = 'flex';
    authZone.style.display = 'none';
    isLoggedIn = true;
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
  setStatus('En attente...');
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
