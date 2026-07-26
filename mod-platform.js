const MAC_EXCLUDED_MOD_NAMES = new Set([
  'embeddium-0.3.31+mc1.20.1.jar',
  'oculus-mc1.20.1-1.8.0 .jar'
]);

function getPlatformMods(mods, platform = process.platform) {
  if (platform !== 'darwin') {
    return [...mods];
  }

  return mods.filter((mod) => !MAC_EXCLUDED_MOD_NAMES.has(mod.name.toLowerCase()));
}

module.exports = {
  getPlatformMods
};
