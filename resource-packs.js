const fs = require('fs');
const path = require('path');

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

/**
 * Emotecraft ouvre sa roue sur B, touche que Xaero Minimap prend aussi pour « nouveau
 * waypoint » ; Xaero l'emporte et la roue ne s'ouvre jamais. On libere donc B cote Xaero,
 * seulement si le joueur ne l'a pas deja regle ailleurs (ligne absente ou encore sur B) :
 * le waypoint instantane (+ du pave numerique) et la liste (U) restent disponibles.
 */
function ensureEmoteKeyFree(gameDir) {
  const optionsFile = path.join(gameDir, 'options.txt');
  const cle = 'key_gui.xaero_new_waypoint:';
  const lines = fs.existsSync(optionsFile) ? fs.readFileSync(optionsFile, 'utf8').split(/\r?\n/) : [];
  const index = lines.findIndex((l) => l.startsWith(cle));
  if (index >= 0 && lines[index] !== cle + 'key.keyboard.b') return false;
  const line = cle + 'key.keyboard.unknown';
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  fs.writeFileSync(optionsFile, lines.join('\n') + '\n', 'utf8');
  return true;
}

module.exports = { ensureBundledResourcePacks, ensureBundledEmotes, ensureEmoteKeyFree };
