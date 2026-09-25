const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = `_version = 3

[client.advanced.debugging]
rendererMode = "DISABLED"

[client.advanced.autoUpdater]
enableAutoUpdater = false
`;

function ensureDistantHorizonsDefault(gameDir) {
  const configDir = path.join(gameDir, 'config');
  const configFile = path.join(configDir, 'DistantHorizons.toml');

  // Ne jamais ecraser le choix d'un joueur apres sa premiere configuration.
  if (fs.existsSync(configFile)) return false;

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, DEFAULT_CONFIG, 'utf8');
  return true;
}

/**
 * Coupe la mise a jour automatique de Distant Horizons, et efface celle qu'il a deja preparee.
 *
 * Distant Horizons va chercher sa derniere version tout seul et la depose dans `mods/update/`,
 * qu'il installe au lancement suivant — par-dessus la version que ce launcher epingle. Or
 * `syncMods` efface tout jar absent du manifeste : les deux se renvoyaient la balle a chaque
 * partie, 30 Mo telecharges pour rien et une version differente selon le moment. Le pack decide,
 * donc son reglage est force ici, y compris chez les joueurs installes de longue date.
 */
function disableDistantHorizonsAutoUpdate(gameDir) {
  let change = false;
  const configFile = path.join(gameDir, 'config', 'DistantHorizons.toml');
  if (fs.existsSync(configFile)) {
    const avant = fs.readFileSync(configFile, 'utf8');
    let apres = avant;
    if (/^\s*enableAutoUpdater\s*=\s*true\s*$/m.test(avant)) {
      apres = avant.replace(/^(\s*)enableAutoUpdater\s*=\s*true\s*$/m, '$1enableAutoUpdater = false');
    } else if (!/enableAutoUpdater\s*=/.test(avant)) {
      const section = '\n[client.advanced.autoUpdater]\nenableAutoUpdater = false\n';
      apres = avant.endsWith('\n') ? avant + section : avant + '\n' + section;
    }
    if (apres !== avant) {
      fs.writeFileSync(configFile, apres, 'utf8');
      change = true;
    }
  }

  // La mise a jour deja telechargee s'appliquerait au prochain demarrage : elle part.
  const updateDir = path.join(gameDir, 'mods', 'update');
  if (fs.existsSync(updateDir)) {
    for (const fichier of fs.readdirSync(updateDir)) {
      if (!/^distanthorizons.*\.jar$/i.test(fichier)) continue;
      try {
        fs.unlinkSync(path.join(updateDir, fichier));
        change = true;
      } catch {
        // Un fichier verrouille par un jeu encore ouvert : il sera efface au prochain passage.
      }
    }
    try {
      if (fs.readdirSync(updateDir).length === 0) fs.rmdirSync(updateDir);
    } catch {
      // Dossier non vide ou verrouille : sans consequence.
    }
  }
  return change;
}

module.exports = {
  DEFAULT_CONFIG,
  ensureDistantHorizonsDefault,
  disableDistantHorizonsAutoUpdate
};
