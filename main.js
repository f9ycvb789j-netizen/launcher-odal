const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { isNewerVersion } = require('./updater-utils');
const { getPlatformMods } = require('./mod-platform');
const { ensureDistantHorizonsDefault } = require('./distant-horizons-config');
const { ensureShoulderSurfingDefault } = require('./shoulder-surfing-config');
const { ensureCustomSkinLoaderConfig } = require('./custom-skin-loader-config');
const { ensureBundledResourcePacks } = require('./resource-packs');

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

// Launcher OdalPaper : serveur Paper 1.21.11 + client Fabric (mods d'interface seulement).
// Copie independante du launcher Forge 1.20.1 (launcher-odal-propre), qui reste intouche.
// Fabric plutot que NeoForge : c'est le seul loader ou Distant Horizons accepte Iris
// (shaders + horizon lointain ensemble), et ou Bobby/Litematica existent en 1.21.11.
const SERVER_IP = '7022.mystrator.com';
const SERVER_PORT = 27424;
const SERVER_LABEL = 'Odal Paper';
const MINECRAFT_VERSION = '1.21.11';
const FABRIC_LOADER_VERSION = '0.19.5';
const FABRIC_PROFILE_URL = `https://meta.fabricmc.net/v2/versions/loader/${MINECRAFT_VERSION}/${FABRIC_LOADER_VERSION}/profile/json`;
const SITE_API = 'odalmc.fr';
// Fichier de mise a jour distinct : version.json est celui du launcher Forge.
// Bascule du 04/09/2026 : ce launcher EST la mise a jour 2.0.0 du launcher Odal
// (meme appId, meme productName) — il lit donc le manifest officiel version.json.
const UPDATE_MANIFEST = 'version.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) OdalPaperLauncher/0.1.0 Chrome/124.0.0.0 Safari/537.36';
const CURRENT_VERSION = app.getVersion();
const IS_LOCAL_DEVELOPMENT = !app.isPackaged;
const GAME_DIR = path.join(app.getPath('appData'), '.odalpaper');
// Mods maison obligatoires, epingles par SHA-256 : le launcher refuse de lancer si le
// jar embarque ne correspond pas. Vide tant qu'IslandFactionsGUI et OdalCompanion n'ont
// pas de build NeoForge 1.21.4 ; ajouter { name, sha256 } des qu'ils existent.
const REQUIRED_MODS = [
  // 2.2.x = builds Fabric (les 2.1.0/1.0.0 etaient les builds NeoForge, conserves dans paper/mods-neoforge).
  { name: 'islandfactionsgui-2.2.1.jar', sha256: 'd30c817e830073d6f7d5344dd003e16a790f1ee25476a9e3cc2598e53702a35a' },
  // Compagnons d'Odal 2.0.0 : menu compagnon et cosmetiques (plugin Paper OdalCompanion en face).
  { name: 'odalcompanion-2.0.2.jar', sha256: '63295251e2fc60351f8f76d38c1d7b539dc9cf6b03093d7d8fafb9397cb9d212' },
];
const LAUNCHER_LOG_DIR = path.join(GAME_DIR, 'logs');
const LAUNCHER_LOG_FILE = path.join(LAUNCHER_LOG_DIR, 'odal-launcher.log');

function logToFile(scope, value) {
  try {
    fs.mkdirSync(LAUNCHER_LOG_DIR, { recursive: true });
    const message = value instanceof Error ? (value.stack || value.message) : String(value);
    fs.appendFile(
      LAUNCHER_LOG_FILE,
      `[${new Date().toISOString()}] [${scope}] ${message}${message.endsWith('\n') ? '' : '\n'}`,
      () => {}
    );
  } catch (_) {
    // La journalisation ne doit jamais interrompre le launcher.
  }
}

logToFile('BOOT_SOURCE', `dirname=${__dirname}; packaged=${app.isPackaged}; version=${CURRENT_VERSION}`);

// Electron peut etre lance sans console. Ignorer un tube stdout/stderr ferme
// evite qu'un simple message de diagnostic fasse planter le processus principal.
for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.on === 'function') {
    stream.on('error', (error) => {
      if (!error || error.code !== 'EPIPE') logToFile('STREAM', error);
    });
  }
}

let mainWindow;
let currentUser = null;
let updateGateOpen = true;
let updateCheckInProgress = false;

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
  if (updateCheckInProgress) return;
  updateCheckInProgress = true;
  updateGateOpen = true;
  mainWindow.webContents.send('update-status', { status: 'checking' });

  // A local development launch must keep the files from this workspace.
  // Installing the public launcher over Electron's development executable
  // silently restored the older bundled companion before Minecraft started.
  if (IS_LOCAL_DEVELOPMENT) {
    updateGateOpen = false;
    updateCheckInProgress = false;
    mainWindow.webContents.send('update-status', {
      status: 'up-to-date',
      version: `${CURRENT_VERSION} local`
    });
    return;
  }

  try {
    const data = await httpsGet(`https://${SITE_API}/${UPDATE_MANIFEST}`);
    const remote = JSON.parse(data);
    if (!remote.version || !isNewerVersion(remote.version, CURRENT_VERSION)) {
      updateGateOpen = false;
      mainWindow.webContents.send('update-status', { status: 'up-to-date', version: CURRENT_VERSION });
      return;
    }

    const url = process.platform === 'win32' ? remote.windows : remote.mac;
    if (!url) throw new Error('Lien de mise a jour manquant');
    mainWindow.webContents.send('update-status', { status: 'downloading', version: remote.version });

    if (process.platform === 'win32') {
      // Windows : télécharge + remplace + relance automatiquement
      const os = require('os');
      const tmpExe = path.join(os.tmpdir(), 'OdalPaperLauncherUpdate.exe');
      await downloadWithRetries(url, tmpExe, (p) => {
        mainWindow.webContents.send('update-status', { status: 'progress', progress: Math.round(p * 100) });
      });

      const currentExe = process.execPath;
      const installDir = path.dirname(currentExe);
      const batPath = path.join(os.tmpdir(), 'odalpaper_update.bat');
      const logPath = path.join(os.tmpdir(), 'odalpaper_update_log.txt');
      // version.json pointe vers l'installeur NSIS complet, pas un simple exe autonome :
      // il faut l'executer silencieusement (/S) en ciblant le meme dossier (/D=...) pour
      // mettre a jour l'installation existante, plutot que de copier le fichier par-dessus
      // (ce qui lancait l'assistant d'installation lui-meme et pouvait creer une 2e install).
      // Important : pas de goto imbrique dans un bloc if(...) parenthese, c'est instable en batch
      // et peut faire planter le script instantanement sans rien faire.
      const batScript = [
        '@echo off',
        `set LOG="${logPath}"`,
        `set INSTALLER="${tmpExe}"`,
        `set DST="${currentExe}"`,
        'echo Debut mise a jour > %LOG% 2>&1',
        'set tries=0',
        ':installretry',
        'timeout /t 1 /nobreak > nul',
        `%INSTALLER% /S /D=${installDir} >> %LOG% 2>&1`,
        'if not errorlevel 1 goto installed',
        'set /a tries+=1',
        'echo tentative %tries% echouee >> %LOG%',
        'if %tries% lss 25 goto installretry',
        'echo ECHEC apres 25 tentatives >> %LOG%',
        'goto end',
        ':installed',
        'echo Installation reussie, relance >> %LOG%',
        'timeout /t 1 /nobreak > nul',
        'start "" %DST%',
        'del %INSTALLER% >nul 2>&1',
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
      const tmpDmg = path.join(os.tmpdir(), `OdalPaperLauncher-${remote.version}.dmg`);
      await downloadWithRetries(url, tmpDmg, (p) => {
        mainWindow.webContents.send('update-status', { status: 'progress', progress: Math.round(p * 100) });
      });
      mainWindow.webContents.send('update-status', { status: 'mac-ready', path: tmpDmg });
      shell.openPath(tmpDmg);
    }
  } catch(e) {
    logToFile('UPDATE', e);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message: 'Impossible de vérifier la mise à jour. Réessaie pour accéder au launcher.'
      });
    }
  } finally {
    updateCheckInProgress = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1366,
    minHeight: 768,
    frame: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.once('did-finish-load', checkForUpdates);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('close', () => app.quit());
ipcMain.on('open-url', (e, url) => shell.openExternal(url));

ipcMain.handle('get-site-api', () => SITE_API);
ipcMain.handle('retry-update', async () => {
  await checkForUpdates();
  return { success: !updateGateOpen };
});

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

ipcMain.handle('pick-skin-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir un skin (PNG 64x64)',
    filters: [{ name: 'Images PNG', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Upload direct vers le site : upload_skin.php sauvegarde le PNG (servi ensuite par
// skin_full.php/skin_head.php), genere la texture signee via MineSkin et met a jour
// SkinsRestorer, donc le skin est aussi applique en jeu sans etape supplementaire.
ipcMain.handle('upload-skin', async (event, filePath) => {
  if (!currentUser) return { success: false, error: 'Non connecté' };
  try {
    const result = await httpsPostMultipart(`https://${SITE_API}/api/upload_skin.php`, { user: currentUser.username }, filePath, 'skin');
    if (result.error) return { success: false, error: result.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Impossible de contacter le serveur Odal' };
  }
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
  if (updateGateOpen) {
    return {
      success: false,
      error: 'La vérification de mise à jour doit se terminer avant de jouer.'
    };
  }

  const modsDir = path.join(GAME_DIR, 'mods');
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

  send(event, 'status', 'Vérification de Fabric...');
  send(event, 'progress', 5);

  send(event, 'status', 'Vérification de Java 21...');
  const javaPath = await ensureJava21(GAME_DIR, event);

  send(event, 'status', 'Vérification des mods...');
  send(event, 'progress', 45);
  await syncMods(modsDir, event);
  ensureDistantHorizonsDefault(GAME_DIR);
  ensureShoulderSurfingDefault(GAME_DIR);
  ensureCustomSkinLoaderConfig(GAME_DIR);
  ensureBundledResourcePacks(GAME_DIR, path.join(__dirname, 'resourcepacks-pack'));

  writeServersDat(GAME_DIR);

  // Fabric n'a pas d'installateur : son profil de version est un simple JSON
  // servi par meta.fabricmc.net, que MCLC sait lancer en version custom.
  const FABRIC_PROFILE = `fabric-loader-${FABRIC_LOADER_VERSION}-${MINECRAFT_VERSION}`;
  const profileJson = path.join(GAME_DIR, 'versions', FABRIC_PROFILE, `${FABRIC_PROFILE}.json`);
  if (!fs.existsSync(profileJson)) {
    send(event, 'status', 'Installation de Fabric...');
    fs.mkdirSync(path.dirname(profileJson), { recursive: true });
    await download(FABRIC_PROFILE_URL, profileJson);
    const controle = JSON.parse(fs.readFileSync(profileJson, 'utf8'));
    if (controle.id !== FABRIC_PROFILE) {
      fs.unlinkSync(profileJson);
      throw new Error("L'installation de Fabric a échoué (profil inattendu)");
    }
  }
  const profil = JSON.parse(fs.readFileSync(profileJson, 'utf8'));

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
    logToFile('MINECRAFT', data);
  });

  const auth = currentUser ? Authenticator.getAuth(currentUser.username) : Authenticator.getAuth('Joueur');
  const settings = loadSettings();

  await launcher.launch({
    authorization: auth,
    root: GAME_DIR,
    version: {
      number: MINECRAFT_VERSION,
      type: 'release',
      custom: FABRIC_PROFILE
    },
    javaPath,
    // MCLC applique bien les arguments JEU du JSON custom, mais pas ses
    // arguments JVM : on ne transmet donc que ces derniers (lecon du profil
    // NeoForge, valable pour le -DFabricMcEmu du profil Fabric).
    customArgs: (profil.arguments && profil.arguments.jvm || []).filter((a) => typeof a === 'string'),
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

  // 1. Java 21 deja installe par ce launcher
  const bundled = findFileRecursive(path.join(gameDir, 'runtime', 'temurin21'), exe);
  if (bundled) return bundled;
  // 2. JAVA_HOME
  if (process.env.JAVA_HOME) {
    const p = path.join(process.env.JAVA_HOME, 'bin', exe);
    if (fs.existsSync(p)) return p;
  }
  // 3. Emplacements courants
  const candidates = isWin ? [
    'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\javaw.exe',
    'C:\\Program Files\\Microsoft\\jdk-21\\bin\\javaw.exe',
  ] : isMac ? [
    '/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java',
    '/usr/local/opt/openjdk@21/bin/java',
    '/opt/homebrew/opt/openjdk@21/bin/java',
  ] : [];
  const found = candidates.find(p => fs.existsSync(p));
  return found || undefined;
}

// Minecraft 1.21.4 / NeoForge 21.4 exigent Java 21 : un Java qui tourne mais en 17
// ne suffit pas, on lit le numero majeur dans la sortie de `-version`.
function checkJavaWorks(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], (error, stdout, stderr) => {
      if (error) return resolve(false);
      const match = /version "(\d+)/.exec(`${stdout}${stderr}`);
      resolve(!!match && parseInt(match[1], 10) >= 21);
    });
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

// Telecharge et installe un Java 21 (Eclipse Temurin) portable si le joueur n'en a pas deja un qui convient.
async function ensureJava21(gameDir, event) {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'javaw.exe' : 'java';

  const existing = findJavaw(gameDir);
  if (existing && await checkJavaWorks(existing)) return existing;

  const runtimeDir = path.join(gameDir, 'runtime', 'temurin21');
  let found = findFileRecursive(runtimeDir, exeName);
  if (found && await checkJavaWorks(found)) return found;

  send(event, 'status', 'Téléchargement de Java 21...');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const osName = isWin ? 'windows' : 'mac';
  const archiveUrl = `https://api.adoptium.net/v3/binary/latest/21/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`;
  const archivePath = path.join(app.getPath('temp'), isWin ? 'odalpaper-temurin21.zip' : 'odalpaper-temurin21.tar.gz');

  await download(archiveUrl, archivePath, (p) => {
    send(event, 'progress', 40 + Math.round(p * 5));
  });

  send(event, 'status', 'Installation de Java 21...');
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
    throw new Error("Impossible d'installer Java 21 automatiquement");
  }
  return found;
}

function writeServersDat(gameDir) {
  const dest = path.join(gameDir, 'servers.dat');
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
  const byte = (name, val) => {
    const nb = Buffer.from(name, 'utf8');
    buf[o++] = 1;
    buf.writeUInt16BE(nb.length, o); o += 2;
    nb.copy(buf, o); o += nb.length;
    buf.writeInt8(val, o); o += 1;
  };
  buf[o++] = 10; buf.writeUInt16BE(0, o); o += 2;
  buf[o++] = 9;
  const listName = Buffer.from('servers', 'utf8');
  buf.writeUInt16BE(listName.length, o); o += 2;
  listName.copy(buf, o); o += listName.length;
  buf[o++] = 10;
  buf.writeInt32BE(1, o); o += 4;
  str('ip', `${SERVER_IP}:${SERVER_PORT}`);
  str('name', SERVER_LABEL);
  // Le pack Odal est obligatoire et provient de notre propre serveur. En
  // enregistrant ce choix dans servers.dat, Minecraft le telecharge sans
  // afficher l'ecran de confirmation a chaque installation du launcher.
  byte('acceptTextures', 1);
  buf[o++] = 0;
  buf[o++] = 0;
  fs.writeFileSync(dest, buf.slice(0, o));
}

async function syncMods(modsDir, event) {
  const manifest = path.join(__dirname, 'mods-manifest.json');
  logToFile('MOD_SOURCE', `manifest=${manifest}; modsDir=${modsDir}`);
  if (!fs.existsSync(manifest)) return;

  const mods = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const platformMods = getPlatformMods(mods);
  const expectedJars = new Set(platformMods.map((mod) => mod.name.toLowerCase()));
  const packagedPackDir = path.join(process.resourcesPath, 'mods-pack');
  const archivedPackDir = path.join(__dirname, 'mods-pack');
  const sha256Of = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

  // Porte d'integrite : chaque mod maison epingle doit etre dans le manifeste, present
  // dans le pack embarque, et correspondre a l'empreinte attendue.
  for (const required of REQUIRED_MODS) {
    const source = path.join(archivedPackDir, required.name);
    if (!expectedJars.has(required.name.toLowerCase()) || !fs.existsSync(source)) {
      throw new Error(`Le mod obligatoire ${required.name} manque dans le launcher`);
    }
    if (sha256Of(source) !== required.sha256) {
      throw new Error(`La version embarquée de ${required.name} est incorrecte`);
    }
  }

  // Le dossier du launcher est la source de verite : supprimer tout ancien
  // mod retire du pack pour que les joueurs aient exactement la meme liste.
  if (fs.existsSync(modsDir)) {
    for (const file of fs.readdirSync(modsDir)) {
      if (file.toLowerCase().endsWith('.jar') &&
          !expectedJars.has(file.toLowerCase())) {
        fs.unlinkSync(path.join(modsDir, file));
      }
    }
  }

  for (let i = 0; i < platformMods.length; i++) {
    const mod = platformMods[i];
    const dest = path.join(modsDir, mod.name);
    const externalSrc = path.join(packagedPackDir, mod.name);
    const archivedSrc = path.join(archivedPackDir, mod.name);
    const localSrc = fs.existsSync(externalSrc) ? externalSrc : archivedSrc;

    if (fs.existsSync(dest)) {
      if (fs.existsSync(localSrc)) {
        const filesDiffer = fs.statSync(localSrc).size !== fs.statSync(dest).size
          || sha256Of(localSrc) !== sha256Of(dest);
        if (filesDiffer) {
          send(event, 'status', `Mise à jour : ${mod.name}`);
          fs.copyFileSync(localSrc, dest);
        }
      }
      send(event, 'progress', 45 + Math.round(((i + 1) / platformMods.length) * 15));
      continue;
    }

    if (fs.existsSync(localSrc)) {
      send(event, 'status', `Copie : ${mod.name}`);
      fs.copyFileSync(localSrc, dest);
    } else if (mod.url && mod.url !== 'URL_A_REMPLIR') {
      send(event, 'status', `Téléchargement : ${mod.name}`);
      await download(mod.url, dest);
    } else {
      send(event, 'status', `Mod manquant : ${mod.name}`);
    }

    send(event, 'progress', 45 + Math.round(((i + 1) / platformMods.length) * 15));
  }

  // Dernier controle avant le lancement : le jar en place doit etre celui epingle.
  for (const required of REQUIRED_MODS) {
    const dest = path.join(modsDir, required.name);
    if (!fs.existsSync(dest) || sha256Of(dest) !== required.sha256) {
      send(event, 'status', `Mise à jour obligatoire : ${required.name}`);
      fs.copyFileSync(path.join(archivedPackDir, required.name), dest);
    }
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

function httpsPostMultipartOnce(url, fields, filePath, fileFieldName, timeoutMs) {
  return new Promise((resolve, reject) => {
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(filePath);
    } catch (err) {
      return reject(new Error('Fichier introuvable'));
    }
    const boundary = '----OdalLauncher' + crypto.randomBytes(16).toString('hex');
    const fileName = path.basename(filePath);
    const parts = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'User-Agent': USER_AGENT
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Réponse invalide')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Le serveur ne répond pas (timeout)')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function httpsPostMultipart(url, fields, filePath, fileFieldName, retries = 1, timeoutMs = 20000) {
  const wait = lastPostAt + MIN_POST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastPostAt = Date.now();
  try {
    return await httpsPostMultipartOnce(url, fields, filePath, fileFieldName, timeoutMs);
  } catch (err) {
    if (retries > 0) return httpsPostMultipart(url, fields, filePath, fileFieldName, retries - 1, timeoutMs);
    throw err;
  }
}
