const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REQUIRED_GUI_MOD = 'islandfactionsgui-1.0.0.jar';
const REQUIRED_GUI_MOD_SHA256 = '8b4747bb9fe27c7095d83abd7132a69b21e072270c5f2ada73864deadbece3af';
const EXPECTED_MOD_COUNT = 22;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyGuiMod(file) {
  assert.ok(fs.existsSync(file), `Mod GUI absent : ${file}`);
  assert.strictEqual(sha256(file), REQUIRED_GUI_MOD_SHA256, 'Le mod GUI embarqué n’est pas la bonne version');
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
assert.ok(packageJson.build.files.includes('mods-pack/**'), 'Le pack complet doit rester dans app.asar');

const manifest = JSON.parse(fs.readFileSync('mods-manifest.json', 'utf8'));
assert.strictEqual(manifest.length, EXPECTED_MOD_COUNT, `Le manifeste doit contenir ${EXPECTED_MOD_COUNT} mods`);
assert.ok(manifest.some((mod) => mod.name === REQUIRED_GUI_MOD), 'Le mod GUI manque dans le manifeste');

verifySourcePack(path.join(process.cwd(), 'mods-pack'));

if (process.argv[2]) {
  verifyGuiMod(path.join(path.resolve(process.argv[2]), 'mods-pack', REQUIRED_GUI_MOD));
}

console.log('Packaging des mods : tests réussis');
