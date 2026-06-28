const btnMin    = document.getElementById('btn-min');
const btnClose  = document.getElementById('btn-close');
const btnJoin   = document.getElementById('btn-join');
const userInfo  = document.getElementById('user-info');
const usernameDisplay = document.getElementById('username-display');
const progressBar = document.getElementById('progress-bar');
const statusText  = document.getElementById('status-text');

let isLoggedIn = false;

btnMin.addEventListener('click', () => window.launcher.minimize());
btnClose.addEventListener('click', () => window.launcher.close());

btnJoin.addEventListener('click', async () => {
  btnJoin.disabled = true;

  if (!isLoggedIn) {
    setStatus('Connexion Microsoft...');
    setProgress(0);
    const result = await window.launcher.loginMicrosoft();
    if (!result.success) {
      setStatus('Erreur de connexion : ' + result.error);
      btnJoin.disabled = false;
      return;
    }
    usernameDisplay.textContent = result.username;
    userInfo.style.display = 'block';
    isLoggedIn = true;
  }

  setStatus('Démarrage...');
  await window.launcher.launch();
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
