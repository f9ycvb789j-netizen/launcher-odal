const assert = require('assert');
const fs = require('fs');
const { isNewerVersion } = require('./updater-utils');

assert.strictEqual(isNewerVersion('1.1.20', '1.1.19'), true);
assert.strictEqual(isNewerVersion('1.2.0', '1.1.99'), true);
assert.strictEqual(isNewerVersion('1.1.18', '1.1.18'), false);
assert.strictEqual(isNewerVersion('1.1.19', '1.1.20'), false);
assert.strictEqual(isNewerVersion('2.0', '1.99.99'), true);

const html = fs.readFileSync('index.html', 'utf8');
const renderer = fs.readFileSync('renderer.js', 'utf8');
const main = fs.readFileSync('main.js', 'utf8');

for (const id of [
  'update-gate',
  'update-gate-title',
  'update-gate-message',
  'update-gate-progress-bar',
  'update-gate-percent',
  'update-gate-retry',
  'update-gate-close'
]) {
  assert.ok(html.includes(`id="${id}"`), `Élément manquant : ${id}`);
}

for (const status of ['checking', 'downloading', 'progress', 'up-to-date', 'mac-ready', 'error']) {
  assert.ok(renderer.includes(`status === '${status}'`), `État UI manquant : ${status}`);
}

assert.ok(main.includes('if (updateGateOpen)'), 'Le lancement du jeu doit être bloqué');
assert.ok(main.includes("ipcMain.handle('retry-update'"), 'Le bouton Réessayer doit être connecté');

if (process.argv[2]) {
  const asar = require('@electron/asar');
  const archivePath = process.argv[2];
  const packagedFiles = asar.listPackage(archivePath)
    .map((file) => file.replaceAll('\\', '/'));
  const packagedMods = packagedFiles.filter((file) =>
    file.startsWith('/mods-pack/') && file.endsWith('.jar')
  );

  for (const requiredFile of ['/main.js', '/renderer.js', '/index.html', '/updater-utils.js']) {
    assert.ok(packagedFiles.includes(requiredFile), `Fichier absent de l'application : ${requiredFile}`);
  }
  assert.strictEqual(packagedMods.length, 22, 'Le pack doit contenir exactement 22 mods');
  assert.ok(!packagedMods.some((file) => /odalcurrency|optifine/i.test(file)), 'Ancien mod embarqué');

  const packagedHtml = asar.extractFile(archivePath, 'index.html').toString('utf8');
  assert.ok(packagedHtml.includes('id="update-gate"'), 'Écran absent de l’application compilée');
}

console.log('Écran de mise à jour : tests réussis');
