const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = `_version = 3

[client.advanced.debugging]
rendererMode = "DISABLED"
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

module.exports = {
  DEFAULT_CONFIG,
  ensureDistantHorizonsDefault
};
