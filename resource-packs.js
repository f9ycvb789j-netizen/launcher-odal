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

module.exports = { ensureBundledResourcePacks };
