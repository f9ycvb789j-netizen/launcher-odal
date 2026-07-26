const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REQUIRED_GUI_MOD = 'islandfactionsgui-1.0.0.jar';
const REQUIRED_GUI_MOD_SHA256 = '12fa4d53ef00624e567032794ec52cdb33f25c99715fbb927952789e6076a0e1';
const EXPECTED_MOD_COUNT = 22;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyPack(packDir) {
  assert.ok(fs.existsSync(packDir), `Pack absent : ${packDir}`);
  const jars = fs.readdirSync(packDir).filter((file) => file.toLowerCase().endsWith('.jar'));
  assert.strictEqual(jars.length, EXPECTED_MOD_COUNT, `Le pack doit contenir ${EXPECTED_MOD_COUNT} mods`);
  assert.ok(!jars.some((file) => /odalcurrency|optifine/i.test(file)), 'Un ancien mod interdit est présent');

  const guiMod = path.join(packDir, REQUIRED_GUI_MOD);
  assert.ok(fs.existsSync(guiMod), `Mod GUI absent : ${REQUIRED_GUI_MOD}`);
  assert.strictEqual(sha256(guiMod), REQUIRED_GUI_MOD_SHA256, 'Le mod GUI embarqué n’est pas la bonne version');
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const externalPack = (packageJson.build.extraResources || []).find(
  (entry) => entry.from === 'mods-pack' && entry.to === 'mods-pack'
);
assert.ok(externalPack, 'mods-pack doit être déclaré dans build.extraResources');
assert.ok(!packageJson.build.files.includes('mods-pack/**'), 'mods-pack ne doit pas être dupliqué dans app.asar');

const manifest = JSON.parse(fs.readFileSync('mods-manifest.json', 'utf8'));
assert.strictEqual(manifest.length, EXPECTED_MOD_COUNT, `Le manifeste doit contenir ${EXPECTED_MOD_COUNT} mods`);
assert.ok(manifest.some((mod) => mod.name === REQUIRED_GUI_MOD), 'Le mod GUI manque dans le manifeste');

verifyPack(path.join(process.cwd(), 'mods-pack'));

if (process.argv[2]) {
  verifyPack(path.join(path.resolve(process.argv[2]), 'mods-pack'));
}

console.log('Packaging des mods : tests réussis');
