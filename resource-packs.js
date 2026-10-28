const fs = require('fs');
const path = require('path');

// Version du format d'options.txt de Minecraft 1.21.11 (celle que le jeu lui-meme ecrit).
// A relever en meme temps que MINECRAFT_VERSION dans main.js.
const OPTIONS_VERSION = 4671;

/**
 * Packs de ressources livres avec le launcher (resourcepacks-pack/), copies dans le dossier
 * de jeu et actives dans options.txt s'ils n'y sont pas encore.
 *
 * On n'ecrase jamais l'ordre choisi par le joueur : un pack deja present dans la liste
 * (actif ou non) est laisse tel quel ; seuls les packs inconnus sont ajoutes, en tete,
 * pour qu'ils prennent le dessus sur le pack serveur (ItemsAdder) qui, lui, doit rester
 * en dessous des animations.
 */
function ensureBundledResourcePacks(gameDir, packDir) {
  if (!fs.existsSync(packDir)) return [];
  const targetDir = path.join(gameDir, 'resourcepacks');
  fs.mkdirSync(targetDir, { recursive: true });
  const bundled = fs.readdirSync(packDir).filter((f) => f.toLowerCase().endsWith('.zip'));
  for (const name of bundled) {
    const src = path.join(packDir, name);
    const dest = path.join(targetDir, name);
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
      fs.copyFileSync(src, dest);
    }
  }

  const optionsFile = path.join(gameDir, 'options.txt');
  let lines = fs.existsSync(optionsFile) ? fs.readFileSync(optionsFile, 'utf8').split(/\r?\n/) : [];
  // Sans ligne `version:`, Minecraft prend le fichier pour un options.txt d'avant 1.13 et lui
  // passe le correcteur de donnees des touches, qui lit chaque valeur comme un entier : le
  // fichier entier est alors rejete (« Failed to load options ») et nos packs ne s'activent
  // jamais. Sur une installation neuve, c'est nous qui creons le fichier : on l'annonce.
  if (!lines.some((l) => l.startsWith('version:'))) {
    lines.unshift('version:' + OPTIONS_VERSION);
  }
  const index = lines.findIndex((l) => l.startsWith('resourcePacks:'));
  let current = [];
  if (index >= 0) {
    try { current = JSON.parse(lines[index].slice('resourcePacks:'.length)); } catch (e) { current = []; }
  }
  const missing = bundled.map((n) => `file/${n}`).filter((id) => !current.includes(id));
  if (missing.length === 0) return [];
  // Les entrees en fin de liste sont prioritaires dans Minecraft : on ajoute a la fin.
  const next = [...current, ...missing];
  const line = 'resourcePacks:' + JSON.stringify(next);
  if (index >= 0) lines[index] = line; else lines.push(line);
  fs.writeFileSync(optionsFile, lines.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n'), 'utf8');
  return missing;
}

/**
 * Emotes Emotecraft livrees avec le launcher (emotes-pack/), copiees dans le dossier emotes/
 * du jeu, la ou le mod les lit. Une emote deja presente et identique n'est pas recopiee ; les
 * emotes que le joueur a ajoutees lui-meme ne sont jamais touchees.
 */
function ensureBundledEmotes(gameDir, packDir) {
  if (!fs.existsSync(packDir)) return [];
  const targetDir = path.join(gameDir, 'emotes');
  fs.mkdirSync(targetDir, { recursive: true });
  const copied = [];
  for (const name of fs.readdirSync(packDir).filter((f) => f.toLowerCase().endsWith('.json'))) {
    const src = path.join(packDir, name);
    const dest = path.join(targetDir, name);
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(fs.readFileSync(src))) {
      fs.copyFileSync(src, dest);
      copied.push(name);
    }
  }
  return copied;
}

module.exports = { ensureBundledResourcePacks, ensureBundledEmotes };
