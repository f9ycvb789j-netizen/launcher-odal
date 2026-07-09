const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Sur Windows : remplacer java.exe par javaw.exe (sans fenêtre console)
const cp = require('child_process');
const _spawn = cp.spawn;
cp.spawn = function(cmd, args, opts) {
  if (process.platform === 'win32' && typeof cmd === 'string') {
    const lower = cmd.toLowerCase();
    if (lower.endsWith('java.exe')) {
      const javaw = cmd.slice(0, -8) + 'javaw.exe';
      if (fs.existsSync(javaw)) cmd = javaw;
    } else if (/[/\\]java$/.test(lower)) {
      const javaw = cmd + 'w.exe';
      if (fs.existsSync(javaw)) cmd = javaw;
    }
  }
  return _spawn.call(this, cmd, args, Object.assign({}, opts, {
    windowsHide: process.platform === 'win32'
  }));
};

const { Client, Authenticator } = require('minecraft-launcher-core');
const { execFile } = require('child_process');
const { status: mcStatus } = require('minecraft-server-util');

const SERVER_IP = 'odal.minesr.com';
const SERVER_PORT = 25565;
const FORGE_VERSION = '1.20.1-47.3.0';
const FORGE_DOWNLOAD_URL = `https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar`;
const SITE_API = 'odalmc.fr';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) OdalLauncher/1.1.6 Chrome/124.0.0.0 Safari/537.36';
const CURRENT_VERSION = app.getVersion();
const GAME_DIR = path.join(app.getPath('appData'), '.odal');

let mainWindow;
let currentUser = null;

// Reessaie le telechargement en cas d'echec transitoire (ex: rate-limit temporaire de l'hebergeur).
async function downloadWithRetries(url, dest, onProgress, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await download(url, dest, onProgress);
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
}

async function checkForUpdates() {
  try {
    const data = await httpsGet(`https://${SITE_API}/version.json`);
    const remote = JSON.parse(data);
    if (!remote.version || remote.version === CURRENT_VERSION) return;

    const url = process.platform === 'win32' ? remote.windows : remote.mac;
    mainWindow.webContents.send('update-status', { status: 'downloading', version: remote.version });

    if (process.platform === 'win32') {
      // Windows : télécharge + remplace + relance automatiquement
      const os = require('os');
      const tmpExe = path.join(os.tmpdir(), 'OdalLauncherUpdate.exe');
      await downloadWithRetries(url, tmpExe, (p) => {
        mainWindow.webContents.send('update-status', { status: 'progress', progress: Math.round(p * 100) });
      });

      const currentExe = process.execPath;
      const batPath = path.join(os.tmpdir(), 'odal_update.bat');
      const logPath = path.join(os.tmpdir(), 'odal_update_log.txt');
      // Reessaie la copie (le fichier peut etre encore verrouille juste apres la fermeture).
      // Important : pas de goto imbrique dans un bloc if(...) parenthese, c'est instable en batch
      // et peut faire planter le script instantanement sans rien faire.
      const batScript = [
        '@echo off',
        `set LOG="${logPath}"`,
        `set SRC="${tmpExe}"`,
        `set DST="${currentExe}"`,
        'echo Debut mise a jour > %LOG% 2>&1',
        'set tries=0',
        ':copyretry',
        'timeout /t 1 /nobreak > nul',
        'copy /y %SRC% %DST% >> %LOG% 2>&1',
        'if not errorlevel 1 goto copied',
        'set /a tries+=1',
        'echo tentative %tries% echouee >> %LOG%',
        'if %tries% lss 25 goto copyretry',
        'echo ECHEC apres 25 tentatives >> %LOG%',
        'goto end',
        ':copied',
        'echo Copie reussie, relance >> %LOG%',
        'start "" %DST%',
        'del %SRC% >nul 2>&1',
        ':end',
        'del "%~f0"',
        ''
      ].join('\r\n');
      fs.writeFileSync(batPath, batScript);

      cp.spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore' }).unref();
      app.quit();

    } else {
      // Mac : télécharge le DMG et l'ouvre (installation manuelle requise sans signing)
      const os = require('os');
      const tmpDmg = path.join(os.tmpdir(), `OdalLauncher-${remote.version}.dmg`);
      await downloadWithRetries(url, tmpDmg, (p) => {
        mainWindow.webContents.send('update-status', { status: 'progress', progress: Math.round(p * 100) });
      });
      mainWindow.webContents.send('update-status', { status: 'mac-ready', path: tmpDmg });
      shell.openPath(tmpDmg);
    }
  } catch(e) {
    console.error('Update error:', e);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message: 'Mise à jour indisponible pour le moment. Tu peux continuer à jouer avec la version actuelle.'
      });
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150,
    height: 650,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => { createWindow(); setTimeout(checkForUpdates, 2000); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('close', () => app.quit());
ipcMain.on('open-url', (e, url) => shell.openExternal(url));

ipcMain.handle('get-site-api', () => SITE_API);

ipcMain.handle('logout', () => {
  currentUser = null;
  return { success: true };
});

const GAME_FOLDERS = {
  resourcepacks: 'resourcepacks',
  shaderpacks: 'shaderpacks',
  screenshots: 'screenshots',
  crashreports: 'crash-reports'
};

ipcMain.handle('open-game-folder', (event, key) => {
  const sub = GAME_FOLDERS[key];
  if (!sub) return { success: false };
  const dir = path.join(GAME_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return { success: true };
});

ipcMain.handle('get-server-status', async () => {
  try {
    const result = await mcStatus(SERVER_IP, SERVER_PORT, { timeout: 5000 });
    return { online: true, players: result.players.online, max: result.players.max };
  } catch (err) {
    return { online: false };
  }
});

ipcMain.handle('get-news', async () => {
  try {
    const data = await httpsGet(`https://${SITE_API}/news.json`);
    const news = JSON.parse(data);
    return Array.isArray(news) ? news : [];
  } catch (err) {
    return [];
  }
});

// Stocke plusieurs comptes (chiffres) pour permettre de switcher sans retaper le mot de passe.
const ACCOUNTS_PATH = path.join(app.getPath('userData'), 'accounts.enc');
const OLD_CREDS_PATH = path.join(app.getPath('userData'), 'saved-account.enc');
const LAST_ACCOUNT_PATH = path.join(app.getPath('userData'), 'last-account.json');

function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_PATH) && safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(ACCOUNTS_PATH);
      return JSON.parse(safeStorage.decryptString(encrypted));
    }
    // Migration depuis l'ancien systeme mono-compte
    if (fs.existsSync(OLD_CREDS_PATH) && safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(OLD_CREDS_PATH);
      const old = JSON.parse(safeStorage.decryptString(encrypted));
      const migrated = [old];
      saveAccounts(migrated);
      fs.unlinkSync(OLD_CREDS_PATH);
      return migrated;
    }
  } catch (err) {}
  return [];
}

function saveAccounts(accounts) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.writeFileSync(ACCOUNTS_PATH, safeStorage.encryptString(JSON.stringify(accounts)));
  return true;
}

function setLastAccount(username) {
  try { fs.writeFileSync(LAST_ACCOUNT_PATH, JSON.stringify({ username })); } catch (err) {}
}

ipcMain.handle('get-accounts', () => loadAccounts().map((a) => ({ username: a.username })));

ipcMain.handle('get-last-account', () => {
  try { return JSON.parse(fs.readFileSync(LAST_ACCOUNT_PATH, 'utf8')); } catch (err) { return null; }
});

ipcMain.handle('save-credentials', (event, username, password) => {
  try {
    const accounts = loadAccounts().filter((a) => a.username.toLowerCase() !== username.toLowerCase());
    accounts.push({ username, password });
    saveAccounts(accounts);
    setLastAccount(username);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
});

ipcMain.handle('remove-account', (event, username) => {
  try {
    const accounts = loadAccounts().filter((a) => a.username.toLowerCase() !== username.toLowerCase());
    saveAccounts(accounts);
    const last = fs.existsSync(LAST_ACCOUNT_PATH) ? JSON.parse(fs.readFileSync(LAST_ACCOUNT_PATH, 'utf8')) : null;
    if (last && last.username.toLowerCase() === username.toLowerCase()) fs.unlinkSync(LAST_ACCOUNT_PATH);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
});

ipcMain.handle('login-with-saved-account', async (event, username) => {
  const account = loadAccounts().find((a) => a.username.toLowerCase() === username.toLowerCase());
  if (!account) return { success: false, error: 'Compte introuvable' };
  try {
    const result = await httpsPost(`https://${SITE_API}/api/launcher_auth.php`, { username: account.username, password: account.password });
    if (result.error) return { success: false, error: result.error };
    currentUser = { username: result.username };
    setLastAccount(result.username);
    return { success: true, username: result.username, grade: result.grade };
  } catch (err) {
    return { success: false, error: 'Impossible de contacter le serveur Odal' };
  }
});

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = { ramGB: 4, closeOnLaunch: false };

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return Object.assign({}, DEFAULT_SETTINGS, saved);
  } catch (err) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const merged = Object.assign({}, loadSettings(), settings);
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged));
    return { success: true };
  } catch (err) {
    return { success: false };
  }
});

ipcMain.handle('get-system-memory-gb', () => {
  return Math.max(2, Math.floor(require('os').totalmem() / (1024 ** 3)));
});

// launcher_auth.php verifie les identifiants ET cree la session dans odal_sessions
// que le serveur Minecraft controle via validate_session.php avant d'accepter la connexion.
ipcMain.handle('login-site', async (event, username, password) => {
  try {
    const result = await httpsPost(`https://${SITE_API}/api/launcher_auth.php`, { username, password });
    if (result.error) return { success: false, error: result.error };
    currentUser = { username: result.username };
    return { success: true, username: result.username, grade: result.grade };
  } catch (err) {
    return { success: false, error: 'Impossible de contacter le serveur Odal' };
  }
});

ipcMain.handle('register-site', async (event, mc_username, email, password) => {
  try {
    const result = await httpsPost(`https://${SITE_API}/api/register.php`, { mc_username, email, password });
    if (result.error) return { success: false, error: result.error };

    const session = await httpsPost(`https://${SITE_API}/api/launcher_auth.php`, { username: mc_username, password });
    if (session.error) return { success: false, error: 'Compte créé, mais session de jeu impossible : ' + session.error };

    currentUser = { username: result.mc_username };
    return { success: true, username: result.mc_username, grade: session.grade };
  } catch (err) {
    return { success: false, error: 'Impossible de contacter le serveur Odal' };
  }
});

ipcMain.handle('launch', async (event) => {
  const modsDir = path.join(GAME_DIR, 'mods');
  const FORGE_JAR = path.join(app.getPath('userData'), 'forge-installer.jar');
  const forgeVersionDir = path.join(GAME_DIR, 'versions', `1.20.1-forge-${FORGE_VERSION}`);
  const forgeInstalled = fs.existsSync(forgeVersionDir);

  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

  send(event, 'status', 'Vérification de Forge...');
  send(event, 'progress', 5);

  if (!forgeInstalled) {
    if (!fs.existsSync(FORGE_JAR)) {
      send(event, 'status', 'Téléchargement de Forge...');
      await download(FORGE_DOWNLOAD_URL, FORGE_JAR, (p) => {
        send(event, 'progress', Math.round(p * 40));
      });
    }
  } else {
    send(event, 'progress', 40);
  }

  send(event, 'status', 'Vérification de Java 17...');
  const javaPath = await ensureJava17(GAME_DIR, event);

  send(event, 'status', 'Vérification des mods...');
  send(event, 'progress', 45);
  await syncMods(modsDir, event);

  writeServersDat(GAME_DIR);

  send(event, 'status', 'Lancement du jeu...');
  send(event, 'progress', 60);

  const launcher = new Client();

  launcher.on('progress', (e) => {
    const p = 60 + Math.round((e.task / e.total) * 35);
    send(event, 'progress', p);
    send(event, 'status', `Téléchargement : ${e.type}`);
  });

  launcher.on('close', () => {
    send(event, 'status', 'Le jeu est fermé.');
    send(event, 'progress', 0);
    send(event, 'game-closed');
  });

  launcher.on('data', (data) => {
    console.log(data);
  });

  const auth = currentUser ? Authenticator.getAuth(currentUser.username) : Authenticator.getAuth('Joueur');
  const settings = loadSettings();

  await launcher.launch({
    authorization: auth,
    root: GAME_DIR,
    version: {
      number: '1.20.1',
      type: 'release'
    },
    javaPath,
    forge: forgeInstalled ? undefined : FORGE_JAR,
    memory: { max: `${settings.ramGB}G`, min: '1G' }
  });

  send(event, 'progress', 100);
  send(event, 'status', 'Jeu lancé !');

  if (settings.closeOnLaunch) app.quit();
});

function findJavaw(gameDir) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const exe = isWin ? 'javaw.exe' : 'java';

  // 1. JRE bundlé par Minecraft
  const runtimeDir = path.join(gameDir, 'runtime');
  if (fs.existsSync(runtimeDir)) {
    const osDir = isWin ? 'windows-x64' : (process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os');
    for (const name of fs.readdirSync(runtimeDir)) {
      const p = path.join(runtimeDir, name, osDir, name, 'bin', exe);
      if (fs.existsSync(p)) return p;
    }
  }
  // 2. JAVA_HOME
  if (process.env.JAVA_HOME) {
    const p = path.join(process.env.JAVA_HOME, 'bin', exe);
    if (fs.existsSync(p)) return p;
  }
  // 3. Emplacements courants
  const candidates = isWin ? [
    'C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.11.0+9\\bin\\javaw.exe',
    'C:\\Program Files\\Microsoft\\jdk-17.0.11.9-hotspot\\bin\\javaw.exe',
  ] : isMac ? [
    '/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home/bin/java',
    '/usr/local/opt/openjdk@17/bin/java',
    '/opt/homebrew/opt/openjdk@17/bin/java',
  ] : [];
  const found = candidates.find(p => fs.existsSync(p));
  return found || undefined;
}

function checkJavaWorks(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], (error) => resolve(!error));
  });
}

function findFileRecursive(dir, filename) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
  }
  return null;
}

// Telecharge et installe un Java 17 (Eclipse Temurin) portable si le joueur n'en a pas deja un qui fonctionne.
async function ensureJava17(gameDir, event) {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'javaw.exe' : 'java';

  const existing = findJavaw(gameDir);
  if (existing && await checkJavaWorks(existing)) return existing;

  const runtimeDir = path.join(gameDir, 'runtime', 'temurin17');
  let found = findFileRecursive(runtimeDir, exeName);
  if (found && await checkJavaWorks(found)) return found;

  send(event, 'status', 'Téléchargement de Java 17...');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const osName = isWin ? 'windows' : 'mac';
  const archiveUrl = `https://api.adoptium.net/v3/binary/latest/17/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`;
  const archivePath = path.join(app.getPath('temp'), isWin ? 'odal-temurin17.zip' : 'odal-temurin17.tar.gz');

  await download(archiveUrl, archivePath, (p) => {
    send(event, 'progress', 40 + Math.round(p * 5));
  });

  send(event, 'status', 'Installation de Java 17...');
  if (isWin) {
    const extractZip = require('extract-zip');
    await extractZip(archivePath, { dir: runtimeDir });
  } else {
    const tar = require('tar');
    await tar.x({ file: archivePath, cwd: runtimeDir });
  }
  fs.unlinkSync(archivePath);

  found = findFileRecursive(runtimeDir, exeName);
  if (!found || !(await checkJavaWorks(found))) {
    throw new Error("Impossible d'installer Java 17 automatiquement");
  }
  return found;
}

function writeServersDat(gameDir) {
  const dest = path.join(gameDir, 'servers.dat');
  const host = Buffer.from(SERVER_IP, 'utf8');
  const sname = Buffer.from('Odal', 'utf8');
  const buf = Buffer.alloc(512);
  let o = 0;
  const str = (name, val) => {
    const nb = Buffer.from(name, 'utf8');
    const vb = Buffer.from(val, 'utf8');
    buf[o++] = 8;
    buf.writeUInt16BE(nb.length, o); o += 2;
    nb.copy(buf, o); o += nb.length;
    buf.writeUInt16BE(vb.length, o); o += 2;
    vb.copy(buf, o); o += vb.length;
  };
  buf[o++] = 10; buf.writeUInt16BE(0, o); o += 2;
  buf[o++] = 9;
  const listName = Buffer.from('servers', 'utf8');
  buf.writeUInt16BE(listName.length, o); o += 2;
  listName.copy(buf, o); o += listName.length;
  buf[o++] = 10;
  buf.writeInt32BE(1, o); o += 4;
  str('ip', SERVER_IP);
  str('name', 'Odal');
  buf[o++] = 0;
  buf[o++] = 0;
  fs.writeFileSync(dest, buf.slice(0, o));
}

async function syncMods(modsDir, event) {
  const manifest = path.join(__dirname, 'mods-manifest.json');
  if (!fs.existsSync(manifest)) return;

  const localPackDir = path.join(__dirname, 'mods-pack');
  const mods = JSON.parse(fs.readFileSync(manifest, 'utf8'));

  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i];
    const dest = path.join(modsDir, mod.name);

    if (fs.existsSync(dest)) {
      send(event, 'progress', 45 + Math.round(((i + 1) / mods.length) * 15));
      continue;
    }

    const localSrc = path.join(localPackDir, mod.name);
    if (fs.existsSync(localSrc)) {
      send(event, 'status', `Copie : ${mod.name}`);
      fs.copyFileSync(localSrc, dest);
    } else if (mod.url && mod.url !== 'URL_A_REMPLIR') {
      send(event, 'status', `Téléchargement : ${mod.name}`);
      await download(mod.url, dest);
    } else {
      send(event, 'status', `Mod manquant : ${mod.name}`);
    }

    send(event, 'progress', 45 + Math.round(((i + 1) / mods.length) * 15));
  }
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirectsLeft) => {
      const mod = u.startsWith('https') ? https : require('http');
      const req = mod.get(u, { timeout: 30000, headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Trop de redirections'));
          return follow(res.headers.location, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Téléchargement échoué (HTTP ${res.statusCode})`));
        }
        const total = parseInt(res.headers['content-length'] || '0');
        let received = 0;
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress && total) onProgress(received / total);
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('Le serveur ne répond pas (timeout)')));
      req.on('error', reject);
    };
    follow(url, 5);
  });
}

function send(event, channel, data) {
  if (event && event.sender && !event.sender.isDestroyed()) {
    event.sender.send(channel, data);
  }
}

function httpsGetOnce(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(raw));
    });
    req.on('timeout', () => req.destroy(new Error('Le serveur ne répond pas (timeout)')));
    req.on('error', reject);
  });
}

async function httpsGet(url, retries = 1, timeoutMs = 10000) {
  try {
    return await httpsGetOnce(url, timeoutMs);
  } catch (err) {
    if (retries > 0) return httpsGet(url, retries - 1, timeoutMs);
    throw err;
  }
}

function httpsPostOnce(url, data, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': USER_AGENT }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Réponse invalide')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Le serveur ne répond pas (timeout)')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// TigerProtect (pare-feu o2switch) bloque toute 2e requete arrivant trop vite apres la
// premiere : on impose donc un espacement minimum entre deux POST, quel que soit l'appelant.
let lastPostAt = 0;
const MIN_POST_INTERVAL_MS = 2000;

async function httpsPost(url, data, retries = 2, timeoutMs = 10000) {
  const wait = lastPostAt + MIN_POST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastPostAt = Date.now();
  try {
    return await httpsPostOnce(url, data, timeoutMs);
  } catch (err) {
    if (retries > 0) return httpsPost(url, data, retries - 1, timeoutMs);
    throw err;
  }
}
