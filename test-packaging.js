const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getPlatformMods } = require('./mod-platform');
const { ensureDistantHorizonsDefault } = require('./distant-horizons-config');

const REQUIRED_GUI_MOD = 'islandfactionsgui-1.0.0.jar';
const REQUIRED_GUI_MOD_SHA256 = '4bac8468fefd84be9c74b87c4751a75e13cc2ac35bb69ca19526fb7218732ce4';
const REQUIRED_GUI_MOD_SHA256_MAC = '4bac8468fefd84be9c74b87c4751a75e13cc2ac35bb69ca19526fb7218732ce4';
const EXPECTED_MOD_COUNT = 26;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyGuiMod(file) {
  assert.ok(fs.existsSync(file), `Mod GUI absent : ${file}`);
  assert.strictEqual(sha256(file), REQUIRED_GUI_MOD_SHA256, 'Le mod GUI embarqué n’est pas la bonne version');
}

function verifyMacGuiMod(file) {
  assert.ok(fs.existsSync(file), `Mod GUI Mac absent : ${file}`);
  assert.strictEqual(sha256(file), REQUIRED_GUI_MOD_SHA256_MAC, 'Le mod GUI Mac embarque n est pas la bonne version');
}

function verifySourcePack(packDir) {
  assert.ok(fs.existsSync(packDir), `Pack absent : ${packDir}`);
  const jars = fs.readdirSync(packDir).filter((file) => file.toLowerCase().endsWith('.jar'));
  assert.strictEqual(jars.length, EXPECTED_MOD_COUNT, `Le pack doit contenir ${EXPECTED_MOD_COUNT} mods`);
  assert.ok(!jars.some((file) => /odalcurrency|optifine/i.test(file)), 'Un ancien mod interdit est présent');
  verifyGuiMod(path.join(packDir, REQUIRED_GUI_MOD));
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const externalPack = (packageJson.build.extraResources || []).find(
  (entry) => entry.from === 'mods-pack' && entry.to === 'mods-pack'
);
assert.ok(externalPack, 'mods-pack doit être déclaré dans build.extraResources');
assert.deepStrictEqual(
  externalPack.filter,
  [REQUIRED_GUI_MOD],
  'Seul le mod GUI doit être exposé hors de app.asar'
);
const macExternalPack = (packageJson.build.extraResources || []).find(
  (entry) => entry.from === 'mods-pack-mac' && entry.to === 'mods-pack-mac'
);
assert.ok(macExternalPack, 'mods-pack-mac doit etre declare dans build.extraResources');
assert.deepStrictEqual(
  macExternalPack.filter,
  [REQUIRED_GUI_MOD],
  'Seul le mod GUI Mac doit etre expose hors de app.asar'
);

assert.ok(packageJson.build.files.includes('mods-pack/**'), 'Le pack complet doit rester dans app.asar');
assert.ok(packageJson.build.files.includes('mods-pack-mac/**'), 'Le GUI Mac doit rester dans app.asar');
assert.ok(packageJson.build.files.includes('mod-platform.js'), 'La regle de plateforme doit etre emballee');
assert.ok(
  packageJson.build.files.includes('distant-horizons-config.js'),
  'La configuration initiale de Distant Horizons doit etre emballee'
);

const manifest = JSON.parse(fs.readFileSync('mods-manifest.json', 'utf8'));
assert.strictEqual(manifest.length, EXPECTED_MOD_COUNT, `Le manifeste doit contenir ${EXPECTED_MOD_COUNT} mods`);
assert.ok(manifest.some((mod) => mod.name === REQUIRED_GUI_MOD), 'Le mod GUI manque dans le manifeste');
const windowsMods = getPlatformMods(manifest, 'win32');
const macMods = getPlatformMods(manifest, 'darwin');
assert.strictEqual(windowsMods.length, EXPECTED_MOD_COUNT, 'Windows doit garder les 26 mods');
assert.strictEqual(macMods.length, EXPECTED_MOD_COUNT, 'Mac doit contenir les 26 mods');
assert.ok(manifest.some((mod) => mod.name === 'odalairways-0.5.1.jar'), 'Odal Airways 0.5.1 manque');
assert.ok(manifest.some((mod) => mod.name === 'odalcompanion-0.16.0.jar'), 'Odal Companion 0.16.0 manque');
assert.ok(!manifest.some((mod) => mod.name === 'odalairways-0.4.0.jar'), 'Odal Airways 0.4.0 doit être retiré');
assert.ok(!manifest.some((mod) => mod.name === 'odalcompanion-0.14.0.jar'), 'Odal Companion 0.14.0 doit être retiré');
for (const restoredName of [
  'embeddium-0.3.31+mc1.20.1.jar',
  'oculus-mc1.20.1-1.8.0 .jar'
]) {
  assert.ok(windowsMods.some((mod) => mod.name === restoredName), `${restoredName} doit rester sur Windows`);
  assert.ok(macMods.some((mod) => mod.name === restoredName), `${restoredName} doit etre restaure sur Mac`);
}
assert.ok(windowsMods.some((mod) => mod.name === REQUIRED_GUI_MOD), 'Le GUI doit rester sur Windows');
assert.ok(macMods.some((mod) => mod.name === REQUIRED_GUI_MOD), 'Le GUI du Bureau doit etre present sur Mac');

verifySourcePack(path.join(process.cwd(), 'mods-pack'));
verifyMacGuiMod(path.join(process.cwd(), 'mods-pack-mac', REQUIRED_GUI_MOD));

const tempGameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odal-dh-config-'));
try {
  const configFile = path.join(tempGameDir, 'config', 'DistantHorizons.toml');
  assert.strictEqual(
    ensureDistantHorizonsDefault(tempGameDir),
    true,
    'La configuration DH doit etre creee au premier lancement'
  );
  assert.match(
    fs.readFileSync(configFile, 'utf8'),
    /rendererMode\s*=\s*"DISABLED"/,
    'Le rendu DH doit etre desactive par defaut'
  );

  const playerChoice = '_version = 3\nrendererMode = "DEFAULT"\n';
  fs.writeFileSync(configFile, playerChoice, 'utf8');
  assert.strictEqual(
    ensureDistantHorizonsDefault(tempGameDir),
    false,
    'Une configuration DH existante ne doit jamais etre remplacee'
  );
  assert.strictEqual(
    fs.readFileSync(configFile, 'utf8'),
    playerChoice,
    'Le choix du joueur doit etre conserve'
  );
} finally {
  fs.rmSync(tempGameDir, { recursive: true, force: true });
}

if (process.argv[2]) {
  verifyGuiMod(path.join(path.resolve(process.argv[2]), 'mods-pack', REQUIRED_GUI_MOD));
  verifyMacGuiMod(path.join(path.resolve(process.argv[2]), 'mods-pack-mac', REQUIRED_GUI_MOD));
}

console.log('Packaging des mods : tests réussis');
