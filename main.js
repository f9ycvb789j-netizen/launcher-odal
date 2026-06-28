const { app, BrowserWindow, ipcMain } = require('electron');
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
const { Auth } = require('msmc');

const SERVER_IP = 'odal.minesr.com';
const SERVER_PORT = 25565;
const FORGE_VERSION = '1.20.1-47.3.0';
const FORGE_DOWNLOAD_URL = `https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar`;

let mainWindow;
let authToken = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 550,
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('close', () => app.quit());

ipcMain.handle('login-microsoft', async () => {
  try {
    const authManager = new Auth('select_account');
    const xbox = await authManager.launch('electron');
    const token = await xbox.getMinecraft();
    authToken = token.mclc();
    return { success: true, username: authToken.name };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('launch', async (event) => {
  const GAME_DIR = path.join(app.getPath('appData'), '.odal');
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

  const auth = authToken || Authenticator.getAuth('Joueur');
  const javaPath = findJavaw(GAME_DIR);

  await launcher.launch({
    authorization: auth,
    root: GAME_DIR,
    version: {
      number: '1.20.1',
      type: 'release'
    },
    javaPath,
    forge: forgeInstalled ? undefined : FORGE_JAR,
    memory: { max: '4G', min: '2G' }
  });

  send(event, 'progress', 100);
  send(event, 'status', 'Jeu lancé !');
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
    const follow = (u) => {
      const mod = u.startsWith('https') ? https : require('http');
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
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
      }).on('error', reject);
    };
    follow(url);
  });
}

function send(event, channel, data) {
  if (event && event.sender && !event.sender.isDestroyed()) {
    event.sender.send(channel, data);
  }
}
