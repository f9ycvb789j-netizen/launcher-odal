const fs = require('fs');
const path = require('path');

// CustomSkinLoader charge les skins cote client, directement depuis odalmc.fr.
// Le type "Legacy" prend un gabarit d'URL ou {USERNAME} est remplace par le
// pseudo : c'est exactement la forme que le site sert deja via upload_skin.php.
//
// Aucun passage par Mojang ni par MineSkin, donc aucune limite de debit, aucune
// signature de texture, et rien a installer cote serveur.
const SKIN_ROOT = 'https://odalmc.fr/uploads';

const DEFAULT_CONFIG = {
  version: '14.28',
  loadlist: [
    {
      name: 'Odal',
      type: 'Legacy',
      skin: `${SKIN_ROOT}/skins/{USERNAME}.png`,
      cape: `${SKIN_ROOT}/capes/{USERNAME}.png`,
      elytra: `${SKIN_ROOT}/elytras/{USERNAME}.png`,
      model: 'auto'
    },
    {
      // Repli pour les comptes premium qui gardent leur skin Mojang si Odal
      // n'en fournit pas. Place apres Odal : le site a toujours la priorite.
      name: 'Mojang',
      type: 'MojangAPI',
      apiRoot: 'https://api.mojang.com/',
      sessionRoot: 'https://sessionserver.mojang.com/'
    }
  ],
  enableCape: true,
  enableDynamicSkull: true,
  enableTransparentSkin: true,
  forceUpdateSkull: false,
  // Deux minutes : un joueur qui change son skin sur le site le voit vite,
  // sans que chaque client martele le serveur web.
  cacheExpiry: 2,
  threadPoolSize: 8
};

/**
 * Ecrit la configuration de CustomSkinLoader dans le dossier de jeu.
 *
 * Contrairement aux autres reglages, celui-ci est REECRIT a chaque lancement :
 * il ne contient aucun choix du joueur, seulement l'adresse du serveur de
 * skins. Si cette adresse change, tous les clients doivent suivre.
 */
function ensureCustomSkinLoaderConfig(gameDir) {
  const configDir = path.join(gameDir, 'CustomSkinLoader');
  const configFile = path.join(configDir, 'CustomSkinLoader.json');

  const attendu = JSON.stringify(DEFAULT_CONFIG, null, 2);
  if (fs.existsSync(configFile)) {
    try {
      if (fs.readFileSync(configFile, 'utf8') === attendu) return false;
    } catch (e) {
      // Fichier illisible : on le remplace.
    }
  }

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, attendu, 'utf8');
  return true;
}

module.exports = {
  DEFAULT_CONFIG,
  ensureCustomSkinLoaderConfig
};
