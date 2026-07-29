const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getPlatformMods } = require('./mod-platform');

const REQUIRED_GUI_MOD = 'islandfactionsgui-1.0.0.jar';
const REQUIRED_GUI_MOD_SHA256 = 'f4ad6233fd97fb63732878975a9c46c6e80d7ba305b7ff9780d8b4fe0596dbfc';
const REQUIRED_GUI_MOD_SHA256_MAC = 'f4ad6233fd97fb63732878975a9c46c6e80d7ba305b7ff9780d8b4fe0596dbfc';
const EXPECTED_MOD_COUNT = 22;

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

const manifest = JSON.parse(fs.readFileSync('mods-manifest.json', 'utf8'));
assert.strictEqual(manifest.length, EXPECTED_MOD_COUNT, `Le manifeste doit contenir ${EXPECTED_MOD_COUNT} mods`);
assert.ok(manifest.some((mod) => mod.name === REQUIRED_GUI_MOD), 'Le mod GUI manque dans le manifeste');
const windowsMods = getPlatformMods(manifest, 'win32');
const macMods = getPlatformMods(manifest, 'darwin');
assert.strictEqual(windowsMods.length, EXPECTED_MOD_COUNT, 'Windows doit garder les 22 mods');
assert.strictEqual(macMods.length, EXPECTED_MOD_COUNT, 'Mac doit contenir les 22 mods');
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

if (process.argv[2]) {
  verifyGuiMod(path.join(path.resolve(process.argv[2]), 'mods-pack', REQUIRED_GUI_MOD));
  verifyMacGuiMod(path.join(path.resolve(process.argv[2]), 'mods-pack-mac', REQUIRED_GUI_MOD));
}

console.log('Packaging des mods : tests réussis');
