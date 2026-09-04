const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getPlatformMods } = require('./mod-platform');
const { ensureDistantHorizonsDefault } = require('./distant-horizons-config');

// Les mods epingles sont lus dans main.js : une seule source de verite pour le nom
// et l'empreinte, sinon un oubli casse le build.
function requiredModsFromMain() {
  const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const block = /const REQUIRED_MODS = \[([\s\S]*?)\];/.exec(source);
  assert.ok(block, 'Constante REQUIRED_MODS introuvable dans main.js');
  const mods = [];
  for (const m of block[1].matchAll(/name:\s*'([^']+\.jar)'\s*,\s*sha256:\s*'([a-f0-9]{64})'/g)) {
    mods.push({ name: m[1], sha256: m[2] });
  }
  return mods;
}

const REQUIRED_MODS = requiredModsFromMain();
const manifest = JSON.parse(fs.readFileSync('mods-manifest.json', 'utf8'));
const EXPECTED_MOD_COUNT = manifest.length;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifySourcePack(packDir) {
  assert.ok(fs.existsSync(packDir), `Pack absent : ${packDir}`);
  const jars = fs.readdirSync(packDir).filter((file) => file.toLowerCase().endsWith('.jar'));
  assert.strictEqual(jars.length, EXPECTED_MOD_COUNT, `Le pack doit contenir ${EXPECTED_MOD_COUNT} mods (manifeste)`);
  for (const jar of jars) {
    assert.ok(manifest.some((mod) => mod.name === jar), `${jar} est dans mods-pack mais pas dans le manifeste`);
  }
  // Aucun mod de gameplay/serveur de l'ancien pack Forge 1.20.1 ne doit revenir ici.
  // (punchy retire de la liste : le vrai mod Punchy fait partie du pack Fabric 1.21.11)
  assert.ok(!jars.some((file) => /tacz|alexsmobs|citadel|simpleores|netherrocks|immersive_aircraft|smallships|yo_hooks|easy_npc|dawnoftime|optifine|1\.20\.1/i.test(file)),
    'Un mod serveur/gameplay ou 1.20.1 est present dans le pack OdalPaper');
  for (const required of REQUIRED_MODS) {
    const file = path.join(packDir, required.name);
    assert.ok(fs.existsSync(file), `Mod obligatoire absent : ${file}`);
    assert.strictEqual(sha256(file), required.sha256, `${required.name} embarque n'est pas la bonne version`);
    assert.ok(manifest.some((mod) => mod.name === required.name), `${required.name} manque au manifeste`);
  }
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.ok(packageJson.build.files.includes('mods-pack/**'), 'Le pack complet doit rester dans app.asar');
assert.ok(packageJson.build.files.includes('mod-platform.js'), 'La regle de plateforme doit etre emballee');
assert.ok(packageJson.build.files.includes('distant-horizons-config.js'), 'La configuration initiale de Distant Horizons doit etre emballee');
// Depuis la bascule du 04/09/2026, ce launcher EST la mise a jour du launcher Odal :
// meme identite, pour que l'installeur NSIS remplace l'installation existante.
assert.strictEqual(packageJson.build.appId, 'gg.odal.launcher', "appId du launcher Odal (l'installeur doit remplacer l'existant)");
assert.strictEqual(packageJson.build.productName, 'Odal Launcher', 'Nom officiel du launcher');
assert.ok(parseInt(packageJson.version, 10) >= 2, 'La version doit depasser la serie 1.x du launcher Forge');

assert.strictEqual(getPlatformMods(manifest, 'win32').length, EXPECTED_MOD_COUNT);
assert.strictEqual(getPlatformMods(manifest, 'darwin').length, EXPECTED_MOD_COUNT);
verifySourcePack(path.join(process.cwd(), 'mods-pack'));

// Le dossier de jeu reste .odalpaper (celui du client Forge, .odal, n'est pas touche
// par la mise a jour) ; le manifest est le version.json officiel depuis la bascule.
const mainSource = fs.readFileSync('main.js', 'utf8');
assert.match(mainSource, /'\.odalpaper'/, 'GAME_DIR doit etre .odalpaper');
assert.match(mainSource, /UPDATE_MANIFEST = 'version\.json'/, 'Le manifest officiel version.json doit etre lu');
assert.ok(!/'\.odal'/.test(mainSource), "main.js ne doit plus viser le dossier .odal");
assert.ok(!/minecraftforge/.test(mainSource), 'main.js ne doit plus telecharger Forge');

const tempGameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odalpaper-dh-config-'));
try {
  const configFile = path.join(tempGameDir, 'config', 'DistantHorizons.toml');
  assert.strictEqual(ensureDistantHorizonsDefault(tempGameDir), true);
  assert.match(fs.readFileSync(configFile, 'utf8'), /rendererMode\s*=\s*"DISABLED"/);
  const playerChoice = '_version = 3\nrendererMode = "DEFAULT"\n';
  fs.writeFileSync(configFile, playerChoice, 'utf8');
  assert.strictEqual(ensureDistantHorizonsDefault(tempGameDir), false);
  assert.strictEqual(fs.readFileSync(configFile, 'utf8'), playerChoice);
} finally {
  fs.rmSync(tempGameDir, { recursive: true, force: true });
}

// Chaque module local requis par main.js doit figurer dans build.files.
const packagedFiles = packageJson.build.files;
const localRequires = [...mainSource.matchAll(/require\('\.\/([\w.-]+)'\)/g)].map((m) => m[1]);
for (const dep of localRequires) {
  const candidats = [dep, `${dep}.js`, `${dep}.json`];
  assert.ok(candidats.some((c) => packagedFiles.includes(c)),
    `main.js requiert './${dep}' mais aucun de ${candidats.join(', ')} n'est dans build.files`);
}

console.log(`Packaging OdalPaper : tests reussis (${EXPECTED_MOD_COUNT} mods, ${REQUIRED_MODS.length} epingles)`);
