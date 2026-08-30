const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Nom du pack tel qu'il apparait dans le dossier resourcepacks/ du joueur et
// dans options.txt (prefixe "file/" impose par Minecraft pour un pack local).
const PACK_FILE = 'HyperPunchy.zip';
const PACK_ENTRY = `file/${PACK_FILE}`;

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

// Copie le pack embarque dans le launcher vers le dossier resourcepacks/ du
// joueur, et le remplace uniquement s'il differe (mise a jour au republish).
function syncPackFile(gameDir) {
  const source = path.join(__dirname, 'resourcepacks-pack', PACK_FILE);
  if (!fs.existsSync(source)) return false;

  const packsDir = path.join(gameDir, 'resourcepacks');
  fs.mkdirSync(packsDir, { recursive: true });
  const dest = path.join(packsDir, PACK_FILE);

  if (fs.existsSync(dest) && sha1(dest) === sha1(source)) return false;
  fs.copyFileSync(source, dest);
  return true;
}

// Active le pack dans options.txt une seule fois. Apres cela, on ne retouche
// plus la ligne : si le joueur desactive le pack (ex. mal des transports avec
// le tremblement de camera), son choix est respecte.
function enableInOptionsOnce(gameDir) {
  const marker = path.join(gameDir, 'config', '.odal-hyperpunchy-enabled');
  if (fs.existsSync(marker)) return false;

  const optionsFile = path.join(gameDir, 'options.txt');
  if (fs.existsSync(optionsFile)) {
    const lines = fs.readFileSync(optionsFile, 'utf8').split(/\r?\n/);
    const idx = lines.findIndex((l) => l.startsWith('resourcePacks:'));
    if (idx === -1) {
      lines.push(`resourcePacks:["vanilla","${PACK_ENTRY}"]`);
    } else {
      let packs;
      try {
        packs = JSON.parse(lines[idx].slice('resourcePacks:'.length));
      } catch (e) {
        packs = ['vanilla'];
      }
      if (!Array.isArray(packs)) packs = ['vanilla'];
      if (!packs.includes(PACK_ENTRY)) packs.push(PACK_ENTRY);
      lines[idx] = `resourcePacks:${JSON.stringify(packs)}`;
    }
    fs.writeFileSync(optionsFile, lines.join('\n'), 'utf8');
  } else {
    // options.txt n'existe pas encore (aucun premier lancement). Minecraft
    // completera les autres valeurs par defaut et conservera cette ligne.
    fs.writeFileSync(optionsFile, `resourcePacks:["vanilla","${PACK_ENTRY}"]\n`, 'utf8');
  }

  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, '', 'utf8');
  return true;
}

// Installe le pack Hyper Punchy et l'active par defaut au premier lancement.
function ensureHyperPunchyPack(gameDir) {
  const copied = syncPackFile(gameDir);
  const enabled = enableInOptionsOnce(gameDir);
  return copied || enabled;
}

// Depose la config Punchy par defaut (avec les armes TaCZ mises en blacklist
// pour eviter le double rendu de l'arme a l'ecran). Ne jamais ecraser une
// config existante : le choix du joueur (via l'ecran de config Punchy) prime.
function ensurePunchyConfig(gameDir) {
  const source = path.join(__dirname, 'config-pack', 'punchy', 'punchy_config.json');
  if (!fs.existsSync(source)) return false;

  const destDir = path.join(gameDir, 'config', 'punchy');
  const dest = path.join(destDir, 'punchy_config.json');
  if (fs.existsSync(dest)) return false;

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(source, dest);
  return true;
}

// Bascule ponctuelle de bettercombatCompat sur les installations existantes.
//
// ensurePunchyConfig n'ecrit jamais par-dessus une config deja presente, ce qui est
// la bonne regle : les reglages Punchy appartiennent au joueur. Mais Better Combat
// est arrive apres coup, et sans cette cle Punchy rejoue ses propres effets de coup
// par-dessus ceux de Better Combat -- le joueur voit la frappe deux fois.
//
// On ne touche donc qu'a cette cle, une seule fois, tracee par un marqueur : si le
// joueur la remet ensuite a false depuis l'ecran de config, c'est son choix.
const BETTERCOMBAT_MARKER = '.odal-bettercombat-compat';

function ensureBettercombatCompat(gameDir) {
  const destDir = path.join(gameDir, 'config', 'punchy');
  const marker = path.join(destDir, BETTERCOMBAT_MARKER);
  if (fs.existsSync(marker)) return false;

  const dest = path.join(destDir, 'punchy_config.json');
  if (!fs.existsSync(dest)) return false;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(dest, 'utf8'));
  } catch (error) {
    // Config illisible : on n'y touche pas, et on ne pose pas le marqueur non plus
    // pour retenter au prochain lancement.
    return false;
  }

  let modifie = false;
  if (config && typeof config === 'object' && config.bettercombatCompat !== true) {
    config.bettercombatCompat = true;
    fs.writeFileSync(dest, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    modifie = true;
  }
  fs.writeFileSync(marker, '', 'utf8');
  return modifie;
}

module.exports = {
  PACK_FILE,
  PACK_ENTRY,
  BETTERCOMBAT_MARKER,
  ensureHyperPunchyPack,
  ensurePunchyConfig,
  ensureBettercombatCompat
};
